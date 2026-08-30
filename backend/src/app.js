const express = require("express");
const cors = require("cors");
const { sql, poolPromise } = require("./database");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// =====================================================
// RESPONSE HELPERS
// =====================================================
function sendSuccess(res, data = {}, message = "OK") {
  return res.json({
    success: true,
    message,
    data
  });
}

function sendError(res, status, message, code = undefined) {
  return res.status(status).json({
    success: false,
    message,
    code
  });
}

function normalizeBib(value) {
  return String(value || "").trim().toUpperCase();
}

// Keep old helper names so the existing route implementation remains clear
// and compatible while the project is being refactored route-by-route.
const ok = sendSuccess;
const fail = sendError;
const bib = normalizeBib;

// =====================================================
// AUDIT LOG
// =====================================================
async function audit(
  pool,
  action,
  entityType,
  entityId,
  detail,
  actor = "SYSTEM"
) {
  try {
    await pool
      .request()
      .input("Action", sql.VarChar(50), action)
      .input("EntityType", sql.VarChar(50), entityType)
      .input("EntityID", sql.Int, entityId || null)
      .input("Detail", sql.NVarChar(1000), detail || null)
      .input("Actor", sql.NVarChar(100), actor)
      .query(`
        INSERT INTO AuditLogs
        (
          Action,
          EntityType,
          EntityID,
          Detail,
          Actor
        )
        VALUES
        (
          @Action,
          @EntityType,
          @EntityID,
          @Detail,
          @Actor
        )
      `);
  } catch (error) {
    // Audit logging must never interrupt the main race operation.
    console.error("Audit log error:", error.message);
  }
}

// =====================================================
// LOCAL DEMO ADMIN ACCOUNTS
// =====================================================
async function ensureDemoAdminAccounts() {
  const demoAccounts = [
    {
      username: "admin",
      password: "admin123",
      displayName: "Race Administrator",
      role: "ADMIN"
    },
    {
      username: "btc",
      password: "btc123",
      displayName: "Ban Tổ Chức",
      role: "BTC"
    },
    {
      username: "tnv",
      password: "tnv123",
      displayName: "Tình Nguyện Viên",
      role: "TNV"
    },
    {
      username: "medical",
      password: "medical123",
      displayName: "Medical Team",
      role: "MEDICAL"
    }
  ];

  try {
    const pool = await poolPromise;

    for (const account of demoAccounts) {
      await pool
        .request()
        .input("Username", sql.VarChar(50), account.username)
        .input("Password", sql.NVarChar(255), account.password)
        .input("DisplayName", sql.NVarChar(100), account.displayName)
        .input("Role", sql.VarChar(20), account.role)
        .query(`
          IF EXISTS (
            SELECT 1
            FROM AdminUsers
            WHERE Username = @Username
          )
          BEGIN
            UPDATE AdminUsers
            SET
              PasswordHash = @Password,
              DisplayName = @DisplayName,
              Role = @Role,
              IsActive = 1
            WHERE Username = @Username;
          END
          ELSE
          BEGIN
            INSERT INTO AdminUsers
            (
              Username,
              PasswordHash,
              DisplayName,
              Role,
              IsActive
            )
            VALUES
            (
              @Username,
              @Password,
              @DisplayName,
              @Role,
              1
            );
          END
        `);
    }

    console.log("✅ Demo admin accounts are ready");
  } catch (error) {
    console.error(
      "⚠️ Could not prepare demo admin accounts. Run database/upgrade.sql first:",
      error.message
    );
  }
}

// =====================================================
// DATABASE COMPATIBILITY / SAFE MIGRATIONS
// =====================================================
async function ensureDatabaseCompatibility() {
  const pool = await poolPromise;

  await pool.request().query(`
    IF OBJECT_ID('dbo.ResultReviews', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('dbo.ResultReviews', 'ReviewSource') IS NULL
        ALTER TABLE dbo.ResultReviews
        ADD ReviewSource VARCHAR(20) NULL;

      IF COL_LENGTH('dbo.ResultReviews', 'ReviewNotes') IS NULL
        ALTER TABLE dbo.ResultReviews
        ADD ReviewNotes NVARCHAR(1000) NULL;

      IF COL_LENGTH('dbo.ResultReviews', 'Resolution') IS NULL
        ALTER TABLE dbo.ResultReviews
        ADD Resolution VARCHAR(30) NULL;

      IF COL_LENGTH('dbo.ResultReviews', 'ResolutionNotes') IS NULL
        ALTER TABLE dbo.ResultReviews
        ADD ResolutionNotes NVARCHAR(1000) NULL;

      UPDATE dbo.ResultReviews
      SET ReviewSource = COALESCE(ReviewSource, 'BTC')
      WHERE ReviewSource IS NULL;

      IF COL_LENGTH('dbo.ResultReviews', 'ReviewNote') IS NOT NULL
      BEGIN
        EXEC(N'
          UPDATE dbo.ResultReviews
          SET ReviewNotes = COALESCE(ReviewNotes, ReviewNote)
          WHERE ReviewNote IS NOT NULL;
        ');
      END;

      IF COL_LENGTH(
        'dbo.ResultReviews',
        'ResolutionAction'
      ) IS NOT NULL
      BEGIN
        EXEC(N'
          UPDATE dbo.ResultReviews
          SET Resolution =
            COALESCE(Resolution, ResolutionAction)
          WHERE ResolutionAction IS NOT NULL;
        ');
      END;
    END;

    IF OBJECT_ID('dbo.Complaints', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('dbo.Complaints', 'Resolution') IS NULL
        ALTER TABLE dbo.Complaints
        ADD Resolution VARCHAR(30) NULL;

      IF COL_LENGTH(
        'dbo.Complaints',
        'ResolutionNote'
      ) IS NULL
        ALTER TABLE dbo.Complaints
        ADD ResolutionNote NVARCHAR(1000) NULL;

      IF COL_LENGTH('dbo.Complaints', 'ResolvedAt') IS NULL
        ALTER TABLE dbo.Complaints
        ADD ResolvedAt DATETIME2 NULL;
    END;
  `);

  // =====================================================
  // FIX LEGACY DEMO UNICODE DATA
  // =====================================================
  await pool.request().query(`
    IF EXISTS (
      SELECT 1
      FROM dbo.Registrations
      WHERE BibNumber = 'BIB004'
    )
    BEGIN
      UPDATE dbo.Registrations
      SET
        MedicalCondition =
          CASE
            WHEN MedicalCondition LIKE '%?%'
            THEN N'Hen suyễn'
            ELSE MedicalCondition
          END,

        MedicalNotes =
          CASE
            WHEN MedicalNotes LIKE '%?%'
            THEN N'Cần theo dõi khi vận động mạnh'
            ELSE MedicalNotes
          END
      WHERE BibNumber = 'BIB004';

      UPDATE u
      SET FullName = N'Nguyễn Minh Test Updated'
      FROM dbo.Users u
      INNER JOIN dbo.Registrations r
        ON r.UserID = u.UserID
      WHERE r.BibNumber = 'BIB004'
        AND u.FullName LIKE '%?%';
    END;
  `);

  console.log(
    "✅ Database compatibility checks completed"
  );
}

// =====================================================
// HEALTH CHECK
// =====================================================
app.get("/api/health", (req, res) => {
  return sendSuccess(
    res,
    {
      server: "online",
      database: "RaceManagement"
    },
    "Race Timing Pro API online"
  );
});

// =====================================================
// AUTHENTICATION
// =====================================================
app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(
      req.body?.username || ""
    ).trim();

    const password = String(
      req.body?.password || ""
    );

    if (!username || !password) {
      return sendError(
        res,
        400,
        "Vui lòng nhập đầy đủ tài khoản và mật khẩu.",
        "LOGIN_REQUIRED"
      );
    }

    const pool = await poolPromise;

    const loginResult = await pool
      .request()
      .input(
        "Username",
        sql.VarChar(50),
        username
      )
      .input(
        "Password",
        sql.NVarChar(255),
        password
      )
      .query(`
        SELECT TOP 1
          AdminUserID,
          Username,
          DisplayName,
          Role,
          IsActive
        FROM AdminUsers
        WHERE Username = @Username
          AND PasswordHash = @Password
          AND IsActive = 1
      `);

    if (loginResult.recordset.length === 0) {
      return sendError(
        res,
        401,
        "Tài khoản hoặc mật khẩu không đúng.",
        "INVALID_LOGIN"
      );
    }

    const user = loginResult.recordset[0];

    await audit(
      pool,
      "LOGIN",
      "AdminUser",
      user.AdminUserID,
      "Đăng nhập hệ thống",
      user.Username
    );

    return sendSuccess(
      res,
      {
        user,
        token: `demo-${user.AdminUserID}-${Date.now()}`
      },
      "Đăng nhập thành công"
    );
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return sendError(
      res,
      500,
      "Không thể đăng nhập vào hệ thống."
    );
  }
});

// =====================================================
// ATHLETES
// =====================================================
app.get(
  "/api/athletes",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result = await pool
        .request()
        .query(`
          SELECT
            u.*,
            r.RegistrationID,
            r.BibNumber,
            r.Distance,
            r.HasMedicalCondition,
            r.MedicalCondition,
            r.MedicalNotes,
            r.RegistrationStatus
          FROM Users u
          INNER JOIN Registrations r
            ON u.UserID = r.UserID
          ORDER BY r.RegistrationID DESC
        `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Get athletes error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể lấy danh sách VĐV"
      );
    }
  }
);

app.get(
  "/api/athletes/:bib",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const bibNumber = bib(
        req.params.bib
      );

      const result = await pool
        .request()
        .input(
          "Bib",
          sql.VarChar(30),
          bibNumber
        )
        .query(`
          SELECT TOP 1
            u.*,
            r.RegistrationID,
            r.BibNumber,
            r.Distance,
            r.HasMedicalCondition,
            r.MedicalCondition,
            r.MedicalNotes,
            r.RegistrationStatus,
            rr.RunID,
            rr.StartTime,
            rr.FinishTime,
            rr.RunStatus
          FROM Users u
          INNER JOIN Registrations r
            ON u.UserID = r.UserID
          LEFT JOIN RaceRuns rr
            ON r.RegistrationID =
              rr.RegistrationID
          WHERE r.BibNumber = @Bib
        `);

      if (
        result.recordset.length === 0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy BIB"
        );
      }

      return ok(
        res,
        result.recordset[0]
      );
    } catch (error) {
      console.error(
        "Get athlete error:",
        error
      );

      return fail(
        res,
        500,
        "Có lỗi khi tìm VĐV"
      );
    }
  }
);

// =====================================================
// REGISTRATION
// =====================================================
app.post(
  "/api/registrations",
  async (req, res) => {
    let transaction;

    try {
      const {
        fullName,
        dateOfBirth,
        phone,
        email,
        gender,
        distance,
        hasMedicalCondition,
        medicalCondition,
        medicalNotes
      } = req.body;

      if (
        !fullName ||
        !phone ||
        !distance
      ) {
        return fail(
          res,
          400,
          "Họ tên, số điện thoại và cự ly là bắt buộc"
        );
      }

      const allowedDistances = [
        "5KM",
        "10KM",
        "21KM",
        "42KM"
      ];

      if (
        !allowedDistances.includes(
          distance
        )
      ) {
        return fail(
          res,
          400,
          "Cự ly không hợp lệ"
        );
      }

      if (
        hasMedicalCondition &&
        !String(
          medicalCondition || ""
        ).trim()
      ) {
        return fail(
          res,
          400,
          "Vui lòng nhập tình trạng sức khỏe"
        );
      }

      const pool = await poolPromise;

      transaction =
        new sql.Transaction(pool);

      await transaction.begin();

      // =================================================
      // FIND USER BY PHONE
      // =================================================
      let request =
        new sql.Request(
          transaction
        );

      request.input(
        "Phone",
        sql.VarChar(30),
        phone
      );

      const userResult =
        await request.query(`
          SELECT UserID
          FROM Users
          WHERE Phone = @Phone
        `);

      let userID;

      if (
        userResult.recordset.length >
        0
      ) {
        userID =
          userResult
            .recordset[0]
            .UserID;

        request =
          new sql.Request(
            transaction
          );

        request
          .input(
            "UserID",
            sql.Int,
            userID
          )
          .input(
            "FullName",
            sql.NVarChar(150),
            fullName
          )
          .input(
            "DOB",
            sql.Date,
            dateOfBirth || null
          )
          .input(
            "Email",
            sql.VarChar(150),
            email || null
          )
          .input(
            "Gender",
            sql.NVarChar(20),
            gender || null
          );

        await request.query(`
          UPDATE Users
          SET
            FullName = @FullName,
            DateOfBirth = @DOB,
            Email = @Email,
            Gender = @Gender
          WHERE UserID = @UserID
        `);
      } else {
        request =
          new sql.Request(
            transaction
          );

        request
          .input(
            "FullName",
            sql.NVarChar(150),
            fullName
          )
          .input(
            "DOB",
            sql.Date,
            dateOfBirth || null
          )
          .input(
            "Phone",
            sql.VarChar(30),
            phone
          )
          .input(
            "Email",
            sql.VarChar(150),
            email || null
          )
          .input(
            "Gender",
            sql.NVarChar(20),
            gender || null
          );

        const insertedUser =
          await request.query(`
            INSERT INTO Users
            (
              FullName,
              DateOfBirth,
              Phone,
              Email,
              Gender
            )
            OUTPUT INSERTED.UserID
            VALUES
            (
              @FullName,
              @DOB,
              @Phone,
              @Email,
              @Gender
            )
          `);

        userID =
          insertedUser
            .recordset[0]
            .UserID;
      }

      // =================================================
      // FIND REGISTRATION
      // =================================================
      request =
        new sql.Request(
          transaction
        );

      request.input(
        "UserID",
        sql.Int,
        userID
      );

      const existingRegistration =
        await request.query(`
          SELECT
            RegistrationID,
            BibNumber
          FROM Registrations
          WHERE UserID = @UserID
        `);

      let registrationID;
      let bibNumber;

      if (
        existingRegistration
          .recordset.length > 0
      ) {
        registrationID =
          existingRegistration
            .recordset[0]
            .RegistrationID;

        bibNumber =
          existingRegistration
            .recordset[0]
            .BibNumber;

        request =
          new sql.Request(
            transaction
          );

        request
          .input(
            "RegistrationID",
            sql.Int,
            registrationID
          )
          .input(
            "Distance",
            sql.VarChar(10),
            distance
          )
          .input(
            "HasMedicalCondition",
            sql.Bit,
            !!hasMedicalCondition
          )
          .input(
            "MedicalCondition",
            sql.NVarChar(300),
            medicalCondition || null
          )
          .input(
            "MedicalNotes",
            sql.NVarChar(1000),
            medicalNotes || null
          );

        await request.query(`
          UPDATE Registrations
          SET
            Distance = @Distance,
            HasMedicalCondition =
              @HasMedicalCondition,
            MedicalCondition =
              @MedicalCondition,
            MedicalNotes =
              @MedicalNotes
          WHERE RegistrationID =
            @RegistrationID
        `);
      } else {
        const nextBibRequest =
          new sql.Request(
            transaction
          );

        const nextBibResult =
          await nextBibRequest.query(`
            SELECT
              ISNULL(
                MAX(
                  TRY_CONVERT(
                    INT,
                    SUBSTRING(
                      BibNumber,
                      4,
                      20
                    )
                  )
                ),
                0
              ) + 1 AS NextNumber
            FROM Registrations
            WHERE BibNumber LIKE 'BIB%'
          `);

        bibNumber =
          "BIB" +
          String(
            nextBibResult
              .recordset[0]
              .NextNumber
          ).padStart(
            3,
            "0"
          );

        request =
          new sql.Request(
            transaction
          );

        request
          .input(
            "UserID",
            sql.Int,
            userID
          )
          .input(
            "Bib",
            sql.VarChar(30),
            bibNumber
          )
          .input(
            "Distance",
            sql.VarChar(10),
            distance
          )
          .input(
            "HasMedicalCondition",
            sql.Bit,
            !!hasMedicalCondition
          )
          .input(
            "MedicalCondition",
            sql.NVarChar(300),
            medicalCondition || null
          )
          .input(
            "MedicalNotes",
            sql.NVarChar(1000),
            medicalNotes || null
          );

        const insertedRegistration =
          await request.query(`
            INSERT INTO Registrations
            (
              UserID,
              Distance,
              BibNumber,
              HasMedicalCondition,
              MedicalCondition,
              MedicalNotes,
              RegistrationStatus
            )
            OUTPUT
              INSERTED.RegistrationID
            VALUES
            (
              @UserID,
              @Distance,
              @Bib,
              @HasMedicalCondition,
              @MedicalCondition,
              @MedicalNotes,
              'REGISTERED'
            )
          `);

        registrationID =
          insertedRegistration
            .recordset[0]
            .RegistrationID;
      }

      await transaction.commit();

      await audit(
        pool,
        "REGISTER",
        "Registration",
        registrationID,
        `BIB ${bibNumber}`,
        "ATHLETE"
      );

      return ok(
        res,
        {
          registrationID,
          bibNumber,
          status: "REGISTERED"
        },
        "Đăng ký thành công"
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Registration rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Registration error:",
        error
      );

      return fail(
        res,
        500,
        "Đăng ký thất bại"
      );
    }
  }
);

// =====================================================
// DASHBOARD
// =====================================================
app.get(
  "/api/dashboard/athletes",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT
              u.UserID,
              u.FullName,
              u.DateOfBirth,
              u.Phone,
              u.Email,
              u.Gender,

              r.RegistrationID,
              r.BibNumber,
              r.Distance,
              r.HasMedicalCondition,
              r.MedicalCondition,
              r.MedicalNotes,
              r.RegistrationStatus,

              rr.RunID,
              rr.StartTime,
              rr.FinishTime,
              rr.RunStatus,

              rs.ResultID,
              rs.TotalTimeSeconds,
              rs.ResultStatus,
              rs.ApprovedAt,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints c
                WHERE c.RunID = rr.RunID
                  AND c.CheckpointCode = 'CP01'
                  AND c.ScanStatus = 'COMPLETED'
                ORDER BY ScanTime DESC
              ) AS CP01Time,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints c
                WHERE c.RunID = rr.RunID
                  AND c.CheckpointCode = 'CP02'
                  AND c.ScanStatus = 'COMPLETED'
                ORDER BY ScanTime DESC
              ) AS CP02Time,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints c
                WHERE c.RunID = rr.RunID
                  AND c.CheckpointCode = 'CP03'
                  AND c.ScanStatus = 'COMPLETED'
                ORDER BY ScanTime DESC
              ) AS CP03Time,

              (
                SELECT COUNT(*)
                FROM MedicalAlerts ma
                WHERE ma.RunID = rr.RunID
                  AND ma.AlertStatus = 'PENDING'
              ) AS PendingMedicalAlerts,

              (
                SELECT COUNT(*)
                FROM RaceExceptions ex
                WHERE ex.RunID = rr.RunID
                  AND ex.ExceptionStatus = 'OPEN'
              ) AS OpenExceptions

            FROM Users u

            INNER JOIN Registrations r
              ON u.UserID = r.UserID

            LEFT JOIN RaceRuns rr
              ON r.RegistrationID =
                rr.RegistrationID

            LEFT JOIN Results rs
              ON rr.RunID = rs.RunID

            ORDER BY
              r.RegistrationID DESC
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Dashboard error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tải dashboard"
      );
    }
  }
);

// =====================================================
// CHECK-IN ONE ATHLETE
// =====================================================
app.post(
  "/api/check-in",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const pool = await poolPromise;

      const athleteResult =
        await pool
          .request()
          .input(
            "Bib",
            sql.VarChar(30),
            bibNumber
          )
          .query(`
            SELECT
              r.*,
              u.FullName
            FROM Registrations r
            INNER JOIN Users u
              ON r.UserID = u.UserID
            WHERE r.BibNumber = @Bib
          `);

      if (
        athleteResult
          .recordset.length === 0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      const athlete =
        athleteResult.recordset[0];

      if (
        athlete
          .RegistrationStatus ===
        "CHECKED_IN"
      ) {
        return fail(
          res,
          409,
          "VĐV đã check-in",
          "ALREADY_CHECKED_IN"
        );
      }

      await pool
        .request()
        .input(
          "RegistrationID",
          sql.Int,
          athlete.RegistrationID
        )
        .query(`
          UPDATE Registrations
          SET RegistrationStatus =
            'CHECKED_IN'
          WHERE RegistrationID =
            @RegistrationID;

          IF EXISTS (
            SELECT 1
            FROM RaceRuns
            WHERE RegistrationID =
              @RegistrationID
          )
          BEGIN
            UPDATE RaceRuns
            SET RunStatus =
              CASE
                WHEN StartTime IS NULL
                THEN 'CHECKED_IN'
                ELSE RunStatus
              END
            WHERE RegistrationID =
              @RegistrationID;
          END
          ELSE
          BEGIN
            INSERT INTO RaceRuns
            (
              RegistrationID,
              RunStatus
            )
            VALUES
            (
              @RegistrationID,
              'CHECKED_IN'
            );
          END
        `);

      await audit(
        pool,
        "CHECK_IN",
        "Registration",
        athlete.RegistrationID,
        bibNumber,
        "BTC"
      );

      return ok(
        res,
        {
          ...athlete,
          registrationStatus:
            "CHECKED_IN"
        },
        "Check-in thành công"
      );
    } catch (error) {
      console.error(
        "Check-in error:",
        error
      );

      return fail(
        res,
        500,
        "Có lỗi khi check-in"
      );
    }
  }
);

// =====================================================
// CHECK-IN ALL REGISTERED ATHLETES
// =====================================================
app.post(
  "/api/check-in/all",
  async (req, res) => {
    let transaction;

    try {
      const pool =
        await poolPromise;

      transaction =
        new sql.Transaction(
          pool
        );

      await transaction.begin();

      const registeredRequest =
        new sql.Request(
          transaction
        );

      const registeredResult =
        await registeredRequest.query(`
          SELECT
            RegistrationID,
            BibNumber
          FROM Registrations
            WITH (
              UPDLOCK,
              HOLDLOCK
            )
          WHERE RegistrationStatus =
            'REGISTERED'
          ORDER BY RegistrationID
        `);

      const rows =
        registeredResult.recordset ||
        [];

      if (rows.length === 0) {
        await transaction.commit();

        return ok(
          res,
          {
            checkedInCount: 0,
            bibNumbers: []
          },
          "Không còn VĐV nào cần check-in"
        );
      }

      await new sql.Request(
        transaction
      ).query(`
        UPDATE Registrations
        SET RegistrationStatus =
          'CHECKED_IN'
        WHERE RegistrationStatus =
          'REGISTERED'
      `);

      await new sql.Request(
        transaction
      ).query(`
        INSERT INTO RaceRuns
        (
          RegistrationID,
          RunStatus
        )
        SELECT
          r.RegistrationID,
          'CHECKED_IN'
        FROM Registrations r
        WHERE r.RegistrationStatus =
          'CHECKED_IN'
          AND NOT EXISTS (
            SELECT 1
            FROM RaceRuns rr
            WHERE rr.RegistrationID =
              r.RegistrationID
          )
      `);

      await new sql.Request(
        transaction
      ).query(`
        UPDATE rr
        SET rr.RunStatus =
          'CHECKED_IN'
        FROM RaceRuns rr
        INNER JOIN Registrations r
          ON r.RegistrationID =
            rr.RegistrationID
        WHERE r.RegistrationStatus =
          'CHECKED_IN'
          AND rr.StartTime IS NULL
          AND rr.FinishTime IS NULL
          AND ISNULL(
            rr.RunStatus,
            'CHECKED_IN'
          ) NOT IN (
            'STOPPED',
            'FINISHED'
          )
      `);

      await transaction.commit();

      await audit(
        pool,
        "CHECK_IN_ALL",
        "Registration",
        null,
        `Đã check-in hàng loạt ${rows.length} VĐV`,
        "BTC"
      );

      return ok(
        res,
        {
          checkedInCount:
            rows.length,

          bibNumbers:
            rows.map(
              (row) =>
                row.BibNumber
            )
        },
        `Đã check-in ${rows.length} VĐV`
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Check-in all rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Check-in all error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể check-in tất cả VĐV",
        "CHECK_IN_ALL_FAILED"
      );
    }
  }
);

// =====================================================
// RACE HELPER
// =====================================================
async function raceRow(
  pool,
  bibNumber
) {
  const result =
    await pool
      .request()
      .input(
        "Bib",
        sql.VarChar(30),
        bibNumber
      )
      .query(`
        SELECT
          u.FullName,
          r.RegistrationID,
          r.BibNumber,
          r.RegistrationStatus,
          rr.RunID,
          rr.StartTime,
          rr.FinishTime,
          rr.RunStatus
        FROM Registrations r
        INNER JOIN Users u
          ON r.UserID = u.UserID
        LEFT JOIN RaceRuns rr
          ON r.RegistrationID =
            rr.RegistrationID
        WHERE r.BibNumber = @Bib
      `);

  return result.recordset[0];
}

// =====================================================
// START RACE
// =====================================================
app.post(
  "/api/race/start",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const pool = await poolPromise;

      const athlete =
        await raceRow(
          pool,
          bibNumber
        );

      if (!athlete) {
        return fail(
          res,
          404,
          "Không tìm thấy BIB"
        );
      }

      if (
        athlete
          .RegistrationStatus !==
        "CHECKED_IN"
      ) {
        return fail(
          res,
          409,
          "VĐV chưa CHECK-IN",
          "NOT_CHECKED_IN"
        );
      }

      if (
        athlete.RunStatus ===
          "STOPPED" ||
        athlete.RunStatus ===
          "FINISHED"
      ) {
        return fail(
          res,
          409,
          "Không thể START ở trạng thái hiện tại"
        );
      }

      if (athlete.StartTime) {
        return ok(
          res,
          {
            ...athlete
          },
          "VĐV đã START trước đó"
        );
      }

      await pool
        .request()
        .input(
          "RunID",
          sql.Int,
          athlete.RunID
        )
        .query(`
          UPDATE RaceRuns
          SET
            StartTime = GETDATE(),
            RunStatus = 'RUNNING'
          WHERE RunID = @RunID
        `);

      await audit(
        pool,
        "START",
        "RaceRun",
        athlete.RunID,
        bibNumber,
        "TNV"
      );

      return ok(
        res,
        {
          bibNumber,
          runStatus: "RUNNING"
        },
        "START thành công"
      );
    } catch (error) {
      console.error(
        "Start error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể START"
      );
    }
  }
);

// =====================================================
// CHECKPOINT
// =====================================================
app.post(
  "/api/race/checkpoint",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const checkpointCode =
        String(
          req.body
            .checkpointCode ||
          ""
        ).toUpperCase();

      const allowedCheckpoints = [
        "CP01",
        "CP02",
        "CP03"
      ];

      if (
        !allowedCheckpoints.includes(
          checkpointCode
        )
      ) {
        return fail(
          res,
          400,
          "Checkpoint không hợp lệ"
        );
      }

      const pool = await poolPromise;

      const athlete =
        await raceRow(
          pool,
          bibNumber
        );

      if (!athlete) {
        return fail(
          res,
          404,
          "Không tìm thấy BIB"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        return fail(
          res,
          409,
          "VĐV không ở trạng thái RUNNING"
        );
      }

      let previousCheckpoint =
        null;

      if (
        checkpointCode ===
        "CP02"
      ) {
        previousCheckpoint =
          "CP01";
      }

      if (
        checkpointCode ===
        "CP03"
      ) {
        previousCheckpoint =
          "CP02";
      }

      if (previousCheckpoint) {
        const previousResult =
          await pool
            .request()
            .input(
              "RunID",
              sql.Int,
              athlete.RunID
            )
            .input(
              "Code",
              sql.VarChar(10),
              previousCheckpoint
            )
            .query(`
              SELECT 1 AS IsCompleted
              FROM Checkpoints
              WHERE RunID = @RunID
                AND CheckpointCode =
                  @Code
                AND ScanStatus =
                  'COMPLETED'
            `);

        if (
          previousResult
            .recordset.length ===
          0
        ) {
          return fail(
            res,
            409,
            `Thiếu ${previousCheckpoint}. Hãy tạo Exception để BTC xác minh.`,
            "PREVIOUS_CP_MISSING"
          );
        }
      }

      const existingCheckpoint =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .input(
            "Code",
            sql.VarChar(10),
            checkpointCode
          )
          .query(`
            SELECT TOP 1
              CheckpointID,
              ScanTime
            FROM Checkpoints
            WHERE RunID = @RunID
              AND CheckpointCode =
                @Code
              AND ScanStatus =
                'COMPLETED'
          `);

      if (
        existingCheckpoint
          .recordset.length > 0
      ) {
        return ok(
          res,
          {
            checkpointCode,
            scanTime:
              existingCheckpoint
                .recordset[0]
                .ScanTime,
            alreadyRecorded:
              true
          },
          `${checkpointCode} đã được ghi nhận`
        );
      }

      const insertedCheckpoint =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .input(
            "Code",
            sql.VarChar(10),
            checkpointCode
          )
          .query(`
            INSERT INTO Checkpoints
            (
              RunID,
              CheckpointCode,
              ScanTime,
              ScanStatus
            )
            OUTPUT INSERTED.*
            VALUES
            (
              @RunID,
              @Code,
              GETDATE(),
              'COMPLETED'
            )
          `);

      await audit(
        pool,
        "CHECKPOINT",
        "RaceRun",
        athlete.RunID,
        `${bibNumber} ${checkpointCode}`,
        "TNV"
      );

      return ok(
        res,
        insertedCheckpoint
          .recordset[0],
        `${checkpointCode} thành công`
      );
    } catch (error) {
      console.error(
        "Checkpoint error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể ghi checkpoint"
      );
    }
  }
);

// =====================================================
// CREATE RACE EXCEPTION
// =====================================================
app.post(
  "/api/race/exception",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const checkpointCode =
        String(
          req.body
            .checkpointCode ||
          ""
        ).toUpperCase();

      const reason =
        String(
          req.body.reason ||
          "MISSING_SCAN"
        );

      const pool = await poolPromise;

      const athlete =
        await raceRow(
          pool,
          bibNumber
        );

      if (
        !athlete ||
        !athlete.RunID
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy lượt chạy"
        );
      }

      const insertedException =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .input(
            "Code",
            sql.VarChar(10),
            checkpointCode
          )
          .input(
            "Reason",
            sql.VarChar(50),
            reason
          )
          .input(
            "Note",
            sql.NVarChar(1000),
            req.body.note ||
              null
          )
          .query(`
            INSERT INTO RaceExceptions
            (
              RunID,
              CheckpointCode,
              ExceptionType,
              ExceptionNote,
              ExceptionStatus
            )
            OUTPUT INSERTED.*
            VALUES
            (
              @RunID,
              @Code,
              @Reason,
              @Note,
              'OPEN'
            )
          `);

      await audit(
        pool,
        "CREATE_EXCEPTION",
        "RaceRun",
        athlete.RunID,
        `${bibNumber} ${checkpointCode} ${reason}`,
        "TNV"
      );

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Đã tạo Exception",
          data:
            insertedException
              .recordset[0]
        });
    } catch (error) {
      console.error(
        "Create Exception error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tạo Exception"
      );
    }
  }
);

// =====================================================
// GET EXCEPTIONS
// =====================================================
app.get(
  "/api/race/exceptions",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT
              ex.*,
              r.BibNumber,
              r.Distance,
              u.FullName
            FROM RaceExceptions ex
            INNER JOIN RaceRuns rr
              ON ex.RunID = rr.RunID
            INNER JOIN Registrations r
              ON rr.RegistrationID =
                r.RegistrationID
            INNER JOIN Users u
              ON r.UserID = u.UserID
            ORDER BY
              CASE
                WHEN ex.ExceptionStatus =
                  'OPEN'
                THEN 0
                ELSE 1
              END,
              ex.CreatedAt DESC
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Load exceptions error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tải Exception"
      );
    }
  }
);

// =====================================================
// RESOLVE EXCEPTION
// =====================================================
app.post(
  "/api/race/exception/resolve",
  async (req, res) => {
    let transaction;

    try {
      const {
        exceptionID,
        decision,
        note
      } = req.body;

      const allowedDecisions = [
        "CONFIRM_PASS",
        "DNF"
      ];

      if (
        !allowedDecisions.includes(
          decision
        )
      ) {
        return fail(
          res,
          400,
          "Quyết định không hợp lệ"
        );
      }

      const pool = await poolPromise;

      transaction =
        new sql.Transaction(
          pool
        );

      await transaction.begin();

      const exceptionRequest =
        new sql.Request(
          transaction
        );

      exceptionRequest.input(
        "ExceptionID",
        sql.Int,
        exceptionID
      );

      const exceptionResult =
        await exceptionRequest.query(`
          SELECT *
          FROM RaceExceptions
          WHERE ExceptionID =
            @ExceptionID
        `);

      if (
        exceptionResult
          .recordset.length === 0
      ) {
        await transaction.rollback();

        return fail(
          res,
          404,
          "Không tìm thấy Exception"
        );
      }

      const exception =
        exceptionResult
          .recordset[0];

      if (
        decision ===
        "CONFIRM_PASS"
      ) {
        const checkpointRequest =
          new sql.Request(
            transaction
          );

        checkpointRequest
          .input(
            "RunID",
            sql.Int,
            exception.RunID
          )
          .input(
            "Code",
            sql.VarChar(10),
            exception.CheckpointCode
          );

        await checkpointRequest.query(`
          IF NOT EXISTS (
            SELECT 1
            FROM Checkpoints
            WHERE RunID = @RunID
              AND CheckpointCode =
                @Code
              AND ScanStatus =
                'COMPLETED'
          )
          BEGIN
            INSERT INTO Checkpoints
            (
              RunID,
              CheckpointCode,
              ScanTime,
              ScanStatus
            )
            VALUES
            (
              @RunID,
              @Code,
              GETDATE(),
              'COMPLETED'
            );
          END
        `);
      } else {
        await new sql.Request(
          transaction
        )
          .input(
            "RunID",
            sql.Int,
            exception.RunID
          )
          .query(`
            UPDATE RaceRuns
            SET RunStatus =
              'STOPPED'
            WHERE RunID = @RunID
              AND FinishTime IS NULL
          `);
      }

      const updateException =
        new sql.Request(
          transaction
        );

      updateException
        .input(
          "ExceptionID",
          sql.Int,
          exceptionID
        )
        .input(
          "Decision",
          sql.VarChar(30),
          decision
        )
        .input(
          "Note",
          sql.NVarChar(1000),
          note || null
        );

      await updateException.query(`
        UPDATE RaceExceptions
        SET
          ExceptionStatus =
            'RESOLVED',
          Resolution =
            @Decision,
          ResolutionNote =
            @Note,
          ResolvedAt =
            GETDATE()
        WHERE ExceptionID =
          @ExceptionID
      `);

      await transaction.commit();

      return ok(
        res,
        {
          decision
        },
        "Đã xử lý Exception"
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Exception rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Resolve exception error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể xử lý Exception"
      );
    }
  }
);

// =====================================================
// CREATE MEDICAL ALERT
// =====================================================
app.post(
  "/api/medical/alert",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const pool = await poolPromise;

      const athlete =
        await raceRow(
          pool,
          bibNumber
        );

      if (
        !athlete ||
        !athlete.RunID
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy lượt chạy"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        return fail(
          res,
          409,
          "Chỉ tạo cảnh báo khi VĐV đang RUNNING"
        );
      }

      const alertType =
        String(
          req.body.alertType ||
          "OTHER"
        ).toUpperCase();

      const alertResult =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .input(
            "Type",
            sql.VarChar(50),
            alertType
          )
          .input(
            "Message",
            sql.NVarChar(1000),
            req.body
              .alertMessage ||
              null
          )
          .query(`
            INSERT INTO MedicalAlerts
            (
              RunID,
              AlertType,
              AlertMessage,
              AlertStatus
            )
            OUTPUT INSERTED.*
            VALUES
            (
              @RunID,
              @Type,
              @Message,
              'PENDING'
            )
          `);

      await audit(
        pool,
        "MEDICAL_ALERT",
        "RaceRun",
        athlete.RunID,
        bibNumber,
        "TNV"
      );

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Đã gửi cảnh báo y tế",
          data:
            alertResult
              .recordset[0]
        });
    } catch (error) {
      console.error(
        "Medical alert error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tạo cảnh báo y tế"
      );
    }
  }
);

// =====================================================
// GET MEDICAL ALERTS
// =====================================================
app.get(
  "/api/medical/alerts",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT
              ma.*,
              r.BibNumber,
              r.Distance,
              r.HasMedicalCondition,
              r.MedicalCondition,
              r.MedicalNotes,
              u.FullName,
              rr.RunStatus
            FROM MedicalAlerts ma
            INNER JOIN RaceRuns rr
              ON ma.RunID = rr.RunID
            INNER JOIN Registrations r
              ON rr.RegistrationID =
                r.RegistrationID
            INNER JOIN Users u
              ON r.UserID = u.UserID
            ORDER BY
              CASE
                WHEN ma.AlertStatus =
                  'PENDING'
                THEN 0
                ELSE 1
              END,
              ma.CreatedAt DESC
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Load medical alerts error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tải cảnh báo"
      );
    }
  }
);

// =====================================================
// MEDICAL DECISION
// =====================================================
app.post(
  "/api/medical/decision",
  async (req, res) => {
    try {
      const alertID =
        Number(
          req.body.alertID
        );

      const decision =
        String(
          req.body.decision ||
          ""
        ).toUpperCase();

      if (
        ![
          "CONTINUE",
          "STOP"
        ].includes(decision)
      ) {
        return fail(
          res,
          400,
          "Quyết định không hợp lệ"
        );
      }

      const pool = await poolPromise;

      const alertResult =
        await pool
          .request()
          .input(
            "AlertID",
            sql.Int,
            alertID
          )
          .query(`
            SELECT *
            FROM MedicalAlerts
            WHERE AlertID =
              @AlertID
          `);

      if (
        alertResult.recordset
          .length === 0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy cảnh báo"
        );
      }

      const alert =
        alertResult.recordset[0];

      if (
        alert.AlertStatus ===
        "RESOLVED"
      ) {
        return ok(
          res,
          {
            decision:
              alert
                .MedicalDecision
          },
          "Cảnh báo đã xử lý"
        );
      }

      await pool
        .request()
        .input(
          "AlertID",
          sql.Int,
          alertID
        )
        .input(
          "Decision",
          sql.VarChar(20),
          decision
        )
        .query(`
          UPDATE MedicalAlerts
          SET
            AlertStatus =
              'RESOLVED',
            MedicalDecision =
              @Decision,
            ResolvedAt =
              GETDATE()
          WHERE AlertID =
            @AlertID
        `);

      if (
        decision ===
        "STOP"
      ) {
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            alert.RunID
          )
          .query(`
            UPDATE RaceRuns
            SET RunStatus =
              'STOPPED'
            WHERE RunID = @RunID
              AND FinishTime IS NULL
          `);
      } else {
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            alert.RunID
          )
          .query(`
            UPDATE RaceRuns
            SET RunStatus =
              'RUNNING'
            WHERE RunID = @RunID
              AND FinishTime IS NULL
              AND RunStatus <>
                'STOPPED'
          `);
      }

      return ok(
        res,
        {
          decision
        },
        decision === "STOP"
          ? "Đã yêu cầu VĐV dừng"
          : "VĐV được phép tiếp tục"
      );
    } catch (error) {
      console.error(
        "Medical decision error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể xử lý cảnh báo"
      );
    }
  }
);

// =====================================================
// FINISH
// =====================================================
app.post(
  "/api/race/finish",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const pool = await poolPromise;

      const athlete =
        await raceRow(
          pool,
          bibNumber
        );

      if (
        !athlete ||
        !athlete.RunID
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy lượt chạy"
        );
      }

      if (
        athlete.RunStatus ===
        "STOPPED"
      ) {
        return fail(
          res,
          409,
          "VĐV đã STOPPED/DNF"
        );
      }

      if (
        athlete.RunStatus ===
        "FINISHED"
      ) {
        return ok(
          res,
          {
            alreadyFinished:
              true
          },
          "VĐV đã FINISH"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        return fail(
          res,
          409,
          "VĐV không ở trạng thái RUNNING"
        );
      }

      const checkpointsResult =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .query(`
            SELECT CheckpointCode
            FROM Checkpoints
            WHERE RunID = @RunID
              AND ScanStatus =
                'COMPLETED'
          `);

      const completedCheckpoints =
        new Set(
          checkpointsResult
            .recordset
            .map(
              (item) =>
                item.CheckpointCode
            )
        );

      const requiredCheckpoints = [
        "CP01",
        "CP02",
        "CP03"
      ];

      for (
        const checkpoint
        of requiredCheckpoints
      ) {
        if (
          !completedCheckpoints.has(
            checkpoint
          )
        ) {
          return fail(
            res,
            409,
            `Thiếu ${checkpoint}. Cần xử lý Exception trước khi FINISH.`,
            "CHECKPOINT_MISSING"
          );
        }
      }

      const medicalResult =
        await pool
          .request()
          .input(
            "RunID",
            sql.Int,
            athlete.RunID
          )
          .query(`
            SELECT
              COUNT(*) AS PendingCount
            FROM MedicalAlerts
            WHERE RunID = @RunID
              AND AlertStatus =
                'PENDING'
          `);

      if (
        Number(
          medicalResult
            .recordset[0]
            .PendingCount
        ) > 0
      ) {
        return fail(
          res,
          409,
          "Còn cảnh báo y tế chưa xử lý",
          "MEDICAL_PENDING"
        );
      }

      await pool
        .request()
        .input(
          "RunID",
          sql.Int,
          athlete.RunID
        )
        .query(`
          UPDATE RaceRuns
          SET
            FinishTime =
              COALESCE(
                FinishTime,
                GETDATE()
              ),
            RunStatus =
              'FINISHED'
          WHERE RunID = @RunID;

          DECLARE @Seconds INT =
          (
            SELECT
              DATEDIFF(
                SECOND,
                StartTime,
                FinishTime
              )
            FROM RaceRuns
            WHERE RunID = @RunID
          );

          IF EXISTS (
            SELECT 1
            FROM Results
            WHERE RunID = @RunID
          )
          BEGIN
            UPDATE Results
            SET
              TotalTimeSeconds =
                @Seconds,
              ResultStatus =
                CASE
                  WHEN ResultStatus =
                    'OFFICIAL'
                  THEN 'OFFICIAL'
                  ELSE 'PENDING'
                END
            WHERE RunID = @RunID;
          END
          ELSE
          BEGIN
            INSERT INTO Results
            (
              RunID,
              TotalTimeSeconds,
              ResultStatus
            )
            VALUES
            (
              @RunID,
              @Seconds,
              'PENDING'
            );
          END
        `);

      return ok(
        res,
        {
          bibNumber,
          runStatus:
            "FINISHED"
        },
        "FINISH thành công"
      );
    } catch (error) {
      console.error(
        "Finish error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể FINISH"
      );
    }
  }
);

// =====================================================
// APPROVE RESULT
// =====================================================
app.post(
  "/api/results/approve",
  async (req, res) => {
    try {
      const resultID =
        Number(
          req.body.resultID
        );

      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .input(
            "ResultID",
            sql.Int,
            resultID
          )
          .query(`
            SELECT ResultStatus
            FROM Results
            WHERE ResultID =
              @ResultID
          `);

      if (
        result.recordset.length ===
        0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy kết quả"
        );
      }

      const currentStatus =
        result.recordset[0]
          .ResultStatus;

      if (
        currentStatus ===
        "OFFICIAL"
      ) {
        return ok(
          res,
          {
            alreadyApproved:
              true
          },
          "Kết quả đã OFFICIAL"
        );
      }

      if (
        currentStatus !==
        "PENDING"
      ) {
        return fail(
          res,
          409,
          "Chỉ duyệt kết quả PENDING"
        );
      }

      await pool
        .request()
        .input(
          "ResultID",
          sql.Int,
          resultID
        )
        .query(`
          UPDATE Results
          SET
            ResultStatus =
              'OFFICIAL',
            ApprovedAt =
              GETDATE()
          WHERE ResultID =
            @ResultID
        `);

      await audit(
        pool,
        "APPROVE_RESULT",
        "Result",
        resultID,
        "OFFICIAL",
        "BTC"
      );

      return ok(
        res,
        {
          resultID,
          status:
            "OFFICIAL"
        },
        "Đã công bố kết quả"
      );
    } catch (error) {
      console.error(
        "Approve result error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể duyệt kết quả"
      );
    }
  }
);

// =====================================================
// MANUAL RESULT REVIEW
// =====================================================
app.post(
  "/api/results/review",
  async (req, res) => {
    try {
      const resultID =
        Number(
          req.body.resultID
        );

      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .input(
            "ResultID",
            sql.Int,
            resultID
          )
          .query(`
            SELECT ResultStatus
            FROM Results
            WHERE ResultID =
              @ResultID
          `);

      if (
        result.recordset.length ===
        0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy kết quả"
        );
      }

      if (
        result.recordset[0]
          .ResultStatus ===
        "OFFICIAL"
      ) {
        return fail(
          res,
          409,
          "Kết quả OFFICIAL phải đi qua khiếu nại"
        );
      }

      const openReview =
        await pool
          .request()
          .input(
            "ResultID",
            sql.Int,
            resultID
          )
          .query(`
            SELECT TOP 1 *
            FROM ResultReviews
            WHERE ResultID =
              @ResultID
              AND ReviewStatus =
                'OPEN'
            ORDER BY
              ReviewID DESC
          `);

      if (
        openReview
          .recordset.length > 0
      ) {
        return ok(
          res,
          {
            review:
              openReview
                .recordset[0],
            alreadyInReview:
              true
          },
          "Kết quả đang REVIEW"
        );
      }

      const createReview =
        await pool
          .request()
          .input(
            "ResultID",
            sql.Int,
            resultID
          )
          .input(
            "Reason",
            sql.NVarChar(100),
            req.body.reviewReason ||
              "OTHER"
          )
          .input(
            "Note",
            sql.NVarChar(1000),
            req.body.reviewNote ||
              null
          )
          .query(`
            INSERT INTO ResultReviews
            (
              ResultID,
              ReviewSource,
              ReviewReason,
              ReviewNotes,
              ReviewStatus
            )
            OUTPUT INSERTED.*
            VALUES
            (
              @ResultID,
              'BTC',
              @Reason,
              @Note,
              'OPEN'
            );

            UPDATE Results
            SET ResultStatus =
              'REVIEW'
            WHERE ResultID =
              @ResultID;
          `);

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Đã chuyển sang REVIEW",
          data:
            createReview
              .recordset[0]
        });
    } catch (error) {
      console.error(
        "Create review error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tạo REVIEW"
      );
    }
  }
);

// =====================================================
// GET REVIEWS
// =====================================================
app.get(
  "/api/results/reviews",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT
              rv.*,
              rs.ResultStatus,
              rs.TotalTimeSeconds,
              r.BibNumber,
              r.Distance,
              u.FullName
            FROM ResultReviews rv
            INNER JOIN Results rs
              ON rv.ResultID =
                rs.ResultID
            INNER JOIN RaceRuns rr
              ON rs.RunID =
                rr.RunID
            INNER JOIN Registrations r
              ON rr.RegistrationID =
                r.RegistrationID
            INNER JOIN Users u
              ON r.UserID =
                u.UserID
            ORDER BY
              CASE
                WHEN rv.ReviewStatus =
                  'OPEN'
                THEN 0
                ELSE 1
              END,
              rv.CreatedAt DESC
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Load reviews error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tải REVIEW"
      );
    }
  }
);

// =====================================================
// RESOLVE REVIEW
// =====================================================
app.post(
  "/api/results/review/resolve",
  async (req, res) => {
    let transaction;

    try {
      const reviewID =
        Number(
          req.body.reviewID
        );

      const resolution =
        String(
          req.body.resolution ||
          ""
        ).toUpperCase();

      const allowedResolutions = [
        "APPROVE",
        "RETURN_PENDING"
      ];

      if (
        !allowedResolutions
          .includes(resolution)
      ) {
        return fail(
          res,
          400,
          "Resolution không hợp lệ"
        );
      }

      const pool = await poolPromise;

      transaction =
        new sql.Transaction(
          pool
        );

      await transaction.begin();

      const reviewRequest =
        new sql.Request(
          transaction
        );

      reviewRequest.input(
        "ReviewID",
        sql.Int,
        reviewID
      );

      const reviewResult =
        await reviewRequest.query(`
          SELECT *
          FROM ResultReviews
          WHERE ReviewID =
            @ReviewID
        `);

      if (
        reviewResult
          .recordset.length === 0
      ) {
        await transaction.rollback();

        return fail(
          res,
          404,
          "Không tìm thấy REVIEW"
        );
      }

      const review =
        reviewResult.recordset[0];

      const updateReviewRequest =
        new sql.Request(
          transaction
        );

      updateReviewRequest
        .input(
          "ReviewID",
          sql.Int,
          reviewID
        )
        .input(
          "Resolution",
          sql.VarChar(30),
          resolution
        )
        .input(
          "ResolutionNotes",
          sql.NVarChar(1000),
          req.body
            .resolutionNotes ||
            null
        );

      await updateReviewRequest.query(`
        UPDATE ResultReviews
        SET
          ReviewStatus =
            'RESOLVED',
          Resolution =
            @Resolution,
          ResolutionNotes =
            @ResolutionNotes,
          ResolvedAt =
            GETDATE()
        WHERE ReviewID =
          @ReviewID
      `);

      const nextResultStatus =
        resolution === "APPROVE"
          ? "OFFICIAL"
          : "PENDING";

      const updateResultRequest =
        new sql.Request(
          transaction
        );

      updateResultRequest
        .input(
          "ResultID",
          sql.Int,
          review.ResultID
        )
        .input(
          "Status",
          sql.VarChar(20),
          nextResultStatus
        );

      await updateResultRequest.query(`
        UPDATE Results
        SET
          ResultStatus =
            @Status,
          ApprovedAt =
            CASE
              WHEN @Status =
                'OFFICIAL'
              THEN GETDATE()
              ELSE NULL
            END
        WHERE ResultID =
          @ResultID
      `);

      await transaction.commit();

      return ok(
        res,
        {
          resolution
        },
        resolution ===
          "APPROVE"
          ? "Đã xác nhận hợp lệ và OFFICIAL"
          : "Đã trả kết quả về PENDING"
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Review rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Resolve review error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể đóng REVIEW"
      );
    }
  }
);

// =====================================================
// PUBLIC RESULT LOOKUP
// =====================================================
app.get(
  "/api/results/bib/:bibNumber",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.params.bibNumber
      );

      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .input(
            "Bib",
            sql.VarChar(30),
            bibNumber
          )
          .query(`
            SELECT
              u.FullName,
              r.BibNumber,
              r.Distance,
              rr.StartTime,
              rr.FinishTime,
              rr.RunStatus,
              rs.ResultID,
              rs.TotalTimeSeconds,
              rs.ResultStatus,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints
                WHERE RunID =
                  rr.RunID
                  AND CheckpointCode =
                    'CP01'
                  AND ScanStatus =
                    'COMPLETED'
              ) AS CP01Time,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints
                WHERE RunID =
                  rr.RunID
                  AND CheckpointCode =
                    'CP02'
                  AND ScanStatus =
                    'COMPLETED'
              ) AS CP02Time,

              (
                SELECT TOP 1
                  ScanTime
                FROM Checkpoints
                WHERE RunID =
                  rr.RunID
                  AND CheckpointCode =
                    'CP03'
                  AND ScanStatus =
                    'COMPLETED'
              ) AS CP03Time

            FROM Registrations r
            INNER JOIN Users u
              ON r.UserID =
                u.UserID
            LEFT JOIN RaceRuns rr
              ON r.RegistrationID =
                rr.RegistrationID
            LEFT JOIN Results rs
              ON rr.RunID =
                rs.RunID
            WHERE r.BibNumber =
              @Bib
          `);

      if (
        result.recordset.length ===
        0
      ) {
        return fail(
          res,
          404,
          "Không tìm thấy BIB"
        );
      }

      const athlete =
        result.recordset[0];

      if (
        athlete.RunStatus !==
        "FINISHED"
      ) {
        return ok(
          res,
          {
            available: false,
            reason:
              "NOT_FINISHED",
            athlete
          },
          "VĐV chưa hoàn thành"
        );
      }

      if (
        athlete.ResultStatus !==
        "OFFICIAL"
      ) {
        return ok(
          res,
          {
            available: false,
            reason:
              "WAITING_APPROVAL",
            athlete
          },
          "Kết quả đang chờ BTC xác nhận"
        );
      }

      return ok(
        res,
        {
          available: true,
          result: athlete
        },
        "Kết quả chính thức"
      );
    } catch (error) {
      console.error(
        "Result lookup error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tra cứu kết quả"
      );
    }
  }
);

// =====================================================
// CREATE COMPLAINT
// =====================================================
app.post(
  "/api/complaints",
  async (req, res) => {
    try {
      const bibNumber = bib(
        req.body.bibNumber
      );

      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .input(
            "Bib",
            sql.VarChar(30),
            bibNumber
          )
          .query(`
            SELECT
              rs.ResultID
            FROM Registrations r
            INNER JOIN RaceRuns rr
              ON r.RegistrationID =
                rr.RegistrationID
            INNER JOIN Results rs
              ON rr.RunID =
                rs.RunID
            WHERE r.BibNumber =
              @Bib
          `);

      if (
        result.recordset.length ===
        0
      ) {
        return fail(
          res,
          404,
          "BIB chưa có kết quả để khiếu nại"
        );
      }

      const resultID =
        result.recordset[0]
          .ResultID;

      const insertedComplaint =
        await pool
          .request()
          .input(
            "ResultID",
            sql.Int,
            resultID
          )
          .input(
            "Bib",
            sql.VarChar(30),
            bibNumber
          )
          .input(
            "ComplaintType",
            sql.VarChar(50),
            req.body
              .complaintType ||
              "RESULT"
          )
          .input(
            "ComplaintMessage",
            sql.NVarChar(1500),
            req.body.message ||
              ""
          )
          .input(
            "ContactInfo",
            sql.NVarChar(200),
            req.body.contact ||
              null
          )
          .query(`
            INSERT INTO Complaints
            (
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus
            )
            OUTPUT INSERTED.*
            VALUES
            (
              @ResultID,
              @Bib,
              @ComplaintType,
              @ComplaintMessage,
              @ContactInfo,
              'OPEN'
            )
          `);

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Đã gửi khiếu nại tới BTC",
          data:
            insertedComplaint
              .recordset[0]
        });
    } catch (error) {
      console.error(
        "Create complaint error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể gửi khiếu nại"
      );
    }
  }
);

// =====================================================
// GET COMPLAINTS + RACE TIMELINE
// =====================================================
app.get(
  "/api/complaints",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT
              c.*,
              u.FullName,
              r.Distance,

              rr.RunID,

              COALESCE(
                rr.StartTime,
                latestRun.StartTime
              ) AS StartTime,

              COALESCE(
                rr.FinishTime,
                latestRun.FinishTime
              ) AS FinishTime,

              COALESCE(
                rr.RunStatus,
                latestRun.RunStatus
              ) AS RunStatus,

              COALESCE(
                rs.TotalTimeSeconds,
                latestResult.TotalTimeSeconds
              ) AS TotalTimeSeconds,

              COALESCE(
                rs.ResultStatus,
                latestResult.ResultStatus,
                'PENDING'
              ) AS ResultStatus,

              COALESCE(
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    rr.RunID
                    AND cp.CheckpointCode =
                      'CP01'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                ),
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    latestRun.RunID
                    AND cp.CheckpointCode =
                      'CP01'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                )
              ) AS CP01Time,

              COALESCE(
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    rr.RunID
                    AND cp.CheckpointCode =
                      'CP02'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                ),
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    latestRun.RunID
                    AND cp.CheckpointCode =
                      'CP02'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                )
              ) AS CP02Time,

              COALESCE(
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    rr.RunID
                    AND cp.CheckpointCode =
                      'CP03'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                ),
                (
                  SELECT TOP 1
                    cp.ScanTime
                  FROM Checkpoints cp
                  WHERE cp.RunID =
                    latestRun.RunID
                    AND cp.CheckpointCode =
                      'CP03'
                    AND cp.ScanStatus =
                      'COMPLETED'
                  ORDER BY
                    cp.ScanTime DESC
                )
              ) AS CP03Time

            FROM Complaints c

            LEFT JOIN Results rs
              ON c.ResultID =
                rs.ResultID

            LEFT JOIN RaceRuns rr
              ON rs.RunID =
                rr.RunID

            LEFT JOIN Registrations r
              ON r.BibNumber =
                c.BibNumber

            LEFT JOIN Users u
              ON r.UserID =
                u.UserID

            OUTER APPLY
            (
              SELECT TOP 1
                rr2.RunID,
                rr2.StartTime,
                rr2.FinishTime,
                rr2.RunStatus
              FROM RaceRuns rr2
              WHERE rr2.RegistrationID =
                r.RegistrationID
              ORDER BY
                CASE
                  WHEN rr2.FinishTime IS NULL
                  THEN 1
                  ELSE 0
                END,
                rr2.FinishTime DESC,
                rr2.RunID DESC
            ) AS latestRun

            OUTER APPLY
            (
              SELECT TOP 1
                rs2.TotalTimeSeconds,
                rs2.ResultStatus
              FROM Results rs2
              WHERE rs2.RunID =
                latestRun.RunID
              ORDER BY
                rs2.ResultID DESC
            ) AS latestResult

            ORDER BY
              CASE
                WHEN c.ComplaintStatus =
                  'OPEN'
                THEN 0

                WHEN c.ComplaintStatus =
                  'IN_REVIEW'
                THEN 1

                ELSE 2
              END,
              c.CreatedAt DESC;
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Load complaints error:",
        error
      );

      return fail(
        res,
        500,
        `Không thể tải khiếu nại: ${error.message}`,
        "COMPLAINT_LOAD_FAILED"
      );
    }
  }
);

// =====================================================
// RESOLVE COMPLAINT - KEEP CURRENT RESULT
// =====================================================
app.post(
  "/api/complaints/resolve",
  async (req, res) => {
    let transaction;

    try {
      // =================================================
      // 1. NORMALIZE REQUEST BODY
      // Frontend cũ dùng "decision" + "note"
      // Frontend mới có thể dùng
      // "resolution" + "resolutionNote".
      // API hỗ trợ cả hai.
      // =================================================
      const complaintID =
        Number(
          req.body
            ?.complaintID
        );

      const resolution =
        String(
          req.body?.resolution ??
          req.body?.decision ??
          ""
        )
          .trim()
          .toUpperCase();

      const resolutionNote =
        String(
          req.body
            ?.resolutionNote ??
          req.body?.note ??
          ""
        ).trim();

      // =================================================
      // 2. VALIDATE COMPLAINT ID
      // =================================================
      if (
        !Number.isInteger(
          complaintID
        ) ||
        complaintID <= 0
      ) {
        return fail(
          res,
          400,
          "ComplaintID không hợp lệ",
          "INVALID_COMPLAINT_ID"
        );
      }

      // =================================================
      // 3. VALIDATE DECISION
      // =================================================
      if (
        resolution !==
        "KEEP_RESULT"
      ) {
        return fail(
          res,
          400,
          "Quyết định khiếu nại không hợp lệ",
          "INVALID_COMPLAINT_DECISION"
        );
      }

      const pool =
        await poolPromise;

      transaction =
        new sql.Transaction(
          pool
        );

      await transaction.begin();

      // =================================================
      // 4. LOAD + LOCK COMPLAINT
      // =================================================
      const complaintRequest =
        new sql.Request(
          transaction
        );

      complaintRequest.input(
        "ComplaintID",
        sql.Int,
        complaintID
      );

      const complaintResult =
        await complaintRequest
          .query(`
            SELECT
              c.ComplaintID,
              c.ResultID,
              c.BibNumber,
              c.ComplaintType,
              c.ComplaintMessage,
              c.ComplaintStatus,
              c.Resolution,
              c.ResolutionNote,
              c.ResolvedAt,
              rs.ResultStatus
            FROM Complaints c
              WITH (
                UPDLOCK,
                HOLDLOCK
              )
            LEFT JOIN Results rs
              ON c.ResultID =
                rs.ResultID
            WHERE c.ComplaintID =
              @ComplaintID;
          `);

      if (
        complaintResult
          .recordset.length ===
        0
      ) {
        await transaction
          .rollback();

        return fail(
          res,
          404,
          "Không tìm thấy khiếu nại",
          "COMPLAINT_NOT_FOUND"
        );
      }

      const complaint =
        complaintResult
          .recordset[0];

      // =================================================
      // 5. ALREADY RESOLVED
      // Cho phép frontend gọi lại mà không gây lỗi.
      // =================================================
      if (
        complaint
          .ComplaintStatus ===
        "RESOLVED"
      ) {
        await transaction
          .commit();

        return ok(
          res,
          {
            alreadyResolved:
              true,

            complaintID:
              complaint
                .ComplaintID,

            complaintStatus:
              complaint
                .ComplaintStatus,

            resolution:
              complaint.Resolution,

            resultID:
              complaint.ResultID,

            resultStatus:
              complaint
                .ResultStatus
          },
          "Khiếu nại này đã được xử lý trước đó"
        );
      }

      // =================================================
      // 6. COMPLAINT ALREADY IN REVIEW
      // Không được bấm "giữ nguyên" từ màn Complaint
      // khi nó đã chuyển sang review.
      // =================================================
      if (
        complaint
          .ComplaintStatus ===
        "IN_REVIEW"
      ) {
        await transaction
          .rollback();

        return fail(
          res,
          409,
          "Khiếu nại đã chuyển sang REVIEW. Hãy xử lý tại mục Reviews.",
          "COMPLAINT_ALREADY_IN_REVIEW"
        );
      }

      // =================================================
      // 7. OTHER INVALID STATUS
      // =================================================
      if (
        complaint
          .ComplaintStatus !==
        "OPEN"
      ) {
        await transaction
          .rollback();

        return fail(
          res,
          409,
          `Không thể xử lý khiếu nại ở trạng thái ${complaint.ComplaintStatus}`,
          "COMPLAINT_NOT_OPEN"
        );
      }

      // =================================================
      // 8. CLOSE COMPLAINT
      // Kết quả hiện tại được giữ nguyên.
      // Chỉ Complaint chuyển OPEN -> RESOLVED.
      // =================================================
      const updateComplaintRequest =
        new sql.Request(
          transaction
        );

      updateComplaintRequest
        .input(
          "ComplaintID",
          sql.Int,
          complaintID
        )
        .input(
          "Resolution",
          sql.VarChar(30),
          "KEEP_RESULT"
        )
        .input(
          "ResolutionNote",
          sql.NVarChar(1000),
          resolutionNote ||
            "BTC đã đối chiếu START, checkpoint, FINISH và xác nhận giữ nguyên kết quả."
        );

      await updateComplaintRequest
        .query(`
          UPDATE Complaints
          SET
            ComplaintStatus =
              'RESOLVED',

            Resolution =
              @Resolution,

            ResolutionNote =
              @ResolutionNote,

            ResolvedAt =
              GETDATE()

          WHERE ComplaintID =
            @ComplaintID;
        `);

      await transaction.commit();

      // =================================================
      // 9. AUDIT LOG
      // =================================================
      await audit(
        pool,
        "COMPLAINT_KEEP_RESULT",
        "Complaint",
        complaintID,
        `BIB ${complaint.BibNumber}; giữ nguyên ResultID ${complaint.ResultID}`,
        "BTC"
      );

      // =================================================
      // 10. SUCCESS RESPONSE
      // =================================================
      return ok(
        res,
        {
          complaintID,

          complaintStatus:
            "RESOLVED",

          resolution:
            "KEEP_RESULT",

          resultID:
            complaint.ResultID,

          resultStatus:
            complaint
              .ResultStatus
        },
        "Đã xác minh: kết quả đúng, giữ nguyên kết quả và đóng khiếu nại"
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction
            .rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Resolve complaint rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Resolve complaint error:",
        error
      );

      return fail(
        res,
        500,
        `Không thể xử lý khiếu nại: ${error.message}`,
        "COMPLAINT_RESOLVE_FAILED"
      );
    }
  }
);

// =====================================================
// COMPLAINT -> RESULT REVIEW
// =====================================================
app.post(
  "/api/complaints/review",
  async (req, res) => {
    let transaction;

    try {
      const complaintID =
        Number(
          req.body
            ?.complaintID
        );

      if (
        !Number.isInteger(
          complaintID
        ) ||
        complaintID <= 0
      ) {
        return fail(
          res,
          400,
          "ComplaintID không hợp lệ",
          "INVALID_COMPLAINT_ID"
        );
      }

      const pool =
        await poolPromise;

      transaction =
        new sql.Transaction(
          pool
        );

      await transaction.begin();

      // =================================================
      // LOAD + LOCK COMPLAINT
      // =================================================
      const complaintRequest =
        new sql.Request(
          transaction
        );

      complaintRequest.input(
        "ComplaintID",
        sql.Int,
        complaintID
      );

      const complaintResult =
        await complaintRequest
          .query(`
            SELECT
              c.ComplaintID,
              c.ResultID,
              c.BibNumber,
              c.ComplaintType,
              c.ComplaintMessage,
              c.ComplaintStatus,
              rs.ResultStatus
            FROM Complaints c
              WITH (
                UPDLOCK,
                HOLDLOCK
              )
            INNER JOIN Results rs
              ON c.ResultID =
                rs.ResultID
            WHERE c.ComplaintID =
              @ComplaintID
          `);

      if (
        complaintResult
          .recordset.length ===
        0
      ) {
        await transaction
          .rollback();

        return fail(
          res,
          404,
          "Không tìm thấy khiếu nại",
          "COMPLAINT_NOT_FOUND"
        );
      }

      const complaint =
        complaintResult
          .recordset[0];

      // =================================================
      // ALREADY IN REVIEW
      // =================================================
      if (
        complaint
          .ComplaintStatus ===
        "IN_REVIEW"
      ) {
        const existingRequest =
          new sql.Request(
            transaction
          );

        existingRequest.input(
          "ResultID",
          sql.Int,
          complaint.ResultID
        );

        const existingReview =
          await existingRequest
            .query(`
              SELECT TOP 1 *
              FROM ResultReviews
              WHERE ResultID =
                @ResultID
                AND ReviewStatus =
                  'OPEN'
              ORDER BY
                ReviewID DESC
            `);

        await transaction
          .commit();

        return ok(
          res,
          {
            alreadyInReview:
              true,

            complaintID:
              complaint
                .ComplaintID,

            resultID:
              complaint.ResultID,

            review:
              existingReview
                .recordset[0] ||
              null
          },
          "Khiếu nại đã được chuyển sang REVIEW trước đó"
        );
      }

      if (
        complaint
          .ComplaintStatus !==
        "OPEN"
      ) {
        await transaction
          .rollback();

        return fail(
          res,
          409,
          `Không thể chuyển khiếu nại ở trạng thái ${complaint.ComplaintStatus}`,
          "COMPLAINT_NOT_OPEN"
        );
      }

      // =================================================
      // FIND EXISTING OPEN REVIEW
      // =================================================
      const findReviewRequest =
        new sql.Request(
          transaction
        );

      findReviewRequest.input(
        "ResultID",
        sql.Int,
        complaint.ResultID
      );

      const openReviewResult =
        await findReviewRequest
          .query(`
            SELECT TOP 1 *
            FROM ResultReviews
              WITH (
                UPDLOCK,
                HOLDLOCK
              )
            WHERE ResultID =
              @ResultID
              AND ReviewStatus =
                'OPEN'
            ORDER BY
              ReviewID DESC
          `);

      let review;

      if (
        openReviewResult
          .recordset.length > 0
      ) {
        review =
          openReviewResult
            .recordset[0];
      } else {
        // ===============================================
        // CREATE REVIEW
        // ===============================================
        const createReviewRequest =
          new sql.Request(
            transaction
          );

        createReviewRequest
          .input(
            "ResultID",
            sql.Int,
            complaint.ResultID
          )
          .input(
            "ReviewSource",
            sql.VarChar(20),
            "ATHLETE"
          )
          .input(
            "ReviewReason",
            sql.NVarChar(100),
            "ATHLETE_COMPLAINT"
          )
          .input(
            "ReviewNotes",
            sql.NVarChar(1000),
            complaint
              .ComplaintMessage ||
              null
          );

        const createdReview =
          await createReviewRequest
            .query(`
              INSERT INTO ResultReviews
              (
                ResultID,
                ReviewSource,
                ReviewReason,
                ReviewNotes,
                ReviewStatus
              )
              OUTPUT INSERTED.*
              VALUES
              (
                @ResultID,
                @ReviewSource,
                @ReviewReason,
                @ReviewNotes,
                'OPEN'
              )
            `);

        review =
          createdReview
            .recordset[0];
      }

      // =================================================
      // RESULT -> REVIEW
      // =================================================
      const resultRequest =
        new sql.Request(
          transaction
        );

      resultRequest.input(
        "ResultID",
        sql.Int,
        complaint.ResultID
      );

      await resultRequest.query(`
        UPDATE Results
        SET ResultStatus =
          'REVIEW'
        WHERE ResultID =
          @ResultID
      `);

      // =================================================
      // COMPLAINT -> IN_REVIEW
      // =================================================
      const complaintUpdateRequest =
        new sql.Request(
          transaction
        );

      complaintUpdateRequest.input(
        "ComplaintID",
        sql.Int,
        complaintID
      );

      await complaintUpdateRequest
        .query(`
          UPDATE Complaints
          SET ComplaintStatus =
            'IN_REVIEW'
          WHERE ComplaintID =
            @ComplaintID
        `);

      await transaction.commit();

      await audit(
        pool,
        "COMPLAINT_TO_REVIEW",
        "Complaint",
        complaintID,
        `BIB ${complaint.BibNumber}; ResultID ${complaint.ResultID}; ReviewID ${review?.ReviewID ?? "N/A"}`,
        "BTC"
      );

      return ok(
        res,
        {
          complaintID:
            complaint
              .ComplaintID,

          complaintStatus:
            "IN_REVIEW",

          resultID:
            complaint.ResultID,

          resultStatus:
            "REVIEW",

          review
        },
        "Đã chuyển khiếu nại sang REVIEW"
      );
    } catch (error) {
      if (transaction) {
        try {
          await transaction
            .rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Complaint review rollback error:",
            rollbackError
          );
        }
      }

      console.error(
        "Complaint -> Review error:",
        error
      );

      return fail(
        res,
        500,
        `Không thể chuyển khiếu nại sang REVIEW: ${error.message}`,
        "COMPLAINT_REVIEW_FAILED"
      );
    }
  }
);

// =====================================================
// AUDIT LOGS
// =====================================================
app.get(
  "/api/audit-logs",
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const result =
        await pool
          .request()
          .query(`
            SELECT TOP 100 *
            FROM AuditLogs
            ORDER BY CreatedAt DESC
          `);

      return ok(
        res,
        result.recordset
      );
    } catch (error) {
      console.error(
        "Load audit logs error:",
        error
      );

      return fail(
        res,
        500,
        "Không thể tải audit log"
      );
    }
  }
);

// =====================================================
// SERVER STARTUP
// =====================================================
app.listen(
  PORT,
  async () => {
    console.log(
      `🚀 Race Timing Pro API http://localhost:${PORT}`
    );

    try {
      await ensureDatabaseCompatibility();
    } catch (error) {
      console.error(
        "⚠️ Database compatibility check failed:",
        error.message
      );
    }

    await ensureDemoAdminAccounts();
  }
);
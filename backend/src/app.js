const express = require("express");
const cors = require("cors");

const {
  pool,
  testDatabaseConnection
} = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

function sendSuccess(res, data = {}, message = "OK", status = 200) {
  return res.status(status).json({
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
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeDistance(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1 AS ok");

    return sendSuccess(
      res,
      {
        server: "online",
        database:
          process.env.DB_NAME ||
          "race_management",
        databaseEngine: "MySQL"
      },
      "Race Timing Pro API online"
    );
  } catch (error) {
    console.error(
      "Health check error:",
      error
    );

    return sendError(
      res,
      503,
      "API đang chạy nhưng chưa kết nối được MySQL.",
      "DATABASE_UNAVAILABLE"
    );
  }
});

app.post(
  "/api/auth/login",
  async (req, res) => {
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

    const expectedUsername = String(
      process.env.ADMIN_USERNAME || ""
    ).trim();

    const expectedPassword = String(
      process.env.ADMIN_PASSWORD || ""
    );

    if (
      !expectedUsername ||
      !expectedPassword
    ) {
      return sendError(
        res,
        503,
        "Tài khoản quản trị local chưa được cấu hình trong .env.",
        "ADMIN_LOGIN_NOT_CONFIGURED"
      );
    }

    if (
      username !== expectedUsername ||
      password !== expectedPassword
    ) {
      return sendError(
        res,
        401,
        "Tài khoản hoặc mật khẩu không đúng.",
        "INVALID_LOGIN"
      );
    }

    return sendSuccess(
      res,
      {
        user: {
          Username: expectedUsername,
          DisplayName: "Ban Tổ Chức",
          Role: "BTC",
          IsActive: 1
        },
        token: `local-${Date.now()}`
      },
      "Đăng nhập thành công"
    );
  }
);

app.get(
  "/api/athletes",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT
            u.UserID,
            u.FullName,
            u.DateOfBirth,
            u.Phone,
            u.Email,
            u.Gender,
            u.CreatedAt AS UserCreatedAt,

            r.RegistrationID,
            r.BibNumber,
            r.Distance,
            r.HasMedicalCondition,
            r.MedicalCondition,
            r.MedicalNotes,
            r.RegistrationStatus,
            r.CreatedAt AS RegistrationCreatedAt

          FROM Users u

          INNER JOIN Registrations r
            ON r.UserID = u.UserID

          ORDER BY
            r.RegistrationID DESC
        `);

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Get athletes error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể lấy danh sách VĐV"
      );
    }
  }
);

app.get(
  "/api/public/athletes/:bib",
  async (req, res) => {
    try {
      const bibNumber =
        normalizeBib(
          req.params.bib
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      const [rows] =
        await pool.execute(
          `
            SELECT
              u.FullName,
              u.Phone,
              u.Email,
              u.Gender,

              r.BibNumber,
              r.Distance,
              r.RegistrationStatus,

              rr.RunStatus

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            LEFT JOIN RaceRuns rr
              ON rr.RegistrationID =
                r.RegistrationID

            WHERE r.BibNumber = ?
            LIMIT 1
          `,
          [
            bibNumber
          ]
        );

      if (rows.length === 0) {
        return sendError(
          res,
          404,
          "Không tìm thấy VĐV",
          "BIB_NOT_FOUND"
        );
      }

      const athlete =
        rows[0];

      const maskPhone = (phone) => {
        if (!phone) {
          return null;
        }

        const value =
          String(phone);

        if (value.length <= 6) {
          return "***";
        }

        return (
          value.slice(0, 3) +
          "****" +
          value.slice(-3)
        );
      };

      const maskEmail = (email) => {
        if (!email) {
          return null;
        }

        const value =
          String(email);

        const atIndex =
          value.indexOf("@");

        if (atIndex <= 0) {
          return "***";
        }

        const username =
          value.slice(
            0,
            atIndex
          );

        const domain =
          value.slice(
            atIndex
          );

        const visiblePart =
          username.length <= 2
            ? username.charAt(0)
            : username.slice(0, 3);

        return (
          visiblePart +
          "***" +
          domain
        );
      };

      return sendSuccess(
        res,
        {
          fullName:
            athlete.FullName,

          bibNumber:
            athlete.BibNumber,

          distance:
            athlete.Distance,

          gender:
            athlete.Gender,

          phone:
            maskPhone(
              athlete.Phone
            ),

          email:
            maskEmail(
              athlete.Email
            ),

          registrationStatus:
            athlete.RegistrationStatus,

          runStatus:
            athlete.RunStatus
        },
        "Tra cứu VĐV thành công"
      );
    } catch (error) {
      console.error(
        "Public athlete lookup error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tra cứu VĐV",
        "PUBLIC_ATHLETE_LOOKUP_FAILED"
      );
    }
  }
);

app.put(
  "/api/athletes/:bib",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.params.bib
        );

      const fullName =
        normalizeText(
          req.body?.fullName
        );

      const dateOfBirth =
        normalizeText(
          req.body?.dateOfBirth
        );

      const email =
        normalizeText(
          req.body?.email
        );

      const gender =
        normalizeText(
          req.body?.gender
        );

      const phone =
        normalizeText(
          req.body?.phone
        );

      const distance =
        req.body?.distance
          ? normalizeDistance(
              req.body.distance
            )
          : null;

      const hasMedicalConditionProvided =
        req.body?.hasMedicalCondition !==
        undefined;

      const hasMedicalCondition =
        hasMedicalConditionProvided
          ? toBoolean(
              req.body.hasMedicalCondition
            )
          : null;

      const medicalCondition =
        normalizeText(
          req.body?.medicalCondition
        );

      const medicalNotes =
        normalizeText(
          req.body?.medicalNotes
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      const allowedDistances = [
        "5KM",
        "10KM",
        "21KM",
        "42KM"
      ];

      if (
        distance &&
        !allowedDistances.includes(
          distance
        )
      ) {
        return sendError(
          res,
          400,
          "Cự ly không hợp lệ",
          "INVALID_DISTANCE"
        );
      }

      await connection.beginTransaction();
      const [rows] =
        await connection.execute(
          `
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
              r.RegistrationStatus

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE r.BibNumber = ?

            LIMIT 1
            FOR UPDATE
          `,
          [bibNumber]
        );

      if (rows.length === 0) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      const athlete =
        rows[0];
      const nextFullName =
        req.body?.fullName !== undefined
          ? fullName
          : athlete.FullName;

      const nextDateOfBirth =
        req.body?.dateOfBirth !== undefined
          ? dateOfBirth
          : athlete.DateOfBirth;

      const nextPhone =
        req.body?.phone !== undefined
          ? phone
          : athlete.Phone;

      const nextEmail =
        req.body?.email !== undefined
          ? email
          : athlete.Email;

      const nextGender =
        req.body?.gender !== undefined
          ? gender
          : athlete.Gender;

      if (
        !nextFullName ||
        !nextPhone
      ) {
        await connection.rollback();

        return sendError(
          res,
          400,
          "Họ tên và số điện thoại không được để trống",
          "ATHLETE_REQUIRED"
        );
      }
      const wantsToUpdateRegistration =
        req.body?.distance !== undefined ||
        req.body?.hasMedicalCondition !==
          undefined ||
        req.body?.medicalCondition !==
          undefined ||
        req.body?.medicalNotes !==
          undefined;
      if (
        wantsToUpdateRegistration &&
        athlete.RegistrationStatus !==
          "REGISTERED"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Cự ly và thông tin y tế đã được khóa sau khi check-in.",
          "REGISTRATION_LOCKED"
        );
      }
      await connection.execute(
        `
          UPDATE Users
          SET
            FullName = ?,
            DateOfBirth = ?,
            Phone = ?,
            Email = ?,
            Gender = ?
          WHERE UserID = ?
        `,
        [
          nextFullName,
          nextDateOfBirth,
          nextPhone,
          nextEmail,
          nextGender,
          athlete.UserID
        ]
      );

      if (wantsToUpdateRegistration) {
        const nextDistance =
          distance ??
          athlete.Distance;

        const nextHasMedicalCondition =
          hasMedicalConditionProvided
            ? hasMedicalCondition
            : Boolean(
                athlete.HasMedicalCondition
              );

        const nextMedicalCondition =
          req.body?.medicalCondition !==
          undefined
            ? medicalCondition
            : athlete.MedicalCondition;

        const nextMedicalNotes =
          req.body?.medicalNotes !==
          undefined
            ? medicalNotes
            : athlete.MedicalNotes;

        if (
          nextHasMedicalCondition &&
          !nextMedicalCondition
        ) {
          await connection.rollback();

          return sendError(
            res,
            400,
            "Vui lòng nhập tình trạng sức khỏe",
            "MEDICAL_CONDITION_REQUIRED"
          );
        }
        if (!waiverAccepted) {
  return sendError(
    res,
    400,
    "Vui lòng đọc và đồng ý với Điều khoản tham gia giải trước khi đăng ký.",
    "WAIVER_REQUIRED"
  );
}

        await connection.execute(
          `
            UPDATE Registrations
SET
  Distance = ?,
  HasMedicalCondition = ?,
  MedicalCondition = ?,
  MedicalNotes = ?,
  WaiverAccepted = 1,
  WaiverAcceptedAt =
    COALESCE(
      WaiverAcceptedAt,
      NOW(3)
    )
WHERE RegistrationID = ?
          `,
          [
            nextDistance,

            nextHasMedicalCondition
              ? 1
              : 0,

            nextHasMedicalCondition
              ? nextMedicalCondition
              : null,

            nextHasMedicalCondition
              ? nextMedicalNotes
              : null,

            athlete.RegistrationID
          ]
        );
      }
      const [updatedRows] =
        await connection.execute(
          `
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
              r.RegistrationStatus

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE r.BibNumber = ?

            LIMIT 1
          `,
          [bibNumber]
        );

      await connection.commit();

      return sendSuccess(
        res,
        updatedRows[0],
        "Cập nhật thông tin VĐV thành công"
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Update athlete rollback error:",
          rollbackError
        );
      }

      console.error(
        "Update athlete error:",
        error
      );

      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return sendError(
          res,
          409,
          "Số điện thoại đã được sử dụng bởi VĐV khác.",
          "DUPLICATE_PHONE"
        );
      }

      return sendError(
        res,
        500,
        "Không thể cập nhật thông tin VĐV",
        "ATHLETE_UPDATE_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);
app.post(
  "/api/registrations",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const fullName = String(
        req.body?.fullName || ""
      ).trim();

      const phone = String(
        req.body?.phone || ""
      ).trim();

      const distance =
        normalizeDistance(
          req.body?.distance
        );

      const dateOfBirth =
        normalizeText(
          req.body?.dateOfBirth
        );

      const email =
        normalizeText(
          req.body?.email
        );

      const gender =
        normalizeText(
          req.body?.gender
        );

      const hasMedicalCondition =
        toBoolean(
          req.body?.hasMedicalCondition
        );

      const medicalCondition =
        normalizeText(
          req.body?.medicalCondition
        );

     const medicalNotes =
  normalizeText(
    req.body?.medicalNotes
  );
  const waiverAccepted =
  toBoolean(
    req.body?.waiverAccepted
  );
      if (
        !fullName ||
        !phone ||
        !distance
      ) {
        return sendError(
          res,
          400,
          "Họ tên, số điện thoại và cự ly là bắt buộc",
          "REGISTRATION_REQUIRED"
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
        return sendError(
          res,
          400,
          "Cự ly không hợp lệ",
          "INVALID_DISTANCE"
        );
      }

      if (
        hasMedicalCondition &&
        !medicalCondition
      ) {
        return sendError(
          res,
          400,
          "Vui lòng nhập tình trạng sức khỏe",
          "MEDICAL_CONDITION_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const [existingUsers] =
        await connection.execute(
          `
            SELECT
              UserID
            FROM Users
            WHERE Phone = ?
            LIMIT 1
            FOR UPDATE
          `,
          [phone]
        );

      let userID;
      
      if (
        existingUsers.length > 0
      ) {
        userID =
          existingUsers[0].UserID;

        await connection.execute(
          `
            UPDATE Users
            SET
              FullName = ?,
              DateOfBirth = ?,
              Email = ?,
              Gender = ?
            WHERE UserID = ?
          `,
          [
            fullName,
            dateOfBirth,
            email,
            gender,
            userID
          ]
        );
      } else {

        const [insertedUser] =
          await connection.execute(
            `
              INSERT INTO Users
              (
                FullName,
                DateOfBirth,
                Phone,
                Email,
                Gender
              )
              VALUES (?, ?, ?, ?, ?)
            `,
            [
              fullName,
              dateOfBirth,
              phone,
              email,
              gender
            ]
          );

        userID =
          insertedUser.insertId;
      }

      const [existingRegistrations] =
        await connection.execute(
          `
            SELECT
              RegistrationID,
              BibNumber,
              RegistrationStatus
            FROM Registrations
            WHERE UserID = ?
            LIMIT 1
            FOR UPDATE
          `,
          [userID]
        );

      let registrationID;
      let bibNumber;

      if (
        existingRegistrations.length > 0
      ) {
        const existing =
          existingRegistrations[0];

        if (
          existing.RegistrationStatus !==
          "REGISTERED"
        ) {
          await connection.rollback();

          return sendError(
            res,
            409,
            "Thông tin đăng ký đã được khóa sau khi check-in.",
            "REGISTRATION_LOCKED"
          );
        }

        registrationID =
          existing.RegistrationID;

        bibNumber =
          existing.BibNumber;

        await connection.execute(
          `
            UPDATE Registrations
            SET
              Distance = ?,
              HasMedicalCondition = ?,
              MedicalCondition = ?,
              MedicalNotes = ?
            WHERE RegistrationID = ?
          `,
          [
            distance,
            hasMedicalCondition
              ? 1
              : 0,
            hasMedicalCondition
              ? medicalCondition
              : null,
            hasMedicalCondition
              ? medicalNotes
              : null,
            registrationID
          ]
        );
      } else {
  
        const [latestBibRows] =
          await connection.query(`
            SELECT
              BibNumber
            FROM Registrations
            WHERE BibNumber
              REGEXP '^BIB[0-9]+$'
            ORDER BY
              RegistrationID DESC
            LIMIT 1
            FOR UPDATE
          `);

        let nextBibNumber = 1;

        if (
          latestBibRows.length > 0
        ) {
          const numericPart =
            Number(
              String(
                latestBibRows[0]
                  .BibNumber || ""
              ).replace(
                /^BIB/i,
                ""
              )
            );

          if (
            Number.isFinite(
              numericPart
            )
          ) {
            nextBibNumber =
              numericPart + 1;
          }
        }

        bibNumber =
          `BIB${String(
            nextBibNumber
          ).padStart(3, "0")}`;

        const [insertedRegistration] =
          await connection.execute(
            `
            INSERT INTO Registrations
(
  UserID,
  Distance,
  BibNumber,
  HasMedicalCondition,
  MedicalCondition,
  MedicalNotes,
  WaiverAccepted,
  WaiverAcceptedAt,
  RegistrationStatus
)
VALUES
(
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  1,
  NOW(3),
  'REGISTERED'
)
              
            `,
            [
              userID,
              distance,
              bibNumber,
              hasMedicalCondition
                ? 1
                : 0,
              hasMedicalCondition
                ? medicalCondition
                : null,
              hasMedicalCondition
                ? medicalNotes
                : null
            ]
          );

        registrationID =
          insertedRegistration.insertId;
      }

      await connection.commit();

      return sendSuccess(
        res,
        {
          registrationID,
          bibNumber,
          status: "REGISTERED"
        },
        existingRegistrations.length > 0
          ? "Cập nhật đăng ký thành công"
          : "Đăng ký thành công",
        existingRegistrations.length > 0
          ? 200
          : 201
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Registration rollback error:",
          rollbackError
        );
      }

      console.error(
        "Registration error:",
        error
      );

      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return sendError(
          res,
          409,
          "Dữ liệu đăng ký bị trùng. Vui lòng kiểm tra số điện thoại hoặc BIB.",
          "DUPLICATE_REGISTRATION"
        );
      }

      return sendError(
        res,
        500,
        "Đăng ký thất bại",
        "REGISTRATION_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.get(
  "/api/dashboard/athletes",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
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
            rs.ApprovedBy,
            rs.ApprovedAt,

            (
              SELECT c.ScanTime
              FROM Checkpoints c
              WHERE c.RunID = rr.RunID
                AND c.CheckpointCode = 'CP01'
                AND c.ScanStatus = 'COMPLETED'
              ORDER BY c.ScanTime DESC
              LIMIT 1
            ) AS CP01Time,

            (
              SELECT c.ScanTime
              FROM Checkpoints c
              WHERE c.RunID = rr.RunID
                AND c.CheckpointCode = 'CP02'
                AND c.ScanStatus = 'COMPLETED'
              ORDER BY c.ScanTime DESC
              LIMIT 1
            ) AS CP02Time,

            (
              SELECT c.ScanTime
              FROM Checkpoints c
              WHERE c.RunID = rr.RunID
                AND c.CheckpointCode = 'CP03'
                AND c.ScanStatus = 'COMPLETED'
              ORDER BY c.ScanTime DESC
              LIMIT 1
            ) AS CP03Time,

            (
              SELECT COUNT(*)
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
                AND ma.AlertStatus = 'PENDING'
            ) AS PendingMedicalAlerts

          FROM Users u

          INNER JOIN Registrations r
            ON r.UserID = u.UserID

          LEFT JOIN RaceRuns rr
            ON rr.RegistrationID =
              r.RegistrationID

          LEFT JOIN Results rs
            ON rs.RunID =
              rr.RunID

          ORDER BY
            r.RegistrationID DESC
        `);

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Dashboard error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tải dashboard",
        "DASHBOARD_FAILED"
      );
    }
  }
);
// =====================================================
// CHECK-IN 1 BIB
// REGISTERED -> CHECKED_IN
// =====================================================
app.post(
  "/api/check-in",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const [rows] =
        await connection.execute(
          `
            SELECT
              r.RegistrationID,
              r.BibNumber,
              r.Distance,
              r.RegistrationStatus,

              u.FullName,

              rr.RunID,
              rr.RunStatus,
              rr.StartTime,
              rr.FinishTime

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            LEFT JOIN RaceRuns rr
              ON rr.RegistrationID =
                r.RegistrationID

            WHERE r.BibNumber = ?

            LIMIT 1
            FOR UPDATE
          `,
          [
            bibNumber
          ]
        );

      if (rows.length === 0) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      const athlete =
        rows[0];

      // Đã check-in trước đó
      if (
        athlete.RegistrationStatus ===
        "CHECKED_IN"
      ) {
        await connection.execute(
          `
            INSERT INTO RaceRuns
            (
              RegistrationID,
              RunStatus
            )
            VALUES
            (
              ?,
              'CHECKED_IN'
            )

            ON DUPLICATE KEY UPDATE
              RunStatus =
                CASE
                  WHEN StartTime IS NULL
                    AND FinishTime IS NULL
                  THEN 'CHECKED_IN'
                  ELSE RunStatus
                END
          `,
          [
            athlete.RegistrationID
          ]
        );

        const [runRows] =
          await connection.execute(
            `
              SELECT
                RunID,
                RegistrationID,
                StartTime,
                FinishTime,
                RunStatus

              FROM RaceRuns

              WHERE RegistrationID = ?

              LIMIT 1
            `,
            [
              athlete.RegistrationID
            ]
          );

        await connection.commit();

        return sendSuccess(
          res,
          {
            bibNumber:
              athlete.BibNumber,

            FullName:
              athlete.FullName,

            Distance:
              athlete.Distance,

            RegistrationStatus:
              "CHECKED_IN",

            ...runRows[0],

            alreadyCheckedIn:
              true
          },
          "VĐV đã CHECK-IN trước đó"
        );
      }

      if (
        athlete.RegistrationStatus !==
        "REGISTERED"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          `Không thể check-in khi đăng ký đang ở trạng thái ${athlete.RegistrationStatus}.`,
          "CHECK_IN_INVALID_STATUS"
        );
      }

      await connection.execute(
        `
          UPDATE Registrations

          SET
            RegistrationStatus =
              'CHECKED_IN'

          WHERE RegistrationID = ?
        `,
        [
          athlete.RegistrationID
        ]
      );

      await connection.execute(
        `
          INSERT INTO RaceRuns
          (
            RegistrationID,
            RunStatus
          )
          VALUES
          (
            ?,
            'CHECKED_IN'
          )

          ON DUPLICATE KEY UPDATE
            RunStatus =
              CASE
                WHEN StartTime IS NULL
                  AND FinishTime IS NULL
                THEN 'CHECKED_IN'
                ELSE RunStatus
              END
        `,
        [
          athlete.RegistrationID
        ]
      );

      const [runRows] =
        await connection.execute(
          `
            SELECT
              RunID,
              RegistrationID,
              StartTime,
              FinishTime,
              RunStatus

            FROM RaceRuns

            WHERE RegistrationID = ?

            LIMIT 1
          `,
          [
            athlete.RegistrationID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        {
          bibNumber:
            athlete.BibNumber,

          FullName:
            athlete.FullName,

          Distance:
            athlete.Distance,

          RegistrationStatus:
            "CHECKED_IN",

          ...runRows[0]
        },
        "Check-in thành công"
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Check-in rollback error:",
          rollbackError
        );
      }

      console.error(
        "Check-in error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể check-in VĐV",
        "CHECK_IN_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);


// =====================================================
// CHECK-IN DANH SÁCH
//
// Có thể gửi:
// {
//   "bibNumbers": [
//     "BIB001",
//     "BIB002",
//     "BIB003"
//   ]
// }
//
// Hoặc:
// {
//   "bibNumbers": "BIB001 BIB002 BIB003"
// }
// =====================================================
app.post(
  "/api/check-in/bulk",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const rawBibNumbers =
        Array.isArray(
          req.body?.bibNumbers
        )
          ? req.body.bibNumbers
          : String(
              req.body?.bibNumbers ||
              ""
            ).split(
              /[\s,;]+/
            );

      const bibNumbers = [
        ...new Set(
          rawBibNumbers
            .map(
              (value) =>
                normalizeBib(
                  value
                )
            )
            .filter(Boolean)
        )
      ];

      if (
        bibNumbers.length === 0
      ) {
        return sendError(
          res,
          400,
          "Vui lòng nhập danh sách BIB cần check-in.",
          "BULK_BIB_REQUIRED"
        );
      }

      // đủ cho case chị Sarah nói 50-100
      if (
        bibNumbers.length > 200
      ) {
        return sendError(
          res,
          400,
          "Mỗi lần chỉ check-in tối đa 200 BIB.",
          "BULK_BIB_LIMIT"
        );
      }

      await connection.beginTransaction();

      const placeholders =
        bibNumbers
          .map(() => "?")
          .join(", ");

      const [rows] =
        await connection.execute(
          `
            SELECT
              r.RegistrationID,
              r.BibNumber,
              r.RegistrationStatus,

              u.FullName,

              rr.RunID,
              rr.RunStatus,
              rr.StartTime,
              rr.FinishTime

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            LEFT JOIN RaceRuns rr
              ON rr.RegistrationID =
                r.RegistrationID

            WHERE r.BibNumber
              IN (${placeholders})

            FOR UPDATE
          `,
          bibNumbers
        );

      const athleteMap =
        new Map(
          rows.map(
            (row) => [
              normalizeBib(
                row.BibNumber
              ),
              row
            ]
          )
        );

      const eligible = [];
      const results = [];

      for (
        const bibNumber
        of bibNumbers
      ) {
        const athlete =
          athleteMap.get(
            bibNumber
          );

        if (!athlete) {
          results.push({
            bibNumber,
            status:
              "NOT_FOUND",
            message:
              "Không tìm thấy BIB"
          });

          continue;
        }

        if (
          athlete.RegistrationStatus ===
          "CHECKED_IN"
        ) {
          results.push({
            bibNumber,
            fullName:
              athlete.FullName,
            status:
              "ALREADY_CHECKED_IN",
            message:
              "Đã check-in trước đó"
          });

          continue;
        }

        if (
          athlete.RegistrationStatus !==
          "REGISTERED"
        ) {
          results.push({
            bibNumber,
            fullName:
              athlete.FullName,
            status:
              "INVALID_STATUS",
            message:
              `Trạng thái hiện tại: ${athlete.RegistrationStatus}`
          });

          continue;
        }

        eligible.push(
          athlete
        );
      }

      if (
        eligible.length > 0
      ) {
        const ids =
          eligible.map(
            (athlete) =>
              athlete.RegistrationID
          );

        const idPlaceholders =
          ids
            .map(() => "?")
            .join(", ");

        await connection.execute(
          `
            UPDATE Registrations

            SET
              RegistrationStatus =
                'CHECKED_IN'

            WHERE RegistrationID
              IN (${idPlaceholders})
          `,
          ids
        );

        await connection.execute(
          `
            INSERT INTO RaceRuns
            (
              RegistrationID,
              RunStatus
            )

            SELECT
              RegistrationID,
              'CHECKED_IN'

            FROM Registrations

            WHERE RegistrationID
              IN (${idPlaceholders})

            ON DUPLICATE KEY UPDATE
              RunStatus =
                CASE
                  WHEN StartTime IS NULL
                    AND FinishTime IS NULL
                  THEN 'CHECKED_IN'
                  ELSE RunStatus
                END
          `,
          ids
        );

        for (
          const athlete
          of eligible
        ) {
          results.push({
            bibNumber:
              athlete.BibNumber,

            fullName:
              athlete.FullName,

            status:
              "CHECKED_IN",

            message:
              "Check-in thành công"
          });
        }
      }

      await connection.commit();

      const checkedInCount =
        results.filter(
          (item) =>
            item.status ===
            "CHECKED_IN"
        ).length;

      const alreadyCheckedInCount =
        results.filter(
          (item) =>
            item.status ===
            "ALREADY_CHECKED_IN"
        ).length;

      const failedCount =
        results.length -
        checkedInCount -
        alreadyCheckedInCount;

      return sendSuccess(
        res,
        {
          requestedCount:
            bibNumbers.length,

          checkedInCount,

          alreadyCheckedInCount,

          failedCount,

          results
        },
        `Đã check-in ${checkedInCount}/${bibNumbers.length} BIB trong danh sách`
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Bulk check-in rollback error:",
          rollbackError
        );
      }

      console.error(
        "Bulk check-in error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể check-in danh sách VĐV",
        "BULK_CHECK_IN_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);


// =====================================================
// CHECK-IN TẤT CẢ
// Tất cả REGISTERED -> CHECKED_IN
// =====================================================
app.post(
  "/api/check-in/all",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] =
        await connection.query(`
          SELECT
            RegistrationID,
            BibNumber

          FROM Registrations

          WHERE RegistrationStatus =
            'REGISTERED'

          ORDER BY RegistrationID

          FOR UPDATE
        `);

      if (
        rows.length === 0
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            checkedInCount: 0,
            bibNumbers: []
          },
          "Không còn VĐV nào cần check-in"
        );
      }

      const ids =
        rows.map(
          (row) =>
            row.RegistrationID
        );

      const placeholders =
        ids
          .map(() => "?")
          .join(", ");

      await connection.execute(
        `
          UPDATE Registrations

          SET
            RegistrationStatus =
              'CHECKED_IN'

          WHERE RegistrationID
            IN (${placeholders})
        `,
        ids
      );

      await connection.execute(
        `
          INSERT INTO RaceRuns
          (
            RegistrationID,
            RunStatus
          )

          SELECT
            RegistrationID,
            'CHECKED_IN'

          FROM Registrations

          WHERE RegistrationID
            IN (${placeholders})

          ON DUPLICATE KEY UPDATE
            RunStatus =
              CASE
                WHEN StartTime IS NULL
                  AND FinishTime IS NULL
                THEN 'CHECKED_IN'
                ELSE RunStatus
              END
        `,
        ids
      );

      await connection.commit();

      return sendSuccess(
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
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Check-in all rollback error:",
          rollbackError
        );
      }

      console.error(
        "Check-in all error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể check-in tất cả VĐV",
        "CHECK_IN_ALL_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);
app.post(
  "/api/complaints",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      const complaintType =
        normalizeText(
          req.body?.complaintType
        );

      const complaintMessage =
        normalizeText(
          req.body?.complaintMessage
        );

      const contactInfo =
        normalizeText(
          req.body?.contactInfo
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      if (!complaintType) {
        return sendError(
          res,
          400,
          "Vui lòng nhập loại khiếu nại",
          "COMPLAINT_TYPE_REQUIRED"
        );
      }

      if (!complaintMessage) {
        return sendError(
          res,
          400,
          "Vui lòng nhập nội dung khiếu nại",
          "COMPLAINT_MESSAGE_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const [resultRows] =
        await connection.execute(
          `
            SELECT
              rs.ResultID,
              rs.RunID,
              rs.ResultStatus,

              r.BibNumber,

              u.FullName

            FROM Results rs

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                rs.RunID

            INNER JOIN Registrations r
              ON r.RegistrationID =
                rr.RegistrationID

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE r.BibNumber = ?
              AND rs.ResultStatus = 'OFFICIAL'

            LIMIT 1
            FOR UPDATE
          `,
          [
            bibNumber
          ]
        );

      if (
        resultRows.length === 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy kết quả OFFICIAL của BIB này.",
          "RESULT_NOT_OFFICIAL"
        );
      }

      const result =
        resultRows[0];
        if (result.ResultStatus === "PENDING") {
  const [complaintRows] = await pool.execute(
    `
      SELECT
        ComplaintID,
        ComplaintType,
        ComplaintMessage,
        ContactInfo,
        ComplaintStatus,
        Resolution,
        ResolutionNote,
        CreatedAt,
        ResolvedAt
      FROM Complaints
      WHERE ResultID = ?
      ORDER BY CreatedAt DESC
    `,
    [result.ResultID]
  );

  return sendSuccess(
    res,
    {
      available: false,
      reason: "UNDER_REVIEW",

      ResultID: result.ResultID,
      RunID: result.RunID,

      FullName: result.FullName,
      BibNumber: result.BibNumber,
      Distance: result.Distance,

      ResultStatus: result.ResultStatus,

      StartTime: result.StartTime,
      CP01Time: result.CP01Time,
      CP02Time: result.CP02Time,
      CP03Time: result.CP03Time,
      FinishTime: result.FinishTime,

      TotalTimeSeconds: result.TotalTimeSeconds,

      complaints: complaintRows
    },
    "BTC đang kiểm tra lại kết quả."
  );
}

      const [insertResult] =
        await connection.execute(
          `
            INSERT INTO Complaints
            (
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus,
              Resolution,
              ResolutionNote,
              CreatedAt,
              ResolvedAt
            )
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              ?,
              'OPEN',
              NULL,
              NULL,
              NOW(3),
              NULL
            )
          `,
          [
            result.ResultID,
            bibNumber,
            complaintType,
            complaintMessage,
            contactInfo
          ]
        );

      const [complaintRows] =
        await connection.execute(
          `
            SELECT
              ComplaintID,
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus,
              Resolution,
              ResolutionNote,
              CreatedAt,
              ResolvedAt
            FROM Complaints
            WHERE ComplaintID = ?
            LIMIT 1
          `,
          [
            insertResult.insertId
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        complaintRows[0],
        "Đã gửi khiếu nại",
        201
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Create complaint rollback error:",
          rollbackError
        );
      }

      console.error(
        "Create complaint error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể gửi khiếu nại",
        "COMPLAINT_CREATE_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);


async function getRaceRow(
  executor,
  bibNumber,
  lock = false
) {
  const lockClause =
    lock
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await executor.execute(
      `
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
          rr.RunStatus

        FROM Registrations r

        INNER JOIN Users u
          ON u.UserID =
            r.UserID

        LEFT JOIN RaceRuns rr
          ON rr.RegistrationID =
            r.RegistrationID

        WHERE r.BibNumber = ?

        LIMIT 1
        ${lockClause}
      `,
      [bibNumber]
    );

  return (
    rows[0] ||
    null
  );
}

app.post(
  "/api/race/start",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const athlete =
        await getRaceRow(
          connection,
          bibNumber,
          true
        );

      if (!athlete) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      if (
        athlete.RegistrationStatus !==
        "CHECKED_IN"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV chưa CHECK-IN",
          "NOT_CHECKED_IN"
        );
      }

      if (!athlete.RunID) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Chưa có lượt chạy cho VĐV",
          "RUN_NOT_CREATED"
        );
      }
if (
  athlete.RunStatus ===
  "RUNNING"
) {
  await connection.commit();

  return sendSuccess(
    res,
    {
      ...athlete,
      alreadyStarted: true
    },
    "VĐV đã START trước đó"
  );
}

if (
  athlete.RunStatus !==
  "CHECKED_IN"
) {
  await connection.rollback();

  return sendError(
    res,
    409,
    `Không thể START khi lượt chạy đang ở trạng thái ${athlete.RunStatus}.`,
    "START_INVALID_STATUS"
  );
}

await connection.execute(
  `
    UPDATE RaceRuns
    SET
      StartTime = NOW(3),
      RunStatus = 'RUNNING'
    WHERE RunID = ?
      AND RunStatus = 'CHECKED_IN'
  `,
  [
    athlete.RunID
  ]
);
      

      const [runRows] =
        await connection.execute(
          `
            SELECT
              RunID,
              RegistrationID,
              StartTime,
              FinishTime,
              RunStatus
            FROM RaceRuns
            WHERE RunID = ?
            LIMIT 1
          `,
          [
            athlete.RunID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        {
          bibNumber,
          FullName:
            athlete.FullName,
          Distance:
            athlete.Distance,
          ...runRows[0]
        },
        "START thành công"
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Start rollback error:",
          rollbackError
        );
      }

      console.error(
        "Start error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể START",
        "START_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.post(
  "/api/race/checkpoint",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      const checkpointCode =
        String(
          req.body?.checkpointCode || ""
        )
          .trim()
          .toUpperCase();

      const allowedCheckpoints = [
        "CP01",
        "CP02",
        "CP03"
      ];

      // ===============================================
      // VALIDATE INPUT
      // ===============================================
      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      if (
        !allowedCheckpoints.includes(
          checkpointCode
        )
      ) {
        return sendError(
          res,
          400,
          "Checkpoint không hợp lệ",
          "INVALID_CHECKPOINT"
        );
      }

      await connection.beginTransaction();

      const athlete =
        await getRaceRow(
          connection,
          bibNumber,
          true
        );

      if (!athlete) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      if (!athlete.RunID) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Không tìm thấy lượt chạy",
          "RUN_NOT_FOUND"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV không ở trạng thái RUNNING",
          "RUN_NOT_RUNNING"
        );
      }

      const [pendingMedicalRows] =
        await connection.execute(
          `
            SELECT
              AlertID,
              AlertType,
              AlertMessage,
              AlertStatus,
              CreatedAt
            FROM MedicalAlerts
            WHERE RunID = ?
              AND AlertStatus = 'PENDING'
            ORDER BY CreatedAt DESC
            LIMIT 1
          `,
          [
            athlete.RunID
          ]
        );

      if (
        pendingMedicalRows.length > 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV đang có cảnh báo y tế PENDING. Cần Medical Team quyết định CONTINUE hoặc STOP trước khi tiếp tục.",
          "MEDICAL_DECISION_REQUIRED"
        );
      }

      const previousCheckpointMap = {
        CP01: null,
        CP02: "CP01",
        CP03: "CP02"
      };

      const previousCheckpoint =
        previousCheckpointMap[
          checkpointCode
        ];

      if (previousCheckpoint) {
        const [previousRows] =
          await connection.execute(
            `
              SELECT
                CheckpointID
              FROM Checkpoints
              WHERE RunID = ?
                AND CheckpointCode = ?
                AND ScanStatus = 'COMPLETED'
              LIMIT 1
            `,
            [
              athlete.RunID,
              previousCheckpoint
            ]
          );

        if (
          previousRows.length === 0
        ) {
          await connection.rollback();

          return sendError(
            res,
            409,
            `Thiếu ${previousCheckpoint}. Cần BTC kiểm tra trước khi ghi ${checkpointCode}.`,
            "PREVIOUS_CP_MISSING"
          );
        }
      }

      const [existingRows] =
        await connection.execute(
          `
            SELECT
              CheckpointID,
              RunID,
              CheckpointCode,
              ScanTime,
              ScanStatus,
              CreatedAt
            FROM Checkpoints
            WHERE RunID = ?
              AND CheckpointCode = ?
            LIMIT 1
          `,
          [
            athlete.RunID,
            checkpointCode
          ]
        );

      if (
        existingRows.length > 0
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            ...existingRows[0],
            alreadyRecorded: true
          },
          `${checkpointCode} đã được ghi nhận`
        );
      }
      const [insertResult] =
        await connection.execute(
          `
            INSERT INTO Checkpoints
            (
              RunID,
              CheckpointCode,
              ScanTime,
              ScanStatus
            )
            VALUES
            (
              ?,
              ?,
              NOW(3),
              'COMPLETED'
            )
          `,
          [
            athlete.RunID,
            checkpointCode
          ]
        );

      const [checkpointRows] =
        await connection.execute(
          `
            SELECT
              CheckpointID,
              RunID,
              CheckpointCode,
              ScanTime,
              ScanStatus,
              CreatedAt
            FROM Checkpoints
            WHERE CheckpointID = ?
            LIMIT 1
          `,
          [
            insertResult.insertId
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        checkpointRows[0],
        `${checkpointCode} thành công`,
        201
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Checkpoint rollback error:",
          rollbackError
        );
      }

      console.error(
        "Checkpoint error:",
        error
      );

      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return sendError(
          res,
          409,
          "Checkpoint đã được ghi nhận trước đó.",
          "CHECKPOINT_ALREADY_RECORDED"
        );
      }

      return sendError(
        res,
        500,
        "Không thể ghi checkpoint",
        "CHECKPOINT_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.get(
  "/api/medical/monitor",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT
            u.FullName,

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

            (
              SELECT c.CheckpointCode
              FROM Checkpoints c
              WHERE c.RunID = rr.RunID
                AND c.ScanStatus = 'COMPLETED'
              ORDER BY c.ScanTime DESC
              LIMIT 1
            ) AS LatestCheckpoint,

            (
              SELECT c.ScanTime
              FROM Checkpoints c
              WHERE c.RunID = rr.RunID
                AND c.ScanStatus = 'COMPLETED'
              ORDER BY c.ScanTime DESC
              LIMIT 1
            ) AS LatestCheckpointTime,

            (
              SELECT ma.AlertID
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestAlertID,

            (
              SELECT ma.AlertType
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestAlertType,

            (
              SELECT ma.AlertMessage
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestAlertMessage,

            (
              SELECT ma.AlertStatus
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestAlertStatus,

            (
              SELECT ma.MedicalDecision
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestMedicalDecision,

            (
              SELECT ma.CreatedAt
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
              ORDER BY ma.CreatedAt DESC
              LIMIT 1
            ) AS LatestAlertCreatedAt,

            (
              SELECT COUNT(*)
              FROM MedicalAlerts ma
              WHERE ma.RunID = rr.RunID
                AND ma.AlertStatus = 'PENDING'
            ) AS PendingMedicalAlerts

          FROM Registrations r

          INNER JOIN Users u
            ON u.UserID =
              r.UserID

          LEFT JOIN RaceRuns rr
            ON rr.RegistrationID =
              r.RegistrationID

          WHERE
            rr.RunID IS NOT NULL

          ORDER BY
            CASE rr.RunStatus
              WHEN 'RUNNING' THEN 1
              WHEN 'STOPPED' THEN 2
              WHEN 'FINISHED' THEN 3
              WHEN 'CHECKED_IN' THEN 4
              ELSE 5
            END,
            r.BibNumber
        `);

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Medical monitor error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tải dữ liệu theo dõi y tế",
        "MEDICAL_MONITOR_FAILED"
      );
    }
  }
);

app.post(
  "/api/medical/alert",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      const alertType =
        normalizeText(
          req.body?.alertType
        );

      const alertMessage =
        normalizeText(
          req.body?.alertMessage
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      if (!alertType) {
        return sendError(
          res,
          400,
          "Vui lòng nhập loại cảnh báo y tế",
          "ALERT_TYPE_REQUIRED"
        );
      }

      if (!alertMessage) {
        return sendError(
          res,
          400,
          "Vui lòng nhập nội dung cảnh báo y tế",
          "ALERT_MESSAGE_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const athlete =
        await getRaceRow(
          connection,
          bibNumber,
          true
        );

      if (!athlete) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      if (!athlete.RunID) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV chưa có lượt chạy",
          "RUN_NOT_FOUND"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Chỉ có thể tạo cảnh báo y tế khi VĐV đang RUNNING.",
          "MEDICAL_ALERT_INVALID_RUN_STATUS"
        );
      }

      const [pendingRows] =
        await connection.execute(
          `
            SELECT
              AlertID,
              AlertType,
              AlertMessage,
              AlertStatus,
              CreatedAt
            FROM MedicalAlerts
            WHERE RunID = ?
              AND AlertStatus = 'PENDING'
            ORDER BY CreatedAt DESC
            LIMIT 1
            FOR UPDATE
          `,
          [
            athlete.RunID
          ]
        );

      if (
        pendingRows.length > 0
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            ...pendingRows[0],
            alreadyPending: true
          },
          "VĐV đang có một cảnh báo y tế PENDING"
        );
      }

      const [insertResult] =
        await connection.execute(
          `
            INSERT INTO MedicalAlerts
            (
              RunID,
              AlertType,
              AlertMessage,
              AlertStatus,
              MedicalDecision,
              CreatedAt,
              ResolvedAt
            )
            VALUES
            (
              ?,
              ?,
              ?,
              'PENDING',
              NULL,
              NOW(3),
              NULL
            )
          `,
          [
            athlete.RunID,
            alertType,
            alertMessage
          ]
        );

      const [alertRows] =
        await connection.execute(
          `
            SELECT
              AlertID,
              RunID,
              AlertType,
              AlertMessage,
              AlertStatus,
              MedicalDecision,
              CreatedAt,
              ResolvedAt
            FROM MedicalAlerts
            WHERE AlertID = ?
            LIMIT 1
          `,
          [
            insertResult.insertId
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        alertRows[0],
        "Đã tạo cảnh báo y tế",
        201
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Medical alert rollback error:",
          rollbackError
        );
      }

      console.error(
        "Medical alert error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tạo cảnh báo y tế",
        "MEDICAL_ALERT_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);
app.get(
  "/api/medical/alerts",
  async (req, res) => {
    try {
      const status =
        String(
          req.query?.status || ""
        )
          .trim()
          .toUpperCase();

      let sqlText = `
        SELECT
          ma.AlertID,
          ma.RunID,
          ma.AlertType,
          ma.AlertMessage,
          ma.AlertStatus,
          ma.MedicalDecision,
          ma.CreatedAt,
          ma.ResolvedAt,

          r.BibNumber,
          r.Distance,
          r.HasMedicalCondition,
          r.MedicalCondition,
          r.MedicalNotes,

          rr.RunStatus,

          u.FullName

        FROM MedicalAlerts ma

        INNER JOIN RaceRuns rr
          ON rr.RunID =
            ma.RunID

        INNER JOIN Registrations r
          ON r.RegistrationID =
            rr.RegistrationID

        INNER JOIN Users u
          ON u.UserID =
            r.UserID
      `;

      const params = [];

      if (status) {
        sqlText += `
          WHERE ma.AlertStatus = ?
        `;

        params.push(status);
      }

      sqlText += `
        ORDER BY
          CASE ma.AlertStatus
            WHEN 'PENDING' THEN 1
            WHEN 'RESOLVED' THEN 2
            ELSE 3
          END,
          ma.CreatedAt DESC
      `;

      const [rows] =
        await pool.execute(
          sqlText,
          params
        );

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Get medical alerts error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tải cảnh báo y tế",
        "MEDICAL_ALERTS_FAILED"
      );
    }
  }
);

app.post(
  "/api/medical/decision",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const alertID =
        Number(
          req.body?.alertID
        );

      const decision =
        String(
          req.body?.decision || ""
        )
          .trim()
          .toUpperCase();

      const allowedDecisions = [
        "CONTINUE",
        "STOP"
      ];

      if (
        !isPositiveInteger(
          alertID
        )
      ) {
        return sendError(
          res,
          400,
          "AlertID không hợp lệ",
          "INVALID_ALERT_ID"
        );
      }

      if (
        !allowedDecisions.includes(
          decision
        )
      ) {
        return sendError(
          res,
          400,
          "MedicalDecision chỉ được là CONTINUE hoặc STOP",
          "INVALID_MEDICAL_DECISION"
        );
      }

      await connection.beginTransaction();


      const [alertRows] =
        await connection.execute(
          `
            SELECT
              ma.AlertID,
              ma.RunID,
              ma.AlertType,
              ma.AlertMessage,
              ma.AlertStatus,
              ma.MedicalDecision,
              ma.CreatedAt,
              ma.ResolvedAt,

              rr.RunStatus

            FROM MedicalAlerts ma

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                ma.RunID

            WHERE ma.AlertID = ?

            LIMIT 1
            FOR UPDATE
          `,
          [
            alertID
          ]
        );

      if (
        alertRows.length === 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy cảnh báo y tế",
          "MEDICAL_ALERT_NOT_FOUND"
        );
      }

      const alert =
        alertRows[0];

      if (
        alert.AlertStatus ===
        "RESOLVED"
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            ...alert,
            alreadyResolved: true
          },
          "Cảnh báo y tế đã được xử lý trước đó"
        );
      }

      if (
        alert.AlertStatus !==
        "PENDING"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          `Không thể xử lý cảnh báo ở trạng thái ${alert.AlertStatus}`,
          "MEDICAL_ALERT_INVALID_STATUS"
        );
      }

      await connection.execute(
        `
          UPDATE MedicalAlerts
          SET
            AlertStatus = 'RESOLVED',
            MedicalDecision = ?,
            ResolvedAt = NOW(3)
          WHERE AlertID = ?
        `,
        [
          decision,
          alertID
        ]
      );

      if (
        decision ===
        "CONTINUE"
      ) {
        if (
          alert.RunStatus ===
          "STOPPED"
        ) {
          await connection.rollback();

          return sendError(
            res,
            409,
            "Lượt chạy đã STOPPED nên không thể CONTINUE.",
            "RUN_ALREADY_STOPPED"
          );
        }

        if (
          alert.RunStatus ===
          "FINISHED"
        ) {
          await connection.rollback();

          return sendError(
            res,
            409,
            "Lượt chạy đã FINISHED.",
            "RUN_ALREADY_FINISHED"
          );
        }

        await connection.execute(
          `
            UPDATE RaceRuns
            SET RunStatus = 'RUNNING'
            WHERE RunID = ?
          `,
          [
            alert.RunID
          ]
        );
      }

      if (
        decision ===
        "STOP"
      ) {
        if (
          alert.RunStatus ===
          "FINISHED"
        ) {
          await connection.rollback();

          return sendError(
            res,
            409,
            "VĐV đã FINISH nên không thể STOP lượt chạy.",
            "RUN_ALREADY_FINISHED"
          );
        }

        await connection.execute(
          `
            UPDATE RaceRuns
            SET RunStatus = 'STOPPED'
            WHERE RunID = ?
          `,
          [
            alert.RunID
          ]
        );
      }

      const [updatedRows] =
        await connection.execute(
          `
            SELECT
              ma.AlertID,
              ma.RunID,
              ma.AlertType,
              ma.AlertMessage,
              ma.AlertStatus,
              ma.MedicalDecision,
              ma.CreatedAt,
              ma.ResolvedAt,

              rr.RunStatus

            FROM MedicalAlerts ma

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                ma.RunID

            WHERE ma.AlertID = ?

            LIMIT 1
          `,
          [
            alertID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        updatedRows[0],
        decision === "CONTINUE"
          ? "Medical Team cho phép VĐV tiếp tục"
          : "Medical Team đã dừng lượt chạy"
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Medical decision rollback error:",
          rollbackError
        );
      }

      console.error(
        "Medical decision error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể xử lý quyết định y tế",
        "MEDICAL_DECISION_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.post(
  "/api/race/finish",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const athlete =
        await getRaceRow(
          connection,
          bibNumber,
          true
        );

      if (!athlete) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      if (!athlete.RunID) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Không tìm thấy lượt chạy",
          "RUN_NOT_FOUND"
        );
      }

      if (
        athlete.RunStatus ===
        "STOPPED"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV đã bị Medical Team STOP nên không thể FINISH.",
          "RUN_STOPPED"
        );
      }
      if (
        athlete.RunStatus ===
        "FINISHED"
      ) {
        const [existingResults] =
          await connection.execute(
            `
              SELECT
                ResultID,
                RunID,
                TotalTimeSeconds,
                ResultStatus,
                ApprovedBy,
                ApprovedAt,
                CreatedAt
              FROM Results
              WHERE RunID = ?
              LIMIT 1
            `,
            [
              athlete.RunID
            ]
          );

        await connection.commit();

        return sendSuccess(
          res,
          {
            bibNumber:
              athlete.BibNumber,

            FullName:
              athlete.FullName,

            RunID:
              athlete.RunID,

            RunStatus:
              "FINISHED",

            StartTime:
              athlete.StartTime,

            FinishTime:
              athlete.FinishTime,

            result:
              existingResults[0] ||
              null,

            alreadyFinished:
              true
          },
          "VĐV đã FINISH trước đó"
        );
      }

      if (
        athlete.RunStatus !==
        "RUNNING"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV không ở trạng thái RUNNING.",
          "RUN_NOT_RUNNING"
        );
      }

      if (!athlete.StartTime) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV chưa START.",
          "RUN_NOT_STARTED"
        );
      }

      const [pendingMedicalRows] =
        await connection.execute(
          `
            SELECT
              AlertID,
              AlertType,
              AlertMessage,
              AlertStatus,
              CreatedAt
            FROM MedicalAlerts
            WHERE RunID = ?
              AND AlertStatus = 'PENDING'
            ORDER BY CreatedAt DESC
            LIMIT 1
          `,
          [
            athlete.RunID
          ]
        );

      if (
        pendingMedicalRows.length > 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "VĐV đang có cảnh báo y tế PENDING. Cần Medical Team quyết định CONTINUE hoặc STOP trước khi FINISH.",
          "MEDICAL_DECISION_REQUIRED"
        );
      }

      const [checkpointRows] =
        await connection.execute(
          `
            SELECT
              CheckpointCode
            FROM Checkpoints
            WHERE RunID = ?
              AND ScanStatus = 'COMPLETED'
              AND CheckpointCode IN
              (
                'CP01',
                'CP02',
                'CP03'
              )
            ORDER BY ScanTime
          `,
          [
            athlete.RunID
          ]
        );

      const completedCheckpoints =
        new Set(
          checkpointRows.map(
            (row) =>
              row.CheckpointCode
          )
        );

      const requiredCheckpoints = [
        "CP01",
        "CP02",
        "CP03"
      ];

      const missingCheckpoints =
        requiredCheckpoints.filter(
          (checkpointCode) =>
            !completedCheckpoints.has(
              checkpointCode
            )
        );

      if (
        missingCheckpoints.length > 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          `Chưa hoàn thành checkpoint: ${missingCheckpoints.join(
            ", "
          )}`,
          "CHECKPOINTS_INCOMPLETE"
        );
      }
      await connection.execute(
        `
          UPDATE RaceRuns
          SET
            FinishTime = NOW(3),
            RunStatus = 'FINISHED'
          WHERE RunID = ?
        `,
        [
          athlete.RunID
        ]
      );
      const [timeRows] =
        await connection.execute(
          `
            SELECT
              RunID,
              StartTime,
              FinishTime,
              RunStatus,

              TIMESTAMPDIFF(
                SECOND,
                StartTime,
                FinishTime
              ) AS TotalTimeSeconds

            FROM RaceRuns

            WHERE RunID = ?

            LIMIT 1
          `,
          [
            athlete.RunID
          ]
        );

      const finishedRun =
        timeRows[0];

      if (!finishedRun) {
        await connection.rollback();

        return sendError(
          res,
          500,
          "Không thể lấy dữ liệu lượt chạy sau FINISH.",
          "FINISH_RUN_NOT_FOUND"
        );
      }

      const totalTimeSeconds =
        Number(
          finishedRun.TotalTimeSeconds
        );

      if (
        !Number.isFinite(
          totalTimeSeconds
        ) ||
        totalTimeSeconds < 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          500,
          "Thời gian hoàn thành không hợp lệ.",
          "INVALID_TOTAL_TIME"
        );
      }
      await connection.execute(
        `
          INSERT INTO Results
          (
            RunID,
            TotalTimeSeconds,
            ResultStatus,
            ApprovedBy,
            ApprovedAt,
            CreatedAt
          )
          VALUES
          (
            ?,
            ?,
            'PENDING',
            NULL,
            NULL,
            NOW(3)
          )

          ON DUPLICATE KEY UPDATE
            TotalTimeSeconds =
              VALUES(TotalTimeSeconds)
        `,
        [
          athlete.RunID,
          totalTimeSeconds
        ]
      );

      const [resultRows] =
        await connection.execute(
          `
            SELECT
              ResultID,
              RunID,
              TotalTimeSeconds,
              ResultStatus,
              ApprovedBy,
              ApprovedAt,
              CreatedAt
            FROM Results
            WHERE RunID = ?
            LIMIT 1
          `,
          [
            athlete.RunID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        {
          bibNumber:
            athlete.BibNumber,

          FullName:
            athlete.FullName,

          Distance:
            athlete.Distance,

          RunID:
            athlete.RunID,

          StartTime:
            finishedRun.StartTime,

          FinishTime:
            finishedRun.FinishTime,

          RunStatus:
            finishedRun.RunStatus,

          ResultID:
            resultRows[0]?.ResultID ||
            null,

          TotalTimeSeconds:
            resultRows[0]
              ?.TotalTimeSeconds ??
            totalTimeSeconds,

          ResultStatus:
            resultRows[0]
              ?.ResultStatus ||
            "PENDING"
        },
        "FINISH thành công. Kết quả đang chờ BTC duyệt."
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Finish rollback error:",
          rollbackError
        );
      }

      console.error(
        "Finish error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể FINISH",
        "FINISH_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.get(
  "/api/results",
  async (req, res) => {
    try {
      const status =
        String(
          req.query?.status || ""
        )
          .trim()
          .toUpperCase();

      const allowedStatuses = [
        "PENDING",
        "OFFICIAL"
      ];

      if (
        status &&
        !allowedStatuses.includes(
          status
        )
      ) {
        return sendError(
          res,
          400,
          "ResultStatus không hợp lệ.",
          "INVALID_RESULT_STATUS"
        );
      }

      let sqlText = `
        SELECT
          rs.ResultID,
          rs.RunID,
          rs.TotalTimeSeconds,
          rs.ResultStatus,
          rs.ApprovedBy,
          rs.ApprovedAt,
          rs.CreatedAt,

          rr.StartTime,
          rr.FinishTime,
          rr.RunStatus,

          r.RegistrationID,
          r.BibNumber,
          r.Distance,

          u.FullName

        FROM Results rs

        INNER JOIN RaceRuns rr
          ON rr.RunID =
            rs.RunID

        INNER JOIN Registrations r
          ON r.RegistrationID =
            rr.RegistrationID

        INNER JOIN Users u
          ON u.UserID =
            r.UserID
      `;

      const params = [];

      if (status) {
        sqlText += `
          WHERE rs.ResultStatus = ?
        `;

        params.push(status);
      }

      sqlText += `
        ORDER BY
          CASE rs.ResultStatus
            WHEN 'PENDING' THEN 1
            WHEN 'OFFICIAL' THEN 2
            ELSE 3
          END,
          rs.CreatedAt DESC
      `;

      const [rows] =
        await pool.execute(
          sqlText,
          params
        );

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Get results error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tải danh sách kết quả",
        "RESULTS_FAILED"
      );
    }
  }
);
app.post(
  "/api/results/approve",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const resultID =
        Number(
          req.body?.resultID
        );

      const approvedBy =
        normalizeText(
          req.body?.approvedBy
        ) ||
        "BTC";

      if (
        !isPositiveInteger(
          resultID
        )
      ) {
        return sendError(
          res,
          400,
          "ResultID không hợp lệ",
          "INVALID_RESULT_ID"
        );
      }

      await connection.beginTransaction();

      const [resultRows] =
        await connection.execute(
          `
            SELECT
              rs.ResultID,
              rs.RunID,
              rs.TotalTimeSeconds,
              rs.ResultStatus,
              rs.ApprovedBy,
              rs.ApprovedAt,
              rs.CreatedAt,

              rr.RunStatus,

              r.BibNumber,
              r.Distance,

              u.FullName

            FROM Results rs

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                rs.RunID

            INNER JOIN Registrations r
              ON r.RegistrationID =
                rr.RegistrationID

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE rs.ResultID = ?

            LIMIT 1
            FOR UPDATE
          `,
          [
            resultID
          ]
        );

      if (
        resultRows.length === 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy kết quả",
          "RESULT_NOT_FOUND"
        );
      }

      const result =
        resultRows[0];
      if (
        result.RunStatus !==
        "FINISHED"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Chỉ có thể duyệt kết quả khi lượt chạy đã FINISHED.",
          "RUN_NOT_FINISHED"
        );
      }
      if (
        result.ResultStatus ===
        "OFFICIAL"
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            ...result,
            alreadyOfficial: true
          },
          "Kết quả đã OFFICIAL trước đó"
        );
      }
      if (
        result.ResultStatus !==
        "PENDING"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          `Không thể duyệt kết quả ở trạng thái ${result.ResultStatus}.`,
          "RESULT_INVALID_STATUS"
        );
      }
      await connection.execute(
        `
          UPDATE Results
          SET
            ResultStatus =
              'OFFICIAL',
            ApprovedBy = ?,
            ApprovedAt = NOW(3)
          WHERE ResultID = ?
        `,
        [
          approvedBy,
          resultID
        ]
      );

      const [updatedRows] =
        await connection.execute(
          `
            SELECT
              rs.ResultID,
              rs.RunID,
              rs.TotalTimeSeconds,
              rs.ResultStatus,
              rs.ApprovedBy,
              rs.ApprovedAt,
              rs.CreatedAt,

              rr.StartTime,
              rr.FinishTime,
              rr.RunStatus,

              r.BibNumber,
              r.Distance,

              u.FullName

            FROM Results rs

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                rs.RunID

            INNER JOIN Registrations r
              ON r.RegistrationID =
                rr.RegistrationID

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE rs.ResultID = ?

            LIMIT 1
          `,
          [
            resultID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        updatedRows[0],
        "BTC đã duyệt kết quả. Kết quả hiện là OFFICIAL."
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Approve result rollback error:",
          rollbackError
        );
      }

      console.error(
        "Approve result error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể duyệt kết quả",
        "RESULT_APPROVE_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);
// =====================================================
// PUBLIC RESULT LOOKUP BY BIB
//
// OFFICIAL:
// - Public result is available normally.
//
// PENDING after complaint RETURN_PENDING:
// - Keep showing previous timing for reference.
// - Tell athlete BTC is reviewing the complaint.
// - Include complaint history.
//
// Normal PENDING before first approval:
// - Result is not public yet.
// =====================================================
app.get(
  "/api/results/bib/:bibNumber",
  async (req, res) => {
    try {
      const bibNumber =
        normalizeBib(
          req.params.bibNumber
        );

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      // =================================================
      // CHECK BIB EXISTS
      // =================================================
      const [athleteRows] =
        await pool.execute(
          `
            SELECT
              r.RegistrationID,
              r.BibNumber,
              r.Distance,
              r.RegistrationStatus,

              u.FullName

            FROM Registrations r

            INNER JOIN Users u
              ON u.UserID = r.UserID

            WHERE r.BibNumber = ?

            LIMIT 1
          `,
          [bibNumber]
        );

      if (
        athleteRows.length === 0
      ) {
        return sendError(
          res,
          404,
          "Không tìm thấy BIB",
          "BIB_NOT_FOUND"
        );
      }

      // =================================================
      // GET RESULT
      //
      // IMPORTANT:
      // Do NOT restrict to OFFICIAL here.
      // We need PENDING result too when BTC is reviewing
      // a complaint.
      // =================================================
      const [resultRows] =
        await pool.execute(
          `
            SELECT
              rs.ResultID,
              rs.RunID,
              rs.TotalTimeSeconds,
              rs.ResultStatus,
              rs.ApprovedBy,
              rs.ApprovedAt,

              rr.StartTime,
              rr.FinishTime,
              rr.RunStatus,

              r.RegistrationStatus,
              r.BibNumber,
              r.Distance,

              u.FullName,
              u.DateOfBirth,
              u.Phone,
              u.Email,
              u.Gender,

              (
                SELECT cp.ScanTime
                FROM Checkpoints cp
                WHERE cp.RunID = rr.RunID
                  AND cp.CheckpointCode = 'CP01'
                  AND cp.ScanStatus = 'COMPLETED'
                ORDER BY cp.ScanTime DESC
                LIMIT 1
              ) AS CP01Time,

              (
                SELECT cp.ScanTime
                FROM Checkpoints cp
                WHERE cp.RunID = rr.RunID
                  AND cp.CheckpointCode = 'CP02'
                  AND cp.ScanStatus = 'COMPLETED'
                ORDER BY cp.ScanTime DESC
                LIMIT 1
              ) AS CP02Time,

              (
                SELECT cp.ScanTime
                FROM Checkpoints cp
                WHERE cp.RunID = rr.RunID
                  AND cp.CheckpointCode = 'CP03'
                  AND cp.ScanStatus = 'COMPLETED'
                ORDER BY cp.ScanTime DESC
                LIMIT 1
              ) AS CP03Time,

              (
                SELECT COUNT(*) + 1
                FROM Results rs2

                INNER JOIN RaceRuns rr2
                  ON rr2.RunID =
                    rs2.RunID

                INNER JOIN Registrations r2
                  ON r2.RegistrationID =
                    rr2.RegistrationID

                WHERE rs2.ResultStatus =
                    'OFFICIAL'
                  AND r2.Distance =
                    r.Distance
                  AND rs2.TotalTimeSeconds <
                    rs.TotalTimeSeconds
              ) AS RankPosition,

              (
                SELECT COUNT(*)
                FROM Results rs3

                INNER JOIN RaceRuns rr3
                  ON rr3.RunID =
                    rs3.RunID

                INNER JOIN Registrations r3
                  ON r3.RegistrationID =
                    rr3.RegistrationID

                WHERE rs3.ResultStatus =
                    'OFFICIAL'
                  AND r3.Distance =
                    r.Distance
              ) AS RankedAthleteCount

            FROM Results rs

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                rs.RunID

            INNER JOIN Registrations r
              ON r.RegistrationID =
                rr.RegistrationID

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE r.BibNumber = ?

            LIMIT 1
          `,
          [bibNumber]
        );

      // Athlete exists but there is no result yet.
      if (
        resultRows.length === 0
      ) {
        return sendError(
          res,
          404,
          "VĐV chưa có kết quả.",
          "RESULT_NOT_FOUND"
        );
      }

      const result =
        resultRows[0];

      // =================================================
      // GET COMPLAINT HISTORY
      // =================================================
      const [complaintRows] =
        await pool.execute(
          `
            SELECT
              ComplaintID,
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus,
              Resolution,
              ResolutionNote,
              CreatedAt,
              ResolvedAt

            FROM Complaints

            WHERE ResultID = ?

            ORDER BY CreatedAt DESC
          `,
          [result.ResultID]
        );

      // =================================================
      // DETERMINE WHETHER PENDING IS CAUSED BY COMPLAINT
      // =================================================
      const hasReturnPendingComplaint =
        complaintRows.some(
          (complaint) =>
            complaint.Resolution ===
            "RETURN_PENDING"
        );
      // NORMAL PENDING

      if (
        result.ResultStatus ===
          "PENDING" &&
        !hasReturnPendingComplaint
      ) {
        return sendError(
          res,
          404,
          "Kết quả chưa được BTC công bố.",
          "RESULT_NOT_OFFICIAL"
        );
      }

      // =================================================
      // MASK PRIVATE PUBLIC INFORMATION
      // =================================================
      const maskPhone = (
        phone
      ) => {
        if (!phone) {
          return null;
        }

        const value =
          String(phone);

        if (
          value.length <= 6
        ) {
          return "***";
        }

        return (
          value.slice(0, 3) +
          "****" +
          value.slice(-3)
        );
      };

      const maskEmail = (
        email
      ) => {
        if (!email) {
          return null;
        }

        const value =
          String(email);

        const atIndex =
          value.indexOf("@");

        if (
          atIndex <= 0
        ) {
          return "***";
        }

        const username =
          value.slice(
            0,
            atIndex
          );

        const domain =
          value.slice(
            atIndex
          );

        const visible =
          username.length <= 2
            ? username.slice(
                0,
                1
              )
            : username.slice(
                0,
                3
              );

        return (
          visible +
          "***" +
          domain
        );
      };

      // =================================================
      // COMMON PUBLIC DATA
      // =================================================
      const publicResult = {
        ResultID:
          result.ResultID,

        RunID:
          result.RunID,

        FullName:
          result.FullName,

        BibNumber:
          result.BibNumber,

        Distance:
          result.Distance,

        Gender:
          result.Gender,

        DateOfBirth:
          result.DateOfBirth,

        Phone:
          maskPhone(
            result.Phone
          ),

        Email:
          maskEmail(
            result.Email
          ),

        RegistrationStatus:
          result.RegistrationStatus,

        RunStatus:
          result.RunStatus,

        ResultStatus:
          result.ResultStatus,

        ApprovedAt:
          result.ApprovedAt,

        StartTime:
          result.StartTime,

        CP01Time:
          result.CP01Time,

        CP02Time:
          result.CP02Time,

        CP03Time:
          result.CP03Time,

        FinishTime:
          result.FinishTime,

        TotalTimeSeconds:
          result.TotalTimeSeconds,

        complaints:
          complaintRows
      };


      // COMPLAINT REVIEW
  
      if (
        result.ResultStatus ===
          "PENDING" &&
        hasReturnPendingComplaint
      ) {
        return sendSuccess(
          res,
          {
            ...publicResult,

            available: false,

            reason:
              "UNDER_REVIEW",

            RankPosition:
              null,

            RankedAthleteCount:
              null
          },
          "BTC đang kiểm tra lại lời khiếu nại của bạn."
        );
      }

      // =================================================
      // OFFICIAL RESULT
      // =================================================
      if (
        result.ResultStatus ===
        "OFFICIAL"
      ) {
        return sendSuccess(
          res,
          {
            ...publicResult,

            available: true,

            reason:
              "OFFICIAL",

            RankPosition:
              Number(
                result.RankPosition
              ),

            RankedAthleteCount:
              Number(
                result
                  .RankedAthleteCount
              )
          },
          "Tra cứu kết quả thành công"
        );
      }

      // =================================================
      // FALLBACK
      // =================================================
      return sendError(
        res,
        404,
        "Kết quả chưa thể công bố.",
        "RESULT_NOT_AVAILABLE"
      );
    } catch (error) {
      console.error(
        "Public result lookup error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tra cứu kết quả",
        "PUBLIC_RESULT_LOOKUP_FAILED"
      );
    }
  }
);

  

app.post(
  "/api/complaints",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const resultID =
        Number(
          req.body?.resultID
        );

      const bibNumber =
        normalizeBib(
          req.body?.bibNumber
        );

      const complaintType =
        normalizeText(
          req.body?.complaintType
        );

      const complaintMessage =
        normalizeText(
          req.body?.complaintMessage
        );

      const contactInfo =
        normalizeText(
          req.body?.contactInfo
        );

  
      if (
        !isPositiveInteger(
          resultID
        )
      ) {
        return sendError(
          res,
          400,
          "ResultID không hợp lệ",
          "INVALID_RESULT_ID"
        );
      }

      if (!bibNumber) {
        return sendError(
          res,
          400,
          "Vui lòng nhập BIB",
          "BIB_REQUIRED"
        );
      }

      if (!complaintType) {
        return sendError(
          res,
          400,
          "Vui lòng nhập loại khiếu nại",
          "COMPLAINT_TYPE_REQUIRED"
        );
      }

      if (!complaintMessage) {
        return sendError(
          res,
          400,
          "Vui lòng nhập nội dung khiếu nại",
          "COMPLAINT_MESSAGE_REQUIRED"
        );
      }

      await connection.beginTransaction();

      const [resultRows] =
        await connection.execute(
          `
            SELECT
              rs.ResultID,
              rs.RunID,
              rs.ResultStatus,

              r.BibNumber,

              u.FullName

            FROM Results rs

            INNER JOIN RaceRuns rr
              ON rr.RunID =
                rs.RunID

            INNER JOIN Registrations r
              ON r.RegistrationID =
                rr.RegistrationID

            INNER JOIN Users u
              ON u.UserID =
                r.UserID

            WHERE rs.ResultID = ?

            LIMIT 1
            FOR UPDATE
          `,
          [
            resultID
          ]
        );

      if (
        resultRows.length === 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy kết quả",
          "RESULT_NOT_FOUND"
        );
      }

      const result =
        resultRows[0];

      if (
        normalizeBib(
          result.BibNumber
        ) !== bibNumber
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "BIB không thuộc kết quả này.",
          "RESULT_BIB_MISMATCH"
        );
      }

      if (
        result.ResultStatus !==
        "OFFICIAL"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          "Chỉ có thể gửi khiếu nại sau khi kết quả đã OFFICIAL.",
          "RESULT_NOT_OFFICIAL"
        );
      }
      const [insertResult] =
        await connection.execute(
          `
            INSERT INTO Complaints
            (
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus,
              Resolution,
              ResolutionNote,
              CreatedAt,
              ResolvedAt
            )
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              ?,
              'OPEN',
              NULL,
              NULL,
              NOW(3),
              NULL
            )
          `,
          [
            resultID,
            bibNumber,
            complaintType,
            complaintMessage,
            contactInfo
          ]
        );

      const [complaintRows] =
        await connection.execute(
          `
            SELECT
              ComplaintID,
              ResultID,
              BibNumber,
              ComplaintType,
              ComplaintMessage,
              ContactInfo,
              ComplaintStatus,
              Resolution,
              ResolutionNote,
              CreatedAt,
              ResolvedAt
            FROM Complaints
            WHERE ComplaintID = ?
            LIMIT 1
          `,
          [
            insertResult.insertId
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        complaintRows[0],
        "Đã gửi khiếu nại",
        201
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Create complaint rollback error:",
          rollbackError
        );
      }

      console.error(
        "Create complaint error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể gửi khiếu nại",
        "COMPLAINT_CREATE_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.get(
  "/api/complaints",
  async (req, res) => {
    try {
      const status =
        String(
          req.query?.status || ""
        )
          .trim()
          .toUpperCase();

      const allowedStatuses = [
        "OPEN",
        "RESOLVED"
      ];

      if (
        status &&
        !allowedStatuses.includes(
          status
        )
      ) {
        return sendError(
          res,
          400,
          "ComplaintStatus không hợp lệ.",
          "INVALID_COMPLAINT_STATUS"
        );
      }

      let sqlText = `
        SELECT
          c.ComplaintID,
          c.ResultID,
          c.BibNumber,
          c.ComplaintType,
          c.ComplaintMessage,
          c.ContactInfo,
          c.ComplaintStatus,
          c.Resolution,
          c.ResolutionNote,
          c.CreatedAt,
          c.ResolvedAt,

          rs.TotalTimeSeconds,
          rs.ResultStatus,

          rr.RunID,
rr.StartTime,

(
  SELECT cp.ScanTime
  FROM Checkpoints cp
  WHERE cp.RunID = rr.RunID
    AND cp.CheckpointCode = 'CP01'
    AND cp.ScanStatus = 'COMPLETED'
  ORDER BY cp.ScanTime DESC
  LIMIT 1
) AS CP01Time,

(
  SELECT cp.ScanTime
  FROM Checkpoints cp
  WHERE cp.RunID = rr.RunID
    AND cp.CheckpointCode = 'CP02'
    AND cp.ScanStatus = 'COMPLETED'
  ORDER BY cp.ScanTime DESC
  LIMIT 1
) AS CP02Time,

(
  SELECT cp.ScanTime
  FROM Checkpoints cp
  WHERE cp.RunID = rr.RunID
    AND cp.CheckpointCode = 'CP03'
    AND cp.ScanStatus = 'COMPLETED'
  ORDER BY cp.ScanTime DESC
  LIMIT 1
) AS CP03Time,

rr.FinishTime,
rr.RunStatus,

r.Distance,

u.FullName

        FROM Complaints c

        INNER JOIN Results rs
          ON rs.ResultID =
            c.ResultID

        INNER JOIN RaceRuns rr
          ON rr.RunID =
            rs.RunID

        INNER JOIN Registrations r
          ON r.RegistrationID =
            rr.RegistrationID

        INNER JOIN Users u
          ON u.UserID =
            r.UserID
      `;

      const params = [];

      if (status) {
        sqlText += `
          WHERE c.ComplaintStatus = ?
        `;

        params.push(status);
      }

      sqlText += `
        ORDER BY
          CASE c.ComplaintStatus
            WHEN 'OPEN' THEN 1
            WHEN 'RESOLVED' THEN 2
            ELSE 3
          END,
          c.CreatedAt DESC
      `;

      const [rows] =
        await pool.execute(
          sqlText,
          params
        );

      return sendSuccess(
        res,
        rows
      );
    } catch (error) {
      console.error(
        "Get complaints error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể tải danh sách khiếu nại",
        "COMPLAINTS_FAILED"
      );
    }
  }
);

app.post(
  "/api/complaints/resolve",
  async (req, res) => {
    const connection =
      await pool.getConnection();

    try {
      const complaintID =
        Number(
          req.body?.complaintID
        );

      const resolution =
        String(
          req.body?.resolution || ""
        )
          .trim()
          .toUpperCase();

      const resolutionNote =
        normalizeText(
          req.body?.resolutionNote
        );

      const allowedResolutions = [
        "KEEP_RESULT",
        "RETURN_PENDING"
      ];

      // ===============================================
      // VALIDATE
      // ===============================================
      if (
        !isPositiveInteger(
          complaintID
        )
      ) {
        return sendError(
          res,
          400,
          "ComplaintID không hợp lệ",
          "INVALID_COMPLAINT_ID"
        );
      }

      if (
        !allowedResolutions.includes(
          resolution
        )
      ) {
        return sendError(
          res,
          400,
          "Resolution chỉ được là KEEP_RESULT hoặc RETURN_PENDING.",
          "INVALID_COMPLAINT_RESOLUTION"
        );
      }

      await connection.beginTransaction();

      // ===============================================
      // LOCK COMPLAINT + RESULT
      // ===============================================
      const [complaintRows] =
        await connection.execute(
          `
            SELECT
              c.ComplaintID,
              c.ResultID,
              c.BibNumber,
              c.ComplaintType,
              c.ComplaintMessage,
              c.ContactInfo,
              c.ComplaintStatus,
              c.Resolution,
              c.ResolutionNote,
              c.CreatedAt,
              c.ResolvedAt,

              rs.ResultStatus,
              rs.TotalTimeSeconds

            FROM Complaints c

            INNER JOIN Results rs
              ON rs.ResultID =
                c.ResultID

            WHERE c.ComplaintID = ?

            LIMIT 1
            FOR UPDATE
          `,
          [
            complaintID
          ]
        );

      if (
        complaintRows.length === 0
      ) {
        await connection.rollback();

        return sendError(
          res,
          404,
          "Không tìm thấy khiếu nại",
          "COMPLAINT_NOT_FOUND"
        );
      }

      const complaint =
        complaintRows[0];

      // ===============================================
      // ALREADY RESOLVED
      // ===============================================
      if (
        complaint.ComplaintStatus ===
        "RESOLVED"
      ) {
        await connection.commit();

        return sendSuccess(
          res,
          {
            ...complaint,
            alreadyResolved: true
          },
          "Khiếu nại đã được xử lý trước đó"
        );
      }

      if (
        complaint.ComplaintStatus !==
        "OPEN"
      ) {
        await connection.rollback();

        return sendError(
          res,
          409,
          `Không thể xử lý khiếu nại ở trạng thái ${complaint.ComplaintStatus}.`,
          "COMPLAINT_INVALID_STATUS"
        );
      }

 
      if (
        resolution ===
        "KEEP_RESULT"
      ) {
     
      }

      if (
        resolution ===
        "RETURN_PENDING"
      ) {
        await connection.execute(
          `
            UPDATE Results
            SET
              ResultStatus = 'PENDING',
              ApprovedBy = NULL,
              ApprovedAt = NULL
            WHERE ResultID = ?
          `,
          [
            complaint.ResultID
          ]
        );
      }

      await connection.execute(
        `
          UPDATE Complaints
          SET
            ComplaintStatus =
              'RESOLVED',
            Resolution = ?,
            ResolutionNote = ?,
            ResolvedAt = NOW(3)
          WHERE ComplaintID = ?
        `,
        [
          resolution,
          resolutionNote,
          complaintID
        ]
      );

      const [updatedRows] =
        await connection.execute(
          `
            SELECT
              c.ComplaintID,
              c.ResultID,
              c.BibNumber,
              c.ComplaintType,
              c.ComplaintMessage,
              c.ContactInfo,
              c.ComplaintStatus,
              c.Resolution,
              c.ResolutionNote,
              c.CreatedAt,
              c.ResolvedAt,

              rs.TotalTimeSeconds,
              rs.ResultStatus,
              rs.ApprovedBy,
              rs.ApprovedAt

            FROM Complaints c

            INNER JOIN Results rs
              ON rs.ResultID =
                c.ResultID

            WHERE c.ComplaintID = ?

            LIMIT 1
          `,
          [
            complaintID
          ]
        );

      await connection.commit();

      return sendSuccess(
        res,
        updatedRows[0],
        resolution ===
          "KEEP_RESULT"
          ? "Đã xử lý khiếu nại và giữ nguyên kết quả."
          : "Đã xử lý khiếu nại và đưa kết quả về PENDING."
      );
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Resolve complaint rollback error:",
          rollbackError
        );
      }

      console.error(
        "Resolve complaint error:",
        error
      );

      return sendError(
        res,
        500,
        "Không thể xử lý khiếu nại",
        "COMPLAINT_RESOLVE_FAILED"
      );
    } finally {
      connection.release();
    }
  }
);

app.use(
  (req, res) => {
    return sendError(
      res,
      404,
      `Không tìm thấy API: ${req.method} ${req.originalUrl}`,
      "API_NOT_FOUND"
    );
  }
);

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(
      PORT,
      () => {
        console.log(
          `🚀 Race Timing Pro API http://localhost:${PORT}`
        );

        console.log(
          "✅ Database engine: MySQL"
        );
      }
    );
  } catch (error) {
    console.error(
      "❌ Không thể khởi động Race Timing Pro API:"
    );

    console.error(
      error
    );

    process.exit(1);
  }
}

startServer();

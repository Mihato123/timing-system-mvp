USE RaceManagement;
GO

-- =====================================================
-- RESULT REVIEWS
-- =====================================================
IF OBJECT_ID('dbo.ResultReviews', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ResultReviews
    (
        ReviewID INT IDENTITY(1,1) PRIMARY KEY,
        ResultID INT NOT NULL,
        ReviewSource VARCHAR(20) NOT NULL DEFAULT 'BTC',
        ReviewReason NVARCHAR(100) NOT NULL,
        ReviewNotes NVARCHAR(1000) NULL,
        ReviewStatus VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        Resolution VARCHAR(30) NULL,
        ResolutionNotes NVARCHAR(1000) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        ResolvedAt DATETIME2 NULL,

        CONSTRAINT FK_ResultReviews_Results
            FOREIGN KEY (ResultID)
            REFERENCES dbo.Results(ResultID)
    );
END;
GO

-- =====================================================
-- RESULT REVIEWS - SAFE MIGRATION FOR OLDER DEMO SCHEMA
-- Earlier demo versions used ReviewNote / ResolutionAction and did not have
-- ReviewSource / ReviewNotes / Resolution / ResolutionNotes.
-- Keep existing data and add the columns required by the current API.
-- =====================================================
IF COL_LENGTH('dbo.ResultReviews', 'ReviewSource') IS NULL
BEGIN
    ALTER TABLE dbo.ResultReviews
    ADD ReviewSource VARCHAR(20) NULL;

    UPDATE dbo.ResultReviews
    SET ReviewSource = 'BTC'
    WHERE ReviewSource IS NULL;

    ALTER TABLE dbo.ResultReviews
    ALTER COLUMN ReviewSource VARCHAR(20) NOT NULL;

    ALTER TABLE dbo.ResultReviews
    ADD CONSTRAINT DF_ResultReviews_ReviewSource
        DEFAULT 'BTC' FOR ReviewSource;
END;
GO

IF COL_LENGTH('dbo.ResultReviews', 'ReviewNotes') IS NULL
BEGIN
    ALTER TABLE dbo.ResultReviews
    ADD ReviewNotes NVARCHAR(1000) NULL;
END;
GO

IF COL_LENGTH('dbo.ResultReviews', 'ReviewNote') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        UPDATE dbo.ResultReviews
        SET ReviewNotes = COALESCE(ReviewNotes, ReviewNote)
        WHERE ReviewNote IS NOT NULL;
    ';
END;
GO

IF COL_LENGTH('dbo.ResultReviews', 'Resolution') IS NULL
BEGIN
    ALTER TABLE dbo.ResultReviews
    ADD Resolution VARCHAR(30) NULL;
END;
GO

IF COL_LENGTH('dbo.ResultReviews', 'ResolutionAction') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        UPDATE dbo.ResultReviews
        SET Resolution = COALESCE(Resolution, ResolutionAction)
        WHERE ResolutionAction IS NOT NULL;
    ';
END;
GO

IF COL_LENGTH('dbo.ResultReviews', 'ResolutionNotes') IS NULL
BEGIN
    ALTER TABLE dbo.ResultReviews
    ADD ResolutionNotes NVARCHAR(1000) NULL;
END;
GO

-- =====================================================
-- RACE EXCEPTIONS
-- =====================================================
IF OBJECT_ID('dbo.RaceExceptions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RaceExceptions
    (
        ExceptionID INT IDENTITY(1,1) PRIMARY KEY,
        RunID INT NOT NULL,
        CheckpointCode VARCHAR(10) NULL,
        ExceptionType VARCHAR(50) NOT NULL,
        ExceptionNote NVARCHAR(1000) NULL,
        ExceptionStatus VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        Resolution VARCHAR(30) NULL,
        ResolutionNote NVARCHAR(1000) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        ResolvedAt DATETIME2 NULL,

        CONSTRAINT FK_RaceExceptions_RaceRuns
            FOREIGN KEY (RunID)
            REFERENCES dbo.RaceRuns(RunID)
    );
END;
GO

-- =====================================================
-- ATHLETE COMPLAINTS
-- =====================================================
IF OBJECT_ID('dbo.Complaints', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Complaints
    (
        ComplaintID INT IDENTITY(1,1) PRIMARY KEY,
        ResultID INT NOT NULL,
        BibNumber VARCHAR(30) NOT NULL,
        ComplaintType VARCHAR(50) NOT NULL,
        ComplaintMessage NVARCHAR(1500) NOT NULL,
        ContactInfo NVARCHAR(200) NULL,
        ComplaintStatus VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        ResolvedAt DATETIME2 NULL,

        CONSTRAINT FK_Complaints_Results
            FOREIGN KEY (ResultID)
            REFERENCES dbo.Results(ResultID)
    );
END;
GO



-- =====================================================
-- COMPLAINT RESOLUTION - SAFE MIGRATION
-- =====================================================
IF COL_LENGTH('dbo.Complaints', 'Resolution') IS NULL
BEGIN
    ALTER TABLE dbo.Complaints
    ADD Resolution VARCHAR(30) NULL;
END;
GO

IF COL_LENGTH('dbo.Complaints', 'ResolutionNote') IS NULL
BEGIN
    ALTER TABLE dbo.Complaints
    ADD ResolutionNote NVARCHAR(1000) NULL;
END;
GO

-- =====================================================
-- ADMIN USERS
-- =====================================================
IF OBJECT_ID('dbo.AdminUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdminUsers
    (
        AdminUserID INT IDENTITY(1,1) PRIMARY KEY,
        Username VARCHAR(50) UNIQUE NOT NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        DisplayName NVARCHAR(100) NOT NULL,
        Role VARCHAR(20) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

-- =====================================================
-- AUDIT LOGS
-- =====================================================
IF OBJECT_ID('dbo.AuditLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs
    (
        AuditID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Action VARCHAR(50) NOT NULL,
        EntityType VARCHAR(50) NOT NULL,
        EntityID INT NULL,
        Detail NVARCHAR(1000) NULL,
        Actor NVARCHAR(100) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

-- =====================================================
-- LOCAL DEMO ACCOUNTS
-- Update existing rows as well so a previously-created demo database
-- cannot keep an outdated password and cause login failures.
-- =====================================================
IF EXISTS (SELECT 1 FROM dbo.AdminUsers WHERE Username = 'admin')
BEGIN
    UPDATE dbo.AdminUsers
    SET
        PasswordHash = 'admin123',
        DisplayName = N'Race Administrator',
        Role = 'ADMIN',
        IsActive = 1
    WHERE Username = 'admin';
END
ELSE
BEGIN
    INSERT INTO dbo.AdminUsers
    (
        Username,
        PasswordHash,
        DisplayName,
        Role,
        IsActive
    )
    VALUES
    (
        'admin',
        'admin123',
        N'Race Administrator',
        'ADMIN',
        1
    );
END;
GO

IF EXISTS (SELECT 1 FROM dbo.AdminUsers WHERE Username = 'btc')
BEGIN
    UPDATE dbo.AdminUsers
    SET
        PasswordHash = 'btc123',
        DisplayName = N'Ban Tổ Chức',
        Role = 'BTC',
        IsActive = 1
    WHERE Username = 'btc';
END
ELSE
BEGIN
    INSERT INTO dbo.AdminUsers
    (
        Username,
        PasswordHash,
        DisplayName,
        Role,
        IsActive
    )
    VALUES
    (
        'btc',
        'btc123',
        N'Ban Tổ Chức',
        'BTC',
        1
    );
END;
GO

IF EXISTS (SELECT 1 FROM dbo.AdminUsers WHERE Username = 'tnv')
BEGIN
    UPDATE dbo.AdminUsers
    SET
        PasswordHash = 'tnv123',
        DisplayName = N'Tình Nguyện Viên',
        Role = 'TNV',
        IsActive = 1
    WHERE Username = 'tnv';
END
ELSE
BEGIN
    INSERT INTO dbo.AdminUsers
    (
        Username,
        PasswordHash,
        DisplayName,
        Role,
        IsActive
    )
    VALUES
    (
        'tnv',
        'tnv123',
        N'Tình Nguyện Viên',
        'TNV',
        1
    );
END;
GO

IF EXISTS (SELECT 1 FROM dbo.AdminUsers WHERE Username = 'medical')
BEGIN
    UPDATE dbo.AdminUsers
    SET
        PasswordHash = 'medical123',
        DisplayName = N'Medical Team',
        Role = 'MEDICAL',
        IsActive = 1
    WHERE Username = 'medical';
END
ELSE
BEGIN
    INSERT INTO dbo.AdminUsers
    (
        Username,
        PasswordHash,
        DisplayName,
        Role,
        IsActive
    )
    VALUES
    (
        'medical',
        'medical123',
        N'Medical Team',
        'MEDICAL',
        1
    );
END;
GO

PRINT N'✅ Race Timing Pro upgrade complete';
GO
\n\n-- =====================================================\n-- REPAIR LEGACY DEMO UNICODE DATA\n-- Only touches the known BIB004 demo row when old data contains '?'.\n-- =====================================================\nIF EXISTS (SELECT 1 FROM dbo.Registrations WHERE BibNumber = 'BIB004')\nBEGIN\n    UPDATE dbo.Registrations\n    SET\n        MedicalCondition = CASE\n            WHEN MedicalCondition LIKE '%?%' THEN N'Hen suyễn'\n            ELSE MedicalCondition\n        END,\n        MedicalNotes = CASE\n            WHEN MedicalNotes LIKE '%?%' THEN N'Cần theo dõi khi vận động mạnh'\n            ELSE MedicalNotes\n        END\n    WHERE BibNumber = 'BIB004';\n\n    UPDATE u\n    SET FullName = N'Nguyễn Minh Test Updated'\n    FROM dbo.Users u\n    INNER JOIN dbo.Registrations r ON r.UserID = u.UserID\n    WHERE r.BibNumber = 'BIB004'\n      AND u.FullName LIKE '%?%';\nEND;\nGO\n
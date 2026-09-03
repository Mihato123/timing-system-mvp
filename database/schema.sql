-- =========================================================
-- RACE TIMING PRO
-- DATABASE INITIALIZATION
-- Database: MySQL 8.x
-- Purpose:
--   - Create the core database structure for Race Timing Pro
--   - Follow PRD / core business flow
--   - Keep exactly 7 main tables
-- =========================================================

CREATE DATABASE IF NOT EXISTS race_management
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE race_management;


-- =========================================================
-- 1. USERS
-- Thông tin cá nhân của vận động viên
-- =========================================================
CREATE TABLE IF NOT EXISTS Users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,

    FullName VARCHAR(150) NOT NULL,
    DateOfBirth DATE NULL,
    Phone VARCHAR(20) NOT NULL UNIQUE,
    Email VARCHAR(150) NULL,
    Gender VARCHAR(20) NULL,

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. REGISTRATIONS
-- Thông tin đăng ký giải, BIB, cự ly và khai báo sức khỏe
--
-- RegistrationStatus:
--   REGISTERED
--   CHECKED_IN
-- =========================================================
CREATE TABLE IF NOT EXISTS Registrations (
    RegistrationID INT AUTO_INCREMENT PRIMARY KEY,

    UserID INT NOT NULL,

    Distance VARCHAR(20) NOT NULL,
    BibNumber VARCHAR(30) NOT NULL UNIQUE,

    HasMedicalCondition BOOLEAN NOT NULL DEFAULT FALSE,
    MedicalCondition VARCHAR(500) NULL,
    MedicalNotes VARCHAR(1000) NULL,

    -- VĐV bắt buộc xác nhận thỏa thuận Waiver khi đăng ký
    WaiverAccepted BOOLEAN NOT NULL DEFAULT FALSE,
    WaiverAcceptedAt DATETIME(3) NULL,

    RegistrationStatus VARCHAR(30)
        NOT NULL DEFAULT 'REGISTERED',

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_Registrations_Users
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =========================================================
-- 3. RACE RUNS
-- Lượt chạy của vận động viên
--
-- RunStatus:
--   NOT_STARTED
--   CHECKED_IN
--   RUNNING
--   FINISHED
--   STOPPED
-- =========================================================
CREATE TABLE IF NOT EXISTS RaceRuns (
    RunID INT AUTO_INCREMENT PRIMARY KEY,

    RegistrationID INT NOT NULL UNIQUE,

    StartTime DATETIME(3) NULL,
    FinishTime DATETIME(3) NULL,

    RunStatus VARCHAR(30)
        NOT NULL DEFAULT 'NOT_STARTED',

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_RaceRuns_Registrations
        FOREIGN KEY (RegistrationID)
        REFERENCES Registrations(RegistrationID)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =========================================================
-- 4. CHECKPOINTS
-- Ghi nhận thời gian vận động viên đi qua checkpoint
--
-- CheckpointCode:
--   CP01
--   CP02
--   CP03
--
-- ScanStatus:
--   COMPLETED
-- =========================================================
CREATE TABLE IF NOT EXISTS Checkpoints (
    CheckpointID INT AUTO_INCREMENT PRIMARY KEY,

    RunID INT NOT NULL,

    CheckpointCode VARCHAR(20) NOT NULL,
    ScanTime DATETIME(3) NOT NULL,

    ScanStatus VARCHAR(30)
        NOT NULL DEFAULT 'COMPLETED',

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_Checkpoints_RaceRuns
        FOREIGN KEY (RunID)
        REFERENCES RaceRuns(RunID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT UQ_Run_Checkpoint
        UNIQUE (RunID, CheckpointCode)
);


-- =========================================================
-- 5. MEDICAL ALERTS
-- Sự cố y tế thực tế phát sinh trong quá trình chạy
--
-- Lưu ý:
--   - Bệnh nền được khai báo ở Registrations
--   - MedicalAlerts chỉ lưu sự cố thực tế
--
-- AlertStatus:
--   PENDING
--   RESOLVED
--
-- MedicalDecision:
--   CONTINUE
--   STOP
-- =========================================================
CREATE TABLE IF NOT EXISTS MedicalAlerts (
    AlertID INT AUTO_INCREMENT PRIMARY KEY,

    RunID INT NOT NULL,

    AlertType VARCHAR(50) NOT NULL,
    AlertMessage VARCHAR(1000) NULL,

    AlertStatus VARCHAR(30)
        NOT NULL DEFAULT 'PENDING',

    MedicalDecision VARCHAR(30) NULL,

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ResolvedAt DATETIME NULL,

    CONSTRAINT FK_MedicalAlerts_RaceRuns
        FOREIGN KEY (RunID)
        REFERENCES RaceRuns(RunID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 6. RESULTS
-- Luồng:
--   FINISH
--   -> PENDING
--   -> BTC APPROVE
--   -> OFFICIAL
--
-- ResultStatus:
--   PENDING
--   OFFICIAL
-- =========================================================
CREATE TABLE IF NOT EXISTS Results (
    ResultID INT AUTO_INCREMENT PRIMARY KEY,

    RunID INT NOT NULL UNIQUE,

    TotalTimeSeconds INT NOT NULL,

    ResultStatus VARCHAR(30)
        NOT NULL DEFAULT 'PENDING',

    ApprovedBy VARCHAR(100) NULL,
    ApprovedAt DATETIME NULL,

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_Results_RaceRuns
        FOREIGN KEY (RunID)
        REFERENCES RaceRuns(RunID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 7. COMPLAINTS
-- Khiếu nại kết quả từ vận động viên
--
-- ComplaintStatus:
--   OPEN
--   RESOLVED
--
-- Resolution:
--   KEEP_RESULT
--   RETURN_PENDING
-- =========================================================
CREATE TABLE IF NOT EXISTS Complaints (
    ComplaintID INT AUTO_INCREMENT PRIMARY KEY,

    ResultID INT NOT NULL,

    BibNumber VARCHAR(30) NOT NULL,

    ComplaintType VARCHAR(50) NOT NULL,
    ComplaintMessage VARCHAR(1500) NOT NULL,
    ContactInfo VARCHAR(200) NULL,

    ComplaintStatus VARCHAR(30)
        NOT NULL DEFAULT 'OPEN',

    Resolution VARCHAR(30) NULL,
    ResolutionNote VARCHAR(1000) NULL,

    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ResolvedAt DATETIME NULL,

    CONSTRAINT FK_Complaints_Results
        FOREIGN KEY (ResultID)
        REFERENCES Results(ResultID)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS IDX_Registrations_Status
    ON Registrations(RegistrationStatus);

CREATE INDEX IF NOT EXISTS IDX_RaceRuns_Status
    ON RaceRuns(RunStatus);

CREATE INDEX IF NOT EXISTS IDX_MedicalAlerts_Status
    ON MedicalAlerts(AlertStatus);

CREATE INDEX IF NOT EXISTS IDX_Results_Status
    ON Results(ResultStatus);

CREATE INDEX IF NOT EXISTS IDX_Complaints_Status
    ON Complaints(ComplaintStatus);


-- =========================================================
-- VERIFY
-- =========================================================

SHOW TABLES;
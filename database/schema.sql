-- =========================================================
-- RACE TIMING PRO
-- DATABASE INITIALIZATION
-- Database: MySQL 8.x
-- =========================================================

CREATE DATABASE IF NOT EXISTS race_management
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE race_management;


-- =========================================================
-- 1. USERS
-- Thông tin cá nhân vận động viên
-- =========================================================
CREATE TABLE Users (
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
-- Đăng ký giải, BIB và khai báo sức khỏe
-- =========================================================
CREATE TABLE Registrations (
    RegistrationID INT AUTO_INCREMENT PRIMARY KEY,

    UserID INT NOT NULL,

    Distance VARCHAR(20) NOT NULL,
    BibNumber VARCHAR(30) NOT NULL UNIQUE,

    HasMedicalCondition BOOLEAN NOT NULL DEFAULT FALSE,
    MedicalCondition VARCHAR(500) NULL,
    MedicalNotes VARCHAR(1000) NULL,

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
-- =========================================================
CREATE TABLE RaceRuns (
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
-- Thời gian VĐV đi qua CP01 / CP02 / CP03
-- ScanTime được backend truyền vào khi ghi nhận checkpoint
-- =========================================================
CREATE TABLE Checkpoints (
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
-- Bệnh nền khai báo ban đầu nằm ở Registrations
-- =========================================================
CREATE TABLE MedicalAlerts (
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
-- FINISH -> PENDING -> BTC APPROVE -> OFFICIAL
-- =========================================================
CREATE TABLE Results (
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
-- =========================================================
CREATE TABLE Complaints (
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

CREATE INDEX IDX_Registrations_Status
    ON Registrations(RegistrationStatus);

CREATE INDEX IDX_RaceRuns_Status
    ON RaceRuns(RunStatus);

CREATE INDEX IDX_MedicalAlerts_Status
    ON MedicalAlerts(AlertStatus);

CREATE INDEX IDX_Results_Status
    ON Results(ResultStatus);

CREATE INDEX IDX_Complaints_Status
    ON Complaints(ComplaintStatus);


-- =========================================================
-- VERIFY
-- =========================================================

SHOW TABLES;
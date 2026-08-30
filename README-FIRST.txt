RACE TIMING PRO - READY PACKAGE

This ZIP is intentionally FLAT. After extracting, the folder should contain:
  backend\
  database\
  frontend\
  RUN-BACKEND.bat
  RUN-FRONTEND.bat

IMPORTANT - SQL SERVER FIRST RUN:
1. Open SQL Server Management Studio.
2. Select database RaceManagement.
3. Open database\upgrade.sql and Execute it once.
4. Refresh Tables. AdminUsers, AuditLogs, Complaints, RaceExceptions, ResultReviews should exist.

START BACKEND:
- Double-click RUN-BACKEND.bat
OR PowerShell from this folder:
  cd backend
  npm install
  npm run dev

START FRONTEND:
- Double-click RUN-FRONTEND.bat
OR open a second PowerShell from this folder:
  cd frontend
  npm install
  npm run dev

Expected backend:
  http://localhost:3000
Expected frontend:
  Vite will show the Local URL, normally http://localhost:5173

Do NOT cd into race-timing-pro-full again. There is no extra nested project folder in this package.

V3 UPDATE
- Check-in tab has CHECK-IN TẤT CẢ for all remaining REGISTERED athletes.
- Complaint OPEN status is clickable and shows START/CP01/CP02/CP03/FINISH/total time.
- Complaint decisions: KEEP RESULT closes complaint; discrepancy sends complaint to REVIEW.
- Public registration navigation no longer exposes the BTC login link. Admin remains available at /admin.
- Browser prompt dialogs were replaced with in-app professional modals for Medical, Exception and Result Review.
- Run database/upgrade.sql once after updating because Complaints now includes Resolution and ResolutionNote.


V4 FIXES
- Backend tự kiểm tra/bổ sung cột schema cho Complaints và ResultReviews khi khởi động.
- Khiếu nại: GIỮ NGUYÊN và CHUYỂN REVIEW hoạt động với database từ các bản cũ.
- Timeline khiếu nại có fallback sang lần chạy gần nhất của BIB nếu liên kết cũ thiếu timestamp.
- Sửa dữ liệu Unicode legacy của demo BIB004 (tên + bệnh nền + lưu ý).

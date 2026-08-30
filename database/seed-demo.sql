USE RaceManagement;
GO
-- Giữ dữ liệu hiện có. File này chỉ đảm bảo tài khoản demo tồn tại.
SELECT Username,DisplayName,Role,IsActive FROM AdminUsers ORDER BY AdminUserID;
GO

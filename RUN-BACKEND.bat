@echo off
cd /d "%~dp0backend"
if not exist node_modules (
  echo Installing backend dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
echo Starting Race Timing Pro backend...
call npm run dev
pause

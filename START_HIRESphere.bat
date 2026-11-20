@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo        HireSphere - Local Startup
echo ==========================================
echo.
if not exist package.json (
  echo ERROR: package.json was not found.
  echo Open this batch file from the HireSphere_Final project folder.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js LTS, reopen this window and try again.
  pause
  exit /b 1
)
if not exist .env (
  echo ERROR: .env was not found.
  echo Copy .env.example to .env and fill in DB_PASSWORD, JWT_SECRET and RESUME_ENCRYPTION_KEY.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto failed
)
echo Checking MySQL connection and database objects...
call npm run check:db
if errorlevel 1 goto failed
echo.
echo Database check passed. Starting HireSphere...
call npm run dev
goto end
:failed
echo.
echo Startup stopped. Read the error above, correct the setup, and run this file again.
pause
:end
endlocal

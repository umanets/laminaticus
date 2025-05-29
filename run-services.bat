@echo off
REM Switch console to UTF-8 code page for proper Unicode display
chcp 65001 >nul

REM Change working directory to the script's location
cd /d "%~dp0"

echo Starting Laminaticus Runner...
REM Launch the Node.js runner that manages all services
"%~dp0node32\node.exe" "%~dp0laminaticus-runner\index.js"

echo Runner exited. All services have been shut down.
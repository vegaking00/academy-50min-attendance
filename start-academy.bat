@echo off
cd /d "%~dp0"
if not exist "node_modules" call npm install
if not exist "dist" call npm run build
node server.js
pause

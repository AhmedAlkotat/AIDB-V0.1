@echo off
title AIDP v0.1 - Development Server

cd /d "%~dp0"

echo Starting AIDP v0.1...

start "" "http://localhost:5173"

npm run dev

pause

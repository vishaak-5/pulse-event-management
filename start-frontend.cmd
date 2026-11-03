@echo off
rem Starts the React dev server on http://localhost:5173 (proxies /api to :8080)
cd /d "%~dp0frontend"
if not exist node_modules call npm install
call npm run dev

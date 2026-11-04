@echo off
rem Starts the Express API on http://localhost:8080 (with a local MongoDB if MONGODB_URI is not set)
cd /d "%~dp0server"
if not exist node_modules call npm install
rem First run: create server\.env with a random JWT key (the file is git-ignored).
if not exist .env node -e "require('fs').writeFileSync('.env','JWT_SECRET='+require('crypto').randomBytes(48).toString('base64')+'\n')"
call npm start

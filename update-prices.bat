@echo off
cd /d "%~dp0"
node scripts/collect.mjs
if errorlevel 1 goto end
node scripts/build.mjs
:end
pause

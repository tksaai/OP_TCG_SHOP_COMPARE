@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4173 in your browser.
echo Automatic price collection runs on GitHub Actions. This is a local viewer.
node scripts/server.mjs
pause

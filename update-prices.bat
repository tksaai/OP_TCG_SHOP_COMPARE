@echo off
cd /d "%~dp0"
echo Requesting GitHub Actions price collection and deployment...
gh workflow run collect.yml --repo tksaai/OP_TCG_SHOP_COMPARE
if errorlevel 1 echo Open https://github.com/tksaai/OP_TCG_SHOP_COMPARE/actions/workflows/collect.yml and select Run workflow.
pause

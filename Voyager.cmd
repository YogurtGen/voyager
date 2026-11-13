@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="--windowed" (
  powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\launch-project.ps1" -Windowed
) else (
  powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\launch-project.ps1"
)

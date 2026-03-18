@echo off
title KS LIVE BROADCASTING - LAUNCHER
color 0A
echo.
echo  =====================================================
echo   KS LIVE BROADCASTING  ^|  Powered by ngrok
echo  =====================================================
echo.

cd /d "C:\Users\WW\Desktop\Scoreboard overlay"

:: ── Detect local WiFi IP address ─────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "LOCAL_IP=%%a"
)
:: Trim leading space
set "LOCAL_IP=%LOCAL_IP: =%"

:: ── Step 1: Kill any leftover processes ──────────────────────
echo  [1/5] Cleaning up old processes...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

:: ── Step 2: Start Vite dev server (minimised) ────────────────
echo  [2/5] Starting Vite dev server on port 5173...
start /min "KS-Vite" cmd /c "npm run dev"
echo         Waiting for server to start...
timeout /t 6 /nobreak >nul

:: ── Step 3: Start ngrok tunnel (visible window) ──────────────
echo  [3/5] Opening ngrok tunnel...
start "KS-ngrok ^| Copy your public URL from this window" cmd /k "ngrok http 5173"
timeout /t 4 /nobreak >nul

:: ── Step 4: Open Landing Page in browser ─────────────────────
echo  [4/5] Opening Landing Page in browser...
start http://localhost:5173

:: ── Step 5: Open Overlay Scoreboard in browser ───────────────
echo  [5/5] Opening Overlay Scoreboard in browser...
timeout /t 2 /nobreak >nul
start http://localhost:5173/overlay

:: ── Display info ─────────────────────────────────────────────
echo.
color 0E
echo  =====================================================
echo   SERVER IS LIVE!  Do NOT close this window.
echo  =====================================================
echo.
echo   PC (localhost):
echo   Landing Page ^|  http://localhost:5173
echo   Admin Panel  ^|  http://localhost:5173/admin
echo   Team Manager ^|  http://localhost:5173/teams
echo   OBS Overlay  ^|  http://localhost:5173/overlay
echo.
echo  -----------------------------------------------------
echo   PHONE / TABLET (same WiFi):
echo   Landing Page ^|  http://%LOCAL_IP%:5173
echo   Admin Panel  ^|  http://%LOCAL_IP%:5173/admin
echo   Team Manager ^|  http://%LOCAL_IP%:5173/teams
echo   OBS Overlay  ^|  http://%LOCAL_IP%:5173/overlay
echo  -----------------------------------------------------
echo.
echo   INTERNET (ngrok public URL):
echo   ^>^> Check the "KS-ngrok" window that just opened
echo   ^>^> Look for the line: "Forwarding  https://xxxx.ngrok-free.app"
echo   ^>^> Your public Admin URL = https://xxxx.ngrok-free.app/admin
echo.
echo   IMPORTANT - Add ngrok domain to Firebase:
echo   Firebase Console ^> Authentication ^> Settings
echo   ^> Authorized Domains ^> Add Domain ^> paste ngrok URL
echo  =====================================================
echo.
pause
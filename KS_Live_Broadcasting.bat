@echo off
title KS LIVE BROADCASTING - LAUNCHER
color 0A
echo.
echo  =====================================================
echo   KS LIVE BROADCASTING  ^|  Powered by ngrok
echo  =====================================================
echo.

cd /d "C:\Users\WW\Desktop\Scoreboard overlay"

:: ── Step 1: Kill any leftover processes ──────────────────────
echo  [1/4] Cleaning up old processes...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

:: ── Step 2: Start Vite dev server (minimised) ────────────────
echo  [2/4] Starting Vite dev server on port 5173...
start /min "KS-Vite" cmd /c "npm run dev"
timeout /t 5 /nobreak >nul

:: ── Step 3: Start ngrok tunnel (visible window) ──────────────
echo  [3/4] Opening ngrok tunnel...
start "KS-ngrok ^| Copy your public URL from this window" cmd /k "ngrok http 5173"
timeout /t 4 /nobreak >nul

:: ── Step 4: Open browser ─────────────────────────────────────
echo  [4/4] Opening Admin Panel in browser...
start http://localhost:5173/admin

:: ── Display info ─────────────────────────────────────────────
echo.
color 0E
echo  =====================================================
echo   SERVER IS LIVE!  Do NOT close this window.
echo  =====================================================
echo.
echo   LOCAL (same WiFi):
echo   Admin Panel  ^|  http://localhost:5173/admin
echo   Team Manager ^|  http://localhost:5173/teams
echo   OBS View     ^|  http://localhost:5173/
echo.
echo   INTERNET (ngrok public URL):
echo   >> Check the "KS-ngrok" window that just opened
echo   >> Look for the line: "Forwarding  https://xxxx.ngrok-free.app"
echo   >> Your public Admin URL = https://xxxx.ngrok-free.app/admin
echo.
echo   IMPORTANT - Add ngrok domain to Firebase:
echo   Firebase Console ^> Authentication ^> Settings
echo   ^> Authorized Domains ^> Add Domain ^> paste ngrok URL
echo  =====================================================
echo.
pause
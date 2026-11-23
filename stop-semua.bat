@echo off
title HKBP Stopper

echo Menghentikan proses Node (Vite), Uvicorn, dan Go...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM uvicorn.exe /T >nul 2>&1
taskkill /F /IM go.exe /T >nul 2>&1

echo Membersihkan port 8081 dan 8000 jika masih dipakai...
powershell -Command "8081,8000 | ForEach-Object { $p = Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { Stop-Process -Id $p -Force; Write-Host \"Port $_ dibersihkan.\" } }"

echo Menutup jendela launcher HKBP...
taskkill /F /FI "WINDOWTITLE eq HKBP - Backend Go*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HKBP - Analytics Python*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HKBP - Frontend Vite*" >nul 2>&1

echo Selesai. Semua layanan proyek HKBP sudah dihentikan.
pause
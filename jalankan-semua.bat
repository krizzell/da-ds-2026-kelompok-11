@echo off
title HKBP Launcher
set "ROOT=D:\SEMESTER 5\PROYEK DASI_DALIS\HKBP baru\HKBP"
set "KEY=hkbp-dev-secret-key-2026"

echo Menyalakan Backend Go (:8081)...
start "HKBP - Backend Go" powershell -NoExit -Command "cd '%ROOT%\app\backend'; $env:INTERNAL_KEY='%KEY%'; go run cmd/main.go"

echo Menyalakan Analytics Python (:8000)...
start "HKBP - Analytics Python" powershell -NoExit -Command "cd '%ROOT%\app\analytics'; .\.venv\Scripts\Activate.ps1; $env:INTERNAL_KEY='%KEY%'; uvicorn app.main:app --reload --port 8000"

echo Menyalakan Frontend Vite (:5173)...
start "HKBP - Frontend Vite" powershell -NoExit -Command "cd '%ROOT%\app\frontend'; npm run dev"

echo Semua jendela layanan HKBP telah dibuka.
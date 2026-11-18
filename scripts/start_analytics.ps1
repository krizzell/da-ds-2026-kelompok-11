$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location (Join-Path $root 'app\analytics')
if (-not (Test-Path '.venv\Scripts\python.exe')) { throw 'Belum ada .venv. Lihat PANDUAN_MENJALANKAN_WINDOWS.md.' }
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

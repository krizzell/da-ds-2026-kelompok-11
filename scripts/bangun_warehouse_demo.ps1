# Jalankan dari lokasi mana pun. Tidak mengubah database warehouse.db produksi.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root 'app\analytics\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Venv tidak ada: $python. Buat venv dan install requirements terlebih dahulu." }
$data = Join-Path $root 'data\synthetic\wilayah_setoran_demo.json'
if (-not (Test-Path $data)) {
    & $python (Join-Path $PSScriptRoot 'buat_data_simulasi_setoran.py')
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat data demo' }
}
Push-Location (Join-Path $root 'app\analytics')
try {
    & $python -m etl.build_warehouse --source json --json-path $data --db (Join-Path $root 'data\processed\warehouse_demo.db') --report (Join-Path $root 'docs\DATA_QUALITY_REPORT_DEMO.md')
    if ($LASTEXITCODE -ne 0) { throw 'ETL demo gagal' }
} finally { Pop-Location }
Write-Host 'Selesai: warehouse DEMO, bukan warehouse.db utama.' -ForegroundColor Green

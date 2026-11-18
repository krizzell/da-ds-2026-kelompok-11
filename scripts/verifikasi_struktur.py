"""Pemeriksaan offline struktur dan kesesuaian artefak HKBP tanpa mengubah data."""
from __future__ import annotations
import json
import sqlite3
from pathlib import Path
R = Path(__file__).resolve().parents[1]
required = [
    'README.md', 'data/README.md', 'etl/run_etl.py', 'warehouse/schema.sql',
    'notebooks/01_eda.ipynb', 'models/model.joblib', 'models/metrics.json',
    'app/frontend/package.json', 'app/backend/go.mod', 'app/backend/wilayah.json',
    'app/analytics/app/main.py', 'docs/DATA_QUALITY_REPORT.md',
    'paper/README.md', 'reports/weekly/README.md',
    'data/processed/warehouse.db',
]
missing = [p for p in required if not (R / p).is_file()]
if missing:
    raise SystemExit('File wajib berikut tidak ditemukan: ' + ', '.join(missing))
print('OK: semua struktur dan artefak dasar ditemukan')
con = sqlite3.connect(f"file:{(R/'data/processed/warehouse.db').as_posix()}?mode=ro", uri=True)
try:
    integrity = con.execute('PRAGMA integrity_check').fetchone()[0]
    fk = con.execute('PRAGMA foreign_key_check').fetchall()
    tables = [x[0] for x in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print('Warehouse integrity_check:', integrity)
    print('Jumlah tabel dimensi:', sum(t.startswith('dim_') for t in tables))
    print('Jumlah tabel fakta:', sum(t.startswith('fact_') for t in tables))
    print('Foreign key violations:', len(fk))
    if integrity != 'ok' or fk: raise SystemExit('Warehouse gagal pemeriksaan integritas')
finally: con.close()
print('OK: pemeriksaan offline berhasil')

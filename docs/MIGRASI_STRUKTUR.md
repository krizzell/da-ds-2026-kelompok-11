# Catatan migrasi HKBP — 16 November 2026

## Asal

- `frontend(1).zip` -> `app/frontend/` (kecuali `dist/` hasil build)
- `backend(1).zip` -> `app/backend/` (kecuali `.env` rahasia)
- `analytics(1).zip` -> `app/analytics/` untuk kode layanan; beberapa
  artefak akademik dipindahkan ke akar repositori.
- `tmp(1).zip` berisi `tmp/main.exe` hasil build Go, **tidak dimasukkan ke GitHub**.

## Artefak yang dipindah

| Awal | Tujuan |
|---|---|
| analytics/notebooks/* | notebooks/* |
| analytics/models/* | models/* |
| analytics/docs/MODEL_CARD.md | models/MODEL_CARD.md |
| analytics/docs/EDA_TEMUAN.md | docs/EDA_TEMUAN.md |
| analytics/docs/DATA_QUALITY_REPORT.md | docs/DATA_QUALITY_REPORT.md |
| analytics/etl/schema.sql | warehouse/schema.sql |
| analytics/data/warehouse.db | data/processed/warehouse.db |
| analytics/etl/build_warehouse.py | app/analytics/etl/build_warehouse.py (implementasi tetap) |

## File source yang hanya diubah path/komentar

1. `app/analytics/app/config.py` — PROJECT_ROOT, path warehouse/model.
2. `app/analytics/etl/build_warehouse.py` — path DDL, database, dan laporan kualitas.
3. `app/analytics/etl/eda.py` — path laporan EDA.
4. `app/analytics/app/ml/train.py` — path model card.
5. `app/analytics/app/routers/dw.py` — path laporan ETL.
6. `app/analytics/start.sh` — workdir dan path artefak baru.
7. `app/analytics/README.md` — lokasi contoh folder Windows.
8. `notebooks/01_eda.ipynb` — import paket ETL dari folder layanan analytics.

Sisa source yang disertakan dipindah apa adanya. Lihat `docs/MANIFEST_MIGRASI.csv`
untuk SHA-256 sebelum/sesudah dan pencatatan file yang tidak dikirim.

## Keputusan penting

- Python API masih mengimpor `etl` dari `app/analytics/etl`.
  `etl/run_etl.py` di akar repo menjadi skrip eksekusi untuk memenuhi struktur dosen.
- Model `joblib` dan snapshot SQLite tidak dilatih/dibangun ulang selama migrasi.
- JSON `app/backend/wilayah.json` dipertahankan di backend karena Go membacanya
  dari working directory. Dibuat pula `data/sample/wilayah_sample.json` sebagai subset.
- Sumber JSON dan snapshot DW berbeda; jangan menjalankan ulang ETL ke database
  utama tanpa memahami dampaknya.
- `.env` asli, binary `tmp/main.exe`, `dist/`, dan cache tidak disertakan karena
  keamanan dan praktik repo bersih. Ini **bukan** penghapusan source code.

## Verifikasi

Jalankan `python scripts/verifikasi_struktur.py` dan pengujian di panduan Windows.
Laporan testing yang benar-benar dilakukan pada paket ini akan dicatat pada `docs/HASIL_VERIFIKASI.md`.

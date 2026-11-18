# ETL HKBP

`etl/run_etl.py` adalah pintu masuk ETL dari akar repositori.
Implementasi ETL ASLI berada di `app/analytics/etl/build_warehouse.py` supaya
import Python FastAPI, test, dan fungsi refresh tetap dapat digunakan.

```powershell
# Jalankan dari root HKBP, dengan .venv app/analytics aktif
python etl/run_etl.py --source json --json-path app/backend/wilayah.json
# Jika MongoDB sudah berisi dokumen koleksi HKBP dan ingin memakai sumber yang sama:
python etl/run_etl.py --source mongo
```

**PENTING:** ETL membangun ulang `data/processed/warehouse.db` dan akan MENGGANTI
snapshot warehouse semula. Jika datamu bersumber dari MongoDB yang lebih lengkap,
jangan jalankan ETL `--source json` pada warehouse utama tanpa backup dahulu.
Gunakan `--db` dan `--report` ke path sementara untuk eksperimen.

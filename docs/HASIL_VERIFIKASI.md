# Hasil verifikasi migrasi struktur HKBP

Tanggal: 16 November 2026

## Pemeriksaan yang benar-benar berhasil

- Semua folder dan file inti pada `scripts/verifikasi_struktur.py` ditemukan.
- SQLite bawaan: `PRAGMA integrity_check = ok`, 0 foreign-key violations, 8 tabel dimensi, 5 tabel fakta.
- Sintaks 54 file Python pada paket dapat diparse tanpa error (sebelum penambahan dokumentasi).
- JSON `app/backend/wilayah.json` valid.
- Skrip root `etl/run_etl.py` berhasil membangun **database UJI TERPISAH** dari JSON backend. Hasil 30 Huria, 984 fakta kehadiran; warehouse utama tidak ditimpa dan masih mempunyai 56 Huria.
- Konfigurasi Python dari `app/analytics` mengarah ke `data/processed/warehouse.db` dan `models/` di akar.
- Notebook EDA berhasil mengimpor `etl.eda` dengan path barunya: 7.940 sesi, 18.341 pemasukan, dan 56 Huria.
- Pembacaan warehouse, `metrics.json`, model `joblib`, opsi ML, dan prediksi input manual berhasil.
- Smoke test API FastAPI: `/health` -> 200; endpoint `/dw/ringkasan` tanpa kunci -> 401; `/dw/ringkasan`, `/ml/metrics`, `/ml/opsi`, dan `/ml/predict` dengan kunci uji -> 200.
- Delapan test unit terpilih (`test_warehouse_etl.py`, `test_auth.py`) lulus.
- Seluruh berkas `.js` non-JSX yang diperiksa oleh `node --check` lolos sintaks.

## Pengujian yang belum bisa diklaim lulus sepenuhnya

- Python environment lokal penguji **tidak memiliki `pymongo` / `bson`**. Uji unit FastAPI di atas memanfaatkan **stub import sementara hanya di proses pengujian**. Stub tidak disertakan pada ZIP; **ini bukan bukti integrasi nyata MongoDB**.
- Satu kali percobaan menjalankan sebagian besar `pytest` dengan stub menghasilkan 26 test terlewati sebelum **batas waktu pengujian**; hasil keseluruhan tidak dapat diklaim lulus.
- Test `test_seed_lengkap.py` tidak terambil karena `bson` dari `pymongo` tidak terpasang pada lingkungan penguji.
- Go di lingkungan penguji adalah 1.23.2; `go.mod` sumber asli meminta 1.25.6. Oleh karena itu `go test ./...` dan build Go tidak dapat diklaim lulus. **Kode Go aslinya tidak diubah.**
- `npm ci`, `npm run test`, dan `npm run build` penuh tidak dapat dieksekusi di lingkungan offline yang tidak memiliki `node_modules` maupun cache paket npm.
- Integrasi frontend + Go + FastAPI + MongoDB, login yang terhubung ke DB, dan deployment publik **belum diuji end-to-end**.
- Model `joblib` asli dibuat dengan scikit-learn 1.9.1 sedangkan environment penguji memiliki 1.8.0, sehingga muncul `InconsistentVersionWarning`. Prediksi manual berhasil di environment uji, tetapi kompatibilitas model lintas-versi tidak dijamin. Instal dependensi asli dari `requirements.txt`.

## Batasan domain dan keamanan yang tidak diubah

- Dataset simulasi dan perbedaan populasi MongoDB/JSON dengan snapshot SQLite masih harus ditinjau untuk kelayakan akademik.
- Akun demo/password asli (yang disimpan dalam source Go), penyimpanan password plaintext, dan konfigurasi otorisasi produksi **tidak diubah** demi menjaga kode bisnis asli. Jangan deploy ke publik sebelum audit keamanan dan penggantian password demo.
- `.env` berisi rahasia sengaja tidak dibundel. Pengguna harus menyiapkan `.env` lokal yang sesuai dengan `.env.example`.
- ERD final, jurnal, proposal, riwayat GitHub, dan laporan mingguan tidak bisa direkonstruksi secara jujur dari source kode; tersedia folder dan petunjuk untuk melengkapinya.

Kesimpulan: **restrukturisasi dan smoke test fungsi Python/SQLite berhasil**, tetapi klaim "tanpa error seluruh sistem" memerlukan pengujian ulang pada Windows dengan Go dan Python versi sesuai, paket npm terpasang, serta MongoDB aktif.

# HKBP — Dashboard Data Analitik & Data Science

Proyek HKBP (React/Vite frontend, Go/Gin backend, Python/FastAPI analytics).
Source berasal dari **4 arsip kode yang dikirim pengguna pada 16 November 2026**.
Logika bisnis, UI, ETL, test, skema warehouse, dan model asli dipertahankan.
Perubahan pada source kode terbatas pada **referensi path artefak** dan lokasi file.

> **Mulai di sini:** [Panduan menjalankan Windows dan VS Code](PANDUAN_MENJALANKAN_WINDOWS.md)
> dan [Catatan migrasi](docs/MIGRASI_STRUKTUR.md).

## Struktur wajib dosen

```text
HKBP/
├── README.md
├── data/                  # sampel + snapshot SQLite
├── etl/                   # entrypoint ETL -> implementasi di app/analytics/etl/
├── warehouse/             # schema.sql + lokasi dokumentasi ERD
├── notebooks/             # notebook EDA asli
├── models/                # joblib + metrics + model card asli
├── app/
│   ├── frontend/          # React/Vite
│   ├── backend/           # Go/Gin, MongoDB, seeder
│   └── analytics/         # FastAPI, ETL, eksperimen ML, test
├── paper/                 # tempat naskah jurnal asli kelompok
├── reports/weekly/        # laporan mingguan yang dilengkapi tim
├── docs/                  # kualitas data, EDA, migrasi, proposal
└── scripts/               # launcher PowerShell dan verifikator
```

## Modul dan port lokal

| Modul | Teknologi | Port | Deskripsi |
|---|---|---:|---|
| Frontend | React/Vite | 5173 | Halaman dashboard, visualisasi dan prediksi |
| Backend | Go/Gin | 8081 | Autentikasi, CRUD, MongoDB, proxy analytics |
| Analytics | Python/FastAPI | 8000 | Data warehouse, analitik, model ML |

## Yang BELUM dijamin oleh restrukturisasi

- Ketersediaan MongoDB operasional pengguna, koneksi internet, atau deployment publik.
- Bukti bahwa dataset simulasi memenuhi izin/sumber dataset dosen.
- Keamanan produksi: kode autentikasi/password dan akun demo masih seperti source asli;
  perlu audit keamanan sebelum deployment publik.
- Hasil ETL baru akan sama dengan snapshot model lama jika sumber MongoDB resmi tersedia.
- Jurnal, ERD final, proposal, kontribusi GitHub, dan 14 laporan mingguan masih harus
  dilengkapi berdasarkan pekerjaan asli kelompok.

## Kredensial

`.env` asli **sengaja tidak dimasukkan ZIP** agar kunci internal tidak bocor saat
repo baru dibuka. Tersedia `.env.example` pada `app/backend/` dan `app/analytics/`.
Buat `.env` lokal sesuai panduan dan jangan lakukan commit.

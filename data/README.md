# Data HKBP

- `sample/wilayah_sample.json`: **subset dari data yang dikirim** (bukan data baru buatan asisten), contoh hierarki untuk pemahaman format.
- `processed/warehouse.db`: snapshot SQLite ASLI yang disertakan dalam ZIP pengguna.
- `../app/backend/wilayah.json`: JSON asli lengkap dari ZIP backend, digunakan seeder/migrasi Go.

**PENTING:** SQLite bawaan dan JSON asli tidak berisi populasi data yang sama.
Warehouse bawaan berasal dari sumber MongoDB yang lebih besar, sedangkan JSON backend lebih kecil.
Jika menjalankan ETL `--source json` dengan output default, warehouse lama ditimpa
oleh hasil JSON tersebut dan statistik dashboard/model yang lama bisa tidak cocok.
Jangan memasukkan data gereja nyata ke repo privat tanpa memastikan izin dan privasi.

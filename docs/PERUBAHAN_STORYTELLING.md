# Perubahan Storytelling HKBP — 26 November 2026

Dokumen ini menjelaskan patch khusus **Storytelling** pada source HKBP Kelompok 11, di atas patch Monitoring Kewajiban Setoran Pusat sebelumnya. **Patch ini bukan model ML klasifikasi baru.**

## Definisi angka

1. **Pemasukan**: total pemasukan dalam cakupan wilayah, periode, dan (bila dipilih) kategori. Nilai diambil dari `fact_pemasukan` dan rincian kategori `/dw/kategori`.
2. **Kewajiban pusat**: nominal alokasi pusat menurut **periode transaksi asal**, bukan bulan masuknya setoran. Dibaca dari `fact_kewajiban_setoran` (jika tabel tersedia pada snapshot SQLite).
3. **Dibayar dan sisa**: berasal dari pembayaran yang dikaitkan dengan kewajiban asal. Total pada snapshot ETL, bukan transaksi MongoDB saat ini.
4. **Ketepatan waktu**: proporsi jumlah kewajiban yang lunas tepat waktu di antara kewajiban yang sudah jatuh tempo, hanya jika `status_verifikasi == TERVERIFIKASI` dan `is_synthetic == 0`. Jadwal simulasi/yang belum diverifikasi **tidak** dipakai untuk klaim kepatuhan.
5. **Kategori**: hanya memfilter pemasukan, ranking, aliran, tren pemasukan, heatmap, dan small multiples. Kewajiban/setoran pusat **tidak** dipotong per kategori (grain kewajiban adalah Huria + periode).
6. **Kelengkapan periode**: tidak lagi disimpulkan dari ambang 70% jumlah sesi. Periode akhir yang belum diverifikasi tidak boleh disebut bulan lengkap.
7. **Status Snapshot**: `asOf` menyatakan tanggal perhitungan ETL kewajiban. Monitoring Setoran Go/MongoDB lebih tepat untuk transaksi aktif, dan bisa lebih baru daripada SQLite.

## Perbaikan visual dan UI

- Filter wilayah disusun hirarkis Distrik → Resort → Huria; periode dan kategori berada pada kelompok tersendiri.
- Tahun data terbaru dipilih sebagai default untuk menghindari 20+ tahun data memenuhi layar.
- Filter aktif dapat dihapus satu per satu atau seluruhnya.
- Sankey tampil **selebar konten**, label/node lebih terpisah, node dengan ID yang unik untuk setiap tingkat, ukuran Top 4/6/8, serta penggabungan `Wilayah lainnya` dan `Kategori lainnya` tanpa menghilangkan total.
- Ringkasan di bagian depan memisahkan **pemasukan**, **kewajiban**, **sisa**, dan **ketepatan waktu terverifikasi**.
- Prakiraan pelean 4 minggu dikeluarkan dari Storytelling utama; endpoint/model lama tetap tersedia untuk cadangan.
- Panel tren menampilkan **data aktual** selama maksimal 12 bulan.
- Heatmap menampilkan maksimal 12 bulan dan 12 Huria; judul bulan memiliki tahun, dan klik sel memilih Huria serta bulan.
- Small multiples memilih Top 8 wilayah berdasarkan total pemasukan, bukan urutan alfabet.
- Teks “semua Huria sudah patuh” dan saran normatif “pembinaan persembahan” diganti dengan insight yang dapat dibuktikan atau kondisi “belum dapat dinilai”.
- Analisis korelasi dan anomali diletakkan dalam panel tambahan yang dipanggil saat dibuka. Hasil dari MongoDB diberi catatan perbedaan sumber data.
- Anomali aturan `R3` yang memakai batas 45 hari kini diberi label **indikator usia tunggakan**, bukan tenggat resmi; statistik `S1` dinamai sesuai pembilang sesungguhnya: **alokasi pusat / pemasukan**, bukan setoran dibayar / pemasukan.

## Akses data di backend

- GET `/api/analytics/dw/cube`, `/aliran`, `/sesi`, `/kategori`, `/kewajiban`:
  - SuperAdmin menerima data sesuai role dan route yang sudah diotorisasi.
  - Akun non-SuperAdmin **hanya** menerima baris dengan `idHuria` sesuai JWT yang diterbitkan server. Jika ID Huria tidak ada, permintaan ditolak.
- POST `/analytics/forecast`, `/anomaly`, `/correlation`, `/drop`: akun non-SuperAdmin dipaksa menggunakan `idHuria` yang berasal dari JWT; filter ID yang dikirim browser tidak dipercaya.
- GET `/api/analytics/dw/ringkasan` sekarang **khusus SuperAdmin** karena jumlah/metadata global dapat memperlihatkan data lintas Huria.
- Model pelean lama `/ml/*`, CRUD lain, pengamanan password, dan keamanan deployment umum **di luar cakupan patch ini**; tetap perlu audit tersendiri.

## Apabila warehouse utama masih versi lama

Endpoint `/dw/kewajiban` mengembalikan `available=false` dan daftar kosong. Frontend menampilkan “Belum tersedia”, **bukan Rp0 atau 100% patuh**. Halaman tetap menampilkan pemasukan, Sankey, ranking, dan heatmap dari tabel lama. Buat warehouse kandidat dan validasi sebelum berpindah ke schema baru.

## Batasan yang perlu diingat

- Pengujian Python/SQLite pada snapshot demo maupun lama telah dilakukan; build Go dan Vite penuh **belum diverifikasi di lingkungan pembuatan patch**, sehingga perlu dijalankan di laptop yang memakai toolchain sesuai proyek.
- Data source contoh HKBP adalah simulasi; hasil grafik demo tidak boleh diperlakukan sebagai bukti kejadian keuangan yang sebenarnya.
- Fitur status keterlambatan belum menggunakan tenggat resmi secara otomatis tanpa jadwal yang dinyatakan `TERVERIFIKASI` dan non-sintetis.
- Scoping Go di patch ini berbasis ID Huria tunggal. Role multi-Huria/Resort/Distrik memerlukan model hak akses tambahan jika kelak diimplementasikan.
- Crossfilter kategori tidak bisa dianggap mengubah kewajiban karena kedua indikator berbeda granularitas.
- Korelasi pada rentang multi-tahun dengan campuran grain rekap tetap harus ditafsirkan hati-hati.

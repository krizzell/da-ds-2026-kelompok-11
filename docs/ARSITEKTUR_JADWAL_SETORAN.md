# Arsitektur jadwal dan kewajiban Setoran Pusat

## Konsep bisnis (jangan samakan dengan prediksi ML)

- Satu **kewajiban** adalah jumlah `AlokasiTransaksi.Nominal` dengan `Peruntukan='Setoran Pusat'` untuk satu Huria dan **bulan tanggal `PemasukanJemaat.Tanggal`**.
- **Tanggal setoran** adalah tanggal riil pada `SetoranPusat.TanggalSetor`. `SetoranPusat.Periode` tidak digunakan sebagai periode kewajiban karena setoran dapat melunasi beberapa alokasi dari bulan berbeda.
- Pelunasan suatu kewajiban dihitung dari semua rincian yang mengacu pada alokasi tersebut, **diurutkan menurut tanggal setor**, hingga mencapai nominal kewajiban.
- Jadwal ditentukan per Huria dan periode melalui `Huria.JadwalSetoran[]`. MongoDB lama tanpa field ini akan tetap terbaca dan statusnya **BELUM_ADA_JADWAL**.
- `tanggal_jatuh_tempo` **tidak** diisi otomatis berdasarkan tanggal 5, akhir bulan, atau 45 hari karena tidak ada bukti bahwa itu aturan HKBP terkini.
- Jenis `SIMULASI` hanya untuk pengembangan dan **tidak boleh dipakai sebagai label training/evaluasi pada data nyata**.

## Struktur MongoDB (ditambahkan pada objek Huria)

```json
{
  "JadwalSetoran": [
    {
      "Periode": "2026-10",
      "TanggalJatuhTempo": "2026-11-10",
      "SumberAturan": "SKENARIO_SIMULASI",
      "VersiAturan": "DEMO-1",
      "StatusVerifikasi": "SIMULASI",
      "IsSynthetic": true
    }
  ]
}
```

**Contoh di atas sintetis dan bukan tenggat resmi HKBP.** API PUT jadwal menolak IsSynthetic=true kecuali APP_ENV=dev/development. Untuk data nyata, sumber referensi dan versi kebijakan harus diisi dan divalidasi oleh pihak berwenang.

## Endpoint HTTP (Backend Go)

```
GET /api/huria/:id/kewajiban-setoran?asOf=YYYY-MM-DD
PUT /api/huria/:id/jadwal-setoran/:periode
```

Keduanya memerlukan bearer JWT, hanya dapat dipakai oleh `Admin` Huria terkait atau `SuperAdmin`. Untuk PUT, payload menggunakan struktur `JadwalSetoran` di atas; periode path dan body harus konsisten.

Contoh respons GET (ilustratif):

```json
{
  "mode": "monitoring_bukan_prediksi_ml",
  "data": [{
    "idHuria": "H-DEMO",
    "periode": "2026-10",
    "nominalKewajiban": 10000000,
    "totalDibayar": 6000000,
    "sisaKewajiban": 4000000,
    "tanggalJatuhTempo": "2026-11-10",
    "statusVerifikasi": "SIMULASI",
    "isSynthetic": true,
    "status": "TERLAMBAT_BELUM_LUNAS",
    "terlambat": true,
    "layakUntukDatasetNyata": false,
    "asOf": "2026-11-12"
  }]
}
```

## Aturan status

| Status | Ketentuan |
|---|---|
| `BELUM_ADA_JADWAL` | Tidak ada tanggal tenggat untuk Huria+periode. `terlambat=null`. |
| `BELUM_JATUH_TEMPO` | Belum lunas, dan `asOf` belum melewati tenggat. `terlambat=null`. |
| `TEPAT_WAKTU` | Telah lunas pada atau sebelum tenggat. `terlambat=false`. |
| `TERLAMBAT_LUNAS` | Telah lunas sesudah tenggat. `terlambat=true`. |
| `TERLAMBAT_BELUM_LUNAS` | `asOf` melewati tenggat dan belum lunas. `terlambat=true`. |

Nilai `layakUntukDatasetNyata=true` hanya jika jadwal ditandai TERVERIFIKASI, bukan sintetik, dan label sudah diketahui. **Penandaan bukan bukti validitas administratif**: audit sumber dan konsistensi riwayat pembayaran tetap wajib sebelum membuat dataset klasifikasi.

## Tabel baru di SQLite

- `fact_kewajiban_setoran`: agregat per Huria + periode kewajiban; tenggat, sisa, status, penanda simulasi, dan label historis yang nullable.
- `fact_pembayaran_alokasi`: satu baris per rincian pelunasan, menyimpan tanggal setor dan relasi ke setoran serta alokasi.

Tabel lama `fact_setoran`, `fact_alokasi`, `fact_pemasukan` dan model pelean tetap ada. Perubahan skema baru berlaku setelah ETL membangun warehouse pada file baru; `schema.sql` tidak otomatis memigrasikan DB lama.

## Keterbatasan untuk Machine Learning

1. Belum ada data tenggat **riil yang diverifikasi** untuk semua periode.
2. Status sintetis yang dihitung dari asumsi tidak boleh dipakai sebagai bukti performa model HKBP.
3. Fitur prediksi hanya boleh menggunakan informasi yang tersedia **sebelum** tanggal penilaian. `tanggal_pelunasan` masa depan dan `status_terlambat` masa depan adalah label, bukan fitur.
4. Untuk evaluasi risiko sebelum jatuh tempo, bangun *snapshot* per tanggal prediksi dan gunakan validasi waktu. Hindari memasukkan status aktual yang dihitung sesudah deadline sebagai masukan.
5. Sebelum ganti menu ML, tetapkan sumber kebijakan, histori kewajiban yang cukup, kualitas label dan metrik (precision, recall, F1, PR-AUC). Halaman ini baru merupakan monitoring berbasis aturan transaksi.

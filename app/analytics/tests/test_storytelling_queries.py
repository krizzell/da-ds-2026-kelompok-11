"""Regresi Storytelling: periode pelunasan, scope Huria, dan optional tabel kewajiban."""
import sqlite3

from app.warehouse import queries


def test_pelunasan_mengikuti_periode_asal_bukan_tanggal_setor(monkeypatch):
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript('''
    CREATE TABLE dim_waktu (waktu_key INTEGER PRIMARY KEY, tahun_bulan TEXT);
    INSERT INTO dim_waktu VALUES (1,'2026-09'), (2,'2026-10');
    CREATE TABLE fact_kehadiran(huria_key INTEGER, waktu_key INTEGER, jumlah_hadir INTEGER, total_pelean INTEGER);
    INSERT INTO fact_kehadiran VALUES(1,1,100,200);
    CREATE TABLE fact_pemasukan(id_transaksi TEXT, huria_key INTEGER, waktu_key INTEGER,
        nominal INTEGER, nominal_alokasi_pusat INTEGER, nominal_alokasi_huria INTEGER, kategori_key INTEGER);
    INSERT INTO fact_pemasukan VALUES('T1',1,1,1000,550,450,1);
    CREATE TABLE dim_peruntukan(peruntukan_key INTEGER, nama_peruntukan TEXT, is_setoran_pusat INTEGER);
    INSERT INTO dim_peruntukan VALUES(1,'Setoran Pusat',1);
    CREATE TABLE fact_alokasi(id_alokasi TEXT,id_transaksi TEXT, huria_key INTEGER, waktu_key INTEGER,
        peruntukan_key INTEGER, nominal INTEGER, nominal_dilunasi INTEGER);
    INSERT INTO fact_alokasi VALUES('A1','T1',1,1,1,550,550);
    CREATE TABLE fact_setoran(huria_key INTEGER, waktu_key INTEGER, total_setoran INTEGER);
    INSERT INTO fact_setoran VALUES(1,2,550);
    CREATE TABLE dim_kategori(kategori_key INTEGER, kategori_kanonik TEXT);
    INSERT INTO dim_kategori VALUES(1,'Pelean Minggu');
    CREATE TABLE v_huria(huria_key INTEGER, id_huria TEXT, nama_huria TEXT, nama_resort TEXT, nama_distrik TEXT, jumlah_jemaat INTEGER);
    INSERT INTO v_huria VALUES(1,'H-1','Huria A','Resort A','Distrik A',300);
    ''')
    def run_query(sql, params=()):
        return [dict(row) for row in conn.execute(sql, params).fetchall()]
    monkeypatch.setattr(queries, 'query', run_query)

    month = {r['bulan']: r for r in queries.cube()}
    assert month['2026-09']['setoranDibayar'] == 550
    assert '2026-10' not in month  # Setoran Oktober tidak dipasangkan ke kewajiban Oktober
    assert queries.kewajiban()['available'] is False
    assert queries.aliran()[0]['idHuria'] == 'H-1'
    assert queries.kategori()[0]['idHuria'] == 'H-1'

    conn.execute('''CREATE TABLE fact_kewajiban_setoran (
        huria_key INTEGER, periode TEXT, nominal_kewajiban INTEGER, total_dibayar INTEGER,
        sisa_kewajiban INTEGER, tanggal_jatuh_tempo TEXT, tanggal_pelunasan TEXT,
        status TEXT,status_verifikasi TEXT,is_synthetic INTEGER,as_of TEXT)''')
    conn.execute('''INSERT INTO fact_kewajiban_setoran VALUES(1,'2026-09',550,550,0,
        NULL,'2026-10-05','BELUM_ADA_JADWAL','BELUM_DIVERIFIKASI',0,'2026-11-26')''')
    results = queries.kewajiban()
    assert results['available'] is True
    assert results['data'][0]['idHuria'] == 'H-1'
    assert results['data'][0]['nominalKewajiban'] == 550
    assert results['data'][0]['tanggalJatuhTempo'] is None
    conn.close()

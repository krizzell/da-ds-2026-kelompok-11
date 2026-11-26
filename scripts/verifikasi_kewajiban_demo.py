"""Uji bebas koneksi MongoDB, memvalidasi hasil ETL demo dan logika kewajiban."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'app' / 'analytics'))
from etl.kewajiban import hitung_kewajiban
import pandas as pd


def frames(pemasukan, alokasi, setoran, rincian, jadwal):
    return {k:pd.DataFrame(v) for k,v in locals().items()}


def test_status():
    t=frames(
        pemasukan=[dict(id_huria='H', id_transaksi='T', tanggal='2026-01-08')],
        alokasi=[dict(id_huria='H', id_alokasi='A',id_transaksi='T',peruntukan='Setoran Pusat',nominal=100)],
        setoran=[dict(id_huria='H',id_setoran='S1',tanggal_setor='2026-02-03'),dict(id_huria='H',id_setoran='S2',tanggal_setor='2026-02-13')],
        rincian=[dict(id_huria='H',id_rincian='R1',id_setoran='S1',id_alokasi='A',nominal_dilunasi=60),dict(id_huria='H',id_rincian='R2',id_setoran='S2',id_alokasi='A',nominal_dilunasi=40)],
        jadwal=[dict(id_huria='H',periode='2026-01',tanggal_jatuh_tempo='2026-02-10',sumber_aturan='DEMO', status_verifikasi='SIMULASI', is_synthetic=True)],
    )
    pre,_=hitung_kewajiban(t,as_of='2026-02-09')
    assert pre[0]['status']=='BELUM_JATUH_TEMPO' and pre[0]['total_dibayar']==60 and pre[0]['label_terlambat'] is None
    late,_=hitung_kewajiban(t,as_of='2026-02-11')
    assert late[0]['status']=='TERLAMBAT_BELUM_LUNAS' and late[0]['label_terlambat']==1
    final,_=hitung_kewajiban(t,as_of='2026-02-14')
    assert final[0]['status']=='TERLAMBAT_LUNAS' and final[0]['tanggal_pelunasan']=='2026-02-13'
    assert final[0]['layak_untuk_dataset_nyata']==0
    t['jadwal']=pd.DataFrame()
    unknown,_=hitung_kewajiban(t,as_of='2026-02-14')
    assert unknown[0]['status']=='BELUM_ADA_JADWAL' and unknown[0]['label_terlambat'] is None
    t['jadwal']=pd.DataFrame([dict(id_huria='H',periode='2026-01',tanggal_jatuh_tempo='2026-02-14',sumber_aturan='DOKUMEN_TERVERIFIKASI', status_verifikasi='TERVERIFIKASI', is_synthetic=False)])
    ontime,_=hitung_kewajiban(t,as_of='2026-02-14')
    assert ontime[0]['status']=='TEPAT_WAKTU' and ontime[0]['layak_untuk_dataset_nyata']==1


def test_demo_db():
    p=ROOT/'data/processed/warehouse_demo.db'
    if not p.exists():
        print('Warehouse demo belum dibuat. Lewati pemeriksaan database.')
        return
    conn=sqlite3.connect(p)
    assert conn.execute('pragma integrity_check').fetchone()[0]=='ok'
    assert not conn.execute('pragma foreign_key_check').fetchall()
    invalid=conn.execute('select count(*) from fact_kewajiban_setoran where is_synthetic=1 and layak_untuk_dataset_nyata=1').fetchone()[0]
    assert invalid==0
    assert conn.execute('select count(*) from fact_kewajiban_setoran').fetchone()[0] > 0
    conn.close()

if __name__=='__main__':
    test_status(); test_demo_db(); print('PASS: 7 skenario/status termasuk partial, pending, lunas, synthetic gate, SQLite FK')

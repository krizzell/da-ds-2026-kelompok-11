"""Buat jadwal sintetis TERPISAH dari MongoDB dan data sumber asli.

Contoh (dari root proyek):
 python scripts/buat_data_simulasi_setoran.py
 python -m etl.build_warehouse --source json --json-path data/synthetic/wilayah_setoran_demo.json --db data/processed/warehouse_demo.db --report docs/DATA_QUALITY_REPORT_DEMO.md

Tidak mengubah app/backend/wilayah.json atau MongoDB.
"""
import argparse
import calendar
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', type=Path, default=ROOT/'app/backend/wilayah.json')
    ap.add_argument('--output', type=Path, default=ROOT/'data/synthetic/wilayah_setoran_demo.json')
    ap.add_argument('--hari', type=int, default=10, help='hari simulasi pada BULAN BERIKUTNYA (1..28)')
    ap.add_argument('--force', action='store_true', help='timpa hanya berkas output demo')
    args = ap.parse_args()
    if not 1 <= args.hari <= 28: ap.error('--hari harus antara 1 dan 28')
    resolved = args.output.resolve()
    if resolved == args.input.resolve(): ap.error('output tidak boleh sama dengan input')
    # Batasi path demo agar tidak menyenggol file produksi tanpa sengaja.
    if not resolved.is_relative_to((ROOT/'data/synthetic').resolve()):
        ap.error('output hanya boleh berada dalam data/synthetic/')
    if resolved.exists() and not args.force:
        ap.error('output demo sudah ada; gunakan --force untuk membuat ulang')
    docs = json.loads(args.input.read_text(encoding='utf-8-sig'))
    if isinstance(docs, dict): docs = [docs]
    total, hurias = 0, 0
    for doc in docs:
        for distrik in (doc.get('Pusat') or {}).get('Distrik') or []:
            for resort in distrik.get('Resort') or []:
                for h in resort.get('Huria') or []:
                    tanggal_trx = {p['IdTransaksi']:p['Tanggal'] for p in h.get('PemasukanJemaat') or []}
                    periods = sorted({tanggal_trx[a['IdTransaksi']][:7] for a in h.get('AlokasiTransaksi') or []
                                      if a.get('Peruntukan') == 'Setoran Pusat' and a['IdTransaksi'] in tanggal_trx})
                    if not periods: continue
                    hurias += 1
                    h['JadwalSetoran'] = []
                    for period in periods:
                        year,month = map(int, period.split('-'))
                        year2, month2 = (year+1,1) if month==12 else (year,month+1)
                        assert args.hari <= calendar.monthrange(year2,month2)[1]
                        due = date(year2,month2,args.hari).isoformat()
                        h['JadwalSetoran'].append({
                            'Periode':period,'TanggalJatuhTempo':due,
                            'SumberAturan':f'SIMULASI_JATUH_TEMPO_HARI_{args.hari}_BULAN_BERIKUTNYA',
                            'VersiAturan':'DEMO-1', 'StatusVerifikasi':'SIMULASI','IsSynthetic':True
                        })
                        total += 1
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(docs,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'DEMO: {total} jadwal sintetis pada {hurias} Huria -> {resolved}')
    print('CATATAN: data ini bukan tenggat HKBP resmi; dilarang untuk klaim performa pada data riil.')


if __name__=='__main__': main()

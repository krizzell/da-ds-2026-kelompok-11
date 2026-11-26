"""Materialisasi kewajiban per Huria/periode dari alokasi + rincian pelunasan.

BUKAN prediksi ML. Label historis hanya dihitung jika jadwal terverifikasi atau
skenario simulasi eksplisit. Tidak mengasumsikan tanggal jatuh tempo HKBP.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import date


def _records(frame):
    return [] if frame is None or frame.empty else frame.to_dict("records")


def hitung_kewajiban(tables, as_of=None):
    as_of = as_of or date.today().isoformat()
    date.fromisoformat(as_of)
    transaksi = {(r["id_huria"], r["id_transaksi"]): r["tanggal"]
                 for r in _records(tables.get("pemasukan"))}
    kewajiban = defaultdict(int)
    periods_alokasi = {}
    for a in _records(tables.get("alokasi")):
        if str(a.get("peruntukan", "")).casefold() != "setoran pusat":
            continue
        h, al = a["id_huria"], a["id_alokasi"]
        tanggal = transaksi.get((h, a["id_transaksi"]))
        if not tanggal:
            raise ValueError(f"Alokasi {al} tidak memiliki pemasukan sumber")
        key = h, tanggal[:7]
        if (h, al) in periods_alokasi:
            raise ValueError(f"Alokasi pusat ganda: {h}/{al}")
        periods_alokasi[h, al] = key
        kewajiban[key] += int(a["nominal"])

    tanggal_setoran = {(s["id_huria"], s["id_setoran"]): s["tanggal_setor"]
                       for s in _records(tables.get("setoran"))}
    payments = defaultdict(list)
    rincian_rows = []
    for r in _records(tables.get("rincian")):
        h, al, st = r["id_huria"], r["id_alokasi"], r["id_setoran"]
        key = periods_alokasi.get((h, al))
        tanggal = tanggal_setoran.get((h, st))
        if key is None or not tanggal:
            raise ValueError(f"Rincian {r['id_rincian']} merujuk ke setoran/alokasi pusat tidak ditemukan")
        nominal = int(r["nominal_dilunasi"])
        if nominal <= 0:
            raise ValueError("Nominal pelunasan wajib positif")
        rincian_rows.append({"id_rincian":r["id_rincian"], "id_huria":h,
                             "id_setoran":st, "id_alokasi":al,
                             "tanggal_setor":tanggal, "nominal_dilunasi":nominal})
        if tanggal <= as_of:
            payments[key].append((tanggal, nominal))

    jadwal = {}
    for j in _records(tables.get("jadwal")):
        key = j["id_huria"], j["periode"]
        if key in jadwal:
            raise ValueError(f"Jadwal duplikat untuk Huria dan periode {key}")
        jadwal[key] = j

    obligations = []
    for (h,periode),nominal in sorted(kewajiban.items()):
        records = sorted(payments[(h, periode)], key=lambda x:x[0])
        running = 0
        pelunasan = None
        for tanggal,amount in records:
            running += amount
            if running >= nominal and pelunasan is None:
                pelunasan = tanggal
        if running > nominal:
            raise ValueError(f"Total pelunasan {h}/{periode} melebihi kewajiban")
        schedule = jadwal.get((h,periode))
        due = schedule["tanggal_jatuh_tempo"] if schedule else None
        status_verifikasi = schedule.get("status_verifikasi", "BELUM_DIVERIFIKASI") if schedule else "BELUM_DIVERIFIKASI"
        is_synthetic = bool(schedule.get("is_synthetic", False)) if schedule else False
        if schedule:
            if is_synthetic and status_verifikasi != "SIMULASI":
                raise ValueError("Jadwal sintetis hanya boleh berstatus SIMULASI")
            if not is_synthetic and status_verifikasi != "TERVERIFIKASI":
                raise ValueError("Jadwal resmi harus berstatus TERVERIFIKASI")
        if due is None:
            status, label = "BELUM_ADA_JADWAL", None
        elif pelunasan:
            label = int(pelunasan > due)
            status = "TERLAMBAT_LUNAS" if label else "TEPAT_WAKTU"
        elif as_of > due:
            label, status = 1, "TERLAMBAT_BELUM_LUNAS"
        else:
            label, status = None, "BELUM_JATUH_TEMPO"
        obligations.append({"id_huria":h, "periode":periode, "nominal_kewajiban":nominal,
                            "total_dibayar":running, "sisa_kewajiban":nominal-running,
                            "tanggal_jatuh_tempo":due, "tanggal_pelunasan":pelunasan,
                            "status":status, "status_verifikasi":status_verifikasi,
                            "is_synthetic":int(is_synthetic), "label_terlambat":label,
                            "layak_untuk_dataset_nyata":int(bool(schedule and not is_synthetic and status_verifikasi == "TERVERIFIKASI" and label is not None)),
                            "sumber_aturan":schedule.get("sumber_aturan") if schedule else None,
                            "as_of":as_of})
    return obligations, rincian_rows

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, RefreshCcw, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getKewajibanSetoran, upsertJadwalSetoran } from '../api/wilayahApi'

const money = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0)
const today = () => {
  const d = new Date()
  const inWIB = new Date(d.getTime() + 7 * 3600_000)
  return inWIB.toISOString().slice(0, 10)
}
const statusText = {
  BELUM_ADA_JADWAL: 'Jatuh tempo belum ditetapkan',
  BELUM_JATUH_TEMPO: 'Belum jatuh tempo',
  TEPAT_WAKTU: 'Lunas tepat waktu',
  TERLAMBAT_LUNAS: 'Lunas setelah jatuh tempo',
  TERLAMBAT_BELUM_LUNAS: 'Lewat jatuh tempo, belum lunas',
}

export function MonitoringSetoranPage({ wilayahData = [] }) {
  const { user, isSuperAdmin } = useAuth()
  const hurias = useMemo(() => {
    const rows = []
    for (const w of wilayahData || []) for (const d of w?.Pusat?.Distrik || [])
      for (const r of d?.Resort || []) for (const h of r?.Huria || []) {
        if (!h.IdHuria) continue
        if (!isSuperAdmin && h.IdHuria !== user?.idHuria && h.NamaHuria !== user?.namaHuria) continue
        rows.push({ id: h.IdHuria, name: h.NamaHuria })
      }
    return rows.sort((a,b) => a.name.localeCompare(b.name))
  }, [wilayahData, isSuperAdmin, user?.idHuria, user?.namaHuria])
  const [idHuria, setIdHuria] = useState('')
  const [asOf, setAsOf] = useState(today)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [selectedPeriode, setSelectedPeriode] = useState('')
  const [jatuhTempo, setJatuhTempo] = useState('')
  const [sumber, setSumber] = useState('SKENARIO_SIMULASI')
  const [versi, setVersi] = useState('DEMO-1')
  const [simulasi, setSimulasi] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (hurias.length && !hurias.some(h => h.id === idHuria)) setIdHuria(hurias[0].id)
  }, [hurias, idHuria])

  const load = async (id, date) => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const response = await getKewajibanSetoran(id, date)
      setItems(Array.isArray(response?.data) ? response.data : [])
    } catch (e) {
      setItems([])
      setError(e?.response?.data?.error || e.message || 'Tidak dapat mengambil kewajiban')
    } finally { setLoading(false) }
  }
  useEffect(() => { load(idHuria, asOf) }, [idHuria, asOf])

  const pickPeriod = (row) => {
    setSelectedPeriode(row.periode)
    setJatuhTempo(row.tanggalJatuhTempo || '')
    setSimulasi(!row.tanggalJatuhTempo || row.isSynthetic)
    setSumber(row.sumberAturan || 'SKENARIO_SIMULASI')
    setVersi(row.tanggalJatuhTempo ? 'PERIKSA_VERSI' : 'DEMO-1')
    setInfo('')
  }
  const submit = async (event) => {
    event.preventDefault(); setInfo(''); setError('')
    if (!selectedPeriode || !jatuhTempo || !sumber.trim() || !versi.trim()) {
      setError('Pilih periode, tanggal jatuh tempo, sumber, dan versi aturan.'); return
    }
    if (!simulasi && !window.confirm('Pastikan tanggal dan sumber aturan sudah benar-benar diverifikasi oleh pengurus yang berwenang. Lanjutkan?')) return
    setSaving(true)
    try {
      await upsertJadwalSetoran(idHuria, selectedPeriode, {
        Periode: selectedPeriode,
        TanggalJatuhTempo: jatuhTempo,
        SumberAturan: sumber.trim(), VersiAturan: versi.trim(),
        StatusVerifikasi: simulasi ? 'SIMULASI' : 'TERVERIFIKASI', IsSynthetic: simulasi,
      })
      setInfo(simulasi ? 'Jadwal DEMO tersimpan. Tidak boleh dijadikan bukti tenggat resmi.' : 'Jadwal tersimpan sesuai pernyataan verifikasi. Mohon audit sumber dokumen.')
      await load(idHuria, asOf)
    } catch (e) { setError(e?.response?.data?.error || e.message || 'Gagal menyimpan jadwal') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Monitoring Kewajiban Setoran Pusat</h1>
          <p className="text-sm text-muted mt-1">Menghitung kewajiban dan pembayaran berdasarkan transaksi. Ini <strong>bukan prediksi ML</strong>.</p>
        </div>
        <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-surface" onClick={() => load(idHuria, asOf)} disabled={loading}>
          <RefreshCcw size={16} /> Muat ulang
        </button>
      </div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex gap-2">
        <AlertTriangle size={18} className="shrink-0" />
        Tanggal jatuh tempo yang belum memiliki dokumen resmi wajib ditandai SIMULASI. Status terlambat dari simulasi tidak boleh diklaim sebagai keterlambatan HKBP yang sebenarnya.
      </div>
      <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-surface border border-border p-4">
        <label className="text-sm font-medium">Huria
          <select aria-label="Pilih Huria" value={idHuria} onChange={e => {setIdHuria(e.target.value);setSelectedPeriode('')}} className="block w-full mt-1 p-2 border border-border rounded-lg bg-surface">
            {hurias.length === 0 && <option value="">Belum ada Huria yang dapat diakses</option>}
            {hurias.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Status per tanggal (WIB)
          <input aria-label="Tanggal pengamatan" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="block w-full mt-1 p-2 border border-border rounded-lg bg-surface" />
        </label>
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
      {info && <div role="status" className="p-3 rounded-lg bg-green-50 text-green-700 border border-green-200">{info}</div>}
      <section className="bg-surface border border-border rounded-xl overflow-auto">
        <div className="p-4 flex gap-2 items-center"><CalendarClock size={19}/><h2 className="font-bold">Kewajiban per periode</h2></div>
        <table className="w-full text-sm text-left min-w-[850px]">
          <thead className="bg-canvas text-muted"><tr>{['Periode','Kewajiban','Dibayar','Sisa','Tenggat','Pelunasan','Status','Aksi'].map(x=><th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
          <tbody>{items.map(row => <tr key={row.periode} className="border-t border-border">
            <td className="px-3 py-2 font-medium">{row.periode}</td>
            <td className="px-3 py-2">{money(row.nominalKewajiban)}</td>
            <td className="px-3 py-2">{money(row.totalDibayar)}</td>
            <td className="px-3 py-2">{money(row.sisaKewajiban)}</td>
            <td className="px-3 py-2">{row.tanggalJatuhTempo || 'Belum ditentukan'}</td>
            <td className="px-3 py-2">{row.tanggalPelunasan || '—'}</td>
            <td className="px-3 py-2">{statusText[row.status] || row.status}{row.isSynthetic && <span className="block text-amber-700 font-bold text-xs">SIMULASI</span>}</td>
            <td className="px-3 py-2"><button type="button" className="text-primary underline" onClick={()=>pickPeriod(row)}>Atur tenggat</button></td>
          </tr>)}
          {!loading && items.length === 0 && <tr><td colSpan="8" className="p-5 text-muted text-center">Belum ada data kewajiban atau Huria belum dipilih.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-lg font-bold">Atur jadwal jatuh tempo</h2>
        <p className="text-xs text-muted mt-1 mb-4">Pilih periode dari tabel. Penyimpanan dilakukan pada dokumen Huria di MongoDB dan tidak mengubah transaksi pembayaran.</p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Periode <input readOnly required value={selectedPeriode} className="block w-full mt-1 p-2 border border-border rounded-lg bg-canvas" /></label>
          <label className="text-sm font-medium">Tanggal jatuh tempo <input type="date" required value={jatuhTempo} onChange={e=>setJatuhTempo(e.target.value)} className="block w-full mt-1 p-2 border border-border rounded-lg" /></label>
          <label className="text-sm font-medium">Sumber aturan <input required value={sumber} onChange={e=>setSumber(e.target.value)} className="block w-full mt-1 p-2 border border-border rounded-lg" /></label>
          <label className="text-sm font-medium">Versi / referensi aturan <input required value={versi} onChange={e=>setVersi(e.target.value)} className="block w-full mt-1 p-2 border border-border rounded-lg" /></label>
          <label className="sm:col-span-2 flex gap-2 items-center text-sm"><input type="checkbox" checked={simulasi} onChange={e=>setSimulasi(e.target.checked)} /> Jadwal ini data SIMULASI (hanya untuk development)</label>
          <button type="submit" disabled={saving || !selectedPeriode || !idHuria} className="sm:col-span-2 rounded-xl bg-primary text-white py-2 px-4 flex gap-2 justify-center items-center disabled:opacity-50"><Save size={16} />{saving ? 'Menyimpan...' : 'Simpan jadwal'}</button>
        </form>
      </section>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Filter, Loader2, RefreshCw, RotateCcw, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getDwAliran, getDwCube, getDwKategori, getDwKewajiban, getDwRingkasan,
  pesanErrorAnalitik, refreshDw, runAnomalyApi, runCorrelationApi,
} from '../api/analyticsApi'
import {
  ClickableBars, CorrelationScatter, HeatmapGrid, SankeyChart, SmallMultiples,
} from '../components/charts/AdvancedCharts'
import { formatCompactRupiah, formatRupiah } from '../utils/formatters'
import {
  EMPTY_SELECTION, applyCategoryToCube, buildInsights, computeKpis, drillLevel,
  filterRows, optionsFromRows, rankBy, toHeatmap, toMonthlyTrend, toSankey,
  toSmallMultiples,
} from '../lib/storytelling'

const Card = ({ title, subtitle, children, className = '', action }) => (
  <section className={`rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5 ${className}`}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold leading-snug text-ink sm:text-base">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

const Notice = ({ children, danger = false }) => (
  <div role={danger ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs leading-relaxed ${danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
    {children}
  </div>
)

const Field = ({ label, value, onChange, choices = [], allLabel }) => (
  <label className="block min-w-0 text-xs font-bold text-ink">
    <span className="mb-1.5 block">{label}</span>
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
      <option value="">{allLabel}</option>
      {choices.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  </label>
)

const displayValue = (k) => {
  if (k.value === null || k.value === undefined || !Number.isFinite(k.value)) return 'Belum tersedia'
  if (k.format === 'persen') return `${k.value.toFixed(1)}%`
  if (k.format === 'rupiah') return k.value >= 100000 ? formatCompactRupiah(k.value) : formatRupiah(Math.round(k.value))
  return Number(k.value).toLocaleString('id-ID')
}

function TrendBulanan({ items, showObligations }) {
  if (!items.length) return <p className="py-10 text-center text-sm text-muted">Tidak ada data pada periode ini.</p>
  const max = Math.max(1, ...items.flatMap((r) => [r.pemasukan, ...(showObligations ? [r.kewajiban, r.dibayar] : [])]))
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#245f99]" /> Pemasukan</span>
        {showObligations && <><span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#d4964c]" /> Kewajiban pusat</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#429779]" /> Dibayar menurut periode asal</span></>}
      </div>
      <div className="overflow-x-auto">
        <div className="flex h-52 min-w-[600px] items-end gap-3 border-b border-line px-2 pb-6">
          {items.map((r) => (
            <div key={r.bulan} className="relative flex h-full min-w-10 flex-1 items-end justify-center gap-1 border-l border-line/40 px-1"
              title={`${r.bulan}\nPemasukan: ${formatRupiah(r.pemasukan)}\nKewajiban: ${formatRupiah(r.kewajiban)}\nDibayar: ${formatRupiah(r.dibayar)}`}>
              <div className="w-full max-w-6 rounded-t-sm bg-[#245f99]" style={{ height: `${Math.max(r.pemasukan > 0 ? 2 : 0, r.pemasukan / max * 100)}%` }} />
              {showObligations && <><div className="w-full max-w-6 rounded-t-sm bg-[#d4964c]" style={{ height: `${Math.max(r.kewajiban > 0 ? 2 : 0, r.kewajiban / max * 100)}%` }} />
                <div className="w-full max-w-6 rounded-t-sm bg-[#429779]" style={{ height: `${Math.max(r.dibayar > 0 ? 2 : 0, r.dibayar / max * 100)}%` }} /></>}
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted">{r.bulan.slice(2)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">Grafik aktual, bukan prakiraan. Nilai dibayar mengikuti periode asal kewajiban; status ketepatan waktu memakai tenggat terverifikasi saja.</p>
    </div>
  )
}

const settledValue = (result, defaultValue, label, warnings) => {
  if (result.status === 'fulfilled') return result.value
  warnings.push(`${label}: ${pesanErrorAnalitik(result.reason)}`)
  return defaultValue
}

export const StorytellingPage = () => {
  const { isSuperAdmin } = useAuth()
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [warehouse, setWarehouse] = useState({ cube: [], aliran: [], kategori: [], obligations: [], obligationAvailable: false, ringkasan: null })
  const [sel, setSel] = useState(EMPTY_SELECTION)
  const [topN, setTopN] = useState('6')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [anomalyRaw, setAnomaly] = useState({})
  const [corrRaw, setCorr] = useState({})
  const [anomalyLimit, setAnomalyLimit] = useState(10)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const loaders = [getDwCube(), getDwAliran(), getDwKategori(), getDwKewajiban(), ...(isSuperAdmin ? [getDwRingkasan()] : [])]
    Promise.allSettled(loaders).then((results) => {
      if (!active) return
      const notices = []
      if (results[0].status !== 'fulfilled') {
        setError(`Kubus warehouse tidak dapat dibaca: ${pesanErrorAnalitik(results[0].reason)}`)
      }
      const cube = settledValue(results[0], [], 'Kubus', notices)
      const aliran = settledValue(results[1], [], 'Aliran dana', notices)
      const kategori = settledValue(results[2], [], 'Kategori pemasukan', notices)
      const kewajiban = settledValue(results[3], { available: false, data: [], message: 'Endpoint belum tersedia.' }, 'Kewajiban', notices)
      const ringkasan = isSuperAdmin ? settledValue(results[4], null, 'Metadata warehouse', notices) : null
      setWarehouse({ cube, aliran, kategori, obligations: kewajiban?.data || [], obligationAvailable: Boolean(kewajiban?.available), ringkasan })
      setWarnings(notices)
      // Default tahun terbaru agar dashboard tidak memadatkan 20+ tahun dalam satu layar.
      setSel((prev) => {
        if (prev.tahun) return prev
        const years = [...new Set(cube.map((r) => String(r.bulan || '').slice(0, 4)))].filter(Boolean).sort()
        return { ...prev, tahun: years.at(-1) || '' }
      })
    }).catch((e) => active && setError(pesanErrorAnalitik(e)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [reloadKey, isSuperAdmin])

  const perbaruiWarehouse = async () => {
    setRefreshing(true); setRefreshMsg('')
    try {
      const result = await refreshDw(false)
      const count = Object.values(result?.baris || {}).reduce((a, b) => a + Number(b || 0), 0)
      setRefreshMsg(`ETL selesai (${count.toLocaleString('id-ID')} baris tabel). Memuat ulang seluruh visual.`)
      setReloadKey((n) => n + 1)
    } catch (e) { setRefreshMsg(`Pembaruan gagal: ${pesanErrorAnalitik(e)}`) }
    finally { setRefreshing(false) }
  }

  const options = useMemo(() => optionsFromRows(warehouse.cube, sel), [warehouse.cube, sel])
  const categories = useMemo(() => [...new Set(warehouse.kategori.map((r) => r.kategori).filter(Boolean))].sort(), [warehouse.kategori])
  const base = useMemo(() => filterRows(warehouse.cube, sel, { ignoreKategori: true }), [warehouse.cube, sel])
  const filtered = useMemo(() => applyCategoryToCube(base, warehouse.kategori, sel.kategori), [base, warehouse.kategori, sel.kategori])
  const obligations = useMemo(() => filterRows(warehouse.obligations, sel, { ignoreKategori: true }), [warehouse.obligations, sel])
  const kpis = useMemo(() => computeKpis(filtered, obligations, { kewajibanAvailable: warehouse.obligationAvailable, kategori: sel.kategori }), [filtered, obligations, warehouse.obligationAvailable, sel.kategori])
  const insights = useMemo(() => buildInsights(filtered, sel, obligations, { kewajibanAvailable: warehouse.obligationAvailable }), [filtered, sel, obligations, warehouse.obligationAvailable])
  const drill = drillLevel(sel)
  const ranking = useMemo(() => rankBy(filtered, sel), [filtered, sel])
  const sankey = useMemo(() => toSankey(warehouse.aliran, sel, { topSources: Number(topN), topCategories: 5 }), [warehouse.aliran, sel, topN])
  const heat = useMemo(() => toHeatmap(filtered, sel), [filtered, sel])
  const multiples = useMemo(() => toSmallMultiples(filtered, sel), [filtered, sel])
  const trend = useMemo(() => toMonthlyTrend(filtered, obligations), [filtered, obligations])
  const idHuria = useMemo(() => [...new Set(base.map((r) => r.idHuria).filter(Boolean))].sort(), [base])
  const startDate = sel.bulan ? `${sel.bulan}-01` : sel.tahun ? `${sel.tahun}-01-01` : null
  const endDate = sel.bulan ? `${sel.bulan}-${String(new Date(Date.UTC(Number(sel.bulan.slice(0, 4)), Number(sel.bulan.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}` : sel.tahun ? `${sel.tahun}-12-31` : null
  const analysisKey = `${idHuria.join('|')};${startDate};${endDate};${sel.kategori};${reloadKey}`

  useEffect(() => {
    if (!showAdvanced || !idHuria.length) return undefined
    let active = true
    const payload = { idHuria, mulai: startDate, akhir: endDate }
    setAnomaly({ key: analysisKey, state: 'loading' })
    setCorr({ key: analysisKey, state: 'loading' })
    runAnomalyApi(payload)
      .then(({ data }) => active && setAnomaly({ key: analysisKey, state: 'ok', data }))
      .catch((e) => active && setAnomaly({ key: analysisKey, state: 'error', message: pesanErrorAnalitik(e) }))
    runCorrelationApi({ ...payload, granularitas: 'mingguan', kategori: sel.kategori || 'Pelean Minggu' })
      .then(({ data }) => active && setCorr({ key: analysisKey, state: 'ok', data }))
      .catch((e) => active && setCorr({ key: analysisKey, state: 'error', message: pesanErrorAnalitik(e) }))
    return () => { active = false }
  }, [showAdvanced, analysisKey, idHuria, startDate, endDate, sel.kategori])

  const anomaly = anomalyRaw.key === analysisKey ? anomalyRaw : { state: 'loading' }
  const corr = corrRaw.key === analysisKey ? corrRaw : { state: 'loading' }
  const findings = anomaly.state === 'ok' ? anomaly.data?.temuan || [] : []
  const change = (patch) => setSel((prev) => ({ ...prev, ...patch }))
  const selectBar = ({ key }) => {
    if (drill.level === 'distrik') change({ distrik: sel.distrik === key ? '' : key, resort: '', huria: '' })
    else if (drill.level === 'resort') change({ resort: sel.resort === key ? '' : key, huria: '' })
    else change({ huria: sel.huria === key ? '' : key })
  }
  const selectSankey = (node) => {
    if (node.level === 1) change({ kategori: sel.kategori === node.label ? '' : node.label })
    else if (node.level === 0) selectBar({ key: node.label })
  }
  const active = Object.entries(sel).filter(([, value]) => Boolean(value))
  const asOfs = [...new Set(obligations.map((r) => r.asOf).filter(Boolean))].sort()
  const asOf = asOfs.at(-1)

  if (loading) return <div className="flex h-80 items-center justify-center gap-3 text-sm text-muted"><Loader2 className="h-6 w-6 animate-spin text-primary" />Memuat snapshot Storytelling…</div>
  if (error) return <div className="space-y-3"><Notice danger>{error}</Notice><button className="rounded-lg bg-primary px-4 py-2 text-sm text-white" onClick={() => setReloadKey((n) => n + 1)}>Coba lagi</button></div>

  return (
    <main className="space-y-5 pb-10">
      <header className="rounded-2xl bg-primary px-5 py-6 text-white sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/65">Storytelling · Data Analytics HKBP</p>
        <h1 className="mt-1 max-w-4xl text-xl font-extrabold leading-snug sm:text-2xl">Bagaimana kondisi pemasukan, kewajiban, dan pelunasan Setoran Pusat?</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/80">Telusuri wilayah dan periode, lihat bukti transaksi, lalu tentukan tindak lanjut. Status ketepatan waktu hanya dinilai jika jadwal sudah terverifikasi.</p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-ink"><SlidersHorizontal className="h-4 w-4 text-primary" /> Filter analisis</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSel(EMPTY_SELECTION)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-primary hover:bg-primary-50"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-primary hover:bg-primary-50"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted"><Filter className="h-3.5 w-3.5" /> Cakupan wilayah</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Distrik" value={sel.distrik} choices={options.distrik} allLabel="Semua distrik" onChange={(v) => change({ distrik: v, resort: '', huria: '' })} />
              <Field label="Resort" value={sel.resort} choices={options.resort} allLabel="Semua resort" onChange={(v) => change({ resort: v, huria: '' })} />
              <Field label="Huria" value={sel.huria} choices={options.huria} allLabel="Semua Huria" onChange={(v) => change({ huria: v })} />
            </div>
          </div>
          <div className="border-t border-line pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Periode dan kategori pemasukan</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tahun" value={sel.tahun} choices={options.tahun} allLabel="Semua tahun" onChange={(v) => change({ tahun: v, bulan: '' })} />
              <Field label="Bulan" value={sel.bulan} choices={options.bulan} allLabel="Semua bulan" onChange={(v) => change({ bulan: v, tahun: v ? v.slice(0, 4) : sel.tahun })} />
              <Field label="Kategori" value={sel.kategori} choices={categories} allLabel="Semua kategori" onChange={(v) => change({ kategori: v })} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">Kategori memfilter pemasukan, ranking, Sankey, tren, dan heatmap. <strong>Kewajiban pusat dan pelunasan tetap seluruh kategori</strong> karena kewajiban dihitung per Huria dan periode.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-[11px] font-bold text-muted">Aktif:</span>
          {!active.length && <span className="text-xs text-muted">Semua wilayah, periode, dan kategori</span>}
          {active.map(([key, value]) => <button key={key} type="button" onClick={() => {
            if (key === 'distrik') change({ distrik: '', resort: '', huria: '' })
            else if (key === 'resort') change({ resort: '', huria: '' })
            else if (key === 'tahun') change({ tahun: '', bulan: '' })
            else change({ [key]: '' })
          }} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary">
            {key}: {value} <X className="h-3 w-3" />
          </button>)}
          <span className="ml-auto text-[11px] text-muted">{new Set(base.map((r) => r.idHuria)).size} Huria pada cakupan</span>
        </div>
      </section>

      {warnings.map((note, i) => <Notice key={i}>{note}</Notice>)}
      {!warehouse.obligationAvailable && <Notice>Snapshot warehouse yang aktif belum memiliki tabel kewajiban baru. Grafik pemasukan masih tersedia; KPI kewajiban sengaja ditampilkan “Belum tersedia”. Bangun dan verifikasi warehouse kandidat sebelum mengaktifkannya.</Notice>}
      {refreshMsg && <Notice>{refreshMsg}</Notice>}
      {isSuperAdmin && <button type="button" onClick={perbaruiWarehouse} disabled={refreshing}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-primary disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Memperbarui warehouse…' : 'Perbarui warehouse dari MongoDB (ETL)'}
      </button>}

      <section aria-label="Ringkasan keuangan" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => <div key={k.id} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{k.label}</p>
          <div className={`mt-2 font-extrabold tracking-tight text-ink ${k.value == null ? 'text-base' : 'text-2xl'}`}>{displayValue(k)}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{k.note}</p>
        </div>)}
      </section>
      {asOf && <p className="text-[11px] text-muted">Status kewajiban merupakan snapshot per <b>{asOf}</b>, bukan saldo MongoDB real-time. Untuk transaksi dan jadwal terbaru buka Monitoring Setoran.</p>}

      <Card title="A. Tren pemasukan dan pelunasan" subtitle="Perbandingan sampai 12 periode bulanan dari wilayah/filter yang dipilih. Bukan prediksi pelean.">
        <TrendBulanan items={trend} showObligations={warehouse.obligationAvailable} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title={insights.judul.ranking || 'Pemasukan per wilayah'} subtitle={`Klik batang ${drill.title.toLowerCase()} untuk melihat tingkat wilayah berikutnya.`}>
          <ClickableBars data={ranking.slice(0, 12)} onSelect={selectBar} activeKey={sel[drill.key]} />
          {ranking.length > 12 && <p className="mt-2 text-[11px] text-muted">Menampilkan 12 wilayah teratas. Filter wilayah untuk detail lainnya.</p>}
        </Card>
        <Card title={insights.judul.kewajiban || 'Ringkasan kewajiban pusat'} subtitle="Membedakan kewajiban belum lunas dengan status terlambat yang memiliki tenggat sah.">
          {warehouse.obligationAvailable ? <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-muted">Kewajiban terpilih</p><p className="mt-1 text-lg font-bold text-ink">{obligations.length.toLocaleString('id-ID')}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-muted">Belum lunas</p><p className="mt-1 text-lg font-bold text-ink">{obligations.filter((r) => Number(r.sisaKewajiban) > 0).length.toLocaleString('id-ID')}</p></div>
            </div>
            <p className="text-xs leading-relaxed text-muted">Periode setoran dihitung dari tanggal transaksi asal; pelunasan bisa terjadi pada bulan yang berbeda. Status tenggat sintetis tidak digunakan untuk klaim ketepatan waktu.</p>
            <a className="inline-flex items-center gap-1 text-xs font-bold text-primary underline" href="/monitoring-setoran">Buka Monitoring Setoran <ArrowRight className="h-3.5 w-3.5" /></a>
          </div> : <Notice>Belum dapat menilai kewajiban. Warehouse utama belum diperbarui atau endpoint sedang tidak tersedia.</Notice>}
        </Card>
      </div>

      <Card title="B. Aliran dana menurut wilayah, kategori, dan peruntukan" subtitle="Diagram Sankey diperlebar, label dipisahkan dari aliran, dan kelompok kecil digabung tanpa menghilangkan nominal total. Klik wilayah atau kategori untuk memfilter."
        action={<label className="flex items-center gap-2 text-xs font-bold text-muted">Top wilayah
          <select value={topN} onChange={(e) => setTopN(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink">
            <option value="4">4</option><option value="6">6</option><option value="8">8</option>
          </select></label>}>
        <SankeyChart nodes={sankey.nodes} links={sankey.links} onNodeClick={selectSankey}
          activeNode={sel.kategori ? `kategori:${sel.kategori}` : sel[drill.key] ? `wilayah:${sel[drill.key]}` : ''} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="C. Peta panas pemasukan Huria" subtitle="12 bulan terbaru pada pilihan tahun; 12 Huria dengan pemasukan terbesar. Klik sel untuk memilih Huria dan bulan.">
          <HeatmapGrid rows={heat.rows} cols={heat.cols} matrix={heat.matrix} activeRow={sel.huria} activeCol={sel.bulan}
            onCellClick={(huria, bulan) => change({ huria: sel.huria === huria && sel.bulan === bulan ? '' : huria, bulan, tahun: bulan.slice(0, 4) })} />
        </Card>
        <Card title={`D. Perbandingan tren ${drill.title.toLowerCase()}`} subtitle="Hingga 8 wilayah dengan total pemasukan terbesar; skala Y seragam dan dapat diklik untuk drill-down.">
          <SmallMultiples series={multiples} onSelect={(key) => selectBar({ key })} activeKey={sel[drill.key]} />
        </Card>
      </div>

      <Card title="E. Temuan dan tindak lanjut" subtitle="Narasi dibuat dari hasil agregasi aktual; bukan diagnosis kesehatan kas atau penilaian kualitas jemaat.">
        {insights.rekomendasi.length ? <ol className="space-y-3">
          {insights.rekomendasi.map((item, i) => <li key={`${i}-${item}`} className="flex items-start gap-3 rounded-xl bg-canvas p-3 text-sm text-ink">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">{i + 1}</span>
            <span className="leading-relaxed">{item}</span>
          </li>)}
        </ol> : <p className="py-4 text-sm text-muted">Belum ada temuan berbasis data untuk filter ini.</p>}
      </Card>

      <Card title="F. Analisis lanjutan" subtitle="Korelasi dan pemeriksaan anomali membaca MongoDB melalui layanan Python; tanggal pembaruan dan cakupannya bisa berbeda dari snapshot SQLite."
        action={<button type="button" onClick={() => setShowAdvanced((s) => !s)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-primary">{showAdvanced ? 'Tutup analisis' : 'Jalankan analisis'}</button>}>
        {!showAdvanced && <p className="text-xs leading-relaxed text-muted">Buka jika membutuhkan pemeriksaan transaksi R1–R6 / S1 dan korelasi eksploratif. Hasil anomali tidak membuktikan seluruh transaksi benar, sedangkan korelasi tidak membuktikan sebab-akibat.</p>}
        {showAdvanced && !idHuria.length && <Notice>Tidak ada Huria dengan data untuk kombinasi filter ini.</Notice>}
        {showAdvanced && idHuria.length > 0 && <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Pemeriksaan transaksi dan alokasi</h3>
            {anomaly.state === 'loading' && <p className="inline-flex gap-2 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" />Memeriksa data MongoDB…</p>}
            {anomaly.state === 'error' && <Notice danger>{anomaly.message}</Notice>}
            {anomaly.state === 'ok' && <>
              <p className="text-xs text-muted">{findings.length.toLocaleString('id-ID')} temuan dalam cakupan request. Aturan usia alokasi R3 bukan tenggat resmi.</p>
              {!findings.length && <p className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Tidak ditemukan ketidaksesuaian oleh aturan yang berhasil dijalankan; bukan jaminan bebas kesalahan.</p>}
              {(anomaly.data?.catatan || []).map((note, i) => <p key={i} className="text-xs text-amber-800"><AlertTriangle className="mr-1 inline h-3 w-3" />{note}</p>)}
              {findings.length > 0 && <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="min-w-[530px] w-full text-left text-xs">
                  <thead className="sticky top-0 bg-canvas text-muted"><tr><th className="p-2">Kode</th><th>Huria</th><th>Periode</th><th>Temuan</th></tr></thead>
                  <tbody>{findings.slice(0, anomalyLimit).map((r, i) => <tr key={i} className="border-t border-line"><td className="p-2 font-bold">{r.kode}</td><td className="p-2">{r.namaHuria}</td><td className="p-2">{r.periode || '–'}</td><td className="p-2">{r.ringkasan}</td></tr>)}</tbody>
                </table>
              </div>}
              {findings.length > anomalyLimit && <button className="text-xs font-bold text-primary underline" onClick={() => setAnomalyLimit((n) => n + 20)}>Tampilkan 20 temuan berikutnya</button>}
            </>}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Korelasi kehadiran dan {sel.kategori || 'Pelean Minggu'} (eksploratif)</h3>
            {corr.state === 'loading' && <p className="inline-flex gap-2 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" />Menghitung korelasi…</p>}
            {corr.state === 'error' && <Notice danger>{corr.message}</Notice>}
            {corr.state === 'ok' && <><CorrelationScatter data={corr.data?.data || []} />
              <p className="text-xs text-muted">Pearson {corr.data?.pearson ?? '–'} · Spearman {corr.data?.spearman ?? '–'} · {corr.data?.jumlahPeriode ?? 0} periode. Korelasi bukan hubungan sebab-akibat; bandingkan hanya tingkat rincian yang sepadan.</p></>}
          </div>
        </div>}
      </Card>

      {warehouse.ringkasan && <Card title="Sumber dan kesegaran data" subtitle="KPI/grafik utama menggunakan SQLite; analisis lanjutan memakai MongoDB. Pembaruan kedua sumber tidak otomatis bersamaan.">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-canvas p-3"><Database className="mb-1 h-4 w-4 text-primary" /><b>ETL terakhir</b><p className="mt-1 text-muted">{warehouse.ringkasan.etlTerakhir?.waktu || 'Tidak tersedia'}</p></div>
          <div className="rounded-xl bg-canvas p-3"><Database className="mb-1 h-4 w-4 text-primary" /><b>Sumber ETL</b><p className="mt-1 text-muted">{warehouse.ringkasan.etlTerakhir?.sumber || 'Tidak tersedia'}</p></div>
          <div className="rounded-xl bg-canvas p-3"><ShieldAlert className="mb-1 h-4 w-4 text-primary" /><b>Rentang transaksi sesi</b><p className="mt-1 text-muted">{warehouse.ringkasan.rentangTanggal?.mulai || '–'} s.d. {warehouse.ringkasan.rentangTanggal?.akhir || '–'}</p></div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">Warehouse memiliki {warehouse.ringkasan.skema?.fakta?.length || 0} tabel fakta dan {warehouse.ringkasan.skema?.dimensi?.length || 0} tabel dimensi pada snapshot saat ini. Nilai DQ berasal dari aturan pengujian ETL, bukan audit independen atas keaslian data.</p>
      </Card>}
    </main>
  )
}

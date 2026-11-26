/**
 * Fungsi murni Storytelling. Semua nilai harus berasal dari snapshot warehouse,
 * tanpa menyimpulkan keterlambatan ketika jadwal belum diverifikasi.
 */
import { formatCompactRupiah } from '../utils/formatters'

export const EMPTY_SELECTION = Object.freeze({
  distrik: '', resort: '', huria: '', tahun: '', bulan: '', kategori: '',
})

const num = (v) => Number(v) || 0
const clean = (s) => String(s || '').trim()

export function filterRows(rows = [], sel = {}, { ignoreKategori = false } = {}) {
  return (rows || []).filter((r) =>
    (!sel.distrik || r.distrik === sel.distrik) &&
    (!sel.resort || r.resort === sel.resort) &&
    (!sel.huria || r.huria === sel.huria) &&
    (!sel.tahun || String(r.bulan || r.periode || '').startsWith(String(sel.tahun))) &&
    (!sel.bulan || (r.bulan || r.periode) === sel.bulan) &&
    (ignoreKategori || !sel.kategori || r.kategori === sel.kategori))
}

export function sumBy(rows, keyFn, valueKey) {
  const out = new Map()
  for (const r of rows || []) {
    const key = keyFn(r)
    out.set(key, (out.get(key) || 0) + num(r[valueKey]))
  }
  return out
}

export const sumValue = (rows, key) => (rows || []).reduce((total, r) => total + num(r[key]), 0)

export function drillLevel(sel = {}) {
  if (sel.resort) return { level: 'huria', key: 'huria', title: 'Huria' }
  if (sel.distrik) return { level: 'resort', key: 'resort', title: 'Resort' }
  return { level: 'distrik', key: 'distrik', title: 'Distrik' }
}

export function rankBy(rows, sel, valueKey = 'totalPemasukan') {
  const { key } = drillLevel(sel)
  const map = sumBy(rows, (r) => r[key], valueKey)
  const total = [...map.values()].reduce((a, b) => a + b, 0)
  return [...map.entries()]
    .filter(([name, value]) => name && value > 0)
    .map(([label, value]) => ({ key: label, label, value, share: total > 0 ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

export function optionsFromRows(rows, sel = {}) {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'))
  const distrik = unique(rows.map((r) => r.distrik))
  const resort = unique(rows.filter((r) => !sel.distrik || r.distrik === sel.distrik).map((r) => r.resort))
  const huria = unique(rows.filter((r) => (!sel.distrik || r.distrik === sel.distrik) && (!sel.resort || r.resort === sel.resort)).map((r) => r.huria))
  const tahun = unique(rows.map((r) => String(r.bulan || '').slice(0, 4))).reverse()
  const bulan = unique(rows.filter((r) => !sel.tahun || String(r.bulan || '').startsWith(sel.tahun)).map((r) => r.bulan)).reverse()
  return { distrik, resort, huria, tahun, bulan }
}

/**
 * Kategori hanya berlaku pada pemasukan. Metrik kewajiban dan pelunasan tidak boleh
 * dipotong per kategori karena kewajiban punya grain Huria + periode.
 * categoryRows berasal dari endpoint /dw/kategori (bukan /dw/cube).
 */
export function applyCategoryToCube(cube, categoryRows, kategori) {
  if (!kategori) return cube
  const map = sumBy((categoryRows || []).filter((r) => r.kategori === kategori),
    (r) => `${r.idHuria}|${r.bulan}`, 'nominal')
  return (cube || []).map((r) => ({
    ...r, totalPemasukan: map.get(`${r.idHuria}|${r.bulan}`) || 0,
  }))
}

/**
 * Hanya bulan yang telah berakhir sebelum cut-off data boleh dijadikan pembanding.
 * Ini TIDAK membuktikan laporan periode itu sudah lengkap.
 */
export function latestCompleteMonth(cube, cutOff) {
  const months = [...new Set((cube || []).map((r) => r.bulan).filter(Boolean))].sort()
  if (!months.length) return { latest: null, previous: null, months }
  const date = String(cutOff || '').slice(0, 10)
  const latest = [...months].reverse().find((m) => !date || `${m}-01` < `${date.slice(0, 7)}-01`) || null
  const ix = months.indexOf(latest)
  return { latest, previous: ix > 0 ? months[ix - 1] : null, months }
}

export function rowsDueForSetoran(rows) {
  // Legacy export dipertahankan; penilaian tenggat HARUS memakai data kewajiban,
  // bukan cube setoran-vs-alokasi bulan kalender.
  return (rows || []).filter((r) => r.statusVerifikasi === 'TERVERIFIKASI' && !r.isSynthetic && r.tanggalJatuhTempo)
}

export function computeKpis(cube, obligations = [], { kewajibanAvailable = false, kategori = '' } = {}) {
  const pemasukan = sumValue(cube, 'totalPemasukan')
  const kewajiban = sumValue(obligations, 'nominalKewajiban')
  const dibayar = sumValue(obligations, 'totalDibayar')
  const sisa = sumValue(obligations, 'sisaKewajiban')
  const verifiable = rowsDueForSetoran(obligations)
  const atCutoff = verifiable.filter((r) => r.tanggalJatuhTempo <= (r.asOf || '0000-00-00'))
  const timely = atCutoff.filter((r) => r.status === 'TEPAT_WAKTU').length
  const percent = atCutoff.length ? timely / atCutoff.length * 100 : null
  return [
    { id: 'pemasukan', label: kategori ? `Pemasukan · ${kategori}` : 'Pemasukan', value: pemasukan, format: 'rupiah',
      note: kategori ? 'Filter kategori hanya berlaku untuk pemasukan dan aliran.' : 'Nominal pada periode dan wilayah terpilih.' },
    { id: 'kewajiban', label: 'Kewajiban pusat', value: kewajibanAvailable ? kewajiban : null, format: 'rupiah',
      note: kewajibanAvailable ? 'Menurut periode asal alokasi, bukan bulan pembayaran.' : 'Bangun ulang warehouse dengan skema kewajiban terbaru.' },
    { id: 'sisa', label: 'Sisa kewajiban', value: kewajibanAvailable ? sisa : null, format: 'rupiah',
      note: kewajibanAvailable ? `Dibayar ${Math.round(dibayar).toLocaleString('id-ID')} dari ${Math.round(kewajiban).toLocaleString('id-ID')} rupiah.` : 'Belum tersedia pada snapshot ini.' },
    { id: 'ketepatan', label: 'Ketepatan waktu terverifikasi', value: kewajibanAvailable ? percent : null, format: 'persen',
      note: !kewajibanAvailable ? 'Data kewajiban belum tersedia.' : atCutoff.length ? `${timely} dari ${atCutoff.length} kewajiban yang jatuh tempo dan memiliki aturan terverifikasi.` : 'Belum dapat dinilai: tidak ada tenggat terverifikasi yang sudah lewat.' },
  ]
}

export function buildInsights(cube, sel, obligations = [], { kewajibanAvailable = false } = {}) {
  const notes = { judul: {}, rekomendasi: [] }
  const ranked = rankBy(cube, sel)
  if (ranked.length) {
    const top = ranked[0]
    notes.judul.ranking = `Kontribusi pemasukan terbesar: ${top.label} (${top.share.toFixed(1)}%)`
    notes.rekomendasi.push(`Periksa komposisi pemasukan ${top.label} (${formatCompactRupiah(top.value)}) berdasarkan periode, wilayah, dan kategori yang dipilih.`)
  }
  if (!kewajibanAvailable) {
    notes.rekomendasi.push('Bangun ulang snapshot warehouse dari sumber yang disetujui untuk mengaktifkan analisis kewajiban dan pelunasan.')
    return notes
  }
  const unpaid = obligations.filter((r) => num(r.sisaKewajiban) > 0)
  if (unpaid.length) {
    notes.judul.kewajiban = `${unpaid.length} kewajiban masih memiliki sisa pelunasan (${formatCompactRupiah(sumValue(unpaid, 'sisaKewajiban'))})`
    notes.rekomendasi.push(`Tinjau ${unpaid.length} kewajiban dengan sisa ${formatCompactRupiah(sumValue(unpaid, 'sisaKewajiban'))} pada Monitoring Setoran. Belum lunas tidak otomatis berarti terlambat.`)
  } else if (obligations.length) {
    notes.judul.kewajiban = 'Tidak ditemukan sisa kewajiban pada cakupan snapshot yang dipilih'
  } else {
    notes.judul.kewajiban = 'Tidak ada kewajiban pada periode dan wilayah terpilih'
  }
  const unverified = obligations.filter((r) => !r.tanggalJatuhTempo || r.isSynthetic || r.statusVerifikasi !== 'TERVERIFIKASI')
  if (unverified.length) notes.rekomendasi.push(`${unverified.length} kewajiban belum memiliki tenggat yang terverifikasi; jangan menyimpulkan kepatuhan waktunya.`)
  const overdue = rowsDueForSetoran(obligations).filter((r) => r.status === 'TERLAMBAT_BELUM_LUNAS')
  if (overdue.length) notes.rekomendasi.push(`${overdue.length} kewajiban dengan tenggat terverifikasi perlu diperiksa karena berstatus lewat jatuh tempo dan belum lunas pada tanggal snapshot.`)
  return notes
}

export function toMonthlyTrend(cube, obligations = [], { months = 12 } = {}) {
  const monthSet = new Set([...(cube || []).map((r) => r.bulan), ...(obligations || []).map((r) => r.periode)])
  const labels = [...monthSet].filter(Boolean).sort().slice(-months)
  const pemasukan = sumBy(cube, (r) => r.bulan, 'totalPemasukan')
  const kewajiban = sumBy(obligations, (r) => r.periode, 'nominalKewajiban')
  const dibayar = sumBy(obligations, (r) => r.periode, 'totalDibayar')
  return labels.map((bulan) => ({ bulan, pemasukan: pemasukan.get(bulan) || 0,
    kewajiban: kewajiban.get(bulan) || 0, dibayar: dibayar.get(bulan) || 0 }))
}

export function toHeatmap(cube, sel, valueKey = 'totalPemasukan', { maxMonths = 12, maxRows = 12 } = {}) {
  const cols = [...new Set((cube || []).map((r) => r.bulan))].filter(Boolean).sort().slice(-maxMonths)
  const sums = sumBy(cube, (r) => r.huria, valueKey)
  let rows = [...sums.keys()].filter(Boolean).sort((a, b) => (sums.get(b) - sums.get(a)) || a.localeCompare(b))
  rows = rows.slice(0, maxRows)
  if (sel?.huria && !rows.includes(sel.huria) && sums.has(sel.huria)) rows = [...rows.slice(0, maxRows - 1), sel.huria]
  const matrix = {}
  for (const r of cube || []) {
    if (!cols.includes(r.bulan) || !rows.includes(r.huria)) continue
    const key = `${r.huria}|${r.bulan}`
    matrix[key] = (matrix[key] || 0) + num(r[valueKey])
  }
  return { rows, cols, matrix }
}

/** Sankey: ID unik per level, label pendek, Top N sumber + kategori lain.
 *  Data peruntukan tetap dipertahankan agar jumlah tidak berubah saat grup dibatasi.
 */
export function toSankey(aliran, sel = {}, { topSources = 6, topCategories = 6 } = {}) {
  const input = filterRows(aliran, sel)
  const sourceField = drillLevel(sel).key
  const sourceSums = sumBy(input, (r) => r[sourceField], 'nominal')
  const categorySums = sumBy(input, (r) => r.kategori, 'nominal')
  const topSrc = new Set([...sourceSums].sort((a, b) => b[1] - a[1]).slice(0, topSources).map(([k]) => k))
  const topCat = new Set([...categorySums].sort((a, b) => b[1] - a[1]).slice(0, topCategories).map(([k]) => k))
  const lmap = new Map()
  const add = (source, target, value) => {
    const key = `${source}|${target}`
    lmap.set(key, (lmap.get(key) || 0) + value)
  }
  const nodes = new Map()
  for (const r of input) {
    const value = num(r.nominal)
    if (value <= 0) continue
    const src = topSrc.has(r[sourceField]) ? clean(r[sourceField]) : 'Wilayah lainnya'
    const cat = topCat.has(r.kategori) ? clean(r.kategori) : 'Kategori lainnya'
    const dest = clean(r.peruntukan)
    if (!src || !cat || !dest) continue
    const ids = [`wilayah:${src}`, `kategori:${cat}`, `tujuan:${dest}`]
    ;[src, cat, dest].forEach((label, i) => {
      if (!nodes.has(ids[i])) nodes.set(ids[i], { id: ids[i], label, level: i,
        selectable: i === 1 ? label !== 'Kategori lainnya' : i === 0 ? label !== 'Wilayah lainnya' : false })
    })
    add(ids[0], ids[1], value)
    add(ids[1], ids[2], value)
  }
  const links = [...lmap].map(([key, value]) => {
    const [source, target] = key.split('|')
    return { source, target, value }
  })
  return { nodes: [...nodes.values()], links, sourceField }
}

export function toSmallMultiples(cube, sel = {}, { max = 8, months = 12 } = {}) {
  const key = drillLevel(sel).key
  const labels = [...new Set((cube || []).map((r) => r.bulan))].filter(Boolean).sort().slice(-months)
  const totals = sumBy(cube, (r) => r[key], 'totalPemasukan')
  return [...totals].filter(([name]) => name).sort((a, b) => b[1] - a[1]).slice(0, max).map(([name]) => {
    const series = sumBy(cube.filter((r) => r[key] === name), (r) => r.bulan, 'totalPemasukan')
    return { key: name, title: name, points: labels.map((label) => ({ x: label, y: series.get(label) || 0 })) }
  })
}

/** Legacy helpers tetap diekspor agar kode lain yang mungkin memakainya tidak rusak. */
export function toBubbleFrames(sesi, sel = {}) {
  const groups = new Map()
  for (const r of filterRows(sesi, sel)) {
    const key = `${r.bulan}|${r.huria}`
    const g = groups.get(key) || { bulan: r.bulan, huria: r.huria, distrik: r.distrik, jemaat: r.jumlahJemaat, hadir: 0, pelean: 0, n: 0 }
    g.hadir += num(r.hadir); g.pelean += num(r.pelean); g.n += 1
    groups.set(key, g)
  }
  const frames = {}
  groups.forEach((g) => { (frames[g.bulan] ||= []).push({ id: g.huria, name: g.huria, group: g.distrik, x: Math.round(g.hadir / g.n), y: g.pelean, r: g.jemaat }) })
  return frames
}

export function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}
export function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
export function annotationsFor(history) {
  if (!history.length) return []
  const year = Number(history[0].label.slice(0, 4))
  const easter = isoWeekLabel(easterDate(year))
  const peak = history.reduce((a, b) => b.value > a.value ? b : a, history[0])
  return [...(history.some((r) => r.label === easter) ? [{ label: easter, text: 'Paskah' }] : []), ...(peak.label !== easter ? [{ label: peak.label, text: 'Puncak' }] : [])]
}

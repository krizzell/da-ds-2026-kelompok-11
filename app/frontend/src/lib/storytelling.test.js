import { describe, expect, it } from 'vitest'
import {
  EMPTY_SELECTION, filterRows, drillLevel, rankBy, latestCompleteMonth,
  applyCategoryToCube, computeKpis, buildInsights, toSankey, toHeatmap, toSmallMultiples,
  toMonthlyTrend, optionsFromRows,
} from './storytelling'

const row = (extra = {}) => ({
  distrik: 'D1', resort: 'R1', huria: 'H1', idHuria: 'ID1', bulan: '2026-01',
  jumlahSesi: 4, totalHadir: 100, totalPelean: 1000,
  totalPemasukan: 10000, alokasiPusat: 5500, setoranDibayar: 5500,
  ...extra,
})
const cube = [row(), row({ bulan: '2026-02', totalPemasukan: 11000 }), row({ distrik: 'D2', resort: 'R2', huria: 'H2', idHuria: 'ID2' })]
const obligation = (extra = {}) => ({ distrik: 'D1', resort: 'R1', huria: 'H1', idHuria: 'ID1',
  periode: '2026-01', nominalKewajiban: 5000, totalDibayar: 3000, sisaKewajiban: 2000,
  tanggalJatuhTempo: '2026-02-10', status: 'TERLAMBAT_BELUM_LUNAS', asOf: '2026-03-01',
  statusVerifikasi: 'TERVERIFIKASI', isSynthetic: 0, ...extra })

describe('Storytelling v2', () => {
  it('filter hirarki dan periode diterapkan konsisten', () => {
    expect(filterRows(cube, { distrik: 'D1', tahun: '2026' })).toHaveLength(2)
    expect(filterRows(cube, { huria: 'H1', bulan: '2026-01' })).toHaveLength(1)
    expect(optionsFromRows(cube, { distrik: 'D1' }).resort).toEqual(['R1'])
    expect(drillLevel(EMPTY_SELECTION).key).toBe('distrik')
    expect(drillLevel({ distrik: 'D1' }).key).toBe('resort')
  })

  it('kategori pemasukan tidak mengganti nilai kewajiban dan tidak menyisakan pemasukan tak sesuai', () => {
    const data = [{ idHuria: 'ID1', bulan: '2026-01', kategori: 'Pelean Minggu', nominal: 3500 }]
    const filtered = applyCategoryToCube(cube, data, 'Pelean Minggu')
    expect(filtered[0].totalPemasukan).toBe(3500)
    expect(filtered[1].totalPemasukan).toBe(0)
    expect(filtered[2].totalPemasukan).toBe(0)
    const kpis = computeKpis(filtered, [obligation()], { kategori: 'Pelean Minggu', kewajibanAvailable: true })
    expect(kpis[0].value).toBe(3500)
    expect(kpis[1].value).toBe(5000)
  })

  it('kewajiban dihitung per periode, bukan melalui setoran bulan berjalan', () => {
    const k = computeKpis(cube, [obligation()], { kewajibanAvailable: true })
    expect(k).toHaveLength(4)
    expect(k[1].value).toBe(5000)
    expect(k[2].value).toBe(2000)
    expect(k[3].value).toBe(0)
  })

  it('status sintetis atau belum diverifikasi tidak boleh dianggap patuh/tidak patuh', () => {
    const k = computeKpis(cube, [obligation({ isSynthetic: 1 }), obligation({ statusVerifikasi: 'SIMULASI' })], { kewajibanAvailable: true })
    expect(k[3].value).toBe(null)
    const insight = buildInsights(cube, {}, [obligation({ isSynthetic: 1 })], { kewajibanAvailable: true })
    expect(insight.rekomendasi.join(' ')).toMatch(/belum memiliki tenggat yang terverifikasi/i)
  })

  it('warehouse lama tidak dilaporkan seolah kewajibannya bernilai 0', () => {
    const k = computeKpis(cube, [], { kewajibanAvailable: false })
    expect(k[1].value).toBe(null)
    expect(k[2].value).toBe(null)
    expect(k[3].value).toBe(null)
  })

  it('bulan cutoff parsial tidak disalahartikan sebagai bulan lengkap', () => {
    expect(latestCompleteMonth(cube, '2026-02-12').latest).toBe('2026-01')
    expect(latestCompleteMonth(cube, '2026-01-12').latest).toBe(null)
  })

  it('Sankey punya ID node unik dan grouping Top N mempertahankan total', () => {
    const data = [
      { distrik: 'D1', resort: 'R1', huria: 'H1', bulan: '2026-01', kategori: 'Pelean Minggu', peruntukan: 'Setoran Pusat', nominal: 55 },
      { distrik: 'D1', resort: 'R1', huria: 'H1', bulan: '2026-01', kategori: 'Pelean Minggu', peruntukan: 'Kas Huria', nominal: 45 },
      { distrik: 'D2', resort: 'R2', huria: 'H2', bulan: '2026-01', kategori: 'Setoran Pusat', peruntukan: 'Setoran Pusat', nominal: 40 },
    ]
    const s = toSankey(data, {}, { topSources: 1, topCategories: 1 })
    expect(s.nodes.some((n) => n.id === 'kategori:Setoran Pusat')).toBe(false) // Kategori bukan Top 1
    expect(s.nodes.some((n) => n.id === 'tujuan:Setoran Pusat')).toBe(true)
    expect(s.nodes.some((n) => n.id === 'wilayah:Wilayah lainnya')).toBe(true)
    const totalOutgoing = s.links.filter((l) => l.source.startsWith('wilayah:')).reduce((sum, l) => sum + l.value, 0)
    expect(totalOutgoing).toBe(140)
  })

  it('ranking, heatmap dan small multiples membatasi skala', () => {
    expect(rankBy(cube, {}, 'totalPemasukan')[0].key).toBe('D1')
    expect(toHeatmap(cube, {}, 'totalPemasukan', { maxMonths: 1 }).cols).toHaveLength(1)
    expect(toSmallMultiples(cube, {}, { max: 1 }).length).toBe(1)
    expect(toMonthlyTrend(cube, [obligation()], { months: 2 })).toHaveLength(2)
  })
})

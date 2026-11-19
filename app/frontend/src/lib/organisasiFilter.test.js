import { describe, it, expect } from 'vitest'
import {
  LEVELS,
  MAX_SELECTION,
  EMPTY_SELECTION,
  resolveComparisonLevel,
  pruneSelection,
  enforceLimit,
  findExcludedParents,
  buildSummary,
  toQuery,
  fromQuery,
  pickTop,
  getEntityCheckboxState,
  toggleHierarchyEntity,
} from './organisasiFilter'

// Mock Data Hierarki Wilayah HKBP dengan nama kembar untuk pengujian kasus tepi
const mockOptions = {
  distrik: [
    { id: 'D-1', nama: 'Distrik I Silindung' },
    { id: 'D-2', nama: 'Distrik II Humbang' },
    { id: 'D-3', nama: 'Distrik III Toba' },
  ],
  resort: [
    { id: 'R-1.1', nama: 'Resort Pearaja', idInduk: 'D-1', total: 50000000 },
    { id: 'R-1.2', nama: 'Resort Tarutung Kota', idInduk: 'D-1', total: 75000000 },
    { id: 'R-2.1', nama: 'Resort Dolok Sanggul', idInduk: 'D-2', total: 60000000 },
    { id: 'R-2.2', nama: 'Resort Lintongnihuta', idInduk: 'D-2', total: 40000000 },
    { id: 'R-3.1', nama: 'Resort Balige', idInduk: 'D-3', total: 90000000 },
  ],
  huria: [
    { id: 'H-1.1.1', nama: 'HKBP Pearaja', idInduk: 'R-1.1', total: 30000000 },
    { id: 'H-1.1.2', nama: 'HKBP Pardomuan', idInduk: 'R-1.1', total: 20000000 }, // Nama kembar di Resort Pearaja
    { id: 'H-2.1.1', nama: 'HKBP Dolok Sanggul Kota', idInduk: 'R-2.1', total: 45000000 },
    { id: 'H-2.1.2', nama: 'HKBP Pardomuan', idInduk: 'R-2.1', total: 15000000 }, // Nama kembar di Resort Dolok Sanggul
  ],
}

describe('organisasiFilter - resolveComparisonLevel', () => {
  it('mengembalikan null jika seleksi kosong, null, atau undefined', () => {
    expect(resolveComparisonLevel(null)).toBeNull()
    expect(resolveComparisonLevel(undefined)).toBeNull()
    expect(resolveComparisonLevel(EMPTY_SELECTION)).toBeNull()
    expect(resolveComparisonLevel({ distrik: [], resort: [], huria: [] })).toBeNull()
  })

  it('mengembalikan distrik jika hanya distrik yang dipilih', () => {
    const selected = { ...EMPTY_SELECTION, distrik: ['D-1', 'D-2'] }
    expect(resolveComparisonLevel(selected)).toBe('distrik')
  })

  it('mengembalikan resort jika distrik dan resort dipilih', () => {
    const selected = { ...EMPTY_SELECTION, distrik: ['D-1'], resort: ['R-1.1', 'R-1.2'] }
    expect(resolveComparisonLevel(selected)).toBe('resort')
  })

  it('mengembalikan huria sebagai level terdalam saat huria dipilih', () => {
    const selected = {
      ...EMPTY_SELECTION,
      distrik: ['D-1'],
      resort: ['R-1.1'],
      huria: ['H-1.1.1', 'H-1.1.2'],
    }
    expect(resolveComparisonLevel(selected)).toBe('huria')
  })
})

describe('organisasiFilter - pruneSelection', () => {
  it('menghapus semua turunan jika induk distrik dicabut', () => {
    const selected = {
      distrik: [], // Distrik kosong
      resort: ['R-1.1'],
      huria: ['H-1.1.1'],
    }

    const pruned = pruneSelection(selected, mockOptions)
    expect(pruned.distrik).toEqual([])
    expect(pruned.resort).toEqual([])
    expect(pruned.huria).toEqual([])
  })

  it('membuang resort yang induk distriknya tidak dicentang', () => {
    const selected = {
      distrik: ['D-1'], // Hanya D-1
      resort: ['R-1.1', 'R-2.1'], // R-2.1 milik D-2 (tidak dicentang)
      huria: ['H-1.1.1', 'H-2.1.1'], // H-2.1.1 milik R-2.1
    }

    const pruned = pruneSelection(selected, mockOptions)
    expect(pruned.distrik).toEqual(['D-1'])
    expect(pruned.resort).toEqual(['R-1.1'])
    expect(pruned.huria).toEqual(['H-1.1.1'])
  })

  it('membuang ID tidak valid yang tidak ada di daftar opsi', () => {
    const selected = {
      distrik: ['D-1', 'ID-PALSU'],
      resort: ['R-1.1', 'R-TIDAK-ADA'],
      huria: [],
    }

    const pruned = pruneSelection(selected, mockOptions)
    expect(pruned.distrik).toEqual(['D-1'])
    expect(pruned.resort).toEqual(['R-1.1'])
  })

  it('menangani kasus tepi nama kembar di induk berbeda secara independen', () => {
    // HKBP Pardomuan ada dua: H-1.1.2 di R-1.1 dan H-2.1.2 di R-2.1
    const selected = {
      distrik: ['D-1'], // Hanya D-1 yang dicentang
      resort: ['R-1.1'], // Hanya R-1.1 yang dicentang
      huria: ['H-1.1.2', 'H-2.1.2'], // Memilih kedua HKBP Pardomuan
    }

    const pruned = pruneSelection(selected, mockOptions)
    // H-1.1.2 tetap ada karena induknya R-1.1 dicentang
    // H-2.1.2 dibuang karena induknya R-2.1 tidak dicentang
    expect(pruned.huria).toEqual(['H-1.1.2'])
  })
})

describe('organisasiFilter - enforceLimit', () => {
  it('tidak memotong jika jumlah item di bawah atau sama dengan batas maksimal 6', () => {
    const ids = ['1', '2', '3']
    const result = enforceLimit(ids, MAX_SELECTION)
    expect(result.ids).toEqual(['1', '2', '3'])
    expect(result.isTruncated).toBe(false)
    expect(result.truncatedCount).toBe(0)
    expect(result.max).toBe(6)
  })

  it('memotong ke batas maksimal 6 jika item lebih dari 6 dan memberi tahu', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8']
    const result = enforceLimit(ids, 6)
    expect(result.ids).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(result.isTruncated).toBe(true)
    expect(result.truncatedCount).toBe(2)
  })

  it('menangani input array kosong dan non-array secara aman', () => {
    expect(enforceLimit([]).ids).toEqual([])
    expect(enforceLimit([]).isTruncated).toBe(false)
    expect(enforceLimit(null).ids).toEqual([])
  })
})

describe('organisasiFilter - findExcludedParents', () => {
  it('mengembalikan array kosong jika level perbandingan adalah distrik atau seleksi kosong', () => {
    expect(findExcludedParents(EMPTY_SELECTION, mockOptions)).toEqual([])
    expect(
      findExcludedParents({ ...EMPTY_SELECTION, distrik: ['D-1', 'D-2'] }, mockOptions)
    ).toEqual([])
  })

  it('mendeteksi distrik yang dicentang tetapi tidak punya resort terpilih', () => {
    const selected = {
      distrik: ['D-1', 'D-2'],
      resort: ['R-1.1', 'R-1.2'], // Semua resort berasal dari D-1, tidak ada dari D-2
      huria: [],
    }

    const excluded = findExcludedParents(selected, mockOptions)
    expect(excluded).toHaveLength(1)
    expect(excluded[0]).toEqual({
      level: 'distrik',
      id: 'D-2',
      nama: 'Distrik II Humbang',
      reason: 'tidak ikut karena resort dipilih',
    })
  })

  it('mendeteksi induk bertingkat (distrik dan resort) yang tidak ikut pada level huria', () => {
    const selected = {
      distrik: ['D-1', 'D-2'],
      resort: ['R-1.1', 'R-1.2', 'R-2.1'],
      huria: ['H-1.1.1'], // Hanya huria di bawah R-1.1 (D-1)
    }

    const excluded = findExcludedParents(selected, mockOptions)
    // D-2 tidak punya huria terpilih
    // R-1.2 tidak punya huria terpilih
    // R-2.1 tidak punya huria terpilih
    expect(excluded).toContainEqual({
      level: 'distrik',
      id: 'D-2',
      nama: 'Distrik II Humbang',
      reason: 'tidak ikut karena huria dipilih',
    })
    expect(excluded).toContainEqual({
      level: 'resort',
      id: 'R-1.2',
      nama: 'Resort Tarutung Kota',
      reason: 'tidak ikut karena huria dipilih',
    })
    expect(excluded).toContainEqual({
      level: 'resort',
      id: 'R-2.1',
      nama: 'Resort Dolok Sanggul',
      reason: 'tidak ikut karena huria dipilih',
    })
  })

  it('mengembalikan array kosong jika semua induk memiliki turunan aktif', () => {
    const selected = {
      distrik: ['D-1', 'D-2'],
      resort: ['R-1.1', 'R-2.1'], // R-1.1 mewakili D-1, R-2.1 mewakili D-2
      huria: [],
    }

    const excluded = findExcludedParents(selected, mockOptions)
    expect(excluded).toEqual([])
  })
})

describe('organisasiFilter - buildSummary', () => {
  it('menampilkan petunjuk awal jika belum ada wilayah yang dipilih', () => {
    expect(buildSummary(null, EMPTY_SELECTION)).toBe(
      'Pilih minimal satu wilayah untuk mulai membandingkan'
    )
    expect(buildSummary('distrik', { distrik: [] })).toBe(
      'Pilih minimal satu wilayah untuk mulai membandingkan'
    )
  })

  it('menampilkan ringkasan analisis tunggal untuk 1 item', () => {
    expect(buildSummary('distrik', { distrik: ['D-1'] }, mockOptions)).toBe(
      'Analisis 1 distrik'
    )
  })

  it('menampilkan perbandingan distrik majemuk', () => {
    expect(buildSummary('distrik', { distrik: ['D-1', 'D-2'] }, mockOptions)).toBe(
      'Membandingkan 2 distrik'
    )
  })

  it('menampilkan perbandingan resort dengan induk distrik', () => {
    const selected = {
      distrik: ['D-1', 'D-2'],
      resort: ['R-1.1', 'R-1.2', 'R-2.1'], // 3 resort dari 2 distrik (D-1 dan D-2)
    }
    expect(buildSummary('resort', selected, mockOptions)).toBe(
      'Membandingkan 3 resort dari 2 distrik'
    )
  })

  it('menampilkan perbandingan huria dengan induk resort', () => {
    const selected = {
      distrik: ['D-1'],
      resort: ['R-1.1'],
      huria: ['H-1.1.1', 'H-1.1.2'],
    }
    expect(buildSummary('huria', selected, mockOptions)).toBe(
      'Membandingkan 2 huria dari 1 resort'
    )
  })
})

describe('organisasiFilter - toQuery & fromQuery', () => {
  it('mengonversi state filter dan periode menjadi URL query string dengan benar', () => {
    const state = {
      selected: {
        distrik: ['1', '2'],
        resort: ['5', '6'],
        huria: [],
      },
      periode: {
        mode: 'tahun',
        tahun: '2026',
        bulan: '',
        mingguISO: '',
        startDate: '',
        endDate: '',
      },
    }

    const query = toQuery(state)
    expect(query).toBe('distrik=1%2C2&resort=5%2C6&mode=tahun&tahun=2026')
  })

  it('mengurai query string kembali ke struktur state secara akurat', () => {
    const query = '?distrik=1,2&resort=5,6&mode=tahun&tahun=2026'
    const parsed = fromQuery(query)

    expect(parsed.selected.distrik).toEqual(['1', '2'])
    expect(parsed.selected.resort).toEqual(['5', '6'])
    expect(parsed.selected.huria).toEqual([])
    expect(parsed.periode.mode).toBe('tahun')
    expect(parsed.periode.tahun).toBe('2026')
  })

  it('menangani input query kosong atau string kotor dengan anggun', () => {
    const parsed = fromQuery('?distrik=1,,2&resort=&&mode=')
    expect(parsed.selected.distrik).toEqual(['1', '2'])
    expect(parsed.selected.resort).toEqual([])
    expect(parsed.periode.mode).toBe('tahun') // Default fallback
    expect(parsed.periode.tahun).toBe('2026')
  })

  it('bekerja roundtrip antara toQuery dan fromQuery', () => {
    const originalState = {
      selected: {
        distrik: ['D-1', 'D-2'],
        resort: ['R-1.1'],
        huria: ['H-1.1.1'],
      },
      periode: {
        mode: 'bulan',
        tahun: '2026',
        bulan: '05',
        mingguISO: '',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      },
    }

    const q = toQuery(originalState)
    const restored = fromQuery(q)

    expect(restored.selected).toEqual(originalState.selected)
    expect(restored.periode).toMatchObject(originalState.periode)
    expect(restored.periode.bulanAwal).toBe('2026-05')
    expect(restored.periode.bulanAkhir).toBe('2026-05')
  })
})

describe('organisasiFilter - pickTop', () => {
  it('memilih 2 item dengan total tertinggi', () => {
    const top2 = pickTop(mockOptions.resort, 2)
    // Resort Balige (90 jt) & Resort Tarutung Kota (75 jt)
    expect(top2).toEqual(['R-3.1', 'R-1.2'])
  })

  it('memakai urutan awal jika total tidak didefinisikan', () => {
    const optsWithoutTotal = [
      { id: 'A', nama: 'Item A' },
      { id: 'B', nama: 'Item B' },
      { id: 'C', nama: 'Item C' },
    ]
    expect(pickTop(optsWithoutTotal, 2)).toEqual(['A', 'B'])
  })

  it('membatasi pemilihan sesuai batas maksimum', () => {
    const manyOpts = Array.from({ length: 10 }, (_, i) => ({ id: `ID-${i}`, total: i * 10 }))
    const result = pickTop(manyOpts, 8, 6)
    expect(result).toHaveLength(6)
  })
})

describe('organisasiFilter - getEntityCheckboxState', () => {
  const hierarchyD1 = {
    childIds: ['R-1.1', 'R-1.2'],
    descendantHuriaIds: ['H-1.1.1', 'H-1.1.2'],
  }
  const hierarchyR11 = {
    parentId: 'D-1',
    childIds: ['H-1.1.1', 'H-1.1.2'],
  }
  const hierarchyH111 = {
    parentId: 'R-1.1',
    grandparentId: 'D-1',
  }

  it('level distrik: distrik terpilih membuat seluruh resort dan huria di bawahnya checked', () => {
    const selected = { distrik: ['D-1'], resort: [], huria: [] }

    // Distrik D-1 checked
    expect(getEntityCheckboxState('distrik', 'D-1', selected, hierarchyD1)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Resort R-1.1 di bawah D-1 otomatis checked
    expect(getEntityCheckboxState('resort', 'R-1.1', selected, hierarchyR11)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Huria H-1.1.1 di bawah D-1 otomatis checked
    expect(getEntityCheckboxState('huria', 'H-1.1.1', selected, hierarchyH111)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Wilayah di distrik lain (D-2) unchecked
    expect(getEntityCheckboxState('distrik', 'D-2', selected)).toEqual({
      checked: false,
      indeterminate: false,
    })
  })

  it('level resort: resort terpilih membuat huria di bawahnya checked dan induk distrik indeterminate jika sebagian', () => {
    const selected = { distrik: ['D-1'], resort: ['R-1.1'], huria: [] }

    // Resort R-1.1 checked
    expect(getEntityCheckboxState('resort', 'R-1.1', selected, hierarchyR11)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Huria H-1.1.1 di bawah R-1.1 otomatis checked
    expect(getEntityCheckboxState('huria', 'H-1.1.1', selected, hierarchyH111)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Distrik D-1 memiliki 2 resort (R-1.1 dan R-1.2), hanya R-1.1 terpilih -> indeterminate
    expect(getEntityCheckboxState('distrik', 'D-1', selected, hierarchyD1)).toEqual({
      checked: false,
      indeterminate: true,
    })
    // Resort R-1.2 unchecked
    expect(getEntityCheckboxState('resort', 'R-1.2', selected, { parentId: 'D-1', childIds: [] })).toEqual({
      checked: false,
      indeterminate: false,
    })
  })

  it('level resort: induk distrik checked jika seluruh resort di bawahnya terpilih', () => {
    const selected = { distrik: ['D-1'], resort: ['R-1.1', 'R-1.2'], huria: [] }

    expect(getEntityCheckboxState('distrik', 'D-1', selected, hierarchyD1)).toEqual({
      checked: true,
      indeterminate: false,
    })
  })

  it('level huria: hanya huria terpilih yang checked, induk resort dan kakek distrik indeterminate', () => {
    const selected = { distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1'] }

    // Huria H-1.1.1 checked
    expect(getEntityCheckboxState('huria', 'H-1.1.1', selected, hierarchyH111)).toEqual({
      checked: true,
      indeterminate: false,
    })
    // Huria H-1.1.2 unchecked
    expect(getEntityCheckboxState('huria', 'H-1.1.2', selected, { parentId: 'R-1.1', grandparentId: 'D-1' })).toEqual({
      checked: false,
      indeterminate: false,
    })
    // Resort R-1.1 punya 2 huria, hanya 1 terpilih -> indeterminate
    expect(getEntityCheckboxState('resort', 'R-1.1', selected, hierarchyR11)).toEqual({
      checked: false,
      indeterminate: true,
    })
    // Distrik D-1 -> indeterminate
    expect(getEntityCheckboxState('distrik', 'D-1', selected, hierarchyD1)).toEqual({
      checked: false,
      indeterminate: true,
    })
  })

  it('level huria: induk resort checked jika seluruh huria di bawahnya terpilih', () => {
    const selected = { distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1', 'H-1.1.2'] }

    expect(getEntityCheckboxState('resort', 'R-1.1', selected, hierarchyR11)).toEqual({
      checked: true,
      indeterminate: false,
    })
  })
})

describe('organisasiFilter - toggleHierarchyEntity (Pemilihan 1 & 2 Distrik, 1 & 2 Resort, 1 & 2 HKBP)', () => {
  const context = {
    allResorts: mockOptions.resort,
    allHurias: mockOptions.huria,
  }

  it('1 Distrik: memilih 1 distrik menghasilkan 1 entitas pembanding level distrik', () => {
    const res = toggleHierarchyEntity('distrik', 'D-1', EMPTY_SELECTION, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection).toEqual({
      distrik: ['D-1'],
      resort: [],
      huria: [],
    })
    expect(resolveComparisonLevel(res.nextSelection)).toBe('distrik')
  })

  it('2 Distrik: memilih 2 distrik menghasilkan 2 entitas pembanding level distrik', () => {
    const current = { distrik: ['D-1'], resort: [], huria: [] }
    const res = toggleHierarchyEntity('distrik', 'D-2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection).toEqual({
      distrik: ['D-1', 'D-2'],
      resort: [],
      huria: [],
    })
    expect(resolveComparisonLevel(res.nextSelection)).toBe('distrik')
    expect(res.nextSelection.distrik).toHaveLength(2)
  })

  it('1 Resort: memilih 1 resort menghasilkan 1 entitas pembanding level resort', () => {
    const res = toggleHierarchyEntity('resort', 'R-1.1', EMPTY_SELECTION, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.resort).toEqual(['R-1.1'])
    expect(res.nextSelection.huria).toEqual([])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('resort')
  })

  it('2 Resort: memilih 2 resort menghasilkan 2 entitas pembanding level resort', () => {
    const current = { distrik: ['D-1'], resort: ['R-1.1'], huria: [] }
    const res = toggleHierarchyEntity('resort', 'R-1.2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.resort).toEqual(['R-1.1', 'R-1.2'])
    expect(res.nextSelection.huria).toEqual([])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('resort')
    expect(res.nextSelection.resort).toHaveLength(2)
  })

  it('1 HKBP: memilih 1 huria menghasilkan 1 entitas pembanding level huria', () => {
    const res = toggleHierarchyEntity('huria', 'H-1.1.1', EMPTY_SELECTION, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.huria).toEqual(['H-1.1.1'])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('huria')
  })

  it('2 HKBP: memilih 2 huria menghasilkan 2 entitas pembanding level huria', () => {
    const current = { distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1'] }
    const res = toggleHierarchyEntity('huria', 'H-1.1.2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.huria).toEqual(['H-1.1.1', 'H-1.1.2'])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('huria')
    expect(res.nextSelection.huria).toHaveLength(2)
  })

  it('pembatalan: uncheck 1 dari 2 HKBP menyisakan 1 HKBP pembanding', () => {
    const current = { distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1', 'H-1.1.2'] }
    const res = toggleHierarchyEntity('huria', 'H-1.1.2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.huria).toEqual(['H-1.1.1'])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('huria')
  })

  it('pembatalan: uncheck 1 dari 2 Resort menyisakan 1 Resort pembanding', () => {
    const current = { distrik: ['D-1'], resort: ['R-1.1', 'R-1.2'], huria: [] }
    const res = toggleHierarchyEntity('resort', 'R-1.2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.resort).toEqual(['R-1.1'])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('resort')
  })

  it('pembatalan: uncheck 1 dari 2 Distrik menyisakan 1 Distrik pembanding', () => {
    const current = { distrik: ['D-1', 'D-2'], resort: [], huria: [] }
    const res = toggleHierarchyEntity('distrik', 'D-2', current, context)
    expect(res.blocked).toBe(false)
    expect(res.nextSelection.distrik).toEqual(['D-1'])
    expect(resolveComparisonLevel(res.nextSelection)).toBe('distrik')
  })
})

describe('organisasiFilter - Agregasi data dan pencegahan penghitungan ganda', () => {
  it('agregasi distrik menjumlahkan seluruh huria di bawahnya tanpa duplikasi', () => {
    // Distrik I Silindung punya R-1.1 (Pearaja) dengan 2 huria: H-1.1.1 (30jt) dan H-1.1.2 (20jt)
    const huriasUnderD1 = mockOptions.huria.filter((h) => {
      const r = mockOptions.resort.find((res) => res.id === h.idInduk)
      return r && r.idInduk === 'D-1'
    })
    const totalD1 = huriasUnderD1.reduce((sum, h) => sum + h.total, 0)
    expect(totalD1).toBe(50000000) // 30jt + 20jt
  })

  it('agregasi resort menjumlahkan seluruh huria di dalam resort tersebut saja', () => {
    const huriasUnderR11 = mockOptions.huria.filter((h) => h.idInduk === 'R-1.1')
    const totalR11 = huriasUnderR11.reduce((sum, h) => sum + h.total, 0)
    expect(totalR11).toBe(50000000) // 30jt + 20jt
  })

  it('agregasi huria hanya menggunakan data huria tersebut', () => {
    const h111 = mockOptions.huria.find((h) => h.id === 'H-1.1.1')
    expect(h111.total).toBe(30000000)
  })

  it('pembentukan seri grafik Studio Visualisasi sesuai entitas yang dipilih langsung', () => {
    // Helper simulasi pemetaan entitas StudioVisualisasi
    const buildComparedEntities = (selected) => {
      const level = resolveComparisonLevel(selected)
      if (!level) return []
      const items = (selected[level] || []).map((id) => {
        const opt = mockOptions[level].find((o) => o.id === id)
        return { id, nama: opt?.nama || id }
      })

      return items.map((item) => {
        let matchedHurias = []
        if (level === 'huria') {
          matchedHurias = mockOptions.huria.filter((h) => h.id === item.id)
        } else if (level === 'resort') {
          matchedHurias = mockOptions.huria.filter((h) => h.idInduk === item.id)
        } else {
          matchedHurias = mockOptions.huria.filter((h) => {
            const r = mockOptions.resort.find((res) => res.id === h.idInduk)
            return r && r.idInduk === item.id
          })
        }
        return {
          id: item.id,
          name: item.nama,
          churches: matchedHurias,
          total: matchedHurias.reduce((sum, h) => sum + (h.total || 0), 0),
        }
      })
    }

    // 1. Memilih 1 Distrik -> 1 seri grafik (akumulasi seluruh HKBP di distrik tersebut)
    const entities1D = buildComparedEntities({ distrik: ['D-1'], resort: [], huria: [] })
    expect(entities1D).toHaveLength(1)
    expect(entities1D[0].name).toBe('Distrik I Silindung')
    expect(entities1D[0].churches).toHaveLength(2)
    expect(entities1D[0].total).toBe(50000000) // 30jt + 20jt

    // 2. Memilih 2 Distrik -> 2 seri grafik (komparasi akumulasi masing-masing distrik)
    const entities2D = buildComparedEntities({ distrik: ['D-1', 'D-2'], resort: [], huria: [] })
    expect(entities2D).toHaveLength(2)
    expect(entities2D[0].name).toBe('Distrik I Silindung')
    expect(entities2D[0].total).toBe(50000000) // D-1: H-1.1.1 (30jt) + H-1.1.2 (20jt)
    expect(entities2D[1].name).toBe('Distrik II Humbang')
    expect(entities2D[1].total).toBe(60000000) // D-2: H-2.1.1 (45jt) + H-2.1.2 (15jt)
    // Total akumulasi tidak menghitung ganda
    const totalAll2D = entities2D.reduce((sum, e) => sum + e.total, 0)
    expect(totalAll2D).toBe(110000000)

    // 3. Memilih 1 Resort -> 1 seri grafik (akumulasi seluruh HKBP di resort tersebut)
    const entities1R = buildComparedEntities({ distrik: ['D-1'], resort: ['R-1.1'], huria: [] })
    expect(entities1R).toHaveLength(1)
    expect(entities1R[0].name).toBe('Resort Pearaja')
    expect(entities1R[0].churches).toHaveLength(2)
    expect(entities1R[0].total).toBe(50000000)

    // 4. Memilih 2 Resort -> 2 seri grafik (komparasi masing-masing resort)
    const entities2R = buildComparedEntities({ distrik: ['D-1', 'D-2'], resort: ['R-1.1', 'R-2.1'], huria: [] })
    expect(entities2R).toHaveLength(2)
    expect(entities2R[0].name).toBe('Resort Pearaja')
    expect(entities2R[0].total).toBe(50000000)
    expect(entities2R[1].name).toBe('Resort Dolok Sanggul')
    expect(entities2R[1].total).toBe(60000000)

    // 5. Memilih 1 HKBP -> 1 seri grafik (data HKBP tersebut saja)
    const entities1H = buildComparedEntities({ distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1'] })
    expect(entities1H).toHaveLength(1)
    expect(entities1H[0].name).toBe('HKBP Pearaja')
    expect(entities1H[0].churches).toHaveLength(1)
    expect(entities1H[0].total).toBe(30000000)

    // 6. Memilih 2 HKBP -> 2 seri grafik (komparasi masing-masing HKBP)
    const entities2H = buildComparedEntities({ distrik: ['D-1'], resort: ['R-1.1'], huria: ['H-1.1.1', 'H-1.1.2'] })
    expect(entities2H).toHaveLength(2)
    expect(entities2H[0].name).toBe('HKBP Pearaja')
    expect(entities2H[0].total).toBe(30000000)
    expect(entities2H[1].name).toBe('HKBP Pardomuan')
    expect(entities2H[1].total).toBe(20000000)
  })
})


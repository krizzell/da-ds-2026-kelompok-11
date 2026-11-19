/**
 * @file organisasiFilter.js
 * Logika murni (tanpa ketergantungan React/DOM) untuk kartu filter "Lingkup dan periode".
 * Memenuhi aturan:
 * 1. Multi-pilih berjenjang (distrik -> resort -> huria)
 * 2. Level perbandingan = level terdalam yang punya minimal 1 centang
 * 3. Hapus berantai (pruning anak jika induk dicabut)
 * 4. Batas maksimal 6 item per perbandingan
 * 5. Deteksi induk yang dicentang namun tidak punya turunan di level perbandingan
 * 6. Pembuatan teks ringkasan perbandingan
 * 7. Serialisasi & parsing query URL dua arah (?distrik=&resort=&huria=&mode=&tahun=)
 */

export const LEVELS = ['distrik', 'resort', 'huria']

export const PARENT_LEVEL = {
  resort: 'distrik',
  huria: 'resort',
}

export const CHILD_LEVEL = {
  distrik: 'resort',
  resort: 'huria',
}

export const MAX_SELECTION = 6

export const EMPTY_SELECTION = {
  distrik: [],
  resort: [],
  huria: [],
}

import { defaultRangePeriod } from './periodeRange'

export const DEFAULT_PERIODE = defaultRangePeriod()

/**
 * Menentukan level perbandingan aktif.
 * Level perbandingan adalah level terdalam yang memiliki minimal satu ID terpilih.
 * @param {Record<string, string[]>} selected
 * @returns {'distrik' | 'resort' | 'huria' | null}
 */
export function resolveComparisonLevel(selected) {
  if (!selected) return null

  // Evaluasi dari level terdalam (huria) ke terluar (distrik)
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const lvl = LEVELS[i]
    const ids = selected[lvl]
    if (Array.isArray(ids) && ids.length > 0) {
      return lvl
    }
  }

  return null
}

/**
 * Membuang pilihan yang induknya tidak lagi dicentang, berantai ke bawah.
 * Jika optionsByLevel tersedia, juga membuang ID yang tidak valid.
 * @param {Record<string, string[]>} selected
 * @param {Record<string, Array<{id: string, idInduk?: string}>>} [optionsByLevel]
 * @returns {Record<string, string[]>} objek selected baru yang sudah dipangkas
 */
export function pruneSelection(selected, optionsByLevel = {}) {
  const result = {
    distrik: Array.isArray(selected?.distrik) ? [...selected.distrik] : [],
    resort: Array.isArray(selected?.resort) ? [...selected.resort] : [],
    huria: Array.isArray(selected?.huria) ? [...selected.huria] : [],
  }

  // 1. Validasi distrik terhadap opsi (jika opsi distrik tersedia)
  if (Array.isArray(optionsByLevel.distrik) && optionsByLevel.distrik.length > 0) {
    const validDistrikIds = new Set(optionsByLevel.distrik.map((d) => String(d.id)))
    result.distrik = result.distrik.filter((id) => validDistrikIds.has(String(id)))
  }

  // 2. Resort membutuhkan minimal 1 distrik terpilih
  if (result.distrik.length === 0) {
    result.resort = []
    result.huria = []
    return result
  }

  const selectedDistrikSet = new Set(result.distrik.map(String))
  if (Array.isArray(optionsByLevel.resort) && optionsByLevel.resort.length > 0) {
    const resortMap = new Map(optionsByLevel.resort.map((r) => [String(r.id), r]))
    result.resort = result.resort.filter((id) => {
      const opt = resortMap.get(String(id))
      return opt && selectedDistrikSet.has(String(opt.idInduk))
    })
  }

  // 3. Huria membutuhkan minimal 1 resort terpilih
  if (result.resort.length === 0) {
    result.huria = []
    return result
  }

  const selectedResortSet = new Set(result.resort.map(String))
  if (Array.isArray(optionsByLevel.huria) && optionsByLevel.huria.length > 0) {
    const huriaMap = new Map(optionsByLevel.huria.map((h) => [String(h.id), h]))
    result.huria = result.huria.filter((id) => {
      const opt = huriaMap.get(String(id))
      return opt && selectedResortSet.has(String(opt.idInduk))
    })
  }

  return result
}

/**
 * Memotong array ID sampai batas maksimal dan melaporkan status pemotongan.
 * @param {string[]} ids
 * @param {number} [max=6]
 * @returns {{ ids: string[], isTruncated: boolean, truncatedCount: number, max: number }}
 */
export function enforceLimit(ids, max = MAX_SELECTION) {
  const safeList = Array.isArray(ids) ? ids : []
  if (safeList.length <= max) {
    return {
      ids: safeList,
      isTruncated: false,
      truncatedCount: 0,
      max,
    }
  }

  return {
    ids: safeList.slice(0, max),
    isTruncated: true,
    truncatedCount: safeList.length - max,
    max,
  }
}

/**
 * Mencari induk yang dicentang tetapi tidak punya turunan terpilih pada level perbandingan.
 * @param {Record<string, string[]>} selected
 * @param {Record<string, Array<{id: string, nama: string, idInduk?: string}>>} optionsByLevel
 * @returns {Array<{ level: string, id: string, nama: string, reason: string }>}
 */
export function findExcludedParents(selected, optionsByLevel = {}) {
  const comparisonLevel = resolveComparisonLevel(selected)
  if (!comparisonLevel || comparisonLevel === 'distrik') {
    return []
  }

  const targetLevelIndex = LEVELS.indexOf(comparisonLevel)
  const selectedTargetIds = new Set((selected[comparisonLevel] || []).map(String))
  if (selectedTargetIds.size === 0) {
    return []
  }

  // Kumpulkan semua ancestor aktif dari item yang terpilih pada comparisonLevel
  // Trace ke atas: huria -> resort -> distrik
  const activeAncestors = {
    distrik: new Set(),
    resort: new Set(),
  }

  const huriaOpts = optionsByLevel.huria || []
  const resortOpts = optionsByLevel.resort || []

  const huriaMap = new Map(huriaOpts.map((o) => [String(o.id), o]))
  const resortMap = new Map(resortOpts.map((o) => [String(o.id), o]))

  if (comparisonLevel === 'huria') {
    selectedTargetIds.forEach((hId) => {
      const hOpt = huriaMap.get(hId)
      if (hOpt && hOpt.idInduk) {
        const rId = String(hOpt.idInduk)
        activeAncestors.resort.add(rId)
        const rOpt = resortMap.get(rId)
        if (rOpt && rOpt.idInduk) {
          activeAncestors.distrik.add(String(rOpt.idInduk))
        }
      }
    })
  } else if (comparisonLevel === 'resort') {
    selectedTargetIds.forEach((rId) => {
      const rOpt = resortMap.get(rId)
      if (rOpt && rOpt.idInduk) {
        activeAncestors.distrik.add(String(rOpt.idInduk))
      }
    })
  }

  const excluded = []

  // Periksa semua level induk di atas level perbandingan
  for (let i = 0; i < targetLevelIndex; i++) {
    const pLevel = LEVELS[i]
    const pSelected = (selected[pLevel] || []).map(String)
    const pOptions = optionsByLevel[pLevel] || []
    const pMap = new Map(pOptions.map((o) => [String(o.id), o.nama]))

    pSelected.forEach((pId) => {
      if (!activeAncestors[pLevel]?.has(pId)) {
        excluded.push({
          level: pLevel,
          id: pId,
          nama: pMap.get(pId) || pId,
          reason: `tidak ikut karena ${comparisonLevel} dipilih`,
        })
      }
    })
  }

  return excluded
}

/**
 * Membuat teks ringkasan untuk level perbandingan aktif.
 * Contoh: "Membandingkan 3 huria dari 2 resort"
 * Kata distrik, resort, huria tidak berubah saat jamak.
 * @param {'distrik' | 'resort' | 'huria' | null} level
 * @param {Record<string, string[]>} selected
 * @param {Record<string, Array<{id: string, nama: string, idInduk?: string}>>} [optionsByLevel]
 * @returns {string}
 */
export function buildSummary(level, selected, optionsByLevel = {}) {
  if (!level || !selected || !Array.isArray(selected[level]) || selected[level].length === 0) {
    return 'Pilih minimal satu wilayah untuk mulai membandingkan'
  }

  const count = selected[level].length
  const prefix = count === 1 ? 'Analisis 1' : `Membandingkan ${count}`

  if (level === 'distrik') {
    return `${prefix} distrik`
  }

  const pLevel = PARENT_LEVEL[level]
  let parentCount = 0

  // Hitung jumlah induk unik yang menaungi item-item terpilih
  const currentOptions = optionsByLevel[level] || []
  if (currentOptions.length > 0) {
    const optMap = new Map(currentOptions.map((o) => [String(o.id), String(o.idInduk || '')]))
    const parentIdSet = new Set()
    selected[level].forEach((id) => {
      const pId = optMap.get(String(id))
      if (pId) parentIdSet.add(pId)
    })
    parentCount = parentIdSet.size
  }

  // Fallback jika opsi belum tersedia: gunakan jumlah induk terpilih
  if (parentCount === 0 && selected[pLevel]) {
    parentCount = selected[pLevel].length
  }
  if (parentCount === 0) {
    parentCount = 1
  }

  return `${prefix} ${level} dari ${parentCount} ${pLevel}`
}

/**
 * Mengubah state filter & periode menjadi URL query string.
 * @param {{
 *   selected?: Record<string, string[]>,
 *   distrik?: string[],
 *   resort?: string[],
 *   huria?: string[],
 *   periode?: { mode?: string, tahun?: string, bulan?: string, mingguISO?: string, startDate?: string, endDate?: string },
 *   mode?: string,
 *   tahun?: string,
 *   bulan?: string,
 *   mingguISO?: string,
 *   startDate?: string,
 *   endDate?: string
 * }} state
 * @returns {string} query string tanpa awalan "?"
 */
export function toQuery(state = {}) {
  const params = new URLSearchParams()

  const sel = state.selected || state
  LEVELS.forEach((lvl) => {
    const list = sel[lvl]
    if (Array.isArray(list) && list.length > 0) {
      params.set(lvl, list.join(','))
    }
  })

  const per = state.periode || state
  if (per.mode) params.set('mode', per.mode)
  if (per.tahun) params.set('tahun', per.tahun)
  if (per.bulan) params.set('bulan', per.bulan)
  if (per.mingguISO) params.set('mingguISO', per.mingguISO)
  if (per.startDate) params.set('startDate', per.startDate)
  if (per.endDate) params.set('endDate', per.endDate)
  for (const key of ['tahunAwal', 'tahunAkhir', 'bulanAwal', 'bulanAkhir']) {
    if (per[key]) params.set(key, per[key])
  }

  return params.toString()
}

/**
 * Mengurai URL query string, URLSearchParams, atau objek menjadi state terstruktur.
 * @param {string | URLSearchParams | Record<string, string>} input
 * @returns {{
 *   selected: { distrik: string[], resort: string[], huria: string[] },
 *   periode: { mode: string, tahun: string, bulan: string, mingguISO: string, startDate: string, endDate: string }
 * }}
 */
export function fromQuery(input) {
  let searchParams

  if (typeof input === 'string') {
    const clean = input.startsWith('?') ? input.slice(1) : input
    searchParams = new URLSearchParams(clean)
  } else if (input instanceof URLSearchParams) {
    searchParams = input
  } else if (input && typeof input === 'object') {
    searchParams = new URLSearchParams()
    Object.entries(input).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.set(k, String(v))
      }
    })
  } else {
    searchParams = new URLSearchParams()
  }

  const selected = {
    distrik: parseIdList(searchParams.get('distrik')),
    resort: parseIdList(searchParams.get('resort')),
    huria: parseIdList(searchParams.get('huria')),
  }

  const periode = {
    mode: searchParams.get('mode') || DEFAULT_PERIODE.mode,
    tahun: searchParams.get('tahun') || DEFAULT_PERIODE.tahun,
    bulan: searchParams.get('bulan') || '',
    mingguISO: searchParams.get('mingguISO') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    tahunAwal: searchParams.get('tahunAwal') || searchParams.get('tahun') || DEFAULT_PERIODE.tahunAwal,
    tahunAkhir: searchParams.get('tahunAkhir') || searchParams.get('tahun') || DEFAULT_PERIODE.tahunAkhir,
    bulanAwal: searchParams.get('bulanAwal') || (searchParams.get('tahun') && searchParams.get('bulan') ? `${searchParams.get('tahun')}-${searchParams.get('bulan')}` : DEFAULT_PERIODE.bulanAwal),
    bulanAkhir: searchParams.get('bulanAkhir') || (searchParams.get('tahun') && searchParams.get('bulan') ? `${searchParams.get('tahun')}-${searchParams.get('bulan')}` : DEFAULT_PERIODE.bulanAkhir),
  }

  return { selected, periode }
}

/**
 * Membantu mengurai string ID yang dipisahkan koma menjadi array unik tanpa elemen kosong.
 * @param {string | null | undefined} val
 * @returns {string[]}
 */
function parseIdList(val) {
  if (!val || typeof val !== 'string') return []
  return Array.from(
    new Set(
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  )
}

/**
 * Memilih N item teratas berdasarkan field total (atau urutan awal jika total tidak ada).
 * @param {Array<{ id: string, total?: number }>} options
 * @param {number} [n=2]
 * @param {number} [max=6]
 * @returns {string[]}
 */
export function pickTop(options = [], n = 2, max = MAX_SELECTION) {
  if (!Array.isArray(options) || options.length === 0) return []

  const limit = Math.min(n, max)
  const sorted = [...options].sort((a, b) => {
    const totalA = typeof a.total === 'number' ? a.total : -1
    const totalB = typeof b.total === 'number' ? b.total : -1
    return totalB - totalA
  })

  return sorted.slice(0, limit).map((opt) => String(opt.id))
}

/**
 * Menghitung status visual checkbox (checked, indeterminate, unchecked) untuk suatu entitas
 * berdasarkan state selected aktif dan level perbandingan.
 *
 * @param {'distrik' | 'resort' | 'huria'} entityLevel - Level entitas yang sedang diperiksa
 * @param {string} id - ID entitas yang sedang diperiksa
 * @param {Object} selected - Objek { distrik: string[], resort: string[], huria: string[] }
 * @param {Object} hierarchyInfo - Informasi relasi hirarki:
 *   - parentId?: ID induk
 *   - grandparentId?: ID kakek
 *   - childIds?: ID anak-anak
 *   - descendantHuriaIds?: ID seluruh huria di bawah entitas ini
 * @returns {{ checked: boolean, indeterminate: boolean }}
 */
export function getEntityCheckboxState(entityLevel, id, selected, hierarchyInfo = {}) {
  const compLevel = resolveComparisonLevel(selected)
  if (!compLevel) {
    return { checked: false, indeterminate: false }
  }

  const sId = String(id)
  const selDistrik = new Set((selected?.distrik || []).map(String))
  const selResort = new Set((selected?.resort || []).map(String))
  const selHuria = new Set((selected?.huria || []).map(String))

  const parentId = hierarchyInfo.parentId ? String(hierarchyInfo.parentId) : ''
  const grandparentId = hierarchyInfo.grandparentId ? String(hierarchyInfo.grandparentId) : ''
  const childIds = (hierarchyInfo.childIds || []).map(String)
  const descendantHuriaIds = (hierarchyInfo.descendantHuriaIds || []).map(String)

  // 1. Level perbandingan DISTRIK:
  if (compLevel === 'distrik') {
    if (entityLevel === 'distrik') {
      return { checked: selDistrik.has(sId), indeterminate: false }
    }
    if (entityLevel === 'resort') {
      return { checked: selDistrik.has(parentId), indeterminate: false }
    }
    if (entityLevel === 'huria') {
      return { checked: selDistrik.has(grandparentId), indeterminate: false }
    }
  }

  // 2. Level perbandingan RESORT:
  if (compLevel === 'resort') {
    if (entityLevel === 'distrik') {
      if (childIds.length === 0) {
        return { checked: selDistrik.has(sId), indeterminate: false }
      }
      let checkedCount = 0
      childIds.forEach((cId) => {
        if (selResort.has(cId)) checkedCount++
      })
      if (checkedCount === 0) {
        return { checked: false, indeterminate: false }
      }
      if (checkedCount === childIds.length) {
        return { checked: true, indeterminate: false }
      }
      return { checked: false, indeterminate: true }
    }

    if (entityLevel === 'resort') {
      return { checked: selResort.has(sId), indeterminate: false }
    }

    if (entityLevel === 'huria') {
      return { checked: selResort.has(parentId), indeterminate: false }
    }
  }

  // 3. Level perbandingan HURIA:
  if (compLevel === 'huria') {
    if (entityLevel === 'huria') {
      return { checked: selHuria.has(sId), indeterminate: false }
    }

    if (entityLevel === 'resort') {
      if (childIds.length === 0) {
        return { checked: selResort.has(sId), indeterminate: false }
      }
      let checkedCount = 0
      childIds.forEach((cId) => {
        if (selHuria.has(cId)) checkedCount++
      })
      if (checkedCount === 0) {
        return { checked: false, indeterminate: false }
      }
      if (checkedCount === childIds.length) {
        return { checked: true, indeterminate: false }
      }
      return { checked: false, indeterminate: true }
    }

    if (entityLevel === 'distrik') {
      const checkTargets = descendantHuriaIds.length > 0 ? descendantHuriaIds : childIds
      if (checkTargets.length === 0) {
        return { checked: selDistrik.has(sId), indeterminate: false }
      }
      let checkedCount = 0
      checkTargets.forEach((hId) => {
        if (selHuria.has(hId)) checkedCount++
      })
      if (checkedCount === 0) {
        return { checked: false, indeterminate: false }
      }
      if (checkedCount === checkTargets.length) {
        return { checked: true, indeterminate: false }
      }
      return { checked: false, indeterminate: true }
    }
  }

  return { checked: false, indeterminate: false }
}

/**
 * Melakukan toggle pemilihan entitas wilayah berjenjang sesuai aturan:
 * - Distrik dicentang -> seluruh Resort dan HKBP ikut tercentang
 * - Resort dicentang -> hanya HKBP dalam resort tersebut ikut tercentang
 * - HKBP dicentang -> hanya HKBP tersebut yang tercentang
 * - Pemilihan langsung menentukan level perbandingan dan jumlah grafik
 *
 * @param {'distrik' | 'resort' | 'huria'} targetLevel - Level entitas yang di-klik
 * @param {string} id - ID entitas yang di-klik
 * @param {Object} selected - State selected saat ini
 * @param {Object} context - Struktur hierarki { allResorts, allHurias }
 * @param {number} max - Batas maksimal pemilihan (default: 6)
 * @returns {{ nextSelection: Object, blocked: boolean, reason?: string }}
 */
export function toggleHierarchyEntity(targetLevel, id, selected, context = {}, max = MAX_SELECTION) {
  const sId = String(id)
  const compLevel = resolveComparisonLevel(selected)

  const findResort = (rId) => (context.allResorts || []).find((r) => String(r.id) === String(rId))
  const findHuria = (hId) => (context.allHurias || []).find((h) => String(h.id) === String(hId))

  // Dapatkan status checkbox saat ini
  let currentState = { checked: false, indeterminate: false }
  if (targetLevel === 'distrik') {
    const childResorts = (context.allResorts || []).filter((r) => String(r.idInduk) === sId).map((r) => String(r.id))
    const childHurias = (context.allHurias || []).filter((h) => {
      const r = findResort(h.idInduk)
      return r && String(r.idInduk) === sId
    }).map((h) => String(h.id))
    currentState = getEntityCheckboxState('distrik', sId, selected, {
      childIds: childResorts,
      descendantHuriaIds: childHurias,
    })
  } else if (targetLevel === 'resort') {
    const r = findResort(sId)
    const pDistrikId = r?.idInduk ? String(r.idInduk) : ''
    const childHurias = (context.allHurias || []).filter((h) => String(h.idInduk) === sId).map((h) => String(h.id))
    currentState = getEntityCheckboxState('resort', sId, selected, {
      parentId: pDistrikId,
      childIds: childHurias,
    })
  } else if (targetLevel === 'huria') {
    const h = findHuria(sId)
    const pResortId = h?.idInduk ? String(h.idInduk) : ''
    const r = findResort(pResortId)
    const gDistrikId = r?.idInduk ? String(r.idInduk) : ''
    currentState = getEntityCheckboxState('huria', sId, selected, {
      parentId: pResortId,
      grandparentId: gDistrikId,
    })
  }

  // JIKA SEDANG CHECKED -> MAKA AKSI ADALAH UNCHECK (MEMBATALKAN)
  if (currentState.checked) {
    if (targetLevel === 'distrik') {
      if (compLevel === 'distrik') {
        const nextDistrik = (selected.distrik || []).filter((x) => String(x) !== sId)
        return {
          nextSelection: { distrik: nextDistrik, resort: [], huria: [] },
          blocked: false,
        }
      }
      const childResorts = new Set((context.allResorts || []).filter((r) => String(r.idInduk) === sId).map((r) => String(r.id)))
      const childHurias = new Set((context.allHurias || []).filter((h) => {
        const r = findResort(h.idInduk)
        return r && String(r.idInduk) === sId
      }).map((h) => String(h.id)))

      const nextResort = (selected.resort || []).filter((rId) => !childResorts.has(String(rId)))
      const nextHuria = (selected.huria || []).filter((hId) => !childHurias.has(String(hId)))
      const nextDistrik = (selected.distrik || []).filter((dId) => String(dId) !== sId)

      return {
        nextSelection: { distrik: nextDistrik, resort: nextResort, huria: nextHuria },
        blocked: false,
      }
    }

    if (targetLevel === 'resort') {
      const r = findResort(sId)
      const pDistrikId = r?.idInduk ? String(r.idInduk) : ''

      if (compLevel === 'resort') {
        const nextResort = (selected.resort || []).filter((x) => String(x) !== sId)
        if (nextResort.length === 0) {
          return { nextSelection: { distrik: [], resort: [], huria: [] }, blocked: false }
        }
        const remResorts = (context.allResorts || []).filter((x) => nextResort.includes(String(x.id)))
        const remDistriks = Array.from(new Set(remResorts.map((x) => String(x.idInduk)).filter(Boolean)))
        return {
          nextSelection: { distrik: remDistriks, resort: nextResort, huria: [] },
          blocked: false,
        }
      }

      if (compLevel === 'distrik') {
        const siblingResorts = (context.allResorts || []).filter((x) => String(x.idInduk) === pDistrikId).map((x) => String(x.id))
        const remainingResorts = siblingResorts.filter((rId) => rId !== sId)
        return {
          nextSelection: {
            distrik: remainingResorts.length > 0 ? [pDistrikId] : [],
            resort: remainingResorts,
            huria: [],
          },
          blocked: false,
        }
      }

      if (compLevel === 'huria') {
        const childHurias = new Set((context.allHurias || []).filter((h) => String(h.idInduk) === sId).map((h) => String(h.id)))
        const nextHuria = (selected.huria || []).filter((hId) => !childHurias.has(String(hId)))
        if (nextHuria.length === 0) {
          return { nextSelection: { distrik: [], resort: [], huria: [] }, blocked: false }
        }
        return {
          nextSelection: { ...selected, huria: nextHuria },
          blocked: false,
        }
      }
    }

    if (targetLevel === 'huria') {
      const h = findHuria(sId)
      const pResortId = h?.idInduk ? String(h.idInduk) : ''
      const r = findResort(pResortId)
      const gDistrikId = r?.idInduk ? String(r.idInduk) : ''

      if (compLevel === 'huria') {
        const nextHuria = (selected.huria || []).filter((x) => String(x) !== sId)
        if (nextHuria.length === 0) {
          return { nextSelection: { distrik: [], resort: [], huria: [] }, blocked: false }
        }
        return {
          nextSelection: { ...selected, huria: nextHuria },
          blocked: false,
        }
      }

      if (compLevel === 'resort') {
        const siblingHurias = (context.allHurias || []).filter((x) => String(x.idInduk) === pResortId).map((x) => String(x.id))
        const remainingHurias = siblingHurias.filter((hId) => hId !== sId)
        return {
          nextSelection: {
            distrik: gDistrikId ? [gDistrikId] : [],
            resort: pResortId ? [pResortId] : [],
            huria: remainingHurias,
          },
          blocked: false,
        }
      }

      if (compLevel === 'distrik') {
        const distrikHurias = (context.allHurias || []).filter((x) => {
          const res = findResort(x.idInduk)
          return res && String(res.idInduk) === gDistrikId
        }).map((x) => String(x.id))
        const remainingHurias = distrikHurias.filter((hId) => hId !== sId)
        const resortsInD = (context.allResorts || []).filter((x) => String(x.idInduk) === gDistrikId).map((x) => String(x.id))
        return {
          nextSelection: {
            distrik: gDistrikId ? [gDistrikId] : [],
            resort: resortsInD,
            huria: remainingHurias,
          },
          blocked: false,
        }
      }
    }
  }

  // JIKA BELUM CHECKED ATAU INDETERMINATE -> MAKA AKSI ADALAH CHECK (MEMILIH)
  if (targetLevel === 'distrik') {
    let nextDistrik = compLevel === 'distrik' ? [...(selected.distrik || []).map(String)] : []
    if (!nextDistrik.includes(sId)) {
      if (nextDistrik.length >= max) {
        return {
          nextSelection: selected,
          blocked: true,
          reason: `Maksimal ${max} item per perbandingan pada level ini.`,
        }
      }
      nextDistrik.push(sId)
    }
    return {
      nextSelection: { distrik: nextDistrik, resort: [], huria: [] },
      blocked: false,
    }
  }

  if (targetLevel === 'resort') {
    const r = findResort(sId)
    const pDistrikId = r?.idInduk ? String(r.idInduk) : ''

    let nextResort = compLevel === 'resort' ? [...(selected.resort || []).map(String)] : []
    if (!nextResort.includes(sId)) {
      if (nextResort.length >= max) {
        return {
          nextSelection: selected,
          blocked: true,
          reason: `Maksimal ${max} item per perbandingan pada level ini.`,
        }
      }
      nextResort.push(sId)
    }
    const parentDistriks = Array.from(new Set([
      ...(compLevel === 'resort' ? (selected.distrik || []).map(String) : []),
      pDistrikId,
    ])).filter(Boolean)

    return {
      nextSelection: { distrik: parentDistriks, resort: nextResort, huria: [] },
      blocked: false,
    }
  }

  if (targetLevel === 'huria') {
    const h = findHuria(sId)
    const pResortId = h?.idInduk ? String(h.idInduk) : ''
    const r = findResort(pResortId)
    const gDistrikId = r?.idInduk ? String(r.idInduk) : ''

    let nextHuria = compLevel === 'huria' ? [...(selected.huria || []).map(String)] : []
    if (!nextHuria.includes(sId)) {
      if (nextHuria.length >= max) {
        return {
          nextSelection: selected,
          blocked: true,
          reason: `Maksimal ${max} item per perbandingan pada level ini.`,
        }
      }
      nextHuria.push(sId)
    }

    const parentDistriks = Array.from(new Set([
      ...(compLevel === 'huria' ? (selected.distrik || []).map(String) : []),
      gDistrikId,
    ])).filter(Boolean)

    const parentResorts = Array.from(new Set([
      ...(compLevel === 'huria' ? (selected.resort || []).map(String) : []),
      pResortId,
    ])).filter(Boolean)

    return {
      nextSelection: { distrik: parentDistriks, resort: parentResorts, huria: nextHuria },
      blocked: false,
    }
  }

  return { nextSelection: selected, blocked: false }
}


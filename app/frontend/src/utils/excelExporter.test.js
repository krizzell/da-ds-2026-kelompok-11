import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeCrc32,
  SimpleZip,
  xmlEscape,
  colToLetter,
  STYLES,
  buildWorksheetXml,
  buildXlsxBuffer,
  generateExcelBlob,
  exportToExcel,
  exportVisualisasiToExcel,
  exportWilayahToExcel,
} from './excelExporter'

describe('excelExporter module', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const mockAnchor = {
      setAttribute: vi.fn(),
      click: vi.fn(),
    }
    globalThis.alert = vi.fn()
    globalThis.document = {
      createElement: vi.fn(() => mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    }
    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-excel-url'),
      revokeObjectURL: vi.fn(),
    }
  })

  describe('colToLetter', () => {
    it('converts column numbers to Excel column letters', () => {
      expect(colToLetter(1)).toBe('A')
      expect(colToLetter(2)).toBe('B')
      expect(colToLetter(26)).toBe('Z')
      expect(colToLetter(27)).toBe('AA')
      expect(colToLetter(28)).toBe('AB')
      expect(colToLetter(52)).toBe('AZ')
      expect(colToLetter(53)).toBe('BA')
    })
  })

  describe('xmlEscape', () => {
    it('escapes special characters', () => {
      expect(xmlEscape('Tom & Jerry < "good" > \'bad\'')).toBe(
        'Tom &amp; Jerry &lt; &quot;good&quot; &gt; &apos;bad&apos;'
      )
      expect(xmlEscape(null)).toBe('')
      expect(xmlEscape(undefined)).toBe('')
      expect(xmlEscape(123)).toBe('123')
    })
  })

  describe('computeCrc32 and SimpleZip', () => {
    it('computes CRC-32 consistently', () => {
      const data = new TextEncoder().encode('Hello World')
      const crc = computeCrc32(data)
      expect(typeof crc).toBe('number')
      expect(crc).toBeGreaterThan(0)
    })

    it('builds a valid zip binary buffer', () => {
      const zip = new SimpleZip()
      zip.addFile('test.txt', 'Hello test')
      const buffer = zip.build()
      expect(buffer instanceof Uint8Array).toBe(true)
      expect(buffer.length).toBeGreaterThan(50)
      // First 4 bytes of ZIP are PK\x03\x04 (0x04034b50)
      expect(buffer[0]).toBe(0x50)
      expect(buffer[1]).toBe(0x4b)
      expect(buffer[2]).toBe(0x03)
      expect(buffer[3]).toBe(0x04)
    })
  })

  describe('buildWorksheetXml', () => {
    it('generates sheet XML with styled cells, numbers, and strings', () => {
      const sheet = {
        name: 'TestSheet',
        cols: [{ width: 15 }, { width: 30 }],
        rows: [
          [
            { value: 'Kode', style: STYLES.HEADER },
            { value: 'Nama Wilayah', style: STYLES.HEADER },
          ],
          [
            { value: '01', style: STYLES.TEXT },
            { value: 'Distrik I', style: STYLES.TEXT },
          ],
          [
            { value: 'Total', style: STYLES.TOTAL_LABEL },
            { value: 15000000, style: STYLES.TOTAL_CURRENCY, type: 'currency' },
          ],
        ],
        merges: ['A1:B1'],
      }

      const xml = buildWorksheetXml(sheet)
      expect(xml).toContain('<worksheet')
      expect(xml).toContain('<col min="1" max="1" width="15"')
      expect(xml).toContain('Kode')
      expect(xml).toContain('Distrik I')
      expect(xml).toContain('<v>15000000</v>')
      expect(xml).toContain('<mergeCell ref="A1:B1"/>')
    })
  })

  describe('buildXlsxBuffer & generateExcelBlob', () => {
    it('builds multi-sheet xlsx binary buffer and blob', () => {
      const sheets = [
        {
          name: 'Sheet 1',
          rows: [
            [{ value: 'Header A' }, { value: 'Header B' }],
            [{ value: 'Val 1' }, { value: 100 }],
          ],
        },
        {
          name: 'Sheet 2',
          rows: [
            [{ value: 'Ringkasan' }],
            [{ value: 'Data' }],
          ],
        },
      ]

      const buffer = buildXlsxBuffer(sheets)
      expect(buffer instanceof Uint8Array).toBe(true)
      expect(buffer.length).toBeGreaterThan(100)

      const blob = generateExcelBlob(sheets)
      expect(blob instanceof Blob).toBe(true)
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })
  })

  describe('exportToExcel', () => {
    it('alerts when sheets array is empty or has no data', () => {
      expect(exportToExcel({ sheets: [] })).toBe(false)
      expect(globalThis.alert).toHaveBeenCalledWith('Tidak ada data untuk diekspor')

      expect(exportToExcel({ sheets: [{ name: 'Empty', rows: [] }] })).toBe(false)
      expect(globalThis.alert).toHaveBeenCalledWith('Tidak ada data untuk diekspor')
    })

    it('triggers browser download with sanitized .xlsx filename', () => {
      const sheets = [
        {
          name: 'Hasil',
          rows: [
            [{ value: 'Col 1', style: STYLES.HEADER }],
            [{ value: 'Val 1', style: STYLES.TEXT }],
          ],
        },
      ]

      const success = exportToExcel({
        filename: 'laporan_hkbp',
        sheets,
      })

      expect(success).toBe(true)
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a')
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
      expect(globalThis.document.body.appendChild).toHaveBeenCalled()
      expect(globalThis.document.body.removeChild).toHaveBeenCalled()
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-excel-url')
    })
  })

  describe('exportVisualisasiToExcel', () => {
    it('alerts and returns false when comparedEntities or chartData is empty', () => {
      expect(exportVisualisasiToExcel({ comparedEntities: [], chartData: [] })).toBe(false)
      expect(globalThis.alert).toHaveBeenCalledWith(
        'Tidak ada data visualisasi untuk diekspor. Silakan pilih minimal 1 wilayah terlebih dahulu.'
      )

      expect(
        exportVisualisasiToExcel({
          comparedEntities: [{ id: 'd-1', name: 'Distrik I' }],
          chartData: [],
        })
      ).toBe(false)
    })

    it('successfully exports visualization data with multi-sheets (.xlsx)', () => {
      const result = exportVisualisasiToExcel({
        filename: 'test_vis.xlsx',
        meta: { sumber: 'Pemasukan Jemaat', kategori: 'Semua Kategori', unit: 'Rp' },
        levelLabel: 'Distrik',
        periodBadgeLabel: 'Tahun 2026',
        metricLabel: 'Total',
        metric: 'SUM',
        comparedEntities: [
          { id: 'd-1', name: 'Distrik I Tabagsel' },
          { id: 'd-2', name: 'Distrik II Silindung' },
        ],
        chartData: [
          { label: 'Jan 2026', 'd-1': 10000000, 'd-2': 15000000 },
          { label: 'Feb 2026', 'd-1': 12000000, 'd-2': 18000000 },
        ],
        entityStats: {
          'd-1': { total: 22000000, count: 2, peakVal: 12000000, peakLabel: 'Feb 2026' },
          'd-2': { total: 33000000, count: 2, peakVal: 18000000, peakLabel: 'Feb 2026' },
        },
        totalOverall: 55000000,
        timeAxisTitle: 'Bulan',
      })

      expect(result).toBe(true)
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a')
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    })
  })

  describe('exportWilayahToExcel', () => {
    it('alerts and returns false when items array is empty', () => {
      expect(exportWilayahToExcel({ items: [] })).toBe(false)
      expect(globalThis.alert).toHaveBeenCalledWith('Tidak ada data wilayah untuk diekspor')
    })

    it('exports distrik level with child column Jumlah Resort', () => {
      const items = [
        {
          id: 'd-01',
          kodeLengkap: '01',
          nama: 'Distrik I Tabagsel - Sumbar',
          namaPimpinan: 'Pdt. Ebsan B. Hutabarat, M.Th',
          jumlahAnak: 8,
          jumlahJemaat: 28450,
          totalPemasukan: 1420000000,
          kontribusiPersen: 24.5,
          aktif: true,
        },
      ]

      const result = exportWilayahToExcel({
        items,
        level: 'distrik',
        searchQuery: '',
        status: 'semua',
      })

      expect(result).toBe(true)
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a')
    })

    it('exports resort level with child column Jumlah Huria and parent detail', () => {
      const items = [
        {
          id: 'r-01-01',
          kodeLengkap: '01.01',
          nama: 'Resort Padangsidimpuan',
          namaPimpinan: 'Pdt. Jahor Purba',
          jumlahAnak: 45,
          jumlahJemaat: 7200,
          totalPemasukan: 360000000,
          kontribusiPersen: 25.4,
          aktif: true,
        },
      ]

      const result = exportWilayahToExcel({
        items,
        level: 'resort',
        idInduk: 'd-01',
        parentDetail: { nama: 'Distrik I Tabagsel - Sumbar', namaPimpinan: 'Pdt. Ebsan' },
        searchQuery: 'Padang',
        status: 'aktif',
      })

      expect(result).toBe(true)
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a')
    })

    it('exports huria level with child column Jumlah Lunggu', () => {
      const items = [
        {
          id: 'h-01-01-01',
          kodeLengkap: '01.01.01',
          nama: 'HKBP Padangsidimpuan',
          namaPimpinan: 'Pdt. Donald',
          jumlahAnak: 5,
          jumlahJemaat: 1200,
          totalPemasukan: 85000000,
          kontribusiPersen: 23.6,
          aktif: true,
        },
      ]

      const result = exportWilayahToExcel({
        items,
        level: 'huria',
        idInduk: 'r-01-01',
        parentDetail: { nama: 'Resort Padangsidimpuan' },
        searchQuery: '',
        status: 'semua',
      })

      expect(result).toBe(true)
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a')
    })
  })
})

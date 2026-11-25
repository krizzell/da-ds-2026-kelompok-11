/**
 * @file excelExporter.js
 * Generator dan Exporter File Excel (.xlsx) Murni JavaScript (Zero-Dependency).
 * Mengimplementasikan spesifikasi OpenXML SpreadsheetML (ISO/IEC 29500-1)
 * dan PKZip 2.0 standar.
 */

// -------------------------------------------------------------
// 1. UTILITAS CRC-32 & ZIP 2.0 ARCHIVE BUILDER
// -------------------------------------------------------------

const makeCrcTable = () => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
}

const crcTable = makeCrcTable()

export const computeCrc32 = (uint8Array) => {
  let crc = -1
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ uint8Array[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

/**
 * SimpleZip: Membangun arsip ZIP standar uncompressed (STORE / Method 0).
 * Sepenuhnya didukung oleh Microsoft Excel, LibreOffice, Apple Numbers, Google Sheets.
 */
export class SimpleZip {
  constructor() {
    this.files = []
  }

  addFile(name, content) {
    let data
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content)
    } else if (content instanceof Uint8Array) {
      data = content
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content)
    } else {
      data = new TextEncoder().encode(String(content))
    }

    this.files.push({
      name,
      data,
      crc: computeCrc32(data),
      size: data.length,
    })
  }

  build() {
    let totalSize = 0
    const encodedNames = []

    for (const f of this.files) {
      const nameBytes = new TextEncoder().encode(f.name)
      encodedNames.push(nameBytes)
      // Local Header: 30 + nameBytes.length + data.length
      totalSize += 30 + nameBytes.length + f.size
      // Central Directory Header: 46 + nameBytes.length
      totalSize += 46 + nameBytes.length
    }
    // End of Central Directory Record: 22 bytes
    totalSize += 22

    const buffer = new Uint8Array(totalSize)
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

    let localOffset = 0
    const fileOffsets = []

    // 1. Tulis Local File Headers & Data
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i]
      const nameBytes = encodedNames[i]
      fileOffsets.push(localOffset)

      // Signature 0x04034b50
      view.setUint32(localOffset, 0x04034b50, true)
      view.setUint16(localOffset + 4, 20, true) // Version 2.0
      view.setUint16(localOffset + 6, 0x0800, true) // UTF-8 filename flag
      view.setUint16(localOffset + 8, 0, true) // Compression: 0 (STORE)
      view.setUint16(localOffset + 10, 0, true) // Mod time
      view.setUint16(localOffset + 12, 0, true) // Mod date
      view.setUint32(localOffset + 14, f.crc, true)
      view.setUint32(localOffset + 18, f.size, true) // Compressed size
      view.setUint32(localOffset + 22, f.size, true) // Uncompressed size
      view.setUint16(localOffset + 26, nameBytes.length, true)
      view.setUint16(localOffset + 28, 0, true) // Extra field length

      buffer.set(nameBytes, localOffset + 30)
      buffer.set(f.data, localOffset + 30 + nameBytes.length)

      localOffset += 30 + nameBytes.length + f.size
    }

    const cdStartOffset = localOffset

    // 2. Tulis Central Directory Headers
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i]
      const nameBytes = encodedNames[i]
      const origOffset = fileOffsets[i]

      // Signature 0x02014b50
      view.setUint32(localOffset, 0x02014b50, true)
      view.setUint16(localOffset + 4, 20, true) // Version made by
      view.setUint16(localOffset + 6, 20, true) // Version needed
      view.setUint16(localOffset + 8, 0x0800, true) // UTF-8 flag
      view.setUint16(localOffset + 10, 0, true) // Compression 0
      view.setUint16(localOffset + 12, 0, true) // Mod time
      view.setUint16(localOffset + 14, 0, true) // Mod date
      view.setUint32(localOffset + 16, f.crc, true)
      view.setUint32(localOffset + 20, f.size, true)
      view.setUint32(localOffset + 24, f.size, true)
      view.setUint16(localOffset + 28, nameBytes.length, true)
      view.setUint16(localOffset + 30, 0, true) // Extra field length
      view.setUint16(localOffset + 32, 0, true) // Comment length
      view.setUint16(localOffset + 34, 0, true) // Disk start
      view.setUint16(localOffset + 36, 0, true) // Internal file attrs
      view.setUint32(localOffset + 38, 0, true) // External file attrs
      view.setUint32(localOffset + 42, origOffset, true) // Relative offset

      buffer.set(nameBytes, localOffset + 46)
      localOffset += 46 + nameBytes.length
    }

    const cdSize = localOffset - cdStartOffset

    // 3. Tulis End of Central Directory (EOCD)
    // Signature 0x06054b50
    view.setUint32(localOffset, 0x06054b50, true)
    view.setUint16(localOffset + 4, 0, true) // Disk number
    view.setUint16(localOffset + 6, 0, true) // Start disk
    view.setUint16(localOffset + 8, this.files.length, true) // Entries on disk
    view.setUint16(localOffset + 10, this.files.length, true) // Total entries
    view.setUint32(localOffset + 12, cdSize, true)
    view.setUint32(localOffset + 16, cdStartOffset, true)
    view.setUint16(localOffset + 20, 0, true) // Comment length

    return buffer
  }
}

// -------------------------------------------------------------
// 2. HELPER OPENXML SPREADSHEETML
// -------------------------------------------------------------

export function xmlEscape(val) {
  if (val === null || val === undefined) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function colToLetter(colIndex) {
  let temp = colIndex
  let letter = ''
  while (temp > 0) {
    const mod = (temp - 1) % 26
    letter = String.fromCharCode(65 + mod) + letter
    temp = Math.floor((temp - mod) / 26)
  }
  return letter
}

/**
 * Gaya Style OpenXML:
 * 0: Default
 * 1: Title (14pt Bold, Navy #0F4C81)
 * 2: Meta Label (10pt Bold Gray #4A5568)
 * 3: Meta Value (10pt Regular #1A202C)
 * 4: Table Header (11pt Bold White, Solid #0F4C81 Fill, Center, Thin Border)
 * 5: Table Cell Text (11pt Regular, Left, Thin Border)
 * 6: Table Cell Integer (11pt Regular, Right, Thin Border, numFmt #,##0)
 * 7: Table Cell Currency (11pt Regular, Right, Thin Border, numFmt "Rp" #,##0)
 * 8: Table Cell Percent (11pt Regular, Right, Thin Border, numFmt 0.00%)
 * 9: Total Row Label (11pt Bold, Fill #EDF2F7, Top Thin, Bottom Double)
 * 10: Total Row Number (11pt Bold, Right, Fill #EDF2F7, numFmt #,##0, Top Thin, Bottom Double)
 * 11: Total Row Currency (11pt Bold, Right, Fill #EDF2F7, numFmt "Rp" #,##0, Top Thin, Bottom Double)
 * 12: Total Row Percent (11pt Bold, Right, Fill #EDF2F7, numFmt 0.00%, Top Thin, Bottom Double)
 * 13: Table Cell Center Text (11pt Regular, Center, Thin Border)
 */
export const STYLES = {
  DEFAULT: 0,
  TITLE: 1,
  META_LABEL: 2,
  META_VALUE: 3,
  HEADER: 4,
  TEXT: 5,
  INTEGER: 6,
  CURRENCY: 7,
  PERCENT: 8,
  TOTAL_LABEL: 9,
  TOTAL_NUMBER: 10,
  TOTAL_CURRENCY: 11,
  TOTAL_PERCENT: 12,
  TEXT_CENTER: 13,
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&quot;Rp&quot;\ #,##0"/>
  </numFmts>
  <fonts count="5">
    <!-- 0: default 11pt -->
    <font><sz val="11"/><name val="Calibri"/></font>
    <!-- 1: title 14pt bold -->
    <font><b/><sz val="14"/><color rgb="FF0F4C81"/><name val="Calibri"/></font>
    <!-- 2: meta bold 10pt -->
    <font><b/><sz val="10"/><color rgb="FF4A5568"/><name val="Calibri"/></font>
    <!-- 3: meta regular 10pt -->
    <font><sz val="10"/><color rgb="FF1A202C"/><name val="Calibri"/></font>
    <!-- 4: bold white 11pt -->
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <!-- 0: none -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: gray125 -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: dark navy blue #0F4C81 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F4C81"/></patternFill></fill>
    <!-- 3: light total gray/blue #EDF2F7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDF2F7"/></patternFill></fill>
  </fills>
  <borders count="3">
    <!-- 0: none -->
    <border><left/><right/><top/><bottom/></border>
    <!-- 1: thin all sides -->
    <border>
      <left style="thin"><color rgb="FFCBD5E0"/></left>
      <right style="thin"><color rgb="FFCBD5E0"/></right>
      <top style="thin"><color rgb="FFCBD5E0"/></top>
      <bottom style="thin"><color rgb="FFCBD5E0"/></bottom>
    </border>
    <!-- 2: total row (top thin, bottom double) -->
    <border>
      <left style="thin"><color rgb="FFCBD5E0"/></left>
      <right style="thin"><color rgb="FFCBD5E0"/></right>
      <top style="thin"><color rgb="FF718096"/></top>
      <bottom style="double"><color rgb="FF2D3748"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="14">
    <!-- 0: default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: title -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 2: meta label -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 3: meta value -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 4: table header (bold white, dark navy fill, center, thin border) -->
    <xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 5: table cell text (thin border, left) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 6: table cell integer (numFmt 3 #,##0, right, thin border) -->
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 7: table cell currency (numFmt 164 Rp #,##0, right, thin border) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 8: table cell percent (numFmt 10 0.00%, right, thin border) -->
    <xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 9: total label (bold, fill light blue, top thin, bottom double) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 10: total integer (bold, fill light blue, numFmt 3, top thin, bottom double, right) -->
    <xf numFmtId="3" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 11: total currency (bold, fill light blue, numFmt 164, top thin, bottom double, right) -->
    <xf numFmtId="164" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 12: total percent (bold, fill light blue, numFmt 10 0.00%, top thin, bottom double, right) -->
    <xf numFmtId="10" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 13: table cell center text (thin border, center) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`

// -------------------------------------------------------------
// 3. CORE BUILDER UNTUK WORKBOOK XLSX MULTI-SHEET
// -------------------------------------------------------------

/**
 * Membangun XML worksheet untuk 1 tab Excel
 */
export function buildWorksheetXml(sheet) {
  const rows = sheet.rows || []
  const customCols = sheet.cols || []
  const merges = sheet.merges || []

  // Hitung perkiraan lebar kolom otomatis jika belum didefinisikan
  const colWidths = {}
  rows.forEach((row) => {
    if (!Array.isArray(row)) return
    row.forEach((cell, cIdx) => {
      let textLen = 0
      if (cell !== null && cell !== undefined) {
        if (typeof cell === 'object') {
          textLen = String(cell.value ?? '').length
        } else {
          textLen = String(cell).length
        }
      }
      colWidths[cIdx] = Math.max(colWidths[cIdx] || 10, textLen + 3)
    })
  })

  // XML Header & Columns
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  xml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n`

  const maxColCount = Math.max(
    customCols.length,
    ...rows.map((r) => (Array.isArray(r) ? r.length : 0)),
    1
  )

  xml += `  <cols>\n`
  for (let c = 1; c <= maxColCount; c++) {
    const cIdx = c - 1
    const width = customCols[cIdx]?.width || Math.min(60, Math.max(10, colWidths[cIdx] || 12))
    xml += `    <col min="${c}" max="${c}" width="${width}" customWidth="1"/>\n`
  }
  xml += `  </cols>\n`

  // Sheet Data
  xml += `  <sheetData>\n`
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1
    if (!row || !Array.isArray(row) || row.length === 0) {
      xml += `    <row r="${rowNum}"/>\n`
      return
    }

    // Cek apakah ada properti tinggi baris kustom
    const rowHeight = row._height ? ` ht="${row._height}" customHeight="1"` : ''
    xml += `    <row r="${rowNum}"${rowHeight}>\n`

    row.forEach((cell, cIdx) => {
      const colNum = cIdx + 1
      const cellRef = `${colToLetter(colNum)}${rowNum}`

      if (cell === null || cell === undefined || cell === '') {
        xml += `      <c r="${cellRef}"/>\n`
        return
      }

      let val = cell
      let styleId = STYLES.DEFAULT
      let type = 'auto'

      if (typeof cell === 'object' && cell !== null && !(cell instanceof Date)) {
        val = cell.value
        if (cell.style !== undefined) styleId = cell.style
        if (cell.type !== undefined) type = cell.type
      }

      if (val === null || val === undefined || val === '') {
        xml += `      <c r="${cellRef}" s="${styleId}"/>\n`
        return
      }

      // Deteksi tipe otomatis jika type === 'auto'
      if (type === 'auto') {
        if (typeof val === 'number' && Number.isFinite(val)) {
          type = 'number'
        } else {
          type = 'string'
        }
      }

      if (type === 'number' || type === 'integer' || type === 'currency' || type === 'percent') {
        const numVal = Number(val)
        if (Number.isFinite(numVal)) {
          xml += `      <c r="${cellRef}" s="${styleId}"><v>${numVal}</v></c>\n`
        } else {
          xml += `      <c r="${cellRef}" t="inlineStr" s="${styleId}"><is><t>${xmlEscape(String(val))}</t></is></c>\n`
        }
      } else {
        const strVal = String(val)
        const hasSpace = strVal.startsWith(' ') || strVal.endsWith(' ')
        const spaceAttr = hasSpace ? ' xml:space="preserve"' : ''
        xml += `      <c r="${cellRef}" t="inlineStr" s="${styleId}"><is><t${spaceAttr}>${xmlEscape(strVal)}</t></is></c>\n`
      }
    })

    xml += `    </row>\n`
  })
  xml += `  </sheetData>\n`

  // Merged Cells
  if (merges.length > 0) {
    xml += `  <mergeCells count="${merges.length}">\n`
    merges.forEach((m) => {
      xml += `    <mergeCell ref="${m}"/>\n`
    })
    xml += `  </mergeCells>\n`
  }

  xml += `</worksheet>`
  return xml
}

/**
 * Membangun buffer arsip XLSX lengkap
 * @param {Array<{name: string, rows: Array, cols?: Array, merges?: Array}>} sheets
 * @returns {Uint8Array}
 */
export function buildXlsxBuffer(sheets = []) {
  if (!sheets || sheets.length === 0) {
    throw new Error('Minimal harus ada 1 sheet untuk membuat file Excel')
  }

  const zip = new SimpleZip()

  // 1. [Content_Types].xml
  let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  contentTypes += `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n`
  contentTypes += `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n`
  contentTypes += `  <Default Extension="xml" ContentType="application/xml"/>\n`
  contentTypes += `  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n`
  contentTypes += `  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\n`
  sheets.forEach((_, i) => {
    contentTypes += `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n`
  })
  contentTypes += `</Types>`
  zip.addFile('[Content_Types].xml', contentTypes)

  // 2. _rels/.rels
  zip.addFile(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n` +
      `</Relationships>`
  )

  // 3. xl/_rels/workbook.xml.rels
  let wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  wbRels += `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
  sheets.forEach((_, i) => {
    wbRels += `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>\n`
  })
  wbRels += `  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n`
  wbRels += `</Relationships>`
  zip.addFile('xl/_rels/workbook.xml.rels', wbRels)

  // 4. xl/workbook.xml
  let wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  wbXml += `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
  wbXml += `  <sheets>\n`
  sheets.forEach((sheet, i) => {
    // Nama sheet Excel dibatasi maks 31 karakter dan tidak boleh ada karakter terlarang : \ / ? * [ ]
    const safeSheetName = (sheet.name || `Sheet${i + 1}`)
      .replace(/[\\/?*\[\]:]/g, '_')
      .slice(0, 31)
    wbXml += `    <sheet name="${xmlEscape(safeSheetName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>\n`
  })
  wbXml += `  </sheets>\n`
  wbXml += `</workbook>`
  zip.addFile('xl/workbook.xml', wbXml)

  // 5. xl/styles.xml
  zip.addFile('xl/styles.xml', STYLES_XML)

  // 6. Worksheets
  sheets.forEach((sheet, i) => {
    const sheetXml = buildWorksheetXml(sheet)
    zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, sheetXml)
  })

  return zip.build()
}

/**
 * Menghasilkan Blob file Excel (.xlsx)
 * @param {Array} sheets
 * @returns {Blob}
 */
export function generateExcelBlob(sheets) {
  const buffer = buildXlsxBuffer(sheets)
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * Mengunduh file Excel (.xlsx) ke browser
 * @param {Object} options
 * @param {string} options.filename
 * @param {Array} options.sheets
 */
export function exportToExcel({ filename = 'ekspor_hkbp.xlsx', sheets = [] }) {
  if (!sheets || sheets.length === 0) {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Tidak ada data untuk diekspor')
    }
    return false
  }

  // Periksa apakah seluruh sheet kosong
  const hasData = sheets.some((s) => s.rows && s.rows.length > 0)
  if (!hasData) {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Tidak ada data untuk diekspor')
    }
    return false
  }

  const safeFilename = filename.toLowerCase().endsWith('.xlsx')
    ? filename
    : `${filename}.xlsx`

  try {
    const blob = generateExcelBlob(sheets)

    if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', safeFilename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
    return true
  } catch (err) {
    console.error('Gagal mengekspor file Excel:', err)
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Terjadi kesalahan saat menghasilkan file Excel')
    }
    return false
  }
}

// -------------------------------------------------------------
// 4. SPESIALISASI EKSPOR: VISUALISASI & WILAYAH HKBP
// -------------------------------------------------------------

/**
 * Ekspor Hasil Visualisasi & Komparasi Data HKBP ke file Excel (.xlsx)
 */
export function exportVisualisasiToExcel({
  filename,
  meta = { sumber: 'Pemasukan', kategori: 'Semua', unit: 'Rp' },
  levelLabel = 'Huria',
  periodBadgeLabel = '-',
  metricLabel = 'Total',
  metric = 'SUM',
  comparedEntities = [],
  chartData = [],
  entityStats = {},
  totalOverall = 0,
  timeAxisTitle = 'Periode',
}) {
  if (!comparedEntities || !comparedEntities.length || !chartData || !chartData.length) {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Tidak ada data visualisasi untuk diekspor. Silakan pilih minimal 1 wilayah terlebih dahulu.')
    }
    return false
  }

  const exportTime = new Date().toLocaleString('id-ID')
  const isCurrency = meta.unit === 'Rp'
  const isMulti = comparedEntities.length > 1
  const numberStyle = isCurrency ? STYLES.CURRENCY : STYLES.INTEGER
  const totalNumberStyle = isCurrency ? STYLES.TOTAL_CURRENCY : STYLES.TOTAL_NUMBER

  // ---------------------------------------------------------
  // SHEET 1: DATA DERET WAKTU VISUALISASI
  // ---------------------------------------------------------
  const s1Rows = []

  // Row 1: Title
  s1Rows.push([
    { value: 'LAPORAN HASIL VISUALISASI DATA HKBP', style: STYLES.TITLE },
  ])
  s1Rows[0]._height = 26

  // Row 2: Subtitle info
  s1Rows.push([
    { value: 'Sumber Data:', style: STYLES.META_LABEL },
    { value: `${meta.sumber} - ${meta.kategori}`, style: STYLES.META_VALUE },
    { value: 'Filter Waktu:', style: STYLES.META_LABEL },
    { value: periodBadgeLabel, style: STYLES.META_VALUE },
  ])

  // Row 3: Scope info
  s1Rows.push([
    { value: 'Tingkat Wilayah:', style: STYLES.META_LABEL },
    { value: levelLabel, style: STYLES.META_VALUE },
    { value: 'Metrik Agregasi:', style: STYLES.META_LABEL },
    { value: metricLabel, style: STYLES.META_VALUE },
    { value: 'Waktu Ekspor:', style: STYLES.META_LABEL },
    { value: exportTime, style: STYLES.META_VALUE },
  ])

  // Row 4: Blank
  s1Rows.push([])

  // Row 5: Table Headers
  const s1HeaderRow = [{ value: timeAxisTitle, style: STYLES.HEADER }]
  comparedEntities.forEach((ent) => {
    s1HeaderRow.push({ value: ent.name, style: STYLES.HEADER })
  })
  if (isMulti) {
    s1HeaderRow.push({ value: 'Total Semua Wilayah', style: STYLES.HEADER })
  }
  s1HeaderRow.push(
    { value: 'Sumber Data', style: STYLES.HEADER },
    { value: 'Kategori', style: STYLES.HEADER },
    { value: 'Filter Waktu', style: STYLES.HEADER },
    { value: 'Tingkat Wilayah', style: STYLES.HEADER }
  )
  s1HeaderRow._height = 24
  s1Rows.push(s1HeaderRow)

  // Rows 6..N: Data Rows
  const columnSums = {}
  comparedEntities.forEach((e) => {
    columnSums[e.id] = 0
  })
  let totalAllColumns = 0

  chartData.forEach((row) => {
    let rowTotal = 0
    const rowCells = [{ value: row.label, style: STYLES.TEXT_CENTER }]

    comparedEntities.forEach((ent) => {
      const val = row[ent.id] || 0
      columnSums[ent.id] = (columnSums[ent.id] || 0) + val
      rowTotal += val
      rowCells.push({
        value: val,
        style: numberStyle,
        type: isCurrency ? 'currency' : 'number',
      })
    })

    if (isMulti) {
      rowCells.push({
        value: rowTotal,
        style: numberStyle,
        type: isCurrency ? 'currency' : 'number',
      })
    }
    totalAllColumns += rowTotal

    rowCells.push(
      { value: meta.sumber, style: STYLES.TEXT },
      { value: meta.kategori, style: STYLES.TEXT },
      { value: periodBadgeLabel, style: STYLES.TEXT_CENTER },
      { value: levelLabel, style: STYLES.TEXT_CENTER }
    )

    s1Rows.push(rowCells)
  })

  // Total Row
  const s1TotalRow = [{ value: 'TOTAL KESELURUHAN', style: STYLES.TOTAL_LABEL }]
  comparedEntities.forEach((ent) => {
    const val =
      metric === 'AVG' ? entityStats[ent.id]?.total || 0 : columnSums[ent.id] || 0
    s1TotalRow.push({
      value: val,
      style: totalNumberStyle,
      type: isCurrency ? 'currency' : 'number',
    })
  })
  if (isMulti) {
    const val = metric === 'AVG' ? totalOverall : totalAllColumns
    s1TotalRow.push({
      value: val,
      style: totalNumberStyle,
      type: isCurrency ? 'currency' : 'number',
    })
  }
  s1TotalRow.push(
    { value: meta.sumber, style: STYLES.TOTAL_LABEL },
    { value: meta.kategori, style: STYLES.TOTAL_LABEL },
    { value: periodBadgeLabel, style: STYLES.TOTAL_LABEL },
    { value: levelLabel, style: STYLES.TOTAL_LABEL }
  )
  s1TotalRow._height = 22
  s1Rows.push(s1TotalRow)

  // ---------------------------------------------------------
  // SHEET 2: RINGKASAN & STATISTIK WILAYAH
  // ---------------------------------------------------------
  const s2Rows = []
  s2Rows.push([{ value: 'RINGKASAN & STATISTIK WILAYAH', style: STYLES.TITLE }])
  s2Rows[0]._height = 26
  s2Rows.push([])

  const s2HeaderRow = [
    { value: 'No.', style: STYLES.HEADER },
    { value: 'Nama Wilayah / Entitas', style: STYLES.HEADER },
    { value: 'Tingkat Wilayah', style: STYLES.HEADER },
    { value: `Total Nilai ${isCurrency ? '(Rp)' : '(Jiwa)'}`, style: STYLES.HEADER },
    { value: 'Kontribusi (%)', style: STYLES.HEADER },
    { value: 'Rata-rata per Periode', style: STYLES.HEADER },
    { value: 'Nilai Tertinggi (Puncak)', style: STYLES.HEADER },
    { value: 'Periode Nilai Tertinggi', style: STYLES.HEADER },
  ]
  s2HeaderRow._height = 24
  s2Rows.push(s2HeaderRow)

  let sumEntityTotal = 0
  comparedEntities.forEach((ent, idx) => {
    const stat = entityStats[ent.id] || { total: 0, peakVal: 0, peakLabel: '-' }
    const totalVal = stat.total || 0
    sumEntityTotal += totalVal
    const pct =
      metric !== 'AVG' && totalOverall > 0 ? totalVal / totalOverall : 0
    const avg =
      metric === 'AVG'
        ? totalVal
        : chartData.length > 0
        ? Math.round(totalVal / chartData.length)
        : 0

    s2Rows.push([
      { value: idx + 1, style: STYLES.INTEGER, type: 'number' },
      { value: ent.name, style: STYLES.TEXT },
      { value: levelLabel, style: STYLES.TEXT_CENTER },
      { value: totalVal, style: numberStyle, type: isCurrency ? 'currency' : 'number' },
      { value: pct, style: STYLES.PERCENT, type: 'percent' },
      { value: avg, style: numberStyle, type: isCurrency ? 'currency' : 'number' },
      { value: stat.peakVal || 0, style: numberStyle, type: isCurrency ? 'currency' : 'number' },
      { value: stat.peakLabel || '-', style: STYLES.TEXT_CENTER },
    ])
  })

  // S2 Total Row
  const s2TotalRow = [
    { value: 'Total', style: STYLES.TOTAL_LABEL },
    {
      value: `Total Keseluruhan (${comparedEntities.length} Wilayah)`,
      style: STYLES.TOTAL_LABEL,
    },
    { value: levelLabel, style: STYLES.TOTAL_LABEL },
    {
      value: metric === 'AVG' ? totalOverall : sumEntityTotal,
      style: totalNumberStyle,
      type: isCurrency ? 'currency' : 'number',
    },
    {
      value: metric !== 'AVG' && totalOverall > 0 ? 1.0 : 0,
      style: STYLES.TOTAL_PERCENT,
      type: 'percent',
    },
    { value: '-', style: STYLES.TOTAL_LABEL },
    { value: '-', style: STYLES.TOTAL_LABEL },
    { value: '-', style: STYLES.TOTAL_LABEL },
  ]
  s2TotalRow._height = 22
  s2Rows.push(s2TotalRow)

  // ---------------------------------------------------------
  // SHEET 3: PARAMETER & FILTER
  // ---------------------------------------------------------
  const s3Rows = []
  s3Rows.push([{ value: 'PARAMETER & FILTER AKTIF', style: STYLES.TITLE }])
  s3Rows[0]._height = 26
  s3Rows.push([])

  s3Rows.push([
    { value: 'Parameter', style: STYLES.HEADER },
    { value: 'Nilai / Pengaturan', style: STYLES.HEADER },
  ])

  const paramsList = [
    ['Waktu Ekspor', exportTime],
    ['Sumber Data', meta.sumber],
    ['Kategori / Jenis', meta.kategori],
    ['Filter Waktu', periodBadgeLabel],
    ['Tingkat Wilayah', levelLabel],
    ['Wilayah yang Ditampilkan', comparedEntities.map((e) => e.name).join('; ')],
    ['Metrik Agregasi', metricLabel],
    ['Satuan (Unit)', meta.unit === 'Rp' ? 'Rupiah (Rp)' : 'Jiwa (Orang)'],
  ]

  paramsList.forEach(([param, val]) => {
    s3Rows.push([
      { value: param, style: STYLES.TEXT },
      { value: val, style: STYLES.TEXT },
    ])
  })

  const sheets = [
    { name: 'Deret Waktu', rows: s1Rows },
    { name: 'Ringkasan & Statistik', rows: s2Rows },
    { name: 'Parameter & Filter', rows: s3Rows },
  ]

  const safeSource = (meta.sumber || 'data')
    .replace(/::/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
  const safePeriod = periodBadgeLabel
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
  const targetFilename =
    filename ||
    `hkbp_visualisasi_${safeSource}_${safePeriod}_${new Date().toISOString().slice(0, 10)}.xlsx`

  return exportToExcel({
    filename: targetFilename,
    sheets,
  })
}

/**
 * Ekspor Hasil Wilayah & Huria HKBP ke file Excel (.xlsx)
 */
export function exportWilayahToExcel({
  filename,
  items = [],
  level = 'distrik',
  idInduk = '',
  parentDetail = null,
  searchQuery = '',
  status = 'semua',
  sort = '',
}) {
  if (!items || items.length === 0) {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Tidak ada data wilayah untuk diekspor')
    }
    return false
  }

  const exportTime = new Date().toLocaleString('id-ID')

  const childColumnHeader =
    level === 'distrik'
      ? 'Jumlah Resort'
      : level === 'resort'
      ? 'Jumlah Huria'
      : 'Jumlah Lunggu'

  const entityNoun =
    level === 'distrik'
      ? 'Distrik'
      : level === 'resort'
      ? 'Resort'
      : 'Huria'

  const pageTitle =
    level === 'distrik'
      ? 'Wilayah HKBP (Distrik)'
      : parentDetail?.nama
      ? `Daftar ${entityNoun} - ${parentDetail.nama}`
      : `Daftar ${entityNoun}`

  // ---------------------------------------------------------
  // SHEET 1: DAFTAR WILAYAH
  // ---------------------------------------------------------
  const s1Rows = []

  // Row 1: Title
  s1Rows.push([
    {
      value: `LAPORAN WILAYAH HKBP - ${pageTitle.toUpperCase()}`,
      style: STYLES.TITLE,
    },
  ])
  s1Rows[0]._height = 26

  // Row 2: Subtitle info
  const row2 = [
    { value: 'Tingkat Wilayah:', style: STYLES.META_LABEL },
    { value: entityNoun, style: STYLES.META_VALUE },
  ]
  if (parentDetail?.nama) {
    row2.push(
      { value: 'Wilayah Induk:', style: STYLES.META_LABEL },
      { value: parentDetail.nama, style: STYLES.META_VALUE }
    )
  }
  if (parentDetail?.namaPimpinan) {
    row2.push(
      { value: 'Pimpinan Induk:', style: STYLES.META_LABEL },
      { value: parentDetail.namaPimpinan, style: STYLES.META_VALUE }
    )
  }
  s1Rows.push(row2)

  // Row 3: Filter info
  s1Rows.push([
    { value: 'Filter Status:', style: STYLES.META_LABEL },
    {
      value:
        status === 'semua'
          ? 'Semua Status'
          : status === 'aktif'
          ? 'Hanya Aktif'
          : 'Hanya Nonaktif',
      style: STYLES.META_VALUE,
    },
    { value: 'Kata Kunci:', style: STYLES.META_LABEL },
    {
      value: searchQuery ? `"${searchQuery}"` : 'Semua',
      style: STYLES.META_VALUE,
    },
    { value: 'Total Data:', style: STYLES.META_LABEL },
    {
      value: `${items.length} ${entityNoun.toLowerCase()}`,
      style: STYLES.META_VALUE,
    },
    { value: 'Waktu Ekspor:', style: STYLES.META_LABEL },
    { value: exportTime, style: STYLES.META_VALUE },
  ])

  // Row 4: Blank
  s1Rows.push([])

  // Row 5: Table Header
  const s1HeaderRow = [
    { value: 'No.', style: STYLES.HEADER },
    { value: 'Kode', style: STYLES.HEADER },
    { value: `Nama ${entityNoun}`, style: STYLES.HEADER },
    { value: 'Pimpinan', style: STYLES.HEADER },
    { value: childColumnHeader, style: STYLES.HEADER },
    { value: 'Jumlah Jemaat (Jiwa)', style: STYLES.HEADER },
    { value: 'Total Pemasukan (Rp)', style: STYLES.HEADER },
    { value: 'Kontribusi (%)', style: STYLES.HEADER },
    { value: 'Status', style: STYLES.HEADER },
  ]
  s1HeaderRow._height = 24
  s1Rows.push(s1HeaderRow)

  let sumAnak = 0
  let sumJemaat = 0
  let sumPemasukan = 0
  let sumKontribusi = 0

  items.forEach((it, idx) => {
    const itAnak = it.jumlahAnak || 0
    const itJemaat = it.jumlahJemaat || 0
    const itPemasukan = it.totalPemasukan || 0
    const itKontribusi = (it.kontribusiPersen || 0) / 100

    sumAnak += itAnak
    sumJemaat += itJemaat
    sumPemasukan += itPemasukan
    sumKontribusi += itKontribusi

    s1Rows.push([
      { value: idx + 1, style: STYLES.INTEGER, type: 'number' },
      { value: it.kodeLengkap || it.kode || '', style: STYLES.TEXT_CENTER },
      { value: it.nama || '', style: STYLES.TEXT },
      { value: it.namaPimpinan || '-', style: STYLES.TEXT },
      { value: itAnak, style: STYLES.INTEGER, type: 'number' },
      { value: itJemaat, style: STYLES.INTEGER, type: 'number' },
      { value: itPemasukan, style: STYLES.CURRENCY, type: 'currency' },
      { value: itKontribusi, style: STYLES.PERCENT, type: 'percent' },
      { value: it.aktif ? 'Aktif' : 'Nonaktif', style: STYLES.TEXT_CENTER },
    ])
  })

  // S1 Total Row
  const s1TotalRow = [
    { value: 'Total', style: STYLES.TOTAL_LABEL },
    { value: '', style: STYLES.TOTAL_LABEL },
    {
      value: `Total Keseluruhan (${items.length} ${entityNoun})`,
      style: STYLES.TOTAL_LABEL,
    },
    { value: '', style: STYLES.TOTAL_LABEL },
    { value: sumAnak, style: STYLES.TOTAL_NUMBER, type: 'number' },
    { value: sumJemaat, style: STYLES.TOTAL_NUMBER, type: 'number' },
    { value: sumPemasukan, style: STYLES.TOTAL_CURRENCY, type: 'currency' },
    {
      value: Math.min(1.0, sumKontribusi),
      style: STYLES.TOTAL_PERCENT,
      type: 'percent',
    },
    { value: '', style: STYLES.TOTAL_LABEL },
  ]
  s1TotalRow._height = 22
  s1Rows.push(s1TotalRow)

  // ---------------------------------------------------------
  // SHEET 2: PARAMETER & FILTER
  // ---------------------------------------------------------
  const s2Rows = []
  s2Rows.push([
    { value: 'PARAMETER & INFORMASI EKSPOR WILAYAH', style: STYLES.TITLE },
  ])
  s2Rows[0]._height = 26
  s2Rows.push([])

  s2Rows.push([
    { value: 'Parameter', style: STYLES.HEADER },
    { value: 'Nilai / Pengaturan', style: STYLES.HEADER },
  ])

  const paramItems = [
    ['Tingkat Wilayah', entityNoun],
    ['Wilayah Induk', parentDetail?.nama || '-'],
    ['Pimpinan Induk', parentDetail?.namaPimpinan || '-'],
    [
      'Filter Status',
      status === 'semua'
        ? 'Semua Status'
        : status === 'aktif'
        ? 'Hanya Aktif'
        : 'Hanya Nonaktif',
    ],
    ['Kata Kunci Pencarian', searchQuery || 'Tidak ada (Semua Data)'],
    ['Urutan Data (Sorting)', sort || 'kode-asc'],
    ['Jumlah Wilayah Diekspor', `${items.length} ${entityNoun.toLowerCase()}`],
    ['Total Jemaat Terhitung', `${sumJemaat.toLocaleString('id-ID')} Jiwa`],
    ['Total Pemasukan Terhitung', `Rp ${sumPemasukan.toLocaleString('id-ID')}`],
    ['Waktu Ekspor', exportTime],
  ]

  paramItems.forEach(([param, val]) => {
    s2Rows.push([
      { value: param, style: STYLES.TEXT },
      { value: val, style: STYLES.TEXT },
    ])
  })

  const sheets = [
    { name: `Daftar ${entityNoun}`, rows: s1Rows },
    { name: 'Informasi & Filter', rows: s2Rows },
  ]

  const safeInduk = (idInduk || 'semua').replace(/[^a-zA-Z0-9_-]/g, '_')
  const targetFilename =
    filename ||
    `hkbp_wilayah_${level}_${safeInduk}_${new Date().toISOString().slice(0, 10)}.xlsx`

  return exportToExcel({
    filename: targetFilename,
    sheets,
  })
}

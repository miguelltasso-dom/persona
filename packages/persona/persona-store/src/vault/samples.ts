/**
 * Minimal PDF / DOCX bytes for Cofre ingest tests. No extra packages.
 */

/**
 * Uncompressed one-or-more-page PDF with known Tj strings.
 * @param pages - Visible page texts.
 */
export function samplePdf(pages: readonly string[]): Uint8Array {
  if (pages.length === 0) throw new Error('sample-pdf-empty')
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  const add = (content: string): number => {
    const n = offsets.length
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${String(n)} 0 obj\n${content}\nendobj\n`
    return n
  }
  add('<< /Type /Catalog /Pages 2 0 R >>')
  const pageRefs: string[] = []
  const pending: Array<{ page: string; stream: string }> = []
  for (const page of pages) {
    const escaped = escapePdf(page)
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`
    pending.push({
      page: '',
      stream: `<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`,
    })
  }
  const fontNum = 3 + pages.length * 2
  for (let i = 0; i < pages.length; i += 1) {
    const pageNum = 3 + i * 2
    const contentNum = pageNum + 1
    pageRefs.push(`${String(pageNum)} 0 R`)
    pending[i] = {
      ...pending[i]!,
      page: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${String(contentNum)} 0 R /Resources << /Font << /F1 ${String(fontNum)} 0 R >> >> >>`,
    }
  }
  add(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${String(pages.length)} >>`)
  for (const item of pending) {
    add(item.page)
    add(item.stream)
  }
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const xrefAt = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${String(offsets.length)}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${String(offsets.length)} /Root 1 0 R >>\nstartxref\n${String(xrefAt)}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/**
 * Uncompressed DOCX with heading + body paragraphs.
 * @param heading - Heading1 text.
 * @param paragraphs - Body lines.
 */
export function sampleDocx(heading: string, paragraphs: readonly string[]): Uint8Array {
  const body = [
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">',
    escapeXml(heading),
    '</w:t></w:r></w:p>',
    ...paragraphs.map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`),
  ].join('')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  const types = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  return zipStore({
    '[Content_Types].xml': types,
    '_rels/.rels': rels,
    'word/document.xml': document,
  })
}

/**
 * Store-method ZIP (no deflate).
 * @param files - Path → UTF-8 text.
 */
export function zipStore(files: Readonly<Record<string, string>>): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30 + nameBuf.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    data.copy(local, 30 + nameBuf.length)
    locals.push(local)
    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralStart = offset
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(locals.length, 8)
  eocd.writeUInt16LE(locals.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(centralStart, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBuf, eocd])
}

function escapePdf(value: string): string {
  return value.replace(/[\\()]/gu, '\\$&')
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE: readonly number[] = buildCrcTable()

function buildCrcTable(): number[] {
  const table: number[] = []
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table.push(c >>> 0)
  }
  return table
}

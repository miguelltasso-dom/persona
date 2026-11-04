/**
 * Local text extraction for Cofre uploads. No network, no extra packages.
 */

import { inflateRawSync, inflateSync } from 'node:zlib'

/** Formats the Cofre accepts. */
export type VaultDocKind = 'pdf' | 'docx' | 'md' | 'txt' | 'csv'

/** One page or heading block before chunking. */
export interface ExtractedUnit {
  readonly locator: string
  readonly text: string
}

/** Failure with a stable code and a pt-BR line. */
export class VaultDocError extends Error {
  readonly userMessage: string

  /**
   * @param code - Machine code.
   * @param userMessage - Line for the UI.
   */
  constructor(readonly code: string, userMessage: string) {
    super(code)
    this.name = 'VaultDocError'
    this.userMessage = userMessage
  }
}

/** Per-file cap for Cofre documents. */
export const MAX_VAULT_DOC_BYTES = 8 * 1024 * 1024

/**
 * @param bytes - Size.
 * @returns pt-BR limit line.
 */
export function vaultDocTooLargeMessage(bytes: number): string {
  const used = Math.max(1, Math.round(bytes / (1024 * 1024)))
  return `Este documento tem ${String(used)} MB. O limite é 8 MB. Escolha um arquivo menor.`
}

/**
 * Classify bytes by signature and name. Rejects anything outside the Cofre set.
 * @param bytes - Raw file.
 * @param filename - Sanitized client name.
 */
export function detectVaultKind(bytes: Uint8Array, filename: string): VaultDocKind {
  if (bytes.byteLength === 0) {
    throw new VaultDocError('empty-file', 'Este arquivo está vazio.')
  }
  if (bytes.byteLength > MAX_VAULT_DOC_BYTES) {
    throw new VaultDocError('file-too-large', vaultDocTooLargeMessage(bytes.byteLength))
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf'
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    if (/\.docx$/iu.test(filename) || looksLikeDocx(bytes)) return 'docx'
  }
  if (looksLikeExecutable(bytes) || /\.(exe|dll|bat|cmd|ps1|msi)$/iu.test(filename)) {
    throw new VaultDocError(
      'type-rejected',
      'Este formato não entra no Cofre. Envie PDF, DOCX, Markdown, TXT ou CSV.',
    )
  }
  if (!isText(bytes)) {
    throw new VaultDocError(
      'type-rejected',
      'Este formato não entra no Cofre. Envie PDF, DOCX, Markdown, TXT ou CSV.',
    )
  }
  if (/\.md$/iu.test(filename)) return 'md'
  if (/\.csv$/iu.test(filename)) return 'csv'
  if (/\.docx$/iu.test(filename)) {
    throw new VaultDocError('type-rejected', 'Este DOCX está danificado. Envie o arquivo de novo.')
  }
  if (/\.pdf$/iu.test(filename)) {
    throw new VaultDocError('type-rejected', 'Este PDF está danificado. Envie o arquivo de novo.')
  }
  return 'txt'
}

/**
 * Extract locator+text units. Empty extract fails loud.
 * @param bytes - Raw file.
 * @param filename - Sanitized client name.
 */
export function extractVaultDocument(bytes: Uint8Array, filename: string): ExtractedUnit[] {
  const kind = detectVaultKind(bytes, filename)
  const units = kind === 'pdf'
    ? extractPdf(bytes)
    : kind === 'docx'
      ? extractDocx(bytes)
      : kind === 'md'
        ? extractMarkdown(decodeText(bytes))
        : kind === 'csv'
          ? extractCsv(decodeText(bytes))
          : extractPlain(decodeText(bytes))
  const kept = units.map(unit => ({ locator: unit.locator, text: collapse(unit.text) })).filter(unit => unit.text !== '')
  if (kept.length === 0) {
    throw new VaultDocError('empty-text', 'Não encontrei texto neste arquivo.')
  }
  return kept
}

/**
 * @param units - Extracted blocks.
 * @returns Joined body for the document row / legacy FTS.
 */
export function joinExtracted(units: readonly ExtractedUnit[]): string {
  return units.map(unit => unit.text).join('\n\n')
}

function extractPlain(text: string): ExtractedUnit[] {
  return [{ locator: 'seção 1', text }]
}

function flushSection(units: ExtractedUnit[], locator: string, buf: string[]): string[] {
  const body = buf.join('\n').trim()
  if (body !== '') units.push({ locator, text: body })
  return []
}

function extractMarkdown(text: string): ExtractedUnit[] {
  const units: ExtractedUnit[] = []
  let locator = 'seção 1'
  let buf: string[] = []
  const flush = (): void => {
    buf = flushSection(units, locator, buf)
  }
  for (const line of text.split(/\r?\n/u)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line)
    if (heading !== null) {
      flush()
      locator = `seção ${heading[2]!.trim()}`
      continue
    }
    buf.push(line)
  }
  flush()
  return units.length === 0 ? extractPlain(text) : units
}

function extractCsv(text: string): ExtractedUnit[] {
  const lines = text.split(/\r?\n/u).filter(line => line.trim() !== '')
  if (lines.length === 0) return []
  const header = lines[0]!
  const body = lines.slice(1).join('\n')
  return [{ locator: `seção ${header.slice(0, 80)}`, text: body === '' ? header : `${header}\n${body}` }]
}

function extractPdf(bytes: Uint8Array): ExtractedUnit[] {
  const latin = Buffer.from(bytes).toString('latin1')
  const pages = [...latin.matchAll(/\/Type\s*\/Page(?!s)\b/gu)].length
  const chunks: string[] = []
  const streamRe = /stream\r?\n([\s\S]*?)endstream/gu
  let match: RegExpExecArray | null
  while ((match = streamRe.exec(latin)) !== null) {
    const raw = Buffer.from(match[1] ?? '', 'latin1')
    const head = latin.slice(Math.max(0, match.index - 240), match.index)
    const decoded = /\/FlateDecode/u.test(head) ? inflatePdf(raw) : raw
    const text = pdfOperators(Buffer.from(decoded).toString('latin1'))
    if (text !== '') chunks.push(text)
  }
  if (chunks.length === 0) {
    const fallback = pdfOperators(latin)
    if (fallback !== '') chunks.push(fallback)
  }
  if (chunks.length === 0) return []
  if (pages <= 1 || chunks.length === 1) {
    return [{ locator: 'página 1', text: chunks.join('\n') }]
  }
  return chunks.map((text, index) => ({ locator: `página ${String(index + 1)}`, text }))
}

function inflatePdf(raw: Uint8Array): Uint8Array {
  try {
    return inflateSync(raw)
  } catch {
    try {
      return inflateRawSync(raw)
    } catch {
      return raw
    }
  }
}

function pdfOperators(source: string): string {
  const parts: string[] = []
  const tj = /\((?:\\.|[^\\)])*\)\s*Tj/gu
  let match: RegExpExecArray | null
  while ((match = tj.exec(source)) !== null) {
    parts.push(unescapePdf(match[0].slice(1, match[0].lastIndexOf(')'))))
  }
  const tjArray = /\[([\s\S]*?)\]\s*TJ/gu
  while ((match = tjArray.exec(source)) !== null) {
    const inner = match[1] ?? ''
    const bits = inner.match(/\((?:\\.|[^\\)])*\)/gu) ?? []
    for (const bit of bits) parts.push(unescapePdf(bit.slice(1, -1)))
  }
  return collapse(parts.join(' '))
}

function unescapePdf(value: string): string {
  return value
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(/\\([()\\])/gu, '$1')
    .replace(/\\(\d{1,3})/gu, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)))
}

function extractDocx(bytes: Uint8Array): ExtractedUnit[] {
  const files = unzipStore(bytes)
  const xml = files.get('word/document.xml')
  if (xml === undefined) {
    throw new VaultDocError('type-rejected', 'Este DOCX está danificado. Envie o arquivo de novo.')
  }
  const source = Buffer.from(xml).toString('utf8')
  const units: ExtractedUnit[] = []
  let locator = 'seção 1'
  let buf: string[] = []
  const flush = (): void => {
    buf = flushSection(units, locator, buf)
  }
  const paragraphs = source.match(/<w:p[\s>][\s\S]*?<\/w:p>/gu) ?? []
  for (const paragraph of paragraphs) {
    const style = /<w:pStyle\s+w:val="([^"]+)"/u.exec(paragraph)
    const texts = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)].map(item => decodeXml(item[1] ?? ''))
    const line = texts.join('').trim()
    if (line === '') continue
    if (style !== null && /heading|t[ií]tulo|title/iu.test(style[1] ?? '')) {
      flush()
      locator = `seção ${line}`
      continue
    }
    buf.push(line)
  }
  flush()
  return units
}

function looksLikeDocx(bytes: Uint8Array): boolean {
  const latin = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096))).toString('latin1')
  return latin.includes('word/') || latin.includes('[Content_Types].xml')
}

function unzipStore(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + 30 <= bytes.length) {
    if (readU32(bytes, offset) !== 0x04034b50) break
    const method = readU16(bytes, offset + 8)
    const compressed = readU32(bytes, offset + 18)
    const nameLen = readU16(bytes, offset + 26)
    const extraLen = readU16(bytes, offset + 28)
    const name = Buffer.from(bytes.subarray(offset + 30, offset + 30 + nameLen)).toString('utf8')
    const start = offset + 30 + nameLen + extraLen
    const payload = bytes.subarray(start, start + compressed)
    if (method === 0) out.set(name, Uint8Array.from(payload))
    else if (method === 8) out.set(name, inflateRawSync(payload))
    offset = start + compressed
  }
  return out
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)
  ) >>> 0
}

function decodeText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '')
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
}

function looksLikeExecutable(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true
  return false
}

function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  const text = Buffer.from(bytes).toString('utf8')
  return text.length > 0 && !/[\uFFFD]/u.test(text.slice(0, 64))
}

function collapse(text: string): string {
  return text.replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').replace(/[ \t]{2,}/gu, ' ').trim()
}

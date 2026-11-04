/**
 * Magic-byte type gate, name hygiene, and size caps for uploads.
 */

import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'

/** Per-file cap for message attachments. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024
/** Avatar cap (SCOPE §1). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
/** Files bound to one message. */
export const MAX_FILES_PER_MESSAGE = 8
/** Sum of files on one message. */
export const MAX_BYTES_PER_MESSAGE = 20 * 1024 * 1024
/** Project quota (attachments only). */
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024
/** Longest image edge for an uploaded avatar. */
export const MAX_AVATAR_EDGE = 2_048

/** Upload refusal with a stable code and a pt-BR line for the UI. */
export class MediaError extends Error {
  readonly userMessage: string

  /**
   * @param code - Stable machine code.
   * @param userMessage - pt-BR line.
   */
  constructor(readonly code: string, userMessage: string) {
    super(code)
    this.name = 'MediaError'
    this.userMessage = userMessage
  }
}

/**
 * @param bytes - Size.
 * @param cap - Limit.
 * @param label - What the person uploaded.
 */
export function fileTooLargeMessage(bytes: number, cap: number, label: string): string {
  const used = Math.max(1, Math.round(bytes / (1024 * 1024)))
  const limit = Math.round(cap / (1024 * 1024))
  return `${label} tem ${String(used)} MB. O limite é ${String(limit)} MB. Escolha um arquivo menor.`
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/iu
const BAD_CHARS = /[<>:"/\\|?*\u0000-\u001f]/gu

/** Result of inspecting one upload. */
export interface DetectedBlob {
  readonly mime: string
  readonly name: string
  readonly bytes: number
  readonly credentialWarning: boolean
  readonly width?: number
  readonly height?: number
}

/**
 * Sanitize a client filename. Drops paths, reserved Windows names, and junk.
 * @param raw - Name the person picked.
 */
export function sanitizeUploadName(raw: string): string {
  const slash = raw.replaceAll('\\', '/').split('/').pop() ?? ''
  let name = slash.normalize('NFC').replace(BAD_CHARS, '_').replace(/^\.+/, '').trim()
  if (name === '' || RESERVED.test(name)) name = 'arquivo'
  if (name.length > 120) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && dot > name.length - 8 ? name.slice(dot) : ''
    name = `${name.slice(0, 120 - ext.length)}${ext}`
  }
  return name
}

/**
 * Classify bytes by signature. Rejects SVG, HTML, and executables.
 * @param bytes - Raw file.
 * @param rawName - Client name (hygiene only).
 * @param kind - Attachment or avatar.
 */
export function detectUpload(bytes: Uint8Array, rawName: string, kind: 'attachment' | 'avatar'): DetectedBlob {
  const name = sanitizeUploadName(rawName)
  const cap = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_FILE_BYTES
  if (bytes.byteLength === 0) throw new Error('empty-file')
  if (bytes.byteLength > cap) {
    throw new MediaError(
      'file-too-large',
      fileTooLargeMessage(bytes.byteLength, cap, kind === 'avatar' ? 'Esta foto' : 'Este anexo'),
    )
  }
  if (looksLikeSvg(bytes) || name.toLowerCase().endsWith('.svg')) throw new Error('svg-rejected')
  if (looksLikeHtml(bytes) || /\.(html?|xhtml)$/iu.test(name)) throw new Error('html-rejected')
  if (looksLikeExecutable(bytes) || /\.(exe|dll|bat|cmd|ps1|msi|com|scr|js|mjs|cjs|wasm)$/iu.test(name)) {
    throw new Error('executable-rejected')
  }
  const png = readPng(bytes)
  if (png !== undefined) return finish('image/png', name, bytes, png)
  const jpeg = readJpeg(bytes)
  if (jpeg !== undefined) return finish('image/jpeg', name, bytes, jpeg)
  const webp = readWebp(bytes)
  if (webp !== undefined) return finish('image/webp', name, bytes, webp)
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    if (kind === 'avatar') throw new Error('type-rejected')
    return finish('image/gif', name, bytes)
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    if (kind === 'avatar') throw new Error('type-rejected')
    return finish('application/pdf', name, bytes)
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && /\.docx$/iu.test(name)) {
    if (kind === 'avatar') throw new Error('type-rejected')
    return finish('application/vnd.openxmlformats-officedocument.wordprocessingml.document', name, bytes)
  }
  if (kind === 'avatar') throw new Error('type-rejected')
  if (isText(bytes)) {
    const mime = /\.md$/iu.test(name) ? 'text/markdown' : /\.csv$/iu.test(name) ? 'text/csv' : 'text/plain'
    return finish(mime, name, bytes)
  }
  throw new Error('type-rejected')
}

function finish(
  mime: string,
  name: string,
  bytes: Uint8Array,
  size?: { width: number; height: number },
): DetectedBlob {
  const text = mime.startsWith('text/') ? Buffer.from(bytes).toString('utf8') : ''
  const detected: DetectedBlob = {
    mime,
    name,
    bytes: bytes.byteLength,
    credentialWarning: text !== '' && looksLikeCredential(text),
  }
  if (size === undefined) return detected
  if (size.width > MAX_AVATAR_EDGE || size.height > MAX_AVATAR_EDGE) throw new Error('image-too-large')
  return { ...detected, width: size.width, height: size.height }
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 256)).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  return /^<svg[\s>]/iu.test(head) || /^<\?xml[\s\S]{0,120}<svg[\s>]/iu.test(head)
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 256)).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  return /^<!doctype\s+html/iu.test(head) || /^<html[\s>]/iu.test(head)
}

function looksLikeExecutable(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true
  if (bytes.length >= 4 && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) return true
  if (bytes.length >= 4 && bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa) return true
  return bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21
}

function readPng(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return undefined
  const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!
  const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!
  return { width, height }
}

function readJpeg(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return undefined
  let i = 2
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) return { width: 1, height: 1 }
    const marker = bytes[i + 1]!
    const size = (bytes[i + 2]! << 8) | bytes[i + 3]!
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! }
    }
    i += 2 + size
  }
  return { width: 1, height: 1 }
}

function readWebp(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 16) return undefined
  const riff = Buffer.from(bytes.subarray(0, 4)).toString('ascii')
  const webp = Buffer.from(bytes.subarray(8, 12)).toString('ascii')
  if (riff !== 'RIFF' || webp !== 'WEBP') return undefined
  const tag = Buffer.from(bytes.subarray(12, 16)).toString('ascii')
  if (tag === 'VP8X' && bytes.length >= 30) {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16))
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16))
    return { width, height }
  }
  return { width: 1, height: 1 }
}

function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    const text = Buffer.from(bytes).toString('utf8')
    return text.length > 0 && !/[\uFFFD]/.test(text.slice(0, 64))
  } catch {
    return false
  }
}

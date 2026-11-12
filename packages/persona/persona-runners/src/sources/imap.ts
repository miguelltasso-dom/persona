/**
 * Read-only IMAP reader (harvest 19b). Opens the mailbox with EXAMINE and fetches with BODY.PEEK[], so nothing is
 * ever marked as read, moved or deleted. The only commands this module sends are in READ_ONLY_IMAP_COMMANDS.
 *
 * The credential is a JSON string in the vault: `{ host, port, secure, user, password, mailbox?, limit? }`.
 */

import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { EmailMessage } from './email.ts'

/** One mailbox login. */
export interface ImapCredentials {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user: string
  readonly password: string
}

/** What to read: the login plus an optional folder and cap. */
export interface ImapReadOptions extends ImapCredentials {
  readonly mailbox?: string
  readonly limit?: number
  readonly timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_BODY_CHARS = 4_000

/**
 * Read the newest messages of one mailbox, read-only.
 * @param options - Login, folder, cap and timeout.
 * @returns Parsed messages, oldest first among the newest `limit`.
 * @throws When the server refuses the login or the connection fails.
 */
export async function readImapInbox(options: ImapReadOptions): Promise<EmailMessage[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const { session, socket } = await openReadOnly(options)
  try {
    const search = await session.command('a4', 'UID SEARCH ALL')
    const uids = search.lines
      .filter(line => /^\* SEARCH\b/u.test(line))
      .flatMap(line => line.replace(/^\* SEARCH\b/u, '').trim().split(/\s+/u))
      .filter(uid => /^\d+$/u.test(uid))
      .slice(-limit)
    const messages: EmailMessage[] = []
    let tag = 5
    for (const uid of uids) {
      const fetched = await session.command(`a${String(tag)}`, `UID FETCH ${uid} (BODY.PEEK[])`)
      tag += 1
      const raw = fetched.literals[0]
      if (raw !== undefined) messages.push(parseEmail(raw, uid))
    }
    await session.command(`a${String(tag)}`, 'LOGOUT').catch(() => undefined)
    return messages
  } finally {
    socket.destroy()
  }
}

/**
 * Open the mailbox read-only (EXAMINE) and report how many messages it holds. Nothing is fetched, so the test behind
 * “Testar conexão” never downloads a body.
 * @param options - Login, folder and timeout.
 * @returns The folder's message count.
 * @throws When the server refuses the login or the connection fails.
 */
export async function probeImap(options: ImapReadOptions): Promise<{ messages: number }> {
  const { session, socket, messages } = await openReadOnly(options)
  try {
    await session.command('a4', 'LOGOUT').catch(() => undefined)
    return { messages }
  } finally {
    socket.destroy()
  }
}

/** A session already logged in and in EXAMINE, with the folder's message count. */
interface ReadOnlySession {
  readonly session: ImapSession
  readonly socket: Socket
  readonly messages: number
}

async function openReadOnly(options: ImapReadOptions): Promise<ReadOnlySession> {
  const socket = options.secure
    ? tlsConnect({ host: options.host, port: options.port, servername: options.host })
    : netConnect({ host: options.host, port: options.port })
  socket.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const session = new ImapSession(socket)
  try {
    await session.connected(options.secure)
    await session.command('a1', 'CAPABILITY')
    await session.command('a2', `LOGIN ${quote(options.user)} ${quote(options.password)}`)
    const examined = await session.command('a3', `EXAMINE ${quote(options.mailbox ?? 'INBOX')}`)
    const exists = examined.lines
      .map(line => /^\* (\d+) EXISTS\b/u.exec(line)?.[1])
      .find(value => value !== undefined)
    return { session, socket, messages: exists === undefined ? 0 : Number(exists) }
  } catch (error: unknown) {
    socket.destroy()
    throw error
  }
}

/**
 * Read the mailbox from the vault's JSON credential. A malformed credential reads nothing; a refused login or a
 * failed connection rejects with the server's reason (never the secret).
 * @param secret - Vault value (`{ host, port, secure, user, password, mailbox?, limit? }`).
 * @returns The parsed messages (empty for a malformed credential).
 */
export async function readImapInboxFromSecret(secret: string): Promise<readonly EmailMessage[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(secret)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  // Justified: JSON boundary; every field is read with a `typeof` check below.
  const row = parsed as Record<string, unknown>
  const host = typeof row.host === 'string' ? row.host : ''
  const user = typeof row.user === 'string' ? row.user : ''
  const password = typeof row.password === 'string' ? row.password : ''
  if (host === '' || user === '' || password === '') return []
  return readImapInbox({
    host,
    user,
    password,
    port: typeof row.port === 'number' && Number.isInteger(row.port) ? row.port : 993,
    secure: row.secure !== false,
    mailbox: typeof row.mailbox === 'string' && row.mailbox !== '' ? row.mailbox : 'INBOX',
    limit: typeof row.limit === 'number' && Number.isInteger(row.limit) ? row.limit : DEFAULT_LIMIT,
  })
}

/** One command/response exchange with the server. */
interface ImapReply {
  readonly lines: readonly string[]
  readonly literals: readonly Buffer[]
}

class ImapSession {
  private buffer = Buffer.alloc(0)
  private wake: (() => void) | undefined
  private failure: Error | undefined
  private ended = false

  constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.wake?.()
    })
    socket.on('error', (error: Error) => {
      this.failure = error
      this.wake?.()
    })
    socket.on('close', () => {
      this.ended = true
      this.wake?.()
    })
    socket.on('timeout', () => {
      this.failure = new Error('imap: timeout')
      socket.destroy()
      this.wake?.()
    })
  }

  /**
   * Wait for the socket to be usable.
   * @param secure - TLS sockets become usable on `secureConnect`.
   */
  async connected(secure: boolean): Promise<void> {
    if (!this.socket.connecting) return
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    this.socket.once(secure ? 'secureConnect' : 'connect', resolve)
    this.socket.once('error', reject)
    await promise
  }

  /**
   * Send one tagged command and collect its untagged lines and literals.
   * @param tag - Tag (`a1`, `a2`…).
   * @param text - Command text after the tag.
   */
  async command(tag: string, text: string): Promise<ImapReply> {
    this.socket.write(`${tag} ${text}\r\n`)
    const lines: string[] = []
    const literals: Buffer[] = []
    for (;;) {
      const next = await this.nextLine()
      if (next.literal !== undefined) literals.push(next.literal)
      if (next.line.startsWith(`${tag} `)) {
        if (!/ OK\b/u.test(next.line)) throw new Error(`imap: ${next.line.slice(tag.length + 1).trim()}`)
        return { lines, literals }
      }
      lines.push(next.line)
    }
  }

  private async nextLine(): Promise<{ line: string; literal?: Buffer }> {
    for (;;) {
      const end = this.buffer.indexOf('\r\n')
      if (end < 0) {
        await this.fill()
        continue
      }
      const line = this.buffer.subarray(0, end).toString('utf8')
      this.buffer = this.buffer.subarray(end + 2)
      const size = /\{(\d+)\}$/u.exec(line)?.[1]
      if (size === undefined) return { line }
      const bytes = Number(size)
      while (this.buffer.length < bytes) await this.fill()
      const literal = this.buffer.subarray(0, bytes)
      this.buffer = this.buffer.subarray(bytes)
      return { line, literal }
    }
  }

  private async fill(): Promise<void> {
    if (this.failure !== undefined) throw this.failure
    if (this.ended) throw new Error('imap: connection closed')
    const { promise, resolve } = Promise.withResolvers<void>()
    this.wake = resolve
    queueMicrotask(() => {
      if (this.buffer.length > 0 || this.failure !== undefined || this.ended) resolve()
    })
    await promise
    this.wake = undefined
    if (this.failure !== undefined) throw this.failure
  }
}

function quote(value: string): string {
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

function parseEmail(raw: Buffer, uid: string): EmailMessage {
  const split = raw.indexOf('\r\n\r\n')
  const headers = parseHeaders(raw.subarray(0, split < 0 ? raw.length : split).toString('utf8'))
  const body = split < 0 ? Buffer.alloc(0) : raw.subarray(split + 4)
  const at = headers.date === undefined ? undefined : new Date(headers.date)
  return {
    id: headers['message-id'] ?? `uid:${uid}`,
    from: decodeWords(headers.from ?? ''),
    to: decodeWords(headers.to ?? ''),
    subject: decodeWords(headers.subject ?? ''),
    text: decodeBody(headers, body).slice(0, MAX_BODY_CHARS),
    ...(at === undefined || Number.isNaN(at.getTime()) ? {} : { at: at.toISOString() }),
    ...(isBulk(headers) ? { bulk: true } : {}),
  }
}

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  for (const line of text.split(/\r?\n/u)) {
    if (/^[ \t]/u.test(line) && key !== '') {
      out[key] = `${out[key] ?? ''} ${line.trim()}`
      continue
    }
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    key = line.slice(0, colon).trim().toLowerCase()
    out[key] = line.slice(colon + 1).trim()
  }
  return out
}

function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/gu, (_match, charset: string, encoding: string, data: string) => {
    try {
      const bytes = encoding.toUpperCase() === 'B'
        ? Buffer.from(data, 'base64')
        : decodeQuotedPrintable(Buffer.from(data.replace(/_/gu, ' '), 'latin1'))
      return new TextDecoder(charset.toLowerCase()).decode(bytes)
    } catch {
      return data
    }
  })
}

function decodeBody(headers: Record<string, string>, body: Buffer): string {
  const boundary = /boundary="?([^";]+)"?/iu.exec(headers['content-type'] ?? '')?.[1]
  if (boundary !== undefined) {
    for (const part of splitMultipart(body, boundary)) {
      const split = part.indexOf('\r\n\r\n')
      if (split < 0) continue
      const partHeaders = parseHeaders(part.subarray(0, split).toString('utf8'))
      if ((partHeaders['content-type'] ?? 'text/plain').toLowerCase().startsWith('text/plain')) {
        return decodeTransfer(partHeaders, part.subarray(split + 4))
      }
    }
  }
  return decodeTransfer(headers, body)
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const marker = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let start = body.indexOf(marker)
  while (start >= 0) {
    const next = body.indexOf(marker, start + marker.length)
    if (next < 0) break
    parts.push(body.subarray(start + marker.length + 2, next))
    start = next
  }
  return parts
}

function decodeTransfer(headers: Record<string, string>, body: Buffer): string {
  const encoding = (headers['content-transfer-encoding'] ?? '').toLowerCase()
  if (encoding === 'base64') return Buffer.from(body.toString('latin1').replace(/\s+/gu, ''), 'base64').toString('utf8')
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(body).toString('utf8')
  return body.toString('utf8')
}

function decodeQuotedPrintable(input: Buffer): Buffer {
  const text = input.toString('latin1').replace(/=\r?\n/gu, '')
  const bytes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (char === '=' && /^[0-9A-Fa-f]{2}$/u.test(text.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(text.charCodeAt(index))
    }
  }
  return Buffer.from(bytes)
}

function isBulk(headers: Record<string, string>): boolean {
  if (headers['list-unsubscribe'] !== undefined) return true
  if (/^(?:bulk|list|junk)$/iu.test(headers.precedence ?? '')) return true
  const auto = (headers['auto-submitted'] ?? '').toLowerCase()
  return auto !== '' && auto !== 'no'
}

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
  /** Idle timeout of the socket. */
  readonly timeoutMs?: number
  /** Deadline of the WHOLE session (connect, login, search and every fetch), so a slow server cannot hold the host for long. */
  readonly totalTimeoutMs?: number
  /** Only mail that arrived in the last N days is searched (default 14): never the whole mailbox. */
  readonly sinceDays?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000
const DEFAULT_SINCE_DAYS = 14
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_BODY_CHARS = 4_000
/** What is asked of the server for the text of a message: the first 32 KiB, so an attachment never travels. */
const MAX_TEXT_BYTES = 32_768
/** No single literal of a reply may be bigger than this (a server that ignores the partial fetch cannot fill the host's memory). */
const MAX_LITERAL_BYTES = 262_144
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
/** CR, LF, NUL and the other control characters: none can be part of a quoted IMAP string, and a CR/LF would start another command. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u

/**
 * Refuse a login or folder name that holds a control character, BEFORE any socket is opened (P0-11: a CRLF inside a quoted name was a command injection).
 * The message names the field, never its value.
 * @param options - What the reader was asked to do.
 * @throws When the user, the password or the folder holds a control character.
 */
function assertSafeOptions(options: ImapReadOptions): void {
  const fields: ReadonlyArray<readonly [string, string | undefined]> = [['usuário', options.user], ['senha', options.password], ['pasta', options.mailbox]]
  for (const [label, value] of fields) {
    if (value !== undefined && CONTROL_CHARS.test(value)) throw new Error(`imap: ${label} com caracteres de controle (quebra de linha ou nulo) não é aceito`)
  }
}

/** `D-Mon-YYYY` in English, as IMAP `SINCE` wants it. */
function imapDate(at: Date): string {
  return `${String(at.getUTCDate())}-${MONTHS[at.getUTCMonth()] ?? 'Jan'}-${String(at.getUTCFullYear())}`
}

/**
 * Read the newest messages of one mailbox, read-only.
 * @param options - Login, folder, cap and timeout.
 * @returns Parsed messages, oldest first among the newest `limit`.
 * @throws When the server refuses the login or the connection fails.
 */
export async function readImapInbox(options: ImapReadOptions): Promise<EmailMessage[]> {
  assertSafeOptions(options)
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const { session, socket } = await openReadOnly(options)
  try {
    // Only recent mail: never the UID list of the whole mailbox every five minutes.
    const since = new Date(Date.now() - Math.max(options.sinceDays ?? DEFAULT_SINCE_DAYS, 1) * 86_400_000)
    const search = await session.command('a4', `UID SEARCH SINCE ${imapDate(since)}`)
    const uids = search.lines
      .filter(line => /^\* SEARCH\b/u.test(line))
      .flatMap(line => line.replace(/^\* SEARCH\b/u, '').trim().split(/\s+/u))
      .filter(uid => /^\d+$/u.test(uid))
      .slice(-limit)
    const messages: EmailMessage[] = []
    let tag = 5
    for (const uid of uids) {
      // The header and the first bytes of the text only (P0-11): a 100 MB attachment is never downloaded into the host's memory.
      const fetched = await session.command(`a${String(tag)}`, `UID FETCH ${uid} (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.${String(MAX_TEXT_BYTES)}>)`)
      tag += 1
      const [header, text] = fetched.literals
      if (header !== undefined) messages.push(parseEmail(joinMessage(header, text), uid))
    }
    await session.command(`a${String(tag)}`, 'LOGOUT').catch(() => undefined)
    return messages
  } finally {
    session.close()
    socket.destroy()
  }
}

/** The header literal (which ends with the blank line) and the first bytes of the text, as one message. */
function joinMessage(header: Buffer, text: Buffer | undefined): Buffer {
  const head = header.subarray(Math.max(header.length - 4, 0)).toString('latin1') === '\r\n\r\n' ? header : Buffer.concat([header, Buffer.from('\r\n\r\n')])
  return text === undefined ? head : Buffer.concat([head, text])
}

/**
 * Open the mailbox read-only (EXAMINE) and report how many messages it holds. Nothing is fetched, so the test behind
 * “Testar conexão” never downloads a body.
 * @param options - Login, folder and timeout.
 * @returns The folder's message count.
 * @throws When the server refuses the login or the connection fails.
 */
export async function probeImap(options: ImapReadOptions): Promise<{ messages: number }> {
  assertSafeOptions(options)
  const { session, socket, messages } = await openReadOnly(options)
  try {
    await session.command('a4', 'LOGOUT').catch(() => undefined)
    return { messages }
  } finally {
    session.close()
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
  const session = new ImapSession(socket, options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS)
  try {
    await session.connected(options.secure)
    // The server speaks first: read its greeting (`* OK` / `* PREAUTH`) before any command, and stop on a BYE or NO.
    await session.greeting()
    await session.command('a1', 'CAPABILITY')
    await session.command('a2', `LOGIN ${quote(options.user)} ${quote(options.password)}`)
    const examined = await session.command('a3', `EXAMINE ${quote(options.mailbox ?? 'INBOX')}`)
    const exists = examined.lines
      .map(line => /^\* (\d+) EXISTS\b/u.exec(line)?.[1])
      .find(value => value !== undefined)
    return { session, socket, messages: exists === undefined ? 0 : Number(exists) }
  } catch (error: unknown) {
    session.close()
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
  /** Bytes arrived since the last time something waited for them (so a half-read line waits for MORE data, never spins on the old). */
  private fresh = false
  private readonly deadline: ReturnType<typeof setTimeout>

  constructor(private readonly socket: Socket, totalTimeoutMs: number) {
    // The deadline of the WHOLE session (P0-11): the socket's own timeout is only an idle timeout and a slow server can keep it alive forever.
    this.deadline = setTimeout(() => { this.abort(new Error('imap: tempo total esgotado')) }, totalTimeoutMs)
    this.deadline.unref()
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.fresh = true
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

  /** Stop the session now: whatever waits for the server fails with `error`, and the socket is closed. */
  abort(error: Error): void {
    this.failure ??= error
    this.wake?.()
    this.socket.destroy()
  }

  /** The session is over: its deadline no longer applies. */
  close(): void {
    clearTimeout(this.deadline)
  }

  /**
   * The line a server says first. Only `* OK` and `* PREAUTH` let the session go on; a `* BYE` or `* NO` is the server's refusal.
   * @throws With the server's own words (never the login).
   */
  async greeting(): Promise<void> {
    const { line } = await this.nextLine()
    if (!/^\* (?:OK|PREAUTH)\b/iu.test(line)) throw new Error(`imap: ${line.replace(/^\*\s*/u, '').trim() || 'o servidor não cumprimentou'}`)
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
      // A literal bigger than the cap is refused before it is held (P0-11): a server that ignores the partial fetch cannot fill the host's memory.
      if (bytes > MAX_LITERAL_BYTES) {
        const error = new Error('imap: resposta grande demais')
        this.abort(error)
        throw error
      }
      while (this.buffer.length < bytes) await this.fill()
      const literal = this.buffer.subarray(0, bytes)
      this.buffer = this.buffer.subarray(bytes)
      return { line, literal }
    }
  }

  /**
   * Wait for MORE bytes. Only bytes that arrived since the last wait count: waiting on a half-read line or literal used to resolve at once
   * (the buffer was not empty), a loop of microtasks that never let the socket deliver the rest and froze the whole host on any reply that
   * came in more than one chunk (P0-11).
   */
  private async fill(): Promise<void> {
    for (;;) {
      if (this.failure !== undefined) throw this.failure
      if (this.fresh) {
        this.fresh = false
        return
      }
      if (this.ended) throw new Error('imap: connection closed')
      const { promise, resolve } = Promise.withResolvers<void>()
      this.wake = resolve
      await promise
      this.wake = undefined
    }
  }
}

function quote(value: string): string {
  // Defense in depth: the options were already checked, and nothing with a control character is ever put in a command.
  if (CONTROL_CHARS.test(value)) throw new Error('imap: valor com caracteres de controle não é aceito')
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
  // The text is only the first bytes of the message: the part that was cut short has no boundary after it, and it is still read (never `--` of the end marker).
  if (start >= 0 && body.subarray(start + marker.length, start + marker.length + 2).toString('latin1') !== '--') parts.push(body.subarray(start + marker.length + 2))
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

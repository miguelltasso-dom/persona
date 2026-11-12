import { createServer, type AddressInfo, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { probeImap, readImapInbox, readImapInboxFromSecret } from '../src/index.ts'

const HEADER = [
  'From: =?UTF-8?B?Rm9ybmVjZWRvcg==?= <fornecedor@loja.com.br>',
  'To: vendas@loja.com.br',
  'Subject: =?UTF-8?B?UGVkaWRvIDQy?=',
  'Message-ID: <m1@loja>',
  'Date: Wed, 11 Nov 2026 18:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
].join('\r\n')
const RAW = `${HEADER}\r\n\r\nSegue o pedido 42.`

const BULK = [
  'From: news@loja.com.br',
  'To: vendas@loja.com.br',
  'Subject: Promoção',
  'List-Unsubscribe: <mailto:unsub@loja.com.br>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Oferta da semana.',
].join('\r\n')

const servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

interface FakeOptions {
  readonly failLogin?: boolean
  /** The first line the server says (default `* OK fake IMAP ready`). */
  readonly greeting?: string
  /** The server waits this long before the greeting (a slow server). */
  readonly greetDelayMs?: number
  /** The server waits this long before answering each command. */
  readonly commandDelayMs?: number
  /** The text part is this big no matter what the client asked for (a server that ignores the partial fetch). */
  readonly hugeTextBytes?: number
  /** The fetch reply arrives in pieces of this many bytes, a few milliseconds apart (any real network does this to a big reply). */
  readonly chunkBytes?: number
}

/** Write a reply whole, or in small pieces when the fake was asked to. */
function send(socket: { write(text: string): unknown }, payload: string, chunkBytes: number | undefined): void {
  if (chunkBytes === undefined) {
    socket.write(payload)
    return
  }
  let at = 0
  const next = (): void => {
    if (at >= payload.length) return
    socket.write(payload.slice(at, at + chunkBytes))
    at += chunkBytes
    setTimeout(next, 2)
  }
  next()
}

/** A fake IMAP server: it records every line the client sends and how many had arrived when the greeting was written. */
function fakeImap(messages: readonly string[], options: FakeOptions = {}): Promise<{ port: number; commands: string[]; commandsAtGreeting: () => number }> {
  return new Promise((resolve) => {
    const commands: string[] = []
    let atGreeting = -1
    const server = createServer((socket) => {
      socket.on('error', () => undefined)
      setTimeout(() => {
        atGreeting = commands.length
        socket.write(`${options.greeting ?? '* OK fake IMAP ready'}\r\n`)
      }, options.greetDelayMs ?? 0)
      let buffer = ''
      const answer = (line: string): void => {
        const tag = line.split(' ')[0] ?? 'a0'
        if (/CAPABILITY/u.test(line)) socket.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`)
        else if (/LOGIN/u.test(line)) socket.write(options.failLogin === true ? `${tag} NO bad credentials\r\n` : `${tag} OK logged in\r\n`)
        else if (/EXAMINE/u.test(line)) socket.write(`* ${String(messages.length)} EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`)
        else if (/UID SEARCH/u.test(line)) socket.write(`* SEARCH ${messages.map((_message, index) => String(index + 1)).join(' ')}\r\n${tag} OK done\r\n`)
        else if (/UID FETCH (\d+)/u.test(line)) {
          const uid = Number(/UID FETCH (\d+)/u.exec(line)?.[1] ?? '1')
          const raw = messages[uid - 1] ?? ''
          const split = raw.indexOf('\r\n\r\n')
          const header = split < 0 ? `${raw}\r\n\r\n` : raw.slice(0, split + 4)
          const text = options.hugeTextBytes === undefined ? (split < 0 ? '' : raw.slice(split + 4)) : 'x'.repeat(options.hugeTextBytes)
          send(socket, `* ${String(uid)} FETCH (BODY[HEADER] {${String(Buffer.byteLength(header))}}\r\n${header} BODY[TEXT]<0> {${String(Buffer.byteLength(text))}}\r\n${text})\r\n${tag} OK done\r\n`, options.chunkBytes)
        } else if (/LOGOUT/u.test(line)) socket.write(`* BYE\r\n${tag} OK done\r\n`)
        else socket.write(`${tag} OK done\r\n`)
      }
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        for (;;) {
          const end = buffer.indexOf('\r\n')
          if (end < 0) break
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          commands.push(line)
          if (options.commandDelayMs === undefined) answer(line)
          else setTimeout(() => { answer(line) }, options.commandDelayMs)
        }
      })
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, commands, commandsAtGreeting: () => atGreeting }))
  })
}

const login = { user: 'vendas@loja.com.br', password: 'segredo' }

describe('harvest 19b: read-only IMAP reader', () => {
  it('opens with EXAMINE, fetches only the header and the first bytes of the text, and never mutates the mailbox', async () => {
    const { port, commands } = await fakeImap([RAW, BULK])
    const messages = await readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      id: '<m1@loja>',
      from: 'Fornecedor <fornecedor@loja.com.br>',
      to: 'vendas@loja.com.br',
      subject: 'Pedido 42',
      text: 'Segue o pedido 42.',
    })
    expect(messages[0]?.bulk).toBeUndefined()
    expect(messages[1]?.bulk).toBe(true)
    expect(commands.some(line => /EXAMINE "INBOX"/u.test(line))).toBe(true)
    expect(commands.some(line => /UID FETCH 1 \(BODY\.PEEK\[HEADER\] BODY\.PEEK\[TEXT\]<0\.32768>\)/u.test(line))).toBe(true)
    expect(commands.join(' ')).not.toMatch(/BODY\.PEEK\[\]/u) // never the whole MIME with its attachments (P0-11)
    expect(commands.join(' ')).not.toMatch(/\b(?:STORE|EXPUNGE|COPY|MOVE|APPEND|DELETE)\b/u)
    expect(JSON.stringify(messages)).not.toContain('segredo')
  })

  it('refuses a bad login without leaking the password', async () => {
    const { port } = await fakeImap([RAW], { failLogin: true })
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })).rejects.toThrow(/imap: NO bad credentials/u)
  })

  it('probes the connection with EXAMINE and counts the folder, fetching no body', async () => {
    const { port, commands } = await fakeImap([RAW, BULK])
    expect(await probeImap({ host: '127.0.0.1', port, secure: false, ...login })).toEqual({ messages: 2 })
    expect(commands.some(line => /EXAMINE "INBOX"/u.test(line))).toBe(true)
    expect(commands.some(line => /UID FETCH/u.test(line))).toBe(false)
    expect(commands.join(' ')).not.toMatch(/\b(?:STORE|EXPUNGE|COPY|MOVE|APPEND|DELETE)\b/u)
  })

  it('reads nothing from a malformed vault credential', async () => {
    expect(await readImapInboxFromSecret('not-json')).toEqual([])
    expect(await readImapInboxFromSecret('{}')).toEqual([])
  })
})

// P0-11 (Carbon, colheita S1): command injection, the greeting, the size of what is read and the length of the whole session.
describe('P0-11: the reader never sends what a control character could turn into another command', () => {
  const INJECTION = 'INBOX"\r\na9 SELECT INBOX\r\na9 STORE 1:* +FLAGS (\\Deleted)\r\na9 EXPUNGE\r\nx "'

  it('refuses a folder name with CR/LF BEFORE any command (no STORE, no EXPUNGE, not even a LOGIN)', async () => {
    const { port, commands } = await fakeImap([RAW])
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, ...login, mailbox: INJECTION })).rejects.toThrow(/caracteres de controle/u)
    await expect(probeImap({ host: '127.0.0.1', port, secure: false, ...login, mailbox: INJECTION })).rejects.toThrow(/caracteres de controle/u)
    expect(commands.join(' ')).not.toMatch(/STORE|EXPUNGE|SELECT/u)
    expect(commands).toHaveLength(0)
  })

  it('refuses CR, LF and NUL in the user and in the password too, and says which field, never its value', async () => {
    const { port, commands } = await fakeImap([RAW])
    const error = await readImapInbox({ host: '127.0.0.1', port, secure: false, user: 'vendas\r\na9 EXPUNGE', password: 'segredo' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/usuário/u)
    expect((error as Error).message).not.toContain('EXPUNGE')
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, user: 'ana', password: 'se\ngredo' })).rejects.toThrow(/senha/u)
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, user: 'ana', password: 'se\u0000gredo' })).rejects.toThrow(/senha/u)
    expect(commands).toHaveLength(0)
  })

  it('still quotes a name with quotes and backslashes (they are escaped, not refused)', async () => {
    const { port, commands } = await fakeImap([RAW])
    await readImapInbox({ host: '127.0.0.1', port, secure: false, user: 'vendas', password: 'a"b\\c', mailbox: 'Clientes "VIP"' })
    expect(commands.some(line => line.includes('LOGIN "vendas" "a\\"b\\\\c"'))).toBe(true)
    expect(commands.some(line => line.includes('EXAMINE "Clientes \\"VIP\\""'))).toBe(true)
  })
})

describe('P0-11: the greeting', () => {
  it('waits for the server greeting before the first command', async () => {
    const { port, commandsAtGreeting } = await fakeImap([RAW], { greetDelayMs: 150 })
    expect(await readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })).toHaveLength(1)
    expect(commandsAtGreeting()).toBe(0) // nothing was sent before the greeting was written
  })

  it('refuses a server that greets with BYE or NO instead of going on as if it were fine', async () => {
    const bye = await fakeImap([RAW], { greeting: '* BYE too many connections' })
    await expect(readImapInbox({ host: '127.0.0.1', port: bye.port, secure: false, ...login })).rejects.toThrow(/imap: .*BYE/u)
    const no = await fakeImap([RAW], { greeting: '* NO not today' })
    await expect(probeImap({ host: '127.0.0.1', port: no.port, secure: false, ...login })).rejects.toThrow(/imap: /u)
    expect(bye.commands).toHaveLength(0)
  })
})

describe('P0-11: how much is read and for how long', () => {
  it('searches a recent window of days, never ALL', async () => {
    const { port, commands } = await fakeImap([RAW])
    await readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })
    const search = commands.find(line => /UID SEARCH/u.test(line)) ?? ''
    expect(search).toMatch(/UID SEARCH SINCE \d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/u)
    expect(search).not.toMatch(/\bALL\b/u)
  })

  it('refuses to hold a literal bigger than the cap, even when the server ignores the partial fetch', async () => {
    const { port } = await fakeImap([RAW], { hugeTextBytes: 3_000_000 })
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })).rejects.toThrow(/grande demais/u)
  })

  it('reads a reply that arrives in many chunks without freezing the process (the wait on a half-read literal used to spin in microtasks)', async () => {
    const { port } = await fakeImap([RAW], { hugeTextBytes: 150_000, chunkBytes: 4_096 })
    let ticks = 0
    const pulse = setInterval(() => { ticks += 1 }, 5)
    try {
      const messages = await readImapInbox({ host: '127.0.0.1', port, secure: false, ...login })
      expect(messages).toHaveLength(1)
      expect(messages[0]?.subject).toBe('Pedido 42')
      expect(messages[0]?.text.length).toBeLessThanOrEqual(4_000)
    } finally {
      clearInterval(pulse)
    }
    expect(ticks).toBeGreaterThan(3) // the event loop kept turning while the reply came in
  })

  it('has a total deadline for the whole session, not only an idle timeout', async () => {
    const { port } = await fakeImap([RAW, BULK], { commandDelayMs: 60 })
    const started = Date.now()
    await expect(readImapInbox({ host: '127.0.0.1', port, secure: false, ...login, totalTimeoutMs: 150 })).rejects.toThrow(/tempo total/u)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

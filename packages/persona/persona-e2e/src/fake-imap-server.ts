/**
 * A FAKE IMAP server over a real TCP socket (loopback, 0 AI, nothing leaves the machine) for the end-to-end scenarios of the mail source (COLHEITA item 19b, Carbon P0-11): the REAL client
 * (`readImapInbox`) talks to it and the server writes down everything it received, so a test can say what the client SENT, in what order, and how much the server was allowed to push.
 *
 * It speaks just enough IMAP for the read-only reader: greeting, CAPABILITY, LOGIN, EXAMINE, UID SEARCH, UID FETCH (header and text literals), LOGOUT. `hostileLiteralBytes` makes every FETCH
 * answer with a literal of that size streamed in 64 KiB chunks until the client closes the socket (a server that ignores the partial fetch); `greeting` can be a refusal (`* BYE`).
 */
import { createServer, type Server, type Socket } from 'node:net'

export interface FakeImapMessage {
  readonly uid: number
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
}

export interface FakeImapOptions {
  /** The messages the mailbox holds. */
  readonly messages?: readonly FakeImapMessage[]
  /** Wait this long before the greeting (the client must NOT speak first). */
  readonly greetingDelayMs?: number
  /** The first line of the server; default `* OK IMAP4rev1 ready`. */
  readonly greeting?: string
  /** Every `UID FETCH` is answered with ONE literal of this many bytes, streamed until the client hangs up. */
  readonly hostileLiteralBytes?: number
}

export interface FakeImapServer {
  readonly port: number
  /** Every line the clients sent, in order (`a1 CAPABILITY`, …). */
  readonly lines: readonly string[]
  /** How many sockets were opened. */
  readonly connections: () => number
  /** Some client sent bytes BEFORE the server's greeting went out. */
  readonly spokeBeforeGreeting: () => boolean
  /** Bytes the server wrote into hostile literals (how much of a 100 MB attachment the client let through). */
  readonly bytesPushed: () => number
  readonly close: () => Promise<void>
}

const CRLF = '\r\n'

function headerOf(message: FakeImapMessage): string {
  return [`From: ${message.from}`, `To: ${message.to}`, `Subject: ${message.subject}`, 'Date: Wed, 11 Nov 2026 10:00:00 -0300', `Message-ID: <m${String(message.uid)}@fake.test>`, '', ''].join(CRLF)
}

/** Start the server on a free loopback port. */
export async function startFakeImapServer(options: FakeImapOptions = {}): Promise<FakeImapServer> {
  const messages = options.messages ?? []
  const lines: string[] = []
  const sockets = new Set<Socket>()
  let connections = 0
  let spoke = false
  let pushed = 0

  const server: Server = createServer((socket) => {
    connections += 1
    sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket) })
    socket.on('error', () => undefined)
    let greeted = false
    let pending = ''
    const timer = setTimeout(() => {
      greeted = true
      socket.write(`${options.greeting ?? '* OK IMAP4rev1 ready'}${CRLF}`)
    }, options.greetingDelayMs ?? 0)
    socket.on('close', () => { clearTimeout(timer) })

    const streamHostile = (tag: string, uid: string): void => {
      const total = options.hostileLiteralBytes ?? 0
      socket.write(`* 1 FETCH (UID ${uid} BODY[HEADER] {${String(total)}}${CRLF}`)
      const chunk = Buffer.alloc(65_536, 0x41)
      let sent = 0
      const pump = (): void => {
        while (sent < total && !socket.destroyed) {
          const size = Math.min(chunk.length, total - sent)
          const ok = socket.write(size === chunk.length ? chunk : chunk.subarray(0, size))
          sent += size
          pushed += size
          if (!ok) { socket.once('drain', pump); return }
        }
        if (!socket.destroyed) socket.write(`)${CRLF}${tag} OK done${CRLF}`)
      }
      pump()
    }

    const answer = (line: string): void => {
      const [tag = '', ...rest] = line.split(' ')
      const command = rest.join(' ')
      const word = (rest[0] ?? '').toUpperCase()
      if (word === 'CAPABILITY') socket.write(`* CAPABILITY IMAP4rev1${CRLF}${tag} OK done${CRLF}`)
      else if (word === 'LOGIN') socket.write(`${tag} OK logged in${CRLF}`)
      else if (word === 'EXAMINE') socket.write(`* ${String(messages.length)} EXISTS${CRLF}${tag} OK [READ-ONLY] done${CRLF}`)
      else if (word === 'UID' && /^UID SEARCH\b/iu.test(command)) socket.write(`* SEARCH ${messages.map(message => String(message.uid)).join(' ')}${CRLF}${tag} OK done${CRLF}`)
      else if (word === 'UID' && /^UID FETCH\b/iu.test(command)) {
        const uid = /^UID FETCH (\d+)/iu.exec(command)?.[1] ?? '0'
        if ((options.hostileLiteralBytes ?? 0) > 0) { streamHostile(tag, uid); return }
        const message = messages.find(item => String(item.uid) === uid)
        if (message === undefined) { socket.write(`${tag} OK done${CRLF}`); return }
        const header = headerOf(message)
        const text = Buffer.from(message.text, 'utf8')
        socket.write(`* 1 FETCH (UID ${uid} BODY[HEADER] {${String(Buffer.byteLength(header))}}${CRLF}${header} BODY[TEXT]<0> {${String(text.length)}}${CRLF}`)
        socket.write(text)
        socket.write(`)${CRLF}${tag} OK done${CRLF}`)
      } else if (word === 'LOGOUT') { socket.write(`* BYE bye${CRLF}${tag} OK done${CRLF}`); socket.end() } else socket.write(`${tag} BAD unknown command${CRLF}`)
    }

    socket.on('data', (chunk: Buffer) => {
      if (!greeted) spoke = true
      pending += chunk.toString('latin1')
      for (;;) {
        const end = pending.indexOf(CRLF)
        if (end < 0) break
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        lines.push(line)
        answer(line)
      }
    })
  })

  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    port,
    lines,
    connections: () => connections,
    spokeBeforeGreeting: () => spoke,
    bytesPushed: () => pushed,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    },
  }
}

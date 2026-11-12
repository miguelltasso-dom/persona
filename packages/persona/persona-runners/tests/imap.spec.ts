import { createServer, type AddressInfo, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { readImapInbox, readImapInboxFromSecret } from '../src/index.ts'

const RAW = [
  'From: =?UTF-8?B?Rm9ybmVjZWRvcg==?= <fornecedor@loja.com.br>',
  'To: vendas@loja.com.br',
  'Subject: =?UTF-8?B?UGVkaWRvIDQy?=',
  'Message-ID: <m1@loja>',
  'Date: Wed, 11 Nov 2026 18:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Segue o pedido 42.',
].join('\r\n')

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

function fakeImap(messages: readonly string[], options: { failLogin?: boolean } = {}): Promise<{ port: number; commands: string[] }> {
  return new Promise((resolve) => {
    const commands: string[] = []
    const server = createServer((socket) => {
      socket.write('* OK fake IMAP ready\r\n')
      let buffer = ''
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        for (;;) {
          const end = buffer.indexOf('\r\n')
          if (end < 0) break
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          commands.push(line)
          const tag = line.split(' ')[0] ?? 'a0'
          if (/CAPABILITY/u.test(line)) socket.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`)
          else if (/LOGIN/u.test(line)) socket.write(options.failLogin === true ? `${tag} NO bad credentials\r\n` : `${tag} OK logged in\r\n`)
          else if (/EXAMINE/u.test(line)) socket.write(`* ${String(messages.length)} EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`)
          else if (/UID SEARCH/u.test(line)) socket.write(`* SEARCH ${messages.map((_message, index) => String(index + 1)).join(' ')}\r\n${tag} OK done\r\n`)
          else if (/UID FETCH (\d+)/u.test(line)) {
            const uid = Number(/UID FETCH (\d+)/u.exec(line)?.[1] ?? '1')
            const raw = messages[uid - 1] ?? ''
            socket.write(`* ${String(uid)} FETCH (BODY[] {${String(Buffer.byteLength(raw))}}\r\n${raw}\r\n)\r\n${tag} OK done\r\n`)
          } else if (/LOGOUT/u.test(line)) socket.write(`* BYE\r\n${tag} OK done\r\n`)
          else socket.write(`${tag} OK done\r\n`)
        }
      })
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, commands }))
  })
}

describe('harvest 19b: read-only IMAP reader', () => {
  it('opens with EXAMINE, fetches with BODY.PEEK[] and never mutates the mailbox', async () => {
    const { port, commands } = await fakeImap([RAW, BULK])
    const messages = await readImapInbox({
      host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: 'segredo',
    })
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
    expect(commands.some(line => /UID FETCH 1 \(BODY\.PEEK\[\]\)/u.test(line))).toBe(true)
    expect(commands.join(' ')).not.toMatch(/\b(?:STORE|EXPUNGE|COPY|MOVE|APPEND|DELETE)\b/u)
    expect(JSON.stringify(messages)).not.toContain('segredo')
  })

  it('refuses a bad login without leaking the password', async () => {
    const { port } = await fakeImap([RAW], { failLogin: true })
    await expect(readImapInbox({
      host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: 'segredo',
    })).rejects.toThrow(/imap: NO bad credentials/u)
  })

  it('reads nothing from a malformed vault credential', async () => {
    expect(await readImapInboxFromSecret('not-json')).toEqual([])
    expect(await readImapInboxFromSecret('{}')).toEqual([])
  })
})

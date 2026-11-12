import { createServer, type AddressInfo, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { readImapInboxFromSecret } from '../src/sources/imap.ts'

/**
 * Carbon MH-1/MH-2 (Lumen's review, Tally): the REAL poller (`readImapInboxFromSecret`) connects to the address the host resolved and vetted ONCE (a name is never resolved a second time by the socket: a
 * rebinding between the check and the connection reaches nothing), and a host the policy refuses opens NO socket at all. The fake server is on loopback; the name used does not resolve in DNS.
 */
const servers: Server[] = []
afterEach(() => { for (const server of servers.splice(0)) server.close() })

function fakeImap(): Promise<{ port: number; connections: () => number }> {
  const { promise, resolve } = Promise.withResolvers<{ port: number; connections: () => number }>()
  let connections = 0
  const server = createServer((socket) => {
    connections += 1
    socket.write('* OK fake IMAP ready\r\n')
    socket.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\r\n').filter(Boolean)) {
        const tag = line.split(' ')[0] ?? 'a0'
        if (/EXAMINE/u.test(line)) socket.write(`* 0 EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`)
        else if (/SEARCH/u.test(line)) socket.write(`* SEARCH\r\n${tag} OK done\r\n`)
        else if (/LOGOUT/u.test(line)) { socket.write(`* BYE\r\n${tag} OK done\r\n`); socket.end() }
        else socket.write(`${tag} OK done\r\n`)
      }
    })
  })
  servers.push(server)
  server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, connections: () => connections }))
  return promise
}

const secretOf = (host: string, port: number): string => JSON.stringify({ host, port, secure: false, user: 'u@x.com', password: 'p', limit: 1 })

describe('the poller connects to the address that was vetted, once', () => {
  it('connects to the resolved address, not to the name (the name does not resolve; the vetted address is the fake server)', async () => {
    const { port, connections } = await fakeImap()
    const asked: string[] = []
    const messages = await readImapInboxFromSecret(secretOf('correio.nao-existe.invalid', port), { resolveHost: async (host) => { asked.push(host); return '127.0.0.1' } })
    expect(messages).toEqual([])
    expect(asked, 'resolved once, by the host policy, and never again by the socket').toEqual(['correio.nao-existe.invalid'])
    expect(connections()).toBe(1)
  })

  it('a host the policy refuses opens NO socket and says so (not an empty inbox)', async () => {
    const { port, connections } = await fakeImap()
    await expect(readImapInboxFromSecret(secretOf('127.0.0.1', port), { resolveHost: async () => undefined })).rejects.toThrow(/recusad/u)
    expect(connections()).toBe(0)
  })

  it('with no policy (the specs of the reader itself) it behaves as it always did', async () => {
    const { port, connections } = await fakeImap()
    await readImapInboxFromSecret(secretOf('127.0.0.1', port))
    expect(connections()).toBe(1)
  })
})

/**
 * Harvest 19b: the mailbox credential state and “Testar conexão”. The password never reaches a view, and the test opens
 * the folder read-only (EXAMINE) without fetching a body.
 */
import { createServer, type AddressInfo, type Server } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { PersonaVaultProvider } from '@deepseek-ai/dsh-persona-vault'
import { afterEach, expect } from 'vitest'
import { connectorSlot } from '../src/cofre-migrate.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

function fakeImap(options: { failLogin?: boolean; messages?: number } = {}): Promise<{ port: number; commands: string[] }> {
  const { promise, resolve } = Promise.withResolvers<{ port: number; commands: string[] }>()
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
        else if (/EXAMINE/u.test(line)) socket.write(`* ${String(options.messages ?? 128)} EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`)
        else if (/LOGOUT/u.test(line)) socket.write(`* BYE\r\n${tag} OK done\r\n`)
        else socket.write(`${tag} OK done\r\n`)
      }
    })
  })
  servers.push(server)
  server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, commands }))
  return promise
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'coord', workspaceId: 'ws', projectId: 'pp', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

const scope = { workspaceId: 'ws', projectId: 'pp' }

/** A host whose Cofre can actually seal (the memory cipher), for the stored-credential paths. */
async function hostWithVault(): Promise<PersonaHost> {
  process.env.PERSONA_VAULT_TEST_CIPHER = '1'
  const ctx = new Context()
  new PersonaVaultProvider(ctx, { path: '' })
  const h = new PersonaHost(ctx, { databasePath: '', engineRetryPollMs: 0, remoteTeamPollMs: 0, externalPollMs: 0 })
  seed(h)
  return h
}

it('reports no credential before one is stored', async () => {
  const h = host()
  seed(h)
  expect(await h.getEmailConnection(scope)).toEqual({ connected: false })
})

it('reports the stored server and account, never the password', async () => {
  const h = await hostWithVault()
  await h.cofreSecrets.put('pp', connectorSlot('imap'), JSON.stringify({
    host: 'email-ssl.com.br', port: 993, secure: true, user: 'vendas@loja.com.br', password: 'segredo',
  }))
  const view = await h.getEmailConnection(scope)
  expect(view).toEqual({ connected: true, host: 'email-ssl.com.br', port: 993, secure: true, user: 'vendas@loja.com.br' })
  expect(JSON.stringify(view)).not.toContain('segredo')
})

it('tests the typed credential read-only and counts the folder', async () => {
  const h = host()
  seed(h)
  h.mailHostCheck = async () => true // the fake IMAP server is on loopback (the default check refuses it: P0-13b)
  const { port, commands } = await fakeImap({ messages: 128 })
  const result = await h.testEmailConnection({
    ...scope, host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: 'segredo',
  })
  expect(result).toEqual({ ok: true, messages: 128 })
  expect(commands.some(line => /EXAMINE "INBOX"/u.test(line))).toBe(true)
  expect(commands.some(line => /UID FETCH/u.test(line))).toBe(false)
})

it('turns a refused login into the login category, without the secret', async () => {
  const h = host()
  seed(h)
  h.mailHostCheck = async () => true // the fake IMAP server is on loopback (the default check refuses it: P0-13b)
  const { port } = await fakeImap({ failLogin: true })
  const result = await h.testEmailConnection({
    ...scope, host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: 'segredo',
  })
  expect(result).toEqual({ ok: false, error: 'login' })
  expect(JSON.stringify(result)).not.toContain('segredo')
})

it('tests the stored credential when the form sends no password', async () => {
  const h = await hostWithVault()
  h.mailHostCheck = async () => true // the fake IMAP server is on loopback (the default check refuses it: P0-13b)
  const { port } = await fakeImap({ messages: 3 })
  await h.cofreSecrets.put('pp', connectorSlot('imap'), JSON.stringify({
    host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: 'segredo',
  }))
  expect(await h.testEmailConnection(scope)).toEqual({ ok: true, messages: 3 })
  // The form sends the fields it has with a blank password: the stored secret is the one tested.
  expect(await h.testEmailConnection({ ...scope, host: '127.0.0.1', port, secure: false, user: 'vendas@loja.com.br', password: '' }))
    .toEqual({ ok: true, messages: 3 })
})

it('says there is no credential when nothing is typed and nothing is stored', async () => {
  const h = host()
  seed(h)
  expect(await h.testEmailConnection(scope)).toEqual({ ok: false, error: 'no-credential' })
})

/**
 * Item 26 (contracts/connector-grant-by-name.md): the owner gives a persona a tool of the catalog BY ITS NAME; the HOST resolves it on the persona's own CLI, so the
 * connector's id (the proxy URL of an account connector) never goes through the screen. After the resolution it is the SAME path as `grantConnector`: same refusals,
 * same audit, `confirm` stays `ask`. Seven obligations, written red first.
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const url = (tag: string): string => `https://proxy.example.test/v1/mcp/${tag.repeat(24)}`
const GMAIL = { cli: 'claude', id: url('0f'), name: 'claude.ai Gmail' }
const DRIVE = { cli: 'claude', id: url('1e'), name: 'Google Drive' }
const DRIVE_LOCAL = { cli: 'claude', id: 'drive-local-mcp', name: 'Drive local' }
const NOTES = { cli: 'claude', id: 'notes-mcp', name: 'Notas' }
const CODEX_ONLY = { cli: 'codex', id: 'codex-gmail', name: 'Gmail' }

const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full',
  connectorDefinitionOf: (_cli, id) => (id.startsWith('https://') ? 'account' : 'local'),
  availableConnectors: cli => (cli === 'claude' ? [GMAIL, DRIVE, DRIVE_LOCAL, NOTES] : cli === 'codex' ? [CODEX_ONLY] : []),
}

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.connectorPorts = PORTS
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  for (const [id, name, cli] of [['p1', 'Nina', 'claude'], ['p2', 'Bento', 'claude'], ['p3', 'Sol', 'codex']] as const) {
    h.createPersona({
      id, ...scope, name, title: 'Engenharia', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: name.toLowerCase(), runnerKind: 'cli', runnerCli: cli, runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
  }
  h.createPersona({
    id: 'p4', ...scope, name: 'Luna', title: 'Atendimento', description: 'Atende.', personality: 'Calma.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
}

const byName = (h: PersonaHost, over: Partial<Parameters<PersonaHost['grantConnectorByName']>[0]> = {}) =>
  h.grantConnectorByName({ ...scope, personaId: 'p1', name: 'Gmail', ...over })

const total = (h: PersonaHost, sql: string): number => Number(h.store.db.prepare(sql).get()?.total ?? 0)
const written = (h: PersonaHost): number =>
  total(h, 'SELECT COUNT(*) AS total FROM connector_grant')
  + total(h, 'SELECT COUNT(*) AS total FROM connector_grant_log')
  + total(h, "SELECT COUNT(*) AS total FROM governance_audit WHERE action LIKE 'connector.%'")

function refusal(work: () => unknown): RemoteFault {
  try { work() } catch (error: unknown) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a refusal')
}

it('1. the owner grants by NAME: the host finds the connector on the persona\'s own CLI (a name that CONTAINS the card\'s) and the grant points at it', () => {
  const h = host()
  seed(h)
  const view = byName(h)
  expect(view).toMatchObject({ personaId: 'p1', cli: 'claude', connectorId: GMAIL.id, name: 'claude.ai Gmail', access: 'read' })
  expect(h.listConnectorGrants({ ...scope, personaId: 'p1' }).map(item => item.connectorId)).toEqual([GMAIL.id])
  // the same card name on ANOTHER persona's CLI resolves there: Sol is on codex and gets the codex connector, never the claude one
  expect(byName(h, { personaId: 'p3' })).toMatchObject({ cli: 'codex', connectorId: 'codex-gmail' })
})

it('2. only the owner: a member is refused and NOTHING is written', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bia'
  expect(() => byName(h)).toThrow('forbidden')
  expect(written(h)).toBe(0)
})

it('3. a name with no connector on the persona\'s CLI is "not available" (typed, with the sentence) and NOTHING is written; a persona with no CLI has none either', () => {
  const h = host()
  seed(h)
  const none = refusal(() => byName(h, { name: 'Mercado Pago' }))
  expect(none).toMatchObject({ code: 'not-found', details: { reason: 'connector-not-available' }, message: expect.stringContaining('Conectar') })
  expect(refusal(() => byName(h, { personaId: 'p4' }))).toMatchObject({ code: 'not-found', details: { reason: 'connector-not-available' } })
  expect(refusal(() => byName(h, { personaId: 'p1', name: '   ' }))).toMatchObject({ code: 'invalid-payload' })
  expect(refusal(() => byName(h, { personaId: 'nao-existe' }))).toMatchObject({ code: 'not-found' })
  expect(written(h)).toBe(0)
})

it('4. two candidates with no exact match are "ambiguous" (nothing written); with an exact match, the exact one wins', () => {
  const h = host()
  seed(h)
  const many = refusal(() => byName(h, { name: 'Drive' })) // "Google Drive" and "Drive local" both contain it, neither equals it
  expect(many).toMatchObject({ code: 'conflict', details: { reason: 'connector-ambiguous' } })
  expect(written(h)).toBe(0)
  expect(byName(h, { name: 'Drive local' })).toMatchObject({ connectorId: DRIVE_LOCAL.id })
  expect(byName(h, { name: 'google drive' })).toMatchObject({ connectorId: DRIVE.id }) // without accent or case, still exact
})

it('5. idempotent: granting the same tool again keeps ONE grant and one audit line', () => {
  const h = host()
  seed(h)
  const first = byName(h)
  const second = byName(h)
  expect(second).toEqual(first)
  expect(total(h, "SELECT COUNT(*) AS total FROM connector_grant WHERE persona_id = 'p1'")).toBe(1)
  expect(total(h, "SELECT COUNT(*) AS total FROM governance_audit WHERE action = 'connector.grant'")).toBe(1)
})

it('6. nothing is waived by this door: send, pay and delete stay "ask"; the level defaults to read and "write" is only what the owner asked', () => {
  const h = host()
  seed(h)
  const view = byName(h)
  expect(view.access).toBe('read')
  expect(view.confirm).toEqual({ send: 'ask', pay: 'ask', delete: 'ask' })
  expect(byName(h, { personaId: 'p2', name: 'Notas', access: 'write' })).toMatchObject({ access: 'write', confirm: { send: 'ask', pay: 'ask', delete: 'ask' } })
})

it('7. the connector id (the proxy URL) NEVER appears in a refusal (message or details) and the audit line is the same one `grantConnector` writes', () => {
  const h = host()
  seed(h)
  const faults = [refusal(() => byName(h, { name: 'Drive' })), refusal(() => byName(h, { name: 'Mercado Pago' }))]
  for (const fault of faults) {
    const text = `${fault.message} ${JSON.stringify(fault.details)}`
    for (const secret of [GMAIL.id, DRIVE.id, DRIVE_LOCAL.id, NOTES.id]) expect(text).not.toContain(secret)
  }
  byName(h)
  const audit = h.store.db.prepare("SELECT action, body FROM governance_audit WHERE action LIKE 'connector.%'").all() as Array<{ action: string; body: string }>
  expect(audit.map(row => row.action)).toEqual(['connector.grant'])
  expect(audit[0]!.body).toContain('"personaId":"p1"')
})

it('8. CONN-2 (Lumen): the card name matches as WHOLE WORDS inside the connector name, never the other way round — "Gmail" is not a connector called "Mail", "Mail" is not "Gmail"', () => {
  const h = host()
  seed(h)
  const only = (...items: { cli: string; id: string; name: string }[]): void => { h.connectorPorts = { ...PORTS, availableConnectors: cli => (cli === 'claude' ? items : []) } }
  const MAIL = { cli: 'claude', id: 'mail-mcp', name: 'Mail' }
  only(MAIL, GMAIL)
  expect(byName(h, { name: 'Gmail' })).toMatchObject({ connectorId: GMAIL.id }) // the right service, not the shorter-named one
  h.revokeConnector({ ...scope, personaId: 'p1', cli: 'claude', connectorId: GMAIL.id })
  only(MAIL) // the account has NO Gmail, only "Mail"
  const none = refusal(() => byName(h, { name: 'Gmail' }))
  expect(none).toMatchObject({ code: 'not-found', details: { reason: 'connector-not-available' }, message: expect.stringMatching(/ainda não tem Gmail/u) })
  only(GMAIL) // a card name INSIDE a word of the connector's name is not a match either
  expect(refusal(() => byName(h, { name: 'Mail' }))).toMatchObject({ code: 'not-found' })
  only({ cli: 'claude', id: 'drive-mcp', name: 'Drive' }) // the connector's name inside the card's name is not a match
  expect(refusal(() => byName(h, { name: 'Google Drive' }))).toMatchObject({ code: 'not-found' })
  expect(h.listConnectorGrants({ ...scope, personaId: 'p1' })).toEqual([])
})

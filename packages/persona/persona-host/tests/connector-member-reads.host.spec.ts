import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * CONN-1 (Lumen 11:37, inconclusive): does a MEMBER with read on a SHARED project see the proxy URL of an account connector (it carries the key)? Lumen's own spec used the owner's PERSONAL
 * project, where the member is refused before anything is listed — so it proved nothing. Here Bia is a member of the shared project `team` (the control proves she reads it), and the owner
 * gave the persona an account connector: the grant list and the audit must not hand her the URL.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const TEAM = { workspaceId: 'ws', projectId: 'team' }
const KEY = '0f'.repeat(24)
const GMAIL = { cli: 'claude', id: `https://proxy.example.test/v1/mcp/${KEY}`, name: 'claude.ai Gmail' }
const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full',
  connectorDefinitionOf: (_cli, id) => (id.startsWith('https://') ? 'account' : 'local'),
  availableConnectors: cli => (cli === 'claude' ? [GMAIL] : []),
}

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.connectorPorts = PORTS
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Time', description: '' })
  h.createPersona({
    id: 'p1', ...TEAM, name: 'Nina', title: 'Engenharia', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

function attempt<T>(work: () => T): T | 'refused' {
  try { return work() } catch { return 'refused' }
}

it('CONN-1 control: the member really reads the shared project (so the next test is not red/green for the wrong reason)', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bia'
  expect(attempt(() => h.listTasks(TEAM))).not.toBe('refused')
})

it('CONN-1: a member of the shared project never reads the proxy URL of an account connector — not in the grant list, not in the audit', () => {
  const h = host()
  seed(h)
  h.grantConnectorByName({ ...TEAM, personaId: 'p1', name: 'Gmail' }) // the OWNER gives it
  const owned = JSON.stringify(h.listConnectorGrants({ ...TEAM, personaId: 'p1' }))
  expect(owned).toContain('claude.ai Gmail') // control: the owner sees the grant...
  expect(owned).toContain(KEY) // ...and keeps the real id: it is what her screen uses to take the connector back
  h.sessionMemberId = 'bia'
  const grants = JSON.stringify(attempt(() => h.listConnectorGrants({ ...TEAM, personaId: 'p1' })))
  expect(grants).not.toContain(KEY)
  expect(grants).toContain('claude.ai Gmail') // redacted, not hidden: the member still sees WHAT the persona has
  expect(grants).toMatch(/"connectorId":"account:[0-9a-f]{12}"/u)
  const audit = JSON.stringify(attempt(() => h.listAudit({ workspaceId: 'ws' })))
  expect(audit).not.toContain(KEY)
  expect(audit).toContain('connector.grant') // the line is still there, with a handle instead of the URL
  h.sessionMemberId = 'ana'
  expect(JSON.stringify(h.listAudit({ workspaceId: 'ws' }))).not.toContain(KEY) // nobody needs the key in the audit, the owner either
})

it('CONN-1: a LOCAL connector\'s id is a name, not a secret: it stays as it is for a member', () => {
  const h = host()
  seed(h)
  h.connectorPorts = { ...PORTS, availableConnectors: cli => (cli === 'claude' ? [{ cli: 'claude', id: 'notes-mcp', name: 'Notas' }] : []) }
  h.grantConnectorByName({ ...TEAM, personaId: 'p1', name: 'Notas' })
  h.sessionMemberId = 'bia'
  expect(JSON.stringify(h.listConnectorGrants({ ...TEAM, personaId: 'p1' }))).toContain('"connectorId":"notes-mcp"')
})

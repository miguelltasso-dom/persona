import { expect } from 'vitest'
import { TOKEN_PROVIDERS, connectorHealth } from '../src/connector-health.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 26.8 (host): one health line per connector, in plain Portuguese, with the action that fixes it. A probe still running says
 * nothing (never "sem login"), and the provider's own error text never becomes the sentence.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const ready = { id: 'claude', available: true, loggedIn: true, phase: 'ready' as const }
const names: Record<string, string> = { p1: 'Nina' }

it('a granted connector that vanished from the CLI is missing, with the action that removes it', () => {
  const lines = connectorHealth({
    grants: [{ personaId: 'p1', cli: 'claude', name: 'Gmail' }],
    available: [],
    connections: [ready],
    tokens: [],
    personaNameOf: id => names[id],
  })
  expect(lines).toEqual([{
    id: 'claude:Gmail:p1',
    name: 'Gmail',
    personaId: 'p1',
    state: 'missing',
    action: 'remove',
    sentence: 'Nina não conseguiu usar Gmail: ele não está mais no Claude.',
  }])
})

it('a CLI that is not installed is offline; a logged-out CLI asks to enter again; a probe still running says nothing', () => {
  const grant = [{ personaId: 'p1', cli: 'claude', name: 'Gmail' }]
  const offline = connectorHealth({
    grants: grant, available: [{ cli: 'claude', name: 'Gmail' }],
    connections: [{ ...ready, available: false }], tokens: [], personaNameOf: id => names[id],
  })
  expect(offline[0]).toMatchObject({ state: 'offline', action: 'retry' })
  expect(offline[0]?.sentence).toContain('não está instalado')
  const loggedOut = connectorHealth({
    grants: grant, available: [{ cli: 'claude', name: 'Gmail' }],
    connections: [{ ...ready, loggedIn: false }], tokens: [], personaNameOf: id => names[id],
  })
  expect(loggedOut[0]).toMatchObject({ state: 'reconnect', action: 'reconnect' })
  const checking = connectorHealth({
    grants: grant, available: [], connections: [{ ...ready, phase: 'checking' }], tokens: [], personaNameOf: id => names[id],
  })
  expect(checking).toEqual([])
})

it('a token provider without its sealed slot asks to connect; with it, says it is on', () => {
  const missing = connectorHealth({ grants: [], available: [], connections: [], tokens: [{ provider: 'imap', name: 'E-mail da empresa', hasSecret: false }], personaNameOf: () => undefined })
  expect(missing[0]).toMatchObject({ state: 'reconnect', action: 'reconnect' })
  const ok = connectorHealth({ grants: [], available: [], connections: [], tokens: [{ provider: 'imap', name: 'E-mail da empresa', hasSecret: true }], personaNameOf: () => undefined })
  expect(ok[0]).toMatchObject({ state: 'ok', action: 'none' })
})

it('the host answers one line per token provider of the project', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  const lines = h.getConnectorHealth(scope)
  expect(lines.map(line => line.id)).toEqual(TOKEN_PROVIDERS.map(token => `token:${token.provider}`))
  expect(lines.every(line => line.state === 'reconnect' && line.action === 'reconnect')).toBe(true)
})

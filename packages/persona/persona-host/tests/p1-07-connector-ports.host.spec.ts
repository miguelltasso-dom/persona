/**
 * Carbon P1-07, part 1 (colheita-s1-fix): `getConnectorCatalog` and `getConnectorHealth` read `this.connectorPorts.availableConnectors` — which is EMPTY in the product (the live list comes from the
 * connector bridge through `portsNow()`) — so a connector of the person's Claude account that was already granted showed as "missing" ("não está mais no Claude"), the catalog did not mark it linked,
 * and the token providers (e-mail, Telegram, Slack, Discord) that DO have their sealed slot were not listed as on. The product's shape: the bridge answers, `connectorPorts` stays `{}`.
 */
import { expect } from 'vitest'
import type { ConnectorBridge } from '../src/connector-bridge.ts'
import { connectorSlot } from '../src/cofre-migrate.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-12T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

/** A host as the product has it: ports only through the bridge, nothing in `connectorPorts`; the Cofre holds the secrets the spec says. */
function productHost(withSecrets: readonly string[] = []) {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  h.connectorPorts = {}
  h.connectorBridge = {
    ports: () => ({ availableConnectors: (cli: string) => (cli === 'claude' ? [{ id: 'claude.ai Gmail', name: 'claude.ai Gmail' }] : []) }),
    refresh: () => Promise.resolve(),
  } as unknown as ConnectorBridge
  const slots = new Set(withSecrets.map(provider => connectorSlot(provider)))
  h.cofre.hasSecret = (_projectId: string, slot: string): boolean => slots.has(slot)
  return h
}

it('a connector of the Claude account that the bridge lists is marked LINKED in the catalog', () => {
  const view = productHost().getConnectorCatalog(scope)
  expect(view.cards.find(card => card.id === 'gmail')?.linked).toBe(true) // before: the catalog read the empty `connectorPorts` and said false
  expect(view.cards.find(card => card.id === 'stripe')?.linked).toBe(false)
})

it('a granted Claude connector is "ok" in the health lines, not "missing" (the bridge lists it)', () => {
  const h = productHost()
  h.connectorGrants.list = () => [{
    personaId: 'nina', cli: 'claude', connectorId: 'claude.ai Gmail', name: 'claude.ai Gmail', access: 'read',
  }] as never
  h.connections.list = () => [{ id: 'claude', kind: 'claude', available: true, loggedIn: true, phase: 'ready' }] as never // the CLI is installed and logged in
  const gmail = h.getConnectorHealth(scope).find(line => /gmail/iu.test(line.name))
  expect(gmail, JSON.stringify(h.getConnectorHealth(scope))).toBeDefined()
  expect(gmail?.state).not.toBe('missing')
  expect(JSON.stringify(gmail)).not.toContain('não está mais no Claude')
})

it('token providers with their sealed slot are on: in the health lines AND as linked cards of the catalog (e-mail, Telegram, Slack, Discord)', () => {
  const h = productHost(['imap', 'telegram'])
  const health = h.getConnectorHealth(scope)
  expect(health.find(line => line.id === 'token:imap')).toMatchObject({ state: 'ok' })
  expect(health.find(line => line.id === 'token:telegram')).toMatchObject({ state: 'ok' })
  expect(health.find(line => line.id === 'token:slack')).toMatchObject({ state: 'reconnect' })
  const cards = h.getConnectorCatalog(scope).cards
  expect(cards.find(card => card.id === 'email-imap')?.linked, 'e-mail da empresa (IMAP) with its secret').toBe(true) // before: never linked by a token
  expect(cards.find(card => card.id === 'telegram')?.linked).toBe(true)
  expect(cards.find(card => card.id === 'slack')?.linked, 'no secret, not linked').toBe(false)
  expect(cards.find(card => card.id === 'discord')?.linked).toBe(false)
})

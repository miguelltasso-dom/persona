import { expect } from 'vitest'
import { CONNECTOR_CATALOG, CONNECTOR_CATEGORIES, connectorCatalog } from '../src/connector-catalog.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 26.4 (host): the curated catalog of business tools. The promise rule is the point: a provider nobody confirmed is "Em breve" and
 * never offers a Connect button, and an entry only carries an address when that address was verified.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

it('every card has a category, a plain sentence and an honest promise', () => {
  const categories = new Set(CONNECTOR_CATEGORIES.map(category => category.id))
  for (const entry of CONNECTOR_CATALOG) {
    expect(categories.has(entry.category), entry.id).toBe(true)
    expect(entry.sentence.trim(), entry.id).not.toBe('')
    expect(entry.name.trim(), entry.id).not.toBe('')
    if (entry.via === 'unconfirmed') expect(entry.url, entry.id).toBeUndefined()
  }
  const view = connectorCatalog({ granted: [], account: [] })
  for (const card of view.cards) expect(card.promised, card.id).toBe(card.via !== 'unconfirmed')
  expect(view.cards.find(card => card.id === 'mercado-pago')?.promised).toBe(false)
  expect(view.cards.find(card => card.id === 'gmail')?.promised).toBe(true)
})

it('a granted connector and a connector of the account mark their cards as already linked', () => {
  const view = connectorCatalog({ granted: ['claude.ai Gmail'], account: ['claude.ai Notion'] })
  expect(view.cards.find(card => card.id === 'gmail')?.linked).toBe(true)
  expect(view.cards.find(card => card.id === 'notion')?.linked).toBe(true)
  expect(view.cards.find(card => card.id === 'stripe')?.linked).toBe(false)
})

it('the host answers the catalog for the project, with nothing linked in a fresh one', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  const view = h.getConnectorCatalog(scope)
  expect(view.categories).toEqual(CONNECTOR_CATEGORIES)
  expect(view.cards.length).toBe(CONNECTOR_CATALOG.length)
  expect(view.cards.every(card => !card.linked)).toBe(true)
})

import { afterEach, expect, it } from 'vitest'
import { DEFAULT_GESTOR_LIMITS } from '@deepseek-ai/dsh-persona-core'
import {
  PERSONA_SCHEMA_VERSION,
  GestorRepos,
  ProductRepos,
  openPersonaStore,
  type PersonaStore,
} from '../src/index.ts'

const stores: PersonaStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function seed(store: PersonaStore): void {
  const product = new ProductRepos(store, () => '2026-11-04T03:00:00.000Z')
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
}

it('opens at current schema and persists mandate, plan and audit', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  expect(store.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
  expect(PERSONA_SCHEMA_VERSION).toBeGreaterThanOrEqual(16)
  const repos = new GestorRepos(store, () => '2026-11-04T03:00:00.000Z')
  expect(repos.mandateOrDefault('atlas', 'ws')).toEqual(DEFAULT_GESTOR_LIMITS)
  repos.putMandate('atlas', 'ws', { ...DEFAULT_GESTOR_LIMITS, maxPersonas: 4, canGrantGestor: false })
  expect(repos.getMandate('atlas')?.maxPersonas).toBe(4)
  repos.putPlan({
    id: 'p1',
    workspaceId: 'ws',
    gestorId: 'atlas',
    action: 'hire',
    scopeKey: 'site|*|Designer',
    summary: 'Atlas contratou Pipoca',
    reason: 'porque a fila estava com 6 tarefas',
    status: 'proposed',
    createdAt: '2026-11-04T03:00:00.000Z',
  })
  expect(repos.listOpenPlans('ws', 'site|*|Designer')).toHaveLength(1)
  repos.putAudit({
    id: 'a1',
    workspaceId: 'ws',
    gestorId: 'atlas',
    action: 'hire',
    summary: 'Atlas contratou Pipoca (Designer) para o projeto Site',
    reason: 'porque a fila estava com 6 tarefas',
    at: '2026-11-04T03:00:00.000Z',
  })
  expect(repos.listAudit('ws')[0]?.reason).toContain('6 tarefas')
})

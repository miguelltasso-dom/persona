import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

function running(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1', title: 'Cardápio novo', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T14:00:00.000Z' }], inputs: [], undelivered: [],
    createdAt: '2026-11-03T14:00:00.000Z', updatedAt: '2026-11-03T14:00:00.000Z',
    origin: { triggerId: 'e1', triggerIds: ['e1'] }, execution: { name: 'Bento', directory: '.', assignment: 'go' },
    ...overrides,
  }
}

it('PersonaNowView.draftFiles: present only while the persona works on a task whose draft has changed files', () => {
  const h = host()
  seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(running())
  expect(h.getOverviewNow(scope).personas[0]).toMatchObject({ state: 'working', currentTaskId: 't1' })
  expect(h.getOverviewNow(scope).personas[0]?.draftFiles).toBeUndefined() // never measured: no invented draft
  h.draftFiles.record('pp', 't1', 0)
  expect(h.getOverviewNow(scope).personas[0]?.draftFiles).toBeUndefined() // 0 = no draft: just “Trabalhando”
  h.draftFiles.record('pp', 't1', 3)
  expect(h.getOverviewNow(scope).personas[0]).toMatchObject({ state: 'working', draftFiles: 3 })
  expect(h.draftFiles.get('pp', 't1')).toBe(3)
})

it('draftFiles never shows for a persona that is resting or stuck', () => {
  const h = host()
  seed(h)
  h.draftFiles.record('pp', 't1', 4)
  expect(h.getOverviewNow(scope).personas[0]).toMatchObject({ state: 'resting' })
  expect(h.getOverviewNow(scope).personas[0]?.draftFiles).toBeUndefined()
  h.orchestration.runtime('pp').repo.tickets.save(running({
    assignments: [{ id: 'a1', state: 'ended', createdAt: '2026-11-03T14:00:00.000Z' }],
    ended: { at: '2026-11-03T14:30:00.000Z', by: 'executor', outcome: 'completed' },
  }))
  expect(h.getOverviewNow(scope).personas[0]?.draftFiles).toBeUndefined()
})

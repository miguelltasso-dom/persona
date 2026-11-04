import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Initiative scorer (`proactivity.fire`): a fact about an existing Ticket (stuck on a question, no progress) is exactly what
 * is worth acting on, so it must not be dropped as a "duplicate" of that very Ticket — and a real external event (PR, recurring
 * error, deadline) must not be swallowed because some Ticket happens to be stale. Found by Forge (P1-9).
 */
const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): string {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.setAutonomy({ ...scope, personaId: 'p1', mode: 'propose', proposalBudget: 5, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  return 'p1'
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    title: 'Implementar faixa Agora',
    decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-01-01T00:00:00.000Z' }],
    inputs: [],
    undelivered: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', // months ago: stale for any "now"
    origin: { triggerId: 'e1', triggerIds: ['e1'] },
    execution: { name: 'Bento', directory: '.', assignment: 'go' },
    ...overrides,
  }
}

function proposals(h: PersonaHost): string[] {
  return h.getWhileAway(scope).events.filter(item => item.kind === 'proposal').map(item => item.body)
}

it('a Ticket with no progress is itself the initiative: "Retomar: …" is proposed, not dropped as its own duplicate', () => {
  const h = host()
  const personaId = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  expect(h.proactivity.fire('pp', personaId, 'routine', 'Revisar o projeto e propor o próximo passo')).toBe(true)
  expect(proposals(h)).toEqual(['Retomar: Implementar faixa Agora'])
})

it('a Ticket waiting on the person is proposed as "Desbloquear: …"', () => {
  const h = host()
  const personaId = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket({
    updatedAt: new Date().toISOString(), attention: { id: 'att1', question: 'Qual cor usar?' },
  }))
  expect(h.proactivity.fire('pp', personaId, 'routine', 'Revisar o projeto e propor o próximo passo')).toBe(true)
  expect(proposals(h)).toEqual(['Desbloquear: Implementar faixa Agora'])
})

it('a real event is not swallowed by a stale Ticket: the event is what gets proposed', () => {
  const h = host()
  const personaId = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  expect(h.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-7' })).toEqual([personaId])
  expect(proposals(h)).toEqual(['Prazo: PR aberto (pr-7)'])
})

it('a real event is not swallowed by a Ticket waiting on the person either', () => {
  const h = host()
  const personaId = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket({ updatedAt: new Date().toISOString(), attention: { id: 'att1', question: 'Qual cor usar?' } }))
  expect(h.fireProactiveEvent({ ...scope, title: 'Erro recorrente no login', subjectId: 'err-3' })).toEqual([personaId])
  expect(proposals(h)).toEqual(['Prazo: Erro recorrente no login (err-3)'])
})

it('real duplicates are still dropped: an event already being worked on by a live Ticket', () => {
  const h = host()
  seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket({ title: 'PR aberto (pr-7)', updatedAt: new Date().toISOString() }))
  expect(h.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-7' })).toEqual([])
  expect(proposals(h)).toEqual([])
})

it('with all the work moving, the daily routine still falls back to the generic gap', () => {
  const h = host()
  const personaId = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket({ updatedAt: new Date().toISOString() }))
  expect(h.proactivity.fire('pp', personaId, 'routine', 'Revisar o projeto e propor o próximo passo')).toBe(true)
  expect(proposals(h)).toEqual(['Cobrir lacuna: Revisar o projeto e propor o próximo passo'])
})

it('the Vigia is a separate path: a stale running Ticket is still reported by the watchdog', () => {
  const h = host()
  seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const tick = h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 1 })
  expect(tick.warnings).toBeGreaterThan(0)
  expect(h.getWhileAway(scope).events.some(item => item.kind === 'watchdog' && item.taskId === 't1')).toBe(true)
})

/**
 * P1-7 "Enquanto você estava fora" with the host's REAL records: who did what, the deliveries, what waits for the person, each
 * linked to the real Task. Reading never consumes the summary (the client refreshes every few seconds); the person dismisses it.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, ref] of [['p1', 'Bento', 'bento'], ['p2', 'Nina', 'nina']] as const) {
    h.createPersona({
      id, ...scope, name, title: 'Engenharia', description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: ref, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    })
  }
}

function ticket(id: string, by: 'Bento' | 'Nina', overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    title: `Tarefa ${id}`,
    decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: `a-${id}`, state: 'running', createdAt: '2026-11-03T10:00:00.000Z' }],
    inputs: [],
    undelivered: [],
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    origin: { triggerId: `e-${id}`, triggerIds: [`e-${id}`] },
    execution: { name: by, directory: '.', assignment: 'go' },
    ...overrides,
  }
}

const save = (h: PersonaHost, row: Ticket): void => { h.orchestration.runtime('pp').repo.tickets.save(row) }
const done = (id: string, by: 'Bento' | 'Nina', at: string, outcome: 'completed' | 'merged' | 'stopped' | 'closed' | 'dropped'): Ticket =>
  ticket(id, by, { ended: { at, by: 'human', outcome }, assignments: [{ id: `a-${id}`, state: 'ended', createdAt: '2026-11-03T10:00:00.000Z' }] })

it('reading the summary does not consume it; dismissing starts the next one', () => {
  const h = host()
  seed(h)
  save(h, done('t1', 'Bento', '2026-11-03T14:00:00.000Z', 'completed'))
  const first = h.getWhileAway(scope)
  expect(first.events.map(event => event.taskId)).toEqual(['t1'])
  expect(first.summary?.awayMinutes).toBeUndefined() // the very first visit: nothing to say about being away
  // The client refreshes on every live update: the same summary comes back, never an empty one.
  expect(h.getWhileAway(scope)).toEqual(first)
  expect(h.markVisit(scope)).toBe(true) // the bootstrap call must not reset the open window either
  expect(h.getWhileAway(scope)).toEqual(first)
  expect(h.dismissWhileAway(scope)).toBe(true)
  const afterDismiss = h.getWhileAway(scope)
  expect(afterDismiss.events).toEqual([])
  expect(afterDismiss.summary).toEqual({ deliveries: 0, waitingOnYou: 0 })
  // What happens after the dismissal is the next summary.
  save(h, done('t2', 'Nina', '2026-11-03T15:30:00.000Z', 'merged'))
  expect(h.getWhileAway(scope).events.map(event => event.taskId)).toEqual(['t2'])
})

it('a delivery says who did it, with the real title; a stopped or dropped Task is not a delivery', () => {
  const h = host()
  seed(h)
  save(h, done('t1', 'Bento', '2026-11-03T12:00:00.000Z', 'completed'))
  save(h, done('t2', 'Nina', '2026-11-03T13:00:00.000Z', 'merged'))
  save(h, done('t3', 'Bento', '2026-11-03T13:30:00.000Z', 'stopped')) // e.g. a Descartar
  save(h, done('t4', 'Bento', '2026-11-03T13:40:00.000Z', 'closed'))
  save(h, done('t5', 'Nina', '2026-11-03T13:50:00.000Z', 'dropped'))
  const away = h.getWhileAway(scope)
  expect(away.events.filter(event => event.kind === 'delivery').map(event => event.taskId)).toEqual(['t1', 't2'])
  expect(away.events[0]).toMatchObject({ taskTitle: 'Tarefa t1', personaId: 'p1', personaName: 'Bento' })
  expect(away.events[1]).toMatchObject({ taskTitle: 'Tarefa t2', personaId: 'p2', personaName: 'Nina' })
  expect(away.summary?.deliveries).toBe(2)
  // One entry per persona who did or waits on something (the team order is the store's, so compare by name).
  expect([...(away.byPersona ?? [])].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { personaId: 'p1', name: 'Bento', delivered: 1, proposed: 0, waitingOnYou: 0, tasks: [{ taskId: 't1', taskTitle: 'Tarefa t1', kind: 'delivery', at: '2026-11-03T12:00:00.000Z' }] },
    { personaId: 'p2', name: 'Nina', delivered: 1, proposed: 0, waitingOnYou: 0, tasks: [{ taskId: 't2', taskTitle: 'Tarefa t2', kind: 'delivery', at: '2026-11-03T13:00:00.000Z' }] },
  ])
  // The strip counts deliveries the same way (a stopped Task is not "entregue hoje").
  const bento = h.getOverviewNow(scope).personas.find(row => row.name === 'Bento')
  expect(bento?.deliveriesToday).toBe(1)
})

it('what waits for the person: a Task question, a result in Revisar, a proposal; counts match the lists', () => {
  const h = host()
  seed(h)
  const root = mkdtempSync(join(tmpdir(), 'persona-away-root-'))
  dirs.push(root)
  mkdirSync(join(root, 'docs'))
  h.setProjectRoot({ ...scope, rootPath: root })
  save(h, ticket('q1', 'Bento', {
    attention: { id: 'at1', question: 'Qual o preço do plano?' },
    updatedAt: '2026-11-03T14:10:00.000Z',
  }))
  save(h, ticket('r1', 'Nina', {
    assignments: [{ id: 'a-r1', state: 'ended', createdAt: '2026-11-03T10:00:00.000Z', report: { state: 'ready', summary: 'pronto', at: '2026-11-03T14:30:00.000Z' } }],
  }))
  // A Task that has a question AND a result is listed once, as the question.
  save(h, ticket('both', 'Bento', {
    attention: { id: 'at2', question: 'Aplico assim?' },
    assignments: [{ id: 'a-both', state: 'ended', createdAt: '2026-11-03T10:00:00.000Z', report: { state: 'ready', summary: 'pronto', at: '2026-11-03T14:20:00.000Z' } }],
  }))
  h.proposeHire({ ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Teca', title: 'Atendimento', description: 'Responde clientes.' })

  const away = h.getWhileAway(scope)
  const kinds = Object.fromEntries((away.waiting ?? []).map(item => [item.id, item.kind]))
  expect(kinds).toEqual({ 'question:q1': 'question', 'question:both': 'question', 'review:r1': 'review', 'approval:hire:h1': 'approval' })
  // The link ids are the ones the rest of the app already uses: the Task's (boards) and the Aprovações card's.
  expect(away.waiting?.find(item => item.id === 'question:q1')).toMatchObject({ taskId: 'q1', approvalId: 'q1', approvalKind: 'attention' })
  expect(h.listApprovals(scope).some(card => card.id === 'q1' && card.kind === 'attention')).toBe(true)
  expect(h.listTasks(scope).some(task => task.id === 'q1')).toBe(true)
  expect(away.waiting?.find(item => item.id === 'approval:hire:h1')?.approvalId).toBe(h.listApprovals(scope).find(card => card.kind === 'hire')?.id)
  const review = away.waiting?.find(item => item.id === 'review:r1')
  expect(review).toMatchObject({ taskId: 'r1', title: 'Tarefa r1', personaId: 'p2', personaName: 'Nina', at: '2026-11-03T14:30:00.000Z' })
  const hire = away.waiting?.find(item => item.id === 'approval:hire:h1')
  expect(hire).toMatchObject({ taskId: '', approvalId: 'h1', approvalKind: 'hire', personaId: 'p1', personaName: 'Bento' })
  // Newest first; the approval has no recorded time and goes last.
  expect(away.waiting?.map(item => item.id)).toEqual(['review:r1', 'question:q1', 'question:both', 'approval:hire:h1'])
  expect(away.summary?.waitingOnYou).toBe(away.waiting?.length)
  expect(away.byPersona?.find(row => row.name === 'Bento')?.waitingOnYou).toBe(3) // q1, both, the hire she proposed
  expect(away.byPersona?.find(row => row.name === 'Nina')).toMatchObject({ waitingOnYou: 1, tasks: [{ taskId: 'r1', kind: 'review' }] })
  // It is state, not an event: it stays after the person dismisses the summary, until they decide.
  h.dismissWhileAway(scope)
  expect(h.getWhileAway(scope).waiting?.length).toBe(4)
})

it('a project without a folder has no draft to review, so nothing is listed as waiting in Revisar', () => {
  const h = host()
  seed(h)
  save(h, ticket('r1', 'Nina', {
    assignments: [{ id: 'a-r1', state: 'ended', createdAt: '2026-11-03T10:00:00.000Z', report: { state: 'ready', summary: 'pronto', at: '2026-11-03T14:30:00.000Z' } }],
  }))
  expect(h.getWhileAway(scope).waiting).toEqual([])
  expect(h.getWhileAway(scope).summary?.waitingOnYou).toBe(0)
})

it('a Vigia note carries the real title and the persona, never the raw id', () => {
  const h = host()
  seed(h)
  save(h, ticket('t1', 'Bento', { title: 'Implementar faixa Agora' }))
  expect(h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 1 }).warnings).toBeGreaterThan(0)
  const note = h.getWhileAway(scope).events.find(event => event.kind === 'watchdog' && event.taskId === 't1')
  expect(note).toMatchObject({ taskTitle: 'Implementar faixa Agora', personaName: 'Bento' })
  // The Vigia's notes are the system's: they are not something "Bento did" for the person.
  expect(h.getWhileAway(scope).byPersona?.find(row => row.name === 'Bento')).toBeUndefined()
})

it('after a restart the window opens at the last time the person was looking, not at the last restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-away-restart-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = host(path, '2026-11-03T10:00:00.000Z')
  seed(first)
  save(first, done('before', 'Bento', '2026-11-03T09:00:00.000Z', 'completed')) // the person was already here
  first.getWhileAway(scope) // looking at 10:00 (opens the window and marks presence)
  save(first, done('after', 'Nina', '2026-11-03T12:00:00.000Z', 'completed')) // while away
  first.store.close()
  const second = host(path, '2026-11-03T18:00:00.000Z')
  const away = second.getWhileAway(scope)
  expect(away.since).toBe('2026-11-03T10:00:00.000Z')
  expect(away.events.map(event => event.taskId)).toEqual(['after'])
  expect(away.events[0]).toMatchObject({ personaName: 'Nina', taskTitle: 'Tarefa after' })
  // How long they were away is fixed when they came back (10:00 → 18:00), so the header needs no client clock and does not grow.
  expect(away.summary?.awayMinutes).toBe(480)
  expect(second.getWhileAway(scope).summary?.awayMinutes).toBe(480)
  // The same sitting after a quick restart keeps the window instead of starting a new one.
  second.store.close() // Windows keeps the file locked while the second host is open
})

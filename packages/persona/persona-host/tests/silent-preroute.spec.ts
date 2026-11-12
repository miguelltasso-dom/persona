import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { HeldMessages, heldLine } from '../src/held-messages.ts'
import { bindHostFile, it } from './host-harness.ts'

/** The pre-router used to drop a person's work request without a word (Tally, 04/11). It must now say so and keep it. */
const { host } = bindHostFile('2026-11-03T23:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let clock = '2026-11-03T23:00:00.000Z'

function seed(h: PersonaHost): void {
  clock = '2026-11-03T23:00:00.000Z'
  h.orchestration.now = () => clock
  h.timezoneOffsetMinutes = () => 0 // this spec writes its silence window on a UTC wall clock (S1 P1-12: it follows the machine's offset otherwise)
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Coordenação', description: 'Triagem.',
    personality: 'Calma.', instructions: 'Aceite.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
}

function silence(h: PersonaHost, start: string, end: string, executionBudget = 8): void {
  h.setAutonomy({ ...scope, personaId: 'p1', mode: 'propose', proposalBudget: 3, tokenBudget: 1000, executionBudget, silenceStart: start, silenceEnd: end })
}

function post(h: PersonaHost, id: string, body: string): void {
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '', occurredAt: clock })
}

function bodies(h: PersonaHost): string[] {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.map(item => item.body)
}

it('a work request inside the silence window gets an honest line, is kept, and runs once the window ends', async () => {
  const h = host()
  seed(h)
  silence(h, '22:00', '07:00')
  post(h, 'm1', 'Faça o relatório do dia')
  await h.orchestration.flush('pp')
  const rt = h.orchestration.runtime('pp')
  expect(rt.repo.tickets.list()).toHaveLength(0)
  expect(bodies(h)).toContain('Recebi. Bento está em horário de silêncio até 07:00; começo assim que acabar.')
  expect(new HeldMessages(h.screens.screens).list('pp').map(row => row.eventId)).toEqual(['m1'])

  expect(h.orchestration.releaseHeld('pp')).toBe(0) // still inside the window: nothing moves, nothing is lost
  expect(new HeldMessages(h.screens.screens).list('pp')).toHaveLength(1)

  clock = '2026-11-04T07:30:00.000Z'
  expect(h.orchestration.releaseHeld('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const tickets = rt.repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.title).toMatch(/Faça o relatório do dia/)
  expect(new HeldMessages(h.screens.screens).list('pp')).toEqual([])
  expect(h.orchestration.releaseHeld('pp')).toBe(0) // exactly once
  expect(rt.repo.tickets.list()).toHaveLength(1)
})

it('the line is said once, even when the same message is delivered again', async () => {
  const h = host()
  seed(h)
  silence(h, '22:00', '07:00')
  post(h, 'm1', 'Faça o relatório do dia')
  await h.orchestration.flush('pp')
  expect(bodies(h).filter(line => line.startsWith('Recebi.'))).toHaveLength(1)
})

it('a full project holds the request with the "equipe ocupada" line and releases it when a slot frees', async () => {
  const h = host()
  seed(h)
  h.orchestration.budget.running.set('pp', h.orchestration.budget.maxPerProject)
  post(h, 'm1', 'Crie a lista de preços')
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  expect(bodies(h)).toContain('Recebi. A equipe está ocupada; começo assim que liberar.')
  expect(h.orchestration.releaseHeld('pp')).toBe(0)
  h.orchestration.budget.running.delete('pp')
  expect(h.orchestration.releaseHeld('pp')).toBe(1)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list().map(item => item.title).join('|')).toMatch(/Crie a lista de preços/)
})

it('an exhausted execution budget holds too, and raising it brings the request back', async () => {
  const h = host()
  seed(h)
  silence(h, '', '', 0)
  post(h, 'm1', 'Escreva o texto de boas-vindas')
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  expect(bodies(h)).toContain('Recebi. A equipe está ocupada; começo assim que liberar.')
  silence(h, '', '', 8)
  expect(h.orchestration.releaseHeld('pp')).toBe(1)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
})

it('plain chat in the silence window still gets its normal reply (only work requests are held)', async () => {
  const h = host()
  seed(h)
  silence(h, '22:00', '07:00')
  post(h, 'm1', 'Bom dia, tudo bem?')
  await h.orchestration.flush('pp')
  expect(bodies(h).some(line => line.startsWith('Recebi.'))).toBe(false)
  expect(new HeldMessages(h.screens.screens).list('pp')).toEqual([])
})

it('heldLine words the two reasons', () => {
  expect(heldLine('Nina', '06:30')).toBe('Recebi. Nina está em horário de silêncio até 06:30; começo assim que acabar.')
  expect(heldLine('Nina', '')).toBe('Recebi. A equipe está ocupada; começo assim que liberar.')
})

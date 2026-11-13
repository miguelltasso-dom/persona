import { expect, it } from 'vitest'
import { CARE_ITEMS_MAX, careViewOf, leadStateOf, type CareInputs } from '../src/project-care.ts'

/**
 * Marco Dogfood M6 (host): "who is taking care of what", ONE look per project — the responsible, what each persona is doing now, what waits for the owner, the pace of the board and the state of the responsible's loop,
 * with the reason in a sentence. Read-only, assembled from what the host already knows; nothing new is stored. Plain on the wire.
 */
const base = { autopilot: true, doing: 0, queued: 0 }

it('the loop state, in the words the screen maps: off = resting; a paused team; a hold with its reason; capped; working; nothing to do', () => {
  expect(leadStateOf({ ...base, autopilot: false })).toEqual({ state: 'resting', note: 'A responsável não está tocando o quadro: o piloto automático está desligado.' })
  expect(leadStateOf({ ...base, gate: 'paused' })).toMatchObject({ state: 'paused' })
  expect(leadStateOf({ ...base, gate: 'quiet' })).toMatchObject({ state: 'holding', note: expect.stringContaining('silêncio') })
  expect(leadStateOf({ ...base, gate: 'no-engine' })).toMatchObject({ state: 'holding', note: expect.stringContaining('motor') })
  expect(leadStateOf({ ...base, capped: 'Cheguei ao teto de 24 cartões por dia.' })).toEqual({ state: 'capped', note: 'Cheguei ao teto de 24 cartões por dia.' })
  expect(leadStateOf({ ...base, holdReason: 'Segurei os cartões novos (project-reserve).' })).toEqual({ state: 'holding', note: 'Segurei os cartões novos (project-reserve).' })
  expect(leadStateOf({ ...base, doing: 2 })).toEqual({ state: 'working' })
  expect(leadStateOf({ ...base, queued: 1 })).toEqual({ state: 'working' })
  expect(leadStateOf(base)).toEqual({ state: 'resting', note: 'Nada na fila.' })
})

it('the order of reasons: off beats everything; a paused team beats a hold; a cap beats "working"', () => {
  expect(leadStateOf({ autopilot: false, doing: 5, queued: 5, gate: 'paused', capped: 'x' }).state).toBe('resting')
  expect(leadStateOf({ ...base, gate: 'paused', capped: 'x', doing: 1 }).state).toBe('paused')
  expect(leadStateOf({ ...base, capped: 'x', doing: 1 }).state).toBe('capped')
})

const inputs = (over: Partial<CareInputs> = {}): CareInputs => ({
  projectId: 'pp', projectName: 'Loja', companyName: 'Padaria Lua',
  responsible: { projectId: 'pp', persona: { id: 'bia', name: 'Bia', title: 'Redatora' }, source: 'chosen', stale: false },
  autopilot: true, lead: { state: 'working' },
  personas: [{ id: 'bia', name: 'Bia', title: 'Redatora', state: 'working', sentence: 'Escrevendo a legenda', queueCount: 1 }, { id: 'caio', name: 'Caio', title: 'Designer', state: 'resting', queueCount: 0, paused: true }],
  waitingForYou: { approvals: 1, reviews: 0, questions: 1, items: [{ kind: 'approval', title: 'Posso mandar o orçamento?' }, { kind: 'question', taskId: 't-9', title: 'Qual cor?' }] },
  counts: { done: 3, doing: 1, queued: 2, cap: 24, pulled: 4 },
  ...over,
})

it('the view is one object per project with the three answers (who, doing now, waits for you) and the pace', () => {
  const view = careViewOf(inputs())
  expect(view).toMatchObject({
    projectId: 'pp', projectName: 'Loja', companyName: 'Padaria Lua', autopilot: true, lead: { state: 'working' },
    responsible: { persona: { id: 'bia' }, source: 'chosen' },
    counts: { done: 3, doing: 1, queued: 2, cap: 24, pulled: 4 },
    waitingForYou: { approvals: 1, reviews: 0, questions: 1 },
  })
  expect(view.personas.map(item => item.id)).toEqual(['bia', 'caio'])
  expect(view.personas[0]).toMatchObject({ sentence: 'Escrevendo a legenda' })
  expect(view.personas[1]).toMatchObject({ paused: true })
  expect(view.waitingForYou.items).toHaveLength(2)
})

it('what waits for the owner shows at most 5 items (the counts stay whole); a persona with nothing to say has no empty fields', () => {
  const many = Array.from({ length: 9 }, (_unused, index) => ({ kind: 'approval' as const, title: `Pedido ${String(index)}` }))
  const view = careViewOf(inputs({ waitingForYou: { approvals: 9, reviews: 0, questions: 0, items: many } }))
  expect(CARE_ITEMS_MAX).toBe(5)
  expect(view.waitingForYou.items).toHaveLength(5)
  expect(view.waitingForYou.items.map(item => item.title)).toEqual(['Pedido 0', 'Pedido 1', 'Pedido 2', 'Pedido 3', 'Pedido 4']) // oldest first, as the host listed them
  expect(view.waitingForYou.approvals).toBe(9)
  expect(view.personas[1]).not.toHaveProperty('sentence')
  expect(view.personas[1]).not.toHaveProperty('currentTask')
})

it('a project with no responsible keeps the view honest: no persona, source "default", and the screen can say "monte o time"', () => {
  const view = careViewOf(inputs({ responsible: { projectId: 'pp', source: 'default', stale: false }, personas: [] }))
  expect(view.responsible).toEqual({ projectId: 'pp', source: 'default', stale: false })
  expect(view.personas).toEqual([])
})

import { expect, it } from 'vitest'
import { AutopilotBook, careOf, type CarePorts } from '../src/project-care-host.ts'
import type { CarePersona } from '../src/project-care.ts'

/**
 * Marco Dogfood M6 + the autopilot switch (host): the care view of a project is COMPOSED from what the host already knows, through ports; the switch "let the responsible run the board" is one small doc per project (default OFF),
 * written only by the owner (the Remote checks that) and only when it changes. Both pure over ports, so the Remotes stay a few lines.
 */
const bia: CarePersona = { id: 'bia', name: 'Bia', title: 'Redatora', state: 'working', sentence: 'Escrevendo a legenda', queueCount: 1 }

function ports(over: Partial<CarePorts> = {}): CarePorts {
  return {
    projectOf: id => (id === 'pp' ? { name: 'Loja', workspaceId: 'ws' } : undefined),
    companyName: () => 'Padaria Lua',
    responsible: projectId => ({ projectId, persona: { id: 'bia', name: 'Bia', title: 'Redatora' }, source: 'chosen', stale: false }),
    autopilot: () => true,
    gate: () => undefined,
    capped: () => undefined,
    holdReason: () => undefined,
    personas: () => [bia],
    waiting: () => ({ approvals: 1, reviews: 0, questions: 0, items: [{ kind: 'approval', title: 'Posso mandar o orçamento?' }] }),
    counts: () => ({ done: 2, doing: 1, queued: 3, cap: 24, pulled: 4 }),
    ...over,
  }
}

it('the view of a project: name, company, the responsible, the personas, what waits for the owner, the pace and the loop state in one object', () => {
  const view = careOf(ports(), 'pp')!
  expect(view).toMatchObject({
    projectId: 'pp', projectName: 'Loja', companyName: 'Padaria Lua', autopilot: true, lead: { state: 'working' },
    responsible: { persona: { id: 'bia' }, source: 'chosen' }, counts: { done: 2, doing: 1, queued: 3, cap: 24, pulled: 4 },
    waitingForYou: { approvals: 1 },
  })
  expect(view.personas).toEqual([bia])
})

it('a project that does not exist has no view (the Remote turns that into a refusal)', () => {
  expect(careOf(ports(), 'fantasma')).toBeUndefined()
})

it('the loop state follows the host facts, in order: off, a gate (paused/quiet/no engine), a cap, a hold written today, then working or resting', () => {
  expect(careOf(ports({ autopilot: () => false }), 'pp')!.lead).toMatchObject({ state: 'resting' })
  expect(careOf(ports({ gate: () => 'paused' }), 'pp')!.lead).toMatchObject({ state: 'paused' })
  expect(careOf(ports({ gate: () => 'quiet' }), 'pp')!.lead).toMatchObject({ state: 'holding', note: expect.stringContaining('silêncio') })
  expect(careOf(ports({ capped: () => 'Cheguei ao teto de 24 cartões por dia.' }), 'pp')!.lead).toEqual({ state: 'capped', note: 'Cheguei ao teto de 24 cartões por dia.' })
  expect(careOf(ports({ holdReason: () => 'Segurei os cartões novos (project-reserve).' }), 'pp')!.lead).toMatchObject({ state: 'holding' })
  expect(careOf(ports({ counts: () => ({ done: 0, doing: 0, queued: 0, cap: 24, pulled: 0 }) }), 'pp')!.lead).toMatchObject({ state: 'resting', note: 'Nada na fila.' })
})

it('the autopilot is OFF by default, per project; setting it writes once (an identical value changes nothing)', () => {
  const docs = new Map<string, unknown>()
  const book = new AutopilotBook({ get: <T>(p: string, k: string, i: string) => docs.get(`${p}/${k}/${i}`) as T | undefined, put: (p: string, k: string, i: string, v: unknown) => { docs.set(`${p}/${k}/${i}`, v) } })
  expect(book.get('pp')).toBe(false)
  expect(book.set('pp', true, 'ana', '2026-11-12T20:00:00.000Z')).toEqual({ changed: true })
  expect(book.get('pp')).toBe(true)
  expect(book.set('pp', true, 'ana', '2026-11-12T21:00:00.000Z')).toEqual({ changed: false })
  expect(book.get('other')).toBe(false) // another project is its own
  expect(book.set('pp', false, 'ana', '2026-11-12T22:00:00.000Z')).toEqual({ changed: true })
  expect(book.get('pp')).toBe(false)
})

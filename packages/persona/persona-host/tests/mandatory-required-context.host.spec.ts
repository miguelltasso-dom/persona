import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RULES_TOO_BIG_LINE } from '../src/required-context.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Carbon RED-3 (Gauge, 12/11 03:16; promoted from mandatory-required-context.red.ts after the repro was confirmed): "a regra da casa vale em todo turno".
 * persona-core: "Constraint and decision records must enter every compilation for a project". Measured: 8 REQUIRED rules (constraint/decision, ~1,3 mil characters each, together
 * more than the 2000-token budget) all enter `listUsedContext` (the "Contexto usado" audit says `required: true`), but the prompt of a TASK turn had only the owner's own words, and
 * `compileUsedNow` swallowed `REQUIRED_CONTEXT_OVERFLOW` in an empty catch: neither the budget nor "required" had any effect on what the model received.
 * Now: the rules reach EVERY turn (conversation and Task), all of them, and when they are bigger than what fits the owner is told once, in plain words.
 */

const TEXT = 'Texto de apoio da regra da casa, que precisa valer em todo turno. '

function seed(h: PersonaHost, rules: number, repeat: number): string[] {
  seedJourney(h, [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }])
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  const marks: string[] = []
  for (let i = 0; i < rules; i += 1) {
    const mark = `REGRA-OBRIGATORIA-${String(i)}`
    marks.push(mark)
    h.createVaultRecord({ ...SCOPE, id: `r${String(i)}`, kind: i % 2 === 0 ? 'constraint' : 'decision', body: `${mark}. ${TEXT.repeat(repeat)}`, authorId: 'ana' })
  }
  return marks
}

async function ask(h: PersonaHost, id: string, body: string): Promise<void> {
  const queue = ['Ok, texto escrito seguindo as regras.']
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  say(h, id, body)
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

const lines = (h: PersonaHost): string[] => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => event.body)

it('as regras obrigatórias chegam ao modelo no turno de TAREFA', async () => {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  const marks = seed(h, 8, 26)
  const before = h.orchestration.turnInputs.length
  await ask(h, 'q1', '@Bia escreva o texto da página inicial da padaria')
  const turn = h.orchestration.turnInputs.slice(before).find(row => row.purpose === 'task')
  expect(turn, 'o turno de tarefa não rodou').toBeDefined()
  expect(marks.filter(mark => !turn!.prompt.includes(mark))).toEqual([])
  expect(turn!.prompt).toContain('Regras da casa') // said as rules of the house, not as loose records
})

it('with no house rule, the Task prompt carries no "Regras da casa" block (nothing invented)', async () => {
  const h = openJourney('2026-11-12T12:05:00.000Z')
  seed(h, 0, 1)
  const before = h.orchestration.turnInputs.length
  await ask(h, 'q2', '@Bia escreva o texto da página inicial da padaria')
  const turn = h.orchestration.turnInputs.slice(before).find(row => row.purpose === 'task')
  expect(turn, 'o turno de tarefa não rodou').toBeDefined()
  expect(turn!.prompt).not.toContain('Regras da casa')
})

it('when the rules are bigger than what fits in a turn the owner is told ONCE (plain words) and no rule is dropped', async () => {
  const h = openJourney('2026-11-12T12:10:00.000Z')
  const marks = seed(h, 8, 26) // ~2,6 mil tokens of required rules against a budget of 2000
  const before = h.orchestration.turnInputs.length
  await ask(h, 'q3', '@Bia escreva o texto da página inicial da padaria')
  expect(lines(h).filter(line => line === RULES_TOO_BIG_LINE)).toHaveLength(1)
  expect(RULES_TOO_BIG_LINE).not.toMatch(/token|orçamento|budget|JSON/iu)
  await ask(h, 'q4', '@Bia agora escreva o texto da página de contato')
  expect(lines(h).filter(line => line === RULES_TOO_BIG_LINE)).toHaveLength(1) // not said again for the same rules
  const turn = h.orchestration.turnInputs.slice(before).filter(row => row.purpose === 'task').at(-1)
  expect(marks.filter(mark => !turn!.prompt.includes(mark))).toEqual([])
})

it('rules that fit never produce the sentence', async () => {
  const h = openJourney('2026-11-12T12:15:00.000Z')
  seed(h, 2, 3)
  await ask(h, 'q5', '@Bia escreva o texto da página inicial da padaria')
  expect(lines(h).some(line => line === RULES_TOO_BIG_LINE)).toBe(false)
})

it('the conversation prompt carries every rule too (the same promise on both ways in)', async () => {
  const h = openJourney('2026-11-12T12:20:00.000Z')
  const marks = seed(h, 8, 26)
  const speaker = h.product.getPersona('bia')!
  const event = { id: 'q6', streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp', seq: 1, type: 'message', body: 'Qual o horário?', actorId: 'ana', subjectId: 's', occurredAt: '2026-11-12T12:20:00.000Z', deleted: false } as const
  const used = await h.orchestration.compileUsed(event, speaker)
  const text = h.orchestration.talkPrompt(event, speaker, used)
  expect(marks.filter(mark => !text.includes(mark))).toEqual([])
})

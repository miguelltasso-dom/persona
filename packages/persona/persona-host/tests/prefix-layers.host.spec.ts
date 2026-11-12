import { CHOICE_PROMPT_LINE, INDICATOR_PROMPT_LINE, PROMPT_TEMPLATES } from '@deepseek-ai/dsh-persona-engine'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { PASS_TOKEN, speechRules } from '../src/speech.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 9 + 11/19a (Tally, 12/11), "prefixo estável": the paragraphs that shape EVERY answer live in the cache-stable prefix of the persona's prompt, once each, and never in the
 * per-turn tail: Anvil's speech layer, and (for a conversation the PERSON started, and only then) Rivet's two marker lines (`[[escolha: …]]`, `[[indicador: …]]`). An initiative, a
 * routine, a team note pay for none of them. A line that drifts into the tail is paid again on every message and breaks the cache of the warm session.
 */
const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const CLOCK = '2026-11-04T15:00:00.000Z'

function open(): PersonaHost {
  const h = host()
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação', description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  return h
}

function eventOf(id: string, actorId: string, body = 'Qual o horário?', at = CLOCK): Parameters<PersonaHost['orchestration']['talkLayers']>[0] {
  return { id, streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp', seq: 1, type: 'message', body, actorId, subjectId: 's', occurredAt: at, deleted: false }
}

const occurrences = (text: string, part: string): number => text.split(part).length - 1

it('a conversation the PERSON started has the speech layer AND both marker lines in the stable prefix, once each, and none of them in the tail', () => {
  const h = open()
  const layers = h.orchestration.talkLayers(eventOf('e1', 'ana'), h.product.getPersona('atlas')!, [])
  for (const line of [CHOICE_PROMPT_LINE, INDICATOR_PROMPT_LINE, speechRules('simple')]) expect(occurrences(layers.prefix, line)).toBe(1)
  const tail = layers.text.slice(layers.text.indexOf(layers.prefix) + layers.prefix.length)
  for (const line of [CHOICE_PROMPT_LINE, INDICATOR_PROMPT_LINE, speechRules('simple')]) expect(tail).not.toContain(line)
})

it('the prefix is byte-identical for different messages, ids and clocks of a person (the warm cache is kept); no word of the message decides the lines', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const a = h.orchestration.talkLayers(eventOf('e1', 'ana', 'Qual o horário?', CLOCK), speaker, [])
  const b = h.orchestration.talkLayers(eventOf('e2', 'ana', 'Quanto vendemos ontem? Qual o total?', '2026-11-05T09:30:00.000Z'), speaker, [
    { id: 'summary:t', kind: 'subject_summary', body: 'Resumo do assunto', required: false, restricted: false },
  ])
  expect(a.prefix).toBe(b.prefix)
  expect(a.prefix).not.toMatch(/\d{4}-\d{2}-\d{2}T/u)
})

it('an initiative, a routine and a team note get NEITHER marker line (nobody reads a card there, and each of those prompts is paid by the day)', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const kinds = [
    eventOf('initiative:7', 'atlas'), // the scheduler's own message id
    eventOf('routine-run:3', 'routine:daily'),
    eventOf('e3', 'team:note'),
  ]
  for (const event of kinds) {
    const prefix = h.orchestration.talkLayers(event, speaker, []).prefix
    expect(prefix, event.id).not.toContain(CHOICE_PROMPT_LINE)
    expect(prefix, event.id).not.toContain(INDICATOR_PROMPT_LINE)
  }
  expect(h.orchestration.talkLayers(eventOf('e3', 'team:note'), speaker, []).prefix).toContain(PASS_TOKEN) // Anvil's own variant is unchanged
})

it('MEASURE: what the two lines cost in the prefix of a person-started turn, and that an initiative does not pay them', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const person = h.orchestration.talkLayers(eventOf('e1', 'ana'), speaker, []).prefix
  const initiative = h.orchestration.talkLayers(eventOf('initiative:7', 'atlas'), speaker, []).prefix
  const lines = estimateTokens(CHOICE_PROMPT_LINE) + estimateTokens(INDICATOR_PROMPT_LINE)
  process.stdout.write(`[item11/19a] prefixo da conversa da PESSOA: ${String(estimateTokens(person))} tokens (as 2 linhas = ${String(lines)}, ${String(Math.round((lines / (estimateTokens(person) - lines)) * 1000) / 10)}% a frio); iniciativa: ${String(estimateTokens(initiative))} tokens, sem as linhas\n`)
  expect(estimateTokens(person)).toBeGreaterThan(estimateTokens(initiative) - 100)
})

it('the lines live in NO template: the host adds them (talk: for a person-started turn; worker: never, a Task output is shaped by Anvil, not taught here)', () => {
  for (const part of Object.keys(PROMPT_TEMPLATES) as (keyof typeof PROMPT_TEMPLATES)[]) {
    expect(PROMPT_TEMPLATES[part], part).not.toContain(CHOICE_PROMPT_LINE)
    expect(PROMPT_TEMPLATES[part], part).not.toContain(INDICATOR_PROMPT_LINE)
  }
})

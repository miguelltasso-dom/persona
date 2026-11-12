import { CHOICE_PROMPT_LINE, PROMPT_TEMPLATES } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { PASS_TOKEN, speechRules } from '../src/speech.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 9 (Tally, 11/11), "prefixo estável": the two paragraphs that shape EVERY answer, Rivet's line that offers the choice card (`[[escolha: …]]`) and Anvil's speech layer
 * (simple speech, the right to stay silent), live TOGETHER in the cache-stable prefix of the persona's prompt, once each, and never move into the per-turn tail. A line that drifts into
 * the tail is paid again on every message and breaks the cache of the warm session.
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
/** Where Rivet's line lives is his call (it moved out of the talk template at 01:1x): the rule is that it is NEVER in the per-turn tail, and in the prefix at most once, whatever the template says. */
const CHOICE_IN_TALK = PROMPT_TEMPLATES.talk.includes(CHOICE_PROMPT_LINE)

it('the choice-card line and the speech layer are BOTH in the stable prefix, once each, and neither is repeated in the tail', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const layers = h.orchestration.talkLayers(eventOf('e1', 'ana'), speaker, [])
  expect(occurrences(layers.prefix, CHOICE_PROMPT_LINE)).toBe(CHOICE_IN_TALK ? 1 : 0)
  expect(occurrences(layers.prefix, speechRules('simple'))).toBe(1)
  const tail = layers.text.slice(layers.text.indexOf(layers.prefix) + layers.prefix.length)
  expect(tail).not.toContain(CHOICE_PROMPT_LINE)
  expect(tail).not.toContain(speechRules('simple'))
})

it('the prefix is byte-identical for different messages, ids and clocks of the same kind of author (the warm cache is kept)', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const a = h.orchestration.talkLayers(eventOf('e1', 'ana', 'Qual o horário?', CLOCK), speaker, [])
  const b = h.orchestration.talkLayers(eventOf('e2', 'ana', 'Preciso de 3 posts para sexta', '2026-11-05T09:30:00.000Z'), speaker, [
    { id: 'summary:t', kind: 'subject_summary', body: 'Resumo do assunto', required: false, restricted: false },
  ])
  expect(a.prefix).toBe(b.prefix)
  expect(a.prefix).not.toMatch(/\d{4}-\d{2}-\d{2}T/u)
})

it('the only variation of the prefix is Anvil\'s own (the right to stay silent when no person waits); the choice line is the same in both variants', () => {
  const h = open()
  const speaker = h.product.getPersona('atlas')!
  const person = h.orchestration.talkLayers(eventOf('e1', 'ana'), speaker, []).prefix
  const team = h.orchestration.talkLayers(eventOf('e3', 'team:note'), speaker, []).prefix
  expect(person).not.toContain(PASS_TOKEN)
  expect(team).toContain(PASS_TOKEN)
  expect(person.includes(CHOICE_PROMPT_LINE)).toBe(team.includes(CHOICE_PROMPT_LINE)) // the same in both variants, whichever it is
  // everything before the speech paragraph is the same in both: the two variants share their whole beginning
  const common = person.slice(0, person.indexOf(speechRules('simple')))
  expect(team.startsWith(common)).toBe(true)
})

it('the line lives in the TALK template only (Keel, 11/11 23:21): the Task worker\'s template carries no choice line; Anvil\'s speech is applied to a Task\'s OUTPUT, not to its prompt', () => {
  expect(PROMPT_TEMPLATES.worker).not.toContain(CHOICE_PROMPT_LINE)
})

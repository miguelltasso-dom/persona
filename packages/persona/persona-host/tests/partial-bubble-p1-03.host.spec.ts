/**
 * Carbon P1-03 (colheita S1): an error, a missing login or a stop AFTER the reply bubble opened used to leave the "digitando" bubble spinning forever. The bubble is the message
 * `coord-<id>-reply` with `type: 'partial'`; `failReply` / `finishStopped` wrote with `postAs`, which does nothing when the id already exists (`events.has` is true for a partial),
 * so the error line was lost and the partial stayed; and after a restart `recoverPartials` only looked at ids ending in `-partial`, never at the bubble of a conversation (`-reply`).
 * Written RED first, then fixed: the bubble is always SETTLED (with the error line, the words that were written, or "cancelada").
 *
 * The runner is a REAL fake runner injected through `runnerFactory` (a wrapper over `resolveHostRunner` would be rebuilt by the host and its overrides never run): its `whenIdle`
 * opens the bubble exactly as the stream writes it while the model talks, and then ends the way the case says.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => { delete process.env.PERSONA_REAL_CLI })

const { host } = bindHostFile()
let counter = 0
/** The runner the host drives (`whenIdle`, `deliver`…): the type of the runners package's own fake, not the engine's narrower port. */
type Runner = ReturnType<typeof createFakeRunner>

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

interface Case {
  /** What the stream had written when the turn went wrong (the open bubble). */
  readonly bubble: string
  /** How the turn ends: it throws (the CLI fell) or it returns and the words are what the host reads (`liveText`). */
  readonly ends: { readonly throws: string } | { readonly live: string }
}

/** One conversation turn through the real finish path; the bubble is opened by the injected runner, as the stream does. */
async function talk(scenario: Case) {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = false
  counter += 1
  const id = `m-p103-${String(counter)}`
  const base = createFakeRunner()
  const runner: Runner = {
    ...base,
    whenIdle: async (session: string) => {
      await base.whenIdle(session)
      h.events.append({ id: `coord-${id}-reply`, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'partial', body: scenario.bubble, actorId: 'coord', subjectId: `s-${id}`, occurredAt: '2026-11-03T15:00:01.000Z' })
      if ('throws' in scenario.ends) throw new Error(scenario.ends.throws)
    },
  }
  h.orchestration.runnerFactory = () => Promise.resolve(runner)
  if ('live' in scenario.ends) h.orchestration.liveText = scenario.ends.live
  h.postMessage({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', body: 'Qual o preço do pão?', actorId: 'ana', subjectId: `s-${id}`, occurredAt: '2026-11-03T15:00:00.000Z' })
  await h.orchestration.flush('pp')
  const reply = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.find(event => event.id === `coord-${id}-reply`)
  return { h, id, reply }
}

it('the CLI that falls AFTER it started to write settles the bubble with the honest error line (never a bubble that spins, never the half-written words as if final)', async () => {
  const { reply } = await talk({ bubble: 'O pão francês custa R$ 0,90 e o pão de queijo custa ', ends: { throws: 'o CLI caiu' } })
  expect(reply, 'the reply line must exist').toBeDefined()
  expect(reply?.type).not.toBe('partial')
  expect(reply?.body ?? '').toContain('Não consegui responder')
})

it('a missing login recognized AFTER the bubble opened settles the bubble with the error line (never the raw login text, never a bubble that spins)', async () => {
  const text = 'Not logged in · Please run /login'
  const { reply } = await talk({ bubble: text, ends: { live: text } })
  expect(reply, 'the reply line must exist').toBeDefined()
  expect(reply?.type).not.toBe('partial')
  expect(reply?.body ?? '').not.toMatch(/Not logged in|Please run \/login/u)
  expect(reply?.body ?? '').not.toBe('')
})

it('after a restart a bubble left open (`coord-<id>-reply`, type partial) is settled with the words that were written, never left spinning', async () => {
  const h = host()
  seed(h)
  h.events.append({
    id: 'coord-m-left-reply', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'partial',
    body: 'O pão francês custa R$ 0,90 e o pão de queijo custa', actorId: 'coord', subjectId: 's', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  h.events.append({ id: 'm-left', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'Qual o preço do pão?', actorId: 'ana', subjectId: 's', occurredAt: '2026-11-03T14:59:00.000Z' })
  await (h.orchestration as unknown as { recoverPartials(rt: unknown, projectId: string): Promise<void> }).recoverPartials(h.orchestration.runtime('pp'), 'pp')
  const left = h.events.get('coord-m-left-reply')
  expect(left?.type).not.toBe('partial')
  expect(left?.body ?? '').toContain('O pão francês custa R$ 0,90')
})

it('Carbon P1-04 + Muse: after a restart an EMPTY bubble (the host takes back a rejected first turn and was gone before the correction answered) is settled "Resposta cancelada.", never left spinning', async () => {
  const h = host()
  seed(h)
  h.events.append({
    id: 'coord-m-empty-reply', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'partial',
    body: '', actorId: 'coord', subjectId: 's', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  h.events.append({ id: 'm-empty', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'Qual o preço do pão?', actorId: 'ana', subjectId: 's', occurredAt: '2026-11-03T14:59:00.000Z' })
  await (h.orchestration as unknown as { recoverPartials(rt: unknown, projectId: string): Promise<void> }).recoverPartials(h.orchestration.runtime('pp'), 'pp')
  const left = h.events.get('coord-m-empty-reply')
  expect(left?.type).not.toBe('partial')
  expect(left?.body).toBe('Resposta cancelada.')
})

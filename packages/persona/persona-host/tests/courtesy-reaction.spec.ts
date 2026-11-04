/**
 * Contract for the courtesy lever (D-075, Atlas): "valeu!" / "ok" get a visible reaction of the persona and NO model
 * call, unless the persona has something open for the person in that thread, and a courtesy plus a request is work.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { courtesyStickerFor } from '../src/orchestration.ts'
import { bindHostFile, it } from './host-harness.ts'

const DIRS: string[] = []
// defined BEFORE bindHostFile: the harness disposes its file-backed hosts first (hooks run in reverse)
afterEach(() => {
  for (const dir of DIRS.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createPersona({
    ...SCOPE, id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.createDm({ id: 'dm-bento', ...SCOPE, participantA: 'ana', participantB: 'bento' })
}

/** Counts every model delivery and every runner resolved. */
function meter(h: PersonaHost): { deliveries: number; resolves: number } {
  const count = { deliveries: 0, resolves: 0 }
  h.orchestration.runnerFactory = async () => {
    count.resolves += 1
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            count.deliveries += 1
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return count
}

function say(h: PersonaHost, id: string, body: string, stream: { kind: 'channel' | 'dm'; owner: string } = { kind: 'channel', owner: 'geral' }): void {
  h.postMessage({
    id, ...SCOPE, streamKind: stream.kind, ownerId: stream.owner, body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: CLOCK,
  })
}

function view(h: PersonaHost, id: string, stream: { kind: 'channel' | 'dm'; owner: string } = { kind: 'channel', owner: 'geral' }) {
  return h.listMessages({ ...SCOPE, streamKind: stream.kind, ownerId: stream.owner, actorId: 'ana', afterSeq: 0, limit: 100 })
    .events.find(item => item.id === id)
}

it('CF (c): "valeu!" is answered by the persona with a visible reaction: no model call, no Ticket, the message stays', async () => {
  const h = host()
  seed(h)
  expect(h.orchestration.courtesyNoModel).toBe(true)
  const count = meter(h)
  say(h, 'm-thanks', 'valeu!')
  await h.orchestration.flush('pp')
  expect(count).toEqual({ deliveries: 0, resolves: 0 })
  expect(h.listTasks(SCOPE)).toEqual([])
  const message = view(h, 'm-thanks')
  expect(message?.body).toBe('valeu!')
  expect(message?.reactions).toEqual([{ stickerId: 'coracao', actorIds: ['atlas'] }])
})

it('CF: the reaction is a heart for thanks and a thumbs-up for the rest, and a DM is answered by its persona', async () => {
  const h = host()
  seed(h)
  const count = meter(h)
  say(h, 'm-ok', 'ok')
  say(h, 'm-dm', 'beleza', { kind: 'dm', owner: 'dm-bento' })
  say(h, 'm-obg', 'obrigado')
  await h.orchestration.flush('pp')
  expect(count.deliveries).toBe(0)
  expect(view(h, 'm-ok')?.reactions).toEqual([{ stickerId: 'joinha', actorIds: ['atlas'] }])
  expect(view(h, 'm-dm', { kind: 'dm', owner: 'dm-bento' })?.reactions).toEqual([{ stickerId: 'joinha', actorIds: ['bento'] }])
  expect(view(h, 'm-obg')?.reactions).toEqual([{ stickerId: 'coracao', actorIds: ['atlas'] }])
  expect(['obrigada', 'vlw', '🙏', 'valeu'].map(courtesyStickerFor)).toEqual(['coracao', 'coracao', 'coracao', 'coracao'])
  expect(['ok', 'beleza', 'combinado', 'fechado', '👍'].map(courtesyStickerFor)).toEqual(['joinha', 'joinha', 'joinha', 'joinha', 'joinha'])
})

it('CF (a): an "ok" that answers a question the persona left open is NOT swallowed', async () => {
  const h = host()
  seed(h)
  const count = meter(h)
  h.events.append({
    id: 'persona-asks', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'Posso começar o cardápio de sábado?', actorId: 'atlas', subjectId: 's-ask', occurredAt: CLOCK,
  })
  say(h, 'm-yes', 'ok')
  await h.orchestration.flush('pp')
  expect(count.deliveries).toBe(1)
  expect(view(h, 'm-yes')?.reactions).toEqual([])
})

it('CF (a): an "ok" while a Ticket of that thread waits for the person (Attention) takes the normal route too', async () => {
  const h = host()
  seed(h)
  say(h, 'm-ask', 'aprovar o deploy em staging?')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  expect(ticket?.attention?.question).toMatch(/deploy/i)
  say(h, 'm-ok', 'ok')
  await h.orchestration.flush('pp')
  expect(view(h, 'm-ok')?.reactions).toEqual([])
})

it('CF (b): a courtesy plus a request is work: the Ticket is created and nothing is swallowed', async () => {
  const h = host()
  seed(h)
  const count = meter(h)
  say(h, 'm-both', 'valeu! agora monta o resumo da semana')
  await h.orchestration.flush('pp')
  expect(h.listTasks(SCOPE)).toHaveLength(1)
  expect(count.deliveries).toBeGreaterThan(0)
  expect(view(h, 'm-both')?.reactions).toEqual([])
})

it('CF: with the flag off the old route stays: one talk call, no reaction', async () => {
  const h = host()
  seed(h)
  h.orchestration.courtesyNoModel = false
  const count = meter(h)
  say(h, 'm-old', 'valeu!')
  await h.orchestration.flush('pp')
  h.orchestration.courtesyNoModel = true
  expect(count.deliveries).toBe(1)
  expect(view(h, 'm-old')?.reactions).toEqual([])
})

it('CF: a reaction counts as the answer: reopening the host does not turn the courtesy into a model call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-cf-'))
  DIRS.push(dir)
  process.env.PERSONA_HOME = dir
  const path = join(dir, 'persona.db')
  const first = host(path)
  seed(first)
  const before = meter(first)
  say(first, 'm-thanks', 'valeu!')
  await first.orchestration.flush('pp')
  expect(before).toEqual({ deliveries: 0, resolves: 0 })
  const second = host(path)
  second.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const after = meter(second)
  second.orchestration.runtime('pp')
  await second.orchestration.flush('pp')
  expect(after).toEqual({ deliveries: 0, resolves: 0 })
  expect(view(second, 'm-thanks')?.reactions).toEqual([{ stickerId: 'coracao', actorIds: ['atlas'] }])
})

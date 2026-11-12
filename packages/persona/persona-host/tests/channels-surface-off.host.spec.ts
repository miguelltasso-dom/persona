import { Context } from '@deepseek-ai/cordis'
import { afterAll, afterEach, beforeAll, expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { FEATURE_OFF_REASON, FEATURE_OFF_TEXT } from '../src/surface-gates.ts'
import { HOST_TEST_TIMEOUT_MS, it, resetHost } from './host-harness.ts'

/**
 * D-113 (surface `channels`, item 22): OFF is OFF FOR REAL in the product's host. Proven with the PRODUCT's default (`flagDefaults: 'production'`, what `PERSONA_HOST_FLAGS=production` means) inside Vitest:
 * the Remotes of the surface refuse with `feature-off` (the funnel, Tally), and the channel FENCE is not applied: no `@equipe` by name, no "persona outside the channel is not woken" — a message flows as it did
 * before item 22. The same code ON is proved by `equipes.host.spec.ts` / `channel-routing.host.spec.ts` (the suites run with the surfaces ON). Written RED first: the host's `channelWire` getter ignored the surface.
 */
const CLOCK = '2026-11-12T12:00:00.000Z'
const scope = { workspaceId: 'ws', projectId: 'pp' }
let ctx: Context
let h: PersonaHost
let serial = 0

beforeAll(() => {
  ctx = new Context()
  h = new PersonaHost(ctx, { databasePath: '', flagDefaults: 'production' }) // '' = the in-memory store, as the shared test host
  h.orchestration.now = () => CLOCK
}, HOST_TEST_TIMEOUT_MS)

afterEach(() => { resetHost(h, CLOCK) }, HOST_TEST_TIMEOUT_MS)

afterAll(async () => { await ctx.fiber.dispose() }, HOST_TEST_TIMEOUT_MS)

function seed(): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of [['p-coord', 'Coord', 'Coordenação'], ['p-bia', 'Bia', 'Redatora de textos'], ['p-caio', 'Caio', 'Designer de artes'], ['p-lia', 'Lia', 'Atendimento ao cliente']] as const) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true // the team layer itself is on in the product: only the SURFACE decides the fence
  h.orchestration.fanoutEnabled = true
  onTestFinished(() => { h.orchestration.fanoutEnabled = false })
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
}

function answers(): { asked: string[] } {
  const asked: string[] = []
  const original = h.orchestration.answerOnce.bind(h.orchestration)
  h.orchestration.answerOnce = (_project, persona) => {
    asked.push(persona.name)
    return Promise.resolve(`Resposta de ${persona.name}`)
  }
  onTestFinished(() => { h.orchestration.answerOnce = original })
  return { asked }
}

const send = (ownerId: string, body: string): void => {
  serial += 1
  h.postMessage({ id: `u${String(serial)}`, ...scope, streamKind: 'channel', ownerId, body, actorId: 'ana', subjectId: '' })
}

it('the product default: the channels surface resolved OFF (and the team layer itself stays on)', () => {
  expect(h.surfaces).toMatchObject({ channels: false, skillImport: false, defaults: 'production' })
  expect(h.teamworkEnabled).toBe(true)
})

it('the Remotes of the surface refuse with `feature-off` and the sentence of a person, before anything runs', async () => {
  seed()
  const calls: Array<() => unknown> = [
    () => h.getChannelLayout(scope),
    () => h.getEquipeLayout(scope),
    () => h.updateChannelLayout({ ...scope, action: { kind: 'createCategory', name: 'Clientes' } }),
    () => h.listMentionOptions({ ...scope, streamKind: 'channel', ownerId: 'geral' } as never),
  ]
  for (const call of calls) {
    const fault = await Promise.resolve().then(call).then(() => undefined, (error: unknown) => error)
    expect(fault).toBeInstanceOf(RemoteFault)
    expect(fault).toMatchObject({ message: FEATURE_OFF_TEXT, details: { reason: FEATURE_OFF_REASON } })
  }
  expect(h.equipeDesk.listCategories('pp')).toEqual([]) // and nothing was written
})

it('OFF for real: an equipe by name is NOT called (the fence is not applied: `@Lançamento` is only text, its members are not woken)', async () => {
  seed()
  const { asked } = answers()
  h.equipeDesk.createEquipe({ ...scope, name: 'Lançamento', personaIds: ['p-bia', 'p-caio'] }) // the desk is code, not a Remote: the data exists, the surface is what is off
  send('geral', '@Lançamento, vamos alinhar o lançamento')
  await h.orchestration.flush('pp')
  expect(asked).not.toContain('Bia')
  expect(asked).not.toContain('Caio')
})

it('OFF for real: nobody is fenced out of a channel (a persona named outside it IS woken, as before item 22)', async () => {
  seed()
  const { asked } = answers()
  h.createChannel({ id: 'ideias', ...scope, name: 'ideias', topic: '', memberIds: [{ kind: 'persona', id: 'p-coord' }] })
  send('ideias', '@Lia @Bia, o que acham?') // with the fence on, Lia (not on #ideias) is never woken
  await h.orchestration.flush('pp')
  expect([...asked].sort()).toEqual(['Bia', 'Lia'])
})

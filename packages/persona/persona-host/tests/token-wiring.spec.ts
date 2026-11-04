/**
 * Contract tests for the token levers wired into the host (persona-spec/contracts/token-wiring.md, Tally).
 * One block per wiring (W4 first). The first-delivery path must not move.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const SK_DIRS: string[] = []
afterEach(() => {
  for (const dir of SK_DIRS.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function message(id: string, body: string): Parameters<PersonaHost['orchestration']['talkLayers']>[0] {
  return {
    id, streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp',
    seq: 1, type: 'message', body, actorId: 'ana', subjectId: 's',
    occurredAt: CLOCK, deleted: false,
  }
}

const NOTES = [
  'a vitrine é trocada às sextas com fotos novas e legenda curta de sempre para o Instagram da Padaria.',
  'a vitrine da sexta leva bolo de fubá, pão de queijo e a promoção do combo café e pão do mês corrente.',
  'vitrine de natal leva panetone e chocotone com preço da tabela do Cofre, sem desconto sem aprovação.',
  'a vitrine do dia dos namorados leva cupcakes de morango e brigadeiro de colher em embalagem kraft.',
  'a vitrine precisa de limpeza todo dia ao fechar; produto de vidro fica no armário do fundo da loja.',
  'vitrine refrigerada tem o termostato ajustado em 4 graus; anotar a temperatura na planilha do turno.',
  'a vitrine de domingo repete o cardápio de sábado sem os bolos, que só saem sob encomenda antecipada.',
  'a vitrine do café da manhã destaca pão na chapa, queijo minas e geleia caseira nas manhãs de semana.',
  'a vitrine de sábado inclui o pão de fermentação natural e a encomenda das 9h da Ana Souza em separado.',
]
const EVIDENCE = 'encomenda das 9h da Ana Souza'

it('W4: the recall that answers the question survives the budget (foldHostTalkUsed gets event.body)', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = NOTES.map((body, index) => ({
    id: `note-${String(index).padStart(2, '0')}`, kind: 'memory', body, required: false, restricted: false,
  }))
  const asked = h.orchestration.talkLayers(message('e1', 'Como está a vitrine de sábado e a encomenda da Ana Souza?'), speaker, used)
  expect(asked.text).toContain(EVIDENCE)
  // The evidence row is LAST in id order: the old head clip (200 tokens) dropped it.
  const head = NOTES.join('\n').slice(0, 800)
  expect(head).not.toContain(EVIDENCE)
})

it('W4: the stable prefix does not move with the question, and the required vault stays in it', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = [
    { id: 'rule-1', kind: 'constraint', body: 'Nunca inventar preço.', required: true, restricted: false },
    ...NOTES.map((body, index) => ({ id: `note-${String(index)}`, kind: 'memory', body, required: false, restricted: false })),
  ]
  const a = h.orchestration.talkLayers(message('e1', 'Como está a vitrine de sábado?'), speaker, used)
  const b = h.orchestration.talkLayers(message('e2', 'E o cardápio de domingo?'), speaker, used)
  expect(a.prefix).toBe(b.prefix)
  expect(a.prefix).toContain('Nunca inventar preço.')
  expect(a.text).not.toBe(b.text)
})

it('W4: restricted rows still never reach the prompt, whatever the question says', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('atlas')!
  const used = [
    { id: 'secret', kind: 'memory', body: 'segredo da vitrine: senha do cofre 1234', required: false, restricted: true },
    ...NOTES.map((body, index) => ({ id: `note-${String(index)}`, kind: 'memory', body, required: false, restricted: false })),
  ]
  const layers = h.orchestration.talkLayers(message('e1', 'Qual o segredo da vitrine e a senha do cofre?'), speaker, used)
  expect(layers.text).not.toContain('senha do cofre 1234')
})

interface Delivery { readonly purpose: string; readonly sessionId: string; readonly text: string }
interface Request { readonly purpose: string; readonly toolCount: number }

function seedTeam(h: PersonaHost): void {
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
}

/** Fake runners that remember which purpose each delivery went to. */
function spyFactory(
  h: PersonaHost,
  options: { failAnswerOnlyTalk?: boolean; workerGate?: Promise<void> } = {},
): { deliveries: Delivery[]; requests: Request[] } {
  const failAnswerOnlyTalk = options.failAnswerOnlyTalk === true
  const deliveries: Delivery[] = []
  const requests: Request[] = []
  h.orchestration.runnerFactory = async (request) => {
    const purpose = request?.purpose ?? 'none'
    const toolCount = Object.keys(request?.tools ?? {}).length
    requests.push({ purpose, toolCount })
    if (failAnswerOnlyTalk && purpose === 'talk' && toolCount === 0) throw new Error('cheap runner unavailable')
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            deliveries.push({ purpose, sessionId, text })
            if (options.workerGate !== undefined && sessionId.startsWith('worker-')) await options.workerGate
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return { deliveries, requests }
}

const WORK = { workspaceId: 'ws', projectId: 'pp', streamKind: 'channel' as const, ownerId: 'geral' }

it('W1: triage rides the cheap answer-only runner; the executor keeps the task runner', async () => {
  const h = host()
  seedTeam(h)
  h.orchestration.skipTriage = false // W1 is about the call when it is made; SK below proves it is skipped by default
  onTestFinished(() => { h.orchestration.skipTriage = true })
  const spy = spyFactory(h)
  h.postMessage({
    id: 'm-work', ...WORK, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't', occurredAt: CLOCK,
  })
  await h.orchestration.flush('pp')
  const triage = spy.deliveries.filter(row => row.sessionId === 'coordination')
  const worker = spy.deliveries.filter(row => row.sessionId.startsWith('worker-'))
  expect(triage.length).toBeGreaterThan(0)
  expect(triage.every(row => row.purpose === 'talk')).toBe(true)
  expect(worker.length).toBeGreaterThan(0)
  expect(worker.every(row => row.purpose === 'task')).toBe(true)
  expect(spy.requests.some(row => row.purpose === 'talk' && row.toolCount === 0)).toBe(true)
})

it('W1: when the cheap runner cannot resolve, triage falls back to the executor runner and the work still runs', async () => {
  const h = host()
  seedTeam(h)
  h.orchestration.skipTriage = false
  onTestFinished(() => { h.orchestration.skipTriage = true })
  const spy = spyFactory(h, { failAnswerOnlyTalk: true })
  h.postMessage({
    id: 'm-fallback', ...WORK, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't', occurredAt: CLOCK,
  })
  await h.orchestration.flush('pp')
  const triage = spy.deliveries.filter(row => row.sessionId === 'coordination')
  expect(triage.length).toBeGreaterThan(0)
  expect(triage.every(row => row.purpose === 'task')).toBe(true)
  expect(spy.deliveries.some(row => row.sessionId.startsWith('worker-'))).toBe(true)
})

// ---------------------------------------------------------------------------------------------------------
// SK (D-073): the coordination triage call is skipped by default. The safety condition is that nothing the
// person sees depends on it: with and without the call the SAME Ticket, the SAME persona and the SAME
// delivery. Each mode runs on its own file-backed host so the two outcomes are independent.
// ---------------------------------------------------------------------------------------------------------

interface Outcome {
  readonly tickets: readonly { title: string; stage: string }[]
  readonly messages: readonly { id: string; actorId: string; body: string }[]
  readonly workers: readonly { persona: string; purpose: string; text: string }[]
  readonly triageCalls: number
}

function seedResearchTeam(h: PersonaHost): void {
  seedTeam(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'luna', name: 'Luna', title: 'Pesquisa',
    description: 'Pesquisa mercado.', personality: 'Curiosa.', instructions: 'Pesquise e resuma.',
    avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createDm({ id: 'dm-bento', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bento' })
}

function freshHost(): PersonaHost {
  const dir = mkdtempSync(join(tmpdir(), 'persona-sk-'))
  SK_DIRS.push(dir)
  process.env.PERSONA_HOME = dir
  const created = host(join(dir, 'persona.db'))
  // A file-backed host starts with no engine connected: say it is ready, as the real-path specs do.
  created.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  return created
}

function observe(h: PersonaHost, options: { workerGate?: Promise<void> } = {}): { workers: Outcome['workers'][number][]; triage: { count: number } } {
  const workers: Outcome['workers'][number][] = []
  const triage = { count: 0 }
  h.orchestration.runnerFactory = async (request) => {
    const purpose = request?.purpose ?? 'none'
    const persona = request?.personaName ?? ''
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            if (sessionId === 'coordination') triage.count += 1
            else workers.push({ persona, purpose, text })
            if (options.workerGate !== undefined && sessionId.startsWith('worker-')) await options.workerGate
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return { workers, triage }
}

function snapshot(h: PersonaHost, seen: ReturnType<typeof observe>, streams: readonly { kind: 'channel' | 'dm'; id: string }[]): Outcome {
  const tasks = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  const names = new Map(tasks.map((task, index) => [task.id, `T${String(index)}`]))
  const normalize = (text: string): string => [...names].reduce((out, [id, name]) => out.split(id).join(name), text)
  const messages = streams.flatMap(stream => h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: stream.kind, ownerId: stream.id, actorId: 'ana', afterSeq: 0, limit: 100,
  }).events.map(item => ({ id: normalize(item.id), actorId: item.actorId, body: normalize(item.body) })))
  return {
    tickets: tasks.map(task => ({ title: task.title, stage: task.stage })),
    messages: [...messages].sort((a, b) => a.id.localeCompare(b.id)),
    workers: seen.workers,
    triageCalls: seen.triage.count,
  }
}

async function runBoth(
  run: (h: PersonaHost, seen: ReturnType<typeof observe>) => Promise<readonly { kind: 'channel' | 'dm'; id: string }[]>,
): Promise<{ skipped: Outcome; called: Outcome }> {
  const out: Partial<Record<'skipped' | 'called', Outcome>> = {}
  for (const skip of [true, false]) {
    const h = freshHost()
    h.orchestration.skipTriage = skip
    seedResearchTeam(h)
    const seen = observe(h)
    const streams = await run(h, seen)
    out[skip ? 'skipped' : 'called'] = snapshot(h, seen, streams)
  }
  return { skipped: out.skipped!, called: out.called! }
}

function post(h: PersonaHost, input: { id: string; kind: 'channel' | 'dm'; owner: string; body: string; subject?: string }): void {
  h.postMessage({
    id: input.id, workspaceId: 'ws', projectId: 'pp', streamKind: input.kind, ownerId: input.owner,
    body: input.body, actorId: 'ana', subjectId: input.subject ?? 't', occurredAt: CLOCK,
  })
}

it('SK (a): a work message on #geral reaches the same Ticket, the same persona and the same delivery without the triage call', async () => {
  const { skipped, called } = await runBoth(async (h) => {
    post(h, { id: 'm-research', kind: 'channel', owner: 'geral', body: 'monte um resumo de pesquisa dos 3 concorrentes da padaria' })
    await h.orchestration.flush('pp')
    return [{ kind: 'channel', id: 'geral' }]
  })
  expect(called.triageCalls).toBeGreaterThan(0)
  expect(skipped.triageCalls).toBe(0)
  expect(skipped.tickets).toHaveLength(1)
  expect(skipped.tickets).toEqual(called.tickets)
  expect(skipped.workers).toEqual(called.workers)
  expect(skipped.workers.length).toBeGreaterThan(0)
  expect(skipped.messages).toEqual(called.messages)
})

it('SK (b): a DM reaches the same persona and the same reply without the triage call', async () => {
  const { skipped, called } = await runBoth(async (h) => {
    post(h, { id: 'm-dm', kind: 'dm', owner: 'dm-bento', body: 'implemente o filtro de pedidos' })
    await h.orchestration.flush('pp')
    return [{ kind: 'dm', id: 'dm-bento' }]
  })
  expect(skipped.triageCalls).toBe(0)
  expect(skipped.messages.length).toBeGreaterThan(1)
  expect(skipped.tickets).toEqual(called.tickets)
  expect(skipped.workers).toEqual(called.workers)
  expect(skipped.messages).toEqual(called.messages)
})

it('SK (c): a follow-up while the Task is live joins the Task: no second Ticket, same deliveries', async () => {
  const outcomes: Outcome[] = []
  for (const skip of [true, false]) {
    const h = freshHost()
    h.orchestration.skipTriage = skip
    seedResearchTeam(h)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const seen = observe(h, { workerGate: gate })
    post(h, { id: 'm-first', kind: 'channel', owner: 'geral', body: 'monte um resumo de pesquisa dos 3 concorrentes da padaria' })
    // the worker is held: the Task is live when the second message arrives
    await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
    post(h, { id: 'm-follow', kind: 'channel', owner: 'geral', body: 'e inclua os preços de cada um' })
    release()
    await h.orchestration.flush('pp')
    outcomes.push(snapshot(h, seen, [{ kind: 'channel', id: 'geral' }]))
  }
  const [skipped, called] = outcomes as [Outcome, Outcome]
  expect(skipped.tickets).toHaveLength(1)
  expect(skipped.tickets).toEqual(called.tickets)
  expect(skipped.workers).toEqual(called.workers)
  expect(skipped.messages).toEqual(called.messages)
  expect(skipped.triageCalls).toBe(0)
})

it('SK (d): the first delivery is untouched: it never had a triage call, and the flag does not change a byte of it', async () => {
  const onboarding = {
    workspaceId: 'ws', personalProjectId: 'pp', displayName: 'Ana',
    team: [{
      name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
      instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true, systemRoles: ['coordination'],
    }, {
      name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
      instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, systemRoles: [],
    }],
    templateIds: [], runnerChoices: ['dsh'], cofreSeed: 'Agência Ponto — estúdio de sites.',
  } as const
  const texts: string[][] = []
  for (const skip of [true, false]) {
    const h = freshHost()
    h.orchestration.skipTriage = skip
    const seen = observe(h)
    await h.completeOnboarding(onboarding as unknown as Parameters<PersonaHost['completeOnboarding']>[0])
    await h.orchestration.flush('pp')
    expect(seen.triage.count, `skip=${String(skip)}`).toBe(0)
    texts.push(seen.workers.map(row => `${row.persona}|${row.purpose}|${row.text}`))
  }
  expect(texts[0]!.length).toBeGreaterThan(0)
  expect(texts[0]).toEqual(texts[1])
})

it('SK: the flag is ON by default and the triage runner is never resolved when it is', async () => {
  const h = host()
  seedTeam(h)
  expect(h.orchestration.skipTriage).toBe(true)
  const spy = spyFactory(h)
  h.postMessage({
    id: 'm-default', ...WORK, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't', occurredAt: CLOCK,
  })
  await h.orchestration.flush('pp')
  expect(spy.deliveries.filter(row => row.sessionId === 'coordination')).toEqual([])
  expect(spy.requests.some(row => row.purpose === 'talk' && row.toolCount === 0)).toBe(false)
  expect(spy.deliveries.some(row => row.sessionId.startsWith('worker-') && row.purpose === 'task')).toBe(true)
})

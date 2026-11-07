/**
 * TEAM-4 host, the tool (opinion-host.ts): identity, caps, the budget and the call to the round engine. The engine itself (`TeamOpinions.run`,
 * Bolt) has its own spec; here it is a fake that records what it was asked, so what is proven is what must be decided BEFORE anyone is called.
 */
import type { ScreenRepos as ScreenReposType, StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { ScreenRepos, openTempStore } from '@deepseek-ai/dsh-persona-store'
import type { HarnessCall, HarnessMcpPorts } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, describe, expect, it } from 'vitest'
import { CONFIRM_ABOVE_COLLEAGUES, OpinionTool, withOpinionTool, type OpinionToolDeps } from '../src/opinion-host.ts'
import type { OpinionResult, OpinionRunInput } from '../src/opinion-run.ts'

const NOW = '2026-11-05T10:00:00.000Z'
const claude = { cli: 'claude', connected: true, readsImages: true }
const codex = { cli: 'codex', connected: true, readsImages: false }

function persona(id: string, name: string, title = 'Equipe'): StoredPersona {
  return { id, name, title, personality: 'Clara.', instructions: 'Ajude.', projectId: 'pp', runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, systemRoles: [] } as unknown as StoredPersona
}

const TEAM = [persona('atlas', 'Atlas', 'Coordenação'), persona('bia', 'Bia', 'Redação'), persona('teo', 'Teo', 'Arte'), persona('lia', 'Lia', 'Revisão')]
const closers: Array<() => void> = []
afterEach(() => { for (const close of closers.splice(0)) close() })

interface Rig {
  readonly tool: OpinionTool
  readonly runs: OpinionRunInput[]
  readonly screens: ScreenReposType
  readonly state: { enabled: boolean; running: boolean; limits: { canAskColleagues: boolean; askCapPerDay: number; maxOpinionRounds: number }; other: number; now: string; motors: Record<string, typeof claude>; paused: Set<string>; result: OpinionResult; hold?: Promise<void> }
}

const OK: OpinionResult = {
  state: 'done',
  replies: [
    { personaId: 'bia', name: 'Bia', mark: 'liked', text: 'Ficou claro.' },
    { personaId: 'teo', name: 'Teo', mark: 'suggestion', text: 'Troque o verde.' },
    { personaId: 'lia', name: 'Lia', mark: 'nothing', text: '' },
  ],
  consolidation: 'Troquei o verde por azul.', noVision: [], ignoredAttachmentIds: [],
}

async function rig(over: Partial<OpinionToolDeps> = {}): Promise<Rig> {
  const handle = await openTempStore()
  closers.push(() => { handle.store.close() })
  const screens = new ScreenRepos(handle.store, () => NOW)
  const runs: OpinionRunInput[] = []
  const state: Rig['state'] = {
    enabled: true, running: true, limits: { canAskColleagues: true, askCapPerDay: 6, maxOpinionRounds: 2 }, other: 0, now: NOW,
    motors: {}, paused: new Set(), result: OK,
  }
  const tool = new OpinionTool({
    enabled: () => state.enabled,
    now: () => state.now,
    product: { getPersona: id => TEAM.find(row => row.id === id), listPersonas: () => TEAM },
    screens,
    opinions: { run: async (input) => { runs.push(input); if (state.hold !== undefined) await state.hold; return state.result } },
    limitsOf: () => state.limits,
    otherAsksToday: () => state.other,
    isRunning: () => state.running,
    gateOf: (_project, one) => ({ paused: state.paused.has(one.id), limited: false }),
    motorOf: one => state.motors[one.id] ?? claude,
    ...over,
  })
  return { tool, runs, screens, state }
}

const call = (args: Record<string, unknown>, callId = 'c1', personaId = 'atlas'): HarnessCall => ({
  tool: 'ask_team_opinion', run: { personaId, ticketId: 't-1', assignmentId: 'a-1' }, args, callId,
})
const ARGS = { question: 'O que acham deste cartaz?', draft: { text: 'Cartaz do sábado: pão quente às 7h.' } }
const parse = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

describe('before anyone is called: identity and switches', () => {
  it('with the team switch off, nothing runs and nothing is counted', async () => {
    const r = await rig()
    r.state.enabled = false
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: false, code: 'off' })
    expect(r.runs).toHaveLength(0)
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(0)
  })

  it('an unknown persona (a forged run) and a Task that already ended are refused', async () => {
    const r = await rig()
    expect(parse(await r.tool.ask(call(ARGS, 'c1', 'fantasma')))).toMatchObject({ ok: false, code: 'forbidden' })
    r.state.running = false
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: false, code: 'ended' })
    expect(r.runs).toHaveLength(0)
  })

  it('the persona\'s own switch "pode pedir a colegas" off refuses, with the way forward', async () => {
    const r = await rig()
    r.state.limits = { ...r.state.limits, canAskColleagues: false }
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(answer).toMatchObject({ ok: false, code: 'not-allowed' })
    expect(String(answer.message)).toMatch(/persona_ask/u)
    expect(String(answer.message)).toContain('ligar a chave')
    expect(r.runs).toHaveLength(0)
  })

  it('bad arguments are refused in Portuguese before any budget: no question, no draft, too many images, bad audience, unknown colleague', async () => {
    const r = await rig()
    const code = async (args: Record<string, unknown>): Promise<unknown> => parse(await r.tool.ask(call(args, `c-${JSON.stringify(args).length}`))).code
    expect(await code({ draft: { text: 'x' } })).toBe('invalid')
    expect(await code({ question: 'q' })).toBe('invalid')
    expect(await code({ question: 'q', draft: { attachmentIds: ['1', '2', '3', '4', '5'] } })).toBe('invalid')
    expect(await code({ question: 'q', draft: { attachmentIds: [1] } })).toBe('invalid')
    expect(await code({ question: 'q', draft: { text: 'x' }, audience: 'todos' })).toBe('invalid')
    expect(await code({ question: 'q', draft: { text: 'x' }, audience: ['ninguem'] })).toBe('unknown-colleague')
    expect(await code({ question: 'q', draft: {} })).toBe('draft-empty')
    expect(r.runs).toHaveLength(0)
  })
})

describe('a round that is allowed', () => {
  it('calls the engine ONCE with the budget\'s choices, counts the round and the request of the day, and hands back the opinions as data', async () => {
    const r = await rig()
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(r.runs).toHaveLength(1)
    expect(r.runs[0]).toMatchObject({
      projectId: 'pp', ticketId: 't-1', askerId: 'atlas', question: 'O que acham deste cartaz?',
      draft: { text: 'Cartaz do sábado: pão quente às 7h.' }, readerIds: ['bia', 'teo', 'lia'], skipped: [], round: 1, maxRounds: 2, audience: 'team',
      estimate: { responses: 3 }, rodape: '≈ 3 respostas',
    })
    expect(r.runs[0]?.requestId).toBe('t-1:c1')
    expect(answer).toMatchObject({ ok: true, state: 'done', round: 1, roundsLeft: 1 })
    const opinions = String(answer.opinions)
    expect(opinions).toContain('sobre "O que acham deste cartaz?"')
    expect(opinions).toContain('- Bia gostou: Ficou claro.')
    expect(opinions).toContain('- Teo sugere: Troque o verde.')
    expect(opinions).toContain('Sem nada a acrescentar: Lia.')
    expect(opinions).toContain('nas suas palavras: "Troquei o verde por azul."')
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(1)
    expect(r.tool.askedToday('pp', 'atlas', '2026-11-05')).toBe(1)
    expect(r.tool.askedToday('pp', 'bia', '2026-11-05')).toBe(0)
    expect(r.tool.askedToday('pp', 'atlas', '2026-11-04')).toBe(0)
  })

  it('a repeat of the SAME call returns the same answer and adds no round, no request, no model call', async () => {
    const r = await rig()
    const first = await r.tool.ask(call(ARGS, 'same'))
    const again = await r.tool.ask(call(ARGS, 'same'))
    expect(again).toBe(first)
    expect(r.runs).toHaveLength(1)
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(1)
    expect(r.tool.askedToday('pp', 'atlas', '2026-11-05')).toBe(1)
  })

  it('while the first call is still running, a repeat says it is in progress instead of starting another round', async () => {
    const r = await rig()
    let release: () => void = () => undefined
    r.state.hold = new Promise<void>((resolve) => { release = resolve })
    const first = r.tool.ask(call(ARGS, 'slow'))
    await Promise.resolve()
    expect(parse(await r.tool.ask(call(ARGS, 'slow')))).toMatchObject({ ok: false, code: 'busy' })
    release()
    expect(parse(await first)).toMatchObject({ ok: true })
    expect(r.runs).toHaveLength(1)
  })

  it('a deliberate second call is the second round; the third is refused with the honest line and calls nobody', async () => {
    const r = await rig()
    expect(parse(await r.tool.ask(call(ARGS, 'a')))).toMatchObject({ ok: true, round: 1, roundsLeft: 1 })
    expect(parse(await r.tool.ask(call(ARGS, 'b')))).toMatchObject({ ok: true, round: 2, roundsLeft: 0 })
    const third = parse(await r.tool.ask(call(ARGS, 'c')))
    expect(third).toMatchObject({ ok: false, code: 'rounds-cap' })
    expect(String(third.message)).toContain('2 rodadas de opinião')
    expect(r.runs).toHaveLength(2)
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(2)
    // another Task has its own rounds
    expect(parse(await r.tool.ask({ ...call(ARGS, 'd'), run: { personaId: 'atlas', ticketId: 't-2', assignmentId: 'a-2' } }))).toMatchObject({ ok: true, round: 1 })
  })

  it('the person\'s number of rounds (1..3) is the cap', async () => {
    const r = await rig()
    r.state.limits = { ...r.state.limits, maxOpinionRounds: 1 }
    expect(parse(await r.tool.ask(call(ARGS, 'a')))).toMatchObject({ ok: true, round: 1, roundsLeft: 0 })
    expect(parse(await r.tool.ask(call(ARGS, 'b')))).toMatchObject({ ok: false, code: 'rounds-cap' })
    r.state.limits = { ...r.state.limits, maxOpinionRounds: 3 }
    expect(parse(await r.tool.ask(call(ARGS, 'c')))).toMatchObject({ ok: true, round: 2 })
  })

  it('the daily cap counts opinions TOGETHER with the other requests to colleagues (one number for the person)', async () => {
    const r = await rig()
    r.state.limits = { ...r.state.limits, askCapPerDay: 3, maxOpinionRounds: 3 }
    r.state.other = 2
    expect(parse(await r.tool.ask(call(ARGS, 'a')))).toMatchObject({ ok: true })
    // 2 handoff requests + 1 opinion = 3 = the cap
    const capped = parse(await r.tool.ask(call(ARGS, 'b')))
    expect(capped).toMatchObject({ ok: false, code: 'daily-cap' })
    expect(String(capped.message)).toContain('3 pedidos')
    expect(r.runs).toHaveLength(1)
    // the next day it is open again
    r.state.now = '2026-11-06T09:00:00.000Z'
    r.state.other = 0
    expect(parse(await r.tool.ask(call(ARGS, 'c')))).toMatchObject({ ok: true })
  })
})

describe('the autonomy is not a gate; a BIG round needs the person first; and who is (not) asked', () => {
  // A team with 8 colleagues of the asker (more than the confirmation limit).
  const BIG = [TEAM[0] as StoredPersona, ...Array.from({ length: 8 }, (_, n) => persona(`c${String(n)}`, `Colega ${String(n)}`))]
  const bigRig = (over: Partial<OpinionToolDeps> = {}) => rig({ product: { getPersona: id => BIG.find(row => row.id === id), listPersonas: () => BIG }, ...over })

  it('there is no autonomy dependency at all: the switch, the caps and the cost decide (Keel 04/11 23:36)', async () => {
    const r = await rig()
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    expect(r.runs).toHaveLength(1)
  })

  it('more than 5 colleagues in one round: a proposal to the person with the budget\'s sentence; nobody is called and no round is spent', async () => {
    const r = await bigRig()
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(answer).toMatchObject({ ok: false, code: 'propose' })
    // 8 colleagues exist, the budget cuts the round at 6 (maxReplies): the sentence says what the round WOULD call
    expect(String(answer.message)).toContain('chamaria 6 colegas (mais de 5)')
    expect(String(answer.message)).toContain('Posso pedir a opinião da equipe sobre O que acham deste cartaz? ≈ 6 respostas')
    expect(String(answer.message)).toContain('persona_ask')
    expect(String(answer.message)).toContain('até 5 colegas pelo id')
    expect(r.runs).toHaveLength(0)
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(0)
    expect(r.tool.askedToday('pp', 'atlas', '2026-11-05')).toBe(0)
  })

  it('naming up to 5 colleagues is not a big round: it runs', async () => {
    const r = await bigRig()
    const ids = ['c0', 'c1', 'c2', 'c3', 'c4']
    expect(ids).toHaveLength(CONFIRM_ABOVE_COLLEAGUES)
    expect(parse(await r.tool.ask(call({ ...ARGS, audience: ids })))).toMatchObject({ ok: true })
    expect(r.runs[0]?.readerIds).toEqual(ids)
    expect(parse(await r.tool.ask(call({ ...ARGS, audience: [...ids, 'c5'] }, 'c2')))).toMatchObject({ ok: false, code: 'propose' })
  })

  it('a cost limit set by the host also asks the person first (the upper end of the estimate)', async () => {
    const r = await rig({ confirmAboveMicroUsd: 1000 })
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(answer).toMatchObject({ ok: false, code: 'propose' })
    expect(String(answer.message)).toContain('passa do que a pessoa aceita usar sem confirmar')
    expect(r.runs).toHaveLength(0)
    const roomy = await rig({ confirmAboveMicroUsd: 10_000_000 })
    expect(parse(await roomy.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
  })

  it('paused colleagues are skipped with the reason and never called; the engine is told who was left out', async () => {
    const r = await rig()
    r.state.paused.add('teo')
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(r.runs[0]?.readerIds).toEqual(['bia', 'lia'])
    expect(r.runs[0]?.skipped).toEqual([{ id: 'teo', why: 'paused' }])
    expect(String(answer.opinions)).toContain('Não foram chamados: Teo (está em pausa).')
  })

  it('an image goes only to colleagues whose engine reads images; the others are listed "não vê imagens neste motor"', async () => {
    const r = await rig({ imageSizes: () => [{ width: 1500, height: 1000 }] })
    r.state.motors = { teo: codex }
    const answer = parse(await r.tool.ask(call({ question: 'E o cartaz?', draft: { attachmentIds: ['img-1'], alt: 'Cartaz azul e verde' } })))
    expect(r.runs[0]).toMatchObject({ readerIds: ['bia', 'lia'], skipped: [{ id: 'teo', why: 'no-vision' }], draft: { attachmentIds: ['img-1'], alt: 'Cartaz azul e verde' } })
    expect(String(answer.opinions)).toContain('Teo (não vê imagens neste motor)')
  })

  it('nobody able to see the image: no round, the way forward is to describe it in text', async () => {
    const r = await rig()
    r.state.motors = { bia: codex, teo: codex, lia: codex }
    const answer = parse(await r.tool.ask(call({ question: 'E o cartaz?', draft: { attachmentIds: ['img-1'] } })))
    expect(answer).toMatchObject({ ok: false, code: 'no-vision' })
    expect(String(answer.message)).toContain('Descreva a imagem em texto')
    expect(r.runs).toHaveLength(0)
  })

  it('"the team" of a round is the people LINKED to the work, not the whole project (the freshly hired Finance and People are not asked about a campaign art)', async () => {
    const r = await rig({ involvedIn: () => ['lia', 'bia'] })
    const answer = parse(await r.tool.ask(call(ARGS)))
    // the order is the team's (bia, teo, lia), only the linked ones are asked, and teo is not a "skipped" colleague: he was never part of the round
    expect(r.runs[0]?.readerIds).toEqual(['bia', 'lia'])
    expect(r.runs[0]?.skipped).toEqual([])
    expect(r.runs[0]?.audience).toBe('team')
    expect(String(answer.audience)).toContain('2 pessoas ligadas a este trabalho (o projeto tem 3 colegas)')
    expect(String(answer.audience)).toContain('everyone')
  })

  it('"everyone" asks the whole project; with nobody linked (or the host unable to tell) the default is the whole project too', async () => {
    const wide = await rig({ involvedIn: () => ['lia'] })
    await wide.tool.ask(call({ ...ARGS, audience: 'everyone' }))
    expect(wide.runs[0]?.readerIds).toEqual(['bia', 'teo', 'lia'])
    const nobody = await rig({ involvedIn: () => ['fantasma'] })
    expect(parse(await nobody.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    expect(nobody.runs[0]?.readerIds).toEqual(['bia', 'teo', 'lia'])
    const unknown = await rig()
    await unknown.tool.ask(call(ARGS))
    expect(unknown.runs[0]?.readerIds).toEqual(['bia', 'teo', 'lia'])
    // no note when nothing was narrowed
    expect(parse(await unknown.tool.ask(call(ARGS, 'c2'))).audience).toBeUndefined()
  })

  it('a big project does not turn the default round into a big one: only the linked people are counted against the confirmation limit', async () => {
    const BIG = [TEAM[0] as StoredPersona, ...Array.from({ length: 8 }, (_, n) => persona(`c${String(n)}`, `Colega ${String(n)}`))]
    const r = await rig({ product: { getPersona: id => BIG.find(row => row.id === id), listPersonas: () => BIG }, involvedIn: () => ['c0', 'c1', 'c2'] })
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    expect(r.runs[0]?.readerIds).toEqual(['c0', 'c1', 'c2'])
    // the whole project, on purpose, IS a big round
    expect(parse(await r.tool.ask(call({ ...ARGS, audience: 'everyone' }, 'c2')))).toMatchObject({ ok: false, code: 'propose' })
  })

  it('a chosen audience asks only those colleagues; the asker is never one of them', async () => {
    const r = await rig()
    await r.tool.ask(call({ ...ARGS, audience: ['teo', 'atlas'] }))
    expect(r.runs[0]).toMatchObject({ readerIds: ['teo'], audience: 'some' })
  })
})

describe('when the engine could not run', () => {
  it('a round that called nobody is given back: the persona keeps the round and the request of the day, and is told why', async () => {
    const r = await rig()
    r.state.result = { state: 'failed', reason: 'A conversa desta tarefa não foi achada.', replies: [], noVision: [], ignoredAttachmentIds: [] }
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(answer).toMatchObject({ ok: false, code: 'failed' })
    expect(String(answer.message)).toContain('Siga com o que tem')
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(0)
    expect(r.tool.askedToday('pp', 'atlas', '2026-11-05')).toBe(0)
  })

  it('a partial round (some colleagues failed) still counts, and says who did not answer', async () => {
    const r = await rig()
    r.state.result = {
      state: 'partial', replies: [{ personaId: 'bia', name: 'Bia', mark: 'liked', text: 'Bom.' }, { personaId: 'teo', name: 'Teo', mark: 'suggestion', text: 'Houve um problema', failed: true }],
      noVision: [], ignoredAttachmentIds: ['ghost'],
    }
    const answer = parse(await r.tool.ask(call(ARGS)))
    expect(answer).toMatchObject({ ok: true, state: 'partial', ignoredAttachmentIds: ['ghost'] })
    expect(String(answer.opinions)).toContain('Não responderam (falha): Teo.')
    expect(String(answer.opinions)).not.toContain('Teo sugere')
    expect(r.tool.roundsUsed('pp', 't-1')).toBe(1)
  })
})

describe('withOpinionTool: composition, not an edit of the existing dispatch', () => {
  it('announces the tool once, routes it to the opinion tool and leaves every other tool to the base', async () => {
    const r = await rig()
    const seen: string[] = []
    const base: HarnessMcpPorts = { tools: ['board_list'], call: async (input) => { seen.push(input.tool); return '{"ok":true,"from":"base"}' } }
    const ports = withOpinionTool(base, r.tool)
    expect(ports.tools).toEqual(['board_list', 'ask_team_opinion'])
    expect(withOpinionTool({ tools: ['board_list', 'ask_team_opinion'], call: async () => '{}' }, r.tool).tools).toEqual(['board_list', 'ask_team_opinion'])
    expect(parse(await ports.call?.({ ...call(ARGS), tool: 'board_list' }) ?? '')).toEqual({ ok: true, from: 'base' })
    expect(seen).toEqual(['board_list'])
    expect(parse(await ports.call?.(call(ARGS)) ?? '')).toMatchObject({ ok: true, state: 'done' })
    expect(seen).toEqual(['board_list'])
  })

  it('without a base dispatch, any other tool is "unavailable" (never a silent no-op)', async () => {
    const r = await rig()
    const ports = withOpinionTool({}, r.tool)
    expect(parse(await ports.call?.({ ...call(ARGS), tool: 'board_list' }) ?? '')).toMatchObject({ ok: false })
    expect(ports.tools).toEqual(['ask_team_opinion'])
  })
})

describe('D-092: the account decides whether the round shows money', () => {
  const HISTORY = {
    source: 'history' as const,
    tokensPerCall: { conversa: { input: { min: 3_000, max: 4_000 }, output: { min: 60, max: 160 } }, execucao: { input: { min: 3_200, max: 4_400 }, output: { min: 100, max: 500 } } },
    samples: { conversa: { tokens: 8, tempo: 0 }, execucao: { tokens: 8, tempo: 0 } },
  }
  const WEEK = { id: 'week' as const, usedPercent: 67, resetsAt: '2026-11-07T16:00:00.000Z' }
  const MONEY = /US\$|\$|microUsd/iu

  it('a subscription: the footer and the estimate the screen reads carry no money, and a limit set in dollars still asks first (internal figure)', async () => {
    const r = await rig({ accountOf: () => ({ billing: 'subscription', janelas: [WEEK] }), calibration: () => HISTORY })
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    const run = r.runs[0]!
    expect(JSON.stringify([run.rodape, run.estimate])).not.toMatch(MONEY)
    expect(run.rodape).toMatch(/^≈ 3 respostas · de .+ a .+ tokens$/u)
    const limited = await rig({ accountOf: () => ({ billing: 'subscription' }), calibration: () => HISTORY, confirmAboveMicroUsd: 1000 })
    expect(parse(await limited.tool.ask(call(ARGS)))).toMatchObject({ ok: false, code: 'propose' })
  })

  it('an API account: the footer adds the estimated US$, labelled', async () => {
    const r = await rig({ accountOf: () => ({ billing: 'api' }), calibration: () => HISTORY })
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    expect(r.runs[0]?.rodape).toMatch(/ · (≈ US\$ [\d,]+(–[\d,]+)? \(estimativa\)|menos de US\$ 0,01 \(estimativa\))$/u)
  })

  it('without the account (unknown) there is no money either', async () => {
    const r = await rig({ calibration: () => HISTORY })
    expect(parse(await r.tool.ask(call(ARGS)))).toMatchObject({ ok: true })
    expect(JSON.stringify([r.runs[0]?.rodape, r.runs[0]?.estimate])).not.toMatch(MONEY)
  })
})

describe('the model points to files by NAME, and the image that came with the request is the draft when none is named', () => {
  const FILES = {
    thread: [{ id: 'att-9', name: 'cartaz.png' }, { id: 'att-3', name: 'referencia.png' }, { id: 'att-4', name: 'nota.txt' }],
    request: [{ id: 'att-9', name: 'cartaz.png' }, { id: 'att-4', name: 'nota.txt' }],
  }

  it('a file name (any case, with or without a folder or accent) stands for the id of that attachment of the conversation', async () => {
    const r = await rig({ attachmentsOf: () => FILES })
    const answer = parse(await r.tool.ask(call({ question: 'E o cartaz?', draft: { attachmentIds: ['Cartaz.PNG', 'anexos/referência.png', 'att-4'] } })))
    expect(answer).toMatchObject({ ok: true })
    expect(r.runs[0]?.draft.attachmentIds).toEqual(['att-9', 'att-3', 'att-4'])
    expect(answer.attached).toBeUndefined() // the model named its images: nothing was added
  })

  it('a name nobody has stays as the model wrote it (the round drops it as ignored; nothing is invented)', async () => {
    const r = await rig({ attachmentsOf: () => FILES })
    await r.tool.ask(call({ question: 'E o cartaz?', draft: { attachmentIds: ['fantasma.png'] } }))
    expect(r.runs[0]?.draft.attachmentIds).toEqual(['fantasma.png'])
  })

  it('a draft that names NO image takes the images attached to the request that started the Task, and tells the model so', async () => {
    const r = await rig({ attachmentsOf: () => FILES })
    const answer = parse(await r.tool.ask(call({ question: 'O que acham do cartaz?', draft: { text: 'Cartaz do sábado: pão quente às 7h.' } })))
    expect(r.runs[0]?.draft).toMatchObject({ text: 'Cartaz do sábado: pão quente às 7h.', attachmentIds: ['att-9'] }) // the image, not the .txt
    expect(String(answer.attached)).toContain('cartaz.png')
  })

  it('an image the model never named does NOT stop a round about words when nobody of it can see images (the Codex engine): it stays behind and the model is told', async () => {
    const r = await rig({ attachmentsOf: () => FILES })
    r.state.motors = { bia: codex, teo: codex, lia: codex }
    const answer = parse(await r.tool.ask(call({ question: 'O que acham do texto?', draft: { text: 'Cartaz do sábado: pão quente às 7h.' } })))
    expect(answer).toMatchObject({ ok: true })
    expect(r.runs[0]?.draft.attachmentIds).toBeUndefined()
    expect(String(answer.attached)).toMatch(/cartaz\.png.*não foi junto/u)
    // …whereas an image the model NAMED still refuses when nobody sees it: that one was meant
    const named = await rig({ attachmentsOf: () => FILES })
    named.state.motors = { bia: codex, teo: codex, lia: codex }
    expect(parse(await named.tool.ask(call({ question: 'E o cartaz?', draft: { attachmentIds: ['cartaz.png'] } })))).toMatchObject({ ok: false, code: 'no-vision' })
  })

  it('an EMPTY list means "no image" and is respected; a request with no image adds none; without the dependency nothing changes', async () => {
    const empty = await rig({ attachmentsOf: () => FILES })
    await empty.tool.ask(call({ question: 'q', draft: { text: 'só texto', attachmentIds: [] } }))
    expect(empty.runs[0]?.draft.attachmentIds).toBeUndefined()
    const none = await rig({ attachmentsOf: () => ({ thread: FILES.thread, request: [] }) })
    await none.tool.ask(call({ question: 'q', draft: { text: 'só texto' } }))
    expect(none.runs[0]?.draft.attachmentIds).toBeUndefined()
    const plain = await rig()
    await plain.tool.ask(call({ question: 'q', draft: { text: 'só texto' } }))
    expect(plain.runs[0]?.draft.attachmentIds).toBeUndefined()
  })
})

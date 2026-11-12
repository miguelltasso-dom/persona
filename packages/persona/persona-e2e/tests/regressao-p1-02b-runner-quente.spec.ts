/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1, P1-02 (item 12), ponto (b) que o Forge NÃO reproduziu nem corrigiu em 05:50 ("preciso de um teste com dois turnos concorrentes da mesma persona, um em
 * fundo e outro na frente"): duas Tarefas da MESMA persona dividem o MESMO runner quente (a chave do `warmRunners` é `projeto:persona:task…`; o `TextCapture` e o `usageContext` do runner são UM
 * só por runner). Com a Tarefa A em segundo plano (a persona está livre, `noteBusy` calou) e a B na frente, os dois turnos andam ao mesmo tempo no mesmo runner. O que não pode acontecer:
 *   1  a resposta de uma aparecer na outra (o texto final lido de uma captura compartilhada);
 *   2  o status de uma Tarefa vir de outra (uma termina e a outra fica presa em "andando", ou herda o relatório da vizinha);
 *   3  perder o Parar: parar a Tarefa B (da frente) ou a A (do fundo) tem de parar ESSA e deixar a outra terminar com a resposta dela;
 *   4  `runningTicketOf` (que o Parar sem Tarefa e o "Direcionar agora" leem) deve seguir devolvendo uma Tarefa que está rodando de verdade — o Forge NÃO o mudou de propósito (uma Tarefa em fundo tem
 *      de poder ser parada) e este teste trava esse comportamento.
 *
 * O cenário pelo HOST em processo com o runner REAL e o CLI de mentira (0 IA; `PERSONA_REAL_CLI=1`): é o caminho do `resolveHostRunner` + `tapTurn`, onde mora a captura compartilhada; o runner falso
 * do `createFakeRunner` não a tem. O livro de segundo plano é criado com limiar curto (150 ms) para a Tarefa A ir ao fundo logo. Cada cenário tem antes um teste de OBSERVAÇÃO e há um CONTROLE
 * (a Tarefa A sozinha devolve a resposta dela). O veredito é PURO e provado nos dois lados.
 *
 * ESTADO (12/11 07:15): o Parar derrubava a vizinha (12/11 06:36: ela fechava `blocked` com "O motor de Bia não está disponível") — vermelho que o Forge corrigiu às 06:53 (enquanto OUTRA Tarefa da
 * persona está no livro de segundo plano, a nova ganha runner próprio, chave `pp:bia:task:<ticketId>:solo`): os três do Parar são testes NORMAIS agora. A mistura de resposta/status nunca reproduziu;
 * fica a trava, com o stub de turno inteiro no fim e com o stub TRANSMITIDO (`stepMs`: texto e ferramentas durante o turno, as duas Tarefas ao mesmo tempo).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backgroundWorkOf } from '../../persona-host/src/background-work.ts'
import type PersonaHost from '../../persona-host/src/index.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../persona-host/tests/remote-team-harness.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'

const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'regressao')
const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const MARK_A = 'RESPOSTA-DO-CARTAZ-AZUL'
const MARK_B = 'RESPOSTA-DO-CARTAZ-VERDE'
const ASK_A = 'TAREFA-A-AZUL'
const ASK_B = 'TAREFA-B-VERDE'
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** What the scenario read of one Task: its words (every place the host keeps them) and how it ended. */
export interface TaskSeen {
  readonly name: 'A' | 'B'
  readonly text: string
  /** `ticket.ended` is set (finished or stopped by the person). */
  readonly ended: boolean
  /** The state of the last report of the Task's last assignment (`ready`, `blocked`, `progress`…); undefined = no report yet. */
  readonly report: string | undefined
  /** The persona stopped it on purpose (the scenario asked for Parar on this Task). */
  readonly stoppedOnPurpose: boolean
}

/** O veredito, PURO: o que uma Tarefa leu de errado das duas (vazio = certo). Cada Tarefa só pode ter a marca DELA e termina `ready`; a parada de propósito dispensa a resposta e o relatório. */
export function mixProblems(a: TaskSeen, b: TaskSeen): string[] {
  const out: string[] = []
  const own = (task: TaskSeen, mine: string, theirs: string): void => {
    if (task.text.includes(theirs)) out.push(`a Tarefa ${task.name} carrega a resposta da OUTRA (${theirs})`)
    if (task.stoppedOnPurpose) return
    if (!task.text.includes(mine)) out.push(`a Tarefa ${task.name} perdeu a resposta DELA (${mine})`)
    if (task.report !== 'ready') out.push(`a Tarefa ${task.name} terminou com o status "${String(task.report)}" em vez de "ready"`)
  }
  own(a, MARK_A, MARK_B)
  own(b, MARK_B, MARK_A)
  return out
}

/** O veredito dos turnos TRANSMITIDOS, PURO: o de {@link mixProblems} e mais: a narração (o "pensar em voz alta" entre ferramentas) de uma não pode estar nas palavras da outra, e nenhuma pode ter perdido o texto final. */
export function streamedProblems(a: TaskSeen, b: TaskSeen): string[] {
  const out = mixProblems(a, b)
  if (/\(B\d\)/u.test(a.text)) out.push('a Tarefa A carrega a narração da B')
  if (/\(A\d\)/u.test(b.text)) out.push('a Tarefa B carrega a narração da A')
  for (const task of [a, b]) if (task.text.includes('Terminei a minha parte.')) out.push(`a Tarefa ${task.name} ficou sem as palavras finais (o texto dela foi zerado)`)
  return out
}

/** O veredito do Parar, PURO: a Tarefa parada tem de ter terminado (parada) e a vizinha tem de terminar `ready` com a resposta DELA, sem ter sido parada nem marcada com erro de motor. */
export function stopProblems(stopped: TaskSeen, other: TaskSeen, otherMark: string): string[] {
  const out: string[] = []
  if (!stopped.ended) out.push(`o Parar na Tarefa ${stopped.name} não a encerrou`)
  if (other.stoppedOnPurpose) out.push('a vizinha foi marcada como parada')
  if (other.report === undefined || other.report === 'progress') out.push(`a Tarefa ${other.name} (a vizinha) ficou presa depois do Parar na ${stopped.name}`)
  else if (other.report !== 'ready') out.push(`a Tarefa ${other.name} (a vizinha) terminou com o status "${other.report}" em vez de "ready" depois do Parar na ${stopped.name}`)
  if (other.text.includes('não está disponível')) out.push(`a Tarefa ${other.name} (a vizinha) foi acusada de "motor indisponível" por causa do Parar na ${stopped.name}`)
  if (!other.text.includes(otherMark)) out.push(`a Tarefa ${other.name} (a vizinha) perdeu a resposta DELA depois do Parar na ${stopped.name}`)
  return out
}

describe('P1-02(b) — vereditos do cenário (puros)', () => {
  const ok = (name: 'A' | 'B', mark: string): TaskSeen => ({ name, text: `Segue: ${mark}`, ended: false, report: 'ready', stoppedOnPurpose: false })
  it('cada Tarefa com a marca dela e "ready" passa; a marca da vizinha, a falta da própria, o status errado e a parada de propósito são acusados, cada um sozinho', () => {
    expect(mixProblems(ok('A', MARK_A), ok('B', MARK_B))).toEqual([])
    expect(mixProblems({ ...ok('A', MARK_A), text: `${MARK_A} ${MARK_B}` }, ok('B', MARK_B))).toHaveLength(1)
    expect(mixProblems({ ...ok('A', MARK_A), text: MARK_B }, ok('B', MARK_B))).toHaveLength(2)
    expect(mixProblems(ok('A', MARK_A), { ...ok('B', MARK_B), text: '' })).toHaveLength(1)
    expect(mixProblems(ok('A', MARK_A), { ...ok('B', MARK_B), report: 'blocked' })).toHaveLength(1)
    expect(mixProblems(ok('A', MARK_A), { ...ok('B', MARK_B), text: '', report: undefined, stoppedOnPurpose: true })).toEqual([])
  })
  it('transmitidos: a narração da vizinha e o texto final zerado são acusados; o certo passa', () => {
    expect(streamedProblems(ok('A', MARK_A), ok('B', MARK_B))).toEqual([])
    expect(streamedProblems({ ...ok('A', MARK_A), text: `${MARK_A} Fechando (B6).` }, ok('B', MARK_B))).toHaveLength(1)
    expect(streamedProblems(ok('A', MARK_A), { ...ok('B', MARK_B), text: `${MARK_B} Quase (A3).` })).toHaveLength(1)
    expect(streamedProblems(ok('A', MARK_A), { ...ok('B', MARK_B), text: `${MARK_B} Terminei a minha parte.` })).toHaveLength(1)
  })
  it('Parar: a parada encerra a parada e deixa a vizinha terminar "ready" com a resposta dela; cada falha é acusada', () => {
    const stopped: TaskSeen = { name: 'B', text: '', ended: true, report: undefined, stoppedOnPurpose: true }
    expect(stopProblems(stopped, ok('A', MARK_A), MARK_A)).toEqual([])
    expect(stopProblems({ ...stopped, ended: false }, ok('A', MARK_A), MARK_A)).toHaveLength(1)
    expect(stopProblems(stopped, { ...ok('A', MARK_A), report: undefined }, MARK_A)).toHaveLength(1)
    expect(stopProblems(stopped, { ...ok('A', MARK_A), report: 'blocked' }, MARK_A)).toHaveLength(1)
    expect(stopProblems(stopped, { ...ok('A', MARK_A), text: `${MARK_A} O motor de Bia não está disponível neste computador.`, report: 'blocked' }, MARK_A)).toHaveLength(2)
    expect(stopProblems(stopped, { ...ok('A', MARK_A), text: MARK_B }, MARK_A)).toHaveLength(1)
    expect(stopProblems(stopped, { ...ok('A', MARK_A), stoppedOnPurpose: true }, MARK_A)).toHaveLength(1)
  })
})

const dirs: string[] = []
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

function keepEvidence(name: string, evidence: unknown): void {
  mkdirSync(ARTIFACTS, { recursive: true })
  writeFileSync(join(ARTIFACTS, `p1-02b-${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
}

describe('P1-02(b) — duas Tarefas da mesma persona no mesmo runner quente, uma em fundo e outra na frente (host em processo, runner real, CLI de mentira)', () => {
  let cli: FakeCliPathScope | undefined
  let harness: RemoteTeamHarness | undefined
  beforeEach(() => {
    vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
    vi.stubEnv('PERSONA_REAL_CLI', '1') // the REAL runner path: the shared TextCapture lives there, the scripted runner has none
  })
  afterEach(async () => {
    await harness?.dispose().catch(() => undefined)
    harness = undefined
    cli?.restore()
    cli = undefined
    vi.unstubAllEnvs()
  })

  /**
   * A host whose Bia (claude, the coordination) is warm. The stub WRITES AND CALLS TOOLS DURING each turn (a step every second, 6 steps each, ~7 s): the first tool call of A's turn moves A to the background
   * through the product's own trigger (`afterToolCalls: 1`; the book frees the work chain then), and B's own CLI process (its `:solo` runner) takes seconds to start, so the two turns' streams overlap
   * (with a stub that answers everything at the end of a 4 s turn, A could end before B's turn opened, and a time threshold detached A before its first `deliver`).
   */
  function open(): PersonaHost {
    const dir = mkdtempSync(join(tmpdir(), 'regressao-p102b-'))
    dirs.push(dir)
    cli = withFakeCliOnPath({
      stepMs: 1000,
      rules: [
        { match: ASK_A, reply: `Segue o cartaz azul. ${MARK_A}.`, narration: ['Vou olhar a pasta (A1).', 'Agora o azul (A2).', 'Quase (A3).', 'Outro (A4).', 'Falta pouco (A5).', 'Fechando (A6).'] },
        { match: ASK_B, reply: `Segue o cartaz verde. ${MARK_B}.`, narration: ['Vou olhar a pasta (B1).', 'Agora o verde (B2).', 'Mais um (B3).', 'Outro (B4).', 'Falta pouco (B5).', 'Fechando (B6).'] },
      ],
      needles: [ASK_A, ASK_B],
    })
    harness = openRemoteTeamHarness(join(dir, 'p.db'))
    const h = harness.h
    h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
    h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
    h.createPersona({
      ...SCOPE, id: 'bia', name: 'Bia', title: 'Coordenação', description: 'Coordena.', personality: 'Calma.', instructions: 'Despache.',
      avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
    })
    h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
    // The stub calls a READ tool (Glob) between its words; a text-only persona has tool level "none" and the product refuses it ("Ferramenta Glob recusada no nível none"). A FILE grant only counts inside a
    // Task's draft folder (`toolsForTask`; these Tasks have none), so the grant is a non-file one (`bash: read`), which keeps the CLI tool level at "read" without making the runner a file runner (no `:files` key).
    h.product.updatePersona({ ...h.product.getPersona('bia')!, tools: { bash: 'read' } }, 'pp')
    h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
    h.orchestration.scripted = false
    // Created ONCE per host, before the first run: no time threshold (10 min); the FIRST tool call of a turn moves its Task to the background (the product's 20-tool trigger, lowered to 1).
    backgroundWorkOf(h.orchestration, { afterMs: 600_000, afterToolCalls: 1, nowMs: () => Date.now() })
    return h
  }

  const ask = (h: PersonaHost, id: string, body: string): void => {
    // The composer sends the OPEN subject of the conversation, the same for every message typed in it (a subject per message is not what the app does, and made the Task's own lines land under another subject).
    h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: 'assunto-geral', occurredAt: new Date().toISOString() })
  }
  const ticketOf = (h: PersonaHost, trigger: string) => h.orchestration.runtime('pp').repo.tickets.list().find(item => item.origin.triggerId === trigger)
  const waitFor = async (check: () => boolean, ms: number): Promise<boolean> => {
    for (let waited = 0; waited < ms; waited += 50) {
      if (check()) return true
      await sleep(50)
    }
    return check()
  }

  /** Everything the host keeps of a Task's words: its assignments (reports, summaries) and the lines the persona wrote in #geral for the request that started it. */
  function wordsOf(h: PersonaHost, trigger: string): string {
    const ticket = ticketOf(h, trigger)
    const lines = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
      .filter(event => event.actorId === 'bia' && ticket !== undefined && event.id.includes(ticket.id)).map(event => event.body) // the Task's own lines carry its id (`exec-<id>-…`, `coord-<id>-…`, `background-<id>`), whatever subject they sit under
    return JSON.stringify({ assignments: ticket?.assignments, lines })
  }
  const seenOf = (h: PersonaHost, name: 'A' | 'B', trigger: string, stoppedOnPurpose = false): TaskSeen => ({
    name, text: wordsOf(h, trigger), ended: ticketOf(h, trigger)?.ended !== undefined, report: ticketOf(h, trigger)?.assignments.at(-1)?.report?.state, stoppedOnPurpose,
  })
  const finished = (h: PersonaHost, trigger: string): boolean => {
    const ticket = ticketOf(h, trigger)
    if (ticket === undefined) return false
    // A Task whose turn ended keeps `assignment.state === 'running'` with a final report ('ready', 'waiting', 'blocked'…): the same reading `runningTicketOf` uses for "no turn open".
    const report = ticket.assignments.at(-1)?.report
    return ticket.ended !== undefined || (report !== undefined && report.state !== 'progress')
  }

  /** A goes to the background, then B starts in front on the same warm runner: both turns open at once. */
  async function bothRunning(h: PersonaHost): Promise<{ readonly a: string; readonly b: string }> {
    ask(h, 'u1', `@Bia monte o cartaz azul da promoção, ${ASK_A}`)
    expect(await waitFor(() => ticketOf(h, 'u1') !== undefined, 15_000), 'a Tarefa A não nasceu').toBe(true)
    const a = ticketOf(h, 'u1')!.id
    // A's first tool call (a second into its turn) moves it to the background and frees the work chain, so B is taken at once.
    expect(await waitFor(() => backgroundWorkOf(h.orchestration).isBackground(a), 30_000), 'a Tarefa A não foi para o segundo plano (o gatilho de ferramentas)').toBe(true)
    ask(h, 'u2', `@Bia monte o cartaz verde da promoção, ${ASK_B}`)
    expect(await waitFor(() => ticketOf(h, 'u2') !== undefined, 15_000), 'a Tarefa B não nasceu (a persona devia estar livre com a A no fundo)').toBe(true)
    const b = ticketOf(h, 'u2')!.id
    // B's turn is open on the CLI: its prompt reached the stub while A's is still running
    expect(await waitFor(() => (cli?.invocations() ?? []).some(call => call.event === 'turn' && call.needles?.[ASK_B] === true), 20_000), 'o CLI nunca recebeu o turno da Tarefa B').toBe(true)
    return { a, b }
  }

  it('CONTROLE: a Tarefa A sozinha termina com a resposta DELA (o stub, o runner real e a leitura do texto funcionam)', async () => {
    const h = open()
    ask(h, 'u1', `@Bia monte o cartaz azul da promoção, ${ASK_A}`)
    const done = await waitFor(() => finished(h, 'u1'), 40_000)
    // What the host and the stub say when the Task does not end (written whatever the result, so a failure explains itself).
    keepEvidence('controle', {
      done, ticket: ticketOf(h, 'u1'), background: backgroundWorkOf(h.orchestration).isBackground(ticketOf(h, 'u1')?.id ?? ''),
      errors: (h.orchestration as unknown as { lastErrors?: string[] }).lastErrors ?? [], warm: [...h.orchestration.warmRunners.keys()],
      stub: (cli?.invocations() ?? []).map(call => `${call.event}:${String(call.proc ?? call.pid)}`),
      thread: h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }).events.map(event => `${event.actorId}: ${event.body.slice(0, 100)}`),
    })
    expect(done, 'a Tarefa A não terminou').toBe(true)
    const seen = seenOf(h, 'A', 'u1')
    expect(seen.text, 'a Tarefa A sozinha não devolveu a resposta dela: o cenário não prova nada').toContain(MARK_A)
  }, 120_000)

  it('OBSERVAÇÃO: com a A no fundo a persona fica livre e a B abre o turno dela NO MESMO runner (os dois turnos andam ao mesmo tempo); `runningTicketOf` devolve uma Tarefa rodando', async () => {
    const h = open()
    const { a, b } = await bothRunning(h)
    expect(a).not.toBe(b)
    // Forge's fix (06:53): while ANOTHER Task of the persona is in the background book, the new Task gets a runner of its own (key `pp:bia:task:<ticketId>:solo`); before it, both shared `pp:bia:task`.
    const warm = [...h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:bia:task'))
    keepEvidence('observacao-estado', {
      warm, background: backgroundWorkOf(h.orchestration).ids(), a, b, aFinished: finished(h, 'u1'),
      turns: (cli?.invocations() ?? []).filter(call => call.event === 'turn').map(call => ({ proc: call.proc, needles: call.needles, at: call.at })),
    })
    expect(warm.length, `as duas Tarefas devem ter um runner quente CADA: ${JSON.stringify(warm)}`).toBe(2)
    expect(warm.some(key => key.startsWith(`pp:bia:task:${b}:`) && key.endsWith(':solo')), `o runner da Tarefa B devia ser o :solo dela: ${JSON.stringify(warm)}`).toBe(true)
    const running = h.orchestration.runningTicketOf('pp', 'bia')
    expect([a, b], 'runningTicketOf devia devolver uma das duas Tarefas que rodam').toContain(running?.id)
    await waitFor(() => finished(h, 'u1') && finished(h, 'u2'), 60_000)
    keepEvidence('observacao', { warm, running: running?.id, a: seenOf(h, 'A', 'u1'), b: seenOf(h, 'B', 'u2') })
  }, 180_000)

  // Turnos TRANSMITIDOS (Forge pediu, 07:08): a persona escreve e chama ferramentas DURANTE o turno, nas duas Tarefas ao mesmo tempo (a mistura de resposta/status nunca reproduziu com o stub que responde
  // tudo no FIM do turno; este é o caso que abriria a corrida na captura compartilhada — `tapTurn` zera `last`/`tools`/`report` no começo de CADA turno — e que protege o contador de ferramentas novo,
  // `setRunnerToolSink`, chamado a cada ferramenta do turno de Tarefa).
  it('TRAVA — com texto e ferramentas durante o turno nas duas Tarefas ao mesmo tempo, cada uma termina "ready" com a resposta DELA, sem a narração nem o texto da vizinha', async () => {
    const h = open()
    await bothRunning(h)
    expect(finished(h, 'u1'), 'os turnos não se sobrepuseram: a A já tinha terminado quando o CLI abriu o turno da B (o cenário não prova nada)').toBe(false)
    expect(await waitFor(() => finished(h, 'u1') && finished(h, 'u2'), 60_000), 'as duas Tarefas não terminaram').toBe(true)
    const a = seenOf(h, 'A', 'u1')
    const b = seenOf(h, 'B', 'u2')
    const lines = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => ({ id: event.id, actor: event.actorId, subject: event.subjectId, topic: event.topicId, body: event.body.slice(0, 80) }))
    keepEvidence('transmitido', { a, b, lines })
    expect(streamedProblems(a, b), JSON.stringify({ a: a.text.slice(0, 400), b: b.text.slice(0, 400) })).toEqual([])
  }, 240_000)

  // Os três do Parar eram vermelhos (a vizinha fechava "blocked" com "O motor de Bia não está disponível"): a correção do Forge (runner próprio por Tarefa enquanto há outra em fundo) os põe verdes.
  it('CORRETO — Parar na Tarefa B (da frente): a B para e a A (do fundo) termina "ready" com a resposta dela', async () => {
    const h = open()
    const { b } = await bothRunning(h)
    const stop = await h.stopTurn({ ...SCOPE, personaId: 'bia', ticketId: b })
    expect(stop.stopped, 'o Parar não achou a Tarefa B').toBe('ticket')
    expect(await waitFor(() => finished(h, 'u1'), 40_000), 'a Tarefa A não terminou depois do Parar na B').toBe(true)
    const seenB = seenOf(h, 'B', 'u2', true)
    const seenA = seenOf(h, 'A', 'u1')
    keepEvidence('parar-b', { seenA, seenB })
    expect(stopProblems(seenB, seenA, MARK_A)).toEqual([])
  }, 240_000)

  it('CORRETO — Parar na Tarefa A (do fundo): a A para e a B (da frente) termina "ready" com a resposta dela', async () => {
    const h = open()
    const { a } = await bothRunning(h)
    const stop = await h.stopTurn({ ...SCOPE, personaId: 'bia', ticketId: a })
    expect(stop.stopped, 'o Parar não achou a Tarefa A (a do fundo)').toBe('ticket')
    expect(await waitFor(() => finished(h, 'u2'), 40_000), 'a Tarefa B não terminou depois do Parar na A').toBe(true)
    const seenA = seenOf(h, 'A', 'u1', true)
    const seenB = seenOf(h, 'B', 'u2')
    keepEvidence('parar-a', { seenA, seenB })
    expect(stopProblems(seenA, seenB, MARK_B)).toEqual([])
  }, 240_000)

  it('CORRETO — Parar SEM dizer a Tarefa (o botão da persona): para a que `runningTicketOf` apontou e `runningTicketOf` passa a apontar a OUTRA, que termina "ready" com a resposta dela', async () => {
    const h = open()
    const { a, b } = await bothRunning(h)
    const target = h.orchestration.runningTicketOf('pp', 'bia')!.id
    const other = target === a ? b : a
    const stop = await h.stopTurn({ ...SCOPE, personaId: 'bia' })
    expect(stop.ticketId, 'o Parar sem Tarefa devia parar a que runningTicketOf apontou').toBe(target)
    expect(h.orchestration.runningTicketOf('pp', 'bia')?.id, 'depois do Parar, runningTicketOf devia apontar a OUTRA Tarefa que roda').toBe(other)
    const otherTrigger = other === a ? 'u1' : 'u2'
    expect(await waitFor(() => finished(h, otherTrigger), 40_000), 'a outra Tarefa não terminou').toBe(true)
    const stoppedSeen = seenOf(h, target === a ? 'A' : 'B', target === a ? 'u1' : 'u2', true)
    const otherSeen = seenOf(h, other === a ? 'A' : 'B', otherTrigger)
    keepEvidence('parar-sem-tarefa', { target, other, stoppedSeen, otherSeen })
    expect(stopProblems(stoppedSeen, otherSeen, other === a ? MARK_A : MARK_B)).toEqual([])
  }, 240_000)
})

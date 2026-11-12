/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P1-01: o controlador de fim de turno (`turn-close`, item 3) decide certo no papel e a
 * orquestração não o obedece. Três dos quatro cenários da auditoria, pelo HOST em processo (0 IA, um Claude FALSO que responde o texto que o cenário manda):
 *   A  "perguntou = espera": a persona termina a Tarefa com uma pergunta SEM chamar `persona_ask` → a Tarefa tem de ficar ESPERANDO o dono (`waiting`), não fechar como pronta, nem disparar
 *      revisão, nem liberar a etapa seguinte em cima de uma pergunta sem resposta;
 *   B  `<details>`: a MESMA pergunta, seguida do rodapé técnico que o item 4 exige (`<details>…</details>`) → o `?` não pode ficar invisível: continua esperando;
 *   C  conversa (`finishReply`): a persona responde numa DM "Pronto, já apaguei o arquivo!" sem ter rodado ferramenta nenhuma → a promessa falsa NÃO pode chegar ao fio como veio.
 * (O quarto — uma ferramenta NEGADA pelo gate contando como prova de "Pronto!" — precisa simular eventos de ferramenta do CLI: fica para o cenário pelo web host.)
 *
 * ESTADO (12/11 05:25): CORRIGIDO na árvore. A e B passam com o controlador LIGADO como no app (sob Vitest ele nasce desligado por desenho: o cenário o liga em `open()`), e o C passou
 * quando a fiação do `finishReply` chegou (o `it.fails` acusou "Expect test to fail" e virou teste normal). Os três são regressão permanente, cada um com o teste NORMAL de observação
 * antes (a persona respondeu, a Tarefa/DM existe): um verde por falha de observação não prova nada. O veredito é puro e provado nos dois lados.
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it as vitestIt, onTestFinished } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import type { HostRunnerRequest } from '../../persona-host/src/runner.ts'
import { SCOPE, it, openJourney, say, seedJourney } from '../../persona-host/tests/journeys/journey-host.ts'

const CLOCK = '2026-11-03T15:00:00.000Z'
const QUESTION = 'O cartaz ficou pronto. Você prefere o fundo azul ou o verde?'
const FOLDED = `${QUESTION}\n\n<details><summary>Detalhes</summary>\n\nUsei a paleta do rascunho e o formato 4:5.\n\n</details>`
const FALSE_PROMISE = 'Pronto, já apaguei o arquivo!'

/** What the scenario saw of one Task: how it ended and whether a review was started on it. */
export interface TaskObservation { readonly state: string | undefined; readonly reviews: number }

/** O veredito de A e B, PURO: o fim de turno com pergunta tem de deixar a Tarefa ESPERANDO o dono, sem revisão (vazio = certo). */
export function questionEndProblems(seen: TaskObservation): string[] {
  const out: string[] = []
  if (seen.state !== 'waiting') out.push(`a persona terminou perguntando e a Tarefa ficou "${String(seen.state)}" em vez de "waiting" (esperando o dono)`)
  if (seen.reviews > 0) out.push(`${String(seen.reviews)} revisão(ões) foram disparadas sobre uma pergunta sem resposta`)
  return out
}

/** O veredito de C, PURO: nenhuma linha da persona no fio pode carregar a promessa falsa como veio (vazio = certo). */
export function falsePromiseProblems(personaLines: readonly string[]): string[] {
  return personaLines.filter(text => text.includes(FALSE_PROMISE)).map(text => `a promessa sem ferramenta chegou ao fio: "${text.slice(0, 80)}"`)
}

describe('P1-01 — o fim de turno obedece o controlador (vereditos do cenário, puros)', () => {
  it('A/B: esperando o dono e sem revisão é o certo; "ready", outro estado ou revisão são acusados, cada um sozinho', () => {
    expect(questionEndProblems({ state: 'waiting', reviews: 0 })).toEqual([])
    expect(questionEndProblems({ state: 'ready', reviews: 0 })).toHaveLength(1)
    expect(questionEndProblems({ state: 'waiting', reviews: 1 })).toHaveLength(1)
    expect(questionEndProblems({ state: 'ready', reviews: 2 })).toHaveLength(2)
    expect(questionEndProblems({ state: undefined, reviews: 0 })).toHaveLength(1)
  })
  it('C: a promessa falsa no fio é acusada; uma resposta honesta não', () => {
    expect(falsePromiseProblems(['Posso apagar o arquivo se você quiser.', 'Eu ia dizer que estava pronto, mas nada foi feito de verdade.'])).toEqual([])
    expect(falsePromiseProblems([FALSE_PROMISE])).toHaveLength(1)
  })
})

/** O host com a Guia (coordenação) e a Nina; o Claude FALSO da Nina responde sempre o texto que o cenário pôs em `reply.text`, sem rodar ferramenta nenhuma. */
function open(): { readonly h: PersonaHost; readonly reply: { text: string } } {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.createDm({ id: 'dm-nina', ...SCOPE, participantA: 'ana', participantB: 'nina' })
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  // The end-of-turn controller is ON in the real app and OFF under Vitest by design (`resolveTurnClose`; the in-process suites opt in): the scenario runs the product as the person gets it.
  h.orchestration.turnClose = true
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  const reply = { text: '' }
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (_request?: HostRunnerRequest) => {
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: (sessionId) => {
        said = reply.text
        for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
        return Promise.resolve()
      },
      cancel: () => Promise.resolve(),
      status: () => 'idle',
      whenIdle: () => Promise.resolve(),
      onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
    }
    return Promise.resolve(runner)
  }
  return { h, reply }
}

async function taskEndsWith(text: string): Promise<{ readonly observed: boolean; readonly seen: TaskObservation }> {
  const { h, reply } = open()
  reply.text = text
  say(h, 'u1', '@Nina monte o cartaz da promoção do pão de queijo')
  await h.orchestration.flush('pp')
  const rt = h.orchestration.runtime('pp')
  const ticket = rt.repo.tickets.list().find(item => item.execution?.name === 'Nina')
  const state = ticket?.assignments.at(-1)?.report?.state
  const reviews = rt.repo.tickets.list().filter(item => /^Revisar:/u.test(item.title)).length
  return { observed: ticket !== undefined && state !== undefined, seen: { state, reviews } }
}

describe('P1-01 A — perguntou = espera: a Tarefa que termina perguntando fica esperando o dono (cenário pelo host, 0 IA)', () => {
  let seen: TaskObservation | undefined
  it('OBSERVAÇÃO: a Nina recebeu a Tarefa, respondeu com a pergunta e a Tarefa fechou o turno com um estado', async () => {
    const got = await taskEndsWith(QUESTION)
    expect(got.observed, `a Tarefa não terminou o turno com um estado: ${JSON.stringify(got.seen)}`).toBe(true)
    seen = got.seen
  })
  // A: com o controlador LIGADO como no app (Bolt 12/11 05:07) a Tarefa que termina perguntando já fica "waiting": teste NORMAL, regressão permanente.
  vitestIt('CORRETO (P1-01 A, controlador ligado como no app): a Tarefa fica "waiting" e nenhuma revisão é disparada', () => {
    expect(questionEndProblems(seen!), JSON.stringify(seen)).toEqual([])
  })
})

describe('P1-01 B — a pergunta seguida de <details> continua sendo pergunta (cenário pelo host, 0 IA)', () => {
  let seen: TaskObservation | undefined
  it('OBSERVAÇÃO: a Nina respondeu com a pergunta + o rodapé técnico dobrado e a Tarefa fechou o turno com um estado', async () => {
    const got = await taskEndsWith(FOLDED)
    expect(got.observed, `a Tarefa não terminou o turno com um estado: ${JSON.stringify(got.seen)}`).toBe(true)
    seen = got.seen
  })
  // B: idem (o "?" antes do <details> não fica invisível): teste NORMAL.
  vitestIt('CORRETO (P1-01 B, controlador ligado como no app): o "?" antes do <details> não fica invisível: a Tarefa fica "waiting"', () => {
    expect(questionEndProblems(seen!), JSON.stringify(seen)).toEqual([])
  })
})

describe('P1-01 C — na conversa (DM) a promessa sem ferramenta não chega ao fio como veio (cenário pelo host, 0 IA)', () => {
  let personaLines: string[] = []
  it('OBSERVAÇÃO: a pessoa escreve na DM, a Nina responde e há uma linha dela no fio', async () => {
    const { h, reply } = open()
    reply.text = FALSE_PROMISE
    h.postMessage({ id: 'd1', ...SCOPE, streamKind: 'dm', ownerId: 'dm-nina', body: 'Nina, apague o arquivo velho do cardápio, por favor.', actorId: 'ana', subjectId: 'd1', occurredAt: CLOCK })
    await h.orchestration.flush('pp')
    const got = h.listMessages({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-nina', actorId: 'ana', afterSeq: 0, limit: 50 })
    personaLines = got.events.filter(event => event.actorId === 'nina' && event.body.trim() !== '').map(event => event.body)
    expect(personaLines.length, `a Nina não respondeu na DM: ${JSON.stringify(got.events.map(event => `${event.actorId}: ${event.body.slice(0, 50)}`))}`).toBeGreaterThan(0)
  })
  // C: corrigido (a fiação do `finishReply` passa a conversa pelo controlador): teste NORMAL, regressão permanente.
  vitestIt('CORRETO (P1-01 C, corrigido): "Pronto, já apaguei o arquivo!" sem ferramenta é corrigido ou trocado por uma fala honesta antes de chegar ao fio', () => {
    expect(falsePromiseProblems(personaLines), JSON.stringify(personaLines)).toEqual([])
  })
})

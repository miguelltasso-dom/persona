/**
 * V1-P0-5 / D-069 — prova INDEPENDENTE do guardião do orçamento da execução real (`src/real-run-budget.ts`, Probe) e do seu acordo com o
 * verificador do Forge. Sem navegador, sem app, sem CLI, sem IA: gasta zero e cabe no gate.
 *
 * A pergunta que esta suíte responde: "se o guardião LIBERA gastar mais um turno pago, o verificador consegue ACEITAR essa rodada?".
 * Se a resposta for não, o turno pago seria desperdiçado de antemão. Também fixa o fail-closed: um histórico de tentativas adulterado
 * (negativo, fracionário, texto, ausente, forma errada) nunca reabre saldo.
 * A regra "diagnóstico antes da 2ª tentativa" (`PERSONA_REAL_E2E_DIAGNOSED`) é do spec gated do Probe e não é coberta aqui.
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { FIRST_DELIVERY_REAL_ATTEMPT_CAP, FIRST_DELIVERY_REAL_TURN_CAP, verifyRealFirstDeliveryRun } from '../../persona-engine/src/index.ts'
import {
  REAL_RUN_MAX_ATTEMPTS,
  REAL_RUN_MAX_PAID_TURNS,
  assessAttempts,
  attemptsForVerifier,
  chargedTurns,
  refusalsForNextAttempt,
  spentTurns,
  type BudgetAttempt,
} from '../src/real-run-budget.ts'

const row = (patch: Partial<BudgetAttempt> = {}): BudgetAttempt => ({
  at: '2026-11-04T12:00:00.000Z', nsisCommit: 'candidate', sha256: 'a'.repeat(64), outcome: 'FAILED', paidTurns: 1, capTurns: 1, ...patch,
})

describe('os tetos do guardião são os da autorização do Atlas (D-069) e os mesmos do verificador', () => {
  it('3 turnos pagos e 3 tentativas, iguais nos dois lados', () => {
    expect(REAL_RUN_MAX_PAID_TURNS).toBe(3)
    expect(REAL_RUN_MAX_ATTEMPTS).toBe(3)
    expect(REAL_RUN_MAX_PAID_TURNS).toBe(FIRST_DELIVERY_REAL_TURN_CAP)
    expect(REAL_RUN_MAX_ATTEMPTS).toBe(FIRST_DELIVERY_REAL_ATTEMPT_CAP)
  })
})

describe('assessAttempts — falha fechada: nada adulterado reabre saldo', () => {
  it.each([
    ['paidTurns negativo (edição à mão)', { ...row(), paidTurns: -5 }],
    ['paidTurns fracionário', { ...row(), paidTurns: 0.5 }],
    ['paidTurns em texto', { ...row(), paidTurns: '1' }],
    ['paidTurns NaN', { ...row(), paidTurns: Number.NaN }],
    ['paidTurns Infinity', { ...row(), paidTurns: Number.POSITIVE_INFINITY }],
    ['paidTurns inseguro (> MAX_SAFE_INTEGER)', { ...row(), paidTurns: Number.MAX_SAFE_INTEGER + 2 }],
    ['paidTurns ausente', { at: 'x', sha256: 'y', outcome: 'FAILED', nsisCommit: null }],
    ['paidTurns undefined explícito', { ...row(), paidTurns: undefined }],
    ['capTurns negativo', { ...row(), capTurns: -1 }],
    ['capTurns NaN', { ...row(), capTurns: Number.NaN }],
    ['capTurns Infinity', { ...row(), capTurns: Number.POSITIVE_INFINITY }],
    ['capTurns em texto', { ...row(), capTurns: '0' }],
    ['outcome vazio', { ...row(), outcome: '' }],
    ['outcome que não é texto', { ...row(), outcome: 1 }],
    ['sha256 ausente', { ...row(), sha256: undefined }],
    ['at ausente', { ...row(), at: undefined }],
    ['nsisCommit que não é texto', { ...row(), nsisCommit: 7 }],
    ['linha null', null],
    ['linha que é lista', []],
    ['linha que é texto', 'attempt'],
    ['linha que é número', 3],
  ])('%s → problema e NENHUMA tentativa devolvida', (_label, bad) => {
    const assessed = assessAttempts([row(), bad, row()])
    expect(assessed.problems.length).toBeGreaterThan(0)
    expect(assessed.attempts, 'um histórico não confiável não devolve nenhuma linha').toEqual([])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['objeto', { attempts: [] }],
    ['texto JSON quebrado', '[{"at"'],
    ['número', 3],
  ])('um histórico que não é lista (%s) é problema, nunca "nenhuma tentativa"', (_label, raw) => {
    const assessed = assessAttempts(raw)
    expect(assessed.problems).toEqual(['the attempt history is not a list'])
    expect(assessed.attempts).toEqual([])
  })

  it('aceita histórico vazio, contagens desconhecidas (null) e capTurns ausente; não muda a entrada', () => {
    const raw = [row(), row({ paidTurns: null, capTurns: null }), { ...row(), capTurns: undefined }, row({ outcome: 'started', paidTurns: null })]
    const before = structuredClone(raw)
    expect(assessAttempts([])).toEqual({ attempts: [], problems: [] })
    const assessed = assessAttempts(raw)
    expect(assessed.problems).toEqual([])
    expect(assessed.attempts).toHaveLength(4)
    expect(raw).toEqual(before)
  })

  it('o resumo dos problemas não repete nenhum caminho nem o conteúdo bruto além do valor inválido', () => {
    const assessed = assessAttempts([{ ...row(), paidTurns: 'C:\\Users\\segredo' }])
    expect(assessed.problems.join(' ')).toMatch(/paidTurns/u)
  })
})

describe('chargedTurns / spentTurns — o que cada tentativa custa', () => {
  it.each([
    [{ paidTurns: 0, capTurns: 0 }, 0],
    [{ paidTurns: 1, capTurns: 0 }, 1],
    [{ paidTurns: 0, capTurns: 1 }, 1], // o limitador contou um turno que o ledger nunca registrou
    [{ paidTurns: 1, capTurns: 1 }, 1],
    [{ paidTurns: 2, capTurns: 1 }, 2],
    [{ paidTurns: 1, capTurns: 2 }, 2],
    [{ paidTurns: null, capTurns: null }, 1], // ledger e limitador ilegíveis: pode ter gasto
    [{ paidTurns: null }, 1],
    [{ paidTurns: null, capTurns: 2 }, 2],
  ] as const)('%j custa %i', (attempt, charged) => {
    expect(chargedTurns(attempt)).toBe(charged)
  })

  it('soma todas as tentativas, inclusive as que falharam', () => {
    expect(spentTurns([])).toBe(0)
    expect(spentTurns([row(), row({ paidTurns: null, capTurns: null }), row({ paidTurns: 0, capTurns: 1 })])).toBe(3)
  })
})

describe('refusalsForNextAttempt — quando NÃO se pode gastar mais um turno pago', () => {
  it('libera a 1ª, a 2ª e a 3ª tentativa quando cada anterior gastou 1 turno', () => {
    expect(refusalsForNextAttempt([], 1)).toEqual([])
    expect(refusalsForNextAttempt([row()], 1)).toEqual([])
    expect(refusalsForNextAttempt([row(), row()], 1)).toEqual([])
  })

  it('recusa a 4ª tentativa, mesmo que as três anteriores tenham gasto zero turno', () => {
    const zero = row({ paidTurns: 0, capTurns: 0 })
    expect(refusalsForNextAttempt([zero, zero, zero], 1).join(' ')).toMatch(/3 attempts already used/u)
  })

  it('recusa quando 3 turnos já foram cobrados, em qualquer distribuição', () => {
    for (const history of [
      [row({ paidTurns: 3, capTurns: 3 })],
      [row({ paidTurns: 2, capTurns: 2 }), row()],
      [row(), row(), row()],
      [row({ paidTurns: null, capTurns: null }), row({ paidTurns: null, capTurns: null }), row({ paidTurns: null, capTurns: null })],
    ]) {
      expect(refusalsForNextAttempt(history, 1).length, JSON.stringify(history.map(chargedTurns))).toBeGreaterThan(0)
    }
  })

  it('para na 1ª verde: depois de "delivered" nenhuma tentativa nova', () => {
    expect(refusalsForNextAttempt([row({ outcome: 'delivered' })], 1).join(' ')).toMatch(/first green/u)
    expect(refusalsForNextAttempt([row({ outcome: 'FAILED' }), row({ outcome: 'delivered' })], 1).join(' ')).toMatch(/first green/u)
  })

  it('uma tentativa que acabou sem entregar (UNVERIFIED/OVERBUDGET/started) NÃO conta como verde', () => {
    for (const outcome of ['UNVERIFIED', 'OVERBUDGET', 'FAILED', 'started', 'timeout']) {
      expect(refusalsForNextAttempt([row({ outcome })], 1).join(' '), outcome).not.toMatch(/first green/u)
    }
  })

  it('várias recusas se acumulam, nenhuma é escondida: 3 tentativas, verde anterior, total e tentativa que cobrou mais de 1 turno', () => {
    const refusals = refusalsForNextAttempt([row({ outcome: 'delivered', paidTurns: 3, capTurns: 3 }), row(), row()], 1)
    expect(refusals.length).toBe(4)
    expect(refusals.join(' | ')).toMatch(/3 attempts already used/u)
    expect(refusals.join(' | ')).toMatch(/first green/u)
    expect(refusals.join(' | ')).toMatch(/-turn total/u)
    expect(refusals.join(' | ')).toMatch(/attempt 1 was charged 3 paid turns \(max 1 per attempt\)/u)
  })

  it.each([
    ['2 turnos no ledger', { paidTurns: 2, capTurns: 0 }],
    ['2 turnos só no limitador (ledger 0 linhas)', { paidTurns: 0, capTurns: 2 }],
    ['3 turnos', { paidTurns: 3, capTurns: 3 }],
  ])('uma tentativa anterior cobrada acima de 1 turno (%s) bloqueia as seguintes, em qualquer posição do histórico', (_label, overspent) => {
    const bad = row(overspent)
    for (const history of [[bad], [row(), bad], [bad, row()]]) {
      expect(refusalsForNextAttempt(history, 1).join(' '), JSON.stringify(history.map(chargedTurns))).toMatch(/max 1 per attempt/u)
    }
  })
})

describe('guardião × verificador — o que o guardião libera, o verificador consegue aceitar?', () => {
  const CURRENT_TICKET = 'ticket-first-delivery'
  const entry: TurnLedgerEntry = {
    id: 'turn-1', personaId: 'persona-bento', engine: 'claude', kind: 'execution', inputTokens: 900, outputTokens: 60,
    cacheReadTokens: 0, cacheWriteTokens: 0, layers: EMPTY_LAYERS, at: '2026-11-04T12:00:07.000Z', ticketId: CURRENT_TICKET, origin: 'measured',
  }
  const observation = {
    askId: 'ask-1', ticket: { id: CURRENT_TICKET, triggerId: 'ask-1', stage: 'done' }, loggedCli: ['claude'],
    delivery: { ticketId: CURRENT_TICKET, streamKind: 'channel', ownerId: 'geral', source: 'runner', body: 'Pronto.' },
    milestone: { status: 'ready', ticketId: CURRENT_TICKET, feedEventId: 'feed-1' }, milestoneEventIds: ['feed-1'],
    elapsedMs: 40_000, maxElapsedMs: 120_000, maxCalls: 1,
  }

  /** The next attempt does exactly one measured execution and the harness books it as the harness does (ledger 1, limiter 1). */
  const verdictAfter = (prior: readonly BudgetAttempt[]): ReturnType<typeof verifyRealFirstDeliveryRun> => {
    const history = [...prior, row({ outcome: 'delivered', paidTurns: 1, capTurns: 1 })]
    return verifyRealFirstDeliveryRun({ observation, ledger: [entry], attempts: attemptsForVerifier(history), currentAttempt: history.length })
  }

  const PAID = [null, 0, 1, 2] as const
  const CAP = [undefined, null, 0, 1, 2] as const
  const rowsToTry: BudgetAttempt[] = []
  for (const paidTurns of PAID) {
    for (const capTurns of CAP) {
      const { capTurns: _dropped, ...withoutCap } = row({ outcome: 'FAILED', paidTurns })
      rowsToTry.push(capTurns === undefined ? withoutCap : { ...withoutCap, capTurns })
    }
  }
  const histories: BudgetAttempt[][] = [[]]
  for (const first of rowsToTry) {
    histories.push([first])
    for (const second of rowsToTry) histories.push([first, second])
  }

  it(`o verificador vê EXATAMENTE o que o guardião cobra: soma igual em ${String(histories.length)} históricos`, () => {
    for (const history of histories) {
      const seen = attemptsForVerifier(history)
      expect(seen.reduce((total, attempt) => total + attempt.paidTurns, 0), JSON.stringify(history.map(chargedTurns))).toBe(spentTurns(history))
      expect(seen.every(attempt => Number.isSafeInteger(attempt.paidTurns) && attempt.paidTurns >= 0)).toBe(true)
    }
  })

  it('nunca há um verde que o guardião teria recusado: se o verificador aceita a rodada, o guardião a liberou', () => {
    for (const history of histories) {
      if (verdictAfter(history).passed) {
        expect(refusalsForNextAttempt(history, 1), `verde aceito depois de ${JSON.stringify(history.map(chargedTurns))}`).toEqual([])
      }
    }
  })

  it('um histórico de tentativas de 1 turno, ilegíveis ou com limitador a mais fecha verde na 2ª e na 3ª tentativa', () => {
    expect(verdictAfter([row({ paidTurns: null, capTurns: null })]).passed, 'ledger ilegível = 1 turno, não histórico corrompido').toBe(true)
    expect(verdictAfter([row({ paidTurns: 0, capTurns: 1 })]).passed, 'limitador 1 com ledger 0 = 1 turno').toBe(true)
    expect(verdictAfter([row(), row({ paidTurns: null, capTurns: null })]).passed, '3ª tentativa, total 3').toBe(true)
  })

  it('[D-069] o guardião NÃO libera uma tentativa nova depois de uma que gastou 2 turnos: o verificador (≤ 1 turno por tentativa) nunca aceitaria essa rodada e o turno pago seria desperdiçado de antemão', () => {
    const overspent = [row({ paidTurns: 2, capTurns: 2 })]
    expect(refusalsForNextAttempt(overspent, 1).length, 'o guardião precisa recusar').toBeGreaterThan(0)
    expect(verdictAfter(overspent).passed).toBe(false)
  })

  it(`o que o guardião LIBERA o verificador consegue ACEITAR: nenhum dos ${String(histories.length)} históricos libera uma rodada que reprova de antemão`, () => {
    const wasted = histories.filter(history => refusalsForNextAttempt(history, 1).length === 0 && !verdictAfter(history).passed)
      .map(history => history.map(chargedTurns).join('+'))
    expect(wasted, 'históricos em que o guardião libera mas o verificador nunca aceita').toEqual([])
  })

  it('o motivo é o teto por tentativa do verificador, não o total: 2 turnos antes + 1 agora = 3 (dentro do total) mas reprova por tentativa', () => {
    const result = verdictAfter([row({ paidTurns: 2, capTurns: 2 })])
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(['attempt-turn-budget'])
    expect(result.paidTurnsTotal).toBe(3)
  })

  it('toda 4ª tentativa e todo total acima de 3 são recusados pelo guardião E reprovados pelo verificador', () => {
    for (const history of histories) {
      const refusals = refusalsForNextAttempt(history, 1)
      const verdict = verdictAfter(history)
      if (history.length >= REAL_RUN_MAX_ATTEMPTS || spentTurns(history) + 1 > REAL_RUN_MAX_PAID_TURNS) {
        expect(refusals.length, 'guardião').toBeGreaterThan(0)
        expect(verdict.passed, `verificador depois de ${JSON.stringify(history.map(chargedTurns))}`).toBe(false)
      }
    }
  })
})

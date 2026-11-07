/**
 * TEAM-10, the reading of the real team round for the person (Atlas, 05/11: "mede o custo e a cota da rodada real da equipe e escreve a leitura para o Miguel em tokens e cota", D-092).
 * Pure: it takes the turns the ledger booked (the host's `turn_ledger`, read by the Probe's evidence reader), the official quota read BEFORE and AFTER, the dry budget written before the
 * round (`reports/team10-budget-dry.json`) and, when the account has one, the calibration of the window (tokens per point). It says what the round cost in TOKENS and in the share of the
 * subscription's WINDOW, and whether that is inside the budget registered before the data. It never writes a dollar sign (D-092): a subscription account does not see money.
 *
 * What it does NOT do: it does not decide whether the round was good (that is the Probe's verdict), and it does not invent a share of the window the meter cannot show: the vendor's
 * percentage moves in whole points, so a round that spends less than one point reads "menos de 1 ponto", and only a calibrated account gets a range of points.
 */

/** One model turn as the ledger booked it (only the counters; no text, no names). */
export interface Team10Turn {
  readonly kind: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** `measured` (the vendor reported it) or `estimate`; anything else counts as an estimate. */
  readonly origin: string | null
  /** D-085: `native` | `answer-only` | `needed`; `null` = the runner did not say. */
  readonly envMode: string | null
  /** D-096: why the call ran in `envMode` when it differs from what was asked (`connector-unreached`…); `null` when unknown or not applicable. */
  readonly envModeReason?: string | null
}

/**
 * The input of one turn as a TOTAL. The ledger books `inputTokens` as the TOTAL input and the cache read and written are PARTS of it (the OAR adapter reports it that way; measured: 16 180 =
 * 11 046 read + 5 130 written + 4 uncached, and 5 246 = 2 319 + 2 925 + 2): adding the cache again counts it twice (the first TEAM-10 reading did, and said 20 784 for a round that took 10 394).
 * A total is never below its own cached part; if it is, the row comes from a source that books the uncached input alone and the cache counters are added. The same guard as `pair-real.ts`
 * (`inputOf`) and the Probe's `ledger-evidence.ts`.
 * @param turn - One ledger row (counters only).
 * @returns The input of the call, the cache counted once.
 */
export function turnInputTotal(turn: Pick<Team10Turn, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number {
  const cached = turn.cacheReadTokens + turn.cacheWriteTokens
  return turn.inputTokens >= cached ? turn.inputTokens : turn.inputTokens + cached
}

export interface Team10QuotaWindow {
  readonly id: string
  readonly usedPercent?: number
}

/** An official quota reading (`quota-read.ts`). */
export interface Team10Quota {
  readonly at: string
  readonly windows: readonly Team10QuotaWindow[]
}

/** The budget registered BEFORE the round (the dry estimate): the band of the round's total input and the number of turns it assumed. */
export interface Team10Budget {
  readonly turns: number
  readonly totalInputMin: number
  readonly totalInputMax: number
  /** The point estimate inside the band (the dry report's "esperado"). */
  readonly expectedInput?: number
}

/** Tokens it takes to move the vendor's meter by ONE point, from the person's own readings (the engine's `QuotaCalibration`, structurally). */
export interface Team10Calibration {
  readonly window: string
  readonly tokensPerPoint: { readonly min: number; readonly max: number }
}

export interface Team10ReadingInput {
  readonly turns: readonly Team10Turn[]
  readonly before?: Team10Quota
  readonly after?: Team10Quota
  readonly budget?: Team10Budget
  readonly calibrations?: readonly Team10Calibration[]
  /** `subscription` (default) shows the window; `api` and `unknown` show tokens only. */
  readonly billing?: 'subscription' | 'api' | 'unknown'
}

export type Team10BudgetVerdict = 'within' | 'above' | 'below' | 'unknown'

export interface Team10WindowReading {
  readonly window: 'week' | '5h'
  readonly before: number | null
  readonly after: number | null
  /** Points the official meter moved; `null` when either reading is missing. */
  readonly delta: number | null
  /** Points the round is worth on this account's calibration (a range), when it has one. */
  readonly calibratedPoints?: { readonly min: number; readonly max: number }
}

export interface Team10Reading {
  readonly turns: number
  /** Everything the round put into the model's context: the TOTAL input of each call (the cache read and written are parts of it, see `turnInputTotal`). This is what the budget band reads. */
  readonly inputTotal: number
  readonly outputTokens: number
  /** Total input + output: what the ledger spent, the same sum the calibration pairs read. */
  readonly tokens: number
  readonly largestTurnInput: number
  readonly perKind: Readonly<Record<string, { readonly turns: number; readonly tokens: number }>>
  readonly envModes: Readonly<Record<string, number>>
  /** Turns that ran `native` WITHOUT the legitimate reason (D-096 `connector-unreached`): the round's own alarm. */
  readonly nativeUnexplained: number
  /** Turns that ran `native` because a granted connector was not reached (D-096): allowed, and said. */
  readonly nativeForConnector: number
  readonly estimated: number
  readonly budget: { readonly verdict: Team10BudgetVerdict; readonly min?: number; readonly max?: number; readonly expected?: number }
  readonly windows: readonly Team10WindowReading[]
  /** The reading for the person, pt-BR, tokens and quota, no money. */
  readonly text: string
}

const NATIVE_OK_REASON = 'connector-unreached'

/** 1234567 -> "1.234.567" (the grouping the product uses; no locale lookup, so a test is not at the mercy of the host's ICU). */
export function groupThousands(value: number): string {
  const whole = Math.round(value)
  return String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/gu, '.').replace(/^/u, whole < 0 ? '-' : '')
}

/** "118 mil" for thousands, the exact number below 1 000; a million or more as "1,2 milhão". */
export function approxTokens(value: number): string {
  const n = Math.round(value)
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${groupThousands(Math.round(n / 1000))} mil`
  const millions = Math.round(n / 100_000) / 10
  return `${String(millions).replace('.', ',')} ${millions >= 2 ? 'milhões' : 'milhão'}`
}

function windowOf(quota: Team10Quota | undefined, id: 'week' | '5h'): number | null {
  const found = quota?.windows.find(row => row.id === id)
  return typeof found?.usedPercent === 'number' && Number.isFinite(found.usedPercent) ? found.usedPercent : null
}

function verdictOf(input: number, budget: Team10Budget | undefined): Team10BudgetVerdict {
  if (budget === undefined) return 'unknown'
  if (input > budget.totalInputMax) return 'above'
  if (input < budget.totalInputMin) return 'below'
  return 'within'
}

const pointsText = (value: number): string => String(Math.round(value * 10) / 10).replace('.', ',')

function windowSentence(row: Team10WindowReading, label: string): string | undefined {
  if (row.before === null || row.after === null) return undefined
  const moved = row.delta ?? 0
  const read = `${label}: ${String(row.before)}% antes, ${String(row.after)}% depois`
  if (row.calibratedPoints !== undefined) {
    const { min, max } = row.calibratedPoints
    return `${read}; pela calibração desta conta a rodada vale cerca de ${pointsText(min)} a ${pointsText(max)} ponto${max > 1 ? 's' : ''}.`
  }
  if (moved === 0) return `${read}: o medidor oficial não se mexeu (menos de 1 ponto).`
  return `${read}: ${String(moved)} ponto${Math.abs(moved) === 1 ? '' : 's'} no medidor oficial (outros usos da conta no mesmo intervalo também contam).`
}

/**
 * Read a real team round for the person: tokens, the share of the window, and whether it fits the budget registered before.
 * @param input - The ledger turns of the round, the official quota before/after, the dry budget and the calibration (each optional).
 */
export function team10Reading(input: Team10ReadingInput): Team10Reading {
  const turns = input.turns
  const sum = (pick: (turn: Team10Turn) => number): number => turns.reduce((total, turn) => total + pick(turn), 0)
  const inputTotal = sum(turnInputTotal)
  const outputTokens = sum(turn => turn.outputTokens)
  const tokens = inputTotal + outputTokens
  const largestTurnInput = turns.reduce((top, turn) => Math.max(top, turnInputTotal(turn)), 0)
  const perKind: Record<string, { turns: number; tokens: number }> = {}
  const envModes: Record<string, number> = {}
  let nativeUnexplained = 0
  let nativeForConnector = 0
  for (const turn of turns) {
    const cost = turnInputTotal(turn) + turn.outputTokens
    const bucket = perKind[turn.kind] ?? { turns: 0, tokens: 0 }
    perKind[turn.kind] = { turns: bucket.turns + 1, tokens: bucket.tokens + cost }
    const mode = turn.envMode ?? 'desconhecido'
    envModes[mode] = (envModes[mode] ?? 0) + 1
    if (turn.envMode === 'native') {
      if (turn.envModeReason === NATIVE_OK_REASON) nativeForConnector += 1
      else nativeUnexplained += 1
    }
  }
  const estimated = turns.filter(turn => turn.origin !== 'measured').length
  const verdict = verdictOf(inputTotal, input.budget)
  const billing = input.billing ?? 'subscription'

  const windows: Team10WindowReading[] = billing === 'subscription'
    ? (['week', '5h'] as const).flatMap((window): Team10WindowReading[] => {
      const before = windowOf(input.before, window)
      const after = windowOf(input.after, window)
      if (before === null && after === null) return []
      const calibration = input.calibrations?.find(row => row.window === window)
      const calibratedPoints = calibration === undefined || calibration.tokensPerPoint.min <= 0 || calibration.tokensPerPoint.max <= 0
        ? undefined
        : { min: tokens / calibration.tokensPerPoint.max, max: tokens / calibration.tokensPerPoint.min }
      return [{ window, before, after, delta: before === null || after === null ? null : after - before, ...(calibratedPoints === undefined ? {} : { calibratedPoints }) }]
    })
    : []

  const sentences: string[] = []
  sentences.push(turns.length === 0
    ? 'A rodada não registrou nenhuma chamada ao modelo.'
    : `A rodada da equipe fez ${String(turns.length)} chamada${turns.length === 1 ? '' : 's'} ao modelo e colocou cerca de ${approxTokens(inputTotal)} tokens de entrada (a maior chamada: ${approxTokens(largestTurnInput)}) e ${approxTokens(outputTokens)} de saída.`)
  if (turns.length > 0 && input.budget !== undefined) {
    const band = `${approxTokens(input.budget.totalInputMin)} a ${approxTokens(input.budget.totalInputMax)}`
    sentences.push(verdict === 'within'
      ? `Isso ficou dentro do que previmos antes (${band}${input.budget.expectedInput === undefined ? '' : `, esperado ${approxTokens(input.budget.expectedInput)}`}).`
      : verdict === 'above'
        ? `Isso passou do que previmos antes (${band}).`
        : `Isso ficou abaixo do que previmos antes (${band}).`)
  }
  if (nativeUnexplained > 0) sentences.push(`Atenção: ${String(nativeUnexplained)} chamada${nativeUnexplained === 1 ? '' : 's'} ${nativeUnexplained === 1 ? 'rodou' : 'rodaram'} no modo nativo, que carrega todas as suas ferramentas e custa bem mais.`)
  else if (nativeForConnector > 0) sentences.push(`${String(nativeForConnector)} chamada${nativeForConnector === 1 ? '' : 's'} ${nativeForConnector === 1 ? 'rodou' : 'rodaram'} no modo completo porque um conector concedido não foi alcançado (uma vez por tarefa, como combinado).`)
  for (const row of windows) {
    const said = windowSentence(row, row.window === 'week' ? 'Cota da semana' : 'Cota das 5 horas')
    if (said !== undefined) sentences.push(said)
  }
  if (estimated > 0) sentences.push(`${String(estimated)} chamada${estimated === 1 ? '' : 's'} sem número do fornecedor entraram como estimativa.`)
  return {
    turns: turns.length, inputTotal, outputTokens, tokens, largestTurnInput, perKind, envModes, nativeUnexplained, nativeForConnector, estimated,
    budget: { verdict, ...(input.budget === undefined ? {} : { min: input.budget.totalInputMin, max: input.budget.totalInputMax, ...(input.budget.expectedInput === undefined ? {} : { expected: input.budget.expectedInput }) }) },
    windows, text: sentences.join(' '),
  }
}

/**
 * The technical report of the reading (for the team, not for the person): every number the sentence rounded, the kinds and the modes. Tokens only; no money.
 * @param reading - The result of {@link team10Reading}.
 */
export function renderTeam10Technical(reading: Team10Reading): string {
  const rows = Object.entries(reading.perKind).sort(([a], [b]) => a.localeCompare(b)).map(([kind, row]) => `| ${kind} | ${String(row.turns)} | ${groupThousands(row.tokens)} |`)
  const modes = Object.entries(reading.envModes).sort(([a], [b]) => a.localeCompare(b)).map(([mode, count]) => `${mode} ${String(count)}`).join(', ')
  const windows = reading.windows.map(row => `- ${row.window}: ${row.before === null ? '?' : String(row.before)}% → ${row.after === null ? '?' : String(row.after)}%${row.delta === null ? '' : ` (${row.delta >= 0 ? '+' : ''}${String(row.delta)})`}${row.calibratedPoints === undefined ? '' : `; calibrada: ${pointsText(row.calibratedPoints.min)}–${pointsText(row.calibratedPoints.max)} ponto(s)`}`)
  return [
    '# TEAM-10 — leitura de custo e cota da rodada real',
    '',
    `**Leitura para a pessoa:** ${reading.text}`,
    '',
    `Chamadas: ${String(reading.turns)} · entrada total ${groupThousands(reading.inputTotal)} (o cache lido e o gravado são parte dela) · saída ${groupThousands(reading.outputTokens)} · soma ${groupThousands(reading.tokens)} · maior entrada de uma chamada ${groupThousands(reading.largestTurnInput)}.`,
    `Orçamento a seco: ${reading.budget.verdict}${reading.budget.min === undefined ? '' : ` (faixa ${groupThousands(reading.budget.min)}–${groupThousands(reading.budget.max ?? 0)}${reading.budget.expected === undefined ? '' : `, esperado ${groupThousands(reading.budget.expected)}`})`}.`,
    `Modos: ${modes === '' ? '—' : modes}; nativo sem motivo: ${String(reading.nativeUnexplained)}; nativo por conector não alcançado: ${String(reading.nativeForConnector)}; estimadas: ${String(reading.estimated)}.`,
    '',
    '| tipo | chamadas | tokens |',
    '|---|---|---|',
    ...rows,
    '',
    ...(windows.length === 0 ? ['Cota: sem leitura oficial antes/depois.'] : ['Cota (leitura oficial):', ...windows]),
    '',
  ].join('\n')
}

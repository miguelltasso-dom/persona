/**
 * V1-P0-5 / D-069 — prova INDEPENDENTE do verificador puro da execução real (`verifyRealFirstDeliveryRun`, Forge) ligado ao que o harness
 * do Probe realmente entrega: linhas SQL de `turn_ledger` (esquema real da migração V18, com os CHECK) → `readLedgerEvidence` →
 * `canonicalLedgerRows` → verificador. Sem navegador, sem app, sem CLI, sem IA: gasta zero e cabe no gate.
 *
 * O que esta suíte garante, do ponto de vista de quem NÃO confia no veredito verde:
 *   - o único caminho para `passed: true` é exatamente 1 `execution` medida, ligada ao Ticket do pedido, com saída > 0 e < 120 s,
 *     entrega no #geral vinda do runner, cartão em `done` e 1 marco;
 *   - a tela dizer "entregue" sem ledger (ou com ledger vazio/estimado/de outro Ticket) NUNCA fecha: o resultado conta pelo ledger;
 *   - qualquer turno a mais (triage/reply/initiative/…) reprova e continua contado, nunca some;
 *   - histórico de tentativas ilegível/ausente/null reprova (falha fechada), e o total ≤ 3 turnos / ≤ 3 tentativas vale contando todas;
 *   - nada de payload ou caminho no veredito (só contagens e códigos).
 * Obs.: "prova anterior verde" e "diagnóstico antes da 2ª tentativa" são regras do guardião do harness (spec do Probe), não do verificador.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FIRST_DELIVERY_REAL_ATTEMPT_CAP,
  FIRST_DELIVERY_REAL_TURN_CAP,
  verifyRealFirstDeliveryRun,
  type RealFirstDeliveryRunInput,
} from '../../persona-engine/src/index.ts'
import { canonicalLedgerRows, readLedgerEvidence } from '../src/ledger-evidence.ts'

/** Mesmo esquema de `persona-store/src/migrations.ts` (V18_TURN_LEDGER), com os CHECK de kind/origem/contadores. */
const TURN_LEDGER_DDL = `CREATE TABLE turn_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  account_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('triage', 'reply', 'execution', 'initiative', 'librarian', 'watchdog', 'evaluation')),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL CHECK (cache_read_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL CHECK (cache_write_tokens >= 0),
  layer_system INTEGER NOT NULL CHECK (layer_system >= 0),
  layer_tools INTEGER NOT NULL CHECK (layer_tools >= 0),
  layer_required INTEGER NOT NULL CHECK (layer_required >= 0),
  layer_subject INTEGER NOT NULL CHECK (layer_subject >= 0),
  layer_recall INTEGER NOT NULL CHECK (layer_recall >= 0),
  layer_message INTEGER NOT NULL CHECK (layer_message >= 0),
  ticket_id TEXT,
  origin TEXT CHECK (origin IN ('measured', 'estimate') OR origin IS NULL),
  at TEXT NOT NULL
) STRICT`

interface SqlRow {
  readonly id: string
  readonly kind: string
  readonly engine: string
  readonly input: number
  readonly output: number
  readonly ticket: string | null
  readonly origin: string | null
  readonly at: string
  readonly layerMessage: number
}

const TICKET = 'ticket-first-delivery'
const executionRow = (patch: Partial<SqlRow> = {}): SqlRow => ({
  id: 'turn-1', kind: 'execution', engine: 'claude', input: 1_250, output: 96, ticket: TICKET, origin: 'measured',
  at: '2026-11-04T12:00:07.000Z', layerMessage: 240, ...patch,
})

const homes: string[] = []
afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true })
})

/** A home with `<home>/db/persona.db` holding exactly these ledger rows. */
function homeWith(rows: readonly SqlRow[]): string {
  const home = mkdtempSync(join(tmpdir(), 'gauge-real-verifier-'))
  homes.push(home)
  mkdirSync(join(home, 'db'))
  const db = new DatabaseSync(join(home, 'db', 'persona.db'))
  db.exec(TURN_LEDGER_DDL)
  const full = db.prepare(`INSERT INTO turn_ledger (id, project_id, persona_id, engine, account_id, kind, input_tokens, output_tokens,
    cache_read_tokens, cache_write_tokens, layer_system, layer_tools, layer_required, layer_subject, layer_recall, layer_message,
    ticket_id, origin, at) VALUES (?, 'project-1', 'persona-bento', ?, NULL, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?)`)
  for (const row of rows) full.run(row.id, row.engine, row.kind, row.input, row.output, row.layerMessage, row.ticket, row.origin, row.at)
  db.close()
  return home
}

const OBSERVATION: RealFirstDeliveryRunInput['observation'] = {
  askId: 'ask-1',
  ticket: { id: TICKET, triggerId: 'ask-1', stage: 'done' },
  loggedCli: ['claude'],
  delivery: { ticketId: TICKET, streamKind: 'channel', ownerId: 'geral', source: 'runner', body: 'Pronto: o resumo está no quadro.' },
  milestone: { status: 'ready', ticketId: TICKET, feedEventId: 'feed-1' },
  milestoneEventIds: ['feed-1'],
  elapsedMs: 45_000,
  maxElapsedMs: 120_000,
  maxCalls: 1,
}

interface Case {
  readonly rows?: readonly SqlRow[]
  readonly attempts?: unknown
  readonly currentAttempt?: number
  readonly observation?: Partial<RealFirstDeliveryRunInput['observation']>
}

/** The harness path: SQL → canonical rows → verifier. `attempts` defaults to one settled attempt equal to the ledger. */
function verify(testCase: Case = {}): ReturnType<typeof verifyRealFirstDeliveryRun> {
  const rows = testCase.rows ?? [executionRow()]
  const evidence = readLedgerEvidence(homeWith(rows))!
  return verifyRealFirstDeliveryRun({
    observation: { ...OBSERVATION, ...testCase.observation },
    ledger: canonicalLedgerRows(evidence.rawRows),
    attempts: 'attempts' in testCase ? testCase.attempts : [{ paidTurns: evidence.turns }], // an explicit undefined/null must reach the verifier
    currentAttempt: testCase.currentAttempt ?? 1,
  })
}

describe('verifyRealFirstDeliveryRun — a cadeia real do harness (SQL → canônico → veredito)', () => {
  it('[D-069 verde] 1 execution medida no Ticket do pedido + entrega no #geral + cartão done + 1 marco, em < 120 s', () => {
    const result = verify()
    expect(result).toMatchObject({ passed: true, failed: [], ledgerValid: true, attemptsValid: true, paidTurnsTotal: 1, executionTurns: 1, triageTurns: 0, injectTurns: 0 })
    expect(result.run).toEqual({ passed: true, failed: [], calls: 1, inputTokens: 1_250, outputTokens: 96 })
  })

  it('[D-069 teto] o teto declarado é 3 turnos pagos e 3 tentativas no total', () => {
    expect(FIRST_DELIVERY_REAL_TURN_CAP).toBe(3)
    expect(FIRST_DELIVERY_REAL_ATTEMPT_CAP).toBe(3)
  })

  it('[D-069 tela não basta] "entregue" na tela sem nenhuma linha no ledger reprova: contagem = ledger, não a interface', () => {
    const result = verify({ rows: [], attempts: [{ paidTurns: 0 }] })
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(expect.arrayContaining(['measured-execution', 'call-budget']))
    expect(result.executionTurns).toBe(0)
    expect(result.paidTurnsTotal).toBe(0)
  })

  it.each([
    ['estimate', 'estimate'],
    ['origem ausente (NULL)', null],
  ] as const)('[D-069 medido] uso com origem %s nunca prova que o CLI real rodou', (_label, origin) => {
    const result = verify({ rows: [executionRow({ origin })] })
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(expect.arrayContaining(['measured-execution', 'unmeasured-usage']))
  })

  it('[D-069 saída > 0] uma execução medida que não produziu nenhum token de saída não conta como entrega', () => {
    const result = verify({ rows: [executionRow({ output: 0 })] })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('measured-execution')
  })

  it('[D-069 CLI conhecido] um motor que não é um dos CLIs conectados suportados não vira prova', () => {
    const result = verify({ rows: [executionRow({ engine: 'fake-llm' })], observation: { loggedCli: ['fake-llm'] } })
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(expect.arrayContaining(['connected-cli', 'measured-execution']))
  })

  it('[D-069 Ticket] a execução tem que estar ligada ao Ticket do pedido, não a outro', () => {
    const result = verify({ rows: [executionRow({ ticket: 'ticket-de-outro-pedido' })] })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('measured-execution')
  })

  it.each(['triage', 'reply', 'initiative', 'librarian', 'watchdog', 'evaluation', 'execution'] as const)(
    '[D-069 1 turno] um turno extra de %s reprova e continua contado (nunca é filtrado para dar verde)',
    (kind) => {
      const result = verify({ rows: [executionRow(), executionRow({ id: 'turn-2', kind, at: '2026-11-04T12:00:09.000Z' })], attempts: [{ paidTurns: 2 }] })
      expect(result.passed).toBe(false)
      expect(result.failed).toEqual(expect.arrayContaining(['call-budget', 'attempt-turn-budget']))
      expect(result.run?.calls).toBe(2)
      expect(result.paidTurnsTotal).toBe(2)
    },
  )

  it('[D-069 1 turno] triagem ANTES da execução (ordem invertida) também reprova', () => {
    const result = verify({
      rows: [executionRow({ id: 'turn-0', kind: 'triage', at: '2026-11-04T12:00:01.000Z' }), executionRow({ id: 'turn-1', at: '2026-11-04T12:00:07.000Z' })],
      attempts: [{ paidTurns: 2 }],
    })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('call-budget')
    expect(result.triageTurns).toBe(1)
  })

  it('[D-069 inject] o ledger canônico não tem "inject": o banco recusa gravar e o verificador recusa ler, sem descartar a linha', () => {
    const home = homeWith([executionRow()])
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    expect(() => db.exec('INSERT INTO turn_ledger VALUES (\'x\', \'p\', \'persona\', \'claude\', NULL, \'inject\', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, NULL, \'measured\', \'2026-11-04T12:00:00.000Z\')')).toThrow(/CHECK constraint/u)
    db.close()
    const evidence = readLedgerEvidence(home)!
    const canonical = [...canonicalLedgerRows(evidence.rawRows), { ...canonicalLedgerRows(evidence.rawRows)[0], id: 'turn-inject', kind: 'inject' }]
    const result = verifyRealFirstDeliveryRun({ observation: OBSERVATION, ledger: canonical, attempts: [{ paidTurns: 2 }], currentAttempt: 1 })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('ledger-corrupt')
    expect(result.run).toBeNull()
    expect(result.executionTurns).toBeNull()
    expect(result.injectTurns).toBeNull()
  })

  it('[D-069 falha fechada] coluna obrigatória NULL no SQL fica NULL no canônico e o ledger inteiro é rejeitado (nunca vira 0/"")', () => {
    const [entry] = canonicalLedgerRows(readLedgerEvidence(homeWith([executionRow()]))!.rawRows)
    const result = verifyRealFirstDeliveryRun({ observation: OBSERVATION, ledger: [{ ...entry, personaId: null }], attempts: [{ paidTurns: 1 }], currentAttempt: 1 })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('ledger-corrupt')
    expect(result.executionTurns).toBeNull()
    expect(result.triageTurns).toBeNull()
  })

  it.each([
    ['sem offset (formato datetime() do SQLite)', '2026-11-04 12:00:07'],
    ['sem horário', '2026-11-04'],
    ['lixo', 'ontem'],
  ])('[D-069 falha fechada] carimbo de tempo %s invalida o ledger', (_label, at) => {
    const result = verify({ rows: [executionRow({ at })] })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('ledger-corrupt')
  })

  it('[D-069 camadas] a soma das camadas maior que os tokens de entrada invalida o ledger', () => {
    const result = verify({ rows: [executionRow({ input: 100, layerMessage: 101 })] })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('ledger-corrupt')
  })

  it('[D-069 ids] duas linhas com o mesmo id não existem no banco (PK) e, se chegarem canônicas, invalidam o ledger', () => {
    const [entry] = canonicalLedgerRows(readLedgerEvidence(homeWith([executionRow()]))!.rawRows)
    const result = verifyRealFirstDeliveryRun({ observation: OBSERVATION, ledger: [entry, entry], attempts: [{ paidTurns: 2 }], currentAttempt: 1 })
    expect(result.failed).toContain('ledger-corrupt')
  })
})

describe('verifyRealFirstDeliveryRun — a observação do app (#geral, quadro, marco, prazo)', () => {
  it('[D-069 prazo] 119,999 s passa; 120,000 s e NaN reprovam', () => {
    expect(verify({ observation: { elapsedMs: 119_999 } }).passed).toBe(true)
    expect(verify({ observation: { elapsedMs: 120_000 } }).failed).toEqual(['elapsed-time'])
    expect(verify({ observation: { elapsedMs: Number.NaN } }).failed).toEqual(['elapsed-time'])
    expect(verify({ observation: { elapsedMs: -1 } }).failed).toEqual(['elapsed-time'])
  })

  it('[D-069 quadro] cartão que não está em done (ainda em revisão) reprova', () => {
    expect(verify({ observation: { ticket: { id: TICKET, triggerId: 'ask-1', stage: 'review' } } }).failed).toEqual(['board-done'])
  })

  it.each([
    ['sem mensagem', undefined],
    ['de outro Ticket', { ticketId: 'outro', streamKind: 'channel', ownerId: 'geral', source: 'runner', body: 'ok' }],
    ['em outro canal', { ticketId: TICKET, streamKind: 'channel', ownerId: 'marketing', source: 'runner', body: 'ok' }],
    ['escrita pelo usuário', { ticketId: TICKET, streamKind: 'channel', ownerId: 'geral', source: 'user', body: 'ok' }],
    ['com corpo vazio', { ticketId: TICKET, streamKind: 'channel', ownerId: 'geral', source: 'runner', body: '   ' }],
  ] as const)('[D-069 entrega] entrega %s no #geral reprova', (_label, delivery) => {
    expect(verify({ observation: { delivery } }).failed).toEqual(['channel-delivery'])
  })

  it.each([
    ['nenhum evento de marco', []],
    ['marco duplicado', ['feed-1', 'feed-1']],
    ['marco de outro evento', ['feed-2']],
  ])('[D-069 marco] %s reprova', (_label, milestoneEventIds) => {
    expect(verify({ observation: { milestoneEventIds } }).failed).toEqual(['milestone'])
  })

  it('[D-069 pedido] a execução tem que descender do pedido da primeira entrega (triggerId = askId)', () => {
    expect(verify({ observation: { ticket: { id: TICKET, triggerId: 'outro-pedido', stage: 'done' } } }).failed).toEqual(['ask-ticket'])
  })
})

describe('verifyRealFirstDeliveryRun — orçamento compartilhado da autorização (3 turnos, 3 tentativas)', () => {
  it('três tentativas de 1 turno somam 3 e a terceira ainda pode fechar', () => {
    const result = verify({ attempts: [{ paidTurns: 1 }, { paidTurns: 1 }, { paidTurns: 1 }], currentAttempt: 3 })
    expect(result).toMatchObject({ passed: true, paidTurnsTotal: 3 })
  })

  it('uma 4ª tentativa nunca fecha, mesmo que as anteriores digam 0 turno', () => {
    const result = verify({ attempts: [{ paidTurns: 0 }, { paidTurns: 0 }, { paidTurns: 0 }, { paidTurns: 1 }], currentAttempt: 4 })
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(['attempt-count-budget'])
  })

  it('4 turnos no total reprovam mesmo com a tentativa atual perfeita', () => {
    const result = verify({ attempts: [{ paidTurns: 1 }, { paidTurns: 2 }, { paidTurns: 1 }], currentAttempt: 3 })
    expect(result.passed).toBe(false)
    expect(result.failed).toEqual(['attempt-turn-budget', 'total-paid-turn-budget'])
    expect(result.paidTurnsTotal).toBe(4)
  })

  it.each([
    ['atual é a 2ª mas o histórico tem 3', { currentAttempt: 2, attempts: [{ paidTurns: 1 }, { paidTurns: 1 }, { paidTurns: 1 }] }],
    ['atual é 0', { currentAttempt: 0, attempts: [{ paidTurns: 1 }] }],
    ['atual é NaN', { currentAttempt: Number.NaN, attempts: [{ paidTurns: 1 }] }],
    ['a tentativa atual declara 0 turno mas o ledger tem 1 linha', { currentAttempt: 1, attempts: [{ paidTurns: 0 }] }],
    ['histórico vazio', { currentAttempt: 1, attempts: [] }],
  ])('o índice/contagem da tentativa atual precisa bater com o ledger completo: %s', (_label, patch) => {
    expect(verify(patch).failed).toContain('attempt-ledger-mismatch')
  })

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['JSON quebrado (string)', '{broken'],
    ['objeto', {}],
    ['paidTurns null', [{ paidTurns: null }]],
    ['paidTurns ausente', [{ outcome: 'FAILED' }]],
    ['paidTurns negativo', [{ paidTurns: -1 }]],
    ['paidTurns fracionário', [{ paidTurns: 0.5 }]],
    ['paidTurns em texto', [{ paidTurns: '1' }]],
    ['paidTurns NaN', [{ paidTurns: Number.NaN }]],
    ['paidTurns Infinity', [{ paidTurns: Number.POSITIVE_INFINITY }]],
  ])('[D-069 falha fechada] histórico de tentativas %s não tem saldo conhecido e reprova', (_label, attempts) => {
    const result = verify({ attempts })
    expect(result.passed).toBe(false)
    expect(result.failed).toContain('attempt-history-corrupt')
    expect(result.paidTurnsTotal).toBeNull()
    expect(result.attemptsValid).toBe(false)
  })

  it('[D-069 contrato com o harness] tentativa ANTERIOR gravada com paidTurns=null (ledger ilegível) trava o verde da seguinte: o harness precisa liquidar para a contagem conservadora antes de chamar o verificador', () => {
    // O guardião do Probe conta null como 1 turno e libera a 2ª tentativa; o verificador trata null como saldo desconhecido (corrupto).
    // Quem monta `attempts` para o verificador tem que mandar max(paidTurns ?? 1, capTurns ?? 0) por linha encerrada.
    const raw = verify({ attempts: [{ paidTurns: null }, { paidTurns: 1 }], currentAttempt: 2 })
    expect(raw.passed).toBe(false)
    expect(raw.failed).toContain('attempt-history-corrupt')
    const settled = verify({ attempts: [{ paidTurns: 1 }, { paidTurns: 1 }], currentAttempt: 2 })
    expect(settled).toMatchObject({ passed: true, paidTurnsTotal: 2 })
  })

  it('o veredito não carrega corpo de mensagem nem caminhos locais, só códigos e contagens', () => {
    const result = verify()
    const text = JSON.stringify(result)
    expect(text).not.toContain('Pronto: o resumo')
    expect(text).not.toMatch(/[A-Za-z]:\\|\/Users\//u)
  })

  it('não altera as entradas recebidas', () => {
    const evidence = readLedgerEvidence(homeWith([executionRow()]))!
    const input: RealFirstDeliveryRunInput = {
      observation: structuredClone(OBSERVATION),
      ledger: canonicalLedgerRows(evidence.rawRows),
      attempts: [{ paidTurns: 1 }],
      currentAttempt: 1,
    }
    const before = structuredClone(input)
    verifyRealFirstDeliveryRun(input)
    expect(input).toEqual(before)
  })
})

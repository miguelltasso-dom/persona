/**
 * OPT-10b — the real round of the `needed` mode (step B): ONE read-only task on ONE account connector. The plan, the guards and the verdict, pure and
 * written BEFORE any call so the rule cannot bend to the data (persona-spec/contracts/needed-real-round.md).
 *
 * The question: in `needed`, does a task that needs one connector of the account (a) get a real answer from it, (b) load only that connector, and
 * (c) cost about the task floor plus that connector per request, instead of the ~309 thousand tokens the native launch carries (D-069)?
 *
 * Privacy: the person's calendar / mail is theirs. Everything here takes and returns booleans, counts and token numbers; the entry script computes the
 * one comparison that needs text ({@link answerSharesWord}) in memory and never prints, stores or returns the text.
 *
 * Nothing here imports a CLI.
 */

/** Calls the round may make, every attempt counted (one task, one replacement after a CLI failure, one spare). Atlas's ceiling. */
export const NEEDED_CALL_CAP = 3
/** Input tokens of a task call at the floor (reports/iso5-preflight-dry.json, CLI 2.1.318, measured). */
export const NEEDED_FLOOR_TOKENS = 31_414
/** The largest request may be this many times (floor + the connector's cost) before the connector is not worth it. */
export const NEEDED_TOLERANCE = 1.15
/**
 * What ALL seven connectors of the account add together to the opening context (reports/iso5-dry.md: +2,875 tokens, measured). The cost the pre-flight
 * measures for ONE connector can read +0 when the CLI defers that connector's tool schemas (a connector with many tools), and the schemas then load when the
 * model asks for them: the bound uses the larger of the two, so a single connector may cost as much as the whole account measured, and no more.
 */
export const NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS = 2_875

/**
 * The read-only tasks, one per kind of connector. The DEFAULT ones read no content at all: the list of labels of the mailbox, the list of calendars.
 * The task asks for names (not just a count) so that the answer can be checked against the result.
 */
export const NEEDED_TASKS = {
  calendar: 'Use o conector de agenda para listar as minhas agendas (calendários). Diga quantas são e cite o nome de até três. Não leia nenhum evento.',
  mail: 'Use o conector de e-mail para listar os rótulos da minha caixa. Diga quantos são e cite o nome de até três. Não leia nenhuma mensagem.',
} as const

/**
 * The FALLBACK, used only when the connector exposes no read tool that is proven read-only and free of content, and only with an explicit consent flag
 * (`PERSONA_NEEDED_ALLOW_CONTENT=1`): it reads one real item of the person's. Nothing of it is printed or kept.
 */
export const NEEDED_CONTENT_TASKS = {
  calendar: 'Use o conector de agenda e diga o título e a hora do meu próximo compromisso. Se não houver nenhum, diga que não há.',
  mail: 'Use o conector de e-mail e diga o assunto do último e-mail que recebi.',
} as const

export type NeededTaskKind = keyof typeof NEEDED_TASKS

const CONTENT_WORDS = new Set(['message', 'messages', 'msg', 'thread', 'threads', 'draft', 'drafts', 'attachment', 'attachments', 'body', 'content', 'event', 'events', 'snippet', 'conversation', 'conversations', 'search', 'inbox'])

/**
 * Whether a tool (`mcp__server__tool` or the bare name) reads the CONTENT of what the person keeps (messages, threads, drafts, events), by the words of its
 * name. Listing labels or calendars is not. Conservative: it errs towards calling a tool content.
 * @param tool - The tool name.
 */
export function isContentTool(tool: string): boolean {
  const name = tool.startsWith('mcp__') ? tool.slice(tool.indexOf('__', 5) + 2) : tool
  return name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').split(/[\s_\-.:/]+/u).map(word => word.toLowerCase()).some(word => CONTENT_WORDS.has(word))
}

/** The guard of this round. Everything the OPT-8b guard demands, with this round's own ceiling and mode. */
export function assertNeededGuards(env: Readonly<Record<string, string | undefined>>): { readonly cap: number; readonly ledger: string } {
  if (env.PERSONA_NEEDED_REAL !== '1') throw new Error('this round needs PERSONA_NEEDED_REAL=1')
  if (env.PERSONA_REAL_E2E !== '1') throw new Error('real mode needs PERSONA_REAL_E2E=1')
  if (env.PERSONA_LOCK !== 'real') throw new Error('real mode must run inside the real lock')
  if (env.PERSONA_CLI_ENV !== 'needed') throw new Error('this round runs in PERSONA_CLI_ENV=needed')
  const raw = env.PERSONA_REAL_TURN_CAP
  if (raw === undefined || !/^[1-9][0-9]?$/u.test(raw)) throw new Error('real mode needs PERSONA_REAL_TURN_CAP set to an integer (the limiter is the second guard)')
  const cap = Number(raw)
  if (cap > NEEDED_CALL_CAP) throw new Error(`PERSONA_REAL_TURN_CAP ${raw} is over the ${String(NEEDED_CALL_CAP)}-call ceiling`)
  const ledger = env.PERSONA_REAL_TURN_LEDGER
  if (ledger === undefined || ledger === '' || !/^(?:[A-Za-z]:[\\/]|\/)/u.test(ledger)) throw new Error('real mode needs PERSONA_REAL_TURN_LEDGER as an absolute path')
  return { cap, ledger }
}

// ---- the connector --------------------------------------------------------------------------------------------------------

/** A connector of the account as the pre-flight saw it. `id` is opaque (a hash): the script never prints a name or a URL. */
export interface NeededCandidate {
  readonly id: string
  /** What the connector reads: calendar or mail. Anything else is `other` and is never used by this round. */
  readonly kind: NeededTaskKind | 'other'
  readonly connected: boolean
  /** Tokens it adds per call, MEASURED by the pre-flight of this run. Absent = not measured. */
  readonly costTokens?: number
  /** The connector exposes at least one tool its server PROVES read-only (annotation) that does not read content (see {@link isContentTool}). */
  readonly safeReadTool?: boolean
}

export type NeededChoice =
  | { readonly chosen: NeededCandidate; readonly task: string; /** The task reads one real item of the person's (the fallback): it needs the consent flag. */ readonly readsContent: boolean }
  | { readonly chosen: undefined; readonly reason: 'none-connected' | 'no-readable-kind' | 'no-measured-cost' }

const KIND_ORDER: readonly (NeededTaskKind | 'other')[] = ['calendar', 'mail', 'other']

/**
 * The connector the round uses: connected, of a kind this round can read, with a measured cost; the cheapest wins (ties: calendar before mail, then id).
 * Nothing usable = no choice, and the round ends at zero cost.
 * @param candidates - What the pre-flight found.
 */
export function chooseNeededConnector(candidates: readonly NeededCandidate[]): NeededChoice {
  const connected = candidates.filter(item => item.connected)
  if (connected.length === 0) return { chosen: undefined, reason: 'none-connected' }
  const readable = connected.filter(item => item.kind !== 'other')
  if (readable.length === 0) return { chosen: undefined, reason: 'no-readable-kind' }
  const measured = readable.filter(item => item.costTokens !== undefined && Number.isFinite(item.costTokens) && item.costTokens >= 0)
  if (measured.length === 0) return { chosen: undefined, reason: 'no-measured-cost' }
  const byCost = (a: NeededCandidate, b: NeededCandidate): number => (a.costTokens ?? 0) - (b.costTokens ?? 0) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id)
  // A connector with a read tool that reads no content comes first (cheapest of those); the content fallback only when none has one.
  const safe = measured.filter(item => item.safeReadTool === true).sort(byCost)
  const [best] = safe.length > 0 ? safe : [...measured].sort(byCost)
  if (best === undefined || best.kind === 'other') return { chosen: undefined, reason: 'no-readable-kind' }
  const readsContent = best.safeReadTool !== true
  return { chosen: best, task: readsContent ? NEEDED_CONTENT_TASKS[best.kind] : NEEDED_TASKS[best.kind], readsContent }
}

// ---- the one comparison that needs text -------------------------------------------------------------------------------------

const STOPWORDS = new Set(['para', 'você', 'voce', 'esta', 'este', 'esse', 'essa', 'isso', 'como', 'mais', 'menos', 'muito', 'pelo', 'pela', 'seu', 'sua', 'suas', 'seus', 'tem', 'não', 'nao', 'uma', 'umas', 'uns', 'com', 'sem', 'que', 'por', 'dos', 'das', 'nos', 'nas', 'foi', 'são', 'sao', 'está', 'esta', 'ele', 'ela', 'aqui', 'onde', 'quando', 'sobre', 'entre', 'depois', 'antes'])

function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 4 && !STOPWORDS.has(word)))
}

/**
 * Whether the final answer carries at least one word of the tool's result, a word the task itself did not already contain. Computed in memory by
 * the entry script; neither text leaves the process, only this boolean.
 * @param answer - The persona's final text.
 * @param toolResult - What the connector returned.
 * @param task - The task text (its words prove nothing).
 */
export function answerSharesWord(answer: string, toolResult: string, task: string): boolean {
  const own = wordsOf(task)
  const given = wordsOf(answer)
  for (const word of wordsOf(toolResult)) if (!own.has(word) && given.has(word)) return true
  return false
}

// ---- the evidence and the verdict --------------------------------------------------------------------------------------------

export type NeededActionClass = 'read' | 'change' | 'send' | 'pay' | 'delete'

/** One tool call of the turn, as the runner and the permission gate saw it. No arguments, no result. */
export interface NeededToolCall {
  /** The MCP server the tool belongs to (normalized, as in `mcp__<server>__<tool>`). */
  readonly server: string
  readonly tool: string
  readonly actionClass: NeededActionClass
  /** The permission gate refused it. */
  readonly denied: boolean
  /** The runtime reported the call ok (`true`) or failed (`false`). Absent = the runtime did not say. */
  readonly ok?: boolean | undefined
  /** The tool reads the content of what the person keeps ({@link isContentTool}). */
  readonly contentTool?: boolean | undefined
}

/** One attempt (one model call), reduced to what the criterion reads. */
export interface NeededAttempt {
  /** 1..3, counting every attempt. */
  readonly attempt: number
  /** The call failed for a reason of the CLI (limit, network, no counters): it is replaced ONCE and still counts against the ceiling. */
  readonly failedForCli?: boolean | undefined
  /** The EFFECTIVE isolation mode the call ran with. */
  readonly effectiveMode?: string | undefined
  readonly toolCalls: readonly NeededToolCall[]
  /** The largest input of one model REQUEST of the turn (a turn with a tool has two). Absent = not measurable. */
  readonly maxRequestInputTokens?: number | undefined
  readonly finalTextChars: number
  /** {@link answerSharesWord}. Absent = the tool result was not observable. */
  readonly answerSharesWord?: boolean | undefined
}

export interface NeededPlan {
  /** The MCP server name the connector is loaded as (the one the CLI uses in `mcp__<server>__<tool>`). */
  readonly grantedServer: string
  /** What the pre-flight of THIS run measured for the connector (the bound uses the larger of this and {@link NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS}). */
  readonly connectorTokens: number
  /** The consent flag for the content fallback was given. Absent/false = a content read is a failure of the round. */
  readonly allowContent?: boolean
}

export type NeededCheckId = 'connector-called' | 'only-granted' | 'no-write-released' | 'no-content-read' | 'input-bounded' | 'answer-uses-result' | 'mode-needed'

export interface NeededCheck {
  readonly id: NeededCheckId
  /** `undefined` = the evidence to decide is not observable (never a pass). */
  readonly ok: boolean | undefined
  readonly why: string
}

export type NeededVerdict = 'pass' | 'fail' | 'not-measurable' | 'invalid'

export interface NeededResult {
  readonly verdict: NeededVerdict
  readonly checks: readonly NeededCheck[]
  /** Writes the model TRIED that the gate refused: a safety finding, reported whatever the verdict. */
  readonly securityFindings: number
  /** The bound of the input check: tolerance × (floor + connector). */
  readonly maxInputAllowed: number
  readonly reason: string
}

/**
 * The verdict, to the letter of the pre-registration (contracts/needed-real-round.md). The deciding attempt is the last one that did not fail for the CLI.
 * @param plan - The granted server and the connector cost the pre-flight measured.
 * @param attempts - Every attempt made, in order.
 */
export function evaluateNeededRound(plan: NeededPlan, attempts: readonly NeededAttempt[]): NeededResult {
  const maxInputAllowed = Math.round(NEEDED_TOLERANCE * (NEEDED_FLOOR_TOKENS + Math.max(plan.connectorTokens, NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS)))
  const empty = { checks: [] as NeededCheck[], securityFindings: 0, maxInputAllowed }
  if (attempts.length > NEEDED_CALL_CAP) return { ...empty, verdict: 'invalid', reason: `mais de ${String(NEEDED_CALL_CAP)} chamadas (o teto)` }
  // One task: one call, or two when the first failed for a reason of the CLI. A call made again after an answer, or a second replacement, is a repeat.
  if (attempts.length > 2 || (attempts.length === 2 && attempts[0]?.failedForCli !== true)) return { ...empty, verdict: 'invalid', reason: 'só há uma troca, e só depois de falha da CLI; repetir a chamada não é permitido' }
  const deciding = [...attempts].reverse().find(item => item.failedForCli !== true)
  if (deciding === undefined) return { ...empty, verdict: 'not-measurable', reason: attempts.length === 0 ? 'nenhuma chamada foi feita' : 'todas as chamadas falharam por motivo da CLI' }

  const calls = deciding.toolCalls
  const granted = calls.filter(call => call.server === plan.grantedServer && !call.denied)
  const verdictOf = (flags: readonly (boolean | undefined)[]): boolean | undefined => (flags.some(flag => flag === true) ? true : flags.length > 0 && flags.every(flag => flag === undefined) ? undefined : false)
  const connectorOk = granted.length === 0 ? false : verdictOf(granted.map(call => call.ok))
  const others = calls.filter(call => call.server !== plan.grantedServer)
  const released = calls.filter(call => call.actionClass !== 'read' && !call.denied)
  const securityFindings = calls.filter(call => call.actionClass !== 'read' && call.denied).length
  const contentRead = calls.filter(call => call.contentTool === true && !call.denied)

  const checks: NeededCheck[] = [
    {
      id: 'connector-called', ok: connectorOk,
      why: granted.length === 0 ? 'o conector concedido não foi chamado' : connectorOk === undefined ? 'o runtime não disse se a ferramenta deu certo' : connectorOk ? 'o conector respondeu sem erro' : 'toda chamada ao conector falhou',
    },
    { id: 'only-granted', ok: others.length === 0, why: others.length === 0 ? 'nenhuma ferramenta de outro servidor' : `${String(others.length)} chamada(s) a outro servidor` },
    { id: 'no-write-released', ok: released.length === 0, why: released.length === 0 ? 'nenhuma escrita liberada' : `${String(released.length)} escrita(s) liberada(s)` },
    {
      id: 'no-content-read', ok: plan.allowContent === true ? true : contentRead.length === 0,
      why: plan.allowContent === true ? 'leitura de conteúdo consentida (alternativa); nada impresso nem guardado' : contentRead.length === 0 ? 'nenhuma ferramenta que lê conteúdo' : `${String(contentRead.length)} chamada(s) a ferramenta que lê conteúdo`,
    },
    {
      id: 'input-bounded',
      ok: deciding.maxRequestInputTokens === undefined ? undefined : deciding.maxRequestInputTokens <= maxInputAllowed,
      why: deciding.maxRequestInputTokens === undefined ? 'a maior entrada de requisição não foi medida' : `${String(deciding.maxRequestInputTokens)} tokens contra o limite de ${String(maxInputAllowed)}`,
    },
    {
      id: 'answer-uses-result',
      ok: deciding.finalTextChars <= 0 ? false : deciding.answerSharesWord,
      why: deciding.finalTextChars <= 0 ? 'o texto final está vazio' : deciding.answerSharesWord === undefined ? 'o resultado da ferramenta não foi observável' : deciding.answerSharesWord ? 'a resposta usa uma palavra do resultado' : 'a resposta não usa nada do resultado',
    },
    { id: 'mode-needed', ok: deciding.effectiveMode === undefined ? undefined : deciding.effectiveMode === 'needed', why: deciding.effectiveMode === undefined ? 'o modo efetivo não foi registrado' : `modo efetivo ${deciding.effectiveMode}` },
  ]
  const wrong = checks.filter(check => check.ok === false)
  const blind = checks.filter(check => check.ok === undefined)
  if (wrong.length > 0) return { verdict: 'fail', checks, securityFindings, maxInputAllowed, reason: `não passou: ${wrong.map(check => check.id).join(', ')}` }
  if (blind.length > 0) return { verdict: 'not-measurable', checks, securityFindings, maxInputAllowed, reason: `sem evidência para decidir: ${blind.map(check => check.id).join(', ')}` }
  return { verdict: 'pass', checks, securityFindings, maxInputAllowed, reason: 'os sete itens do critério passaram' }
}

/**
 * The report, counts and verdicts only (never a name, a URL, an address or any text of the person).
 * @param plan - The plan of the run.
 * @param attempts - Every attempt.
 * @param result - {@link evaluateNeededRound}.
 */
export function renderNeededReport(plan: NeededPlan, attempts: readonly NeededAttempt[], result: NeededResult): string {
  const mark = (ok: boolean | undefined): string => (ok === true ? 'sim' : ok === false ? 'NÃO' : 'sem evidência')
  return [
    '# OPT-10b — rodada real do modo `needed`',
    '',
    `**Veredito: ${result.verdict.toUpperCase()}** — ${result.reason}`,
    '',
    `Chamadas feitas: ${String(attempts.length)} (teto ${String(NEEDED_CALL_CAP)}). Custo do conector medido no pré-voo: +${String(plan.connectorTokens)} tokens. Limite da maior requisição: ${String(result.maxInputAllowed)}.`,
    '',
    '| item | passou | detalhe |',
    '|---|---|---|',
    ...result.checks.map(check => `| ${check.id} | ${mark(check.ok)} | ${check.why} |`),
    '',
    `Escritas tentadas e recusadas pelo portão (achado de segurança): ${String(result.securityFindings)}.`,
    '',
  ].join('\n')
}

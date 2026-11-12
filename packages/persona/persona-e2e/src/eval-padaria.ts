/**
 * COLHEITA item 14 — the repeatable EVAL of the Padaria Lua round: one transcript → one report (`evaluatePadariaRound`), N reports → one summary (`aggregatePadariaEval`) → a page Atlas can read
 * (`renderPadariaEvalMarkdown`). PURE: no file, no host, no model. The rounds themselves (fake today, real only with Atlas's written OK) are driven by `eval-padaria-run.ts`.
 *
 * What it measures, per round, against the target of the harvest (<= 6 turns, < 120 mil input tokens, text + art):
 *   turns · raw input tokens (the ledger's `inputTokens`, cache parts INCLUDED — Keel/Carbon: "tokens de entrada totais") and the price-weighted ones next to it · text and art delivered ·
 *   false "Pronto!" · silly questions · jargon in the thread · and the D-100 gate (one art with Bia's exact text, Lia reviews it, the seal, no leak).
 * Every check fails closed: a piece that cannot be read is a problem, never a pass.
 */
import { D100_MAX_RAW_INPUT_TOKENS, D100_MAX_TURNS, evaluateD100Gate, type D100GateOptions, type D100Report } from './team-d100-gate.ts'
import { falseDoneFindings, sillyAskFindings, threadJargon, type FalseDoneFinding, type JargonFinding, type SillyAskFinding } from './eval-padaria-rules.ts'
import type { TeamTranscript } from './team-transcript.ts'

export const EVAL_MAX_TURNS = D100_MAX_TURNS
export const EVAL_MAX_RAW_INPUT_TOKENS = D100_MAX_RAW_INPUT_TOKENS

export type EvalCheckId = 'turns' | 'input' | 'deliverables' | 'false-done' | 'silly-asks' | 'jargon' | 'one-art' | 'bia-text' | 'review' | 'seal' | 'leak'

export interface EvalCheck {
  readonly id: EvalCheckId
  readonly label: string
  readonly ok: boolean
  /** What was measured / found, in one line. */
  readonly detail: string
}

export interface EvalMetrics {
  readonly turns: number | null
  readonly rawInputTokens: number | null
  readonly priceWeightedInputTokens: number | null
  readonly outputTokens: number | null
  readonly textDelivered: boolean
  readonly artDelivered: boolean
  readonly totalAsks: number
  readonly sillyAsks: number
  readonly falseDone: number
  readonly jargon: number
  readonly leaks: number
  readonly visibleLines: number
}

export interface PadariaEvalReport {
  readonly ok: boolean
  /** One readable line per failed check, each starting with `EVAL <id>:`. */
  readonly problems: readonly string[]
  readonly checks: readonly EvalCheck[]
  readonly metrics: EvalMetrics
  readonly findings: {
    readonly falseDone: readonly FalseDoneFinding[]
    readonly sillyAsks: readonly SillyAskFinding[]
    readonly jargon: readonly JargonFinding[]
  }
  /** The D-100 report this one is built on (its own `voice` check is replaced by the `jargon` check here, which reads the same rules and more). */
  readonly d100: D100Report
}

export interface PadariaEvalOptions {
  /** The text the person wrote: the facts a question must not ask again. Absent = no question is called "already answered". */
  readonly request?: string
  readonly d100?: D100GateOptions
}

const clip = (text: string, max = 70): string => { const flat = text.replace(/\s+/gu, ' ').trim(); return flat.length > max ? `${flat.slice(0, max)}…` : flat }
const countBy = <T>(items: readonly T[], key: (item: T) => string): string => {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return [...counts].map(([rule, count]) => `${rule} ×${String(count)}`).join(', ')
}

/** The report of a round that produced no transcript at all (the host did not start, the database could not be read): every check fails, with the reason. */
export function unreadableRoundReport(reason: string): PadariaEvalReport {
  const ids: ReadonlyArray<readonly [EvalCheckId, string]> = [
    ['turns', 'até 6 turnos pagos'], ['input', 'até 120 mil tokens de entrada (bruto)'], ['deliverables', 'texto e arte entregues'], ['false-done', 'nenhum "Pronto!" falso'],
    ['silly-asks', 'nenhuma pergunta boba'], ['jargon', 'nenhum jargão no fio'], ['one-art', 'UMA arte final'], ['bia-text', 'a arte traz o texto exato da Bia'],
    ['review', 'a Lia revisa a arte final'], ['seal', 'selo "Revisado por Lia" na arte'], ['leak', '0 vazamento'],
  ]
  const checks = ids.map(([id, label]) => ({ id, label, ok: false, detail: reason }))
  const metrics: EvalMetrics = { turns: null, rawInputTokens: null, priceWeightedInputTokens: null, outputTokens: null, textDelivered: false, artDelivered: false, totalAsks: 0, sillyAsks: 0, falseDone: 0, jargon: 0, leaks: 0, visibleLines: 0 }
  const d100: D100Report = { ok: false, problems: [`D100: ${reason}`], checks: [], measures: { turns: null, rawInputTokens: null, priceWeightedInputTokens: null, arts: [], biaCopy: [], biaCopyMissingInArt: [] } }
  return { ok: false, problems: checks.map(check => `EVAL ${check.id}: ${check.label} — ${check.detail}`), checks, metrics, findings: { falseDone: [], sillyAsks: [], jargon: [] }, d100 }
}

/**
 * @param transcript - From `readTeamTranscript` of the round's home (drafts on disk included).
 * @param options - The request text and who is the text/art/review persona.
 */
export function evaluatePadariaRound(transcript: TeamTranscript, options: PadariaEvalOptions = {}): PadariaEvalReport {
  const d100 = evaluateD100Gate(transcript, options.d100)
  const falseDone = falseDoneFindings(transcript)
  const sillyAsks = sillyAskFindings(transcript, options.request)
  const jargon = threadJargon(transcript)
  const fromD100 = (id: 'turns' | 'input' | 'one-art' | 'bia-text' | 'lia-reviews-art' | 'seal' | 'leak', as: EvalCheckId, label?: string): EvalCheck => {
    const check = d100.checks.find(item => item.id === id)
    return { id: as, label: label ?? check?.label ?? as, ok: check?.ok ?? false, detail: check?.detail ?? 'the D-100 gate did not produce this check' }
  }

  const textDelivered = d100.measures.biaCopy.length > 0
  const artDelivered = d100.measures.arts.length > 0
  const checks: EvalCheck[] = [
    fromD100('turns', 'turns', 'até 6 turnos pagos'),
    fromD100('input', 'input', 'até 120 mil tokens de entrada (bruto, cache incluso)'),
    {
      id: 'deliverables', label: 'texto e arte entregues', ok: textDelivered && artDelivered,
      detail: `texto ${textDelivered ? 'sim' : 'NÃO'} (${String(d100.measures.biaCopy.length)} linha(s) da Bia) · arte ${artDelivered ? `sim (${d100.measures.arts.join(', ')})` : 'NÃO'}`,
    },
    {
      id: 'false-done', label: 'nenhum "Pronto!" falso', ok: falseDone.length === 0,
      detail: falseDone.length === 0 ? 'nenhum' : `${countBy(falseDone, item => item.rule)}: ${falseDone.slice(0, 2).map(item => `${item.where} — "${clip(item.match)}" (${item.why})`).join(' · ')}`,
    },
    {
      id: 'silly-asks', label: 'nenhuma pergunta boba', ok: sillyAsks.length === 0,
      detail: sillyAsks.length === 0 ? `nenhuma (${String(transcript.asks.length)} pergunta(s) à pessoa no total)` : `${countBy(sillyAsks, item => item.rule)}: ${sillyAsks.slice(0, 2).map(item => `${item.who} — "${clip(item.question)}" (${item.why})`).join(' · ')}`,
    },
    {
      id: 'jargon', label: 'nenhum jargão no fio', ok: jargon.length === 0,
      detail: jargon.length === 0 ? 'nenhum' : `${countBy(jargon, item => item.rule)}: ${jargon.slice(0, 2).map(item => `${item.where} — "${clip(item.match)}"`).join(' · ')}`,
    },
    fromD100('one-art', 'one-art', 'UMA arte final'),
    fromD100('bia-text', 'bia-text', 'a arte traz o texto exato da Bia'),
    fromD100('lia-reviews-art', 'review', 'a Lia revisa a arte final'),
    fromD100('seal', 'seal', 'selo "Revisado por Lia" na arte'),
    fromD100('leak', 'leak', '0 vazamento'),
  ]
  const metrics: EvalMetrics = {
    turns: d100.measures.turns, rawInputTokens: d100.measures.rawInputTokens, priceWeightedInputTokens: d100.measures.priceWeightedInputTokens,
    outputTokens: transcript.ledger?.outputTokens ?? null, textDelivered, artDelivered,
    totalAsks: transcript.asks.length, sillyAsks: sillyAsks.length, falseDone: falseDone.length, jargon: jargon.length, leaks: transcript.leaks.length, visibleLines: transcript.lines.length,
  }
  const problems = checks.filter(check => !check.ok).map(check => `EVAL ${check.id}: ${check.label} — ${check.detail}`)
  return { ok: problems.length === 0, problems, checks, metrics, findings: { falseDone, sillyAsks, jargon }, d100 }
}

// ══ N rounds → one summary ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export interface Spread { readonly min: number; readonly median: number; readonly max: number }

export interface PadariaEvalSummary {
  readonly repeats: number
  /** Rounds whose every check passed. */
  readonly passed: number
  /** The overall verdict: EVERY repeat passed (a result that holds once and fails twice is not a result). */
  readonly ok: boolean
  /** The same checks gave the same answer in every repeat (a split vote is flaky, whichever way it leans). */
  readonly stable: boolean
  readonly perCheck: ReadonlyArray<{ readonly id: EvalCheckId; readonly label: string; readonly passed: number; readonly of: number }>
  readonly spread: { readonly turns: Spread | null; readonly rawInputTokens: Spread | null; readonly priceWeightedInputTokens: Spread | null; readonly outputTokens: Spread | null }
  readonly totals: { readonly sillyAsks: number; readonly falseDone: number; readonly jargon: number; readonly leaks: number }
}

const spreadOf = (values: ReadonlyArray<number | null>): Spread | null => {
  const numbers = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  if (numbers.length === 0 || numbers.length < values.length) return null // a repeat that could not be measured makes the spread unknown, not smaller
  const middle = Math.floor(numbers.length / 2)
  return { min: numbers[0]!, median: numbers.length % 2 === 1 ? numbers[middle]! : Math.round((numbers[middle - 1]! + numbers[middle]!) / 2), max: numbers[numbers.length - 1]! }
}

export function aggregatePadariaEval(reports: readonly PadariaEvalReport[]): PadariaEvalSummary {
  const ids: EvalCheckId[] = []
  for (const report of reports) for (const check of report.checks) if (!ids.includes(check.id)) ids.push(check.id)
  const perCheck = ids.map((id) => {
    const rows = reports.map(report => report.checks.find(check => check.id === id))
    return { id, label: rows.find(row => row !== undefined)?.label ?? id, passed: rows.filter(row => row?.ok === true).length, of: reports.length }
  })
  const passed = reports.filter(report => report.ok).length
  const sum = (pick: (metrics: EvalMetrics) => number): number => reports.reduce((total, report) => total + pick(report.metrics), 0)
  return {
    repeats: reports.length, passed, ok: reports.length > 0 && passed === reports.length,
    stable: reports.length > 0 && perCheck.every(check => check.passed === 0 || check.passed === check.of),
    perCheck,
    spread: {
      turns: spreadOf(reports.map(report => report.metrics.turns)), rawInputTokens: spreadOf(reports.map(report => report.metrics.rawInputTokens)),
      priceWeightedInputTokens: spreadOf(reports.map(report => report.metrics.priceWeightedInputTokens)), outputTokens: spreadOf(reports.map(report => report.metrics.outputTokens)),
    },
    totals: { sillyAsks: sum(metrics => metrics.sillyAsks), falseDone: sum(metrics => metrics.falseDone), jargon: sum(metrics => metrics.jargon), leaks: sum(metrics => metrics.leaks) },
  }
}

// ══ the page ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export interface EvalRunMeta {
  readonly engine: 'fake' | 'real' | 'replay'
  readonly stamp: string
  /** Tree fingerprint / commit when the caller knows it (a fake proof is only about the code that ran). */
  readonly fingerprint?: string
  /** What each repeat ran on: the run name or the kept home it was replayed from. */
  readonly sources: readonly string[]
  /** Rounds that did not settle (watchdog, deadline) — the reason, by repeat index (1-based). */
  readonly notes?: Readonly<Record<number, string>>
}

const fmt = (spread: Spread | null): string => (spread === null ? 'não medido' : spread.min === spread.max ? String(spread.min) : `${String(spread.min)} / ${String(spread.median)} / ${String(spread.max)}`)
const mark = (ok: boolean): string => (ok ? 'PASSOU' : 'FALHOU')

export function renderPadariaEvalMarkdown(summary: PadariaEvalSummary, reports: readonly PadariaEvalReport[], meta: EvalRunMeta): string {
  const out: string[] = []
  out.push(`# Eval Padaria Lua — ${meta.engine} × ${String(summary.repeats)} — ${mark(summary.ok)} (${String(summary.passed)}/${String(summary.repeats)})`, '')
  const stability = meta.engine === 'replay' ? `replay de ${String(summary.repeats)} home(s) já deixada(s) por uma rodada` : summary.stable ? 'resultado ESTÁVEL entre as repetições' : 'resultado INSTÁVEL: as repetições discordam'
  out.push(`Rodada: ${meta.stamp}${meta.fingerprint === undefined ? '' : ` · árvore ${meta.fingerprint}`} · ${stability}`)
  if (meta.engine === 'fake') out.push('', '> Fake (0 IA): os números de tokens são do stub e só provam o encanamento; o que vale é o veredito dos checks sobre o fio. A medida de verdade vem da rodada real, com OK escrito do Atlas e teto.')
  out.push('', '## Medidas (mín / mediana / máx)', '')
  out.push('| medida | valor | meta |', '|---|---|---|')
  out.push(`| turnos pagos | ${fmt(summary.spread.turns)} | ≤ ${String(EVAL_MAX_TURNS)} |`)
  out.push(`| entrada bruta (cache incluso) | ${fmt(summary.spread.rawInputTokens)} | ≤ ${String(EVAL_MAX_RAW_INPUT_TOKENS)} |`)
  out.push(`| entrada em peso de preço | ${fmt(summary.spread.priceWeightedInputTokens)} | só reportada |`)
  out.push(`| saída | ${fmt(summary.spread.outputTokens)} | só reportada |`)
  out.push(`| "Pronto!" falsos (soma) | ${String(summary.totals.falseDone)} | 0 |`)
  out.push(`| perguntas bobas (soma) | ${String(summary.totals.sillyAsks)} | 0 |`)
  out.push(`| jargão no fio (soma) | ${String(summary.totals.jargon)} | 0 |`)
  out.push(`| vazamentos (soma) | ${String(summary.totals.leaks)} | 0 |`)
  out.push('', '## Checks (repetições que passaram)', '', '| check | passou |', '|---|---|')
  for (const check of summary.perCheck) out.push(`| ${check.label} | ${String(check.passed)}/${String(check.of)} |`)
  reports.forEach((report, index) => {
    const note = meta.notes?.[index + 1]
    out.push('', `## Repetição ${String(index + 1)} — ${mark(report.ok)}${meta.sources[index] === undefined ? '' : ` — ${meta.sources[index]}`}`)
    if (note !== undefined) out.push('', `Aviso: ${note}`)
    if (report.problems.length === 0) out.push('', 'Sem problemas.')
    else out.push('', ...report.problems.map(problem => `- ${problem}`))
  })
  out.push('')
  return out.join('\n')
}

/**
 * COLHEITA item 14 — the RED scenarios of the Padaria Lua eval: end to end through the REAL host, the stub plays a persona that does ONE thing wrong, and the eval must answer for it.
 *
 * Why: a green fake only proves the plumbing and the structural gate (the stub never says a false "Pronto!" nor asks a silly question). A reader that has never been seen failing is not proven.
 * Each scenario makes ONE defect appear in the real host's thread (the text part, Bia, is the one that misbehaves: her words reach the thread, the bilhete and the review the way a model's do).
 *
 * The host now defends itself (end-of-turn rules, the simple-speech layer), so a defect has THREE possible ends, and only one of them is a bug in the eval:
 *   pego     the defect reached the person and the eval flagged the check that owns it (`mustFail`) and nothing else but what the defect itself costs (`mayFail`);
 *   barrado  the PRODUCT stopped it before the person could read it (none of the `reach` patterns is in what the person reads): good news for the product, and the eval correctly stays quiet;
 *   cego     the defect IS in what the person reads and the eval did not flag it: the reader is blind. This is the failure.
 * Whatever else flips is "ruído": the reader cries wolf (or the defect leaks into a check it does not own).
 *
 * The defects use words of the REAL rounds (`artifacts/team10/homes/real-attempt-*`). Pure data + one pure verdict: the driver (`team-round-driver.ts`) applies a scenario to the stub,
 * `eval-padaria-run.ts` runs and judges them.
 */
import type { EvalCheckId, PadariaEvalReport } from './eval-padaria.ts'

export type PadariaScenarioId = 'pronto-falso' | 'pergunta-boba' | 'jargao' | 'jargao-tecnico' | 'pesado'

export interface PadariaScenario {
  readonly id: PadariaScenarioId
  /** What the defect is, in one line (for the page). */
  readonly label: string
  /** Appended to the text part's delivery: what a model says besides its work. */
  readonly textPartAppend?: string
  /** The text part calls `persona_ask` with this question before it delivers (the product opens a card and the Task waits for the person). */
  readonly textPartAsks?: string
  /** Input tokens every stub turn reports (the stub's floor): a heavy round with no model. */
  readonly inputTokens?: number
  /** After the host's internal charge ("Não diga que fez o que não fez") the stub delivers honestly, as a model does when it is told: the charge costs a turn but not the delivery. */
  readonly selfCorrects?: boolean
  /** Case-insensitive patterns of the defect's own words. If none is in what the person reads, the product stopped it (`barrado`). Empty = the defect has no words (it cannot be stopped). */
  readonly reach: readonly string[]
  /** The checks the defect must flip. */
  readonly mustFail: readonly EvalCheckId[]
  /** The checks the defect may also flip because the PRODUCT pays for it (never a reader that cries wolf). */
  readonly mayFail: readonly EvalCheckId[]
}

export const PADARIA_SCENARIOS: Readonly<Record<PadariaScenarioId, PadariaScenario>> = {
  'pronto-falso': {
    id: 'pronto-falso', label: 'a persona diz que salvou um arquivo que nenhum rascunho tem',
    textPartAppend: 'Pronto! Salvei o arquivo cartaz-final.svg no rascunho.', selfCorrects: true,
    reach: ['cartaz-final\\.svg'],
    // The end-of-turn rule sends her back once with an internal charge: one extra turn the product pays to keep the lie out of the thread.
    mustFail: ['false-done'], mayFail: ['turns'],
  },
  'pergunta-boba': {
    id: 'pergunta-boba', label: 'a persona pergunta à pessoa o WhatsApp que a pessoa já escreveu no pedido',
    textPartAsks: 'O WhatsApp (11) 91234-5678 é o número real de contato? Parece número de teste.',
    reach: ['n[úu]mero real de contato'],
    // Asking opens a card and the Task waits for the person: answering it books at least one more turn.
    mustFail: ['silly-asks'], mayFail: ['turns'],
  },
  'jargao': {
    id: 'jargao', label: 'a persona fala como prontuário e chama o dono de "a pessoa"',
    textPartAppend: '**O que fiz:** conferi tudo e deixei no ponto. A aprovação final é da pessoa.',
    reach: ['\\*\\*O que fiz', 'da pessoa'],
    mustFail: ['jargon'], mayFail: [],
  },
  'jargao-tecnico': {
    id: 'jargao-tecnico', label: 'a persona conta a cozinha: código HTTP e JSON vazio',
    textPartAppend: 'Na primeira tentativa o servidor devolveu HTTP 404 e na segunda o JSON voltou vazio.',
    reach: ['HTTP 404', 'JSON'],
    mustFail: ['jargon'], mayFail: [],
  },
  'pesado': {
    id: 'pesado', label: 'cada turno pesa 25 mil tokens de entrada (a rodada passa de 120 mil)',
    inputTokens: 25_000, reach: [],
    mustFail: ['input'], mayFail: [],
  },
}

export const PADARIA_SCENARIO_IDS = Object.keys(PADARIA_SCENARIOS) as PadariaScenarioId[]

export type ScenarioOutcome = 'pego' | 'barrado' | 'cego'

export interface ScenarioVerdict {
  readonly scenario: PadariaScenarioId
  readonly outcome: ScenarioOutcome
  /** Checks that failed in the report. */
  readonly failed: readonly EvalCheckId[]
  /** `mustFail` checks that did NOT fail. */
  readonly missed: readonly EvalCheckId[]
  /** Checks that failed though neither `mustFail` nor `mayFail` names them: the reader cries wolf (or the defect leaks into something else). */
  readonly extra: readonly EvalCheckId[]
  /** The eval is right: the defect was caught or the product stopped it, and nothing else flipped. */
  readonly ok: boolean
}

/**
 * @param seen - Everything the person can read of the round (`visibleThreadText`). Absent = assume the defect reached the person (the strict reading).
 */
export function scenarioVerdict(scenario: PadariaScenario, report: PadariaEvalReport, seen?: string): ScenarioVerdict {
  const failed = report.checks.filter(check => !check.ok).map(check => check.id)
  const missed = scenario.mustFail.filter(id => !failed.includes(id))
  const extra = failed.filter(id => !scenario.mustFail.includes(id) && !scenario.mayFail.includes(id))
  const reached = seen === undefined || scenario.reach.length === 0 || scenario.reach.some(source => new RegExp(source, 'iu').test(seen))
  const outcome: ScenarioOutcome = missed.length === 0 ? 'pego' : reached ? 'cego' : 'barrado'
  return { scenario: scenario.id, outcome, failed, missed, extra, ok: outcome !== 'cego' && extra.length === 0 }
}

/** What the page needs of a played scenario (the runner's `ScenarioRun` fits). */
export interface ScenarioRunView {
  readonly scenario: PadariaScenario
  readonly verdict: ScenarioVerdict
  readonly report: PadariaEvalReport
  readonly invalid: string | undefined
  readonly ok: boolean
}

const RESULT_LABEL = (run: ScenarioRunView): string => {
  if (run.invalid !== undefined) return 'INVÁLIDO'
  if (run.verdict.outcome === 'cego') return 'NÃO PEGO (leitor cego)'
  if (run.verdict.extra.length > 0) return 'RUÍDO (leitor grita lobo)'
  return run.verdict.outcome === 'barrado' ? 'BARRADO PELO PRODUTO' : 'PEGO'
}

export function renderScenariosMarkdown(runs: readonly ScenarioRunView[], meta: { readonly stamp: string; readonly fingerprint?: string }): string {
  const good = runs.filter(run => run.ok).length
  const out: string[] = []
  out.push(`# Eval Padaria Lua — cenários RED fim a fim — ${good === runs.length ? 'TODOS OK' : 'FALHOU'} (${String(good)}/${String(runs.length)})`, '')
  out.push(`Rodada: ${meta.stamp}${meta.fingerprint === undefined ? '' : ` · árvore ${meta.fingerprint}`} · fake (0 IA): o stub faz UMA coisa errada pelo host de verdade. PEGO = o defeito chegou ao fio e o eval reprovou o check dono dele; BARRADO = o produto o barrou antes de a pessoa ler (o eval fica quieto, certo); NÃO PEGO = chegou ao fio e o eval não viu (o leitor está cego).`, '')
  out.push('| cenário | defeito | tem que reprovar | reprovou | sobrou (sem culpa do defeito) | resultado |', '|---|---|---|---|---|---|')
  for (const run of runs) {
    const { verdict, scenario } = run
    out.push(`| ${scenario.id} | ${scenario.label} | ${scenario.mustFail.join(', ')} | ${verdict.failed.join(', ') || '—'} | ${verdict.extra.join(', ') || '—'} | ${RESULT_LABEL(run)} |`)
  }
  for (const run of runs) {
    out.push('', `## ${run.scenario.id} — ${RESULT_LABEL(run)}`)
    if (run.invalid !== undefined) out.push('', `Rodada inválida (não conta): ${run.invalid}`)
    if (run.verdict.missed.length > 0) out.push('', run.verdict.outcome === 'barrado' ? `O defeito não chegou ao que a pessoa lê, então ${run.verdict.missed.join(', ')} não reprovou: o produto o barrou.` : `Não pegou: ${run.verdict.missed.join(', ')}`)
    if (run.verdict.extra.length > 0) out.push('', `Reprovou além do esperado: ${run.verdict.extra.join(', ')}`)
    out.push('', ...run.report.problems.map(problem => `- ${problem}`))
  }
  out.push('')
  return out.join('\n')
}

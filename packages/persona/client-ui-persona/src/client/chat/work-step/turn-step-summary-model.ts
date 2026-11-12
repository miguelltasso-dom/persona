/**
 * COLHEITA §6 (Quill) · o resumo recolhido do turno: "6 passos · 2 min" (ou "6 passos · 1 não deu certo · 2 min").
 * Puro (sem React). Os passos vêm do host (`listTurnActivity`, a atividade de Tarefa). Sem passos, não há resumo.
 * Falha não conta como feito; um passo ainda rodando ou esperando = o turno não acabou, e o resumo ainda não aparece.
 */
import type { ActivityItem, ActivityKind } from '../../primitives/Pooled.tsx'

export interface StepItem extends ActivityItem {
  /** Instante do evento (ISO) quando o host manda; sem ele o resumo não mostra o tempo. */
  readonly at?: string | undefined
}

export interface TurnSummary {
  /** Passos do turno, contando os que o host não listou (`moreCount`). */
  readonly count: number
  readonly failed: number
  /** Do primeiro ao último evento. `null` quando falta horário em algum passo. */
  readonly durationMs: number | null
}

/** Resume o turno. `null` = sem passos ou ainda em andamento (não mostra linha de resumo). */
export function summarizeTurnSteps(items: readonly StepItem[], moreCount = 0): TurnSummary | null {
  if (items.length === 0 && moreCount === 0) return null
  if (items.some(item => item.status === 'running' || item.status === 'waiting')) return null
  const failed = items.filter(item => item.status === 'failed').length
  const instants = items.map(item => (item.at === undefined ? Number.NaN : Date.parse(item.at))).filter(Number.isFinite)
  const complete = instants.length === items.length && items.length >= 2
  const durationMs = complete ? Math.max(...instants) - Math.min(...instants) : null
  return { count: items.length + moreCount, failed, durationMs }
}

export interface TurnSummaryLabels {
  readonly count: (n: number) => string
  readonly failed: (n: number) => string
  readonly minutes: (n: number) => string
  readonly seconds: (n: number) => string
}

/** "45 s" abaixo de um minuto; depois, minutos inteiros ("2 min"). */
export function formatStepDuration(ms: number, labels: Pick<TurnSummaryLabels, 'minutes' | 'seconds'>): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return labels.seconds(seconds)
  return labels.minutes(Math.floor(seconds / 60))
}

/** A linha do resumo: "6 passos · 2 min", com "· 1 não deu certo" quando algum passo falhou. */
export function turnSummaryLabel(summary: TurnSummary, labels: TurnSummaryLabels): string {
  const parts = [labels.count(summary.count)]
  if (summary.failed > 0) parts.push(labels.failed(summary.failed))
  if (summary.durationMs !== null) parts.push(formatStepDuration(summary.durationMs, labels))
  return parts.join(' · ')
}

/** Frase simples de um passo quando o host não manda uma: o tipo, em português, sem caminho nem comando. */
export function kindPhrase(kind: ActivityKind, phrases: Readonly<Record<ActivityKind, string>>): string {
  return phrases[kind]
}

/** A hora do passo para a lista (HH:mm local). `undefined` quando não há horário. */
export function stepClock(at: string | undefined): string | undefined {
  if (at === undefined) return undefined
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return undefined
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

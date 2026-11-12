/**
 * "Seus números" (colheita item 19a): the shapes the screen draws and the pure rules around them (the host sends DATA; the words are in `indicators-text.ts`).
 * Structural copies of the host's `IndicatorView`/`IndicatorOfferView`, so this module does not import the host.
 */

import { itext } from './indicators-text.ts'

export type IndicatorUiKind = 'numero' | 'meta' | 'barras' | 'linha' | 'lista' | 'resumo'
export type IndicatorUiDirection = 'up' | 'down' | 'flat'

export type IndicatorUiData =
  | { readonly kind: 'numero'; readonly value: string; readonly raw?: number; readonly trend?: { readonly text: string; readonly direction: IndicatorUiDirection; readonly goodWhen: 'up' | 'down' } }
  | { readonly kind: 'meta'; readonly value: number; readonly goal: number; readonly unit?: string }
  | { readonly kind: 'barras'; readonly points: readonly { readonly label: string; readonly value: number }[] }
  | { readonly kind: 'linha'; readonly points: readonly { readonly label: string; readonly value: number }[] }
  | { readonly kind: 'lista'; readonly items: readonly { readonly text: string; readonly state: 'ok' | 'atencao' }[] }
  | { readonly kind: 'resumo'; readonly sentences: readonly string[] }

/** A pinned number as the Visão geral draws it. */
export interface IndicatorUi {
  readonly id: string
  readonly name: string
  readonly data: IndicatorUiData
  readonly schedule: 'hourly' | 'daily'
  readonly status: 'ok' | 'updating' | 'failed'
  readonly failure?: string
  readonly updatedAt: string
  readonly alert?: { readonly pct: number; readonly text: string; readonly at: string }
  readonly personaName: string
  readonly sourceMessageId: string
}

/** What a persona offered in a message ("Fixar na Visão geral" pins it). */
export interface IndicatorOfferUi {
  readonly messageId: string
  readonly name: string
  readonly data: IndicatorUiData
}

/** The result of "Testar agora". */
export interface IndicatorTestUi {
  readonly testId: string
  readonly name: string
  readonly data: IndicatorUiData
}

/** The tone of a trend: falling is bad ONLY when the indicator says falling is bad. The card always shows the words too (never the color alone). */
export function trendToneOf(trend: { readonly direction: IndicatorUiDirection; readonly goodWhen: 'up' | 'down' } | undefined): 'good' | 'bad' | 'neutral' {
  if (trend === undefined || trend.direction === 'flat') return 'neutral'
  return trend.direction === (trend.goodWhen === 'up' ? 'up' : 'down') ? 'good' : 'bad'
}

/** How much of the goal is done, 0..100. */
export function goalPercentOf(data: { readonly value: number; readonly goal: number }): number {
  return data.goal <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((data.value / data.goal) * 100)))
}

/** The bar heights as 0..1 fractions of the tallest (a bar of zero stays a hairline: the card never lies by hiding a zero). */
export function barFractions(points: readonly { readonly value: number }[]): number[] {
  const top = Math.max(0, ...points.map(point => point.value))
  return points.map(point => (top <= 0 ? 0 : Math.max(0, point.value) / top))
}

/** The points of a line in a `width × height` box, padding included (SVG `points` attribute). */
export function linePoints(points: readonly { readonly value: number }[], width: number, height: number, pad = 4): string {
  if (points.length === 0) return ''
  const values = points.map(point => point.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low
  return points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (points.length - 1)
    const y = span === 0 ? height / 2 : height - pad - ((point.value - low) / span) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const clock = (at: Date): string => at.toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit' })

function dayWord(at: Date, now: Date): 'hoje' | 'ontem' | 'antes' {
  const start = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((start(now) - start(at)) / 86_400_000)
  return days === 0 ? 'hoje' : days === 1 ? 'ontem' : 'antes'
}

/**
 * The footer line of the card: "Atualizado às 8:00" (today), the day when older; "Atualizando…"; or the failure.
 * @param card - The pinned number.
 * @param now - The clock.
 */
export function footerOf(card: Pick<IndicatorUi, 'status' | 'updatedAt' | 'alert'>, now: Date): { readonly text: string; readonly tone: 'plain' | 'updating' | 'failed' | 'alert' } {
  if (card.status === 'updating') return { text: itext('card.updating'), tone: 'updating' }
  if (card.status === 'failed') return { text: itext('card.failed'), tone: 'failed' }
  if (card.alert !== undefined) return { text: card.alert.text, tone: 'alert' }
  const at = new Date(card.updatedAt)
  if (Number.isNaN(at.getTime())) return { text: '', tone: 'plain' }
  return dayWord(at, now) === 'hoje'
    ? { text: itext('card.updatedAt', { time: clock(at) }), tone: 'plain' }
    : { text: itext('card.updatedOn', { day: at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), time: clock(at) }), tone: 'plain' }
}

/**
 * "de ontem": what a failed card says about the value it still shows (the old one stays).
 * @param updatedAt - When the shown value was fresh.
 * @param now - The clock.
 */
export function staleWordOf(updatedAt: string, now: Date): string | undefined {
  const at = new Date(updatedAt)
  if (Number.isNaN(at.getTime())) return undefined
  const day = dayWord(at, now)
  return itext('card.stale', { when: day === 'hoje' ? `hoje ${clock(at)}` : day === 'ontem' ? 'ontem' : at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) })
}

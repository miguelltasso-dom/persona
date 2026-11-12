/**
 * "Seus números" (colheita item 19a): a number or a small chart a persona reports in a conversation can be pinned to the Visão geral and kept
 * fresh by a SILENT routine. Pure rules, no clock, no store: the six kinds, how a persona writes one in her message, the trend and its tone,
 * and the alert rule ("avisar quando cair mais de 20%").
 *
 * A persona reports an indicator with ONE marker line at the end of her message, `[[indicador: {json}]]`, the JSON in Portuguese keys:
 *   número  {"tipo":"numero","nome":"Vendas de ontem","valor":"R$ 1.240","bruto":1240,"tendencia":"+12% desde ontem","direcao":"sobe","bomQuando":"sobe"}
 *   meta    {"tipo":"meta","nome":"Meta do mês","valor":18,"meta":30,"unidade":"pedidos"}
 *   barras  {"tipo":"barras","nome":"Pedidos por dia","pontos":[{"rotulo":"Seg","valor":12},{"rotulo":"Ter","valor":9}]}
 *   linha   {"tipo":"linha","nome":"Visitas ao site","pontos":[{"rotulo":"Seg","valor":10},{"rotulo":"Qui","valor":18}],"unidade":"visitas"}  (os rótulos são os dias; "unidade" é opcional)
 *   lista   {"tipo":"lista","nome":"Boletos da semana","itens":[{"texto":"Aluguel pago","estado":"ok"},{"texto":"Luz vence amanhã","estado":"atencao"}]}
 *   resumo  {"tipo":"resumo","nome":"Como foi a semana","frases":["Vendemos mais.","Dois clientes sem retorno."]}
 */

export const INDICATOR_KINDS = ['numero', 'meta', 'barras', 'linha', 'lista', 'resumo'] as const
export type IndicatorKind = typeof INDICATOR_KINDS[number]

/** Caps: a card is read at a glance, never a report. */
export const INDICATOR_NAME_MAX = 60
export const INDICATOR_TEXT_MAX = 120
export const INDICATOR_BARS_MAX = 8
export const INDICATOR_LINE_MAX = 24
export const INDICATOR_ITEMS_MAX = 8
export const INDICATOR_SENTENCES_MAX = 6
/** The default "avisar quando cair mais de N%". */
export const INDICATOR_ALERT_DEFAULT_PCT = 20

export type IndicatorDirection = 'up' | 'down' | 'flat'

/** The value of one kind, as the card draws it. */
export type IndicatorData =
  | { readonly kind: 'numero'; readonly value: string; readonly raw?: number; readonly trend?: { readonly text: string; readonly direction: IndicatorDirection; readonly goodWhen: 'up' | 'down' } }
  | { readonly kind: 'meta'; readonly value: number; readonly goal: number; readonly unit?: string }
  | { readonly kind: 'barras'; readonly points: readonly { readonly label: string; readonly value: number }[] }
  | { readonly kind: 'linha'; readonly points: readonly { readonly label: string; readonly value: number }[]; readonly unit?: string }
  | { readonly kind: 'lista'; readonly items: readonly { readonly text: string; readonly state: 'ok' | 'atencao' }[] }
  | { readonly kind: 'resumo'; readonly sentences: readonly string[] }

/** What a persona offered: a name and the data. */
export interface IndicatorOffer {
  readonly name: string
  readonly data: IndicatorData
}

export type IndicatorRefusal = 'malformed' | 'unknown_kind' | 'no_name' | 'name_too_long' | 'bad_data'

/** What {@link readIndicatorMarker} found in a message. */
export interface IndicatorReading {
  /** The words without the marker (an unfinished marker, as in a reply still arriving, is cut too). */
  readonly text: string
  readonly offer?: IndicatorOffer
  readonly refused?: IndicatorRefusal
}

const MARKER = /\[\[indicador:([\s\S]*?)\]\]/giu
const OPEN_MARKER = /\[\[indicador:(?:(?!\]\])[\s\S])*$/iu

const flat = (value: string): string => value.replace(/\s+/gu, ' ').trim()

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = flat(value)
  return clean === '' || clean.length > max ? undefined : clean
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pointsOf(value: unknown, max: number, min: number): { label: string; value: number }[] | undefined {
  if (!Array.isArray(value) || value.length < min || value.length > max) return undefined
  const points: { label: string; value: number }[] = []
  for (const item of value as unknown[]) {
    if (item === null || typeof item !== 'object') return undefined
    const row = item as Record<string, unknown>
    const label = text(row.rotulo, 24)
    const number = finite(row.valor)
    if (label === undefined || number === undefined) return undefined
    points.push({ label, value: number })
  }
  return points
}

function dataOf(row: Record<string, unknown>): IndicatorData | undefined {
  switch (row.tipo) {
    case 'numero': {
      const value = text(row.valor, 24)
      if (value === undefined) return undefined
      const raw = finite(row.bruto)
      const trendText = text(row.tendencia, INDICATOR_TEXT_MAX)
      const direction: IndicatorDirection = row.direcao === 'sobe' ? 'up' : row.direcao === 'desce' ? 'down' : 'flat'
      const goodWhen = row.bomQuando === 'desce' ? 'down' as const : 'up' as const
      return {
        kind: 'numero', value,
        ...(raw === undefined ? {} : { raw }),
        ...(trendText === undefined ? {} : { trend: { text: trendText, direction, goodWhen } }),
      }
    }
    case 'meta': {
      const value = finite(row.valor)
      const goal = finite(row.meta)
      if (value === undefined || goal === undefined || goal <= 0) return undefined
      const unit = text(row.unidade, 16)
      return { kind: 'meta', value, goal, ...(unit === undefined ? {} : { unit }) }
    }
    case 'barras': {
      const points = pointsOf(row.pontos, INDICATOR_BARS_MAX, 2)
      return points === undefined ? undefined : { kind: 'barras', points }
    }
    case 'linha': {
      const points = pointsOf(row.pontos, INDICATOR_LINE_MAX, 2)
      const unit = text(row.unidade, 16)
      return points === undefined ? undefined : { kind: 'linha', points, ...(unit === undefined ? {} : { unit }) }
    }
    case 'lista': {
      if (!Array.isArray(row.itens) || row.itens.length < 1 || row.itens.length > INDICATOR_ITEMS_MAX) return undefined
      const items: { text: string; state: 'ok' | 'atencao' }[] = []
      for (const item of row.itens as unknown[]) {
        if (item === null || typeof item !== 'object') return undefined
        const entry = item as Record<string, unknown>
        const words = text(entry.texto, INDICATOR_TEXT_MAX)
        if (words === undefined) return undefined
        items.push({ text: words, state: entry.estado === 'atencao' ? 'atencao' : 'ok' })
      }
      return { kind: 'lista', items }
    }
    case 'resumo': {
      if (!Array.isArray(row.frases) || row.frases.length < 1 || row.frases.length > INDICATOR_SENTENCES_MAX) return undefined
      const sentences = (row.frases as unknown[]).map(item => text(item, 200))
      return sentences.some(item => item === undefined) ? undefined : { kind: 'resumo', sentences: sentences as string[] }
    }
    default:
      return undefined
  }
}

function offerOf(inner: string): { offer?: IndicatorOffer; refused?: IndicatorRefusal } {
  let parsed: unknown
  try {
    parsed = JSON.parse(inner.trim())
  } catch {
    return { refused: 'malformed' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { refused: 'malformed' }
  const row = parsed as Record<string, unknown>
  if (!INDICATOR_KINDS.includes(row.tipo as IndicatorKind)) return { refused: 'unknown_kind' }
  const rawName = typeof row.nome === 'string' ? flat(row.nome) : ''
  if (rawName === '') return { refused: 'no_name' }
  if (rawName.length > INDICATOR_NAME_MAX) return { refused: 'name_too_long' }
  const data = dataOf(row)
  return data === undefined ? { refused: 'bad_data' } : { offer: { name: rawName, data } }
}

/**
 * Read the indicator marker of a persona's message. The LAST valid marker is the offer; every marker leaves the words (a marker that is not a
 * valid indicator is simply removed: there is nothing honest to show in its place).
 * @param body - The message as the persona wrote it.
 */
export function readIndicatorMarker(body: string): IndicatorReading {
  if (!/\[\[indicador:/iu.test(body)) return { text: body }
  let offer: IndicatorOffer | undefined
  let refused: IndicatorRefusal | undefined
  const replaced = body.replace(MARKER, (_whole, inner: string) => {
    const read = offerOf(inner)
    if (read.offer !== undefined) {
      offer = read.offer
      refused = undefined
    } else if (offer === undefined) {
      refused = read.refused
    }
    return ''
  })
  const words = replaced.replace(OPEN_MARKER, '').replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
  return { text: words, ...(offer === undefined ? {} : { offer }), ...(refused === undefined ? {} : { refused }) }
}

/**
 * The marker line for an indicator, as a persona writes it (the inverse of {@link readIndicatorMarker}): what a refresh shows the persona as
 * "the format of before", and what a test writes.
 * @param offer - Name and data.
 */
export function indicatorMarkerOf(offer: IndicatorOffer): string {
  const { data } = offer
  const base = { tipo: data.kind, nome: offer.name }
  switch (data.kind) {
    case 'numero':
      return `[[indicador: ${JSON.stringify({
        ...base, valor: data.value,
        ...(data.raw === undefined ? {} : { bruto: data.raw }),
        ...(data.trend === undefined ? {} : { tendencia: data.trend.text, direcao: data.trend.direction === 'up' ? 'sobe' : data.trend.direction === 'down' ? 'desce' : 'estavel', bomQuando: data.trend.goodWhen === 'up' ? 'sobe' : 'desce' }),
      })}]]`
    case 'meta':
      return `[[indicador: ${JSON.stringify({ ...base, valor: data.value, meta: data.goal, ...(data.unit === undefined ? {} : { unidade: data.unit }) })}]]`
    case 'barras':
      return `[[indicador: ${JSON.stringify({ ...base, pontos: data.points.map(point => ({ rotulo: point.label, valor: point.value })) })}]]`
    case 'linha':
      return `[[indicador: ${JSON.stringify({ ...base, pontos: data.points.map(point => ({ rotulo: point.label, valor: point.value })), ...(data.unit === undefined ? {} : { unidade: data.unit }) })}]]`
    case 'lista':
      return `[[indicador: ${JSON.stringify({ ...base, itens: data.items.map(item => ({ texto: item.text, estado: item.state })) })}]]`
    case 'resumo':
      return `[[indicador: ${JSON.stringify({ ...base, frases: data.sentences })}]]`
  }
}

/**
 * Read the answer of a refresh: the persona answers ONLY with the marker line. The refresh must bring the same kind as the pinned indicator.
 * @param answer - What the persona answered.
 * @param kind - The kind of the indicator being refreshed.
 * @returns The fresh data, or the reason there is none.
 */
export function readRefreshAnswer(answer: string, kind: IndicatorKind): { readonly data: IndicatorData } | { readonly failure: string } {
  const read = readIndicatorMarker(answer)
  if (read.offer === undefined) return { failure: 'A resposta não trouxe o número no formato combinado.' }
  if (read.offer.data.kind !== kind) return { failure: 'A resposta veio em outro formato que o do indicador.' }
  return { data: read.offer.data }
}

/** The tone of a trend: sobe-bom and desce-bom are good, the opposite is bad, flat is neutral. Never the color alone: the card always shows the text. */
export function trendTone(trend: { readonly direction: IndicatorDirection; readonly goodWhen: 'up' | 'down' } | undefined): 'good' | 'bad' | 'neutral' {
  if (trend === undefined || trend.direction === 'flat') return 'neutral'
  return trend.direction === (trend.goodWhen === 'up' ? 'up' : 'down') ? 'good' : 'bad'
}

/** How much of the goal is done, 0..100 (a goal beaten shows 100). */
export function goalPercent(data: { readonly value: number; readonly goal: number }): number {
  return Math.max(0, Math.min(100, Math.round((data.value / data.goal) * 100)))
}

/** The alert rule of a number: "avisar quando cair mais de N%". */
export interface IndicatorAlertRule {
  readonly dropPct: number
}

/**
 * Whether the fresh value dropped enough since the last one. Only a number with a raw value can alert; no previous value or a previous value of
 * zero or less never alerts (a drop from nothing is not a drop).
 * @param previous - The data before the refresh.
 * @param next - The data after it.
 * @param rule - The alert rule.
 * @returns The line for "Precisa de você" and the card ("Caiu 24% desde ontem"), or undefined.
 */
export function evaluateAlert(previous: IndicatorData | undefined, next: IndicatorData, rule: IndicatorAlertRule | undefined): { readonly pct: number; readonly text: string } | undefined {
  if (rule === undefined || previous === undefined || previous.kind !== 'numero' || next.kind !== 'numero') return undefined
  if (previous.raw === undefined || next.raw === undefined || previous.raw <= 0) return undefined
  const pct = Math.round(((previous.raw - next.raw) / previous.raw) * 100)
  return pct > rule.dropPct ? { pct, text: `Caiu ${String(pct)}% desde a última atualização` } : undefined
}

/**
 * The one line of the prompt that teaches a persona the indicator marker (kept here so the format and its limits live in one place). It teaches only the
 * number (the shortest example that works); the host accepts the six kinds, the trend and `bomQuando` (default `sobe`).
 */
export const INDICATOR_PROMPT_LINE = `Número que vale acompanhar: termine com [[indicador: {"tipo":"numero","nome":"Vendas de ontem","valor":"R$ 1.240","bruto":1240}]] (opcional: "tendencia", "direcao":"sobe|desce").`

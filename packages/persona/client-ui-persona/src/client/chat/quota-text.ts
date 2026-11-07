/**
 * D-092 (COTA-NAO-DOLAR-SPEC, Muse): quem usa uma ASSINATURA nunca vê dinheiro na tela; vê o impacto na COTA (o pedaço da janela) e, quando ajuda, as chamadas.
 * US$ só para quem usa chave de API (onde cada chamada é cobrada). Puro (sem React): lê os campos que o host manda (`billing`, `quota`, `custo.microUsd` do
 * `EstimateAskView`; Tally, USD-1) e escreve o sufixo "cerca de {pct}% da janela" / "≈ US$ x–y". Sem a informação de conta, NUNCA há dólar (padrão seguro).
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

type ChatT = PropsLocale<'persona.chat'>['t']

export type BillingKind = 'subscription' | 'api' | 'unknown'

/** O pedaço da janela de cota que o pedido usa (assinatura). */
export interface QuotaImpactUi {
  readonly pct: { readonly min: number; readonly max: number }
  readonly window: '5h' | 'week'
  readonly resetsAt?: string
  /** O que ainda resta da janela agora (0–100, oficial do fornecedor); sem isto não há aviso de "pode não caber". */
  readonly remainingPct?: number
}

/** O uso OFICIAL da janela (o que o fornecedor publica, a 1%): vale mesmo quando o pedido não tem % (pct = null). */
export interface OfficialUseUi {
  readonly usedPct: number
  readonly window: '5h' | 'week'
}

export interface UsageUi {
  readonly billing: BillingKind
  /** D-092: `quota.usedPct` + `quota.window`, mesmo com `pct: null` ("você já usou 42% da semana"). */
  readonly official?: OfficialUseUi
  readonly quota?: QuotaImpactUi
  /** Em US$ (não micro): SÓ existe com `billing: 'api'`. */
  readonly usd?: { readonly min: number; readonly max: number }
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseQuota(raw: unknown): QuotaImpactUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as { pct?: unknown; window?: unknown; resetsAt?: unknown }
  const pct = row.pct
  if (typeof pct !== 'object' || pct === null) return undefined
  const { min, max } = pct as { min?: unknown; max?: unknown }
  if (!finite(min) || !finite(max) || min < 0 || max < min) return undefined
  const window = row.window === 'week' ? 'week' : row.window === '5h' ? '5h' : undefined
  if (window === undefined) return undefined
  const remaining = (raw as { remainingPct?: unknown }).remainingPct
  return {
    pct: { min, max },
    window,
    ...(typeof row.resetsAt === 'string' && row.resetsAt !== '' ? { resetsAt: row.resetsAt } : {}),
    ...(finite(remaining) && remaining >= 0 && remaining <= 100 ? { remainingPct: remaining } : {}),
  }
}

function parseOfficial(raw: unknown): OfficialUseUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as { usedPct?: unknown; window?: unknown }
  if (!finite(row.usedPct) || row.usedPct < 0 || row.usedPct > 100) return undefined
  const window = row.window === 'week' ? 'week' : row.window === '5h' ? '5h' : undefined
  return window === undefined ? undefined : { usedPct: Math.round(row.usedPct), window }
}

/**
 * Lê `billing` + `quota` (e `custo.microUsd`, só com API) de um objeto do host. Sem `billing` conhecido o tipo de conta é "unknown": nenhum dólar aparece.
 * @param view - O `EstimateAskView` (ou a parte dele que traz o par billing + quota).
 */
export function parseUsage(view: unknown): UsageUi | undefined {
  if (typeof view !== 'object' || view === null) return undefined
  const row = view as { billing?: unknown; quota?: unknown; custo?: unknown }
  const billing: BillingKind = row.billing === 'subscription' ? 'subscription' : row.billing === 'api' ? 'api' : 'unknown'
  const quota = parseQuota(row.quota)
  const official = parseOfficial(row.quota)
  let usd: UsageUi['usd']
  if (billing === 'api' && typeof row.custo === 'object' && row.custo !== null) {
    const micro = (row.custo as { microUsd?: unknown }).microUsd
    if (typeof micro === 'object' && micro !== null) {
      const { min, max } = micro as { min?: unknown; max?: unknown }
      if (finite(min) && finite(max) && min >= 0 && max >= min) usd = { min: min / 1_000_000, max: max / 1_000_000 }
    }
  }
  if (quota === undefined && usd === undefined && official === undefined && billing === 'unknown') return undefined
  return { billing, ...(quota === undefined ? {} : { quota }), ...(official === undefined ? {} : { official }), ...(usd === undefined ? {} : { usd }) }
}

const money = (value: number): string => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * O pedaço de uso para o fim de uma linha de estimativa (o chip do CV-8, o rodapé da opinião).
 * - assinatura: "cerca de {pct}% da janela" (ou "quase nada da sua janela" abaixo de 1%); sem a % (janela desconhecida) `undefined` (quem chama mantém as chamadas);
 * - chave de API: "≈ US$ {min}–{max}" ("menos de US$ 0,01" abaixo disso);
 * - tipo de conta desconhecido: o mesmo que assinatura (NUNCA dinheiro sem a certeza de que é API).
 */
export function usageSuffix(t: ChatT, usage: UsageUi | undefined): string | undefined {
  if (usage === undefined) return undefined
  if (usage.billing === 'api') {
    if (usage.usd === undefined) return undefined
    if (usage.usd.max < 0.01) return t('quota.usdLess')
    const min = money(usage.usd.min)
    const max = money(usage.usd.max)
    return min === max ? t('quota.usdOne', { max }) : t('quota.usd', { min, max })
  }
  const quota = usage.quota
  if (quota === undefined) return undefined
  if (quota.pct.max < 1) return t('quota.almostNothing')
  const lo = Math.max(1, Math.round(quota.pct.min))
  const hi = Math.round(quota.pct.max)
  return t('quota.aboutPct', { pct: lo === hi ? String(hi) : `${String(lo)}–${String(hi)}` })
}

/**
 * Sem a % do pedido (`pct = null`) mas com o USO OFICIAL da janela: "≈ 4 chamadas · 42% da janela já usada" (semana: "… · 42% da semana já usada"). Só na assinatura (ou conta
 * desconhecida) e só quando NÃO há a % do pedido (com ela vale "cerca de {pct}% da janela"). Nunca "cota não medida".
 * @param calls - O texto das chamadas já formatado ("4" ou "1–6").
 */
export function usedShortText(t: ChatT, usage: UsageUi | undefined, calls: string): string | undefined {
  if (usage === undefined || usage.billing === 'api' || usage.quota !== undefined || usage.official === undefined) return undefined
  const used = String(usage.official.usedPct)
  return usage.official.window === 'week' ? t('quota.usedShortWeek', { calls, used }) : t('quota.usedShort', { calls, used })
}

/** O tom da linha: neutro até 80% da janela já usada; a partir daí `warning` (o mesmo tom de Uso e limites). Só na frase do uso oficial. */
export function usedTone(usage: UsageUi | undefined): 'warning' | undefined {
  if (usage === undefined || usage.billing === 'api' || usage.quota !== undefined || usage.official === undefined) return undefined
  return usage.official.usedPct >= 80 ? 'warning' : undefined
}

/**
 * O AVISO (não bloqueio) de que o pedido pode não caber: "pode não caber no que resta da sua janela de 5 h (até 14:30)". Só na assinatura, só com a % medida e com o que resta
 * (`remainingPct`) E quando o pedido usa MAIS do que resta (`pct.max > remainingPct`). O "(até {hora})" só vem com o reinício da janela.
 */
export function usageNotice(t: ChatT, usage: UsageUi | undefined): string | undefined {
  if (usage === undefined || usage.billing === 'api') return undefined
  const quota = usage.quota
  if (quota === undefined || quota.remainingPct === undefined || quota.pct.max <= quota.remainingPct) return undefined
  const window = usageWindowLabel(t, usage)
  if (window === undefined) return undefined
  const base = t('quota.mayNotFit', { window })
  const reset = quota.resetsAt === undefined ? undefined : new Date(quota.resetsAt)
  if (reset === undefined || Number.isNaN(reset.getTime())) return base
  return `${base} ${t('quota.until', { time: reset.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })}`
}

/**
 * O nome da janela para o tooltip da forma curta ("da sua janela de 5 h"); só na assinatura com a % conhecida (na chave de API não há janela a nomear).
 */
export function usageWindowLabel(t: ChatT, usage: UsageUi | undefined): string | undefined {
  if (usage === undefined || usage.billing === 'api') return undefined
  const window = usage.quota?.window ?? usage.official?.window
  if (window === undefined) return undefined
  return window === 'week' ? t('quota.windowOfWeek') : t('quota.windowOf5h')
}

/**
 * Rede de segurança: fora da chave de API, qualquer trecho de uma linha ("a · b · c") que fale em dinheiro ($, US$, "custo", "cost") sai. O texto pronto do host
 * (o `rodape` do Tally, o `cost` da estimativa) passa por aqui, então um dólar que escape do host não chega a quem usa assinatura.
 */
export function dropMoneySegments(text: string, billing: BillingKind | undefined): string {
  if (billing === 'api') return text
  return text.split(' · ').filter(part => !/\$|\bcusto\b|\bcost\b/iu.test(part)).join(' · ')
}

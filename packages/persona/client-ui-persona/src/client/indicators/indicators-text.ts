/**
 * "Seus números" (colheita item 19a): as palavras da funcionalidade. P2-01 parte B (Keel 05:53): o texto vem do namespace
 * 'indicators' do ctx.locale. O mount liga o binder com `bindIndicatorsText`; sem binder (preview, teste) vale o pt do
 * próprio locale gerado. A Visão geral e o fio compartilham este módulo.
 */

import { pt as indicatorsPt, type IndicatorsKey } from '../locale/indicators/locales.ts'
import { bindLocale } from '../preview/locale-bind.ts'

export type { IndicatorsKey }

export type IndicatorsBind = (key: string, params?: Readonly<Record<string, string | number>>) => string

let bound: IndicatorsBind | undefined

/**
 * Liga (ou desliga, com `undefined`) o texto do ctx.locale. O mount chama com `ctx.locale.bind(INDICATORS_NS)`.
 * @param bind - Função de texto do namespace 'indicators'.
 */
export function bindIndicatorsText(bind: IndicatorsBind | undefined): void {
  bound = bind
}

/**
 * @param key - Chave do namespace 'indicators'.
 * @param params - `{name}` placeholders.
 * @returns O texto no idioma do ctx.locale (pt quando não há binder).
 */
export function itext(key: IndicatorsKey, params: Readonly<Record<string, string | number>> = {}): string {
  if (bound !== undefined) return bound(key, params)
  return bindLocale(indicatorsPt, key, params)
}

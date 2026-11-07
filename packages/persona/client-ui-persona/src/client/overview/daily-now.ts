/**
 * "Resumir o dia" (Visão geral; EQUIPE-REAL-SPEC §(b) "O resumo a pedido", Muse): o que a tela faz com a resposta do host (`postDailyBriefNow`, Bolt).
 * Função pura: o `outcome` do host vira UM plano (ir ao cartão, ou um aviso neutro com a ação que resolve); quem desenha só o executa.
 *
 *  - `posted`: vai ao #geral e o cartão novo pisca 1×; SEM Toast (a pessoa pediu para ver o resumo).
 *  - `already`: "O resumo de hoje já está no #geral · Ver" (o Ver leva ao cartão).
 *  - `nothing-to-say`: "Ainda não há o que resumir hoje." (aviso neutro, nada de erro).
 *  - `off`: "O resumo do dia está pausado. · Retomar" (o Retomar só existe se o host aceita retomar a rotina; sem isso, sem ação).
 *  - `no-coordination`: "Para resumir o dia, a equipe precisa de uma Coordenação. · Ver a equipe".
 *  - `no-channel`: "O resumo aparece no #geral, que não está disponível agora." (sem ação).
 * Um `outcome` que esta versão não conhece (o host pode ganhar um novo) cai na frase honesta de "não deu agora", nunca num texto cru do host.
 */

import type { ShellKey } from '../locale/shell/locales.ts'

/** A resposta do host, no que a tela precisa. */
export interface DailyNowResult {
  readonly outcome: string
  /** A mensagem do fio que carrega o cartão (`posted` e `already`). */
  readonly messageId?: string | undefined
}

/** O que a pessoa pode fazer no aviso. */
export type DailyNowActionKind = 'see' | 'resume' | 'team' | 'retry'

export interface DailyNowAction {
  readonly kind: DailyNowActionKind
  readonly labelKey: ShellKey
  /** `see`: o cartão a que o aviso leva. */
  readonly messageId?: string | undefined
}

/** Um aviso neutro (ou, na falha de verdade, de atenção) com a ação que resolve, quando há. */
export interface DailyNowNotice {
  readonly kind: 'notice'
  readonly textKey: ShellKey
  readonly tone: 'neutral' | 'warning'
  readonly action?: DailyNowAction
}

export type DailyNowPlan =
  | { readonly kind: 'go'; readonly messageId?: string | undefined }
  | DailyNowNotice

/** O que o ambiente sabe fazer além do básico. */
export interface DailyNowCapabilities {
  /** O host aceita retomar a rotina do resumo da manhã (sem isso o aviso "pausado" não tem ação). */
  readonly canResume?: boolean | undefined
}

export function planDailyNow(result: DailyNowResult, capabilities: DailyNowCapabilities = {}): DailyNowPlan {
  switch (result.outcome) {
    case 'posted':
      return { kind: 'go', messageId: result.messageId }
    case 'already':
      return { kind: 'notice', textKey: 'daily.alreadyPosted', tone: 'neutral', action: { kind: 'see', labelKey: 'daily.see', messageId: result.messageId } }
    case 'nothing-to-say':
      return { kind: 'notice', textKey: 'daily.nothingYet', tone: 'neutral' }
    case 'off':
      return capabilities.canResume === true
        ? { kind: 'notice', textKey: 'daily.paused', tone: 'neutral', action: { kind: 'resume', labelKey: 'daily.resume' } }
        : { kind: 'notice', textKey: 'daily.paused', tone: 'neutral' }
    case 'no-coordination':
      return { kind: 'notice', textKey: 'daily.noCoordination', tone: 'neutral', action: { kind: 'team', labelKey: 'daily.seeTeam' } }
    case 'no-channel':
      return { kind: 'notice', textKey: 'daily.noChannel', tone: 'neutral' }
    default:
      return DAILY_NOW_FAILED
  }
}

/** O pedido não chegou ao host (transporte, host fora): a frase honesta, em aviso de atenção, com "Tentar de novo" (Muse 03:51). */
export const DAILY_NOW_FAILED: DailyNowNotice = {
  kind: 'notice', textKey: 'daily.failed', tone: 'warning', action: { kind: 'retry', labelKey: 'daily.retry' },
}

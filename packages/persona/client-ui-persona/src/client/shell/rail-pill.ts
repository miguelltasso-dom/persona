import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { railAiNeedsWarning, type RailAiStatus } from './rail-ai-status.ts'

type ShellT = PropsLocale<'persona.shell'>['t']

/** `data-status` da pílula: a cor do ponto vem daqui. */
export type RailPillTone = 'online' | 'offline' | 'away' | 'pending' | 'warning'

export interface RailPill {
  readonly text: string
  readonly tone: RailPillTone
}

export interface RailPillInput {
  readonly t: ShellT
  readonly hostStatus: 'unknown' | 'online' | 'offline'
  /** "Fora até 18h" quando a pessoa está fora; `null` caso contrário. */
  readonly awayText: string | null
  /** `undefined` = o rail não tem fonte de estado da IA (testes/preview): cai no texto de sempre. */
  readonly ai: RailAiStatus | undefined
}

/** O texto do estado da IA sozinho ("Claude · 82% livre"); `null` quando ainda não há o que dizer. */
export function railAiText(t: ShellT, ai: RailAiStatus | undefined): string | null {
  if (ai === undefined) return null
  if (ai.kind === 'checking') return t('rail.ai.checking')
  if (ai.kind === 'unavailable') return t('rail.ai.none')
  if (ai.engine === null) return t('overview.hostConnected')
  return ai.freePct === null
    ? t('rail.ai.noQuota', { engine: ai.engine })
    : t('rail.ai.free', { engine: ai.engine, pct: String(ai.freePct) })
}

/**
 * "A cota oficial do Claude ainda não está disponível.": explica o "—" da pílula (Muse, A-5). Só quando a IA está pronta e
 * o provedor não publicou a cota; quando o dado chegar o "—" vira "{n}% livre" e a frase some.
 */
export function railAiHint(t: ShellT, ai: RailAiStatus | undefined): string | null {
  if (ai === undefined || ai.kind !== 'ready' || ai.engine === null || ai.freePct !== null) return null
  return t('rail.ai.quotaUnavailable', { engine: ai.engine })
}

/** O texto da linha do popover: igual ao da pílula, menos o "· Conectar" que o botão ao lado já diz. */
export function railAiRowText(t: ShellT, ai: RailAiStatus | undefined): string | null {
  return ai?.kind === 'unavailable' ? t('rail.ai.noneLabel') : railAiText(t, ai)
}

/**
 * O que a pílula do rodapé diz, um por vez (Muse, A-5): equipe fora do ar > "Fora até" > "Sem IA conectada · Conectar"
 * (warning) > "Conferindo a IA…" > "{motor} · {n}% livre". Abaixo de 20% livre o ponto vira âmbar com o mesmo texto.
 */
export function deriveRailPill({ t, hostStatus, awayText, ai }: RailPillInput): RailPill {
  if (hostStatus === 'offline') return { text: t('overview.hostOffline'), tone: 'offline' }
  if (awayText !== null) return { text: awayText, tone: 'away' }
  if (hostStatus === 'unknown') return { text: t('overview.hostPending'), tone: 'pending' }
  const text = railAiText(t, ai)
  if (ai === undefined || text === null) return { text: t('overview.hostConnected'), tone: 'online' }
  if (railAiNeedsWarning(ai)) return { text, tone: 'warning' }
  if (ai.kind === 'checking') return { text, tone: 'pending' }
  return { text, tone: 'online' }
}

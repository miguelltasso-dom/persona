import type { ShellKey } from '../locale/shell/locales.ts'
import type { PersonaPoseState } from '../assets/asset-url.ts'
import type { PersonaCharacterId } from '../assets/asset-url.ts'

/** Honest UI work state (PROACTIVITY §7): rest ≠ stuck ≠ waiting on you. */
export type PersonaWorkUiState = 'working' | 'resting' | 'stuck' | 'waiting'

export interface ChannelPersonaMember {
  readonly id: PersonaCharacterId
  readonly name: string
  readonly role: string
  readonly state: PersonaWorkUiState
  readonly silhouette?: boolean
  readonly systemRoles?: readonly ('coordination' | 'watchdog' | 'team_manager')[]
  /** Just hired (Gestor plan approved): walks into the strip once, with a "chegou!" bubble (GESTOR-SPEC). */
  readonly arriving?: boolean
  /**
   * SW-7: quantos arquivos a persona já mudou no RASCUNHO da tarefa atual. Só vem do host com `state === 'working'` e
   * pelo menos 1 arquivo mudado; ausente = só "Trabalhando" (resposta/pesquisa não têm rascunho).
   */
  readonly draftFiles?: number
  /**
   * Inside a Janela de silêncio, or the whole team is paused: an idle persona reads "Descansando" and sleeps on the stage. Absent =
   * awake, so an idle persona is "Disponível" (DESIGN-01-MUSE §0.2; `persona-state.ts`).
   */
  readonly quiet?: boolean
  /** Paused on purpose: "Pausada". */
  readonly paused?: boolean
  /** Working on a task in the review column of the board: "Revisando" (`persona-reviewing.ts` reads it from the cards). */
  readonly reviewing?: boolean
  /**
   * COLHEITA §6 (Quill): a frase do passo ("lendo os arquivos"), que o host manda só com `state === 'working'` e quando sabe o passo
   * (`PersonaNowView.sentence`, o mesmo caminho do `draftFiles`). Sem ela a linha do fio diz "Trabalhando". O cliente não inventa.
   */
  readonly step?: string
}

export interface PersonaNowSnapshot {
  readonly member: ChannelPersonaMember
  readonly currentTask?: string
  readonly queueCount: number
}

export interface AwaySummaryEvent {
  readonly id: string
  readonly bodyKey?: ShellKey
  readonly taskLabelKey?: ShellKey
  readonly body?: string
  readonly taskLabel?: string
  readonly taskId?: string
}

export const WORK_STATUS_KEY: Readonly<Record<PersonaWorkUiState, ShellKey>> = {
  working: 'team.statusWorking',
  resting: 'team.statusResting',
  stuck: 'team.statusStuck',
  waiting: 'team.statusWaiting',
}

export function uiStateToPose(state: PersonaWorkUiState): PersonaPoseState {
  if (state === 'working') return 'trabalhando'
  if (state === 'resting') return 'descansando'
  if (state === 'stuck') return 'erro'
  if (state === 'waiting') return 'aguardando-aprovacao'
  return 'disponivel'
}

/** UX-GUIDE §3 overlay SVG id (Brush `icons/overlays/`). */
export type WorkStateOverlayId =
  | 'typing-dots'
  | 'zzz'
  | 'thinking-bubble'
  | 'approval-badge'
  | 'error-badge'
  | 'review-loupe'

export function workStateOverlay(state: PersonaWorkUiState): WorkStateOverlayId {
  if (state === 'working') return 'typing-dots'
  if (state === 'resting') return 'zzz'
  if (state === 'stuck') return 'error-badge'
  return 'approval-badge'
}

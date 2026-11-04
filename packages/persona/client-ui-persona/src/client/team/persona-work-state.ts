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

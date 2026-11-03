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
}

export interface PersonaNowSnapshot {
  readonly member: ChannelPersonaMember
  readonly currentTask?: string
  readonly queueCount: number
}

export interface AwaySummaryEvent {
  readonly id: string
  readonly bodyKey: ShellKey
  readonly taskLabelKey: ShellKey
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
  if (state === 'waiting' || state === 'stuck') return 'aguardando-resposta'
  return 'disponivel'
}

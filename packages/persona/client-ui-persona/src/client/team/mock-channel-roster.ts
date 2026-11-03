import type { PersonaCharacterId, PersonaPoseState } from '../assets/asset-url.ts'

export type ChannelMemberUiState = 'idle' | 'working' | 'waiting'

export interface ChannelPersonaMember {
  readonly id: PersonaCharacterId
  readonly name: string
  readonly role: string
  readonly state: ChannelMemberUiState
  /** Brush asset not ready — show silhouette (RCD: never broken image). */
  readonly silhouette?: boolean
}

export function uiStateToPose(state: ChannelMemberUiState): PersonaPoseState {
  if (state === 'working') return 'trabalhando'
  if (state === 'waiting') return 'aguardando-resposta'
  return 'disponivel'
}

/** Mock roster for #geral until host events drive poses (UX-GUIDE §3). */
export const MOCK_CHANNEL_ROSTER: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working' },
  { id: 'bento', name: 'Bento', role: 'Implementação', state: 'idle' },
  { id: 'nina', name: 'Nina', role: 'Revisão', state: 'waiting' },
  { id: 'sol', name: 'Sol', role: 'Pesquisa', state: 'idle', silhouette: true },
  { id: 'luna', name: 'Luna', role: 'Suporte', state: 'idle', silhouette: true },
]

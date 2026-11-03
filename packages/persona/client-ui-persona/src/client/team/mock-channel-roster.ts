import type { ChannelPersonaMember } from './persona-work-state.ts'

export type { ChannelPersonaMember, PersonaWorkUiState } from './persona-work-state.ts'
export { uiStateToPose } from './persona-work-state.ts'

/** Mock roster for #geral until host events drive poses (UX-GUIDE §3). */
export const MOCK_CHANNEL_ROSTER: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working' },
  { id: 'bento', name: 'Bento', role: 'Implementação', state: 'stuck' },
  { id: 'nina', name: 'Nina', role: 'Revisão', state: 'waiting' },
  { id: 'sol', name: 'Sol', role: 'Pesquisa', state: 'resting' },
  { id: 'luna', name: 'Luna', role: 'Suporte', state: 'resting' },
]

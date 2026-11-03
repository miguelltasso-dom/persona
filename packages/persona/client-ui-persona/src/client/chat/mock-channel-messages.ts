import type { PersonaCharacterId } from '../assets/asset-url.ts'

export interface ChannelMessage {
  readonly id: string
  readonly authorId: PersonaCharacterId | 'user'
  readonly authorName: string
  readonly timeLabel: string
  readonly body: string
  readonly reactions: readonly string[]
}

/** Mock #geral stream (C5b) until persona-host feeds the transcript. */
export const MOCK_GERAL_MESSAGES: readonly ChannelMessage[] = [
  {
    id: 'm1',
    authorId: 'user',
    authorName: 'Miguel',
    timeLabel: '14:02',
    body: 'Preciso fechar a proposta de contratação até amanhã.',
    reactions: [],
  },
  {
    id: 'm2',
    authorId: 'atlas',
    authorName: 'Atlas',
    timeLabel: '14:03',
    body: 'Coloquei no quadro e pedi à Nina uma primeira revisão de cláusulas.',
    reactions: ['👀'],
  },
  {
    id: 'm3',
    authorId: 'nina',
    authorName: 'Nina',
    timeLabel: '14:05',
    body: 'Encontrei dois pontos que precisam da sua aprovação antes de enviar.',
    reactions: ['🙏', '👀'],
  },
]

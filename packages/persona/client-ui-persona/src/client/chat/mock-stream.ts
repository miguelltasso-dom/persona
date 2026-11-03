export interface MockStreamMessage {
  readonly id: string
  readonly author: string
  readonly body: string
  readonly kind: 'user' | 'persona' | 'task'
}

/** Mock channel stream for C5b preview. */
export const MOCK_CHANNEL_STREAM: readonly MockStreamMessage[] = [
  { id: '1', author: 'Miguel', body: 'Preciso revisar o contrato até amanhã.', kind: 'user' },
  { id: '2', author: 'Raposa', body: 'Anotei no quadro e pedi à Coruja uma primeira passagem.', kind: 'persona' },
  { id: '3', author: 'Tarefa', body: 'Revisar cláusulas de rescisão — aguardando você', kind: 'task' },
]

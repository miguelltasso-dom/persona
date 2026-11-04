import type { ActivityItem } from '../primitives/Pooled.tsx'

/** Preview until Anvil exposes gestor audit on `getTeamHealth` (GES-5). */
export const MOCK_GESTOR_AUDIT_ACTIVITY: readonly ActivityItem[] = [
  {
    id: 'g1',
    kind: 'hire',
    title: 'Pipoca · Designer para o projeto Site',
    status: 'done',
  },
  {
    id: 'g2',
    kind: 'file',
    title: 'quadro Site · coluna Revisão',
    status: 'done',
  },
  {
    id: 'g3',
    kind: 'command',
    title: 'alocar Nina na fila de design',
    status: 'failed',
  },
]

export const MOCK_GESTOR_AUDIT_PERSONA = { name: 'Atlas', avatarSrc: undefined } as const

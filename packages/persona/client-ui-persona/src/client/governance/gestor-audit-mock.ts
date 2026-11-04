import type { ActivityItem } from '../primitives/Pooled.tsx'
import { AVATAR_96 } from '../assets/generated-imports.ts'

/**
 * SAMPLE for tests and component previews ONLY. A connected panel must never import this: it would show invented
 * activity ("Pipoca contratada", "alocar Nina falhou") as if the team had done it. (Guarded by connected-team-health-ready.)
 */
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

export const MOCK_GESTOR_AUDIT_PERSONA = { name: 'Atlas', avatarSrc: AVATAR_96.atlas } as const

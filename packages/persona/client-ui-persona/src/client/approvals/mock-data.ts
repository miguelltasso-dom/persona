import type { PersonaProposal } from '@deepseek-ai/dsh-persona-core'

export type ApprovalKind = 'hire' | 'vault' | 'skill' | 'attention'

export interface ApprovalItem {
  readonly id: string
  readonly kind: ApprovalKind
  readonly title: string
  readonly question: string
  readonly primaryKey: string
  readonly hireProposal?: PersonaProposal
}

export const MOCK_APPROVALS: readonly ApprovalItem[] = [
  {
    id: 'ap-hire-1',
    kind: 'hire',
    title: 'Sol',
    question: 'Contratar Sol?',
    primaryKey: 'action.primary.hire',
    hireProposal: {
      id: 'prop-sol',
      workspaceId: 'ws-demo',
      creatorPersonaId: 'persona-atlas',
      policy: 'approval',
      status: 'pending',
      createdAt: '2026-11-03T12:00:00Z',
      spec: {
        name: 'Sol',
        avatar: { kind: 'gallery', ref: 'sol-default' },
        title: 'Suporte',
        description: 'Atendimento ao cliente',
        personality: 'Empática',
        instructions: 'Tom acolhedor',
        runner: { kind: 'cli', cli: 'codex', model: 'gpt' },
        tools: { files: 'read' },
        skills: [],
        limits: {},
        systemRoles: [],
        canRecruit: false,
      },
    },
  },
  {
    id: 'ap-vault-1',
    kind: 'vault',
    title: 'Tom de voz',
    question: 'Atualizar registro no Cofre?',
    primaryKey: 'action.primary.vault',
  },
  {
    id: 'ap-att-1',
    kind: 'attention',
    title: 'Aprovar deploy em staging',
    question: 'Precisa de você nesta tarefa',
    primaryKey: 'action.primary.attention',
  },
]

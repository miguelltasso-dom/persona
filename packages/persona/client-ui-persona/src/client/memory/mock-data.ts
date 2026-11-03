import type { VaultRecord } from '@deepseek-ai/dsh-persona-core'

export type MemoryOrigin = 'conversation' | 'vault' | 'import'

export interface MemoryRow extends VaultRecord {
  readonly uiOrigin: MemoryOrigin
  readonly pendingApproval: boolean
}

export const MOCK_MEMORY_ROWS: readonly MemoryRow[] = [
  {
    id: 'mem-1',
    workspaceId: 'ws-demo',
    kind: 'memory',
    body: 'Miguel prefere revisões de copy às terças de manhã.',
    status: 'active',
    sourceIds: ['evt-12'],
    authorId: 'persona-atlas',
    visibility: { kind: 'workspace' },
    createdAt: '2026-11-02T09:00:00Z',
    revision: 2,
    uiOrigin: 'conversation',
    pendingApproval: false,
  },
  {
    id: 'mem-2',
    workspaceId: 'ws-demo',
    kind: 'memory',
    body: 'Cliente X não quer menção a concorrentes Y/Z.',
    status: 'active',
    sourceIds: ['vault-9'],
    authorId: 'member-miguel',
    visibility: { kind: 'project', projectId: 'proj-site' },
    createdAt: '2026-11-01T15:00:00Z',
    revision: 1,
    uiOrigin: 'vault',
    pendingApproval: true,
  },
]

import type { MemoryView } from '@deepseek-ai/dsh-persona-host/types'
import type { MemoryOrigin, MemoryRow } from '../../memory/mock-data.ts'

/** Host memory rows → profile Memory tab. */
export function memoryViewsToRows(
  views: readonly MemoryView[],
  workspaceId: string,
  projectId: string,
): MemoryRow[] {
  return views.map((view, index) => ({
    id: view.id,
    workspaceId,
    kind: 'memory' as const,
    body: view.body,
    status: view.status === 'revoked' ? 'revoked' as const : 'active' as const,
    sourceIds: [],
    authorId: '—',
    visibility: view.origin === 'vault'
      ? { kind: 'project' as const, projectId }
      : { kind: 'workspace' as const },
    createdAt: '',
    revision: index + 1,
    uiOrigin: view.origin as MemoryOrigin,
    pendingApproval: view.status === 'pending',
  }))
}

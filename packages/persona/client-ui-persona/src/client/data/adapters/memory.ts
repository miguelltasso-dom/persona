import type { MemoryView } from '@deepseek-ai/dsh-persona-host/types'
import type { MemoryOrigin, MemoryRow } from '../../memory/mock-data.ts'

/** Host memory rows → profile Memory tab. */
export function memoryViewsToRows(
  views: readonly MemoryView[],
  workspaceId: string,
  projectId: string,
): MemoryRow[] {
  return views.map((view, index) => {
    // Item 16: a memory the owner asked for carries the message that said it. It reads as a conversation, by the person who said it, for the team
    // (or for the one persona it was said to in a DM).
    const owned = view.source !== undefined
    return {
      id: view.id,
      workspaceId,
      kind: 'memory' as const,
      body: view.body,
      status: view.status === 'revoked' ? 'revoked' as const : 'active' as const,
      sourceIds: [],
      authorId: view.source?.by ?? '—',
      visibility: owned
        ? (view.scope === 'persona' ? { kind: 'persona' as const, personaId: 'dm' } : { kind: 'workspace' as const })
        : view.origin === 'vault'
          ? { kind: 'project' as const, projectId }
          : { kind: 'workspace' as const },
      createdAt: view.source?.at ?? '',
      revision: index + 1,
      uiOrigin: (owned ? 'conversation' : view.origin) as MemoryOrigin,
      pendingApproval: view.status === 'pending',
      ...(view.source === undefined ? {} : { ownerSource: { quote: view.source.quote, by: view.source.by, mine: view.source.mine, at: view.source.at, where: view.source.where, place: view.source.place } }),
      ...(view.rule === true ? { ownerRule: true } : {}),
      ...(view.to === undefined ? {} : { ownerTo: { name: view.to.name } }),
    }
  })
}

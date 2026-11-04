import type { ConversationSubjectScope } from '@deepseek-ai/dsh-persona-host/types'

/** Stable id for a channel or DM stream (W2 assuntos cache key). */
export function conversationStreamKey(streamKind: 'channel' | 'dm', ownerId: string): string {
  return `${streamKind}:${ownerId}`
}

/** Rebuild host scope from {@link conversationStreamKey} + tenant ids. */
export function conversationScopeFromStreamKey(
  streamKey: string,
  workspaceId: string,
  projectId: string,
): ConversationSubjectScope | null {
  const sep = streamKey.indexOf(':')
  if (sep <= 0) return null
  const streamKind = streamKey.slice(0, sep)
  if (streamKind !== 'channel' && streamKind !== 'dm') return null
  const ownerId = streamKey.slice(sep + 1)
  if (ownerId.length === 0) return null
  return { workspaceId, projectId, streamKind, ownerId }
}

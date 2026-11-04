import { useCallback, useMemo, useState } from 'react'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from './conversation-subjects.ts'

const STORAGE = 'persona.message.subject.v1'

function readOverrides(streamKey: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(`${STORAGE}:${streamKey}`)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writeOverrides(streamKey: string, map: Record<string, string>): void {
  try {
    sessionStorage.setItem(`${STORAGE}:${streamKey}`, JSON.stringify(map))
  } catch {
    /* private mode */
  }
}

export function effectiveSubjectId(message: ChannelMessageUi, overrides: Readonly<Record<string, string>>): string {
  return overrides[message.id] ?? message.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID
}

export function applySubjectOverrides(
  messages: readonly ChannelMessageUi[],
  overrides: Readonly<Record<string, string>>,
): readonly ChannelMessageUi[] {
  if (Object.keys(overrides).length === 0) return messages
  return messages.map((row) => {
    const subjectId = overrides[row.id]
    return subjectId === undefined ? row : { ...row, conversationSubjectId: subjectId }
  })
}

/** Client-side move until host RPC tags messages (WAVE2). */
export function useMessageSubjectOverrides(streamKey: string): {
  readonly overrides: Readonly<Record<string, string>>
  readonly applyToMessages: (messages: readonly ChannelMessageUi[]) => readonly ChannelMessageUi[]
  readonly moveMessage: (messageId: string, subjectId: string) => void
  readonly undoMove: (messageId: string) => void
} {
  const [overrides, setOverrides] = useState<Record<string, string>>(() => readOverrides(streamKey))

  const persist = useCallback((next: Record<string, string>) => {
    setOverrides(next)
    writeOverrides(streamKey, next)
  }, [streamKey])

  const moveMessage = useCallback((messageId: string, subjectId: string) => {
    persist({ ...overrides, [messageId]: subjectId })
  }, [overrides, persist])

  const undoMove = useCallback((messageId: string) => {
    const next = { ...overrides }
    delete next[messageId]
    persist(next)
  }, [overrides, persist])

  const applyToMessages = useCallback(
    (messages: readonly ChannelMessageUi[]) => applySubjectOverrides(messages, overrides),
    [overrides],
  )

  return useMemo(() => ({
    overrides,
    applyToMessages,
    moveMessage,
    undoMove,
  }), [applyToMessages, moveMessage, overrides, undoMove])
}

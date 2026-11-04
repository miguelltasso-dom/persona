// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONVERSATION_SUBJECT_ID, DEFAULT_CONVERSATION_SUBJECTS } from '../src/client/chat/conversation-subjects.ts'
import { conversationStreamKey } from '../src/client/chat/conversation-stream-key.ts'
import { useHostConversationSubjects } from '../src/client/chat/use-host-conversation-subjects.ts'
import { PersonaRemoteError } from '../src/client/remote/persona-remote-unwrap.ts'
import type { PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

const SCOPE = {
  workspaceId: 'ws',
  projectId: 'pp',
  streamKind: 'channel' as const,
  ownerId: 'geral',
}

const BUNDLE = {
  subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
  activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
}

function mockLive(fetchImpl: PersonaLiveStore['fetchConversationSubjects']): PersonaLiveStore {
  const streamKey = conversationStreamKey('channel', 'geral')
  return {
    conversationScopeFromKey: (key: string) => (key === streamKey ? SCOPE : null),
    fetchConversationSubjects: fetchImpl,
    selectConversationSubject: vi.fn(async () => BUNDLE),
    createConversationSubject: vi.fn(async () => ({ bundle: BUNDLE, createdSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID })),
    renameConversationSubject: vi.fn(async () => BUNDLE),
    archiveConversationSubject: vi.fn(async () => BUNDLE),
    reopenConversationSubject: vi.fn(async () => BUNDLE),
    moveMessageToSubject: vi.fn(async () => undefined),
  } as unknown as PersonaLiveStore
}

type StreamMessage = {
  readonly id: string
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly timeLabel: string
  readonly reactions: readonly []
}

const SAMPLE_MSG: StreamMessage = { id: 'm1', authorId: 'user', authorName: 'You', body: 'hi', timeLabel: '10:00', reactions: [] }

describe('conversation subjects (no request storm)', () => {
  it('calls list at most once per stream across re-renders', async () => {
    const fetch = vi.fn(async () => BUNDLE)
    const live = mockLive(fetch)
    const streamKey = conversationStreamKey('channel', 'geral')
    const { rerender, unmount } = renderHook(
      ({ messages }: { messages: readonly StreamMessage[] }) => useHostConversationSubjects(live, streamKey, messages),
      { initialProps: { messages: [] as readonly StreamMessage[] } },
    )
    await vi.waitFor(() => { expect(fetch).toHaveBeenCalledTimes(1) })
    rerender({ messages: [SAMPLE_MSG] })
    rerender({ messages: [SAMPLE_MSG] })
    expect(fetch).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('PersonaRemoteError is caught (no unhandled rejection)', async () => {
    const err = new PersonaRemoteError('listConversationSubjects', 'rate-limited', 'limite', 'rate-limited', 400)
    const fetch = vi.fn(async () => { throw err })
    const live = mockLive(fetch)
    const streamKey = conversationStreamKey('channel', 'geral')
    const rejections: unknown[] = []
    const onRejection = (event: PromiseRejectionEvent): void => { rejections.push(event.reason) }
    window.addEventListener('unhandledrejection', onRejection)
    const { result } = renderHook(() => useHostConversationSubjects(live, streamKey, []))
    await vi.waitFor(() => { expect(result.current.subjectsError?.code).toBe('rate-limited') })
    expect(rejections).toHaveLength(0)
    window.removeEventListener('unhandledrejection', onRejection)
  })

})

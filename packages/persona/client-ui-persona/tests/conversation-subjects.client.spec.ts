import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONVERSATION_SUBJECTS,
  DEFAULT_CONVERSATION_SUBJECT_ID,
  filterMessagesForSubject,
} from '../src/client/chat/conversation-subjects.ts'
import { nextFreeSubjectColorIndex } from '../src/client/chat/use-conversation-subjects.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

describe('conversation subjects (WAVE2)', () => {
  it('defaults to Geral only', () => {
    expect(DEFAULT_CONVERSATION_SUBJECTS).toHaveLength(1)
    expect(DEFAULT_CONVERSATION_SUBJECTS[0]?.name).toBe('Geral')
    expect(DEFAULT_CONVERSATION_SUBJECT_ID).toBe('subject-geral')
  })

  it('filters messages by subject tag', () => {
    const messages: ChannelMessageUi[] = [
      { id: '1', authorId: 'user', authorName: 'You', body: 'a', timeLabel: '10:00', reactions: [] },
      { id: '2', authorId: 'user', authorName: 'You', body: 'b', timeLabel: '10:01', reactions: [], conversationSubjectId: 'subject-x' },
    ]
    expect(filterMessagesForSubject(messages, 'subject-x')).toHaveLength(1)
    expect(filterMessagesForSubject(messages, DEFAULT_CONVERSATION_SUBJECT_ID)).toHaveLength(1)
  })

  it('picks the next free color index', () => {
    expect(nextFreeSubjectColorIndex(DEFAULT_CONVERSATION_SUBJECTS, [])).toBe(1)
    expect(nextFreeSubjectColorIndex(
      [{ id: 'a', name: 'A', colorIndex: 0, unreadCount: 0 }, { id: 'b', name: 'B', colorIndex: 1, unreadCount: 0 }],
      [],
    )).toBe(2)
  })
})

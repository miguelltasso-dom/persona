// COLHEITA 18: the pure side of "a conversa da tarefa" — what the host adds to the card and what `openTaskConversation` answers.
import { describe, expect, it } from 'vitest'
import { caringNames, isTaskTopic, mapTaskConversation, mapTaskThread, TASK_TOPIC_PREFIX, unreadBadgeText } from '../src/client/kanban/task-conversation.ts'

describe('isTaskTopic', () => {
  it('only a topic with the task prefix is the conversation of a task', () => {
    expect(TASK_TOPIC_PREFIX).toBe('task:')
    expect(isTaskTopic('task:t-12')).toBe(true)
    expect(isTaskTopic('assunto-1')).toBe(false)
    expect(isTaskTopic('')).toBe(false)
    expect(isTaskTopic(undefined)).toBe(false)
  })
})

describe('mapTaskThread (the card)', () => {
  it('a host that sent no thread gives no badge', () => {
    expect(mapTaskThread({})).toBeUndefined()
    expect(mapTaskThread({ threadTopicId: '  ' })).toBeUndefined()
    expect(mapTaskThread({ threadCount: 4, threadUnread: 2 })).toBeUndefined() // numbers without the topic are not a thread
  })

  it('maps topic, count, unread and the newest seq', () => {
    expect(mapTaskThread({ threadTopicId: 'task:t-1', threadCount: 5, threadUnread: 2, threadLastSeq: 41 })).toEqual({ topicId: 'task:t-1', count: 5, unread: 2, lastSeq: 41 })
  })

  it('numbers from the wire are cleaned: negatives and non-numbers become 0; unread never exceeds the count', () => {
    expect(mapTaskThread({ threadTopicId: 'task:t-1', threadCount: -3, threadUnread: Number.NaN, threadLastSeq: undefined })).toEqual({ topicId: 'task:t-1', count: 0, unread: 0, lastSeq: 0 })
    expect(mapTaskThread({ threadTopicId: 'task:t-1', threadCount: 3, threadUnread: 9, threadLastSeq: 7.9 })).toEqual({ topicId: 'task:t-1', count: 3, unread: 3, lastSeq: 7 })
  })
})

describe('unreadBadgeText', () => {
  it('1–99 as is, then 99+', () => {
    expect(unreadBadgeText(1)).toBe('1')
    expect(unreadBadgeText(99)).toBe('99')
    expect(unreadBadgeText(100)).toBe('99+')
    expect(unreadBadgeText(-4)).toBe('0')
  })
})

describe('mapTaskConversation (openTaskConversation)', () => {
  const wire = { streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', title: ' Post de sexta ', caring: [{ personaId: 'bia', name: ' Bia ' }, { personaId: 'teo', name: 'Téo' }] }

  it('maps where the thread is, its title and who looks after the task (the first is the default addressee)', () => {
    expect(mapTaskConversation(wire)).toEqual({
      streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', title: 'Post de sexta',
      caring: [{ personaId: 'bia', name: 'Bia' }, { personaId: 'teo', name: 'Téo' }],
    })
  })

  it('a DM stream is fine; nobody caring is fine (the composer then writes to the task)', () => {
    expect(mapTaskConversation({ ...wire, streamKind: 'dm', ownerId: 'dm-1', caring: undefined })).toMatchObject({ streamKind: 'dm', ownerId: 'dm-1', caring: [] })
  })

  it('anything that is not what the host promised is undefined (the panel says it could not open)', () => {
    expect(mapTaskConversation(undefined)).toBeUndefined()
    expect(mapTaskConversation('x')).toBeUndefined()
    expect(mapTaskConversation({ ...wire, streamKind: 'task' })).toBeUndefined() // there is no 'task' stream: it is a subject of the Task's own
    expect(mapTaskConversation({ ...wire, ownerId: ' ' })).toBeUndefined()
    expect(mapTaskConversation({ ...wire, topicId: 'assunto-1' })).toBeUndefined()
  })

  it('a caring entry without id or name is dropped, not half-shown', () => {
    expect(mapTaskConversation({ ...wire, caring: [{ personaId: '', name: 'X' }, { personaId: 'a', name: '  ' }, null, 3, { personaId: 'ok', name: 'Lia' }] })?.caring).toEqual([{ personaId: 'ok', name: 'Lia' }])
  })
})

describe('caringNames', () => {
  it('"Bia", "Bia e Téo", "Bia, Téo e Luna"', () => {
    expect(caringNames([{ personaId: 'a', name: 'Bia' }])).toBe('Bia')
    expect(caringNames([{ personaId: 'a', name: 'Bia' }, { personaId: 'b', name: 'Téo' }])).toBe('Bia e Téo')
    expect(caringNames([{ personaId: 'a', name: 'Bia' }, { personaId: 'b', name: 'Téo' }, { personaId: 'c', name: 'Luna' }])).toBe('Bia, Téo e Luna')
  })
})

// @vitest-environment jsdom
// Gauge (ALTA): o "+" do SubjectBar mandava name "" e o host respondia invalid-input — nenhum assunto era criado pela UI.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CONVERSATION_SUBJECT_ID,
  DEFAULT_CONVERSATION_SUBJECTS,
  nextSubjectName,
  type ConversationSubjectUi,
} from '../src/client/chat/conversation-subjects.ts'
import { conversationStreamKey } from '../src/client/chat/conversation-stream-key.ts'
import { useHostConversationSubjects } from '../src/client/chat/use-host-conversation-subjects.ts'
import { PersonaRemoteError } from '../src/client/remote/persona-remote-unwrap.ts'
import type { PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { pt as chatPt, en as chatEn } from '../src/client/locale/chat/locales.ts'

const row = (id: string, name: string, colorIndex: ConversationSubjectUi['colorIndex']): ConversationSubjectUi => ({ id, name, colorIndex, unreadCount: 0 })

describe('nextSubjectName', () => {
  it('"Assunto 2" quando só existe Geral', () => {
    expect(nextSubjectName(DEFAULT_CONVERSATION_SUBJECTS)).toBe('Assunto 2')
  })

  it('pula nomes já usados (ativos e arquivados) e respeita o idioma', () => {
    const active = [row('a', 'Geral', 0), row('b', 'Assunto 3', 1)]
    const archived = [row('c', 'Assunto 4', 2)]
    expect(nextSubjectName(active, archived)).toBe('Assunto 5')
    expect(nextSubjectName([row('a', 'Geral', 0)], [], n => `Topic ${String(n)}`)).toBe('Topic 2')
  })

  it('nunca devolve vazio', () => {
    expect(nextSubjectName([], [])).not.toBe('')
  })

  it('há o texto nos dois idiomas', () => {
    expect(chatPt['subjects.defaultName']).toBe('Assunto {n}')
    expect(chatEn['subjects.defaultName']).toBe('Topic {n}')
  })
})

describe('"+" Novo assunto cria de verdade', () => {
  const SCOPE = { workspaceId: 'ws', projectId: 'pp', streamKind: 'channel' as const, ownerId: 'geral' }
  const STREAM = conversationStreamKey('channel', 'geral')
  const GERAL = [...DEFAULT_CONVERSATION_SUBJECTS]

  /** Host de mentira que recusa nome vazio, como o real. */
  function liveRejectingEmptyNames() {
    const created: string[] = []
    const live = {
      conversationScopeFromKey: (key: string) => (key === STREAM ? SCOPE : null),
      fetchConversationSubjects: vi.fn(async () => ({ subjects: GERAL, activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID })),
      createConversationSubject: vi.fn(async (_scope: unknown, name: string) => {
        if (name.trim() === '') throw new PersonaRemoteError('createConversationSubject', 'gateway/internal', 'invalid-input', 'invalid-input')
        created.push(name)
        const next = row('subject-2', name, 1)
        return { bundle: { subjects: [...GERAL, next], activeSubjectId: next.id }, createdSubjectId: next.id }
      }),
    } as unknown as PersonaLiveStore
    return { live, created }
  }

  it('manda "Assunto 2" (não "") e abre o campo de nome no assunto criado; sem erro na barra', async () => {
    const { live, created } = liveRejectingEmptyNames()
    const { result } = renderHook(() => useHostConversationSubjects(live, STREAM, []))
    await vi.waitFor(() => { expect(result.current.ready).toBe(true) })
    act(() => { result.current.createSubject() })
    await vi.waitFor(() => { expect(result.current.editingSubjectId).toBe('subject-2') })
    expect(created).toEqual(['Assunto 2'])
    expect(result.current.subjects.map(s => s.name)).toEqual(['Geral', 'Assunto 2'])
    expect(result.current.subjectsError).toBeNull()
  })

  it('usa o rótulo do idioma que a tela passa', async () => {
    const { live, created } = liveRejectingEmptyNames()
    const { result } = renderHook(() => useHostConversationSubjects(live, STREAM, [], { defaultName: n => `Topic ${String(n)}` }))
    await vi.waitFor(() => { expect(result.current.ready).toBe(true) })
    act(() => { result.current.createSubject() })
    await vi.waitFor(() => { expect(created).toEqual(['Topic 2']) })
  })
})

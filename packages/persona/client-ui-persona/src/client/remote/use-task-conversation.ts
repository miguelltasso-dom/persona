/**
 * COLHEITA 18 (Prism) — the conversation of ONE task, connected to the host (Forge's wire): `openTaskConversation` says where the thread is
 * (`topicId: 'task:<ticketId>'` inside the stream the Task lives in), `followMessages` with that `topicId` brings ONLY the thread (the usual
 * baseline first, then live frames, so streaming works like in the DM), `postMessage` writes into it and `markTaskThreadRead` clears the
 * unread seal on the card (the host never moves it back).
 *
 * The hook owns its own subscription so the live store of the channel and the DMs is not touched: opening a task never changes which DM is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { mapTaskConversation, type TaskConversationUi } from '../kanban/task-conversation.ts'
import { applyMessageStreamFrame, type MessageStreamFrame } from './apply-message-stream.ts'
import type { ChannelMessageUi } from './map-host-ui.ts'
import type { TeamView } from './persona-remote-types.ts'

export interface TaskConversationScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
}

/** The calls of the host this hook uses (the ones the live store already has, plus the two new ones). */
export interface TaskConversationRemote {
  openTaskConversation?: ((request: { workspaceId: string; projectId: string; ticketId: string }) => unknown) | undefined
  markTaskThreadRead?: ((request: { workspaceId: string; projectId: string; ticketId: string; seq: number }) => unknown) | undefined
  followMessages?: ((
    request: { workspaceId: string; projectId: string; streamKind: 'channel' | 'dm'; ownerId: string; actorId: string; afterSeq: number; limit: number; topicId?: string },
    signal: AbortSignal,
  ) => AsyncIterable<MessageStreamFrame>) | undefined
  postMessage: (request: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    actorId: string
    subjectId: string
    body: string
    attachmentIds?: readonly string[]
    topicId?: string
  }) => unknown
}

export type TaskConversationStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TaskConversationHandle {
  readonly status: TaskConversationStatus
  /** Where the thread is, who looks after the task and its title (once opened). */
  readonly conversation: TaskConversationUi | undefined
  readonly messages: readonly ChannelMessageUi[]
  /** The person writes in the thread. Resolves when the host has it; rejects (so the composer can say "não enviado") when it did not. */
  readonly send: (body: string, attachmentIds?: readonly string[]) => Promise<void>
  /** Try to open again after an error. */
  readonly retry: () => void
}

export interface UseTaskConversationInput {
  readonly remote: TaskConversationRemote
  readonly scope: TaskConversationScope
  readonly team: TeamView | null
  /** The task whose conversation is open; `null` = the panel is closed (nothing is open or followed). */
  readonly ticketId: string | null
  readonly taskTitleById?: ReadonlyMap<string, string> | undefined
  /** A new message id (a counter in tests). */
  readonly newId?: (() => string) | undefined
}

const NO_TITLES: ReadonlyMap<string, string> = new Map()
let counter = 0
const defaultId = (): string => `msg-task-${Date.now()}-${(counter += 1)}`

/**
 * @param input - The remote, the scope, the team (for faces and names) and the open task.
 * @returns The state of the conversation and what the panel can do.
 */
export function useTaskConversation(input: UseTaskConversationInput): TaskConversationHandle {
  const { remote, scope, team, ticketId } = input
  const [status, setStatus] = useState<TaskConversationStatus>('idle')
  const [conversation, setConversation] = useState<TaskConversationUi | undefined>()
  const [messages, setMessages] = useState<readonly ChannelMessageUi[]>([])
  const [attempt, setAttempt] = useState(0)
  // The latest team and titles are read by the stream without restarting it.
  const latest = useRef({ team, titles: input.taskTitleById ?? NO_TITLES, remote, scope })
  latest.current = { team, titles: input.taskTitleById ?? NO_TITLES, remote, scope }
  const readSeq = useRef(0)

  useEffect(() => {
    if (ticketId === null) {
      setStatus('idle')
      setConversation(undefined)
      setMessages([])
      return undefined
    }
    const ac = new AbortController()
    readSeq.current = 0
    setStatus('loading')
    setConversation(undefined)
    setMessages([])
    void (async () => {
      const { remote: host, scope: where } = latest.current
      try {
        if (host.openTaskConversation === undefined || host.followMessages === undefined) throw new Error('task-conversation: unavailable')
        const opened = mapTaskConversation(await Promise.resolve(host.openTaskConversation({ workspaceId: where.workspaceId, projectId: where.projectId, ticketId })))
        if (opened === undefined) throw new Error('task-conversation: unusable answer')
        if (ac.signal.aborted) return
        setConversation(opened)
        setStatus('ready')
        const stream = host.followMessages({
          workspaceId: where.workspaceId, projectId: where.projectId, streamKind: opened.streamKind, ownerId: opened.ownerId,
          actorId: where.memberId, afterSeq: 0, limit: 200, topicId: opened.topicId,
        }, ac.signal)
        for await (const frame of stream) {
          if (ac.signal.aborted) break
          const { team: currentTeam, titles, scope: current } = latest.current
          setMessages(previous => applyMessageStreamFrame(previous, frame, currentTeam ?? { personas: [], members: [] }, current.memberId, titles))
          // The newest seq the person has now seen: the host clears the card's unread seal and never moves it back.
          const top = frame.events.reduce((max, event) => Math.max(max, event.seq), 0)
          if (top > readSeq.current && latest.current.remote.markTaskThreadRead !== undefined) {
            readSeq.current = top
            void Promise.resolve(latest.current.remote.markTaskThreadRead({ workspaceId: current.workspaceId, projectId: current.projectId, ticketId, seq: top })).catch(() => undefined)
          }
        }
      } catch {
        if (!ac.signal.aborted) setStatus(previous => (previous === 'ready' ? previous : 'error'))
      }
    })()
    return () => { ac.abort() }
  }, [ticketId, attempt])

  const send = useCallback(async (body: string, attachmentIds: readonly string[] = []): Promise<void> => {
    const trimmed = body.trim()
    if (ticketId === null || conversation === undefined || (trimmed === '' && attachmentIds.length === 0)) return
    const { remote: host, scope: where } = latest.current
    await Promise.resolve(host.postMessage({
      id: (input.newId ?? defaultId)(),
      workspaceId: where.workspaceId,
      projectId: where.projectId,
      streamKind: conversation.streamKind,
      ownerId: conversation.ownerId,
      actorId: where.memberId,
      subjectId: where.memberId,
      body: trimmed,
      attachmentIds: [...attachmentIds],
      topicId: conversation.topicId,
    }))
  }, [conversation, input.newId, ticketId])

  const retry = useCallback(() => { setAttempt(value => value + 1) }, [])
  return { status, conversation, messages, send, retry }
}

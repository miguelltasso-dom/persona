/**
 * COLHEITA 18 (Muse §18) — "A conversa da tarefa" connected to the board: the side panel with the SAME message list and composer the DM uses,
 * fed by `useTaskConversation` (the thread of the task is a subject of the stream the Task lives in: `topicId = 'task:<ticketId>'`).
 *
 * States, all honest: opening ("Abrindo a conversa…"), could not open ("Tentar de novo"), empty (the animal with the card in hand and what to
 * do next), and the thread. Writing goes to whoever looks after the task (the host routes it); a failed send says so and keeps the text.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ChannelComposer } from '../chat/ChannelComposer.tsx'
import { MessageList } from '../chat/GeneralChannelView.tsx'
import { pt as chatPt } from '../locale/chat/locales.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { Button, Notice } from '../primitives/index.ts'
import { TaskConversationEmpty, TaskConversationPanel, type TaskConversationTab } from '../kanban/TaskConversationPanel.tsx'
import type { KanbanCardModel } from '../kanban/types.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { TeamView } from './persona-remote-types.ts'
import { useTaskConversation, type TaskConversationRemote, type TaskConversationScope } from './use-task-conversation.ts'
import styles from './ConnectedTaskConversation.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** What the board needs to open the conversation of a task (absent = the cards simply do not open it). */
export interface TaskConversationBridge {
  readonly remote: TaskConversationRemote
  readonly scope: TaskConversationScope
  readonly team: TeamView | null
  /** The host's `attachFile`; without it the composer has no clip (no dead control). */
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
}

/**
 * @param client - The host's remote client.
 * @param tenant - Who is looking: the workspace, the project and the member.
 * @param team - The team (faces and names of the thread).
 * @returns The bridge when the host has the calls of the conversation of a task (`openTaskConversation`, `followMessages`, `postMessage`),
 *   else `undefined`: the cards then do not open a conversation (no dead click).
 */
export function taskConversationBridgeOf(
  client: PersonaRemoteClient,
  tenant: TaskConversationScope | null,
  team: TeamView | null,
): TaskConversationBridge | undefined {
  const host = client as Partial<TaskConversationRemote>
  if (tenant === null || typeof host.openTaskConversation !== 'function' || typeof host.followMessages !== 'function' || typeof host.postMessage !== 'function') return undefined
  return { remote: host as TaskConversationRemote, scope: tenant, team }
}

export interface ConnectedTaskConversationProps {
  readonly bridge: TaskConversationBridge
  readonly kanbanDict: LocaleDict
  /** The card that opened it (its title, column, project…). */
  readonly card: KanbanCardModel
  readonly columnLabel?: string | undefined
  readonly onClose: () => void
  readonly returnFocusTo?: (() => HTMLElement | null) | undefined
}

const chatT: ChatT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt as LocaleDict, key, params)) as ChatT

function Details({ dict, card, columnLabel }: { readonly dict: LocaleDict; readonly card: KanbanCardModel; readonly columnLabel?: string | undefined }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    <dl className={styles.details}>
      <div><dt>{t('thread.detail.project')}</dt><dd>{card.projectName}</dd></div>
      {columnLabel !== undefined && columnLabel !== '' && <div><dt>{t('thread.detail.column')}</dt><dd>{columnLabel}</dd></div>}
      {card.assignee !== undefined && <div><dt>{t('thread.detail.assignee')}</dt><dd>{card.assignee.name}</dd></div>}
      {card.dueLabel !== undefined && <div><dt>{t('thread.detail.due')}</dt><dd>{card.dueLabel}</dd></div>}
      {card.flowFields?.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
    </dl>
  )
}

export function ConnectedTaskConversation({ bridge, kanbanDict, card, columnLabel, onClose, returnFocusTo }: ConnectedTaskConversationProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(kanbanDict, key, params)
  const handle = useTaskConversation({ remote: bridge.remote, scope: bridge.scope, team: bridge.team, ticketId: card.id })
  const [tab, setTab] = useState<TaskConversationTab>('conversation')
  const [sendFailed, setSendFailed] = useState(false)
  const caring = handle.conversation?.caring ?? []
  const first = caring[0]

  const body = ((): ReactNode => {
    if (handle.status === 'loading' || handle.status === 'idle') return <p className={styles.note} role="status">{t('thread.loading')}</p>
    if (handle.status === 'error') {
      return (
        <div className={styles.note} role="alert">
          <p>{t('thread.error')}</p>
          <Button size="s" variant="secondary" onClick={handle.retry}>{t('thread.retry')}</Button>
        </div>
      )
    }
    return handle.messages.length === 0
      ? <TaskConversationEmpty dict={kanbanDict} />
      : <div className={styles.messages}><MessageList t={chatT} team={bridge.team} messages={handle.messages} memberId={bridge.scope.memberId} /></div>
  })()

  return (
    <TaskConversationPanel
      dict={kanbanDict}
      title={card.title}
      columnLabel={columnLabel}
      caring={caring}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      details={<Details dict={kanbanDict} card={card} columnLabel={columnLabel} />}
      conversation={(
        <div className={styles.conversation}>
          {body}
          {handle.status === 'ready' && (
            <div className={styles.composer}>
              {sendFailed && <Notice tone="warning">{t('thread.sendFailed')}</Notice>}
              <ChannelComposer
                t={chatT}
                conversationKey={`task:${card.id}`}
                placeholder={first === undefined ? t('thread.composer.placeholderNobody') : t('thread.composer.placeholder', { name: first.name })}
                responderHidden
                {...(bridge.uploadAttachment === undefined ? {} : { uploadAttachment: bridge.uploadAttachment })}
                onSend={(text, attachmentIds) => {
                  setSendFailed(false)
                  void handle.send(text, attachmentIds).catch(() => { setSendFailed(true) })
                }}
              />
            </div>
          )}
        </div>
      )}
    />
  )
}

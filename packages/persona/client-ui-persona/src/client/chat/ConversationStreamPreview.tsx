import type { ReactNode } from 'react'
import { PersonaPanel } from '../primitives/index.ts'
import type { MockStreamMessage } from './mock-stream.ts'
import styles from './ConversationStreamPreview.module.css'

export interface ConversationStreamPreviewProps {
  readonly messages: readonly MockStreamMessage[]
  readonly streamLabel: string
}

/** Read-only mock stream (C5b) until session events feed the transcript. */
export function ConversationStreamPreview({ messages, streamLabel }: ConversationStreamPreviewProps): ReactNode {
  return (
    <div className={styles.stream} role="log" aria-label={streamLabel}>
      <ol className={styles.list}>
        {messages.map(message => (
          <li
            key={message.id}
            className={styles.item}
            data-kind={message.kind}
          >
            {message.kind === 'task' ? (
              <PersonaPanel>
                <p className={styles.taskTitle}>{message.author}</p>
                <p>{message.body}</p>
              </PersonaPanel>
            ) : (
              <>
                <span className={styles.author}>{message.author}</span>
                <p className={styles.body}>{message.body}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

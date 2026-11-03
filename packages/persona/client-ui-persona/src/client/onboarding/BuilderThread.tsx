import type { ReactNode } from 'react'
import { StaggerEntrance } from '../primitives/index.ts'
import type { BuilderMessage } from './create-onboarding-store.ts'
import styles from './OnboardingWizard.module.css'

export interface BuilderThreadProps {
  readonly messages: readonly BuilderMessage[]
  readonly userLabel: string
  readonly coordinatorLabel: string
}

/** Conversational builder transcript (mock coordinator replies). */
export function BuilderThread({ messages, userLabel, coordinatorLabel }: BuilderThreadProps): ReactNode {
  if (messages.length === 0) return null
  return (
    <ul className={styles.builderThread} aria-live="polite">
      {messages.map((message, index) => (
        <StaggerEntrance key={message.id} index={index}>
          <li className={message.role === 'user' ? styles.builderUser : styles.builderCoordinator}>
            <span className={styles.builderAuthor}>
              {message.role === 'user' ? userLabel : coordinatorLabel}
            </span>
            <p className={styles.builderBody}>{message.body}</p>
          </li>
        </StaggerEntrance>
      ))}
    </ul>
  )
}

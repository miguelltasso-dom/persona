import type { ReactNode } from 'react'
import { StaggerEntrance } from '../primitives/index.ts'
import styles from './OnboardingWizard.module.css'

export interface IntroLine {
  readonly speaker: string
  readonly text: string
}

export interface TeamIntroQueueProps {
  readonly lines: readonly IntroLine[]
  readonly greetingName: string
}

/** Step 5: teammates introduce themselves in staggered queue (UX-GUIDE §3 onboarding). */
export function TeamIntroQueue({ lines, greetingName }: TeamIntroQueueProps): ReactNode {
  return (
    <ul className={styles.introList} aria-label={greetingName}>
      {lines.map((line, index) => (
        <StaggerEntrance key={line.speaker} index={index}>
          <li className={styles.introItem}>
            <div className={styles.introAvatar} aria-hidden="true" />
            <div>
              <div className={styles.introSpeaker}>{line.speaker}</div>
              <div>{line.text}</div>
            </div>
          </li>
        </StaggerEntrance>
      ))}
    </ul>
  )
}

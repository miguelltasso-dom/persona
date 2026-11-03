import type { ReactNode } from 'react'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, StaggerEntrance } from '../primitives/index.ts'
import styles from './OnboardingWizard.module.css'

export interface IntroLine {
  readonly speaker: string
  readonly text: string
}

export interface TeamIntroQueueProps {
  readonly lines: readonly IntroLine[]
  readonly greetingName: string
}

function portraitOf(speaker: string): string | undefined {
  return (AVATAR_96 as Readonly<Record<string, string>>)[speaker.toLowerCase()]
}

/** Step 5: teammates introduce themselves in a staggered queue (UX-GUIDE §3 onboarding). */
export function TeamIntroQueue({ lines, greetingName }: TeamIntroQueueProps): ReactNode {
  return (
    <ul className={styles.introList} aria-label={greetingName}>
      {lines.map((line, index) => (
        <StaggerEntrance key={line.speaker} index={index}>
          <li className={styles.introItem}>
            <Avatar name={line.speaker} src={portraitOf(line.speaker)} size={48} decorative />
            <div>
              <div className={styles.introSpeaker}>{line.speaker}</div>
              <p className={styles.introText}>{line.text}</p>
            </div>
          </li>
        </StaggerEntrance>
      ))}
    </ul>
  )
}

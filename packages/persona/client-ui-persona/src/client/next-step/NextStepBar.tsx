/**
 * P1-6 "Próximo passo" (`NEXT-STEP-SHORTCUTS-SPEC.md` §1) — one line right below `ScreenHeader` answering
 * "o que eu faço agora aqui?". Uses `Notice tone="info" icon="sparkle"`, `Avatar` portrait 24 when a persona
 * suggests it, one `Button size="s" variant="secondary"`, and a ghost ✕ "Agora não" that hides it for 24h on that screen.
 * At 200% zoom, `.row` wraps into 2 lines so the action and ✕ drop below the sentence.
 */

import { useState, type ReactNode } from 'react'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { Avatar, Button, Notice } from '../primitives/index.ts'
import { isNextStepEnabled } from './next-step-flag.ts'
import {
  DEFAULT_NEXT_STEP_COPY_PT,
  dismissNextStep,
  nextStepFor,
  type NextStepCopy,
  type NextStepRecommendation,
  type NextStepScreenId,
  type NextStepState,
} from './next-step-model.ts'
import styles from './NextStepBar.module.css'

export interface NextStepBarProps {
  readonly screen: NextStepScreenId
  readonly state: NextStepState
  readonly copy?: NextStepCopy | undefined
  readonly dismissLabel?: string | undefined
  readonly onAction?: ((recommendation: NextStepRecommendation) => void) | undefined
  readonly onDismiss?: ((screen: NextStepScreenId) => void) | undefined
}

export function NextStepBar({
  screen,
  state,
  copy = DEFAULT_NEXT_STEP_COPY_PT,
  dismissLabel = 'Agora não',
  onAction,
  onDismiss,
}: NextStepBarProps): ReactNode {
  const [dismissedLocal, setDismissedLocal] = useState(false)
  if (!isNextStepEnabled() || dismissedLocal) return null

  const recommendation = nextStepFor(screen, state, copy)
  if (recommendation === null) return null

  const avatarSrc = recommendation.personaAvatarSrc
    ?? (recommendation.personaName !== undefined
      ? personaPortraitSrc(recommendation.personaCharacterId, recommendation.personaName)
      : undefined)

  const handleDismiss = (): void => {
    dismissNextStep(screen, state.nowMs)
    setDismissedLocal(true)
    onDismiss?.(screen)
  }

  return (
    <div className={styles.bar} data-persona-next-step={screen} data-next-step-kind={recommendation.kind}>
      <Notice tone="info" icon="sparkle">
        <div className={styles.row}>
          <div className={styles.lead}>
            {recommendation.personaName !== undefined && (
              <Avatar
                name={recommendation.personaName}
                size={24}
                shape="portrait"
                decorative
                {...(avatarSrc === undefined ? {} : { src: avatarSrc })}
              />
            )}
            <span className={styles.text}>{recommendation.text}</span>
          </div>
          <div className={styles.actions}>
            <Button
              size="s"
              variant="secondary"
              onClick={() => { onAction?.(recommendation) }}
            >
              {recommendation.actionLabel}
            </Button>
            <Button
              size="s"
              variant="ghost"
              aria-label={dismissLabel}
              onClick={handleDismiss}
            >
              ✕ {dismissLabel}
            </Button>
          </div>
        </div>
      </Notice>
    </div>
  )
}

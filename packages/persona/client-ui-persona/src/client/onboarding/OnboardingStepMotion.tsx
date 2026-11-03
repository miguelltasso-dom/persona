import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'

export interface OnboardingStepMotionProps {
  readonly step: number
  children: ReactNode
}

/** Crossfade/slide when onboarding step changes. */
export function OnboardingStepMotion({ step, children }: OnboardingStepMotionProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 6 })
  return (
    <div key={step} ref={motion.ref} style={motion.style}>
      {children}
    </div>
  )
}

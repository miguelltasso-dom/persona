import type { ReactNode } from 'react'
import { IconButton } from '../primitives/index.ts'

export interface ComposerToolButtonProps {
  readonly label: string
  readonly comingSoonLabel: string
  readonly icon: ReactNode
  readonly enabled: boolean
  readonly className?: string | undefined
  readonly onActivate?: (() => void) | undefined
}

/** Toolbar icon: disabled with honest “coming soon” until host attachments exist. */
export function ComposerToolButton({
  label,
  comingSoonLabel,
  icon,
  enabled,
  className,
  onActivate,
}: ComposerToolButtonProps): ReactNode {
  if (!enabled) {
    const disabledLabel = `${label} — ${comingSoonLabel}`
    return (
      <IconButton
        size="s"
        variant="secondary"
        className={className}
        icon={icon}
        label={disabledLabel}
        disabled={true}
        aria-disabled={true}
        tabIndex={-1}
        onClick={(event) => { event.preventDefault() }}
      />
    )
  }
  return (
    <IconButton
      size="s"
      variant="secondary"
      className={className}
      icon={icon}
      label={label}
      onClick={() => { onActivate?.() }}
    />
  )
}

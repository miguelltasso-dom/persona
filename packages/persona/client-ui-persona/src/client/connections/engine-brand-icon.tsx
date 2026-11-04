import type { CSSProperties, ReactNode } from 'react'
import { ENGINE_ICONS } from '../assets/generated-imports.ts'
import iconStyles from '../primitives/Icon.module.css'

/** Brush engine seal (ENGINE_ICONS) tinted with currentColor. */
export function EngineBrandIcon({ engineId, size = 22, className }: {
  readonly engineId: string
  readonly size?: number
  readonly className?: string | undefined
}): ReactNode {
  const url = ENGINE_ICONS[engineId]
  if (url === undefined) return null
  const style = {
    '--persona-icon-url': `url("${url}")`,
    '--persona-icon-size': `${size}px`,
  } as CSSProperties
  const merged = className === undefined ? iconStyles.brand : `${iconStyles.brand} ${className}`
  return <span className={merged} style={style} aria-hidden="true" />
}

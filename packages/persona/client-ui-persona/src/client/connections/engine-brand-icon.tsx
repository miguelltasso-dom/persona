import type { ReactNode } from 'react'
import { ENGINE_ICONS } from '../assets/generated-imports.ts'

/**
 * Brush engine seal (ENGINE_ICONS) in its own colours. These SVGs carry their own disc and outline, so they are drawn as an
 * image: used as a mask they flatten into one lilac disc, and the provider is no longer recognisable.
 */
export function EngineBrandIcon({ engineId, size = 22, className }: {
  readonly engineId: string
  readonly size?: number
  readonly className?: string | undefined
}): ReactNode {
  const url = ENGINE_ICONS[engineId]
  if (url === undefined) return null
  return <img className={className} src={url} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
}

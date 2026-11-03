/** Workflow model seal: Brush `FLOW_ICONS` when wired, else BrandIcon kanban / UiIcon fallback. */

import type { CSSProperties, ReactNode } from 'react'
import { FLOW_ICONS } from '../assets/generated-imports.ts'
import { BrandIcon, UiIcon } from '../primitives/index.ts'
import { flowModelMeta } from './flow-models.ts'
import type { FlowModelId } from './types.ts'
import iconStyles from '../primitives/Icon.module.css'

export interface FlowModelIconProps {
  readonly modelId: FlowModelId
  readonly size?: number
}

export function FlowModelIcon({ modelId, size = 22 }: FlowModelIconProps): ReactNode {
  const brushKey = `flow-${modelId}`
  const brushUrl = FLOW_ICONS[brushKey]
  if (brushUrl !== undefined && brushUrl.length > 0) {
    const style = {
      '--persona-icon-url': `url("${brushUrl}")`,
      '--persona-icon-size': `${size}px`,
    } as CSSProperties
    return <span className={iconStyles.brand} style={style} aria-hidden="true" />
  }
  const meta = flowModelMeta(modelId)
  if (meta.brandIcon !== undefined) {
    return <BrandIcon name={meta.brandIcon} size={size} />
  }
  return <UiIcon name={meta.uiIcon ?? 'check'} size={size} strokeWidth={1.75} />
}

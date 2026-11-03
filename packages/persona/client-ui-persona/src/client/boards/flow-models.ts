import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { BrandIconName, UiIconName } from '../primitives/icons.tsx'
import type { FlowModelId } from './types.ts'

export interface FlowModelMeta {
  readonly id: FlowModelId
  readonly brandIcon?: BrandIconName
  readonly uiIcon?: UiIconName
}

export const FLOW_MODELS: readonly FlowModelMeta[] = [
  { id: 'contratacao', brandIcon: 'equipe' },
  { id: 'site', uiIcon: 'sparkle' },
  { id: 'software', brandIcon: 'kanban' },
  { id: 'marketing', uiIcon: 'sparkle' },
  { id: 'atendimento', brandIcon: 'conversa' },
  { id: 'simples', uiIcon: 'check' },
  { id: 'branco', uiIcon: 'plus' },
] as const

export function flowModelLabel(dict: LocaleDict, id: FlowModelId): string {
  return bindLocale(dict, `flowModel.${id}`)
}

export function flowModelMeta(id: FlowModelId): FlowModelMeta {
  return FLOW_MODELS.find(row => row.id === id) ?? { id: 'simples', uiIcon: 'check' }
}

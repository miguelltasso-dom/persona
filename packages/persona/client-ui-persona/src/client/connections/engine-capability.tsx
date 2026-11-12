/**
 * Selo honesto de capacidade por motor (D-103a; Muse §5.2 #12). Claude tem capacidade completa. Codex, Cursor e OpenCode
 * só leem nos conectores, e a tela diz isso. O DeepSeek não ganha selo: o D-103a não cobre esse motor.
 */
import type { ReactNode } from 'react'
import { Chip, UiIcon } from '../primitives/index.ts'
import styles from './Connections.module.css'

export type EngineCapability = 'full' | 'read-only'

export function engineCapability(provider: string): EngineCapability | undefined {
  if (provider === 'claude') return 'full'
  if (provider === 'codex' || provider === 'cursor' || provider === 'opencode') return 'read-only'
  return undefined
}

interface EngineCapabilityProps {
  readonly provider: string
  readonly t: (key: string) => string
  /** The engine as the person reads it ("Codex"); the note names it. Absent = the provider id. */
  readonly name?: string
}

/** Chip no cabeçalho do cartão do motor. O ícone é o UiIcon; o texto não leva ✓ nem ⚠. */
export function EngineCapabilityChip({ provider, t }: EngineCapabilityProps): ReactNode {
  const capability = engineCapability(provider)
  if (capability === undefined) return null
  const full = capability === 'full'
  return (
    <Chip tone={full ? 'success' : 'neutral'} size="m" icon={<UiIcon name={full ? 'check' : 'eye'} size={14} />}>
      {t(full ? 'capability.full' : 'capability.readOnly')}
    </Chip>
  )
}

/** O aviso que o D-103a pede na tela para quem só lê: fica no cartão, não só no chip. */
export function EngineCapabilityNote({ provider, t, name }: EngineCapabilityProps): ReactNode {
  if (engineCapability(provider) !== 'read-only') return null
  return <p className={styles.note}>{t('capability.readOnly.note').replace('{engine}', name ?? provider)}</p>
}

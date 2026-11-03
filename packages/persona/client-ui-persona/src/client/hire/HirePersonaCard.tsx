/** "Contratar {name}?" proposal card preview. */

import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaButton, PersonaMuted } from '../primitives/index.ts'
import styles from './HirePersonaCard.module.css'

export interface HireProposalPreview {
  readonly name: string
  readonly creator: string
  readonly role: string
  readonly harness: string
  readonly toolsSummary: string
}

export const MOCK_HIRE_PROPOSAL: HireProposalPreview = {
  name: 'Sol',
  creator: 'Atlas',
  role: 'Suporte ao cliente',
  harness: 'oar:codex',
  toolsSummary: 'Arquivos: leitura · Web: leitura',
}

export interface HirePersonaCardProps {
  readonly dict: LocaleDict
  readonly proposal?: HireProposalPreview
}

/** Agent-created persona proposal with edit-before-hire actions. */
export function HirePersonaCard({ dict, proposal = MOCK_HIRE_PROPOSAL }: HirePersonaCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 6 })

  return (
    <article className={styles.card} ref={motion.ref} style={motion.style} aria-labelledby="hire-title">
      <h1 id="hire-title" className={styles.title}>{t('title', { name: proposal.name })}</h1>
      <p className={styles.subtitle}>{t('subtitle', { creator: proposal.creator })}</p>
      <PersonaMuted>{t('editBeforeHire')}</PersonaMuted>
      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt className={styles.metaLabel}>{t('field.role')}</dt>
          <dd>{proposal.role}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt className={styles.metaLabel}>{t('field.harness')}</dt>
          <dd>{proposal.harness}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt className={styles.metaLabel}>{t('field.tools')}</dt>
          <dd>{proposal.toolsSummary}</dd>
        </div>
      </dl>
      <p className={styles.policy}>{t('policy.note')}</p>
      <div className={styles.actions}>
        <PersonaButton>{t('action.approve')}</PersonaButton>
        <PersonaButton variant="secondary">{t('action.edit')}</PersonaButton>
        <PersonaButton variant="secondary">{t('action.dismiss')}</PersonaButton>
      </div>
    </article>
  )
}

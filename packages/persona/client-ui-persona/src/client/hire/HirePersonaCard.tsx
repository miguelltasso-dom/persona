/** "Contratar {name}?" proposal card preview. */

import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { Avatar, Button, Chip } from '../primitives/index.ts'
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

  const portrait = (AVATAR_96 as Readonly<Record<string, string>>)[proposal.name.trim().toLowerCase()]
  const pose = poseUrl(proposal.name.trim().toLowerCase() as PersonaCharacterId, 'acenando')

  return (
    <article className={styles.card} ref={motion.ref} style={motion.style} aria-labelledby="hire-title">
      <div className={styles.stage} aria-hidden="true">
        {pose !== undefined ? <img className={styles.pose} src={pose} alt="" /> : <Avatar name={proposal.name} src={portrait} size={96} decorative />}
      </div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{t('subtitle', { creator: proposal.creator })}</p>
        <h1 id="hire-title" className={styles.title}>{t('title', { name: proposal.name })}</h1>
        <p className={styles.hint}>{t('editBeforeHire')}</p>
        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>{t('field.role')}</dt>
            <dd><Chip tone="brand">{proposal.role}</Chip></dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>{t('field.harness')}</dt>
            <dd><Chip tone="plain">{proposal.harness}</Chip></dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>{t('field.tools')}</dt>
            <dd className={styles.tools}>
              {proposal.toolsSummary.split('·').map(tool => <Chip key={tool} size="s" tone="neutral">{tool.trim()}</Chip>)}
            </dd>
          </div>
        </dl>
        <p className={styles.policy}>{t('policy.note')}</p>
        <div className={styles.actions}>
          <Button variant="primary">{t('action.approve')}</Button>
          <Button variant="secondary">{t('action.edit')}</Button>
          <Button variant="ghost">{t('action.dismiss')}</Button>
        </div>
      </div>
    </article>
  )
}

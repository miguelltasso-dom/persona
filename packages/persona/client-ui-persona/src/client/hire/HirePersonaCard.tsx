/** "Contratar {name}?" proposal card preview. */

import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { Avatar, Button, Chip } from '../primitives/index.ts'
import { humanizeEngineLabel } from '../team/engine-label.ts'
import styles from './HirePersonaCard.module.css'

export interface HireProposalPreview {
  readonly name: string
  /** O bicho da proposta (galeria). Sem ele, cai no nome — mas o retrato é do bicho, não do nome. */
  readonly avatarRef?: string | undefined
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
  /** Sem handler, o botão não aparece (DESIGN-SYSTEM §9: botão sem ação não existe). */
  readonly onApprove?: (() => void) | undefined
  readonly onEdit?: (() => void) | undefined
  readonly onDismiss?: (() => void) | undefined
}

/** Agent-created persona proposal with edit-before-hire actions. */
export function HirePersonaCard({ dict, proposal = MOCK_HIRE_PROPOSAL, onApprove, onEdit, onDismiss }: HirePersonaCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 6 })

  const animal = (proposal.avatarRef ?? proposal.name).trim().toLowerCase()
  const portrait = (AVATAR_96 as Readonly<Record<string, string>>)[animal]
  const pose = poseUrl(animal as PersonaCharacterId, 'acenando')

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
            <dd><Chip tone="plain">{humanizeEngineLabel(proposal.harness)}</Chip></dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>{t('field.tools')}</dt>
            <dd className={styles.tools}>
              {proposal.toolsSummary.split('·').map(tool => <Chip key={tool} size="s" tone="neutral">{tool.trim()}</Chip>)}
            </dd>
          </div>
        </dl>
        <p className={styles.policy}>{t('policy.note')}</p>
        {(onApprove !== undefined || onEdit !== undefined || onDismiss !== undefined) && (
          <div className={styles.actions}>
            {onApprove !== undefined && <Button variant="primary" onClick={onApprove}>{t('action.approve')}</Button>}
            {onEdit !== undefined && <Button variant="secondary" onClick={onEdit}>{t('action.edit')}</Button>}
            {onDismiss !== undefined && <Button variant="ghost" onClick={onDismiss}>{t('action.dismiss')}</Button>}
          </div>
        )}
      </div>
    </article>
  )
}

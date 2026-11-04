/**
 * The right pane of the Aprovações inbox: what the selected card is about, and Aprovar · Dispensar · Ver detalhes
 * (REVIEW-APPROVALS-REDESIGN §2). Hire: the proposed animal's pose; Cofre: before → after; proposals: the one-line
 * question and its impact. Only what the host sent is shown: no line is invented for a missing field.
 */

import type { ReactNode } from 'react'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import {
  ApprovedStamp,
  Avatar,
  BrandIcon,
  Button,
  Chip,
  RememberPermission,
  Tooltip,
  formatWhen,
  type PermissionScope,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { DecisionStateNote } from '../decisions/DecisionStateNote.tsx'
import styles from './Inbox.module.css'
import {
  approvalHireVisual,
  hireMonthlyTasksLine,
  hireWhyLine,
  personaPortraitSrc,
  proactiveCostLine,
  proactiveImpactDetail,
  reactiveApprovalContext,
} from './approvals-ui-helpers.ts'
import { HireDetailsModal } from './HireDetailsModal.tsx'
import type { InboxRow, RememberChoice } from './inbox-model.ts'

export interface InboxDetailProps {
  readonly dict: LocaleDict
  readonly row: InboxRow
  readonly scope: PermissionScope | undefined
  readonly choice: RememberChoice
  readonly onRememberChange: (patch: Partial<RememberChoice>) => void
  readonly rememberStampNote: string | null
  /** The accepted stamp is on screen for this card. */
  readonly stamped: boolean
  /** The card is leaving (accepted or set aside): its buttons are off. */
  readonly leaving: boolean
  readonly deciding: boolean
  /** Legacy local cycle: another card's stamp is still running, so no new decision starts. */
  readonly locked: boolean
  readonly canDecide: boolean
  readonly onApprove: () => void
  readonly onDismiss: () => void
  /** The hire's "Ver detalhes" dialog (owned by the screen so the Enter key can open it too). */
  readonly detailsOpen: boolean
  readonly onDetailsChange: (open: boolean) => void
  /** One-pane layout only: back to the list. */
  readonly onBack?: (() => void) | undefined
  readonly focusHighlight: boolean
}

export function InboxDetail({
  dict, row, scope, choice, onRememberChange, rememberStampNote, stamped, leaving, deciding, locked, canDecide, onApprove, onDismiss, detailsOpen, onDetailsChange, onBack, focusHighlight,
}: InboxDetailProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const item = row.item
  const proposal = row.proposal
  const isHire = item?.kind === 'hire'
  const proposerFace = personaPortraitSrc(row.proposerPersonaId, row.proposerName)
    ?? personaPortraitSrc(row.proposerCharacterId, row.proposerName)
    ?? personaPortraitSrc(undefined, row.proposerName)
  const hireVisual = item === undefined ? undefined : approvalHireVisual(item)
  const pose = isHire && item?.hirePortraitKey !== undefined ? poseUrl(item.hirePortraitKey as PersonaCharacterId, 'disponivel') : undefined
  const role = item?.hireRoleTitle?.trim() ?? ''
  const blockedBy = item?.dependsOnTitle?.trim() ?? ''
  const blocked = blockedBy.length > 0
  const state = row.state
  const when = row.at === undefined || row.at.length === 0 ? '' : formatWhen(row.at)
  const whyLine = item !== undefined && isHire ? hireWhyLine(dict, item) : undefined
  // Cost only when the host measured it: a hire's tasks per month, or a proposal's own estimate. "Sem estimativa" is no line.
  const proposalCost = proposal === undefined ? undefined : proactiveCostLine(dict, proposal.cost)
  const costText = item !== undefined && isHire
    ? hireMonthlyTasksLine(dict, item)
    : proposalCost !== undefined && !proposalCost.muted ? proposalCost.text : undefined
  const change = item?.kind === 'vault' && (item.vaultBefore ?? '').length > 0 && (item.vaultAfter ?? '').length > 0
    ? { field: item.vaultField ?? '', before: item.vaultBefore ?? '', after: item.vaultAfter ?? '' }
    : undefined
  const primaryLabel = item !== undefined ? t(item.primaryKey) : t('proactive.action.accept')

  const stage = (() => {
    if (isHire && pose !== undefined) return <img className={styles.detailPose} src={pose} alt="" />
    if (isHire && hireVisual?.kind === 'portrait') return <Avatar name={row.title} size={96} shape="portrait" decorative src={hireVisual.src} />
    if (isHire) return <BrandIcon name="convidar" size={56} />
    return undefined
  })()

  return (
    <article
      className={`${styles.detail}${focusHighlight ? ` ${styles.focusHighlight}` : ''}`}
      aria-labelledby={`inbox-detail-title-${row.id}`}
      data-persona-approval-detail={row.id}
      data-focus-highlight={focusHighlight ? '' : undefined}
    >
      {stamped && (
        <div className={styles.stampSlot}>
          <ApprovedStamp label={t('stamp.approved')} animate />
          {rememberStampNote !== null && <p className={styles.sectionBody}>{rememberStampNote}</p>}
        </div>
      )}
      {onBack !== undefined && (
        <Button className={styles.detailBack} variant="ghost" size="s" onClick={onBack}>{t('inbox.back')}</Button>
      )}
      {stage !== undefined && <div className={styles.detailStage} aria-hidden="true">{stage}</div>}
      <div className={styles.detailHead}>
        {stage === undefined && (
          <Avatar name={row.proposerName.length > 0 ? row.proposerName : row.title} size={56} shape="portrait" decorative {...(proposerFace === undefined ? {} : { src: proposerFace })} />
        )}
        <div>
          <Chip tone="accent" size="s">{t(`type.${row.kind}`)}</Chip>
          <h2 id={`inbox-detail-title-${row.id}`} className={styles.detailTitle}>{row.title}</h2>
          {isHire && role.length > 0 && item !== undefined && <p className={styles.proposer}><strong>{item.title}</strong></p>}
        </div>
      </div>

      <div className={styles.detailSections}>
        {isHire && item?.hireDescription !== undefined && <p className={styles.sectionBody}>{item.hireDescription}</p>}
        {item !== undefined && !isHire && item.kind !== 'vault' && (
          <p className={styles.sectionBody}>{reactiveApprovalContext(dict, item)}</p>
        )}
        {isHire && item !== undefined && <p className={styles.sectionNote}>{reactiveApprovalContext(dict, item)}</p>}
        {change !== undefined && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('inbox.section.change')}</h3>
            <p className={styles.sectionBody}>
              {change.field.length > 0 && <span>{change.field}: </span>}
              <span className={styles.changeBefore}>{change.before}</span>
              <span aria-hidden="true"> → </span>
              <span className="persona-sr-only">{t('inbox.changeTo')}</span>
              <span className={styles.changeAfter}>{change.after}</span>
            </p>
          </section>
        )}
        {proposal !== undefined && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('inbox.section.change')}</h3>
            <p className={styles.sectionBody}>{proposal.oneQuestion}</p>
            {proactiveImpactDetail(proposal) !== proposal.oneQuestion && <p className={styles.sectionBody}>{proactiveImpactDetail(proposal)}</p>}
          </section>
        )}
        {whyLine !== undefined && <p className={styles.sectionBody}><strong>{whyLine}</strong></p>}
        {costText !== undefined && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('inbox.section.cost')}</h3>
            <p className={styles.sectionBody}>{costText}</p>
          </section>
        )}
        {row.proposerName.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('inbox.section.proposer')}</h3>
            <p className={styles.proposer}>
              <Avatar name={row.proposerName} size={24} shape="portrait" decorative {...(proposerFace === undefined ? {} : { src: proposerFace })} />
              <span>{[row.proposerName, when].filter(part => part.length > 0).join(' · ')}</span>
            </p>
          </section>
        )}
      </div>

      {scope !== undefined && !leaving && state !== 'declined' && (
        <RememberPermission
          scope={scope}
          remember={choice.grant}
          onRememberChange={(grant) => { onRememberChange({ grant }) }}
          validity={choice.validity}
          onValidityChange={(validity) => { onRememberChange({ validity }) }}
          labels={{
            remember: t('remember.toggle'),
            scopeLead: persona => t('remember.scopeLead', { persona }),
            validity: t('remember.validityLabel'),
            validities: {
              once: t('remember.validity.once'),
              week: t('remember.validity.week'),
              'until-revoked': t('remember.validity.untilRevoked'),
            },
            guard: t('remember.guard'),
          }}
        />
      )}

      {state === 'declined' ? (
        <div className={styles.detailActions}><DecisionStateNote state={state} t={t} /></div>
      ) : (
        <>
          {state === 'failed' && <DecisionStateNote state={state} t={t} {...(canDecide ? { onRetry: onApprove } : {})} />}
          <div className={styles.detailActions}>
            <Tooltip content={t('inbox.tip.approve')} shortcut={['A']} side="bottom">
              <Button variant="primary" loading={deciding} aria-keyshortcuts="A" onClick={onApprove} disabled={blocked || !canDecide || leaving || locked}>
                {primaryLabel}
              </Button>
            </Tooltip>
            {isHire && (
              <Tooltip content={t('hire.details')} shortcut={['Enter']} side="bottom">
                <Button variant="secondary" onClick={() => { onDetailsChange(true) }}>{t('hire.details')}</Button>
              </Tooltip>
            )}
            <Tooltip content={t('inbox.tip.dismiss')} shortcut={['D']} side="bottom">
              <Button variant="secondary" aria-keyshortcuts="D" onClick={onDismiss} disabled={!canDecide || leaving || deciding || locked}>
                {t('action.dismiss')}
              </Button>
            </Tooltip>
          </div>
          {blocked && !leaving && !deciding && <p className={styles.sectionNote}>{t('depends.note', { title: blockedBy })}</p>}
        </>
      )}
      {isHire && item !== undefined && <HireDetailsModal dict={dict} item={item} open={detailsOpen} onClose={() => { onDetailsChange(false) }} />}
    </article>
  )
}

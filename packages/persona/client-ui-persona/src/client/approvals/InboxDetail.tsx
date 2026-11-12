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
  proactiveCostLine,
  proactiveImpactDetail,
  reactiveApprovalContext,
  resolvePersonaFace,
} from './approvals-ui-helpers.ts'
import { HireDetailsModal } from './HireDetailsModal.tsx'
import { InboxActor } from './InboxActor.tsx'
import type { InboxRow, RememberChoice } from './inbox-model.ts'
import { ReviewedBySeal } from '../teamwork/ReviewedBySeal.tsx'
import { ActionPreviewCard, type ActionDecision } from '../chat/ActionPreviewCard.tsx'
import { pt as chatDict } from '../locale/chat/locales.ts'
import { ConnectorActions } from './ConnectorActions.tsx'
import type { ConnectorChoice } from './connector-ask.ts'

/** The preview card speaks the chat's words (one wording for the thread, the legacy list and this detail). */
const actionT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatDict, key, params)) as Parameters<typeof ActionPreviewCard>[0]['t']

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
  /** IV-10: a question in words → "Responder" is the primary (it takes the person to the thread and focuses the composer); the old primary and Dispensar stay as the secondaries. */
  readonly onReply?: (() => void) | undefined
  /** HT-9 / D-095: the answer to the REAL preview of an external action (Enviar · Editar · Cancelar). An action is never decided by the generic Aprovar. */
  readonly onDecideAction?: ((decision: ActionDecision) => void | Promise<void>) | undefined
  /** "Liberar para {B}": the choice among what the host accepts (só desta vez · sempre · agora não). A connector card has no generic Aprovar either. */
  readonly onChooseConnector?: ((choice: ConnectorChoice) => void) | undefined
  /** The hire's "Ver detalhes" dialog (owned by the screen so the Enter key can open it too). */
  readonly detailsOpen: boolean
  readonly onDetailsChange: (open: boolean) => void
  /** One-pane layout only: back to the list. */
  readonly onBack?: (() => void) | undefined
  readonly focusHighlight: boolean
}

export function InboxDetail({
  dict, row, scope, choice, onRememberChange, rememberStampNote, stamped, leaving, deciding, locked, canDecide, onApprove, onDismiss, onReply, onDecideAction, onChooseConnector, detailsOpen, onDetailsChange, onBack, focusHighlight,
}: InboxDetailProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const item = row.item
  // What leaves the company or opens a door is decided on ITS card: the preview (Enviar/Editar/Cancelar) or the connector's three choices.
  // The generic Aprovar / Dispensar and the A / D keys never apply to them; without a preview the only way out is Cancelar.
  const actionPreview = item?.kind === 'action' ? item.actionPreview : undefined
  const connectorAsk = item?.kind === 'connector' ? item.connector : undefined
  const blindAction = item?.blindAction === true || (item?.kind === 'action' && actionPreview === undefined)
  const ownsDecision = actionPreview !== undefined || connectorAsk !== undefined || blindAction
  const proposal = row.proposal
  const isHire = item?.kind === 'hire'
  // D-069: a persona is never a letter. Same face as the list row (a known animal, else the stable gallery one).
  const proposerFace = resolvePersonaFace({ id: row.proposerPersonaId, characterId: row.proposerCharacterId, name: row.proposerName, avatarSrc: row.proposerAvatarSrc })
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
          <ApprovedStamp label={t(item?.stampKey ?? 'stamp.approved')} animate />
          {rememberStampNote !== null && <p className={styles.sectionBody}>{rememberStampNote}</p>}
        </div>
      )}
      {onBack !== undefined && (
        <Button className={styles.detailBack} variant="ghost" size="s" onClick={onBack}>{t('inbox.back')}</Button>
      )}
      {stage !== undefined && <div className={styles.detailStage} aria-hidden="true">{stage}</div>}
      <div className={styles.detailHead}>
        {stage === undefined && (
          <InboxActor row={row} src={proposerFace} size={56} name={row.proposerName.length > 0 ? row.proposerName : row.title} />
        )}
        <div>
          <Chip tone="accent" size="s">{t(`type.${row.kind}`)}</Chip>
          {row.example === true && <> <Chip tone="neutral" size="s">{t('inbox.example')}</Chip></>}
          {(row.reviewedBy ?? item?.reviewedBy) !== undefined && (
            <> <ReviewedBySeal reviewer={(row.reviewedBy ?? item?.reviewedBy)!} label={t('review.seal', { name: (row.reviewedBy ?? item?.reviewedBy)!.name })} /></>
          )}
          <h2 id={`inbox-detail-title-${row.id}`} className={styles.detailTitle}>{row.title}</h2>
          {isHire && role.length > 0 && item !== undefined && <p className={styles.proposer}><strong>{item.title}</strong></p>}
        </div>
      </div>

      <div className={styles.detailSections}>
        {isHire && item?.hireDescription !== undefined && <p className={styles.sectionBody}>{item.hireDescription}</p>}
        {item !== undefined && !isHire && item.kind !== 'vault' && actionPreview === undefined && (
          <p className={styles.sectionBody}>{reactiveApprovalContext(dict, item)}</p>
        )}
        {actionPreview !== undefined && (
          // The SAME card the thread shows: to whom, subject, body, attachments; the primary is "Enviar" (never "Aceitar").
          <div data-inbox-action-preview="">
            <ActionPreviewCard t={actionT} preview={actionPreview} rowTag="div" {...(onDecideAction === undefined ? {} : { onDecide: onDecideAction })} />
          </div>
        )}
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
              <InboxActor row={row} src={proposerFace} size={24} name={row.proposerName} />
              <span>{[row.proposerName, when].filter(part => part.length > 0).join(' · ')}</span>
            </p>
          </section>
        )}
      </div>

      {scope !== undefined && !ownsDecision && !leaving && state !== 'declined' && (
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
          {state === 'failed' && <DecisionStateNote state={state} t={t} {...(canDecide && !ownsDecision ? { onRetry: onApprove } : {})} />}
          {connectorAsk !== undefined ? (
            <ConnectorActions
              dict={dict}
              ask={connectorAsk}
              personaName={row.proposerName}
              deciding={deciding}
              disabled={onChooseConnector === undefined || leaving || blocked || locked}
              onChoose={(connectorChoice) => { onChooseConnector?.(connectorChoice) }}
            />
          ) : blindAction ? (
            // No preview = nothing shows what would leave the company: there is no button that approves, only the way out.
            <div className={styles.detailActions} data-inbox-action-blind="">
              <p className={styles.sectionNote}>{actionT('action.missing')}</p>
              <Button variant="secondary" onClick={onDismiss} disabled={!canDecide || leaving || deciding || locked}>{actionT('action.cancel')}</Button>
            </div>
          ) : actionPreview === undefined && (
            <div className={styles.detailActions}>
              {onReply !== undefined && <Button variant="primary" onClick={onReply} disabled={leaving || deciding || locked}>{t('action.reply')}</Button>}
              <Tooltip content={item?.dismissKey === undefined ? t('inbox.tip.approve') : primaryLabel} shortcut={['A']} side="bottom">
                <Button variant={onReply === undefined ? 'primary' : 'secondary'} loading={deciding} aria-keyshortcuts="A" onClick={onApprove} disabled={blocked || !canDecide || leaving || locked}>
                  {primaryLabel}
                </Button>
              </Tooltip>
              {isHire && (
                <Tooltip content={t('hire.details')} shortcut={['Enter']} side="bottom">
                  <Button variant="secondary" onClick={() => { onDetailsChange(true) }}>{t('hire.details')}</Button>
                </Tooltip>
              )}
              <Tooltip content={t(item?.dismissKey ?? 'inbox.tip.dismiss')} shortcut={['D']} side="bottom">
                <Button variant="secondary" aria-keyshortcuts="D" onClick={onDismiss} disabled={!canDecide || leaving || deciding || locked}>
                  {t(item?.dismissKey ?? 'action.dismiss')}
                </Button>
              </Tooltip>
            </div>
          )}
          {blocked && !leaving && !deciding && <p className={styles.sectionNote}>{t('depends.note', { title: blockedBy })}</p>}
          {row.example === true && <p className={styles.sectionNote}>{t('inbox.exampleNote')}</p>}
        </>
      )}
      {isHire && item !== undefined && <HireDetailsModal dict={dict} item={item} open={detailsOpen} onClose={() => { onDetailsChange(false) }} />}
    </article>
  )
}

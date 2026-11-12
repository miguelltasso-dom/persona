/** Single Kanban card with drag lift, persona row, chips, and overflow menu. */

import { HandoffChip } from '../teamwork/HandoffChip.tsx'
import { StartedNowNote } from './StartedNowNote.tsx'
import { teamworkText, useTeamwork } from '../teamwork/teamwork-context.tsx'
import { type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { ApprovedStamp, Avatar, BrandIcon, Card, Chip, UiIcon } from '../primitives/index.ts'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { SubjectDot } from '../chat/SubjectBar.tsx'
import { KanbanCardMenu, type FlowMoveTarget } from './KanbanCardMenu.tsx'
import { cardStateChipOf, stoppedReasonOf } from './card-state.ts'
import { cardOpenHandlers, TaskThreadBadge } from './TaskThreadBadge.tsx'
import styles from './Kanban.module.css'
import type { KanbanCardModel, KanbanColumnId } from './types.ts'

export interface KanbanCardProps {
  readonly dict: LocaleDict
  readonly card: KanbanCardModel
  readonly draggingId: string | null
  readonly showProject: boolean
  readonly columnLabels: Readonly<Record<KanbanColumnId, string>>
  readonly onDragStart: (cardId: string) => void
  readonly onDragEnd: () => void
  readonly onMoveCard?: (cardId: string, toColumn: KanbanColumnId) => void
  readonly flowMoveTargets?: readonly FlowMoveTarget[]
  readonly currentFlowColumnId?: string
  readonly onMoveFlowColumn?: (cardId: string, columnId: string) => void
  readonly onOpenReview?: (cardId: string) => void
  readonly onRequestStatus?: (cardId: string) => void
  readonly onTeach?: ((cardId: string, personaId: string) => void) | undefined
  /** COLHEITA 18: a click on the card (or Enter/Space on it) opens the conversation of the task in the side panel; without it the card is as it was. */
  readonly onOpenConversation?: ((cardId: string) => void) | undefined
  /** True only on the beat after the human accepts Revisar (peak-end stamp animation). */
  readonly approvalStampFresh?: boolean
  readonly assigneeCardTrigger?: ((personaId: string) => {
    readonly onClick: (event: MouseEvent<HTMLElement>) => void
    readonly onPointerEnter: (event: MouseEvent<HTMLElement>) => void
  }) | undefined
}

/** Draggable ticket card. */
/** "Bento", "Bento e Luna", "Bento, Luna e Sol" (the person's language): never a raw join with commas only. */
function listNames(names: readonly string[]): string {
  try {
    return new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

export function KanbanCard({
  dict,
  card,
  draggingId,
  showProject,
  columnLabels,
  onDragStart,
  onDragEnd,
  onMoveCard,
  flowMoveTargets,
  currentFlowColumnId,
  onMoveFlowColumn,
  onOpenReview,
  onRequestStatus,
  onTeach,
  onOpenConversation,
  approvalStampFresh = false,
  assigneeCardTrigger,
}: KanbanCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const dragging = draggingId === card.id
  const teamwork = useTeamwork()
  const assigneeName = card.assignee?.name ?? t('card.unassigned')
  // D-069: a persona is never a letter. The face of the card's persona (the gallery animal for its id/name, else the stable one for its id).
  const assigneeFace = card.assignee === undefined ? undefined : resolvePersonaFace({ id: card.assignee.id, name: card.assignee.name })
  const carryFace = card.carry === undefined ? undefined : resolvePersonaFace({ id: card.carry.persona.id, name: card.carry.persona.name })
  const canOpenReview = card.column === 'in_review' || card.blocked

  const showApprovalStamp = card.reviewApproved && card.column === 'done'

  const onDragStartCard = (event: DragEvent<HTMLElement>): void => {
    event.dataTransfer.setData('text/persona-kanban-card', card.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart(card.id)
  }

  // Muse (12/11): the chip says the state of the CARD ("Na fila de Bia", "Bia está fazendo", "Esperando o cliente"), never the persona's own state.
  const reviewerName = card.reviewing === undefined ? undefined : teamwork?.personaFor(card.reviewing.personaId)?.name
  const flowColumnName = flowMoveTargets?.find(target => target.id === currentFlowColumnId)?.label
  const stateChip = cardStateChipOf(card, reviewerName, flowColumnName)
  const stoppedReason = stoppedReasonOf(card) // Muse (12/11): a stopped card says WHY, in up to 2 muted lines under the title (the whole text in the title attribute and in the card's label), when the host sent it
  const stateName = stateChip?.who === 'reviewer' ? (reviewerName ?? '') : assigneeName

  return (
    <Card
      as="article"
      padding="s"
      interactive
      data-persona-kanban-card={card.id}
      {...(card.carry !== undefined ? { 'data-persona-kanban-carry': '' } : {})}
      className={`${styles.ticket}${dragging ? ` ${styles.ticketDragging}` : ''}`}
      draggable
      onDragStart={onDragStartCard}
      onDragEnd={onDragEnd}
      aria-grabbed={dragging}
      tabIndex={0}
      aria-label={stoppedReason === '' ? card.title : `${card.title}. ${stoppedReason}`}
      {...cardOpenHandlers(onOpenConversation, card.id)}
    >
      {card.carry !== undefined && (
        <div className={styles.carryLayer} aria-live="polite">
          <span className={styles.carryAvatar} title={t('personaMove.label', { name: card.carry.persona.name })}>
            <Avatar name={card.carry.persona.name} size={24} shape="portrait" decorative {...(carryFace === undefined ? {} : { src: carryFace })} />
            <span className={styles.srOnly}>{t('personaMove.label', { name: card.carry.persona.name })}</span>
          </span>
        </div>
      )}
      <div className={showApprovalStamp ? `${styles.cardTitleRow} ${styles.cardTitleRowStamped}` : styles.cardTitleRow}>
        {card.conversationSubject !== undefined && (
          <SubjectDot colorIndex={card.conversationSubject.colorIndex} size={10} />
        )}
        <h3 className={styles.cardTitle}>{card.title}</h3>
      </div>
      {stoppedReason !== '' && <p className={styles.cardReason} title={stoppedReason} data-card-reason="">{stoppedReason}</p>}
      {card.conversationSubject !== undefined && (
        <span className="persona-sr-only">
          {t('card.subjectLabel', { name: card.conversationSubject.name })}
        </span>
      )}
      {showProject && (
        <div className={styles.chips}>
          <Chip tone="neutral" size="s">{card.projectName}</Chip>
        </div>
      )}
      {(card.flowFields !== undefined && card.flowFields.length > 0
        || card.dueLabel !== undefined
        || card.dependency === true
        || card.evidence === true
        || (card.collaborators?.length ?? 0) > 0) && (
        <div className={styles.metaChips}>
          {card.flowFields?.map(field => (
            <Chip key={`${field.label}:${field.value}`} tone="neutral" size="s">
              {t('card.flowField', { label: field.label, value: field.value })}
            </Chip>
          ))}
          {(card.collaborators?.length ?? 0) > 0 && (
            <Chip tone="neutral" size="s">
              {teamworkText(dict, 'card.with', 'com {names}', { names: listNames((card.collaborators ?? []).map(row => row.name)) })}
            </Chip>
          )}
          {card.dueLabel !== undefined && (
            <Chip tone="neutral" size="s" icon={<UiIcon name="clock" size={14} strokeWidth={2} />}>
              {card.dueLabel}
            </Chip>
          )}
          {card.dependency === true && (
            <Chip tone="info" size="s" icon={<UiIcon name="chevronRight" size={14} strokeWidth={2} />}>
              {card.dependencyCount !== undefined && card.dependencyCount > 0
                ? t('chip.dependencyCount', { count: card.dependencyCount })
                : t('chip.dependency')}
            </Chip>
          )}
          {card.evidence === true && (
            <Chip tone="info" size="s" icon={<UiIcon name="attach" size={14} strokeWidth={2} />}>
              {card.evidenceCount !== undefined && card.evidenceCount > 0
                ? t('chip.evidenceCount', { count: card.evidenceCount })
                : t('chip.evidence')}
            </Chip>
          )}
        </div>
      )}
      <StartedNowNote cardId={card.id} label={name => t('card.startedNow', { name })} />
      <HandoffChip dict={dict} card={card} />
      {(card.column === 'done' && card.outcome !== undefined) && (
        <div className={styles.chips}>
          <Chip tone="success" size="s">{t(`outcome.${card.outcome}`)}</Chip>
        </div>
      )}
      <div className={styles.cardFooter}>
        {card.assignee !== undefined && assigneeCardTrigger !== undefined ? (
          <button
            type="button"
            className={styles.assigneeButton}
            aria-label={assigneeName}
            {...assigneeCardTrigger(card.assignee.id)}
          >
            <Avatar name={assigneeName} size={24} shape="portrait" decorative {...(assigneeFace === undefined ? {} : { src: assigneeFace })} />
          </button>
        ) : (
          <Avatar
            name={assigneeName}
            size={24}
            shape="portrait"
            decorative={card.assignee !== undefined}
            {...(assigneeFace === undefined ? {} : { src: assigneeFace })}
            // No responsible persona on the card (the host sends none yet): the team's icon in a neutral disc (Kanban.module.css `.unassignedAvatar`), never the initials "SR".
            {...(card.assignee === undefined ? { icon: <BrandIcon name="equipe" size={13} />, className: styles.unassignedAvatar } : {})}
          />
        )}
        {card.column === 'done'
          ? (card.assignee === undefined ? null : <Chip tone="neutral" size="s" data-card-done-by="">{t('card.doneBy', { name: assigneeName })}</Chip>)
          : (stateChip === undefined ? null : <Chip tone={stateChip.tone} size="s" className={styles.stateChip} data-card-state={stateChip.key}>{t(stateChip.key, { name: stateName })}</Chip>)}
        <TaskThreadBadge dict={dict} thread={card.thread} />
        {showApprovalStamp && <Chip tone="success" size="s" data-card-approved="">{t('stamp.approved')}</Chip>}
        {(onMoveCard !== undefined || onMoveFlowColumn !== undefined) && (
          <KanbanCardMenu
            dict={dict}
            currentColumn={card.column}
            columnLabels={columnLabels}
            canOpenReview={canOpenReview}
            onMove={(toColumn) => { onMoveCard?.(card.id, toColumn) }}
            {...(flowMoveTargets !== undefined ? { flowMoveTargets, currentFlowColumnId } : {})}
            {...(onMoveFlowColumn !== undefined
              ? { onMoveFlowColumn: (columnId) => { onMoveFlowColumn(card.id, columnId) } }
              : {})}
            {...(onOpenReview !== undefined && canOpenReview
              ? { onOpen: () => { onOpenReview(card.id) } }
              : {})}
            {...(onRequestStatus !== undefined ? { onRequestStatus: () => { onRequestStatus(card.id) } } : {})}
            {...(onTeach !== undefined && card.assignee !== undefined
              ? { onTeach: () => { onTeach(card.id, card.assignee!.id) } }
              : {})}
          />
        )}
      </div>
      {showApprovalStamp && (
        <div className={styles.approvalStamp}>
          <ApprovedStamp label={t('stamp.approved')} animate={approvalStampFresh} seed={card.id} />
        </div>
      )}
    </Card>
  )
}

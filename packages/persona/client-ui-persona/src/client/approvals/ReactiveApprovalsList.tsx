/** Reactive approval cards — windowed when the inbox is large (DESEMPENHO). */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ApprovedStamp,
  Avatar,
  BrandIcon,
  Button,
  Card,
  Chip,
  FixedRowVirtualScroller,
  RememberPermission,
  type PermissionScope,
  type PermissionValidity,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Approvals.module.css'
import {
  approvalHireVisual,
  hireHeading,
  hireMonthlyTasksLine,
  hireWhyLine,
  personaPortraitSrc,
  reactiveApprovalContext,
  vaultChangeLine,
  vaultHeading,
} from './approvals-ui-helpers.ts'
import { HireDetailsModal } from './HireDetailsModal.tsx'
import type { RememberChoice } from './inbox-model.ts'
import type { ApprovalItem } from './mock-data.ts'
import { DecisionStateNote } from '../decisions/DecisionStateNote.tsx'

const APPROVAL_ROW_PX = 360
const APPROVAL_VIRTUAL_MIN = 12

function cardTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'hire') return hireHeading(dict, item)
  if (item.kind === 'vault') return vaultHeading(dict, item)
  const key = `${item.kind}.title` as 'vault.title' | 'skill.title' | 'attention.title'
  return bindLocale(dict, key)
}

export type { RememberChoice }

export interface ReactiveApprovalsListProps {
  readonly dict: LocaleDict
  readonly items: readonly ApprovalItem[]
  /** What "Lembrar esta permissão" would grant for this card; none = the card has nothing to remember. */
  readonly scopeFor: (item: ApprovalItem) => PermissionScope | undefined
  readonly exitStampId: string | null
  readonly focusId?: string | undefined
  readonly rememberFor: (id: string) => RememberChoice
  readonly rememberStampNote: string | null
  readonly onRememberChange: (id: string, patch: Partial<RememberChoice>) => void
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean, remember?: { readonly validity: PermissionValidity }) => void
  readonly onCelebrateAccept: (id: string, proceed: () => void) => void
}

function ReactiveApprovalRow({
  dict,
  item,
  scopeFor,
  exitStampId,
  focusId,
  rememberFor,
  rememberStampNote,
  onRememberChange,
  onDecideItem,
  onCelebrateAccept,
}: ReactiveApprovalsListProps & { readonly item: ApprovalItem }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const isFocused = focusId !== undefined && item.id === focusId
  // DECISIONS-SPEC: a card with a decisionState is driven by the shared store; without one the legacy local cycle runs.
  const state = item.decisionState
  const controlled = state !== undefined
  const stamped = controlled ? state === 'accepted' : exitStampId === item.id
  const leaving = controlled ? (state === 'accepted' || state === 'declined') : exitStampId === item.id
  const deciding = controlled && state === 'deciding'
  // Every card decides on its own, in any order. Only a real dependency named by the host holds one back (and says so).
  const blockedBy = item.dependsOnTitle?.trim() ?? ''
  const blocked = blockedBy.length > 0
  const choice = rememberFor(item.id)
  const scope = scopeFor(item)
  const acceptItem = (): void => {
    if (onDecideItem === undefined || blocked) return
    const remember = choice.grant && item.brain !== undefined ? { validity: choice.validity } : undefined
    if (controlled) onDecideItem(item, true, remember)
    else onCelebrateAccept(item.id, () => { onDecideItem(item, true, remember) })
  }
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isHire = item.kind === 'hire'
  const hireRole = item.hireRoleTitle?.trim() ?? ''
  const proposer = item.proposerName?.trim() ?? ''
  const proposerPortrait = isHire || proposer.length === 0
    ? undefined
    : (personaPortraitSrc(item.proposerPersonaId, proposer) ?? personaPortraitSrc(undefined, proposer))
  const changeLine = item.kind === 'vault' ? vaultChangeLine(dict, item) : undefined
  const whyLine = isHire ? hireWhyLine(dict, item) : undefined
  const costLine = isHire ? hireMonthlyTasksLine(dict, item) : undefined
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (isFocused && cardRef.current) {
      if (typeof cardRef.current.scrollIntoView === 'function') {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      cardRef.current.focus()
    }
  }, [isFocused])
  return (
    <div
      role="listitem"
      data-decision-id={item.id}
      data-decision-state={state}
      className={leaving ? (state === 'declined' ? styles.listItemExitingDeclined : styles.listItemExiting) : undefined}
    >
      <div
        ref={cardRef}
        tabIndex={isFocused ? -1 : undefined}
        className={`${styles.approvalCardWrap}${isFocused ? ` ${styles.focusHighlight}` : ''}`}
      >
        {stamped && (
          <div className={styles.approvalStamp}>
            <ApprovedStamp label={t('stamp.approved')} animate />
            {rememberStampNote !== null && (
              <p className={styles.rememberStampNote}>{rememberStampNote}</p>
            )}
          </div>
        )}
        <Card padding="m" tone="accent" className={styles.approvalCard}>
          <div className={styles.approvalHead}>
            {(() => {
              const hireVisual = approvalHireVisual(item)
              if (hireVisual?.kind === 'invite') {
                return (
                  <span className={styles.hireInviteSeal} aria-hidden="true">
                    <BrandIcon name="convidar" size={40} />
                  </span>
                )
              }
              // A hire shows the proposed animal; every other card shows who proposes it (never initials of its title).
              const avatarSrc = hireVisual?.kind === 'portrait' ? hireVisual.src : isHire ? undefined : proposerPortrait
              return (
                <Avatar
                  name={isHire ? item.title : (proposer.length > 0 ? proposer : item.title)}
                  size={isHire ? 48 : 40}
                  shape="portrait"
                  {...(avatarSrc === undefined ? {} : { src: avatarSrc })}
                />
              )
            })()}
            <div>
              <Chip tone="accent" size="s">{t(`type.${item.kind}`)}</Chip>
              <h3 className={styles.question}>{cardTitle(dict, item)}</h3>
              {isHire && hireRole.length > 0 && (
                // The role is already in the heading, so no chip repeats it here (the details dialog keeps it).
                <p className={styles.hireWho}>
                  <span className={styles.hireWhoName}>{item.title}</span>
                </p>
              )}
            </div>
          </div>
          {isHire && item.hireDescription !== undefined && <p className={styles.hireIntro}>{item.hireDescription}</p>}
          <p className={styles.context}>{reactiveApprovalContext(dict, item)}</p>
          {changeLine !== undefined && <p className={styles.vaultChange}>{changeLine}</p>}
          {whyLine !== undefined && <p className={styles.hireWhy}>{whyLine}</p>}
          {costLine !== undefined && <p className={styles.hireCost}>{costLine}</p>}
          {scope !== undefined && !leaving && state !== 'declined' && (
            <RememberPermission
              scope={scope}
              remember={choice.grant}
              onRememberChange={(grant) => { onRememberChange(item.id, { grant }) }}
              validity={choice.validity}
              onValidityChange={(validity) => { onRememberChange(item.id, { validity }) }}
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
            <div className={styles.actions}>
              <DecisionStateNote state={state} t={t} />
            </div>
          ) : (
            <>
              {state === 'failed' && (
                <DecisionStateNote state={state} t={t} {...(onDecideItem === undefined ? {} : { onRetry: acceptItem })} />
              )}
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="s"
                  loading={deciding}
                  onClick={acceptItem}
                  disabled={blocked || onDecideItem === undefined || leaving || (!controlled && exitStampId !== null)}
                >
                  {t(item.primaryKey)}
                </Button>
                {isHire && (
                  <Button variant="secondary" size="s" onClick={() => { setDetailsOpen(true) }}>
                    {t('hire.details')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="s"
                  onClick={() => { onDecideItem?.(item, false) }}
                  disabled={onDecideItem === undefined || leaving || deciding || (!controlled && exitStampId !== null)}
                >
                  {t('action.dismiss')}
                </Button>
              </div>
              {/* Off only for a real dependency the host named: the card says on what, instead of leaving the button faded. */}
              {blocked && !leaving && !deciding && (
                <p className={styles.dependsNote}>{t('depends.note', { title: blockedBy })}</p>
              )}
            </>
          )}
        </Card>
      </div>
      {isHire && <HireDetailsModal dict={dict} item={item} open={detailsOpen} onClose={() => { setDetailsOpen(false) }} />}
    </div>
  )
}

export function ReactiveApprovalsList(props: ReactiveApprovalsListProps): ReactNode {
  const { items } = props
  const rowProps = (index: number) => ({ ...props, item: items[index]! })

  if (items.length >= APPROVAL_VIRTUAL_MIN) {
    return (
      <FixedRowVirtualScroller
        {...(styles.approvalsVirtual === undefined ? {} : { className: styles.approvalsVirtual })}
        rowCount={items.length}
        rowHeight={APPROVAL_ROW_PX}
        ariaLabel="Aprovações pendentes"
        getRowKey={index => items[index]?.id ?? `approval-${index}`}
        renderRow={index => <ReactiveApprovalRow {...rowProps(index)} />}
      />
    )
  }

  return (
    <>
      {items.map((item, index) => (
        <ReactiveApprovalRow key={item.id} {...rowProps(index)} />
      ))}
    </>
  )
}

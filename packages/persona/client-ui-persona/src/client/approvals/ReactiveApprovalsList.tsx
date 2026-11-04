/** Reactive approval cards — windowed when the inbox is large (DESEMPENHO). */

import { useEffect, useRef, type ReactNode } from 'react'
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
import { approvalHireVisual, reactiveApprovalContext } from './approvals-ui-helpers.ts'
import type { ApprovalItem } from './mock-data.ts'
import { DecisionStateNote } from '../decisions/DecisionStateNote.tsx'

const APPROVAL_ROW_PX = 360
const APPROVAL_VIRTUAL_MIN = 12

function cardTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'hire') return bindLocale(dict, 'hire.title', { name: item.title })
  const key = `${item.kind}.title` as 'vault.title' | 'skill.title' | 'attention.title'
  return bindLocale(dict, key)
}

export interface ReactiveApprovalsListProps {
  readonly dict: LocaleDict
  readonly items: readonly ApprovalItem[]
  readonly headScope: PermissionScope | undefined
  readonly exitStampId: string | null
  /** First card the person can act on (the one question at a time). Defaults to the first item. */
  readonly headId?: string | undefined
  readonly focusId?: string | undefined
  readonly rememberGrant: boolean
  readonly rememberValidity: PermissionValidity
  readonly rememberStampNote: string | null
  readonly onRememberGrantChange: (value: boolean) => void
  readonly onRememberValidityChange: (value: PermissionValidity) => void
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean, remember?: { readonly validity: PermissionValidity }) => void
  readonly onCelebrateAccept: (id: string, proceed: () => void) => void
}

function ReactiveApprovalRow({
  dict,
  item,
  index,
  headScope,
  exitStampId,
  headId,
  focusId,
  rememberGrant,
  rememberValidity,
  rememberStampNote,
  onRememberGrantChange,
  onRememberValidityChange,
  onDecideItem,
  onCelebrateAccept,
}: ReactiveApprovalsListProps & { readonly item: ApprovalItem; readonly index: number }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const isFocused = focusId !== undefined && item.id === focusId
  // DECISIONS-SPEC: a card with a decisionState is driven by the shared store; without one the legacy local cycle runs.
  const state = item.decisionState
  const controlled = state !== undefined
  const stamped = controlled ? state === 'accepted' : exitStampId === item.id
  const leaving = controlled ? (state === 'accepted' || state === 'declined') : exitStampId === item.id
  const deciding = controlled && state === 'deciding'
  const isHead = headId === undefined ? index === 0 : item.id === headId
  const acceptItem = (): void => {
    if (onDecideItem === undefined || !isHead) return
    const remember = rememberGrant && item.brain !== undefined ? { validity: rememberValidity } : undefined
    if (controlled) onDecideItem(item, true, remember)
    else onCelebrateAccept(item.id, () => { onDecideItem(item, true, remember) })
  }
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
              return (
                <Avatar
                  name={item.title}
                  size={40}
                  shape="portrait"
                  {...(hireVisual?.kind === 'portrait' ? { src: hireVisual.src } : {})}
                />
              )
            })()}
            <div>
              <Chip tone="accent" size="s">{t(`type.${item.kind}`)}</Chip>
              <h3 className={styles.question}>{cardTitle(dict, item)}</h3>
            </div>
          </div>
          <p className={styles.context}>{reactiveApprovalContext(dict, item)}</p>
          {item.kind === 'hire' && item.hireWhy !== undefined && (
            <p className={styles.hireWhy}>{t('hire.why', { reason: item.hireWhy })}</p>
          )}
          {isHead && headScope !== undefined && (
            <RememberPermission
              scope={headScope}
              remember={rememberGrant}
              onRememberChange={onRememberGrantChange}
              validity={rememberValidity}
              onValidityChange={onRememberValidityChange}
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
                  disabled={!isHead || onDecideItem === undefined || leaving || (!controlled && exitStampId !== null)}
                >
                  {t(item.primaryKey)}
                </Button>
                <Button
                  variant="secondary"
                  size="s"
                  onClick={() => { onDecideItem?.(item, false) }}
                  disabled={onDecideItem === undefined || leaving || deciding || (!controlled && exitStampId !== null)}
                >
                  {t('action.dismiss')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

export function ReactiveApprovalsList(props: ReactiveApprovalsListProps): ReactNode {
  const { items } = props
  const headId = props.headId ?? items.find(item => item.decisionState === undefined || item.decisionState === 'pending' || item.decisionState === 'failed')?.id
  const rowProps = (index: number) => ({ ...props, headId, item: items[index]!, index })

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

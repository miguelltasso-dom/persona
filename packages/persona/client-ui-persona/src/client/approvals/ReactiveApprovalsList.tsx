/** Reactive approval cards — windowed when the inbox is large (DESEMPENHO). */

import { type ReactNode } from 'react'
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
  rememberGrant,
  rememberValidity,
  rememberStampNote,
  onRememberGrantChange,
  onRememberValidityChange,
  onDecideItem,
  onCelebrateAccept,
}: ReactiveApprovalsListProps & { readonly item: ApprovalItem; readonly index: number }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    <div className={exitStampId === item.id ? styles.listItemExiting : undefined}>
      <div className={styles.approvalCardWrap}>
        {exitStampId === item.id && (
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
          {index === 0 && headScope !== undefined && (
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
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="s"
              onClick={() => {
                if (onDecideItem === undefined || index > 0) return
                const remember = rememberGrant && item.brain !== undefined
                  ? { validity: rememberValidity }
                  : undefined
                onCelebrateAccept(item.id, () => { onDecideItem(item, true, remember) })
              }}
              disabled={index > 0 || onDecideItem === undefined || exitStampId !== null}
            >
              {t(item.primaryKey)}
            </Button>
            <Button
              variant="secondary"
              size="s"
              onClick={() => { onDecideItem?.(item, false) }}
              disabled={onDecideItem === undefined || exitStampId !== null}
            >
              {t('action.dismiss')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function ReactiveApprovalsList(props: ReactiveApprovalsListProps): ReactNode {
  const { items } = props
  const rowProps = (index: number) => ({ ...props, item: items[index]!, index })

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

/** Central human decisions (one question per card — Neutrality is omission). */
import { useState, type ReactNode } from 'react'
import {
  ApprovedStamp,
  Avatar,
  BrandIcon,
  Button,
  Card,
  Chip,
  RememberPermission,
  Screen,
  ScreenHeader,
  usePawCelebration,
  type PermissionScope,
  type PermissionValidity,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Approvals.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { ProactiveDailySummaries } from './ProactiveDailySummaries.tsx'
import { approvalHireVisual, personaPortraitSrc, reactiveApprovalContext } from './approvals-ui-helpers.ts'
import type { ApprovalItem } from './mock-data.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'
import { pt as defaultDict } from '../locale/approvals/locales.ts'

export type ApprovalsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

/** When the human accepts and opted into "Lembrar esta permissão". */
export interface ApprovalRememberChoice {
  readonly validity: PermissionValidity
}

const ACCEPT_EXIT_MS = 750

function approvalPermissionScope(dict: LocaleDict, item: ApprovalItem): PermissionScope | undefined {
  if (item.brain === undefined) return undefined
  const avatar = personaPortraitSrc(item.proposerPersonaId, item.brain.personaName)
  return {
    persona: item.brain.personaName,
    ...(avatar === undefined ? {} : { personaAvatar: avatar }),
    action: bindLocale(dict, `remember.scopeAction.${item.kind}`, { title: item.title }),
    target: bindLocale(dict, `remember.scopeTarget.${item.kind}`, { title: item.title }),
  }
}

function cardTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'hire') return bindLocale(dict, 'hire.title', { name: item.title })
  const key = `${item.kind}.title` as 'vault.title' | 'skill.title' | 'attention.title'
  return bindLocale(dict, key)
}

function formatSummaryDate(dict: LocaleDict, isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return bindLocale(dict, 'proactive.dateLabel', { day: d ?? '', month: m ?? '', year: y ?? '' })
}

export interface ApprovalsInboxProps {
  readonly dict?: LocaleDict
  readonly items?: readonly ApprovalItem[]
  readonly proactiveSummaries?: readonly PersonaDailyProactiveSummary[]
  readonly initialState?: ApprovalsSurfaceState
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean, remember?: ApprovalRememberChoice) => void
  readonly onDecideProactive?: (proposal: ProactiveProposal, accept: boolean) => void
  readonly onRemoteRetry?: () => void
}

export function ApprovalsInbox({
  dict = defaultDict,
  items = [],
  proactiveSummaries = [],
  initialState = 'ready',
  onDecideItem,
  onDecideProactive,
  onRemoteRetry,
}: ApprovalsInboxProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const paw = usePawCelebration()
  const [exitStampId, setExitStampId] = useState<string | null>(null)
  const [rememberGrant, setRememberGrant] = useState(false)
  const [rememberValidity, setRememberValidity] = useState<PermissionValidity>('once')
  const [rememberStampNote, setRememberStampNote] = useState<string | null>(null)
  const headItem = items[0]
  const headScope = headItem === undefined ? undefined : approvalPermissionScope(dict, headItem)
  const summaryIso = proactiveSummaries.find(summary => summary.proposals.length > 0)?.summaryDate ?? ''
  const summaryDateLabel = summaryIso === '' ? '' : formatSummaryDate(dict, summaryIso)
  const hasReactive = items.length > 0
  const hasProactive = proactiveSummaries.some(s => s.proposals.length > 0)

  const celebrateAccept = (id: string, proceed: () => void): void => {
    setExitStampId(id)
    paw.celebrate()
    window.setTimeout(() => {
      proceed()
      setExitStampId(null)
    }, ACCEPT_EXIT_MS)
  }

  const header = (
    <ScreenHeader
      icon="decisoes"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (initialState === 'empty' || (!hasReactive && !hasProactive)) {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          titleKey="empty.title"
          hintKey="empty.hint"
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="approvals">
      {header}
      <div className={styles.inboxCelebrate}>{paw.node}</div>
      {hasProactive && (
        <ProactiveDailySummaries
          dict={dict}
          summaries={proactiveSummaries}
          summaryDateLabel={summaryDateLabel}
          stampExitId={exitStampId}
          stampLabel={t('stamp.approved')}
          {...(onDecideProactive !== undefined
            ? {
              onDecide: (proposal, accept) => {
                if (!accept) {
                  onDecideProactive(proposal, false)
                  return
                }
                if (proposal.approvalKind === undefined) return
                celebrateAccept(proposal.id, () => { onDecideProactive(proposal, true) })
              },
            }
            : {})}
        />
      )}
      {hasReactive && (
        <section aria-labelledby="persona-reactive-approvals" data-persona-approvals="reactive">
          <h2 id="persona-reactive-approvals" className={styles.sectionTitle}>{t('reactive.title')}</h2>
          <p className={styles.sectionHint}>{t('reactive.subtitle')}</p>
          <ul className={styles.list}>
            {items.map((item, index) => (
              <li
                key={item.id}
                className={exitStampId === item.id ? styles.listItemExiting : undefined}
              >
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
                        onRememberChange={setRememberGrant}
                        validity={rememberValidity}
                        onValidityChange={setRememberValidity}
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
                          if (remember !== undefined) setRememberStampNote(t('stamp.remembered'))
                          celebrateAccept(item.id, () => { onDecideItem(item, true, remember) })
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}

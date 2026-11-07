/**
 * Aprovações as an inbox (REVIEW-APPROVALS-REDESIGN §2): the list on the left (Precisa de você agora · Propostas · Cofre),
 * the selected card's detail on the right, J/K/A/D/Enter on the keyboard and a batch for the low-risk ones. Every card is
 * decided on its own, in any order. The decision cycle itself is the Decision store's (decide → deciding → stamp → gone).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { houseEmptyArt } from '../decor/HouseDecor.tsx'
import {
  Button,
  EmptyState,
  Modal,
  Screen,
  ScreenHeader,
  Toast,
  ToastRegion,
  usePawCelebration,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { approvalPermissionScope, type ApprovalRememberChoice, type ApprovalsSurfaceState } from './ApprovalsInbox.tsx'
import { InboxDetail } from './InboxDetail.tsx'
import type { ReplyTarget } from '../answer/reply-target.ts'
import type { ActionDecision } from '../chat/ActionPreviewCard.tsx'
import type { ConnectorChoice } from './connector-ask.ts'
import { InboxList } from './InboxList.tsx'
import {
  batchEligible,
  buildInboxGroups,
  flattenRows,
  isOpen,
  nextOpenAfter,
  type InboxRow,
  type RememberChoice,
} from './inbox-model.ts'
import { isStaleDecision, sortGroupsOldestFirst } from './inbox-age.ts'
import type { ApprovalItem } from './mock-data.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'
import { pt as defaultDict } from '../locale/approvals/locales.ts'
import { NextStepBar } from '../next-step/NextStepBar.tsx'
import styles from './Inbox.module.css'

const ACCEPT_EXIT_MS = 750
const BATCH_TOAST_MS = 6000
/** Below this width of the screen the two panes become one at a time. */
const TWO_PANES_MIN_PX = 760
const DEFAULT_REMEMBER: RememberChoice = { grant: false, validity: 'once' }

export interface ApprovalsInboxV2Props {
  readonly dict?: LocaleDict
  readonly items?: readonly ApprovalItem[]
  readonly proactiveSummaries?: readonly PersonaDailyProactiveSummary[]
  readonly initialState?: ApprovalsSurfaceState
  readonly focusId?: string | undefined
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean, remember?: ApprovalRememberChoice) => void
  readonly onDecideProactive?: (proposal: ProactiveProposal, accept: boolean) => void
  /** Only when the host can undo: the batch toast shows "Desfazer" then, never before. */
  readonly onUndoDecision?: ((decisionId: string) => void) | undefined
  /** The empty state's way out ("Ver o que a equipe está fazendo"). No handler, no button. */
  readonly onOpenOverview?: (() => void) | undefined
  /** IV-10 "Responder": takes the person to the thread where the question was asked, with the reply target set. No handler, no button. */
  readonly onReply?: ((target: ReplyTarget) => void) | undefined
  /** "Liberar para {B}": the three-way choice of a connector card. The generic Aceitar never decides one. */
  readonly onDecideConnector?: ((item: ApprovalItem, choice: ConnectorChoice) => void) | undefined
  /** HT-9 / D-095: the person's answer to the preview of an external action (Enviar · Editar · Cancelar). The generic Aceitar never sends one. */
  readonly onDecideAction?: ((decision: ActionDecision) => void | Promise<void>) | undefined
  readonly onRemoteRetry?: () => void
}

/** Cards decided on their own card (the preview, the connector's choices), never by the generic Aceitar / A / D or the batch. */
function decidesOnItsOwnCard(item: ApprovalItem | undefined): boolean {
  return item !== undefined && (item.kind === 'action' || item.kind === 'connector' || item.blindAction === true)
}

export function ApprovalsInboxV2({
  dict = defaultDict,
  items = [],
  proactiveSummaries = [],
  initialState = 'ready',
  focusId,
  onDecideItem,
  onDecideProactive,
  onUndoDecision,
  onOpenOverview,
  onReply,
  onDecideConnector,
  onDecideAction,
  onRemoteRetry,
}: ApprovalsInboxV2Props): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const paw = usePawCelebration()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const rowNodes = useRef(new Map<string, HTMLElement>())
  const previousRows = useRef<readonly InboxRow[]>([])
  const [exitStampId, setExitStampId] = useState<string | null>(null)
  // Each card keeps its own "Lembrar esta permissão": they are decided in any order, none waits for another.
  const [remembered, setRemembered] = useState<Readonly<Record<string, RememberChoice>>>({})
  const rememberFor = (id: string): RememberChoice => remembered[id] ?? DEFAULT_REMEMBER
  const updateRemember = (id: string, patch: Partial<RememberChoice>): void => {
    setRemembered(current => ({ ...current, [id]: { ...(current[id] ?? DEFAULT_REMEMBER), ...patch } }))
  }
  const [rememberStampNote, setRememberStampNote] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>(focusId)
  const [detailsFor, setDetailsFor] = useState<string | null>(null)
  const [narrow, setNarrow] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchDone, setBatchDone] = useState<readonly string[] | null>(null)
  // "Ver as mais antigas" (regra 4 de Aprovações): the list stays oldest first until the screen is left.
  const [oldestFirst, setOldestFirst] = useState(false)

  const groups = useMemo(() => buildInboxGroups(dict, items, proactiveSummaries), [dict, items, proactiveSummaries])
  const shownGroups = useMemo(() => (oldestFirst ? sortGroupsOldestFirst(groups) : groups), [groups, oldestFirst])
  const rows = useMemo(() => flattenRows(shownGroups), [shownGroups])
  const nowMs = Date.now()
  const selected = rows.find(row => row.id === selectedId) ?? rows.find(row => isOpen(row.state)) ?? rows[0]
  const eligible = useMemo(() => batchEligible(rows), [rows])

  // The first open card is selected by default; once it is, it stays (a decided card must not slide the detail away
  // from under its own stamp).
  const selectedNowId = selected?.id
  useEffect(() => {
    if (selectedId === undefined && selectedNowId !== undefined) setSelectedId(selectedNowId)
  }, [selectedId, selectedNowId])

  // "Revisar" from Visão geral (approvals?focus=<id>) opens that card's detail.
  useEffect(() => {
    if (focusId !== undefined) { setSelectedId(focusId); setDetailOpen(true) }
  }, [focusId])

  // The two panes become one at a time on a narrow screen (the list is the screen; the detail opens over it).
  useEffect(() => {
    const node = rootRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setNarrow(width > 0 && width < TWO_PANES_MIN_PX)
    })
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [initialState, rows.length])

  // When the selected card leaves the list, the selection passes to the next open one (and focus follows if it was here).
  useEffect(() => {
    const before = previousRows.current
    previousRows.current = rows
    if (selectedId === undefined || rows.some(row => row.id === selectedId)) return
    const next = nextOpenAfter(before, selectedId) ?? rows.find(row => isOpen(row.state))?.id ?? rows[0]?.id
    setSelectedId(next)
    setDetailOpen(false)
    const active: Element | null = document.activeElement
    const here = rootRef.current !== null && (active === document.body || active === null || rootRef.current.contains(active))
    if (here && next !== undefined) window.setTimeout(() => { rowNodes.current.get(next)?.focus() }, 0)
  }, [rows, selectedId])

  // One paw burst per decision that becomes accepted while this screen is open (the store drives the state).
  const acceptedIds = rows.filter(row => row.state === 'accepted').map(row => row.id)
  const celebrated = useRef(new Set<string>(acceptedIds))
  const acceptedKey = acceptedIds.join('|')
  useEffect(() => {
    let fresh = false
    for (const id of acceptedIds) {
      if (celebrated.current.has(id)) continue
      celebrated.current.add(id)
      fresh = true
    }
    if (fresh) paw.celebrate()
    // acceptedKey is the identity of acceptedIds
  }, [acceptedKey])

  useEffect(() => {
    if (batchDone === null) return undefined
    const timer = window.setTimeout(() => { setBatchDone(null) }, BATCH_TOAST_MS)
    return () => { window.clearTimeout(timer) }
  }, [batchDone])

  const celebrateAccept = (id: string, proceed: () => void): void => {
    setExitStampId(id)
    paw.celebrate()
    window.setTimeout(() => {
      proceed()
      setExitStampId(null)
    }, ACCEPT_EXIT_MS)
  }

  const select = (id: string, focus: boolean): void => {
    setSelectedId(id)
    if (narrow) setDetailOpen(true)
    if (focus) window.setTimeout(() => { rowNodes.current.get(id)?.focus() }, 0)
  }

  const approve = (row: InboxRow): void => {
    if (row.example === true) return // a capture-only sample never reaches the host
    const item = row.item
    // A (and the generic Aceitar) never approves an external action or a connector: they are decided on their own card.
    if (decidesOnItsOwnCard(item)) return
    if (item !== undefined) {
      if (onDecideItem === undefined || (item.dependsOnTitle?.trim() ?? '') !== '') return
      const choice = rememberFor(item.id)
      const remember = choice.grant && item.brain !== undefined ? { validity: choice.validity } : undefined
      if (remember !== undefined) setRememberStampNote(t('stamp.remembered'))
      if (item.decisionState !== undefined) onDecideItem(item, true, remember)
      else celebrateAccept(item.id, () => { onDecideItem(item, true, remember) })
      return
    }
    const proposal = row.proposal
    if (proposal === undefined || onDecideProactive === undefined || proposal.approvalKind === undefined) return
    if (proposal.decisionState !== undefined) onDecideProactive(proposal, true)
    else celebrateAccept(proposal.id, () => { onDecideProactive(proposal, true) })
  }

  const dismiss = (row: InboxRow): void => {
    if (row.example === true) return
    if (row.item !== undefined) onDecideItem?.(row.item, false)
    else if (row.proposal !== undefined) onDecideProactive?.(row.proposal, false)
  }

  const chooseConnector = (row: InboxRow, choice: ConnectorChoice): void => {
    const item = row.item
    if (item === undefined || onDecideConnector === undefined || row.example === true) return // a capture-only sample never reaches the host
    if ((item.dependsOnTitle?.trim() ?? '') !== '') return
    // Store-driven card: the Decision cycle shows the stamp. Uncontrolled: the granting choices keep the stamp moment, like Aceitar.
    if (item.decisionState !== undefined || choice === 'not-now') onDecideConnector(item, choice)
    else celebrateAccept(item.id, () => { onDecideConnector(item, choice) })
  }

  const approveBatch = (): void => {
    if (onDecideItem === undefined) return
    const taken = eligible
    setBatchOpen(false)
    for (const row of taken) if (row.item !== undefined) onDecideItem(row.item, true)
    setBatchDone(taken.map(row => row.id))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !== null) return
    if (selected === undefined) return
    const onRow = target.getAttribute('role') === 'option'
    const index = rows.findIndex(row => row.id === selected.id)
    const go = (to: number): void => {
      const row = rows[Math.min(Math.max(to, 0), rows.length - 1)]
      if (row === undefined) return
      event.preventDefault()
      setSelectedId(row.id)
      window.setTimeout(() => { rowNodes.current.get(row.id)?.focus() }, 0)
    }
    switch (event.key) {
      case 'j': case 'J': go(index + 1); break
      case 'k': case 'K': go(index - 1); break
      case 'ArrowDown': if (onRow) go(index + 1); break
      case 'ArrowUp': if (onRow) go(index - 1); break
      case 'Home': if (onRow) go(0); break
      case 'End': if (onRow) go(rows.length - 1); break
      case 'a': case 'A': event.preventDefault(); approve(selected); break
      case 'd': case 'D':
        event.preventDefault()
        // The D key never cancels a send / closes a permission by accident: those have their own buttons on the card.
        if (!decidesOnItsOwnCard(selected.item)) dismiss(selected)
        break
      case 'Enter':
        if (!onRow) break
        event.preventDefault()
        if (narrow) setDetailOpen(true)
        else if (selected.item?.kind === 'hire') setDetailsFor(selected.id)
        break
      case 'Escape':
        if (narrow && detailOpen) { event.preventDefault(); setDetailOpen(false); rowNodes.current.get(selected.id)?.focus() }
        break
      default:
        break
    }
  }

  const batchHeaderAction = eligible.length > 0 && onDecideItem !== undefined
    ? (
      <Button variant="secondary" onClick={() => { setBatchOpen(true) }}>
        {t(eligible.length === 1 ? 'inbox.batch.one' : 'inbox.batch', { count: eligible.length })}
      </Button>
    )
    : undefined

  const header = (
    <ScreenHeader
      icon="decisoes"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      actions={batchHeaderAction}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen width="full" className={styles.inbox} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen width="full" className={styles.inbox} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRemoteRetry?.() }} />
      </Screen>
    )
  }
  if (initialState === 'empty' || rows.length === 0 || selected === undefined) {
    return (
      <Screen width="full" className={styles.inbox} data-persona-surface="approvals">
        {header}
        <EmptyState
          illustration={ILLUSTRATIONS['empty-aprovacoes'] ?? ILLUSTRATIONS['empty-inbox']}
          art={houseEmptyArt('empty-aprovacoes', 'empty-aprovacoes-noite', 240)}
          artSize={240}
          title={t('empty.title')}
          body={t('empty.hint')}
          {...(onOpenOverview === undefined ? {} : { action: <Button variant="primary" onClick={onOpenOverview}>{t('empty.action')}</Button> })}
        />
      </Screen>
    )
  }

  const controlled = selected.state !== undefined
  const detail = (
    <InboxDetail
      key={selected.id}
      dict={dict}
      row={selected}
      scope={selected.item === undefined ? undefined : approvalPermissionScope(dict, selected.item)}
      choice={rememberFor(selected.id)}
      onRememberChange={(patch) => { updateRemember(selected.id, patch) }}
      rememberStampNote={rememberStampNote}
      stamped={controlled ? selected.state === 'accepted' : exitStampId === selected.id}
      leaving={controlled ? (selected.state === 'accepted' || selected.state === 'declined') : exitStampId === selected.id}
      deciding={selected.state === 'deciding'}
      locked={!controlled && exitStampId !== null}
      canDecide={selected.example === true
        ? false
        : selected.item !== undefined ? onDecideItem !== undefined : onDecideProactive !== undefined && selected.proposal?.approvalKind !== undefined}
      onApprove={() => { approve(selected) }}
      onDismiss={() => { dismiss(selected) }}
      {...(onDecideAction === undefined ? {} : { onDecideAction })}
      {...(onDecideConnector === undefined || selected.item === undefined ? {} : { onChooseConnector: (choice: ConnectorChoice) => { chooseConnector(selected, choice) } })}
      {...(onReply === undefined || selected.item?.replyTarget === undefined ? {} : { onReply: () => { onReply(selected.item!.replyTarget!) } })}
      detailsOpen={detailsFor === selected.id}
      onDetailsChange={(open) => { setDetailsFor(open ? selected.id : null) }}
      onBack={narrow ? () => { setDetailOpen(false); rowNodes.current.get(selected.id)?.focus() } : undefined}
      focusHighlight={focusId !== undefined && selected.id === focusId}
    />
  )

  return (
    <Screen width="full" className={styles.inbox} data-persona-surface="approvals">
      {header}
      <NextStepBar
        screen="approvals"
        state={{
          isEmpty: rows.length === 0,
          blockedWaitingCount: rows.filter(row => row.group === 'now' && isOpen(row.state)).length,
          staleDecisionCount: rows.filter(row => isStaleDecision(row.at, isOpen(row.state), nowMs)).length,
        }}
        onAction={(step) => {
          if (step.actionId === 'see-oldest') {
            // Orders the list oldest first and focuses its first open decision (Muse, 05/11 05:52).
            setOldestFirst(true)
            const oldest = flattenRows(sortGroupsOldestFirst(groups)).find(row => isOpen(row.state))
            if (oldest !== undefined) select(oldest.id, true)
            return
          }
          const firstNow = rows.find(row => row.group === 'now' && isOpen(row.state))
          if (firstNow !== undefined) select(firstNow.id, true)
        }}
      />
      <div className={styles.inboxCelebrate}>{paw.node}</div>
      <div ref={rootRef} className={styles.layout} data-persona-inbox onKeyDown={onKeyDown}>
        <div className={narrow && detailOpen ? `${styles.listPane} ${styles.paneHidden}` : styles.listPane}>
          <InboxList
            dict={dict}
            groups={shownGroups}
            selectedId={selected.id}
            onSelect={(id) => { select(id, false) }}
            registerRow={(id, node) => { if (node === null) rowNodes.current.delete(id); else rowNodes.current.set(id, node) }}
          />
        </div>
        <div className={narrow && !detailOpen ? `${styles.detailPane} ${styles.paneHidden}` : styles.detailPane}>{detail}</div>
      </div>

      <Modal
        open={batchOpen}
        size="m"
        title={t(eligible.length === 1 ? 'inbox.batch.confirmTitle.one' : 'inbox.batch.confirmTitle', { count: eligible.length })}
        closeLabel={t('hire.details.close')}
        onClose={() => { setBatchOpen(false) }}
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setBatchOpen(false) }}>{t('inbox.batch.cancel')}</Button>
            <Button variant="primary" onClick={approveBatch}>{t(eligible.length === 1 ? 'inbox.batch.confirm.one' : 'inbox.batch.confirm', { count: eligible.length })}</Button>
          </>
        )}
      >
        <ul className={styles.batchList}>
          {eligible.map(row => <li key={row.id}>{row.title}</li>)}
        </ul>
      </Modal>

      {batchDone !== null && (
        <ToastRegion label={t('decision.noticesLabel')}>
          <Toast
            tone="success"
            title={t(batchDone.length === 1 ? 'inbox.batch.done.one' : 'inbox.batch.done', { count: batchDone.length })}
            {...(onUndoDecision === undefined
              ? {}
              : {
                action: (
                  <Button size="s" variant="ghost" onClick={() => { for (const id of batchDone) onUndoDecision(id); setBatchDone(null) }}>
                    {t('decision.undo')}
                  </Button>
                ),
              })}
          />
        </ToastRegion>
      )}
    </Screen>
  )
}

/**
 * The account switch at the quota limit (IV-7 2nd slice + D-078): what the host DOES, on top of the pure proposal rule in
 * `account-swap.ts`.
 *
 *  - an account that hits its limit is marked `status = 'limit'` with its reset clock, and cleared when the clock passes or the
 *    vendor shows room again (the book of limit hits is `account_limit_log`);
 *  - a persona with the DEFAULT policy ("perguntar") never switches alone: the thread gets the Notice "Continuar na {conta}" /
 *    "Esperar até {hora}" (`[[account-ask]]`); only a policy the person CHOSE ("usar a próxima", "dividir") switches by itself,
 *    and then the thread gets the line "{persona} passou para a conta {to}: …" with Desfazer (`[[account-swap]]`), never silent;
 *  - Desfazer sends the persona back to the account she left and holds her there until that limit clears (no ping-pong).
 */

import type { AccountRepos, EventRepos, ProductRepos, ScreenRepos, SqliteUsageStore } from '@deepseek-ai/dsh-persona-store'
import { formatAccountSwitch } from '@deepseek-ai/dsh-persona-runners'
import { accountAskBody, accountSwapBody } from './account-swap-wire.ts'
import { exhaustionOf, proposeAccountSwaps, type AccountSwapProposal, type SwapAccount, type SwapWaiting } from './account-swap.ts'
import type { Orchestration } from './orchestration.ts'
import type {
  AccountAskEventView,
  AccountLimitBookView,
  AccountSwapRecordView,
  AccountSwapResultView,
  AccountSwapEventView,
  RunnerSwapPolicy,
  UndoAccountSwapResultView,
} from './types.ts'
import { storedSwapPolicy } from './wave2.ts'

const LIMIT = 'account_limit'
const LIMIT_LOG = 'account_limit_log'
const SWAP = 'account_swap'
const HOLD = 'account_hold'
const ACTIVE = 'active_account'
/** A limit with no reset clock is cleared after this long even if the vendor never says: never stuck forever. */
const LIMIT_WITHOUT_CLOCK_MS = 6 * 60 * 60_000
const RECENT_MS = 24 * 60 * 60_000

interface LimitDoc { accountId: string; label: string; provider: string; since: string; resetAt?: string; logId: string }
interface SwapDoc extends AccountSwapEventView { at: string; ticketId?: string; eventId?: string; undoneAt?: string }

export interface AccountSwapDeps {
  readonly product: ProductRepos
  readonly accounts: AccountRepos
  readonly screens: ScreenRepos
  readonly events: EventRepos
  readonly usage: SqliteUsageStore
  readonly orchestration: Orchestration
  /** Probe cards: which engines are logged in (for accounts that use the default home). */
  readonly connections: () => readonly { readonly kind: string; readonly loggedIn: boolean }[]
  readonly loginStatus: (homeDir: string) => string
}

export class AccountSwapHost {
  constructor(private readonly deps: AccountSwapDeps) {}

  private now(): string {
    return this.deps.orchestration.now()
  }

  // ---------------------------------------------------------------- the limit book

  /** Mark the account the Task was running on as at its limit, until `resetAt` (absent = the vendor gave none). */
  markLimit(projectId: string, accountId: string, resetAt?: string): void {
    const account = this.deps.accounts.get(accountId)
    if (account === undefined) return
    const current = this.deps.screens.get<LimitDoc>(projectId, LIMIT, accountId)
    if (current !== undefined && current.resetAt === resetAt) return
    const since = this.now()
    const logId = `${accountId}:${since}`
    this.deps.accounts.update(accountId, { status: 'limit' })
    this.deps.screens.put(projectId, LIMIT, accountId, {
      accountId, label: account.label, provider: account.provider, since, ...(resetAt === undefined ? {} : { resetAt }), logId,
    } satisfies LimitDoc)
    this.deps.screens.put(projectId, LIMIT_LOG, logId, {
      accountId, label: account.label, provider: account.provider, at: since, ...(resetAt === undefined ? {} : { resetAt }),
    })
  }

  /** Clear the limits whose clock passed, or that the vendor now shows with room; and the holds that went with them. */
  expireLimits(projectId: string): number {
    const nowMs = Date.parse(this.now())
    let cleared = 0
    for (const doc of this.deps.screens.list<LimitDoc>(projectId, LIMIT)) {
      const quotas = this.deps.usage.listQuota(projectId, doc.provider).filter(row => row.accountId === doc.accountId)
      const known = exhaustionOf(quotas.flatMap(row => row.windows))
      const clockPassed = doc.resetAt !== undefined && Date.parse(doc.resetAt) <= nowMs
      const stale = doc.resetAt === undefined && nowMs - Date.parse(doc.since) >= LIMIT_WITHOUT_CLOCK_MS
      if (!clockPassed && !stale && known.exhausted !== false) continue
      if (this.deps.accounts.get(doc.accountId)?.status === 'limit') this.deps.accounts.update(doc.accountId, { status: 'ok' })
      this.deps.screens.delete(projectId, LIMIT, doc.accountId)
      const logged = this.deps.screens.get<Record<string, unknown>>(projectId, LIMIT_LOG, doc.logId)
      if (logged !== undefined) this.deps.screens.put(projectId, LIMIT_LOG, doc.logId, { ...logged, clearedAt: this.now() })
      for (const hold of this.deps.screens.list<{ personaId: string; accountId: string }>(projectId, HOLD)) {
        if (hold.accountId === doc.accountId) this.deps.screens.delete(projectId, HOLD, hold.personaId)
      }
      cleared += 1
    }
    return cleared
  }

  /** A persona sent back by Desfazer waits on the account she left: the auto switch must not take her away again. */
  isHeld(projectId: string, personaId: string, accountId: string): boolean {
    return this.deps.screens.get<{ accountId: string }>(projectId, HOLD, personaId)?.accountId === accountId
  }

  // ---------------------------------------------------------------- proposals

  private policyOf(workspaceId: string, provider: string, personaId: string): { policy: RunnerSwapPolicy; explicit: boolean } {
    return {
      policy: storedSwapPolicy(this.deps.accounts, workspaceId, provider, personaId).policy,
      explicit: this.deps.accounts.getPolicy(workspaceId, provider, personaId) !== undefined,
    }
  }

  /** The Tasks the quota stopped, with the accounts of their engine, ready for the pure proposal rule. */
  waiting(projectId: string): SwapWaiting[] {
    const workspaceId = this.deps.product.getProject(projectId)?.workspaceId
    if (workspaceId === undefined) return []
    this.expireLimits(projectId)
    const rt = this.deps.orchestration.runtime(projectId)
    const probes = this.deps.connections()
    return this.deps.orchestration.quotaRows(projectId).flatMap((row): SwapWaiting[] => {
      const persona = row.personaId === undefined ? undefined : this.deps.product.getPersona(row.personaId)
      const ticket = rt.repo.tickets.get(row.ticketId)
      if (persona === undefined || persona.runner.kind !== 'cli' || persona.runner.cli === undefined || ticket === undefined) return []
      const provider = persona.runner.cli
      const quotas = this.deps.usage.listQuota(projectId, provider)
      const accounts = this.deps.accounts.list(workspaceId, provider).map((account): SwapAccount => {
        const known = exhaustionOf(quotas.filter(quota => quota.accountId === account.id).flatMap(quota => quota.windows))
        const exhausted = known.exhausted ?? (account.status === 'limit' ? true : undefined)
        return {
          id: account.id,
          label: account.label,
          loggedIn: account.homeDir === ''
            ? probes.some(card => card.kind === account.provider && card.loggedIn)
            : this.deps.loginStatus(account.homeDir) === 'logged_in',
          status: account.status,
          ...(exhausted === undefined ? {} : { exhausted }),
          ...(known.resetsAt === undefined ? {} : { resetsAt: known.resetsAt }),
        }
      })
      return [{
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        personaId: persona.id,
        personaName: persona.name,
        provider,
        ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
        ...(row.resetAt === undefined ? {} : { resetAt: row.resetAt }),
        accounts,
        policy: this.policyOf(workspaceId, provider, persona.id).policy,
      }]
    })
  }

  proposals(projectId: string): AccountSwapProposal[] {
    return proposeAccountSwaps(this.waiting(projectId))
  }

  // ---------------------------------------------------------------- when a Task stops

  /**
   * A Task was stopped by the quota: record the limit, then act on the persona's policy. Default ("perguntar"): post the Notice.
   * A policy the person chose ("próxima", "dividir"): switch now and post the line with Desfazer. "Fixa", or nowhere to go:
   * nothing here (the band says "No limite até {hora}").
   */
  async onQuotaStop(projectId: string, ticketId: string): Promise<void> {
    const row = this.deps.orchestration.quotaRows(projectId).find(item => item.ticketId === ticketId)
    if (row === undefined) return
    if (row.accountId !== undefined) this.markLimit(projectId, row.accountId, row.resetAt)
    const proposal = this.proposals(projectId).find(item => item.ticketId === ticketId)
    if (proposal === undefined) return
    const workspaceId = this.deps.product.getProject(projectId)?.workspaceId ?? ''
    const { explicit } = this.policyOf(workspaceId, proposal.provider, proposal.personaId)
    if (explicit && (proposal.policy === 'next_on_limit' || proposal.policy === 'round_robin') && !this.isHeld(projectId, proposal.personaId, proposal.from.accountId)) {
      await this.apply(projectId, proposal, proposal.to.accountId, { auto: true })
      return
    }
    this.postAsk(projectId, proposal, row.assignmentId)
  }

  private origin(projectId: string, ticketId: string): { ticket: { id: string; title: string; origin: { triggerId: string } }; event: ReturnType<EventRepos['get']> } | undefined {
    const ticket = this.deps.orchestration.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) return undefined
    return { ticket, event: this.deps.events.get(ticket.origin.triggerId) }
  }

  private askId(ticketId: string, assignmentId: string): string {
    return `coord-${ticketId}-swap-ask-${assignmentId}`
  }

  private postAsk(projectId: string, proposal: AccountSwapProposal, assignmentId: string): void {
    const origin = this.origin(projectId, proposal.ticketId)
    const persona = this.deps.product.getPersona(proposal.personaId)
    if (origin?.event === undefined || persona === undefined) return
    const view: AccountAskEventView = {
      ticketId: proposal.ticketId, personaId: proposal.personaId, personaName: proposal.personaName, provider: proposal.provider,
      from: proposal.from, to: { accountId: proposal.to.accountId, label: proposal.to.label }, quota: proposal.to.quota,
      ...(proposal.waitUntil === undefined ? {} : { until: proposal.waitUntil }),
    }
    this.deps.orchestration.postThreadLine(
      origin.event, persona, this.askId(proposal.ticketId, assignmentId),
      accountAskBody(view, `A conta ${proposal.from.label} chegou no limite. ${proposal.personaName} pode continuar na conta ${proposal.to.label}.`),
    )
  }

  private resolveAsk(ticketId: string, assignmentId: string | undefined, resolved: 'continued' | 'waiting'): void {
    if (assignmentId === undefined) return
    const id = this.askId(ticketId, assignmentId)
    const stored = this.deps.events.get(id)
    if (stored === undefined) return
    const marker = /\[\[account-ask:([\s\S]+?)\]\]\s*$/u.exec(stored.body)
    if (marker?.[1] === undefined) return
    try {
      const payload = JSON.parse(marker[1]) as Record<string, unknown>
      const sentence = stored.body.slice(0, marker.index).trimEnd()
      this.deps.events.edit(id, `${sentence}\n[[account-ask:${JSON.stringify({ ...payload, resolved })}]]`, this.now())
    } catch (error) {
      void error
    }
  }

  // ---------------------------------------------------------------- doing the switch

  /**
   * Move the persona to `toAccountId` and run the stopped Task again on it. Always leaves a trace: the swap record (what Desfazer
   * undoes), the team-feed line, an audit row, and — when the policy switched it — the thread line with Desfazer.
   */
  async apply(projectId: string, proposal: AccountSwapProposal, toAccountId: string, options: { readonly auto: boolean }): Promise<AccountSwapResultView> {
    const chosen = [proposal.to, ...proposal.alternatives].find(option => option.accountId === toAccountId)
    if (chosen === undefined) return { applied: false, resumed: false, reason: 'unknown-account' }
    const persona = this.deps.product.getPersona(proposal.personaId)
    const origin = this.origin(projectId, proposal.ticketId)
    if (persona === undefined || origin === undefined) return { applied: false, resumed: false, reason: 'not-waiting' }
    const row = this.deps.orchestration.quotaRows(projectId).find(item => item.ticketId === proposal.ticketId)
    const at = this.now()
    this.deps.screens.put(projectId, ACTIVE, persona.id, { accountId: chosen.accountId })
    this.deps.screens.delete(projectId, HOLD, persona.id)
    const activity = formatAccountSwitch({ personaName: persona.name, provider: proposal.provider, label: chosen.label })
    this.deps.screens.put(projectId, 'account_activity', `${persona.id}:${at}`, { body: activity })
    const swapId = `${persona.id}:${at}`
    const view: AccountSwapEventView = {
      swapId, personaId: persona.id, personaName: persona.name, provider: proposal.provider,
      from: proposal.from, to: { accountId: chosen.accountId, label: chosen.label },
      ...(proposal.waitUntil === undefined ? {} : { until: proposal.waitUntil }),
      auto: options.auto, undone: false,
    }
    const eventId = options.auto ? `coord-swap-${swapId}` : undefined
    this.deps.screens.put(projectId, SWAP, swapId, { ...view, at, ticketId: proposal.ticketId, ...(eventId === undefined ? {} : { eventId }) } satisfies SwapDoc)
    // the book is the `account_swap` record above (the audit table only knows edit/delete/pin/react); an automatic switch is also a thread line
    if (origin.event !== undefined && options.auto && eventId !== undefined) {
      this.deps.orchestration.postThreadLine(
        origin.event, persona, eventId,
        accountSwapBody(view, `${persona.name} passou para a conta ${chosen.label}: a ${proposal.from.label} chegou no limite.`),
      )
    }
    this.resolveAsk(proposal.ticketId, row?.assignmentId, 'continued')
    this.deps.orchestration.evictWarmRunners(projectId, persona.id)
    const resumed = await this.deps.orchestration.resumeQuotaWaiting(projectId, { ticketId: proposal.ticketId, force: true })
    return { applied: true, resumed: resumed > 0, activity }
  }

  /** The person confirmed one of the proposed accounts. */
  async confirm(projectId: string, ticketId: string, toAccountId: string): Promise<AccountSwapResultView> {
    const proposal = this.proposals(projectId).find(item => item.ticketId === ticketId)
    if (proposal === undefined) return { applied: false, resumed: false, reason: 'not-waiting' }
    return this.apply(projectId, proposal, toAccountId, { auto: false })
  }

  /** "Esperar até {hora}": the Task keeps waiting for the window; the Notice closes. */
  decline(projectId: string, ticketId: string): boolean {
    const row = this.deps.orchestration.quotaRows(projectId).find(item => item.ticketId === ticketId)
    if (row === undefined) return false
    this.resolveAsk(ticketId, row.assignmentId, 'waiting')
    return true
  }

  /**
   * Desfazer: the persona goes back to the account she left and WAITS there until that limit clears (the hold stops the policy
   * from taking her away again). A turn already running on the new account finishes there; this changes what comes next.
   */
  undo(projectId: string, swapId: string): UndoAccountSwapResultView {
    const doc = this.deps.screens.get<SwapDoc>(projectId, SWAP, swapId)
    if (doc === undefined) return { undone: false, reason: 'not-found' }
    if (doc.undone) return { undone: false, reason: 'already-undone' }
    const active = this.deps.screens.get<{ accountId: string }>(projectId, ACTIVE, doc.personaId)?.accountId
    if (active !== doc.to.accountId) return { undone: false, reason: 'stale' }
    this.deps.screens.put(projectId, ACTIVE, doc.personaId, { accountId: doc.from.accountId })
    this.deps.screens.put(projectId, HOLD, doc.personaId, { personaId: doc.personaId, accountId: doc.from.accountId, since: this.now() })
    this.deps.screens.put(projectId, SWAP, swapId, { ...doc, undone: true, undoneAt: this.now() })
    this.deps.orchestration.evictWarmRunners(projectId, doc.personaId)
    if (doc.eventId !== undefined) {
      const stored = this.deps.events.get(doc.eventId)
      if (stored !== undefined) {
        const marker = /\[\[account-swap:/u.exec(stored.body)
        const sentence = marker === null ? stored.body : stored.body.slice(0, marker.index).trimEnd()
        const { at, ticketId, eventId, ...view } = doc
        void at
        void ticketId
        void eventId
        this.deps.events.edit(doc.eventId, accountSwapBody({ ...view, undone: true }, sentence), this.now())
      }
    }
    return { undone: true }
  }

  /** Switches of the last 24 h, newest first: the "na conta Pessoal" subtitle and the Desfazer. */
  recent(projectId: string): AccountSwapRecordView[] {
    const nowMs = Date.parse(this.now())
    return this.deps.screens.list<SwapDoc>(projectId, SWAP)
      .filter(doc => nowMs - Date.parse(doc.at) <= RECENT_MS)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((doc): AccountSwapRecordView => {
        const active = this.deps.screens.get<{ accountId: string }>(projectId, ACTIVE, doc.personaId)?.accountId
        const { eventId, ...view } = doc
        void eventId
        return { ...view, undoable: !doc.undone && active === doc.to.accountId }
      })
  }

  /**
   * The auditable history for "Uso e limites": every time an account hit its limit and every switch, newest first. Append-only;
   * nothing here is ever deleted (a cleared limit only gains `clearedAt`).
   */
  book(projectId: string, limit?: number): AccountLimitBookView {
    const cap = Math.max(1, Math.min(200, Math.trunc(limit ?? 50)))
    const limits = this.deps.screens.list<{ accountId: string; label: string; provider: string; at: string; resetAt?: string; clearedAt?: string }>(projectId, LIMIT_LOG)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, cap)
      .map(row => ({
        accountId: row.accountId, label: row.label, provider: row.provider, at: row.at,
        ...(row.resetAt === undefined ? {} : { resetAt: row.resetAt }),
        ...(row.clearedAt === undefined ? {} : { clearedAt: row.clearedAt }),
        active: row.clearedAt === undefined,
      }))
    const swaps = this.deps.screens.list<SwapDoc>(projectId, SWAP)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, cap)
      .map((doc) => {
        const active = this.deps.screens.get<{ accountId: string }>(projectId, ACTIVE, doc.personaId)?.accountId
        const { eventId, ...view } = doc
        void eventId
        return { ...view, undoable: !doc.undone && active === doc.to.accountId }
      })
    return { limits, swaps }
  }

  /** An automatic switch decided when a runner is resolved (explicit policy): same record and team-feed line, no thread. */
  recordSeatSwitch(projectId: string, input: { personaId: string; personaName: string; provider: string; fromId: string; toId: string }): void {
    const from = this.deps.accounts.get(input.fromId)
    const to = this.deps.accounts.get(input.toId)
    if (from === undefined || to === undefined || from.id === to.id) return
    const at = this.now()
    const swapId = `${input.personaId}:${at}`
    this.deps.screens.put(projectId, SWAP, swapId, {
      swapId, personaId: input.personaId, personaName: input.personaName, provider: input.provider,
      from: { accountId: from.id, label: from.label }, to: { accountId: to.id, label: to.label }, auto: true, undone: false, at,
    } satisfies SwapDoc)
  }
}

/**
 * Aprovações as an inbox (REVIEW-APPROVALS-REDESIGN §2): one list, three groups, a detail on the side. Pure: it only
 * sorts what the Decision store already holds into rows. Nothing here decides or invents anything.
 */

import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { PermissionValidity } from '../primitives/index.ts'
import type { DecisionState } from '../decisions/decision-types.ts'
import { approvalTitle } from './approvals-ui-helpers.ts'
import type { ApprovalItem, ApprovalKind } from './mock-data.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'

/** What the person chose on one card's "Lembrar esta permissão" (each card keeps its own: they are decided in any order). */
export interface RememberChoice {
  readonly grant: boolean
  readonly validity: PermissionValidity
}

export type InboxGroupId = 'now' | 'proposals' | 'vault'

export interface InboxRow {
  readonly id: string
  /** `item`: a card someone waits on. `proposal`: a persona's own initiative from the daily summary. */
  readonly source: 'item' | 'proposal'
  readonly group: InboxGroupId
  readonly kind: ApprovalKind
  readonly title: string
  readonly proposerName: string
  readonly proposerPersonaId?: string | undefined
  /** Gallery id of the proposer's animal, when the summary knows it. */
  readonly proposerCharacterId?: string | undefined
  /** ISO moment (or the summary's day) for `formatWhen`. */
  readonly at?: string | undefined
  readonly state: DecisionState | undefined
  readonly risk: 'low' | 'normal'
  readonly item?: ApprovalItem
  readonly proposal?: ProactiveProposal
}

export interface InboxGroup {
  readonly id: InboxGroupId
  readonly title: string
  readonly rows: readonly InboxRow[]
}

const GROUP_ORDER: readonly InboxGroupId[] = ['now', 'proposals', 'vault']

/** A card that has not been decided yet (still open for the person). */
export function isOpen(state: DecisionState | undefined): boolean {
  return state === undefined || state === 'pending' || state === 'failed'
}

function itemRow(dict: LocaleDict, item: ApprovalItem): InboxRow {
  return {
    id: item.id,
    source: 'item',
    group: item.kind === 'vault' ? 'vault' : 'now',
    kind: item.kind,
    title: approvalTitle(dict, item),
    proposerName: item.proposerName?.trim() ?? '',
    proposerPersonaId: item.proposerPersonaId,
    at: item.createdAt,
    state: item.decisionState,
    risk: item.risk ?? 'normal',
    item,
  }
}

function proposalRow(summary: PersonaDailyProactiveSummary, proposal: ProactiveProposal): InboxRow {
  return {
    id: proposal.id,
    source: 'proposal',
    group: proposal.approvalKind === 'vault' ? 'vault' : 'proposals',
    kind: proposal.approvalKind ?? 'attention',
    title: proposal.title,
    proposerName: summary.personaName,
    proposerPersonaId: summary.personaId,
    proposerCharacterId: summary.personaCharacterId,
    at: summary.summaryDate,
    state: proposal.decisionState,
    risk: 'normal',
    proposal,
  }
}

/**
 * The inbox groups, in the order the person reads them: "Precisa de você agora" (cards someone waits on), "Propostas"
 * (a persona's own initiative) and "Cofre" (any update of the company's memory). Empty groups are left out.
 */
export function buildInboxGroups(
  dict: LocaleDict,
  items: readonly ApprovalItem[],
  summaries: readonly PersonaDailyProactiveSummary[],
): readonly InboxGroup[] {
  const rows: InboxRow[] = [
    ...items.map(item => itemRow(dict, item)),
    ...summaries.flatMap(summary => summary.proposals.map(proposal => proposalRow(summary, proposal))),
  ]
  return GROUP_ORDER
    .map((id): InboxGroup => ({ id, title: bindLocale(dict, `inbox.group.${id}`), rows: rows.filter(row => row.group === id) }))
    .filter(group => group.rows.length > 0)
}

/** Every row in reading order (what J/K walk through). */
export function flattenRows(groups: readonly InboxGroup[]): readonly InboxRow[] {
  return groups.flatMap(group => group.rows)
}

/**
 * Cards the batch "Aprovar de risco baixo" may take: open, a real card (not a persona's initiative), low risk and not
 * held back by a dependency. A hire, any spend or any access is `normal` and never comes here.
 */
export function batchEligible(rows: readonly InboxRow[]): readonly InboxRow[] {
  return rows.filter(row => row.source === 'item'
    && row.risk === 'low'
    && (row.state === undefined || row.state === 'pending')
    && (row.item?.dependsOnTitle?.trim() ?? '') === '')
}

/** After the selected row is decided: the next open row below it, else the nearest open one above, else none. */
export function nextOpenAfter(rows: readonly InboxRow[], id: string): string | undefined {
  const index = rows.findIndex(row => row.id === id)
  const below = rows.slice(index + 1).find(row => isOpen(row.state))
  if (below !== undefined) return below.id
  return rows.slice(0, Math.max(index, 0)).reverse().find(row => isOpen(row.state))?.id
}

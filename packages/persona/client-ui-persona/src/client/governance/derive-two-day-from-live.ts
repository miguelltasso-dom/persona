import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { TwoDayOutcomeView, TwoDayRowView, TwoDayTestView } from './governance-contract.ts'
import { defaultTwoDaySlotLabels } from './governance-ui-helpers.ts'
import { twoDayRowIdentity } from './two-day-dedupe.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'

function slotsForState(state: string, queueCount: number): readonly TwoDayOutcomeView[] {
  if (state === 'working') return ['runs', 'runs', 'runs', 'runs']
  if (state === 'waiting') return ['waits', 'waits', 'waits', 'waits']
  if (state === 'stuck') return ['stops', 'stops', 'stops', 'stops']
  if (state === 'resting' && queueCount > 0) return ['waits', 'runs', 'runs', 'runs']
  return ['runs', 'runs', 'runs', 'runs']
}

function rowFixForState(
  dict: LocaleDict,
  state: string,
  memberId: string,
): Pick<TwoDayRowView, 'reason' | 'fixKind' | 'fixTargetId'> | undefined {
  if (state === 'waiting') {
    return {
      reason: bindLocale(dict, 'twoDay.reason.approvalYou'),
      fixKind: 'raise_autonomy',
      fixTargetId: memberId,
    }
  }
  if (state === 'stuck') {
    return {
      reason: bindLocale(dict, 'twoDay.reason.stuck'),
      fixKind: 'set_substitute',
      fixTargetId: memberId,
    }
  }
  return undefined
}

function personaRowLabel(role: string, name: string): string {
  return `${role} (${name})`
}

/** Build two-day rows from live queue/state (no fictional demo names). */
export function deriveTwoDayFromLive(
  dict: LocaleDict,
  workspaceId: string,
  live: PersonaLiveSnapshot,
): TwoDayTestView | null {
  if (!live.ready) return null
  const t = (key: string) => bindLocale(dict, key)
  const rows: TwoDayRowView[] = []
  const seenPersonaIds = new Set<string>()
  const seenIdentities = new Set<string>()

  for (const nowRow of live.nowRows) {
    const { member, queueCount, currentTask } = nowRow
    seenPersonaIds.add(member.id)
    seenIdentities.add(twoDayRowIdentity({ id: '', label: personaRowLabel(member.role, member.name), slots: ['runs', 'runs', 'runs', 'runs'] }))
    if (member.state === 'resting' && queueCount === 0) continue
    const fix = rowFixForState(dict, member.state, member.id)
    const timelineRow: TwoDayRowView = {
      id: `live-now-${member.id}`,
      label: personaRowLabel(member.role, member.name),
      slots: slotsForState(member.state, queueCount),
      ...fix,
    }
    if (fix === undefined && (member.state === 'waiting' || member.state === 'stuck') && currentTask !== undefined && currentTask.length > 0) {
      rows.push({ ...timelineRow, reason: currentTask })
    } else {
      rows.push(timelineRow)
    }
  }

  if (live.team !== null) {
    for (const persona of live.team.personas) {
      if (seenPersonaIds.has(persona.id)) continue
      const identity = twoDayRowIdentity({
        id: '',
        label: personaRowLabel(persona.title, persona.name),
        slots: ['runs', 'runs', 'runs', 'runs'],
      })
      if (seenIdentities.has(identity)) continue
      seenIdentities.add(identity)
      if (persona.systemRoles.includes('watchdog')) {
        rows.push({
          id: `live-persona-${persona.id}`,
          label: personaRowLabel(persona.title, persona.name),
          slots: ['runs', 'runs', 'runs', 'runs'],
        })
        continue
      }
      rows.push({
        id: `live-persona-${persona.id}`,
        label: personaRowLabel(persona.title, persona.name),
        slots: ['runs', 'runs', 'waits', 'waits'],
        reason: t('twoDay.reason.approvalYou'),
        fixKind: 'raise_autonomy',
        fixTargetId: persona.id,
      })
    }
  }

  for (const card of live.kanbanCards) {
    if (!card.blocked && !card.waitingEvent) continue
    const cardRow: TwoDayRowView = {
      id: `live-card-${card.id}`,
      label: card.title,
      slots: card.blocked ? ['stops', 'stops', 'stops', 'stops'] : ['waits', 'waits', 'waits', 'waits'],
      reason: t('twoDay.reason.approvalYou'),
      fixKind: 'set_routine_owner',
      fixTargetId: card.id,
    }
    if (card.assignee !== undefined && cardRow.reason === t('twoDay.reason.approvalYou')) {
      rows.push({ ...cardRow, reason: `${t('twoDay.reason.approvalYou')} (${card.assignee.name})` })
    } else {
      rows.push(cardRow)
    }
  }

  const needsYou = live.attentionTitles.length > 0
    || live.nowRows.some(row => row.member.state === 'waiting')
  if (needsYou && !rows.some(row => row.id === 'live-approvals-you')) {
    rows.push({
      id: 'live-approvals-you',
      label: t('twoDay.row.approvals'),
      slots: ['waits', 'waits', 'waits', 'waits'],
      reason: t('twoDay.reason.approvalYou'),
      fixKind: 'set_substitute',
      fixTargetId: 'approvals-you',
    })
  }

  if (rows.length === 0) return null
  return {
    workspaceId,
    slotLabels: defaultTwoDaySlotLabels(dict),
    rows,
  }
}

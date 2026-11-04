/**
 * Team health in plain language, plus the 2-day test (D-054).
 */

import { DomainError } from '../domain/schemas.ts'
import { resolveApproval } from './escalate.ts'
import {
  autonomyWithinCeiling,
  chargeOf,
  humanName,
  humanPresence,
  routineAutonomy,
  sectorOf,
  sectorRequiresApproval,
  type GovernanceAutonomy,
  type GovernanceSnapshot,
  type PersonaCharge,
  type RoutineCharge,
} from './model.ts'

const OVERLOAD = 4
const QUEUE_FULL = 6
const IDLE_MS = 3 * 24 * 60 * 60 * 1000

/** Actionable health item. Copy is pt-BR, no jargon. */
export type HealthKind =
  | 'persona_without_responsible'
  | 'sector_without_coverage'
  | 'routine_without_owner'
  | 'single_point_of_failure'
  | 'human_overloaded'
  | 'persona_queue_full'
  | 'persona_idle_long'

export interface HealthItem {
  kind: HealthKind
  subjectId: string
  message: string
  fix?: GovernanceFix
}

export interface HealthReport {
  score: number
  items: readonly HealthItem[]
}

export type GovernanceFix =
  | { kind: 'set_substitute'; personaId: string; humanId: string }
  | { kind: 'raise_autonomy'; routineId: string; to: GovernanceAutonomy }
  | { kind: 'delegate_to_coordination'; routineId: string }

export type TimelineFate = 'continues' | 'waits' | 'stops'

export type TwoDayLineKind = 'routine' | 'approval' | 'persona'

export interface TwoDayEvent {
  at: string
  subjectId: string
  title: string
  fate: TimelineFate
  why: string
  fix?: GovernanceFix
  personaId?: string
}

export interface TwoDayLine {
  readonly kind: TwoDayLineKind
  readonly subjectId: string
  readonly title: string
  readonly fate: TimelineFate
  readonly why: string
  readonly personaId?: string
}

export interface TwoDayResult {
  from: string
  until: string
  events: readonly TwoDayEvent[]
  continues: number
  waits: number
  stops: number
}

function routineOwnerMissing(routine: RoutineCharge): boolean {
  return routine.executorPersonaId === undefined || routine.responsibleHumanId === undefined
}

/**
 * Score the team. Missing responsável / coverage / owner / single point always appear.
 * @param snapshot - Workspace.
 * @param at - ISO clock for idle / away.
 */
export function assessTeamHealth(snapshot: GovernanceSnapshot, at: string): HealthReport {
  const items: HealthItem[] = []
  for (const persona of snapshot.personas) {
    const charge = chargeOf(snapshot, persona.id)
    if (charge === undefined) {
      items.push({
        kind: 'persona_without_responsible',
        subjectId: persona.id,
        message: `${persona.title} não tem quem responda por ela.`,
      })
    }
    const queue = snapshot.queueByPersona?.[persona.id] ?? 0
    if (queue >= QUEUE_FULL) {
      items.push({
        kind: 'persona_queue_full',
        subjectId: persona.id,
        message: `${persona.title} tem a fila sempre cheia (${String(queue)}). Talvez falte gente.`,
      })
    }
    const idle = snapshot.idleSince?.[persona.id]
    if (idle !== undefined && Date.parse(at) - Date.parse(idle) >= IDLE_MS) {
      items.push({
        kind: 'persona_idle_long',
        subjectId: persona.id,
        message: `${persona.title} está quieta há dias. Talvez sobre.`,
      })
    }
  }
  for (const sector of snapshot.sectors) {
    const covered = snapshot.charges.some(row => row.sectorId === sector.id)
    if (!covered) {
      items.push({
        kind: 'sector_without_coverage',
        subjectId: sector.id,
        message: `Ninguém cobre ${sector.name}.`,
      })
    }
  }
  for (const routine of snapshot.routines) {
    if (!routineOwnerMissing(routine)) continue
    items.push({
      kind: 'routine_without_owner',
      subjectId: routine.routineId,
      message: `A rotina “${routine.title}” não tem dono.`,
    })
  }
  const uniques = new Set(snapshot.charges.map(row => row.responsibleHumanId))
  const anySub = snapshot.charges.some(row => row.substituteHumanId !== undefined)
  if (snapshot.personas.length > 1 && snapshot.charges.length >= 1 && uniques.size === 1 && !anySub) {
    const only = snapshot.charges[0]?.responsibleHumanId ?? ''
    const backup = snapshot.humans.find(row => row.id !== only)
    const item: HealthItem = {
      kind: 'single_point_of_failure',
      subjectId: only,
      message: `Tudo depende de ${humanName(snapshot, only)} para aprovar. Se essa pessoa some, a equipe para.`,
    }
    if (backup !== undefined) {
      item.fix = {
        kind: 'set_substitute',
        personaId: snapshot.charges[0]?.personaId ?? '',
        humanId: backup.id,
      }
    }
    items.push(item)
  }
  const count = new Map<string, number>()
  for (const charge of snapshot.charges) {
    count.set(charge.responsibleHumanId, (count.get(charge.responsibleHumanId) ?? 0) + 1)
  }
  for (const [humanId, n] of count) {
    if (n <= OVERLOAD) continue
    items.push({
      kind: 'human_overloaded',
      subjectId: humanId,
      message: `${humanName(snapshot, humanId)} cuida de ${String(n)} personas. Demais para uma pessoa.`,
    })
  }
  const score = Math.max(0, 100 - items.length * 12)
  return { score, items }
}

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString()
}

function suggestedFix(snapshot: GovernanceSnapshot, routine: RoutineCharge): GovernanceFix | undefined {
  if (routine.executorPersonaId !== undefined) {
    const charge = chargeOf(snapshot, routine.executorPersonaId)
    const backup = snapshot.humans.find(row => row.id !== charge?.responsibleHumanId)
    if (charge !== undefined && charge.substituteHumanId === undefined && backup !== undefined) {
      return { kind: 'set_substitute', personaId: routine.executorPersonaId, humanId: backup.id }
    }
  }
  const ceiling = sectorOf(snapshot, routine.sectorId)?.policy.autonomy ?? 'propose'
  if (autonomyWithinCeiling('act', ceiling) && routineAutonomy(snapshot, routine) !== 'act') {
    return { kind: 'raise_autonomy', routineId: routine.routineId, to: 'act' }
  }
  return { kind: 'delegate_to_coordination', routineId: routine.routineId }
}

function stampPersona(event: TwoDayEvent, personaId: string | undefined): TwoDayEvent {
  return personaId === undefined || personaId === '' ? event : { ...event, personaId }
}

function fateOf(
  snapshot: GovernanceSnapshot,
  routine: RoutineCharge,
  at: string,
  delegated: ReadonlySet<string>,
): TwoDayEvent {
  const personaId = routine.executorPersonaId
  if (routineOwnerMissing(routine)) {
    return stampPersona({
      at, subjectId: routine.routineId, title: routine.title, fate: 'stops',
      why: `A rotina “${routine.title}” não tem dono. Sem dono, ela para.`,
    }, personaId)
  }
  const needsHuman = sectorRequiresApproval(snapshot, routine)
  const autonomy = routineAutonomy(snapshot, routine)
  if (!needsHuman && autonomy === 'act') {
    return stampPersona({
      at, subjectId: routine.routineId, title: routine.title, fate: 'continues',
      why: `“${routine.title}” segue sozinha (autonomia dentro do limite).`,
    }, personaId)
  }
  const route = resolveApproval(snapshot, personaId ?? '', at, delegated.has(routine.routineId))
  if (route.kind === 'wait') {
    const event: TwoDayEvent = {
      at, subjectId: routine.routineId, title: routine.title, fate: 'waits',
      why: route.notice,
    }
    const fix = suggestedFix(snapshot, routine)
    if (fix !== undefined) event.fix = fix
    return stampPersona(event, personaId)
  }
  if (route.kind === 'human' && route.role === 'substitute') {
    return stampPersona({
      at, subjectId: routine.routineId, title: routine.title, fate: 'continues',
      why: `O substituto cobre “${routine.title}” enquanto o responsável está fora.`,
    }, personaId)
  }
  if (route.kind === 'coordination') {
    return stampPersona({
      at, subjectId: routine.routineId, title: routine.title, fate: 'continues',
      why: `A Coordenação cobre a aprovação de “${routine.title}” dentro do orçamento.`,
    }, personaId)
  }
  return stampPersona({
    at, subjectId: routine.routineId, title: routine.title, fate: 'continues',
    why: `“${routine.title}” segue com o responsável disponível.`,
  }, personaId)
}

/**
 * Group the 48h walk for Saúde: one line per routine, per waiting approval,
 * and per persona (worst fate wins).
 * @param result - {@link runTwoDayTest}.
 * @returns Lines grouped for Saúde / Lumen.
 */
export function foldTwoDayLines(result: TwoDayResult): {
  readonly routines: readonly TwoDayLine[]
  readonly approvals: readonly TwoDayLine[]
  readonly personas: readonly TwoDayLine[]
} {
  const routines: TwoDayLine[] = []
  const approvals: TwoDayLine[] = []
  for (const event of result.events) {
    const line: TwoDayLine = {
      kind: event.fate === 'waits' ? 'approval' : 'routine',
      subjectId: event.subjectId,
      title: event.title,
      fate: event.fate,
      why: event.why,
      ...(event.personaId === undefined ? {} : { personaId: event.personaId }),
    }
    if (line.kind === 'approval') approvals.push(line)
    else routines.push(line)
  }
  const personas: TwoDayLine[] = []
  const seen = new Set<string>()
  for (const event of result.events) {
    const id = event.personaId
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const rows = result.events.filter(row => row.personaId === id)
    const fate: TimelineFate = rows.some(row => row.fate === 'stops')
      ? 'stops'
      : rows.some(row => row.fate === 'waits') ? 'waits' : 'continues'
    personas.push({
      kind: 'persona',
      subjectId: id,
      title: id,
      fate,
      why: rows[0]?.why ?? '',
      personaId: id,
    })
  }
  return { routines, approvals, personas }
}

/**
 * Fake-clock 48h walk over the real configuration.
 * @param snapshot - Workspace (after optional 1-click fixes).
 * @param from - Start instant (ISO).
 * @param delegated - Routine ids already delegated to coordination.
 */
export function runTwoDayTest(
  snapshot: GovernanceSnapshot,
  from: string,
  delegated: ReadonlySet<string> = new Set(),
): TwoDayResult {
  const until = addHours(from, 48)
  const events: TwoDayEvent[] = []
  for (const routine of snapshot.routines) {
    const hours = routine.cadence === 'weekly' ? [12] : [12, 36]
    for (const hour of hours) {
      const at = addHours(from, hour)
      if (Date.parse(at) >= Date.parse(until)) continue
      events.push(fateOf(snapshot, routine, at, delegated))
    }
  }
  return {
    from,
    until,
    events,
    continues: events.filter(row => row.fate === 'continues').length,
    waits: events.filter(row => row.fate === 'waits').length,
    stops: events.filter(row => row.fate === 'stops').length,
  }
}

/**
 * Apply a 1-click correction. Autonomy never exceeds the sector ceiling.
 * @param snapshot - Current config.
 * @param fix - Suggested fix.
 */
export function applyGovernanceFix(snapshot: GovernanceSnapshot, fix: GovernanceFix): GovernanceSnapshot {
  if (fix.kind === 'set_substitute') {
    const charges = snapshot.charges.map((row): PersonaCharge => {
      if (row.personaId !== fix.personaId) return row
      if (row.responsibleHumanId === fix.humanId) throw new DomainError('INVALID_GOVERNANCE', 'substitute_is_responsible')
      return { ...row, substituteHumanId: fix.humanId }
    })
    return { ...snapshot, charges }
  }
  if (fix.kind === 'raise_autonomy') {
    const routines = snapshot.routines.map((row): RoutineCharge => {
      if (row.routineId !== fix.routineId) return row
      const ceiling = sectorOf(snapshot, row.sectorId)?.policy.autonomy ?? 'propose'
      if (!autonomyWithinCeiling(fix.to, ceiling)) throw new DomainError('INVALID_GOVERNANCE', 'autonomy_ceiling')
      return { ...row, autonomy: fix.to }
    })
    return { ...snapshot, routines }
  }
  return snapshot
}

/**
 * Presence helper used by the engine when routing Attention.
 * @param snapshot - Workspace.
 * @param humanId - Person.
 * @param at - Instant.
 */
export function isHumanOut(snapshot: GovernanceSnapshot, humanId: string, at: string): boolean {
  return humanPresence(snapshot.away, humanId, at) !== 'available'
}

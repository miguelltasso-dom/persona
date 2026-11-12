/**
 * IV-9: create, edit and delete a Routine without the person ever seeing a cron string.
 *
 * The pure parts live here (validation with pt-BR faults, the `routine_spec` document, the view). The `@Remote`
 * methods in `index.ts` only authorize, call these and persist. A Routine is two rows: the store `routine` (when) and the
 * `routine_spec` screen document (what, and who) that the scheduler reads when the Routine is due.
 */

import type { ProductRepos, Routine, RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { MORNING_ROUTINE_PREFIX } from './morning-brief-host.ts'
import { nextRoutineRun, ROUTINE_SPEC_KIND, type RoutineSpecDoc } from './proactivity-scheduler.ts'
import { describeTrigger, EVENT_RRULE, readTrigger, triggerOfRoutine, type RoutineTrigger } from './routine-events.ts'
import { RemoteFault } from './remote-guard.ts'
import { describeRrule, parseRrule, RruleError } from './rrule-lite.ts'
import type { RoutineView } from './types.ts'

/** Longest “O que fazer” the host keeps. */
export const ROUTINE_PROMPT_MAX = 2000
/** Longest Routine name. */
export const ROUTINE_NAME_MAX = 120
/** Routines the host itself keeps alive per persona (`ensureInitiativeRoutines`); pausing them is allowed, deleting is not. */
export const INITIATIVE_ROUTINE_PREFIX = 'initiative:'

const CATCH_UPS = ['skip', 'run_once', 'run_all'] as const
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/u

function invalid(message: string): RemoteFault {
  return new RemoteFault('invalid-payload', message)
}

/**
 * @param value - Wire value.
 * @param label - Field label used in the message.
 */
function textOf(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalid(`${label}: informe um texto.`)
  return value
}

/** @param id - Routine id from the wire. */
export function checkRoutineId(id: unknown): string {
  const text = textOf(id, 'Rotina')
  if (text.trim() === '' || text.length > 200) throw invalid('Rotina: identificação inválida.')
  return text
}

/** @param name - Routine name from the wire. */
export function checkRoutineName(name: unknown): string {
  const text = textOf(name, 'Nome').replace(/\s+/gu, ' ').trim()
  if (text === '') throw invalid('Dê um nome para a rotina.')
  if (text.length > ROUTINE_NAME_MAX) throw invalid(`O nome da rotina passa de ${String(ROUTINE_NAME_MAX)} caracteres.`)
  return text
}

/** @param prompt - “O que fazer” from the wire. */
export function checkRoutinePrompt(prompt: unknown): string {
  const text = textOf(prompt, 'O que fazer').trim()
  if (text === '') throw invalid('Diga o que a rotina deve fazer.')
  if (text.length > ROUTINE_PROMPT_MAX) throw invalid(`O pedido da rotina passa de ${String(ROUTINE_PROMPT_MAX)} caracteres.`)
  return text
}

/** @param rule - RRULE text; only the subset {@link parseRrule} reads is accepted. */
export function checkRoutineRrule(rule: unknown): string {
  const text = textOf(rule, 'Horário').trim()
  try {
    parseRrule(text)
  } catch (error: unknown) {
    if (error instanceof RruleError) throw invalid('Esse horário não é aceito. Escolha uma repetição pela lista.')
    throw error
  }
  return text
}

/**
 * Item 26: the trigger as it arrives from the screen (untrusted). Absent = the schedule.
 * @param raw - `{ kind: 'schedule' }` or `{ kind: 'event', source, filter }`.
 */
export function checkRoutineTrigger(raw: unknown): RoutineTrigger {
  const read = readTrigger(raw)
  if (read.ok) return read.trigger
  throw invalid(read.reason === 'source' ? 'Esse evento não dá para escutar. Escolha um da lista.' : 'Esse gatilho não é aceito. Escolha um horário ou um evento pela lista.')
}

/** @param zone - IANA time zone. */
export function checkRoutineTimeZone(zone: unknown): string {
  const text = textOf(zone, 'Fuso horário').trim()
  try {
    // eslint-disable-next-line no-new -- the constructor is the validator
    new Intl.DateTimeFormat('en-US', { timeZone: text })
  } catch {
    throw invalid('Esse fuso horário não existe.')
  }
  return text
}

/** @param value - Catch-up policy. */
export function checkRoutineCatchUp(value: unknown): Routine['catchUp'] {
  const found = CATCH_UPS.find(item => item === value)
  if (found === undefined) throw invalid('Escolha o que fazer com as execuções perdidas.')
  return found
}

/**
 * Both ends of the quiet window or none. `''` means no window.
 * @param start - `HH:MM` or `''`.
 * @param end - `HH:MM` or `''`.
 * @returns The pair to store, or `undefined` for no window.
 */
export function checkRoutineSilence(start: unknown, end: unknown): { silenceStart: string; silenceEnd: string } | undefined {
  const from = start === undefined ? '' : textOf(start, 'Início do silêncio').trim()
  const to = end === undefined ? '' : textOf(end, 'Fim do silêncio').trim()
  if (from === '' && to === '') return undefined
  if (from === '' || to === '') throw invalid('Informe o começo e o fim do silêncio, ou nenhum dos dois.')
  if (!CLOCK.test(from) || !CLOCK.test(to)) throw invalid('O silêncio usa horas no formato 22:00.')
  return { silenceStart: from, silenceEnd: to }
}

/**
 * The owner must be a persona of the project. `''`/undefined means “the Coordenação decides”.
 * @param product - Personas.
 * @param projectId - Project of the Routine.
 * @param ownerPersonaId - Persona id from the wire.
 */
export function checkRoutineOwner(product: ProductRepos, projectId: string, ownerPersonaId: unknown): string {
  if (ownerPersonaId === undefined) return ''
  const id = textOf(ownerPersonaId, 'Quem faz').trim()
  if (id === '') return ''
  const persona = product.getPersona(id)
  if (persona === undefined || persona.projectId !== projectId) throw invalid('Essa pessoa da equipe não está neste projeto.')
  return id
}

/**
 * What and who for one Routine, as the scheduler reads it.
 * @param screens - Screen documents.
 * @param projectId - Tenant.
 * @param routineId - Routine id.
 */
export function readRoutineSpec(screens: ScreenRepos, projectId: string, routineId: string): { prompt: string; ownerPersonaId: string; trigger: RoutineTrigger } {
  const spec = screens.get<RoutineSpecDoc>(projectId, ROUTINE_SPEC_KIND, routineId)
  return { prompt: spec?.prompt ?? '', ownerPersonaId: spec?.personaId ?? '', trigger: storedTriggerOf(spec) }
}

/** The trigger a spec document holds, read back as untrusted. */
function storedTriggerOf(spec: RoutineSpecDoc | undefined): RoutineTrigger {
  const read = readTrigger(spec?.trigger)
  return read.ok ? read.trigger : { kind: 'schedule' }
}

/**
 * Persist what and who. An empty spec removes the document so the scheduler falls back to its defaults.
 * @param screens - Screen documents.
 * @param projectId - Tenant.
 * @param routineId - Routine id.
 * @param spec - New values (`''` = none).
 */
export function writeRoutineSpec(
  screens: ScreenRepos,
  projectId: string,
  routineId: string,
  spec: { readonly prompt: string; readonly ownerPersonaId: string; readonly trigger?: RoutineTrigger },
): void {
  // Item 26: an absent trigger keeps the stored one (a persona editing the prompt must not turn "quando chegar e-mail" into nothing).
  const trigger = spec.trigger ?? storedTriggerOf(screens.get<RoutineSpecDoc>(projectId, ROUTINE_SPEC_KIND, routineId))
  if (spec.prompt === '' && spec.ownerPersonaId === '' && trigger.kind === 'schedule') {
    screens.delete(projectId, ROUTINE_SPEC_KIND, routineId)
    return
  }
  const doc: RoutineSpecDoc = {
    ...(spec.ownerPersonaId === '' ? {} : { personaId: spec.ownerPersonaId }),
    ...(spec.prompt === '' ? {} : { prompt: spec.prompt }),
    ...(trigger.kind === 'event' ? { trigger } : {}),
  }
  screens.put(projectId, ROUTINE_SPEC_KIND, routineId, doc)
}

/**
 * Wire view of a Routine: schedule + request + owner + a plain-language schedule and the next due instant.
 * @param routine - Stored routine.
 * @param spec - What/who.
 * @param nowMs - Clock.
 */
export function routineViewOf(routine: Routine, spec: { readonly prompt: string; readonly ownerPersonaId: string; readonly trigger?: RoutineTrigger }, nowMs: number): RoutineView {
  const trigger = triggerOfRoutine(routine.rrule, spec.trigger)
  const next = routine.paused || routine.rrule === EVENT_RRULE ? undefined : nextRoutineRun(routine, nowMs)
  return {
    id: routine.id,
    projectId: routine.projectId,
    name: routine.name,
    rrule: routine.rrule,
    timeZone: routine.timeZone,
    paused: routine.paused,
    catchUp: routine.catchUp,
    prompt: spec.prompt,
    ...(spec.ownerPersonaId === '' ? {} : { ownerPersonaId: spec.ownerPersonaId }),
    humanSchedule: trigger.kind === 'event' ? describeTrigger(trigger) : routine.rrule === EVENT_RRULE ? 'Quando acontecer algo' : describeRrule(routine.rrule),
    nextRunAt: next === undefined ? '' : new Date(next).toISOString(),
    ...(trigger.kind === 'event' ? { trigger } : {}),
    ...(routine.id.startsWith(INITIATIVE_ROUTINE_PREFIX) || routine.id.startsWith(MORNING_ROUTINE_PREFIX) ? { system: true as const } : {}),
  }
}

/** Stored `routine` row: the routine must exist in the caller's project (never trust a bare id). */
export function requireRoutineIn(routines: RoutineRepos, projectId: string, id: unknown): Routine {
  const routine = routines.get(checkRoutineId(id))
  if (routine === undefined || routine.projectId !== projectId) throw new RemoteFault('not-found', 'Rotina não encontrada neste projeto.')
  return routine
}

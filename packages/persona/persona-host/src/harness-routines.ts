/**
 * HT-4 (D-084, contracts/harness-tools.md §2-D): the tools a PERSONA uses to create, edit and pause Routines. The Remotes need
 * a session member; a persona is not one, so these are internal ports that carry the persona's identity and reuse the PURE
 * rules of `routine-remotes.ts`. The caller (the product MCP tool, once the transport exists) hands in who asked:
 * `person-request` (the Ticket started from a human message) or `persona-initiative` (the scheduler, an accepted proposal).
 *
 * DRAFT kept outside `packages/` during the D-082 freeze; moves to `persona-host/src/harness-routines.ts` afterwards.
 */

import { buildRrule, RruleError, type SchedulePreset } from './rrule-lite.ts'
import {
  checkRoutineCatchUp,
  checkRoutineName,
  checkRoutinePrompt,
  checkRoutineSilence,
  checkRoutineTimeZone,
  INITIATIVE_ROUTINE_PREFIX,
  readRoutineSpec,
  routineViewOf,
  writeRoutineSpec,
} from './routine-remotes.ts'
import { RemoteFault } from './remote-guard.ts'
import type { ProductRepos, Routine, RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { RoutineView } from './types.ts'

/** Most routines one persona may create in a day, and own while active (every run spends a model turn). */
export const ROUTINES_CREATED_PER_DAY = 3
export const ROUTINES_ACTIVE_PER_PERSONA = 12

const COUNTER_KIND = 'harness_routine_counter'
const REQUEST_KIND = 'harness_request'

/** Who is acting. The persona and project come from the RUN, never from the tool's arguments. */
export interface HarnessIdentity {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  /** The message id of the person's request, when the Ticket of this run started from a human message. */
  readonly requestId?: string | undefined
  readonly initiator: 'person-request' | 'persona-initiative'
  /** `asked | propose | act`: the persona's autonomy in this project. */
  readonly autonomy: 'asked' | 'propose' | 'act'
  /** Idempotency key of THIS tool call. */
  readonly callId: string
}

export type HarnessFailureCode = 'forbidden' | 'not-found' | 'invalid' | 'limit'

/** What the activity feed shows (contracts/harness-tools.md §4); the UI writes the words. */
export interface HarnessActivity {
  readonly verb: 'routine_create' | 'routine_update' | 'routine_pause'
  readonly target: { readonly kind: 'routine'; readonly id: string; readonly title: string }
  readonly before?: string
  readonly after?: string
  readonly initiator: HarnessIdentity['initiator']
  readonly requestId?: string
  readonly status: 'done'
  readonly undoable: true
  readonly undo: { readonly remote: 'deleteRoutine' | 'updateRoutine' | 'pauseRoutine'; readonly request: Readonly<Record<string, unknown>> }
  readonly at: string
}

export type HarnessResult =
  | { readonly ok: true; readonly routine: RoutineView; readonly activity: HarnessActivity }
  | { readonly ok: false; readonly code: HarnessFailureCode; readonly message: string }

/** Creating input: the schedule is a friendly preset, never cron. */
export interface RoutineCreateInput {
  readonly name: string
  readonly prompt: string
  readonly schedule: SchedulePreset
  readonly ownerPersonaId?: string
  readonly timeZone?: string
  readonly silenceStart?: string
  readonly silenceEnd?: string
}

export interface RoutineUpdateInput {
  readonly id: string
  readonly name?: string
  readonly prompt?: string
  readonly ownerPersonaId?: string
  readonly schedule?: SchedulePreset
  readonly timeZone?: string
  readonly catchUp?: string
  readonly silenceStart?: string
  readonly silenceEnd?: string
}

export interface RoutinePortsDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'getProject'>
  readonly routines: RoutineRepos
  readonly screens: ScreenRepos
  readonly now: () => string
  /** A fresh id for a new routine. */
  readonly newId: () => string
}

function fail(code: HarnessFailureCode, message: string): HarnessResult {
  return { ok: false, code, message }
}

/** Create / edit / pause Routines as a persona. */
export class RoutinePorts {
  private readonly deps: RoutinePortsDeps

  /** @param deps - Host parts. */
  constructor(deps: RoutinePortsDeps) {
    this.deps = deps
  }

  /** @param who - Acting persona. @returns The project's routines (read-only, so the persona can avoid duplicates). */
  list(who: HarnessIdentity): RoutineView[] {
    const now = Date.parse(this.deps.now())
    return this.deps.routines.list(who.projectId).map(routine => routineViewOf(routine, readRoutineSpec(this.deps.screens, who.projectId, routine.id), now))
  }

  create(who: HarnessIdentity, input: RoutineCreateInput): HarnessResult {
    return this.once(who, () => {
      const denied = this.authorize(who)
      if (denied !== undefined) return denied
      const owner = input.ownerPersonaId === undefined || input.ownerPersonaId === '' ? who.personaId : input.ownerPersonaId
      const ownerDenied = this.mayOwn(who, owner)
      if (ownerDenied !== undefined) return ownerDenied
      const budget = this.budget(who)
      if (budget !== undefined) return budget
      let fields: { name: string; prompt: string; rrule: string; timeZone: string; silence: ReturnType<typeof checkRoutineSilence> }
      try {
        fields = {
          name: checkRoutineName(input.name),
          prompt: checkRoutinePrompt(input.prompt),
          rrule: buildRrule(input.schedule),
          timeZone: checkRoutineTimeZone(input.timeZone ?? 'UTC'),
          silence: checkRoutineSilence(input.silenceStart, input.silenceEnd),
        }
      } catch (error: unknown) {
        return this.invalid(error)
      }
      const id = this.deps.newId()
      const created = this.deps.routines.create({
        id, workspaceId: who.workspaceId, projectId: who.projectId, name: fields.name, rrule: fields.rrule,
        timeZone: fields.timeZone, catchUp: 'skip', ...(fields.silence ?? {}),
      })
      writeRoutineSpec(this.deps.screens, who.projectId, id, { prompt: fields.prompt, ownerPersonaId: owner })
      this.count(who)
      return this.done(who, created, 'routine_create', { remote: 'deleteRoutine', request: { workspaceId: who.workspaceId, projectId: who.projectId, id } }, undefined, undefined)
    })
  }

  update(who: HarnessIdentity, input: RoutineUpdateInput): HarnessResult {
    return this.once(who, () => {
      const denied = this.authorize(who)
      if (denied !== undefined) return denied
      const current = this.deps.routines.get(input.id)
      if (current === undefined || current.projectId !== who.projectId) return fail('not-found', 'Não achei essa rotina neste projeto.')
      const mine = this.mayTouch(who, current)
      if (mine !== undefined) return mine
      const before = readRoutineSpec(this.deps.screens, who.projectId, current.id)
      let patch: Parameters<RoutineRepos['update']>[1]
      let nextSpec: { prompt: string; ownerPersonaId: string }
      try {
        const silence = input.silenceStart !== undefined || input.silenceEnd !== undefined
          ? checkRoutineSilence(input.silenceStart ?? current.silenceStart ?? '', input.silenceEnd ?? current.silenceEnd ?? '')
          : undefined
        patch = {
          ...(input.name === undefined ? {} : { name: checkRoutineName(input.name) }),
          ...(input.schedule === undefined ? {} : { rrule: buildRrule(input.schedule) }),
          ...(input.timeZone === undefined ? {} : { timeZone: checkRoutineTimeZone(input.timeZone) }),
          ...(input.catchUp === undefined ? {} : { catchUp: checkRoutineCatchUp(input.catchUp) }),
          ...(input.silenceStart !== undefined || input.silenceEnd !== undefined
            ? { silenceStart: silence?.silenceStart ?? null, silenceEnd: silence?.silenceEnd ?? null } : {}),
        }
        nextSpec = {
          prompt: input.prompt === undefined ? before.prompt : checkRoutinePrompt(input.prompt),
          ownerPersonaId: input.ownerPersonaId === undefined ? before.ownerPersonaId : input.ownerPersonaId,
        }
      } catch (error: unknown) {
        return this.invalid(error)
      }
      if (nextSpec.ownerPersonaId !== before.ownerPersonaId) {
        const ownerDenied = this.mayOwn(who, nextSpec.ownerPersonaId === '' ? who.personaId : nextSpec.ownerPersonaId)
        if (ownerDenied !== undefined) return ownerDenied
      }
      const updated = this.deps.routines.update(current.id, patch)
      writeRoutineSpec(this.deps.screens, who.projectId, current.id, nextSpec)
      return this.done(who, updated, 'routine_update', {
        remote: 'updateRoutine',
        request: {
          workspaceId: who.workspaceId, projectId: who.projectId, id: current.id, name: current.name, rrule: current.rrule,
          timeZone: current.timeZone, catchUp: current.catchUp, prompt: before.prompt, ownerPersonaId: before.ownerPersonaId,
          silenceStart: current.silenceStart ?? '', silenceEnd: current.silenceEnd ?? '',
        },
      }, current.name, updated.name)
    })
  }

  pause(who: HarnessIdentity, input: { readonly id: string; readonly paused: boolean }): HarnessResult {
    return this.once(who, () => {
      const denied = this.authorize(who)
      if (denied !== undefined) return denied
      const current = this.deps.routines.get(input.id)
      if (current === undefined || current.projectId !== who.projectId) return fail('not-found', 'Não achei essa rotina neste projeto.')
      const mine = this.mayTouch(who, current)
      if (mine !== undefined) return mine
      const updated = this.deps.routines.setPaused(current.id, input.paused)
      return this.done(who, updated, 'routine_pause', {
        remote: 'pauseRoutine', request: { workspaceId: who.workspaceId, projectId: who.projectId, id: current.id, paused: current.paused },
      }, current.paused ? 'Pausada' : 'Ativa', updated.paused ? 'Pausada' : 'Ativa')
    })
  }

  // ---- rules ----------------------------------------------------------------

  /** D-084: a person's request authorizes the verb; the persona's own initiative follows her autonomy. */
  private authorize(who: HarnessIdentity): HarnessResult | undefined {
    const persona = this.deps.product.getPersona(who.personaId)
    if (persona === undefined || persona.projectId !== who.projectId) return fail('forbidden', 'Você não faz parte deste projeto.')
    if (who.initiator === 'person-request') return undefined
    if (who.autonomy === 'asked') return fail('forbidden', 'Você só age quando a pessoa pede. Pergunte antes.')
    if (who.autonomy === 'propose') return fail('forbidden', 'Proponha a rotina à pessoa em vez de criá-la sozinha.')
    return undefined
  }

  /** A persona owns her own routines; the Coordenação also covers the ones nobody owns; another persona's only on the person's request. */
  private mayOwn(who: HarnessIdentity, ownerId: string): HarnessResult | undefined {
    if (ownerId === who.personaId) return undefined
    const owner = this.deps.product.getPersona(ownerId)
    if (owner === undefined || owner.projectId !== who.projectId) return fail('invalid', 'Essa pessoa da equipe não está neste projeto.')
    if (who.initiator !== 'person-request') return fail('forbidden', 'Só a pessoa pode dar uma rotina para outra pessoa da equipe.')
    return undefined
  }

  private mayTouch(who: HarnessIdentity, routine: Routine): HarnessResult | undefined {
    if (routine.id.startsWith(INITIATIVE_ROUTINE_PREFIX)) return fail('forbidden', 'Esta rotina é da própria equipe; só a pessoa decide sobre ela.')
    const spec = readRoutineSpec(this.deps.screens, who.projectId, routine.id)
    if (spec.ownerPersonaId === who.personaId) return undefined
    const me = this.deps.product.getPersona(who.personaId)
    if (spec.ownerPersonaId === '' && me?.systemRoles.includes('coordination') === true) return undefined
    if (who.initiator === 'person-request') return undefined
    return fail('forbidden', 'Essa rotina é de outra pessoa da equipe.')
  }

  private budget(who: HarnessIdentity): HarnessResult | undefined {
    const day = this.deps.now().slice(0, 10)
    const used = this.deps.screens.get<{ day: string; count: number }>(who.projectId, COUNTER_KIND, who.personaId)
    if ((used?.day === day ? used.count : 0) >= ROUTINES_CREATED_PER_DAY) return fail('limit', 'Já criei as rotinas de hoje; deixe para amanhã ou peça à pessoa.')
    const active = this.deps.routines.list(who.projectId).filter(routine => !routine.paused
      && readRoutineSpec(this.deps.screens, who.projectId, routine.id).ownerPersonaId === who.personaId).length
    if (active >= ROUTINES_ACTIVE_PER_PERSONA) return fail('limit', 'Já tenho rotinas demais ativas; pause alguma antes de criar outra.')
    return undefined
  }

  private count(who: HarnessIdentity): void {
    const day = this.deps.now().slice(0, 10)
    const used = this.deps.screens.get<{ day: string; count: number }>(who.projectId, COUNTER_KIND, who.personaId)
    this.deps.screens.put(who.projectId, COUNTER_KIND, who.personaId, { day, count: (used?.day === day ? used.count : 0) + 1 })
  }

  private invalid(error: unknown): HarnessResult {
    if (error instanceof RemoteFault || error instanceof RruleError) return fail('invalid', error.message)
    throw error
  }

  private done(who: HarnessIdentity, routine: Routine, verb: HarnessActivity['verb'], undo: HarnessActivity['undo'], before: string | undefined, after: string | undefined): HarnessResult {
    const view = routineViewOf(routine, readRoutineSpec(this.deps.screens, who.projectId, routine.id), Date.parse(this.deps.now()))
    const activity: HarnessActivity = {
      verb,
      target: { kind: 'routine', id: routine.id, title: routine.name },
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? { after: view.humanSchedule } : { after }),
      initiator: who.initiator,
      ...(who.requestId === undefined ? {} : { requestId: who.requestId }),
      status: 'done',
      undoable: true,
      undo,
      at: this.deps.now(),
    }
    return { ok: true, routine: view, activity }
  }

  /** Same `callId` twice = the same answer, never the same action twice. */
  private once(who: HarnessIdentity, run: () => HarnessResult): HarnessResult {
    const seen = this.deps.screens.get<HarnessResult>(who.projectId, REQUEST_KIND, `${who.personaId}:${who.callId}`)
    if (seen !== undefined) return seen
    const result = run()
    this.deps.screens.put(who.projectId, REQUEST_KIND, `${who.personaId}:${who.callId}`, result)
    return result
  }
}

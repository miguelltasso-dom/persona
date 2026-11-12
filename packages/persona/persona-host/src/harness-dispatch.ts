/**
 * HT-0, the host's half (contracts/harness-tools.md §11): the dispatch behind the persona's `board_*`, `sprint_*` and `routine_*`
 * tools. The gateway hands in the RUN (never the arguments) and a call id; this builds the identity (`HarnessPorts.identityOf`),
 * checks the arguments, runs the port and answers the model with a short JSON sentence: `{ ok: true, … }` or a typed refusal
 * `{ ok: false, code, message }` (never raw exception text). Every successful change reports its activity to `onActivity`, where the
 * activity feed (HT-7) records it with the Desfazer.
 */

import type { HarnessCall, HarnessMcpPorts, HarnessToolName } from '@deepseek-ai/dsh-persona-runners'
import type { BoardActivity } from './harness-boards.ts'
import type { HarnessActivity, HarnessIdentity } from './harness-routines.ts'
import type { HireActivity } from './harness-hiring.ts'
import type { HarnessPorts } from './harness-ports.ts'
import type { SchedulePreset } from './rrule-lite.ts'

export type AnyActivity = BoardActivity | HarnessActivity | HireActivity | LoginActivity

/** COLHEITA 15b: a Cofre login typed into the page; the book keeps which login, never the value. */
export interface LoginActivity {
  readonly verb: 'browser_login'
  readonly target: { readonly kind: 'cofre-login'; readonly id: string; readonly title: string }
  readonly initiator: HarnessIdentity['initiator']
  readonly status: 'done'
  readonly undoable: false
  readonly at: string
}

export interface HarnessDispatchOptions {
  /** A change was made (or refused). The feed of the activity records it. */
  readonly onActivity?: (who: HarnessIdentity, activity: AnyActivity) => void
  /**
   * TEAM-4: the tool of a round of opinion (`ask_team_opinion`; there is no "close": `TeamOpinions.run` consolidates). The rounds cap, the daily
   * cap and the budget are the Tally's (`opinion-host.ts`, which needs the RUN's ticket and so is composed with `withOpinionTool`). Absent = not announced here.
   */
  readonly opinion?: (tool: 'ask_team_opinion', who: HarnessIdentity, args: Record<string, unknown>, callId: string) => string | Promise<string>
}

const BOARD_TOOLS: readonly HarnessToolName[] = ['board_list', 'board_card_move', 'sprint_list', 'sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close']
const ROUTINE_TOOLS: readonly HarnessToolName[] = ['routine_list', 'routine_create', 'routine_update', 'routine_pause']
const OPINION_TOOLS: readonly HarnessToolName[] = ['ask_team_opinion']
const HIRE_TOOLS: readonly HarnessToolName[] = ['persona_hire']

type Args = Record<string, unknown>

function say(value: unknown): string {
  return JSON.stringify(value)
}

function refuse(code: string, message: string): string {
  return say({ ok: false, code, message })
}

const text = (args: Args, key: string): string | undefined => (typeof args[key] === 'string' ? args[key] : undefined)
const list = (args: Args, key: string): string[] | undefined =>
  Array.isArray(args[key]) && (args[key] as unknown[]).every(item => typeof item === 'string') ? (args[key] as string[]) : undefined

function scheduleOf(value: unknown): SchedulePreset | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  const frequency = row.frequency
  if (frequency !== 'hourly' && frequency !== 'daily' && frequency !== 'weekdays' && frequency !== 'weekly' && frequency !== 'monthly') return undefined
  return {
    frequency,
    ...(typeof row.time === 'string' ? { time: row.time } : {}),
    ...(Array.isArray(row.days) ? { days: (row.days as unknown[]).filter((day): day is number => typeof day === 'number') } : {}),
    ...(typeof row.monthDay === 'number' ? { monthDay: row.monthDay } : {}),
    ...(typeof row.everyHours === 'number' ? { everyHours: row.everyHours } : {}),
  }
}

/**
 * The host side of the harness tools, ready for `createMcpGateway({ harness })`.
 * @param harness - The host's ports and the run→identity rule.
 * @param options - Where the activity goes.
 */
export function harnessMcpPorts(harness: HarnessPorts, options: HarnessDispatchOptions = {}): HarnessMcpPorts {
  const tools: HarnessToolName[] = [...BOARD_TOOLS, ...(harness.routines === undefined ? [] : ROUTINE_TOOLS), ...(harness.hiring === undefined ? [] : HIRE_TOOLS), ...(options.opinion === undefined ? [] : OPINION_TOOLS), ...(harness.vaultCode === undefined ? [] : ['ask_vault_code'] as const), ...(harness.browserLogin === undefined ? [] : ['browser_login'] as const)]
  return {
    tools,
    call: (input: HarnessCall): Promise<string> => Promise.resolve(run(harness, options, input)),
  }
}

function run(harness: HarnessPorts, options: HarnessDispatchOptions, input: HarnessCall): string | Promise<string> {
  const who = harness.identityOf(input.run, input.callId)
  if (who === undefined) return refuse('forbidden', 'Não reconheço este turno; nada foi feito.')
  const { args } = input
  const done = (activity: AnyActivity, body: Record<string, unknown>): string => {
    options.onActivity?.(who, activity)
    return say({ ok: true, ...body, undoable: activity.undoable })
  }
  switch (input.tool) {
    case 'board_list': {
      const board = harness.boards.read(who)
      return say({
        ok: true,
        columns: board.workflow.columns.map(column => ({ id: column.id, name: column.name, category: column.category })),
        cards: board.cards.map(card => ({ ticketId: card.ticketId, title: card.title, columnId: card.columnId, column: card.columnName, category: card.category })),
      })
    }
    case 'board_card_move': {
      const ticketId = text(args, 'ticketId')
      const columnId = text(args, 'columnId')
      if (ticketId === undefined || columnId === undefined) return refuse('invalid', 'Diga o cartão (ticketId) e a coluna (columnId).')
      const result = harness.boards.moveCard(who, { ticketId, columnId })
      return result.ok
        ? done(result.activity, { moved: { ticketId, title: result.activity.target.title, from: result.activity.before, to: result.activity.after } })
        : refuse(result.code, result.message)
    }
    case 'sprint_list':
      return say({ ok: true, sprints: harness.boards.sprints(who).map(sprint => ({ id: sprint.id, name: sprint.name, status: sprint.status, objective: sprint.objective, cards: sprint.ticketIds })) })
    case 'sprint_create': {
      const name = text(args, 'name')
      const objective = text(args, 'objective')
      if (name === undefined || objective === undefined) return refuse('invalid', 'Diga o nome e o objetivo do sprint.')
      const result = harness.boards.createSprint(who, {
        name, objective,
        ...(text(args, 'startsAt') === undefined ? {} : { startsAt: text(args, 'startsAt')! }),
        ...(text(args, 'endsAt') === undefined ? {} : { endsAt: text(args, 'endsAt')! }),
      })
      return result.ok ? done(result.activity, { sprint: { id: result.value.id, name: result.value.name, status: result.value.status } }) : refuse(result.code, result.message)
    }
    case 'sprint_plan': {
      const sprintId = text(args, 'sprintId')
      const ticketIds = list(args, 'ticketIds')
      if (sprintId === undefined || ticketIds === undefined) return refuse('invalid', 'Diga o sprint (sprintId) e a lista de cartões (ticketIds).')
      const result = harness.boards.planSprint(who, { sprintId, ticketIds })
      return result.ok ? done(result.activity, { sprint: { id: result.value.id, cards: result.value.ticketIds } }) : refuse(result.code, result.message)
    }
    case 'sprint_start': {
      const sprintId = text(args, 'sprintId')
      if (sprintId === undefined) return refuse('invalid', 'Diga o sprint (sprintId).')
      const result = harness.boards.startSprint(who, { sprintId })
      return result.ok ? done(result.activity, { sprint: { id: result.value.id, status: result.value.status } }) : refuse(result.code, result.message)
    }
    case 'sprint_close': {
      const sprintId = text(args, 'sprintId')
      const leftover = text(args, 'leftover')
      if (sprintId === undefined || (leftover !== 'next' && leftover !== 'backlog')) return refuse('invalid', 'Diga o sprint (sprintId) e para onde vai o que sobrou (leftover: next ou backlog).')
      const result = harness.boards.closeSprint(who, { sprintId, leftover })
      return result.ok ? done(result.activity, { summary: result.value.summary, rolled: result.value.rolledIds.length }) : refuse(result.code, result.message)
    }
    case 'routine_list': {
      if (harness.routines === undefined) return refuse('invalid', 'Rotinas não estão disponíveis.')
      return say({ ok: true, routines: harness.routines.list(who).map(routine => ({ id: routine.id, name: routine.name, schedule: routine.humanSchedule, paused: routine.paused, owner: routine.ownerPersonaId })) })
    }
    case 'routine_create': {
      const name = text(args, 'name')
      const prompt = text(args, 'prompt')
      const schedule = scheduleOf(args.schedule)
      if (harness.routines === undefined) return refuse('invalid', 'Rotinas não estão disponíveis.')
      if (name === undefined || prompt === undefined || schedule === undefined) return refuse('invalid', 'Diga o nome, o que fazer (prompt) e quando (schedule).')
      const result = harness.routines.create(who, {
        name, prompt, schedule,
        ...(text(args, 'ownerPersonaId') === undefined ? {} : { ownerPersonaId: text(args, 'ownerPersonaId')! }),
        ...(text(args, 'timeZone') === undefined ? {} : { timeZone: text(args, 'timeZone')! }),
        ...(text(args, 'silenceStart') === undefined ? {} : { silenceStart: text(args, 'silenceStart')! }),
        ...(text(args, 'silenceEnd') === undefined ? {} : { silenceEnd: text(args, 'silenceEnd')! }),
      })
      return result.ok ? done(result.activity, { routine: { id: result.routine.id, name: result.routine.name, schedule: result.routine.humanSchedule } }) : refuse(result.code, result.message)
    }
    case 'routine_update': {
      const id = text(args, 'id')
      if (harness.routines === undefined) return refuse('invalid', 'Rotinas não estão disponíveis.')
      if (id === undefined) return refuse('invalid', 'Diga qual rotina (id).')
      const schedule = args.schedule === undefined ? undefined : scheduleOf(args.schedule)
      if (args.schedule !== undefined && schedule === undefined) return refuse('invalid', 'O horário (schedule) não é válido.')
      const result = harness.routines.update(who, {
        id,
        ...(text(args, 'name') === undefined ? {} : { name: text(args, 'name')! }),
        ...(text(args, 'prompt') === undefined ? {} : { prompt: text(args, 'prompt')! }),
        ...(text(args, 'ownerPersonaId') === undefined ? {} : { ownerPersonaId: text(args, 'ownerPersonaId')! }),
        ...(schedule === undefined ? {} : { schedule }),
        ...(text(args, 'timeZone') === undefined ? {} : { timeZone: text(args, 'timeZone')! }),
        ...(text(args, 'catchUp') === undefined ? {} : { catchUp: text(args, 'catchUp')! }),
        ...(text(args, 'silenceStart') === undefined ? {} : { silenceStart: text(args, 'silenceStart')! }),
        ...(text(args, 'silenceEnd') === undefined ? {} : { silenceEnd: text(args, 'silenceEnd')! }),
      })
      return result.ok ? done(result.activity, { routine: { id: result.routine.id, name: result.routine.name, schedule: result.routine.humanSchedule } }) : refuse(result.code, result.message)
    }
    case 'persona_hire': {
      if (harness.hiring === undefined) return refuse('invalid', 'Contratar não está disponível.')
      const name = text(args, 'name')
      const title = text(args, 'title')
      const description = text(args, 'description')
      if (name === undefined || title === undefined || description === undefined) return refuse('invalid', 'Diga o nome, a função (title) e a descrição de quem você quer contratar.')
      const result = harness.hiring.hire(who, { name, title, description, ...(text(args, 'reason') === undefined ? {} : { reason: text(args, 'reason')! }) })
      if (!result.ok) return refuse(result.code, result.message)
      // A repeat of the same call answers the same and records nothing twice.
      return result.activity === undefined ? say({ ok: true, ...result.body }) : done(result.activity, result.body)
    }
    case 'ask_team_opinion':
      return options.opinion === undefined
        ? refuse('unavailable', 'Pedir a opinião da equipe ainda não está ligado.')
        : options.opinion(input.tool, who, args, input.callId)
    case 'ask_colleague':
    case 'pass_forward':
    case 'review_verdict':
      // The team tools need the RUN's Task (identity of the asker), which `who` does not carry: they are composed in `withTeamTools`
      // (harness-team.ts) in front of this dispatch, like the opinion tool. Reaching here means the host did not compose them.
      return refuse('unavailable', 'O trabalho em equipe ainda não está ligado aqui.')
    case 'ask_vault_code': {
      if (harness.vaultCode === undefined) return refuse('unavailable', 'Pedir o código de 6 dígitos ainda não está ligado aqui.')
      const reason = text(args, 'reason')
      if (reason === undefined || reason.trim() === '') return refuse('invalid', 'Diga em uma frase para que serve o código.')
      const result = harness.vaultCode.open(who, {
        reason,
        ...(text(args, 'login') === undefined ? {} : { login: text(args, 'login')! }),
        ticketId: input.run.ticketId,
      })
      if (!result.ok) return refuse(result.code, result.message)
      return say({
        ok: true,
        requestId: result.requestId,
        expiresAt: result.expiresAt,
        message: 'Pedi o código ao dono; ele preenche no cartão e o código vai direto para o Cofre. Nunca peça o código no chat.',
      })
    }
    case 'browser_login': {
      if (harness.browserLogin === undefined) return refuse('unavailable', 'Entrar com um login do Cofre ainda não está ligado aqui.')
      const login = text(args, 'login')
      if (login === undefined || login.trim() === '') return refuse('invalid', 'Diga qual login do Cofre usar.')
      return harness.browserLogin.open(who, { login, ticketId: input.run.ticketId }).then((result) => {
        if (!result.ok) return refuse(result.code, result.message)
        // The book keeps WHICH login was used, never the value; there is no inverse (the page stays as it is).
        return done(
          { verb: 'browser_login', target: { kind: 'cofre-login', id: login, title: login }, initiator: who.initiator, status: 'done', undoable: false, at: new Date().toISOString() },
          { typed: result.typed, message: result.message },
        )
      })
    }
    case 'routine_pause': {
      const id = text(args, 'id')
      if (harness.routines === undefined) return refuse('invalid', 'Rotinas não estão disponíveis.')
      if (id === undefined || typeof args.paused !== 'boolean') return refuse('invalid', 'Diga qual rotina (id) e se é para pausar (paused: true) ou retomar (false).')
      const result = harness.routines.pause(who, { id, paused: args.paused })
      return result.ok ? done(result.activity, { routine: { id: result.routine.id, name: result.routine.name, paused: result.routine.paused } }) : refuse(result.code, result.message)
    }
  }
}

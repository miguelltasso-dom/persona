/**
 * HT-2 (D-084, contracts/harness-tools.md §2-A/§2-B): the tools a PERSONA uses on the board and the sprints. The Remotes need a
 * session member; a persona is not one, so these are internal ports that carry the persona's identity (same `HarnessIdentity` as the
 * routine port) and delegate to the same `BoardsHost` the person's Remotes use — so the flow rules (WIP, FLOW-1 `delivery_pending`)
 * apply to the persona exactly as to the person. The caller (the product MCP tool, once the transport exists) says who asked:
 * `person-request` (the Ticket started from a human message) or `persona-initiative` (the scheduler, an accepted proposal).
 *
 * A persona moving a card does NOT start anything by itself (that trigger, HT-3, is the PERSON's move only): no loop is possible.
 * Not here yet: creating a card "for later" (needs a Ticket held before it starts, HT-2b).
 */

import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { BoardsHost } from './boards.ts'
import type { HarnessFailureCode, HarnessIdentity } from './harness-routines.ts'
import type { CloseSprintView, ProjectBoardView, SprintView } from './types.ts'

/** The harness failures plus `conflict` (a rule of the flow refused it, e.g. the result still waits for Aplicar/Descartar). */
export type BoardFailureCode = HarnessFailureCode | 'conflict'

/** What the activity feed shows (contracts/harness-tools.md §4); the UI writes the words. */
export interface BoardActivity {
  readonly verb: 'board_card_move' | 'sprint_create' | 'sprint_plan' | 'sprint_start' | 'sprint_close'
  readonly target: { readonly kind: 'card' | 'sprint'; readonly id: string; readonly title: string }
  readonly before?: string
  readonly after?: string
  readonly initiator: HarnessIdentity['initiator']
  readonly requestId?: string
  readonly status: 'done'
  /** Only when there is a safe inverse NOW (`sprint_start` and `sprint_close` have none). */
  readonly undoable: boolean
  readonly undo?: { readonly remote: 'moveTicket' | 'deleteSprint' | 'planSprint'; readonly request: Readonly<Record<string, unknown>> }
  readonly at: string
}

/** A typed refusal (never raw exception text). */
export interface BoardRefusal {
  readonly ok: false
  readonly code: BoardFailureCode
  readonly message: string
}

export type BoardResult<T> =
  | { readonly ok: true; readonly value: T; readonly activity: BoardActivity }
  | BoardRefusal

/** Most sprints one persona may open in a day on her own (sprints are team-level and start a goal). */
export const SPRINTS_CREATED_PER_DAY = 2

const COUNTER_KIND = 'harness_sprint_counter'
const REQUEST_KIND = 'harness_request'

export interface BoardPortsDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'getProject'>
  readonly boards: Pick<BoardsHost, 'getProjectBoard' | 'moveTicket' | 'listSprints' | 'createSprint' | 'planSprint' | 'startSprint' | 'closeSprint'>
  /** The engine Ticket of a card. */
  readonly ticketOf: (projectId: string, ticketId: string) => Ticket | undefined
  readonly screens: ScreenRepos
  readonly now: () => string
  /** A fresh id for a new sprint. */
  readonly newId: () => string
}

function fail(code: BoardFailureCode, message: string): BoardRefusal {
  return { ok: false, code, message }
}

/** Move cards and run sprints as a persona. */
export class BoardPorts {
  private readonly deps: BoardPortsDeps

  /** @param deps - Host parts. */
  constructor(deps: BoardPortsDeps) {
    this.deps = deps
  }

  /** @param who - Acting persona. @returns The project's board (read-only: cards, columns, so she can name them). */
  read(who: HarnessIdentity): ProjectBoardView {
    return this.deps.boards.getProjectBoard(who.projectId)
  }

  /** @param who - Acting persona. @returns The project's sprints (read-only). */
  sprints(who: HarnessIdentity): SprintView[] {
    return this.deps.boards.listSprints(who.projectId)
  }

  /** Move a card to a column. The move is the same as the person's (WIP is a warning, `delivery_pending` refuses Concluído). */
  moveCard(who: HarnessIdentity, input: { readonly ticketId: string; readonly columnId: string }): BoardResult<ProjectBoardView['cards'][number]> {
    return this.once(who, () => {
      const denied = this.authorize(who)
      if (denied !== undefined) return denied
      const ticket = this.deps.ticketOf(who.projectId, input.ticketId)
      if (ticket === undefined) return fail('not-found', 'Não achei esse cartão neste projeto.')
      const mine = this.mayTouchCard(who, ticket)
      if (mine !== undefined) return mine
      const board = this.deps.boards.getProjectBoard(who.projectId)
      const column = board.workflow.columns.find(item => item.id === input.columnId)
      if (column === undefined) return fail('invalid', 'Essa coluna não existe neste quadro.')
      const previous = board.cards.find(card => card.ticketId === ticket.id)
      const previousColumn = board.workflow.columns.find(item => item.id === previous?.columnId)
      let moved: ReturnType<BoardsHost['moveTicket']>
      try {
        moved = this.deps.boards.moveTicket(who.projectId, ticket.id, input.columnId)
      } catch (error: unknown) {
        return this.refused(error)
      }
      const canUndo = previous?.columnId !== undefined && previous.columnId !== ''
      return this.done(who, moved.card, {
        verb: 'board_card_move', target: { kind: 'card', id: ticket.id, title: ticket.title },
        ...(previousColumn === undefined ? {} : { before: previousColumn.name }), after: column.name,
        undoable: canUndo,
        ...(canUndo ? { undo: { remote: 'moveTicket' as const, request: { workspaceId: who.workspaceId, projectId: who.projectId, ticketId: ticket.id, columnId: previous?.columnId } } } : {}),
      })
    })
  }

  /** Open a sprint (planned). */
  createSprint(who: HarnessIdentity, input: { readonly name: string; readonly objective: string; readonly startsAt?: string; readonly endsAt?: string }): BoardResult<SprintView> {
    return this.once(who, () => {
      const denied = this.authorize(who) ?? this.mayRunSprints(who)
      if (denied !== undefined) return denied
      const name = input.name.trim()
      if (name === '') return fail('invalid', 'Dê um nome ao sprint.')
      const budget = this.sprintBudget(who)
      if (budget !== undefined) return budget
      const sprint = this.deps.boards.createSprint({
        workspaceId: who.workspaceId, projectId: who.projectId, id: this.deps.newId(), name, objective: input.objective.trim(),
        ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
        ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
      })
      this.countSprint(who)
      return this.done(who, sprint, {
        verb: 'sprint_create', target: { kind: 'sprint', id: sprint.id, title: sprint.name }, after: 'Planejado',
        undoable: true, undo: { remote: 'deleteSprint', request: { workspaceId: who.workspaceId, projectId: who.projectId, sprintId: sprint.id } },
      })
    })
  }

  /** Put cards in a sprint (replaces its set). */
  planSprint(who: HarnessIdentity, input: { readonly sprintId: string; readonly ticketIds: readonly string[] }): BoardResult<SprintView> {
    return this.once(who, () => {
      const denied = this.authorize(who) ?? this.mayRunSprints(who)
      if (denied !== undefined) return denied
      const current = this.deps.boards.listSprints(who.projectId).find(item => item.id === input.sprintId)
      if (current === undefined) return fail('not-found', 'Não achei esse sprint neste projeto.')
      if (current.status === 'encerrado') return fail('conflict', 'Esse sprint já foi encerrado.')
      const unknown = input.ticketIds.find(id => this.deps.ticketOf(who.projectId, id) === undefined)
      if (unknown !== undefined) return fail('invalid', 'Um dos cartões não existe neste projeto.')
      let planned: SprintView
      try {
        planned = this.deps.boards.planSprint({ workspaceId: who.workspaceId, projectId: who.projectId, sprintId: current.id, ticketIds: input.ticketIds })
      } catch (error: unknown) {
        return this.refused(error)
      }
      return this.done(who, planned, {
        verb: 'sprint_plan', target: { kind: 'sprint', id: current.id, title: current.name },
        before: `${String(current.ticketIds.length)} cartões`, after: `${String(planned.ticketIds.length)} cartões`,
        undoable: true,
        undo: { remote: 'planSprint', request: { workspaceId: who.workspaceId, projectId: who.projectId, sprintId: current.id, ticketIds: current.ticketIds } },
      })
    })
  }

  /** Start a sprint: it becomes active and binds the team's goal. Has no undo. */
  startSprint(who: HarnessIdentity, input: { readonly sprintId: string }): BoardResult<SprintView> {
    return this.once(who, () => {
      const denied = this.authorize(who) ?? this.mayRunSprints(who)
      if (denied !== undefined) return denied
      const current = this.deps.boards.listSprints(who.projectId).find(item => item.id === input.sprintId)
      if (current === undefined) return fail('not-found', 'Não achei esse sprint neste projeto.')
      if (current.status !== 'planejado') return fail('conflict', current.status === 'ativo' ? 'Esse sprint já está ativo.' : 'Esse sprint já foi encerrado.')
      const started = this.deps.boards.startSprint(who.projectId, current.id)
      return this.done(who, started, {
        verb: 'sprint_start', target: { kind: 'sprint', id: current.id, title: current.name }, before: 'Planejado', after: 'Ativo', undoable: false,
      })
    })
  }

  /** Close a sprint; what is left goes to the next sprint or to the backlog. Has no undo. */
  closeSprint(who: HarnessIdentity, input: { readonly sprintId: string; readonly leftover: 'next' | 'backlog' }): BoardResult<CloseSprintView> {
    return this.once(who, () => {
      const denied = this.authorize(who) ?? this.mayRunSprints(who)
      if (denied !== undefined) return denied
      const current = this.deps.boards.listSprints(who.projectId).find(item => item.id === input.sprintId)
      if (current === undefined) return fail('not-found', 'Não achei esse sprint neste projeto.')
      if (current.status === 'encerrado') return fail('conflict', 'Esse sprint já foi encerrado.')
      const closed = this.deps.boards.closeSprint({
        workspaceId: who.workspaceId, projectId: who.projectId, sprintId: current.id, leftover: input.leftover, confirmed: true,
      })
      return this.done(who, closed, {
        verb: 'sprint_close', target: { kind: 'sprint', id: current.id, title: current.name }, before: 'Ativo', after: 'Encerrado', undoable: false,
      })
    })
  }

  // ---- rules ----------------------------------------------------------------

  /** D-084: a person's request authorizes the verb; the persona's own initiative follows her autonomy. */
  private authorize(who: HarnessIdentity): BoardRefusal | undefined {
    const persona = this.deps.product.getPersona(who.personaId)
    if (persona === undefined || persona.projectId !== who.projectId) return fail('forbidden', 'Você não faz parte deste projeto.')
    if (who.initiator === 'person-request') return undefined
    if (who.autonomy === 'asked') return fail('forbidden', 'Você só age quando a pessoa pede. Pergunte antes.')
    if (who.autonomy === 'propose') return fail('forbidden', 'Proponha à pessoa em vez de fazer sozinha.')
    return undefined
  }

  /** A persona moves her own cards; the Coordenação also covers the ones nobody owns; another persona's only on the person's request. */
  private mayTouchCard(who: HarnessIdentity, ticket: Ticket): BoardRefusal | undefined {
    if (who.initiator === 'person-request') return undefined
    const me = this.deps.product.getPersona(who.personaId)
    const owner = ticket.execution?.name
    if (owner === me?.name) return undefined
    if (owner === undefined && me?.systemRoles.includes('coordination') === true) return undefined
    return fail('forbidden', 'Esse cartão é de outra pessoa da equipe.')
  }

  /** Sprints are team-level: on her own only the Coordenação or a Gestor of the team runs them; on the person's request any persona. */
  private mayRunSprints(who: HarnessIdentity): BoardRefusal | undefined {
    if (who.initiator === 'person-request') return undefined
    const me = this.deps.product.getPersona(who.personaId)
    if (me?.systemRoles.includes('coordination') === true || me?.systemRoles.includes('team_manager') === true) return undefined
    return fail('forbidden', 'Quem cuida dos sprints é a Coordenação; peça a ela ou à pessoa.')
  }

  private sprintBudget(who: HarnessIdentity): BoardRefusal | undefined {
    if (who.initiator === 'person-request') return undefined
    const day = this.deps.now().slice(0, 10)
    const used = this.deps.screens.get<{ day: string; count: number }>(who.projectId, COUNTER_KIND, who.personaId)
    if ((used?.day === day ? used.count : 0) >= SPRINTS_CREATED_PER_DAY) return fail('limit', 'Já abri os sprints de hoje; deixe para amanhã ou peça à pessoa.')
    return undefined
  }

  private countSprint(who: HarnessIdentity): void {
    const day = this.deps.now().slice(0, 10)
    const used = this.deps.screens.get<{ day: string; count: number }>(who.projectId, COUNTER_KIND, who.personaId)
    this.deps.screens.put(who.projectId, COUNTER_KIND, who.personaId, { day, count: (used?.day === day ? used.count : 0) + 1 })
  }

  /** The flow's own refusal, typed (never raw text from the exception). */
  private refused(error: unknown): BoardRefusal {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
    if (code === 'delivery_pending') return fail('conflict', 'O resultado desse cartão ainda espera Aplicar ou Descartar; decida em Revisar antes.')
    if (error instanceof Error && /not-found/u.test(error.message)) return fail('not-found', 'Não achei isso neste projeto.')
    return fail('invalid', 'O quadro não aceitou essa mudança.')
  }

  private done<T>(who: HarnessIdentity, value: T, what: Omit<BoardActivity, 'initiator' | 'requestId' | 'status' | 'at'>): BoardResult<T> {
    const activity: BoardActivity = {
      ...what,
      initiator: who.initiator,
      ...(who.requestId === undefined ? {} : { requestId: who.requestId }),
      status: 'done',
      at: this.deps.now(),
    }
    return { ok: true, value, activity }
  }

  /** Same `callId` twice = the same answer, never the same action twice. */
  private once<T>(who: HarnessIdentity, run: () => BoardResult<T>): BoardResult<T> {
    const seen = this.deps.screens.get<BoardResult<T>>(who.projectId, REQUEST_KIND, `${who.personaId}:${who.callId}`)
    if (seen !== undefined) return seen
    const result = run()
    this.deps.screens.put(who.projectId, REQUEST_KIND, `${who.personaId}:${who.callId}`, result)
    return result
  }
}

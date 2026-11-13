/**
 * HT-0 (3): what the host hands the live CLI turn. The tools of the product are NOT announced on every call: each definition costs
 * tokens (D-080/HT-10, "carregar só o necessário"), so a Task gets only the ones its request plausibly needs — the board, the sprints
 * or the routines — and a plain Task gets only `persona_ask` (every worker may ask the person, D-079 b). The decision is a pure function
 * of the words of the request (`harnessToolsNeeded`);
 * a miss only means the tool is not offered and the persona says she cannot, never a wrong action.
 * Behind `Config.productTools` (OFF by default): until the CLI transport is proven with a real run, nothing here is reachable.
 */

import { allowsTool, HARNESS_TOOLS, openTurnTools, type AuthorityKind, type ComputerActingContext, type HarnessToolName, type McpGateway, type ToolLevel, type TurnToolSet } from '@deepseek-ai/dsh-persona-runners'
import { selectTurnTools } from './computer-run-origin.ts'
import { ASK_TOOL } from './persona-ask-tool.ts'
import type { StableTools } from './tool-stability.ts'

/**
 * The tools that coordinate (they do not touch the person's files or the world): offered to every persona, whatever her file/shell grant (D-097).
 * Carbon P1-04: `ask_vault_code` (opens a card the owner fills) and `browser_login` (types a Cofre login into the browser of a profile the owner lent her) are coordination too: the usual Task has no draft
 * folder, so no file grant, and without these two it could never log in anywhere. Each is still offered only where it can act (see `neededToolNames`).
 */
const COORDINATION: ReadonlySet<string> = new Set([ASK_TOOL, 'ask_colleague', 'pass_forward', 'ask_team_opinion', 'review_verdict', 'ask_vault_code', 'browser_login'])

/** One turn of a Task, as the OAR session runner reports it. */
export interface ProductToolsTurn {
  readonly personaId: string
  readonly ticketId: string
  readonly assignmentId: string
  readonly cwd: string
  /** D-117: who the turn acts for (the runner's per-turn authority): the gateway refuses the computer tools unless a person is behind it. Absent = the card of today. */
  readonly authority?: AuthorityKind
  /** Live computer-use execution context (`runId`, `target`, `signal`) when the host holds an active human-authorized ComputerRun for this turn. */
  readonly computer?: ComputerActingContext
}

/** Opens the product tools of ONE turn (and releases them when the turn ends), or none. */
export type ProductToolsOpener = (turn: ProductToolsTurn) => TurnToolSet | undefined

const BOARD = /\b(?:cart(?:ão|ao|ões|oes)|quadro|kanban|coluna|colunas|backlog|mov(?:a|er|e|endo)\s+(?:o|a|os|as)?\s*(?:cart|tarefa)|fazendo|a fazer)\b/iu
const SPRINT = /\bsprints?\b/iu
const HIRE = /\b(?:contrat(?:e|a|ar|ando|ação|acao)|recrut(?:e|a|ar)|novo\s+colega|nova\s+pessoa|nova\s+persona)\b/iu
// Item 15: the words that ask for a second factor (a six-digit code by SMS/WhatsApp, 2FA, two steps). Only these get `ask_vault_code`: the tool opens a card the owner fills.
const SECOND_FACTOR = /\b(?:2fa|dois\s+fatores|duas\s+etapas|autentica(?:ç|c)(?:ã|a)o\s+(?:em|de)\s+dois\s+fatores|c(?:ó|o)digo\s+(?:de\s+)?(?:\d+\s+d(?:í|i)gitos|verifica(?:ç|c)(?:ã|a)o|confirma(?:ç|c)(?:ã|a)o|seguran(?:ç|c)a|acesso|sms)|c(?:ó|o)digo\s+(?:que\s+)?(?:chegou|enviado|recebido)|c(?:ó|o)digo\s+(?:por|via)\s+(?:sms|whatsapp|e-?mail)|token\s+(?:do\s+banco|sms))/iu
const ROUTINE = /\b(?:rotinas?|todo\s+dia|todos\s+os\s+dias|toda\s+(?:segunda|terça|quarta|quinta|sexta|semana|manhã)|toda\s+semana|semanalmente|diariamente|mensalmente|a\s+cada\s+\d+\s*(?:h|hora|horas)|agend(?:a|ar|e)|lembrete)\b/iu

/**
 * The product tools the words of a request ask for. Reads travel with their domain (to look before acting); no keyword = none.
 * @param text - The Task's request (and its title).
 */
export function harnessToolsNeeded(text: string): HarnessToolName[] {
  const wanted = new Set<HarnessToolName>()
  // HT-6: bringing a person to the team (the tool itself only works for a persona the person allowed to hire).
  if (HIRE.test(text)) wanted.add('persona_hire')
  if (BOARD.test(text)) for (const name of ['board_list', 'board_card_move'] as const) wanted.add(name)
  if (SPRINT.test(text)) {
    for (const name of ['board_list', 'sprint_list', 'sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close'] as const) wanted.add(name)
  }
  if (ROUTINE.test(text)) for (const name of ['routine_list', 'routine_create', 'routine_update', 'routine_pause'] as const) wanted.add(name)
  if (SECOND_FACTOR.test(text)) wanted.add('ask_vault_code')
  return HARNESS_TOOLS.filter(name => wanted.has(name))
}

/** What decides the tools of a turn: the words of the request (board, sprints, routines, hiring) and the host's team rule (`harness-team.ts`, NOT by words). */
export interface ProductToolsRules {
  /** The request of the Task (its assignment text and the message that started it). */
  readonly taskTextOf: (ticketId: string) => string
  /** The team tools this turn is offered (`ask_colleague`, `pass_forward`, `ask_team_opinion`, or `review_verdict` for a review Task): the host's rule, never the request's words (D-097). */
  readonly teamToolsOf?: (turn: Pick<ProductToolsTurn, 'personaId' | 'ticketId'>) => readonly string[]
  /**
   * COLHEITA 15b: whether this turn may ask the Cofre to type a login — it is driving a browser of a profile the persona was
   * granted, and the Cofre has at least one login. Absent = the tool is never offered.
   */
  readonly browserLoginOf?: (turn: Pick<ProductToolsTurn, 'personaId' | 'ticketId'>) => boolean
  /** Item 9a: the memory that keeps a persona's list from flipping between turns (her warm session is reused). Absent = the list follows each turn's words, as before. */
  readonly stable?: { readonly memory: StableTools; readonly key: string }
}

/**
 * The tool names ONE turn is offered (the lease announces every tool the host wired; the turn gets only these). Every Task worker may ASK the person
 * (D-079 b: without the tool a real CLI persona cannot pause for an answer); the board, sprint, routine and hiring tools only when the request asks
 * for them; the team tools by the host's rule, whatever the words.
 * @param rules - How to read the Task and the team rule.
 * @param turn - Whose turn.
 */
export function neededToolNames(rules: ProductToolsRules, turn: Pick<ProductToolsTurn, 'personaId' | 'ticketId'>): string[] {
  const own = [...harnessToolsNeeded(rules.taskTextOf(turn.ticketId)), ...(rules.teamToolsOf?.(turn) ?? []), ASK_TOOL]
  // COLHEITA 15b: the Cofre login is offered only where it can act: the turn has the browser and the Cofre has a login. Carbon P1-04: and so is the card for the six digits, whatever the words of the request
  // say (a login page may ask for a code nobody mentioned).
  if (rules.browserLoginOf?.(turn) === true) own.push('browser_login', 'ask_vault_code')
  const unique = [...new Set(own)]
  return rules.stable === undefined ? unique : rules.stable.memory.offer(rules.stable.key, unique)
}

/**
 * The tool names a turn is OFFERED once the persona's grant is applied: what the opener will announce (the lease announces what the gateway wired).
 * A persona with no file/shell grant (`none`) gets ONLY the coordination tools, whatever else the request's words asked for (D-097).
 * @param rules - How to read the Task and the team rule.
 * @param toolLevel - The persona's grant.
 * @param turn - Whose turn.
 */
export function offeredToolNames(rules: ProductToolsRules, toolLevel: ToolLevel, turn: Pick<ProductToolsTurn, 'personaId' | 'ticketId'>): string[] {
  const grantless = toolLevel === 'none'
  return neededToolNames(rules, turn).filter(name => allowsTool(grantless ? 'read' : toolLevel, name) && (!grantless || COORDINATION.has(name)))
}

/**
 * The opener the host gives a persona's session runner.
 * @param input - The process gateway, the persona's tool grant and how to read a Task's words.
 */
export function productToolsOpener(input: ProductToolsRules & {
  readonly gateway: McpGateway
  readonly toolLevel: ToolLevel
}): ProductToolsOpener {
  return (turn) => {
    const needed: readonly string[] = neededToolNames(input, turn)
    // D-097: a persona with NO file/shell grant (`tools: {}` is what onboarding, the person's own form and the Gestor create) still COORDINATES: asking the
    // person, a colleague, the team's opinion, passing work on and giving a review's verdict do not touch files or the world, so the lease opens at `read`
    // and a persona without a grant is handed ONLY those (board, sprints, routines, hiring keep following the grant).
    const grantless = input.toolLevel === 'none'
    const computerAuthorized = turn.computer !== undefined && turn.computer.signal?.aborted !== true && (turn.authority === undefined || turn.authority === 'person')
    const effectiveLevel: ToolLevel = computerAuthorized ? 'write' : (grantless ? 'read' : input.toolLevel)
    const set = openTurnTools(input.gateway, {
      run: { personaId: turn.personaId, ticketId: turn.ticketId, assignmentId: turn.assignmentId },
      toolLevel: effectiveLevel,
      worktree: turn.cwd,
      ...(turn.authority === undefined ? {} : { authority: turn.authority }),
      ...(computerAuthorized ? { computer: turn.computer } : {}),
    })
    if (set === undefined) return undefined
    // The lease announces every harness tool the host wired; this Task gets only the ones it needs (plus `persona_computer_*` when `computerAuthorized`).
    const tools = selectTurnTools(set.tools, needed, grantless, COORDINATION, computerAuthorized)
    if (tools.length === 0) {
      void set.close?.()
      return undefined
    }
    return { ...set, tools }
  }
}

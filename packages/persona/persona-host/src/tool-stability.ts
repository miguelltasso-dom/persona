/**
 * Item 9a "ferramentas estáveis no pool quente" (Tally, 11/11).
 *
 * A live CLI lists its tools ONCE, when its session opens, so the LIST is part of the session's identity (`toolSignature` in the OAR adapter's warm key): a
 * persona whose offered list changes between two turns is handed a NEW session, and the warm one (its prompt cache, its process) is thrown away. The list a Task is
 * offered follows the words of its request (board, sprints, routines), so a persona that works on a post today and on a sprint tomorrow flips between lists.
 *
 * The rule here is MONOTONIC: the first time a request needs a product domain (board, sprints, routines) the persona is offered the whole domain group from then
 * on, so her list changes at most ONCE in her life (lean → with the domains), never back and never per turn. What the persona is ALLOWED to do is untouched: the
 * gateway's grant (`allowsTool`) and the per-call approval still decide every call; this only decides what is ANNOUNCED. Hiring stays by the words of each request
 * (rare, and the one tool a person would not expect to see offered unasked); the team tools stay the host's rule, per Task.
 *
 * Pure and small: a Map of sets, no I/O, no model.
 */

/** The product domains whose tools stay announced once any of them was needed (board, sprints, routines). */
export const STABLE_DOMAIN_TOOLS: readonly string[] = [
  'board_list', 'board_card_move',
  'sprint_list', 'sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close',
  'routine_list', 'routine_create', 'routine_update', 'routine_pause',
]

const DOMAIN: ReadonlySet<string> = new Set(STABLE_DOMAIN_TOOLS)
/** Tools that stay announced once they were offered once (COLHEITA 15b: the Cofre login needs an open browser, which comes and goes). */
const STICKY: ReadonlySet<string> = new Set(['browser_login'])
const REVIEW_TOOL = 'review_verdict'

/** What each persona has already been offered, so a later turn never shrinks her list. */
export class StableTools {
  private readonly widened = new Set<string>()
  /** Per persona, the sticky tools already offered once. */
  private readonly sticky = new Map<string, Set<string>>()

  /**
   * The names to announce this turn: what the turn needs plus, once any domain tool was ever needed for this key, the whole domain group.
   * Idempotent: asking again for the same turn changes nothing.
   * @param key - Whose list (`<projectId>:<personaId>`).
   * @param needed - The names the turn needs on its own (words of the request, team rule, the question tool).
   * @returns The names to announce (order: the turn's own first, then the group).
   */
  offer(key: string, needed: readonly string[]): string[] {
    // A reviewer's Task has one job, its verdict (`harness-team.ts`): it neither widens nor receives the group.
    if (needed.includes(REVIEW_TOOL)) return [...needed]
    if (needed.some(name => DOMAIN.has(name))) this.widened.add(key)
    // A sticky tool is announced from the first turn it was offered on: the browser opening and closing between turns must not
    // change the list (the CLI lists its tools once; a changed list is a new session).
    const kept = this.sticky.get(key) ?? new Set<string>()
    for (const name of needed) if (STICKY.has(name)) kept.add(name)
    this.sticky.set(key, kept)
    const extra = [...kept].filter(name => !needed.includes(name))
    if (!this.widened.has(key)) return [...needed, ...extra]
    return [...needed, ...extra, ...STABLE_DOMAIN_TOOLS.filter(name => !needed.includes(name))]
  }

  /** @param key - Whose list. @returns Whether this key's list already carries the domain group. */
  isWidened(key: string): boolean {
    return this.widened.has(key)
  }

  /** Forget everything (a test, or a project closed). */
  clear(): void {
    this.widened.clear()
    this.sticky.clear()
  }
}

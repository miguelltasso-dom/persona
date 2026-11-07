/**
 * Answering the question cards of the team as the PERSON would (TEAM-10, attempt 3; Atlas 07/11: "the Téo ASKING in front of a vague request is the RIGHT behavior, not a failure").
 *
 * Attempt 2 of the real round stopped at a card — "Pergunta 1 de 4: Qual é a promoção da Padaria Lua?" — because nobody answered it: the Task waits for the person (D-079 b), so
 * no 2nd turn ran and nothing was measured about collaboration. The harness is the person here, so it reads the live state of the question cards (`listPersonaAsks`) and answers
 * what is open with the FACTS of the request, in plain text (`answerAttention`; Bolt: text alone is valid even when the card has chips, and the chips are generic — "Desconto em %"
 * does not say how much — so a chip would only make the model ask again).
 *
 * Cost: a sequence "Pergunta i de n" opens its next question after each answer with ZERO worker turns; only the LAST answer wakes the Task (ONE new turn). Guard rails: a human
 * pause before the first answer, at most `MAX_ASK_ROUNDS` rounds of answers (a model that keeps asking is a finding, not a loop), a cap of answers, and any host failure stops
 * the answerer instead of throwing — the round's evidence matters more than the answer. Pure but for the injected host call and clock, so it is unit-tested without a host.
 */

/** The facts of the request, in the person's own words — the same text for any question of a sequence (Bolt 07/11). */
export const ASK_ANSWER_TEXT = 'Pão de queijo, 2 por R$ 9, de sexta a domingo; pedidos pelo WhatsApp (11) 91234-5678 e @padarialua; a foto é só referência de cores e formas.'
/** Rounds of answers (a round = the answers up to the one that wakes the Task). A 3rd round of questions is not answered. */
export const MAX_ASK_ROUNDS = 2
/** A person reads before answering: a card must have been open this long. */
export const MIN_OPEN_MS = 8_000
/** The next question of a sequence opens at once after an answer: the person is already there. */
export const FOLLOW_UP_MS = 1_000
/** All answers of the round, whatever the rounds (a sequence has at most 5 questions). */
export const MAX_ASK_ANSWERS = 8

export type HostCall = (method: string, args: Record<string, unknown>) => Promise<unknown>

export interface AskScope {
  readonly workspaceId: string
  readonly projectId: string
}

export interface AnsweredAsk {
  readonly askId: string
  readonly ticketId: string
  readonly personaName: string
  readonly question: string
  readonly step: { readonly index: number; readonly total: number } | undefined
  /** `true` = the Task does not wait for the person any more (the worker woke up); `false` = the sequence opened its next question. */
  readonly released: boolean
  readonly at: string
}

export interface AskAnswerer {
  /** One look at the live cards: answers the open one that has waited long enough. Never throws. */
  poll(): Promise<void>
  readonly answered: readonly AnsweredAsk[]
  /** A card is open and not answered yet (and the answerer has not given up): the round must not be called quiet on top of a question. */
  hasOpen(): boolean
  /** Why the answerer stopped by itself (asked again after the last round, the cap, the host failed); `undefined` while it is active. */
  readonly stopped: string | undefined
}

export interface AskAnswererOptions {
  readonly text?: string
  readonly maxRounds?: number
  readonly maxAnswers?: number
  readonly minOpenMs?: number
  readonly followUpMs?: number
  readonly now?: () => number
}

interface Row { readonly [key: string]: unknown }
const asText = (value: unknown): string => (typeof value === 'string' ? value : '')
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 200)

export function createAskAnswerer(call: HostCall, scope: AskScope, options: AskAnswererOptions = {}): AskAnswerer {
  const text = options.text ?? ASK_ANSWER_TEXT
  const maxRounds = options.maxRounds ?? MAX_ASK_ROUNDS
  const maxAnswers = options.maxAnswers ?? MAX_ASK_ANSWERS
  const minOpenMs = options.minOpenMs ?? MIN_OPEN_MS
  const followUpMs = options.followUpMs ?? FOLLOW_UP_MS
  const now = options.now ?? Date.now
  const firstSeen = new Map<string, number>()
  const answered: AnsweredAsk[] = []
  /** A card this harness already answered is never answered again, even if the live list is a beat late in saying so (the host would refuse it: one answer per question). */
  const answeredIds = new Set<string>()
  let rounds = 0
  let openNow = false
  let stopped: string | undefined
  let following = false

  return {
    get answered() { return answered },
    get stopped() { return stopped },
    hasOpen: () => openNow && stopped === undefined,
    async poll(): Promise<void> {
      if (stopped !== undefined) return
      let rows: unknown
      try {
        rows = await call('listPersonaAsks', { ...scope })
      } catch (error) {
        stopped = `listPersonaAsks failed (${message(error)}): the question cards cannot be read, so none is answered`
        openNow = false
        return
      }
      const open = (Array.isArray(rows) ? rows as Row[] : []).filter(row => row.status === 'open' && asText(row.askId) !== '' && asText(row.ticketId) !== '' && !answeredIds.has(asText(row.askId)))
      openNow = open.length > 0
      const at = now()
      for (const row of open) if (!firstSeen.has(asText(row.askId))) firstSeen.set(asText(row.askId), at)
      const wait = following ? followUpMs : minOpenMs
      const ask = open.find(row => at - (firstSeen.get(asText(row.askId)) ?? at) >= wait)
      if (ask === undefined) return
      if (rounds >= maxRounds) {
        stopped = `the team asked the person again after ${String(rounds)} round(s) of answers (the harness answers at most ${String(maxRounds)}): "${asText(ask.question).slice(0, 120)}" was left open — a finding about the team, not a loop to feed`
        openNow = false
        return
      }
      if (answered.length >= maxAnswers) {
        stopped = `the harness already answered ${String(answered.length)} question card(s): the next one is left open`
        openNow = false
        return
      }
      let released: unknown
      try {
        released = await call('answerAttention', { ...scope, ticketId: asText(ask.ticketId), text })
      } catch (error) {
        stopped = `answerAttention failed for "${asText(ask.question).slice(0, 80)}" (${message(error)}): the round goes on without the answer`
        openNow = false
        return
      }
      const step = typeof (ask.step as Row | undefined)?.index === 'number' && typeof (ask.step as Row).total === 'number' ? { index: (ask.step as Row).index as number, total: (ask.step as Row).total as number } : undefined
      answered.push({ askId: asText(ask.askId), ticketId: asText(ask.ticketId), personaName: asText(ask.personaName), question: asText(ask.question), step, released: released === true, at: new Date(at).toISOString() })
      answeredIds.add(asText(ask.askId))
      following = released !== true
      if (released === true) rounds += 1
      openNow = open.length > 1 || released !== true
    },
  }
}

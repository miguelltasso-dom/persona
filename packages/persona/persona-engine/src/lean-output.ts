/**
 * Lean channel output and daily initiative batching (TOKEN-OPTIMIZATION §2.6–§2.8 / OPT-6).
 */

/** Chat cap: decision / result / block only. */
export const CHANNEL_WORD_LIMIT = 100

export interface InitiativeDraft {
  readonly id: string
  readonly personaId: string
  readonly title: string
  readonly day: string
}

export interface InitiativeBatch {
  readonly personaId: string
  readonly day: string
  readonly ids: readonly string[]
}

/**
 * @param text - Candidate reply.
 * @returns Whitespace-separated word count.
 */
export function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

/**
 * Truncate a channel reply to {@link CHANNEL_WORD_LIMIT} words.
 * @param text - Model or digest text.
 * @returns Capped text (no trailing partial word).
 */
export function capChannelReply(text: string): string {
  const words = text.trim().split(/\s+/).filter(word => word !== '')
  if (words.length <= CHANNEL_WORD_LIMIT) return words.join(' ')
  return words.slice(0, CHANNEL_WORD_LIMIT).join(' ')
}

const NARRATION = /^(?:vou |deixa eu |estou |agora vou |ok,? vou |certo,? vou |passo \d+[.:])/iu

export interface LeanStructuredReport {
  readonly decision: string
  readonly result: string
  readonly block?: string
}

/**
 * Short structured report: decision / result / optional block. Then lean-capped.
 * @param report - Three fields, already in the product language.
 * @returns Channel text ≤ 100 words.
 */
export function formatLeanStructuredReport(report: LeanStructuredReport): string {
  const lines = [report.decision, report.result, report.block ?? '']
    .map(line => line.trim())
    .filter(line => line !== '')
  return leanChannelReply(lines.join('\n'))
}

/**
 * Drop echo of the user line and step-narration (OPT-6). Then cap at 100 words.
 * @param text - Model reply.
 * @param userMessage - Last human line (may be empty).
 * @returns Lean channel text.
 */
export function leanChannelReply(text: string, userMessage = ''): string {
  let out = text.trim()
  const user = userMessage.trim()
  if (user !== '' && out.toLowerCase().startsWith(user.toLowerCase())) {
    out = out.slice(user.length).replace(/^[\s.:,-]+/, '').trim()
  }
  const kept = out.split(/\n/).map(line => line.trim()).filter(line => line !== '' && !NARRATION.test(line))
  return capChannelReply(kept.join(' '))
}

/**
 * One batch per persona per calendar day — no per-item pings.
 * @param drafts - Proposed initiatives.
 * @returns Grouped batches.
 */
export function batchInitiative(drafts: readonly InitiativeDraft[]): InitiativeBatch[] {
  const groups = new Map<string, InitiativeBatch>()
  for (const draft of drafts) {
    const key = `${draft.personaId}|${draft.day}`
    const hit = groups.get(key)
    if (hit === undefined) {
      groups.set(key, { personaId: draft.personaId, day: draft.day, ids: [draft.id] })
      continue
    }
    groups.set(key, { ...hit, ids: [...hit.ids, draft.id] })
  }
  return [...groups.values()]
}

/** Daily initiative token ceiling per persona (TOKEN-OPTIMIZATION §2.7). */
export const INITIATIVE_DAILY_TOKEN_BUDGET = 400

/**
 * Slow initiative when people reject it (TOKEN-OPTIMIZATION §2.7).
 * @param acceptanceRate - Accepted / proposed in the last window, 0–1.
 * @returns Days between initiative batches.
 */
export function initiativeCadenceDays(acceptanceRate: number): number {
  if (acceptanceRate < 0.3) return 3
  if (acceptanceRate < 0.6) return 2
  return 1
}

/**
 * Keep drafts that still fit the per-persona daily token budget.
 * @param drafts - Proposed initiatives.
 * @param tokensPerDraft - Estimated tokens one draft would spend.
 * @param dailyBudget - Ceiling per persona per day.
 * @returns Drafts that fit, original order.
 */
export function trimInitiativeToBudget(
  drafts: readonly InitiativeDraft[],
  tokensPerDraft: number,
  dailyBudget: number = INITIATIVE_DAILY_TOKEN_BUDGET,
): InitiativeDraft[] {
  const spent = new Map<string, number>()
  const kept: InitiativeDraft[] = []
  for (const draft of drafts) {
    const key = `${draft.personaId}|${draft.day}`
    const used = spent.get(key) ?? 0
    if (used + tokensPerDraft > dailyBudget) continue
    spent.set(key, used + tokensPerDraft)
    kept.push(draft)
  }
  return kept
}

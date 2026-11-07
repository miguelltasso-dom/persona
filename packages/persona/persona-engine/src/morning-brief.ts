/**
 * The morning meeting — "Bom dia" (TEAM-7, D-090 #6; design/EQUIPE-REAL-SPEC.md (b); contracts/team-real.md §4/§7).
 *
 * The card in #geral with Ontem / Hoje / Precisa de você, built from the Tasks' own facts. **No model, no call, no cost**: a pure function
 * — no clock, no store, no network, nothing async — so it cannot spend. The host (Anvil) owns the rest: the pausable "Resumo da manhã"
 * routine, WHEN it runs (see {@link briefDueNow}), at most one a day, the card (`MessageView.dailyBrief` + a readable body, see
 * {@link renderMorningText}) and the LEAK-1 contract test. The port was agreed with the Anvil (his proposal, 04/11 22:28).
 *
 * Rules:
 *  - Ontem: Tasks that FINISHED between `yesterdayStartIso` and `todayStartIso`, most recent first, up to `maxYesterday` (3) plus "e mais {n}";
 *  - Hoje: who is busy now — `running`, `waiting` or `review` — one line per persona, on the Task updated last;
 *  - Precisa de você: the count the host's attention queue gives (approvals, questions, pending reviews);
 *  - only when there is something to say: nothing finished yesterday, nobody busy and nothing waiting ⇒ `undefined` (no "dia calmo");
 *  - nothing changed since the last brief AND nothing waits for the person ⇒ `undefined`. If something waits, it is said again;
 *  - what the card carries is the Task TITLE the person already sees, cleaned and bounded, never the instruction a persona was given (LEAK-1).
 */

/**
 * Which card this is (Muse, EQUIPE-REAL-SPEC §(b)): the automatic one of the MORNING ("Bom dia · {dia}", with the sunrise spot) or one the person asked for
 * BY HAND after noon ("Resumo do dia · {hora}", no spot: a sunrise at 15:00 is wrong). It rides on the card (`dailyBrief.variant`) so the screen never guesses.
 */
export type BriefVariant = 'morning' | 'on-demand'

/** A brief asked for by hand from this hour (local) on is the "Resumo do dia"; before it, it is still the morning's. */
export const BRIEF_ON_DEMAND_FROM_MINUTES = 12 * 60

/**
 * The variant of a card. The scheduled one is always the morning's (the routine runs from 06:00, see {@link briefDueNow}); a request by hand is the morning's
 * only before noon. A time that cannot be read gets the neutral title, never a "Bom dia" said blind.
 * @param input - How the card was triggered and the person's local time in minutes since midnight.
 */
export function briefVariant(input: { readonly trigger: 'schedule' | 'on-demand'; readonly localMinutes: number }): BriefVariant {
  if (input.trigger === 'schedule') return 'morning'
  if (!Number.isFinite(input.localMinutes)) return 'on-demand'
  return input.localMinutes < BRIEF_ON_DEMAND_FROM_MINUTES ? 'morning' : 'on-demand'
}

/**
 * The card's title, in Portuguese.
 * @param variant - {@link BriefVariant}.
 * @param when - `weekday` for the morning ("Bom dia · quinta"), `time` for the on-demand one ("Resumo do dia · 15:40"); a missing part leaves the title alone.
 */
export function briefTitle(variant: BriefVariant, when: { readonly weekday?: string; readonly time?: string } = {}): string {
  const base = variant === 'morning' ? 'Bom dia' : 'Resumo do dia'
  const part = (variant === 'morning' ? when.weekday : when.time)?.trim()
  return part === undefined || part === '' ? base : `${base} · ${part}`
}

/** The sunrise spot belongs to the morning card only. */
export function briefShowsSpot(variant: BriefVariant): boolean {
  return variant === 'morning'
}

export type MorningState = 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'blocked'

/** The facts of one Task the brief needs, as the host's records give them. */
export interface MorningTask {
  readonly taskId: string
  readonly personaId: string
  /** The Task title the person sees. */
  readonly title: string
  readonly state: MorningState
  /** ISO instant the Task ended (`done`). */
  readonly endedAt?: string
  /** ISO instant of the last change of the Task. */
  readonly updatedAt: string
  /**
   * True when this Task is one of the things the host counts in `needsYouCount` (it waits for the PERSON: a review or an approval of hers). ONE criterion for the card: what waits for
   * the person is "Precisa de você" and is NOT also "Hoje" (a persona is not working on it, the person is the one who must move). Absent or false: as before (a busy Task is Hoje).
   */
  readonly needsPerson?: boolean
  /**
   * True when this Task is ONE LINE standing for a finished REQUEST whose parts were done by several personas (the host's `groupDone` puts the Coordenação's id on it and titles it
   * "{request} ({parts})"). Such a line is never attributed to a person: the body says "{request} ficou pronta ({parts})". Absent or false: a Task of one persona.
   */
  readonly grouped?: boolean
}

export interface MorningBriefInput {
  /** The person's local day, `YYYY-MM-DD`. */
  readonly day: string
  /** Start of the person's local YESTERDAY and TODAY as ISO instants (the host computes them with the time zone; see {@link dayBounds}). */
  readonly yesterdayStartIso: string
  readonly todayStartIso: string
  readonly tasks: readonly MorningTask[]
  /** Approvals + questions + pending reviews that wait for the person. */
  readonly needsYouCount: number
  readonly lastBrief?: { readonly at: string; readonly signature: string }
  /** Lines of Ontem before "e mais {n}". Default 3, from 1 to 10. */
  readonly maxYesterday?: number
  /** Which card this is (default `morning`: the scheduled one). The host decides with {@link briefVariant}. */
  readonly variant?: BriefVariant
}

export interface MorningLine {
  readonly taskId: string
  readonly personaId: string
  readonly title: string
  /** Present (true) only on the line of a finished REQUEST (see {@link MorningTask.grouped}): said without anyone's name, whatever `personaId` it carries. */
  readonly grouped?: true
}

export interface MorningBriefResult {
  readonly yesterday: readonly MorningLine[]
  /** "e mais {n}". */
  readonly yesterdayMore: number
  /** One per busy persona. */
  readonly today: readonly MorningLine[]
  readonly needsYou: { readonly count: number }
  /** `morning` = "Bom dia · {dia}" with the spot; `on-demand` = "Resumo do dia · {hora}" without it. */
  readonly variant: BriefVariant
  /** A stable hash of the ids and states behind the card; the host keeps it as `lastBrief.signature`. */
  readonly signature: string
}

export const DEFAULT_YESTERDAY_LINES = 3
export const TITLE_MAX = 120
/** First open of the app after this hour (local) posts the brief. */
export const BRIEF_OPEN_FROM_MINUTES = 6 * 60
/** If the app has not been opened by this hour (local), it posts anyway. */
export const BRIEF_FALLBACK_MINUTES = 9 * 60

const DAY = /^\d{4}-\d{2}-\d{2}$/u

function parts(day: string): [number, number, number] | undefined {
  if (!DAY.test(day)) return undefined
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? [y, m, d] : undefined
}

/**
 * The instants the brief of a local day needs: the start of yesterday and the start of today, as ISO strings. For a host that does not
 * already have them. A DST change between the two days is the reason for two offsets.
 * @param day - `YYYY-MM-DD`, the person's local day.
 * @param todayOffsetMinutes - Minutes the local time is ahead of UTC on `day` (São Paulo: -180).
 * @param yesterdayOffsetMinutes - Same for the day before; default the same as today.
 * @throws RangeError for a day that does not exist.
 */
export function dayBounds(day: string, todayOffsetMinutes: number, yesterdayOffsetMinutes: number = todayOffsetMinutes): { readonly yesterdayStartIso: string; readonly todayStartIso: string } {
  const p = parts(day)
  if (p === undefined) throw new RangeError(`not a day: ${day}`)
  const [y, m, d] = p
  return {
    yesterdayStartIso: new Date(Date.UTC(y, m - 1, d - 1) - yesterdayOffsetMinutes * 60_000).toISOString(),
    todayStartIso: new Date(Date.UTC(y, m - 1, d) - todayOffsetMinutes * 60_000).toISOString(),
  }
}

/**
 * Should the brief go out NOW? The schedule rule alone: the first time the app is opened after 06:00, or at 09:00 if it was not, at most
 * once a day. (What goes in the brief, and whether there is anything to say, is {@link buildMorningBrief}'s business.)
 * @param input - `event`: the app was just opened or the host's clock ticked; `localMinutes`: minutes since local midnight; the day and the last brief's day.
 */
export function briefDueNow(input: { readonly event: 'app-open' | 'tick'; readonly localMinutes: number; readonly day: string; readonly lastBriefDay?: string }): boolean {
  if (input.lastBriefDay === input.day) return false
  if (!Number.isFinite(input.localMinutes)) return false
  return input.event === 'app-open' ? input.localMinutes >= BRIEF_OPEN_FROM_MINUTES : input.localMinutes >= BRIEF_FALLBACK_MINUTES
}

function cleanTitle(title: string): string {
  const flat = title.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  return flat.length <= TITLE_MAX ? flat : `${flat.slice(0, TITLE_MAX - 1).trimEnd()}…`
}

/** FNV-1a 32 bits, hex: a stable, short fingerprint (not a security hash). */
function fnv(text: string): string {
  let hash = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const BUSY: readonly MorningState[] = ['running', 'waiting', 'review']

/**
 * Build the morning brief, or say there is nothing to say. Pure: the same facts always give the same card.
 * @param input - The day's bounds, the Tasks, the count of what waits for the person and the last brief.
 * @returns The card, or `undefined` when the host must post nothing (nothing happened, nobody is busy and nothing waits; or nothing changed and nothing waits).
 * @throws RangeError when `day` is not a real day.
 */
export function buildMorningBrief(input: MorningBriefInput): MorningBriefResult | undefined {
  if (parts(input.day) === undefined) throw new RangeError(`not a day: ${input.day}`)
  const max = Number.isFinite(input.maxYesterday) ? Math.min(10, Math.max(1, Math.floor(input.maxYesterday ?? DEFAULT_YESTERDAY_LINES))) : DEFAULT_YESTERDAY_LINES
  const waiting = Number.isFinite(input.needsYouCount) ? Math.max(0, Math.floor(input.needsYouCount)) : 0
  const line = (task: MorningTask): MorningLine => ({ taskId: task.taskId, personaId: task.personaId, title: cleanTitle(task.title), ...(task.grouped === true ? { grouped: true as const } : {}) })

  const finished = input.tasks
    .filter(task => task.state === 'done' && task.endedAt !== undefined && task.endedAt >= input.yesterdayStartIso && task.endedAt < input.todayStartIso)
    .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '') || a.taskId.localeCompare(b.taskId))

  // One line per busy persona, on the Task updated last (ties: the smaller id, so the card does not flicker).
  const busy = new Map<string, MorningTask>()
  for (const task of input.tasks) {
    if (!BUSY.includes(task.state) || task.needsPerson === true) continue
    const known = busy.get(task.personaId)
    if (known === undefined || task.updatedAt > known.updatedAt || (task.updatedAt === known.updatedAt && task.taskId < known.taskId)) busy.set(task.personaId, task)
  }
  const doing = [...busy.values()].sort((a, b) => a.personaId.localeCompare(b.personaId))

  if (finished.length === 0 && doing.length === 0 && waiting === 0) return undefined
  const signature = fnv([
    `y:${finished.map(task => task.taskId).join(',')}`,
    `t:${doing.map(task => `${task.personaId}=${task.taskId}:${task.state}`).join(',')}`,
    `n:${String(waiting)}`,
  ].join('|'))
  // Nothing changed since the last brief AND nothing waits for the person: nothing is posted. If something waits, it is said again.
  if (input.lastBrief?.signature === signature && waiting === 0) return undefined

  const shown = finished.slice(0, max)
  return {
    yesterday: shown.map(line),
    yesterdayMore: finished.length - shown.length,
    today: doing.map(line),
    needsYou: { count: waiting },
    variant: input.variant ?? 'morning',
    signature,
  }
}

/**
 * The grouped line as a body sentence, no person: the title the host gives is "{request} ({parts})", and the parts go AFTER the verb —
 * "Campanha de lançamento ficou pronta (Texto, Arte e Posts)". A title with no closing parts (a single name, or one cut by the length limit) is "{title} ficou pronta".
 */
function groupedPhrase(title: string): string {
  const match = /^(.+?)\s*(\([^()]*\))$/u.exec(title)
  const work = match?.[1]?.trim()
  return work === undefined || work === '' || match?.[2] === undefined ? `${title} ficou pronta` : `${work} ficou pronta ${match[2]}`
}

/**
 * The card as plain text (the readable body of the message, the fallback of the card), in Portuguese. Deterministic, no model.
 * @param brief - A brief from {@link buildMorningBrief}.
 * @param names - Display names by persona id; a persona with no name is left out of the sentence rather than shown as an id.
 *
 * The first words follow the card's variant ("Bom dia." / "Resumo do dia."): the body is the fallback of the card, so it must not greet the morning at 15:00.
 */
export function renderMorningText(brief: MorningBriefResult, names: Readonly<Record<string, string>>): string {
  const out: string[] = [brief.variant === 'on-demand' ? 'Resumo do dia.' : 'Bom dia.']
  const done = brief.yesterday.flatMap((row) => {
    // A finished REQUEST is the work of several personas: it is said without attributing it to anyone (the Task of the line carries the Coordenação's id, and "Lia terminou…" would be false),
    // and it does not depend on a name: a line with no known persona is not dropped.
    if (row.grouped === true) return [groupedPhrase(row.title)]
    const name = names[row.personaId]
    return name === undefined ? [] : [`${name} terminou ${row.title}`]
  })
  if (done.length > 0) out.push(`Ontem: ${done.join('; ')}${brief.yesterdayMore > 0 ? ` e mais ${String(brief.yesterdayMore)}` : ''}.`)
  const doing = brief.today.flatMap(row => (names[row.personaId] === undefined ? [] : [`${names[row.personaId] ?? ''}: ${row.title}`]))
  if (doing.length > 0) out.push(`Hoje: ${doing.join('; ')}.`)
  if (brief.needsYou.count > 0) out.push(brief.needsYou.count === 1 ? 'Precisa de você: 1 coisa espera você.' : `Precisa de você: ${String(brief.needsYou.count)} coisas esperam você.`)
  return out.join(' ')
}

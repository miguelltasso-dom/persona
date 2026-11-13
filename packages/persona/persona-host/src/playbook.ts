/**
 * Memory that proves itself, second slice (harvest item 16): what a persona learns about HOW she works stays quiet, and becomes an offer
 * only after it has been proved.
 *
 * - A delivery the owner accepted is a "win" of how that persona does that kind of work. It is noted quietly (a screen document, never a
 *   line in the thread, never a memory the whole team reads: that used to be "Revisão aceita: <id do ticket>" in Memória).
 * - What the owner asks to change is noted with it: it is how the owner likes the work done.
 * - The same kind of work accepted three times, on at least two different days, makes one offer, in one click, in Aprovações:
 *   "Bia aprendeu “cartaz da promoção” (usado 3×). Virar skill?". Yes enables the skill; no leaves the note where it is.
 * - Nothing here calls a model: titles are compared by their words, the count is the count of accepted deliveries.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { ScreensHost } from './screens.ts'

/** Screen document kind of a quiet note. */
export const PLAYBOOK_KIND = 'playbook_note'

/** How much proof an offer needs: accepted deliveries, and the different days they happened on. */
export const OFFER_USES = 3
export const OFFER_DAYS = 2

/** Two titles are the same kind of work when this share of their words is shared. */
const SAME_WORK = 0.6
const MAX_ADJUSTMENTS = 5
const ADJUSTMENT_LIMIT = 280
const BODY_LIMIT = 900

/** One accepted delivery that counted. */
export interface PlaybookUse {
  readonly ticketId: string
  /** The local day (YYYY-MM-DD) it was accepted. */
  readonly day: string
  readonly at: string
  /** The conversation (subject) the request came from; absent on a note made before it was kept. */
  readonly conversation?: string
}

/** A quiet note of how a persona does one kind of work. */
export interface PlaybookNote {
  readonly id: string
  readonly personaId: string
  /** The kind of work, as the Task was titled when it was first accepted. */
  readonly title: string
  /** What the Task asked for, from the latest accepted one (a draft for the skill). */
  readonly request: string
  readonly createdAt: string
  readonly uses: readonly PlaybookUse[]
  /** What the owner asked to change on this kind of work, newest last. */
  readonly adjustments: readonly string[]
  /** The current (or last) offer "Virar skill?" in Aprovações. */
  readonly offered?: { readonly skillId: string; readonly approvalId: string; readonly at: string }
  /** How many offers were made (a second one only after "Agora não" and three more uses). */
  readonly offers?: number
  /** "Agora não": the offer was turned down with this many uses; it is made again only after three more. */
  readonly declined?: { readonly uses: number; readonly at: string }
  /** The DMs whose words this note holds (the title of a Task born there, what it asked, what the owner asked to change): only the people in ALL of them read it (D-119). Absent = a channel, or a note from before this was kept. */
  readonly dms?: readonly string[]
}

/** The DMs a note holds once one more Task (born in `dmId`, when it was born in a DM) has told it something. */
function withDm(dms: readonly string[] | undefined, dmId: string | undefined): { readonly dms?: readonly string[] } {
  if (dmId === undefined || dmId === '') return dms === undefined ? {} : { dms }
  return { dms: [...new Set([...(dms ?? []), dmId])] }
}

/** What the host gives the playbook. */
export interface PlaybookDeps {
  readonly screens: ScreensHost
  readonly now: () => string
  /** The machine's offset from UTC in minutes at an instant (Carbon P2-03c): a "day" of use is the owner's LOCAL day. Absent = UTC (specs). */
  readonly offsetMinutes?: (iso: string) => number
}

const STOP =new Set(['para', 'com', 'uma', 'umas', 'uns', 'dos', 'das', 'que', 'por', 'sem', 'sobre', 'entre', 'ate', 'até', 'aos', 'nas', 'nos', 'num', 'numa'])

function words(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').split(/[^a-z0-9]+/u)) {
    if (raw.length >= 3 && !STOP.has(raw)) out.add(raw)
  }
  return out
}

/** Whether two titles are the same kind of work (Jaccard on their words). */
export function sameWork(left: string, right: string): boolean {
  const a = words(left)
  const b = words(right)
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / (a.size + b.size - shared) >= SAME_WORK
}

function slug(text: string): string {
  return [...words(text)].sort().join('-').slice(0, 70)
}

function dayOf(iso: string, offsetMinutes = 0): string {
  const ms = Date.parse(iso)
  // The calendar day at the owner's clock: 22:30 on the 10th in São Paulo is already the 11th in UTC, and it is still "the 10th" for the person who did the work.
  if (Number.isFinite(ms)) return new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}/u.exec(iso)?.[0] ?? iso.slice(0, 10)
}

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`
}

function notesOf(screens: ScreenRepos, projectId: string, personaId: string): PlaybookNote[] {
  return screens.list<PlaybookNote>(projectId, PLAYBOOK_KIND).filter(note => note.personaId === personaId)
}

/**
 * The quiet notes of a project (one persona's, or all).
 * @param screens - The host's screen documents.
 * @param projectId - Tenant.
 * @param personaId - Only hers; omit for every note.
 */
export function listPlaybook(screens: ScreenRepos, projectId: string, personaId?: string): PlaybookNote[] {
  const all = screens.list<PlaybookNote>(projectId, PLAYBOOK_KIND)
  return personaId === undefined ? all : all.filter(note => note.personaId === personaId)
}

/** What an accepted delivery tells the playbook. */
export interface PlaybookWin {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly personaName: string
  readonly ticketId: string
  /** The Task's title: the kind of work. */
  readonly title: string
  /** What the Task asked for. */
  readonly request: string
  /** The conversation (subject) the request came from. */
  readonly conversation?: string
  /** The DM the Task was born in, when it was born in one (its words are the DM's: D-119). */
  readonly dmId?: string
}

/** What {@link notePlaybookWin} did. */
export interface PlaybookResult {
  readonly note: PlaybookNote
  /** This win made the offer ("Virar skill?"). */
  readonly offered: boolean
}

/**
 * Note an accepted delivery as a use of how this persona does this kind of work; make the offer when it has been proved.
 * @param deps - Screens and clock.
 * @param win - The accepted delivery.
 */
export function notePlaybookWin(deps: PlaybookDeps, win: PlaybookWin): PlaybookResult | undefined {
  const title = clip(win.title, 90)
  if (title === '' || win.personaId === '') return undefined
  const repos = deps.screens.screens
  const at = deps.now()
  const found = notesOf(repos, win.projectId, win.personaId).find(note => sameWork(note.title, title))
  const base: PlaybookNote = found ?? {
    id: `pb-${win.personaId}-${slug(title)}`, personaId: win.personaId, title, request: '', createdAt: at, uses: [], adjustments: [],
  }
  // The same delivery twice counts once.
  if (base.uses.some(use => use.ticketId === win.ticketId)) return { note: base, offered: false }
  let note: PlaybookNote = {
    ...base, ...withDm(base.dms, win.dmId), request: clip(win.request, BODY_LIMIT),
    uses: [...base.uses, { ticketId: win.ticketId, day: dayOf(at, deps.offsetMinutes?.(at) ?? 0), at, ...(win.conversation === undefined || win.conversation === '' ? {} : { conversation: win.conversation }) }],
  }
  let offered = false
  if (isProved(note) && mayOffer(note)) {
    const { declined, ...rest } = note
    void declined
    note = { ...rest, offered: makeOffer(deps, win, note, at), offers: (note.offers ?? 0) + 1 }
    offered = true
  }
  repos.put(win.projectId, PLAYBOOK_KIND, note.id, note)
  return { note, offered }
}

/** Three uses on two different days or in two different conversations: proved. */
function isProved(note: PlaybookNote): boolean {
  const days = new Set(note.uses.map(use => use.day)).size
  const conversations = new Set(note.uses.flatMap(use => (use.conversation === undefined ? [] : [use.conversation]))).size
  return note.uses.length >= OFFER_USES && (days >= OFFER_DAYS || conversations >= OFFER_DAYS)
}

/** Never while an offer waits; after "Agora não", only once three more uses have come. */
function mayOffer(note: PlaybookNote): boolean {
  if (note.offered === undefined) return true
  return note.declined !== undefined && note.uses.length >= note.declined.uses + OFFER_USES
}

/**
 * "Agora não": the offer is turned down. The note stays; it is offered again only after three more uses.
 * @param deps - Screens and clock.
 * @param projectId - Tenant.
 * @param approvalId - The card in Aprovações that was turned down.
 */
export function declinePlaybookOffer(deps: PlaybookDeps, projectId: string, approvalId: string): void {
  const repos = deps.screens.screens
  const note = listPlaybook(repos, projectId).find(item => item.offered?.approvalId === approvalId)
  if (note === undefined || note.declined !== undefined) return
  repos.put(projectId, PLAYBOOK_KIND, note.id, { ...note, declined: { uses: note.uses.length, at: deps.now() } })
}

/**
 * Note what the owner asked to change on a kind of work: how they like it done. Never an offer by itself.
 * @param deps - Screens and clock.
 * @param change - The persona, the Task and what the owner asked.
 */
export function notePlaybookAdjustment(
  deps: PlaybookDeps,
  change: { readonly projectId: string; readonly personaId: string; readonly title: string; readonly feedback: string; readonly dmId?: string },
): PlaybookNote | undefined {
  const title = clip(change.title, 90)
  const feedback = clip(change.feedback, ADJUSTMENT_LIMIT)
  if (title === '' || feedback === '' || change.personaId === '') return undefined
  const repos = deps.screens.screens
  const found = notesOf(repos, change.projectId, change.personaId).find(note => sameWork(note.title, title))
  const base: PlaybookNote = found ?? {
    id: `pb-${change.personaId}-${slug(title)}`, personaId: change.personaId, title, request: '', createdAt: deps.now(), uses: [], adjustments: [],
  }
  // The words are the DM's even when the same line was already kept (it may have come from a channel first): the note holds this DM from now on.
  if (base.adjustments.includes(feedback)) {
    const held = withDm(base.dms, change.dmId)
    if (held.dms?.length === base.dms?.length) return base
    const marked: PlaybookNote = { ...base, ...held }
    repos.put(change.projectId, PLAYBOOK_KIND, marked.id, marked)
    return marked
  }
  const note: PlaybookNote = { ...base, ...withDm(base.dms, change.dmId), adjustments: [...base.adjustments, feedback].slice(-MAX_ADJUSTMENTS) }
  repos.put(change.projectId, PLAYBOOK_KIND, note.id, note)
  return note
}

/** The draft of the skill: the kind of work, what was asked, and how the owner likes it done. Plain; the owner reads it before saying yes. */
function skillBody(note: PlaybookNote): string {
  const lines = [`Quando pedirem algo como “${note.title}”, faça como nas ${String(note.uses.length)} entregas que o dono aceitou.`]
  if (note.request !== '') lines.push(`Exemplo do pedido: ${note.request}`)
  if (note.adjustments.length > 0) lines.push(`O dono costuma pedir: ${note.adjustments.join(' · ')}`)
  return lines.join('\n')
}

function makeOffer(deps: PlaybookDeps, win: PlaybookWin, note: PlaybookNote, at: string): NonNullable<PlaybookNote['offered']> {
  const skillId = `learned-${note.id}`
  const count = note.offers ?? 0
  const approvalId = count === 0 ? `skill-offer-${note.id}` : `skill-offer-${note.id}-${String(count + 1)}`
  deps.screens.putCandidateSkill({ projectId: win.projectId, personaId: win.personaId, id: skillId, name: clip(note.title, 64), body: skillBody(note), origin: 'learned' })
  const conversations = new Set(note.uses.flatMap(use => (use.conversation === undefined ? [] : [use.conversation]))).size
  const days = new Set(note.uses.map(use => use.day)).size
  // Days when they are the proof (the common case); conversations only when that is what proved it. Never a claim the data does not back.
  const where = days >= OFFER_DAYS ? `em ${String(days)} dias` : `em ${String(conversations)} conversas`
  // One line of plain words, no artigo for the persona, no "×" (Atlas/Muse 12/11 02:22): "Usado 3 vezes em 2 dias." The title says WHICH way of working it is.
  deps.screens.proposeSkill({
    workspaceId: win.workspaceId, projectId: win.projectId, id: approvalId, skillId, title: `${win.personaName} aprendeu: ${note.title}`,
    creatorPersonaId: win.personaId, question: `Usado ${String(note.uses.length)} vezes ${where}.`,
  })
  return { skillId, approvalId, at }
}

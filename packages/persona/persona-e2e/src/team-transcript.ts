/**
 * The readable transcript of a team round (TEAM-10, D-090): who said/did what, in order, in the words the person SEES — read from a COPY of a
 * Persona home's database, never from the running app. Used by the REAL round (so Atlas can show Miguel what happened) and shareable with
 * Gauge's scripted "Um dia da equipe". Pure reading: no model call, no writes.
 *
 * What it refuses to print as if it were fine: an internal marker (`[[…:…]]`) or an internal-prompt phrase (LEAK-1) in a visible line is
 * reported in `leaks` and shown with a visible tag, so a transcript never hides a leak.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, type Dirent } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { LEAK_1_PATTERNS } from './first-delivery-flow.ts'
import { fakeRunnerSignature, readLedgerEvidence, type LedgerEvidence } from './ledger-evidence.ts'

export interface TranscriptLine {
  readonly at: string
  readonly stream: string
  readonly id: string
  /** Event type: a chat `message`, or a typed `handoff` line (passou para / pediu ajuda a / entregou para …). */
  readonly type: string
  readonly who: string
  /** What the person sees (markers turned into a plain note). */
  readonly text: string
  /** File names attached to this message (images included). */
  readonly attachments: readonly string[]
  /** Internal-prompt phrases / raw markers found in the VISIBLE text. */
  readonly leaks: readonly string[]
}

export interface TranscriptTicket {
  readonly id: string
  readonly title: string
  readonly stage: string
  readonly assignmentState: string | null
  readonly ended: boolean
  /** Where it came from: `split:<message>:<persona>` (a part of the split), `handoff:<…>` (pass/help/review), … — `origin.triggerId` of the Ticket. */
  readonly trigger?: string
  /** What the worker was handed (`execution.assignment`): the request, "Anexos do pedido: …", the bilhete. */
  readonly assignment?: string
}

/** One file of a Task's DRAFT on disk, relative to the draft, with `/` separators. `sha` is the SHA-256 of the whole file (files above 4 MB only carry their size). */
export interface DraftFile {
  readonly path: string
  readonly size: number
  readonly sha: string | null
}

/** The DRAFT directory of one Task (`<home>/worktrees/<project>/<ticketId>`) and what is in it now (P0-1: what the worker really finds). */
export interface TranscriptDraft {
  readonly ticketId: string
  readonly directory: string
  readonly files: readonly DraftFile[]
}

export interface TeamTranscript {
  readonly lines: readonly TranscriptLine[]
  readonly tickets: readonly TranscriptTicket[]
  readonly ledger: LedgerEvidence | undefined
  /** `persona id → name` and `member id → name`, as the app shows them. */
  readonly names: Readonly<Record<string, string>>
  /** Names of the PERSONAS only (who is an AI colleague in the lines). */
  readonly personas: readonly string[]
  readonly leaks: readonly string[]
  /** Event types present in the thread that this reader does NOT show (type → count), so a new visible type is noticed instead of silently dropped. */
  readonly ignoredTypes: Readonly<Record<string, number>>
  /** The bilhetes (handoff notes) of the round, read from the Task side (`screen_doc` kind `handoff`) — they are NOT in the thread on purpose. */
  readonly notes: readonly TranscriptNote[]
  /** Peer reviews by Task (`review_state`): who reviewed, how many times it came back, whether the seal ("Revisado por") exists. */
  readonly reviews: readonly TranscriptReview[]
  /** Questions the team put to the PERSON (`persona_ask` cards in the thread), in order: asking the person is not collaborating, but it explains why a round stopped. */
  readonly asks: readonly TranscriptAsk[]
  /** Tasks the HOST created by splitting the request by function ("Dividi assim: Téo — Arte; Bia — Texto": origin trigger `split:<message>:<persona>`): the plan, not the model's choice. */
  readonly splitTasks: number
  /** The assignment text of each of those Tasks, as the worker receives it (Bolt 07/11: it cites "Anexos do pedido: <file>" so the part sees the request's image). */
  readonly splitAssignments: readonly string[]
  /** The assignment text of each reviewer's Task ("Revisar: …"): everything she is handed of the author's delivery (the review note was clipped to 290 characters in the real round of 07/11). */
  readonly reviewAssignments: readonly string[]
  /** `execution.directory` of every Task that has one: the DRAFT directory of a project with a folder (D-099). */
  readonly draftDirectories: readonly string[]
  /**
   * The drafts found on disk under the home (`worktrees/<project>/<ticketId>`), one per Task, with their files (P0-1). A real round keeps them after the host stops; a transcript built
   * by hand (the pure specs) has none, and the shared-files check then has nothing to read.
   */
  readonly drafts?: readonly TranscriptDraft[]
}

export interface TranscriptReview {
  readonly taskId: string
  readonly status: string
  readonly reviewer: string
  readonly author: string
  readonly returns: number
  readonly sealed: boolean
  readonly summary: string
  /**
   * Why the review could not run, as the host records it: `unreadable` = the reviewer got a placeholder (`turn ended`) instead of the author's text (the product defect Bolt
   * found on the real CLI, 07/11), `engine` = the reviewer's own turn failed. `null` = it ran.
   */
  readonly failure: string | null
}

/** One handoff request and its bilhete, with names as the person reads them. */
export interface TranscriptNote {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly title: string
  readonly kind: string
  readonly status: string
  readonly askedAt: string
  readonly done: readonly string[]
  readonly needed: readonly string[]
  readonly files: readonly string[]
  readonly decisions: readonly string[]
  /** The colleague's Ticket (found by `origin.triggerId` = this request's id) carries the bilhete between `<bilhete>` delimiters: the positive proof of the handoff. */
  readonly colleagueReceived: boolean
  readonly colleagueTicketId: string | null
  /** The Ticket of the SENDER (`fromTicketId` of the handoff record): its draft is where the files of the bilhete were saved. */
  readonly fromTicketId?: string
  /**
   * Who made the request: the MODEL through a team tool (`ask_colleague` / `pass_forward`), or the HOST by its own rule (the call id starts with `mention:`, `campaign:` or
   * `review:` — the same split Forge's observer uses). Attempt 3 must say which of the behaviors came from the model's choice and which from the host's plan.
   */
  readonly via: 'model' | 'host'
}

const RAW_MARKER = /\[\[[a-z][a-z0-9_-]*:/iu

/**
 * The marker the host keeps IN the body of some cards (the plain sentence first, the marker LAST) and the screen never shows: the same pattern as
 * `client-ui-persona/src/client/chat/wire-markers.ts` (a spec compares the two source texts, so they cannot drift apart silently). The card is drawn from the typed fields of
 * the message; with the card off the person reads only the plain sentence. A marker of these kinds at the END of a body is therefore NOT a leak (attempt 2 of TEAM-10 was
 * wrongly marked LEAK-1 for the question card); any other marker, or one with text after it, still is.
 */
export const WIRE_MARKER = /\s*\[\[(?:task-proposal|persona-ask|account-ask|account-swap|handoff|review|run-error):[\s\S]*?\]\]\s*$/u

/** The body without the trailing wire marker, exactly as the screen reads it. */
export function stripWireMarker(body: string): string {
  return body.replace(WIRE_MARKER, '')
}

/** A question the team put to the PERSON (`persona_ask` card), read from the marker in the body of its thread line. */
export interface TranscriptAsk {
  readonly id: string
  readonly askId: string
  readonly ticketId: string
  readonly who: string
  readonly question: string
  readonly options: readonly string[]
  readonly step: { readonly index: number; readonly total: number } | undefined
}

const ASK_MARKER = /\[\[persona-ask:(\{[\s\S]*?\})\]\]\s*$/u

/** @returns The question card of a thread line, or `undefined` when the body carries no (readable) `persona-ask` marker. */
export function askOf(id: string, body: string, names: Readonly<Record<string, string>> = {}): TranscriptAsk | undefined {
  const match = ASK_MARKER.exec(body)
  if (match === null) return undefined
  try {
    const card = JSON.parse(match[1]!) as { askId?: string; ticketId?: string; personaId?: string; personaName?: string; question?: string; options?: Array<{ label?: string }>; step?: { index?: number; total?: number } }
    return {
      id, askId: card.askId ?? '', ticketId: card.ticketId ?? '',
      who: card.personaName ?? (card.personaId === undefined ? '?' : (names[card.personaId] ?? card.personaId)),
      question: card.question ?? '',
      options: (card.options ?? []).map(option => option.label ?? '').filter(label => label !== ''),
      step: typeof card.step?.index === 'number' && typeof card.step.total === 'number' ? { index: card.step.index, total: card.step.total } : undefined,
    }
  } catch { return undefined }
}

/** Event types the person READS in the thread (Gauge/Forge, 04/11): chat plus the typed team lines. Extend as the host adds new ones. */
export const VISIBLE_EVENT_TYPES: readonly string[] = ['message', 'runner', 'handoff', 'opinion', 'review', 'dailyBrief']
/** Types that are a person's/persona's own words (full body, attributed to the author): a chat message and the persona's reply written by her runner (D-069 real run). */
const OWN_WORDS_TYPES: readonly string[] = ['message', 'runner']
/** How a typed team line is attributed: the host stores it under the owner of the mandate (a person), but the person reads it as the team's. */
export const TEAM_LINE = 'Linha da equipe'
/** An author that is an internal id (`team:split`, `routine:…`): the screen never shows it (`analyzeTeamStreamNoise`, rule a), so the reader skips it too (Keel 01:34, R4). */
const TECHNICAL_ACTOR = /^[a-z][a-z0-9_-]*:\S+$/iu

/** @returns The words a person would read for an internal marker, or the text itself. */
export function humanizeLine(text: string, names: Readonly<Record<string, string>> = {}): string {
  // The question card (`persona_ask`): the screen draws "PERGUNTA i DE n" with the question and the chips from the typed fields, never the marker — say it the way the card reads.
  const ask = askOf('', text, names)
  if (ask !== undefined) {
    const where = ask.step === undefined ? '' : `pergunta ${String(ask.step.index)} de ${String(ask.step.total)}`
    const inside = [ask.options.length === 0 ? '' : `opções: ${ask.options.join(' · ')}`, where].filter(part => part !== '').join(' — ')
    return `${ask.who} pergunta: ${ask.question} (cartão${inside === '' ? '' : ` com ${inside}`})`
  }
  // The typed review line is only a marker in the thread (`[[review:{json}]]`, kinds reviewed | returned): say it the way the UI does.
  const reviewed = text.replace(/\[\[review:(\{.*?\})\]\]/gsu, (_all, json: string) => {
    try {
      const parsed = JSON.parse(json) as { kind?: string; status?: string; reviewerPersonaId?: string; reviewerId?: string; personaId?: string }
      const id = parsed.reviewerPersonaId ?? parsed.reviewerId ?? parsed.personaId
      const reviewer = id === undefined ? 'a equipe' : (names[id] ?? id)
      const kind = parsed.kind ?? parsed.status
      return kind === 'returned' ? `${reviewer} pediu ajustes` : `Revisado por ${reviewer}`
    } catch {
      return 'Revisão'
    }
  })
  const withErrors = reviewed.replace(/\[\[run-error:(\{.*?\})\]\]/gsu, (_all, json: string) => {
    try {
      const parsed = JSON.parse(json) as { code?: string; provider?: string; persona?: string }
      return `⚠ (erro do motor${parsed.persona === undefined ? '' : ` de ${parsed.persona}`}${parsed.provider === undefined ? '' : ` — ${parsed.provider}`}: ${parsed.code ?? 'desconhecido'})`
    } catch {
      return '⚠ (erro do motor)'
    }
  })
  // Any other wire marker at the END of the body is stripped by the screen too (task-proposal, account-ask, account-swap, handoff): the plain sentence before it is what is read.
  return stripWireMarker(withErrors)
}

/**
 * Leak findings in a VISIBLE line: internal-prompt phrases (LEAK-1) and any raw `[[kind:…]]` marker still in the text.
 * @param visible - What the person reads in the line.
 * @param options - `ownWords`: the line is a persona's (or the person's) OWN words, not a line the host wrote. The word "bilhete" there is the persona naming the thing she was handed
 *   (the product's own term: the Quadros show "Caminho do trabalho com o bilhete"), not the host copying the note into the thread — attempt 3 of the real round was wrongly marked for it.
 */
export function leaksIn(visible: string, options: { readonly ownWords?: boolean } = {}): string[] {
  return [
    ...LEAK_1_PATTERNS.filter(pattern => pattern.test(visible)).map(pattern => `internal prompt: ${pattern.source}`),
    ...(RAW_MARKER.test(visible) ? ['raw internal marker'] : []),
    // Forge (04/11): the handoff NOTE ("bilhete") lives in the task detail and in the colleague's assignment, never in the thread — a line the HOST wrote must not carry the word. What a
    // persona says in her own words is checked by TEXT instead (the note's own sentences echoed in someone else's line, below), which is the real leak.
    ...(options.ownWords !== true && /\bbilhete\b/iu.test(visible) ? ['handoff note ("bilhete") visible in the thread'] : []),
  ]
}

const MAX_HASHED_BYTES = 4 * 1024 * 1024
const MAX_DRAFT_FILES = 400

/** The files of one directory, recursively, relative with `/`; never follows a link outside, never reads a file above `MAX_HASHED_BYTES`. */
function walkDraft(root: string): DraftFile[] {
  const out: DraftFile[] = []
  const visit = (dir: string, prefix: string): void => {
    if (out.length >= MAX_DRAFT_FILES) return
    let entries: Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full, relative)
      else if (entry.isFile()) {
        try {
          const size = statSync(full).size
          out.push({ path: relative, size, sha: size <= MAX_HASHED_BYTES ? createHash('sha256').update(readFileSync(full)).digest('hex') : null })
        } catch { /* a file that vanished while reading proves nothing */ }
      }
    }
  }
  visit(root, '')
  return out
}

/**
 * The DRAFT of every Task of the round, from disk: `<home>/worktrees/<project>/<ticketId>` (the convention of the host; the database's `execution.directory` is not always filled for a
 * colleague's Task — attempt 4 of the real round had `.` for most of them). Only Tasks of THIS database are read.
 */
export function readDrafts(home: string, ticketIds: readonly string[]): TranscriptDraft[] {
  const base = join(home, 'worktrees')
  if (!existsSync(base)) return []
  const wanted = new Set(ticketIds)
  const drafts: TranscriptDraft[] = []
  let projects: string[]
  try { projects = readdirSync(base) } catch { return [] }
  for (const project of projects) {
    let tickets: string[]
    try { tickets = readdirSync(join(base, project)) } catch { continue }
    for (const ticketId of tickets) {
      if (!wanted.has(ticketId)) continue
      const directory = join(base, project, ticketId)
      drafts.push({ ticketId, directory, files: walkDraft(directory) })
    }
  }
  return drafts
}

function table(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/**
 * @param home - `PERSONA_HOME` of the run (database at `<home>/db/persona.db`).
 * @returns The transcript, or `undefined` when the database does not exist.
 */
export function readTeamTranscript(home: string): TeamTranscript | undefined {
  const source = join(home, 'db', 'persona.db')
  if (!existsSync(source)) return undefined
  const scratch = mkdtempSync(join(tmpdir(), 'team-transcript-'))
  try {
    const copy = join(scratch, 'persona.db')
    copyFileSync(source, copy)
    for (const suffix of ['-wal', '-shm']) if (existsSync(source + suffix)) copyFileSync(source + suffix, copy + suffix)
    const db = new DatabaseSync(copy)
    try {
      const names: Record<string, string> = {}
      const personas: string[] = []
      if (table(db, 'persona')) {
        for (const row of db.prepare('SELECT id, name FROM persona').all() as Array<{ id: string; name: string }>) { names[row.id] = row.name; personas.push(row.name) }
      }
      if (table(db, 'member')) for (const row of db.prepare('SELECT id, display_name FROM member').all() as Array<{ id: string; display_name: string }>) names[row.id] = row.display_name

      const attachments = new Map<string, string[]>()
      if (table(db, 'attachment')) {
        for (const row of db.prepare('SELECT message_id, name FROM attachment WHERE message_id IS NOT NULL').all() as Array<{ message_id: string; name: string }>) {
          attachments.set(row.message_id, [...(attachments.get(row.message_id) ?? []), row.name])
        }
      }
      // The question cards come from the SAME rows the person reads (the ask card of a persona is stored under the persona's own actor id, like any of her lines).
      const asks: TranscriptAsk[] = []
      const lines: TranscriptLine[] = table(db, 'event')
        ? (db.prepare('SELECT id, stream_id, type, body, actor_id, occurred_at, occurred_at_utc FROM event WHERE deleted = 0 AND type IN (' + VISIBLE_EVENT_TYPES.map(() => '?').join(', ') + ') ORDER BY occurred_at_utc, seq').all(...VISIBLE_EVENT_TYPES) as Array<{
          id: string; stream_id: string; type: string; body: string; actor_id: string; occurred_at: string
        }>).filter(row => !TECHNICAL_ACTOR.test(row.actor_id)).map((row) => {
          const ask = askOf(row.id, row.body, names)
          if (ask !== undefined) asks.push(ask)
          // A typed team line (handoff, opinion, review, daily brief) is its FIRST line in the thread; anything after it is not what the person reads.
          const typed = !OWN_WORDS_TYPES.includes(row.type)
          const text = humanizeLine(typed ? (row.body.split(/\r?\n/u)[0] ?? '') : row.body, names)
          return {
            at: row.occurred_at, stream: row.stream_id, id: row.id, type: row.type,
            who: typed || row.body.includes('[[handoff:') ? TEAM_LINE : (names[row.actor_id] ?? row.actor_id),
            // Only the typed HANDOFF line is the host's own sentence ("X passou para Y: …"): the word "bilhete" there would be the note leaking. A typed review line carries the REVIEWER's
            // points ("Lia pediu ajustes a Téo: … o bilhete foi cortado …") and an opinion line the opinions: model words, like a chat message.
            text, attachments: attachments.get(row.id) ?? [], leaks: leaksIn(text, { ownWords: row.type !== 'handoff' }),
          }
        })
        : []
      const tickets: TranscriptTicket[] = table(db, 'engine_ticket')
        ? (db.prepare('SELECT id, stage, assignment_state, ended, body FROM engine_ticket ORDER BY updated_at').all() as Array<{
          id: string; stage: string; assignment_state: string | null; ended: number; body: string
        }>).map((row) => {
          let title = row.id
          let trigger: string | undefined
          let assignment: string | undefined
          try {
            const body = JSON.parse(row.body) as { title?: string; origin?: { triggerId?: string }; execution?: { assignment?: string } }
            title = String(body.title ?? row.id)
            trigger = body.origin?.triggerId
            assignment = body.execution?.assignment
          } catch { /* keep the id */ }
          return { id: row.id, title, stage: row.stage, assignmentState: row.assignment_state, ended: row.ended === 1, ...(trigger === undefined ? {} : { trigger }), ...(assignment === undefined ? {} : { assignment }) }
        })
        : []
      const ignoredTypes: Record<string, number> = {}
      if (table(db, 'event')) {
        for (const row of db.prepare('SELECT type, count(*) AS n FROM event WHERE deleted = 0 GROUP BY type').all() as Array<{ type: string; n: number }>) {
          if (!VISIBLE_EVENT_TYPES.includes(row.type)) ignoredTypes[row.type] = Number(row.n)
        }
      }
      // The bilhete lives on the Task side (host `HandoffBook` → `screen_doc` kind 'handoff'): data between delimiters for the colleague and the Task detail.
      const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
      // What the COLLEAGUE really received (Forge): her Ticket is found by `origin.triggerId` = the id of the request event (= the screen_doc id); its
      // `execution.assignment` carries the bilhete between <bilhete> delimiters, invisible in the thread. Positive proof of the handoff.
      const received = new Map<string, { ticketId: string; hasNote: boolean }>()
      let splitTasks = 0
      const splitAssignments: string[] = []
      const reviewAssignments: string[] = []
      const draftDirectories: string[] = []
      if (table(db, 'engine_ticket')) {
        for (const row of db.prepare('SELECT id, body FROM engine_ticket').all() as Array<{ id: string; body: string }>) {
          try {
            const ticket = JSON.parse(row.body) as { title?: string; origin?: { triggerId?: string; triggerIds?: string[] }; execution?: { assignment?: string; directory?: string } }
            if (typeof ticket.execution?.directory === 'string' && ticket.execution.directory !== '') draftDirectories.push(ticket.execution.directory)
            if (/^split:/u.test(ticket.origin?.triggerId ?? '')) { splitTasks += 1; splitAssignments.push(ticket.execution?.assignment ?? '') }
            // The reviewer's Task ("Revisar: <título>"): what she is handed to review — her whole view of the author's delivery.
            if (/^Revisar:/u.test(ticket.title ?? '')) reviewAssignments.push(ticket.execution?.assignment ?? '')
            const hasNote = /<bilhete>[\s\S]*<\/bilhete>/u.test(ticket.execution?.assignment ?? '')
            for (const trigger of new Set([ticket.origin?.triggerId, ...(ticket.origin?.triggerIds ?? [])])) {
              if (trigger !== undefined && (!received.has(trigger) || hasNote)) received.set(trigger, { ticketId: row.id, hasNote })
            }
          } catch { /* a ticket without a readable body proves nothing */ }
        }
      }
      const notes: TranscriptNote[] = table(db, 'screen_doc')
        ? (db.prepare("SELECT id, body FROM screen_doc WHERE kind = 'handoff' ORDER BY updated_at, id").all() as Array<{ id: string; body: string }>).flatMap((row) => {
          try {
            const record = JSON.parse(row.body) as { fromTicketId?: string; kind?: string; fromPersonaId?: string; toPersonaId?: string; title?: string; status?: string; askedAt?: string; callId?: string; note?: Record<string, unknown> }
            const name = (id: string | undefined): string => (id === undefined ? '?' : (names[id] ?? id))
            const got = received.get(row.id)
            return [{
              id: row.id, from: name(record.fromPersonaId), to: name(record.toPersonaId), title: record.title ?? row.id, kind: record.kind ?? 'handoff',
              status: record.status ?? 'n/d', askedAt: record.askedAt ?? '',
              done: strings(record.note?.done), needed: strings(record.note?.needed), files: strings(record.note?.files), decisions: strings(record.note?.decisions),
              colleagueReceived: got?.hasNote === true, colleagueTicketId: got?.ticketId ?? null,
              ...(typeof record.fromTicketId === 'string' ? { fromTicketId: record.fromTicketId } : {}),
              via: /^(?:mention|campaign|review):/u.test(record.callId ?? '') ? 'host' as const : 'model' as const,
            }]
          } catch { return [] }
        })
        : []
      // The REVIEW of a Task (host `screen_doc` kind 'review_state', id = the Task under review): reviewer, how many returns, the seal.
      const reviews: TranscriptReview[] = table(db, 'screen_doc')
        ? (db.prepare("SELECT id, body FROM screen_doc WHERE kind = 'review_state' ORDER BY updated_at, id").all() as Array<{ id: string; body: string }>).flatMap((row) => {
          try {
            const doc = JSON.parse(row.body) as { state?: { status?: string; reviewerId?: string; returns?: number; passes?: number }; authorPersonaId?: string; summary?: string; seal?: { reviewerPersonaId?: string }; failure?: string }
            const name = (id: string | undefined): string => (id === undefined ? '?' : (names[id] ?? id))
            return [{
              taskId: row.id, status: doc.state?.status ?? 'n/d', reviewer: name(doc.state?.reviewerId ?? doc.seal?.reviewerPersonaId), author: name(doc.authorPersonaId),
              returns: doc.state?.returns ?? 0, sealed: doc.seal !== undefined, summary: doc.summary ?? '', failure: typeof doc.failure === 'string' && doc.failure !== '' ? doc.failure : null,
            }]
          } catch { return [] }
        })
        : []
      // Leak by TEXT (Forge's rule, 04/11): the bilhete of 'next'/'review' is BUILT from what the author delivered (her own sentence is already in the thread as her
      // line), and a 'help' bilhete is written through the tool, never in the thread. So `done`/`needed` (12+ characters) leak only in a line of SOMEONE ELSE than
      // the author of the request; `decisions` and `files` leak in ANY line. The `<bilhete>` delimiters / the word are caught per line by `leaksIn`.
      // A file NAME the person attached to the thread herself (the poster of her own request) is public to her: a bilhete that lists it as a file ("Arquivos: foto.png") and a persona
      // who says "o foto.png não mostra pão de queijo" is not the note leaking (attempt 3 of the real round was wrongly marked for it).
      // A file the PRODUCT itself announces in the thread ("Téo salvou cartaz.svg no rascunho", D-099) is public to the person: its name (or the end of a path to it) is not the note leaking.
      const announcedNames = new Set(lines.flatMap(line => [...line.text.matchAll(/salvou\s+(\S+)\s+no rascunho/gu)].map(match => match[1]!.replace(/[\\/]/gu, '/').split('/').pop() ?? '')))
      const attachedNames = new Set([...attachments.values()].flat().map(name => name.trim()))
      // The person's OWN attachment is public to her under whatever path the host keeps it (attempt 5, 09/11: a bilhete listing `inputs/foto.png` and a persona saying "usei o rascunho `inputs/foto.png`"
      // was wrongly marked LEAK-1): the name as attached, `inputs/<name>` and `inputs/<id>-<name>` — the host's drop folder for what the person attached to the request.
      const isPersonsFile = (item: string): boolean => {
        const path = item.trim().replace(/\\/gu, '/').replace(/^\.\//u, '')
        const base = path.split('/').pop() ?? path
        return attachedNames.has(path) || attachedNames.has(base) || path.startsWith('inputs/') || [...attachedNames].some(name => base.endsWith(`-${name}`))
      }
      const checked = lines.map((line) => {
        const echoed = new Set<string>()
        for (const note of notes) {
          const others = line.who !== note.from
          const candidates = [
            ...(others ? [...note.done, ...note.needed].filter(item => item.trim().length >= 12) : []),
            ...note.decisions.filter(item => item.trim().length >= 8),
            ...note.files.filter(item => item.trim().length >= 8 && !isPersonsFile(item) && !announcedNames.has(item.trim().split(/[\\/]/u).pop() ?? '')),
          ]
          for (const item of candidates) if (line.text.includes(item)) echoed.add(`bilhete text in the thread: "${item.slice(0, 40)}"`)
        }
        return echoed.size === 0 ? line : { ...line, leaks: [...line.leaks, ...echoed] }
      })
      return { lines: checked, tickets, ledger: readLedgerEvidence(home), names, personas, ignoredTypes, notes, reviews, asks, splitTasks, splitAssignments, reviewAssignments, draftDirectories, drafts: readDrafts(home, tickets.map(ticket => ticket.id)), leaks: checked.flatMap(line => line.leaks.map(leak => `${line.id}: ${leak}`)) }
    } finally {
      db.close()
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * @param transcript - From {@link readTeamTranscript}.
 * @param title - Heading of the document.
 * @returns A Markdown transcript Atlas can read aloud: lines in order, tickets, and what each paid turn cost (measured).
 */
export function renderTranscriptMarkdown(transcript: TeamTranscript, title: string): string {
  const out: string[] = [`# ${title}`, '']
  out.push(`Linhas: ${String(transcript.lines.length)} · Tarefas: ${String(transcript.tickets.length)} · Vazamentos de prompt interno: ${String(transcript.leaks.length)}`, '')
  out.push('## O que a pessoa vê, em ordem', '')
  for (const line of transcript.lines) {
    const files = line.attachments.length === 0 ? '' : ` 📎 ${line.attachments.join(', ')}`
    const tag = line.leaks.length === 0 ? '' : ` ⛔ [VAZAMENTO: ${line.leaks.join('; ')}]`
    out.push(`- \`${line.at.slice(11, 19)}\` **${line.who}** (${line.stream}): ${line.text.replace(/\s+/gu, ' ')}${files}${tag}`)
  }
  out.push('', '## Tarefas', '')
  for (const ticket of transcript.tickets) out.push(`- ${ticket.title} — etapa ${ticket.stage}, ${ticket.ended ? 'encerrada' : (ticket.assignmentState ?? 'sem execução')}`)
  if (transcript.notes.length > 0) {
    out.push('', '## Bilhetes (detalhe da Tarefa — não vão ao fio de propósito)', '')
    for (const note of transcript.notes) {
      const label = note.kind === 'review' ? 'pedido de revisão' : note.kind === 'help' ? 'pedido de ajuda' : note.kind === 'next' ? 'passou adiante' : 'passagem/ajuda'
      out.push(`### ${note.from} → ${note.to}: ${note.title} (${label}, ${note.status})`)
      const section = (label: string, items: readonly string[]): void => { if (items.length > 0) out.push(`**${label}:**`, ...items.map(item => `- ${item}`)) }
      section('Já está pronto', note.done)
      section('Falta', note.needed)
      section('Arquivos', note.files)
      section('Decisões tomadas', note.decisions)
      out.push(note.colleagueReceived
        ? `✔ O colega recebeu o bilhete (Tarefa ${note.colleagueTicketId ?? '?'}), fora do fio.`
        : '✖ NÃO há prova de que o colega recebeu o bilhete (o Ticket dele não traz <bilhete>).', '')
    }
  }
  if (transcript.asks.length > 0) {
    out.push('', '## Perguntas da equipe à pessoa (cartões persona_ask)', '')
    for (const ask of transcript.asks) {
      out.push(`- **${ask.who}**${ask.step === undefined ? '' : ` (pergunta ${String(ask.step.index)} de ${String(ask.step.total)})`}: ${ask.question}${ask.options.length === 0 ? '' : ` — opções: ${ask.options.join(' · ')}`}`)
    }
  }
  if (transcript.reviews.length > 0) {
    out.push('', '## Revisões entre colegas', '')
    for (const review of transcript.reviews) {
      out.push(`- ${review.author} → revisão de ${review.reviewer}: ${review.status}${review.returns > 0 ? `, voltou ${String(review.returns)}×` : ''}${review.sealed ? ' · selo "Revisado por ' + review.reviewer + '"' : ' · sem selo'}${review.summary === '' ? '' : ` — ${review.summary.replace(/\s+/gu, ' ').slice(0, 160)}`}`)
    }
  }
  const ledger = transcript.ledger
  out.push('', '## Chamadas pagas (turn_ledger, medido)', '')
  if (ledger === undefined || ledger.turns === 0) {
    out.push('Nenhuma.')
  } else {
    // Scripted rows (engine `dsh` / 1-1 tokens) are the fake runner's bookkeeping, NOT spend: say so, so nobody reads them as cost (Gauge, 04/11).
    const scripted = fakeRunnerSignature(ledger).length
    if (scripted === ledger.turns) {
      out.push(`**Roteirizado: nenhuma chamada paga.** As ${String(ledger.turns)} linha(s) abaixo são do runner roteirizado (motor dsh / 1 token), não são gasto real.`, '')
    } else {
      out.push(`${String(ledger.turns)} turno(s) · entrada ${String(ledger.inputTokens)} · saída ${String(ledger.outputTokens)} · cache lido ${String(ledger.cacheReadTokens)} / escrito ${String(ledger.cacheWriteTokens)} · tudo medido: ${ledger.allMeasured ? 'sim' : 'NÃO'}${scripted > 0 ? ` · ${String(scripted)} linha(s) roteirizada(s) (não são gasto)` : ''}`, '')
    }
    ledger.rawRows.forEach((row, index) => {
      const isScripted = String(row.engine) === 'dsh' || (Number(row.input_tokens) === 1 && Number(row.output_tokens) === 1)
      out.push(`${String(index + 1)}. ${transcript.names[String(row.persona_id)] ?? String(row.persona_id)} (${String(row.engine)}/${String(row.kind)}): entrada ${String(row.input_tokens)}, saída ${String(row.output_tokens)}, origem ${String(row.origin ?? 'n/d')}${isScripted ? ' — roteirizado, sem gasto real' : ''}`)
    })
  }
  const ignored = Object.entries(transcript.ignoredTypes)
  if (ignored.length > 0) out.push('', `_Tipos de evento no fio que este leitor não mostra: ${ignored.map(([type, count]) => `${type} (${String(count)})`).join(', ')}._`)
  return `${out.join('\n')}\n`
}

/**
 * Diagnostic: the last events of the database as stored (id, stream, type, author, body head) — EVERYTHING, including the internal `coord-…` lines the
 * transcript does not show — so a failed conversation step can be read in the proof (D-079 "obrigado" went mute: was there a reaction? a state line?).
 * @param home - `PERSONA_HOME` of the run.
 * @param limit - How many events, newest last.
 * @returns Rows in order, or an empty list without a database.
 */
export function readRecentEvents(home: string, limit = 40): Array<{ id: string; stream: string; type: string; author: string; body: string }> {
  const source = join(home, 'db', 'persona.db')
  if (!existsSync(source)) return []
  const scratch = mkdtempSync(join(tmpdir(), 'team-events-'))
  try {
    const copy = join(scratch, 'persona.db')
    copyFileSync(source, copy)
    for (const suffix of ['-wal', '-shm']) if (existsSync(source + suffix)) copyFileSync(source + suffix, copy + suffix)
    const db = new DatabaseSync(copy)
    try {
      if (!table(db, 'event')) return []
      const rows = db.prepare('SELECT id, stream_id, type, actor_id, body FROM event WHERE deleted = 0 ORDER BY occurred_at_utc DESC, seq DESC LIMIT ?').all(limit) as Array<{
        id: string; stream_id: string; type: string; actor_id: string; body: string
      }>
      return rows.reverse().map(row => ({ id: row.id, stream: row.stream_id, type: row.type, author: row.actor_id, body: row.body.replace(/\s+/gu, ' ').slice(0, 220) }))
    } finally {
      db.close()
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

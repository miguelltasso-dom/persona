/**
 * P0-1 of the real round of 07/11 (Atlas): "a equipe NÃO ENXERGA os arquivos uns dos outros". Each Task works in its OWN draft; Bia could not find the poster Téo saved ("o arquivo … não
 * existe no diretório de trabalho atual"), Téo could not find the request's `foto.png`, and Lia RECREATED a file because the colleague's one was not there. The rule (Keel/Bolt): the
 * request's attachments and the files the bilhete cites are AVAILABLE in the draft of whoever receives them, at the SAME relative path, without touching the real folder.
 *
 * Two pure readers, one per kind of evidence (both fail closed with one readable problem per defect):
 *   - `sharedFilesProblems`  from the drafts ON DISK after the round (real and fake): what each receiving Task has now;
 *   - `stubTurnProblems`     from the fake CLI's own log (fake only): what the stub found in its working directory WHEN THE TURN STARTED, and whether a turn wrote a file that a colleague had
 *                            already saved (the stub recreates a missing file, exactly like the model did) — the end state of a draft cannot tell a copy from a recreation, the stub can.
 */
import type { DraftFile, TeamTranscript, TranscriptDraft, TranscriptNote } from './team-transcript.ts'

export interface SharedFilesOptions {
  /** The name the person gave the request's attachment (`foto.png`); the host may store it under another path (`inputs/<id>-foto.png`). */
  readonly attachmentName: string
  /** SHA-256 of the attachment's bytes, when known: a file with the right name but other bytes is not the poster. */
  readonly posterSha256?: string
  /** A round with no draft on disk at all proves nothing about shared files: when true that is a problem (the fake and the real round run in a project WITH a folder). */
  readonly requireDrafts?: boolean
}

/** A file or path the text cites: `dir/name.ext`, with an extension the draft can hold. URLs and absolute paths are not cited files (they cannot be checked in a draft). */
const CITED_PATH = /(?<![\p{L}\p{N}_:/.\\-])(?:[\p{L}\p{N}_.-]+[\\/])*[\p{L}\p{N}_.-]+\.(?:png|svg|jpe?g|webp|gif|pdf|txt|md|json|csv)(?![\p{L}\p{N}_/\\-])/giu

export const normalizePath = (path: string): string => path.trim().replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/[`'"“”.,;:)]+$/u, '')

/** The files a text cites, normalized (`artes\x.SVG` → `artes/x.SVG`), without duplicates. */
export function citedPaths(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(CITED_PATH)) {
    const path = normalizePath(match[0])
    if (path !== '' && !/^[a-z]:/iu.test(path) && !path.startsWith('/') && !path.includes('..')) found.add(path)
  }
  return [...found]
}

/**
 * The files an ASSIGNMENT promises the worker: the request's attachments ("Anexos do pedido: foto.png.") and the bilhete's list ("Arquivos:\n- artes/x.svg"). A path in the free text of
 * the bilhete ("salvar como x.png") may be a file still to be created, so only these two places count as "the file is there for you".
 */
export function promisedFiles(assignment: string): string[] {
  const found = new Set<string>()
  for (const match of assignment.matchAll(/Anexos do pedido:[ \t]*([^\n]*)/gu)) for (const path of citedPaths(match[1] ?? '')) found.add(path)
  for (const match of assignment.matchAll(/^Arquivos:[ \t]*\n((?:[ \t]*[-•][^\n]*\n?)*)/gmu)) for (const path of citedPaths(match[1] ?? '')) found.add(path)
  // Bolt 09/11: the host COPIES the files into the receiver's draft and says where, in the prompt ("Arquivos que chegaram no seu rascunho (cópias; …):\n- inputs/foto.png (anexo do pedido da pessoa)").
  for (const match of assignment.matchAll(/^Arquivos que chegaram no seu rascunho[^\n]*\n((?:[ \t]*[-•][^\n]*\n?)*)/gmu)) for (const path of citedPaths(match[1] ?? '')) found.add(path)
  return [...found]
}

const hasPath = (files: readonly DraftFile[], path: string): boolean => files.some(file => file.path.toLowerCase() === path.toLowerCase())
const describeFiles = (files: readonly DraftFile[]): string => (files.length === 0 ? 'empty' : files.map(file => file.path).slice(0, 8).join(', ') + (files.length > 8 ? ', …' : ''))

/** The request's attachment in a draft: a file whose NAME ends in the attachment's name (`inputs/<id>-foto.png`, `anexos/foto.png`, `foto.png`) and, when known, with the poster's bytes. */
export function posterIn(files: readonly DraftFile[], options: SharedFilesOptions): DraftFile | undefined {
  const wanted = options.attachmentName.toLowerCase()
  return files.find(file => file.path.toLowerCase().endsWith(wanted) && (options.posterSha256 === undefined || file.sha === null || file.sha === options.posterSha256))
}

/** The files a baseline of the project carries into EVERY draft (`LEIAME.txt`): same path and bytes in all of them — not something a colleague saved. */
function baselineOf(drafts: readonly TranscriptDraft[]): Set<string> {
  if (drafts.length === 0) return new Set()
  const [head, ...rest] = drafts
  return new Set(head!.files.filter(file => rest.every(draft => draft.files.some(other => other.path === file.path && other.sha === file.sha))).map(file => file.path))
}

/** What the SENDER of a bilhete saved in her own draft: not the baseline, not the request's attachment, not the PNG twin the host makes of an SVG. */
function savedBy(draft: TranscriptDraft | undefined, baseline: ReadonlySet<string>, options: SharedFilesOptions): string[] {
  if (draft === undefined) return []
  const twins = new Set(draft.files.filter(file => /\.svg$/iu.test(file.path)).map(file => file.path.replace(/\.svg$/iu, '.png').toLowerCase()))
  return draft.files
    .filter(file => !baseline.has(file.path) && posterIn([file], options) === undefined && !/^inputs\//u.test(file.path) && !twins.has(file.path.toLowerCase()))
    .map(file => file.path)
}

const label = (transcript: TeamTranscript, ticketId: string): string => `Task "${(transcript.tickets.find(ticket => ticket.id === ticketId)?.title ?? ticketId).slice(0, 48)}"`

/**
 * What every receiving Task finds in its DRAFT after the round.
 *   1. each Task that carries work of the request — the parts of the split and the colleague of every pass/help — holds the request's attachment;
 *   2. every path a Task's assignment cites exists in its own draft (the assignment said "Anexos do pedido: foto.png" while the file lay in `inputs/<id>-foto.png`);
 *   3. every file a bilhete lists (`pass_forward`/`ask_colleague`) is in the colleague's draft at the same relative path;
 *   4. the reviewer holds what the author saved (the art she is asked to approve).
 */
export function sharedFilesProblems(transcript: TeamTranscript, options: SharedFilesOptions): string[] {
  const drafts = transcript.drafts ?? []
  const problems: string[] = []
  if (drafts.length === 0) return options.requireDrafts === true ? ['P0-1 shared-files: no Task draft was found on disk (worktrees/<project>/<ticket>): the files the team shares cannot be read'] : []
  const draftOf = (ticketId: string | null | undefined): TranscriptDraft | undefined => (ticketId === null || ticketId === undefined ? undefined : drafts.find(draft => draft.ticketId === ticketId))
  const baseline = baselineOf(drafts)

  // 1 — the request's attachment where the work of the request lands.
  const receivers = new Map<string, string>()
  for (const ticket of transcript.tickets) if (/^split:/u.test(ticket.trigger ?? '')) receivers.set(ticket.id, 'a part of the split')
  for (const note of transcript.notes) if (note.kind !== 'review' && note.colleagueTicketId !== null) receivers.set(note.colleagueTicketId, `the colleague of a ${note.kind === 'next' ? 'pass_forward' : 'ask_colleague'} (${note.from} → ${note.to})`)
  for (const [ticketId, why] of receivers) {
    const draft = draftOf(ticketId)
    if (draft === undefined) { problems.push(`P0-1 shared-files: ${label(transcript, ticketId)} (${why}) has no draft on disk`); continue }
    if (posterIn(draft.files, options) === undefined) problems.push(`P0-1 shared-files: ${label(transcript, ticketId)} (${why}) does not find the request's attachment "${options.attachmentName}" in its draft (${describeFiles(draft.files)})`)
  }

  // 2 — the paths the Task was told about exist where it works.
  for (const ticket of transcript.tickets) {
    const draft = draftOf(ticket.id)
    if (draft === undefined || ticket.assignment === undefined) continue
    for (const path of promisedFiles(ticket.assignment)) {
      if (!hasPath(draft.files, path)) problems.push(`P0-1 shared-files: ${label(transcript, ticket.id)} is told about "${path}" but its draft has no such file (${describeFiles(draft.files)})`)
    }
  }

  // 3 + 4 — what the sender cites / saved reaches the colleague, the reviewer included.
  for (const note of transcript.notes) {
    const to = draftOf(note.colleagueTicketId)
    if (to === undefined) continue
    const listed = note.files.map(normalizePath).filter(path => path !== '')
    const saved = note.kind === 'review' ? savedBy(draftOf(note.fromTicketId), baseline, options) : []
    for (const path of new Set([...listed, ...saved])) {
      if (!hasPath(to.files, path)) problems.push(`P0-1 shared-files: ${note.to}'s draft (${label(transcript, to.ticketId)}) does not have "${path}", ${note.kind === 'review' ? 'saved by' : 'cited in the bilhete of'} ${note.from} (${note.kind}) — the colleague cannot read it and may recreate it`)
    }
  }
  return problems
}

// ── the fake CLI's own view ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What the stub logs (see `fixtures/fake-cli/fake-cli.mjs`): a turn with what its working directory held when it STARTED, and the files a turn wrote. */
export interface StubTurnEvent {
  readonly event: string
  readonly proc?: number
  readonly seq?: number
  readonly at?: number
  readonly cwd?: string
  readonly file?: string
  readonly sha?: string
  readonly cwdFiles?: ReadonlyArray<{ readonly p: string; readonly s: number; readonly h: string | null }>
  readonly promptPaths?: ReadonlyArray<{ readonly p: string; readonly present: boolean }>
  readonly recreated?: boolean
  /** `turn`: per needle the stub was configured with, whether the prompt contained it. */
  readonly needles?: Readonly<Record<string, boolean>>
}

export interface StubDraftOptions {
  readonly attachmentName: string
  readonly posterSha256?: string
}

const turnKey = (event: StubTurnEvent): string => `${String(event.proc)}#${String(event.seq)}`

/**
 * What the stub saw. For every turn that ran in a DRAFT directory (a `cwd` with files):
 *   - each path its prompt cites exists in the working directory (the poster at the path the assignment names, the file of the bilhete);
 *   - the turns that carry the request (`carriesRequest`) hold the poster when they start;
 *   - no turn writes a file a colleague already saved in ANOTHER draft unless it was already there (a write by a turn whose cwd lacked it is a recreation).
 * @param events - The `turn`, `write` and `toolcall` lines of the stub's log, in order.
 * @param carriesRequest - Whether a turn's prompt belongs to the request (the stub logs the needle of the request's text).
 */
export function stubTurnProblems(events: readonly StubTurnEvent[], options: StubDraftOptions, carriesRequest: (turn: StubTurnEvent) => boolean = () => false): string[] {
  const problems = new Set<string>()
  const turns = events.filter(event => event.event === 'turn' && event.cwdFiles !== undefined)
  const asDraft = (turn: StubTurnEvent): DraftFile[] => (turn.cwdFiles ?? []).map(file => ({ path: file.p, size: file.s, sha: file.h }))
  const where = (turn: StubTurnEvent): string => `turn ${turnKey(turn)} in ${(turn.cwd ?? '?').split(/[\\/]/u).slice(-1)[0] ?? '?'}`
  for (const turn of turns) {
    for (const cited of turn.promptPaths ?? []) if (!cited.present) problems.add(`P0-1 stub: ${where(turn)} was told about "${cited.p}" but it was not in its working directory when the turn started`)
    if (carriesRequest(turn) && posterIn(asDraft(turn), options) === undefined) problems.add(`P0-1 stub: ${where(turn)} carries the request but its working directory had no "${options.attachmentName}" when the turn started (${describeFiles(asDraft(turn))})`)
  }
  const writes = events.filter(event => event.event === 'write' && event.file !== undefined && event.recreated === true)
  for (const write of writes) problems.add(`P0-1 stub: ${where(write)} wrote "${write.file}" because a colleague's copy was not in its working directory — the file was recreated, not shared`)
  return [...problems]
}

/** "Téo salvou cartaz.svg no rascunho", "Bia salvou 3 arquivos no rascunho": the host's line about files a persona saved in her draft. */
const SAVED_LINE = /\bsalvou\b.*\bno rascunho\b/u

/**
 * The thread says "X salvou … no rascunho" only for files X's own turn WROTE. Copying files into a receiver's draft (P0-1) must not read as "she saved them": a persona who wrote nothing
 * ("Lia salvou 3 arquivos no rascunho" for the copies the host handed her) is a lie on the screen. The fake knows who wrote: the stub logs every file it wrote and where.
 * @param writes - The `write` events of the stub (the draft each one wrote in).
 */
export function savedLinesProblems(transcript: TeamTranscript, writes: ReadonlyArray<{ readonly cwd?: string }>): string[] {
  const written = new Set(writes.map(write => (write.cwd ?? '').split(/[\\/]/u).filter(part => part !== '').pop() ?? '').filter(id => id !== ''))
  const ticketsOf = new Map<string, Set<string>>()
  for (const row of transcript.ledger?.rawRows ?? []) {
    const name = transcript.names[String(row.persona_id)]
    const ticketId = row.ticket_id
    if (name === undefined || typeof ticketId !== 'string' || ticketId === '') continue
    ticketsOf.set(name, new Set([...(ticketsOf.get(name) ?? []), ticketId]))
  }
  const personas = new Set(transcript.personas)
  const problems: string[] = []
  for (const line of transcript.lines) {
    if (line.type !== 'message' || !personas.has(line.who) || !SAVED_LINE.test(line.text)) continue
    const mine = ticketsOf.get(line.who) ?? new Set<string>()
    if (![...mine].some(id => written.has(id))) problems.push(`P0-1 saved-lines: the thread says "${line.text.slice(0, 70)}" (${line.who}) but ${line.who} wrote no file in any of her ${String(mine.size)} Task(s) — the host's copies read as her work`)
  }
  return problems
}

/** Short summary of the notes whose files should travel (for the proof). */
export const notesWithFiles = (transcript: TeamTranscript): TranscriptNote[] => transcript.notes.filter(note => note.files.length > 0)

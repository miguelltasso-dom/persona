/**
 * TEAM-10 observer (Forge, 05/11): reads a COPY of a Persona home's database after the REAL short team round and says — from the DATABASE, not
 * from the screen — whether the REAL model chose the team tools and the host did what it promises. It complements Probe's `evaluateTeamRound`
 * (ledger ≤ ceiling, personas that spoke, visible lines, the image described by another persona, LEAK-1) with what only the engine side knows:
 *
 *   tools     the requests to a colleague that were made by the MODEL through `ask_colleague`/`pass_forward` (their call id is the lease's
 *             `<assignment>:<lease>:<n>`) versus the ones the host made from words (`mention:`), from a plan (`campaign:`) or as a review step;
 *   bilhete   every request reached the colleague's Task as DATA (`<bilhete>` in its assignment) and NO bilhete is in the thread;
 *   help      every `help` request was delivered and its asker RESUMED (never left waiting);
 *   seal      "Revisado por" exists only with a real review: a review Task of ANOTHER persona that delivered, and whether the verdict came from the
 *             `review_verdict` tool or from the words of the reviewer (the fallback);
 *   opinion   a round the persona started (`opinion:*`): the request line, the replies of OTHER personas, the consolidation, and the image bound to
 *             the request line;
 *   brief     the morning brief ("Bom dia") exists and no paid turn was written at its moment;
 *   ledger    measured, not the fake's signature, within the ceiling.
 * Pure reading: no model call, no write to the home (it works on a temp copy of the file).
 *
 * This module lives under `tests/support/` because the host aggregate type-check (`tsc -p tsconfig.host.json`) sees `persona-host/tests/**` but not
 * `persona-host/scripts/**`, and `persona-host` is a REFERENCED project there (`rootDir: src`): a spec importing a script was TS6307. The command line
 * is the thin shell `persona-host/scripts/team-round-observe.ts` (same path as always; arguments, output and exit code are unchanged):
 *
 *   node --import tsx/esm packages/persona/persona-host/scripts/team-round-observe.ts <home-dir | persona.db> [--ceiling 14] [--any] [--no-tools] [--no-review]
 *        [--no-opinion] [--no-brief] [--out report.json]
 *
 * `--any` is the NATURAL round (TEAM-10 attempt 2, D-097): any collaboration the model chose passes (see `RoundExpectation.anyCollaboration`).
 * Exit 0 only when no problem is left. Fail-closed: a missing piece is a named problem, not a pass.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Row = Record<string, unknown>

/** What the round left in the database, as plain rows (nothing interpreted yet). */
export interface RoundEvidence {
  readonly handoffs: readonly Row[]
  readonly verdicts: Readonly<Record<string, Row>>
  readonly reviews: readonly (Row & { readonly ticketId: string })[]
  readonly tickets: readonly { readonly id: string; readonly title: string; readonly executor: string; readonly assignment: string; readonly triggerId: string }[]
  readonly events: readonly { readonly id: string; readonly type: string; readonly actorId: string; readonly body: string; readonly at: string }[]
  readonly attachments: readonly { readonly id?: string; readonly messageId: string; readonly name: string }[]
  /**
   * The attachment ids the opinion card of each request line points to (its `message_flags` doc). The request's own image stays bound to the person's
   * message (an attachment belongs to ONE message), so the card, not an attachment row of the line, is what carries the image of the round.
   */
  readonly opinionAttachments?: Readonly<Record<string, readonly string[]>>
  readonly personas: Readonly<Record<string, string>>
  readonly ledger: readonly { readonly engine: string; readonly kind: string; readonly input: number; readonly output: number; readonly origin: string | null; readonly at: string; readonly ticketId: string | null }[]
}

export interface RoundExpectation {
  /** Paid turns Atlas approved. */
  readonly ceilingTurns: number
  /** The round must show the model using `ask_colleague` or `pass_forward` (default true). */
  readonly requireTools?: boolean
  /** A sealed review (default true). */
  readonly requireReview?: boolean
  /** An opinion round the persona started, with an image (default true). */
  readonly requireOpinion?: boolean
  /** The morning brief with zero paid turns at its moment (default true). */
  readonly requireBrief?: boolean
  /**
   * The NATURAL round of TEAM-10 attempt 2 (D-097): the request names no colleague and no behavior, so the round passes on ANY collaboration the model
   * chose — a request through `ask_colleague`/`pass_forward`, a sealed review, or an opinion round — the way Probe's `passed | did-not-collaborate` verdict
   * reads it. `requireTools`/`requireReview`/`requireOpinion` are then not demanded one by one; every integrity check (bilhete, help resumed, false seal,
   * the round's replies, consolidation and image, brief, ledger) still holds for what DID happen.
   */
  readonly anyCollaboration?: boolean
}

export interface RoundObservation {
  readonly passed: boolean
  readonly problems: readonly string[]
  readonly facts: {
    readonly requests: { readonly byTool: { readonly help: number; readonly next: number }; readonly byWords: number; readonly byPlan: number; readonly reviewSteps: number }
    readonly bilhete: { readonly requests: number; readonly reachedColleague: number; readonly inThread: number }
    readonly help: { readonly asked: number; readonly resumed: number; readonly leftWaiting: number; readonly failed: number }
    readonly reviews: { readonly total: number; readonly sealed: number; readonly sealedByToolVerdict: number; readonly sealedByWords: number; readonly unreadable: number; readonly engineFailed: number }
    readonly opinion: { readonly rounds: number; readonly replies: number; readonly repliesFromOthers: number; readonly consolidated: number; readonly requestsWithImage: number }
    readonly brief: { readonly present: boolean; readonly paidTurnsAtItsMoment: number }
    readonly ledger: { readonly turns: number; readonly measured: boolean; readonly ceiling: number }
    /** The model chose at least one team behavior: a request by tool, a sealed review or an opinion round. */
    readonly collaborated: boolean
  }
}

const text = (row: Row, key: string): string => (typeof row[key] === 'string' ? row[key] : '')
const HOST_PREFIX = /^(mention|campaign|review):/u

function json(raw: unknown): Row {
  if (typeof raw !== 'string') return {}
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? value as Row : {}
  } catch {
    return {}
  }
}

/**
 * Read the evidence from a database file (a COPY: the live home is never opened).
 * @param dbPath - A `persona.db` file.
 */
export function readRoundEvidence(dbPath: string): RoundEvidence {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const all = (sql: string): Row[] => db.prepare(sql).all() as Row[]
    const docs = (kind: string): Row[] => all(`SELECT id, body FROM screen_doc WHERE kind = '${kind}'`).map(row => ({ ...json(row.body), __id: text(row, 'id') }))
    const verdicts: Record<string, Row> = {}
    for (const row of docs('review_verdict')) verdicts[text(row, '__id')] = row
    return {
      handoffs: docs('handoff'),
      verdicts,
      reviews: docs('review_state').map(row => ({ ...row, ticketId: text(row, '__id') })),
      tickets: all('SELECT id, body FROM engine_ticket').map((row) => {
        const body = json(row.body)
        const execution = (typeof body.execution === 'object' && body.execution !== null ? body.execution : {}) as Row
        const origin = (typeof body.origin === 'object' && body.origin !== null ? body.origin : {}) as Row
        return { id: text(row, 'id'), title: text(body, 'title'), executor: text(execution, 'name'), assignment: text(execution, 'assignment'), triggerId: text(origin, 'triggerId') }
      }),
      events: all('SELECT id, type, actor_id, body, occurred_at FROM event WHERE deleted = 0 ORDER BY occurred_at_utc, seq').map(row => ({ id: text(row, 'id'), type: text(row, 'type'), actorId: text(row, 'actor_id'), body: text(row, 'body'), at: text(row, 'occurred_at') })),
      attachments: all('SELECT id, message_id, name FROM attachment').map(row => ({ id: text(row, 'id'), messageId: text(row, 'message_id'), name: text(row, 'name') })),
      opinionAttachments: Object.fromEntries(docs('message_flags').flatMap((row) => {
        const view: Row = typeof row.opinion === 'object' && row.opinion !== null ? row.opinion as Row : {}
        const listed: unknown = view.attachmentIds
        const ids = Array.isArray(listed) ? listed.filter((id): id is string => typeof id === 'string') : []
        return view.kind === 'request' && ids.length > 0 ? [[text(row, '__id'), ids] as const] : []
      })),
      personas: Object.fromEntries(all('SELECT id, name FROM persona').map(row => [text(row, 'id'), text(row, 'name')])),
      ledger: all('SELECT engine, kind, input_tokens, output_tokens, origin, at, ticket_id FROM turn_ledger ORDER BY at').map(row => ({
        engine: text(row, 'engine'), kind: text(row, 'kind'), input: Number(row.input_tokens ?? 0), output: Number(row.output_tokens ?? 0),
        origin: typeof row.origin === 'string' ? row.origin : null, at: text(row, 'at'), ticketId: typeof row.ticket_id === 'string' ? row.ticket_id : null,
      })),
    }
  } finally {
    db.close()
  }
}

/**
 * The verdict over the evidence.
 * @param evidence - From {@link readRoundEvidence}.
 * @param expectation - The ceiling and which behaviors the round must show.
 */
export function observeTeamRound(evidence: RoundEvidence, expectation: RoundExpectation): RoundObservation {
  const problems: string[] = []
  const any = expectation.anyCollaboration === true
  // In the natural round no single behavior is demanded (see `anyCollaboration`); one problem is said at the end if there was none at all.
  const want = (flag: boolean | undefined): boolean => !any && flag !== false
  const nameOf = (id: string): string => evidence.personas[id] ?? id

  // ---- requests to a colleague: who made them ------------------------------------------------------------------------------------
  const requests = evidence.handoffs.filter(row => text(row, 'kind') !== 'review')
  const byTool = requests.filter(row => !HOST_PREFIX.test(text(row, 'callId')))
  const byToolHelp = byTool.filter(row => text(row, 'kind') !== 'next').length
  const byToolNext = byTool.filter(row => text(row, 'kind') === 'next').length
  const byWords = requests.filter(row => text(row, 'callId').startsWith('mention:')).length
  const byPlan = requests.filter(row => text(row, 'callId').startsWith('campaign:')).length
  if (want(expectation.requireTools) && byTool.length === 0) {
    problems.push(`no request to a colleague was made by the model through ask_colleague/pass_forward (host from words: ${String(byWords)}, from the plan: ${String(byPlan)}): the real persona did not use the team tools`)
  }

  // ---- the bilhete: reaches the colleague's Task, never the thread -------------------------------------------------------------------
  const reached = requests.filter(row => row.awaiting === undefined && evidence.tickets.some(ticket => ticket.triggerId === text(row, 'id') && ticket.assignment.includes('<bilhete>'))).length
  const expectedReach = requests.filter(row => row.awaiting === undefined).length
  if (reached < expectedReach) problems.push(`${String(expectedReach - reached)} request(s) did not reach the colleague's Task with the bilhete as data`)
  const inThread = evidence.events.filter(event => (event.type === 'message' || event.type === 'handoff' || event.type === 'review') && /<\/?bilhete>/u.test(event.body)).length
  if (inThread > 0) problems.push(`${String(inThread)} line(s) of the thread carry the bilhete: it must stay in the colleague's Task`)
  const technical = evidence.events.filter(event => event.type === 'message' && event.actorId.includes(':')).length
  if (technical > 0) problems.push(`${String(technical)} chat line(s) are authored by a technical actor`)

  // ---- help: delivered, and the asker resumed --------------------------------------------------------------------------------------
  const helps = requests.filter(row => text(row, 'mode') === 'help')
  const resumed = helps.filter(row => text(row, 'status') === 'resumed').length
  const leftWaiting = helps.filter(row => ['asked', 'held'].includes(text(row, 'status')) || row.awaiting !== undefined).length
  const failed = helps.filter(row => text(row, 'status') === 'blocked' && row.awaiting === undefined).length
  if (leftWaiting > 0) problems.push(`${String(leftWaiting)} help request(s) were left waiting: the asker never got the delivery`)
  if (failed > 0) problems.push(`${String(failed)} help request(s) ended blocked (the colleague did not deliver)`)

  // ---- peer review: the seal only with a real review ---------------------------------------------------------------------------------
  const reviewRows = evidence.handoffs.filter(row => text(row, 'kind') === 'review')
  let sealed = 0
  let sealedByTool = 0
  let sealedByWords = 0
  let unreadable = 0
  let engineFailed = 0
  for (const review of evidence.reviews) {
    const seal = typeof review.seal === 'object' && review.seal !== null ? review.seal as Row : undefined
    const failure = text(review, 'failure')
    if (failure === 'unreadable') unreadable += 1
    if (failure === 'engine') engineFailed += 1
    if (seal === undefined) continue
    sealed += 1
    const reviewer = text(seal, 'reviewerPersonaId')
    const author = text(review, 'authorPersonaId')
    const real = reviewRows.filter(row => text(row, 'fromTicketId') === review.ticketId && text(row, 'toPersonaId') === reviewer && text(row, 'status') === 'delivered')
    if (real.length === 0) problems.push(`the seal of ${nameOf(reviewer)} on a Task has no delivered review Task behind it (a false seal)`)
    if (reviewer === author) problems.push(`${nameOf(author)} sealed her own work`)
    const last = real.at(-1)
    if (last !== undefined && evidence.verdicts[text(last, 'id')] !== undefined) sealedByTool += 1
    else sealedByWords += 1
  }
  if (want(expectation.requireReview) && sealed === 0) problems.push('no work was sealed by a review ("Revisado por"): the peer review did not happen for real')

  // ---- opinion round the persona started -----------------------------------------------------------------------------------------
  const opinionEvents = evidence.events.filter(event => event.id.startsWith('opinion:'))
  const requestEvents = opinionEvents.filter(event => event.id.endsWith(':request'))
  const replyEvents = opinionEvents.filter(event => /:reply:/u.test(event.id))
  const consolidated = opinionEvents.filter(event => event.id.endsWith(':consolidated')).length
  const askers = new Set(requestEvents.map(event => event.actorId))
  const repliesFromOthers = replyEvents.filter(event => !askers.has(event.actorId)).length
  const isImage = (name: string): boolean => /\.(png|jpe?g|webp|gif)$/iu.test(name)
  // The image of a round: an image bound to the request line (a draft the persona uploaded), or an image the line's opinion card points to (the request's
  // own image, which stays on the person's message). A card id with no attachment row behind it does not count.
  const withImage = requestEvents.filter(event => evidence.attachments.some(file => file.messageId === event.id && isImage(file.name))
    || (evidence.opinionAttachments?.[event.id] ?? []).some(id => evidence.attachments.some(file => file.id === id && isImage(file.name)))).length
  if (want(expectation.requireOpinion) || (any && requestEvents.length > 0)) {
    if (requestEvents.length === 0) problems.push('no opinion round was started by a persona')
    else {
      if (repliesFromOthers === 0) problems.push('the opinion round has no reply from another persona')
      if (consolidated === 0) problems.push('the opinion round was never consolidated')
      if (withImage === 0) problems.push('no opinion request carries an image attachment')
    }
  }

  // ---- the morning brief: no paid turn at its moment --------------------------------------------------------------------------------
  const brief = evidence.events.find(event => event.id.startsWith('morning-brief:'))
  const paidAtBrief = brief === undefined ? 0 : evidence.ledger.filter(row => Math.abs(Date.parse(row.at) - Date.parse(brief.at)) <= 5000 && row.kind !== 'execution').length
  if (expectation.requireBrief !== false) {
    if (brief === undefined) problems.push('no morning brief ("Bom dia") exists')
    else if (paidAtBrief > 0) problems.push(`${String(paidAtBrief)} paid turn(s) were written at the moment of the morning brief: it must cost nothing`)
  }

  // ---- the ledger --------------------------------------------------------------------------------------------------------------------
  const measured = evidence.ledger.length > 0 && evidence.ledger.every(row => row.origin === 'measured')
  if (evidence.ledger.length === 0) problems.push('the ledger holds no turn: nothing real ran')
  else {
    if (!measured) problems.push('the ledger is not fully measured: the cost cannot be stated')
    if (evidence.ledger.length > expectation.ceilingTurns) problems.push(`${String(evidence.ledger.length)} paid turns, above the approved ceiling of ${String(expectation.ceilingTurns)}`)
    if (evidence.ledger.some(row => row.engine === 'dsh' && row.input === 1 && row.output === 1)) problems.push('the ledger carries the FAKE runner signature (dsh, 1 in / 1 out): this was not a real round')
  }

  const collaborated = byTool.length > 0 || sealed > 0 || requestEvents.length > 0
  if (any && !collaborated) {
    problems.push(`the persona did not collaborate: no request through ask_colleague/pass_forward, no sealed review, no opinion round (host from words: ${String(byWords)}, from the plan: ${String(byPlan)}, review steps: ${String(reviewRows.length)})`)
  }

  return {
    passed: problems.length === 0,
    problems,
    facts: {
      requests: { byTool: { help: byToolHelp, next: byToolNext }, byWords, byPlan, reviewSteps: reviewRows.length },
      bilhete: { requests: expectedReach, reachedColleague: reached, inThread },
      help: { asked: helps.length, resumed, leftWaiting, failed },
      reviews: { total: evidence.reviews.length, sealed, sealedByToolVerdict: sealedByTool, sealedByWords, unreadable, engineFailed },
      opinion: { rounds: requestEvents.length, replies: replyEvents.length, repliesFromOthers, consolidated, requestsWithImage: withImage },
      brief: { present: brief !== undefined, paidTurnsAtItsMoment: paidAtBrief },
      ledger: { turns: evidence.ledger.length, measured, ceiling: expectation.ceilingTurns },
      collaborated,
    },
  }
}

/** Resolve `<home>` or a db file to a COPY in a temp folder, read it, and clean up. */
export function observeHome(path: string, expectation: RoundExpectation): RoundObservation {
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, 'db', 'persona.db') : path
  if (!existsSync(file)) throw new Error(`no database at ${file}`)
  const dir = mkdtempSync(join(tmpdir(), 'persona-team-observe-'))
  try {
    const copy = join(dir, 'persona.db')
    copyFileSync(file, copy)
    for (const suffix of ['-wal', '-shm']) if (existsSync(`${file}${suffix}`)) copyFileSync(`${file}${suffix}`, `${copy}${suffix}`)
    return observeTeamRound(readRoundEvidence(copy), expectation)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

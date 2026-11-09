/**
 * TEAM-10 acceptance (b) of D-090 as a PURE verdict over a transcript: a SHORT REAL round where 2–3 personas pass work to each other and give
 * their opinion about an image for real. The verdict never trusts the screen alone: it reads the measured ledger, the visible lines and the
 * attachments, and it fails closed (a missing piece is a problem, not a pass).
 *
 * What it checks (and the order of the words — `problems` — is what Atlas reads):
 *   - a MEASURED ledger with at least one real turn, none above the ceiling Atlas approved, and no fingerprint of the scripted fake;
 *   - at least `minPersonas` different personas wrote a visible line (a team, not one voice);
 *   - a visible HANDOFF line ("passou/passei … para …");
 *   - the IMAGE reached the team: a visible line carries an image attachment and a LATER line from ANOTHER persona names at least two things
 *     the poster really shows (colors/shapes) — proof the model saw it, not a generic "ótimo!";
 *   - no internal prompt or raw marker is visible (LEAK-1), and no engine error line.
 */
import { POSTER_FACTS } from './team-image-fixture.ts'
import { fakeRunnerSignature } from './ledger-evidence.ts'
import { sharedFilesProblems, type SharedFilesOptions } from './team-draft-checks.ts'
import { p0TextProblems } from './team-p0-rules.ts'
import type { TeamTranscript, TranscriptNote } from './team-transcript.ts'

export interface TeamRoundExpectation {
  /** Maximum paid turns Atlas approved for the round (also the app limiter's cap). */
  readonly ceilingTurns: number
  /** Different personas that must have spoken (2–3). */
  readonly minPersonas: number
  /** The round must include an opinion about an image. */
  readonly requireImage: boolean
  /** How many question cards the HARNESS answered as the person (`team-round-asks.ts`); only changes what the verdict says about a round that stopped at a question. */
  readonly answeredAsks?: number
  /** P0-1 (Atlas 07/11): read the Task drafts on disk — the request's attachment and the files of the bilhetes must be where each receiving Task works. Off when absent (pure specs without disk). */
  readonly sharedFiles?: SharedFilesOptions
}

/**
 * D-097 (Atlas 05/11): the request is NATURAL (no word that switches a tool on), so whether the team collaborates is the MODEL's decision. The verdict therefore separates
 *   - `harnessProblems`: what makes the run unreadable or unsafe (ledger, fake signature, the image never reached the thread, leaks, engine errors) — a defect of the run;
 *   - `findings`: "não colaborou" — the model/product did not hand off, ask for help, open a round or review; reported as a FINDING about the team, never as a harness error.
 * `problems` keeps both (so `passed` is false for either); `outcome` says which it was.
 */
export type TeamRoundOutcome = 'passed' | 'did-not-collaborate' | 'harness-problem' | 'ran-out-of-turns'

export interface TeamRoundVerdict {
  readonly passed: boolean
  readonly outcome: TeamRoundOutcome
  readonly problems: readonly string[]
  readonly harnessProblems: readonly string[]
  readonly findings: readonly string[]
  /** Context that is NOT a problem (Atlas 07/11: a persona that ASKS the person about a request without facts is doing the RIGHT thing, not failing). */
  readonly notes: readonly string[]
  /** What the team actually did, counted from the database (the acceptance reads these four): passed forward / asked for help / round of opinion / review (and its seal). */
  readonly behaviors: {
    readonly passedForward: number
    readonly askedHelp: number
    readonly opinionLines: number
    readonly reviews: number
    readonly seals: number
  }
  readonly facts: {
    readonly turns: number
    readonly speakingPersonas: readonly string[]
    readonly handoffLines: number
    readonly imageLineId: string | null
    readonly opinionsAboutImage: readonly { readonly who: string; readonly mentions: readonly string[] }[]
    /** Question cards the team put to the person, and how many the harness answered for her. */
    readonly askedPerson: number
    readonly answeredByHarness: number
  }
}

// Forge's final visible phrases (04/11): "{A} passou para {B}: {título}", "{A} pediu ajuda a {B}: …", "{B} entregou para {A}: …", "… pediu a {B}, que está em
// pausa / mas não deu para seguir", "{A} retomou “…” com a entrega de {B}"; the typed `handoff` event is the primary signal, the words the fallback.
/**
 * A line of the opinion round: the typed `opinion` event, or a `message` whose id is `opinion:<call>:request|reply:<persona>|consolidated` (how the host stores the lines of a round the PERSONA
 * opened; attempt 5 had 7 of them on screen and the verdict counted 0 by type alone).
 */
const isOpinionLine = (line: { readonly type: string; readonly id: string }): boolean => line.type === 'opinion' || line.id.startsWith('opinion:')
/** What the host says in the thread when the round's TURN CAP (a limit of the test harness, never of the product) stops a Task from starting. */
const TURN_CAP_LINE = /limite de execuções reais desta rodada foi atingido/iu

const HANDOFF = /\b(pass(ou|ei|ando|ar)|encaminh(ou|ei)|entreg(ou|uei)|pediu ajuda|retomou)\b.*\b(para|ao|à|a|com)\b/iu
const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/iu
const ENGINE_ERROR = /erro do motor|não está disponível neste computador/iu

/** Distinct poster facts (colors/shapes) a line mentions — accents folded, "amarel" matches amarelo/amarela. */
function mentionsOf(text: string): string[] {
  const folded = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '')
  const found = new Set<string>()
  for (const fact of POSTER_FACTS) {
    const key = fact.normalize('NFD').replace(/[̀-ͯ]/gu, '')
    if (folded.includes(key)) found.add(key === 'circulo' ? 'circulo' : key)
  }
  return [...found]
}

export interface BehaviorReport {
  /** 0 = the host's plan (not a behavior of the model); 1–6 = the six behaviors of the acceptance (Bolt's list, Keel 07/11). */
  readonly n: number
  readonly name: string
  readonly occurred: boolean
  readonly count: number
  /** By WHICH road it happened: the host's plan/policy or the model's own choice of a team tool. */
  readonly via: string
}

const byRoad = (items: readonly TranscriptNote[]): string => {
  const model = items.filter(note => note.via === 'model').length
  const host = items.length - model
  return items.length === 0 ? '—' : `escolha do modelo ${String(model)} · plano/regra do host ${String(host)}`
}

/**
 * The six behaviors the acceptance reads, each with whether it HAPPENED and by which road — the host's plan (the split by function "Dividi assim", the review policy) or the model's own
 * choice (a team tool) — so the proof tells "the team worked" from "the model chose to collaborate" (Keel 07/11: a round can pass on the host's plan + a sealed review alone).
 * @param transcript - From `readTeamTranscript`.
 * @param morning - What `postDailyBriefNow` answered and the paid turns around it (0 turns = the card is free).
 */
export function describeBehaviors(transcript: TeamTranscript, morning?: { readonly day?: unknown; readonly turnsBefore: number; readonly turnsAfter: number }): BehaviorReport[] {
  const requests = transcript.notes.filter(note => note.kind !== 'review')
  const next = requests.filter(note => note.kind === 'next')
  const help = requests.filter(note => note.kind === 'help')
  const reached = requests.filter(note => note.colleagueReceived)
  const peer = transcript.reviews.filter(review => review.reviewer !== review.author)
  const sealed = peer.filter(review => review.sealed)
  const opinions = transcript.lines.filter(isOpinionLine).length
  const outcome = String((morning?.day as { outcome?: unknown } | undefined)?.outcome ?? 'none')
  const brief = morning !== undefined && ['posted', 'already'].includes(outcome) && morning.turnsBefore >= 0 && morning.turnsAfter === morning.turnsBefore
  return [
    { n: 0, name: 'plano do host: a Coordenação dividiu o pedido por função ("Dividi assim")', occurred: transcript.splitTasks > 0, count: transcript.splitTasks, via: transcript.splitTasks > 0 ? 'plano do host' : '—' },
    { n: 1, name: 'bilhete: a nota de uma passagem/ajuda chegou à Tarefa do colega', occurred: reached.length > 0, count: reached.length, via: byRoad(reached) },
    { n: 2, name: 'passagem encadeada (pass_forward)', occurred: next.length > 0, count: next.length, via: byRoad(next) },
    { n: 3, name: 'ajuda pedida a um colega (ask_colleague)', occurred: help.length > 0, count: help.length, via: byRoad(help) },
    { n: 4, name: 'opinião da equipe (rodada com resposta de outra persona)', occurred: opinions > 0, count: opinions, via: opinions > 0 ? 'linhas tipadas de opinião no fio' : '—' },
    { n: 5, name: 'revisão por um colega com selo "Revisado por"', occurred: sealed.length > 0, count: sealed.length, via: peer.length === 0 ? '—' : `plano/regra do host (revisão por política): ${String(peer.length)} revisão(ões), ${String(sealed.length)} selo(s)` },
    { n: 6, name: 'Bom dia agora sem chamada paga', occurred: brief, count: brief ? 1 : 0, via: brief ? 'host (cartão do dia, 0 turno)' : '—' },
  ]
}

/**
 * @param transcript - From `readTeamTranscript` of the round's home.
 * @param expectation - Ceiling, personas and image requirement.
 * @returns The verdict with every problem named; `passed` only when there is none.
 */
export function evaluateTeamRound(transcript: TeamTranscript, expectation: TeamRoundExpectation): TeamRoundVerdict {
  const harnessProblems: string[] = []
  const findings: string[] = []
  const ledger = transcript.ledger
  const turns = ledger?.turns ?? 0
  if (ledger === undefined) harnessProblems.push('no turn_ledger could be read: the paid turns cannot be verified')
  else {
    if (turns === 0) harnessProblems.push('the ledger holds no turn: nothing real ran')
    if (!ledger.allMeasured) harnessProblems.push('turn_ledger is not fully measured (allMeasured=false): the cost cannot be stated')
    if (turns > expectation.ceilingTurns) harnessProblems.push(`${String(turns)} paid turns, above the approved ceiling of ${String(expectation.ceilingTurns)}`)
    for (const row of fakeRunnerSignature(ledger)) harnessProblems.push(`the ledger carries the FAKE runner signature (${row}): this was not a real round`)
  }

  const personaSet = new Set(transcript.personas)
  const speaking = [...new Set(transcript.lines.filter(line => personaSet.has(line.who)).map(line => line.who))]
  if (speaking.length < expectation.minPersonas) findings.push(`only ${String(speaking.length)} persona(s) spoke (${speaking.join(', ') || 'none'}); ${String(expectation.minPersonas)} expected`)

  // A typed `handoff` line counts whoever it is attributed to (the host stores it under the person who owns the mandate, and the transcript shows it
  // as the team's line); in a plain message the words must come from a persona.
  const handoffLines = transcript.lines.filter(line => line.type === 'handoff' || (HANDOFF.test(line.text) && personaSet.has(line.who))).length
  if (handoffLines === 0) findings.push('no visible handoff line ("passou/passei … para …") from a persona')

  // Positive proof of the handoff (Forge): every bilhete recorded must have reached the colleague's Ticket (`<bilhete>` in her assignment), and a handoff line
  // without any recorded bilhete means the note went nowhere.
  if (transcript.notes.length === 0) findings.push('no bilhete was recorded for any handoff (screen_doc kind "handoff" is empty)')
  for (const note of transcript.notes) {
    // A bilhete that was recorded but never reached the colleague is a defect of the PRODUCT's handoff, not a choice of the model: it is a problem, not a "did not collaborate".
    if (!note.colleagueReceived) harnessProblems.push(`the colleague never received the bilhete of "${note.title}" (${note.from} → ${note.to}): her Ticket carries no <bilhete>`)
  }

  let imageLineId: string | null = null
  const opinions: Array<{ who: string; mentions: string[] }> = []
  if (expectation.requireImage) {
    const imageIndex = transcript.lines.findIndex(line => line.attachments.some(name => IMAGE_NAME.test(name)))
    if (imageIndex < 0) {
      harnessProblems.push('no visible line carries an image attachment: the image never reached the team')
    } else {
      const imageLine = transcript.lines[imageIndex]!
      imageLineId = imageLine.id
      for (const line of transcript.lines.slice(imageIndex + 1)) {
        if (!personaSet.has(line.who) || line.who === imageLine.who) continue
        const mentions = mentionsOf(line.text)
        if (mentions.length > 0) opinions.push({ who: line.who, mentions })
      }
      if (!opinions.some(opinion => opinion.mentions.length >= 2)) {
        findings.push('no other persona described the image with at least two things it really shows (color/shape): a generic opinion does not prove the image was seen')
      }
    }
  }

  for (const line of transcript.lines) if (ENGINE_ERROR.test(line.text)) harnessProblems.push(`engine error visible in the thread (${line.id})`)
  for (const leak of transcript.leaks) harnessProblems.push(`LEAK-1: ${leak}`)
  // A review that could not run is a defect of the PRODUCT's plumbing (Bolt 07/11: the real CLI closes a turn with the placeholder report "turn ended", so the reviewer received
  // that instead of the author's text), never a choice of the model — so it is a problem of the run, not "did not collaborate".
  // A review that failed "in the engine" while the round's turn cap had been reached (the thread says so, or the ledger sits at the ceiling) did not fail: the harness's cap stopped the
  // reviewer from resuming (attempt 5: two questions of the reviewer to the person, answered by the harness, used the last turns). That is "ran out of turns" — a finding about the round's budget.
  const capReached = transcript.lines.some(line => TURN_CAP_LINE.test(line.text)) || (ledger !== undefined && ledger.turns >= expectation.ceilingTurns)
  let cutByCap = false
  for (const review of transcript.reviews) {
    if (review.failure === 'unreadable') harnessProblems.push(`the review of ${review.author}'s work could not read it (the reviewer got the placeholder "turn ended" instead of the author's text): the review note carries no text`)
    else if (review.failure === 'engine' && capReached) { cutByCap = true; findings.push(`ran out of turns: the review of ${review.author}'s work could not resume (the round's ${String(expectation.ceilingTurns)}-turn cap was reached): it has no seal`) }
    else if (review.failure === 'engine') harnessProblems.push(`the review of ${review.author}'s work failed in the reviewer's engine`)
  }

  // The three P0 of the real round of 07/11 (Atlas): a defect of the PRODUCT the person would read or hit, never a choice of the model — so a problem of the run, not "did not collaborate".
  //   P0-1 the receiving Tasks do not find the shared files (drafts on disk) or say a file does not exist; P0-2 the narration between tool calls reaches the thread/bilhete/review;
  //   P0-3 machine jargon ("ferramenta de shell") or a request to export a PNG. Text rules always; the files check only when the caller gave the attachment (`sharedFiles`).
  harnessProblems.push(...p0TextProblems(transcript))
  if (expectation.sharedFiles !== undefined) harnessProblems.push(...sharedFilesProblems(transcript, expectation.sharedFiles))

  // What the team really did (the four behaviors D-097 reads), counted from the database: bilhetes by kind, typed opinion lines, peer reviews and their seal.
  const behaviors = {
    passedForward: transcript.notes.filter(note => note.kind === 'next').length,
    askedHelp: transcript.notes.filter(note => note.kind === 'help').length,
    opinionLines: transcript.lines.filter(isOpinionLine).length,
    reviews: transcript.reviews.filter(review => review.reviewer !== review.author).length,
    // A seal by the author herself is not a peer review (Forge's observer calls it a false seal).
    seals: transcript.reviews.filter(review => review.sealed && review.reviewer !== review.author).length,
  }
  // The same reading as Forge's observer with `--any`: ANY collaboration counts — a request through ask_colleague/pass_forward, a round of opinion, or work SEALED by a peer review.
  if (behaviors.passedForward + behaviors.askedHelp + behaviors.opinionLines + behaviors.seals === 0) findings.push('não colaborou: nobody passed work forward, asked a colleague for help or opened a round of opinion (and no peer review sealed any work)')

  // Asking the PERSON is not collaborating, but it is the right move when the request lacks the facts (Atlas 07/11) and it explains why a round stopped: say it, as a note.
  const askedPerson = transcript.asks.length
  const answeredByHarness = expectation.answeredAsks ?? 0
  const notes: string[] = []
  if (askedPerson > 0) {
    notes.push(`the team asked the person ${String(askedPerson)} question(s) (${transcript.asks.map(ask => ask.who).filter((who, index, all) => all.indexOf(who) === index).join(', ')}): the RIGHT behavior for a request without facts, not a product failure; the harness answered ${String(answeredByHarness)} for her`)
    if (answeredByHarness === 0 && behaviors.passedForward + behaviors.askedHelp + behaviors.opinionLines + behaviors.seals === 0) notes.push('nobody answered the question, so the round could not go past it: nothing was measured about collaboration')
  }

  const problems = [...harnessProblems, ...findings]
  // `ran-out-of-turns`: the only finding is the cap cutting a review short — the team collaborated, the round's budget ended before everything was sealed.
  const onlyCap = cutByCap && findings.every(finding => finding.startsWith('ran out of turns'))
  const outcome: TeamRoundOutcome = problems.length === 0 ? 'passed' : harnessProblems.length > 0 ? 'harness-problem' : onlyCap ? 'ran-out-of-turns' : 'did-not-collaborate'
  return { passed: problems.length === 0, outcome, problems, harnessProblems, findings, notes, behaviors, facts: { turns, speakingPersonas: speaking, handoffLines, imageLineId, opinionsAboutImage: opinions, askedPerson, answeredByHarness } }
}

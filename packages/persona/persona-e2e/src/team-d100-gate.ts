/**
 * D-100 / PLAN D100-3 — the GATE of the Carbon's REVISÃO-01 for the poster round (TEAM-10), as a PURE reader of what a round left behind. Nothing here calls a model: the fake rehearsal
 * and the real round run it over the same transcript, so "green on the fake" means the same thing as "green on the real one".
 *
 * The gate (Keel 11/11, from the Carbon):
 *   1. at most 6 paid turns;
 *   2. at most 120 mil input tokens — the RAW total of the ledger (`inputTokens`, which INCLUDES the cache parts: the Carbon's text says "tokens de entrada totais" and cuts 469 mil → ~140 mil);
 *      the price-weighted total (fresh ×1, cache read ×0.1, cache write ×1.25) is MEASURED and reported next to it, never asserted;
 *   3. ONE final art (no second art by a collision of parts), and it carries Bia's text EXACTLY (same words and signs, no rewriting);
 *   4. Lia reviews that final art (her own draft holds the very same file), and her seal "Revisado por Lia" belongs to the ART's Task — not to Bia's text, which is what a
 *      delivery card showing "Revisado por Lia" would hide;
 *   5. 0 leak;
 *   6. nothing visible says "a pessoa", a raw "NOVA VERSÃO:" or RealTurnCapError.
 *
 * What it reads: the ledger, the drafts on disk (`TranscriptDraft`, svg text included), the bilhetes, the review records, the visible lines. Every check FAILS CLOSED (a piece that cannot be
 * read is a problem), and every rule was written against the real text of attempts 2–5 (`artifacts/team10/homes/real-attempt-*`): a persona's honest sentence must not be marked
 * ("uma pessoa", "pessoas") — `replay-guards-offline-before-paid-runs`.
 */
import { priceWeightedInput } from './team-round-guard.ts'
import type { DraftFile, TeamTranscript, TranscriptDraft } from './team-transcript.ts'

/** Ceiling of paid turns of the gate round. */
export const D100_MAX_TURNS = 6
/** Ceiling of RAW input tokens (cache parts included) of the gate round. */
export const D100_MAX_RAW_INPUT_TOKENS = 120_000

export interface D100GateOptions {
  /** The persona of the text part (default Bia): her words are the ones the art must carry. */
  readonly textPersona?: string
  /** The persona of the art part (default Téo). */
  readonly artPersona?: string
  /** The persona who reviews the final art (default Lia). */
  readonly reviewer?: string
  /** What the DELIVERY CARD in the thread shows as the seal ("Revisado por {name}"): `read` = the caller looked at a delivery card; `name` = who it names (absent = no seal on it). */
  readonly deliverySeal?: { readonly read: boolean; readonly name?: string }
}

export interface D100Check {
  readonly id: 'turns' | 'input' | 'one-art' | 'bia-text' | 'lia-reviews-art' | 'seal' | 'leak' | 'voice'
  readonly label: string
  readonly ok: boolean
  /** What was measured / found, in one line. */
  readonly detail: string
}

export interface D100Report {
  readonly ok: boolean
  /** One readable line per defect, each starting with `D100 <id>:`. */
  readonly problems: readonly string[]
  readonly checks: readonly D100Check[]
  readonly measures: {
    readonly turns: number | null
    readonly rawInputTokens: number | null
    readonly priceWeightedInputTokens: number | null
    readonly arts: readonly string[]
    readonly biaCopy: readonly string[]
    readonly biaCopyMissingInArt: readonly string[]
  }
}

// ── the voice (6) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * "a pessoa", "da pessoa", "à pessoa", "pela pessoa", "para a pessoa": the owner talked about in the third person (D-100: say "você" or the owner's name). NOT "uma pessoa", "outra
 * pessoa", "essa pessoa" (a word before the article's letter) and not "pessoas": `\b` rules them out.
 */
export const A_PESSOA = /\b(?:a|à|da|pela)\s+pessoa\b/iu
/** The host's marker of an opinion round, raw (uppercase, with the colon): the screen must show the new text, never the label. A sentence "a nova versão: …" in lowercase is prose. */
export const NOVA_VERSAO_CRU = /NOVA VERS[ÃA]O\s*:/u
/** The test limiter's error by name or code, which no person ever reads; the human sentence it carries ("o limite de execuções reais desta rodada foi atingido") is checked apart. */
export const CAP_ERROR_NAME = /RealTurnCapError|ledger_unavailable|ledger_corrupt|real-turn-cap/iu
export const CAP_SENTENCE = /limite de execuções reais/iu

export interface VoiceFinding {
  readonly where: string
  readonly rule: 'a pessoa' | 'NOVA VERSÃO: cru' | 'RealTurnCapError'
  readonly match: string
}

const around = (text: string, pattern: RegExp): string | undefined => {
  const match = pattern.exec(text)
  if (match === null) return undefined
  return text.slice(Math.max(0, match.index - 18), match.index + match[0].length + 18).replace(/\s+/gu, ' ').trim()
}

/** The voice rules over one piece of text. `spoken`: the text is said by a persona or the team (a host card with the cap sentence is the harness's, not a persona's). */
export function voiceFindingsIn(where: string, text: string, spoken: boolean): VoiceFinding[] {
  const found: VoiceFinding[] = []
  const pessoa = around(text, A_PESSOA)
  if (pessoa !== undefined) found.push({ where, rule: 'a pessoa', match: pessoa })
  const version = around(text, NOVA_VERSAO_CRU)
  if (version !== undefined) found.push({ where, rule: 'NOVA VERSÃO: cru', match: version })
  const cap = around(text, CAP_ERROR_NAME) ?? (spoken ? around(text, CAP_SENTENCE) : undefined)
  if (cap !== undefined) found.push({ where, rule: 'RealTurnCapError', match: cap })
  return found
}

/**
 * Everything a person (or a colleague) READS of the team: the lines of the thread written by a persona or typed by the team, the bilhetes (the Task's detail), the summaries of the
 * reviews, the questions put to the person and the titles of the Tasks. The person's own words are not the team's.
 */
export function voiceFindings(transcript: TeamTranscript): VoiceFinding[] {
  const out: VoiceFinding[] = []
  const personaSet = new Set(transcript.personas)
  for (const line of transcript.lines) {
    const own = (line.type === 'message' || line.type === 'runner') && !personaSet.has(line.who)
    if (own) continue
    out.push(...voiceFindingsIn(`line ${line.id} (${line.who})`, line.text, true))
  }
  for (const note of transcript.notes) {
    const where = `bilhete ${note.from} → ${note.to}`
    for (const item of [note.title, ...note.done, ...note.needed, ...note.decisions]) out.push(...voiceFindingsIn(where, item, true))
  }
  for (const review of transcript.reviews) out.push(...voiceFindingsIn(`review ${review.author} → ${review.reviewer}`, review.summary, true))
  for (const ask of transcript.asks) out.push(...voiceFindingsIn(`question ${ask.id} (${ask.who})`, [ask.question, ...ask.options].join(' '), true))
  for (const ticket of transcript.tickets) out.push(...voiceFindingsIn(`Task title "${ticket.title.slice(0, 40)}"`, ticket.title, true))
  return out
}

// ── Bia's text and the art's text (3) ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The labels a copywriter puts on the parts of a poster text ("Título: …", "Destaque: …"). A line with another label is not copy (it is "Entrega:", "Formato:", "Arquivo:"…). */
const COPY_LABELS = [
  'título', 'titulo', 'subtítulo', 'subtitulo', 'destaque', 'linha de apoio', 'apoio', 'chamada', 'cta', 'marca', 'rodapé', 'rodape', 'selo', 'headline', 'slogan', 'oferta',
  'frase', 'legenda', 'contato', 'dias', 'preço', 'preco', 'horário', 'horario',
]
const LABELED = new RegExp(String.raw`^(?:${COPY_LABELS.join('|')})\s*:\s*(.{3,160})$`, 'iu')
const QUOTED = /[“"«]([^“”"«»\n]{3,160})[”"»]/gu
/** A quoted thing that is a file or a path is not copy. */
const LOOKS_LIKE_FILE = /\.(?:svg|png|jpe?g|webp|gif|md|txt|json)\b|[\\/]/iu

/** The text the art must show, squashed for comparison: Unicode NFC, one quote/dash style, lowercase, NO whitespace ("Pão de queijo" + "em dobro!" in two lines = "Pão de queijo em dobro!"). */
export const squash = (text: string): string => text.normalize('NFC').replace(/[’‘]/gu, "'").replace(/[“”]/gu, '"').replace(/[–—]/gu, '-').replace(/\s+/gu, '').toLowerCase()

const stripQuotes = (value: string): string => value.trim().replace(/^[“"«'‘]+/u, '').replace(/[”"»'’]+$/u, '').trim()

/**
 * The poster text a persona delivered, line by line: the LABELED lines first ("**Título:** Pão de queijo em dobro!", `Título: "Pão…" | Destaque: "2 por R$ 9"`), and only when there is none, the quoted
 * segments that are not files. Markdown marks are dropped. The same text twice counts once.
 */
export function copyOf(text: string): string[] {
  const plain = text.replace(/\*\*|__|`/gu, '')
  const labeled: string[] = []
  for (const part of plain.split(/\r?\n|\s\|\s/u)) {
    const match = LABELED.exec(part.replace(/^[\s>*•\-\d.)]+/u, '').trim())
    if (match !== null) {
      const value = stripQuotes(match[1]!)
      if (value.length >= 3) labeled.push(value)
    }
  }
  const quoted = [...plain.matchAll(QUOTED)].map(match => (match[1] ?? '').trim()).filter(value => value.length >= 3 && !LOOKS_LIKE_FILE.test(value))
  const chosen = labeled.length > 0 ? labeled : quoted
  const seen = new Set<string>()
  return chosen.filter((value) => {
    const key = squash(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decodeEntities = (text: string): string => text
  .replace(/&#x([0-9a-f]+);/giu, (_all, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/gu, (_all, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
  .replace(/&([a-z]+);/giu, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)

/** The words an SVG shows: the content of every `<text>` (its `<tspan>`s included), in file order, entities decoded; comments and everything else are not shown. */
export function svgTextOf(svg: string): string {
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/gu, ' ')
  const out: string[] = []
  for (const match of withoutComments.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/giu)) out.push(decodeEntities((match[1] ?? '').replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim())
  return out.filter(item => item !== '').join(' ')
}

// ── the arts (3) and the review of the final art (4) ─────────────────────────────────────────────────────────────────────────────────────────
const ART_EXT = /\.(?:svg|png|jpe?g|webp|gif)$/iu
const base = (path: string): string => path.split('/').pop() ?? path
const stemOf = (path: string): string => base(path).replace(/\.[^.]+$/u, '').toLowerCase()
const isArtFile = (file: DraftFile): boolean => ART_EXT.test(file.path) && !file.path.replace(/\\/gu, '/').startsWith('inputs/')

interface ArtCopy { readonly ticketId: string; readonly file: DraftFile }

/** Every art file of every draft, by stem (the host's PNG of an SVG, and the copies a colleague receives, are the SAME art under the same stem). */
function artsByStem(drafts: readonly TranscriptDraft[]): Map<string, ArtCopy[]> {
  const out = new Map<string, ArtCopy[]>()
  for (const draft of drafts) {
    for (const file of draft.files) {
      if (!isArtFile(file)) continue
      const key = stemOf(file.path)
      out.set(key, [...(out.get(key) ?? []), { ticketId: draft.ticketId, file }])
    }
  }
  return out
}

/** Which persona owns each Task, as far as the transcript tells: both ends of every bilhete and the author of every review. */
function ticketOwners(transcript: TeamTranscript): Map<string, string> {
  const owners = new Map<string, string>()
  for (const note of transcript.notes) {
    if (note.fromTicketId !== undefined) owners.set(note.fromTicketId, note.from)
    if (note.colleagueTicketId !== null) owners.set(note.colleagueTicketId, note.to)
  }
  for (const review of transcript.reviews) if (review.author !== '?') owners.set(review.taskId, review.author)
  return owners
}

const clip = (text: string, max = 80): string => { const flat = text.replace(/\s+/gu, ' ').trim(); return flat.length > max ? `${flat.slice(0, max)}…` : flat }

/** The text Bia delivered: the labeled/quoted lines of her bilhete to the art persona; when it has none, of her final answer in the thread. */
function biaCopyOf(transcript: TeamTranscript, text: string, art: string): string[] {
  const passed = transcript.notes.filter(note => note.from === text && note.to === art && note.kind !== 'review')
  const fromNote = copyOf(passed.flatMap(note => [...note.done, ...note.decisions]).join('\n'))
  if (fromNote.length > 0) return fromNote
  const answers = transcript.lines.filter(line => line.who === text && line.type === 'runner')
  const last = answers[answers.length - 1]
  return last === undefined ? [] : copyOf(last.text)
}

/**
 * @param transcript - From `readTeamTranscript` of the round's home (the drafts on disk, with the svg text).
 * @param options - Who is the text/art/review persona, and what the delivery card shows as its seal.
 * @returns The gate's report: one check per item of the Carbon's list, the measures, and one readable problem per defect.
 */
export function evaluateD100Gate(transcript: TeamTranscript, options: D100GateOptions = {}): D100Report {
  const textPersona = options.textPersona ?? 'Bia'
  const artPersona = options.artPersona ?? 'Téo'
  const reviewer = options.reviewer ?? 'Lia'
  const checks: D100Check[] = []
  const add = (id: D100Check['id'], label: string, ok: boolean, detail: string): void => { checks.push({ id, label, ok, detail }) }

  // 1 + 2 — turns and input, measured both ways, the RAW one asserted.
  const ledger = transcript.ledger
  const turns = ledger?.turns ?? null
  const raw = ledger?.inputTokens ?? null
  const weighted = ledger === undefined ? null : Math.round(ledger.rows.reduce((sum, row) => sum + priceWeightedInput(row), 0))
  add('turns', `at most ${String(D100_MAX_TURNS)} paid turns`, turns !== null && turns >= 1 && turns <= D100_MAX_TURNS,
    turns === null ? 'no turn_ledger could be read' : `${String(turns)} paid turn(s)`)
  add('input', `at most ${String(D100_MAX_RAW_INPUT_TOKENS)} raw input tokens (cache included)`, raw !== null && raw <= D100_MAX_RAW_INPUT_TOKENS,
    raw === null ? 'no turn_ledger could be read' : `${String(raw)} raw input tokens (${String(weighted)} price-weighted: fresh ×1, cache read ×0.1, cache write ×1.25)`)

  // 3 — one final art, with Bia's text.
  const drafts = transcript.drafts ?? []
  const arts = artsByStem(drafts)
  const stems = [...arts.keys()].sort()
  const owners = ticketOwners(transcript)
  const reviewerTickets = new Set(transcript.notes.filter(note => note.kind === 'review' && note.colleagueTicketId !== null).map(note => note.colleagueTicketId!))
  const biaCopy: string[] = biaCopyOf(transcript, textPersona, artPersona)
  const missing: string[] = []
  let oneArtDetail: string
  let oneArtOk = false
  let finalStem: string | undefined
  let finalDraftSha: string | undefined
  if (drafts.length === 0) oneArtDetail = 'no draft could be read from disk: the art cannot be found'
  else if (stems.length === 0) oneArtDetail = 'no art file (svg/png/jpg/webp) outside inputs/ in any draft: the art part saved nothing'
  else if (stems.length > 1) oneArtDetail = `${String(stems.length)} different arts, not one: ${stems.join(', ')} (parts that collided each made its own)`
  else {
    finalStem = stems[0]!
    const svgCopies = (arts.get(finalStem) ?? []).filter(copy => /\.svg$/iu.test(copy.file.path))
    const authorCopies = svgCopies.filter(copy => !reviewerTickets.has(copy.ticketId))
    const owned = authorCopies.filter(copy => owners.get(copy.ticketId) === artPersona)
    const finals = owned.length > 0 ? owned : authorCopies
    const shas = new Set(finals.map(copy => copy.file.sha ?? copy.file.path))
    if (svgCopies.length === 0) oneArtDetail = `the art "${finalStem}" exists only as a raster file: its text cannot be read (the art is an SVG, D-099)`
    else if (shas.size > 1) oneArtDetail = `the final art "${finalStem}.svg" has ${String(shas.size)} different versions in ${String(finals.length)} drafts: there is no single final art`
    else {
      oneArtOk = true
      finalDraftSha = finals[0]?.file.sha ?? undefined
      oneArtDetail = `1 art: ${finalStem}.svg (${String(svgCopies.length)} copy/copies, same bytes in the author's draft)`
      const shown = squash(svgTextOf(finals[0]?.file.text ?? ''))
      for (const item of biaCopy) if (!shown.includes(squash(item))) missing.push(item)
    }
  }
  add('one-art', 'ONE final art', oneArtOk, oneArtDetail)
  const biaOk = oneArtOk && biaCopy.length > 0 && missing.length === 0
  add('bia-text', `the final art carries ${textPersona}'s text exactly`, biaOk,
    biaCopy.length === 0 ? `${textPersona}'s text could not be read (no labeled or quoted copy in her bilhete to ${artPersona} nor in her final answer): nothing to compare`
      : !oneArtOk ? 'not checked: there is no single final art'
        : missing.length > 0 ? `the art does not show: ${missing.map(item => `"${clip(item, 60)}"`).join(' · ')}` : `all ${String(biaCopy.length)} line(s) of ${textPersona}'s text are in the art`)

  // 4 — Lia reviews THAT art: the Task of the art was reviewed by her, and her draft holds the very same file.
  let reviewedOk = false
  let sealedOk = false
  let reviewDetail: string
  let sealDetail: string
  if (finalStem === undefined || !oneArtOk) {
    reviewDetail = 'not checked: there is no single final art'
    sealDetail = reviewDetail
  } else {
    const artCopies = arts.get(finalStem) ?? []
    const holders = new Set(artCopies.map(copy => copy.ticketId))
    const reviewNotes = transcript.notes.filter(note => note.kind === 'review' && note.to === reviewer && note.fromTicketId !== undefined && holders.has(note.fromTicketId))
    if (reviewNotes.length === 0) {
      reviewDetail = `${reviewer} never received the art "${finalStem}" to review (no review request to her from a Task that holds it)`
      sealDetail = `no review of the art, so no seal "Revisado por ${reviewer}" on it`
    } else {
      const sameFile = reviewNotes.find((note) => {
        const theirs = artCopies.find(copy => copy.ticketId === note.colleagueTicketId && /\.svg$/iu.test(copy.file.path))
        const authors = artCopies.find(copy => copy.ticketId === note.fromTicketId && /\.svg$/iu.test(copy.file.path))
        return theirs !== undefined && authors !== undefined && theirs.file.sha !== null && theirs.file.sha === authors.file.sha && (finalDraftSha === undefined || authors.file.sha === finalDraftSha)
      })
      reviewedOk = sameFile !== undefined
      reviewDetail = sameFile !== undefined
        ? `${reviewer} was handed the final art (her draft holds the same file as ${sameFile.from}'s)`
        : `${reviewer}'s review ran WITHOUT the final art in her draft, or on another version of it (${reviewNotes.length} review request(s) checked)`
      const record = transcript.reviews.find(review => review.reviewer === reviewer && reviewNotes.some(note => note.fromTicketId === review.taskId))
      sealedOk = reviewedOk && record !== undefined && record.sealed && record.failure === null
      sealDetail = record === undefined ? `no review record of the art Task by ${reviewer}`
        : !record.sealed ? `the review of the art by ${reviewer} has no seal (status ${record.status}, returned ${String(record.returns)}×${record.failure === null ? '' : `, failed: ${record.failure}`})`
          : `seal "Revisado por ${reviewer}" on the art Task`
      const card = options.deliverySeal
      if (sealedOk && card?.read === true && card.name !== reviewer) {
        sealedOk = false
        sealDetail = card.name === undefined ? `the delivery card in the thread shows no seal "Revisado por ${reviewer}"` : `the delivery card shows "Revisado por ${card.name}", not ${reviewer}`
      }
    }
  }
  add('lia-reviews-art', `${reviewer} reviews the final art`, reviewedOk, reviewDetail)
  add('seal', `seal "Revisado por ${reviewer}" on the art`, sealedOk, sealDetail)

  // 5 — no leak.
  add('leak', '0 leak', transcript.leaks.length === 0, transcript.leaks.length === 0 ? 'none' : `${String(transcript.leaks.length)}: ${transcript.leaks.slice(0, 3).map(leak => clip(leak, 90)).join(' · ')}`)

  // 6 — the voice.
  const voice = voiceFindings(transcript)
  const byRule = (rule: VoiceFinding['rule']): VoiceFinding[] => voice.filter(item => item.rule === rule)
  add('voice', 'no visible "a pessoa", raw "NOVA VERSÃO:" or RealTurnCapError', voice.length === 0,
    voice.length === 0 ? 'none' : (['a pessoa', 'NOVA VERSÃO: cru', 'RealTurnCapError'] as const).filter(rule => byRule(rule).length > 0).map(rule => `${rule} ×${String(byRule(rule).length)}: ${byRule(rule).slice(0, 2).map(item => `${item.where} — "${clip(item.match, 70)}"`).join(' · ')}`).join(' || '))

  const problems = checks.filter(check => !check.ok).map(check => `D100 ${check.id}: ${check.label} — ${check.detail}`)
  return { ok: problems.length === 0, problems, checks, measures: { turns, rawInputTokens: raw, priceWeightedInputTokens: weighted, arts: stems, biaCopy, biaCopyMissingInArt: missing } }
}

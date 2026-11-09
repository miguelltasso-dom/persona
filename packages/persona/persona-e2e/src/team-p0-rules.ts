/**
 * The three P0 of the real round of 07/11 (TEAM-10 attempt 4; Atlas read the transcript and held the delivery, Keel ordered them again 09/11), as PURE readers of what the person —
 * or a colleague — reads. Nothing here calls a model; the real round and the fake rehearsal both run them over the same transcript.
 *
 *   P0-1  SHARED FILES   every Task that receives work (the parts of the split, the colleague of a pass/help, the reviewer) must FIND, in its own draft and at the SAME relative path,
 *                        the request's attachment and every file the bilhete cites ("artes/x.svg"); nobody recreates a file because the colleague's one is not there, and nobody
 *                        says "o arquivo não existe". Evidence: the drafts on disk + the words of the persona + (fake) the stub's own look at its cwd (`team-draft-checks.ts`).
 *   P0-2  NARRATION      only the persona's FINAL answer reaches the thread / bilhete / review / opinion: never the monologue between tool calls ("Vou começar conferindo…",
 *                        "Nenhum arquivo de imagem no diretório…", two sentences glued with no space: "contém.Nenhum").
 *   P0-3  JARGON / PNG   no persona text talks about the machine ("não tenho ferramenta de shell nesta sessão", "Bash indisponível") and nobody asks anybody to export a PNG (the host turns
 *                        the SVG into a PNG by itself).
 *
 * The rules were written from the REAL text of attempt 4 (`artifacts/team10/real-attempt-4-*`) and replayed over the earlier real databases (attempts 2 and 3) and the fake runs, so a
 * persona's honest sentence is not marked (attempts 2 and 3 were spoiled by their own harness once: see `replay-guards-offline-before-paid-runs`). `team-p0-rules.spec.ts` keeps both
 * sides: the true defects and the sentences that must stay clean.
 */
import type { TeamTranscript } from './team-transcript.ts'

export type P0Rule = 'P0-1 missing-file' | 'P0-2 narration' | 'P0-3 jargon' | 'P0-3 png-request'

export interface P0Finding {
  readonly rule: P0Rule
  /** The words that matched, as read. */
  readonly match: string
}

const first = (text: string, pattern: RegExp): string | undefined => pattern.exec(text)?.[0]
/** The match with a few words around it, so a two-letter hit ("m.Ne") reads as what it is ("ele contém.Nenhum arquivo"). */
const withContext = (text: string, pattern: RegExp): string | undefined => {
  const match = pattern.exec(text)
  if (match === null) return undefined
  return text.slice(Math.max(0, match.index - 14), match.index + match[0].length + 14).replace(/\s+/gu, ' ')
}

// ── P0-2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** "Vou começar conferindo…", "Agora vou verificar", "Deixa eu ver", "Let me check": the persona announcing the next tool call. */
const INTENT = /\b(?:vou|vamos|deixa eu|deixe-me|deixe me|let me|i'll|i will)\s+(?:começar|comecar|verificar|conferir|checar|procurar|olhar|ler|listar|abrir|analisar|buscar|explorar|inspecionar|examinar|consultar|criar|salvar|gravar|escrever|fazer|ver|tentar|check|start|look|read|verify)\b/iu
/** What a tool returned, said aloud ("Nenhum arquivo de imagem no diretório de trabalho."). A final answer says "Nenhum arquivo foi alterado" — that is not matched (no place word). */
const TOOL_RESULT = /\bnenhum arquivo\b[^.\n]{0,40}\b(?:diret[oó]rio|pasta|projeto|rascunho)\b/iu
/**
 * Two sentences glued with no space ("contém.Nenhum", "amplamente.A pasta"): the signature of text blocks joined across a tool call. A lowercase letter (never a digit: "R$ 9.Peça"),
 * a closing mark or a backtick, then . ! ? and a capital that starts a word. Initials ("p.ex.") and file extensions (".SVG": two capitals) do not match.
 */
const GLUED = /[\p{Ll}`)"”’][.!?]\p{Lu}(?:\p{Ll}|\s)/u

export function narrationIn(text: string): P0Finding[] {
  const found: P0Finding[] = []
  for (const pattern of [INTENT, TOOL_RESULT]) {
    const match = first(text, pattern)
    if (match !== undefined) found.push({ rule: 'P0-2 narration', match })
  }
  const glued = withContext(text, GLUED)
  if (glued !== undefined) found.push({ rule: 'P0-2 narration', match: glued })
  return found
}

// ── P0-3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The machine talking: tools, shell, a session, a converter to install. */
const SHELL = /\bferramentas?\s+(?:de\s+|do\s+|da\s+)?(?:shell|bash|terminal|powershell|linha de comando|comandos?)\b|\bshell\b|\b(?:Bash|PowerShell)\b|\b(?:rsvg-convert|inkscape|imagemagick|magick)\b/iu
/** "Não tenho ferramenta …", "sem ferramenta de conversão", "ferramenta indisponível": a limit said in the vocabulary of the machine (D-099: a limit becomes a human sentence). */
const TOOL_LIMIT = /\b(?:n[ãa]o (?:tenho|h[aá])|sem|falta de)\s+(?:uma\s+|a\s+|nenhuma\s+)?ferramentas?\b|\bferramentas?\b[^.!?\n]{0,30}\b(?:indispon[ií]vel|n[ãa]o (?:est[aá] )?dispon[ií]vel)\b/iu
/** A PNG as a word of its own (never the end of a file name: "foto.png", "cartaz-4x5.png"). */
const PNG = String.raw`(?<![\w./\\-])PNG(?![\w])`
/** Asking somebody to export / convert / send a PNG, or saying one is missing: the host converts the SVG by itself. */
const PNG_REQUEST = new RegExp(
  String.raw`\b(?:export\w*|convert\w*|converta\w*|me (?:manda|envia|passa)|pode (?:me )?(?:mandar|enviar|passar))\b[^.!?\n]{0,60}${PNG}`
  + String.raw`|${PNG}[^.!?\n]{0,50}\b(?:export\w*|convert\w*)\b`
  + String.raw`|\b(?:preciso|precisa|falta|faltou|pe[cç]o|pedi)\b[^.!?\n]{0,40}${PNG}`,
  'iu',
)

export function jargonIn(text: string): P0Finding[] {
  const found: P0Finding[] = []
  for (const pattern of [SHELL, TOOL_LIMIT]) {
    const match = first(text, pattern)
    if (match !== undefined) found.push({ rule: 'P0-3 jargon', match })
  }
  const png = first(text, PNG_REQUEST)
  if (png !== undefined) found.push({ rule: 'P0-3 png-request', match: png })
  return found
}

/**
 * The persona-facing text (a tool description or the prompt of an art turn) must SAY that the app makes the PNG of an SVG by itself — Atlas's fix for P0-3, so nobody asks a colleague
 * to export one. English or Portuguese: "the host turns it into a PNG by itself", "never ask anyone to export a PNG", "o app gera o PNG sozinho", "nunca peça o PNG".
 */
const PNG_ASSURANCE = new RegExp(
  String.raw`PNG[^.\n]{0,120}(?:by itself|automatically|on its own|sozinh[oa]|autom[aá]tic)|(?:by itself|automatically|sozinh[oa]|autom[aá]tic)[^.\n]{0,120}PNG|never ask (?:anyone|a colleague)[^.\n]{0,30}PNG|nunca pe[cç]a[^.\n]{0,40}PNG`,
  'iu',
)

export const pngAssuranceIn = (text: string): boolean => PNG_ASSURANCE.test(text)

// ── P0-1 (the symptom, in the persona's own words) ─────────────────────────────────────────────────────────────────────────────────────────
/** "o arquivo … não existe no diretório de trabalho atual", "O arquivo citado no bilhete não existia", "não há `foto.png`", "não achei a foto". */
const MISSING = [
  /\b(?:arquivo|imagem|foto|svg|png|cartaz)\b[^.!?\n]{0,100}\bn[ãa]o (?:existe|existia|foi encontrad[oa]|encontrei|achei)\b/iu,
  /\bn[ãa]o h[aá]\s[^.!?\n]{0,40}(?:foto\.png|\.(?:svg|png|jpe?g)\b|arquivo)/iu,
  /\bn[ãa]o (?:achei|encontrei|consegui (?:ler|abrir|achar|encontrar))\b[^.!?\n]{0,60}\b(?:arquivo|foto|imagem|svg|png)\b/iu,
]

export function missingFileIn(text: string): P0Finding[] {
  const found: P0Finding[] = []
  for (const pattern of MISSING) {
    const match = first(text, pattern)
    if (match !== undefined) found.push({ rule: 'P0-1 missing-file', match })
  }
  return found
}

/** Everything the text rules say about one piece of text. */
export function p0TextFindings(text: string): P0Finding[] {
  return [...missingFileIn(text), ...narrationIn(text), ...jargonIn(text)]
}

const clip = (text: string, max = 90): string => (text.length > max ? `${text.slice(0, max)}…` : text.replace(/\s+/gu, ' '))

/**
 * The text rules over everything a person or a colleague READS of the team: the lines of the thread written by a persona or typed by the team (handoff, review, opinion), the bilhete
 * of every handoff (done / needed / files / decisions and its title), the summary of a review, the questions put to the person and the titles of the Tasks. The person's own lines and
 * the host's cards of the day (`dailyBrief`) are not persona text.
 * @returns One readable problem per (place, rule).
 */
export function p0TextProblems(transcript: TeamTranscript): string[] {
  const out = new Set<string>()
  const add = (where: string, text: string): void => {
    if (text.trim() === '') return
    for (const finding of p0TextFindings(text)) out.add(`${finding.rule}: ${where} — "${clip(finding.match)}"`)
  }
  const personaSet = new Set(transcript.personas)
  for (const line of transcript.lines) {
    if (line.type === 'dailyBrief') continue
    if (line.type === 'message' || line.type === 'runner') { if (!personaSet.has(line.who)) continue } // the person's own words are not the team's
    add(`line ${line.id} (${line.who})`, line.text)
  }
  for (const note of transcript.notes) {
    const where = `bilhete ${note.from} → ${note.to}`
    add(`${where} (title)`, note.title)
    for (const item of [...note.done, ...note.needed, ...note.decisions]) add(where, item)
    // The file list is paths: only the machine's vocabulary applies, never "the file does not exist" (a path is not a sentence).
    for (const item of note.files) for (const finding of [...narrationIn(item), ...jargonIn(item)]) out.add(`${finding.rule}: ${where} (files) — "${clip(finding.match)}"`)
  }
  for (const review of transcript.reviews) add(`review ${review.author} → ${review.reviewer}`, review.summary)
  for (const ask of transcript.asks) add(`question ${ask.id} (${ask.who})`, [ask.question, ...ask.options].join(' '))
  for (const ticket of transcript.tickets) add(`Task title "${clip(ticket.title, 40)}"`, ticket.title)
  return [...out]
}

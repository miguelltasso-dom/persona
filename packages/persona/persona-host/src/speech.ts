/**
 * How a persona speaks in the thread (harvest item 4: simple speech by default, technical detail folded, the right to stay silent).
 * Pure functions, no model call: the rules go into the cached prompt prefix as one constant paragraph, and what the model writes
 * is shaped here before it reaches the thread, so a model that ignores the rule still cannot put a path, a code or a raw marker
 * in front of the owner.
 *
 * - SIMPLE (the default): the visible text keeps what happened and what the owner must decide. A sentence that carries a folder
 *   path, an error code, a hash, a JSON key or a tool name moves into ONE `<details>` block at the end (a native fold in the
 *   client). A numbered step the owner must follow is never folded.
 * - SILENCE: a run may answer with {@link PASS_TOKEN} when it has nothing to add. The token is never shown, anywhere: a reply that
 *   is only the token is a pass, a token next to real text is dropped and the text stays, and a half-typed token never flashes in a
 *   streaming bubble.
 * - OWNER VOCABULARY: "a pessoa" / "o usuário" are the engine's words for the human, not a colleague's. They are said "você".
 */

/** The speech register an owner chose; `simple` until said otherwise. */
export type SpeechStyle = 'simple' | 'technical'

/** What a run answers with to stay quiet. Ours; every spelling a model may produce instead is read by {@link readPass}. */
export const PASS_TOKEN = '[[passar-a-vez]]'

/** Label of the fold. */
export const DETAILS_LABEL = 'Detalhes'

/** What stands in front of a fold when every sentence of a reply was technical. */
export const DETAILS_LEAD = 'Os detalhes técnicos estão logo abaixo.'

/** What a person's message gets when the run chose silence anyway (D-079: a person's message is never left without a line). */
export const PASSED_LINE = 'Li sua mensagem e não tenho nada a acrescentar agora.'

/** What a Task ends with when its run chose silence: a Task always closes with one short line (the board and the review read it). */
export const QUIET_TASK_LINE = 'Sem novidades por aqui.'

/** The channel cap for what is visible, and the separate cap for what is folded. */
export const VISIBLE_WORD_LIMIT = 100
export const DETAILS_WORD_LIMIT = 300

/**
 * The paragraph every prompt that speaks to the owner carries. One constant per style so the prompt prefix stays cache-stable.
 * @param style - The owner's choice.
 * @returns The rule, in pt-BR.
 */
export function speechRules(style: SpeechStyle = 'simple'): string {
  if (style === 'technical') {
    return 'Como falar com o dono: ele prefere o detalhe técnico, então pode citar caminhos, códigos e nomes de ferramenta no texto. Trate-o por “você” (nunca “a pessoa” nem “o usuário”) e sem título de relatório. O que acompanha um pedido de aprovação continua simples.'
  }
  return 'Como falar com o dono: abra com o que aconteceu e, se houver, o que cabe a ele decidir, em 1 ou 2 frases do dia a dia. Trate-o por “você” (nunca “a pessoa” nem “o usuário”). Sem título de relatório (Entrega:, Decisões que tomei:, O que não fiz:). Sem caminho de pasta, código de erro, hash, JSON nem nome de ferramenta no texto. Se ele precisa fazer algo, diga em passos numerados curtos. Detalhe técnico só se ajudar a decidir, no fim, dentro de <details><summary>Detalhes</summary>…</details>.'
}

/**
 * The paragraph for a run that is allowed to stay quiet (a run nobody asked by name and no person waits on).
 * @returns The rule, in pt-BR.
 */
export function passRule(): string {
  return `Se não há nada a acrescentar (já foi respondido, é só um “ok” ou “obrigado”, ou não é com você), responda só ${PASS_TOKEN}. Nunca explique o silêncio.`
}

/**
 * The whole speech layer of a prompt prefix: the owner's register, and the permission to stay silent when nobody is waiting.
 * Constant per (style, canPass), so the prefix stays cache-stable.
 * @param style - The owner's register.
 * @param canPass - The run may answer with the pass token.
 */
export function speechLayer(style: SpeechStyle, canPass: boolean): string {
  return canPass ? `${speechRules(style)} ${passRule()}` : speechRules(style)
}

// ---- silence -------------------------------------------------------------------------------------------------------------------

/** Every spelling of "I pass" a model produces; the part between the brackets. Spaces, dashes and underscores are interchangeable. */
const PASS_WORDS = String.raw`(?:passar[\s_-]*a[\s_-]*vez|passo[\s_-]*a[\s_-]*vez|passei[\s_-]*a[\s_-]*vez|pass|no[\s_-]*reply|no[\s_-]*response|sem[\s_-]*resposta|sil[eê]ncio|silent|nada[\s_-]*a[\s_-]*acrescentar)`
const BRACKETED = String.raw`(?:\[{1,2}|<|\(|\{\{)\s*${PASS_WORDS}\s*(?::[^\]\n>)}]{0,200})?\s*\/?\s*(?:\]{1,2}|>|\)|\}\})`
const TOKEN_ANYWHERE = new RegExp(BRACKETED, 'giu')
const TICK = '`'
const TOKEN_FIRST = new RegExp(String.raw`^[\s${TICK}"'*_]*(?:${BRACKETED}|no[_-]?reply\b|passar-a-vez\b)`, 'iu')
const BARE_ONLY = /^[\s`"'*_([<]*(?:no[_-]?reply|passar-a-vez)[\s`"'*_.)\]>]*$/iu
const FILLER = /[\s`"'*_.:;,!?()[\]<>~-]+/gu
const REASON_LIMIT = 300

/** What {@link readPass} found. */
export interface PassRead {
  /** The run chose silence: say nothing. */
  readonly passed: boolean
  /** The text with every token removed (empty when passed). */
  readonly text: string
}

/**
 * Read a run's output for the right to stay silent. Never loses real text: a token beside an answer is only dropped.
 * @param raw - What the model wrote.
 */
export function readPass(raw: string): PassRead {
  if (BARE_ONLY.test(raw)) return { passed: true, text: '' }
  const without = raw.replace(TOKEN_ANYWHERE, ' ')
  if (without === raw && !TOKEN_FIRST.test(raw)) return { passed: false, text: raw }
  const rest = without.replace(FILLER, '')
  if (rest === '') return { passed: true, text: '' }
  // The token opens the output and what follows is a short reason: the decision was to pass; the reason is not for the thread.
  if (TOKEN_FIRST.test(raw) && raw.replace(TOKEN_FIRST, '').trim().length <= REASON_LIMIT) return { passed: true, text: '' }
  return { passed: false, text: tidy(without.replace(TOKEN_FIRST, '')) }
}

function tidy(text: string): string {
  return text.replace(/[ \t]{2,}/gu, ' ').replace(/ +([.,;:!?])/gu, '$1').replace(/\n{3,}/gu, '\n\n').trim()
}

const MAYBE_TOKEN = /^\s*(?:\[{1,2}|<|\(|\{\{)[^\]\n>)}]{0,60}$/u
const BARE_PREFIXES = ['no_reply', 'no-reply', 'noreply', 'passar-a-vez']

/**
 * The part of a streaming reply that is safe to show: complete tokens are removed, and while the text could still turn into a token
 * (an open bracket, a half-typed `NO_REPLY`) nothing is shown, so a silent reply never opens a bubble.
 * @param partial - Cumulative text so far.
 * @returns What the bubble may show (empty: show nothing yet).
 */
export function streamSafe(partial: string): string {
  const read = readPass(partial)
  if (read.passed) return ''
  // A `<details` or `<summary` tag still being typed never shows as raw text at the end of the bubble.
  const text = read.text.replace(/<\/?[a-z]{0,8}$/iu, '')
  const lead = text.trimStart().toLowerCase()
  if (MAYBE_TOKEN.test(text)) return ''
  if (lead.length >= 2 && lead.length <= 12 && BARE_PREFIXES.some(prefix => prefix.startsWith(lead) && lead !== prefix)) return ''
  return text
}

// ---- owner vocabulary -----------------------------------------------------------------------------------------------------------

/** After "a pessoa" these words mean a third party or a description ("a pessoa que ligou"): not the owner. */
const NOT_OWNER = String.raw`(?!\s+(?:que|cujo|cuja|quem|de|do|da|dos|das|com|certa|errada|responsável|dona|dono|indicada|interessada|em|ao|a quem)\b)`

function sentenceCase(from: string, to: string): string {
  return /^\p{Lu}/u.test(from) ? `${to.charAt(0).toUpperCase()}${to.slice(1)}` : to
}

const POSSESSIVE: Readonly<Record<string, string>> = { a: 'sua', as: 'suas', o: 'seu', os: 'seus' }

/**
 * "a pessoa" is how the engine names the human; a colleague says "você". Conservative: a description of a third party stays.
 * @param text - What a persona wrote.
 */
export function speakToOwner(text: string): string {
  return text
    .replace(new RegExp(String.raw`\b(d|n|pel)?(a|as|o|os) ([\p{L}-]{3,}) d(?:a|o) (?:pessoa|usuário)\b${NOT_OWNER}`, 'giu'), (_m, glue: string | undefined, article: string, noun: string) => `${glue ?? ''}${article} ${POSSESSIVE[article.toLowerCase()] ?? 'seu'} ${noun}`)
    .replace(new RegExp(String.raw`\bpel[ao] (?:pessoa|usuário)\b${NOT_OWNER}`, 'giu'), match => sentenceCase(match, 'por você'))
    .replace(new RegExp(String.raw`\b(para|pra|com|sem|sobre|contra|entre) (?:a pessoa|o usuário)\b${NOT_OWNER}`, 'giu'), (_m, prep: string) => `${prep} você`)
    .replace(new RegExp(String.raw`\b(?:à pessoa|ao usuário)\b${NOT_OWNER}`, 'giu'), match => sentenceCase(match, 'a você'))
    .replace(new RegExp(String.raw`\bd(?:a|o) (?:pessoa|usuário)\b${NOT_OWNER}`, 'giu'), match => sentenceCase(match, 'de você'))
    .replace(new RegExp(String.raw`\b(?:a pessoa|o usuário)\b${NOT_OWNER}`, 'giu'), match => sentenceCase(match, 'você'))
}

// ---- simple speech: what is folded ---------------------------------------------------------------------------------------------

const TECHNICAL: readonly RegExp[] = [
  /\b[A-Za-z]:\\[^\s"'`<>|]+/u, // C:\Users\x\file
  /(?<![\w:/.-])(?:~|\.{1,2})?\/(?:[\w.@-]+\/)+[\w.@-]+/u, // /home/x/y, ./src/a, ~/dir/f
  /(?<![\w:/.-])(?:src|packages|apps|lib|dist|build|node_modules|inputs|outputs|tmp|AppData|\.git)\/[\w./@-]+/iu,
  /\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|lock|sql|db|sqlite|py|rs|go|java|cs|sh|ps1|bat|log|env|ini)\b/iu, // a code file, never a deliverable (png, pdf, svg, docx…)
  /:\d+:\d+\b|\bat\s+[\w.<>$]+\s+\([^)]*:\d+/u, // file:line:col, a stack frame
  /\b(?:Traceback|Stack ?trace)\b/iu,
  /\bE(?:NOENT|PERM|ACCES|EXIST|BUSY|NOTFOUND|CONNREFUSED|CONNRESET|TIMEDOUT|ADDRINUSE|PIPE|MFILE|ISDIR|NOTDIR)\b|\bERR_[A-Z_]+\b/u,
  /\bHTTP\s?[1-5]\d\d\b|\b(?:status(?: code)?|código(?: de erro)?|erro|error)\s*[:#]?\s*[45]\d\d\b/iu,
  /\b[A-Z][A-Za-z]+(?:Error|Exception)\b/u, // RealTurnCapError, TypeError
  /\bexit(?:ed)?\s+(?:with\s+)?code\s+\d+|\bcódigo de saída\s+\d+/iu,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/u, // a git hash
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu, // a uuid
  /"[A-Za-z_][\w-]*"\s*:\s*[["{\d]|^\s*[{[]\s*"/mu, // a JSON key
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u, // pass_forward, persona_ask
  /\bmcp__\w+/u,
  /(?:^|\s)--[a-z][\w-]+\b/u, // a CLI flag
  /\b(?:npm|pnpm|yarn|git|npx|curl|powershell)\s+[\w@./:-]+/iu, // a shell command
]

const LIST_LINE = /^\s*(?:[-*+]|\d{1,2}[.)])\s+\S/u
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/u
/** Report headings a model copies from its prompt: the audit trail belongs in the fold, not in the thread. */
const AUDIT_LINE = /^\s*(?:[-*]\s+)?\**\s*(?:Decisões que tomei|O que fiz(?: nesta rodada)?|O que não fiz(?: e por quê)?|Opinião do time|Riscos|Notas? internas?)\s*:\s*\**/iu
/** Headings that only label the sentence that follows: the label goes, the sentence stays. */
const LABEL_ONLY = /^(\s*(?:[-*]\s+)?)\**\s*(?:Entrega|Resumo|Resultado|Próximos passos|Próximo passo)\s*:\s*\**\s*/iu
const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[\p{Lu}\d"“(\[])/u

/** Whether a sentence carries something only a developer reads. */
export function isTechnical(sentence: string): boolean {
  return TECHNICAL.some(pattern => pattern.test(sentence))
}

/** The tokens that read as code inside the fold: a path, a code file, a hash, an error code, a tool name, a flag. */
const CODE_TOKENS: readonly RegExp[] = [
  /\b[A-Za-z]:\\[^\s"'`<>|]+/gu,
  /(?<![\w:/.-])(?:~|\.{1,2})?\/(?:[\w.@-]+\/)+[\w.@-]+/gu,
  /(?<![\w:/.-])(?:src|packages|apps|lib|dist|build|node_modules|inputs|outputs|tmp|AppData|\.git)\/[\w./@-]+/giu,
  /\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|lock|sql|db|sqlite|py|rs|go|java|cs|sh|ps1|bat|log|env|ini)\b/giu,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gu,
  /\bE(?:NOENT|PERM|ACCES|EXIST|BUSY|NOTFOUND|CONNREFUSED|CONNRESET|TIMEDOUT|ADDRINUSE|PIPE|MFILE|ISDIR|NOTDIR)\b|\bERR_[A-Z_]+\b/gu,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu,
  /(?<=^|\s)--[a-z][\w-]+\b/gu,
]

function wrapCodeTokens(text: string): string {
  const ranges: Array<[number, number]> = []
  for (const pattern of CODE_TOKENS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
    }
  }
  if (ranges.length === 0) return text
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last !== undefined && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  let out = ''
  let at = 0
  for (const [start, rawEnd] of merged) {
    let end = rawEnd
    while (end > start && /[.,;:)\]]/u.test(text.charAt(end - 1))) end -= 1 // a sentence's own punctuation is not part of the path
    if (end <= start) continue
    out += `${text.slice(at, start)}\`${text.slice(start, end)}\``
    at = end
  }
  return out + text.slice(at)
}

/**
 * Put the paths, codes and tool names of a folded sentence between backticks, so the client draws them as code (mono, on the wash). What is
 * already between backticks is left as it is.
 * @param text - A sentence that moved into the fold.
 */
export function codeify(text: string): string {
  return text.split(/(`[^`]*`)/u).map((part, index) => (index % 2 === 1 ? part : wrapCodeTokens(part))).join('')
}

interface Fold {
  readonly visible: string[]
  readonly details: string[]
}

function foldLines(lines: readonly string[], style: SpeechStyle): Fold {
  const visible: string[] = []
  const details: string[] = []
  let fence: string | undefined
  let block: string[] = []
  for (const line of lines) {
    const opened = FENCE_LINE.exec(line)
    if (fence !== undefined) {
      block.push(line)
      if (opened !== null && opened[1]?.startsWith(fence.charAt(0)) === true && (opened[1]?.length ?? 0) >= fence.length) {
        // A code block is for a developer: it folds in the simple register and stays where it is in the technical one.
        if (style === 'simple') details.push(block.join('\n'))
        else visible.push(...block)
        fence = undefined
        block = []
      }
      continue
    }
    if (opened !== null) {
      fence = opened[1] ?? '```'
      block = [line]
      continue
    }
    if (AUDIT_LINE.test(line)) {
      details.push(codeify(line.replace(AUDIT_LINE, '').trim()))
      continue
    }
    const text = line.replace(LABEL_ONLY, '$1')
    if (style === 'technical' || LIST_LINE.test(text) || text.trim() === '') {
      visible.push(text)
      continue
    }
    const kept: string[] = []
    for (const sentence of text.split(SENTENCE_SPLIT)) {
      if (isTechnical(sentence)) details.push(codeify(sentence.trim()))
      else kept.push(sentence)
    }
    visible.push(kept.join(' '))
  }
  if (fence !== undefined) {
    if (style === 'simple') details.push(block.join('\n'))
    else visible.push(...block)
  }
  return { visible, details }
}

// ---- the fold in the text ------------------------------------------------------------------------------------------------------

const DETAILS_BLOCK = /<details\b[^>]*>([\s\S]*?)(?:<\/details\s*>|$)/giu
const SUMMARY_TAG = /<summary\b[^>]*>[\s\S]*?<\/summary\s*>/iu
const STRAY_TAG = /<\/?(?:details|summary)\b[^>]*>/giu

/** What a text is made of once its folds are taken out. */
export interface SplitSpeech {
  readonly visible: string
  /** The inside of every `<details>` block (the summary line excluded), in order. */
  readonly details: readonly string[]
}

/**
 * Take the `<details>` blocks out of a text (an unclosed one runs to the end, as a streaming reply does).
 * @param text - A reply.
 */
export function splitDetails(text: string): SplitSpeech {
  const details: string[] = []
  const visible = text
    .replace(DETAILS_BLOCK, (_match, inner: string) => {
      const body = inner.replace(SUMMARY_TAG, '').replace(STRAY_TAG, '').trim()
      if (body !== '') details.push(body)
      return '\n'
    })
    .replace(STRAY_TAG, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  return { visible, details }
}

function wordsOf(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/u).length
}

function capWords(text: string, limit: number): string {
  if (wordsOf(text) <= limit) return text.trim()
  // Keep the line breaks of what is kept: a folded stack trace or table is read by line.
  let left = limit
  const out: string[] = []
  for (const line of text.trim().split('\n')) {
    const words = line.trim() === '' ? [] : line.trim().split(/\s+/u)
    if (words.length === 0) { out.push(''); continue }
    if (words.length >= left) { out.push(words.slice(0, left).join(' ')); break }
    out.push(line.trimEnd())
    left -= words.length
  }
  return out.join('\n').trim()
}

/**
 * Put a fold back after the visible text.
 * @param visible - The visible part.
 * @param details - Folded bodies (merged into one block).
 * @param lead - Visible text to use when there is none.
 */
export function composeSpeech(visible: string, details: readonly string[], lead: string = DETAILS_LEAD): string {
  const folded = capWords(details.filter(item => item.trim() !== '').join('\n\n'), DETAILS_WORD_LIMIT)
  if (folded === '') return visible.trim()
  const head = visible.trim() === '' ? lead : visible.trim()
  return `${head}\n\n<details><summary>${DETAILS_LABEL}</summary>\n\n${folded}\n\n</details>`
}

// ---- the host's structured markers ---------------------------------------------------------------------------------------------

/** A complete marker, or one still arriving (not closed yet: a reply that is streaming). */
const MARKER_SPAN = /\[\[(?:escolha|indicador):[\s\S]*?\]\]|\[\[(?:escolha|indicador):(?:(?!\]\])[\s\S])*$/giu

/**
 * Take the structured markers out of a text: `[[escolha: …]]` (the choice card) and `[[indicador: {json}]]` (a number to pin). They are NOT prose: they stay in the
 * message body for the host to read (`readChoiceMarker` / `readIndicatorMarker`), so the speech layer must neither fold their JSON or file names as "technical",
 * nor count their words in the 100, nor cut one in the middle (an unclosed marker makes the reader drop the whole card as "still arriving"). (S1 P1-06)
 * @param text - A reply.
 * @returns The text without them, and the markers as written (a text with none comes back untouched).
 */
export function takeMarkers(text: string): { readonly prose: string; readonly markers: readonly string[] } {
  if (!/\[\[(?:escolha|indicador):/iu.test(text)) return { prose: text, markers: [] }
  const markers: string[] = []
  const prose = text.replace(MARKER_SPAN, (found) => { markers.push(found.trim()); return '\n' }).replace(/\n{3,}/gu, '\n\n').trim()
  return { prose, markers }
}

/**
 * Put the markers back where a persona writes them: at the end of the message, after the words and after any fold.
 * @param text - The shaped reply.
 * @param markers - What {@link takeMarkers} took.
 */
export function putMarkers(text: string, markers: readonly string[]): string {
  return markers.length === 0 ? text : [text.trim(), ...markers].filter(part => part !== '').join('\n\n')
}

/**
 * The 100-word channel cap for a reply that may carry a fold: the visible part is capped as before, the fold keeps its own cap. The structured markers
 * ({@link takeMarkers}) are kept whole and are not counted.
 * @param value - A reply.
 * @param clipVisible - The channel clip used for plain text.
 */
export function clipSpeech(value: string, clipVisible: (text: string) => string): string {
  const { prose, markers } = takeMarkers(value)
  if (!/<details\b/iu.test(prose)) return putMarkers(clipVisible(prose), markers)
  const { visible, details } = splitDetails(prose)
  return putMarkers(composeSpeech(visible === '' ? '' : clipVisible(visible), details), markers)
}

// ---- the whole shape ---------------------------------------------------------------------------------------------------------

/** What {@link shapeSpeech} decided. */
export interface Spoken {
  /** The text for the thread (empty when `passed`). */
  readonly text: string
  /** The run chose silence. */
  readonly passed: boolean
  /** Some sentence moved into the fold. */
  readonly folded: boolean
}

/** Options of {@link shapeSpeech}. */
export interface ShapeOptions {
  readonly style?: SpeechStyle
  /** The person's last line: a reply that starts by echoing it loses the echo. */
  readonly userText?: string
  /** The channel clip for the visible prose (the engine's lean reply: echo, narration, cap). */
  readonly lean?: (text: string, userText: string) => string
}

/**
 * The visible text with its structure kept: paragraphs stay paragraphs and a numbered step stays a line. Prose runs go through the
 * channel's lean reply (echo, narration, hedge, cap) one run at a time; a list run is the owner's steps and is left as written.
 */
function leanKeepingStructure(text: string, userText: string, lean: (text: string, userText: string) => string): string {
  let first = true
  const blocks = text.split(/\n\s*\n/u).map((block) => {
    const runs: string[][] = []
    for (const line of block.split('\n')) {
      const isList = LIST_LINE.test(line)
      const last = runs[runs.length - 1]
      if (last !== undefined && LIST_LINE.test(last[0] ?? '') === isList) last.push(line)
      else runs.push([line])
    }
    return runs.map((run) => {
      if (LIST_LINE.test(run[0] ?? '')) return run.map(line => line.trimEnd()).join('\n')
      const said = lean(run.join('\n'), first ? userText : '')
      first = false
      return said
    }).filter(part => part.trim() !== '').join('\n')
  }).filter(block => block.trim() !== '')
  return capWords(blocks.join('\n\n'), VISIBLE_WORD_LIMIT)
}

/**
 * Everything between the model's words and the thread: silence, the owner's vocabulary, the fold, the cap.
 * @param raw - What the model wrote.
 * @param options - Register, the person's line, the channel clip.
 */
export function shapeSpeech(raw: string, options: ShapeOptions = {}): Spoken {
  const style = options.style ?? 'simple'
  const userText = options.userText ?? ''
  const pass = readPass(raw)
  if (pass.passed) return { text: '', passed: true, folded: false }
  // S1 P1-06: the structured markers are the host's, not prose: they leave before the speech rules and come back after them.
  const { prose: unmarked, markers } = takeMarkers(pass.text)
  const owned = speakToOwner(unmarked.replace(/\r\n?/gu, '\n'))
  const split = splitDetails(owned)
  const fold = foldLines(split.visible.split('\n'), style)
  const prose = fold.visible.join('\n').replace(/\n{3,}/gu, '\n\n').trim()
  const lean = options.lean ?? ((text: string): string => text.trim())
  const structured = fold.visible.some(line => LIST_LINE.test(line)) || /\n\s*\n/u.test(prose)
  const clipped = prose === '' ? '' : structured ? leanKeepingStructure(prose, userText, lean) : lean(prose, userText)
  const details = [...split.details, ...fold.details]
  return { text: putMarkers(composeSpeech(clipped, details), markers), passed: false, folded: fold.details.length > 0 }
}

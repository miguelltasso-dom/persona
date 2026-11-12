/**
 * Item 7 (colheita): the line the HOST writes, with ZERO model tokens, when the owner talks to a persona (or a team) that is in the
 * middle of a task: how long it has been going and what the step is right now. Pure text rules; the host feeds the facts.
 *
 * Honest by construction: the time comes from the Assignment's own `startedAt`, the step from the last tool the turn really called, and a
 * tool this file does not know is NOT named (no step is claimed rather than an invented one). Plain Portuguese: no tool names, paths or ids.
 */

/** Words that may surround a status question without making it a request ("e aí, como tá indo, hein?"). */
const FILLER = new Set([
  'e', 'ai', 'entao', 'oi', 'ola', 'ei', 'hein', 'ne', 'pessoal', 'por', 'favor', 'pf', 'so', 'me', 'diz', 'diga', 'fala', 'conta',
  'aqui', 'la', 'agora', 'ja', 'mesmo', 'de', 'novo', 'bom', 'dia', 'boa', 'tarde', 'noite',
])

/** The question itself, whole (after the filler words are taken out). Anchored: a message with anything else in it is NOT a status ask. */
const STATUS_CORE: readonly RegExp[] = [
  /^como (?:esta|ta|anda|vai) (?:indo|andando|o andamento|a coisa|isso|aquilo|tudo|a tarefa|o trabalho)$/u,
  /^como (?:esta|ta) ai$/u,
  /^(?:o )?que (?:voce |voces )?(?:esta|ta|estao) (?:fazendo|rolando|acontecendo)$/u,
  /^(?:voce |voces )?(?:esta|ta|estao) fazendo (?:o )?que$/u,
  /^(?:qual|como) (?:e |esta |ta )?(?:o )?(?:status|andamento)$/u,
  /^(?:status|andamento|novidades?|alguma novidade|algum progresso|alguma coisa)$/u,
  /^(?:terminou|acabou|ficou pronto|esta pronto|ta pronto|ja terminou|ja acabou)$/u,
  /^quanto (?:tempo )?(?:falta|demora)$/u,
  /^(?:falta|demora) muito$/u,
  /^(?:ainda )?(?:esta|ta) (?:ai|trabalhando|fazendo|nisso)$/u,
  /^em que (?:pe|ponto) (?:esta|ta|estamos|tamos)$/u,
  /^cade (?:voce|a resposta)$/u,
]

/** "Bom dia, @Bia, como tá indo?" -> "bom dia como ta indo": lower case, no accents, no mentions, no punctuation. */
function plain(body: string): string {
  return body
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/@[\p{L}\p{N}_-]+/gu, ' ')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Whether a message is ONLY a question about how the work is going ("como tá indo?", "já terminou?", "tá fazendo o quê??").
 * Anything that also asks for something ("já terminou? troca a cor") is a request, never a status ask. Names of personas are
 * dropped with the `@mention`; a bare name goes through `names`.
 * @param body - The person's message.
 * @param names - Persona names that may be written without `@` ("Bia, como tá indo?").
 */
export function isStatusAsk(body: string, names: readonly string[] = []): boolean {
  if (body.length > 80) return false
  const drop = new Set(names.map(name => plain(name)).filter(name => name !== ''))
  const words = plain(body).split(' ').filter(word => word !== '' && !drop.has(word))
  if (words.length === 0 || words.length > 9) return false
  // Take the filler out from the ENDS only: "ja terminou" keeps its "ja" when it is part of the question itself.
  const tryCore = (list: readonly string[]): boolean => STATUS_CORE.some(rule => rule.test(list.join(' ')))
  if (tryCore(words)) return true
  let from = 0
  let to = words.length
  while (from < to && FILLER.has(words[from]!)) from += 1
  while (to > from && FILLER.has(words[to - 1]!)) to -= 1
  return from < to && tryCore(words.slice(from, to))
}

/**
 * How long the work has been going, in words.
 * @param ms - Milliseconds since the Assignment started.
 */
export function elapsedWords(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (!(minutes >= 1)) return 'menos de 1 minuto'
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${String(minutes)} minutos`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const head = hours === 1 ? '1 hora' : `${String(hours)} horas`
  return rest === 0 ? head : `${head} e ${String(rest)} min`
}

const STEP_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:web|fetch|browse|browser|navigate|http|url|internet)/u, 'pesquisando na internet'],
  [/(?:^task$|^agent$|subagent|delegate)/u, 'pedindo ajuda a um colega'],
  [/(?:^tell$|passforward|handoff|^forward$)/u, 'passando trabalho a um colega'],
  [/(?:todo|^plan$|exitplanmode)/u, 'organizando os passos'],
  [/(?:recall|memory|brain|remember)/u, 'consultando a memória da empresa'],
  [/(?:email|mail|gmail|telegram|whatsapp)/u, 'preparando uma mensagem'],
  [/(?:^write$|^edit$|multiedit|notebookedit|patch|^save$|^create$)/u, 'escrevendo um arquivo'],
  [/(?:^read$|^glob$|^grep$|^ls$|^view$|^find$|^list$|^cat$|notebookread|searchfiles)/u, 'lendo os arquivos'],
  [/(?:^bash$|^shell$|^exec|command|powershell|terminal|^run$)/u, 'rodando um passo no computador'],
]

/**
 * The step in plain words, from the tool the turn called last. Spellings differ per CLI (`Read`, `mcp__server__read_file`, `functions.shell`):
 * the last segment is what counts.
 * @param tool - Tool name as the stream reported it.
 * @returns Words after "agora", or undefined when the tool is not one this table can say without guessing.
 */
export function stepWords(tool: string | undefined): string | undefined {
  if (tool === undefined) return undefined
  const last = tool.split(/__|[./:]/u).filter(part => part !== '').pop() ?? tool
  const whole = last.toLowerCase().replace(/[^a-z]/gu, '')
  if (whole === '') return undefined
  // `read_file` is one tool: its parts count too, so a word that says the step ("read") is enough.
  const keys = [whole, ...last.toLowerCase().split(/[_-]/u).map(part => part.replace(/[^a-z]/gu, '')).filter(part => part !== '')]
  return STEP_RULES.find(([rule]) => keys.some(key => rule.test(key)))?.[1]
}

export interface BusyStatusInput {
  /** The persona the owner is talking to. */
  readonly name: string
  /** The running task is hers. */
  readonly mine: boolean
  /** Who is on the running task when it is not hers (omit for "A equipe"). */
  readonly who?: string | undefined
  /** The task's title, only when this reader may know it; undefined says "uma tarefa". */
  readonly title?: string | undefined
  /** Since the Assignment started (ms), when known. */
  readonly elapsedMs?: number | undefined
  /** Plain words of the step now ({@link stepWords}), when known. */
  readonly step?: string | undefined
  /** The task waits for an answer (the person's or a colleague's): no time and no step are claimed. */
  readonly waiting?: boolean | undefined
  /**
   * The line IS the whole answer (a status question): no model turn follows. `false` is the short promise that goes with a message the
   * persona will answer later with a model turn: its sentence is the one the product always had, unchanged.
   */
  readonly answersNow: boolean
}

/**
 * The status line. Without a time AND without a step there is nothing true to add: the short sentence stays.
 * @param input - Facts.
 */
export function statusLine(input: BusyStatusInput): string {
  const what = input.title === undefined ? 'uma tarefa' : `“${input.title}”`
  if (!input.answersNow) return `${input.mine ? 'Estou' : 'A equipe está'} terminando ${what}; respondo em seguida.`
  const subject = input.mine ? 'Estou' : `${input.who ?? 'A equipe'} está`
  const tail = input.mine ? 'Te aviso quando terminar.' : 'O resultado aparece aqui quando terminar.'
  const where = input.title === undefined ? 'numa tarefa' : `em “${input.title}”`
  if (input.waiting === true) return `${subject} esperando uma resposta ${where}. ${tail}`
  const known = input.elapsedMs !== undefined && Number.isFinite(input.elapsedMs) && input.elapsedMs >= 0
  if (!known && input.step === undefined) return `${subject} terminando ${what}. ${tail}`
  const time = known ? ` há ${elapsedWords(input.elapsedMs!)}` : ''
  const step = input.step === undefined ? '' : `, agora ${input.step}`
  return `${subject} ${where}${time}${step}. ${tail}`
}

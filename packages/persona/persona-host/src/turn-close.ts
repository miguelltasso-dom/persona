/**
 * Colheita, item 3 (Atlas 11/11): HOW A PERSONA'S TURN ENDS is decided by rules, never by a model (zero tokens, same answer for the same facts).
 *
 * The host asks {@link closeTurn} once per finished turn, with the facts it already has (her words, the tools she really ran, the files she really saved).
 * The answer is a {@link TurnCloseVerdict}, one of four things:
 *
 *   - `feito`            : post her words as they are.
 *   - `continuar`        : do NOT post them; run one more turn with `cobranca` (an internal note, never shown in the thread).
 *   - `esperar-dono`     : she asked the owner something (or needs a secret/a colleague): no extra turn, nobody continues on their own.
 *   - `cartao-continuar` : the extra turns did not fix it. Her words are NOT posted; `fala` (an honest sentence) goes instead, with a one-click "Continuar" card.
 *
 * The rules, in this order (the first that applies wins):
 *   1. a secret asked in the chat (password, token, key, code)  → never posted; once corrected, else `esperar-dono` with the Cofre sentence;
 *   2. a colleague's tracked work is still pending              → `esperar-dono` (never "Pronto");
 *   3. she says she DID something no tool did ("Pronto!", "Já enviei", "Salvei o arquivo") → corrected once, else `cartao-continuar`;
 *   4. she asks the owner something the host already knows      → the answer goes back to her once ("já está no que você escreveu: …");
 *   5. she ends asking                                          → `esperar-dono` (perguntou = espera: nothing continues on its own);
 *   6. she gives up without having tried a single tool          → sent back once to try first (a login/code/approval is NOT a reason to stop: it is handed over);
 *   7. otherwise                                                → `feito`.
 *
 * One budget for everything: at most {@link MAX_PUSHES} extra turns per run, each reason at most once, and every extra turn after the first needs PROGRESS
 * (the turn that was sent back must have run at least one tool). A person's answer opens a new run, so the budget starts over.
 *
 * Pure and deterministic. No I/O, no clock. The wiring (the loop that delivers the `cobranca` and runs the turn again) is `orchestration.ts`.
 */

import { isReadByName, toolWords } from '@deepseek-ai/dsh-persona-runners'

/** Extra turns a single run may be given by these rules, all reasons together. */
export const MAX_PUSHES = 3

/** Why a turn is sent back for one more round. */
export type TurnPushReason = 'sem-prova' | 'desistiu-cedo' | 'pergunta-ja-respondida' | 'pediu-segredo'

/** What the host does with a finished turn. Published for the "Continuar" card (Flint, item 7): `cartao-continuar` is the only kind that carries a card. */
export type TurnCloseVerdict =
  | { readonly kind: 'feito'; readonly rule: string }
  | { readonly kind: 'continuar'; readonly motivo: TurnPushReason; readonly cobranca: string; readonly rule: string }
  | { readonly kind: 'esperar-dono'; readonly motivo: 'perguntou' | 'colega' | 'segredo'; readonly fala?: string; readonly rule: string }
  | { readonly kind: 'cartao-continuar'; readonly motivo: 'sem-prova' | 'limite'; readonly fala: string; readonly rule: string }

/** What is already known to the host and could answer a question she is about to ask the owner. */
export interface KnownFacts {
  /** What the owner wrote (the request, later messages, answers). */
  readonly ownerTexts: readonly string[]
  /** What the company record says (profile, memory the turn already carries). */
  readonly companyTexts?: readonly string[]
  /** Paths in the draft the owner/the team put there (`inputs/foto.png`). */
  readonly files?: readonly string[]
}

/** The facts of one finished turn. */
export interface TurnCloseFacts {
  /** Her words of the turn: the text after her last tool ('' when she said nothing). */
  readonly words: string
  /** Names of the tools she called in THIS turn (native, MCP, product). */
  readonly tools: readonly string[]
  /** Files THIS turn wrote in the draft (not what the host copied in). */
  readonly savedFiles: number
  /** The turn had tools to use. False for an answer-only turn: there, the text is the work. */
  readonly hadTools: boolean
  /** A hand-off she asked for is tracked and still pending (Forge's `pendingFromPersonaIn`). */
  readonly waitingColleague?: boolean
  /**
   * The HOST acts for her in this turn (the conversation routes, hands over, schedules): what she says she SENT, SCHEDULED or FINISHED can be true, so those claims are not
   * judged. A FILE is different: the host never saves one in a conversation, so "salvei a planilha" without a file is always false and is still held.
   */
  readonly hostActs?: boolean
  readonly known?: KnownFacts
}

/** What the run remembers between turns. Start from {@link FRESH_TURN_CLOSE}. */
export interface TurnCloseState {
  readonly pushes: readonly TurnPushReason[]
}

export const FRESH_TURN_CLOSE: TurnCloseState = { pushes: [] }

/** What the owner reads when her false "done" is held back. Plain words, no tool names. */
export const SEM_PROVA_FALA = 'Eu ia dizer que estava pronto, mas nada foi feito de verdade: nenhum arquivo foi salvo e nada foi enviado.'
/** What the owner reads when she gave up twice without ever trying a tool (the extra turn did not change it). */
export const DESISTIU_FALA = 'Parei sem tentar nada por conta própria. Se você quiser, eu continuo.'
/** What the owner reads when a secret was asked in the chat. */
export const SEGREDO_FALA = 'Preciso de um acesso (senha, chave ou código) para seguir. Isso nunca vai pelo chat: guarde no Cofre e eu uso de lá.'

const L = String.raw`\p{L}\p{N}`
/** A whole-word match for letters with accents (`\b` only knows ASCII). */
function whole(source: string, flags = 'iu'): RegExp {
  return new RegExp(`(?<![${L}])(?:${source})(?![${L}])`, flags)
}

const MARKER = /\[\[[a-z][a-z0-9_-]*:[\s\S]*?\]\]/giu

function withoutMarkers(text: string): string {
  return text.replace(MARKER, ' ').replace(/\r\n?/gu, '\n')
}

/** The technical fold of item 4 (a CLOSED `<details>…</details>`): not what the owner reads as her closing words, so a "?" inside it is no question and a "?" before it still is. An unclosed one is left alone: it never swallows the question. */
function withoutFold(text: string): string {
  return text.replace(/<details[\s\S]*?<\/details>/giu, ' ')
}

/** A line that introduces content she is handing over ("Aqui vai a descrição:", "Segue o texto:"): what follows, up to the next blank line, is the deliverable. */
const INTRODUCES_CONTENT = /(?:aqui (?:vai|est[áa]|segue|v[ãa]o)|segue(?:m)?\b|abaixo|a seguir)[^\n]*:\s*$/iu

function withoutIntroducedBlocks(text: string): string {
  const kept: string[] = []
  let inBlock = false
  for (const line of text.split('\n')) {
    if (line.trim() === '') { inBlock = false; kept.push(line); continue }
    if (inBlock) continue
    kept.push(line)
    if (INTRODUCES_CONTENT.test(line.trim())) inBlock = true
  }
  return kept.join('\n')
}

/** Her own sentences: what is code, an SVG, a quoted line, quoted copy or a block she introduces as content is a deliverable, never a claim of hers. */
function proseOf(text: string): string {
  return withoutIntroducedBlocks(withoutMarkers(text))
    .replace(/```[\s\S]*?(?:```|$)/gu, '\n')
    .replace(/<svg[\s\S]*?(?:<\/svg>|$)/giu, '\n')
    .replace(/^[ \t]*>.*$/gmu, '')
    .replace(/"[^"\n]{12,}"|“[^”\n]{12,}”/gu, ' ')
}

/** @param text - Any text. @returns Its sentences (a line break also ends one). */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…？؟])\s+|\n+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => /[\p{L}\p{N}]/u.test(sentence))
}

// ---- what a tool is worth as proof ----------------------------------------------------------------------------------------------------------

/** Tools (native or MCP) that only look: they prove nothing was DONE. */
const LOOKS_ONLY = new Set([
  'read', 'grep', 'glob', 'ls', 'cat', 'find', 'rg', 'tree', 'list', 'view', 'search', 'fetch', 'web', 'think', 'plan', 'todo', 'todowrite', 'toolsearch',
  'exitplanmode', 'bashoutput', 'killshell', 'skill', 'slashcommand', 'taskoutput', 'webfetch', 'websearch', 'notebook', 'dir', 'stat', 'head', 'tail',
])
const FILE_WRITE_WORDS = new Set(['write', 'edit', 'multi', 'multiedit', 'notebook', 'notebookedit', 'patch', 'apply', 'apply_patch', 'file', 'create', 'str', 'replace', 'text', 'editor'])

/** @param name - Tool name as the engine reported it. @returns Whether the call can have CHANGED something (a read/search/list cannot). */
export function isWorkTool(name: string): boolean {
  const lower = name.trim().toLowerCase()
  if (lower === '' || LOOKS_ONLY.has(lower)) return false
  const words = toolWords(name)
  if (words.length > 0 && words.every(word => LOOKS_ONLY.has(word))) return false
  return !isReadByName(name)
}

function isFileWriteTool(name: string): boolean {
  const words = toolWords(name)
  return words.length > 0 && words.every(word => FILE_WRITE_WORDS.has(word))
}

// ---- 3. what she says she did ---------------------------------------------------------------------------------------------------------------

const FILE_STRONG = whole('salvei|gravei|exportei|anexei|guardei|salvou|gravou')
const FILE_WEAK = whole('criei|gerei|atualizei|editei|escrevi|montei|fiz|desenhei|produzi|preparei|redigi|finalizei')
const FILE_OBJECT = whole('arquivos?|planilhas?|pdfs?|svgs?|pngs?|jpe?gs?|pastas?|rascunhos?|csv|xlsx|docx|slides?|logos?|logotipos?|cartazes|cartaz|artes?|imagens?|banners?|flyers?|capas?')
const FILE_PLACE = whole('salv(?:o|ei|ou) (?:em|na|no)')
const SEND_CLAIM = whole('enviei|mandei|publiquei|postei|disparei|encaminhei|notifiquei|compartilhei')
const SEND_CLAIM_EN = /\bI(?:'ve| have)? (?:sent|published|posted|forwarded|saved|created|scheduled)\b/iu
const SCHEDULE_CLAIM = whole('agendei|programei|deixei agendad[oa]|coloquei na agenda|configurei (?:a |o )?(?:rotina|lembrete|alerta)|criei (?:a |uma |um |o )?(?:rotina|tarefa|lembrete|agenda|reuni[ãa]o|evento|card|cart[ãa]o)')
const DONE_OPENING = new RegExp(`^[^${L}]*(?:pronto|feito|conclu[íi]d[oa]|conclu[íi]|finalizad[oa]|terminei|tudo (?:certo|pronto|feito)|j[áa] (?:est[áa]|ficou) (?:pronto|feito|tudo certo)|done|all set|finished|completed)(?![${L}])[^${L}]*`, 'iu')
const NEGATION_BEFORE = /(?:n[ãa]o|nunca|ainda n[ãa]o)\s+(?:\S+\s+){0,2}$/iu
/** What she made is WORDS ("Fiz o texto para o cartaz"): the text is in her message, the poster is only where it goes. */
const TEXT_OBJECT = /^\s*(?:(?:o|a|os|as|um|uma|seu|sua)\s+)?(?:texto|legenda|copy|frase|mensagem|descri[çc][ãa]o|t[íi]tulo|slogan|chamada|roteiro|artigo|resposta|resumo)/iu
const SCHEDULE_OBJECT = whole('rotinas?|tarefas?|lembretes?|agenda|reuni[ãa]o|reuni[õo]es|eventos?|cards?|cart[ãa]o')
/** A passive with an agent ("enviado ontem PELA Bia") reports what somebody else did: not her claim. */
const BY_AGENT = whole('por|pelo|pela|pelos|pelas')
/** What somebody ELSE said or confirmed ("Ele disse que o arquivo foi salvo"): a claim after one of these is a report, not hers. */
const REPORTING_VERB = whole('disse|disseram|falou|falaram|informou|avisou|contou|escreveu|mencionou|afirmou|confirmou|confirmaram|relatou|comentou|segundo|conforme|de acordo com')
/** A fact about something that already existed ("foi criada em 2023", "ontem", "há 3 anos"): the owner's file, not her work. */
const PAST_FACT = /(?:\bem (?:19|20)\d\d\b|\bem (?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\bh[áa] \d+|\banteontem\b|\bontem\b|\b(?:semana|m[êe]s|ano) passad[oa]\b|\bque (?:voc[êe]|ele|ela|eles|elas) \p{L}+)/iu
/** The elliptic claim ("Orçamento enviado ✅", "Enviado!", "Planilha criada e salva"): a short line that ends on the participle. */
const CLAIM_PARTICIPLE = /(?:enviad|mandad|publicad|postad|disparad|encaminhad|compartilhad|notificad|anexad|salv(?:ad)?|gravad|exportad|guardad|criad|gerad|agendad|programad|marcad|configurad|atualizad|finalizad)[oa]s?$/iu
const NOT_A_CLAIM_WORD = /^(?:n[ãa]o|nada|nenhum|nenhuma|ainda|sem|nunca|ser|ficar|foi|foram|ficou|ficaram)$/iu
function ellipticClaim(sentence: string): ClaimClass | undefined {
  const tokens = sentence.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/u).filter(token => token !== '')
  if (tokens.length === 0 || tokens.length > 6 || tokens.some(token => NOT_A_CLAIM_WORD.test(token))) return undefined
  const last = tokens.at(-1) ?? ''
  if (!CLAIM_PARTICIPLE.test(last)) return undefined
  if (/^(?:enviad|mandad|publicad|postad|disparad|encaminhad|compartilhad|notificad)/iu.test(last)) return 'send'
  if (/^(?:salv|gravad|exportad|anexad|guardad)/iu.test(last)) return 'file'
  if (/^(?:agendad|programad|marcad|configurad)/iu.test(last)) return 'schedule'
  if (SCHEDULE_OBJECT.test(sentence)) return 'schedule'
  return FILE_OBJECT.test(sentence) ? 'file-weak' : undefined
}
/** The passive of the same claims ("foi enviado", "ficou pronto e foi anexado"): nobody does it in the words, but the owner reads that it WAS done. */
const passive = (participles: string): RegExp => new RegExp(`(?<![${L}])(?:j[áa] )?(?:foi|foram|ficou|ficaram)(?: [${L}]+)? (?:${participles})(?![${L}])`, 'iu')
const PASSIVE_SEND = passive('(?:enviad|mandad|publicad|postad|disparad|encaminhad|compartilhad|notificad)[oa]s?')
const PASSIVE_FILE_STRONG = passive('salv(?:ad)?[oa]s?|(?:gravad|exportad|anexad|guardad)[oa]s?')
const PASSIVE_SCHEDULE = passive('(?:agendad|programad|marcad|configurad)[oa]s?')
const PASSIVE_MADE = passive('(?:criad|gerad|atualizad|editad|finalizad|montad|produzid|preparad|desenhad)[oa]s?')

type ClaimClass = 'file' | 'file-weak' | 'send' | 'schedule' | 'destroy' | 'generic'

/** What she says she REMOVED or MOVED ("Já apaguei o arquivo", "Removi a pasta antiga"): even where the host acts for her (a conversation: it forwards, it schedules) it never deletes, moves or installs anything. */
const DESTROY_CLAIM = whole('apaguei|deletei|excluí|exclui|removi|limpei|descartei|renomeei|movi|copiei|instalei|desinstalei')

function claimClassOf(sentence: string): ClaimClass | undefined {
  if (sentence.includes('?')) return undefined
  const unnegated = (match: RegExpExecArray | null): boolean => match !== null
    && !NEGATION_BEFORE.test(sentence.slice(Math.max(0, match.index - 28), match.index))
    && !REPORTING_VERB.test(sentence.slice(0, match.index))
  const strong = FILE_STRONG.exec(sentence)
  if (unnegated(strong)) return 'file'
  const place = FILE_PLACE.exec(sentence)
  if (unnegated(place)) return 'file'
  const weak = FILE_WEAK.exec(sentence)
  if (unnegated(weak) && FILE_OBJECT.test(sentence.slice(weak!.index)) && !TEXT_OBJECT.test(sentence.slice(weak!.index + weak![0].length, weak!.index + weak![0].length + 24))) return 'file-weak'
  const gone = DESTROY_CLAIM.exec(sentence)
  if (unnegated(gone) && FILE_OBJECT.test(sentence.slice(gone!.index))) return 'destroy'
  if (unnegated(SEND_CLAIM.exec(sentence)) || unnegated(SEND_CLAIM_EN.exec(sentence))) return 'send'
  if (unnegated(SCHEDULE_CLAIM.exec(sentence))) return 'schedule'
  if (!BY_AGENT.test(sentence) && !PAST_FACT.test(sentence)) {
    if (unnegated(PASSIVE_FILE_STRONG.exec(sentence))) return 'file'
    if (unnegated(PASSIVE_SEND.exec(sentence))) return 'send'
    const made = unnegated(PASSIVE_MADE.exec(sentence))
    if (unnegated(PASSIVE_SCHEDULE.exec(sentence)) || (made && SCHEDULE_OBJECT.test(sentence))) return 'schedule'
    if (made && FILE_OBJECT.test(sentence)) return 'file-weak'
  }
  if (!BY_AGENT.test(sentence) && !PAST_FACT.test(sentence)) {
    const elliptic = ellipticClaim(sentence)
    if (elliptic !== undefined) return elliptic
  }
  if (DONE_OPENING.test(sentence)) return 'generic'
  return undefined
}

/** An SVG or a real block of code in the words: the work IS in the text (an art delivered inline). */
function deliveredInText(words: string): boolean {
  if (/<svg[\s>]/iu.test(words)) return true
  const fence = /```[^\n]*\n([\s\S]*?)(?:```|$)/u.exec(words)
  return fence !== null && (fence[1] ?? '').trim().length >= 60
}

/** Whether the words carry content beyond the claim itself ("Pronto! 🎉" has none; "Pronto, a legenda é: …" has). */
function hasSubstance(words: string): boolean {
  // A claim of an action is not content; a "Pronto," opening only loses the opening: what follows it ("…a legenda é: …") is the delivery.
  const rest = sentencesOf(withoutMarkers(words))
    .filter((sentence) => { const kind = claimClassOf(sentence); return kind === undefined || kind === 'generic' })
    .map(sentence => sentence.replace(DONE_OPENING, ''))
    .join(' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
  return rest.length >= 40
}

/** Copy she hands over inside the message (a quoted line or a quoted block): a WEAK claim ("Criei o cartaz com esta chamada: “…”") is backed by the words themselves. */
function hasQuotedCopy(words: string): boolean {
  return /"[^"\n]{20,}"|“[^”\n]{20,}”|^[ \t]*>.{20,}$/mu.test(words)
}

interface ClaimGap { readonly what: ClaimClass }

function claimGap(facts: TurnCloseFacts): ClaimGap | undefined {
  const sentences = sentencesOf(proseOf(facts.words))
  const scan = [...new Set([...sentences.slice(0, 2), ...sentences.slice(-2)])]
  const work = facts.tools.filter(isWorkTool)
  const wrote = facts.savedFiles > 0 || work.length > 0 || deliveredInText(facts.words)
  const sent = work.some(tool => !isFileWriteTool(tool))
  const quoted = hasQuotedCopy(facts.words)
  for (const sentence of scan) {
    const kind = claimClassOf(sentence)
    if (kind === 'file' && !wrote) return { what: 'file' }
    if (kind === 'file-weak' && !wrote && !quoted) return { what: 'file' }
    if (kind === 'send' && !sent && facts.hostActs !== true) return { what: 'send' }
    if (kind === 'schedule' && work.length === 0 && facts.hostActs !== true) return { what: 'schedule' }
    // The host never deletes or moves anything for her, so no `hostActs` excuse; and a saved file proves nothing was removed: only a work tool does.
    if (kind === 'destroy' && work.length === 0) return { what: 'destroy' }
  }
  const opened = scan.some(sentence => claimClassOf(sentence) === 'generic')
  if (opened && !wrote && facts.hostActs !== true && !hasSubstance(facts.words)) return { what: 'generic' }
  return undefined
}

const WHAT: Record<ClaimClass, string> = {
  file: 'salvou ou criou um arquivo',
  'file-weak': 'salvou ou criou um arquivo',
  send: 'enviou ou publicou algo',
  schedule: 'agendou ou configurou algo',
  destroy: 'apagou, moveu ou alterou um arquivo',
  generic: 'terminou o trabalho',
}

// ---- 5. a question left open ------------------------------------------------------------------------------------------------------------------

/** @param words - Her words. @returns Whether the LAST thing she wrote is a question (a sticker, an emoji or a closing mark after it does not count). */
export function terminaPerguntando(words: string): boolean {
  const cleaned = withoutFold(withoutMarkers(words)).trim().replace(/[\s"'”’)\]}*_~`.\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]+$/u, '')
  if (/[?？؟]$/u.test(cleaned)) return true
  // A request for a decision with no question mark ("Me diga se posso mandar hoje.") is an open question too; a courtesy ("me avise se precisar") is not.
  const last = sentencesOf(cleaned).at(-1) ?? ''
  return ASKS_FOR_DECISION.test(last) && !JUST_COURTESY.test(last)
}

const ASKS_FOR_DECISION = /(?:\bme (?:diga|avise|responda|confirme)\b|\bconfirme\b|\baguardo\b[^.!?\n]{0,25}\b(?:resposta|confirma[çc][ãa]o|aprova[çc][ãa]o|ok|retorno)\b)/iu
const JUST_COURTESY = /\bse (?:precisar|quiser|tiver|necess[áa]rio|houver|surgir|desejar)\b/iu

function lastQuestion(words: string): string {
  const asked = sentencesOf(proseOf(withoutFold(words))).filter(sentence => /[?？؟]/u.test(sentence))
  return asked.at(-1) ?? ''
}

// ---- 1. a secret in the chat ------------------------------------------------------------------------------------------------------------------

const SECRET_NOUN = whole('senhas?|password|tokens?|chaves? (?:de )?(?:api|secreta|privada|de acesso)|api key|c[óo]digo (?:de )?(?:verifica[çc][ãa]o|seguran[çc]a|acesso|sms|2fa)|c[óo]digo do (?:sms|whatsapp)|2fa|cvv|n[úu]mero do cart[ãa]o|cart[ãa]o de cr[ée]dito')
const SECRET_ASK = /(?:me (?:passe|passa|envie|envia|mande|manda|d[êe]|diga|diz|informe|informa|fale|fala)|pode(?:ria)? (?:me )?(?:passar|enviar|mandar|informar|dizer|fornecer)|preciso d[aeo]s? |qual (?:é |e )?(?:a |o )?|cole aqui|digite)/iu
const SECRET_SAFE = /cofre|n[ãa]o (?:me )?(?:passe|envie|mande)|nunca/iu

/** @param words - Her words. @returns Whether she asks the owner for a secret to be typed in the chat. */
export function asksSecret(words: string): boolean {
  return sentencesOf(proseOf(words)).some(sentence => SECRET_NOUN.test(sentence) && !SECRET_SAFE.test(sentence) && (SECRET_ASK.test(sentence) || /[?？؟]/u.test(sentence)))
}

// ---- 6. she gives up without trying -----------------------------------------------------------------------------------------------------------

const REFUSAL = whole('n[ãa]o consegui|n[ãa]o consigo|n[ãa]o foi poss[íi]vel|n[ãa]o tenho acesso|sem acesso|n[ãa]o tenho como|n[ãa]o d[áa] para|n[ãa]o posso (?:acessar|abrir|ver|ler)|n[ãa]o encontrei')
const REFUSAL_EN = /\bI (?:can(?:no|')t|couldn'?t|could not|am unable|don'?t have access|do not have access)\b|\bunable to\b/iu
/** A step only the owner can give is handed over, never a reason to stop and never to be "tried" first. */
const ONLY_THE_OWNER = whole('senha|password|login|logar|entrar na conta|qr|c[óo]digo|2fa|verifica[çc][ãa]o|autoriz\\w*|aprova\\w*|permiss[ãa]o|compartilh\\w*|token|chave|conta d[oae]')

function gaveUpWithoutTrying(facts: TurnCloseFacts): boolean {
  if (!facts.hadTools || facts.tools.length > 0) return false
  const prose = proseOf(facts.words)
  if (!(REFUSAL.test(prose) || REFUSAL_EN.test(prose))) return false
  return !ONLY_THE_OWNER.test(prose)
}

// ---- 4. a question the host can already answer ------------------------------------------------------------------------------------------------

interface KnownKind {
  readonly label: string
  readonly ask: RegExp
  readonly datum?: RegExp
  readonly file?: RegExp
}

const KNOWN_KINDS: readonly KnownKind[] = [
  { label: 'o WhatsApp ou telefone', ask: whole('whats(?:app)?|zap|telefone|celular|n[úu]mero de (?:telefone|celular|whats\\w*)'), datum: /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/u },
  { label: 'o e-mail', ask: whole('e-?mails?'), datum: /[\w.+-]+@[\w-]+\.[\w.-]+/u },
  { label: 'o CNPJ ou CPF', ask: whole('cnpj|cpf'), datum: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/u },
  { label: 'o site ou Instagram', ask: whole('site|instagram|insta|link d[oa]'), datum: /https?:\/\/\S+|www\.\S+|@[\w.]{3,}/iu },
  { label: 'o endereço', ask: whole('endere[çc]o|onde fica'), datum: /(?:rua|avenida|av\.|travessa|alameda|pra[çc]a|rodovia)\s+[^,\n]{3,}/iu },
  { label: 'a imagem ou o logo', ask: whole('foto|imagem|logo|logotipo|anexo'), file: /\.(?:png|jpe?g|webp|gif|svg)$/iu },
  { label: 'o arquivo', ask: whole('arquivo|planilha|pdf|card[áa]pio'), file: /\.(?:pdf|xlsx?|csv|docx?|txt)$/iu },
]
/** The question asks for the thing itself, not for a choice or a preference. */
const WANTS_THE_THING = /(?:envi\w+|mand\w+|pass\w+|anex\w+|compartilh\w+|inform\w+|diga|dizer|me (?:diz|fala|d[aá])|qual (?:é|e|seria)|quais (?:são|sao)|cad[êe]|onde (?:est[aá]|fica)|tem (?:a|o|um|uma)\b|tenho que|preciso d[aeo])/iu
const PREFERENCE = /prefer\w+|escolh\w+|gost\w+|quer que|deseja|melhor/iu

export interface KnownAnswer { readonly label: string; readonly where: string; readonly value: string }

/** A datum compared by what it IS (a phone by its digits without the country code, an e-mail in lower case), not by how it is written. */
function datumKey(value: string): string {
  const digits = value.replace(/\D/gu, '')
  return digits.length >= 8 ? digits.replace(/^55(?=\d{10,11}$)/u, '') : value.trim().toLowerCase()
}

/**
 * Carbon P1-01: a CONFIRMATION of a datum the owner already gave ("O WhatsApp (11) 91234-5678 é o número real?") carries the datum itself. When the very same one is in what the
 * host knows, the question is answered already; a DIFFERENT number is a real doubt and goes to the owner.
 */
function confirmedDatum(question: string, known: KnownFacts): KnownAnswer | undefined {
  for (const kind of KNOWN_KINDS) {
    if (kind.datum === undefined || !kind.ask.test(question)) continue
    const given = kind.datum.exec(question)
    if (given === null) continue
    const wanted = datumKey(given[0])
    const sources: ReadonlyArray<readonly [string, string]> = [
      ...known.ownerTexts.map(text => [text, 'na conversa'] as const),
      ...(known.companyTexts ?? []).map(text => [text, 'no cadastro da empresa'] as const),
    ]
    for (const [text, where] of sources) {
      const hit = kind.datum.exec(text)
      if (hit !== null && datumKey(hit[0]) === wanted) return { label: kind.label, where, value: hit[0].trim() }
    }
  }
  return undefined
}

function knownAnswerFor(words: string, known: KnownFacts | undefined): KnownAnswer | undefined {
  return knownAnswerToQuestion(lastQuestion(words), known)
}

/**
 * The answer to ONE question that the host already has (what the owner wrote, the company's records, the draft's inputs), or `undefined` when the question is a real one
 * (a preference, an unknown datum). Shared by the end of a turn and by the `persona_ask` tool: the same silly question is never carried to the owner by either way.
 * @param question - One question, as she wrote it.
 * @param known - What the host knows.
 */
export function knownAnswerToQuestion(question: string, known: KnownFacts | undefined): KnownAnswer | undefined {
  if (known === undefined) return undefined
  const confirmed = confirmedDatum(question, known)
  if (confirmed !== undefined) return confirmed
  if (question === '' || PREFERENCE.test(question) || !WANTS_THE_THING.test(question)) return undefined
  for (const kind of KNOWN_KINDS) {
    if (!kind.ask.test(question)) continue
    if (kind.datum !== undefined) {
      for (const text of known.ownerTexts) { const hit = kind.datum.exec(text); if (hit !== null) return { label: kind.label, where: 'na conversa', value: hit[0].trim() } }
      for (const text of known.companyTexts ?? []) { const hit = kind.datum.exec(text); if (hit !== null) return { label: kind.label, where: 'no cadastro da empresa', value: hit[0].trim() } }
    }
    if (kind.file !== undefined) {
      const file = (known.files ?? []).find(path => kind.file!.test(path))
      if (file !== undefined) return { label: kind.label, where: 'no rascunho', value: file }
    }
  }
  return undefined
}

// ---- the notes she gets (internal, never in the thread) ----------------------------------------------------------------------------------------

function claimNote(gap: ClaimGap, hadTools: boolean): string {
  return hadTools
    ? `Atenção: sua última resposta diz que você ${WHAT[gap.what]}, mas nenhuma ferramenta que faça isso rodou nesta rodada. Faça agora de verdade, com a ferramenta certa, e só depois conte o que foi feito. Se não for possível, escreva com clareza o que não deu e por quê. Não diga que fez o que não fez.`
    : `Atenção: sua última resposta diz que você ${WHAT[gap.what]}, mas nesta rodada você não tem ferramentas para isso. Entregue o conteúdo aqui no texto e deixe claro o que você não pode fazer. Não diga que fez o que não fez.`
}

const SECRET_NOTE = 'Nunca peça senha, chave, token ou código pelo chat. Se precisar de um acesso, diga em uma frase que o dono deve guardá-lo no Cofre e use de lá. Reescreva sua resposta sem pedir o segredo aqui.'
const GAVE_UP_NOTE = 'Você disse que não deu, mas não tentou nada nesta rodada. Antes de desistir, use o que você tem: leia os arquivos e anexos do pedido, procure na memória da empresa, busque na web ou chame um colega. Só diga que não deu depois de tentar, contando o que tentou. Se o que falta só o dono pode dar (login, código, aprovação), peça isso em uma frase curta.'

function knownNote(answer: KnownAnswer): string {
  return `Você perguntou ${answer.label} ao dono, mas isso já está ${answer.where}: ${answer.value}. Use essa informação e siga com o trabalho, sem perguntar de novo.`
}

// ---- the verdict ----------------------------------------------------------------------------------------------------------------------------------

/**
 * Decide how one finished turn ends.
 * @param facts - What the host knows about the turn.
 * @param state - What this run already did ({@link FRESH_TURN_CLOSE} for the first turn).
 * @returns The verdict and the state to carry to the next turn.
 */
export function closeTurn(facts: TurnCloseFacts, state: TurnCloseState = FRESH_TURN_CLOSE): { readonly verdict: TurnCloseVerdict; readonly state: TurnCloseState } {
  const words = withoutMarkers(facts.words).trim()
  const stay = (verdict: TurnCloseVerdict): { verdict: TurnCloseVerdict; state: TurnCloseState } => ({ verdict, state })
  if (words === '') return stay({ kind: 'feito', rule: 'sem-fala' })
  // Budget: one extra turn needs room, and after the first one it needs progress (the turn sent back ran at least one tool).
  const roomFor = (reason: TurnPushReason): boolean => state.pushes.length < MAX_PUSHES && !state.pushes.includes(reason) && (state.pushes.length === 0 || facts.tools.length > 0)
  const push = (motivo: TurnPushReason, cobranca: string, rule: string): { verdict: TurnCloseVerdict; state: TurnCloseState } => ({
    verdict: { kind: 'continuar', motivo, cobranca, rule },
    state: { pushes: [...state.pushes, motivo] },
  })

  if (asksSecret(words)) {
    if (roomFor('pediu-segredo')) return push('pediu-segredo', SECRET_NOTE, 'segredo-no-chat')
    return stay({ kind: 'esperar-dono', motivo: 'segredo', fala: SEGREDO_FALA, rule: 'segredo-no-chat:orcamento' })
  }
  if (facts.waitingColleague === true) return stay({ kind: 'esperar-dono', motivo: 'colega', rule: 'colega-pendente' })

  const gap = claimGap(facts)
  if (gap !== undefined) {
    if (roomFor('sem-prova')) return push('sem-prova', claimNote(gap, facts.hadTools), `sem-prova:${gap.what}`)
    return stay({ kind: 'cartao-continuar', motivo: state.pushes.length >= MAX_PUSHES ? 'limite' : 'sem-prova', fala: SEM_PROVA_FALA, rule: `sem-prova:${gap.what}:orcamento` })
  }

  if (terminaPerguntando(words)) {
    const answer = knownAnswerFor(words, facts.known)
    if (answer !== undefined && roomFor('pergunta-ja-respondida')) return push('pergunta-ja-respondida', knownNote(answer), 'pergunta-ja-respondida')
    return stay({ kind: 'esperar-dono', motivo: 'perguntou', rule: 'perguntou=espera' })
  }

  if (gaveUpWithoutTrying(facts)) {
    if (roomFor('desistiu-cedo')) return push('desistiu-cedo', GAVE_UP_NOTE, 'desistiu-sem-tentar')
    // Carbon P1-01: sent back FOR THIS REASON and she gave up AGAIN without trying a single tool: her refusal is not "feito"; the owner is offered to continue.
    // (A "não consegui" after a false claim was sent back is another story: she did try, the call was refused: it is her honest limit and goes through.)
    if (state.pushes.includes('desistiu-cedo')) return stay({ kind: 'cartao-continuar', motivo: 'limite', fala: DESISTIU_FALA, rule: 'desistiu-sem-tentar:orcamento' })
  }
  return stay({ kind: 'feito', rule: 'ok' })
}

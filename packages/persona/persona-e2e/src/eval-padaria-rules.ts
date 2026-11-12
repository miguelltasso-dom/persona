/**
 * COLHEITA item 14 (eval of the Padaria Lua round) — the three readers the D-100 gate does not have, as PURE functions over what a round left behind (`TeamTranscript`). Nothing here calls a
 * model: the fake rehearsal, a replay of a kept home and the real round all run them over the same transcript, so "green" means the same thing everywhere.
 *
 *   FALSE DONE   a persona (or the host's "Pronto:" summary) says the work is done and the transcript shows it is not: a bare "Pronto!" with nothing behind it, a file named as saved that no draft
 *                holds, "passei ao Téo" with no bilhete to Téo, a "Pronto:" summary posted over an unsealed review or a "não deu para seguir" line.
 *   SILLY ASK    a question card put to the person that the person already answered in the request (the WhatsApp they wrote), that is about the team's own workbench (an old PNG in the folder),
 *                that is longer than 300 characters, or that asks for a secret in clear text.
 *   JARGON       the machine in the thread: tool/shell talk, narration between tool calls, a PNG export request, "a pessoa", a raw "NOVA VERSÃO:", folder paths, ids, HTTP codes, JSON keys,
 *                tool names and the headings of a case file ("O que não fiz e por quê:"). Whatever sits inside a `<details>` block is technical detail ON PURPOSE and is not read.
 *
 * Every rule was written against the real text of attempts 2–5 (`artifacts/team10/homes/real-attempt-*`) and replayed over them and over the fake runs before it counts for anything: a guard that
 * cries wolf burns a paid attempt (see `replay-guards-offline-before-paid-runs`). `tests/eval-padaria-rules.spec.ts` keeps both sides: the true defects and the sentences that must stay clean.
 */
import { voiceFindingsIn } from './team-d100-gate.ts'
import { jargonIn, narrationIn } from './team-p0-rules.ts'
import type { TeamTranscript, TranscriptLine } from './team-transcript.ts'

const clip = (text: string, max = 90): string => { const flat = text.replace(/\s+/gu, ' ').trim(); return flat.length > max ? `${flat.slice(0, max)}…` : flat }
const first = (text: string, pattern: RegExp): string | undefined => pattern.exec(text)?.[0]

/** The text a person reads WITHOUT opening anything: every `<details>` block (closed or never closed) is dropped. */
export function visibleText(text: string): string {
  return text.replace(/<details\b[\s\S]*?<\/details>/giu, ' ').replace(/<details\b[\s\S]*$/iu, ' ')
}

/** The lines a person reads that the TEAM wrote: personas' own words and the typed team lines. The person's own words and the host's morning card are not the team's. */
export function teamLines(transcript: TeamTranscript): TranscriptLine[] {
  const personas = new Set(transcript.personas)
  return transcript.lines.filter((line) => {
    if (line.type === 'dailyBrief') return false
    if ((line.type === 'message' || line.type === 'runner') && !personas.has(line.who)) return false
    return true
  })
}

/** Everything the person READS of the team's round, as one text: the team's lines (without their `<details>` blocks) and the questions put to her (with their options). */
export function visibleThreadText(transcript: TeamTranscript): string {
  return [
    ...teamLines(transcript).map(line => visibleText(line.text)),
    ...transcript.asks.map(ask => [ask.question, ...ask.options].join(' ')),
  ].join('\n')
}

/** A persona's own words (a chat message or the answer of her runner), not the host's typed lines. */
const personaWords = (transcript: TeamTranscript): TranscriptLine[] => {
  const personas = new Set(transcript.personas)
  return transcript.lines.filter(line => (line.type === 'message' || line.type === 'runner') && personas.has(line.who))
}

// ══ JARGON ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type JargonRule =
  | 'máquina' | 'pedido de PNG' | 'narração' | 'a pessoa' | 'NOVA VERSÃO: cru' | 'RealTurnCapError'
  | 'prontuário' | 'caminho' | 'id/hash' | 'código HTTP' | 'JSON' | 'nome de ferramenta'

export interface JargonFinding { readonly where: string; readonly rule: JargonRule; readonly match: string }

/** The headings of a case file in bold ("**O que não fiz e por quê:**", "**Decisões que tomei:**", "**Feito**", "**Entrega:**"). A copy label ("**Título:** Pão de queijo") is not one. */
const PRONTUARIO = /\*\*\s*(?:o que (?:eu )?(?:fiz|n[ãa]o fiz|deixei)|decis[õo]es|entregues?|entrega|feito|falta|faltou|arquivos?|formato|pr[óo]ximos passos|pend[êe]ncias|observa[çc][õo]es|opini[ãa]o do time|resumo|status)\b[^*\n]{0,60}\*\*/iu
/** A folder path to a file: segments joined by a slash that end in a file extension ("inputs/foto.png", "artes/x/y.svg"), a drive path, a `worktrees` folder. A URL and "sexta/domingo" are not. */
const CAMINHO = /(?<![:/\w.-])(?:[A-Za-z]:\\[^\s`'"]+|(?:\.{1,2}\/|\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:svg|png|jpe?g|webp|gif|md|txt|json|ts|tsx|js|mjs|css|html|pdf|csv|db|log))(?![\w/])|\bworktrees\b/iu
/** A 32-hex Task id, or a long hex run that mixes digits and letters (a commit or a hash). */
const ID_HASH = /\b[0-9a-f]{32}\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,40}\b/iu
const HTTP_CODE = /\bHTTP\s*\d{3}\b|\b(?:erro|status|c[óo]digo)\s+(?:4|5)\d{2}\b/iu
const JSON_KEY = /\bJSON\b|"[A-Za-z_]\w*"\s*:\s*(?:[[{"]|\d|true\b|false\b|null\b)/u
const TOOL_NAME = /\b(?:pass_forward|ask_colleague|ask_team_opinion|review_verdict|persona_ask|offer_choices|turn_ledger|ticketId|taskkill|stdin|MCP)\b/u

/** Everything a person should not have to read in a line of the thread, by rule. `spoken`: said by a persona or the team. The text is read WITHOUT its `<details>` blocks. */
export function jargonFindingsIn(where: string, raw: string, spoken = true): JargonFinding[] {
  const text = visibleText(raw)
  if (text.trim() === '') return []
  const out: JargonFinding[] = []
  const add = (rule: JargonRule, match: string | undefined): void => { if (match !== undefined) out.push({ where, rule, match: clip(match, 80) }) }
  for (const finding of jargonIn(text)) add(finding.rule === 'P0-3 png-request' ? 'pedido de PNG' : 'máquina', finding.match)
  for (const finding of narrationIn(text)) add('narração', finding.match)
  for (const finding of voiceFindingsIn(where, text, spoken)) add(finding.rule, finding.match)
  add('prontuário', first(text, PRONTUARIO))
  add('caminho', first(text, CAMINHO))
  add('id/hash', first(text, ID_HASH))
  add('código HTTP', first(text, HTTP_CODE))
  add('JSON', first(text, JSON_KEY))
  add('nome de ferramenta', first(text, TOOL_NAME))
  return out
}

/** The jargon in what the team SAID in the thread (the lines the person reads; the bilhetes and review summaries are the Task's detail, read apart by the D-100 gate and the P0 rules). */
export function threadJargon(transcript: TeamTranscript): JargonFinding[] {
  return teamLines(transcript).flatMap(line => jargonFindingsIn(`line ${line.id} (${line.who})`, line.text))
}

// ══ SILLY ASKS ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type SillyAskRule = 'dado do pedido' | 'bancada do time' | 'pergunta longa' | 'segredo em texto aberto'

export interface SillyAskFinding { readonly askId: string; readonly who: string; readonly rule: SillyAskRule; readonly question: string; readonly why: string }

/** The limit of a question put to the person (COLHEITA item 11: a longer one is refused by the tool). */
export const ASK_MAX_CHARS = 300

interface Topic { readonly id: string; readonly label: string; readonly given: RegExp; readonly asked: RegExp }
/** What a question can ask that the request may already hold. A topic counts only when the REQUEST has it; a creative choice ("mais divertido ou mais direto?") matches none. */
const TOPICS: readonly Topic[] = [
  {
    id: 'whatsapp', label: 'o WhatsApp', given: /whats\w*|\(\d{2}\)\s*\d{4,5}-?\d{4}|telefone/iu,
    asked: /\b(?:qual|quais)\b[^?]{0,50}\b(?:whats\w*|telefone|n[uú]mero|contato)\b|\bpode (?:me )?(?:passar|informar|confirmar)\b[^?]{0,50}\b(?:whats\w*|telefone|n[uú]mero|contato)\b/iu,
  },
  {
    id: 'preco', label: 'o preço', given: /R\$\s*\d|\d+\s*reais/iu,
    asked: /\b(?:qual|quais|quanto)\b[^?]{0,50}\b(?:pre[cç]o|valor|promo[cç][aã]o|oferta|desconto|custa)\b|\bpode (?:me )?(?:passar|informar|confirmar)\b[^?]{0,50}\b(?:pre[cç]o|valor|desconto)\b/iu,
  },
  {
    id: 'dias', label: 'os dias', given: /segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|\b\d{1,2}\/\d{1,2}\b/iu,
    asked: /\b(?:quais|que|em que|qual)\b[^?]{0,30}\b(?:dias?|per[ií]odo|validade)\b|\b(?:at[eé] quando|quando (?:vale|termina|come[cç]a))\b/iu,
  },
  {
    id: 'canal', label: 'o canal', given: /instagram|facebook|tiktok|stories|feed/iu,
    asked: /\b(?:qual|que)\b[^?]{0,20}\b(?:rede|canal|plataforma)\b|\bonde (?:vai|ser[aá]|vamos) (?:post|public)\w*/iu,
  },
]
/** "…é o número real?", "…está correto?": asking the person to confirm a fact they wrote themselves. */
const CONFIRM = /\b(?:real|correto|certo|mesmo|de teste|v[aá]lido|confirm\w+|\bteste\b)\b/iu
const PHONE_IN = /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/u
const digitsOf = (text: string): string => text.replace(/\D/gu, '')
/** An image file named in the question together with housekeeping words: the team asking the person about its own mess in the folder. */
const WORKBENCH_FILE = /[\w.-]+\.(?:svg|png|jpe?g|webp)\b/iu
const WORKBENCH_WORDS = /\b(?:antig[oa]s?|rascunhos?|pasta|duplicad[oa]s?|apagar|remover|manter|sobrescrev\w+|substituir|tempor[aá]ri[oa]s?|por engano|lixo)\b/iu
const SECRET = /\b(?:senha|token|chave (?:de )?api|api key|c[óo]digo de (?:verifica\w+|seguran\w+)|2fa)\b/iu

/**
 * @param request - The text the person wrote (the facts the team must not ask again). Absent = nothing counts as given (no question is called "already answered").
 * @returns One finding per (question, rule).
 */
export function sillyAskFindings(transcript: TeamTranscript, request?: string): SillyAskFinding[] {
  const out: SillyAskFinding[] = []
  const requestPhone = request === undefined ? '' : digitsOf(PHONE_IN.exec(request)?.[0] ?? '')
  for (const ask of transcript.asks) {
    const text = ask.question
    const add = (rule: SillyAskRule, why: string): void => { out.push({ askId: ask.id, who: ask.who, rule, question: clip(text, 120), why }) }
    if (request !== undefined) {
      const topic = TOPICS.find(item => item.given.test(request) && item.asked.test(text))
      if (topic !== undefined) add('dado do pedido', `asks ${topic.label}, which the request already says`)
      else if (requestPhone !== '' && digitsOf(text).includes(requestPhone) && CONFIRM.test(text)) add('dado do pedido', 'asks the person to confirm the WhatsApp number they wrote in the request')
    }
    if (WORKBENCH_FILE.test(text) && WORKBENCH_WORDS.test(text)) add('bancada do time', 'asks the person about a file in the team\'s own working folder')
    if (text.length > ASK_MAX_CHARS) add('pergunta longa', `${String(text.length)} characters (the limit is ${String(ASK_MAX_CHARS)})`)
    if (SECRET.test(text)) add('segredo em texto aberto', 'asks for a password/key/code in clear text instead of the Cofre card')
  }
  return out
}

// ══ FALSE DONE ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type FalseDoneRule = 'pronto sem entrega' | 'arquivo que não existe' | 'passagem sem bilhete' | 'resumo Pronto sobre trabalho parado'

export interface FalseDoneFinding { readonly where: string; readonly rule: FalseDoneRule; readonly match: string; readonly why: string }

/** A claim word at the START of a line: "Pronto!", "Feito.", "Tudo certo", "Concluído". */
const CLAIM_START = /^\s*(?:pronto|feito|tudo (?:certo|pronto)|conclu[ií]d[oa]|finalizad[oa]|entregue|resolvido|ok)\b[\s!.:;✓✔👍🎉-]*/iu
/** What a bare claim may carry besides the claim word and a few filler words and still be "nothing" (a sticker, "Pronto, Lia!"). */
const BARE_REST_MAX = 24
const FILE_NAME = /[\w.-]+\.(?:svg|png|jpe?g|webp)\b/giu
/** A verb that says the file is there: "salvei", "criei", "está pronta em", "ficou em", "entregue em". */
const FILE_CLAIM = /\b(?:salvei|criei|gerei|exportei|fiz|entreguei|ficou|est[aá] (?:pronta?|salv[oa]|feit[oa]|em|dispon[ií]vel)|pronta?\s+em|entregue\s+em|salv[oa]\s+em)\b/iu
const SENT_CLAIM = /\b(?:[Pp]assei|[Ee]nviei|[Mm]andei|[Ee]ncaminhei|[Pp]edi)\b[^.!?\n]{0,40}?(?<!\p{L})(?:para|ao|à|a)\s+(\p{Lu}\p{L}+)|\b[Ff]oi\s+(?:passad|enviad|encaminhad|mandad)[oa]\s+(?:para|ao|à|a)\s+(\p{Lu}\p{L}+)/u
/** A line the HOST writes when the round could not go on. The "Pronto:" summary must not be posted over it. */
const STALLED = /n[ãa]o deu para seguir|nada foi iniciado|limite de execu[cç][õo]es reais/iu
const SUMMARY = /^\s*Pronto\s*:/u

const baseOf = (path: string): string => (path.replace(/\\/gu, '/').split('/').pop() ?? path).toLowerCase()

export function falseDoneFindings(transcript: TeamTranscript): FalseDoneFinding[] {
  const out: FalseDoneFinding[] = []
  const names = new Set<string>()
  for (const draft of transcript.drafts ?? []) for (const file of draft.files) names.add(baseOf(file.path))
  for (const line of transcript.lines) for (const attachment of line.attachments) names.add(baseOf(attachment))
  const drafted = (transcript.drafts ?? []).length > 0

  for (const line of personaWords(transcript)) {
    const where = `line ${line.id} (${line.who})`
    const text = visibleText(line.text)
    // 1 — a bare claim: nothing but "Pronto!" (and a sticker) in the line.
    const claim = CLAIM_START.exec(text)
    if (claim !== null) {
      const rest = text.slice(claim[0].length).replace(/[\s\p{P}\p{S}]+/gu, ' ').trim()
      if (rest.length <= BARE_REST_MAX) out.push({ where, rule: 'pronto sem entrega', match: clip(text, 60), why: 'the line says it is done and carries no delivery' })
    }
    // 2 — a file said to be saved/ready that no draft holds. Only when the drafts could be read (a transcript with none has nothing to compare), never for a file named inside a denial.
    if (drafted && FILE_CLAIM.test(text)) {
      for (const match of text.matchAll(FILE_NAME)) {
        const before = text.slice(Math.max(0, match.index - 45), match.index)
        if (/\bn[ãa]o\b[^.!?\n]*$/iu.test(before) || /\b(?:substituir|substitua|remover|apagar|exportar|exporte)\b[^.!?\n]*$/iu.test(before)) continue
        if (!names.has(baseOf(match[0]))) out.push({ where, rule: 'arquivo que não existe', match: match[0], why: 'the line says the file is saved/ready but no draft of the round holds it' })
      }
    }
    // 3 — "passei ao Téo" / "foi enviado ao Téo" with no bilhete from her to him.
    const sent = SENT_CLAIM.exec(text)
    if (sent !== null) {
      const target = sent[1] ?? sent[2] ?? ''
      if (transcript.personas.includes(target) && !transcript.notes.some(note => note.from === line.who && note.to === target)) {
        out.push({ where, rule: 'passagem sem bilhete', match: clip(sent[0], 60), why: `no bilhete from ${line.who} to ${target} exists` })
      }
    }
  }

  // 4 — the host's "Pronto:" summary over work that stopped or was never sealed.
  const summaries = transcript.lines.filter(line => SUMMARY.test(line.text))
  if (summaries.length > 0) {
    const stalled = transcript.lines.find(line => STALLED.test(line.text))
    const unsealed = transcript.reviews.filter(review => !review.sealed || review.failure !== null)
    for (const line of summaries) {
      const why = stalled !== undefined ? `the thread also says "${clip(stalled.text, 60)}"`
        : unsealed.length > 0 ? `${String(unsealed.length)} review(s) without a seal (${unsealed.map(review => `${review.author} → ${review.reviewer}: ${review.status}`).join('; ')})`
          : undefined
      if (why !== undefined) out.push({ where: `line ${line.id} (${line.who})`, rule: 'resumo Pronto sobre trabalho parado', match: clip(line.text, 60), why })
    }
  }
  return out
}

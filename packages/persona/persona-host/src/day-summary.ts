/**
 * Marco Dogfood M2 — o RESUMO DO DIA da responsável (contrato: persona-spec/contracts/marco-dogfood-resumo.md). PURO: fatos estruturados do quadro entram, o texto do post sai (ou `undefined` num dia vazio).
 * Sem modelo, sem relógio, sem host: testável, sem custo de cota, e nada que um modelo disse num turno entra aqui.
 *
 * Quem monta os fatos (project-lead.ts) já os calcula pela visão do leitor MENOS privilegiado e só deste projeto (cartão de DM, memória de DM e id de registro nem chegam aqui). Este arquivo é a segunda
 * barreira para o que ele não pode saber: SEGREDO em qualquer campo de texto, texto TÉCNICO (caminho, arquivo, hash), o limite de 100 palavras e o tom.
 */
import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { VISIBLE_WORD_LIMIT, codeify, composeSpeech, isTechnical } from './speech.ts'

/** O que o quadro entrega ao resumo (formato combinado com o Flint, 12/11 14:30). */
export interface DaySummaryFacts {
  readonly projectId: string
  /** O dia LOCAL que acabou, `AAAA-MM-DD`. */
  readonly dayLocal: string
  readonly responsible: { readonly id: string; readonly name: string }
  readonly done: readonly { readonly title: string; readonly by: string }[]
  readonly doing: readonly { readonly title: string; readonly by: string }[]
  /** O que espera o dono, o mais antigo primeiro. `sinceDay` < `dayLocal` = já esperava de dias anteriores (vira só a contagem). */
  readonly waiting: readonly { readonly question: string; readonly kind: 'approval' | 'question' | 'review'; readonly sinceDay: string }[]
  readonly stuck: readonly { readonly title: string; readonly reason: string; readonly chasedBy?: string }[]
  /** Só memória de escopo `team` guardada no dia. */
  readonly teamMemory: readonly string[]
  readonly ceiling?: 'quota' | 'turns'
  readonly tomorrow: readonly string[]
}

/** O post: `text` é o corpo COMPLETO a postar (parte visível + a dobra `<details>` quando existe); `details` é só o conteúdo da dobra. */
export interface DaySummaryText {
  readonly text: string
  readonly details?: string
}

const SECRET = /\b(?:senha|password|passwd|token|api[\s_-]?key|chave\s+(?:de\s+)?api|chave\s+privada|secret|segredo|cvv)\b|\d[\d .-]{11,}\d/iu
const PROTECTED_CARD = 'um cartão com dado protegido'
const PROTECTED_THING = 'um dado protegido'
const TECHNICAL_CARD = 'um cartão técnico'
const SHOWN_DONE = 3
const SHOWN_DOING = 2
const SHOWN_WAITING = 3
const SHOWN_STUCK = 2
const TITLE_CHARS = 60
const LINE_CHARS = 120

/** @returns O id da mensagem do resumo: um por projeto por dia local (postar de novo depois de reiniciar o host não duplica). */
export function daySummaryId(projectId: string, dayLocal: string): string {
  return `day-summary-${projectId}-${dayLocal}`
}

/**
 * @param iso - Um instante.
 * @param offsetMinutes - O fuso da máquina naquele instante (minutos a leste de UTC; Brasília = -180).
 * @returns O dia do relógio local, `AAAA-MM-DD` (02:30Z em UTC-3 ainda é o dia anterior).
 */
export function localDayOf(iso: string, offsetMinutes: number): string {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10) : iso.slice(0, 10)
}

const isSecret = (text: string): boolean => SECRET.test(text) || looksLikeCredential(text)
const clip = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`
}
const words = (text: string): number => text.split(/\s+/u).filter(part => part !== '').length
const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many)

/** What a piece of text becomes in the visible part, and what goes to the fold in full (never a secret: it is replaced everywhere). */
interface Shown {
  readonly visible: string
  /** The full text for the fold when the visible one is a stand-in for a technical text. */
  readonly folded?: string
}

function shownText(text: string, secretStandIn: string, technicalStandIn: string, limit: number): Shown {
  if (isSecret(text)) return { visible: secretStandIn }
  const flat = clip(text, limit)
  if (isTechnical(flat)) return { visible: technicalStandIn, folded: codeify(flat) }
  return { visible: flat }
}

const titleShown = (title: string): Shown => shownText(title, PROTECTED_CARD, TECHNICAL_CARD, TITLE_CHARS)
const withBy = (shown: Shown, by: string): string => (by.trim() === '' ? shown.visible : `${shown.visible} (${by.trim()})`)

/** A section: its visible line, and what it adds to the fold. `optional` ones are the first to move to the fold when the 100 words do not fit. */
interface Section {
  readonly visible: string
  readonly folded: readonly string[]
  readonly optional: boolean
}

function listLine(label: string, items: readonly string[], shown: number): string {
  const first = items.slice(0, shown).map(item => item.replace(/[.\s]+$/u, '')).join(', ')
  const more = items.length - shown
  return `${label}: ${first}${more > 0 ? ` e mais ${String(more)}` : ''}.`
}

/**
 * @param facts - What the board gives the summary (see {@link DaySummaryFacts}).
 * @returns The post, or `undefined` on an empty day (the host keeps a `quiet-day` row in its activity log and posts NOTHING: the right to silence).
 */
export function composeDaySummary(facts: DaySummaryFacts): DaySummaryText | undefined {
  const active = facts.done.length + facts.doing.length + facts.waiting.length + facts.stuck.length > 0 || facts.ceiling !== undefined
  if (!active) return undefined

  const sections: Section[] = []
  const fold: string[] = []
  const foldTechnical = (shown: Shown): void => { if (shown.folded !== undefined) fold.push(shown.folded) }

  // Headline: the day in one sentence.
  const headline = facts.done.length > 0
    ? `Hoje o quadro andou: ${String(facts.done.length)} ${plural(facts.done.length, 'cartão ficou pronto', 'cartões ficaram prontos')}.`
    : facts.doing.length + facts.waiting.length + facts.stuck.length > 0 ? 'Hoje nada ficou pronto.' : 'Hoje não houve movimento no quadro.'
  sections.push({ visible: headline, folded: [], optional: false })

  // What waits for the owner: today's in plain words, what already waited yesterday only as a count.
  const fresh = facts.waiting.filter(item => item.sinceDay >= facts.dayLocal)
  const older = facts.waiting.filter(item => item.sinceDay < facts.dayLocal)
  if (fresh.length > 0) {
    const questions = fresh.map((item) => {
      if (isSecret(item.question)) return 'Preciso de uma decisão sua sobre um dado protegido.'
      const flat = clip(item.question, LINE_CHARS)
      if (isTechnical(flat)) { fold.push(`Pergunta: ${codeify(flat)}`); return 'Há uma decisão sua esperando; os detalhes estão abaixo.' }
      return flat
    })
    const lines = questions.slice(0, SHOWN_WAITING).map(question => `- ${question}`)
    const more = questions.length - SHOWN_WAITING
    if (more > 0) { lines.push(`- e mais ${String(more)}`); fold.push(`Esperam você: ${questions.join(' / ')}`) }
    sections.push({ visible: `Espera você:\n${lines.join('\n')}`, folded: [], optional: false })
  }
  if (older.length > 0) sections.push({ visible: `Continuam esperando você: ${String(older.length)}`, folded: [], optional: false })

  // What got stuck, and who was chased (first person, no article before a name).
  if (facts.stuck.length > 0) {
    const lines = facts.stuck.slice(0, SHOWN_STUCK).map((item) => {
      const title = titleShown(item.title)
      foldTechnical(title)
      const reason = shownText(item.reason, PROTECTED_THING, 'o motivo está nos detalhes', LINE_CHARS)
      if (reason.folded !== undefined) fold.push(`Motivo: ${reason.folded}`)
      const chased = item.chasedBy === undefined || item.chasedBy.trim() === '' ? '' : ` Cobrei ${item.chasedBy.trim()}.`
      return `Travou: ${title.visible}, ${reason.visible.replace(/\.$/u, '')}.${chased}`
    })
    const more = facts.stuck.length - SHOWN_STUCK
    sections.push({ visible: `${lines.join('\n')}${more > 0 ? `\nE mais ${String(more)} parado${more === 1 ? '' : 's'}.` : ''}`, folded: [], optional: false })
  }

  // What got done.
  if (facts.done.length > 0) {
    const shown = facts.done.map(item => ({ shown: titleShown(item.title), by: item.by }))
    for (const item of shown) foldTechnical(item.shown)
    sections.push({ visible: listLine('Pronto', shown.map(item => withBy(item.shown, item.by)), SHOWN_DONE), folded: [], optional: false })
    if (shown.length > SHOWN_DONE) fold.push(`Ficou pronto:\n${shown.map(item => `- ${withBy(item.shown, item.by)}`).join('\n')}`)
  }

  // The ceiling: said once, in the owner's words.
  if (facts.ceiling !== undefined) {
    sections.push({
      visible: facts.ceiling === 'quota'
        ? 'A cota de hoje está quase no fim; segurei cartões novos até amanhã.'
        : 'O limite de trabalho de hoje foi atingido; segurei cartões novos até amanhã.',
      folded: [],
      optional: false,
    })
  }

  // What is moving now.
  if (facts.doing.length > 0) {
    const shown = facts.doing.map(item => ({ shown: titleShown(item.title), by: item.by }))
    for (const item of shown) foldTechnical(item.shown)
    const line = listLine('Andando', shown.map(item => withBy(item.shown, item.by)), SHOWN_DOING)
    sections.push({ visible: line, folded: shown.length > SHOWN_DOING ? [`Andando:\n${shown.map(item => `- ${withBy(item.shown, item.by)}`).join('\n')}`] : [], optional: true })
  }

  // What the team learned today (team memory only; a line with a secret is dropped, a technical one goes to the fold).
  const memory = facts.teamMemory.filter(line => line.trim() !== '' && !isSecret(line))
  if (memory.length > 0) {
    const shown = memory.map(line => shownText(line, '', 'um detalhe técnico', LINE_CHARS))
    for (const item of shown) foldTechnical(item)
    sections.push({ visible: listLine('O time aprendeu', shown.slice(0, 2).map(item => item.visible), 1), folded: memory.length > 1 ? [`O time aprendeu:\n${shown.map(item => `- ${item.folded ?? item.visible}`).join('\n')}`] : [], optional: true })
  }

  // What comes first tomorrow.
  if (facts.tomorrow.length > 0) {
    const shown = facts.tomorrow.map(title => titleShown(title))
    for (const item of shown) foldTechnical(item)
    sections.push({ visible: `Amanhã começo por: ${shown.slice(0, 3).map(item => item.visible).join(', ')}.`, folded: shown.length > 3 ? [`Amanhã:\n${shown.map(item => `- ${item.visible}`).join('\n')}`] : [], optional: true })
  }

  // The 100 words: what does not fit moves to the fold (the optional sections first, the last one first), never cut in the middle.
  const kept = [...sections]
  const visibleOf = (): string => kept.map(section => section.visible).join('\n\n')
  while (words(visibleOf()) > VISIBLE_WORD_LIMIT) {
    const at = kept.map(section => section.optional).lastIndexOf(true)
    if (at < 0) break
    const [moved] = kept.splice(at, 1)
    if (moved !== undefined) fold.push(moved.visible)
  }
  for (const section of kept) fold.push(...section.folded)

  const visible = visibleOf()
  const details = [...new Set(fold.filter(part => part.trim() !== ''))].join('\n\n')
  const text = composeSpeech(visible, details === '' ? [] : [details])
  return details === '' ? { text } : { text, details }
}

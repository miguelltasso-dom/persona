/**
 * A short human title for one PART of a request (EQUIPE-REAL, EQUIPE-REAL-SPEC §0): "Texto da campanha de lançamento", never the
 * person's whole sentence cut in the middle of a word. Pure and deterministic (no model): it takes the part's function ("texto"), the
 * request the person wrote, drops the politeness and the verb ("preciso de", "monte um time para"), the list of functions that follows
 * the colon and the @mentions, and keeps the subject with its article ("da campanha", "do cardápio"), cut at a word boundary.
 */

/** Longest title, in letters (function + subject + the ellipsis when the subject was cut). */
export const TASK_TITLE_MAX = 48

const MENTIONS = /(?:^|\s)@\S+/gu
const POLITE = /^(?:por favor|pf|oi|olá|ola|bom dia|boa tarde|boa noite)[\s,.:;!-]*/iu
const WANT = /^(?:eu\s+)?(?:preciso|precisamos|quero|queremos|gostaria|gostaríamos|gostariamos|precisava|queria)\s+(?:de\s+|que\s+)?/iu
const ASK = /^(?:você\s+|voce\s+)?(?:poderia|poderiam|pode|podem|consegue|conseguem)\s+/iu
// The formal imperative ("faça", "monte") and the informal one people really type ("faz", "monta", "cria"), with the "me"/"nos" they put before it.
const VERB = /^(?:(?:me|nos)\s+)?(?:faça|faca|façam|facam|faz|fazer|monte|montem|monta|montar|crie|criem|cria|criar|escreva|escrevam|escreve|escrever|prepare|preparem|prepara|preparar|produza|produzam|produz|produzir|elabore|elaborem|elabora|elaborar|redija|redijam|redige|redigir|desenhe|desenhem|desenha|desenhar|planeje|planejem|planeja|planejar|organize|organizem|organiza|organizar|revise|revisem|revisa|revisar)(?:\s+|$)/iu
const YOU = /^(?:você|voce)\s+/iu
/** Filler at the end of a subject: "... do nosso produto", "... da minha loja" (a possessive or demonstrative phrase). */
const FILLER_TAIL = /\s+(?:d[aeo]s?|para|pel[ao]s?|em|n[aoe]s?)\s+(?:(?:a|o|as|os)\s+)?(?:nosso|nossa|nossos|nossas|meu|minha|meus|minhas|seu|sua|seus|suas|deste|desta|desse|dessa|este|esta|esse|essa)\b.*$/iu
const TEAM_FOR = /^(?:um|uma)\s+(?:time|equipe)\s+para\s+/iu
const ARTICLE = /^(um|uma|uns|umas|o|a|os|as)\s+/iu

type Article = 'a' | 'as' | 'o' | 'os'

const FEMININE_NOUN = /(?:ção|são|dade|gem|agem|ez|ice|ura|eza|ia)$/iu
const MASCULINE_A = new Set(['dia', 'mapa', 'problema', 'sistema', 'tema', 'programa', 'planeta', 'cinema', 'clima', 'idioma', 'diagrama', 'esquema', 'telefonema', 'dilema', 'poema'])

function flat(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function capitalized(value: string): string {
  return value === '' ? value : `${value.charAt(0).toLocaleUpperCase('pt-BR')}${value.slice(1)}`
}

/** The contraction of "de" with the article of the subject ("da", "do", "das", "dos"); plain "de" when the gender is not clear. */
function prepositionFor(article: Article | undefined, subject: string): string {
  if (article !== undefined) return { a: 'da', as: 'das', o: 'do', os: 'dos' }[article]
  const word = (subject.split(' ')[0] ?? '').toLocaleLowerCase('pt-BR')
  if (word === '') return 'de'
  if (MASCULINE_A.has(word)) return 'do'
  if (word.endsWith('s')) return 'de' // plural without an article: "de" reads right ("Texto de posts")
  if (word.endsWith('a') || FEMININE_NOUN.test(word)) return 'da'
  if (/(?:o|or|al|ema|ão)$/iu.test(word)) return 'do'
  return 'de'
}

/** The cut at the last whole word that fits, with an ellipsis; a single long word is kept whole. */
function atWord(value: string, max: number): string {
  if (value.length <= max) return value
  const room = Math.max(1, max - 1) // the ellipsis takes one letter
  const cut = value.slice(0, room + 1)
  const space = cut.lastIndexOf(' ')
  const head = (space > 0 ? cut.slice(0, space) : value.split(' ')[0] ?? value).replace(/[\s,;:.–—-]+$/u, '')
  return `${head}…`
}

/**
 * The subject of a request: what it is about, without the way it was asked, and the article it came with (it fixes "da" × "do").
 * @param request - The person's words.
 * @param label - The function asked of this part ("texto"), to drop it when the request repeats it ("o texto da campanha").
 */
export function subjectOf(request: string, label: string = ''): { readonly subject: string; readonly article?: Article } {
  let text = flat(request.replace(MENTIONS, ' '))
  // "...: texto, arte e posts" — what follows the colon is the list of functions, not the subject.
  const colon = text.indexOf(':')
  if (colon > 0) text = text.slice(0, colon)
  for (const step of [POLITE, WANT, ASK, YOU, VERB, TEAM_FOR]) text = text.replace(step, '')
  let article: Article | undefined
  // "preciso do cardápio": the want verb left a contracted preposition ("do", "da", "dos", "das"): it carries the article.
  const contracted = /^d(os|as|o|a)\s+/iu.exec(text)
  if (contracted?.[1] !== undefined) {
    const word = contracted[1].toLowerCase()
    article = word === 'o' || word === 'a' || word === 'os' || word === 'as' ? word : undefined
    text = text.slice(contracted[0].length)
  }
  const leading = article === undefined ? ARTICLE.exec(text) : null
  if (leading?.[1] !== undefined) {
    const word = leading[1].toLowerCase()
    article = word === 'um' || word === 'o' ? 'o' : word === 'uma' || word === 'a' ? 'a' : word === 'uns' || word === 'os' ? 'os' : 'as'
    text = text.slice(leading[0].length)
  }
  // "o texto da campanha" asked of the part "texto": the function is already in the title; the subject is what comes after.
  const first = flat(label).split(/[,\s]+/u)[0] ?? ''
  if (first !== '') {
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const repeated = new RegExp(`^(?:${escaped})\\s+(?:d([aeo]s?)|para)\\s+(?:(a|o|as|os)\\s+)?`, 'iu').exec(text)
    if (repeated !== null) {
      const next = repeated[2]?.toLowerCase() ?? (repeated[1]?.toLowerCase().startsWith('a') ? 'a' : repeated[1]?.toLowerCase().startsWith('o') ? 'o' : undefined)
      article = next === 'a' || next === 'as' || next === 'o' || next === 'os' ? next : undefined
      text = text.slice(repeated[0].length)
    }
  }
  text = flat(text).replace(FILLER_TAIL, '').replace(/[\s,;:.!?–—-]+$/u, '')
  return article === undefined ? { subject: text } : { subject: text, article }
}

/**
 * The SHORT NAME of a part ("Texto", "Arte", "Posts"), next to its longer title: the function alone, capitalized, for the chip and the plan card.
 * @param label - The function of the part (several cues joined are fine: "texto, arte").
 */
export function humanPartName(label: string): string {
  return atWord(capitalized(flat(label)), TASK_TITLE_MAX)
}

/**
 * The title of a part: its function and the subject, short, at a word boundary.
 * @param label - The function of the part ("texto", "arte", "posts"; several cues joined are fine).
 * @param request - What the person asked, in their words (cut at a word, never in the middle of one).
 * @returns "Texto da campanha de lançamento"; the function alone when nothing of the subject is left.
 */
export function humanTaskTitle(label: string, request: string): string {
  const head = capitalized(flat(label))
  const { subject, article } = subjectOf(request, label)
  if (head === '') return atWord(capitalized(subject), TASK_TITLE_MAX)
  if (subject === '') return atWord(head, TASK_TITLE_MAX)
  const preposition = head.includes(',') ? 'de' : prepositionFor(article, subject)
  const start = `${head} ${preposition} `
  return `${start}${atWord(subject, Math.max(1, TASK_TITLE_MAX - start.length))}`
}

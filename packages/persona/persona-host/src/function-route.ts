/**
 * TEAM-13 (D-090 #1): without an @mention the request goes to the persona of the FUNCTION it asks for, not to "the first one that is
 * not Coordination". A request that lists several functions ("texto, arte e posts") is split into one part per persona.
 *
 * Pure and deterministic (no model, no I/O): the same words always pick the same persona, so the thread can say who took what and a
 * test can prove it. The function of a persona is read from its OWN words (title, description) through a small pt-BR vocabulary of
 * work areas; a persona with a custom function falls back to the words it uses itself. When nothing matches the caller keeps the old
 * default — this module never invents a match.
 */

/** What the router needs to know about a persona. */
export interface RoutablePersona {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly description: string
  /** Coordination never takes a function part: it routes. */
  readonly coordination: boolean
  readonly paused: boolean
}

/** One persona and the words of the request that named its function. */
export interface FunctionPart {
  readonly persona: RoutablePersona
  /** The request's own words (accents kept), in order, without repeats. */
  readonly cues: readonly string[]
}

/** `single`: one persona owns the request. `split`: the request lists functions of different personas, one part each. */
export type FunctionRoute =
  | { readonly kind: 'single'; readonly part: FunctionPart }
  | { readonly kind: 'split'; readonly parts: readonly FunctionPart[] }

interface Family {
  /** Stems of the words a persona's title/description uses for this function. */
  readonly persona: readonly string[]
  /** Words (accent-free, lower case) a request uses to ask for this function. */
  readonly asks: readonly string[]
}

const FAMILIES: Readonly<Record<string, Family>> = {
  texto: {
    persona: ['redac', 'redat', 'texto', 'copy', 'escrit', 'escrev', 'conteud', 'editor', 'jornal', 'roteir', 'comunic', 'letr'],
    asks: ['texto', 'textos', 'redacao', 'copy', 'copywriting', 'legenda', 'legendas', 'artigo', 'artigos', 'roteiro', 'newsletter', 'release', 'descricao', 'slogan', 'blog', 'escrever', 'redigir', 'revisar'],
  },
  arte: {
    persona: ['design', 'arte', 'visual', 'ilustr', 'criativ', 'grafic', 'ux', 'marca', 'identidad'],
    asks: ['arte', 'artes', 'design', 'imagem', 'imagens', 'cartaz', 'cartazes', 'banner', 'banners', 'logo', 'logotipo', 'layout', 'capa', 'identidade', 'ilustracao', 'thumbnail', 'mockup', 'flyer', 'folder', 'desenhar', 'criativo', 'criativos'],
  },
  midia: {
    persona: ['midia', 'social', 'marketing', 'redes', 'community', 'divulg', 'instagram', 'trafego', 'ads', 'audiencia'],
    asks: ['post', 'posts', 'instagram', 'tiktok', 'linkedin', 'facebook', 'twitter', 'stories', 'reels', 'redes', 'calendario', 'agendar', 'anuncio', 'anuncios', 'divulgacao', 'publicar', 'social', 'midia', 'hashtag', 'hashtags'],
  },
  atendimento: {
    persona: ['atendiment', 'suporte', 'cliente', 'sac', 'relacionament', 'help'],
    asks: ['cliente', 'clientes', 'atendimento', 'suporte', 'reclamacao', 'reclamacoes', 'duvida', 'duvidas', 'sac'],
  },
  financeiro: {
    persona: ['financ', 'contab', 'fiscal', 'cobranc', 'tesour'],
    asks: ['fatura', 'faturas', 'boleto', 'boletos', 'pagamento', 'pagamentos', 'cobranca', 'cobrancas', 'orcamento', 'orcamentos', 'imposto', 'impostos', 'despesa', 'despesas', 'reembolso', 'caixa'],
  },
  pessoas: {
    persona: ['pessoas', 'rh', 'recrut', 'talent', 'gente'],
    asks: ['vaga', 'vagas', 'contratacao', 'curriculo', 'curriculos', 'candidato', 'candidatos', 'entrevista', 'entrevistas', 'ferias', 'folha'],
  },
  engenharia: {
    persona: ['engenh', 'dev', 'program', 'softw', 'codigo', 'tecnic', 'tecnolog', 'backend', 'frontend'],
    asks: ['codigo', 'bug', 'bugs', 'deploy', 'api', 'funcionalidade', 'testes', 'refatorar', 'programar', 'script'],
  },
  dados: {
    persona: ['dados', 'analis', 'analytic', 'metric', 'inteligenc'],
    asks: ['planilha', 'planilhas', 'dashboard', 'metrica', 'metricas', 'indicadores', 'kpi', 'kpis', 'grafico', 'graficos', 'analise'],
  },
  vendas: {
    persona: ['vend', 'comercial', 'negoc', 'prospec'],
    asks: ['proposta', 'propostas', 'cotacao', 'lead', 'leads', 'venda', 'vendas', 'prospeccao'],
  },
}

/** Words that may sit between two functions of one list ("o texto, a arte e os posts"). */
const FILLER = new Set(['e', 'ou', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'mais', 'alem', 'tambem', 'com', 'para', 'pra', 'novo', 'nova', 'novos', 'novas', 'seu', 'sua'])
/** Words a persona's description uses that say nothing about its function. */
const GENERIC = new Set(['equipe', 'projeto', 'projetos', 'trabalho', 'pedido', 'pedidos', 'ajuda', 'ajudar', 'responsavel', 'tarefa', 'tarefas', 'empresa', 'geral', 'sempre', 'prova', 'direto', 'implementa'])

/** Largest list one request is split into. */
export const MAX_FUNCTION_PARTS = 5

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
}

interface Word { readonly folded: string; readonly shown: string }

function wordsOf(text: string): Word[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map(shown => ({ folded: fold(shown), shown }))
}

/** The work areas a persona declares through its own title and description. */
function familiesOf(persona: RoutablePersona): Set<string> {
  const own = wordsOf(`${persona.title} ${persona.description}`).map(word => word.folded)
  const found = new Set<string>()
  for (const [id, family] of Object.entries(FAMILIES)) {
    if (own.some(word => family.persona.some(stem => word.startsWith(stem)))) found.add(id)
  }
  return found
}

function familyOfAsk(folded: string): string | undefined {
  const singular = folded.endsWith('s') ? folded.slice(0, -1) : folded
  for (const [id, family] of Object.entries(FAMILIES)) {
    if (family.asks.includes(folded) || family.asks.includes(singular)) return id
  }
  return undefined
}

/**
 * The work area a word of a request asks for ("texto", "arte", "midia"…), whatever its accents or case.
 * @param word - One word of the request.
 * @returns The family id, or undefined when the word names no function of the vocabulary.
 */
export function familyOfCue(word: string | undefined): string | undefined {
  return word === undefined ? undefined : familyOfAsk(fold(word))
}

/** The persona that owns a word of the request: the first persona (roster order) whose function is the word's. */
function ownerOfWord(word: Word, candidates: readonly { persona: RoutablePersona; families: Set<string> }[]): RoutablePersona | undefined {
  const family = familyOfAsk(word.folded)
  if (family === undefined) return undefined
  return candidates.find(item => item.families.has(family))?.persona
}

function partsOf(hits: readonly { word: Word; persona: RoutablePersona }[]): FunctionPart[] {
  const order: RoutablePersona[] = []
  for (const hit of hits) if (!order.some(item => item.id === hit.persona.id)) order.push(hit.persona)
  return order.map(persona => ({
    persona,
    cues: [...new Set(hits.filter(hit => hit.persona.id === persona.id).map(hit => hit.word.shown.toLowerCase()))],
  }))
}

/**
 * Decide who takes a request that did not name anyone.
 * @param personas - The project's personas in roster order.
 * @param body - The request, as the person wrote it.
 * @returns The persona of its function (`single`), one part per persona when the request lists several functions (`split`), or
 *          undefined when nothing in it names a function of the team (the caller keeps its default).
 */
export function routeByFunction(personas: readonly RoutablePersona[], body: string): FunctionRoute | undefined {
  const candidates = personas.filter(persona => !persona.coordination).map(persona => ({ persona, families: familiesOf(persona) }))
  if (candidates.length < 2) return undefined // nobody to choose between
  const words = wordsOf(body)
  const hits: { index: number; word: Word; persona: RoutablePersona }[] = []
  words.forEach((word, index) => {
    const persona = ownerOfWord(word, candidates)
    if (persona !== undefined) hits.push({ index, word, persona })
  })
  if (hits.length > 0) {
    // A list: hits joined only by separators/fillers ("texto, arte e posts"). The longest run that names 2+ personas is the split.
    const runs: (typeof hits)[] = []
    let run: typeof hits = []
    for (const hit of hits) {
      const last = run[run.length - 1]
      const between = last === undefined ? [] : words.slice(last.index + 1, hit.index)
      const joined = last !== undefined && between.length <= 3 && between.every(word => FILLER.has(word.folded))
      if (last === undefined || joined) run.push(hit)
      else { runs.push(run); run = [hit] }
    }
    runs.push(run)
    const best = runs
      .map(items => ({ items, parts: partsOf(items) }))
      .filter(item => item.parts.length >= 2)
      .sort((a, b) => b.parts.length - a.parts.length)[0]
    if (best !== undefined) return { kind: 'split', parts: best.parts.slice(0, MAX_FUNCTION_PARTS) }
    const parts = partsOf(hits)
    const top = [...parts].sort((a, b) => b.cues.length - a.cues.length)[0]
    return top === undefined ? undefined : { kind: 'single', part: top }
  }
  // No work-area word: a persona with a custom function is found by the words it uses itself (≥ 6 letters, same first 5).
  const generic = candidates
    .map(({ persona }) => {
      const own = wordsOf(`${persona.title} ${persona.description}`).map(word => word.folded).filter(word => word.length >= 6 && !GENERIC.has(word))
      const cues = words.filter(word => word.folded.length >= 6 && own.some(mine => mine.slice(0, 5) === word.folded.slice(0, 5)))
      return { persona, cues }
    })
    .filter(item => item.cues.length > 0)
    .sort((a, b) => b.cues.length - a.cues.length)[0]
  return generic === undefined ? undefined : { kind: 'single', part: { persona: generic.persona, cues: [...new Set(generic.cues.map(word => word.shown.toLowerCase()))] } }
}

/**
 * Who on the team does a function — no choice involved, so a team of one is read too (unlike {@link routeByFunction}, which needs two to choose
 * between). The first persona (roster order) that is not Coordination and not paused, whose own title/description names the function of `ask`.
 * @param personas - The project's personas in roster order.
 * @param ask - A word that asks for the function ("texto", "arte", "posts").
 * @returns The persona, or undefined when nobody on the team does it.
 */
export function functionOwner(personas: readonly RoutablePersona[], ask: string): RoutablePersona | undefined {
  const family = familyOfAsk(fold(ask))
  if (family === undefined) return undefined
  return personas.find(persona => !persona.coordination && !persona.paused && familiesOf(persona).has(family))
}

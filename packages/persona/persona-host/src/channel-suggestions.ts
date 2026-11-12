/**
 * Casa da Equipe (Muse §29b item 7), H4: the empty channel, illustrated, with 3 one-click suggestions made from the team of the channel. A suggestion FILLS the composer and never sends by itself (the person
 * reads it, edits it, sends it). The text comes from what each persona does (her title), deterministically: no model, nothing invented about people who are not there. At least one is always generic.
 */

/** One suggestion. */
export interface ChannelSuggestion {
  /** The stable id (the screen keys on it). */
  readonly id: string
  /** What the button says ("Pedir o resumo das vendas de hoje"). */
  readonly label: string
  /** What fills the composer (a sentence the person can send as it is, addressed to the channel). */
  readonly prompt: string
}

/** Who is on the channel, for the suggestions. */
export interface SuggestionPersona {
  readonly name: string
  readonly title: string
}

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

/** Title words → what to ask that kind of persona. Checked in this order; the first match of a persona wins. */
const BY_FUNCTION: readonly { readonly id: string; readonly words: RegExp; readonly label: string; readonly prompt: string }[] = [
  { id: 'vendas', words: /vend|comerc|loja|pedido/u, label: 'Pedir o resumo das vendas de hoje', prompt: 'Pode me mostrar o resumo das vendas de hoje?' },
  { id: 'atendimento', words: /atend|suporte|cliente|relacion/u, label: 'Pedir quem está esperando resposta', prompt: 'Quais clientes ainda estão esperando resposta?' },
  { id: 'texto', words: /reda|text|copy|conteud|legenda|marketing|social/u, label: 'Pedir uma legenda para o post de hoje', prompt: 'Escreve uma legenda para o post de hoje?' },
  { id: 'arte', words: /design|arte|criac|visual|ilustr/u, label: 'Pedir uma arte para a promoção da semana', prompt: 'Pode criar uma arte para a promoção da semana?' },
  { id: 'financeiro', words: /financ|contab|cobran|caixa/u, label: 'Pedir as contas a receber da semana', prompt: 'Quais contas vencem ou chegam esta semana?' },
  { id: 'pesquisa', words: /pesquis|analis|dados|mercado/u, label: 'Pedir uma pesquisa sobre um concorrente', prompt: 'Pode pesquisar o que um concorrente nosso está fazendo?' },
  { id: 'engenharia', words: /engenh|desenvolv|codigo|sistema|tecnic/u, label: 'Pedir o que ficou pendente no sistema', prompt: 'O que ficou pendente do lado técnico?' },
  { id: 'coordenacao', words: /coorden|gestao|gerent/u, label: 'Pedir um resumo do que a equipe fez hoje', prompt: 'Faz um resumo do que a equipe fez hoje?' },
]

const GENERIC: readonly ChannelSuggestion[] = [
  { id: 'resumo', label: 'Pedir um resumo do que a equipe fez hoje', prompt: 'Faz um resumo do que a equipe fez hoje?' },
  { id: 'semana', label: 'Pedir ajuda para planejar a semana', prompt: 'Me ajuda a planejar a semana?' },
  { id: 'pendente', label: 'Perguntar o que está pendente', prompt: 'O que está pendente por aqui?' },
]

/**
 * @param personas - Who is on the channel, in roster order.
 * @returns Exactly 3 suggestions (empty when nobody is on the channel: there is nobody to ask): one per kind of work the team does, then the generic ones, never repeated.
 */
export function suggestionsFor(personas: readonly SuggestionPersona[]): ChannelSuggestion[] {
  if (personas.length === 0) return []
  const out: ChannelSuggestion[] = []
  const seen = new Set<string>()
  for (const persona of personas) {
    const title = fold(persona.title)
    const hit = BY_FUNCTION.find(row => row.words.test(title))
    if (hit === undefined || seen.has(hit.id)) continue
    seen.add(hit.id)
    out.push({ id: hit.id, label: hit.label, prompt: hit.prompt })
    if (out.length === 3) return out
  }
  for (const generic of GENERIC) {
    if (out.length === 3) break
    if (!seen.has(generic.id) && !out.some(item => item.label === generic.label)) out.push(generic)
  }
  return out
}

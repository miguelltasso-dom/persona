/**
 * Casa da Equipe (Muse §29, item 22): which of the 8 team glyphs (`UiIcon name="equipe-…"`) an equipe wears. The HOST decides: the glyph the person (or the organogram) stored if it is one of the eight, else a default
 * by the equipe's NAME (a small Brazilian business's words, no accent, no case), else `equipe-geral`. One table, one file: Muse changes the words here.
 */

export const EQUIPE_ICONS = [
  'equipe-geral', 'equipe-vendas', 'equipe-atendimento', 'equipe-redes', 'equipe-criacao', 'equipe-coordenacao', 'equipe-financeiro', 'equipe-producao',
] as const

export type EquipeIcon = (typeof EQUIPE_ICONS)[number]

/** The words (folded: lower case, no accent) that make a name one kind. A WORD of the name must be one of these exactly (so "sac" is not "sacolas"). */
const WORDS: Readonly<Record<Exclude<EquipeIcon, 'equipe-geral'>, readonly string[]>> = {
  'equipe-vendas': ['venda', 'vendas', 'vendedor', 'vendedores', 'comercial', 'loja', 'lojas', 'balcao'],
  'equipe-atendimento': ['atendimento', 'suporte', 'sac', 'cliente', 'clientes', 'whatsapp', 'relacionamento'],
  'equipe-redes': ['rede', 'redes', 'social', 'sociais', 'instagram', 'midia', 'midias', 'marketing'],
  'equipe-criacao': ['criacao', 'design', 'designer', 'arte', 'artes', 'conteudo', 'texto', 'textos', 'redacao'],
  'equipe-coordenacao': ['coordenacao', 'gestao', 'diretoria', 'administracao', 'lideranca'],
  'equipe-financeiro': ['financeiro', 'financas', 'contas', 'cobranca', 'caixa', 'contabil', 'contabilidade'],
  'equipe-producao': ['producao', 'operacao', 'operacoes', 'cozinha', 'estoque', 'entrega', 'entregas', 'logistica'],
}

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

/**
 * @param name - The equipe's name.
 * @returns The kind its name says: the FIRST word of the name that is in the table decides (when two kinds are in the name, the first word wins), `equipe-geral` when none is.
 */
export function equipeIconByName(name: string): EquipeIcon {
  for (const word of fold(name).split(/[^a-z0-9]+/u)) {
    if (word === '') continue
    for (const [icon, words] of Object.entries(WORDS)) if (words.includes(word)) return icon as EquipeIcon
  }
  return 'equipe-geral'
}

/**
 * @param name - The equipe's name.
 * @param stored - The glyph kept for the equipe, if any (anything that is not one of the eight is ignored).
 * @returns The glyph the screens draw.
 */
export function equipeIconOf(name: string, stored?: string): EquipeIcon {
  return (EQUIPE_ICONS as readonly string[]).includes(stored ?? '') ? stored as EquipeIcon : equipeIconByName(name)
}

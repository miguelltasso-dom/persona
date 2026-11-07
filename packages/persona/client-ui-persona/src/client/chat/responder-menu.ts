/**
 * CV-3 (CONVERSAS-SPEC §3 + CV-8 §A): o "Quem responde" com a equipe inteira, e o `@nome` no texto. Puro (sem React): monta a lista, move a
 * seleção, acha o `@` sob o cursor e troca `@parte` por `@Nome `. A escolha vale SÓ para a próxima mensagem (a Coordenação volta a ser o padrão).
 */
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import type { FanoutChoice } from './fanout/fanout-rules.ts'

export type ResponderItem =
  | { readonly kind: 'fanout'; readonly choice: FanoutChoice; readonly count: number }
  | { readonly kind: 'default'; readonly member: ChannelPersonaMember }
  | { readonly kind: 'persona'; readonly member: ChannelPersonaMember }

/** Sem acento e sem caixa: "joao" acha "João". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
}

export interface BuildResponderItemsInput {
  readonly members: readonly ChannelPersonaMember[]
  /** A Coordenação (o padrão do canal); '' = sem padrão. */
  readonly defaultId: string
  /** O que a pessoa digitou na busca (ou depois do `@`). */
  readonly query: string
  /** CV-8: as duas linhas do topo ("Toda a equipe ({n})", "Quem tiver algo a dizer"); ausente = só a equipe. */
  readonly fanoutTeamCount?: number | undefined
}

/**
 * A ordem da spec: no topo as 2 linhas do CV-8 (só sem busca e só se o canal as oferece), depois "Quem responde aqui" (a Coordenação) e as
 * pessoas. Com busca, só quem combina com nome ou função; as linhas do CV-8 saem (não são pessoas).
 */
export function buildResponderItems({ members, defaultId, query, fanoutTeamCount }: BuildResponderItemsInput): readonly ResponderItem[] {
  const needle = fold(query.trim())
  const matches = (member: ChannelPersonaMember): boolean => needle === '' || fold(member.name).includes(needle) || fold(member.role).includes(needle)
  const items: ResponderItem[] = []
  if (needle === '' && fanoutTeamCount !== undefined && fanoutTeamCount >= 2) {
    items.push({ kind: 'fanout', choice: 'everyone', count: fanoutTeamCount })
    items.push({ kind: 'fanout', choice: 'relevant', count: fanoutTeamCount })
  }
  const fallback = members.find(member => member.id === defaultId)
  if (fallback !== undefined && matches(fallback)) items.push({ kind: 'default', member: fallback })
  for (const member of members) {
    if (member.id === defaultId || !matches(member)) continue
    items.push({ kind: 'persona', member })
  }
  return items
}

/** ↑↓ dão a volta; lista vazia = -1. */
export function moveResponderActive(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1
  return (current + delta + length) % length
}

export interface MentionToken {
  /** Onde o `@` começa no texto. */
  readonly start: number
  /** O que vem depois do `@` até o cursor. */
  readonly query: string
}

/**
 * O `@` que o cursor está terminando de escrever: no começo do texto ou depois de espaço, seguido só de letras/números/_/-.
 * `a@b.com` não é menção (o `@` está colado numa palavra).
 */
export function activeMentionToken(text: string, caret: number): MentionToken | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before)
  if (match === null) return null
  const query = match[2] ?? ''
  return { start: caret - query.length - 1, query }
}

/** Troca `@parte` por `@Nome ` e devolve o texto novo e onde fica o cursor. */
export function insertMention(text: string, token: MentionToken, caret: number, name: string): { readonly text: string; readonly caret: number } {
  const handle = `@${name.replace(/\s+/gu, '')} `
  const next = `${text.slice(0, token.start)}${handle}${text.slice(caret)}`
  return { text: next, caret: token.start + handle.length }
}

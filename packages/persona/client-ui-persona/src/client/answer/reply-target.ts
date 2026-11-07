/**
 * IV-10 · "Responder" a uma pergunta da persona em PALAVRAS (DECISIONS-SPEC §"Responder a uma pergunta da persona"; contrato:
 * `contracts/attention-answer.md`, Forge). A resposta é escrita no COMPOSER do fio onde a pergunta foi feita, nunca num campo novo dentro
 * do cartão: o botão "Responder" do cartão de decisão só ESCOLHE o alvo (esta loja), leva ao fio e foca o composer; o composer mostra o chip
 * "Respondendo a {persona}: {pergunta} · ✕" e, ao enviar, chama `answerAttention` em vez de `postMessage`.
 *
 * Esta loja é o único estado compartilhado entre o cartão (Aprovações / Visão geral) e o composer (canal / DM): um alvo por vez; o ✕ limpa
 * o alvo SEM apagar o texto que a pessoa já escreveu.
 */
import { useSyncExternalStore } from 'react'

export interface ReplyTarget {
  /** A Tarefa que espera a resposta (`answerAttention({ticketId})`). */
  readonly ticketId: string
  readonly personaId: string
  readonly personaName: string
  /** A pergunta como a persona a fez (o chip a resume). */
  readonly question: string
  /** Onde a pergunta foi feita: o composer certo é o desta conversa (os arquivos sobem para ela). */
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
}

export interface ReplyTargetStore {
  get(): ReplyTarget | undefined
  set(target: ReplyTarget): void
  clear(): void
  subscribe(listener: () => void): () => void
}

export function createReplyTargetStore(): ReplyTargetStore {
  let current: ReplyTarget | undefined
  const listeners = new Set<() => void>()
  const emit = (): void => { for (const listener of [...listeners]) listener() }
  return {
    get: () => current,
    set: (target) => { current = target; emit() },
    clear: () => { if (current === undefined) return; current = undefined; emit() },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

/** A loja do app (um alvo por vez, como há um composer em foco por vez). Os testes criam a própria com {@link createReplyTargetStore}. */
export const replyTargetStore: ReplyTargetStore = createReplyTargetStore()

export function useReplyTarget(store: ReplyTargetStore = replyTargetStore): ReplyTarget | undefined {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** O alvo só vale na conversa onde a pergunta foi feita: o composer de outra conversa não o mostra nem o usa. */
export function targetFor(target: ReplyTarget | undefined, streamKind: 'channel' | 'dm', ownerId: string): ReplyTarget | undefined {
  return target !== undefined && target.streamKind === streamKind && target.ownerId === ownerId ? target : undefined
}

/** A pergunta em uma linha para o chip: espaços juntos e, se passar de `max`, cortada numa palavra inteira com "…". */
export function summarizeQuestion(question: string, max = 80): string {
  const flat = question.replace(/\s+/gu, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const words = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut
  return `${words.replace(/[\s,;:.\-–—]+$/u, '')}…`
}

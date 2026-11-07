/**
 * CONVERSAS-SPEC §0 (barra lilás única): as conversas moram na própria barra. A barra precisa de duas coisas:
 *  - saber qual conversa está aberta (para pintar a linha ativa): {@link activeConversation};
 *  - abrir uma conversa com 1 clique (canal ou pessoa): `openConversation`, injetado pelo mount (ver `mount.ts`).
 * Hoje só existe o #geral como canal; quando o CV-6 (canais por equipe) chegar, o canal escolhido entra no live.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { ShellState, ShellStoreHandle } from './create-shell-store.ts'

export type ConversationTarget =
  | { readonly kind: 'channel'; readonly id: string }
  | { readonly kind: 'dm'; readonly personaId: string }

export type OpenConversation = (target: ConversationTarget) => void

/** Chave estável da conversa ("channel:geral", "dm:p-bento"): serve de `key` e para comparar. */
export function conversationKey(target: ConversationTarget): string {
  return target.kind === 'channel' ? `channel:${target.id}` : `dm:${target.personaId}`
}

export function sameConversation(a: ConversationTarget | null | undefined, b: ConversationTarget | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b || (a == null && b == null)
  return conversationKey(a) === conversationKey(b)
}

type ShellPart = Pick<ShellState, 'activePanel'>
type LivePart = Pick<PersonaLiveSnapshot, 'tenant' | 'selectedDmId' | 'dms'>

/**
 * A conversa aberta agora: canal quando a área principal é o #geral; DM quando é a tela de DMs com uma DM escolhida
 * (a pessoa do outro lado); qualquer outra tela (Visão geral, Projetos…) não tem conversa ativa.
 */
export function activeConversation(shell: ShellPart, live: LivePart): ConversationTarget | null {
  if (shell.activePanel === 'channels') {
    const id = live.tenant?.channelId
    return id === undefined || id === '' ? null : { kind: 'channel', id }
  }
  if (shell.activePanel === 'directMessages') {
    if (live.selectedDmId === null) return null
    const peer = live.dms.find(dm => dm.id === live.selectedDmId)?.peerId
    return peer === undefined || peer === '' ? null : { kind: 'dm', personaId: peer }
  }
  return null
}

/**
 * O mesmo cálculo como observável para a barra (useSyncExternalStore): o objeto só muda quando a conversa muda
 * (senão o React reclama de snapshot instável).
 */
export function createActiveConversationObservable(
  live: PersonaLiveStore,
  shell: Pick<ShellStoreHandle, 'store'>,
): HostObservable<ConversationTarget | null> {
  let lastKey = ''
  let last: ConversationTarget | null = null
  return {
    getSnapshot(): ConversationTarget | null {
      const next = activeConversation(shell.store.getSnapshot(), live.observable.getSnapshot())
      const key = next === null ? '' : conversationKey(next)
      if (key !== lastKey) {
        lastKey = key
        last = next
      }
      return last
    },
    subscribe(listener: () => void): () => void {
      const unsubscribeLive = live.observable.subscribe(listener)
      const unsubscribeShell = shell.store.subscribe(listener)
      return () => {
        unsubscribeLive()
        unsubscribeShell()
      }
    },
  }
}

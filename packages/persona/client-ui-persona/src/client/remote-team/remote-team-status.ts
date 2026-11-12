/**
 * Estado da equipe remota visto pelo resto da tela (revisão do Carbon, quill-final, item 2): o painel de equipe remota publica o
 * estado derivado; a aba Membros lê e só mostra o convite e a seção remota quando a equipe está ligada ("connected" ou "offline").
 * Antes de o painel carregar, o valor é "unknown" e a tela trata como não ligada.
 */

import { useSyncExternalStore } from 'react'
import type { RemoteTeamStatusUi } from './remote-team-model.ts'

export type RemoteTeamStatusSeen = RemoteTeamStatusUi | 'unknown'

let current: RemoteTeamStatusSeen = 'unknown'
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function read(): RemoteTeamStatusSeen {
  return current
}

/** Publica o estado derivado do painel de equipe remota; só avisa quem assina quando o valor muda. */
export function publishRemoteTeamStatus(status: RemoteTeamStatusSeen): void {
  if (status === current) return
  current = status
  for (const listener of listeners) listener()
}

/** O estado atual da equipe remota (re-renderiza quando o painel publica outro). */
export function useRemoteTeamStatus(): RemoteTeamStatusSeen {
  return useSyncExternalStore(subscribe, read, read)
}

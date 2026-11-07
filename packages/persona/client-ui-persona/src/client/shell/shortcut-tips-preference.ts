/**
 * "Dicas de atalho" (Configurações › Aparência, P1-11): liga e desliga a dica "Ctrl K → {tela} chega aqui mais rápido".
 *
 * Ligada por padrão. A preferência vive no localStorage, junto do que a dica já guarda ("uma vez por atalho, para sempre"); quem mostra a
 * dica pergunta {@link isShortcutTipsEnabled} antes de abrir o toast e escuta {@link subscribeShortcutTips} se ficar montado.
 */

import { useSyncExternalStore } from 'react'

/** Guarda "0" quando a pessoa desliga; ausente (ou qualquer outro valor) = ligada. */
export const SHORTCUT_TIPS_KEY = 'persona.shortcutTips'

const listeners = new Set<() => void>()

function localStore(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

// Sem storage (janela privada, dados limpos) a escolha vale só até recarregar.
let memory: boolean | undefined

export function isShortcutTipsEnabled(): boolean {
  if (memory !== undefined) return memory
  try {
    return localStore()?.getItem(SHORTCUT_TIPS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setShortcutTipsEnabled(enabled: boolean): void {
  memory = enabled
  try {
    localStore()?.setItem(SHORTCUT_TIPS_KEY, enabled ? '1' : '0')
  } catch {
    /* sem storage: a escolha fica na memória */
  }
  for (const listener of listeners) listener()
}

export function subscribeShortcutTips(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Zera a memória (testes). */
export function resetShortcutTipsMemory(): void {
  memory = undefined
}

/** O estado ao vivo para a tela de Aparência. */
export function useShortcutTips(): { readonly enabled: boolean; readonly setEnabled: (enabled: boolean) => void } {
  const enabled = useSyncExternalStore(subscribeShortcutTips, isShortcutTipsEnabled, () => true)
  return { enabled, setEnabled: setShortcutTipsEnabled }
}

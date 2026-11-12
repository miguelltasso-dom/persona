/**
 * Figurinhas das personas (Colheita D, D-089): ficam ATRÁS DE FLAG, desligada por padrão, até a Muse aceitar pelas capturas
 * (D-077). Mesmo formato dos balões (`chat/bubbles-flag.ts`).
 *
 * Como ligar: `localStorage.setItem('persona.flag.figurinhas', '1')` e recarregar, ou `window.__PERSONA_FLAGS__ = { figurinhas: true }`
 * antes do app montar. Desligada, nada muda no fio nem em Configurações.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { figurinhas: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const STICKERS_FLAG_KEY = 'persona.flag.figurinhas'

/** As figurinhas estão ligadas? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isStickersEnabled(): boolean {
  return readFlag('figurinhas')
}

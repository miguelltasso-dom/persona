/**
 * CV-9 (CONVERSAS-SPEC §CV-9): os BALÕES no fio entram ATRÁS DE FLAG, desligada por padrão, até a Muse aceitar pelas capturas (D-077):
 * a mudança afeta a conversa inteira e não vai num instalador sem aceite. Mesmo formato da `navPlaces` (`shell/nav-flag.ts`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.bubbles', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { bubbles: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0'). Desligada, o fio é o de antes.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { bubbles: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const BUBBLES_FLAG_KEY = 'persona.flag.bubbles'

/** Os balões estão ligados? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isBubblesEnabled(): boolean {
  return readFlag('bubbles')
}

/**
 * D-077: a navegação em 6 lugares (NAV-SPEC A-1) entra ATRÁS DE FLAG, desligada por padrão, e só liga depois do
 * aceite da Muse. Desligada, o app é o de antes (rail com grupos, sem barra de abas, rodapé do DSW).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.navPlaces', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { navPlaces: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0').
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { navPlaces: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const NAV_PLACES_FLAG_KEY = 'persona.flag.navPlaces'

/** A navegação em 6 lugares está ligada? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isPlacesNavEnabled(): boolean {
  return readFlag('navPlaces')
}

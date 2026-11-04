/**
 * D-077: a navegação em 6 lugares (NAV-SPEC A-1) entra ATRÁS DE FLAG, desligada por padrão, e só liga depois do
 * aceite da Muse. Desligada, o app é o de antes (rail com grupos, sem barra de abas, rodapé do DSW).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.navPlaces', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { navPlaces: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0').
 */

export const NAV_PLACES_FLAG_KEY = 'persona.flag.navPlaces'

interface FlagWindow {
  readonly __PERSONA_FLAGS__?: { readonly navPlaces?: boolean }
}

/** A navegação em 6 lugares está ligada? Nunca lança (storage bloqueado = desligada). */
export function isPlacesNavEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as unknown as FlagWindow).__PERSONA_FLAGS__?.navPlaces === true) return true
  } catch {
    /* janela sem acesso às flags: segue para o storage */
  }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(NAV_PLACES_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Os ENFEITES da casa e da noite (NIGHT-THEME-SPEC §2–4, BR-P4) entram ATRÁS DE FLAG, desligada por padrão, até a Muse aceitar pelas
 * capturas (D-077). Mesmo formato da `bubbles` (`chat/bubbles-flag.ts`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.houseDecor', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { houseDecor: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0'). Desligada, nenhuma tela muda: nem um pixel, nem um nó a mais no DOM.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { houseDecor: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const HOUSE_DECOR_FLAG_KEY = 'persona.flag.houseDecor'

/** Os enfeites da casa estão ligados? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isHouseDecorEnabled(): boolean {
  return readFlag('houseDecor')
}

/** O atributo que os enfeites só de CSS leem (`body[data-house-decor]`): o brilho do selo "não lido" no escuro. Sem a flag, nenhum atributo. */
export const HOUSE_DECOR_ATTRIBUTE = 'data-house-decor'

/**
 * Põe (ou tira) `data-house-decor` no `<body>` conforme a flag. Chamado uma vez na montagem do app.
 * @returns Nada a desinstalar: a flag só muda recarregando.
 */
export function installHouseDecorAttribute(): void {
  if (typeof document === 'undefined') return
  const body = document.body as HTMLElement | null
  if (body === null) return
  if (isHouseDecorEnabled()) body.setAttribute(HOUSE_DECOR_ATTRIBUTE, '')
  else body.removeAttribute(HOUSE_DECOR_ATTRIBUTE)
}

/**
 * IV-10 (a pergunta estruturada no fio: chips, escolha única ou múltipla; Colheita Lodi A(1)) entra ATRÁS DE FLAG, desligada por padrão,
 * até a Muse aceitar pelas capturas (D-077). Mesmo formato da `houseDecor` (`decor/house-decor-flag.ts`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.personaAsk', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { personaAsk: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0'). Desligada, o fio mostra a frase simples que o host escreve junto ("{persona} pergunta: …"),
 * exatamente como antes: nem um pixel, nem um nó a mais no DOM.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { personaAsk: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const PERSONA_ASK_FLAG_KEY = 'persona.flag.personaAsk'

/** O cartão de pergunta com chips está ligado? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isPersonaAskEnabled(): boolean {
  return readFlag('personaAsk')
}

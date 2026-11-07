/**
 * D-090 (EQUIPE-REAL-SPEC): o trabalho em equipe das personas (o cartão "Bom dia" e, depois, as linhas de "pediu ajuda") entra ATRÁS DE FLAG,
 * desligada por padrão, até o aceite da Muse (D-077). Mesmo formato da `bubbles` (`chat/bubbles-flag.ts`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe / o "Um dia da equipe" do Gauge):
 *  - `localStorage.setItem('persona.flag.teamwork', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { teamwork: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0'). Desligada, o #geral é o de antes (a mensagem do host aparece como texto).
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { teamwork: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const TEAMWORK_FLAG_KEY = 'persona.flag.teamwork'

/** O trabalho em equipe está ligado? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isTeamworkEnabled(): boolean {
  return readFlag('teamwork')
}

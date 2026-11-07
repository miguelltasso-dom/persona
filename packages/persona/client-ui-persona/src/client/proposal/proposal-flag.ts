/**
 * P1-9 ("Proposta de {persona}" no #geral, TASK-PROPOSAL-SPEC) entra ATRÁS DE FLAG, desligada por padrão, até a Muse aceitar pelas capturas
 * (D-077). Mesmo formato da `personaAsk` (`ask/ask-flag.ts`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.taskProposal', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { taskProposal: true }` antes do app montar.
 * Para desligar: remover a chave (ou gravar '0'). Desligada, o #geral mostra a frase simples que o host escreve junto ("{persona} sugeriu: …"),
 * exatamente como antes: nem um pixel, nem um nó a mais no DOM.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { taskProposal: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const TASK_PROPOSAL_FLAG_KEY = 'persona.flag.taskProposal'

/** O cartão "Proposta de {persona}" está ligado? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isTaskProposalEnabled(): boolean {
  return readFlag('taskProposal')
}

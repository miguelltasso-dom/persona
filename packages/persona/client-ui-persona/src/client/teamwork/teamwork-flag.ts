/**
 * EQUIPE REAL (D-090, EQUIPE-REAL-SPEC): as personas passam contexto e trabalho entre si. Tudo da UI (chips do quadro, o bilhete, o
 * "Caminho do trabalho") fica ATRÁS DE FLAG, desligada por padrão, até o aceite da Muse (D-077); o host tem a dele (`Config.teamwork`).
 *
 * Como ligar (a varredura da Muse / os gates do Probe):
 *  - `localStorage.setItem('persona.flag.teamwork', '1')` e recarregar (um `addInitScript` do Playwright serve);
 *  - ou `window.__PERSONA_FLAGS__ = { teamwork: true }` antes do app montar.
 * Desligada, nenhuma tela muda: nem um chip, nem um botão, nem um nó a mais.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { teamwork: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const TEAMWORK_FLAG_KEY = 'persona.flag.teamwork'

/** A equipe real está ligada? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isTeamworkEnabled(): boolean {
  return readFlag('teamwork')
}

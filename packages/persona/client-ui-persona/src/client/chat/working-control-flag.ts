/**
 * FL-11 / IV-5: a fila por item, o "Direcionar agora" e o Parar de VERDADE (host do Bolt) entram ATRÁS DE FLAG, desligada por padrão (D-077),
 * até a Muse aceitar pelas capturas. Mesmo formato da `navPlaces` (`shell/nav-flag.ts`).
 *
 * Como ligar: `localStorage.setItem('persona.flag.workingControl', '1')` e recarregar, ou `window.__PERSONA_FLAGS__ = { workingControl: true }`.
 * Desligada, a fila é a local de sempre (`composer-queue-store`) e nada chama os remotes do IV-5.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { workingControl: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const WORKING_CONTROL_FLAG_KEY = 'persona.flag.workingControl'

/** O controle de trabalho do host está ligado? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isWorkingControlEnabled(): boolean {
  return readFlag('workingControl')
}

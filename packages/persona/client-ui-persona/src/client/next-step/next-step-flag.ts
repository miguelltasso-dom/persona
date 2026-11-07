/**
 * Feature flag `persona.flag.nextStep` (D-077, `NEXT-STEP-SHORTCUTS-SPEC.md` §1 — P1-6).
 * Default: OFF no corte (Muse 06:15: a explicação escrita não basta; a prova real com estados interceptados vai para a v1.2).
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { nextStep: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const NEXT_STEP_FLAG_KEY = 'persona.flag.nextStep'

export function isNextStepEnabled(): boolean {
  return readFlag('nextStep')
}

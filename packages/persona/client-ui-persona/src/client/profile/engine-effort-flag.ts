/**
 * EFF-1 — Modelo e esforço por persona (`persona-spec/design/EFFORT-SPEC.md`, D-088).
 * Nasce atrás de `persona.flag.engineEffort`, desligada por padrão, até o aceite da Muse (D-077).
 *
 * Como ligar: `localStorage.setItem('persona.flag.engineEffort', '1')` e recarregar, ou
 * `window.__PERSONA_FLAGS__ = { engineEffort: true }` antes do app montar.
 */

import { readFlag } from '../flags.ts'
// Atlas/Keel 06:21: LIGADA por padrão na v1.1 (o Miguel pediu). '0' no localStorage (ou window.__PERSONA_FLAGS__ = { engineEffort: false }) desliga. Leitor central: ../flags.ts.

export const ENGINE_EFFORT_FLAG_KEY = 'persona.flag.engineEffort'

/** Modelo e Esforço por persona estão ligados? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isEngineEffortEnabled(): boolean {
  return readFlag('engineEffort')
}

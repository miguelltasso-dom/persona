/**
 * Configurações › Personas (HT-13 + EFF-1 + "pedir ajuda a colegas", D-084/D-090): a aba nasce ATRÁS DE FLAG, desligada por padrão, até
 * a Muse aceitar pelas capturas (D-077). Mesmo formato dos balões (`chat/bubbles-flag.ts`).
 *
 * Como ligar: `localStorage.setItem('persona.flag.settingsPersonas', '1')` e recarregar, ou
 * `window.__PERSONA_FLAGS__ = { settingsPersonas: true }` antes do app montar.
 */

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { settingsPersonas: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const SETTINGS_PERSONAS_FLAG_KEY = 'persona.flag.settingsPersonas'

/** A aba Personas de Configurações está ligada? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isSettingsPersonasEnabled(): boolean {
  return readFlag('settingsPersonas')
}

/**
 * D-084 (PERSONA-POWERS-SPEC §1, HT-9 básico): o cartão de prévia de ação externa entra atrás de flag. D-095 (Atlas/Keel 05/11 03:27): o HT-9 foi PROVADO e a v1.1 sai com o
 * ENVIO por permissão, então ela vem LIGADA por padrão. Mesmo formato da `teamwork` (`chat/teamwork-flag.ts`).
 *
 * Como desligar: `localStorage.setItem('persona.flag.actionPreview', '0')` e recarregar, ou `window.__PERSONA_FLAGS__ = { actionPreview: false }`.
 * Desligada, a mensagem do host aparece como texto simples (e nada executa sem o "sim" que o host registra).
 */

import { readFlag } from '../flags.ts'
// D-095: LIGADA por padrão como todas as outras ('0' desliga). Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const ACTION_PREVIEW_FLAG_KEY = 'persona.flag.actionPreview'

/** O cartão de prévia está ligado? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isActionPreviewEnabled(): boolean {
  return readFlag('actionPreview')
}

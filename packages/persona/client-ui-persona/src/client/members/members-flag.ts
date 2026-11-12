/**
 * Flag `remoteTeamTab` (cena 20 da Muse; decisão do Keel): a aba Membros de Configurações só existe com a equipe remota ligada.
 * Padrão DESLIGADA na v1.1 (a equipe remota ainda não está ligada ao host de produção). Sem a aba, a equipe fica no cartão
 * "Equipe à distância", em Conexões.
 */

import { readFlag } from '../flags.ts'

/** Chave do `localStorage` (e do `window.__PERSONA_FLAGS__`) da flag remoteTeamTab. */
export const REMOTE_TEAM_TAB_FLAG_KEY = 'persona.flag.remoteTeamTab'

/** A aba Membros está ligada? Nunca lança (ver `readFlag`). */
export function isRemoteTeamTabEnabled(): boolean {
  return readFlag('remoteTeamTab')
}

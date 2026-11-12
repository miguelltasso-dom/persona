/**
 * Flag `station` (item 24, D-113): o cartão "Estação de Agentes" em Configurações › Conexões. Padrão DESLIGADA: a Estação está em construção e o host recusa as chamadas dela;
 * o cartão nem aparece (nenhum botão que dê numa recusa). `'1'` liga para quem desenvolve.
 */

import { readFlag } from '../flags.ts'

/** Chave do `localStorage` (e do `window.__PERSONA_FLAGS__`) da flag station. */
export const STATION_FLAG_KEY = 'persona.flag.station'

/** O cartão da Estação está ligado? Nunca lança (ver `readFlag`). */
export function isStationEnabled(): boolean {
  return readFlag('station')
}

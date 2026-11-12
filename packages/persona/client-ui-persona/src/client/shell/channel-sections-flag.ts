/**
 * Flag `channelSections` (item 22, Muse §22): equipes e canais na barra lateral — cada equipe é uma seção recolhível com os seus canais, o canal
 * tem cabeçalho ("Respondem aqui: …") e o menu de @ oferece as equipes. Padrão DESLIGADA (ordem do Keel, 12/11): vale só depois do aceite da Muse e
 * da Ember. Com ela desligada o app é o de sempre: um canal (#geral) e a barra de Canais e Pessoas de hoje.
 */

import { readFlag } from '../flags.ts'

/** Chave do `localStorage` (e do `window.__PERSONA_FLAGS__`) da flag channelSections. */
export const CHANNEL_SECTIONS_FLAG_KEY = 'persona.flag.channelSections'

/** As seções de equipe e os canais múltiplos estão ligados? Nunca lança (ver `readFlag`). */
export function isChannelSectionsEnabled(): boolean {
  return readFlag('channelSections')
}

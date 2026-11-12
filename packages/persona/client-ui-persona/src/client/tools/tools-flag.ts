/**
 * Flag `toolsCatalog` (item 26, Muse §26): a aba Configurações › "Ferramentas" (catálogo, saúde, "Em breve"). Padrão DESLIGADA (decisão do Keel e da Muse, 12/11):
 * sem o fluxo "Conectar" (26.5) um cartão não teria ação, e o Miguel nunca vê um cartão morto. Com ela desligada o app é o de sempre: nem a aba, nem o item do menu.
 */

import { readFlag } from '../flags.ts'

/** Chave do `localStorage` (e do `window.__PERSONA_FLAGS__`) da flag toolsCatalog. */
export const TOOLS_CATALOG_FLAG_KEY = 'persona.flag.toolsCatalog'

/** A aba Ferramentas está ligada? Nunca lança (ver `readFlag`). */
export function isToolsCatalogEnabled(): boolean {
  return readFlag('toolsCatalog')
}

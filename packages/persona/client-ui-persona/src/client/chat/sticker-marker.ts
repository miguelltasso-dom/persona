/**
 * COLHEITA §14 (Quill): o corpo de figurinha do host, `[[sticker:<id>]]`, lido no cliente. Só o catálogo de reações conta;
 * qualquer outro corpo é texto comum. Puro (sem React, sem host).
 */
import { REACTION_IDS, type ReactionId } from '../primitives/Stickers.tsx'

const MARKER = /^\[\[sticker:([a-z-]+)\]\]$/u

/** O id da figurinha de uma mensagem, quando o corpo é só o marcador de figurinha; `undefined` para texto comum. */
export function stickerFromBody(body: string): ReactionId | undefined {
  const match = MARKER.exec(body.trim())
  const id = match?.[1]
  if (id === undefined) return undefined
  return (REACTION_IDS as readonly string[]).includes(id) ? (id as ReactionId) : undefined
}

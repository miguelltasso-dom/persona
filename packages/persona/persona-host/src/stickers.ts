/**
 * Reaction stickers. Ids are Brush asset stems — Muse binds the same ids in UI.
 */

/** One sticker the composer may send. */
export interface ChatSticker {
  readonly id: string
  readonly asset: string
}

/** Frozen catalog. Do not invent ids the Brush pack does not ship. */
export const CHAT_STICKERS: readonly ChatSticker[] = [
  { id: 'joinha', asset: 'persona-assets/stickers/joinha' },
  { id: 'coracao', asset: 'persona-assets/stickers/coracao' },
  { id: 'rindo', asset: 'persona-assets/stickers/rindo' },
  { id: 'comemorando', asset: 'persona-assets/stickers/comemorando' },
  { id: 'pensando', asset: 'persona-assets/stickers/pensando' },
  { id: 'feito', asset: 'persona-assets/stickers/feito' },
  { id: 'stamp-aprovado', asset: 'persona-assets/accents/stamp-aprovado.svg' },
  { id: 'tray-idle', asset: 'persona-assets/brand/tray/tray-idle-24.svg' },
  { id: 'tray-working', asset: 'persona-assets/brand/tray/tray-working-24.svg' },
  { id: 'tray-needs-you', asset: 'persona-assets/brand/tray/tray-needs-you-24.svg' },
  { id: 'tray-paused', asset: 'persona-assets/brand/tray/tray-paused-24.svg' },
  { id: 'nav-saude', asset: 'persona-assets/icons/nav/saude.svg' },
  { id: 'nav-quem-cuida', asset: 'persona-assets/icons/nav/quem-cuida.svg' },
]

const IDS = new Set(CHAT_STICKERS.map(item => item.id))

/**
 * @param id - Catalog id.
 */
export function isChatSticker(id: string): boolean {
  return IDS.has(id)
}

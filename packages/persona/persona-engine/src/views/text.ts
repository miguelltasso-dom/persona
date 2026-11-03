/**
 * Bounded text for UI and model cards. Full bodies stay behind a read pointer.
 */

/**
 * Collapse whitespace and cap for a preview.
 * @param text - Source text.
 * @param max - Max UTF-16 units (default 160).
 */
export function preview(text: string, max: number = 160): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Cap with an explicit spill flag and read pointer.
 * @param text - Source text.
 * @param max - Max UTF-16 units.
 */
export function capped(text: string, max: number = 160): { preview: string; chars: number; spilled: boolean } {
  const previewText = preview(text, max)
  return { preview: previewText, chars: text.length, spilled: text.length > max }
}

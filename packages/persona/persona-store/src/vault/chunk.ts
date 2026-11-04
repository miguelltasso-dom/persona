/**
 * Split extracted Cofre units into indexed chunks.
 */

import type { ExtractedUnit } from './extract.ts'

/** Target characters per chunk. */
export const VAULT_CHUNK_TARGET = 900

/** One chunk ready for `vault_chunk`. */
export interface VaultChunkDraft {
  readonly index: number
  readonly locator: string
  readonly body: string
}

/**
 * Split units on paragraph boundaries around {@link VAULT_CHUNK_TARGET}.
 * @param units - Pages or sections.
 */
export function chunkExtracted(units: readonly ExtractedUnit[]): VaultChunkDraft[] {
  const drafts: VaultChunkDraft[] = []
  for (const unit of units) {
    for (const piece of splitUnit(unit.text)) {
      drafts.push({ index: drafts.length, locator: unit.locator, body: piece })
    }
  }
  return drafts
}

function splitUnit(text: string): string[] {
  if (text.length <= VAULT_CHUNK_TARGET) return [text]
  const paragraphs = text.split(/\n{2,}/u)
  const pieces: string[] = []
  let buf = ''
  for (const paragraph of paragraphs) {
    if (buf !== '' && buf.length + paragraph.length + 2 > VAULT_CHUNK_TARGET) {
      pieces.push(buf)
      buf = paragraph
      continue
    }
    buf = buf === '' ? paragraph : `${buf}\n\n${paragraph}`
  }
  if (buf !== '') pieces.push(buf)
  return pieces.flatMap(piece => piece.length <= VAULT_CHUNK_TARGET * 2 ? [piece] : hardSplit(piece))
}

function hardSplit(text: string): string[] {
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += VAULT_CHUNK_TARGET) {
    pieces.push(text.slice(i, i + VAULT_CHUNK_TARGET).trim())
  }
  return pieces.filter(piece => piece !== '')
}

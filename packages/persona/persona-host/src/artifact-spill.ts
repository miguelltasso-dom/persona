/**
 * Item 9b (the I/O half): write the big SVG / code blocks of a delivery as files in the SENDER's draft, and say (to the receiver's prompt) where they reached hers.
 * The pure half is `artifact-ref.ts`; this file only knows two things the hooks in `handoffs.ts` need:
 *  - {@link spillArts}: write each big block next to the sender's work, dated well in the past so it is never "what she saved this turn" (no chip in the thread,
 *    nothing for `savedSince` to carry twice); the copy to the receiver's draft is the P0-1 carry (`draft-inbox.ts`), not this file;
 *  - {@link artText}: the text a receiver reads, with a block replaced by its reference ONLY when its file really reached her draft AND she can open files. Anything
 *    else keeps the block inline, so a pointer never leads nowhere. Nothing here throws.
 */

import { utimesSync, writeFileSync } from 'node:fs'
import { bigBlocksOf, blockFileName, refOf } from './artifact-ref.ts'

/** The spilled file is dated this long ago: older than any turn that could be running, so no "saved this turn" logic sees it. */
const SPILL_AGE_MS = 6 * 60 * 60_000

/**
 * Write each big block of `text` as a file in the sender's draft.
 * @param dir - The sender's draft (`ticket.execution.directory`); none, empty or `.` = no draft = nothing written.
 * @param key - The delivery (the request id that opens the receiver's Task): part of the file names.
 * @param text - The sender's words, whole (before any cut).
 * @param confine - The engine's confined write (`confineWorktreeWrite`): the absolute path for a name inside the draft, or a throw.
 * @returns The file name of each block, by block order; `''` where a write failed (that block stays inline). Empty = no big block, no draft.
 */
export function spillArts(dir: string | undefined, key: string, text: string, confine: (dir: string, name: string) => string): string[] {
  if (dir === undefined || dir === '' || dir === '.') return []
  const blocks = bigBlocksOf(text)
  const names: string[] = []
  for (const [index, block] of blocks.entries()) {
    const name = blockFileName(key, index, block)
    try {
      const path = confine(dir, name)
      writeFileSync(path, block.content, 'utf8')
      const old = new Date(Date.now() - SPILL_AGE_MS)
      utimesSync(path, old, old)
      names.push(name)
    } catch (error) {
      void error
      names.push('')
    }
  }
  return names.some(name => name !== '') ? names : []
}

/**
 * The words of a delivery as the RECEIVER reads them: each big block whose file is in her draft becomes a short line saying where.
 * @param text - What the host kept of the sender's words (possibly cut at `ENTREGA_MAX`).
 * @param arts - {@link spillArts} of the sender's whole text.
 * @param lines - What reached the receiver's draft (`InboxLine`s: the path it is at NOW, which is not the sender's when the receiver already had another file there).
 * @param canOpen - Whether the receiver can read files in her draft (a text-only persona cannot: she keeps the block).
 */
export function artText(text: string, arts: readonly string[] | undefined, lines: readonly { readonly at: string }[] | undefined, canOpen: boolean): string {
  if (!canOpen || arts === undefined || arts.length === 0 || lines === undefined || lines.length === 0) return text
  return refOf(text, (index) => {
    const name = arts[index]
    if (name === undefined || name === '') return undefined
    return lines.find(line => line.at === name || line.at.endsWith(`/${name}`))?.at
  })
}

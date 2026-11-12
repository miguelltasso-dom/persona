/**
 * Item 9b "artefato grande por referência" (Tally, 11/11).
 *
 * When work passes between personas (the text to the art, the art to the reviewer, a revision back to its author) the sender's words used to travel WHOLE inside the
 * prompt of whoever receives them (`<entrega>`, up to 24 000 characters). An SVG poster is 10-25 KB of markup: every receiving turn paid for it, every review pass paid for
 * it again, and a model read it to find a file it could have opened. The file already follows the work (P0-1: copied into the receiver's draft), so the prompt only has to
 * SAY where it is.
 *
 * This file is the pure half: find the big SVG / code blocks of a text, name the files they are written to, and rewrite the text with a short reference in their place.
 * It never decides by itself that a pointer is safe: the caller passes `where(index)` and a block is replaced ONLY when the file is known to be in the receiver's draft;
 * any block without a place stays inline, byte for byte (the receiver never loses content to a pointer that leads nowhere). No I/O, no model.
 */

/** A block longer than this is worth a file; shorter ones stay in the text (a pointer would cost more than the block). */
export const ART_INLINE_MAX = 1_500
/** At most this many blocks of one delivery are written as files. */
export const ART_FILES_MAX = 6

export type BlockKind = 'svg' | 'code'

/** One big block of a text. */
export interface BigBlock {
  /** Offsets of the block IN the text it was found in (`text.slice(start, end)` is the block, fences included). */
  readonly start: number
  readonly end: number
  /** What goes into the file: the SVG, or the inside of the code fence. */
  readonly content: string
  readonly kind: BlockKind
  /** File extension without the dot (`svg`, `html`, `txt`…). */
  readonly ext: string
  /** The language the fence said (`html`), empty for a bare SVG. */
  readonly lang: string
}

const FENCE = /^[ \t]*```([^\n`]*)\n([\s\S]*?)\n[ \t]*```[ \t]*$/gmu
const TAG = /<(\/?)svg(?=[\s/>])[^>]*>/giu

const EXT_OF_LANG: Readonly<Record<string, string>> = {
  svg: 'svg', xml: 'xml', html: 'html', css: 'css', js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts', tsx: 'tsx', jsx: 'jsx',
  json: 'json', md: 'md', markdown: 'md', py: 'py', python: 'py', csv: 'csv', yaml: 'yml', yml: 'yml', sql: 'sql', sh: 'sh', txt: 'txt', text: 'txt',
}

/** The SVG documents of a text (bare ones), with nesting handled: the outer `<svg>` ends at ITS `</svg>`. */
function svgSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  let depth = 0
  let start = -1
  for (const match of text.matchAll(TAG)) {
    const closing = match[1] === '/'
    const selfClosing = !closing && match[0].endsWith('/>')
    if (!closing) {
      if (depth === 0) start = match.index
      if (!selfClosing) depth += 1
      else if (depth === 0) spans.push({ start: match.index, end: match.index + match[0].length })
    } else if (depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        spans.push({ start, end: match.index + match[0].length })
        start = -1
      }
    }
  }
  return spans
}

/**
 * The big blocks (SVG documents and fenced code) of a text, in order, longer than `min` characters. An SVG inside a code fence is the fence (one block).
 * @param text - What a persona wrote.
 * @param min - Blocks of this length or less stay inline (default {@link ART_INLINE_MAX}).
 * @returns At most {@link ART_FILES_MAX} blocks.
 */
export function bigBlocksOf(text: string, min: number = ART_INLINE_MAX): BigBlock[] {
  const found: BigBlock[] = []
  for (const match of text.matchAll(FENCE)) {
    const lang = (match[1] ?? '').trim().toLowerCase().split(/\s+/u)[0] ?? ''
    const content = match[2] ?? ''
    const isSvg = /<svg(?=[\s/>])/iu.test(content)
    found.push({
      start: match.index, end: match.index + match[0].length, content, kind: isSvg ? 'svg' : 'code',
      ext: isSvg ? 'svg' : (EXT_OF_LANG[lang] ?? 'txt'), lang,
    })
  }
  for (const span of svgSpans(text)) {
    if (found.some(block => span.start >= block.start && span.end <= block.end)) continue // inside a fence: the fence is the block
    found.push({ start: span.start, end: span.end, content: text.slice(span.start, span.end), kind: 'svg', ext: 'svg', lang: '' })
  }
  return found
    .filter(block => block.end - block.start > min)
    .sort((a, b) => a.start - b.start)
    .slice(0, ART_FILES_MAX)
}

/** The file name of block `index` (0-based) of the delivery `key`: stable, one per block, no path. */
export function blockFileName(key: string, index: number, block: Pick<BigBlock, 'kind' | 'ext'>): string {
  const safe = key.replace(/[^A-Za-z0-9]/gu, '').slice(-12) || 'x'
  return `entrega-${safe}-${block.kind === 'svg' ? 'arte' : 'trecho'}-${String(index + 1)}.${block.ext}`
}

/** `12,4 KB` (pt-BR). */
export function kbOf(chars: number): string {
  return `${(chars / 1024).toFixed(1).replace('.', ',')} KB`
}

/** The short line that stands for a block whose file is at `at` in the receiver's draft. Plain words, no jargon. */
export function referenceLine(block: BigBlock, index: number, at: string): string {
  const size = kbOf(block.content.length)
  return block.kind === 'svg'
    ? `[Arte ${String(index + 1)} (SVG, ${size}): está no arquivo ${at} do seu rascunho; abra o arquivo se precisar do código.]`
    : `[Trecho ${String(index + 1)}${block.lang === '' ? '' : ` (${block.lang})`}, ${size}: está no arquivo ${at} do seu rascunho; abra o arquivo se precisar do conteúdo.]`
}

/**
 * The text with each block that has a place replaced by its reference line; a block with no place stays exactly as it was.
 * @param text - The text the blocks were found in.
 * @param blocks - {@link bigBlocksOf} of that same text.
 * @param where - Where block `index` is in the receiver's draft (a relative path), or undefined when it is not there (then the block stays inline).
 */
export function referToBlocks(text: string, blocks: readonly BigBlock[], where: (index: number) => string | undefined): string {
  let out = text
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    const at = block === undefined ? undefined : where(index)
    if (block === undefined || at === undefined) continue
    out = `${out.slice(0, block.start)}${referenceLine(block, index, at)}${out.slice(block.end)}`
  }
  return out
}

/**
 * The one call a hook needs: the text with every big block that has a place replaced by its reference line (what `entregaBlock` puts in the prompt).
 * @param text - What a persona wrote.
 * @param where - Where block `index` (of {@link bigBlocksOf} of this same text) is in the receiver's draft, or undefined when it is not there.
 */
export function refOf(text: string, where: (index: number) => string | undefined): string {
  return referToBlocks(text, bigBlocksOf(text), where)
}

/** A rough size in tokens for a text (3.5 characters each): an ESTIMATE, never a vendor number. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.5)
}

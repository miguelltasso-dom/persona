import { describe, expect, it } from 'vitest'
import {
  ART_FILES_MAX, ART_INLINE_MAX, bigBlocksOf, blockFileName, estimateTokens, kbOf, referToBlocks, referenceLine, refOf,
} from '../src/artifact-ref.ts'

/** An SVG as long as the one of a real round: a poster, with its own lines and indentation. */
const svg = (rects: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">\n${'  <rect x="10" y="10" width="90" height="90" fill="#d22"/>\n'.repeat(rects)}</svg>`

describe('artifact-ref (item 9b: artefato grande por referência)', () => {
  it('finds a big bare SVG with its exact offsets, and leaves a small one inline', () => {
    const big = svg(80)
    const small = svg(2)
    const text = `Texto do cartaz.\n${big}\nE a legenda.\n${small}\nFim.`
    const blocks = bigBlocksOf(text)
    expect(blocks).toHaveLength(1)
    expect(text.slice(blocks[0]!.start, blocks[0]!.end)).toBe(big)
    expect(blocks[0]).toMatchObject({ kind: 'svg', ext: 'svg', lang: '', content: big })
    expect(big.length).toBeGreaterThan(ART_INLINE_MAX)
  })

  it('an SVG inside a code fence is ONE block (the fence), and a fenced code block gets its language extension', () => {
    const fenced = `Segue:\n\`\`\`svg\n${svg(80)}\n\`\`\`\nE o html:\n\`\`\`html\n<div>${'x'.repeat(2000)}</div>\n\`\`\`\n`
    const blocks = bigBlocksOf(fenced)
    expect(blocks.map(block => [block.kind, block.ext])).toEqual([['svg', 'svg'], ['code', 'html']])
    expect(blocks[0]?.content.startsWith('<svg')).toBe(true) // the inside of the fence, not the fence marks
  })

  it('handles a nested <svg> (the outer one ends at ITS closing tag) and a self-closing one', () => {
    const outer = `<svg width="10"><svg width="5">${'<g/>'.repeat(500)}</svg><rect/></svg>`
    const text = `a ${outer} b <svg width="1"/> c`
    const blocks = bigBlocksOf(text, 100)
    expect(blocks).toHaveLength(1)
    expect(text.slice(blocks[0]!.start, blocks[0]!.end)).toBe(outer)
  })

  it('an unterminated SVG (cut text) is not a block: nothing is replaced by a pointer that would hide half a file', () => {
    const cut = `Arte:\n<svg width="10">${'<g/>'.repeat(800)}`
    expect(bigBlocksOf(cut)).toEqual([])
  })

  it('names one stable file per block, with no path', () => {
    const [art, code] = bigBlocksOf(`${svg(80)}\n\`\`\`py\n${'print(1)\n'.repeat(300)}\`\`\``)
    expect(blockFileName('req-ab12/cd:34', 0, art!)).toBe('entrega-reqab12cd34-arte-1.svg') // symbols out, the last 12 letters/digits kept
    expect(blockFileName('req-ab12/cd:34', 1, code!)).toBe('entrega-reqab12cd34-trecho-2.py')
    expect(blockFileName('split:message-0123456789abcdef', 0, art!)).toBe('entrega-456789abcdef-arte-1.svg')
    expect(blockFileName('', 0, art!)).toBe('entrega-x-arte-1.svg')
  })

  it('replaces ONLY the blocks that have a place; the others stay inline, byte for byte', () => {
    const a = svg(80)
    const b = svg(90)
    const text = `Texto.\n${a}\nMeio.\n${b}\nFim.`
    const blocks = bigBlocksOf(text)
    expect(blocks).toHaveLength(2)
    const onlyFirst = referToBlocks(text, blocks, index => (index === 0 ? 'recebidos/Bia/entrega-x-arte-1.svg' : undefined))
    expect(onlyFirst).toContain('[Arte 1 (SVG,')
    expect(onlyFirst).toContain('recebidos/Bia/entrega-x-arte-1.svg')
    expect(onlyFirst).not.toContain(a)
    expect(onlyFirst).toContain(b) // no place for the second: it is still there whole
    expect(onlyFirst.startsWith('Texto.\n')).toBe(true)
    expect(onlyFirst.endsWith('\nFim.')).toBe(true)
    expect(referToBlocks(text, blocks, () => undefined)).toBe(text) // nothing resolved = nothing changed
  })

  it('the reference is far smaller than the block and says where the file is, in plain Portuguese', () => {
    const block = bigBlocksOf(svg(400))[0]!
    const line = referenceLine(block, 0, 'recebidos/Bia/entrega-x-arte-1.svg')
    expect(line).toContain('Arte 1')
    expect(line).toContain('está no arquivo recebidos/Bia/entrega-x-arte-1.svg do seu rascunho')
    expect(line.length).toBeLessThan(200)
    expect(block.content.length / line.length).toBeGreaterThan(50)
    expect(kbOf(12_700)).toBe('12,4 KB')
    expect(estimateTokens(3500)).toBe(1000)
  })

  it('refOf: the plain text of the bilhete stays WHOLE; only the big art becomes a reference', () => {
    const words = 'Texto pronto: 2 por R$ 9, de sexta a domingo. '.repeat(60)
    const art = svg(80)
    const text = `${words}\n${art}\nFIM`
    const out = refOf(text, () => 'recebidos/Bia/entrega-x-arte-1.svg')
    expect(out.startsWith(words)).toBe(true) // every character of her text, untouched
    expect(out.endsWith('\nFIM')).toBe(true)
    expect(out).not.toContain('<rect')
    expect(refOf(words, () => 'x')).toBe(words) // no big block: the very same text
  })

  it('writes at most ART_FILES_MAX blocks of one delivery', () => {
    const many = Array.from({ length: ART_FILES_MAX + 3 }, () => svg(80)).join('\n')
    expect(bigBlocksOf(many)).toHaveLength(ART_FILES_MAX)
  })
})

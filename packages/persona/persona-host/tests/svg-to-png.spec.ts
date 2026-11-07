/**
 * P0-C2 (Atlas 07/11): an SVG the team is to SEE becomes a PNG. The real `sharp` (reached the way the packaged runtime and the workspace both reach it, no dependency of this
 * package) renders it; the refusals are the contract: no external resource, no script, at most 1 MB.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkSvg, loadSharp, renderSvgSiblings, svgBlocksIn, svgToPng, SVG_MAX_BYTES } from '../src/svg-to-png.ts'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const poster = (width = 600, height = 300, extra = ''): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}"><rect width="100%" height="100%" fill="#1e63b5"/><circle cx="${String(width / 2)}" cy="${String(height / 2)}" r="${String(height / 4)}" fill="#e02020"/>${extra}</svg>`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'svg-to-png-'))
  dirs.push(dir)
  return dir
}

describe('svgToPng', () => {
  it('draws a small SVG larger so a model can read it, keeps the proportions, and the bytes are a PNG', async () => {
    const done = await svgToPng(poster(600, 300))
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
    expect(done.width).toBe(800)
    expect(done.height).toBe(400)
  }, 30_000)

  it('never makes a PNG wider than 1600 px (or than the width asked) nor taller than 4000 px', async () => {
    const wide = await svgToPng(poster(4000, 2000))
    expect(wide).toMatchObject({ ok: true, width: 1600, height: 800 })
    const narrow = await svgToPng(poster(4000, 2000), { maxWidth: 1000 })
    expect(narrow).toMatchObject({ ok: true, width: 1000, height: 500 })
    const tall = await svgToPng(poster(500, 20000))
    expect(tall.ok).toBe(true)
    if (tall.ok) expect(tall.height).toBeLessThanOrEqual(4000)
  }, 30_000)

  it('is idempotent: the same SVG gives the same PNG', async () => {
    const first = await svgToPng(poster())
    const second = await svgToPng(poster())
    expect(first.ok && second.ok && first.png.equals(second.png)).toBe(true)
  }, 30_000)

  it('refuses what could read a file, reach the network or run code — and says why', async () => {
    const cases: [string, string, string][] = [
      ['external', 'an <image> from the network', poster(600, 300, '<image href="http://example.com/x.png" width="10" height="10"/>')],
      ['external', 'an xlink:href to a local file', poster(600, 300, '<image xlink:href="file:///C:/Users/x/secret.png" width="10" height="10"/>')],
      ['external', 'a url() to another file in a style', poster(600, 300, '<style>.a{fill:url(https://example.com/p.svg#a)}</style>')],
      ['external', 'an @import', poster(600, 300, '<style>@import "other.css";</style>')],
      ['external', 'a DOCTYPE with an ENTITY (XML external entity)', `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${poster()}`],
      ['external', 'a <use> that points to another file', poster(600, 300, '<use href="other.svg#a"/>')],
      ['script', 'a <script>', poster(600, 300, '<script>alert(1)</script>')],
      ['script', 'an event handler', poster(600, 300, '<rect width="5" height="5" onclick="x()"/>')],
      ['script', 'a <foreignObject>', poster(600, 300, '<foreignObject width="5" height="5"><div/></foreignObject>')],
      ['invalid', 'text that is not an SVG', 'um cartaz bonito'],
      ['invalid', 'an <svg> never closed', '<svg width="10" height="10"><rect width="5" height="5"/>'],
    ]
    for (const [reason, label, svg] of cases) expect({ label, result: await svgToPng(svg) }).toEqual({ label, result: { ok: false, reason } })
  }, 30_000)

  it('refuses an SVG over 1 MB without drawing it', async () => {
    const huge = poster(600, 300, `<!-- ${'x'.repeat(SVG_MAX_BYTES)} -->`)
    expect(checkSvg(huge)).toBe('too_big')
    expect(await svgToPng(huge)).toEqual({ ok: false, reason: 'too_big' })
  })

  it('accepts what is part of the document: a #reference, a gradient and an embedded raster', async () => {
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const svg = poster(600, 300, `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><rect id="r" width="10" height="10"/></defs><use href="#r"/><rect width="50" height="50" fill="url(#g)"/><image href="${pixel}" width="10" height="10"/>`)
    expect(checkSvg(svg)).toBeUndefined()
    expect(await svgToPng(svg)).toMatchObject({ ok: true })
  }, 30_000)

  it('tries each layout in order: none carries `sharp` = undefined (the callers answer `engine`, the delivery goes on with the SVG); the first that has it wins', () => {
    const none = (): NodeRequire => { throw new Error('Cannot find module \'sharp\'') }
    const notAFunction = ((): NodeRequire => ((() => ({ not: 'sharp' })) as unknown as NodeRequire))
    const carrying = ((): NodeRequire => ((() => () => 'a sharp') as unknown as NodeRequire))
    expect(loadSharp([none, none])).toBeUndefined()
    expect(loadSharp([notAFunction])).toBeUndefined()
    expect(typeof loadSharp([none, notAFunction, carrying])).toBe('function')
  })

  it('the real layouts find the real `sharp` here (the workspace layout: persona-host does not declare it)', () => {
    expect(typeof loadSharp()).toBe('function')
  })
})

describe('svgBlocksIn', () => {
  it('finds a bare SVG and a fenced one, whole, with nested <svg> counted', () => {
    const inner = '<svg viewBox="0 0 10 10"><svg x="1"><rect width="2" height="2"/></svg></svg>'
    const text = `Aqui está o cartaz:\n\`\`\`svg\n${inner}\n\`\`\`\nE um segundo: ${poster(40, 20)} fim.`
    expect(svgBlocksIn(text)).toEqual([inner, poster(40, 20)])
  })

  it('takes at most 3, never the same one twice, nothing over 1 MB, nothing from a text without SVG', () => {
    const one = poster(10, 10)
    const four = [1, 2, 3, 4].map(n => poster(10 + n, 10)).join('\n')
    expect(svgBlocksIn(four)).toHaveLength(3)
    expect(svgBlocksIn(`${one} ${one}`)).toEqual([one])
    expect(svgBlocksIn(poster(10, 10, `<!-- ${'x'.repeat(SVG_MAX_BYTES)} -->`))).toEqual([])
    expect(svgBlocksIn('Só texto, nada de <b>imagem</b>.')).toEqual([])
    expect(svgBlocksIn('<svg width="1"><rect/>')).toEqual([])
  })
})

describe('renderSvgSiblings', () => {
  it('writes the .png next to each .svg of the draft (subfolders too), skips hidden folders and node_modules, and says what it skipped', async () => {
    const dir = scratch()
    mkdirSync(join(dir, 'arte'), { recursive: true })
    mkdirSync(join(dir, '.git'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'cartaz.svg'), poster())
    writeFileSync(join(dir, 'arte', 'logo.svg'), poster(100, 100))
    writeFileSync(join(dir, 'quebrado.svg'), '<svg>')
    writeFileSync(join(dir, '.git', 'hidden.svg'), poster())
    writeFileSync(join(dir, 'node_modules', 'x', 'dep.svg'), poster())
    const done = await renderSvgSiblings(dir)
    expect([...done.written].sort()).toEqual(['arte/logo.png', 'cartaz.png'])
    expect(done.skipped).toEqual([{ file: 'quebrado.svg', reason: 'invalid' }])
    expect(readFileSync(join(dir, 'cartaz.png')).subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
    expect(existsSync(join(dir, '.git', 'hidden.png'))).toBe(false)
    expect(existsSync(join(dir, 'node_modules', 'x', 'dep.png'))).toBe(false)
  }, 30_000)

  it('is idempotent (a PNG newer than its SVG stays), and draws again when the SVG changed after it', async () => {
    const dir = scratch()
    const svg = join(dir, 'cartaz.svg')
    writeFileSync(svg, poster())
    expect((await renderSvgSiblings(dir)).written).toEqual(['cartaz.png'])
    const again = await renderSvgSiblings(dir)
    expect(again.written).toEqual([])
    expect(again.skipped).toEqual([{ file: 'cartaz.svg', reason: 'exists' }])
    const later = new Date(Date.now() + 60_000)
    utimesSync(svg, later, later)
    writeFileSync(svg, poster(1200, 600))
    utimesSync(svg, later, later)
    expect((await renderSvgSiblings(dir)).written).toEqual(['cartaz.png'])
  }, 30_000)

  it('with `only` it treats just those SVGs (the ones saved in this turn) and never leaves the folder', async () => {
    const dir = scratch()
    writeFileSync(join(dir, 'novo.svg'), poster())
    writeFileSync(join(dir, 'antigo.svg'), poster())
    const done = await renderSvgSiblings(dir, { only: ['novo.svg', '../fora.svg', 'inexistente.svg'] })
    expect(done.written).toEqual(['novo.png'])
    expect(done.skipped).toEqual(expect.arrayContaining([{ file: '../fora.svg', reason: 'outside' }, { file: 'inexistente.svg', reason: 'not_found' }]))
    expect(existsSync(join(dir, 'antigo.png'))).toBe(false)
  }, 30_000)
})

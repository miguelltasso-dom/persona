/**
 * P0-C2 (EQUIPE-REAL-SPEC §(e)): what a persona saved in the draft during ONE turn becomes one typed line. The pieces under test: reading a draft file without ever leaving
 * the draft, finding what the turn wrote, the thumbnail that rides on the line, and the PNG sibling of every SVG (the team sees the PNG).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { changedSince, DRAFT_FILES_MAX, DRAFT_THUMB_MAX_CHARS, DRAFT_THUMB_MIN_CHARS, DRAFT_THUMBS_LINE_MAX_CHARS, draftFilesOfTurn, filesSavedBody, mimeOfFile, readDraftFile, thumbOf } from '../src/draft-turn-files.ts'
import { loadSharp, svgToPng } from '../src/svg-to-png.ts'

const poster = (width = 600, height = 300): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}"><rect width="100%" height="100%" fill="#1e63b5"/><circle cx="${String(width / 2)}" cy="${String(height / 2)}" r="${String(height / 4)}" fill="#e02020"/></svg>`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const draft = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'draft-turn-'))
  dirs.push(dir)
  return dir
}
/** A file "written at" a moment (epoch ms). */
const write = (dir: string, name: string, content: string | Buffer, at: number): void => {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
  const when = new Date(at)
  utimesSync(full, when, when)
}
const decode = (url: string): Buffer => Buffer.from(url.replace(/^data:image\/png;base64,/u, ''), 'base64')
/** The bytes behind any `data:…;base64,` address. */
const bytesOf = (url: string): Buffer => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
/** The pixel width of a PNG/JPEG data URL, read back by the same engine that drew it. */
const widthOf = async (url: string): Promise<number | undefined> => (await loadSharp()!(bytesOf(url)).metadata()).width

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buffer: Buffer): number => {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}
/** A PNG of pure noise (it does not compress: the worst case for a thumbnail that must stay small). */
const noisePng = (size: number): Buffer => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  const rows = Buffer.alloc(size * (size * 3 + 1))
  let seed = 7
  for (let at = 0; at < rows.length; at += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    rows[at] = at % (size * 3 + 1) === 0 ? 0 : seed >>> 16
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
/** A vector art with this many small shapes: about 60 bytes each. */
const busyArt = (shapes: number, side = 800): string => {
  const parts: string[] = []
  for (let n = 0; n < shapes; n += 1) parts.push(`<circle cx="${String((n * 37) % side)}" cy="${String((n * 91) % side)}" r="${String(4 + (n % 9))}" fill="#${((n * 2654435) % 0xffffff).toString(16).padStart(6, '0')}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(side)}" height="${String(side)}" viewBox="0 0 ${String(side)} ${String(side)}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`
}

describe('readDraftFile', () => {
  it('reads a file of the draft by its relative path, with its name and media type', () => {
    const dir = draft()
    write(dir, 'arte/cartaz.svg', poster(), Date.now())
    const read = readDraftFile(dir, 'arte/cartaz.svg')
    expect(read).toMatchObject({ ok: true, name: 'cartaz.svg', mime: 'image/svg+xml', path: 'arte/cartaz.svg' })
    expect(read.ok && read.bytes.toString('utf8')).toBe(poster())
    expect(readDraftFile(dir, 'arte\\cartaz.svg')).toMatchObject({ ok: true, path: 'arte/cartaz.svg' })
  })

  it('never leaves the draft: not by `..`, not by an absolute path, not by a drive, not by a symlink; and it says why it could not read', () => {
    const dir = draft()
    const outside = draft()
    write(outside, 'segredo.txt', 'não leia', Date.now())
    write(dir, 'ok.txt', 'oi', Date.now())
    for (const path of ['../x', 'a/../../x', join(outside, 'segredo.txt'), 'C:/Windows/win.ini', '/etc/passwd', '', '  ', 'a\0b']) {
      expect({ path, result: readDraftFile(dir, path) }).toEqual({ path, result: { ok: false, reason: 'outside' } })
    }
    expect(readDraftFile(dir, 'nao-existe.txt')).toEqual({ ok: false, reason: 'not_found' })
    mkdirSync(join(dir, 'pasta'))
    expect(readDraftFile(dir, 'pasta')).toEqual({ ok: false, reason: 'not_file' })
    expect(readDraftFile(dir, 'ok.txt', { maxBytes: 1 })).toEqual({ ok: false, reason: 'too_big' })
    try {
      symlinkSync(join(outside, 'segredo.txt'), join(dir, 'atalho.txt'))
      expect(readDraftFile(dir, 'atalho.txt')).toEqual({ ok: false, reason: 'outside' })
    } catch (error) {
      void error // a symlink needs a privilege on some Windows machines: the other refusals above already hold
    }
  })

  it('knows the media type of what a persona saves, and falls back to octet-stream', () => {
    expect(['a.SVG', 'b.png', 'c.JPG', 'd.pdf', 'e.md', 'f.docx', 'g.xyz', 'h'].map(mimeOfFile)).toEqual([
      'image/svg+xml', 'image/png', 'image/jpeg', 'application/pdf', 'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', 'application/octet-stream',
    ])
  })
})

describe('changedSince', () => {
  it('lists what the turn wrote, oldest write first, and nothing older; hidden folders and node_modules are not looked into', () => {
    const dir = draft()
    const start = Date.now() - 60_000
    write(dir, 'antigo.txt', 'de antes do turno', start - 5000)
    write(dir, 'segundo.md', 'b', start + 2000)
    write(dir, 'sub/primeiro.txt', 'a', start + 1000)
    write(dir, '.claude/sessao.json', '{}', start + 3000)
    write(dir, 'node_modules/x/y.js', '1', start + 3000)
    expect(changedSince(dir, start)).toEqual(['sub/primeiro.txt', 'segundo.md'])
    expect(changedSince(join(dir, 'nao-existe'), start)).toEqual([])
  })
})

describe('thumbOf', () => {
  it('an SVG goes as ITSELF: the sanitized file as `data:image/svg+xml;base64,…` (the client scales a vector without loss, only through <img>), within the cap', async () => {
    const fromSvg = await thumbOf(Buffer.from(poster(1000, 500)), 'image/svg+xml')
    expect(fromSvg?.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(fromSvg!.length).toBeLessThanOrEqual(DRAFT_THUMB_MAX_CHARS)
    expect(bytesOf(fromSvg!).toString('utf8')).toBe(poster(1000, 500))
    // Comments are not part of the picture: they are taken out (the size is the cap's business).
    const commented = await thumbOf(Buffer.from(`<?xml version="1.0"?><!-- feito pela Bia -->${poster(200, 100)}`), 'image/svg+xml')
    expect(bytesOf(commented!).toString('utf8')).toBe(`<?xml version="1.0"?>${poster(200, 100)}`)
  }, 30_000)

  it('an SVG that is not safe for a picture gets NO thumbnail at all (no vector, no PNG): script, foreignObject, on*, external reference, entity, embed — and a script hidden by a comment', async () => {
    const wrap = (inner: string): Buffer => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">${inner}</svg>`)
    const unsafe: [string, Buffer][] = [
      ['script', wrap('<script>alert(1)</script>')],
      ['script split by a comment', wrap('<scr<!-- x -->ipt>alert(1)</scr<!-- x -->ipt>')],
      ['foreignObject', wrap('<foreignObject width="10" height="10"><div>oi</div></foreignObject>')],
      ['on* attribute', wrap('<rect width="10" height="10" onload="alert(1)"/>')],
      ['external href', wrap('<image href="http://x/y.png" width="10" height="10"/>')],
      ['file href', wrap('<image xlink:href="file:///C:/segredo.png" width="10" height="10"/>')],
      ['javascript href', wrap('<a href="javascript:alert(1)"><rect width="10" height="10"/></a>')],
      ['external url()', wrap('<rect width="10" height="10" fill="url(http://x/y.svg#a)"/>')],
      ['@import', wrap('<style>@import url(http://x/y.css);</style>')],
      ['entity', Buffer.from('<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><text>&a;</text></svg>')],
      ['iframe', wrap('<iframe src="data:text/html,oi"/>')],
      ['embed', wrap('<embed src="x.swf"/>')],
      ['object', wrap('<object data="x.swf"/>')],
    ]
    for (const [label, bytes] of unsafe) expect({ label, thumb: await thumbOf(bytes, 'image/svg+xml') }).toEqual({ label, thumb: undefined })
    expect(await thumbOf(Buffer.from('<svg width="9" height="9"><image href="http://x/y.png"/></svg>'), 'image/svg+xml')).toBeUndefined()
  }, 30_000)

  it('an SVG too big for the cap falls back to a PNG of 640 px (a thumbnail is never over the cap, and the picture is still there)', async () => {
    const big = busyArt(2600)
    // The cap counts the characters of the data URL, which is base64 (4 characters for 3 bytes).
    expect(Buffer.from(big).toString('base64').length).toBeGreaterThan(DRAFT_THUMB_MAX_CHARS)
    const thumb = await thumbOf(Buffer.from(big), 'image/svg+xml')
    expect(thumb?.startsWith('data:image/png;base64,')).toBe(true)
    expect(thumb!.length).toBeLessThanOrEqual(DRAFT_THUMB_MAX_CHARS)
    expect(await widthOf(thumb!)).toBeGreaterThan(192)
  }, 60_000)

  it('a raster is 640 px wide (not 192), as a PNG; a smaller one is never enlarged; none is over the cap', async () => {
    const wide = await svgToPng(poster(1600, 800))
    const fromPng = wide.ok ? await thumbOf(wide.png, 'image/png') : undefined
    expect(fromPng?.startsWith('data:image/png;base64,')).toBe(true)
    expect(decode(fromPng!).subarray(0, 4).toString('hex')).toBe('89504e47')
    expect(fromPng!.length).toBeLessThanOrEqual(DRAFT_THUMB_MAX_CHARS)
    expect(await widthOf(fromPng!)).toBe(640)
    // A source smaller than the thumbnail stays as it is (the client never draws a raster past its real size anyway).
    const tiny = await loadSharp()!(wide.ok ? wide.png : Buffer.alloc(0)).resize({ width: 300 }).png().toBuffer({ resolveWithObject: true })
    expect(await widthOf((await thumbOf(tiny.data, 'image/png'))!)).toBe(300)
  }, 60_000)

  it('a photo (JPEG) keeps 640 px as a JPEG; noise that cannot fit the cap is shrunk or dropped, never over the cap', async () => {
    const source = await svgToPng(busyArt(900, 1400), { maxWidth: 1400 })
    const jpeg = await loadSharp()!(source.ok ? source.png : Buffer.alloc(0)).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
    const fromJpeg = await thumbOf(jpeg.data, 'image/jpeg')
    expect(fromJpeg?.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(fromJpeg!.length).toBeLessThanOrEqual(DRAFT_THUMB_MAX_CHARS)
    expect(await widthOf(fromJpeg!)).toBe(640)
    const noise = await thumbOf(noisePng(900), 'image/png')
    expect(noise === undefined || noise.length <= DRAFT_THUMB_MAX_CHARS).toBe(true)
    if (noise !== undefined) expect(await widthOf(noise)).toBeLessThanOrEqual(640)
  }, 60_000)

  it('none for anything that is not an image, for a broken image, or when the budget left is nothing', async () => {
    expect(await thumbOf(Buffer.from('texto'), 'text/plain')).toBeUndefined()
    expect(await thumbOf(Buffer.from('não é imagem'), 'image/png')).toBeUndefined()
    expect(await thumbOf(Buffer.from(poster()), 'image/svg+xml', { maxChars: 100 })).toBeUndefined()
  }, 30_000)
})

describe('draftFilesOfTurn', () => {
  it('lists the turn’s files with their final state, draws the PNG next to each SVG (one item, `pngPath`), and gives the first images a thumbnail', async () => {
    const dir = draft()
    const start = Date.now() - 60_000
    write(dir, 'antigo.txt', 'de antes', start - 1000)
    write(dir, 'cartaz.svg', poster(), start + 1000)
    write(dir, 'texto.md', '# Padaria Lua', start + 2000)
    write(dir, 'foto.png', (await svgToPng(poster(400, 200)) as { png: Buffer }).png, start + 3000)
    const files = await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'teo' })
    expect(files.map(file => file.path)).toEqual(['cartaz.svg', 'texto.md', 'foto.png'])
    const [svg, text, png] = files
    expect(svg).toMatchObject({ name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 't1', personaId: 'teo', pngPath: 'cartaz.png' })
    // The SVG's own picture rides on the line (vector); the PNG sibling stays on disk for the team.
    expect(svg?.thumb?.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(text).toMatchObject({ name: 'texto.md', mime: 'text/markdown', size: 13 })
    expect(text?.thumb).toBeUndefined()
    expect(png?.thumb?.startsWith('data:image/png;base64,')).toBe(true)
    // The PNG the host drew is on disk (Revisar shows both files) but it is not a second item of the line.
    expect(existsSync(join(dir, 'cartaz.png'))).toBe(true)
    expect(files.some(file => file.path === 'cartaz.png')).toBe(false)
    // Saving again in the next turn: the sibling is not drawn twice and nothing from the first turn comes back.
    const next = await draftFilesOfTurn({ root: dir, since: Date.now() + 5000, taskId: 't1', personaId: 'teo' })
    expect(next).toEqual([])
  }, 30_000)

  it('the thumbnails of ONE line share a budget: the line carries about DRAFT_THUMBS_LINE_MAX_CHARS of pictures (the last ones never below the small tier), and the first one is still the vector', async () => {
    const dir = draft()
    const start = Date.now() - 60_000
    for (let n = 0; n < 4; n += 1) write(dir, `arte-${String(n)}.svg`, busyArt(1800 + n), start + 1000 + n)
    const files = await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'teo' })
    const thumbs = files.map(file => file.thumb)
    expect(files.map(file => file.name)).toEqual(['arte-0.svg', 'arte-1.svg', 'arte-2.svg', 'arte-3.svg'])
    expect(thumbs[0]?.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(thumbs.every(thumb => thumb === undefined || thumb.length <= DRAFT_THUMB_MAX_CHARS)).toBe(true)
    expect(thumbs.reduce((sum, thumb) => sum + (thumb?.length ?? 0), 0)).toBeLessThanOrEqual(DRAFT_THUMBS_LINE_MAX_CHARS + DRAFT_THUMB_MIN_CHARS)
    // The picture of every SVG is still there: a smaller one when the budget ran out, not a hole.
    expect(thumbs.filter(thumb => thumb !== undefined).length).toBeGreaterThanOrEqual(3)
  }, 90_000)

  it('what the HOST put in the draft (inputs/ attachments, recebidos/ copies of a colleague) is never "saved by the persona"; her own files still are (P0-1 resto, Probe 09/11)', async () => {
    const dir = draft()
    const start = Date.now() - 60_000
    write(dir, 'inputs/foto.png', 'host', start + 1000)
    write(dir, 'inputs/abc-foto.png', 'host', start + 1000)
    write(dir, 'recebidos/Teo/cartaz.svg', poster(), start + 1000)
    write(dir, 'texto.md', '# dela', start + 2000)
    const files = await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'bia' })
    expect(files.map(file => file.path)).toEqual(['texto.md'])
  })

  it('a turn that saved nothing, or whose files are not readable, gives no line; and at most 12 files are named', async () => {
    const dir = draft()
    const start = Date.now() - 60_000
    expect(await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'teo' })).toEqual([])
    for (let n = 0; n < DRAFT_FILES_MAX + 5; n += 1) write(dir, `nota-${String(n).padStart(2, '0')}.txt`, 'x', start + 1000 + n)
    const files = await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'teo' })
    expect(files).toHaveLength(DRAFT_FILES_MAX)
    expect(files[0]?.name).toBe('nota-00.txt')
  })

  it('an SVG the host will not draw (external resource) is still listed, with no thumbnail and no `pngPath`', async () => {
    const dir = draft()
    const start = Date.now() - 60_000
    write(dir, 'ruim.svg', '<svg width="10" height="10"><image href="https://example.com/x.png"/></svg>', start + 1000)
    const [file] = await draftFilesOfTurn({ root: dir, since: start, taskId: 't1', personaId: 'teo' })
    expect(file).toMatchObject({ name: 'ruim.svg', mime: 'image/svg+xml' })
    expect(file?.thumb).toBeUndefined()
    expect(file?.pngPath).toBeUndefined()
    expect(existsSync(join(dir, 'ruim.png'))).toBe(false)
  }, 30_000)
})

describe('filesSavedBody', () => {
  it('says the fallback sentence in Portuguese: one file by name, several by count', () => {
    const file = (name: string) => ({ path: name, name, mime: 'text/plain', taskId: 't', personaId: 'p' })
    expect(filesSavedBody('Teo', [file('cartaz.svg')])).toBe('Teo salvou cartaz.svg no rascunho')
    expect(filesSavedBody('Teo', [file('a.svg'), file('b.png'), file('c.md')])).toBe('Teo salvou 3 arquivos no rascunho')
  })
})

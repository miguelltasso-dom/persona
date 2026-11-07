/**
 * P0-C2 (EQUIPE-REAL-SPEC §(e)): what a persona saved in the draft during ONE turn becomes one typed line. The pieces under test: reading a draft file without ever leaving
 * the draft, finding what the turn wrote, the thumbnail that rides on the line, and the PNG sibling of every SVG (the team sees the PNG).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { changedSince, DRAFT_FILES_MAX, DRAFT_THUMB_MAX_CHARS, draftFilesOfTurn, filesSavedBody, mimeOfFile, readDraftFile, thumbOf } from '../src/draft-turn-files.ts'
import { svgToPng } from '../src/svg-to-png.ts'

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
  it('makes a PNG data URL of at most 24 KB for an SVG and for a raster, and none for anything else or for an SVG that is not safe', async () => {
    const fromSvg = await thumbOf(Buffer.from(poster(1000, 500)), 'image/svg+xml')
    expect(fromSvg?.startsWith('data:image/png;base64,')).toBe(true)
    expect(fromSvg!.length).toBeLessThanOrEqual(DRAFT_THUMB_MAX_CHARS)
    // 192 px wide: the art is small on the line (40 px) but the opinion card shows it at 160 and opened at 480.
    const made = await svgToPng(poster(1000, 500), { maxWidth: 192 })
    expect(made.ok && made.width).toBe(192)
    const raster = await svgToPng(poster(800, 400))
    const fromPng = raster.ok ? await thumbOf(raster.png, 'image/png') : undefined
    expect(fromPng?.startsWith('data:image/png;base64,')).toBe(true)
    expect(decode(fromPng!).subarray(0, 4).toString('hex')).toBe('89504e47')
    expect(await thumbOf(Buffer.from('texto'), 'text/plain')).toBeUndefined()
    expect(await thumbOf(Buffer.from('<svg width="9" height="9"><image href="http://x/y.png"/></svg>'), 'image/svg+xml')).toBeUndefined()
    expect(await thumbOf(Buffer.from('não é imagem'), 'image/png')).toBeUndefined()
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
    expect(svg?.thumb?.startsWith('data:image/png;base64,')).toBe(true)
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

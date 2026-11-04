/**
 * SW-9 / SW-10 fixtures — proves the building blocks the five scenarios stand on (no host, no browser, ~3 s).
 * The scenarios themselves wait on SW-1..SW-8 (`persona-spec/PLAN.md`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MENU_AFTER,
  MENU_BEFORE,
  buildDocx,
  buildXlsx,
  createUserFolder,
  gitAncestorOf,
  gitOnPath,
  holdExclusiveLock,
  readDocxParagraphs,
  userFolderProblems,
  withGitHiddenFromPath,
  zipRead,
  type UserFolder,
} from '../src/simple-workspace-fixtures.ts'
import { E2E_TMP_ROOT } from '../src/paths.ts'

const folders: UserFolder[] = []
afterEach(async () => {
  while (folders.length > 0) await folders.pop()?.remove()
})

describe('simple-workspace fixtures (SW-9/SW-10)', () => {
  it('builds a real .docx whose paragraphs read back, accents and ampersands included', () => {
    expect(readDocxParagraphs(buildDocx(MENU_BEFORE))).toEqual([...MENU_BEFORE])
    expect(readDocxParagraphs(buildDocx(MENU_AFTER))).toEqual([...MENU_AFTER])
    const tricky = ['Pão & Café <novo>', 'Preço: R$ 1,10']
    expect(readDocxParagraphs(buildDocx(tricky))).toEqual(tricky)
  })

  it('is deterministic: same paragraphs, same bytes (so "restaura byte a byte" is checkable)', () => {
    expect(buildDocx(MENU_BEFORE).equals(buildDocx(MENU_BEFORE))).toBe(true)
    expect(buildDocx(MENU_BEFORE).equals(buildDocx(MENU_AFTER))).toBe(false)
  })

  it('produces archives other tools accept (bsdtar lists the OOXML parts)', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    for (const [file, parts] of [['cardápio.docx', ['word/document.xml', '[Content_Types].xml']], ['preços.xlsx', ['xl/worksheets/sheet1.xml', 'xl/workbook.xml']]] as const) {
      let listing = ''
      try {
        const bsdtar = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe')
        listing = execFileSync(existsSync(bsdtar) ? bsdtar : 'tar', ['-tf', join(folder.dir, file)], { encoding: 'utf8', timeout: 20_000 })
      } catch {
        // No bsdtar on this machine: fall back to our own reader (still proves the central directory is coherent).
        listing = parts.join('\n')
        for (const part of parts) expect(zipRead(readFileSync(join(folder.dir, file)), part)?.length ?? 0).toBeGreaterThan(0)
      }
      for (const part of parts) expect(listing).toContain(part)
    }
  })

  it('xlsx keeps its cells', () => {
    const sheet = zipRead(buildXlsx([['Item', 'Preço'], ['Café', '5,00']]), 'xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
    expect(sheet).toContain('<t>Café</t>')
    expect(sheet).toContain('<t>5,00</t>')
  })

  it('seeds a plain documents folder with no .git, and detects a .git or conflict markers if one appears', async () => {
    const folder = await createUserFolder({ extra: { 'sub/notas.txt': 'ok\n' } })
    folders.push(folder)
    expect(folder.files).toEqual(expect.arrayContaining(['cardápio.docx', 'preços.xlsx', 'recado.txt', 'sub/notas.txt']))
    expect(userFolderProblems(folder.dir)).toEqual([])

    mkdirSync(join(folder.dir, '.git'))
    expect(userFolderProblems(folder.dir).join('\n')).toContain('.git found')
    writeFileSync(join(folder.dir, 'recado.txt'), 'a\n<<<<<<< ficou o meu\nb\n=======\nc\n>>>>>>> da persona\n')
    expect(userFolderProblems(folder.dir).join('\n')).toContain('conflict markers')
  })

  it('keeps the user folder OUTSIDE any Git repository (a .git ancestor makes the product choose Git) and refuses a parent inside one', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    expect(gitAncestorOf(folder.dir)).toBeUndefined()
    // The repository's own scratch directory is inside the checkout: the guard must refuse it.
    await expect(createUserFolder({ parent: E2E_TMP_ROOT })).rejects.toThrow(/inside a Git repository/u)
    expect(gitAncestorOf(E2E_TMP_ROOT)).toBeDefined()
  })

  it('hides git from PATH for the "sem git" scenarios and restores it', () => {
    const before = process.env.PATH
    const hadGit = gitOnPath()
    const scope = withGitHiddenFromPath()
    try {
      expect(gitOnPath()).toBe(false)
      if (hadGit) expect(scope.removed.length).toBeGreaterThan(0)
    } finally {
      scope.restore()
      scope.restore()
    }
    expect(process.env.PATH).toBe(before)
    expect(gitOnPath()).toBe(hadGit)
  })

  it.skipIf(process.platform !== 'win32')('holds an exclusive lock like Excel does, then lets go', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    const file = join(folder.dir, 'preços.xlsx')
    closeSync(openSync(file, 'r+'))
    const lock = await holdExclusiveLock(file)
    try {
      expect(() => closeSync(openSync(file, 'r+'))).toThrow(/EBUSY|EPERM|EACCES/u)
      expect(() => readFileSync(file)).toThrow(/EBUSY|EPERM|EACCES/u)
    } finally {
      await lock.release()
    }
    closeSync(openSync(file, 'r+'))
    expect(readFileSync(file).length).toBeGreaterThan(100)
  }, 60_000)
})

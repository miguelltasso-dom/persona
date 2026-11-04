/**
 * SW-9 / SW-10 fixtures ("Rascunho da tarefa", `persona-spec/SIMPLE-WORKSPACE.md`): a user folder with real Office files,
 * a PATH without git, an exclusive file lock like Excel's, and the "folder has no `.git`" assertion.
 * Pure Node (no browser); safe to unit test. The scenarios themselves wait on SW-1..SW-8.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { crc32, inflateRawSync, deflateRawSync } from 'node:zlib'
import { E2E_TMP_ROOT } from './paths.ts'

// ---------------------------------------------------------------------------------------------------------------------
// Minimal OOXML (.docx / .xlsx) writer and reader: real zip containers, so "antes/depois" can read the text back.
// ---------------------------------------------------------------------------------------------------------------------

interface ZipEntry { readonly name: string; readonly data: Buffer }

function dosDateTime(): { time: number; date: number } {
  // Fixed stamp (2026-01-01 00:00) so the same input always yields the same bytes.
  return { time: 0, date: ((2026 - 1980) << 9) | (1 << 5) | 1 }
}

/**
 * @param entries - Files to store (deflate).
 * @returns A valid zip archive.
 */
export function zipStore(entries: readonly ZipEntry[]): Buffer {
  const { time, date } = dosDateTime()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const centralBytes = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBytes, end])
}

/**
 * @param archive - Zip bytes produced by {@link zipStore} (or any non-zip64 zip).
 * @param name - Entry to read.
 * @returns Entry bytes, or `undefined` when absent.
 */
export function zipRead(archive: Buffer, name: string): Buffer | undefined {
  const endAt = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (endAt < 0) return undefined
  const count = archive.readUInt16LE(endAt + 10)
  let cursor = archive.readUInt32LE(endAt + 16)
  for (let index = 0; index < count; index += 1) {
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const entryName = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (entryName === name) {
      const method = archive.readUInt16LE(cursor + 10)
      const size = archive.readUInt32LE(cursor + 20)
      const localAt = archive.readUInt32LE(cursor + 42)
      const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28)
      const raw = archive.subarray(dataAt, dataAt + size)
      return method === 8 ? inflateRawSync(raw) : Buffer.from(raw)
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return undefined
}

const xmlEscape = (text: string): string => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')

/**
 * A minimal but valid Word document.
 * @param paragraphs - One paragraph per entry.
 */
export function buildDocx(paragraphs: readonly string[]): Buffer {
  const body = paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`).join('')
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    },
  ])
}

/**
 * @param docx - Bytes of a document built by {@link buildDocx} (or any simple .docx).
 * @returns Paragraph texts in order.
 */
export function readDocxParagraphs(docx: Buffer): string[] {
  const xml = zipRead(docx, 'word/document.xml')?.toString('utf8') ?? ''
  return [...xml.matchAll(/<w:p>(.*?)<\/w:p>/gsu)].map(paragraph => [...(paragraph[1] ?? '').matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gsu)]
    .map(run => (run[1] ?? '').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&')).join(''))
}

/**
 * A minimal but valid Excel workbook (one sheet, inline strings).
 * @param rows - Rows of cell texts.
 */
export function buildXlsx(rows: readonly (readonly string[])[]): Buffer {
  const sheetRows = rows.map((row, r) => `<row r="${String(r + 1)}">${row.map((cell, c) => `<c r="${String.fromCharCode(65 + c)}${String(r + 1)}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`).join('')}</row>`).join('')
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Precos" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
    },
  ])
}

// ---------------------------------------------------------------------------------------------------------------------
// The user's folder.
// ---------------------------------------------------------------------------------------------------------------------

/** A plain documents folder as a bakery or agency owner has it: Office files, no `.git`. */
export interface UserFolder {
  readonly dir: string
  /** Relative paths of the seeded files. */
  readonly files: readonly string[]
  remove(): Promise<void>
}

export const MENU_BEFORE = [
  'Cardápio — Padaria Lua',
  'Pão francês: R$ 0,90',
  'Pão de queijo: R$ 4,50',
  'Café coado: R$ 5,00',
] as const

export const MENU_AFTER = [
  'Cardápio — Padaria Lua',
  'Pão francês: R$ 1,10',
  'Pão de queijo: R$ 5,00',
  'Café coado: R$ 6,00',
] as const

/**
 * Seed `cardápio.docx` + `preços.xlsx` + a note, under `.maestri/tmp` (never inside OneDrive, never with `.git`).
 * @param options - Optional parent directory and extra relative files (path → bytes).
 */
export async function createUserFolder(options: { parent?: string; extra?: Readonly<Record<string, Buffer | string>> } = {}): Promise<UserFolder> {
  await mkdir(options.parent ?? E2E_TMP_ROOT, { recursive: true })
  const dir = await mkdtemp(join(options.parent ?? E2E_TMP_ROOT, 'sw-user-folder-'))
  const seeded: Record<string, Buffer | string> = {
    'cardápio.docx': buildDocx(MENU_BEFORE),
    'preços.xlsx': buildXlsx([['Item', 'Preço'], ['Pão francês', '0,90'], ['Pão de queijo', '4,50'], ['Café coado', '5,00']]),
    'recado.txt': 'Fechamos às segundas.\n',
    ...options.extra,
  }
  for (const [relative, content] of Object.entries(seeded)) {
    const target = join(dir, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return { dir, files: Object.keys(seeded), remove: async () => { await rm(dir, { recursive: true, force: true }) } }
}

/**
 * The rule SW-10 ends on: the user's folder must still have no `.git`, no `.git` file (worktree pointer) and no
 * leftover marker/conflict text in the files.
 * @param dir - The user's folder.
 * @returns Problems found; empty when clean.
 */
export function userFolderProblems(dir: string): string[] {
  const problems: string[] = []
  const walk = (current: string, depth: number): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      if (name === '.git') problems.push(`.git found at ${full}`)
      let info
      try { info = statSync(full) } catch { continue }
      if (info.isDirectory()) { if (depth < 8) walk(full, depth + 1) }
      else if (info.size < 1_000_000 && /\.(txt|md|csv|json)$/iu.test(name)) {
        const text = readFileSync(full, 'utf8')
        if (/^(<{7}|={7}|>{7})( |$)/mu.test(text)) problems.push(`conflict markers in ${full}`)
      }
    }
  }
  walk(dir, 0)
  return problems
}

// ---------------------------------------------------------------------------------------------------------------------
// Environment switches for the five scenarios.
// ---------------------------------------------------------------------------------------------------------------------

/** Handle returned by environment switches; `restore()` is idempotent. */
export interface EnvScope { restore(): void }

/**
 * Scenario "sem git no PATH": drop every PATH directory that holds `git`, so the product must use its bundled MinGit.
 * Everything else (node, system dirs, CLI shims) stays.
 * @returns Scope handle; `removed` lists the PATH entries dropped (evidence for the report).
 */
export function withGitHiddenFromPath(): EnvScope & { readonly removed: readonly string[] } {
  const previous = process.env.PATH ?? ''
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  const removed: string[] = []
  const kept = previous.split(delimiter).filter((entry) => {
    if (entry === '') return false
    const hasGit = exts.some(ext => existsSync(join(entry, `git${ext}`)))
    if (hasGit) removed.push(entry)
    return !hasGit
  })
  process.env.PATH = kept.join(delimiter)
  const previousExec = process.env.GIT_EXEC_PATH
  delete process.env.GIT_EXEC_PATH
  let done = false
  return {
    removed,
    restore: () => {
      if (done) return
      done = true
      process.env.PATH = previous
      if (previousExec !== undefined) process.env.GIT_EXEC_PATH = previousExec
    },
  }
}

/** True when `git` resolves from the current `PATH` (to prove a scenario really has none). */
export function gitOnPath(): boolean {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : ['']
  return (process.env.PATH ?? '').split(delimiter).some(entry => entry !== '' && exts.some(ext => existsSync(join(entry, `git${ext}`))))
}

/** An exclusive lock held on a file, like Excel/Word do while the file is open. */
export interface FileLock {
  readonly pid: number | undefined
  release(): Promise<void>
}

/**
 * Scenario "planilha aberta durante o Aplicar": open `file` with `FileShare.None` from a separate process (Windows only)
 * until {@link FileLock.release}. Any read/write/rename of the file from another process fails with a sharing violation.
 * @param file - Absolute path to lock.
 * @returns Handle once the lock is confirmed held.
 */
export async function holdExclusiveLock(file: string): Promise<FileLock> {
  if (process.platform !== 'win32') throw new Error('holdExclusiveLock is Windows-only (FileShare.None)')
  const script = [
    `$f = [System.IO.File]::Open('${file.replace(/'/gu, "''")}', 'Open', 'ReadWrite', 'None')`,
    "[Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush()",
    '[Console]::In.ReadLine() | Out-Null',
    '$f.Dispose()',
  ].join('; ')
  const child: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  await new Promise<void>((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => { reject(new Error(`lock not confirmed within 20 s: ${out}`)) }, 20_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      if (out.includes('LOCKED')) { clearTimeout(timer); resolve() }
    })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`lock process exited early (${String(code)}): ${out}`)) })
  })
  return {
    pid: child.pid,
    release: async () => {
      child.removeAllListeners('exit')
      if (child.exitCode === null) {
        child.stdin?.end('\n')
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => { child.kill(); resolve() }, 5_000)
          child.on('exit', () => { clearTimeout(timer); resolve() })
        })
      }
    },
  }
}

/** A scratch directory outside the repo for scenarios that need a second root (history, restore points). */
export async function createScratchDir(prefix = 'sw-scratch-'): Promise<{ dir: string; remove(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  return { dir, remove: async () => { await rm(dir, { recursive: true, force: true }) } }
}

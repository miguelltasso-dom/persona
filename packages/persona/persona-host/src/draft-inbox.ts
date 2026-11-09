/**
 * P0-1 "o rascunho de quem recebe tem os arquivos" (Keel, 09/11, from the real round: Bia did not find Teo's poster, Teo did not find the person's foto.png, Lia RE-CREATED a file).
 *
 * Every Task has a draft folder of ITS OWN (nothing reaches the person's real folder before Revisar/Aplicar). So when work passes between personas (a colleague asked for help, the
 * work goes on to the next one, a reviewer, the asker woken by the delivery) what the receiver needs is COPIED into her draft, with the SAME relative path. The simplest safe design:
 * a copy, never a shared folder; read only from inside the sender's draft; written only inside the receiver's draft; never over a file that is already there.
 *
 * Pure file logic (no host state, no model). Nothing here throws: a file that cannot be carried is reported and left out.
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { changedSince, DRAFT_FILES_MAX, readDraftFile } from './draft-turn-files.ts'

/** Where the attachments of the person's request are staged in every draft (`media.ts`). */
export const INBOX_ATTACHMENTS_DIR = 'inputs'
/** Where a colleague's copy goes when the receiver already has a DIFFERENT file at the same path. */
export const INBOX_FROM_DIR = 'recebidos'
/** `changedSince` (draft-turn-files.ts) looks this far BEFORE the moment it is given; {@link savedSince} adds it back. */
const INBOX_CLOCK_SLACK_MS = 250
/** A copy is dated at most this long ago (more than `changedSince`'s quarter of a second), see {@link keepOldTime}. */
const COPY_AGE_MS = 2_000
/** One delivery carries at most this many bytes in all (each file is also capped by `readDraftFile`). */
export const INBOX_TOTAL_MAX_BYTES = 60 * 1024 * 1024

/** A file that reached the receiving draft. */
export interface CarriedFile {
  /** What the sender wrote (a path or just a name). */
  readonly wanted: string
  /** Where it is now, relative to the receiving draft, with `/`. */
  readonly at: string
  /** The receiver already had a different file at the same path: the copy went to `recebidos/<name>/…` instead. */
  readonly moved: boolean
  /** The receiver already had this very file (same bytes): nothing was written. */
  readonly same: boolean
}

export type CarryResult =
  | { readonly ok: true; readonly at: string; readonly moved: boolean; readonly same: boolean }
  | { readonly ok: false; readonly reason: 'outside' | 'not_found' | 'not_file' | 'too_big' | 'hidden' | 'no_draft' | 'failed' }

/** A path that cannot be shown inside a prompt block as it is (control characters, angle brackets). */
const UNSAFE_NAME = /[\0-\u001f<>]/u

/** The destination draft: an absolute, existing folder (a Task without a draft has `.` or nothing). */
function draftRootOf(path: string): string | undefined {
  if (path === '' || path === '.' || !isAbsolute(path)) return undefined
  try {
    const real = realpathSync(path)
    return statSync(real).isDirectory() ? real : undefined
  } catch {
    return undefined
  }
}

/** The name of the sender as ONE safe folder name (never a way out of `recebidos/`). */
function ownerSegment(owner: string): string {
  const flat = owner.normalize('NFC').replace(/[^\p{L}\p{N}_ .-]/gu, '_').replace(/^[.\s]+/u, '').trim().slice(0, 40)
  return flat === '' ? 'colega' : flat
}

/** `path` is inside `base` (both real). */
function isInside(base: string, path: string): boolean {
  const way = relative(base, path)
  return way !== '' && way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way)
}

/**
 * Read the file a sender cited: by its path in her draft, or — when it is not there — the ONE file of her draft with that name (a model writes a name, not always the path).
 */
function readCited(root: string, wanted: string): ReturnType<typeof readDraftFile> {
  const first = readDraftFile(root, wanted)
  if (first.ok || first.reason !== 'not_found') return first
  const bare = basename(wanted.trim().replace(/\\/gu, '/')).toLowerCase()
  if (bare === '' || bare === '.' || bare === '..') return first
  const found = changedSince(root, 0).filter(path => basename(path).toLowerCase() === bare)
  return found.length === 1 && found[0] !== undefined ? readDraftFile(root, found[0]) : first
}

/** Make the folders of `target` inside `base` without following a link that leads out of it. */
function ensureFolder(base: string, target: string): boolean {
  const parent = dirname(target)
  mkdirSync(parent, { recursive: true })
  const real = realpathSync(parent)
  return real === base || isInside(base, real)
}

/** Write `bytes` at `target` only when nothing is there ('wx'). @returns false when the file already exists. */
function writeNew(target: string, bytes: Buffer): boolean {
  try {
    writeFileSync(target, bytes, { flag: 'wx' })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/**
 * The copy keeps the time of the ORIGINAL (like `cp -p`), and never a time later than {@link COPY_AGE_MS} ago. A copy is the host's doing, not what the receiver wrote in her turn:
 * the line of the thread "X salvou N arquivos" (`draftFilesOfTurn`) lists what is newer than the start of the turn, and must not count the copies. Best effort.
 */
function keepOldTime(source: string, target: string): void {
  try {
    const when = new Date(Math.min(statSync(source).mtimeMs, Date.now() - COPY_AGE_MS))
    utimesSync(target, when, when)
  } catch (error) {
    void error
  }
}

/** Is the file at `target` a regular file with exactly these bytes? */
function sameBytes(target: string, bytes: Buffer): boolean {
  try {
    const info = lstatSync(target)
    return info.isFile() && info.size === bytes.length && readFileSync(target).equals(bytes)
  } catch {
    return false
  }
}

/**
 * Copy ONE file of a draft into another draft with the same relative path.
 * @param from - Root of the sender's draft (the only place anything is read from).
 * @param wanted - The file, as the sender wrote it (relative path or bare name). `..`, absolute paths, drives, links that leave the draft and dot-files are refused.
 * @param to - Root of the receiving draft (an absolute folder; `.`/empty = the Task has no draft and nothing is copied).
 * @param owner - Who the file comes from: names the folder `recebidos/<owner>/` used when the receiver already has a different file at that path.
 */
export function carryFile(from: string, wanted: string, to: string, owner: string): CarryResult {
  const base = draftRootOf(to)
  if (base === undefined) return { ok: false, reason: 'no_draft' }
  const read = readCited(from, wanted)
  if (!read.ok) return { ok: false, reason: read.reason }
  if (read.path.split('/').some(part => part.startsWith('.')) || UNSAFE_NAME.test(read.path)) return { ok: false, reason: 'hidden' }
  try {
    const target = resolve(base, ...read.path.split('/'))
    if (!isInside(base, target) || !ensureFolder(base, target)) return { ok: false, reason: 'outside' }
    const original = join(resolve(from), ...read.path.split('/'))
    if (writeNew(target, read.bytes)) {
      keepOldTime(original, target)
      return { ok: true, at: read.path, moved: false, same: false }
    }
    if (sameBytes(target, read.bytes)) return { ok: true, at: read.path, moved: false, same: true }
    // The receiver has ANOTHER file at that path (or a link): hers stays exactly as it is; the colleague's copy goes beside, in a folder that is only ever written here.
    const altPath = `${INBOX_FROM_DIR}/${ownerSegment(owner)}/${read.path}`
    const alt = resolve(base, ...altPath.split('/'))
    if (!isInside(base, alt) || !ensureFolder(base, alt)) return { ok: false, reason: 'outside' }
    if (existsSync(alt) && lstatSync(alt).isSymbolicLink()) return { ok: false, reason: 'outside' }
    if (!sameBytes(alt, read.bytes)) {
      writeFileSync(alt, read.bytes)
      keepOldTime(original, alt)
    }
    return { ok: true, at: altPath, moved: true, same: false }
  } catch (error) {
    void error
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Copy the files a sender cited or saved into the receiver's draft: at most {@link DRAFT_FILES_MAX}, {@link INBOX_TOTAL_MAX_BYTES} in all, each file once.
 * @param input - `from`/`to` are draft roots; `owner` is the sender's name; `wanted` the files in the order that matters (cited first).
 * @returns `carried` (where each one is now) and `missed` (what could not be carried, as the sender wrote it: not an error).
 */
export function carryFiles(input: { readonly from: string; readonly to: string; readonly owner: string; readonly wanted: readonly string[]; readonly max?: number }): { carried: CarriedFile[]; missed: string[] } {
  const carried: CarriedFile[] = []
  const missed: string[] = []
  const seen = new Set<string>()
  const max = input.max ?? DRAFT_FILES_MAX
  let bytes = 0
  for (const raw of input.wanted) {
    const wanted = raw.replace(/\\/gu, '/').trim().replace(/^\.\//u, '')
    if (wanted === '' || seen.has(wanted.toLowerCase())) continue
    seen.add(wanted.toLowerCase())
    if (carried.length >= max) break
    const result = carryFile(input.from, wanted, input.to, input.owner)
    if (!result.ok) {
      missed.push(wanted)
      continue
    }
    if (carried.some(item => item.at === result.at)) continue
    carried.push({ wanted, at: result.at, moved: result.moved, same: result.same })
    try { bytes += statSync(join(draftRootOf(input.to) ?? '', ...result.at.split('/'))).size } catch (error) { void error }
    if (bytes > INBOX_TOTAL_MAX_BYTES) break
  }
  return { carried, missed }
}

/** A file name with an extension a persona saves (art, documents, text, code, data): `dir/name.ext`, each part short and plain. */
const FILE_NAME = /^(?:[\w.-]{1,60}\/){0,6}[\w][\w-]{0,80}(?:\.[\w-]{1,20}){0,3}\.(?:svg|png|jpe?g|gif|webp|pdf|txt|md|html?|css|js|json|csv|xml|docx|xlsx|pptx|ts|tsx|py|zip)$/iu
/** What separates the words of a text from a file name that sits among them. */
const NOT_NAME = /[\s"'`<>()[\]{},;:*|=!?]+/u
/** Only this much of a text is read (a delivery can be a whole SVG): the cost stays flat. */
const NAMED_SCAN_MAX = 30_000

/**
 * The file names a text cites ("a capa está em arte/capa-final.png"): a name with a known extension, never a URL or an absolute path, each once, in order, at most 12.
 * @param text - What a persona wrote (a bilhete, a delivery).
 */
export function filesNamedIn(text: string): string[] {
  const out: string[] = []
  for (const token of text.slice(0, NAMED_SCAN_MAX).split(NOT_NAME)) {
    if (token.length < 3 || token.length > 200 || token.startsWith('/') || token.startsWith('\\')) continue
    const name = token.replace(/\.+$/u, '')
    if (!FILE_NAME.test(name) || out.some(item => item.toLowerCase() === name.toLowerCase())) continue
    out.push(name)
    if (out.length >= DRAFT_FILES_MAX) break
  }
  return out
}

/**
 * The files a persona wrote in her draft since a moment (her turn): never the staged attachments (`inputs/`), never what was received (`recebidos/`), never hidden files.
 * @param root - Her draft.
 * @param sinceMs - Epoch ms (the start of her first turn).
 */
export function savedSince(root: string, sinceMs: number): string[] {
  // `changedSince` forgives a quarter of a second of clock difference BEFORE the moment; here it is not forgiven: a draft made right before the turn must not be taken for her work.
  return changedSince(root, sinceMs + INBOX_CLOCK_SLACK_MS).filter(path => !path.startsWith(`${INBOX_ATTACHMENTS_DIR}/`) && !path.startsWith(`${INBOX_FROM_DIR}/`))
}

/** One line of what reached a draft: the path, whose it is, and whether the receiver's own file was kept. */
export interface InboxLine {
  readonly at: string
  /** `pedido`: an attachment of the person's request; otherwise the name of the colleague. */
  readonly from: 'pedido' | string
  readonly moved: boolean
  /** The path the sender wrote, when the copy went elsewhere (`moved`). */
  readonly wanted?: string
}

/**
 * The paragraph the receiver's prompt carries (data, never an instruction): where the files are, so she reads them instead of re-creating them.
 * @param lines - What was copied now (not what was already there).
 * @returns The paragraph, or undefined when nothing was copied.
 */
export function inboxParagraph(lines: readonly InboxLine[]): string | undefined {
  if (lines.length === 0) return undefined
  const rows = lines.map((line) => {
    const whose = line.from === 'pedido' ? 'anexo do pedido da pessoa' : `de ${line.from}`
    const kept = line.moved && line.wanted !== undefined ? `; você já tinha ${line.wanted}, que ficou como estava` : ''
    return `- ${line.at} (${whose}${kept})`
  })
  return ['Arquivos que chegaram no seu rascunho (cópias; leia daqui e não recrie o que já existe):', ...rows].join('\n')
}

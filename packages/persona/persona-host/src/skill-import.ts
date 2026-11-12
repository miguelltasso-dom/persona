/**
 * Item 26.10 (host): bring a skill in from a GitHub link. The link names a repository (and optionally a folder); the host downloads the
 * repository's tarball, reads it in memory with limits, validates every `SKILL.md` and returns a preview. Nothing is executed: a skill's
 * scripts are only FLAGGED (the markdown is what the team gets), and a malicious archive (traversal, symlink, oversized, too many files)
 * is refused before anything is written.
 */

import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

/** What a link names. */
export interface SkillLink {
  readonly owner: string
  readonly repo: string
  /** Branch, tag or commit; `HEAD` when the link carries none. */
  readonly ref: string
  /** Folder inside the repository (`''` = the whole repository). */
  readonly path: string
}

/** One file read from the archive. */
export interface ArchiveFile {
  readonly path: string
  readonly body: string
}

/** One skill found in the archive. */
export interface SkillCandidate {
  /** The folder of the skill (`''` = the repository root). */
  readonly dir: string
  readonly name: string
  readonly description: string
  /** The `SKILL.md` itself. */
  readonly body: string
  /** Hash of the body: "Atualizar" compares it with the stored one. */
  readonly hash: string
  /** Every file of the skill folder, relative to it. */
  readonly files: readonly string[]
  /** The folder carries a program (`.sh`, `.py`, `.js`…): the team gets the markdown, the script is never run. */
  readonly hasScripts: boolean
}

/** A file the import left out, and why. */
export interface IgnoredFile {
  readonly path: string
  readonly reason: string
}

/** What the screen shows before the person confirms. */
export interface SkillImportPreview {
  /** Where the skills come from; each candidate carries its own body hash. */
  readonly source: { readonly url: string; readonly ref: string }
  readonly skills: readonly SkillCandidate[]
  readonly ignored: readonly IgnoredFile[]
}

/** Limits of one archive (a skill is text; a big archive is not one). */
export const SKILL_ARCHIVE_MAX_BYTES = 8 * 1024 * 1024
export const SKILL_FILE_MAX_BYTES = 512 * 1024
export const SKILL_ARCHIVE_MAX_FILES = 200
/** Carbon P0-03: the DECOMPRESSED size of the tar. A gzip bomb is a few KB that unpack to gigabytes: the unzip stops here, before the memory is taken. */
export const SKILL_TAR_MAX_BYTES = 16 * 1024 * 1024

const SCRIPT = /\.(?:sh|bash|zsh|ps1|bat|cmd|py|js|mjs|cjs|ts|rb|pl|exe|dll)$/iu

/**
 * @param url - A GitHub link: `github.com/o/r`, `…/tree/<ref>/<path>` or `…/blob/<ref>/<path>/SKILL.md`.
 * @returns What it names, or undefined when it is not a GitHub link.
 */
export function parseSkillLink(url: string): SkillLink | undefined {
  const parsed = parseUrl(url)
  if (parsed === undefined) return undefined
  if (parsed.host !== 'github.com' && parsed.host !== 'www.github.com') return undefined
  const [owner, repo, kind, ref, ...rest] = parsed.parts
  if (owner === undefined || repo === undefined || owner === '' || repo === '') return undefined
  if (kind === undefined) return { owner, repo: clean(repo), ref: 'HEAD', path: '' }
  if (kind !== 'tree' && kind !== 'blob') return undefined
  if (ref === undefined || ref === '') return undefined
  const parts = [...rest]
  // A blob link points at the file itself: the skill is its folder.
  if (kind === 'blob' && parts.at(-1)?.toUpperCase() === 'SKILL.MD') parts.pop()
  return { owner, repo: clean(repo), ref, path: parts.join('/') }
}

/**
 * Read a gzipped tar (what GitHub serves) in memory, keeping only text files inside the limits.
 * @param bytes - The downloaded archive.
 * @param link - What the link named: the folder prefix is applied here.
 * @returns The files and the ones left out.
 */
export function readArchive(bytes: Uint8Array, link: SkillLink): { files: ArchiveFile[]; ignored: IgnoredFile[] } {
  const files: ArchiveFile[] = []
  const ignored: IgnoredFile[] = []
  let tar: Buffer
  try {
    tar = gunzipSync(bytes, { maxOutputLength: SKILL_TAR_MAX_BYTES })
  } catch (error) {
    // A bomb (the unpacked size passes the limit) is a different sentence from a file that is not a package at all.
    const tooBig = error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
    return { files: [], ignored: [{ path: '*', reason: tooBig ? 'O pacote é grande demais para trazer uma skill.' : 'O arquivo não é um pacote do GitHub.' }] }
  }
  let offset = 0
  let count = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = cString(header, 0, 100)
    const prefix = cString(header, 345, 155)
    const full = prefix === '' ? name : `${prefix}/${name}`
    const size = octal(header, 124, 12)
    // Carbon P0-03: a size that is not plain octal (a sign, letters, a base-256 marker) is a hostile or broken archive. It used to be read as a negative number and the offset stopped
    // advancing (an endless loop on the host's thread): nothing of such an archive is trusted.
    if (size === undefined) return { files: [], ignored: [{ path: full === '' ? '*' : full, reason: 'O pacote está malformado (tamanho inválido num cabeçalho).' }] }
    const type = String.fromCharCode(header[156] ?? 0)
    offset += 512 + Math.ceil(size / 512) * 512
    if (type !== '0' && type !== '') continue // directories (5), symlinks (2), pax headers (x/g): never read
    count += 1
    if (count > SKILL_ARCHIVE_MAX_FILES) {
      ignored.push({ path: full, reason: 'O pacote tem arquivos demais.' })
      break
    }
    if (unsafe(full)) {
      ignored.push({ path: full, reason: 'O caminho sai da pasta do pacote.' })
      continue
    }
    const relative = stripRoot(full)
    if (link.path !== '' && relative !== link.path && !relative.startsWith(`${link.path}/`)) continue
    if (size > SKILL_FILE_MAX_BYTES) {
      ignored.push({ path: relative, reason: 'O arquivo é grande demais.' })
      continue
    }
    const bodyStart = offset - Math.ceil(size / 512) * 512
    if (bodyStart + size > tar.length) return { files: [], ignored: [{ path: relative, reason: 'O pacote está incompleto.' }] }
    const body = tar.subarray(bodyStart, bodyStart + size)
    if (body.includes(0)) {
      ignored.push({ path: relative, reason: 'O arquivo não é texto.' })
      continue
    }
    files.push({ path: relative, body: body.toString('utf8') })
  }
  return { files, ignored }
}

/**
 * Find the skills of an archive: every `SKILL.md` (or `<dir>/SKILL.md`) with a valid frontmatter.
 * @param files - The archive's text files.
 * @returns The candidates and the `SKILL.md` files that were refused.
 */
export function skillCandidates(files: readonly ArchiveFile[]): { skills: SkillCandidate[]; ignored: IgnoredFile[] } {
  const skills: SkillCandidate[] = []
  const ignored: IgnoredFile[] = []
  for (const file of files) {
    const parts = file.path.split('/')
    if (parts.at(-1)?.toUpperCase() !== 'SKILL.MD') continue
    const dir = parts.slice(0, -1).join('/')
    const front = frontmatter(file.body)
    if (front === undefined || front.name === '' || front.description === '') {
      ignored.push({ path: file.path, reason: 'O SKILL.md precisa de name e description.' })
      continue
    }
    const inside = files.filter(item => (dir === '' ? !item.path.includes('/') : item.path.startsWith(`${dir}/`)))
      .map(item => (dir === '' ? item.path : item.path.slice(dir.length + 1)))
    skills.push({
      dir,
      name: front.name,
      description: front.description,
      body: file.body,
      hash: skillHash(file.body),
      files: inside.sort(),
      hasScripts: inside.some(name => SCRIPT.test(name)),
    })
  }
  return { skills, ignored }
}

/**
 * @param body - The `SKILL.md`.
 * @returns Its frontmatter fields, or undefined when it has none.
 */
export function frontmatter(body: string): { name: string; description: string } | undefined {
  const lines = body.split(/\r?\n/u)
  if (lines[0]?.trim() !== '---') return undefined
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return undefined
  const fields: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_]+):\s*(.*)$/u.exec(line)
    if (match === null) continue
    const value = (match[2] ?? '').trim().replace(/^["']|["']$/gu, '')
    if (match[1] !== undefined) fields[match[1].toLowerCase()] = value
  }
  return { name: fields.name ?? '', description: fields.description ?? '' }
}

/**
 * @param body - The `SKILL.md`.
 * @returns Its hash, so "Atualizar" can tell the same content from a new one.
 */
export function skillHash(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

/**
 * @param link - What the link names.
 * @returns The tarball address GitHub serves for that repository and ref.
 */
export function archiveUrl(link: SkillLink): string {
  return `https://codeload.github.com/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}/tar.gz/${encodeURIComponent(link.ref)}`
}

function parseUrl(url: string): { host: string; parts: string[] } | undefined {
  const trimmed = url.trim()
  if (trimmed === '') return undefined
  const withScheme = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch (error) {
    void error
    return undefined
  }
  return {
    host: parsed.hostname.toLowerCase(),
    parts: parsed.pathname.split('/').filter(part => part !== '').map(part => decodeURIComponent(part)),
  }
}

function clean(repo: string): string {
  return repo.replace(/\.git$/iu, '')
}

function cString(header: Buffer, start: number, length: number): string {
  const slice = header.subarray(start, start + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
}

/** @returns The octal field as a number (an empty field is 0), or undefined when it is anything but 1-12 octal digits: the old parser took "-1000" as -512. */
function octal(header: Buffer, start: number, length: number): number | undefined {
  const text = cString(header, start, length).trim()
  if (text === '') return 0
  return /^[0-7]{1,12}$/u.test(text) ? Number.parseInt(text, 8) : undefined
}

/** A path that would leave the archive (absolute, `..`, drive letter) is never read. */
function unsafe(path: string): boolean {
  return path.startsWith('/') || path.includes('..') || /^[A-Za-z]:/u.test(path)
}

/** GitHub wraps everything in `<repo>-<ref>/`; the skill paths are read without it. */
function stripRoot(path: string): string {
  const index = path.indexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

/**
 * Workspace/project Markdown export as a stored-method ZIP. DMs stay out
 * unless the caller opts in per DM id. Secrets are redacted.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import type { EventRepos, ProductRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'

/** Who and what to pack. */
export interface ExportRequest {
  readonly workspaceId: string
  readonly projectId?: string
  readonly includeDmIds?: readonly string[]
}

/** Packed archive. */
export interface ExportArchive {
  readonly filename: string
  readonly bytes: Uint8Array
}

/**
 * Build a zip of Markdown files. DMs omitted unless listed.
 * @param product - Workspace/projects/personas.
 * @param events - Channel (and optional DM) streams.
 * @param vault - Readable Cofre files.
 * @param request - Scope + optional DM ids.
 */
export function exportMarkdown(
  product: ProductRepos,
  events: EventRepos,
  vault: VaultRepos,
  request: ExportRequest,
  actorId: string,
): ExportArchive {
  const files = new Map<string, string>()
  const projects = request.projectId === undefined
    ? product.listProjects(request.workspaceId)
    : [product.getProject(request.projectId)].filter((item): item is NonNullable<typeof item> => item !== undefined)
  const allowedDm = new Set(request.includeDmIds ?? [])
  files.set('README.md', redact(`# Persona\n\nExportado em ${new Date().toISOString()}\n`))
  for (const project of projects) {
    const prefix = `${slug(project.name)}/`
    files.set(`${prefix}projeto.md`, redact(`# ${project.name}\n\n${project.description}\n`))
    const personas = product.listPersonas(project.id)
    files.set(
      `${prefix}equipe.md`,
      redact(personas.map(persona => `- ${persona.name} — ${persona.title}`).join('\n') || '- (vazia)'),
    )
    for (const channel of product.listChannels(project.id)) {
      const page = events.list(`channel:${channel.id}`, { id: actorId }, 0, 200)
      const body = page.events.map(item => `- ${item.occurredAt} ${item.actorId}: ${item.body}`).join('\n')
      files.set(`${prefix}canais/${slug(channel.name)}.md`, redact(`# #${channel.name}\n\n${body}\n`))
    }
    for (const dm of product.listDms(project.id)) {
      if (!allowedDm.has(dm.id)) continue
      const page = events.list(`dm:${dm.id}`, { id: actorId }, 0, 200)
      const body = page.events.map(item => `- ${item.occurredAt} ${item.actorId}: ${item.body}`).join('\n')
      files.set(`${prefix}dms/${slug(dm.id)}.md`, redact(`# DM ${dm.id}\n\n${body}\n`))
    }
    for (const record of vault.listRecords(project.id)) {
      files.set(
        `${prefix}cofre/${slug(record.kind)}-${slug(record.id)}.md`,
        redact(`# ${record.kind}\n\n${record.body}\n`),
      )
    }
  }
  const bytes = zipStore(files)
  const name = request.projectId === undefined ? 'persona-workspace.zip' : 'persona-project.zip'
  return { filename: name, bytes }
}

/**
 * Inflate a zip produced by {@link exportMarkdown} into path → body.
 * @param bytes - Archive bytes.
 */
export function readZipTexts(bytes: Uint8Array): Map<string, string> {
  const buf = Buffer.from(bytes)
  const files = new Map<string, string>()
  let offset = 0
  while (offset + 30 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8)
    const comp = buf.readUInt32LE(offset + 18)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extra = buf.readUInt16LE(offset + 28)
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8')
    const start = offset + 30 + nameLen + extra
    const data = buf.subarray(start, start + comp)
    const raw = method === 8 ? inflateRawSync(data) : data
    files.set(name, raw.toString('utf8'))
    offset = start + comp
  }
  return files
}

/**
 * @param text - File body.
 */
export function redact(text: string): string {
  if (!looksLikeCredential(text)) return text
  return text.replace(/\b(?:sk-|tok-|key-|ghp_|github_pat_)[A-Za-z0-9._-]{6,}\b/gu, '[redacted]')
}

function slug(value: string): string {
  const next = value.toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^-|-$/gu, '')
  return next === '' ? 'item' : next.slice(0, 48)
}

function zipStore(files: Map<string, string>): Uint8Array {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, body] of files) {
    const data = Buffer.from(body, 'utf8')
    const compressed = deflateRawSync(data)
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    chunks.push(local, compressed)
    const cen = Buffer.alloc(46 + nameBuf.length)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt16LE(0, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(compressed.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30)
    cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34)
    cen.writeUInt16LE(0, 36)
    cen.writeUInt32LE(0, 38)
    cen.writeUInt32LE(offset, 42)
    nameBuf.copy(cen, 46)
    central.push(cen)
    offset += local.length + compressed.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, centralBuf, end])
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

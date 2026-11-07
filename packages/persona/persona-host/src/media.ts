/**
 * Attachment and avatar blobs: detect, hash-store, ACL, stage into inputs/.
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProductRepos, SqliteMediaRepos, StoredAttachment } from '@deepseek-ai/dsh-persona-store'
import {
  MAX_AVATAR_BYTES,
  MAX_BYTES_PER_MESSAGE,
  MAX_FILES_PER_MESSAGE,
  MAX_PROJECT_BYTES,
  MediaError,
  fileTooLargeMessage,
  detectUpload,
  sanitizeUploadName,
} from './media-detect.ts'
import { imageTypeOf, pickTurnImages, type SkippedImage, type TurnImage } from './turn-images.ts'

/** One attachment on the wire. */
export interface AttachmentView {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly bytes: number
  readonly hash: string
  readonly credentialWarning: boolean
  readonly messageId: string
}

/** Bytes as base64 (Typert JSON-safe). */
export interface AttachmentBytesView {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly bytesBase64: string
  readonly credentialWarning: boolean
}

/**
 * Disk + SQLite media. Files live under PERSONA_HOME.
 */
export class MediaHost {
  readonly product: ProductRepos
  readonly media: SqliteMediaRepos
  readonly root: string
  now: () => string

  /**
   * @param product - Projects, personas, DMs.
   * @param media - Metadata.
   * @param storePath - `persona.db` path (home is its grandparent, or env).
   * @param now - Instant factory.
   */
  constructor(
    product: ProductRepos,
    media: SqliteMediaRepos,
    storePath: string,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.product = product
    this.media = media
    this.root = resolveMediaHome(storePath)
    this.now = now
  }

  /**
   * Store one attachment. Not bound to a message yet.
   * @param input - Tenant, stream, name, bytes.
   */
  attachFile(input: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    name: string
    bytes: Uint8Array
  }): AttachmentView {
    const detected = detectUpload(input.bytes, input.name, 'attachment')
    if (this.media.projectBytes(input.projectId) + detected.bytes > MAX_PROJECT_BYTES) {
      throw new MediaError('project-quota', 'A pasta de anexos deste projeto está cheia (limite 200 MB).')
    }
    const hash = sha256(input.bytes)
    this.writeBlob('attachment', input.projectId, hash, input.bytes)
    this.media.putBlob({
      hash, bytes: detected.bytes, mime: detected.mime, kind: 'attachment', createdAt: this.now(),
    })
    const row = this.media.insert({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      streamKind: input.streamKind,
      ownerId: input.ownerId,
      hash,
      name: detected.name,
      credentialWarning: detected.credentialWarning,
      createdAt: this.now(),
    })
    return toAttachmentView(row)
  }

  /**
   * Bind uploads to a posted message. Enforces per-message caps.
   * @param messageId - Event id.
   * @param ids - Attachment ids owned by this stream.
   * @param projectId - Tenant.
   * @param streamKind - Channel or DM.
   * @param ownerId - Stream owner.
   */
  bindToMessage(
    messageId: string,
    ids: readonly string[],
    projectId: string,
    streamKind: 'channel' | 'dm',
    ownerId: string,
  ): void {
    if (ids.length === 0) return
    if (ids.length > MAX_FILES_PER_MESSAGE) throw new Error('too-many-files')
    let total = 0
    for (const id of ids) {
      const row = this.media.get(id)
      if (row === undefined) throw new Error('attachment-not-found')
      if (row.projectId !== projectId || row.streamKind !== streamKind || row.ownerId !== ownerId) {
        throw new Error('attachment-mismatch')
      }
      if (row.messageId !== undefined && row.messageId !== messageId) throw new Error('attachment-bound')
      total += row.bytes
    }
    if (total > MAX_BYTES_PER_MESSAGE) {
      throw new MediaError('message-too-large', fileTooLargeMessage(total, MAX_BYTES_PER_MESSAGE, 'Estes arquivos juntos'))
    }
    this.media.bind(messageId, ids)
  }

  /**
   * @param messageId - Event id.
   */
  listByMessage(messageId: string): AttachmentView[] {
    return this.media.listByMessage(messageId).map(toAttachmentView)
  }

  /**
   * @param projectId - Tenant.
   * @param streamKind - Channel or DM.
   * @param ownerId - Stream owner.
   */
  listByStream(projectId: string, streamKind: 'channel' | 'dm', ownerId: string): AttachmentView[] {
    return this.media.listByStream(projectId, streamKind, ownerId).map(toAttachmentView)
  }

  /**
   * @param eventId - Message id.
   */
  namesOf(eventId: string): string[] {
    return this.media.listByMessage(eventId).map(row => row.name)
  }

  /**
   * Copy attachments into `inputs/` (read-only when the OS allows).
   * @param eventId - Origin message.
   * @param destDir - Worktree or talk cwd.
   */
  stageInto(eventId: string, destDir: string): string[] {
    return this.stageForRunner(eventId, destDir, false).stagedNames
  }

  /**
   * Vision-capable runners get images as bytes; others get a worktree copy.
   * ACL is the same as {@link readAttachment}: only bound, readable files.
   * @param eventId - Origin message.
   * @param destDir - Worktree or talk cwd.
   * @param hasVision - Rivet `capabilities().vision === true`.
   */
  stageForRunner(eventId: string, destDir: string, hasVision: boolean): {
    stagedNames: string[]
    visionImages: Array<{ name: string; mime: string; bytesBase64: string }>
  } {
    const rows = this.media.listByMessage(eventId)
    if (rows.length === 0) return { stagedNames: [], visionImages: [] }
    const inputs = join(destDir, 'inputs')
    mkdirSync(inputs, { recursive: true, mode: 0o700 })
    const stagedNames: string[] = []
    const visionImages: Array<{ name: string; mime: string; bytesBase64: string }> = []
    for (const row of rows) {
      const src = this.blobPath('attachment', row.projectId, row.hash)
      const image = hasVision && row.mime.startsWith('image/')
      if (image) {
        visionImages.push({
          name: row.name,
          mime: row.mime,
          bytesBase64: Buffer.from(readFileSync(src)).toString('base64'),
        })
        continue
      }
      const dest = join(inputs, sanitizeUploadName(row.name))
      copyFileSync(src, dest)
      try {
        chmodSync(dest, 0o444)
      } catch (error: unknown) {
        void error
      }
      stagedNames.push(row.name)
    }
    return { stagedNames, visionImages }
  }

  /**
   * TEAM-5: the images of the messages a turn is about, put where the runner can read them (an ABSOLUTE path under `destDir/inputs/`)
   * and validated the way the runner will (4 types, ≤ 4 per turn, ≤ 5 MB each). Whatever is left out is reported, never dropped in silence.
   * Same ACL as the other staging: only files bound to those messages.
   * @param eventIds - The messages the turn is about, in thread order.
   * @param destDir - Worktree or talk cwd.
   */
  stageTurnImages(eventIds: readonly string[], destDir: string): { images: TurnImage[]; skipped: SkippedImage[] } {
    const rows = [...new Set(eventIds)].flatMap(id => this.media.listByMessage(id))
    const { chosen, skipped } = pickTurnImages(rows.map(row => ({ id: row.id, name: row.name, mime: row.mime, bytes: row.bytes })))
    if (chosen.length === 0) return { images: [], skipped }
    const inputs = join(destDir, 'inputs')
    mkdirSync(inputs, { recursive: true, mode: 0o700 })
    const images: TurnImage[] = []
    for (const pick of chosen) {
      const row = rows.find(item => item.id === pick.id)
      const mediaType = imageTypeOf(pick.mime)
      if (row === undefined || mediaType === undefined) continue
      const dest = join(inputs, `${row.id}-${sanitizeUploadName(row.name)}`)
      copyFileSync(this.blobPath('attachment', row.projectId, row.hash), dest)
      images.push({ path: resolve(dest), mediaType, name: row.name })
    }
    return { images, skipped }
  }

  /**
   * TEAM-4: which of these attachment ids exist in the project (a persona may name any id).
   * @param projectId - Tenant.
   * @param ids - Attachment ids.
   */
  existingIds(projectId: string, ids: readonly string[], stream: { readonly streamKind: 'channel' | 'dm'; readonly ownerId: string }): string[] {
    // Only files of the SAME conversation the Task is in: a persona must not show the team a file from another channel or someone's DM.
    return ids.filter((id) => {
      const row = this.media.get(id)
      return row !== undefined && row.projectId === projectId && row.streamKind === stream.streamKind && row.ownerId === stream.ownerId
    })
  }

  /**
   * TEAM-4: tie the draft's files to the line that shows them (so the clip is in the thread and in the database). Only files not tied to a
   * message yet; one that already belongs to another message stays there (it is shown there).
   * @param messageId - The request line.
   * @param ids - Attachment ids that passed {@link existingIds}.
   * @param projectId - Tenant.
   * @param stream - The conversation of the Task.
   * @returns The ids now tied to the line.
   */
  bindDraft(messageId: string, ids: readonly string[], projectId: string, stream: { readonly streamKind: 'channel' | 'dm'; readonly ownerId: string }): string[] {
    const loose = ids.filter(id => this.media.get(id)?.messageId === undefined)
    if (loose.length === 0) return []
    this.bindToMessage(messageId, loose, projectId, stream.streamKind, stream.ownerId)
    return loose
  }

  /**
   * TEAM-4: the images of a draft a persona names by attachment id, as files the runner can read (an ABSOLUTE path under the media home),
   * validated the way the runner will (4 types, ≤ 4, ≤ 5 MB). Only attachments of this project; what is not a valid image is counted, never sent.
   * @param projectId - Tenant.
   * @param ids - Attachment ids, in the order the persona named them.
   * @param key - The round (names the folder, so a repeat reuses it).
   */
  stageAttachmentImages(projectId: string, ids: readonly string[], key: string): { images: TurnImage[]; skipped: number } {
    const rows = ids.flatMap((id) => {
      const row = this.media.get(id)
      return row !== undefined && row.projectId === projectId ? [row] : []
    })
    const { chosen, skipped } = pickTurnImages(rows.map(row => ({ id: row.id, name: row.name, mime: row.mime, bytes: row.bytes })))
    if (chosen.length === 0) return { images: [], skipped: skipped.length }
    const dir = join(this.root, 'opinion', sanitizeUploadName(key))
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const images: TurnImage[] = []
    for (const pick of chosen) {
      const row = rows.find(item => item.id === pick.id)
      const mediaType = imageTypeOf(pick.mime)
      if (row === undefined || mediaType === undefined) continue
      const dest = join(dir, `${row.id}-${sanitizeUploadName(row.name)}`)
      copyFileSync(this.blobPath('attachment', row.projectId, row.hash), dest)
      images.push({ path: resolve(dest), mediaType, name: row.name })
    }
    return { images, skipped: skipped.length }
  }

  /**
   * P0-C2: images that are NOT attachments (the art a persona saved in the draft of her Task, an SVG already turned into PNG) as files the runner can read, validated the
   * way {@link stageAttachmentImages} does (4 types, ≤ 4, ≤ 5 MB). Nothing is stored in the media library: they live in the round's own folder.
   * @param items - Name, media type and bytes, in the order they should be shown.
   * @param key - The round (names the folder, so a repeat reuses it).
   */
  stageBufferImages(items: readonly { readonly name: string; readonly mime: string; readonly bytes: Buffer }[], key: string): { images: TurnImage[]; skipped: number } {
    const { chosen, skipped } = pickTurnImages(items.map((item, at) => ({ id: String(at), name: item.name, mime: item.mime, bytes: item.bytes.length })))
    if (chosen.length === 0) return { images: [], skipped: skipped.length }
    const dir = join(this.root, 'opinion', sanitizeUploadName(key))
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const images: TurnImage[] = []
    for (const pick of chosen) {
      const item = items[Number(pick.id)]
      const mediaType = imageTypeOf(pick.mime)
      if (item === undefined || mediaType === undefined) continue
      const dest = join(dir, `art-${pick.id}-${sanitizeUploadName(item.name)}`)
      writeFileSync(dest, item.bytes, { mode: 0o600 })
      images.push({ path: resolve(dest), mediaType, name: item.name })
    }
    return { images, skipped: skipped.length }
  }

  /**
   * @param id - Attachment id.
   * @param actorId - Session member.
   */
  readAttachment(id: string, actorId: string): AttachmentBytesView {
    const row = this.requireReadable(id, actorId)
    const bytes = readFileSync(this.blobPath('attachment', row.projectId, row.hash))
    return {
      id: row.id,
      name: row.name,
      mime: row.mime,
      bytesBase64: Buffer.from(bytes).toString('base64'),
      credentialWarning: row.credentialWarning,
    }
  }

  /**
   * Store an uploaded avatar and point the persona at it.
   * @param personaId - Persona.
   * @param projectId - Tenant.
   * @param name - Client filename.
   * @param bytes - Image bytes.
   */
  uploadAvatar(personaId: string, projectId: string, name: string, bytes: Uint8Array): { hash: string; mime: string } {
    if (bytes.byteLength > MAX_AVATAR_BYTES) {
      throw new MediaError(
        'file-too-large',
        fileTooLargeMessage(bytes.byteLength, MAX_AVATAR_BYTES, 'Esta foto'),
      )
    }
    const detected = detectUpload(bytes, name, 'avatar')
    const persona = this.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== projectId) throw new Error('persona-not-found')
    const hash = sha256(bytes)
    this.writeBlob('avatar', '', hash, bytes)
    this.media.putBlob({
      hash, bytes: detected.bytes, mime: detected.mime, kind: 'avatar', createdAt: this.now(),
    })
    const previous = persona.avatar.kind === 'upload' ? persona.avatar.ref : ''
    this.product.updatePersona({
      ...persona,
      avatar: { kind: 'upload', ref: hash },
      updatedAt: this.now(),
    }, projectId)
    if (previous !== '' && previous !== hash) this.gcAvatar(previous)
    return { hash, mime: detected.mime }
  }

  /**
   * Revert to silhouette and drop an unused upload.
   * @param personaId - Persona.
   * @param projectId - Tenant.
   */
  removeAvatar(personaId: string, projectId: string): void {
    const persona = this.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== projectId) throw new Error('persona-not-found')
    const previous = persona.avatar.kind === 'upload' ? persona.avatar.ref : ''
    this.product.updatePersona({
      ...persona,
      avatar: { kind: 'silhouette', ref: 'neutral' },
      updatedAt: this.now(),
    }, projectId)
    if (previous !== '') this.gcAvatar(previous)
  }

  /**
   * Serve one blob with fixed type + nosniff.
   * @param kind - Attachment or avatar.
   * @param id - Attachment id or avatar hash.
   * @param actorId - Session member.
   * @param res - HTTP response.
   */
  serve(kind: 'attachment' | 'avatar', id: string, actorId: string, res: ServerResponse): void {
    if (kind === 'avatar') {
      const blob = this.media.getBlob(id)
      if (blob === undefined || blob.kind !== 'avatar') {
        res.writeHead(404).end()
        return
      }
      if (actorId === '') {
        res.writeHead(401).end()
        return
      }
      const bytes = readFileSync(this.blobPath('avatar', '', id))
      writeMedia(res, blob.mime, 'avatar', bytes, 'inline')
      return
    }
    if (actorId === '') {
      res.writeHead(401).end()
      return
    }
    let row: StoredAttachment
    try {
      row = this.requireReadable(id, actorId)
    } catch {
      res.writeHead(403).end()
      return
    }
    const bytes = readFileSync(this.blobPath('attachment', row.projectId, row.hash))
    writeMedia(res, row.mime, row.name, bytes, 'attachment')
  }

  /**
   * @param id - Attachment id.
   * @param actorId - Session member.
   */
  requireReadable(id: string, actorId: string): StoredAttachment {
    const row = this.media.get(id)
    if (row === undefined) throw new Error('attachment-not-found')
    if (row.streamKind === 'dm') {
      const dm = this.product.getDm(row.ownerId)
      if (dm === undefined) throw new Error('forbidden')
      if (actorId !== dm.participantA && actorId !== dm.participantB) throw new Error('forbidden')
      return row
    }
    if (!this.product.listMembers(row.workspaceId).some(member => member.id === actorId)) {
      throw new Error('forbidden')
    }
    return row
  }

  private writeBlob(kind: 'attachment' | 'avatar', projectId: string, hash: string, bytes: Uint8Array): void {
    const path = this.blobPath(kind, projectId, hash)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600 })
  }

  private blobPath(kind: 'attachment' | 'avatar', projectId: string, hash: string): string {
    if (kind === 'avatar') return join(this.root, 'avatars', hash)
    return join(this.root, 'attachments', projectId, hash)
  }

  private gcAvatar(hash: string): void {
    const used = this.product.listWorkspaces().some(workspace =>
      this.product.listProjects(workspace.id).some(project =>
        this.product.listPersonas(project.id).some(persona =>
          persona.avatar.kind === 'upload' && persona.avatar.ref === hash,
        ),
      ),
    )
    if (used || this.media.attachmentRefs(hash) > 0) return
    const path = this.blobPath('avatar', '', hash)
    try {
      unlinkSync(path)
    } catch (error: unknown) {
      void error
    }
    this.media.deleteBlob(hash)
  }
}

/**
 * Node handler for `GET /api/persona/media`.
 * @param resolve - Host lookup.
 */
export function mediaHttpHandler(
  resolve: () => { media: MediaHost; actorId: string },
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://persona.local')
    const kind = url.searchParams.get('kind') ?? ''
    const id = url.searchParams.get('id') ?? ''
    if ((kind !== 'attachment' && kind !== 'avatar') || id === '') {
      res.writeHead(400).end()
      return
    }
    const { media, actorId } = resolve()
    media.serve(kind, id, actorId, res)
  }
}

/**
 * @param storePath - Database path.
 */
export function resolveMediaHome(storePath: string): string {
  const env = process.env.PERSONA_HOME ?? process.env.DSH_HOME
  if (env !== undefined && env !== '') return env
  if (storePath !== ':memory:') return dirname(dirname(storePath))
  return join(tmpdir(), 'persona-media')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function toAttachmentView(row: StoredAttachment): AttachmentView {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    bytes: row.bytes,
    hash: row.hash,
    credentialWarning: row.credentialWarning,
    messageId: row.messageId ?? '',
  }
}

function writeMedia(
  res: ServerResponse,
  mime: string,
  filename: string,
  bytes: Uint8Array,
  disposition: 'inline' | 'attachment',
): void {
  const safe = sanitizeUploadName(filename).replaceAll('"', '')
  res.writeHead(200, {
    'content-type': mime,
    'x-content-type-options': 'nosniff',
    'content-disposition': `${disposition}; filename="${safe}"`,
    'content-length': bytes.byteLength,
    'cache-control': 'private, max-age=3600',
  })
  res.end(Buffer.from(bytes))
}

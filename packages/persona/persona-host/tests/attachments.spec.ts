import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { MAX_FILE_BYTES, detectUpload, sanitizeUploadName } from '../src/media-detect.ts'
import { mediaHttpHandler } from '../src/media.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createMember({
    id: 'cia', workspaceId: 'ws', projectId: 'pp', displayName: 'Cia', handle: 'cia', role: 'guest',
  })
  h.createMember({
    id: 'dan', workspaceId: 'ws', projectId: 'pp', displayName: 'Dan', handle: 'dan', role: 'member',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.createDm({
    id: 'dm-ab', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bia',
  })
  return h
}

const scope = { workspaceId: 'ws', projectId: 'pp' } as const

it('sanitizes traversal and reserved Windows names', () => {
  expect(sanitizeUploadName('..\\..\\windows\\system32\\config')).toBe('config')
  expect(sanitizeUploadName('../../etc/passwd')).toBe('passwd')
  expect(sanitizeUploadName('CON.txt')).toBe('arquivo')
  expect(sanitizeUploadName('aux')).toBe('arquivo')
})

it('rejects SVG, HTML, executables and giant files', () => {
  expect(() => detectUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg', 'attachment'))
    .toThrow('svg-rejected')
  expect(() => detectUpload(Buffer.from('<!DOCTYPE html><html></html>'), 'x.html', 'attachment'))
    .toThrow('html-rejected')
  expect(() => detectUpload(Buffer.from([0x4d, 0x5a, 0x00]), 'x.exe', 'attachment'))
    .toThrow('executable-rejected')
  expect(() => detectUpload(Buffer.alloc(MAX_FILE_BYTES + 1, 0x61), 'big.txt', 'attachment'))
    .toThrow('file-too-large')
  try {
    detectUpload(Buffer.alloc(MAX_FILE_BYTES + 1, 0x61), 'big.txt', 'attachment')
  } catch (error: unknown) {
    expect((error as { userMessage?: string }).userMessage).toMatch(/8 MB/)
  }
  expect(() => detectUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'face.png', 'avatar'))
    .toThrow('svg-rejected')
})

it('refuses an oversized attachment with a clear pt-BR limit', () => {
  const h = seed()
  expect(() => h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'big.bin',
    bytesBase64: Buffer.alloc(MAX_FILE_BYTES + 1, 0x61).toString('base64'),
  })).toThrow(/8 MB/)
})

it('attaches a file, binds it to a message, warns on credentials, and stages inputs/', () => {
  const h = seed()
  const attached = h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'notas.md',
    bytesBase64: Buffer.from('token sk-ant-api03-ABCDEFGHIJKLMNOP').toString('base64'),
  })
  expect(attached.credentialWarning).toBe(true)
  expect(attached.name).toBe('notas.md')
  const posted = h.postMessage({
    id: 'm-att', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'segue o arquivo', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T19:00:00.000Z',
    attachmentIds: [attached.id],
  })
  expect(posted.attachmentIds).toEqual([attached.id])
  expect(h.listAttachments({
    ...scope, messageId: 'm-att', streamKind: 'channel', ownerId: 'geral',
  }).map(row => row.id)).toEqual([attached.id])
  const bytes = h.getAttachmentBytes({ ...scope, attachmentId: attached.id })
  expect(Buffer.from(bytes.bytesBase64, 'base64').toString('utf8')).toMatch(/sk-ant/)
  const dest = mkdtempSync(join(tmpdir(), 'persona-inputs-'))
  const names = h.media.stageInto('m-att', dest)
  expect(names).toEqual(['notas.md'])
  expect(existsSync(join(dest, 'inputs', 'notas.md'))).toBe(true)
  const origin = h.events.list('channel:geral', { id: 'ana' }, 0, 200).events.find(item => item.id === 'm-att')
  expect(origin).toBeDefined()
  expect(h.orchestration.talkPrompt(origin!, h.product.getPersona('coord')!, [])).toMatch(/Anexos: notas.md/)
})

it('refuses a traversal name escaping the store and a giant upload', () => {
  const h = seed()
  const escaped = h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: '../../etc/passwd',
    bytesBase64: Buffer.from('ok').toString('base64'),
  })
  expect(escaped.name).toBe('passwd')
  expect(escaped.hash).not.toMatch(/\.\./)
  expect(() => h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'huge.txt',
    bytesBase64: Buffer.alloc(MAX_FILE_BYTES + 1, 0x61).toString('base64'),
  })).toThrow(/8 MB/)
})

it('refuses SVG on attach and another person reading a DM', () => {
  const h = seed()
  expect(() => h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'x.svg',
    bytesBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'),
  })).toThrow('svg-rejected')
  const secret = h.attachFile({
    ...scope, streamKind: 'dm', ownerId: 'dm-ab', name: 'segredo.txt',
    bytesBase64: Buffer.from('privado').toString('base64'),
  })
  h.postMessage({
    id: 'dm-secret', ...scope, streamKind: 'dm', ownerId: 'dm-ab',
    body: 'arquivo', actorId: 'ana', subjectId: 'd',
    occurredAt: '2026-11-03T19:01:00.000Z',
    attachmentIds: [secret.id],
  })
  h.sessionMemberId = 'dan'
  expect(h.listAttachments({
    ...scope, messageId: 'dm-secret', streamKind: 'dm', ownerId: 'dm-ab',
  })).toEqual([])
  expect(() => h.getAttachment({ ...scope, attachmentId: secret.id })).toThrow('forbidden')
  expect(() => h.getAttachmentBytes({ ...scope, attachmentId: secret.id })).toThrow('forbidden')
})

it('uploads, replaces and removes an avatar without leaving an orphan', () => {
  const h = seed()
  const first = h.uploadPersonaAvatar({
    ...scope, personaId: 'coord', name: 'face.png', bytesBase64: PNG.toString('base64'),
  })
  expect(first.avatarKind).toBe('upload')
  expect(h.listTeam(scope).personas[0]?.avatarRef).toBe(first.avatarRef)
  const second = h.uploadPersonaAvatar({
    ...scope, personaId: 'coord', name: 'face2.png', bytesBase64: PNG.toString('base64'),
  })
  expect(second.avatarRef).toBe(first.avatarRef)
  h.removePersonaAvatar({ ...scope, personaId: 'coord' })
  expect(h.listTeam(scope).personas[0]?.avatarKind).toBe('silhouette')
  expect(h.media.media.getBlob(first.avatarRef)).toBeUndefined()
})

it('sends images as vision input when the runner advertises vision, else copies into inputs/', () => {
  const h = seed()
  const dest = mkdtempSync(join(tmpdir(), 'persona-vision-'))
  const image = h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'foto.png',
    bytesBase64: PNG.toString('base64'),
  })
  const note = h.attachFile({
    ...scope, streamKind: 'channel', ownerId: 'geral', name: 'notas.txt',
    bytesBase64: Buffer.from('anexo texto').toString('base64'),
  })
  h.postMessage({
    id: 'm-vis', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'veja', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T19:02:00.000Z',
    attachmentIds: [image.id, note.id],
  })
  const vision = h.media.stageForRunner('m-vis', dest, true)
  expect(vision.visionImages.map(item => item.name)).toEqual(['foto.png'])
  expect(vision.visionImages[0]?.mime).toBe('image/png')
  expect(vision.stagedNames).toEqual(['notas.txt'])
  expect(existsSync(join(dest, 'inputs', 'foto.png'))).toBe(false)
  expect(existsSync(join(dest, 'inputs', 'notas.txt'))).toBe(true)
  const dest2 = mkdtempSync(join(tmpdir(), 'persona-novision-'))
  const files = h.media.stageForRunner('m-vis', dest2, false)
  expect(files.visionImages).toEqual([])
  expect(files.stagedNames.sort()).toEqual(['foto.png', 'notas.txt'])
})

it('serves with fixed type, nosniff and safe disposition; persists across restart', () => {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  mkdirSync(join(home, 'db'), { recursive: true })
  const db = join(home, 'db', 'persona.db')
  const previous = process.env.PERSONA_HOME
  process.env.PERSONA_HOME = home
  try {
    const h = host(db)
    h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    h.createMember({
      id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
    })
    h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
    const attached = h.attachFile({
      ...scope, streamKind: 'channel', ownerId: 'geral', name: 'foto.png',
      bytesBase64: PNG.toString('base64'),
    })
    const captured = captureResponse()
    h.sessionMemberId = 'ana'
    h.media.serve('attachment', attached.id, 'ana', captured.res)
    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toBe('image/png')
    expect(captured.headers['x-content-type-options']).toBe('nosniff')
    expect(String(captured.headers['content-disposition'])).toMatch(/attachment/)
    expect(String(captured.headers['content-disposition'])).not.toMatch(/\.\./)
    const handler = mediaHttpHandler(() => ({ media: h.media, actorId: 'eve' }))
    const denied = captureResponse()
    handler({ url: `/api/persona/media?kind=attachment&id=${attached.id}`, method: 'GET' } as IncomingMessage, denied.res)
    expect(denied.status).toBe(403)
    const again = host(db)
    const listed = again.listAttachments({
      ...scope, messageId: '', streamKind: 'channel', ownerId: 'geral',
    })
    expect(listed.some(row => row.id === attached.id)).toBe(true)
    expect(existsSync(join(home, 'attachments', 'pp', attached.hash))).toBe(true)
  } finally {
    if (previous === undefined) delete process.env.PERSONA_HOME
    else process.env.PERSONA_HOME = previous
  }
})

function captureResponse(): {
  res: ServerResponse
  status: number
  headers: Record<string, string | number>
} {
  const headers: Record<string, string | number> = {}
  const box = { status: 0, headers }
  const res = {
    writeHead(code: number, hdrs?: Record<string, string | number>) {
      box.status = code
      if (hdrs !== undefined) Object.assign(headers, hdrs)
      return res
    },
    end() {},
  }
  return { res: res as unknown as ServerResponse, get status() { return box.status }, headers }
}

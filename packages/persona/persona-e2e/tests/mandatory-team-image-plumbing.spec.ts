/**
 * TEAM-10 rehearsal, layer "the image": with the stub (0 AI) the poster the person attaches in #geral must travel the SAME road it will travel in the real round —
 * `attachFile` → `postMessage({ attachmentIds })` → the thread line carries it → the CLI of the persona who answers RECEIVES an image (a content block of type
 * "image", or at least the file name in the prompt) → my transcript reader sees the attachment on the line. If this is red the real round cannot prove "the team saw
 * the image", so it must be green BEFORE any paid turn (Bolt 05/11: `StartTurnInput.images`; Claude is the only engine that reads images).
 * Opt-in `PERSONA_E2E=1`; one host, ~2 min.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { buildPosterPng, POSTER_ALT } from '../src/team-image-fixture.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type PersonaRow, type V11Tenant } from '../src/v11-helpers.ts'
import { openV11Session, type V11Session } from '../src/v11-app.ts'

const run = process.env.PERSONA_E2E === '1'

interface AttachmentRow { readonly id: string; readonly name: string; readonly mime: string; readonly bytes: number; readonly messageId: string }

describe.skipIf(!run).sequential('TEAM-10 ensaio — a imagem do cartaz até a CLI (stub, 0 IA)', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let writer: PersonaRow
  let attachment: AttachmentRow
  let messageId: string
  const scope = () => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })

  beforeAll(async () => {
    v11 = await openV11Session({ teamwork: true, fanout: true, productTools: true, engine: { turnMs: 1_200 } })
    tenant = await v11Tenant(v11.page)
    writer = (await personasOf(v11.page, tenant)).find(persona => persona.name === 'Criação')!
  }, 420_000)

  afterAll(async () => { await v11?.close() }, 60_000)

  it('the poster is stored as an image attachment of #geral (type by signature, 8 MB limit not near)', async () => {
    const poster = buildPosterPng()
    attachment = await hostRpcOk<AttachmentRow>(v11.page, 'attachFile', {
      ...scope(), streamKind: 'channel', ownerId: tenant.channelId, name: 'cartaz-rascunho.png', bytesBase64: poster.toString('base64'),
    })
    expect(attachment.mime).toBe('image/png')
    expect(attachment.bytes).toBe(poster.length)
    expect(POSTER_ALT.length, 'the fixture carries its own alt').toBeGreaterThan(20)
  }, 60_000)

  it('the request with the poster is ONE message of the person that carries the attachment id, and the host links it', async () => {
    messageId = await postAsPerson(v11.page, tenant, '@Criação olhe o cartaz anexo e diga o que ele mostra', { attachmentIds: [attachment.id] })
    const line = await until(v11.page, async () => (await channelMessages(v11.page, tenant)).find(message => message.id === messageId), 15_000)
    expect(line, 'the message is in the thread').toBeDefined()
    expect(line!.attachmentIds, 'the line carries the attachment').toContain(attachment.id)
    const listed = await hostRpcOk<AttachmentRow[]>(v11.page, 'listAttachments', { ...scope(), streamKind: 'channel', ownerId: tenant.channelId, messageId })
    expect(listed.map(row => row.id), 'listAttachments by message').toContain(attachment.id)
  }, 60_000)

  it('the CLI of the persona who answers RECEIVES the image (a content block, or at least its file in the prompt) — never silently dropped', async () => {
    const turn = await until(v11.page, async () => v11.session.fakeCli.invocations().find(call => call.event === 'turn' && ((call.images ?? 0) > 0 || call.imagePathInText !== undefined)), 90_000, 500)
    const turns = v11.session.fakeCli.invocations().filter(call => call.event === 'turn').map(call => ({ images: call.images ?? 0, types: call.imageTypes ?? [], inText: call.imagePathInText ?? null }))
    expect(turn, `no CLI turn carried the image. Turns seen: ${JSON.stringify(turns)}`).toBeDefined()
    if ((turn!.images ?? 0) > 0) expect((turn!.imageTypes ?? []).some(type => /image\/png/iu.test(type))).toBe(true)
  }, 120_000)

  it('the persona who was asked answers in #geral, and the poster is still on the person\'s line afterwards', async () => {
    const answered = await until(v11.page, async () => (await channelMessages(v11.page, tenant)).find(message => message.id !== messageId && message.actorId === writer.id && message.body.trim() !== ''), 60_000)
    expect(answered, 'the persona answered in #geral').toBeDefined()
    const after = (await channelMessages(v11.page, tenant)).find(message => message.id === messageId)
    expect(after?.attachmentIds ?? []).toContain(attachment.id)
  }, 120_000)
})

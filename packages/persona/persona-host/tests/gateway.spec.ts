import { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { it, HOST_TEST_TIMEOUT_MS } from './host-harness.ts'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import type { Principal, PrincipalMap } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it as vitestIt, vi } from 'vitest'
import PersonaHost, { PERSONA_PROTOCOL } from '../src/index.ts'
import { BoardRemoteError } from '../src/boards.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Test-only invited peer with no registered policy. */
    'persona-peer': { readonly kind: 'persona-peer'; readonly id: string }
  }
}

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

const OWNER: Principal = { kind: 'owner' }
const GUEST: PrincipalMap['persona-peer'] = { kind: 'persona-peer', id: 'friend' }
// Built metadata smoke: generate Typert first; clean source-only runs retain the SRC tests below.
const generatedUrl = new URL('../lib/typert.host.js', import.meta.url)
const builtIt = vitestIt.skipIf(!existsSync(generatedUrl))

async function setup(generatedMetadata = false): Promise<Context> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(PersonaHost)
  if (generatedMetadata) {
    const generated = await import(generatedUrl.href) as { TYPERT: TypertContribution }
    ctx.effect(() => ctx.typert.register(generated.TYPERT))
    expect(ctx.typert.local.get('persona/postMessage')?.parameters[0]?.codec.mode).toBe('strict')
  }
  const host = ctx.personaHost
  host.product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return ctx
}

function invoke(ctx: Context, principal: Principal, method: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return ctx.typertGateway.invoke({
    peer: new Peer(ctx, { principal }),
    namespace: 'persona',
    method,
    args,
  })
}

it('serves ping and listTeam through the real gateway for the owner', async () => {
  const ctx = await setup()
  await expect(invoke(ctx, OWNER, 'ping')).resolves.toEqual({
    ok: true, product: 'persona', protocol: PERSONA_PROTOCOL,
  })
  const team = await invoke(ctx, OWNER, 'listTeam', {
    request: { workspaceId: 'ws', projectId: 'pp' },
  })
  expect(team).toEqual({ members: [], personas: [] })
})

it('denies a peer without a role with no-allow', async () => {
  const ctx = await setup()
  await expect(invoke(ctx, GUEST, 'listTeam', {
    request: { workspaceId: 'ws', projectId: 'pp' },
  })).rejects.toMatchObject({ code: 'remote-access/denied', details: { reason: 'no-allow' } })
})

it('creates a channel through the gateway for the owner', async () => {
  const ctx = await setup()
  const channel = await invoke(ctx, OWNER, 'createChannel', {
    request: { id: 'c1', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' },
  })
  expect(channel).toMatchObject({ id: 'c1', name: 'geral' })
  await expect(invoke(ctx, GUEST, 'createChannel', {
    request: { id: 'c2', workspaceId: 'ws', projectId: 'pp', name: 'x', topic: '' },
  })).rejects.toMatchObject({ code: 'remote-access/denied', details: { reason: 'no-allow' } })
})

builtIt('accepts the current composer payload without occurredAt through the generated gateway codec', async () => {
  const ctx = await setup(true)
  const h = ctx.personaHost
  h.orchestration.now = () => '2026-11-04T17:00:00.000Z'
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  const request = { id: 'composer-wire', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', subjectId: 'composer-wire', body: 'Mensagem enviada pelo compositor.', attachmentIds: [], topicId: '' }
  await expect(invoke(ctx, OWNER, 'postMessage', { request })).resolves.toMatchObject({
    id: request.id, body: request.body, occurredAt: '2026-11-04T17:00:00.000Z',
  })
  expect(h.events.get(request.id)?.body).toBe(request.body)
  await expect(invoke(ctx, OWNER, 'postMessage', { request: { ...request, id: 'bad-wire', occurredAt: 'ontem' } }))
    .rejects.toMatchObject({ code: 'invalid-payload' })
  expect(h.events.has('bad-wire')).toBe(false)
}, HOST_TEST_TIMEOUT_MS)

builtIt('review summary, preparation and discard accept ticket scope without command or reason', async () => {
  const ctx = await setup(true)
  const h = ctx.personaHost
  h.orchestration.scripted = true
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({ workspaceId: 'ws', projectId: 'pp', id: 'worker', name: 'Bento', title: 'Documentos',
    description: '', personality: '', instructions: '', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh',
    runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  await invoke(ctx, OWNER, 'postMessage', { request: { id: 'review-request', workspaceId: 'ws', projectId: 'pp',
    streamKind: 'channel', ownerId: 'geral', actorId: 'ana', subjectId: 'review-thread', body: 'preciso de um README no projeto' } })
  await h.orchestration.flush('pp')
  const ticket = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]
  if (ticket === undefined) throw new Error('missing-review-ticket')
  const request = { workspaceId: 'ws', projectId: 'pp', ticketId: ticket.id }
  await expect(invoke(ctx, OWNER, 'reviewSummary', { request })).resolves.toMatchObject({ ticketId: ticket.id })
  await expect(invoke(ctx, OWNER, 'prepareReview', { request })).resolves.toMatchObject({ ticketId: ticket.id })
  await expect(invoke(ctx, OWNER, 'acceptReview', { request: { ...request, mode: 'ff', conflicts: [] } }))
    .resolves.toMatchObject({ kind: 'blocked' })
  await expect(invoke(ctx, OWNER, 'discardReview', { request })).resolves.toBe(true)
}, HOST_TEST_TIMEOUT_MS)

builtIt('FLOW-1 forwards delivery_pending as a typed refusal through the generated moveTicket gateway', async () => {
  const ctx = await setup(true)
  const h = ctx.personaHost
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  const refusal = new BoardRemoteError('delivery_pending', 'Revise, aplique ou descarte a entrega pendente antes de mover a Tarefa.')
  const move = vi.spyOn(h.boards, 'moveTicketWith').mockImplementation(() => { throw refusal }) // the person's Remote goes through moveTicketWith (HT-3)
  try {
    await expect(invoke(ctx, OWNER, 'moveTicket', { request: {
      workspaceId: 'ws', projectId: 'pp', ticketId: 'pending-ticket', columnId: 'done',
    } })).rejects.toMatchObject({ code: 'delivery_pending', isDSHRemoteError: true, message: refusal.message })
    expect(move).toHaveBeenCalledWith('pp', 'pending-ticket', 'done')
    expect(h.boards.board.list('pp')).toEqual([])
  } finally {
    move.mockRestore()
  }
}, HOST_TEST_TIMEOUT_MS)

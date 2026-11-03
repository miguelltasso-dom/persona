import { Context } from '@deepseek-ai/cordis'
import { it } from './host-harness.ts'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { Principal, PrincipalMap } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect } from 'vitest'
import PersonaHost, { PERSONA_PROTOCOL } from '../src/index.ts'

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

async function setup(): Promise<Context> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(PersonaHost)
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

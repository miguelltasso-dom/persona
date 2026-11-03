import { Context } from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

async function typertCtx(): Promise<Context> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
  return ctx
}

it('activates through ctx.plugin without persona-runners', async () => {
  const ctx = await typertCtx()
  await ctx.plugin(PersonaHost)
  expect(ctx.personaHost).toBeInstanceOf(PersonaHost)
  expect(ctx.personaHost.usedPersonaRunners).toBe(false)
  expect(ctx.personaHost.ping()).toEqual({ ok: true, product: 'persona', protocol: 1 })
})

it('activates through ctx.plugin with persona-runners and uses the plugin resolve', async () => {
  const ctx = await typertCtx()
  await ctx.plugin(PersonaRunners)
  await ctx.plugin(PersonaHost)
  expect(ctx.personaHost).toBeInstanceOf(PersonaHost)
  expect(ctx.personaHost.usedPersonaRunners).toBe(true)
  expect(ctx.get('personaRunners')?.resolveRunner).toBeTypeOf('function')
  expect(ctx.personaHost.ping()).toEqual({ ok: true, product: 'persona', protocol: 1 })
})

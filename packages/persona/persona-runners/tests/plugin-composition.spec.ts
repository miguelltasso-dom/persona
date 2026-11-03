import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import PersonaUsage from '@deepseek-ai/dsh-persona-usage'
import PersonaVault from '@deepseek-ai/dsh-persona-vault'
import { afterEach, expect, it } from 'vitest'
import PersonaRunners from '../src/plugin.ts'

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
})

it('mounts personaRunners, personaVault/credentials and personaUsage on one Context', async () => {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(PersonaVault, { path: '' })
  await ctx.plugin(PersonaUsage, { sessionsRoot: '' })
  await ctx.plugin(PersonaRunners, { home: '' })
  expect(ctx.personaRunners.createFakeRunner().session).toBeTypeOf('function')
  expect(ctx.personaRunners.resolveRunner).toBeTypeOf('function')
  expect(ctx.personaRunners.detectConnections).toBeTypeOf('function')
  expect(ctx.personaUsage.foldUsage([])).toEqual([])
  const ref = credentialRef('DEEPSEEK_API_KEY')
  await ctx.credentials.set(ref, 'sk-test-not-a-real-key')
  const resolved = await ctx.credentials.resolve(ref)
  expect(resolved?.source).toBe('persona-vault')
  expect(resolved?.value).toBe('sk-test-not-a-real-key')
  expect(ctx.personaVault.vault.list().connections).toEqual([])
  expect(JSON.stringify(ctx.personaVault.snapshot())).not.toContain('sk-test-not-a-real-key')
})

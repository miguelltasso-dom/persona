import { Context } from '@deepseek-ai/cordis'
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

it('uses ctx.personaRunners when the plugin is mounted', async () => {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(PersonaRunners)
  const h = new PersonaHost(ctx)
  expect(h.usedPersonaRunners).toBe(true)
  expect(ctx.get('personaRunners')?.resolveRunner).toBeTypeOf('function')
})

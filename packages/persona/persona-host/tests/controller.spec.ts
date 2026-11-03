import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost, { PERSONA_PROTOCOL } from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

it('answers the liveness probe', () => {
  const ctx = new Context(); roots.push(ctx)
  const host = new PersonaHost(ctx)
  expect(host.ping()).toEqual({ ok: true, product: 'persona', protocol: PERSONA_PROTOCOL })
})

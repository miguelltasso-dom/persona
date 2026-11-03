import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { openPersonaStore } from '@deepseek-ai/dsh-persona-store'

const roots: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('reopens an existing database in under 1.5s and arms no sub-second poll', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-ready-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = openPersonaStore({ path })
  first.close()
  const ctx = new Context()
  roots.push(ctx)
  const started = Date.now()
  const h = new PersonaHost(ctx, { databasePath: path })
  const readyMs = Date.now() - started
  h.scheduler.lastReadyMs = readyMs
  expect(readyMs).toBeLessThan(1_500)
  expect(h.scheduler.timer).toBeUndefined()
  h.scheduler.arm('pp')
  expect(h.scheduler.timer).toBeDefined()
  writeFileSync(join(dir, 'ready-ms.txt'), String(readyMs))
  mkdirSync(join(dir, 'ok'), { recursive: true })
  console.log(`host-ready-ms=${readyMs}`)
})

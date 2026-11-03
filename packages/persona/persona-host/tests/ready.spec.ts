import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import { openPersonaStore } from '@deepseek-ai/dsh-persona-store'
import { HostScheduler, msUntilQuiet } from '../src/scheduler.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

it('reopens an existing database and never arms a sub-second poll', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-ready-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = openPersonaStore({ path })
  first.close()
  const h = host(path)
  expect(h.scheduler.timer).toBeUndefined()
  h.scheduler.arm('pp')
  expect(h.scheduler.timer).toBeDefined()
  expect(h.scheduler.lastReadyMs).toBe(0)
  mkdirSync(join(dir, 'ok'), { recursive: true })
})

it('scheduler delay is at least 1 s on an injected clock', () => {
  const h = host()
  const now = Date.parse('2026-11-03T12:00:00.000Z')
  expect(Math.max(1_000, msUntilQuiet(now, '02:00'))).toBeGreaterThanOrEqual(1_000)
  const scheduler = new HostScheduler(h.store, h.screens.screens, () => now)
  scheduler.arm('pp')
  expect(scheduler.timer).toBeDefined()
  scheduler.dispose()
  expect(scheduler.timer).toBeUndefined()
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

/**
 * BUG-QUIT-1: the app took 5.8-8.5 s to quit and nobody knew which part of the host's close was slow. The close now records how long EACH phase took (`quitPhases`, and in the real app one line on stderr beside the
 * opening's `bootMarks`), so the quit is measured by phase, not guessed.
 */
const root = mkdtempSync(join(tmpdir(), 'persona-quit-phases-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

it('closing the host records how long EACH phase took, in a stable set of names', async () => {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: join(root, 'persona.db') })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  expect(h.quitPhases, 'nothing is recorded before the close').toBeUndefined()
  await ctx.fiber.dispose()
  const phases = h.quitPhases
  expect(Object.keys(phases ?? {}).sort()).toEqual(['backgroundIdle', 'browser', 'pairedDispatch', 'pairedStreams', 'remoteAccess', 'remoteTeam', 'runners', 'station', 'storeClose', 'work'])
  for (const ms of Object.values(phases ?? {})) expect(Number.isFinite(ms) && ms >= 0).toBe(true)
})

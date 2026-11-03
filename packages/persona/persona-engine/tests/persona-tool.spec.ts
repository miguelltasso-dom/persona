import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { PERSONA_TOOL, REASONS, RECOVERY_NOTE, UserError } from '../src/index.ts'

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '../src/core')

it('keeps a single persona_ tool prefix and no orchestrator_ in src/core', () => {
  expect(PERSONA_TOOL).toBe('persona_')
  for (const name of readdirSync(coreDir)) {
    if (!name.endsWith('.ts')) continue
    expect(readFileSync(join(coreDir, name), 'utf8'), name).not.toContain('orchestrator_')
  }
})

it('points status, route, eval, and recovery copy at persona_ tools and hostRestarted', () => {
  expect(new UserError('notExplicit').message).toContain(`${PERSONA_TOOL}route`)
  expect(new UserError('notExplicit').message).toContain(`${PERSONA_TOOL}eval`)
  expect(new UserError('notExplicit').message).toContain(`${PERSONA_TOOL}eval_decide`)
  expect(new UserError('ticketStopped').message).toContain(`${PERSONA_TOOL}route`)
  expect(new UserError('mandateRevoked').message).toContain(`${PERSONA_TOOL}route`)
  expect(new UserError('workerDecides', { tickets: 't1' }).message).toContain(`${PERSONA_TOOL}route`)
  expect(new UserError('noAnswer').message).toContain(`${PERSONA_TOOL}ticket_request_status`)
  expect(RECOVERY_NOTE).toMatch(/host restarted/i)
  expect(REASONS.hostRestarted).toBe('host restarted')
})

/**
 * Item 2a, second slice: the CLI dies for real on Windows — stdin EOF first, `taskkill /T /F` (or the POSIX process group) as
 * the guarantee — and the kill reaches every process the CLI started, not just the one OAR spawned.
 *
 * The stub ignores stdin close on purpose: only the tree kill can end it, so the test fails if the runner merely closes a pipe.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { claudeRuntime } from '@botiverse/oar/runtimes/claude'
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, type RunEvent } from '../src/index.ts'

const STUB = join(import.meta.dirname, 'support', process.platform === 'win32' ? 'tree-cli.cmd' : 'tree-cli')

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function until(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check() && Date.now() < deadline) {
    const { promise, resolve } = Promise.withResolvers<undefined>()
    setTimeout(() => { resolve(undefined) }, 100)
    await promise
  }
}

describe('the CLI process tree ends with the runner', () => {
  it.skipIf(!existsSync(STUB))('ends the CLI and the process it started', async () => {
    const log = join(tmpdir(), `persona-tree-${randomUUID()}.jsonl`)
    const cwd = mkdtempSync(join(tmpdir(), 'persona-tree-'))
    const previous = process.env.TREE_CLI_LOG
    process.env.TREE_CLI_LOG = log
    try {
      const runner = createClaudeRunner({ runtime: claudeRuntime, installation: { kind: 'available', via: 'executable', command: STUB } })
      const handle = await runner.start({
        ticketId: 'ticket-tree',
        assignmentId: 'assignment-tree',
        personaId: 'nina',
        cwd,
        prompt: 'oi',
        model: 'default',
        permissionMode: 'deny',
      })
      await collect(runner.stream(handle))
      const started = readFileSync(log, 'utf8').split(/\r?\n/u).filter(line => line.trim() !== '')
        .map(line => JSON.parse(line) as { event: string; pid: number; child?: number })
        .find(row => row.event === 'start')
      if (started === undefined || started.child === undefined) throw new Error('the stub did not start its child')
      const { pid, child } = started
      expect(alive(pid)).toBe(true)
      expect(alive(child)).toBe(true)
      await runner.dispose?.()
      await until(() => !alive(pid) && !alive(child), 8_000)
      expect(alive(pid)).toBe(false)
      expect(alive(child)).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.TREE_CLI_LOG
      else process.env.TREE_CLI_LOG = previous
      rmSync(log, { force: true })
      try {
        rmSync(cwd, { recursive: true, force: true })
      } catch (error) {
        // The stub still holds its working directory when an assertion failed before the dispose above.
        void error
      }
    }
  }, 20_000)
})

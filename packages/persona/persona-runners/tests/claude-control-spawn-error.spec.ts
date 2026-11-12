/**
 * Carbon P0-12 (sprint de correção): a `claude` binary that cannot start (ENOENT) or whose stdin closes (EPIPE) must NOT take the whole host down with an unhandled 'error' event.
 * The control client reports it as a failed request, never as a crash and never as a hang.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openClaudeControl } from '../src/oar/claude-control.ts'

it('a binary that does not exist is a rejected request, with no uncaught exception in the process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-claude-control-'))
  const uncaught: Error[] = []
  const onUncaught = (error: Error): void => { uncaught.push(error) }
  process.on('uncaughtException', onUncaught)
  try {
    const control = openClaudeControl('persona-binario-que-nao-existe-xyz')({ cwd: dir, env: {}, args: [] })
    await expect(control.request('mcp_status')).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 300)) // the spawn error arrives on the next ticks
    expect(uncaught.map(error => error.message)).toEqual([])
    await control.close()
  } finally {
    process.off('uncaughtException', onUncaught)
    rmSync(dir, { recursive: true, force: true })
  }
}, 20_000)

it('a second request after the process failed is refused at once (it does not wait the full request timeout)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-claude-control-'))
  try {
    const control = openClaudeControl('persona-binario-que-nao-existe-xyz')({ cwd: dir, env: {}, args: [] })
    await control.request('mcp_status').catch(() => undefined)
    const started = Date.now()
    await expect(control.request('mcp_status')).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(3000)
    await control.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 20_000)

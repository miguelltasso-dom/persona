import { spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { armQuitWatchdog, quitWatchdogScript, QUIT_WATCHDOG_GRACE_MS } from '../src/quit-watchdog.ts'

const sleeper = 'setInterval(() => undefined, 1000)'
const started: ChildProcess[] = []

function launch(code: string): ChildProcess {
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
  started.push(child)
  return child
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

async function until(condition: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (condition()) return true
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return condition()
}

afterEach(() => {
  for (const child of started.splice(0)) { try { if (child.pid !== undefined) process.kill(child.pid) } catch { /* gone */ } }
})

describe('quit watchdog (BUG-QUIT-1: "Sair" must end the application)', () => {
  it('builds a helper program that parses, names the pid and the image it must still carry', () => {
    const script = quitWatchdogScript(4242, 'Persona.exe', 3000, 'win32')
    expect(() => new Script(script)).not.toThrow()
    expect(script).toContain('const pid = 4242;')
    expect(script).toContain('"Persona.exe".toLowerCase()')
    expect(script).toContain('taskkill')
    expect(QUIT_WATCHDOG_GRACE_MS).toBeLessThanOrEqual(5_000)
  })

  it('starts the helper detached, windowless and unattached, as plain Node, and never throws when it cannot', () => {
    const calls: { command: string; args: readonly string[]; detached: boolean; stdio: string; windowsHide: boolean; env: NodeJS.ProcessEnv }[] = []
    let unref = 0
    const ok = armQuitWatchdog({
      pid: 7, execPath: 'C:/app/Persona.exe', graceMs: 1234, platform: 'win32', env: { KEEP: '1' },
      spawnProcess: (command, args, options) => { calls.push({ command, args, ...options }); return { unref: () => { unref += 1 } } },
    })
    expect(ok).toBe(true)
    expect(unref).toBe(1)
    expect(calls[0]).toMatchObject({ command: 'C:/app/Persona.exe', detached: true, stdio: 'ignore', windowsHide: true })
    expect(calls[0]?.args[0]).toBe('-e')
    expect(calls[0]?.args[1]).toContain('1234')
    expect(calls[0]?.env).toMatchObject({ KEEP: '1', ELECTRON_RUN_AS_NODE: '1' })
    expect(armQuitWatchdog({ pid: 7, execPath: 'x', spawnProcess: () => { throw new Error('no spawn') } })).toBe(false)
  })

  it('ends a process that does not leave, and only the tree below it: its children go, a bystander stays', async () => {
    // "main": a process with a child of its own. "bystander": unrelated, started by the test.
    const main = launch(`const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', ${JSON.stringify(sleeper)}], { stdio: 'ignore' }); console.log('child=' + c.pid); ${sleeper}`)
    const bystander = launch(sleeper)
    let child = 0
    let out = ''
    main.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString() })
    expect(await until(() => { const m = /child=(\d+)/u.exec(out); child = m ? Number(m[1]) : 0; return child > 0 }, 15_000)).toBe(true)
    const mainPid = main.pid!
    expect(alive(mainPid) && alive(child)).toBe(true)

    expect(armQuitWatchdog({ pid: mainPid, execPath: process.execPath, graceMs: 800, platform: process.platform })).toBe(true)

    expect(await until(() => !alive(mainPid), 30_000)).toBe(true)
    expect(await until(() => !alive(child), 10_000)).toBe(true)
    expect(alive(bystander.pid!)).toBe(true)
  }, 60_000)

  it('still ends the whole tree when the helper is itself a child of the process it supervises (the real parent chain)', async () => {
    // In the app the main process starts the helper, so the helper is part of the tree it ends. The fake main does the same: it arms the watchdog
    // through the production function (Node strips the types of the .ts), then sits with a child of its own.
    const modulePath = fileURLToPath(new URL('../src/quit-watchdog.ts', import.meta.url)).split('\\').join('/')
    const code = `const { spawn } = require('node:child_process');
      const c = spawn(process.execPath, ['-e', ${JSON.stringify(sleeper)}], { stdio: 'ignore' });
      import(${JSON.stringify('file:///' + modulePath.replace(/^\//u, ''))}).then(m => { m.armQuitWatchdog({ pid: process.pid, execPath: process.execPath, graceMs: 800 }); console.log('child=' + c.pid + ' armed=1') });
      ${sleeper}`
    const main = launch(code)
    const bystander = launch(sleeper)
    let child = 0
    let out = ''
    main.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString() })
    expect(await until(() => { const m = /child=(\d+) armed=1/u.exec(out); child = m ? Number(m[1]) : 0; return child > 0 }, 20_000)).toBe(true)
    const mainPid = main.pid!
    expect(alive(mainPid) && alive(child)).toBe(true)

    expect(await until(() => !alive(mainPid), 30_000)).toBe(true)
    expect(await until(() => !alive(child), 10_000)).toBe(true)
    expect(alive(bystander.pid!)).toBe(true)
  }, 60_000)

  it('does nothing to a process that leaves by itself before the grace period', async () => {
    const main = launch(`setTimeout(() => process.exit(0), 600); ${sleeper}`)
    const bystander = launch(sleeper)
    armQuitWatchdog({ pid: main.pid!, execPath: process.execPath, graceMs: 4000, platform: process.platform })
    expect(await until(() => !alive(main.pid!), 15_000)).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 5000))
    expect(alive(bystander.pid!)).toBe(true)
    expect(basename(process.execPath).length).toBeGreaterThan(0)
  }, 40_000)
})

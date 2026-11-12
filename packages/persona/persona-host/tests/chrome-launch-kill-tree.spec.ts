/**
 * Carbon P0-12 (sprint de correção): when Chrome does not open its DevTools port in time, `launchChrome` killed only the process it started (`child.kill()`); on Windows the tree
 * (the renderer, GPU and utility processes) stayed alive, orphaned. The boot timeout now kills the whole tree, like `close()` does.
 * A "Chrome" that spawns a grandchild and never opens the port stands in for the real one; the seam is `spawnImpl`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { launchChrome } from '../src/browser/launch.ts'

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

it.skipIf(process.platform !== 'win32')('a Chrome that never opens the port is killed WITH its children, not just its first process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-chrome-tree-'))
  const pidFile = join(dir, 'grandchild.pid')
  const script = join(dir, 'fake-chrome.cjs')
  // The grandchild is DETACHED: like Chrome's renderer/GPU processes it is not in the launcher's kill-on-close job object, so only a tree kill reaches it
  // (a Node grandchild without `detached` dies with its parent through libuv's own job object, which would hide the bug).
  writeFileSync(script, [
    "const { spawn } = require('node:child_process')",
    "const fs = require('node:fs')",
    "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true, windowsHide: true })",
    'fs.writeFileSync(process.argv[2], String(grandchild.pid))',
    'setInterval(() => {}, 1000)',
  ].join('\n'))
  let grandchild = -1
  try {
    const launching = launchChrome({
      chrome: { path: process.execPath, version: undefined }, profileDir: join(dir, 'profile'), waitMs: 2500,
      spawnImpl: () => spawn(process.execPath, [script, pidFile], { stdio: 'ignore', windowsHide: true }),
    })
    const rejected = expect(launching).rejects.toThrow(/porta de depuração/u)
    for (let round = 0; round < 60 && !existsSync(pidFile); round += 1) await sleep(50)
    grandchild = Number(readFileSync(pidFile, 'utf8'))
    await sleep(300)
    expect(alive(grandchild), 'controle: o filho do "Chrome" tem de estar vivo antes do timeout').toBe(true)
    await rejected
    for (let round = 0; round < 60 && alive(grandchild); round += 1) await sleep(100) // the kill is asynchronous: give it a moment
    expect(alive(grandchild), `o processo filho ${String(grandchild)} ficou órfão`).toBe(false)
  } finally {
    if (grandchild > 0 && alive(grandchild)) process.kill(grandchild, 'SIGKILL') // never leave the orphan behind, even when the assertion fails
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)

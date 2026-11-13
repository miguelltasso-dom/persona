import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { stationFilePath } from '../src/station-state.ts'
import { applyStartupChoice, reconcileStartupAtBoot, recordOrderlyExit, watchdogFiles, windowsUserId } from '../src/station-startup.ts'
import type { WatchdogInstall } from '../src/station-watchdog.ts'

function home(station?: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'persona-startup-'))
  if (station !== undefined) {
    mkdirSync(join(root, 'db'), { recursive: true })
    writeFileSync(stationFilePath(root), JSON.stringify(station))
  }
  return root
}

function machine(root: string, install: WatchdogInstall = { state: 'installed' }, present = false) {
  const watchdog = {
    install: vi.fn(async () => install),
    remove: vi.fn(async () => undefined),
    present: vi.fn(async () => present),
    deliberateQuit: vi.fn(async () => undefined),
  }
  const loginItem = { setOpenAtLogin: vi.fn() }
  return { home: root, watchdog, loginItem, exe: 'C:\\Users\\x\\AppData\\Local\\Programs\\Persona\\Persona.exe', userId: 'PC\\x' }
}

describe('the "open with Windows" choice', () => {
  it('a paired station installs the task and leaves the Run key off', async () => {
    const deps = machine(home({ paired: true, running: true }))
    expect(await applyStartupChoice(true, deps)).toEqual({ mechanism: 'task', supervised: true })
    expect(deps.watchdog.install).toHaveBeenCalledWith({ exe: deps.exe, userId: 'PC\\x' })
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(false)
  })

  it('a refused task falls back to the Run key in background mode and says so', async () => {
    const deps = machine(home({ paired: true }), { state: 'denied', detail: 'Access is denied' })
    expect(await applyStartupChoice(true, deps)).toEqual({ mechanism: 'run-key', supervised: false, notice: 'task-denied' })
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(true, 'background')
  })

  it('a machine that is not a station keeps the ordinary Run key and no task', async () => {
    const deps = machine(home())
    expect(await applyStartupChoice(true, deps)).toEqual({ mechanism: 'run-key', supervised: false })
    expect(deps.watchdog.install).not.toHaveBeenCalled()
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(true, 'window')
  })

  it('clearing the choice removes the task and the Run key', async () => {
    const deps = machine(home({ paired: true }))
    expect(await applyStartupChoice(false, deps)).toEqual({ mechanism: 'none' })
    expect(deps.watchdog.remove).toHaveBeenCalled()
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(false)
  })
})

describe('launch reconciliation', () => {
  it('a paired station with the choice saved re-asserts the task (a deleted or disabled one comes back)', async () => {
    const deps = machine(home({ paired: true }))
    expect(await reconcileStartupAtBoot(true, deps)).toEqual({ mechanism: 'task', supervised: true })
    expect(deps.watchdog.install).toHaveBeenCalledTimes(1)
  })

  it('a machine that is not a station keeps the Run key as saved and drops a task left from an old pairing', async () => {
    const deps = machine(home(), { state: 'installed' }, true)
    expect(await reconcileStartupAtBoot(true, deps)).toEqual({ mechanism: 'run-key', supervised: false })
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenCalledWith(true, 'window')
    expect(deps.watchdog.remove).toHaveBeenCalledTimes(1)
  })

  it('no choice saved: nothing runs at login and no task is touched when there is none', async () => {
    const deps = machine(home({ paired: true }))
    expect(await reconcileStartupAtBoot(false, deps)).toEqual({ mechanism: 'none' })
    expect(deps.loginItem.setOpenAtLogin).toHaveBeenCalledWith(false, 'window')
    expect(deps.watchdog.remove).not.toHaveBeenCalled()
  })
})

describe('what an orderly exit leaves behind', () => {
  it('a deliberate quit of a paired station writes lastExit clean, keeps every other field and disables the watchdog', async () => {
    const root = home({ paired: true, running: true, crashes: 2, lastStartAt: 5, team: { workspaceId: 'w', computerId: 'c' } })
    const deps = machine(root)
    await recordOrderlyExit(deps, { deliberate: true })
    expect(JSON.parse(readFileSync(stationFilePath(root), 'utf8'))).toEqual({
      paired: true, running: true, crashes: 2, lastStartAt: 5, team: { workspaceId: 'w', computerId: 'c' }, lastExit: 'clean',
    })
    expect(deps.watchdog.deliberateQuit).toHaveBeenCalledTimes(1)
  })

  it('the end of the Windows session or an update is clean too, but leaves the watchdog enabled', async () => {
    const root = home({ paired: true })
    const deps = machine(root)
    await recordOrderlyExit(deps, { deliberate: false })
    expect(JSON.parse(readFileSync(stationFilePath(root), 'utf8'))).toMatchObject({ lastExit: 'clean' })
    expect(deps.watchdog.deliberateQuit).not.toHaveBeenCalled()
  })

  it('a machine that is not a station is left untouched', async () => {
    const root = home()
    const deps = machine(root)
    await recordOrderlyExit(deps, { deliberate: true })
    expect(existsSync(stationFilePath(root))).toBe(false)
    expect(deps.watchdog.deliberateQuit).not.toHaveBeenCalled()
  })
})

describe('the machine side', () => {
  it('writes the task definition as UTF-16 LE with a byte-order mark and removes it again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-wd-'))
    const files = watchdogFiles(dir)
    const path = await files.writeDefinition('<Task>ç</Task>')
    const bytes = readFileSync(path)
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe])
    expect(bytes.subarray(2).toString('utf16le')).toBe('<Task>ç</Task>')
    await files.removeDefinition(path)
    expect(existsSync(path)).toBe(false)
  })

  it('names the Windows account as DOMAIN\\name', () => {
    expect(windowsUserId()).toMatch(/^[^\\]+\\[^\\]+$/u)
  })
})

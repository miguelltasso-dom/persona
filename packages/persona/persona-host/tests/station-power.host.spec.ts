import { execFileSync, spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { AWAKE_SCRIPT, PowerKeeper } from '../src/station/power.ts'

describe('COLHEITA 24: Windows stays awake while the station has work', () => {
  it('holds once, however many turns ask, and lets go when the queue empties', () => {
    let started = 0
    const keeper = new PowerKeeper({
      platform: 'win32',
      spawn: () => { started += 1; return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { stdio: 'ignore' }) },
    })
    expect(keeper.state()).toBe('livre')
    keeper.hold()
    keeper.hold()
    expect(started).toBe(1)
    expect(keeper.state()).toBe('segurando')
    keeper.release()
    keeper.release()
    expect(keeper.state()).toBe('livre')
  })

  it('is a no-op outside Windows (the station is a Windows PC)', () => {
    let started = 0
    const keeper = new PowerKeeper({ platform: 'linux', spawn: () => { started += 1; return spawn(process.execPath, ['-e', '']) } })
    keeper.hold()
    expect(started).toBe(0)
    expect(keeper.state()).toBe('livre')
  })

  it.skipIf(process.platform !== 'win32')('the exact script is accepted by Windows (the call returns the previous state, never 0)', () => {
    const probe = AWAKE_SCRIPT.replace('Start-Sleep -Seconds 2147483', 'Write-Output "estado=$([Persona.Awake]::SetThreadExecutionState(2147483649))"; Start-Sleep -Seconds 1')
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', probe], { encoding: 'utf8' })
    const state = Number(/estado=(\d+)/u.exec(output)?.[1] ?? '0')
    expect(state).toBeGreaterThan(0)
  }, 30_000)
})

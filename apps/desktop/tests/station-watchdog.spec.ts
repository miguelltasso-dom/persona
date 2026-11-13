import { describe, expect, it, vi } from 'vitest'
import { applyAutostart, StationWatchdog, WATCHDOG_TASK_NAME, watchdogTaskXml, type WatchdogInstall } from '../src/station-watchdog.ts'

const EXE = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Persona\\Persona.exe'

function rig(run: (args: readonly string[]) => { code: number; output: string } = () => ({ code: 0, output: '' })) {
  const calls: Array<readonly string[]> = []
  const written: string[] = []
  const removed: string[] = []
  const watchdog = new StationWatchdog({
    exec: async (args) => { calls.push(args); return run(args) },
    writeDefinition: async (xml) => { written.push(xml); return 'C:\\Temp\\persona-watchdog.xml' },
    removeDefinition: async (path) => { removed.push(path) },
  })
  return { watchdog, calls, written, removed }
}

describe('the station watchdog definition', () => {
  const xml = watchdogTaskXml({ exe: EXE, userId: 'PADARIA\\Ana' })

  it('starts at logon of THIS user, restarts on failure, never runs twice and never asks for elevation', () => {
    expect(xml).toContain('<LogonTrigger><Enabled>true</Enabled><UserId>PADARIA\\Ana</UserId></LogonTrigger>')
    expect(xml).toContain('<RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>')
    expect(xml).toContain('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>')
    expect(xml).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>')
    expect(xml).toContain('<RunLevel>LeastPrivilege</RunLevel>')
    expect(xml).not.toContain('HighestAvailable')
    expect(xml).toContain('<LogonType>InteractiveToken</LogonType>')
    expect(xml).toContain('<Interval>PT5M</Interval>')
  })

  it('launches Persona.exe with --background and nothing else', () => {
    expect(xml).toContain(`<Exec><Command>${EXE}</Command><Arguments>--background</Arguments></Exec>`)
  })

  it('does not stop on battery (a notebook used as a station keeps supervising)', () => {
    expect(xml).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>')
    expect(xml).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>')
  })

  it('escapes what comes from the machine: a path or user with XML characters cannot add elements', () => {
    const evil = watchdogTaskXml({ exe: 'C:\\A&B\\<x>\\Persona.exe', userId: 'D\\a"b\'<c>' })
    expect(evil).toContain('C:\\A&amp;B\\&lt;x&gt;\\Persona.exe')
    expect(evil).toContain('D\\a&quot;b&apos;&lt;c&gt;')
    expect(evil).not.toContain('<x>')
  })

  it('refuses anything that is not an absolute path to Persona.exe, or no user', () => {
    expect(() => watchdogTaskXml({ exe: 'Persona.exe', userId: 'a\\b' })).toThrow(/absolute path/u)
    expect(() => watchdogTaskXml({ exe: 'C:\\Windows\\System32\\cmd.exe', userId: 'a\\b' })).toThrow(/absolute path/u)
    expect(() => watchdogTaskXml({ exe: EXE, userId: ' ' })).toThrow(/signed-in user/u)
  })
})

describe('the autostart mechanism (Keel 15:47)', () => {
  function plan(over: { accepted?: boolean; paired?: boolean; install?: () => Promise<WatchdogInstall> } = {}) {
    const loginItem = { setOpenAtLogin: vi.fn() }
    const remove = vi.fn(async () => undefined)
    const install = vi.fn(over.install ?? (async (): Promise<WatchdogInstall> => ({ state: 'installed' })))
    const run = applyAutostart({ accepted: over.accepted ?? true, paired: over.paired ?? true, install, remove, loginItem })
    return { run, loginItem, remove, install }
  }

  it('paired station and accepted: the TASK is the autostart and supervises; the Run key is turned off (one mechanism, no double start)', async () => {
    const f = plan()
    await expect(f.run).resolves.toEqual({ mechanism: 'task', supervised: true })
    expect(f.install).toHaveBeenCalledOnce()
    expect(f.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(false)
  })

  it('no paired station: the ordinary Run key opens the window, no task is created and any old one is removed', async () => {
    const f = plan({ paired: false })
    await expect(f.run).resolves.toEqual({ mechanism: 'run-key', supervised: false })
    expect(f.install).not.toHaveBeenCalled()
    expect(f.remove).toHaveBeenCalledOnce()
    expect(f.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(true, 'window')
  })

  it('the machine refuses the task: falls back to the Run key in background mode and SAYS so (never silent)', async () => {
    const denied = plan({ install: async () => ({ state: 'denied', detail: 'Access is denied' }) })
    await expect(denied.run).resolves.toEqual({ mechanism: 'run-key', supervised: false, notice: 'task-denied' })
    expect(denied.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(true, 'background')
    const failed = plan({ install: async () => ({ state: 'failed', detail: 'malformed' }) })
    await expect(failed.run).resolves.toMatchObject({ notice: 'task-failed' })
    const gone = plan({ install: async () => { throw new Error('no schtasks') } })
    await expect(gone.run).resolves.toMatchObject({ mechanism: 'run-key', notice: 'task-failed' })
  })

  it('consent withdrawn: everything off, the task removed even if removing fails', async () => {
    const f = plan({ accepted: false })
    f.remove.mockRejectedValueOnce(new Error('already gone'))
    await expect(f.run).resolves.toEqual({ mechanism: 'none' })
    expect(f.loginItem.setOpenAtLogin).toHaveBeenLastCalledWith(false)
    expect(f.install).not.toHaveBeenCalled()
  })
})

describe('the station watchdog on the machine', () => {
  it('installs through schtasks with the definition file and always removes the temp file', async () => {
    const f = rig()
    await expect(f.watchdog.install({ exe: EXE, userId: 'PADARIA\\Ana' })).resolves.toEqual({ state: 'installed' })
    expect(f.calls).toEqual([['/Create', '/TN', WATCHDOG_TASK_NAME, '/XML', 'C:\\Temp\\persona-watchdog.xml', '/F']])
    expect(f.written).toHaveLength(1)
    expect(f.removed).toEqual(['C:\\Temp\\persona-watchdog.xml'])
  })

  it('tells "this machine does not let a standard user create it" apart from any other failure, and still cleans up', async () => {
    const denied = rig(() => ({ code: 1, output: 'ERROR: Access is denied.' }))
    await expect(denied.watchdog.install({ exe: EXE, userId: 'a\\b' })).resolves.toMatchObject({ state: 'denied' })
    expect(denied.removed).toHaveLength(1)
    const broken = rig(() => ({ code: 1, output: 'ERROR: The task XML is malformed.' }))
    await expect(broken.watchdog.install({ exe: EXE, userId: 'a\\b' })).resolves.toMatchObject({ state: 'failed', detail: expect.stringContaining('malformed') })
  })

  it('removes the task; a task that is not there counts as removed; a real failure surfaces', async () => {
    await expect(rig().watchdog.remove()).resolves.toBeUndefined()
    await expect(rig(() => ({ code: 1, output: 'ERROR: The system cannot find the file specified.' })).watchdog.remove()).resolves.toBeUndefined()
    await expect(rig(() => ({ code: 1, output: 'ERROR: something else broke' })).watchdog.remove()).rejects.toThrow(/could not remove/u)
  })

  it('a deliberate "Sair" DISABLES the task so the app does not come back, and a start ENABLES it again only on a paired station', async () => {
    const f = rig()
    await f.watchdog.deliberateQuit()
    expect(f.calls.at(-1)).toEqual(['/Change', '/TN', WATCHDOG_TASK_NAME, '/DISABLE'])
    await f.watchdog.appStarted(false)
    expect(f.calls).toHaveLength(1)
    await f.watchdog.appStarted(true)
    expect(f.calls.at(-1)).toEqual(['/Change', '/TN', WATCHDOG_TASK_NAME, '/ENABLE'])
  })

  it('a quit never waits on the scheduler: a failing schtasks does not reject deliberateQuit or appStarted', async () => {
    const f = rig()
    const failing = new StationWatchdog({
      exec: vi.fn(async () => { throw new Error('schtasks is gone') }),
      writeDefinition: async () => 'x',
      removeDefinition: async () => undefined,
    })
    await expect(failing.deliberateQuit()).resolves.toBeUndefined()
    await expect(failing.appStarted(true)).resolves.toBeUndefined()
    expect(f.calls).toEqual([])
  })

  it('the arguments always go as an array (never a shell string) and the task name is the fixed one', async () => {
    const f = rig()
    await f.watchdog.present()
    await f.watchdog.remove()
    await f.watchdog.deliberateQuit()
    for (const call of f.calls) {
      expect(call.every(part => typeof part === 'string')).toBe(true)
      expect(call).toContain(WATCHDOG_TASK_NAME)
    }
  })
})

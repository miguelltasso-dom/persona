/**
 * How the dedicated station starts and ends (M4): the "open with Windows" choice (a scheduled task with a paired station, the Run key
 * otherwise), and what a quit leaves behind in `station.json` and in the Task Scheduler. Orchestration only: the pieces are
 * `station-watchdog.ts` and `station-state.ts`; the real `schtasks.exe` runner is at the bottom so a spec can fake everything above it.
 */

import { execFile } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { patchStationState, readStationState } from './station-state.ts'
import { applyAutostart, type AutostartLoginItem, type AutostartPlan, type StationWatchdog, type WatchdogDeps, type WatchdogExec } from './station-watchdog.ts'

/** What the startup rules need from the machine. */
export interface StationStartupDeps {
  /** The product home (`PERSONA_HOME`): where `station.json` lives. */
  readonly home: string
  readonly watchdog: Pick<StationWatchdog, 'install' | 'remove' | 'present' | 'deliberateQuit'>
  readonly loginItem: AutostartLoginItem
  /** Absolute path of Persona.exe. */
  readonly exe: string
  /** The signed-in Windows user (`DOMAIN\name`). */
  readonly userId: string
}

/**
 * The owner ticked (or cleared) "open with Windows".
 * @param accepted - Their choice.
 * @param deps - The machine.
 * @returns What is now in place; `notice` is set when the task was refused and the Run key took over.
 */
export function applyStartupChoice(accepted: boolean, deps: StationStartupDeps): Promise<AutostartPlan> {
  return applyAutostart({
    accepted,
    paired: readStationState(deps.home).paired,
    install: () => deps.watchdog.install({ exe: deps.exe, userId: deps.userId }),
    remove: () => deps.watchdog.remove(),
    loginItem: deps.loginItem,
  })
}

/**
 * At launch: put the saved choice back in force. A paired station re-creates a task someone deleted and enables one a deliberate quit
 * disabled; a machine that is not (or no longer) a station gets the ordinary Run key and loses any task left from before.
 * @param saved - The saved "open with Windows" preference.
 * @param deps - The machine.
 * @returns What is now in place.
 */
export async function reconcileStartupAtBoot(saved: boolean, deps: StationStartupDeps): Promise<AutostartPlan> {
  if (saved && readStationState(deps.home).paired) return applyStartupChoice(true, deps)
  deps.loginItem.setOpenAtLogin(saved, 'window')
  // A task left from a station that was unpaired would keep opening the app (host only) on a machine that is not one.
  if (await deps.watchdog.present().catch(() => false)) await deps.watchdog.remove().catch(() => undefined)
  return saved ? { mechanism: 'run-key', supervised: false } : { mechanism: 'none' }
}

/**
 * The app ended in order, and the Host is already down: say so in `station.json` (the next launch must not count a fall) and, when the
 * person left on purpose, stop the watchdog from bringing the app back. A session end (logoff, shutdown) leaves the task enabled.
 * Only a paired station keeps this memory; any other machine is left untouched.
 * @param deps - The machine.
 * @param options - `deliberate`: the person chose "Sair" (not an update, not the end of the Windows session).
 */
export async function recordOrderlyExit(deps: Pick<StationStartupDeps, 'home' | 'watchdog'>, options: { readonly deliberate: boolean }): Promise<void> {
  if (!readStationState(deps.home).paired) return
  patchStationState(deps.home, { lastExit: 'clean' })
  if (options.deliberate) await deps.watchdog.deliberateQuit()
}

/** @returns The Windows account in the form the Task Scheduler asks for. */
export function windowsUserId(): string {
  return `${process.env.USERDOMAIN ?? hostname()}\\${userInfo().username}`
}

/** @returns A runner for `schtasks.exe`: arguments as an array (never a shell), no console window, never longer than 10 s. */
export function schtasksExec(): WatchdogExec {
  return args => new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ code: 1, output: 'schtasks is Windows only' }); return }
    execFile('schtasks.exe', [...args], { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1
      resolve({ code, output: `${stdout}${stderr}` })
    })
  })
}

/**
 * @param tempDir - Where the task definition is written for the moment `schtasks /XML` reads it.
 * @returns The file side of the watchdog: UTF-16 LE with a byte-order mark, which is what `schtasks /XML` expects.
 */
export function watchdogFiles(tempDir: string): Pick<WatchdogDeps, 'writeDefinition' | 'removeDefinition'> {
  return {
    writeDefinition: async (xml) => {
      const path = join(tempDir, `persona-watchdog-${String(process.pid)}.xml`)
      await writeFile(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]))
      return path
    },
    removeDefinition: path => rm(path, { force: true }),
  }
}

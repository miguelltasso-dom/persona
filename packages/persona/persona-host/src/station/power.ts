/**
 * COLHEITA 24 (Carbon §1.3): a dedicated station does not let Windows suspend while it has work — and stops asking the moment
 * it has none. The request is per process (`SetThreadExecutionState`), never a change to the person's power plan: a small
 * PowerShell holds it while the station is busy and is closed when the queue empties, which releases it by itself.
 *
 * Windows-only by design (the station is a Windows PC); elsewhere the keeper is a no-op and says it is free.
 */

import { spawn, type ChildProcess } from 'node:child_process'

/** `ES_CONTINUOUS | ES_SYSTEM_REQUIRED`: keep the system awake, the screen may still turn off. */
export const AWAKE_FLAGS = 0x80000001

/** The script that holds the request until its process is closed. */
export const AWAKE_SCRIPT = [
  '$sig = \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);\'',
  'Add-Type -MemberDefinition $sig -Name Awake -Namespace Persona -PassThru | Out-Null',
  `[void][Persona.Awake]::SetThreadExecutionState(${String(AWAKE_FLAGS)})`,
  'Start-Sleep -Seconds 2147483',
].join('; ')

/** How the keeper starts the holder; tests replace it. */
export type SpawnHolder = (command: string, args: readonly string[]) => ChildProcess

/** What the keeper needs. */
export interface PowerKeeperDeps {
  /** Platform; default `process.platform`. */
  readonly platform?: NodeJS.Platform
  /** Process starter; default `spawn` with no window. */
  readonly spawn?: SpawnHolder
}

/** Whether the station is holding Windows awake. */
export type PowerState = 'segurando' | 'livre'

/** Keeps Windows awake while the station has work. */
export class PowerKeeper {
  private readonly deps: PowerKeeperDeps
  private child: ChildProcess | undefined

  /** @param deps - Platform and process starter. */
  constructor(deps: PowerKeeperDeps = {}) {
    this.deps = deps
  }

  /** Ask Windows to stay awake; idempotent. */
  hold(): void {
    if ((this.deps.platform ?? process.platform) !== 'win32') return
    if (this.child !== undefined) return
    const start = this.deps.spawn ?? ((command, args) => spawn(command, [...args], { stdio: 'ignore', windowsHide: true }))
    const child = start('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', AWAKE_SCRIPT])
    child.once('exit', () => { if (this.child === child) this.child = undefined })
    // P0-12: powershell.exe can fail to start (ENOENT, EPERM) or die; an 'error' event with nobody listening is an uncaught exception that takes the host down.
    // It means "no longer holding" (a later `hold` asks again); an error of a process the keeper already let go does not touch the new one.
    child.on('error', () => { if (this.child === child) this.child = undefined })
    this.child = child
  }

  /** Stop asking (the queue is empty); idempotent. */
  release(): void {
    const child = this.child
    this.child = undefined
    if (child !== undefined && child.exitCode === null) child.kill()
  }

  /** @returns Whether the request is being held right now. */
  state(): PowerState {
    return this.child !== undefined ? 'segurando' : 'livre'
  }
}

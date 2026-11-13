/**
 * M4 (Keel 14:44): a watchdog OUTSIDE the app that reopens Persona.exe when it dies, only on a paired station. It is a per-user Windows
 * scheduled task (no admin): a logon trigger, restart on failure, and a periodic launch as a safety net. Persona's single-instance lock
 * makes
 * every extra launch harmless (the second process hands over and exits, and `--background` never raises the owner's window).
 *
 * Two rules keep it honest:
 * - a deliberate "Sair" must NOT come back: the app DISABLES the task before it quits on purpose and ENABLES it again at every start;
 * - the task is created only with a station paired and the owner's consent, and removed when the station is unpaired and by the
 * uninstaller.
 */

/** The fixed name of the task (never taken from input). */
export const WATCHDOG_TASK_NAME = 'Persona - manter aberto'
/** How often the safety-net launch runs. */
export const WATCHDOG_REPEAT = 'PT5M'
/** The argument every watchdog launch carries: host only, no window. */
export const WATCHDOG_ARGUMENT = '--background'

/** One `schtasks.exe` run: the arguments go as an array, never through a shell. */
export interface WatchdogExec {
  (args: readonly string[]): Promise<{ readonly code: number; readonly output: string }>
}

/** What the watchdog needs from the machine. */
export interface WatchdogDeps {
  readonly exec: WatchdogExec
  /** Writes the task definition to a temp file (UTF-16 LE with BOM, what `schtasks /XML` reads) and returns its path. */
  readonly writeDefinition: (xml: string) => Promise<string>
  /** Removes that temp file. */
  readonly removeDefinition: (path: string) => Promise<void>
}

/** How an install ended. */
export type WatchdogInstall =
  | { readonly state: 'installed' }
  | { readonly state: 'denied'; readonly detail: string }
  | { readonly state: 'failed'; readonly detail: string }

/** XML text escape for the two values that come from the machine (the exe path and the user id). */
function xml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}

/**
 * The task definition.
 * @param input - The absolute path of Persona.exe and the signed-in user (`DOMAIN\name`).
 * @returns The Task Scheduler 1.2 XML.
 */
export function watchdogTaskXml(input: { readonly exe: string; readonly userId: string }): string {
  if (!/^[a-z]:\\.+\\Persona\.exe$/iu.test(input.exe)) throw new Error('watchdog: the executable must be an absolute path to Persona.exe')
  if (input.userId.trim() === '') throw new Error('watchdog: the task needs the signed-in user')
  const user = xml(input.userId)
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo><Description>Persona: reabre o app desta estação se ele cair.</Description></RegistrationInfo>',
    '  <Triggers>',
    `    <LogonTrigger><Enabled>true</Enabled><UserId>${user}</UserId></LogonTrigger>`,
    `    <TimeTrigger><StartBoundary>2026-01-01T00:00:00</StartBoundary><Repetition><Interval>${WATCHDOG_REPEAT}</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><Enabled>true</Enabled></TimeTrigger>`,
    '  </Triggers>',
    `  <Principals><Principal id="Author"><UserId>${user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>`,
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <StartWhenAvailable>true</StartWhenAvailable>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>',
    '    <Enabled>true</Enabled>',
    '  </Settings>',
    '  <Actions Context="Author">',
    `    <Exec><Command>${xml(input.exe)}</Command><Arguments>${WATCHDOG_ARGUMENT}</Arguments></Exec>`,
    '  </Actions>',
    '</Task>',
    '',
  ].join('\r\n')
}

/** Maps a failed `schtasks` run to "the machine said no" (no elevation) versus any other failure. */
function refusal(output: string): boolean {
  return /access is denied|acesso negado|0x80070005/iu.test(output)
}

/** What the autostart ended up being (Keel 15:47). */
export type AutostartPlan =
  | { readonly mechanism: 'none' }
  | { readonly mechanism: 'run-key'; readonly supervised: false; readonly notice?: 'task-denied' | 'task-failed' }
  | { readonly mechanism: 'task'; readonly supervised: true }

/** The part of the login item the plan drives. */
export interface AutostartLoginItem {
  setOpenAtLogin(enabled: boolean, mode?: 'window' | 'background'): void
}

/**
 * Decide and apply the "open with Windows" mechanism. With a paired station the autostart IS the scheduled task (its logon trigger, and it
 * supervises the app); without one it is the ordinary Run key. If the machine refuses the task, fall back to the Run key (no supervisor)
 * and say so (`notice`), never silently.
 * @param input - The owner's consent, whether this machine is the paired station, and the two mechanisms.
 * @returns What is now in place.
 */
export async function applyAutostart(input: {
  readonly accepted: boolean
  readonly paired: boolean
  readonly install: () => Promise<WatchdogInstall>
  readonly remove: () => Promise<void>
  readonly loginItem: AutostartLoginItem
}): Promise<AutostartPlan> {
  if (!input.accepted) {
    await input.remove().catch(() => undefined)
    input.loginItem.setOpenAtLogin(false)
    return { mechanism: 'none' }
  }
  if (!input.paired) {
    await input.remove().catch(() => undefined)
    input.loginItem.setOpenAtLogin(true, 'window')
    return { mechanism: 'run-key', supervised: false }
  }
  const result = await input.install().catch((): WatchdogInstall => ({ state: 'failed', detail: 'the scheduler could not be reached' }))
  if (result.state === 'installed') {
    // One mechanism only: the task starts the app at logon, so the Run key would start it a second time without supervision.
    input.loginItem.setOpenAtLogin(false)
    return { mechanism: 'task', supervised: true }
  }
  input.loginItem.setOpenAtLogin(true, 'background')
  return { mechanism: 'run-key', supervised: false, notice: result.state === 'denied' ? 'task-denied' : 'task-failed' }
}

/** The scheduled-task watchdog of a station. */
export class StationWatchdog {
  /** @param deps - `schtasks`, and the temp file for the definition. */
  constructor(private readonly deps: WatchdogDeps) {}

  /**
   * Create (or replace) the task.
   * @param input - Persona.exe path and the signed-in user.
   * @returns `installed`, `denied` (this machine does not let a standard user create it) or `failed`.
   */
  async install(input: { readonly exe: string; readonly userId: string }): Promise<WatchdogInstall> {
    const path = await this.deps.writeDefinition(watchdogTaskXml(input))
    try {
      const run = await this.deps.exec(['/Create', '/TN', WATCHDOG_TASK_NAME, '/XML', path, '/F'])
      if (run.code === 0) return { state: 'installed' }
      return { state: refusal(run.output) ? 'denied' : 'failed', detail: run.output.trim().slice(0, 300) }
    } finally {
      await this.deps.removeDefinition(path).catch(() => undefined)
    }
  }

  /** Remove the task (station unpaired, uninstall). A task that is not there is already removed. */
  async remove(): Promise<void> {
    const run = await this.deps.exec(['/Delete', '/TN', WATCHDOG_TASK_NAME, '/F'])
    if (run.code !== 0 && !/cannot find|does not exist|n[ãa]o (pode|foi) encontr/iu.test(run.output)) {
      throw new Error(`watchdog: could not remove the task: ${run.output.trim().slice(0, 200)}`)
    }
  }

  /** @returns Whether the task exists. */
  async present(): Promise<boolean> {
    return (await this.deps.exec(['/Query', '/TN', WATCHDOG_TASK_NAME])).code === 0
  }

  /**
   * The person quit on purpose ("Sair"): the watchdog must not bring the app back.
   * Best effort: a quit never waits on the scheduler.
   */
  async deliberateQuit(): Promise<void> {
    await this.deps.exec(['/Change', '/TN', WATCHDOG_TASK_NAME, '/DISABLE']).catch(() => undefined)
  }

  /**
   * The app started: supervision is back on (a deliberate quit disabled it). Does nothing without a paired station.
   * @param paired - Whether this machine is the paired station.
   */
  async appStarted(paired: boolean): Promise<void> {
    if (!paired) return
    await this.deps.exec(['/Change', '/TN', WATCHDOG_TASK_NAME, '/ENABLE']).catch(() => undefined)
  }
}

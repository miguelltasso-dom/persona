/**
 * BUG-QUIT-1: "Sair" must END the application.
 *
 * Measured on the packaged Windows build (H2 #4, 05/11): after the cleanup of `finishQuit` the JavaScript side finished in under a second
 * (before-quit, windows closed, `exit` and `quit` events), yet the main Persona.exe and its GPU / network / renderer helpers stayed alive for
 * as long as it was watched (60 s+, 0% CPU, every thread waiting). A stock Electron with the same flags exits on its own, so the native
 * shutdown is held by something of ours. The person saw the window disappear, but the process stayed in the Task Manager and the next launch
 * handed over to the invisible instance (single instance lock): "nothing appears".
 *
 * Belt and braces, both limited to OUR OWN process tree:
 *  - the caller ends the process itself with `app.exit(0)` once its own cleanup is done (see main.ts), and
 *  - this watchdog: a detached helper that, if the main process is still alive after a grace period, force-ends exactly that PID and the
 *    processes descended from it (the Host, the CLIs it started, the Chromium helpers), never anything else. It re-checks that the PID still
 *    names this executable before killing (a reused PID is somebody else's).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'

/**
 * Time the process gets to leave on its own after "Sair" before the watchdog ends the tree. It is only the net under a quit that never ends:
 * measured 12/11 (S3b), the own cleanup (the Host's graceful stop) took longer than the former 3 s, so the watchdog killed the tree and
 * the quit took 5-8 s. 5 s lets a slow but healthy quit finish by itself.
 */
export const QUIT_WATCHDOG_GRACE_MS = 5_000

export interface QuitWatchdogOptions {
  /** The main process to supervise (`process.pid`). */
  readonly pid: number
  /** Path of this executable (`process.execPath`): the helper runs it as plain Node and checks the PID still names it. */
  readonly execPath: string
  readonly graceMs?: number
  readonly platform?: NodeJS.Platform
  /** Environment to hand the helper. */
  readonly env?: NodeJS.ProcessEnv
  /** Injectable for tests. */
  readonly spawnProcess?: (command: string, args: readonly string[], options: { detached: boolean; stdio: 'ignore'; windowsHide: boolean; env: NodeJS.ProcessEnv }) => Pick<ChildProcess, 'unref'>
}

/**
 * The helper program (plain Node, CommonJS). Polls `pid`; once `graceMs` passes with the process still alive it ends the process together with
 * the tree below it (`taskkill /T /F`; on other systems the children, then the process).
 * It never exits non-zero and never throws to the caller.
 * @param pid - Process to supervise.
 * @param imageName - Executable file name the PID must still carry.
 * @param graceMs - Grace period before the kill.
 * @param platform - `win32` uses taskkill; everything else pkill/SIGKILL.
 */
export function quitWatchdogScript(pid: number, imageName: string, graceMs: number, platform: NodeJS.Platform): string {
  return `
const { spawnSync } = require('node:child_process');
const pid = ${String(Math.trunc(pid))};
const image = ${JSON.stringify(imageName)}.toLowerCase();
const until = Date.now() + ${String(Math.trunc(graceMs))};
const windows = ${JSON.stringify(platform === 'win32')};
const alive = () => { try { process.kill(pid, 0); return true; } catch (error) { return error && error.code === 'EPERM'; } };
const stillThatExecutable = () => {
  if (!windows) return true;
  const answer = spawnSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  return String(answer.stdout || '').toLowerCase().includes(image);
};
const timer = setInterval(() => {
  if (!alive()) process.exit(0);
  if (Date.now() < until) return;
  clearInterval(timer);
  if (!stillThatExecutable()) process.exit(0);
  // One call ends the whole tree rooted at the process (the Host, the CLIs it started, the Chromium helpers) while they are still its children.
  // Listing the descendants first (a PowerShell start) took 10+ seconds on a loaded machine; this is a few hundred milliseconds.
  // THIS helper is itself a child of that process, so it is part of the tree the call ends, and so would be a taskkill started by it: it would be
  // killed halfway (measured: the tree then took anywhere from 4 to 17 s to go). \`start /b\` through cmd.exe makes taskkill an orphan of a cmd that
  // exits at once, outside the tree, so it always finishes the job.
  try {
    if (windows) spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'start "" /b taskkill /PID ' + pid + ' /T /F'], { windowsHide: true, windowsVerbatimArguments: true, timeout: 8000 });
    else { spawnSync('pkill', ['-KILL', '-P', String(pid)], { timeout: 4000 }); process.kill(pid, 'SIGKILL'); }
  } catch (error) { /* gone already */ }
  // The process is normally gone within a moment; if this helper was ended with it, nothing below runs, which is fine.
  const settle = Date.now() + 10000;
  const finish = setInterval(() => { if (!alive() || Date.now() > settle) { clearInterval(finish); process.exit(0); } }, 100);
}, 250);
`
}

/**
 * Start the watchdog helper (detached, no window, no stdio). Never throws: the quit must not fail because the safety net could not start.
 * @param options - Process to supervise and test seams.
 * @returns whether the helper was started.
 */
export function armQuitWatchdog(options: QuitWatchdogOptions): boolean {
  try {
    const platform = options.platform ?? process.platform
    const script = quitWatchdogScript(options.pid, basename(options.execPath), options.graceMs ?? QUIT_WATCHDOG_GRACE_MS, platform)
    const start = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, [...args], spawnOptions))
    const helper = start(options.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: '1' },
    })
    helper.unref()
    return true
  } catch (error) {
    console.error('desktop quit: watchdog could not start', error)
    return false
  }
}

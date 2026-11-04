/**
 * Which real CLIs are logged in on this machine, asked of the CLIs themselves BEFORE the run and OUTSIDE the app, so the verifier's
 * `connected-cli` check is not circular (it used to be derived from the ledger's own engine). `claude auth status --json` reads the
 * login only: no model turn, no quota. A CLI that cannot be asked is simply not listed (the verifier then fails closed).
 */
import { execFile } from 'node:child_process'

/** @returns CLI ids reporting a logged-in account (`claude`), possibly empty. */
export async function probeLoggedCli(): Promise<string[]> {
  const loggedIn = await new Promise<boolean>((resolve) => {
    execFile('claude', ['auth', 'status', '--json'], { timeout: 20_000, windowsHide: true, shell: process.platform === 'win32' }, (error, stdout) => {
      if (error !== null) { resolve(false); return }
      try {
        const parsed = JSON.parse(stdout) as { loggedIn?: unknown }
        resolve(parsed.loggedIn === true)
      } catch {
        resolve(false)
      }
    })
  })
  return loggedIn ? ['claude'] : []
}

import { spawn } from 'node:child_process'

/**
 * Terminate a process and its children (Windows: `taskkill /T /F`).
 * @param pid - root process id.
 */
export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true })
      killer.on('exit', () => { resolve() })
      killer.on('error', () => { resolve() })
      return
    }
    try { process.kill(-pid, 'SIGTERM') } catch { /* already gone */ }
    resolve()
  })
}

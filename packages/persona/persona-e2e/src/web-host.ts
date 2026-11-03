import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { E2E_TMP_ROOT, REPO_ROOT, requireWebDist } from './paths.ts'
import { probeFreePort } from './ports.ts'
import { killProcessTree } from './process-tree.ts'

const WEB_URL_LINE = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/

export interface StartWebHostOptions {
  /** Overrides both `PERSONA_HOME` and `DSH_HOME` when set. */
  home?: string
  /** Extra environment variables for the host process. */
  env?: Record<string, string>
}

export interface WebHostHandle {
  readonly url: string
  readonly home: string
  stop(): Promise<void>
}

/**
 * Boot the real `dsh web` host against a disposable home (Tier 1).
 * @param options - optional home directory and extra env.
 */
export async function startWebHost(options: StartWebHostOptions = {}): Promise<WebHostHandle> {
  requireWebDist()
  const id = randomUUID()
  const home = options.home ?? join(E2E_TMP_ROOT, `e2e-${id}`)
  await mkdir(home, { recursive: true })
  const port = await probeFreePort()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    DSH_HOME: home,
    PERSONA_HOME: home,
    DSH_TELEMETRY_DISABLED: '1',
  }

  const args = [
    '--import', 'tsx/esm',
    'apps/cli/src/bin.ts',
    'web',
    '--no-open',
    '--host', '127.0.0.1',
    '--port', String(port),
  ]

  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { stdout += chunk })
  child.stderr?.on('data', (chunk: string) => { stderr += chunk })

  const url = await new Promise<string>((resolve, reject) => {
    const deadline = Date.now() + 180_000
    const tick = (): void => {
      const match = WEB_URL_LINE.exec(stdout)
      if (match?.[1] !== undefined) {
        resolve(match[1])
        return
      }
      if (child.exitCode !== null) {
        reject(new Error(`dsh web exited before printing URL (code ${String(child.exitCode)})\n${stderr}\n${stdout}`))
        return
      }
      if (Date.now() > deadline) {
        reject(new Error(`timed out waiting for dsh web URL\n${stderr}\n${stdout}`))
        return
      }
      setTimeout(tick, 250)
    }
    child.on('error', reject)
    tick()
  })

  async function stop(): Promise<void> {
    if (child.pid !== undefined) await killProcessTree(child.pid)
    if (options.home === undefined) {
      await rm(home, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { url, home, stop }
}

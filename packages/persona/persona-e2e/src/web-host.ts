import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { E2E_TMP_ROOT, requireWebDist } from './paths.ts'
import { probeFreePort } from './ports.ts'
import { launchDirect, launchUnderLock } from './locked-launch.ts'
import {
  BUILD_LOCK_READY,
  hostBootTimeoutMs,
  lockQueueTimeoutMs,
  webHostBootFailure,
} from './web-host-boot.ts'

export {
  BuildLockContentionError,
  WebHostBootTimeoutError,
  isBuildLockBootFailure,
  lockHolderFromOutput,
  outputIndicatesLockQueueOnly,
} from './web-host-boot.ts'

const WEB_URL_LINE = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/

export type WebHostProfile = 'persona' | 'web'

export interface StartWebHostOptions {
  /** CLI profile shorthand (`persona` default). */
  profile?: WebHostProfile
  /** Overrides both `PERSONA_HOME` and `DSH_HOME` when set. */
  home?: string
  /** Extra environment variables for the host process. */
  env?: Record<string, string>
}

export interface WebHostHandle {
  readonly url: string
  readonly home: string
  readonly profile: WebHostProfile
  stop(): Promise<void>
}

/**
 * Boot the real host against a disposable home (Tier 1), under with-lock with early release.
 * @param options - profile, optional home directory and extra env.
 */
export async function startWebHost(options: StartWebHostOptions = {}): Promise<WebHostHandle> {
  requireWebDist()
  const profile = options.profile ?? 'persona'
  const id = randomUUID()
  const home = options.home ?? join(E2E_TMP_ROOT, `e2e-${id}`)
  await mkdir(home, { recursive: true })
  const port = await probeFreePort()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // The Persona Cofre needs the desktop's DPAPI channel; a web host has none, so the required `connection` plugin
    // fails the whole boot ("Cofre indisponível neste modo"). Tests use the vault's test cipher (never set for the exe).
    PERSONA_VAULT_TEST_CIPHER: '1',
    ...options.env,
    DSH_HOME: home,
    PERSONA_HOME: home,
    DSH_TELEMETRY_DISABLED: '1',
  }

  const cliArgs = [
    '--import', 'tsx/esm',
    'apps/cli/src/bin.ts',
    '--profile', profile,
    '--no-open',
    '--host', '127.0.0.1',
    '--port', String(port),
  ]

  const callerHoldsBuildLock = process.env.PERSONA_LOCK !== undefined && process.env.PERSONA_LOCK !== ''
  const launch = process.env.PERSONA_HOST_NO_LOCK === '1' || callerHoldsBuildLock
    ? launchDirect({ command: process.execPath, args: cliArgs, env })
    : launchUnderLock({
      label: `Probe persona-e2e web host (${profile})`,
      releaseOn: 'dsh web:',
      command: process.execPath,
      args: cliArgs,
      env,
    })

  const usingLock = process.env.PERSONA_HOST_NO_LOCK !== '1' && !callerHoldsBuildLock
  const url = await new Promise<string>((resolve, reject) => {
    const started = Date.now()
    let hostBootStartedAt = usingLock ? undefined as number | undefined : started
    const tick = (): void => {
      const text = launch.output.text()
      if (hostBootStartedAt === undefined && (BUILD_LOCK_READY.test(text) || WEB_URL_LINE.test(text))) {
        hostBootStartedAt = Date.now()
      }
      const match = WEB_URL_LINE.exec(text)
      if (match?.[1] !== undefined) {
        resolve(match[1])
        return
      }
      if (launch.child.exitCode !== null) {
        reject(webHostBootFailure(text, launch.child.exitCode))
        return
      }
      const now = Date.now()
      if (usingLock && hostBootStartedAt === undefined && now - started > lockQueueTimeoutMs()) {
        reject(webHostBootFailure(text, null))
        return
      }
      const bootDeadline = (hostBootStartedAt ?? started) + hostBootTimeoutMs()
      if (now > bootDeadline) {
        reject(webHostBootFailure(text, null))
        return
      }
      setTimeout(tick, 250)
    }
    launch.child.on('error', reject)
    tick()
  })

  async function stop(): Promise<void> {
    await launch.stop()
    if (options.home === undefined) {
      await rm(home, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { url, home, profile, stop }
}

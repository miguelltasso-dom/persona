/** Official CLI quota with timeout + cache. No tokens in logs. */

import { readOarAccountUsage } from './official.ts'
import type { OfficialQuota } from './types.ts'

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_CACHE_MS = 60_000

export interface OfficialQuotaOptions {
  /** Injected OAR `accountUsage` (or a test double). Omitted → unavailable. */
  accountUsage?: () => Promise<unknown>
  timeoutMs?: number
  cacheMs?: number
  now?: () => number
  cache?: Map<string, { at: number; value: OfficialQuota }>
}

/**
 * Official quota for one CLI. Timeout or missing payload → `indisponível`.
 * Never writes secrets. Never publishes `usedPercent: 0` for a missing window.
 * @param cli - `claude` / `codex` / other provider id.
 * @param options - Reader, timeouts, optional cache map.
 */
export async function officialQuota(cli: string, options: OfficialQuotaOptions = {}): Promise<OfficialQuota> {
  const now = options.now ?? Date.now
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS
  const cache = options.cache
  const hit = cache?.get(cli)
  if (hit !== undefined && now() - hit.at < cacheMs) return hit.value
  const read = options.accountUsage
  if (read === undefined) {
    return remember(cache, cli, now(), unavailable(cli, 'accountUsage missing'))
  }
  try {
    const raw = await withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, read())
    const quota = readOarAccountUsage(cli, raw)
    return remember(cache, cli, now(), sanitize(quota))
  } catch {
    return remember(cache, cli, now(), unavailable(cli, 'accountUsage timeout'))
  }
}

function unavailable(provider: string, detail: string): OfficialQuota {
  return { provider, origin: 'unavailable', windows: [], detail }
}

function sanitize(quota: OfficialQuota): OfficialQuota {
  return {
    ...quota,
    windows: quota.windows.map((window) => {
      if (window.origin === 'unavailable' && window.usedPercent === 0) {
        const { usedPercent: _ignored, ...rest } = window
        return rest
      }
      return window
    }),
  }
}

function remember(
  cache: Map<string, { at: number; value: OfficialQuota }> | undefined,
  cli: string,
  at: number,
  value: OfficialQuota,
): OfficialQuota {
  cache?.set(cli, { at, value })
  return value
}

async function withTimeout<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => { reject(new Error('officialQuota timeout')) }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

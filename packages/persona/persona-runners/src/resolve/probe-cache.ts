/** Shared 60 s cache for authStatus / listModels (resolve + detectConnections). */

import type { AvailableInstallation } from '@botiverse/oar'
import type { CliKind } from '../contract.ts'

export const PROBE_CACHE_MS = 60_000

export interface CachedAuth {
  kind: string
  at: number
}

export interface CachedModels {
  ids: readonly string[]
  at: number
}

const auth = new Map<string, CachedAuth>()
const models = new Map<string, CachedModels>()

/**
 * @param cli - Vendor id.
 * @param now - Clock ms.
 */
export function cachedAuth(cli: CliKind | string, now: number = Date.now()): CachedAuth | undefined {
  const hit = auth.get(cli)
  if (hit === undefined || now - hit.at >= PROBE_CACHE_MS) return undefined
  return hit
}

/**
 * @param cli - Vendor id.
 * @param kind - OAR auth kind.
 * @param now - Clock ms.
 */
export function rememberAuth(cli: CliKind | string, kind: string, now: number = Date.now()): void {
  auth.set(cli, { kind, at: now })
}

/**
 * @param cli - Vendor id.
 * @param cwd - Session cwd (models can be cwd-scoped).
 * @param now - Clock ms.
 */
export function cachedModels(cli: CliKind | string, cwd: string, now: number = Date.now()): CachedModels | undefined {
  const hit = models.get(`${cli}:${cwd}`)
  if (hit === undefined || now - hit.at >= PROBE_CACHE_MS) return undefined
  return hit
}

/**
 * @param cli - Vendor id.
 * @param cwd - Session cwd.
 * @param ids - Model ids.
 * @param now - Clock ms.
 */
export function rememberModels(
  cli: CliKind | string,
  cwd: string,
  ids: readonly string[],
  now: number = Date.now(),
): void {
  models.set(`${cli}:${cwd}`, { ids, at: now })
}

/** Drop probe caches (tests). */
export function resetProbeCache(): void {
  auth.clear()
  models.clear()
}

export type { AvailableInstallation }

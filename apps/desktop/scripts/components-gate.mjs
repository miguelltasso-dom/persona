/**
 * Package gate (D-101, item 20): the packaged app carries `resources/components.json`, the manifest of on-demand components. The Host reads it
 * through `DSH_COMPONENTS_MANIFEST` (set by main when the file exists); without it the voice model stays `unavailable`. The model itself is NOT in
 * the installer (32 MB, downloaded on demand and checked against the sha256 pinned here), so this gate judges the manifest: it must name the
 * voice model (`stt`) with an https URL, a sha256 and a size.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SHA256 = /^[0-9a-f]{64}$/u

/**
 * @param {string} resourcesDir - The `resources` folder of the packaged app (next to `app.asar`).
 * @returns {{ present: boolean, ok: boolean, problems: string[], stt: { version: string, sha256: string, bytes: number } | null }} The verdict.
 */
export function componentsGateOf(resourcesDir) {
  const file = join(resourcesDir, 'components.json')
  if (!existsSync(file)) return { present: false, ok: false, problems: ['resources/components.json is missing: the voice model stays unavailable'], stt: null }
  let manifest
  try { manifest = JSON.parse(readFileSync(file, 'utf8')) } catch { return { present: true, ok: false, problems: ['components.json is not valid JSON'], stt: null } }
  const problems = []
  if (manifest?.schemaVersion !== 1) problems.push(`components.json schemaVersion is ${String(manifest?.schemaVersion)}, expected 1`)
  const entry = Array.isArray(manifest?.components) ? manifest.components.find(item => item?.kind === 'stt') : undefined
  if (entry === undefined) {
    problems.push('components.json has no "stt" entry (the voice model)')
    return { present: true, ok: false, problems, stt: null }
  }
  if (typeof entry.version !== 'string' || entry.version === '') problems.push('the stt entry has no version')
  if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) problems.push('the stt entry URL is not https')
  if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) problems.push('the stt entry has no valid sha256 (64 lower-case hex digits)')
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) problems.push('the stt entry has no valid bytes size')
  return {
    present: true,
    ok: problems.length === 0,
    problems,
    stt: { version: String(entry.version), sha256: String(entry.sha256), bytes: Number(entry.bytes) },
  }
}

/** Pinned on-demand component manifest (persona-spec/contracts/on-demand-runtime.md §4). */

/** Runtime components the base installer does not carry. */
export type ComponentKind = 'libreoffice' | 'python' | 'mingit' | 'pnpm' | 'stt'

/** One downloadable component with its pinned integrity facts. */
export interface ComponentManifestEntry {
  readonly kind: ComponentKind
  readonly version: string
  /** HTTPS archive URL published beside the release. */
  readonly url: string
  /** Lowercase hex sha256 of the archive bytes; pinned in the app, never read from the server. */
  readonly sha256: string
  /** Archive size in bytes; the download is refused when the server sends more. */
  readonly bytes: number
  /**
   * Archive format the installer stores: `zip` (default) is extracted into the component directory; `tar.gz` is kept as
   * `model.tar.gz`, the shape the renderer's worker loads.
   */
  readonly format?: 'zip' | 'tar.gz'
}

/** Complete manifest shipped with the application. */
export interface ComponentManifest {
  readonly schemaVersion: 1
  readonly components: readonly ComponentManifestEntry[]
}

const KINDS: Readonly<Record<string, true>> = { libreoffice: true, python: true, mingit: true, pnpm: true, stt: true }

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`components: invalid ${subject}`)
  return value as Record<string, unknown>
}

/**
 * Validate a manifest read from the packaged application.
 * @param value - Parsed JSON.
 * @returns The validated manifest.
 */
export function parseComponentManifest(value: unknown): ComponentManifest {
  const root = record(value, 'manifest')
  if (root.schemaVersion !== 1) throw new Error('components: unsupported manifest schema')
  if (!Array.isArray(root.components)) throw new Error('components: manifest has no components')
  const seen = new Set<string>()
  const components = root.components.map((entry, index): ComponentManifestEntry => {
    const row = record(entry, `component ${String(index)}`)
    const { kind, version, url, sha256, bytes, format } = row
    if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) throw new Error(`components: invalid kind ${String(kind)}`)
    if (seen.has(kind)) throw new Error(`components: duplicate kind ${kind}`)
    seen.add(kind)
    if (typeof version !== 'string' || version === '') throw new Error(`components: invalid version for ${kind}`)
    if (typeof url !== 'string' || !/^https:\/\//u.test(url)) throw new Error(`components: invalid url for ${kind}`)
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(sha256)) throw new Error(`components: invalid sha256 for ${kind}`)
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`components: invalid bytes for ${kind}`)
    if (format !== undefined && format !== 'zip' && format !== 'tar.gz') throw new Error(`components: invalid format for ${kind}`)
    return { kind: kind as ComponentKind, version, url, sha256, bytes, ...(format === undefined ? {} : { format }) }
  })
  return { schemaVersion: 1, components }
}

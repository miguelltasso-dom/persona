/**
 * The Claude CLI takes ONE `--settings` value. Several parts of the product contribute to it (the connector allow-list of ISO-5, the
 * permission gate's hook of HT-8/9), so they are merged here into the single JSON the CLI gets. Pure.
 *
 * Merge rules (the only keys the product writes): `hooks.<Event>` arrays are concatenated in the order given; `allowedHttpHookUrls` and
 * `allowedMcpServers` are unioned without duplicates, keeping the first order. Anything else is taken from the first part that has it.
 */

export type FlagSettings = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function union(a: unknown, b: unknown): unknown[] {
  const out: unknown[] = []
  const seen = new Set<string>()
  for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const key = JSON.stringify(item)
    if (!seen.has(key)) { seen.add(key); out.push(item) }
  }
  return out
}

/**
 * @param parts - The settings each contributor wants, in priority order.
 * @returns One settings object, or `undefined` when no part contributed anything.
 */
export function mergeFlagSettings(parts: readonly (FlagSettings | undefined)[]): FlagSettings | undefined {
  const present = parts.filter((part): part is FlagSettings => part !== undefined && Object.keys(part).length > 0)
  if (present.length === 0) return undefined
  const merged: Record<string, unknown> = {}
  for (const part of present) {
    for (const [key, value] of Object.entries(part)) {
      if (key === 'hooks' && isRecord(value)) {
        const hooks: Record<string, unknown[]> = isRecord(merged.hooks) ? { ...(merged.hooks as Record<string, unknown[]>) } : {}
        for (const [event, list] of Object.entries(value)) hooks[event] = [...(hooks[event] ?? []), ...(Array.isArray(list) ? list : [])]
        merged.hooks = hooks
      } else if (key === 'allowedHttpHookUrls' || key === 'allowedMcpServers') {
        merged[key] = union(merged[key], value)
      } else if (!(key in merged)) {
        merged[key] = value
      }
    }
  }
  return merged
}

/**
 * The `--settings` argument pair for a merged settings object.
 * @param settings - Output of {@link mergeFlagSettings}.
 */
export function settingsArgs(settings: FlagSettings | undefined): string[] {
  return settings === undefined ? [] : ['--settings', JSON.stringify(settings)]
}

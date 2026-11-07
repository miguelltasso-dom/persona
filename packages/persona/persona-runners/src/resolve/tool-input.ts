/**
 * HT-8/HT-9 (D-084): the arguments of an MCP tool call, two ways. Pure: no model, no I/O.
 *
 *  - {@link argsHash}: SHA-256 of the CANONICAL JSON of the REAL, COMPLETE arguments. "Approve" re-runs the task with
 *    `approved: [{ tool, argsHash }]`; the permission layer compares the hash of the arguments the model actually sends this time:
 *    equal ⇒ allowed ONCE, different ⇒ denied (so "I approved A, it sent B" cannot happen).
 *  - {@link boundedInput}: what the preview card may show: flat, small, with secrets masked. NEVER what is hashed.
 *
 * Canonical JSON: objects with keys sorted recursively by code unit, no whitespace, arrays keep their order, `undefined` dropped,
 * numbers as `JSON.stringify` writes them (`-0` is `0`), strings untouched (no Unicode normalisation). UTF-8, SHA-256, lowercase hex.
 */

import { createHash } from 'node:crypto'

/** Limits of the preview (contracts/connector-grants.md): flat, ≤ 20 fields, each string ≤ 4 KiB, all strings ≤ 16 KiB. */
export const INPUT_MAX_FIELDS = 20
export const INPUT_MAX_STRING_BYTES = 4096
export const INPUT_MAX_TOTAL_BYTES = 16 * 1024

/** What a masked value is replaced with (words for the screen are the UI's). */
export const MASKED = '[oculto]'

function canonical(value: unknown): string | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') return Object.is(value, -0) ? '0' : JSON.stringify(Number.isFinite(value) ? value : null)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonical(item) ?? 'null').join(',')}]`
  const row = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(row).sort()) {
    const text = canonical(row[key])
    if (text !== undefined) parts.push(`${JSON.stringify(key)}:${text}`)
  }
  return `{${parts.join(',')}}`
}

/**
 * The canonical JSON text of an input (what {@link argsHash} hashes).
 * @param input - Any JSON-like value.
 */
export function canonicalJson(input: unknown): string {
  return canonical(input) ?? 'null'
}

/**
 * @param input - The REAL, COMPLETE arguments of the call (never the bounded preview).
 * @returns Lowercase hex SHA-256 of the UTF-8 canonical JSON.
 */
export function argsHash(input: unknown): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex')
}

export type FlatValue = string | number | boolean | null

export interface BoundedInput {
  /** Flattened leaves (`a.b`, `items[0]`), strings cut to the limit with an ellipsis, secrets masked. */
  readonly fields: Readonly<Record<string, FlatValue>>
  /** True when ANYTHING was cut or left out (fields past the limit, a long string, the total). The host then does not approve blind. */
  readonly truncated: boolean
  /** True when a value was replaced by {@link MASKED}: the preview is NOT what will be sent, so the host does not approve blind either. */
  readonly masked: boolean
}

const SECRET_KEY = /pass(word|wd|phrase)?|secret|token|api[_-]?key|authorization|credential|private[_-]?key|bearer|cookie|session[_-]?id/iu
/** Shapes of a credential in a value, whatever the field is called. */
const SECRET_VALUE = [
  /\bsk-[a-z0-9_-]{16,}/iu,
  /\bgh[pousr]_[a-z0-9]{20,}/iu,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bxox[abprs]-[a-z0-9-]{10,}/iu,
  /\bBearer\s+[a-z0-9._~+/=-]{16,}/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}/iu,
]

function leaves(value: unknown, path: string, out: [string, FlatValue][]): void {
  if (value === undefined) return
  if (value === null || typeof value === 'string' || typeof value === 'boolean') { out.push([path, value]); return }
  if (typeof value === 'number') { out.push([path, Number.isFinite(value) ? value : null]); return }
  if (Array.isArray(value)) {
    if (value.length === 0) out.push([path, '[]'])
    value.forEach((item, index) => { leaves(item, `${path}[${String(index)}]`, out) })
    return
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    const keys = Object.keys(row)
    if (keys.length === 0) out.push([path, '{}'])
    for (const key of keys) leaves(row[key], path === '' ? key : `${path}.${key}`, out)
  }
}

/** Cut a string to `limit` UTF-8 bytes on a character boundary, ending in an ellipsis when cut. */
function cut(text: string, limit: number): { text: string; cut: boolean } {
  if (Buffer.byteLength(text, 'utf8') <= limit) return { text, cut: false }
  let out = ''
  let bytes = 0
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8')
    if (bytes + size > limit - 3) break
    out += char
    bytes += size
  }
  return { text: `${out}…`, cut: true }
}

/**
 * The preview of a call's arguments.
 * @param input - The real arguments.
 * @param options - `isSecret`: an extra detector for a value (the host's own `containsSecretValue`); it is OR-ed with the built-in
 *   rules (a field NAMED like a credential is always masked, and so is a value SHAPED like one).
 */
export function boundedInput(input: unknown, options: { readonly isSecret?: (value: string) => boolean } = {}): BoundedInput {
  const all: [string, FlatValue][] = []
  leaves(input, '', all)
  const fields: Record<string, FlatValue> = {}
  let truncated = false
  let masked = false
  let budget = INPUT_MAX_TOTAL_BYTES
  let kept = 0
  for (const [rawPath, value] of all) {
    const path = rawPath === '' ? 'value' : rawPath
    if (kept >= INPUT_MAX_FIELDS) { truncated = true; break }
    if (typeof value !== 'string') {
      if (SECRET_KEY.test(path) && value !== null) { fields[path] = MASKED; masked = true } else fields[path] = value
      kept += 1
      continue
    }
    const secret = SECRET_KEY.test(path) || SECRET_VALUE.some(rule => rule.test(value)) || options.isSecret?.(value) === true
    if (secret) { fields[path] = MASKED; masked = true; kept += 1; continue }
    if (budget <= 3) { truncated = true; break }
    const limited = cut(value, Math.min(INPUT_MAX_STRING_BYTES, budget))
    fields[path] = limited.text
    budget -= Buffer.byteLength(limited.text, 'utf8')
    if (limited.cut) truncated = true
    kept += 1
  }
  return { fields, truncated, masked }
}

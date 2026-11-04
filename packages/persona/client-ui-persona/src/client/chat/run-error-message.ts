/**
 * Inline marker for typed run errors (RUN-ERRORS-SPEC). Host/runner may also set `runError` on the wire event.
 */

import type { RunErrorCode, RunErrorPayload } from '../primitives/run-errors.ts'

const MARKER = /\[\[run-error:([\s\S]+?)\]\]\s*$/u

const CODES = new Set<RunErrorCode>([
  'not_logged_in', 'cli_not_found', 'model_unavailable', 'quota_exhausted',
  'budget_exhausted', 'provider_unreachable', 'engine_unavailable', 'app_offline',
])

function isRunErrorCode(value: string): value is RunErrorCode {
  return CODES.has(value as RunErrorCode)
}

function payloadFromUnknown(raw: unknown): RunErrorPayload | null {
  if (raw === null || typeof raw !== 'object') return null
  const code = Reflect.get(raw, 'code')
  if (typeof code !== 'string' || !isRunErrorCode(code)) return null
  const pick = (key: string): string | undefined => {
    const v = Reflect.get(raw, key)
    return typeof v === 'string' ? v : undefined
  }
  const otherAccount = Reflect.get(raw, 'otherAccount')
  return {
    code,
    provider: pick('provider'),
    model: pick('model'),
    account: pick('account'),
    persona: pick('persona'),
    resetAt: pick('resetAt'),
    command: pick('command'),
    ...(otherAccount === true ? { otherAccount: true } : {}),
  }
}

/** Parse `[[run-error:{…json…}]]` appended to the message body (Rivet/Anvil bridge until wire field is universal). */
export function parseRunErrorMarker(body: string): { readonly payload: RunErrorPayload; readonly visibleBody: string } | null {
  const match = MARKER.exec(body)
  if (match === null) return null
  const json = match[1]?.trim()
  if (json === undefined || json.length === 0) return null
  try {
    const payload = payloadFromUnknown(JSON.parse(json) as unknown)
    if (payload === null) return null
    const visibleBody = body.slice(0, match.index).trimEnd()
    return { payload, visibleBody }
  } catch {
    return null
  }
}

export function runErrorMarker(payload: RunErrorPayload): string {
  return `\n\n[[run-error:${JSON.stringify(payload)}]]`
}

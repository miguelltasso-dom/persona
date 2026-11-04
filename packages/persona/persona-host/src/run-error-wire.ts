/**
 * Parse `[[run-error:{json}]]` on a stored body (RUN-ERRORS-SPEC).
 * Host sends code; the UI mounts the human text.
 */

import type { RunErrorCode, RunErrorPayload } from './types.ts'

const MARKER = /\[\[run-error:([\s\S]+?)\]\]\s*$/u

const CODES = new Set<RunErrorCode>([
  'not_logged_in', 'cli_not_found', 'model_unavailable', 'quota_exhausted',
  'budget_exhausted', 'provider_unreachable', 'engine_unavailable', 'app_offline',
])

function isRunErrorCode(value: string): value is RunErrorCode {
  return CODES.has(value as RunErrorCode)
}

/**
 * @param body - Stored message body.
 * @returns Typed payload when the marker is valid.
 */
export function runErrorFromBody(body: string): RunErrorPayload | undefined {
  const match = MARKER.exec(body)
  const json = match?.[1]?.trim()
  if (json === undefined || json.length === 0) return undefined
  try {
    const raw: unknown = JSON.parse(json)
    if (raw === null || typeof raw !== 'object') return undefined
    const code = Reflect.get(raw, 'code')
    if (typeof code !== 'string' || !isRunErrorCode(code)) return undefined
    const pick = (key: string): string | undefined => {
      const value = Reflect.get(raw, key)
      return typeof value === 'string' ? value : undefined
    }
    const otherAccount = Reflect.get(raw, 'otherAccount')
    const provider = pick('provider')
    const model = pick('model')
    const account = pick('account')
    const persona = pick('persona')
    const resetAt = pick('resetAt')
    const command = pick('command')
    return {
      code,
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
      ...(account === undefined ? {} : { account }),
      ...(persona === undefined ? {} : { persona }),
      ...(resetAt === undefined ? {} : { resetAt }),
      ...(command === undefined ? {} : { command }),
      ...(otherAccount === true ? { otherAccount: true } : {}),
    }
  } catch {
    return undefined
  }
}

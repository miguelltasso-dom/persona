/**
 * The value the WORKER puts on a GitHub webhook after it checked GitHub's HMAC. The hub accepts a webhook POST only with this tag, which nobody outside can compute
 * (it derives from the webhook secret), so the one route the hub takes without a person's signature cannot be reached around the Worker.
 * An unset secret gives `''`, and the hub treats `''` as "nothing is internal" (fail closed).
 */

import { sha256Hex } from '../../../packages/persona/persona-sync/src/request-auth.ts'

/** @param secret - `GITHUB_WEBHOOK_SECRET`. @returns The tag, or `''` when there is no secret. */
export async function internalTagOf(secret: string | undefined): Promise<string> {
  return typeof secret === 'string' && secret !== '' ? await sha256Hex(new TextEncoder().encode(`persona-internal/v1\n${secret}`)) : ''
}

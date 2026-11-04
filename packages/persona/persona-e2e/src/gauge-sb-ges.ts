/**
 * Gauge helpers for the Segundo cérebro (SB-7) and Gestor de equipe (GES-6) app-layer suites.
 * The web client talks to the host with `POST /api/persona/<method>` (cookie-authenticated through the `?token=` URL),
 * so a test can seed or read host state through the SAME door the UI uses, without any product change.
 */
import type { Page } from 'playwright'

export interface Tenant {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
}

interface RpcEnvelope<T> {
  readonly result?: { readonly ok: boolean; readonly value?: T; readonly error?: { readonly code?: string; readonly message?: string } }
}

export interface RpcResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: string
}

/**
 * Tenant ids the live store persisted for this browser (`persona.tenant.v1`).
 * @param page - Page with the shell mounted.
 */
export async function readTenant(page: Page): Promise<Tenant> {
  const raw = await page.evaluate(() => localStorage.getItem('persona.tenant.v1'))
  if (raw === null) throw new Error('persona.tenant.v1 missing — onboarding not finished?')
  return JSON.parse(raw) as Tenant
}

/**
 * Call one persona Remote exactly as the browser client does.
 * @param page - Authenticated page (its context carries the auth cookie).
 * @param method - Remote name without the `persona/` prefix.
 * @param request - The single request object.
 */
export async function hostRpc<T>(page: Page, method: string, request: Record<string, unknown>): Promise<RpcResult<T>> {
  const origin = new URL(page.url()).origin
  const response = await page.context().request.post(`${origin}/api/persona/${method}`, {
    data: {
      type: 'client-request',
      rpcId: `gauge-${Math.random().toString(36).slice(2)}`,
      method: `persona/${method}`,
      payload: { args: { request } },
    },
  })
  const body = await response.json() as RpcEnvelope<T>
  const result = body.result
  if (result === undefined) return { ok: false, error: `no result (${String(response.status())})` }
  if (result.ok) return { ok: true, ...(result.value === undefined ? {} : { value: result.value }) }
  return { ok: false, error: `${result.error?.code ?? 'error'}: ${result.error?.message ?? ''}` }
}

/** Same as {@link hostRpc} but throws on failure (seeding). */
export async function hostRpcOk<T>(page: Page, method: string, request: Record<string, unknown>): Promise<T> {
  const result = await hostRpc<T>(page, method, request)
  if (!result.ok) throw new Error(`${method} failed: ${result.error ?? 'unknown'}`)
  return result.value as T
}

/** Words that must never appear in user-visible copy (BRIEFING item 20: the UI says "Gestor", never "Maestro"). */
export const FORBIDDEN_UI_WORDS = [/Maestro/u, /\bundefined\b/u, /\[object /u, /\bNaN\b/u] as const

/**
 * Visible text of the whole page body (all screens share the shell).
 * @param page - Live page.
 */
export async function bodyText(page: Page): Promise<string> {
  return page.locator('body').innerText()
}

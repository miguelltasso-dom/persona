/**
 * Small helpers for the E2E-V11 web specs: the tenant of the running app, the host remotes the UI itself uses (`/api/persona/<method>`), and a few readers of
 * the thread as the HOST stores it (typed lines: `taskWith`, `fanout`, `harness`, `handoff`, `steeredPersonaId`, `stopped`, `streaming`). The specs assert on the
 * host state AND on what the DOM shows, so a screen that "renders" but lies about the state is caught.
 */
import type { Page } from 'playwright'
import { hostRpcOk, readTenant, type Tenant } from './gauge-sb-ges.ts'

export interface V11Tenant extends Tenant {
  /** `#geral` of the personal project (`geral`). */
  readonly channelId: string
}

export async function v11Tenant(page: Page): Promise<V11Tenant> {
  const tenant = await readTenant(page)
  const raw = await page.evaluate(() => localStorage.getItem('persona.tenant.v1'))
  const channelId = (JSON.parse(raw ?? '{}') as { channelId?: string }).channelId ?? 'geral'
  return { ...tenant, channelId }
}

export interface PersonaRow { readonly id: string; readonly name: string; readonly title?: string }

export async function personasOf(page: Page, tenant: V11Tenant): Promise<PersonaRow[]> {
  return hostRpcOk<PersonaRow[]>(page, 'listPersonas', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
}

/** A message as the host lists it (only the fields the specs read). */
export interface HostMessage {
  readonly id: string
  readonly type: string
  readonly body: string
  readonly actorId: string
  readonly taskWith?: { readonly ticketId: string; readonly title: string; readonly lead: { readonly personaId: string; readonly name: string }; readonly with: ReadonlyArray<{ readonly personaId: string; readonly name: string }> }
  readonly fanout?: { readonly id: string; readonly source: string; readonly total: number; readonly index: number; readonly personaId: string; readonly kind: string; readonly nobody?: true }
  /** The typed line of a harness verb (Bolt 07/11): `board_card_move` says `started` | `held` and, for held, `reason`: `paused` | `silence` | `delivery_pending` | `no_owner`. Assert these fields, never the words. */
  readonly harness?: { readonly verb: string; readonly outcome: string; readonly reason?: string; readonly until?: string; readonly ticketId?: string; readonly title?: string; readonly persona?: { readonly personaId: string; readonly name: string } | string }
  readonly steeredPersonaId?: string
  readonly attachmentIds?: readonly string[]
  readonly stopped?: true
  readonly streaming?: true
}

/**
 * The whole thread, paged like the UI does (`limit: 200`). A bigger limit may make the host answer an EMPTY page (`listMessages` swallows its own errors), which
 * looked like "no typed line ever arrived" in the first V11 run — so never ask for more than a page and follow `nextSeq`.
 */
export async function channelMessages(page: Page, tenant: V11Tenant): Promise<HostMessage[]> {
  const all: HostMessage[] = []
  let afterSeq = 0
  for (let pages = 0; pages < 20; pages += 1) {
    const got = await hostRpcOk<{ events: HostMessage[]; nextSeq: number }>(page, 'listMessages', {
      workspaceId: tenant.workspaceId, projectId: tenant.projectId, streamKind: 'channel', ownerId: tenant.channelId, actorId: tenant.memberId, afterSeq, limit: 200,
    })
    all.push(...got.events)
    if (got.events.length < 200 || got.nextSeq <= afterSeq) break
    afterSeq = got.nextSeq
  }
  return all
}

let serial = 0
/** The person posts through the SAME remote the composer uses (needed for `fanout`, which the composer UI may not offer yet). */
export async function postAsPerson(page: Page, tenant: V11Tenant, body: string, extra: Record<string, unknown> = {}): Promise<string> {
  serial += 1
  const id = `v11-${Date.now().toString(36)}-${String(serial)}`
  await hostRpcOk(page, 'postMessage', {
    id, workspaceId: tenant.workspaceId, projectId: tenant.projectId, streamKind: 'channel', ownerId: tenant.channelId, body, actorId: tenant.memberId, subjectId: '', ...extra,
  })
  return id
}

/** Poll `read` until it returns a value (not `undefined`/`false`) or the deadline passes; returns the last value. */
export async function until<T>(page: Page, read: () => Promise<T | undefined | false>, timeoutMs: number, everyMs = 500): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value !== undefined && value !== false) return value
    if (Date.now() > deadline) return undefined
    await page.waitForTimeout(everyMs)
  }
}

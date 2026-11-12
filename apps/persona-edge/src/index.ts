/**
 * Persona edge Worker: routes workspace traffic to its Durable Object and verifies GitHub's HMAC.
 * WHO is calling is the hub's business (every request is signed, F2): the Worker holds no member list and no key. Attachments are served by the hub too, after
 * that proof: the Worker used to serve them to anyone.
 */

import type { Env } from './env.ts'
import { verifyGitHubSignature } from './hmac.ts'
import { internalTagOf } from './internal-tag.ts'
import { WorkspaceHub } from './workspace-hub.ts'

export { WorkspaceHub }
export type { Env } from './env.ts'

export default {
  /**
   * @param request - Incoming request.
   * @param env - Bindings.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'persona-edge' })
    const match = /^\/w\/([A-Za-z0-9_-]{1,64})(\/.*)?$/.exec(url.pathname)
    if (!match) return new Response('not found', { status: 404 })
    const workspaceId = match[1]
    const rest = match[2] || ''
    if (rest === '/webhooks/github' && request.method === 'POST') {
      return handleGitHub(request, env, workspaceId)
    }
    const stub = env.WORKSPACE_HUB.get(env.WORKSPACE_HUB.idFromName(workspaceId))
    return stub.fetch(request)
  },
}

/**
 * @param request - GitHub webhook.
 * @param env - Bindings.
 * @param workspaceId - Workspace.
 */
async function handleGitHub(request: Request, env: Env, workspaceId: string): Promise<Response> {
  const body = await request.text()
  const ok = await verifyGitHubSignature(
    env.GITHUB_WEBHOOK_SECRET,
    body,
    request.headers.get('x-hub-signature-256'),
  )
  if (!ok) return Response.json({ error: 'WEBHOOK_INVALID' }, { status: 401 })
  let payload: unknown = {}
  if (body.length > 0) {
    const parsed: unknown = JSON.parse(body)
    payload = parsed
  }
  const stub = env.WORKSPACE_HUB.get(env.WORKSPACE_HUB.idFromName(workspaceId))
  return stub.fetch(new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona-internal': await internalTagOf(env.GITHUB_WEBHOOK_SECRET) },
    body: JSON.stringify({
      deliveryId: request.headers.get('x-github-delivery') ?? '',
      receivedAt: new Date().toISOString(),
      ownerDeviceId: request.headers.get('x-persona-device') ?? '',
      payload,
    }),
  }))
}

/**
 * Persona edge Worker: routes workspace traffic to its Durable Object,
 * verifies GitHub HMAC, and stores shared attachments on R2.
 */

import { mayUpload } from '../../../packages/persona/persona-core/src/sync/policy.ts'
import type { SyncClassification } from '../../../packages/persona/persona-core/src/sync/types.ts'
import type { Env } from './env.ts'
import { verifyGitHubSignature } from './hmac.ts'
import { ensureEdgeSchema } from './schema.ts'
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
    await ensureEdgeSchema(env.DB)
    if (rest.startsWith('/blobs/')) return handleBlob(request, env, workspaceId, rest.slice('/blobs/'.length))
    if (rest === '/webhooks/github' && request.method === 'POST') {
      return handleGitHub(request, env, workspaceId)
    }
    const stub = env.WORKSPACE_HUB.get(env.WORKSPACE_HUB.idFromName(workspaceId))
    return stub.fetch(request)
  },
}

/**
 * @param request - PUT/GET attachment.
 * @param env - Bindings.
 * @param workspaceId - Workspace.
 * @param key - Object key.
 */
async function handleBlob(
  request: Request,
  env: Env,
  workspaceId: string,
  key: string,
): Promise<Response> {
  const objectKey = `${workspaceId}/${key}`
  if (request.method === 'GET') {
    const object = await env.BLOBS.get(objectKey)
    if (object === null) return new Response('not found', { status: 404 })
    return new Response(object.body, {
      headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    })
  }
  if (request.method === 'PUT') {
    const classification = (request.headers.get('x-classification') ?? 'channel') as SyncClassification
    const shared = request.headers.get('x-shared') === 'true'
    if (!mayUpload({
      workspaceId,
      streamId: request.headers.get('x-stream-id') ?? `blob:${key}`,
      seq: 1,
      idempotencyKey: `blob:${key}`,
      classification,
      at: new Date().toISOString(),
      payload: { clear: '' },
      ...(shared ? { shared: true } : {}),
    })) {
      return Response.json({ error: 'SYNC_REFUSED' }, { status: 403 })
    }
    await env.BLOBS.put(objectKey, await request.arrayBuffer(), {
      httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' },
    })
    return Response.json({ ok: true, key: objectKey })
  }
  return new Response('method', { status: 405 })
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
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deliveryId: request.headers.get('x-github-delivery') ?? '',
      receivedAt: new Date().toISOString(),
      ownerDeviceId: request.headers.get('x-persona-device') ?? '',
      payload,
    }),
  }))
}

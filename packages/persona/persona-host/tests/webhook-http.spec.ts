import { createServer } from 'node:http'
import { it } from './host-harness.ts'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { signGithubBody, githubWebhookHandler, WebhookReplayGuard } from '../src/webhook-http.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

const secret = 'hook-secret-test'
const issue = {
  action: 'opened',
  repository: { full_name: 'acme/app' },
  issue: {
    number: 3, title: 'Falha', body: 'x', user: { login: 'ana', type: 'User' },
    created_at: '2026-11-03T15:00:00.000Z', html_url: 'https://github.com/acme/app/issues/3',
  },
}

async function post(
  port: number,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/api/persona/webhooks/github?projectId=pp`, {
    method: 'POST',
    headers,
    body: new Uint8Array(body),
  })
  return { status: response.status, text: await response.text() }
}

it('accepts a signed payload, refuses bad HMAC and replay', async () => {
  process.env.PERSONA_GITHUB_WEBHOOK_SECRET = secret
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx)
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  const body = Buffer.from(JSON.stringify(issue))
  const handler = githubWebhookHandler({
    secretOf: () => Promise.resolve(secret),
    ingest: (projectId, event, action, repository, deliveryId, payload) => h.ingestGithubWebhook({
      workspaceId: 'ws', projectId, deliveryId, event, action, repository,
      payloadJson: JSON.stringify(payload), agentLogin: 'persona-bot',
    }),
    now: () => 1_700_000_000_000,
  }, new WebhookReplayGuard())
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  try {
    const bad = await post(port, {
      'x-hub-signature-256': 'sha256=00',
      'x-github-event': 'issues',
      'x-github-delivery': 'del-1',
    }, body)
    expect(bad.status).toBe(401)
    const ok = await post(port, {
      'x-hub-signature-256': signGithubBody(secret, body),
      'x-github-event': 'issues',
      'x-github-delivery': 'del-1',
    }, body)
    expect(ok.status).toBe(202)
    await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
    expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' }).length).toBeGreaterThan(0)
    const replay = await post(port, {
      'x-hub-signature-256': signGithubBody(secret, body),
      'x-github-event': 'issues',
      'x-github-delivery': 'del-1',
    }, body)
    expect(replay.status).toBe(200)
    expect(replay.text).toMatch(/duplicate/)
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
    delete process.env.PERSONA_GITHUB_WEBHOOK_SECRET
  }
})

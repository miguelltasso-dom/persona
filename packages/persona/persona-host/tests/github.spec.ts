import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { GithubSourceHost, detectGh } from '../src/github.ts'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

function host(): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  return new PersonaHost(ctx)
}

function seed(h: PersonaHost): { workspaceId: string; projectId: string } {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  return { workspaceId: 'ws', projectId: 'pp' }
}

const issue = {
  number: 12,
  title: 'Quebra no login',
  body: 'Falha em @persona-bot',
  user: { login: 'ana', type: 'User' },
  created_at: '2026-11-03T15:00:00.000Z',
  html_url: 'https://github.com/acme/app/issues/12',
}

it('detectGh is false when the binary is missing', () => {
  const cli = detectGh(() => ({ status: 1, stdout: '', stderr: 'not found' }))
  expect(cli.available).toBe(false)
  expect(() => cli.exec(['api', 'user'])).toThrow(/gh-unavailable/)
})

it('ingests an opened issue webhook into the engine and ignores a redelivery', () => {
  const h = host()
  const scope = seed(h)
  const payloadJson = JSON.stringify({ issue })
  const first = h.ingestGithubWebhook({
    ...scope, deliveryId: 'd1', event: 'issues', action: 'opened',
    repository: 'acme/app', payloadJson, agentLogin: 'persona-bot',
  })
  expect(first.kind).toBe('trigger')
  const again = h.ingestGithubWebhook({
    ...scope, deliveryId: 'd1', event: 'issues', action: 'opened',
    repository: 'acme/app', payloadJson, agentLogin: 'persona-bot',
  })
  expect(again.kind).toBe('duplicate')
  expect(h.listTasks(scope).length).toBeGreaterThan(0)
})

it('closes a GitHub thread from a merged PR webhook', () => {
  const h = host()
  const scope = seed(h)
  const result = h.ingestGithubWebhook({
    ...scope, deliveryId: 'd2', event: 'pull_request', action: 'closed',
    repository: 'acme/app',
    payloadJson: JSON.stringify({ pull_request: { ...issue, merged: true } }),
    agentLogin: 'persona-bot',
  })
  expect(result).toEqual({ kind: 'threadClosed', detail: 'merged' })
})

it('fetches an issue and posts a comment through the gh CLI adapter', () => {
  const h = host()
  const scope = seed(h)
  const calls: string[][] = []
  const cli = detectGh((args) => {
    if (args[0] === '--version') return { status: 0, stdout: 'gh 2', stderr: '' }
    calls.push([...args])
    if (args[1]?.includes('/issues/12') && !args[1].includes('comments')) {
      return { status: 0, stdout: JSON.stringify(issue), stderr: '' }
    }
    return { status: 0, stdout: '{"id":1}', stderr: '' }
  })
  const gh = new GithubSourceHost(cli, h.orchestration, h.proactivity)
  expect(cli.available).toBe(true)
  expect(gh.fetchIssue(scope.projectId, 'acme/app', 12, 'persona-bot').kind).toBe('trigger')
  expect(gh.comment('acme/app', 12, 'feito.')).toContain('1')
  expect(calls[0]?.[0]).toBe('api')
})

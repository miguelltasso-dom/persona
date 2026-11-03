import { expect, it } from 'vitest'
import {
  Engine,
  MemoryRepositories,
  commentTrigger,
  githubWebhookToIntake,
  isHumanLogin,
  issueTrigger,
  pullTrigger,
} from '../src/index.ts'
import type { Assessor, EngineOptions, Executor, GithubWebhook, OutboundMessage, Policy } from '../src/index.ts'

const agent = 'persona-bot'
const issue = {
  number: 12,
  title: 'Quebra no login',
  body: 'Falha em @persona-bot',
  user: { login: 'ana', type: 'User' },
  created_at: '2026-11-03T15:00:00Z',
  html_url: 'https://github.com/acme/app/issues/12',
}

it('marks a regular user as human and a [bot] login as not', () => {
  expect(isHumanLogin({ login: 'ana', type: 'User' })).toBe(true)
  expect(isHumanLogin({ login: 'dependabot[bot]' })).toBe(false)
})

it('builds a new Trigger when a comment is edited', () => {
  const created = commentTrigger({
    id: 9, body: 'primeiro', user: { login: 'ana' }, html_url: 'https://github.com/acme/app/issues/12#issuecomment-9',
    created_at: '2026-11-03T15:00:00Z',
  }, { number: 12, isPr: false }, 'conversation', agent)
  const edited = commentTrigger({
    id: 9, body: 'editado', user: { login: 'ana' }, html_url: 'https://github.com/acme/app/issues/12#issuecomment-9',
    created_at: '2026-11-03T15:00:00Z', updated_at: '2026-11-03T15:05:00Z',
  }, { number: 12, isPr: false }, 'conversation', agent)
  expect(edited.id).not.toBe(created.id)
  expect(issueTrigger(issue, agent).human).toBe(true)
  expect(pullTrigger({ ...issue, title: 'PR' }, agent).meta.isPr).toBe(true)
})

it('maps opened / closed webhooks and treats a redelivery as the same Trigger', () => {
  const opened: GithubWebhook = {
    deliveryId: 'd1', event: 'issues', action: 'opened', repository: 'acme/app', payload: { issue },
  }
  const first = githubWebhookToIntake(opened, agent)
  const again = githubWebhookToIntake(opened, agent)
  expect(first.kind).toBe('trigger')
  expect(again.kind).toBe('trigger')
  if (first.kind === 'trigger' && again.kind === 'trigger') expect(first.trigger.id).toBe(again.trigger.id)
  const closed = githubWebhookToIntake({
    deliveryId: 'd2', event: 'pull_request', action: 'closed', repository: 'acme/app',
    payload: { pull_request: { ...issue, merged: true } },
  }, agent)
  expect(closed).toMatchObject({ kind: 'threadClosed', outcome: 'merged', thread: { source: 'github', id: '12' } })
})

it('lets the engine treat a redelivered webhook Trigger as a duplicate', () => {
  const repo = new MemoryRepositories()
  const assessor: Assessor = { request: () => {}, release: () => {} }
  const outbox: OutboundMessage[] = []
  const queued: EngineOptions['outbox'] = {
    send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
    status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
    withdraw: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
  })
  const intake = githubWebhookToIntake({
    deliveryId: 'd1', event: 'issues', action: 'opened', repository: 'acme/app', payload: { issue },
  }, agent)
  if (intake.kind !== 'trigger') throw new Error('expected trigger')
  expect(engine.receive(intake.trigger)).toBe('stored')
  expect(engine.receive(intake.trigger)).toBe('duplicate')
})

/**
 * Worker-forwarded GitHub webhook → Trigger or threadClosed (no polling).
 */

import type { ThreadRef, Trigger } from '../../core/index.ts'
import { commentTrigger, issueTrigger, pullTrigger, type GithubComment, type GithubIssue, type GithubUser } from './trigger.ts'

export type GithubWebhookName = 'issues' | 'issue_comment' | 'pull_request' | 'pull_request_review' | 'pull_request_review_comment'

export interface GithubWebhook {
  deliveryId: string
  event: GithubWebhookName
  action: string
  repository: string
  payload: Record<string, unknown>
}

export type GithubIntake =
  | { kind: 'trigger'; trigger: Trigger }
  | { kind: 'threadClosed'; thread: ThreadRef; outcome: 'merged' | 'closed'; at: string }
  | { kind: 'ignore'; reason: string }

function asUser(value: unknown): GithubUser {
  if (value === null || value === undefined || typeof value !== 'object') return { login: 'ghost', type: 'User' }
  const row = value as { login?: unknown; type?: unknown }
  if (typeof row.login !== 'string') return { login: 'ghost', type: 'User' }
  return typeof row.type === 'string' ? { login: row.login, type: row.type } : { login: row.login }
}

function asIssue(value: unknown): GithubIssue | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.number !== 'number' || typeof row.title !== 'string' || typeof row.created_at !== 'string' || typeof row.html_url !== 'string') {
    return undefined
  }
  const issue: GithubIssue = {
    number: row.number,
    title: row.title,
    user: asUser(row.user),
    created_at: row.created_at,
    html_url: row.html_url,
  }
  if (typeof row.body === 'string') issue.body = row.body
  return issue
}

function asComment(value: unknown): GithubComment | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number') return undefined
  const comment: GithubComment = { id: row.id, user: asUser(row.user) }
  if (typeof row.body === 'string') comment.body = row.body
  if (typeof row.html_url === 'string') comment.html_url = row.html_url
  if (typeof row.created_at === 'string') comment.created_at = row.created_at
  if (typeof row.updated_at === 'string') comment.updated_at = row.updated_at
  if (typeof row.submitted_at === 'string') comment.submitted_at = row.submitted_at
  if (typeof row.state === 'string') comment.state = row.state
  return comment
}

/**
 * Map one forwarded webhook. An edited comment is a new Trigger (id includes
 * `updated_at`). A redelivered payload produces the same Trigger id.
 * @param hook - Worker envelope payload.
 * @param agent - Agent GitHub login.
 */
export function githubWebhookToIntake(hook: GithubWebhook, agent: string): GithubIntake {
  if (hook.event === 'issues' && hook.action === 'opened') {
    const issue = asIssue(hook.payload.issue)
    if (issue === undefined) return { kind: 'ignore', reason: 'bad-issue' }
    return { kind: 'trigger', trigger: issueTrigger(issue, agent) }
  }
  if (hook.event === 'pull_request' && hook.action === 'opened') {
    const pull = asIssue(hook.payload.pull_request)
    if (pull === undefined) return { kind: 'ignore', reason: 'bad-pull' }
    return { kind: 'trigger', trigger: pullTrigger(pull, agent) }
  }
  if (hook.event === 'pull_request' && (hook.action === 'closed' || hook.action === 'merged')) {
    const pull = asIssue(hook.payload.pull_request)
    if (pull === undefined) return { kind: 'ignore', reason: 'bad-pull' }
    const merged = hook.payload.pull_request !== null && typeof hook.payload.pull_request === 'object'
      && (hook.payload.pull_request as { merged?: unknown }).merged === true
    const at = pull.created_at
    return {
      kind: 'threadClosed',
      thread: { source: 'github', id: String(pull.number) },
      outcome: merged || hook.action === 'merged' ? 'merged' : 'closed',
      at,
    }
  }
  if (hook.event === 'issue_comment' || hook.event === 'pull_request_review_comment' || hook.event === 'pull_request_review') {
    if (hook.action !== 'created' && hook.action !== 'edited' && hook.action !== 'submitted') {
      return { kind: 'ignore', reason: 'action' }
    }
    const comment = asComment(hook.payload.comment ?? hook.payload.review)
    const issue = asIssue(hook.payload.issue ?? hook.payload.pull_request)
    if (comment === undefined || issue === undefined) return { kind: 'ignore', reason: 'bad-comment' }
    const kind = hook.event === 'pull_request_review' ? 'review'
      : hook.event === 'pull_request_review_comment' ? 'inline'
        : 'conversation'
    return {
      kind: 'trigger',
      trigger: commentTrigger(comment, { number: issue.number, isPr: hook.event !== 'issue_comment' }, kind, agent),
    }
  }
  return { kind: 'ignore', reason: 'event' }
}

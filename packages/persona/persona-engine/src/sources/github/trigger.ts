/**
 * Pure GitHub → Trigger mapping (E8). Ported from the Super-agent prototype
 * (MIT). No polling, no gh CLI.
 */

import { key, type ChannelRef, type Trigger } from '../../core/index.ts'

export const GITHUB_SOURCE = 'github'

export interface GithubUser {
  login: string
  type?: string
}

export interface GithubComment {
  id: number
  body?: string | null
  user: GithubUser
  html_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  submitted_at?: string | null
  state?: string | null
  commit_id?: string | null
  path?: string | null
  line?: number | null
  original_line?: number | null
  in_reply_to_id?: number | null
}

export interface GithubIssue {
  number: number
  title: string
  body?: string | null
  user: GithubUser
  created_at: string
  html_url: string
  pull_request?: { url: string } | null
}

export interface PullRef {
  number: number
  isPr: boolean
  url?: string
  prAuthor?: string
}

const sameName = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/**
 * @param user - GitHub account.
 */
export function isHumanLogin(user: GithubUser): boolean {
  return !/\[bot\]$/.test(user.login) && (user.type === undefined || user.type === 'User')
}

/**
 * @param number - Issue/PR number.
 * @param url - Optional comment URL.
 */
export function githubChannel(number: number, url?: string): ChannelRef {
  const address: Record<string, string> = { number: String(number) }
  if (url !== undefined) address.url = url
  return { source: GITHUB_SOURCE, thread: `github:${String(number)}`, address }
}

/**
 * @param url - Web or API URL.
 * @param repository - owner/name.
 */
export function githubAddress(url: string, repository: string): { number: number; pr: boolean; discussion?: number } | undefined {
  const address = /^https:\/\/(?:api\.github\.com\/repos|github\.com)\/([^/]+\/[^/]+)\/(issues|pulls?)\/(\d+)\/?(?:#discussion_r(\d+)|#[\w-]*)?$/i
  const match = address.exec(url)
  if (match === null || !sameName(match[1] ?? '', repository)) return undefined
  const discussion = match[4] === undefined ? undefined : Number(match[4])
  const found = { number: Number(match[3]), pr: (match[2] ?? '').toLowerCase() !== 'issues' }
  return discussion === undefined ? found : { ...found, discussion }
}

const mentions = (text: string, login: string): boolean =>
  new RegExp(`(?:^|[^a-zA-Z0-9_@])@${login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_-])`, 'i').test(text)

function author(user: GithubUser, agent: string): Pick<Trigger, 'actor' | 'human'> {
  return { actor: { source: GITHUB_SOURCE, id: user.login }, human: isHumanLogin(user) && !sameName(user.login, agent) }
}

/**
 * @param comment - Comment or review.
 * @param ref - Issue/PR.
 * @param kind - Conversation / inline / review.
 * @param agent - Agent login (never human).
 */
export function commentTrigger(
  comment: GithubComment,
  ref: PullRef,
  kind: 'conversation' | 'inline' | 'review',
  agent: string,
): Trigger {
  const at = comment.updated_at ?? comment.submitted_at ?? comment.created_at ?? '1970-01-01T00:00:00.000Z'
  const version = comment.updated_at ?? comment.submitted_at ?? ''
  const id = key('github-comment', comment.html_url ?? `github:${String(ref.number)}`, String(comment.id), version)
  const text = comment.body ?? ''
  const trigger: Trigger = {
    id,
    source: GITHUB_SOURCE,
    threads: [{ source: GITHUB_SOURCE, id: String(ref.number) }],
    ...author(comment.user, agent),
    at,
    text,
    channel: githubChannel(ref.number, comment.html_url ?? undefined),
    meta: { number: ref.number, isPr: ref.isPr, commentId: comment.id, kind },
  }
  if (mentions(text, agent)) trigger.addressed = 'mention'
  const url = comment.html_url ?? ref.url
  if (url !== undefined && url !== null) trigger.url = url
  if (ref.prAuthor !== undefined) trigger.meta.prAuthor = ref.prAuthor
  return trigger
}

/**
 * @param issue - Opened issue.
 * @param agent - Agent login.
 */
export function issueTrigger(issue: GithubIssue, agent: string): Trigger {
  const body = issue.body ?? ''
  const trigger: Trigger = {
    id: key('github-issue', String(issue.number)),
    source: GITHUB_SOURCE,
    threads: [{ source: GITHUB_SOURCE, id: String(issue.number) }],
    ...author(issue.user, agent),
    at: issue.created_at,
    text: `${issue.title}\n\n${body}`,
    channel: githubChannel(issue.number, issue.html_url),
    url: issue.html_url,
    meta: { number: issue.number, isPr: false, kind: 'issue' },
  }
  if (mentions(body, agent)) trigger.addressed = 'mention'
  return trigger
}

/**
 * @param pull - Opened pull request (same number space as issues).
 * @param agent - Agent login.
 */
export function pullTrigger(pull: GithubIssue, agent: string): Trigger {
  return { ...issueTrigger(pull, agent), meta: { number: pull.number, isPr: true, prAuthor: pull.user.login, kind: 'pull' } }
}

/**
 * @param ticket - Ticket that may follow GitHub threads.
 */
export function pullsOf(ticket: { follows?: readonly { thread: string; closed?: unknown }[] }, open = false): number[] {
  return (ticket.follows ?? [])
    .filter(item => !open || item.closed === undefined)
    .flatMap(item => item.thread.startsWith(`${GITHUB_SOURCE}:`) ? [Number(item.thread.slice(GITHUB_SOURCE.length + 1))] : [])
}

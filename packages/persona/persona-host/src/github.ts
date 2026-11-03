/**
 * GitHub Source IO: gh CLI when available, webhook → Forge intake → engine.
 */

import { spawnSync } from 'node:child_process'
import {
  githubWebhookToIntake,
  type GithubIntake,
  type GithubWebhook,
} from '@deepseek-ai/dsh-persona-engine'
import type { Orchestration } from './orchestration.ts'
import type { ProactivityHost } from './proactivity.ts'

/** Injectable `gh` process. */
export interface GithubCli {
  readonly available: boolean
  /**
   * @param args - `gh` argv after the binary.
   */
  exec(args: readonly string[]): string
}

/** Result of ingesting one webhook. */
export interface GithubIngestResult {
  readonly kind: 'trigger' | 'threadClosed' | 'ignore' | 'duplicate'
  readonly detail: string
}

/**
 * Probe and run `gh`. Missing binary is `available: false`, never thrown.
 */
export function detectGh(
  run: (args: readonly string[]) => { status: number | null; stdout: string; stderr: string } = spawnGh,
): GithubCli {
  const probe = run(['--version'])
  const available = probe.status === 0
  return {
    available,
    exec(args: readonly string[]): string {
      if (!available) throw new Error('gh-unavailable')
      const result = run(args)
      if (result.status !== 0) throw new Error(result.stderr === '' ? 'gh-failed' : result.stderr)
      return result.stdout
    },
  }
}

/**
 * Host-side GitHub Source. Webhook mapping stays in Forge; this talks to `gh` and the engine.
 */
export class GithubSourceHost {
  readonly cli: GithubCli
  readonly orchestration: Orchestration
  readonly proactivity: ProactivityHost

  /**
   * @param cli - `gh` or a test double.
   * @param orchestration - Engine.
   * @param proactivity - Event Source for initiative.
   */
  constructor(cli: GithubCli, orchestration: Orchestration, proactivity: ProactivityHost) {
    this.cli = cli
    this.orchestration = orchestration
    this.proactivity = proactivity
  }

  /**
   * Map a Worker-forwarded webhook and feed the project engine.
   * @param projectId - Tenant.
   * @param hook - Forge webhook.
   * @param agentLogin - Bot login (never human).
   */
  ingest(projectId: string, hook: GithubWebhook, agentLogin: string): GithubIngestResult {
    const intake = githubWebhookToIntake(hook, agentLogin)
    return this.apply(projectId, intake, hook)
  }

  /**
   * Pull one issue/PR through `gh api` and ingest it as an opened event.
   * @param projectId - Tenant.
   * @param repository - owner/name.
   * @param number - Issue or PR number.
   * @param agentLogin - Bot login.
   */
  fetchIssue(projectId: string, repository: string, number: number, agentLogin: string): GithubIngestResult {
    const raw = this.cli.exec(['api', `repos/${repository}/issues/${number}`])
    const payload = JSON.parse(raw) as Record<string, unknown>
    const isPr = payload.pull_request !== undefined && payload.pull_request !== null
    const hook: GithubWebhook = {
      deliveryId: `gh:${repository}:${number}`,
      event: isPr ? 'pull_request' : 'issues',
      action: 'opened',
      repository,
      payload: isPr ? { pull_request: payload } : { issue: payload },
    }
    return this.ingest(projectId, hook, agentLogin)
  }

  /**
   * Post a comment with `gh api`.
   * @param repository - owner/name.
   * @param number - Issue or PR number.
   * @param body - Comment markdown.
   */
  comment(repository: string, number: number, body: string): string {
    return this.cli.exec([
      'api', `repos/${repository}/issues/${number}/comments`, '-f', `body=${body}`,
    ])
  }

  private apply(projectId: string, intake: GithubIntake, hook: GithubWebhook): GithubIngestResult {
    if (intake.kind === 'ignore') return { kind: 'ignore', detail: intake.reason }
    const engine = this.orchestration.runtime(projectId).engine
    if (intake.kind === 'threadClosed') {
      engine.threadClosed(intake.thread, intake.outcome, intake.at)
      return { kind: 'threadClosed', detail: intake.outcome }
    }
    const received = engine.receive(intake.trigger)
    if (received === 'duplicate' || received === 'filtered') {
      return { kind: 'duplicate', detail: received }
    }
    this.orchestration.tick(projectId)
    if (hook.action === 'opened') {
      this.proactivity.fireEvent(projectId, hook.event === 'pull_request' ? 'PR aberto' : 'Issue aberta', hook.repository)
    }
    return { kind: 'trigger', detail: intake.trigger.id }
  }
}

function spawnGh(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('gh', [...args], { encoding: 'utf8', windowsHide: true })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error === undefined ? (result.stderr ?? '') : result.error.message,
  }
}

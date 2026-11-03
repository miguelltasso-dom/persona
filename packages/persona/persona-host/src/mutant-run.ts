/**
 * One mutant run per ticket (B7). A second start is queued (depth 1) or refused.
 * Replies stay on the subject captured at send — navigating away does not redirect.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'mutant_run'

/** Captured run + subject for one ticket. */
export interface MutantRun {
  readonly ticketId: string
  readonly subjectId: string
  readonly triggerId: string
  readonly status: 'running' | 'queued' | 'refused'
}

/**
 * Persist the captured subject/run so a reply cannot follow the current tab.
 */
export class MutantRunBook {
  /**
   * @param screens - Project docs.
   */
  constructor(readonly screens: ScreenRepos) {}

  /**
   * First claim starts. One queued follow-up. Further claims are refused.
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param subjectId - Subject at send time.
   * @param triggerId - Originating message.
   */
  claim(projectId: string, ticketId: string, subjectId: string, triggerId: string): MutantRun['status'] {
    const active = this.get(projectId, ticketId)
    if (active === undefined) {
      this.put(projectId, {
        ticketId, subjectId, triggerId, status: 'running',
      })
      return 'running'
    }
    if (active.status === 'running') {
      const queuedId = `${ticketId}:queued`
      if (this.screens.get<MutantRun>(projectId, KIND, queuedId) !== undefined) return 'refused'
      this.put(projectId, {
        ticketId, subjectId: active.subjectId, triggerId, status: 'queued',
      }, queuedId)
      return 'queued'
    }
    return 'refused'
  }

  /**
   * Subject captured when the run started (never the later tab).
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  subjectOf(projectId: string, ticketId: string): string | undefined {
    return this.get(projectId, ticketId)?.subjectId
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  get(projectId: string, ticketId: string): MutantRun | undefined {
    return this.screens.get<MutantRun>(projectId, KIND, ticketId)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  release(projectId: string, ticketId: string): MutantRun | undefined {
    const queued = this.screens.get<MutantRun>(projectId, KIND, `${ticketId}:queued`)
    this.screens.delete(projectId, KIND, ticketId)
    if (queued === undefined) return undefined
    this.screens.delete(projectId, KIND, `${ticketId}:queued`)
    this.put(projectId, { ...queued, status: 'running' })
    return { ...queued, status: 'running' }
  }

  private put(projectId: string, row: MutantRun, id: string = row.ticketId): void {
    this.screens.put(projectId, KIND, id, row)
  }
}

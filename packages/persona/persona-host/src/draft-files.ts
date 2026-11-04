/**
 * SW-7: how many files a persona already changed in the draft of its current task. The count needs a diff (git or a
 * folder comparison), which is too heavy for the synchronous “agora” strip, so the scheduler refreshes it while the
 * task runs and the strip only reads this cache. Documents live in `screen_doc` (no migration).
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'draft_files'

interface DraftFilesDoc {
  readonly count: number
  readonly at: string
}

/** Cache of changed-file counts per ticket. */
export class DraftFilesBook {
  readonly screens: ScreenRepos
  readonly now: () => string

  /**
   * @param screens - Doc store.
   * @param now - Instant factory.
   */
  constructor(screens: ScreenRepos, now: () => string) {
    this.screens = screens
    this.now = now
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket whose draft was measured.
   * @param count - Changed files (0 = nothing yet / no draft).
   */
  record(projectId: string, ticketId: string, count: number): void {
    this.screens.put(projectId, KIND, ticketId, { count, at: this.now() } satisfies DraftFilesDoc)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @returns The last measured count, or undefined when never measured.
   */
  get(projectId: string, ticketId: string): number | undefined {
    return this.screens.get<DraftFilesDoc>(projectId, KIND, ticketId)?.count
  }
}

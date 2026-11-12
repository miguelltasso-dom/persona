/**
 * Harvest 19b: one pass over every project's connected sources. The host timer calls this; a manual “Verificar agora”
 * may too. A pass never overlaps the next, never runs for a paused team or while the window reserve is active, and one
 * project's failure never stops the others.
 */

export interface ExternalPollDeps {
  /** Every project, with its workspace. */
  readonly projects: () => readonly { readonly workspaceId: string; readonly projectId: string }[]
  /** The Cofre owner of the workspace (the person whose connectors are read). */
  readonly ownerOf: (workspaceId: string) => string | undefined
  /** The team is paused for this project. */
  readonly paused: (projectId: string) => boolean
  /** The window reserve is active (95–100%): the team starts nothing, polling included. */
  readonly reserved: (projectId: string) => boolean
  /** Poll one project's sources with the owner's vault. */
  readonly poll: (projectId: string, personId: string) => Promise<unknown>
  /** One project's failure is reported, never thrown. */
  readonly onError: (error: unknown) => void
}

/** One pass at a time, however often the timer fires. */
export class ExternalPoller {
  #running = false

  /** @param deps - Projects, owner, gates and the poll itself. */
  constructor(private readonly deps: ExternalPollDeps) {}

  /**
   * Poll every eligible project once.
   * @returns How many projects were polled (skipped ones do not count).
   */
  async run(): Promise<number> {
    if (this.#running) return 0
    this.#running = true
    let polled = 0
    try {
      for (const { workspaceId, projectId } of this.deps.projects()) {
        if (this.deps.paused(projectId) || this.deps.reserved(projectId)) continue
        const owner = this.deps.ownerOf(workspaceId)
        if (owner === undefined) continue
        try {
          await this.deps.poll(projectId, owner)
          polled += 1
        } catch (error: unknown) {
          this.deps.onError(error)
        }
      }
    } finally {
      this.#running = false
    }
    return polled
  }
}

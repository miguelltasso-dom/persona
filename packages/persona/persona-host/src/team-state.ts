/**
 * "Pausar equipe" — durable. Before this, the button only flipped React state and `pauseTeam`
 * paused routines with no way back. The flag lives in `screen_doc` (no migration); the routines that
 * the pause switched off are remembered so "Retomar equipe" restores exactly those.
 */

import type { RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'team_runtime'
const ID = 'team'

/** Stored pause state of one project. */
export interface TeamStateDoc {
  readonly paused: boolean
  readonly pausedAt: string
  readonly resumedAt: string
  /** Routines this pause switched off (the user's own paused routines are not in it). */
  readonly pausedRoutineIds: readonly string[]
}

/** Read model for the UI. */
export interface TeamStateView {
  readonly paused: boolean
  readonly pausedAt: string
  readonly resumedAt: string
}

const FRESH: TeamStateDoc = { paused: false, pausedAt: '', resumedAt: '', pausedRoutineIds: [] }

/** Durable team pause. Clock is injected. */
export class TeamStateBook {
  readonly screens: ScreenRepos
  readonly routines: RoutineRepos
  readonly now: () => string

  /**
   * @param screens - Doc store.
   * @param routines - Calendar (paused with the team).
   * @param now - Instant factory.
   */
  constructor(screens: ScreenRepos, routines: RoutineRepos, now: () => string) {
    this.screens = screens
    this.routines = routines
    this.now = now
  }

  /**
   * @param projectId - Tenant.
   */
  get(projectId: string): TeamStateView {
    const doc = this.doc(projectId)
    return { paused: doc.paused, pausedAt: doc.pausedAt, resumedAt: doc.resumedAt }
  }

  /**
   * @param projectId - Tenant.
   */
  isPaused(projectId: string): boolean {
    return this.doc(projectId).paused
  }

  /**
   * Pause every routine and mark the team paused. Idempotent: a second pause keeps the first list.
   * @param projectId - Tenant.
   */
  pause(projectId: string): TeamStateView {
    const current = this.doc(projectId)
    if (current.paused) return this.get(projectId)
    const active = this.routines.list(projectId).filter(routine => !routine.paused).map(routine => routine.id)
    this.routines.pauseTeam(projectId)
    this.screens.put(projectId, KIND, ID, {
      paused: true, pausedAt: this.now(), resumedAt: current.resumedAt, pausedRoutineIds: active,
    } satisfies TeamStateDoc)
    return this.get(projectId)
  }

  /**
   * Resume the team and the routines the pause switched off. Occurrences missed meanwhile are not replayed.
   * @param projectId - Tenant.
   */
  resume(projectId: string): TeamStateView {
    const current = this.doc(projectId)
    if (!current.paused) return this.get(projectId)
    for (const id of current.pausedRoutineIds) {
      if (this.routines.get(id) !== undefined) this.routines.setPaused(id, false)
    }
    this.screens.put(projectId, KIND, ID, {
      paused: false, pausedAt: current.pausedAt, resumedAt: this.now(), pausedRoutineIds: [],
    } satisfies TeamStateDoc)
    return this.get(projectId)
  }

  private doc(projectId: string): TeamStateDoc {
    return this.screens.get<TeamStateDoc>(projectId, KIND, ID) ?? FRESH
  }
}

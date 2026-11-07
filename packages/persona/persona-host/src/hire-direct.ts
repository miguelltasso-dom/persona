/**
 * HT-6 (D-084): “Contratar direto” — the person lets one persona hire WITHOUT the card in Aprovações. A separate switch per persona,
 * OFF unless the person turned it on; it only means something for a persona who may hire at all (“Pode contratar”). One `screen_doc`
 * per persona, so it survives a restart and never touches the persona row.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'hire_direct'

/** The per-persona “Contratar direto” switch. */
export class HireDirect {
  private readonly screens: ScreenRepos

  /** @param screens - Doc store. */
  constructor(screens: ScreenRepos) {
    this.screens = screens
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - The recruiter.
   * @returns Whether the person allowed her to hire without a card (false unless she did).
   */
  get(projectId: string, personaId: string): boolean {
    return this.screens.get<{ on: boolean }>(projectId, KIND, personaId)?.on === true
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - The recruiter.
   * @param on - The person's choice.
   */
  set(projectId: string, personaId: string, on: boolean): void {
    this.screens.put(projectId, KIND, personaId, { on })
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - The recruiter.
   * @param day - `YYYY-MM-DD` on the host's clock.
   * @returns How many people she hired on her own that day.
   */
  hiredOn(projectId: string, personaId: string, day: string): number {
    return this.screens.get<{ count: number }>(projectId, 'hire_direct_log', `${personaId}:${day}`)?.count ?? 0
  }

  /**
   * Remember one direct hire (so the daily limit is counted on ONE clock, the one that reads it).
   * @param projectId - Tenant.
   * @param personaId - The recruiter.
   * @param day - `YYYY-MM-DD` on the host's clock.
   */
  noteHire(projectId: string, personaId: string, day: string): void {
    this.screens.put(projectId, 'hire_direct_log', `${personaId}:${day}`, { count: this.hiredOn(projectId, personaId, day) + 1 })
  }
}

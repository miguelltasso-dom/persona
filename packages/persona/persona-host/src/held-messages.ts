/**
 * A person's work request never vanishes silently (Tally, UX proativa). When the pre-router holds a request back — the
 * Coordenação is inside its silence window, or the project has no free slot — the host answers at once with an honest
 * line and keeps the request here; the scheduler re-evaluates it as soon as the gate opens. Documents live in
 * `screen_doc` (no migration).
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'held_message'

/** One request waiting for the gate to open. */
export interface HeldMessage {
  readonly eventId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly responderId: string
  /** Persona the message was meant for, when it waits for that persona to be resumed (`/retomar`). */
  readonly speakerId?: string
  readonly at: string
}

/** Durable list of held requests. */
export class HeldMessages {
  readonly screens: ScreenRepos

  /**
   * @param screens - Doc store.
   */
  constructor(screens: ScreenRepos) {
    this.screens = screens
  }

  /**
   * @param projectId - Tenant.
   * @param row - The held request.
   */
  hold(projectId: string, row: HeldMessage): void {
    this.screens.put(projectId, KIND, row.eventId, row)
  }

  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): HeldMessage[] {
    return this.screens.list<HeldMessage>(projectId, KIND).sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId))
  }

  /**
   * @param projectId - Tenant.
   * @param eventId - Request that was released.
   */
  drop(projectId: string, eventId: string): void {
    this.screens.delete(projectId, KIND, eventId)
  }
}

/**
 * The line the person sees right away.
 * @param name - Persona that would have answered.
 * @param silenceEnd - `HH:MM` when the Coordenação is in its silence window, else empty (no free slot / budget).
 */
export function heldLine(name: string, silenceEnd: string): string {
  if (silenceEnd !== '') return `Recebi. ${name} está em horário de silêncio até ${silenceEnd}; começo assim que acabar.`
  return 'Recebi. A equipe está ocupada; começo assim que liberar.'
}

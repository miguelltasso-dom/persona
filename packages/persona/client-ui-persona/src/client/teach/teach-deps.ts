/**
 * "Ensinar a persona" (W2-10) — the narrow slice of the live store and of the host Remote the flow actually uses.
 * The real `PersonaLiveStore` / `PersonaRemoteClient` satisfy these; tests pass small honest fakes without casts.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../remote/persona-live-store.ts'

/** Roster + tenant scope (the only parts of the live snapshot the flow reads). */
export type TeachLiveSnapshot = Pick<PersonaLiveSnapshot, 'team' | 'tenant'>

export interface TeachLive {
  readonly observable: HostObservable<TeachLiveSnapshot>
  pauseTeachSession: PersonaLiveStore['pauseTeachSession']
  resumeTeachSession: PersonaLiveStore['resumeTeachSession']
  stopTeachSession: PersonaLiveStore['stopTeachSession']
  getTeachDraft: PersonaLiveStore['getTeachDraft']
  submitTeachDraft: PersonaLiveStore['submitTeachDraft']
}

/** Taught-skill calls of the host Remote (activate, take back, share). */
export type TeachRemote = Pick<PersonaRemoteClient, 'activateTaughtSkill' | 'rollbackTaughtSkill' | 'publishTaughtSkill'>

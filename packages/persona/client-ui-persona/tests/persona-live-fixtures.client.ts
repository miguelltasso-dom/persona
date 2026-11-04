import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'

/** Gestor fields required on every {@link PersonaLiveSnapshot} in tests. */
export const PERSONA_LIVE_GESTOR_FIELDS: Pick<PersonaLiveSnapshot, 'gestorPlansById' | 'arrivingHostPersonaIds'> = {
  gestorPlansById: {},
  arrivingHostPersonaIds: [],
}

/** No-op gestor RPCs for {@link PersonaLiveStore} test harnesses. */
export const personaLiveStoreGestorStub = {
  approveGestorPlan: async (): Promise<void> => {},
  rejectGestorPlan: async (): Promise<void> => {},
} as const

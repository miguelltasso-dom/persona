import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

/** Gestor fields required on every {@link PersonaLiveSnapshot} in tests. */
export const PERSONA_LIVE_GESTOR_FIELDS: Pick<
  PersonaLiveSnapshot,
  'gestorPlansById' | 'gestorPlanAdjustingIds' | 'channelComposerHints' | 'arrivingHostPersonaIds'
> = {
  gestorPlansById: {},
  gestorPlanAdjustingIds: {},
  channelComposerHints: { responderAutonomy: 'propose', quotaBlocked: false },
  arrivingHostPersonaIds: [],
}

/** No-op gestor RPCs for {@link PersonaLiveStore} test harnesses. */
export const personaLiveStoreGestorStub = {
  approveGestorPlan: async (): Promise<void> => {},
  rejectGestorPlan: async (): Promise<void> => {},
} as const

/** Teardown hook on {@link PersonaLiveStore} for jsdom harnesses. */
export const personaLiveStoreLifecycleStub: Pick<PersonaLiveStore, 'dispose'> = {
  dispose: () => {},
}

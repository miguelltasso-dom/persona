# Onboarding Remote (Prism consumer · Anvil provider)

**Status:** `completeOnboarding` pending on `persona-host` (Anvil). Until then Prism calls `createMember` + `createPersona` via `PersonaLiveStore.commitOnboardingRoster`.

## Source of truth

| Signal | Owner | Rule |
|--------|--------|------|
| Overlay visible | `getOnboarding().firstUse` | Host wins on bootstrap, every `PersonaLiveStore.refresh`, and after dev seed `completeOnboarding` |
| `localStorage` `persona.onboarding.complete.v1` | Prism | First-paint optimistic only; re-synced when host reports `firstUse: false` |

## `getOnboarding` (exists)

Request: `ProjectScopeRequest` (`workspaceId`, `projectId`).

Response: `OnboardingState` — `hasPersonalProject`, `firstUse`, `personalProjectId`.

## `completeOnboarding` (planned)

Single write when the user finishes the 5-step overlay. Replaces ad-hoc roster RPCs from the client.

```typescript
interface CompleteOnboardingRequest extends ProjectScopeRequest {
  readonly memberId: string
  readonly displayName: string
  readonly roster: readonly { readonly name: string; readonly role: string }[]
  /** Future: vault text, harness ids, template id */
}

interface CompleteOnboardingResult {
  readonly firstUse: false
}
```

**Postconditions (Anvil):** owner display name updated; personas created per roster; `getOnboarding` returns `firstUse: false`; optional welcome message on `#geral`.

**Prism:** `PersonaLiveStore.completeOnboarding()` calls this when present on `ctx.remote.persona`; otherwise falls back to `commitOnboardingRoster`. No personas are created on bootstrap; `getOnboarding().firstUse` opens the overlay. Dev-only seed: `PERSONA_DEV_SEED=1` (harness) sets `persona.devSeed.v1` in localStorage — never shipped enabled.

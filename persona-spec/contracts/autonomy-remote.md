# Autonomy Remote (PRO-4 data)

**Owner:** Prism (UI store) · host RPCs on `persona` Remote (`getAutonomy`, `setAutonomy`).

Editor tiers map to host `AutonomyMode`:

| UI (`PersonaDraft.autonomyLevel`) | Host `mode` |
|---|---|
| `on-request` | `asked` |
| `propose` | `propose` |
| `act-within-limits` | `act` |

`PersonaLiveStore.setPersonaAutonomyLevel(personaId, level)` loads the current row via `getAutonomy`, patches `mode` only (budgets/silence preserved), then `setAutonomy`.

Hire / new persona: profile `HIRE_PERSONA_PROFILE_ID` renders `ConnectedPersonaEditor`; optional `draftPersona` when host runners are available. Full `createPersona` on save is a follow-up (Anvil stable inject).

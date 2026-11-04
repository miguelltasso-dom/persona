# Persona editor / hire (Prism ↔ host)

**Prism** wires `ConnectedPersonaEditor` and `RemoteProfilePanel` (data only). **Muse** owns `persona-editor/*`, `hire/*`, `profile/PersonaProfilePage*` presentation.

## Hire (`HIRE_PERSONA_PROFILE_ID`)

| Step | Remote / state |
| --- | --- |
| Open | Shell `profilePersonaId = __persona_new__` (sidebar Contratar). |
| Initial draft | Empty `PersonaDraft`; `avatarRef` = first gallery animal not used on `listPersonas`. |
| Builder | `draftPersona({ workspaceId, projectId, description, createdBy })`; fallback `draftPersonaFromDescription` (host) on failure. |
| Runners | `listConnections` → `RunnerOptionUi[]`; `phase: checking` must not show disconnected. |
| Save | `createPersona` from `draftToCreatePersonaRequest` (runner `dsh` vs `cli` from harness id). |

## Edit existing

| Step | Behavior |
| --- | --- |
| Profile hero **Edit** | Shell `openPersonaEditor(personaId)` → `profileEditorOpen: true`. |
| Load | `listPersonas` + `getAutonomy`; `PersonaEditor` `mode='edit'`. |
| Save | `setPersonaAutonomyLevel` (host); full persona update RPC when Anvil exposes it. |

## Profile hero **Message**

`openPersonaDm(personaId)` → `selectPanel('directMessages')` + live `openPersonaDm`.

Project labels on profile overview: `live.projects[].name` via `resolveProfileProjectNames` (not raw ids).

# Insights locais (sem telemetria externa)

Engine: `persona-engine/src/insights.ts`. Só dobra eventos que o host já persiste. Nada sai da máquina.

## Funil de ativação

`computeActivationFunnel(events)`:

| campo | evento |
| --- | --- |
| `onboarded` | `onboarded` |
| `firstUsefulReply` | `useful_reply` |
| `firstTaskDone` | `task_done` |
| `returnedIn7Days` | 2º `session` entre 1 e 7 dias após o primeiro |
| `stage` | `empty` → `onboarding` → `first_reply` → `first_task` → `returned` |

## Impacto por persona

`computePersonaImpact(events, personaId)` / `listPersonaImpact`:

- `tasksCompleted` — `task_done`
- `timeToReadyMs` — média de `durationMs` das concluídas
- `proposalsAccepted` — `proposal_accepted`
- `hoursSavedEstimate` — `tasksCompleted * 0.5` (rótulo fixo `hoursSavedLabel: "estimativa"`)

## Remote (Anvil) — Lumen lê

`getActivationFunnel({ projectId })` → `ActivationFunnel`
`getPersonaImpact({ projectId, personaId })` → `PersonaImpact`
`listPersonaImpact({ projectId })` → `PersonaImpact[]`

ACL: só o dono do workspace. Sem export para nuvem, sem analytics de terceiro.

# Contrato — a equipe age sozinha (IV-1, PROACTIVITY §5)

Dono: **Bolt** (`proactivity-scheduler.ts`, `rrule-lite.ts`, `team-state.ts`, `proactivity-wire.ts`). Consumidores: Visão geral (Prism/Lumen), Rotinas (Ember).

## Remotes

| Remote | Efeito | Guarda |
|---|---|---|
| `getProactivityStatus({workspaceId, projectId})` → `ProactivityStatusView` | `{ state: 'working'\|'resting'\|'paused'\|'no_engine'\|'error', running, cycleMs, lastCycleAt, nextCycleAt, openGoals, queued, lastActions[{at,kind,detail}] }`. `resting` = nada a fazer, **zero chamadas de IA** (estado legítimo, não erro). | `requireProject` |
| `runProactivityCycle(...)` → `ProactivityStatusView` | “Verificar agora”: um ciclo na hora. | `requireWrite` |
| `getTeamState(...)` → `{ paused, pausedAt, resumedAt }` | Pausar equipe sobrevive a recarregar. | `requireProject` |
| `pauseTeam(...)` → `true` | Pausa a equipe e as rotinas ativas; cancela execuções pendentes. | `requireProject` (igual a antes) |
| `resumeTeam(...)` → `TeamStateView` | Religa as rotinas que a pausa desligou; o que passou **não** reexecuta. | `requireWrite` |

## Eventos visíveis (`watchdog_audit.kind`, todos `sched:*`)
`team_paused`, `team_resumed`, `no_engine`, `engine_ready` (uma linha por mudança de estado) · `routine_run`, `routine_skipped`, `routine_bad_rule`, `routine_lost`, `not_delivered` · `initiative_act`, `initiative_skipped` · `assigned`, `stalled`, `retry`, `retry_exhausted`, `planned` · `budget`, `silence`, `error`. Aparecem em “Enquanto você estava fora” (hoje como `kind: 'watchdog'`).

## Rotina própria (IV-9 grava)
`screen_doc` kind `routine_spec`, id = id da rotina: `{ personaId?, prompt? }`. Sem doc: executor = `routine_charge.executorPersonaId` (Quem cuida de quem) e instrução = “Faça a rotina “<nome>” agora e relate com evidência.”. Sem executor: a ocorrência é pulada **com linha** “não tem responsável”. `requiresApproval` ⇒ não roda sozinha.

## Regras de comportamento
Sem objetivo aberto e nada vencido: 0 chamadas. Silêncio, `/pausar`, “só quando pedido”, orçamento de execuções/tokens do dia (`autonomy`) e motor desconectado seguram o início de trabalho novo — cada recusa é uma linha. Ticket sem executor só é retomado depois de 30 s parado (para não rodar duas vezes o que acabou de nascer) e no máximo 3 vezes por Assignment.

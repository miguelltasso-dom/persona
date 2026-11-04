# Bolt — relato (builder de backend novo; P0 "Integração viva")

## 04/11 16:55 — IV-1 FECHADO: a equipe age sozinha

**Problema (Atlas):** `tickProactivity`, `tickInitiativeBatch` e `claimRoutines` não tinham chamador fora dos testes; ninguém transformava o `rrule` de uma Rotina em ocorrências (`routine_run`); um Ticket com Assignment rodando sem executor (vaga cheia, reinício) nunca voltava; fila vazia nunca planejava.

**O que mudou (arquivos)**
- NOVO `persona-host/src/proactivity-scheduler.ts` — agendador do host (ciclo do Vigia, PROACTIVITY §5). Relógio e timers injetados. Por ciclo, do mais barato ao mais caro: Pausar equipe → `Orchestration.tick` → leases vencidos liberados → ocorrências do rrule materializadas → rotinas reivindicadas e executadas (iniciativa diária só no horário de trabalho da persona; rotina própria vira Ticket da persona) → `vigiaTick` decide quem está ocioso com fila → Ticket sem executor é retomado → falhas com backoff 2/10/30 min → fila vazia + objetivo aberto ⇒ Coordenação planeja; sem objetivo ⇒ descansa com **0 chamadas de IA**. Respeita orçamento de execuções/tokens por persona/dia (autonomia), janela de silêncio, `/pausar`, “só quando pedido”, motor desconectado. Todo estado vira linha em `watchdog_audit` (aparece em “Enquanto você estava fora”) e só uma vez por mudança de estado.
- NOVO `persona-host/src/rrule-lite.ts` — `FREQ=HOURLY|DAILY|WEEKLY|MONTHLY` + `INTERVAL/BYHOUR/BYMINUTE/BYDAY/BYMONTHDAY` no fuso da rotina (DST ok), `describeRrule` (“De segunda a sexta, às 9h”), `buildRrule(preset)`.
- NOVO `persona-host/src/team-state.ts` — “Pausar equipe” **persistente** (`screen_doc team_runtime`); Retomar restaura só as rotinas que a pausa desligou e não reexecuta o que passou.
- NOVO `persona-host/src/proactivity-wire.ts` — liga o agendador ao host real. Pedido automático entra pela mesma porta da mensagem da pessoa (Ticket real, orçamento, runner, ledger, linhas no #geral); se o pré-roteador não o transformar em Ticket, a recusa é auditada com o motivo (nunca some calado).
- `persona-host/src/orchestration.ts` (Anvil; aditivo): `driveTicket()` público; `only?` em `settleTask/runLaunched` (executa só aquele Ticket, como a persona dele); `triggerOf` dá a pedidos `routine:`/`team:` o próprio Thread (senão viravam “continuação” do Ticket aberto no #geral — bug que a prova no processo real pegou).
- `persona-host/src/index.ts` (Anvil; aditivo): campo `proactivityCycleMs` (default 30 s; `0` desliga; nunca arma sob Vitest), `proactivityScheduler.start()` no boot, `dispose()` no desligar; `pauseTeam` usa `teamState.pause`; **Remotes novos** `resumeTeam`, `getTeamState`, `getProactivityStatus`, `runProactivityCycle`.
- `persona-host/src/types.ts`: reexporta `ProactivityStatusView`, `SchedulerActionView`, `SchedulerEventKind`, `SchedulerState`, `TeamStateView`.
- `persona-store/src/routines/repos.ts` (aditivo): `RoutineRepos.update()` / `delete()` (base do IV-9).
- Contrato: `persona-spec/contracts/proactivity-scheduler.md`.

**Provas (comandos e resultado)**
- `pnpm exec vitest run` — `proactivity-scheduler.spec.ts` (27: relógio falso; tarefa parada ⇒ retomada em ≤ 1 ciclo; rotina vencida roda 1×; sem objetivo ⇒ 0 chamadas; pausa, silêncio, orçamento, sem motor, lease morto, regra inválida, backoff, timers), `proactivity-scheduler.host.spec.ts` (8: no host real com runner scriptado — Ticket retomado termina no #geral; rotina vira Ticket da persona **mesmo com outro Ticket aberto no #geral**; objetivo ⇒ 1 Ticket de planejamento; 20 ciclos ⇒ 0 resolves de runner; Pausar/Retomar), `proactivity-remotes.contract.spec.ts` (5: Remotes + ACL guest/persona), `rrule-lite.spec.ts` (18), store `routines.spec.ts` (12): **tudo verde** (58 nos quatro do host).
- `check-pkg persona-host` OK, `persona-store` OK.
- **Processo real:** `PERSONA_SCRIPTED=1 node --import tsx/esm packages/persona/persona-host/scripts/proactivity-live.ts` — host de verdade (sem Vitest), SQLite em pasta temporária, timers reais, ciclo 500 ms, runner scriptado: descanso 0 resolves ✔ · Ticket sem executor retomado e entregue ✔ · rotina horária vencida vira Ticket da Iris 1× ✔ · objetivo aberto ⇒ Bento planeja ✔ · Pausar ⇒ 0 novos / Retomar ⇒ volta ✔ — **PASS** (log em `.maestri/tmp/bolt-live.log`).

**Limitações / achados (não escondo)**
1. **`catchUp: 'skip'` nunca roda** (store `pickDue` devolve `[]` mesmo para a ocorrência pontual) — pré-existente; “run_once” é o que funciona. Dono: Anvil.
2. **Tentar de novo (retry) e responder a pergunta (answerAttention) não retomam o worker**: `runLaunched` não roda Ticket que já tem `coord-<id>-done` (id por Ticket, não por Assignment) e `deliver('launch:<assignment>')` é idempotente; o texto da resposta nunca vai ao worker. O agendador cobre vaga cheia/reinício/Assignment novo sem linha “done”, **não** esses dois. Pedido ao Anvil: chave de idempotência por Assignment + entregar `ticket.undelivered` ao worker. Candidato a IV-11.
3. Mensagens automáticas chegam no #geral com autor `routine:<id>` / `team:plan` / `team:initiative`; a UI (Flint/Ember) precisa mostrar como “Rotina · nome” / “Equipe” (hoje autor desconhecido).
4. Rotina com `requiresApproval` (Quem cuida de quem) **não roda sozinha** — fica auditada “precisa da sua aprovação”; o fluxo de aprovar-e-rodar é trabalho futuro.
5. Executor da rotina própria = `routine_spec` (doc) ou `routine_charge.executorPersonaId`; instrução = `spec.prompt` ou o nome da rotina. IV-9 grava o doc.
6. Typert/lib dos Remotes novos precisa de regeneração no build do Keel.
7. Em “segundo plano”: o agendador vive no processo do host; roda enquanto o host viver (janela fechada com bandeja/always-on = host vivo). Não alterei o desktop.

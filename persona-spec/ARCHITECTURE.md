# Arquitetura implementada — Persona (core + engine)

Para Atlas/Miguel e builders novos. Nomes reais. Sem identidade de persona em código (D-043).

## Pacotes (território Forge)

| Pacote | O que é |
|---|---|
| `packages/persona/persona-core` | IDs, entidades, `can()`, `compileContext`/`recall`, Inline&Spill + Chain of Recall, skills, handoff, aging, sync, import |
| `packages/persona/persona-engine` | Super-agent: Trigger → Thread → Eval → Decision → Ticket+Mandate → Assignment; stages; outbox; views; cards; `persona_read` |

Anvil implementa `Repositories` em SQLite e o Remote. Rivet implementa `Runner`. Prism/Lumen consomem os DTOs de `views`.

## Fluxo de um turno

1. **Intake.** `Engine.receive(trigger)` — Trigger imutável; `duplicate` se o `id` já existe.
2. **Thread.** `threadKey({ source, id })`. No máximo uma `Evaluation` por Thread (`thread.evaluating`). Novos Triggers vão a `pending`.
3. **Eval.** `Engine.evaluateDue()` → `Policy.gate` (ACL/admission) + `Assessor.request(candidate)`.
4. **Decision.** `Engine.decide(triggerId, outcome)`. `accept` cria Ticket + Mandate (`Tickets` + `prepareTicket`). `ignore`/`stop`/`unavailable` só registram Disposition.
5. **Pass-through.** Follow-up de pessoa num Thread com Ticket vivo: `followupOwners` + Input no Ticket, **sem** nova Eval.
6. **Assignment.** `Executor.start` via `EffectQueue` **depois** de `Repositories.afterCommit`. `assignmentStarted` / `inputsDelivered` / `inputsRead`.
7. **Worker.** `Runner.ensureSession(workerSessionId(ticketId), cwd, title, 'worker')` + `deliver`. Coordinator nunca recebe `bash` (`toolsForRole`).
8. **Report / Attention.** `Engine.report` → `ticketStage` → coluna P5 (`kanbanColumn`). `overview().person` = "Precisa de você".
9. **Reply.** `Outbox.send` só após commit. A persona de Coordenação é quem responde no canal (host).
10. **Contexto do modelo.** `compileContext` + `materializeSkills` no manifesto do run. Corpo longo: `capped` / `spillPointer` (`persona-spill:`) + `personaRecall` / `recallChain` (autorização por salto). Worker: `personaRead(..., ticketId)` + `readable()`.

## Onde mora cada invariante

| Invariante | Onde |
|---|---|
| ACL | `persona-core` `can(actor, action, resource)`. Views: `ViewHost.canRead*`. Contexto: `authorize` em `compileContext`/`recall`/`recallChain`. |
| Mandate imutável | `Ticket.mandate` gravado no accept; `policyChanged` não reescreve. |
| Outbox após commit | `EffectQueue` + `Repositories.afterCommit`. Rollback descarta o enqueue. |
| D-043 (sem nomes de persona em código) | Prompts em `PROMPT_TEMPLATES` usam `{{persona_name}}`. Ferramentas: prefixo `persona_`. |
| Tenant = projeto | `Repositories.projectId` (D-038). `compileContext` recusa `projectId`/`agentId` alheios. |
| 1 Eval / Thread | `Thread.evaluating` exclusivo; debounce em `pending`. |
| Skill DM/candidata | `skillAdmitted` / `materializeSkills` — nunca vazam para outra audiência. |
| Saudável não ocupa espaço | `overview().person` e `.problems` vazios. |
| Puxada | `afterAssignmentSettled` / `nextEligible` — prioridade, deps, `canAssign`, concorrência, orçamento. |
| Objetivos | `emptyQueueDecision`: fila+objetivo=`work`; vazia+objetivo=`plan`; vazia sem objetivo=`rest` (`spendsModel` false). Port `GoalBoard` → host liga `dsh-goal`. |
| Vigia | `vigiaTick` (relógio injetável): ociosa+fila, sem progresso, loop, espera colega, falha de runner → ação + `VigiaAudit`. |
| Autonomia / orçamento | `applyAutonomy` (`on_request`\|`propose`\|`act`; especulativo=`observe`); `mayPropose` / silêncio / taxa de aceitação. |

## Testes e boot gate

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
pnpm exec tsx scripts/generate-typert.ts
```

Cenários obrigatórios: `persona-core/tests/mandatory/*.spec.ts` (domínio) e `persona-engine/tests/mandatory/*.spec.ts` (engine). Contrato SQLite: `persona-engine/tests/contract` (Anvil liga o backend). Microbench de contexto: `runContextBench` → `persona-spec/reports/bench-context.md`.

# Contrato — Gestor de equipe (GES-1..GES-3)

Dono do domínio/engine: **Forge** (`persona-core` / `persona-engine`).
Persistência + Remote: **Anvil** (`team_manager_*`, `SystemRoleView = team_manager`).
Ferramentas MCP: **Rivet** (`gestor_*`).
UI (selo **Gestor**, nunca "Maestro"): **Prism** + **Lumen**.

## Função

`SystemRole` literal: `team_manager` (`TEAM_MANAGER_ROLE`). Template: Coordenação também é Gestor. Quantas personas o usuário quiser.

`withDefaultGestor(roles)` — se `coordination` está na lista e `team_manager` não, acrescenta Gestor. `assignSystemRole(..., 'coordination')` usa isso; o coordenador anterior perde só Coordenação (Gestor fica). Onboarding (`personaSpecToOnboardingWire` / parse) e `personaPropose` também. Host `createPersona` / `setPersonaSystemRoles` importam a mesma função do core (não copiar).

## Ações

| Ação | Função | Recusa |
|---|---|---|
| Contratar | `gestorHire` / `assertGestorHire` | acesso acima do Gestor; `canGrantGestor: false` + `team_manager`; `maxPersonas`; orçamento; `always_ask` sem aceite |
| Alocar | `gestorAllocate` | projeto/canal/setor/`reportsTo` fora do mandato |
| Reorganizar | `gestorReorganize` | pausa ociosa sem aviso; autonomia acima do teto |
| Montar equipe | `assembleTeamForGoal` | frase sem objetivo |

`decideGestorAction`: `always_ask` → `ask`; aceite → `apply` **com `plan.status = applied`**. `auto_and_notify` → `notify` + plano aplicado. `applyGestorPlan` marca o plano aplicado; recusado (`rejected`) lança `INVALID_GESTOR`. `rejectGestorPlan` recusa; plano já `applied` lança. `gestorDecisionRows(decision)` = o que o host grava num write (plan+audit no apply/notify; só plan no ask). Plano nunca aplica sozinho. `runGestorAllocate` / `runGestorReorganize` / `runGestorAssemble` passam pelo mesmo gate. `runAssembleTeam` é o núcleo sem gate (só testes / preview). Ao propor, o host posta `emitGestorPropose({ plan, threadId, at })` — corpo com `[[gestor-plan:id]]` + linha `recordTurnActivity` (waiting). `tool` = `plan.action` (`hire`/`assemble` → kind hire; `allocate`/`reorganize` → command). `proposeGestorChannelBody` / `attachGestorPlanMarker` são o núcleo. Aceite GES-6 domínio: `measureGestorAcceptance` (3/3). Alias `measureGestorV1` = a mesma função (engine). O host **não** expõe `@Remote measureGestorV1` — Probe chama o engine. Fechamento v1: `measureV1Close` junta GES-6 + PRO-6 + OPT-8. Host: `withDefaultGestor` em `createPersona` / `setPersonaSystemRoles` / onboarding; `getPersonaCard.gestorAuditReason`; `emitGestorPropose` no `#geral` (`assemble`→hire, `allocate`/`reorganize`→command).

## Vários Gestores (GES-3)

Escopo por setor/projeto (`gestorInScope` / `gestorScopeKey`). Mesmo escopo: o primeiro propõe; o segundo `commentGestorPlan` (`status: commented`, `commentOnId`). Empate: humano `resolveGestorTie` — escolhido vence; os outros no escopo = `rejected`. `gestorConflictDecision` / `runGestor*` devolvem `commentPlan`; `gestorDecisionRows` persiste essa linha.

## RPC (Anvil)

`proposeGestorHire` / `proposeGestorAllocate` / `proposeGestorReorganize` / `proposeGestorAssemble` / `commentGestorPlan` / `resolveGestorTie` / `rejectGestorPlan` / `listGestorPlans` / `getGestorMandate`. Auditoria: `formatGestorAudit` no perfil e em Saúde.

Wire (Anvil, 04/11):

- `commentGestorPlan({ workspaceId, planId, commenterId, comment })` → plano `commented` com `commentOnId` (o original fica `proposed`).
- `resolveGestorTie({ workspaceId, chosenId })` → escolhido `proposed`; os outros do `scopeKey` = `rejected`.
- `GestorPlanView.commentOnId?` no fio.
- `proposeGestorAllocate` / `proposeGestorReorganize` são `@Remote`; always_ask fica `proposed` até `approveGestorPlan`.

Store grava o `GestorPlan` completo em `body_json` (`commentOnId` inclusive).

## Auditoria (GES-5)

`formatGestorAudit` / `formatGestorAuditFromPlan` — frase no perfil e em Saúde, sem ids. Persistência = Anvil (`getTeamHealth.gestorAudit` + `PersonaCardView.gestorAuditReason` quando a persona tem `team_manager`).

## UI

Selo **Gestor**. Cartão de plano: Aprovar / Ajustar / Recusar. Personas novas entram na faixa só depois do aceite.

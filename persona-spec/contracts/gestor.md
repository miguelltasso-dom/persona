# Contrato — Gestor de equipe (GES-1..GES-3)

Dono do domínio/engine: **Forge** (`persona-core` / `persona-engine`).
Persistência + Remote: **Anvil** (`team_manager_*`, `SystemRoleView = team_manager`).
Ferramentas MCP: **Rivet** (`gestor_*`).
UI (selo **Gestor**, nunca "Maestro"): **Prism** + **Lumen**.

## Função

`SystemRole` literal: `team_manager` (`TEAM_MANAGER_ROLE`). Template: Coordenação também é Gestor. Quantas personas o usuário quiser.

## Ações

| Ação | Função | Recusa |
|---|---|---|
| Contratar | `gestorHire` / `assertGestorHire` | acesso acima do Gestor; `canGrantGestor: false` + `team_manager`; `maxPersonas`; orçamento; `always_ask` sem aceite |
| Alocar | `gestorAllocate` | projeto/canal/setor/`reportsTo` fora do mandato |
| Reorganizar | `gestorReorganize` | pausa ociosa sem aviso; autonomia acima do teto |
| Montar equipe | `assembleTeamForGoal` | frase sem objetivo |

`decideGestorAction`: `always_ask` → `ask`; aceite → `apply` **com `plan.status = applied`**. `auto_and_notify` → `notify` + plano aplicado. `applyGestorPlan` marca o plano aplicado; recusado (`rejected`) lança `INVALID_GESTOR`. `gestorDecisionRows(decision)` = o que o host grava num write (plan+audit no apply/notify; só plan no ask). Plano nunca aplica sozinho. `runGestorAllocate` / `runGestorReorganize` / `runGestorAssemble` passam pelo mesmo gate. `runAssembleTeam` é o núcleo sem gate (só testes / preview).

## Vários Gestores (GES-3)

Escopo por setor/projeto (`gestorInScope` / `gestorScopeKey`). Mesmo escopo: o primeiro propõe; o segundo `commentGestorPlan` (`status: commented`, `commentOnId`). Empate: humano `resolveGestorTie` — escolhido vence; os outros no escopo = `rejected`.

## RPC (Anvil)

`proposeGestorHire` / `proposeGestorAllocate` / `proposeGestorReorganize` / `proposeGestorAssemble` / `commentGestorPlan` / `resolveGestorTie` / `rejectGestorPlan` / `listGestorPlans` / `getGestorMandate`. Auditoria: `formatGestorAudit` no perfil e em Saúde.

Wire ainda sem Remote (Anvil, após a janela):

- `commentGestorPlan({ workspaceId, planId, commenterId, comment })` → plano `commented` com `commentOnId` (o original fica `proposed`).
- `resolveGestorTie({ workspaceId, chosenId })` → escolhido `proposed`; os outros do `scopeKey` = `rejected`.
- `GestorPlanView.commentOnId?` no fio (hoje `toPlanView` omite).
- `proposeGestorAllocate` / `proposeGestorReorganize` ainda não são `@Remote`.

Store já aceita o `GestorPlan` completo em `body_json` (`commentOnId` inclusive).

## UI

Selo **Gestor**. Cartão de plano: Aprovar / Ajustar / Recusar. Personas novas entram na faixa só depois do aceite.

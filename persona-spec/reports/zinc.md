# Zinc — relato (builder de backend novo; catch-up `skip` + Aprovar e rodar)

Cópia de trabalho: `C:/p8w-zinc` (worktree em `8fcb767034`). Nada foi commitado; nada de IA real foi chamado.

## Tarefa 1 — `catchUp: 'skip'` nunca rodava (FECHADO)

**Causa.** `RoutineRepos.pickDue` devolvia `[]` para `skip` sem olhar a quantidade de ocorrências; o agendador materializava no máximo UMA ocorrência (`cap = 1`), então o store não tinha como distinguir “a ocorrência que acabou de vencer” de “uma pilha de execuções perdidas”.

**Conserto.**
- `persona-store/src/routines/repos.ts` (`pickDue`): `skip` roda quando há exatamente uma ocorrência vencida; com duas ou mais, todas são canceladas (execuções perdidas). `run_once` e `run_all` intactos.
- `persona-host/src/proactivity-scheduler.ts` (`materialize`): `skip` e `run_all` materializam até 20 ocorrências; `run_once` continua só a mais recente. Assim a pilha existe para ser descartada pelo `skip`.

**Provas.**
- `persona-store/tests/routines.spec.ts`: “skip catch-up leases the single due occurrence” e “skip catch-up cancels a pile of missed occurrences”.
- `persona-host/tests/proactivity-scheduler.spec.ts`: “skip catch-up runs the occurrence that just came due and skips a pile of missed ones” (rotina horária: 09:00 roda; 10:00–12:00 em pilha são canceladas; 13:00 roda).
- Rodada: `routines.spec` + `proactivity-scheduler.spec` = **42/42 verdes**; `check-pkg persona-store persona-host` OK.

**Patch:** `.maestri/tmp/zinc/catchup.patch` (4 arquivos, 34 inserções / 4 remoções), gerado com `git diff --cached`.

## Tarefa 2 — “Aprovar e rodar” de rotina que precisa de aprovação (FECHADO)

**Desenho.**
- Novo `persona-host/src/routine-approvals.ts` (`RoutineApprovals`): livro de aprovações em `screen_doc` (`kind: routine_approval`, id = id da execução). O cartão tem `kind: 'routine'`, título “Rodar “{nome}” agora?” e o texto “A rotina “{nome}” vai rodar uma vez para {persona}. Aprovar?”. Pedir é idempotente; a primeira decisão vence.
- Agendador (`proactivity-scheduler.ts`): quando a `routine_charge` pede aprovação e não há decisão, ele **devolve a `routine_run` para `pending` sem contar tentativa** (`RoutineRepos.release`), grava o cartão e audita “precisa da sua aprovação… Aprove em Aprovações; ela roda uma vez.”. `claimDue` recebe o conjunto de execuções com cartão pendente e não as reivindica nem as cancela por catch-up. Com decisão `approved`, a execução segue; com `rejected`, é cancelada e auditada (`sched:routine_rejected`).
- Host (`index.ts`): `decideApproval({kind:'routine', accept})` grava a decisão em transação, registra `approval_decision` (`routine:<id>`) e, na recusa, cancela a execução + grava a auditoria. No aceite, o host dispara um ciclo do agendador na hora quando ele está armado; senão o ciclo seguinte (≤ 30 s) executa.
- Store (`routines/repos.ts`): `release(id)` (leased → pending, sem `attempt++`), `cancel(id)` (pending/leased → cancelled) e `claimDue(projectId, leaseUntil, held)`.
- Cliente: novo `kind: 'routine'` em `ApprovalView`/`ApprovalItem`/`DecideApprovalRequest`, chip “Rotina”, botão “Aprovar e rodar” (pt/en; os demais locales espelham en). O cartão usa as palavras do host; não entra no resumo diário de propostas nem nos insights.
- Contrato: `persona-spec/contracts/routine-remotes.md` §“Aprovar e rodar” (e a semântica de `skip`).

**Provas (ponta a ponta no agendador).**
- `proactivity-scheduler.host.spec.ts` (host real + runner scriptado + pipeline real):
  1. rotina com `requiresApproval` → nenhum Ticket, cartão `routine` pendente, execução `pending`; aprovar → **1 Ticket** para a dona e execução `done`; aprovar de novo → continua **1 Ticket**;
  2. recusar → nenhum Ticket, execução `cancelled`, auditoria “você recusou esta execução”;
  3. reinício (novo `ProactivityScheduler` sobre o mesmo store) com aprovação pendente → não perde, não duplica; depois de aprovar, roda uma vez.
- `proactivity-scheduler.spec.ts` (+4): espera sem rodar, aprovar uma vez, recusar, reinício.
- `routine-approvals.spec.ts` (2): pedido idempotente, primeira decisão vence, cartão some quando a execução some/pausa.
- `routines.spec.ts` (+2): `release` sem tentativa; execução retida não é leaseada nem cancelada.
- ACL: `decideApproval` continua com `requireWrite` + dono/roteado pela governança; a persona não aprova a própria rotina. `remote-acl-matrix.spec.ts` verde.

**Rodadas finais.**
- 13 arquivos (store + host + cliente de aprovações): **143/143 testes verdes** (13/13 arquivos).
- `check-pkg persona-host persona-store`: **OK**.
- `oxlint` nos arquivos tocados do host/store/cliente de aprovações: sem erros novos (restam só achados pré-existentes: o aviso `index.ts:2537` e o erro `approvals-ui-helpers.ts:149`, ambos fora do que mudamos).
- `check-pkg client-ui-persona` isolado acusa **218 erros pré-existentes** de tipos remotos não gerados nesta cópia (`ClientRemote`, `unknown`); nenhum erro nos arquivos que tocamos (confirmado com `tsc` completo e grep nos nossos arquivos).

**Patch:** `.maestri/tmp/zinc/approve-run.patch` (22 arquivos, 540 inserções / 23 remoções), gerado com `git diff` (inclui os dois arquivos novos via `git add -N`), aplicável **por cima** do `catchup.patch`.

## Como aplicar

```sh
cd C:/Users/migue/dev/persona
git apply --check .maestri/tmp/zinc/catchup.patch && git apply .maestri/tmp/zinc/catchup.patch
git apply --check .maestri/tmp/zinc/approve-run.patch && git apply .maestri/tmp/zinc/approve-run.patch
```

Os patches são contra o conteúdo da árvore principal (o worktree base é `8fcb767034`; a árvore principal tem duas mudanças pequenas e não sobrepostas em `index.ts`/`types.ts` da EFF-1). Não há migração de schema: `routine_run` continua com os cinco estados; o cartão é `screen_doc`.

## Comandos (verbatim, na cópia `C:/p8w-zinc`)

```sh
node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc final tests" --lock check -- \
  pnpm --dir C:/p8w-zinc exec vitest run --no-watch --testTimeout 30000 \
  packages/persona/persona-store/tests/routines.spec.ts \
  packages/persona/persona-host/tests/proactivity-scheduler.spec.ts \
  packages/persona/persona-host/tests/proactivity-scheduler.host.spec.ts \
  packages/persona/persona-host/tests/routine-approvals.spec.ts \
  packages/persona/persona-host/tests/routine-remotes.spec.ts \
  packages/persona/persona-host/tests/harness-routines.spec.ts \
  packages/persona/persona-host/tests/remote-acl-matrix.spec.ts \
  packages/persona/persona-host/tests/governance.spec.ts \
  packages/persona/client-ui-persona/tests/approvals-inbox.client.spec.tsx \
  packages/persona/client-ui-persona/tests/approvals-ui-helpers.client.spec.ts \
  packages/persona/client-ui-persona/tests/remote-approvals-panel.client.spec.tsx \
  packages/persona/client-ui-persona/tests/approvals-attention-title.client.spec.tsx \
  packages/persona/client-ui-persona/tests/decisions-cycle.client.spec.tsx
  → Test Files 13 passed (13) · Tests 143 passed (143)

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc final check-pkg" --lock check -- \
  node C:/p8w-zinc/scripts/persona/check-pkg.mjs persona-host persona-store
  → persona-host: OK in 58.4s · persona-store: OK in 37.0s

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc oxlint 3" --lock check -- \
  pnpm --dir C:/p8w-zinc exec oxlint <arquivos tocados>
  → só os achados pré-existentes citados acima

git apply --check .maestri/tmp/zinc/catchup.patch                      # na árvore principal: OK
git apply --check --cached .maestri/tmp/zinc/approve-run.patch         # na cópia, índice com a tarefa 1: OK
```

## Riscos / limites (ditos com franqueza)

1. **Cartões decididos ficam no `screen_doc`** (um por ocorrência que pediu aprovação). A listagem some depois de 24 h, mas as linhas ficam; uma rotina horária com aprovação gera ~24 linhas/dia. Retenção/limpeza fica para a v1.2.x.
2. **`skip` escolhido:** uma ocorrência vencida isolada roda (a “pontual”); uma pilha é descartada. Depois de o app ficar fechado por várias ocorrências, a rotina espera a próxima — é o significado de “skip”, agora documentado no contrato.
3. **Aprovação não é instantânea fora do agendador armado:** o aceite dispara um ciclo só quando `proactivityScheduler.status().running`; em teste/agendador desligado, o próximo ciclo executa. Nada é perdido.
4. **Cliente antigo:** `kind: 'routine'` é um valor novo no fio; o patch inclui o cliente. Um cliente sem esta versão veria o cartão como desconhecido (não há fallback silencioso no host).
5. **Sem IA real:** todas as provas usam runner scriptado/fake clock, como pedido.

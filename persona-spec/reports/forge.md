# Relatos — Forge (persona-core / persona-engine)

Mais recente no topo.

---

## 03/11 14:15 — P3a–P5, S3, P11, P12, B4 ✔ fila do engine/domínio fechada

### O que ficou pronto
- **P3a** `EffectQueue` + `EffectPersistence` (memória). Enfileira no `afterCommit`; rollback não dispara; `Later` não incrementa attempts.
- **P4a** `MemoryOutbox` + passes (`sent`/`dropped`) idempotentes.
- **P5** projeção estágio→coluna (`todo|doing|review|blocked|done`) + chip `waiting`; `reviewThread` = `{ source: 'review', id }` só em `person/review` (D-039).
- **S3** `personaPropose`: sem Recrutar → `ACL_DENIED`; escalada → `ACCESS_ESCALATION`; `auto` só aprova dentro do acesso do criador.
- **P11** `admitTrigger` (Policy ACL): `decide` no canal do projeto; explicit/inferred/notHuman.
- **P12** `internalSourceScope` channel/dm/persona/routine.
- **B4** `inlineRef` / `spillPointer` / `recallChain` com authorize por salto; revogação no meio corta a cadeia.

### Arquivos
- `packages/persona/persona-engine/src/{effects,outbox,kanban,sources}.ts` + testes
- `packages/persona/persona-core/src/domain/{rules,admission}.ts`
- `packages/persona/persona-core/src/context/{chain,error}.ts` + testes

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  16 passed (16)
      Tests  281 passed (281)
   Start at  14:15:12
   Duration  2.43s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
```

Oxlint nos arquivos novos: 1 arrow-parens em `effects.ts` (corrigido em seguida). `src/core` verbatim do protótipo continua fora do rewrite stylistic.

### Limitações
- Persistência de effects/outbox em SQLite é do Anvil (mesma interface `EffectPersistence` + contrato `Repositories`).
- `EffectQueue.enqueue` grava a row só no `afterCommit` (memória-seguro). No SQLite o Anvil pode upsert na mesma tx e só usar o hook para `kick`.
- D-039 não estava em DECISIONS.md; review-thread = `source: 'review'`.
- Fila Forge (Keel 14:22) concluída. Sem `maestri ask Keel`.

---

## 03/11 14:09 — P2a ✔ port Repositories + suíte de contrato (memória)

### O que ficou pronto
Port `Repositories` com `projectId` (D-038: tenant = projeto) e `afterCommit` (corre após o commit mais externo; rollback descarta hooks). `MemoryRepositories` implementa. Suíte `tests/contract` parametrizada por fábrica; memória passa a suíte (≥20) e os 113 do `core-engine.spec`. Contrato em `persona-spec/contracts/repositories.md`. Anvil pluga SQLite na mesma fábrica.

### Arquivos
- `packages/persona/persona-engine/src/core/ports.ts`
- `packages/persona/persona-engine/src/core/memory.ts`
- `packages/persona/persona-engine/tests/contract/repositories.contract.ts`
- `packages/persona/persona-engine/tests/contract/memory.contract.spec.ts`
- `persona-spec/contracts/repositories.md`

---

## 03/11 14:08 — B1 ✔ ACL + S2-domínio Cofre

### O que ficou pronto
`can(actor, action, resource)` + `assertCan` + adaptadores `authorizeContext` / `authorizeRecall` (≥60 casos). Cofre: kinds obrigatórios `constraint`/`decision` alimentam `compileContext` via `vaultSnapshot` / `compileVaultContext` (sem persistência). Revisão monotônica. Visibilidade workspace/project/persona/members. Obrigatório inacessível falha closed (`REQUIRED_CONTEXT_UNAVAILABLE`).

### Arquivos
- `packages/persona/persona-core/src/domain/acl.ts`
- `packages/persona/persona-core/src/domain/vault.ts`
- `packages/persona/persona-core/src/domain/schemas.ts` (`ACL_DENIED`)
- `packages/persona/persona-core/tests/acl.spec.ts`
- `packages/persona/persona-core/tests/vault.spec.ts`

---

## 03/11 14:04 — P1 ✔ persona_ + S1-complemento templates

### O que ficou pronto
Constante única `PERSONA_TOOL = 'persona_'`. Mensagens de `USER_ERRORS` e `STATUS_REQUEST` usam `persona_*`. `RECOVERY_NOTE` exportado. `REASONS.hostRestarted` = `host restarted`. Teste varre `src/core` e prova que não há `orchestrator_`. Templates Agência (`agency`) e Escritório (`office`) com 1 coordenação + 1 vigia cada.

### Arquivos
- `packages/persona/persona-engine/src/core/{ids,errors,tickets,assignments,reasons,index}.ts`
- `packages/persona/persona-engine/tests/persona-tool.spec.ts`
- `packages/persona/persona-core/src/domain/{templates,schemas}.ts`
- `packages/persona/persona-core/tests/domain.spec.ts`

---

## 03/11 14:00 — P0 ✔ src/core verbatim + NOTICE

### O que ficou pronto
15 arquivos do protótipo em `persona-engine/src/core` (commit 8c32a9d) + `core-engine.spec` (113 `it`) + `stage.spec` + `NOTICE` (MIT) em `package.json` `files`. Modelo removido de `persona-core/src/engine/*` (core = domínio puro). Sem import `@deepseek-ai` em `persona-engine/src`. Dois imports mortos do protótipo removidos para `noUnusedLocals`.

### Arquivos
- `packages/persona/persona-engine/src/core/*` (15)
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/NOTICE`
- `packages/persona/persona-engine/tests/{core-engine,stage}.spec.ts`
- `packages/persona/persona-core/src/index.ts` (parou de reexportar engine)

### Comandos e saída verbatim (onda P0–P2a)

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  10 passed (10)
      Tests  265 passed (265)
   Start at  14:08:39
   Duration  2.01s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-core/src packages/persona/persona-engine/src/core/{ids,memory}.ts
(exit 0)
```

Oxlint em `src/core` verbatim do protótipo: stylistic/non-null do upstream (não reescrito). Sem `pnpm install`. Sem commit.

### Limitações / dúvidas
- `src/core` permanece idiomático do protótipo (non-null, linhas longas).
- D-038/D-039 não estavam em `DECISIONS.md`; P2a seguiu o brief (tenant = `projectId`). D-039 (review-thread) entra em P5.
- Próximo: P3a Effects → P4a Outbox/Passes → P5 kanban+review-thread → S3 → P11 → P12 → B4.

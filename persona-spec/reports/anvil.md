# Relatos — Anvil (persona-store / persona-host)

Mais recente no topo. Dono: store, host, sync, `apps/persona-edge`.

---

## 03/11 15:14 — E6 — persona-sync: só streams compartilhados, cifra, offline

### O que ficou pronto
`SyncClient` recusa DM/privado (`PRIVATE_NOT_SHARED`, outbox vazio). Dois hosts no mesmo `MemoryTransport` convergem. Offline enfileira; `flush` + `restoreCursors` retomam. `WorkspaceCipher` AES-256-GCM (chave no host). `HttpTransport` para o Worker. Host: `openHostSync` / `openHostSyncFromEnv` no SQLite.

### Arquivos
- `packages/persona/persona-sync/src/{identity,client,cipher,transport,index}.ts`
- `packages/persona/persona-sync/tests/sync.spec.ts`
- `packages/persona/persona-host/src/sync.ts` + `tests/sync.spec.ts` + `index.ts` / `package.json` / `tsconfig.json`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-sync packages/persona/persona-host/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
   Start at  15:13:51
   Duration  4.19s
```

```
node scripts/persona/check-pkg.mjs persona-sync persona-host
persona-sync: OK in 7.8s
persona-host: OK in 10.7s
```

### Limitações
- Sem handshake WS no cliente (HTTP append/after). Cifra é AES-GCM Node (`node:crypto`).
- `pnpm exec` religou workspace após `persona-sync` no host (já estava no monorepo; sem pacote novo).
- Segue proatividade nativa no host (Atlas/Miguel).

---

## 03/11 15:09 — E5 — persona-edge Worker + DO + D1 + R2 + convites + HMAC

### O que ficou pronto
`WorkspaceHub` é o único ordenador (`commitEnvelope` / `SEQ_GAP`). Hibernação WS (`acceptWebSocket` + tags `stream:`/`device:` + `webSocketMessage`). Replay `GET /w/:id/sync/after`. D1 usa o mesmo SQL que a suíte `defineSyncLogContract('d1')`. R2 recusa anexo DM sem `shared`. Convites issue/redeem/revoke. Webhook GitHub: HMAC-SHA256 → `WebhookEnvelope` → DO (replay = `duplicate`) → sockets `device:`. Testes locais com `wrangler unstable_dev` (forceLocal; sem login/deploy). 2 clientes convergem; DM não sobe.

### Arquivos
- `apps/persona-edge/src/{index,env,workspace-hub,sql-log,do-sql,schema,hmac}.ts`
- `apps/persona-edge/tests/{d1-log.contract,hmac,edge}.spec.ts` + `tests/node-sql.ts`
- `apps/persona-edge/{wrangler.toml,README.md,migrations/0001_init.sql}`

### Comandos e saída verbatim

```
pnpm exec vitest run apps/persona-edge
 Test Files  3 passed (3)
      Tests  9 passed (9)
   Start at  15:08:59
   Duration  5.08s
```

```
pnpm exec tsc -p apps/persona-edge/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint apps/persona-edge/src apps/persona-edge/tests
(exit 0)
```

### Limitações
- Miniflare puro não transpila TS; a suíte HTTP usa `wrangler unstable_dev` (Miniflare por baixo). Sem handshake WS no spec HTTP (hibernação está no DO).
- D1 `exec` quebra DDL no newline — schema é statement-a-statement.
- Sem `wrangler login` / deploy (E11).
- Segue E6 `persona-sync`.

---

## 03/11 15:02 — E-persist — SyncLog / Invite / Import SQLite = suíte do Forge

### O que ficou pronto
Schema v3: `sync_envelope`, `invite`/`invite_actor`/`invite_vault`/`invite_memory`, `import_batch`. `SqliteSyncLog`, `SqliteImportStore`, `SqliteInviteBook` (+ `MemoryInviteBook`) implementam os ports do Forge. A mesma suíte de contrato (`tests/contract/{sync,import,invite}.contract.ts`) roda em memória e em SQLite; reopen em arquivo confirma persistência. Invite/Grant/purgeSource continuam funções do Forge — o book só grava o resultado.

### Arquivos
- `packages/persona/persona-store/src/{constants,migrations,index}.ts`
- `packages/persona/persona-store/src/sync/log.ts`
- `packages/persona/persona-store/src/import/store.ts`
- `packages/persona/persona-store/src/invite/{book,memory}.ts`
- `packages/persona/persona-store/tests/contract/{sync,import,invite}.contract.ts`
- `packages/persona/persona-store/tests/{sync,import,invite}.contract.spec.ts`
- `packages/persona/persona-store/tests/open.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  12 passed (12)
      Tests  263 passed (263)
   Start at  15:00:02
   Duration  4.31s
```

```
node scripts/persona/check-pkg.mjs persona-store
persona-store: OK in 6.1s
```

```
pnpm exec oxlint packages/persona/persona-store/src/invite/book.ts packages/persona/persona-store/tests/contract/sync.contract.ts
(exit 0)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-runners/src/plugin.ts:44:66: type symbol unknown has no declaration
(Rivet; nenhum artifact mudou; não editei persona-runners)
```

### Limitações
- Invite não tem port no core — `InviteBook` é do store. Suíte replica `invite.spec.ts` via persistência.
- Adaptadores de import (ChatGPT/Claude/md) ficam no core; a suíte compartilhada é preview construído + externalId + rollback.
- `generate-typert` vermelho em `persona-runners` (Rivet). Store não é a causa.
- Segue E5 `apps/persona-edge`.

---

## 03/11 15:17 — Typert C2 — anotação explícita em propriedades públicas

### O que ficou pronto
O gerador parava em `Orchestration.runtimes` ("public property is missing an explicit type annotation"). Anotados `runtimes: Map<…>`, `started: Set<string>`, e em `SqliteRepositories` os objetos `triggers`/`threads`/`tickets`/`decisions` como `Repositories['…']`.

### Arquivos
- `packages/persona/persona-host/src/orchestration.ts`
- `packages/persona/persona-store/src/engine/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.8s
```

### Limitações
- Nenhuma neste gate. C2/B7/REMOTE seguem.

---

## 03/11 14:27 — C3 + S4 — rotinas (lease/idempotência) e drafts

### O que ficou pronto
`RoutineRepos` no store: criar/listar, `schedule` com chave `routine_id:scheduled_for` (ON CONFLICT mantém a linha), `claimDue` com lease IMMEDIATE + catch-up `skip|run_once|run_all`, janela de silêncio, `pauseTeam` cancela pending/leased, `fail`+`retry`. Relógio injetável. Host: remotes `createRoutine`/`listRoutines`/`pauseRoutine`/`pauseTeam`/`scheduleRoutine`/`claimRoutines`/`retryRoutine`. S4: `draftPersona`/`draftTeam` determinísticos, válidos no schema Forge, tools vazias, sem função Coordenação.

### Arquivos
- `packages/persona/persona-store/src/routines/repos.ts`
- `packages/persona/persona-store/src/index.ts`
- `packages/persona/persona-store/tests/routines.spec.ts`
- `packages/persona/persona-store/README.md`
- `packages/persona/persona-host/src/{index,types,draft}.ts`
- `packages/persona/persona-host/tests/routines-draft.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  10 passed (10)
      Tests  115 passed (115)
   Start at  14:26:32
   Duration  4.64s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.5s
```

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/routines/repos.ts packages/persona/persona-store/tests/routines.spec.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/draft.ts packages/persona/persona-host/tests/routines-draft.spec.ts
(exit 0)
```

### Limitações
- Rotinas ainda não são Source do Intake (E-6, Forge); sem expansão Cron/RRule via `dsh-util-time` (sem `pnpm install` para nova dep) — o host agenda `scheduledFor` explícito.
- Drafts sem Runner/Rivet: template determinístico, não LLM.
- Sem remotes update/delete de persona/canal; sem tabela Subscription (v2).
- Fila imediata (B2, S2, B3, C1, C3, C4, S4) concluída. Próximos Anvil dependem de Forge/Rivet: B7 (R-1/E-3), engine SQLite (contrato), C8 host, marco E nuvem.

---

## 03/11 14:23 — C4 — arquivos por projectId (D-020)

### O que ficou pronto
`listFiles` / `statFile` / `readFile` no namespace `persona`: raiz vem de `project.rootPath` (`updateProject`), ACL = membro do workspace, caminho relativo resolvido com `realpath` — `../`, absoluto e symlink para fora recusam `path-outside-root`. Sem raiz → `project-root-missing`. Sem membro → `files-forbidden`. Typert continua verde.

### Arquivos
- `packages/persona/persona-host/src/files.ts`
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/files.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  14:22:24
   Duration  3.32s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/files.ts packages/persona/persona-host/tests/files.spec.ts
(exit 0)
```

### Limitações
- Métodos no namespace `persona` (não um serviço `personaFiles` separado); sem `readBytes`/`changes`.
- C3 (rotinas) e S4 (draft) ainda na fila; C3 espera E-6 para virar Source.

---

## 03/11 14:21 — C1a/C1b/C1c — CRUD + mensagens + busca ACL + Typert verde

### O que ficou pronto
Host Remote v1 agora cria workspace/projeto/membro/persona/participação/canal/DM e posta/lista/segue/busca mensagens. `followMessages` assina o log **antes** do baseline (sem perder o primeiro upsert). Busca aplica ACL do store: membro vê canal; DM só para participantes. `EventRepos.subscribe` notifica após o commit. `generate-typert` passou de novo com os novos `@Remote` (bloqueio do push continua verde).

### Arquivos
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/controller.spec.ts`
- `packages/persona/persona-host/tests/gateway.spec.ts`
- `packages/persona/persona-host/README.md`
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/tests/events.spec.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 35.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  98 passed (98)
   Start at  14:18:57
   Duration  5.37s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  14:20:39
   Duration  2.85s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/tests/controller.spec.ts packages/persona/persona-host/tests/gateway.spec.ts
(exit 0)
```

### Limitações
- Sem remotes de update/delete (o store já tem); sem tabela Subscription ("seguir assunto") — precisa v2.
- C1b Intake (E-6, Forge) ainda não existe: mensagens não viram Trigger.
- `listTasks` / `getOverview` vazios até os repos do engine.
- Seguindo para C4 (`persona-files`); C3 espera E-6; S4 espera S1/R-1.

---

## 03/11 14:15 — Typert gate — anotações explícitas nos parâmetros públicos

### O que ficou pronto
O gerador recusava `EventRepos.list(..., afterSeq = 0, limit = 50)` (e o mesmo padrão em `search` / `searchDocuments`). Padrão agora: parâmetro opcional **com tipo** (`afterSeq?: number`) e default **dentro** do método — evita `no-inferrable-types` e satisfaz o gate. Varredura em persona-store + persona-host: demais públicos já tinham anotação (`now: ProductClock = …`, `options: OpenTempStoreOptions = {}`, `config: Config = …`).

### Arquivos
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/src/vault/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  93 passed (93)
   Start at  14:15:18
   Duration  3.91s
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-store/src/vault/repos.ts
(exit 0)
```

### Limitações
- Nenhuma. Este era o bloqueio do typecheck/push.

---

## 03/11 14:10 — S2 store done — Cofre (registros, docs FTS5, versões)

### O que ficou pronto
`VaultRepos`: registros `brief|constraint|decision|memory` (schema Forge), `requiredRecords` = constraint/decision ativas, documentos FTS5, `vault_version` a cada escrita, revoke bloqueia update, tenant `project_id`.

### Arquivos
- `packages/persona/persona-store/src/vault/repos.ts`
- `packages/persona/persona-store/tests/vault.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  5 passed (5)
      Tests  88 passed (88)
   Start at  14:09:30
   Duration  2.73s
```

(`vault.spec.ts` 22 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint …/persona-store/src …/tests
(exit 0)
```

### Limitações
- compileContext (obrigatório > orçamento) continua no core; o store só expõe `requiredRecords`.
- Visibilidade de documento revalida pelo `parseVaultRecord` (schema de visibility do Forge).

---

## 03/11 14:08 — B2c done — log de eventos, FTS5, ACL, recall com fuso

### O que ficou pronto
`EventRepos`: stream por `(project, kind, owner)`, `seq` monotônica via `stream_cursor` em `BEGIN IMMEDIATE`, FTS5 (frase), cursor `afterSeq`, ACL na consulta (canal: membro ou participation; DM: só participantes — busca não vaza), recall por intervalo civil + IANA (`zonedUtcMs`), tombstone.

### Arquivos
- `packages/persona/persona-store/src/events/{repos,timezone}.ts`
- `packages/persona/persona-store/tests/events.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  4 passed (4)
      Tests  66 passed (66)
   Start at  14:07:50
   Duration  3.12s
```

(`events.spec.ts` 20/20 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- Concorrência de seq exercitada com duas conexões no mesmo thread (IMMEDIATE serializa).
- FTS5 usa frase entre aspas (consulta do usuário não é expressão FTS livre).

---

## 03/11 14:06 — B2b done — repositórios de produto

### O que ficou pronto
`ProductRepos`: workspace (+ projeto **Pessoal** automático), member, project, persona (schema Forge `parsePersona` + `projectId` tenant), participation, channel, dm. CRUD, unique constraints, coordenação única por projeto (não por workspace), upsert `ON CONFLICT` preserva `rowid`, listas newest-first. Dependência workspace `@deepseek-ai/dsh-persona-core` (sem `pnpm install` — resolve por paths).

### Arquivos
- `packages/persona/persona-store/src/product/{types,repos}.ts`
- `packages/persona/persona-store/src/sql.ts`
- `packages/persona/persona-store/tests/product.spec.ts`
- `packages/persona/persona-store/{package.json,tsconfig.json,src/index.ts}`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  3 passed (3)
      Tests  46 passed (46)
   Start at  14:05:58
   Duration  3.27s
```

(25 testes em `product.spec.ts` ≥ 25.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- `Persona` do Forge não tem `projectId`; o store persiste e devolve `StoredPersona`.
- `package.json` ganhou `dsh-persona-core` workspace:* — Keel precisa `pnpm install` se o lock reclamar.
- Sem commit.

---

## 03/11 14:00 — B2a done — abertura, identity, backup, migrações, tx()

### O que ficou pronto
`persona-store` abre `persona.db` com `node:sqlite`: `application_id` `PNSQ` (`0x504E5351`), `user_version` monotônico, WAL + `foreign_keys` + `busy_timeout`, arquivo `0o600` / dir `0o700`, `VACUUM INTO` **antes** de migrar (pulado em arquivo vazio v0→v1), migrações adjacentes imutáveis, falha de migração faz rollback e **preserva o backup**. `tx()` síncrono; aninhado via `SAVEPOINT`. Schema v1 já cria tabelas de produto / evento / cofre / rotina (com `project_id` e kind `personal` = Pessoal). Helpers `openTempStore` / `withTempStore`.

### Arquivos
- `packages/persona/persona-store/src/{identity,constants,errors,migrations,store,test-helpers,index}.ts`
- `packages/persona/persona-store/tests/{open,smoke}.spec.ts`
- `packages/persona/persona-store/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  13:58:37
   Duration  1.72s
```

(21 ≥ 15; inclui: reabrir preserva; versão maior recusada; falha de migração preserva backup; savepoint; WAL.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0, sem saída)
```

```
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0, sem saída — após corrigir arrow-parens e import não usado)
```

### Limitações
- Backup pulado em v0→v1 (arquivo novo vazio). Sem dados a preservar.
- Tabelas do engine (Ticket/Trigger/…) ainda não: esperam o contrato do Forge (`persona-spec/contracts/repositories.md`).
- Sem `pnpm install`. Sem commit.

### Decisões locais (não bloqueiam)
- `application_id = 0x504E5351` (`PNSQ`), distinto do session-query.
- `tx()` aninhado por savepoint (alinhamento Keel), não recusa nested.
- Tenant `project_id` nas tabelas de produto (D-038); kind `personal` + nome `Pessoal`.

---

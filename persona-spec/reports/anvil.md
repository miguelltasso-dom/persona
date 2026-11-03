# Relatos — Anvil (persona-store / persona-host)

Mais recente no topo.

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

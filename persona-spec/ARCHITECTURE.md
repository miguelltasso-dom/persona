# Arquitetura — Persona (estado real)

Para quem mantém. Nomes reais. Sem identidade de persona em código (D-043). Produto: **Persona** (D-017).

## Pacotes e fronteiras

```
packages/persona/
  persona-core      IDs, entidades, can()/ACL, compileContext/recall, vault-propose,
                    skills, handoff, aging, sync (envelope + SyncLog), import
  persona-engine    Super-agent: Trigger→Thread→pré-roteador→Eval→Tarefa→Runner→Revisar
                    + ports (SourceScope, Runner, RetentionPolicy, ReviewDelivery)
  persona-store     SQLite (Anvil): Repositories, outbox/effects, SyncLog, UsageStore
  persona-host      Cordis + @Remote (Anvil): Intake, orquestração, Review, sync
  persona-runners   Runner dsh | CLI OAR (Rivet): resolveRunner, capabilities, usage
  persona-vault     CredentialProvider DPAPI (Rivet)
  persona-usage     livro de uso (Rivet); Anvil persiste UsageStore
  persona-sync      cliente de sync (Anvil; marco E)
  client-ui-persona plugin de cliente (Prism/Lumen)
  persona-app       perfil `persona` (Keel)
```

Fronteira: o **port** é do produtor (core/engine/runners/usage); a **implementação SQLite** é do Anvil, validada pela mesma suíte de contrato. Engine **não** importa persona-core (ACL de comando entra por `canCommand`).

```
Source ──Trigger──► Engine.receive
                      │
                      ▼
                 pré-roteador (código)
                      │ model?
                      ▼
                 Policy.gate + Assessor (Triagem)
                      │ accept
                      ▼
                 Ticket + Mandate ──Assignment──► Runner
                      │ ready
                      ▼
                 ReviewDelivery (worktree) ──► Outbox (só Coordenação fala)
```

```mermaid
flowchart LR
  SRC[Source] --> IN[Intake / Trigger]
  IN --> PRE[pré-roteador]
  PRE -->|silêncio / cortesia / duplicado / comando| TRAIL[trilha sem modelo]
  PRE -->|@menção| TKT[Tarefa]
  PRE -->|model| GATE[Policy.gate]
  GATE --> TRI[Triagem / Assessor]
  TRI -->|accept| TKT
  TKT --> RUN[Runner]
  RUN --> REV[ReviewDelivery]
  REV --> OUT[Outbox]
```

## Fluxo mensagem → pré-roteador → Triagem → Tarefa → Runner → Revisar

1. **Intake.** `Engine.receive(trigger)` — Trigger imutável; mesmo `id` = `duplicate`.
2. **Thread.** `threadKey({ source, id })`. No máximo uma `Evaluation` por Thread. Novos Triggers vão a `pending`.
3. **Pré-roteador.** `EngineOptions.preRoute` depois de `eval.started`, **antes** de `assessor.request`. Regras (desligáveis por projeto, cada uma com trilha):
   - silêncio / orçamento esgotado → `silent`
   - `/pausar` `/retomar` `/tarefa <texto>` + ACL (`canCommand`) → comando
   - `@menção` a uma persona viva → `assign` (sem Triagem)
   - cortesia/ack (`ok`, `valeu`, 👍) → `react`, sem Tarefa
   - duplicado exato/quase exato na janela (hash normalizado texto+remetente+thread) → `ignore`
4. **Triagem.** Só se o pré-roteador devolve `model`: `Policy.gate` + `Assessor.request`.
5. **Decisão.** `accept` cria Ticket + Mandate imutável. `ignore`/`stop`/`unavailable` só Disposition.
6. **Pass-through.** Follow-up de pessoa num Thread com Tarefa viva: Input, sem nova Eval.
7. **Runner.** `Executor.start` via `EffectQueue` **depois** de `Repositories.afterCommit`. 1 sessão + 1 cwd por Tarefa. Coordenação nunca recebe `bash` (`toolsForRole`).
8. **Revisar.** `ReviewDelivery.prepare` → worktree; Aceitar / Pedir ajustes / Descartar. Sem push.
9. **Reply.** `Outbox.send` só após commit. Quem responde no canal é a persona com função Coordenação.
10. **Contexto.** `compileContext` + skills. Corpo longo: spill + `personaRecall` / `recallChain`.

## Invariantes testados

| Invariante | Teste |
|---|---|
| Idempotência de Trigger | `persona-engine/tests/mandatory/idempotencia-de-trigger.spec.ts` |
| 1 Eval / Thread | `persona-engine/tests/mandatory/um-eval-por-thread.spec.ts` |
| Mandate imutável | `persona-engine/tests/mandatory/mandate-imutavel.spec.ts` |
| Pass-through sem Eval | `persona-engine/tests/mandatory/pass-through-sem-eval.spec.ts` |
| Outbox só após commit | `persona-engine/tests/mandatory/outbox-so-apos-commit.spec.ts` |
| Assignment interrompida retoma | `persona-engine/tests/mandatory/assignment-interrompida-retoma.spec.ts` |
| Saudável não ocupa espaço | `persona-engine/tests/mandatory/saudavel-nao-ocupa-espaco.spec.ts` |
| ACL `can()` | `persona-core/tests/acl.spec.ts` |
| Leitura entre projetos | `persona-core/tests/mandatory/leitura-entre-projetos.spec.ts` |
| Pré-roteador (5 regras + off + trilha) | `persona-engine/tests/preroute.spec.ts` |
| Confine (traversal) | `persona-engine/tests/confine.spec.ts`, `tests/security/attacks.spec.ts` |
| Retenção (arquivo ≠ apagar) | `persona-engine/tests/contract/retention.contract.ts` |
| Sync: DM sem share não sobe | `persona-core/tests/sync.spec.ts` |
| Queda+resume em qualquer N | `persona-engine/tests/crash.spec.ts` |

Boot: `node scripts/persona/check-pkg.mjs persona-core persona-engine` · `pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine` · `pnpm exec tsx scripts/generate-typert.ts`.

## Pontos de extensão

| Port | Onde | Quem implementa |
|---|---|---|
| `SourceScope` | `persona-engine/src/core/ports.ts` | host: `internalSourceScope` / GitHub |
| `Runner` (sessão) | `persona-engine/src/ports/runner.ts` | Rivet: `persona-runners` (dsh / OAR) |
| `Runner` (turno) | `persona-runners/src/contract.ts` | Rivet: `resolveRunner` |
| `RetentionPolicy` + `RetentionStore` | `persona-engine/src/retention.ts` | Anvil SQLite; testes: `MemoryRetention` |
| `ReviewDelivery` | `persona-engine/src/review/types.ts` | `GitReviewDelivery`; host Remote |
| `UsageStore` | `persona-usage/src/store-types.ts` | Anvil `SqliteUsageStore`; Rivet mede |
| `SyncLog` | `persona-core/src/sync/types.ts` | Anvil SQLite/D1; testes: `MemorySyncLog` |
| `preRoute` | `EngineOptions` | host liga regras + ACL + janela |

## Como adicionar uma CLI nova (≤10 linhas)

1. Acrescente o `CliKind` em `persona-runners/src/contract.ts`.
2. Crie `persona-runners/src/oar/<cli>.ts` no molde de `oar/claude.ts` (`createOarRunner` + `capabilities`).
3. `permission: 'explicit'`. MCP: `available` ou `unavailable` (Cursor = unavailable).
4. Registre em `resolve/resolve-runner.ts` (`loadRuntime` + factory).
5. Casa isolada via `prepareIsolatedHome`; env do vault nunca logado.
6. Uso só por `UsageStorePort` (tokens; sem segredo).
7. Teste com `scriptedRuntime` / fake — **sem CLI real** enquanto o CONGELAMENTO valer.
8. Exporte em `persona-runners/src/index.ts`.
9. Host: `resolveRunner({ kind: 'cli', cli, model })`.
10. Port de sessão do engine (`ensureSession`/`deliver`) continua o de `persona-engine/src/ports/runner.ts`.

## Como adicionar uma Source nova (≤10 linhas)

1. Escolha o `source` string (`channel` / `dm` / `github` / …).
2. Mapeie o evento inbound → `Trigger` com `key(...)` (id idempotente).
3. Preencha `threads`, `actor`, `human`, `channel.address`, `meta` (sem segredo).
4. Implemente `SourceScope.scope()` → `{ listened, observed, row }`.
5. Intake no host chama `Engine.receive`. Bot = `human: false`.
6. O pré-roteador lê `trigger.text` **antes** do modelo.
7. Testes: id duplicado, fora de escopo (`filtered`), bot recusado pelo gate.
8. Molde: `persona-engine/src/sources/internal.ts` e `sources/github/`.
9. Webhook público só encaminha (`persona-core/src/sync/webhook.ts`); o desktop decide o Trigger.
10. Exporte o mapper em `persona-engine/src/index.ts`.

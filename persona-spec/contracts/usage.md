# Contrato `usage` (D5a)

Dono do port e dos parsers: **Rivet** (`packages/persona/persona-usage`).
Persistência SQLite + Remote: **Anvil** (`persona-host`) — implementa `UsageStore`, não redefine os tipos.
UI: **Lumen** (Uso e limites) consome o Remote.

## Origem (obrigatória)

`measured | estimate | official | unavailable`

Rótulos pt-BR (`originLabel`):

| origin | label |
|---|---|
| official | oficial da CLI |
| measured | medido por nós |
| estimate | estimado |
| unavailable | indisponível |

Ausência **nunca** é `0%`. Se o vendor não publicou `used_percent`, a janela fica `origin: unavailable` e `usedPercent` é omitido.

## Port `UsageStore`

```ts
record(event: UsageEvent): void
query({ from, to, personaId?, projectId? }): UsageEvent[]
totals({ from, to, personaId?, projectId? }): UsageTotals
```

`UsageEvent`: persona, projeto, CLI/modelo (`provider`/`model`), tokens in/out, `estimatedCost?` (sempre `origin: 'estimate'` + `basis`), `at`.

`UsageTotals`: tokens, `runs`, `origin` (a mais fraca do grupo), `originLabel`. Livro vazio → `origin: unavailable` / "indisponível" (os zeros são "sem eventos", não cota 0%).

Anvil persiste em SQLite. O plugin Rivet traz `createMemoryUsageStore()` para testes. Limites do engine (`tokensPerMonth` / `runs`) leem `totals()` deste livro.

## `officialQuota(cli)`

OAR `accountUsage` com timeout (8 s) e cache (60 s). Reader injetável (Anvil/runners passam o runtime). Sem token em log. Timeout/payload ausente → `{ origin: 'unavailable', windows: [], detail }` — **nunca** `usedPercent: 0`.

## usage-meter (runners)

`resolveRunner({ usageStore, usageScope: { personaId, projectId } })` grava `origin: 'measured'` no port após cada turno. Ou `usage: UsageMeterSink` direto.

## Remote (Anvil) — SQLite v7 `usage_record` / `usage_quota`

```
getUsage({ workspaceId, period: { from, to }, personaId?, projectId? }): UsageView
getOfficialQuota({ workspaceId, projectId, provider? }): OfficialQuota[]
```

Ator do servidor + `can(read, project)`. `UsageView` reexporta folds de `persona-usage` + `originLabel` pt-BR. Livro vazio ⇒ `origin: unavailable` / "indisponível". Período pode cruzar o mês. Medidor do resolveRunner grava `measured` no mesmo livro. `tokensPerMonth` da persona lê o mês UTC.

Não redefinir tipos — importar de `@deepseek-ai/dsh-persona-usage`.

## Ledger por turno (OPT-7)

`TurnLedgerEntry` do core (`packages/persona/persona-core/src/domain/token-ledger.ts`). Kinds canônicos: `triage | reply | execution | initiative | librarian | watchdog | evaluation`. Anvil persiste esses literais em `turn_ledger` (schema v18). O port Rivet (`UsageStore` / `usage_record.window`) recebe `usagePortKind(kind)` (`exec` / `eval`) **só nessa fronteira**.

`getUsagePanel` = `foldUsagePanel(entries, successfulTicketIds)`. Livro vazio → `origin: estimate`. Ausência de cache ≠ 0%.

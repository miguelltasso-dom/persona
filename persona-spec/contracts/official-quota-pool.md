# Official quota → Uso e limites pool

Rivet harvest. Anvil persist. Lumen render.

## Wire
1. OAR `accountUsage` → `readOarAccountUsage` (5h / week; 0% official stays 0%).
2. `harvestLimitReports` → `putProviderLimitReports` **and** `usage.putQuota` (same windows).
3. Window ids on the wire: `5h` and `week` (not `weekly` — Lumen `WINDOW_WEEK` has `week`).
4. Account label = `readableAccountLabel` (email local-part / Claude Max / ChatGPT). Never `default`.
5. After a finished read: `quotaUiState` is `ready` | `limit` | `unavailable` | `timeout`. Never `checking`.
6. Timeout (8 s) → `detail: accountUsage timeout`. "indisponível" only when the vendor published no window.

## Anvil (04/11 — cota oficial por conta)
`ConnectionProbe.probe` calls `persistQuota(snaps)` after `detect`. The host binds that to `persistProbeQuota` → `persistOfficialQuotaPuts` → `usage.putQuota` (schema v19, PK `project_id+provider+account_id`).
`getOfficialQuota` returns one view per account (`accountId` / `accountLabel` / `nextRefillAt` / `refillHistory`, never `default`). Lumen `officialQuotasToProviderPools` sorts by `nextRefillAt`.

## Rivet (04/11 — `at`: quando a cota foi lida)
`OfficialQuotaView.at?: string` (ISO UTC) = o instante da última leitura gravada para aquela conta, **inclusive** quando a leitura não achou nada (`origin: 'unavailable'`, `windows: []`): a pilula do rodapé (A-5) diz "há X min" a partir dele. Quem carimba: `SqliteUsageStore.putQuota` (`quota.at ?? agora`), então cada leitura reescreve o campo; `OfficialQuotaPutRow.at` / `officialQuotaPuts(snaps, at?)` deixam a sonda informar o instante exato. Linhas gravadas antes do campo vêm **sem** `at` (a UI não mostra "há X min"). Não confundir com `refillHistory[].recordedAt` (marca quando o relógio de reset mudou). Sem migração de schema: o campo vive no corpo JSON da linha. Provas: `persona-store/tests/usage.spec.ts`, `persona-usage/tests/harvest-limits.spec.ts`, `persona-host/tests/usage.spec.ts`.

## Lumen
`accountStateFromWindows`: if `origin === 'unavailable'` and `detail` includes `timeout` → timeout copy; empty official windows → unavailable, not Conferindo…. Match `week` (Rivet now emits it).

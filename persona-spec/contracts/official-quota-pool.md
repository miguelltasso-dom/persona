# Official quota → Uso e limites pool

Rivet harvest. Anvil persist. Lumen render.

## Wire
1. OAR `accountUsage` → `readOarAccountUsage` (5h / week; 0% official stays 0%).
2. `harvestLimitReports` → `putProviderLimitReports` **and** `usage.putQuota` (same windows).
3. Window ids on the wire: `5h` and `week` (not `weekly` — Lumen `WINDOW_WEEK` has `week`).
4. Account label = `readableAccountLabel` (email local-part / Claude Max / ChatGPT). Never `default`.
5. After a finished read: `quotaUiState` is `ready` | `limit` | `unavailable` | `timeout`. Never `checking`.
6. Timeout (8 s) → `detail: accountUsage timeout`. "indisponível" only when the vendor published no window.

## Anvil (JANELA ENCERRADA — 02:15)
`officialQuotaPuts(snaps)` in `persona-usage` (desktop leaf copy: `apps/desktop/src/usage-quota-bridge.ts`).
On `detectConnections` / `listConnections` ready: `for (const row of officialQuotaPuts(snaps)) usage.putQuota(projectId, row)`. Then `getOfficialQuota` stops returning empty stubs.

## Lumen
`accountStateFromWindows`: if `origin === 'unavailable'` and `detail` includes `timeout` → timeout copy; empty official windows → unavailable, not Conferindo…. Match `week` (Rivet now emits it).

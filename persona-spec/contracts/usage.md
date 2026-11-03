# Contrato `usage` (D5a)

Dono do livro e dos parsers: **Rivet** (`packages/persona/persona-usage`).
Remote no host: **Anvil** (`persona-host`) — reexporta estes tipos, não redefine.
UI: **Lumen** (tela Uso e limites) consome o Remote.

## Origem (obrigatória)

`measured | estimate | official | unavailable`

Ausência **nunca** é `0%`. Se o vendor não publicou `used_percent`, a janela fica `origin: unavailable` e o campo `usedPercent` é omitido.

## Tipos

```ts
UsageRecord { provider, model, window, inputTokens, outputTokens, origin, at }
UsageFold   { provider, model, window, inputTokens, outputTokens, origin, records }
UsageWindow { id, origin, usedPercent?, windowMinutes?, resetsAt? }
OfficialQuota { provider, origin, windows, detail? }
```

## Fontes oficiais (leitura)

- OAR `runtime.accountUsage(installation)` — claude e codex → `readOarAccountUsage`
- Rollouts Codex `~/.codex/sessions/**/rollout-*.jsonl` campo `rate_limits` (5h / weekly) → `readCodexRolloutLimits`
- Saldo DeepSeek, se o payload existir → `readDeepSeekBalance` (valor não é percent; falta = unavailable)

## Estimativa

`labelledEstimate` sempre carrega `origin: 'estimate'` e um `basis` visível na UI. Não misturar com oficial sem o rótulo.

## Remote sugerido (Anvil)

`usage.fold(projectId)` → `UsageFold[]`
`usage.official(projectId, provider)` → `OfficialQuota`

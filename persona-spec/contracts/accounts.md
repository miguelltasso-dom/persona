# Contrato — várias contas por provedor (WAVE2 §3 / W2-4 / W2-5)

Dono da execução: **Rivet** (`persona-runners` + `persona-vault` + `persona-usage`).
Dono da política persistida: **Forge** (domínio) / **Anvil** (Remote). Tags iguais a `RunnerSwapPolicy` em `persona-host/src/types.ts`.

## Isolamento

Cada conta tem um diretório próprio. Segredos de A nunca entram no dir de B.
Forge: `assertIsolatedHomes` recusa `EMPTY_HOME` / `SHARED_HOME`; `pickAccount` aplica isso antes de decidir.

| Motor | Variável | Dir |
|---|---|---|
| Claude | `CLAUDE_CONFIG_DIR` | `{PERSONA_HOME}/accounts/{personId}/claude/{accountId}` |
| Codex | `CODEX_HOME` | `…/codex/{accountId}` |
| Cursor | `CURSOR_CONFIG_DIR` | `…/cursor/{accountId}` |
| OpenCode / Go | `OPENCODE_CONFIG_DIR` + `XDG_CONFIG_HOME` | `…/opencode/{accountId}` |
| Gemini | `GEMINI_CONFIG_DIR` (+ chave no Cofre) | `…/gemini/{accountId}` |
| Grok | `GROK_HOME` + `XAI_CONFIG_DIR` (+ `XAI_API_KEY` no Cofre) | `…/grok/{accountId}` |
| DeepSeek / OpenRouter | só Cofre (`setAccount`) | — |

`prepareAccountHome` cria o dir e **não** copia o login nativo. Login nativo da CLI escreve naquele dir. `prepareIsolatedHome` (legado, um home por projeto) continua podendo semear auth; contas WAVE2 não usam isso.

Cofre: `setAccount(personId, provider, accountId, secret, label)`. Chave `persona-vault/{person}/{provider}` (default) ou `…/{provider}/{accountId}`. Snapshot sem plaintext.

## Política (execução Rivet)

`pickProviderAccount({ accounts, policy, quotas, currentId, personaName })`

| `kind` | No limite |
|---|---|
| `fixed` | `stop` + aviso pt-BR; não troca |
| `next_on_limit` | `switch` para a próxima do mesmo motor com cota |
| `round_robin` | `switch` para a de maior cota restante (empate: a seguinte) |
| `ask_before_swap` | `ask` → host vira Precisa de você |

OPT-5: `modelForWork` (triage/librarian/watchdog/initiative) usa o modelo de talk; `idleTeamMayCallModel(false)` = zero chamadas. OPT-1: `foldTurnLedger` em `persona-usage`.

`resolveRunner` com `accounts` + `accountPolicy` executa o pick **antes** de abrir sessão. `ask`/`stop` → `RunnerResolveError('quota_exhausted')`. Troca gera `activity`: `"Nina passou para Claude · Trabalho até 18:30"`.

Cota oficial: `officialQuota(provider, { accountId, accountUsage })` — cache por `provider:accountId`, intervalo automático **5 min** (`AUTO_QUOTA_CHECK_MS`; `force` no refresh). Ausência nunca é 0%.

Grok: `GROK_HOME` **e** `XAI_CONFIG_DIR` no mesmo dir (T3).

Pool (T3 harvest): `harvestLimitReports` → `LimitAccountReport[]` para Anvil `putProviderLimitReports`. `dedupeLimitAccounts` (mesma conta / vários ambientes = 1) → `poolProviderLimits` (contas pelo próximo refill). Histórico nativo: `readNativeHistoryTotals` — turno sem tokens gravados é skip, nunca estimado do texto. `canUseReset` só com `nextCreditId`; `redeemReset` chama o port injetado. Ver `persona-spec/T3-ACCOUNTS-HARVEST.md`.

OPT-5: `TRIAGE_CALL_CAP = 1` / `triageCallsAllowed(already)`. Segunda triagem não abre CLI (`triageCallsAlready`).
OPT-1: `usagePortWindow(kind)` → `exec`/`eval` no campo `window` do UsageStore (Anvil). `kind` permanece canônico.

## Anvil

Remote já tem `listConnectionAccounts` / `setRunnerSwapPolicy`. Passar `accounts` + `accountPolicy` + `accountQuotas` no `resolveRunner`. UI (Lumen) já mapeia o bundle.

Host (`isolatedAccountHome`): `accountHomeDir(PERSONA_HOME, personId, engine, accountId)`. `resolveFor` chama `pickAccount` + `pickProviderAccount`.

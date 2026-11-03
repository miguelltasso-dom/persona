# Contrato `Runner` (D-040 emendada)

Dono do port: **Forge** (`packages/persona/persona-engine/src/ports/runner.ts`).
Implementações: **Rivet** em `persona-runners` (adaptadores `dsh`, OAR claude/codex/cursor/opencode, e o fake de integração). Importar o tipo daqui — não redefinir.

## Superfície

```ts
ensureSession(id, cwd, title, role)   // coordinator | worker | watchdog
deliver(sessionId, requestId, text, mode)  // queue | steer | inject; idempotente por requestId
cancel(sessionId, { keepInbox })
status(sessionId) → idle | running | missing
whenIdle(sessionId)
onEvent(listener) → disposer     // idle | running | error | inputTaken | userTurnStarted
capabilities() → { steer, removeQueued, reportsInputTaken, background, tools: 'native'|'mcp', resume }
background? → { running, untilQuiet, kill, stopSubagents }
```

## Regras

- Uma sessão + um `cwd` por Tarefa (worker). Coordenação: uma sessão longa, **sem ferramenta `bash`** (D-041; `toolsForRole` + `ROUTER_FORBIDDEN_TOOLS`).
- `deliver` é idempotente em `requestId`.
- `launch` / `delivery` do Effects passam por este port. `WorkerSlots` reserva um slot extra para mensagem de pessoa e acorda antes de lançar.
- Erro transitório: 3 tentativas, backoff 15s / 30s / 60s. `PrepareFailed` não retenta; falha vai para `ticket.delivery`.
- Sem capacidade `background`, o fim do turno vira `waiting`. Com background, o limite é 30 min (`BACKGROUND_LIMIT_MS`).
- `resume()` (P8): assignment interrompida reinicia com `RECOVERY_NOTE` e reentrega inputs não lidos; relatos waiting/ready/blocked/failed mantêm a sessão.

## Resolvedor (`ctx.personaRunners.resolveRunner`) — Anvil troca `createHostRunner`

```ts
type PersonaRunnerSpec =
  | { kind: 'dsh'; model: string }
  | { kind: 'cli'; cli: 'claude' | 'codex' | 'opencode' | 'cursor'; model: string }

resolveRunner({
  spec,
  permissionMode: 'prompt' | 'allow-once' | 'deny',  // host deriva da autonomia/escopo
  autonomy?: 'on_request' | 'propose' | 'act',       // propose ⇒ withObserveGate
  home?: string,                                     // isolamento opcional
  vault?: { get(personId, provider): Promise<string | undefined> },
  personId?: string,
  agent?: DshAgentPort,                              // obrigatório para kind:'dsh'
  runtime?: Runtime,                                 // testes / fake CLI
  usage?: { record(MeasuredUsage) },                 // persona-usage
}): Promise<Runner>
```

Erros tipados (`RunnerResolveError`): `cli_not_found` | `not_logged_in` | `model_unavailable` | `quota_exhausted`. `message` é pt-BR curto para a UI (sem stack, sem token). Credenciais do vault só em env efêmero da sessão.

## Conexões (`detectConnections`) — Anvil/Lumen `listConnections`

```ts
detectConnections({ timeoutMs?: 8000, cacheMs?: 60_000, force?, runtimes? }): Promise<ConnectionSnapshot[]>
// { id, kind:'dsh'|'cli', installed, loggedIn, models, version?, usageOrigin?, loginHint?, error? }
```

Cache 60 s. Timeout curto por CLI. Sem segredos. `loginHint` pede para abrir o terminal (`claude login` / `codex login` / …) — nunca pede token.

## Fábricas (Anvil / `persona-host` orchestration)

Rivet exporta de `@deepseek-ai/dsh-persona-runners`:

- `createCoordinationDriver` — sessão longa da Coordenação (sem bash; P6 `composePrompt`).
- `createExecutorAdapter` — Effects → port `Runner`.
- `createDshSessionRunner` / `createOarSessionRunner` / `createClaudeRunner` / `createCodexRunner` / `createOpencodeRunner` / `createCursorRunner`.
- Login nativo por padrão: runners Claude/Codex/OpenCode passam `SessionOptions.env` que **remove** `CLAUDE_CONFIG_DIR` / `CODEX_HOME` herdados; isolamento só com `configDir` / `homeDir` explícitos ou `PERSONA_ISOLATE_CLI_CONFIG=1`. Cursor não recebe `env` (OAR recusa). Resume Codex faz `dispose` da sessão viva antes de reabrir (writer exclusivo).
- **Codex / OAR 0.67 (contorno):** o runtime muitas vezes conclui `prompt()` sem emitir `turn_ended` e manda texto em `agent_message`/`item` em vez de `text_delta`. O adapter trata o settle do `prompt()` como fim de turno e mapeia esses kinds para `delta`. Sem isso o smoke fica `exec sem done`. (Keel: ecoar em D-024 se quiser no DECISIONS.)

## Proatividade (PRO-3)

- `withInfraRecovery` (ligado nos runners DSH e OAR): contexto cheio / conexão / processo morto / prompt de confiança ⇒ evento `infra`, nova sessão com handoff (`RECOVERY_NOTE` + `persona_recall(id)`) e backoff 15s/30s/60s.
- DSH: o host monta `@deepseek-ai/dsh-goal-round-driver` (`GOAL_ROUND_DRIVER_NAME`). Equivalente CLI: `createGoalContinueDriver` usa `resume`/`steer` enquanto o goal está armado; sem goal a equipe descansa.
- Prompt de executora: `executorPrompt` / `OWNER_NORMS` (terminar, verificar, evidência, próximo passo; nunca devolver trabalho do mandato).
- Suíte `runLazinessSuite` (scripted/fake por padrão): multi-etapa, erro intermediário, ambiguidade pequena → `RunnerLazinessHint` (`completionRate`, `initiativeRate`, `grade`) para a UI. Real só com `PERSONA_LAZINESS_REAL=1` + `PERSONA_REAL_CLI=1`.
- S4: `createDraftDriver` + `DRAFT_PERSONA_PROMPT` (Runner fake/scripted; tools vazias; `systemRoles` []; sem coordenador). Anvil pode trocar o draft determinístico do host por este driver.
- ai-memory: `createAiMemory` / `PERSONA_AI_MEMORY=1` (padrão off; fake de captura/handoff).
- E4: `withObserveGate` — regra `observe`/`off` ou trabalho especulativo ⇒ registra `would` e **não** chama o runner interno. `auto` + não especulativo encaminha.
- E7: `assertLocalPersonaMachine` — a tarefa só sobe na máquina da persona. Amigo sem grant não executa.
- `createFakeRunner` — testes e host sintético.
- `createWatchdogDriver` — Vigia (abaixo).

Anvil injeta `claimDue` (RoutineRepos) e o `Runner`; não importar `persona-store` daqui.

## Vigia (`createWatchdogDriver`)

Sessão `watchdog` (D-043 / D-032). Modelo barato vem da persona atribuída. `tick(leaseUntil)` só corre se `claimDue(projectId, leaseUntil)` devolver trabalho. Consome `watchdogSignals` / `watchdogWarnings` do Forge (ticket parado, efeito falhando, Eval `unavailable` repetida). Com `vigia()` + `rules`, também consome `vigiaTick` (ociosa/loop/peer). Avisos já vêm deduplicados. **Sem escrita em tickets** — só `runner.deliver` na sessão vigia. Cada tick com sinal vira `WatchdogAuditEntry` (version + ruleVersion).

```ts
createWatchdogDriver({ runner, persona, cwd, projectId, claimDue, snapshot, now? })
  .start()
  .tick(leaseUntil) → WatchdogWarning[]
```

## Fake

`FakeRunner` + `FakeClock` em `persona-engine/src/executor/fake.ts` — use nos testes do engine. O fake de OAR/scripted do Rivet continua em `persona-runners` e deve satisfazer esta interface.

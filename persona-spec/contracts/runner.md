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
  | { kind: 'dsh'; model: string; talkModel?: string; provider?: 'deepseek' | 'openrouter' | 'openai-compat'; baseUrl?: string }
  | { kind: 'cli'; cli: 'claude' | 'codex' | 'opencode' | 'cursor'; model: string; talkModel?: string }

type RunnerPurpose = 'talk' | 'task'

resolveRunner({
  spec,
  permissionMode: 'prompt' | 'allow-once' | 'deny',  // DSH: prompt ok. CLI: NUNCA prompt (D-013 / D-052)
  purpose?: RunnerPurpose,                           // talk = modelo barato + sessão quente; default task
  toolLevel?: 'none' | 'read' | 'write',             // default write no DSH; CLI deriva de tools+modo
  tools?: Record<string, 'none' | 'read' | 'write'>, // mapa da persona (`files`/`shell`/`web`)
  autonomy?: 'on_request' | 'propose' | 'act',       // propose ⇒ withObserveGate
  home?: string,                                     // isolamento opcional
  vault?: { get(personId, provider): Promise<string | undefined> },
  personId?: string,
  projectId?: string,
  cwd?: string,
  pool?: SessionPool<Runner>,                        // default: defaultRunnerPool
  agent?: DshAgentPort,                              // obrigatório para kind:'dsh'
  runtime?: Runtime,                                 // testes / fake CLI
  usage?: { record(MeasuredUsage) },                 // persona-usage
}): Promise<Runner>
```

### Modelo por finalidade (`spec.runner.model` / `talkModel`)

| purpose | modelo |
|---|---|
| `task` | `spec.model` (persona / Tarefa — o modelo forte) |
| `talk` | `spec.talkModel` se pinado; senão o barato do CLI: Claude `haiku`, Codex `default`, OpenCode `opencode/beam-free`, Cursor `default`, DSH `deepseek-chat` |

`pickFastestModel` / `TRIAGE_MODELS` / `modelForPurpose`. Anvil passa `purpose: 'talk'` em triagem/coordenação e `purpose: 'task'` na Tarefa. O wrapper de talk **reescreve** `input.model` para o barato mesmo se o host mandar o modelo da persona.

### Pool de sessões quentes

Chave: `personaId|projectId|purpose|provider|model|cwd`. TTL ocioso 10 min (`SESSION_LEASE_MS`). Teto global 8 (`SESSION_POOL_CAP`). A 2ª mensagem no mesmo slot **não** chama `runtime.session()` de novo — só `prompt()` / steer. `defaultRunnerPool` é o pool do processo; Anvil deve passar o mesmo `pool` em todo `resolveRunner`.

- `ctx.personaRunners.resolveRunner` (plugin) injeta `defaultRunnerPool` se o host não passar `pool`. `resolveRunner` direto (testes) **não** compartilha o pool global.
- `prewarmCoordination({ spec, permissionMode, personaId, projectId, cwd, … })` — boot do host: **1** sessão da Coordenação, `prime()` abre a CLI **sem** turno de modelo.
- `disposeRunnerSessions()` / `runner.dispose()` — «Sair de vez», pausa da equipe, troca de modelo. Sem órfãos: slot expirado/evicto também `dispose` a sessão.

### Stream: `delta` imediato + `partial` cumulativo

O adapter **não** espera 240 caracteres para o 1º token. Só segura um prefixo que ainda pode ser parede de login (`mayBecomeLogin`). Cada flush emite `delta` (chunk) + `partial` (texto acumulado) + `report progress`. Anvil encaminha `partial` à UI sem esperar `ended`.

Erros tipados (`RunnerResolveError`): `cli_not_found` | `not_logged_in` | `model_unavailable` | `quota_exhausted`. `message` é pt-BR curto para a UI (sem stack, sem token). Credenciais do vault só em env efêmero da sessão.

**DSH com chave no Cofre:** se `kind:'dsh'` e o host **não** injeta `agent`, o resolvedor lê `vault.get(personId, provider | 'dsh')` e sobe `createHttpDshAgent` (OpenAI-compat: DeepSeek / OpenRouter / `baseUrl`). Sem chave → `not_logged_in` + `loginHint` ("Configure a chave no Cofre"). Stream SSE → `delta`/`partial` no 1º token. A chave **nunca** entra em erro, log ou evento. Testes usam `node:http` (o `llm-mock-server` do Harness é Anthropic Messages, não chat/completions).

## Níveis de ferramenta (`none` | `read` | `write`)

`resolveRunner({ toolLevel, tools })` envolve o runner com `withToolLevel`. DSH e OAR emitem `report.summary` `tool:<nome>`. Recusa cancela e encerra `blocked` com `question: Precisa de você: esta ação está fora da política da persona.`

## Permissões CLI — nunca `prompt` (D-013, proposta D-052)

OAR não responde aprovações. `permissionMode: 'prompt'` em spec `cli` **lança** (pt-BR). Anvil usa `permissionFor` / `cliPermissionOf`: talk/coordenação → `deny`; tarefa no worktree com `files: write` ou `shell` ≠ none → `allow-once`. cwd = worktree.

Pedido `app_request` / `can_use_tool` / `requestApproval` **não trava**: o adapter encerra `blocked` + `question` (Precisa de você).

### Matriz vendor (flags na abertura da sessão)

| CLI | Resposta / `deny` / tools vazios | Tarefa `files: write` | Tarefa `files: read` / `shell: none` | Fora da política |
|---|---|---|---|---|
| **claude** | `--permission-mode dontAsk` + `--disallowed-tools` Bash/Edit/Write/NotebookEdit/MultiEdit/WebFetch/WebSearch. **Não** omite o modo (OAR colocaria `--dangerously-skip-permissions`). | `--permission-mode acceptEdits`; Bash/Web* só se o grant existir | `dontAsk` + denylist de escrita/Bash | `blocked` + Precisa de você |
| **codex** | `approvalPolicy: never` (OAR) + `OAR_CODEX_SANDBOX=read-only` no `session()` | `workspace-write` | `read-only` | idem |
| **opencode** | ACP não expõe denylist (`disallowedTools` recusado). Gate no stream (`withToolLevel`). Sem `prompt`. | mesmo | mesmo | idem |
| **cursor** | `disallowedTools` Write/Edit/Bash/Shell/Web*; **nunca** `launchArgs` nem `--force` (SDK recusa argv). | tira Write/Edit da denylist | Write/Bash na denylist | idem |
| **dsh** | `prompt` só aqui (aprovação interativa). `toolsForRole` + `withToolLevel`. | tools nativas no worktree | read-only no port | idem |

**Limitações honestas (contestar D-052 se preciso):** `shell: safe` não existe no schema (`none\|read\|write`). Allowlist `git status` / test runners **não** é canal nativo no OAR (Claude/Cursor/OpenCode). Rede/instalação: `WebFetch`/`WebSearch` na denylist salvo `tools.web`. OpenCode = só o gate do stream. Cursor `force` interno do OAR no resume (pegar thread preso) **não** é grant de escrita.

## Conexões (`detectConnections`) — Anvil/Lumen `listConnections`

```ts
detectConnections({ timeoutMs?: 8000, cacheMs?: 60_000, force?, runtimes? }): Promise<ConnectionSnapshot[]>
// { id, kind:'dsh'|'cli', installed, loggedIn, models, version?, usageOrigin?, loginHint?, error? }
```

Cache 60 s. Timeout padrão 8 s por CLI (auth do Claude ~5 s; 400 ms era falso `not_logged_in`). Timeout/throw ⇒ `authUnknown: true`, **não** `not_logged_in`. Sem segredos. `loginHint` pede para abrir o terminal (`claude login` / `codex login` / …) — nunca pede token.

## Fábricas (Anvil / `persona-host` orchestration)

Rivet exporta de `@deepseek-ai/dsh-persona-runners`:

- `createCoordinationDriver` — sessão longa da Coordenação (sem bash; P6 `composePrompt`).
- `createExecutorAdapter` — Effects → port `Runner`.
- `createDshSessionRunner` / `createOarSessionRunner` / `createClaudeRunner` / `createCodexRunner` / `createOpencodeRunner` / `createCursorRunner`.
- Login nativo por padrão: runners Claude/Codex/OpenCode passam `SessionOptions.env` que **remove** `CLAUDE_CONFIG_DIR` / `CODEX_HOME` herdados. `home` isolado (`<PERSONA_HOME>/runners/<id>`) **copia** só ficheiros de auth allowlist ou **aponta** ao HOME real — nunca aplica um dir vazio que derrube o login. Isolamento cru só com `configDir` / `homeDir` explícitos no factory ou `PERSONA_ISOLATE_CLI_CONFIG=1`. Cursor não recebe `env` (OAR recusa).
- Saída de CLI tipo "Not logged in" / "Please run /login" / "please sign in" **não** vira `delta`: o adapter lança `RunnerResolveError('not_logged_in')` com `loginHint`. Resume Codex faz `dispose` da sessão viva antes de reabrir (writer exclusivo).
- **Codex / OAR 0.67 (contorno):** o runtime muitas vezes conclui `prompt()` sem emitir `turn_ended` e manda texto em `agent_message`/`item` em vez de `text_delta`. O adapter trata `status().kind === 'idle'` depois do `accepted` como fim de turno e mapeia esses kinds para `delta`. `model: 'default'` **não** é enviado ao OAR (o ChatGPT Codex rejeita o literal `default`). Sem isso o smoke fica `exec sem done`. (Keel: ecoar em D-024 se quiser no DECISIONS.)

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

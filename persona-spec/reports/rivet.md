# Relatos — Rivet (runners / vault / desktop)

Mais recente no topo.

---

## 03/11 19:08 — DSH API-key (Cofre) + D8 identidade sem toolchain ✔

### 1. DSH direto com chave no Cofre (Atlas 2)
- `createHttpDshAgent`: OpenAI-compat (DeepSeek / OpenRouter / `baseUrl`). Stream SSE → `delta`/`partial` no 1º token.
- `resolveRunner({ spec: { kind:'dsh', provider?, baseUrl? }, vault, personId })` sem `agent` lê `vault.get(personId, provider|'dsh')`. Sem chave → `not_logged_in` + hint do Cofre. Sem vault → `cli_not_found` (como antes).
- Chave **nunca** em erro/evento/JSON. Testes com `node:http` (llm-mock-server do Harness é Anthropic Messages, não chat/completions).
- Contrato em `contracts/runner.md`.

### 2. D8 prep sem toolchain (Atlas 3)
- `verifyPostInstall()` / `package-win.mjs --verify-identity`: protocol `persona://`, productName Persona, appId `com.persona.app`, flag unsigned, sem host deepseek.com, sem instalador admin. Não precisa de VS Build Tools. `exePresent` false até `--dir` desbloquear.
- NSIS / `--dir` completo: ainda E4/E5 admin Miguel + compiler do host (Anvil/Forge).

### [Rivet→Anvil]
DSH API-key: passar `vault` + `personId` + `spec.provider` (`deepseek`|`openrouter`|`openai-compat`) e `baseUrl` se self-host. Não precisa montar `agent`. Encaminhar `not_logged_in` ao Cofre.

### Arquivos
- `persona-runners/src/dsh/http-agent.ts`, `resolve/resolve-runner.ts`, `index.ts`
- `apps/desktop/scripts/{verify-post-install.ts,package-win.mjs}`
- testes: `http-agent.spec.ts`, `verify-post-install.spec.ts`
- `contracts/runner.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-runners/tests
 Test Files  21 passed (21)
      Tests  105 passed (105)
```

```
pnpm exec vitest run …/http-agent.spec.ts apps/desktop/tests/verify-post-install.spec.ts apps/desktop/tests/package-win.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 14.1s
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit
(exit 0)
```

### Fora / próximo
- D8 NSIS/`--dir`: admin Miguel + host compiler. Sem mais item PLAN do Rivet (D5a já entregue; PLAN ainda diz todo — Keel). Fila Atlas 2+3 desta rodada fechada.

---

## 03/11 18:32 — latência da conversa: pool quente + talk barato + 1º token imediato ✔

### O que ficou pronto
- **Pool de sessões quentes** por `persona|project|purpose|provider|model|cwd|permission|toolLevel`. TTL 10 min, teto 8. 2ª mensagem no mesmo runner só faz `prompt()` — não paga `runtime.session()`. `dispose()` / `disposeRunnerSessions()` no «Sair de vez» / pausa / troca de modelo; slot expirado/evicto também fecha. Plugin `ctx.personaRunners.resolveRunner` injeta `defaultRunnerPool`; `resolveRunner` direto (testes) não compartilha o global.
- **`prime()`** abre a CLI sem turno de modelo. **`prewarmCoordination`** = 1 sessão talk da Coordenação no boot.
- **Modelo por finalidade:** `purpose: 'talk' | 'task'`. Talk usa `spec.talkModel` ou `TRIAGE_MODELS` (Claude `haiku`, Codex `default`, OpenCode `beam-free`, Cursor `default`, DSH `deepseek-chat`). Task mantém o modelo forte. Documentado em `contracts/runner.md`.
- **1º token imediato:** `mayBecomeLogin` só segura prefixo de parede de login. Cada flush: `delta` + `partial` cumulativo + `report progress`. Anvil encaminha `partial` à UI sem esperar `ended`.
- Probe cache 60 s (auth/models); `accountUsage` pulado quando auth já está em cache.

### Smoke real (exceção Keel, 3 pares, claude haiku, mesma sessão)

| par | 1ª firstToken / total | 2ª firstToken / total |
|---|---|---|
| 1 | 4474 / 4770 ms | 2097 / 2313 ms |
| 2 | 5447 / 5613 ms | 795 / 841 ms |
| 3 | 7423 / 7787 ms | 2012 / 2054 ms |

2ª mensagem ~2–7× mais rápida (sem boot). 1º token da 1ª ainda oscila 4.5–7.4 s (meta <5 s: 1/3 abaixo). Totais ≪ 30 s. `partial` presente em todos.

### [Rivet→Anvil]
`resolveRunner({ purpose: 'talk' | 'task', … })`. Host boot: `ctx.personaRunners.prewarmCoordination({ spec, permissionMode: 'deny', personaId, projectId, cwd })` (1 sessão, sem gastar modelo). Encerrar: `disposeRunnerSessions()` / `runner.dispose()`. Encaminhar evento `partial` (texto acumulado) à UI no 1º chunk. Talk não manda o modelo forte.

### Arquivos
- `persona-runners/src/resolve/{session-pool,fastest-model,probe-cache,resolve-runner,smoke}.ts`
- `persona-runners/src/oar/{adapter,login-output,claude,codex}.ts`
- `persona-runners/src/{contract,index,plugin}.ts` + wrappers `prime`/`dispose`
- testes: `session-pool`, `oar-runners`, `resolve-runner`, `login-output`, `runner-contract`
- `persona-spec/contracts/runner.md`, `persona-spec/spikes/real-cli-smoke.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-runners/tests
 Test Files  20 passed (20)
      Tests  102 passed (102)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 28.2s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 61.3s
```

```
PERSONA_REAL_CLI=1 pnpm exec tsx packages/persona/persona-runners/scripts/warm-session-smoke.ts
```

(JSON no spike; 3 pares ready; sem token/e-mail.)

### Fora / próximo
- 1º token da 1ª mensagem ainda pode passar de 5 s (boot CLI). Prompt de talk = Forge.
- DSH API-key (Atlas 2) e D8 sem toolchain (Atlas 3) ainda na fila.
- D8 NSIS: admin Miguel. CLI real volta a congelar.

---

## 03/11 18:10 — permissões CLI sem `prompt` (D-013 / proposta D-052) + tool levels + smoke haiku ✔

### O que ficou pronto
- **CLIs nunca `prompt`.** `assertCliNeverPrompt` / `requireExplicitPermission(cli)` lançam pt-BR. `resolveRunner` recusa spec CLI + `prompt`.
- **Matriz persona→CLI** (`cliPolicyOf` / `grantsOf`):
  - (a) talk / `deny` / tools vazios → Claude `--permission-mode dontAsk` + denylist Bash/Edit/Write/Web*; Codex `OAR_CODEX_SANDBOX=read-only` (approval already `never`); Cursor `disallowedTools` sem `launchArgs`/`--force`; OpenCode sem denylist (ACP recusa).
  - (b) tarefa `allow-once` + `files: write` → Claude `acceptEdits`; Codex `workspace-write`; cwd = worktree.
  - (c) `app_request` / `can_use_tool` / `requestApproval` → `ended blocked` + `question: Precisa de você…`. Teste: `prompt()` do runtime pendura; o stream encerra em <1,5 s.
- **`withToolLevel`** no `resolveRunner` (DSH+OAR emitem `tool:<nome>`). MCP: `none` não anuncia nada; `read` só `persona_recall`.
- **ai-memory:** flag off; `shouldCaptureAiMemory` recusa `source: 'dm'`; `memoryNamespace(ws, project)`.
- **Smoke real (exceção Keel, 1 exec):** claude haiku, worktree temp, `hello.txt` = ok, `lastState: ready`, 9083 ms, tokens in 64441 / out 297. Sem 2ª/3ª exec.

### Contestação (Keel: D-052)
- `shell: safe` não existe no schema (`none|read|write`). Allowlist `git status` / test runner **não** é canal OAR (Claude/Cursor/OpenCode).
- OpenCode: só o gate do stream.
- Cursor `force` interno do OAR no resume (thread preso) **não** é grant de escrita — Persona nunca passa `--force`.
- Codex sandbox é `process.env.OAR_CODEX_SANDBOX` no `session()` (pin+restore).

### [Rivet→Anvil]
`permissionFor` / `cliPermissionOf` no host já mapeiam talk→deny e task+write→allow-once. **Nunca** passar `prompt` no resolve CLI. Passar `spec.tools` (`files`/`shell`/`web`). Tratar `ended.report.question` como Attention «Precisa de você».

### Arquivos
- `persona-runners/src/resolve/{cli-policy,tool-level,resolve-runner}.ts`
- `persona-runners/src/oar/{adapter,claude,codex,opencode,cursor}.ts`
- `persona-runners/src/mcp/persona-tools.ts`
- `persona-runners/src/dsh/runner.ts` (`tool:<nome>`)
- `persona-runners/src/memory/ai-memory.ts`
- testes: `cli-policy`, `tool-level`, `persona-mcp`, `draft-ai-memory`, `oar-runners`
- `persona-spec/contracts/runner.md` (matriz)

### Comandos

```
pnpm exec vitest run …/cli-policy.spec.ts …/tool-level.spec.ts …/oar-runners.spec.ts …/persona-mcp.spec.ts …/resolve-runner.spec.ts
 Test Files  5 passed (5)
      Tests  34 passed (34)
```

```
pnpm exec vitest run …/draft-ai-memory.spec.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 13.7s
```

```
pnpm exec tsx scripts/generate-typert.ts
FAILED: persona-host/src/orchestration.ts:197 public property missing explicit type annotation
(Anvil — não é pasta do Rivet)
```

```
PERSONA_REAL_CLI=1 pnpm exec tsx .maestri/tmp/rivet-claude-write-smoke.mts
{"execs":1,"model":"haiku","ms":9083,"lastState":"ready","wrote":true,"tokens":{"in":64441,"out":297}}
```

### Fora / próximo
- D8 NSIS: admin Miguel. `--dir` ainda depende do compiler do host.
- D10 bench: Probe.
- Preguiça real ≤2/CLI: congelada (esta exceção foi só o write haiku).
- Desktop robustez (instância única / recover host / updater GitHub Releases só preparado): já na leva 16:50–17:15.
- Fila Atlas 1–2 desta rodada fechada. Sem próxima Rivet desbloqueada além de mocks.

---

## 03/11 17:40 — login wall + descoberta CLI + D5a UsageStore ✔

### 1. "Not logged in" nunca é resposta de modelo
- Módulo `LOGIN_REQUIRED_PHRASES` por CLI (claude/codex/opencode/cursor) + `classifyLoginOutput`.
- Adapter segura o texto (~240 chars) e lança `RunnerResolveError('not_logged_in')` com `loginHint`. Sem `delta` com "Please run /login".
- Home isolado: `prepareIsolatedHome` copia só auth allowlist (`.credentials.json` / `auth.json`) ou **aponta** ao HOME real. Dir vazio **não** vira `CLAUDE_CONFIG_DIR`. Flag `PERSONA_ISOLATE_CLI_CONFIG=1` mantém isolamento cru.

### 2. Descoberta de CLIs
- Timeout/throw de `authStatus` ⇒ `authUnknown: true`, **não** `not_logged_in` (Claude auth ~5 s; 400 ms era falso negativo).
- `toUiConnection` não inventa logout. Contrato `runner.md` atualizado.

### 3. D5a UsageStore
- Port `UsageStore` (`record` / `query` / `totals`) + `createMemoryUsageStore`. Origem rotulada: oficial da CLI / medido por nós / estimado / indisponível.
- `officialQuota(cli)` timeout 8 s + cache 60 s; ausente ⇒ indisponível, nunca `usedPercent: 0`.
- `resolveRunner({ usageStore, usageScope })` grava measured no port.
- Anvil: SQLite + Remote `getUsage` / `getOfficialQuota`. Contrato `persona-spec/contracts/usage.md`.

### Arquivos
- `persona-runners/src/oar/{login-output,isolated-home,adapter,native-cli-env}.ts`
- `persona-runners/src/resolve/{errors,resolve-runner,connections,usage-meter}.ts`
- `persona-usage/src/{store,store-types,official-quota,types,plugin,index}.ts`
- testes: login-output, isolated-home, resolve-runner, usage
- `persona-spec/contracts/{runner,usage}.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-runners/tests/login-output.spec.ts …/isolated-home.spec.ts …/oar-runners.spec.ts …/resolve-runner.spec.ts packages/persona/persona-usage/tests/usage.spec.ts
 Test Files  5 passed (5)
      Tests  36 passed (36)
```

```
node scripts/persona/check-pkg.mjs persona-runners persona-usage
persona-runners: OK in 12.1s
persona-usage: OK in 5.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
FAILED: persona-host/src/index.ts:1424 OfficialQuota must be exported from a public non-root type subpath
(Anvil Remote — não é pasta do Rivet)
```

### Fora
- Anvil troca o default do host para HOME real e implementa SQLite/`getUsage`/`getOfficialQuota`.
- Typert host: Anvil precisa exportar `OfficialQuota` no subpath público.
- Sem CLI real nesta leva.

---


## 03/11 17:15 — D8 `--dir` + picker + harden/logs/splash ✔

### O que ficou pronto
- **D8 `--dir`:** `skipWindowsInstaller` no preflight quando `unsigned && directory`. Junction `C:\p8` + cache `C:\p8c`. Launcher chama `node_modules/pnpm/bin/pnpm.cjs` (sem `npm_execpath` o `runPnpm` recusa). Tentativa 5: `toolchain` 230ms; `run-gates: PASS native addon (3.09s)` e Host Typert; **FAILED host compiler** em `persona-host`/`persona-e2e` (TS6133/2379/2304/2345 — dono Anvil/Forge, não VCTools). `electron-builder` nem rodou. `exePresent` false. Spike: `persona-spec/spikes/packaging-win.md`. NSIS segue no admin do Miguel.
- **Picker (fila Keel, sem prioridade sobre D8):** `personaDesktop.pickDirectory({ title })` → caminho absoluto ou `null` (diálogo nativo, `dialog` injetável, sender validado, **nada gravado** — host valida em `setProjectRoot`). `personaDesktop.revealInFolder(path)` só em PERSONA_HOME, `projectRoots` do host, ou pick da sessão. Canal `dsh-desktop:reveal-in-folder`.
- **Harden:** `secure-shell.ts` — sandbox + contextIsolation + sem node/webview; CSP sem eval; navigate/`windowOpen` só `dsh-app:`/`persona:`/`data:`; permissão só notifications; `assertDesktopSender` estrutural; deep link `persona://task/{id}` = `[a-z0-9-]{1,64}`; `ipc-audit` falha se algum `ipcMain.handle/on` pular sender.
- **Logs:** `<PERSONA_HOME>/logs` 1 MiB / 7 dias; `looksLikeCredential` + corpo de msg/DM omitido; bandeja Abrir logs / Copiar diagnóstico.
- **Splash/reconectando:** tokens Muse (`#FAF3E4`/`#34243F`/`#E8AF54`) pt-BR/en.

### Dependências
- **Prism:** ligar `window.personaDesktop.pickDirectory({ title })` no "Novo projeto" e `revealInFolder` em "Mostrar na pasta". Plugin directory-picker do Harness continua off no perfil persona.
- **Anvil:** passar pastas de projeto registradas em `projectRoots` (hoje só PERSONA_HOME + picks da sessão). `setProjectRoot` continua no host.
- **Probe:** gate de boot no `Persona.exe` empacotado só quando `exePresent`.
- Host compiler vermelho bloqueia o `--dir` até Anvil/Forge limparem `persona-host`/`persona-e2e`.

### Arquivos
- `apps/desktop/src/{directory-picker,ipc,preload-app,main,secure-shell,persona-log,ipc-audit,deep-link,reconnecting-page,microphone-permissions,tray,locale}.ts`
- `apps/desktop/scripts/{package-win.mjs,package-target.ts,desktop-toolchain-preflight.ts}`
- testes: directory-picker, preload-app, ipc-audit, secure-shell, persona-log, deep-link, tray, desktop-build-commit, package-win, microphone-permissions
- `persona-spec/spikes/packaging-win.md`

### Comandos e saída verbatim

```
pnpm exec vitest run apps/desktop/tests/directory-picker.spec.ts apps/desktop/tests/preload-app.spec.ts apps/desktop/tests/ipc-audit.spec.ts apps/desktop/tests/secure-shell.spec.ts apps/desktop/tests/persona-log.spec.ts apps/desktop/tests/deep-link.spec.ts apps/desktop/tests/tray.spec.ts apps/desktop/tests/desktop-build-commit.spec.ts apps/desktop/tests/package-win.spec.ts apps/desktop/tests/microphone-permissions.spec.ts
 Test Files  10 passed (10)
      Tests  67 passed (67)
```

```
node scripts/persona/with-lock.mjs "Rivet D8 --dir" -- node --import tsx/esm apps/desktop/scripts/package-win.mjs --dir
dir.packageExit=1  dir.exePresent=false  dir.nativeHint=null
toolchain success 230ms
run-gates: PASS native addon (3.09s)
run-gates: PASS Host Typert (70.65s)
run-gates: FAILED host compiler (18.23s)  — persona-host + persona-e2e
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json
EXIT:0
```

```
pnpm exec tsc -p tsconfig.host.json --noEmit  | apps/desktop/
(saída vazia — 0 erros desktop; EXIT:2 só persona-host/tests/export.spec.ts)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 44.5s
```

### Fora / dúvidas
- Sem `Persona.exe`; boot empacotado não rodou.
- `native addon` PASS usou artefato já compilado — rebuild node-gyp sem VCTools ainda não foi visto.
- Fila Keel desta leva fechada. Sem "Atlas" no código.
- Status: `maestri note edit` timeout (pipe ok, HTTP /list FAILED). Prism ainda precisa ler este relato / retry do Status.

---


## 03/11 16:50 — desktop always-on + Codex `done: true` ✔

### O que ficou pronto
- **Codex smoke:** causa = OAR 0.67 sem `turn_ended` + `model: 'default'`/`gpt-5.5` rejeitado pelo ChatGPT Codex. Adapter: `agent_message`/`item` → `delta`; `status().idle` após `accepted` → `ended`; omite `model` quando é `default`. Re-smoke (3ª exec): `done: true`, firstToken 3778 ms, 27401/5, `ready`.
- **Cursor:** `not_logged_in` + `loginHint` "Abra o Cursor e faça login no Agent" (0 execs, sem stack). Lumen já mapeia `loginHint`/`errorCode` (relato 16:20).
- **Background:** fechar esconde + aviso 1ª vez; bandeja Abrir · Pausar a equipe · Sair de vez; single-instance; "Iniciar com o Windows" off até consentir (`setLoginItemSettings`); shutdown 10 s + WAL + `taskkill /T`; host morto → 3 retries 15/30/60 s + página `Reconectando…` (data: URL, sem tela branca).
- **Toasts:** budget/silêncio/agrupamento; `persona://task/{id}`; Notification injetável; AppUserModelID `com.persona.app`; IPC `personaAlwaysOn` (Prism/Anvil).
- **Power:** `prevent-app-suspension` só com assignment viva; resume/clock-jump → catch-up burst 3.
- **Backup:** zip PERSONA_HOME sem `.env`/plaintext; nota DPAPI mesma conta; restore só com confirmação + cópia `.safety-`.
- **Locale:** en/pt completos; outras 6 línguas com as mesmas chaves.

### Dependências (não bloqueiam)
- Anvil: `getAutonomy` (`proposalBudget`/`silenceStart`/`silenceEnd`) → `policyFromAutonomy`; `pauseTeam` já existe no host; renderer deve `personaAlwaysOn.attention` / `runningAssignments`.
- Keel: ecoar o contorno Codex em D-024 se quiser no DECISIONS.
- D8: ainda bloqueado em E4/E5 (vswhere/LongPaths/Developer Mode). Sem "Atlas" no código.

### Arquivos
- `packages/persona/persona-runners/src/oar/adapter.ts` + `tests/oar-runners.spec.ts`
- `apps/desktop/src/{main,preload-app,tray,notifications,power,backup,login-item,shutdown,host-process,backend-controller,always-on-ipc,deep-link,reconnecting-page,shell-prefs,locale,product}.ts`
- testes desktop: always-on-ipc, notifications, power, backup, tray, login-item, deep-link, shutdown, backend-controller
- `persona-spec/contracts/runner.md` · `persona-spec/spikes/real-cli-smoke.md`

### Comandos e saída verbatim

```
PERSONA_REAL_CLI=1 PERSONA_SMOKE_ONLY=codex node --import tsx/esm packages/persona/persona-runners/scripts/resolver-smoke.ts
{ "id": "codex", "execs": 1, "done": true, "usage": { "inputTokens": 27401, "outputTokens": 5 },
  "kinds": ["started", "delta", "report", "ended"], "firstTokenMs": 3778, "lastState": "ready", "summary": "turn ended" }
```

```
PERSONA_REAL_CLI=1 PERSONA_SMOKE_ONLY=cursor node --import tsx/esm packages/persona/persona-runners/scripts/resolver-smoke.ts
{ "id": "cursor", "execs": 0, "error": { "code": "not_logged_in", "message": "Abra o Cursor e faça login no Agent" } }
```

```
pnpm exec vitest run packages/persona/persona-runners/tests/oar-runners.spec.ts packages/persona/persona-runners/tests/resolve-runner.spec.ts apps/desktop/tests/backup.spec.ts apps/desktop/tests/notifications.spec.ts apps/desktop/tests/tray.spec.ts apps/desktop/tests/login-item.spec.ts apps/desktop/tests/power.spec.ts apps/desktop/tests/deep-link.spec.ts apps/desktop/tests/always-on-ipc.spec.ts apps/desktop/tests/shutdown.spec.ts apps/desktop/tests/backend-controller.spec.ts
 Test Files  11 passed (11)
      Tests  45 passed (45)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 15.8s
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit
EXIT:0
```

```
pnpm exec tsc -p tsconfig.host.json --noEmit 2>&1 | Select-String "apps/desktop/"
(saída vazia)
```

### Fora / próximo
Fila Keel always-on fechada. D8 continua bloqueado (admin Miguel). S4/PRO-3/D5a/D7 já entregues. Sem próxima tarefa Rivet desbloqueada.

---

## 03/11 16:40 — tsc gates (adapter outcome + desktop backup/notify/tray) ✔

### O que ficou pronto
- **OAR adapter:** `event.outcome` agora pode ser `TurnOutcome` **ou** string (`compaction_ended`). Narrow `typeof outcome === 'string'` antes de `.kind`/`.reason`. `kind` lido como `string` para mapear `item`/`agent_message` (Codex) sem TS2367.
- **`prompt()` ≠ fim de turno:** OAR 0.67 devolve `accepted`/`rejected` (o prompt começou). Tratar `accepted` como fim era o bug do smoke (`exec sem done` no Codex **e** quebrava o scripted). Fim = `turn_ended` **ou** `status().kind === 'idle'` depois do accept (contorno Codex sem `turn_ended`).
- **Desktop tsc:** `backup.ts` chama `now()`; `notifications.ts` trata `exec` `null`; `DesktopTrayOptions.pause` opcional (main pode passar só `{iconPath,locale,open,quit}`).
- **Keel:** D-024 addendum — contorno Codex no adapter + `contracts/runner.md`. Anvil: `listConnections` já manda `loginHint`; Lumen `connectionsToEntries` ainda descarta — UI precisa mostrar o hint (cursor `not_logged_in` esperado).

### Arquivos
- `packages/persona/persona-runners/src/oar/adapter.ts`
- `apps/desktop/src/{backup,notifications,tray}.ts`
- testes: `oar-runners.spec.ts`, `resolve-runner.spec.ts`, `backup.spec.ts`, `notifications.spec.ts`, `tray.spec.ts`, `backend-controller.spec.ts`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 12.1s
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit
EXIT:0
```

```
pnpm exec vitest run packages/persona/persona-runners/tests/oar-runners.spec.ts packages/persona/persona-runners/tests/resolve-runner.spec.ts apps/desktop/tests/backup.spec.ts apps/desktop/tests/notifications.spec.ts apps/desktop/tests/tray.spec.ts apps/desktop/tests/login-item.spec.ts apps/desktop/tests/power.spec.ts apps/desktop/tests/deep-link.spec.ts apps/desktop/tests/shutdown.spec.ts apps/desktop/tests/backend-controller.spec.ts
 Test Files  10 passed (10)
      Tests  40 passed (40)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 34.4s
```

### Fora / próximo
Re-smoke Codex ≤3 execs (fila always-on item 1) ainda pendente nesta passagem. Sem "Atlas" no código.

---

## 03/11 16:05 — resolveRunner + detectConnections + smoke + D8 check + THIRD_PARTY_NOTICES ✔

### O que ficou pronto
- **`resolveRunner` / `ctx.personaRunners.resolveRunner`:** spec `{kind:'dsh',model}` | `{kind:'cli',cli,model}`, `permissionMode` explícito, home isolado opcional, vault só em env efêmero. Embrulha `withInfraRecovery` + medidor de uso + `withObserveGate` se autonomia=`propose`. Erros `RunnerResolveError`: `cli_not_found` / `not_logged_in` / `model_unavailable` / `quota_exhausted` (pt-BR curto, sem stack, sem token).
- **`detectConnections`:** dsh+claude+codex+opencode+cursor; instalado/versão/logado/modelos/uso; `loginHint` de terminal; cache 60 s; timeout 8 s; sem segredos. Testes com fixtures `persona-e2e/fixtures/fake-cli`.
- **Smoke real (D-022):** 1 round pelo resolvedor. claude `done` 4090 ms (31083/4); opencode `done` 3050 ms; codex exec sem `done`; cursor `not_logged_in`. Seção nova em `spikes/real-cli-smoke.md`.
- **D8 `package-win.mjs --check`:** lista todos os pré-requisitos de uma vez. Bloqueado: VS Build Tools/SDK, LongPaths, Developer Mode. OK: disco 65.4 GB, Node v24.22.1, Electron, `node:sqlite`. `--dry` só monta pasta temp + boot gate quando desbloquear. Frase `miguel` + `verify` no JSON. Sem instalador admin. Sem "Atlas" no JSON.
- **THIRD_PARTY_NOTICES:** script lê deps de produção do desktop; teste falha se licença desconhecida; About lê o arquivo (`aboutLegalText`). 9 notices geradas.

### Anvil
Trocar `createHostRunner` por `ctx.personaRunners.resolveRunner`. `listConnections` ← `detectConnections()` (mapear `installed`/`loggedIn`/`loginHint`). Contrato em `persona-spec/contracts/runner.md`.

### Arquivos
- `packages/persona/persona-runners/src/resolve/{errors,probe,usage-meter,resolve-runner,connections,smoke}.ts`
- `packages/persona/persona-runners/src/{plugin,index,oar/claude,oar/codex,oar/opencode}.ts`
- `packages/persona/persona-runners/tests/resolve-runner.spec.ts` + plugin-composition
- `packages/persona/persona-runners/scripts/resolver-smoke.ts`
- `apps/desktop/scripts/{package-win,generate-third-party-notices}.mjs` + electron-builder extraResources
- `apps/desktop/src/{third-party-notices,legal-notices,main}.ts`
- `apps/desktop/resources/THIRD_PARTY_NOTICES.txt`
- `apps/desktop/tests/{package-win,third-party-notices,legal-notices}.spec.ts`
- `persona-spec/contracts/runner.md` · `persona-spec/spikes/real-cli-smoke.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-runners/tests/resolve-runner.spec.ts
 Test Files  1 passed (1) / Tests  5 passed (5)
```

```
pnpm exec vitest run packages/persona/persona-runners/tests/plugin-composition.spec.ts apps/desktop/tests/third-party-notices.spec.ts apps/desktop/tests/legal-notices.spec.ts apps/desktop/tests/package-win.spec.ts
 Test Files  4 passed (4) / Tests  5 passed (5)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 13.1s
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit
(exit 0)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 35.7s
```

```
PERSONA_REAL_CLI=1 node --import tsx/esm packages/persona/persona-runners/scripts/resolver-smoke.ts
claude execs=1 done firstTokenMs=4090 usage=31083/4
codex execs=1 done=false usage=0/0
opencode execs=1 done firstTokenMs=3050 usage=0/0
cursor execs=0 not_logged_in
```

```
node --import tsx/esm apps/desktop/scripts/package-win.mjs
blockers: vswhere/VCTools/SDK, LongPathsEnabled, Developer Mode
disk 65.4 GB · node v24.22.1 · electron · node:sqlite DatabaseSync  (exit 2)
```

```
node --import tsx/esm apps/desktop/scripts/generate-third-party-notices.mjs
apps/desktop/resources/THIRD_PARTY_NOTICES.txt
9 notices
```

### Fora / dúvidas
- `--dry` não montou (pré-requisitos ausentes). Pronto para correr quando Miguel aplicar a frase `miguel`.
- Codex neste round não emitiu 1º token/`done`.
- Host `createHostRunner` (Anvil) ainda é o fake/opencode por env — não toquei `persona-host`.
- Sem "Atlas" em código (D-043).

---

## 03/11 16:58 — S4 draft + legal NOTICE + ai-memory flag + D8 package-win ✔

### O que ficou pronto
- **S4:** `createDraftDriver` + `DRAFT_PERSONA_PROMPT`. Runner fake/scripted devolve JSON; sanitiza `systemRoles: []`, `canRecruit: false`, tools implícitas vazias. Sem coordenador no onboarding: `fallbackDraft` determinístico. Anvil pode trocar o draft do host por esta fábrica.
- **Legal (D-017):** NOTICE em runners/vault/usage (OAR Apache-2.0 + engine NOTICE). Desktop `PERSONA_DESKTOP_NOTICES` (DeepSeek MIT, OAR, engine). `wrangler`/`miniflare`/`workerd` só em `EDGE_ONLY_NOTICES` (persona-edge). Não toquei `scripts/gen-third-party-notices.ts`.
- **ai-memory:** `PERSONA_AI_MEMORY` padrão off; `createDisabledAiMemory` / `createFakeAiMemory` / `createAiMemory`. Sem binário, sem cota.
- **D8:** `apps/desktop/scripts/package-win.mjs` + `package:win`. Só `--check` (nunca admin install). Bloqueado: vswhere ausente + `LongPathsEnabled=0`.

### Arquivos
- `packages/persona/persona-runners/src/{draft/driver,memory/ai-memory,plugin,index}.ts`
- `packages/persona/persona-runners/tests/draft-ai-memory.spec.ts`
- `packages/persona/{persona-runners,persona-vault,persona-usage}/NOTICE`
- `apps/desktop/src/legal-notices.ts` + `apps/desktop/tests/legal-notices.spec.ts`
- `apps/desktop/scripts/package-win.mjs` + `apps/desktop/package.json` (`package:win`)
- `persona-spec/contracts/runner.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-runners/tests/draft-ai-memory.spec.ts packages/persona/persona-runners/tests/plugin-composition.spec.ts apps/desktop/tests/legal-notices.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

```
node scripts/persona/check-pkg.mjs persona-runners
persona-runners: OK in 12.2s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.3s
```

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit
(exit 0, sem linhas)
```

```
node --import tsx/esm apps/desktop/scripts/package-win.mjs
{
  "mode": "check",
  "unsigned": true,
  "adminInstall": false,
  "vswhere": { "ok": false, "detail": "vswhere.exe not found (E4: VS C++ Build Tools)" },
  "longPaths": { "ok": false, "detail": "LongPathsEnabled=0" },
  "blocked": true,
  "next": "Atlas/Miguel: E4 VS Build Tools + E5 LongPathsEnabled=1 / Developer Mode"
}
(exit 2)
```

### Fora / dúvidas
- Anvil: ligar `createDraftDriver` no host (`draftPersona`/`draftTeam`).
- D8 `:dir`/NSIS bloqueado em E4/E5 (Miguel/Atlas). Wrapper não instala.
- Re-smoke D9 autenticado ainda pendente (cota).
- Sigo: E4 observe-gate + D7 trilha de auditoria + E7 token de convite no cofre (máquina local).

---

## 03/11 16:52 — ícones desktop Persona (Brush) ✔

### O que ficou pronto
- SVG da marca Brush (lilás + Atlas) em `icon.svg` / `icon-windows.svg` / `icon-macos.svg` com `tray-glyph`.
- `render:tray-icon` gera tray ICO (16–64) e PNG 1024 (windows/macos/app).

### Arquivos
- `apps/desktop/resources/{icon,icon-windows,icon-macos}.svg` + `.png` + `tray-windows.ico`
- `apps/desktop/scripts/render-tray-icon.ts`

### Comandos
```
pnpm --filter @deepseek-ai/dsh-desktop run render:tray-icon
pnpm exec vitest run apps/desktop/tests/tray-icon.spec.ts apps/desktop/tests/installer-packaging.spec.ts
 Test Files  2 passed (2) / Tests  9 passed (9)
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit  → limpo
```

---

## 03/11 16:48 — locale.ts DesktopMessages (8 idiomas) ✔

### O que ficou pronto
- `aboutCredits` (exigida por `DesktopMessages` via `typeof en`) estava só em en/zh/ja/es/fr/de. Acrescentei em **ru** e **pt**.
- Alinhei About/Quit desses dois (e `quitTitle` de) para Persona. Os 8 dicionários satisfazem `DesktopMessages`.
- `pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit` — zero erros (nada em `locale.ts`).

### Arquivos
- `apps/desktop/src/locale.ts`

### Comandos e saída verbatim

```
pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit 2>&1 | Select-String -Pattern "locale.ts|error TS"
(exit 0, sem linhas)
```

### Fora / dúvidas
- Sigo a fila (identidade visual / legal / ai-memory / D8). `check-pkg` não cobre `apps/`; daqui em diante este tsc roda antes de relatar desktop.

---

## 03/11 16:18 — PRO-3 proatividade nos runners ✔

### O que ficou pronto
- Recuperação automática (`withInfraRecovery`) nos runners DSH e OAR: contexto cheio / conexão / processo morto / prompt de confiança → evento `infra`, nova sessão com handoff (`RECOVERY_NOTE` + `persona_recall(id)`) e backoff 15s/30s/60s.
- Goal: constante `GOAL_ROUND_DRIVER_NAME` para o host montar `@deepseek-ai/dsh-goal-round-driver` no DSH; `createGoalContinueDriver` + `continueDshGoal` fazem a continuação equivalente (resume/steer) nas CLIs; sem goal armado a equipe descansa.
- Prompt de executora: `executorPrompt` / `OWNER_NORMS` (terminar, verificar, evidência, próximo passo; nunca devolver trabalho do mandato). Primeiro `deliver` do session OAR prefixa as normas.
- Suíte `runLazinessSuite` (scripted/fake por padrão): multi-etapa, erro intermediário, ambiguidade pequena → `RunnerLazinessHint` para a UI. Real só com `PERSONA_LAZINESS_REAL=1` + `PERSONA_REAL_CLI=1`.
- Keel: montar `goal-round-driver` no perfil DSH (`persona-app`); Prism/Lumen leem `RunnerLazinessHint`.

### Arquivos
- `packages/persona/persona-runners/src/proactivity/{recovery,goal-continue,owner-prompt,laziness}.ts`
- `packages/persona/persona-runners/src/{contract,index,plugin,dsh/runner,oar/adapter,oar/session}.ts`
- `packages/persona/persona-runners/tests/proactivity.spec.ts`
- `persona-spec/contracts/runner.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-runners/tests/proactivity.spec.ts packages/persona/persona-runners/tests/plugin-composition.spec.ts
 Test Files  2 passed (2)
      Tests  10 passed (10)
```

```
node scripts/persona/check-pkg.mjs persona-runners persona-vault
persona-runners: OK in 10.4s
persona-vault: OK in 4.2s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 31.2s
```

### Fora / dúvidas
- Não montei `goal-round-driver` em `persona-app` (dir do Keel).
- Suíte real de preguiça não rodou (cota). Fake/scripted cobre os 3 cenários.
- Fila seguinte: identidade desktop / legal / ai-memory flag / D8 package-win.

---

## 03/11 16:10 — D9 login nativo + dispose Codex ✔

### O que ficou pronto
- Diagnóstico: D9 `logged_out` **não** era falta de login. Este processo herdava `CLAUDE_CONFIG_DIR` / `CODEX_HOME` do spike `ai-memory` (homes vazios). Sem esses overrides: `claude auth status` loggedIn true (max/claude.ai); `codex login status` ChatGPT.
- Padrão: runner/sonda/plugin removem isolamento herdado. Isolamento só com `configDir` / `homeDir` ou `PERSONA_ISOLATE_CLI_CONFIG=1`. Cursor não recebe `env` (OAR recusa).
- Codex: `dispose` da sessão viva antes do resume (writer exclusivo).
- Comparação OAR `authStatus`: com isolamento → `logged_out`; após `restoreNativeCliLogin` → claude `logged_in` plan max; codex `logged_in` method chatgpt. Sem e-mail/token.
- Smoke `PERSONA_REAL_CLI=1` interrompido ao relançar (não gastei a 2ª cota). Unitários cobrem env + dispose.

### Arquivos
- `packages/persona/persona-runners/src/oar/{native-cli-env,adapter,claude,codex,opencode}.ts`
- `packages/persona/persona-runners/scripts/{real-smoke,probe-clis,compare-auth}.ts`
- `packages/persona/persona-runners/tests/{native-cli-env,oar-runners}.spec.ts`
- `persona-spec/spikes/real-cli-smoke.md` · `contracts/runner.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-runners/tests/native-cli-env.spec.ts packages/persona/persona-runners/tests/oar-runners.spec.ts
 Test Files  2 passed (2)
      Tests  11 passed (11)
```

```
node --import tsx/esm packages/persona/persona-runners/scripts/compare-auth.ts
oarAuthWithIsolationEnv: claude logged_out, codex logged_out
oarAuthAfterRestoreNative: claude logged_in plan=max method=claude.ai; codex logged_in method=chatgpt
```

### Fora / dúvidas
- Re-smoke autenticado ainda pendente (interrupção). Rodar de novo com ≤3 execs/CLI quando o Atlas liberar cota.
- `HOME=''` neste shell também isolava; agora é removido.

---

## 03/11 15:51 — D9 + D5a + D7 + D8 (preparo) ✔ Anvil sem pedido de API

### O que ficou pronto
- **D9:** `PERSONA_REAL_CLI=1` rodou claude → codex → opencode (3 execs cada) e skip cursor. Spike em `persona-spec/spikes/real-cli-smoke.md`. Cota **3+3+3+0 = 9** (limite 10/CLI). Sem token/e-mail.
- **D5a:** livro `foldUsage` (provider/modelo/janela; origem = a mais fraca do grupo); `readOarAccountUsage` / `readCodexRolloutLimits` / `readDeepSeekBalance`; `labelledEstimate`; ausência nunca vira `usedPercent: 0`. Contrato `persona-spec/contracts/usage.md`.
- **D7:** `createWatchdogDriver` — `claimDue` do Anvil, sinais puros do Forge, avisos deduplicados, sem write em ticket. Fake runner. Contrato em `persona-spec/contracts/runner.md`.
- **D8:** política mandatória omitida quando `unsigned`; `productName`/`protocolo`/`artifactName`/`appId` Persona; exe `Persona.exe`; publish scripts e workflows upstream desligados; `--check` sob a trava **passou da config** e parou no toolchain.

### Arquivos
- `packages/persona/persona-runners/scripts/real-smoke.ts` + `src/oar/adapter.ts` + `src/watchdog/driver.ts`
- `packages/persona/persona-usage/src/{types,book,official,index}.ts` + `tests/usage.spec.ts` + fixtures
- `apps/desktop/scripts/{electron-builder-config,desktop-package-environment,package-target,package-macos,smoke-packaged-runtime,desktop-build-version-discovery,desktop-upload-plan,retain-desktop-ci,installed-update-distribution}.mjs|ts`
- `apps/desktop/cli/{dsh,dsh.cmd}` · `apps/desktop/package.json` (`upload:*` → exit 1)
- `.github/workflows/{desktop-publish,windows-package,macos-package,macos-intel-package,release-publish,release-vendor,release-vendor-publish,build-preview-cloudflare,docs-pages}.yml` (`if: false`)
- goldens `apps/desktop/tests/expected/{publication-*,test-release-upload-*}`
- `persona-spec/spikes/real-cli-smoke.md` · `contracts/{usage,runner}.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-runners persona-vault persona-usage
persona-runners: OK in 24.3s
persona-vault: OK in 23.9s
persona-usage: OK in 45.5s
```

```
pnpm exec vitest run packages/persona/persona-usage packages/persona/persona-runners/tests/watchdog.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

```
PERSONA_REAL_CLI=1 node --import tsx/esm packages/persona/persona-runners/scripts/real-smoke.ts
claude logged_out haiku execs=3 trivial/resume lastState=failed stream=started+delta+report+ended cancel=dropped
codex logged_out gpt-5.5 execs=3 trivial=failed resume="thread already has an active writer" cancel=dropped
opencode auth=skipped beam-free execs=3 trivial=ok ready resume=ok ready cancel=dropped
cursor skipped auth=logged_out execs=0
```

```
pnpm exec vitest run apps/desktop/tests/desktop-package-environment.spec.ts … retain-desktop-ci.spec.ts
 Test Files  10 passed (10)
      Tests  176 passed | 1 skipped (177)
```

```
pnpm exec vitest run apps/desktop/tests/desktop-publication-preflight.spec.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

```
node scripts/persona/with-lock.mjs "Rivet D8 unsigned --check" -- pnpm run package:desktop:win:x64:unsigned -- --check
Error: desktop package: the build host cannot run this packaging sequence:
  vswhere: spawn C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe ENOENT
```

```
pnpm exec tsx scripts/generate-typert.ts
TypertAnalysisError: typert(host): packages/persona/persona-host/src/orchestration.ts:89:3: public property is missing an explicit type annotation
(Anvil — não toquei)
```

### D8 — o que ainda bloqueia (Atlas → Miguel; não instalei)

1. **VS C++ Build Tools + Windows SDK** — `vswhere.exe` ausente (`Program Files (x86)\Microsoft Visual Studio\Installer\`). Precisa `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` (compila `window-frame.dll` 32-bit). Admin.
2. **LongPathsEnabled=0** (`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`). Admin.
3. **Developer Mode** — `AllowDevelopmentWithoutDevLicense` vazio. Admin.

Já ok: `tar` (system32), Python 3.13.15. `--check` **não** pediu `.env.windows` nem política (P0-2 aplicado). Sem assinatura / sem COS.

### Upstream (1 linha cada)
- `apps/desktop/scripts/electron-builder-config.mjs` — unsigned omite policy; identidade Persona.
- `apps/desktop/scripts/desktop-package-environment.mjs` — unsigned skip policy; `localWindowsPackageEnvironment` `com.persona.desktop`.
- `.github/workflows/*` listados — `if: false` para não publicar DeepSeek.

### Limitações
- D9: claude/codex `logged_out` — precisa login do Miguel para rodada autenticada. Codex resume precisa `dispose` antes. Cursor skip correto. Usage OAR 0/0.
- generate-typert vermelho no host do Anvil (`orchestration.ts:89`), não nos pacotes do Rivet.
- D8 `:dir` / instalador completo bloqueados por E4/E5. Strings do shell (P0-6) ainda DeepSeek.
- Anvil: sem pedido de ajuste de API no Status; fábricas documentadas em `contracts/runner.md`.

---

## 03/11 14:32 — typecheck + A3b + R-1 + R-2 + D1/D2 + D3 + D4a + ai-memory ✔ fila imediata vazia

### O que ficou pronto
- **Typecheck de pacote COM testes:** `exactOptionalPropertyTypes` no emit do DSH session runner (omite `requestId`/`error` quando undefined); `COORDINATION_*` reexportados de `coordination/driver.ts`; adapter/tests no port Forge (`ensureSession`/`deliver`/`whenIdle`…); `resolve` unused no OAR cancel.
- **A3b:** identidade Persona no Electron (`product.ts`, Welcome/updater off, `persona://`, `~/.persona`, filtro de hosts DeepSeek, brand inlined, pin de `document.title` + `page-title-updated`). `dev:desktop` com perfil persona abre janela cujo **documentTitle é `Persona`**. Empacotamento exe/appId fica para D8.
- **R-1:** `createFakeRunner` + `createDshSessionRunner` implementam o port Forge; `createExecutorAdapter` reusa start/deliver/stop do engine; testes de conformidade (idempotência, bash stripped, job >5 s, cancel).
- **R-2:** `createCoordinationDriver` — sessão longa, sem bash, prompt completo via P6 `composePrompt` (coordinator+dispatch+replies+subscriptions), identidade da persona (D-043, zero `Atlas` em `persona-runners/src`). Mock: Trigger → accept → Ticket → Assignment; reply ≤100 palavras só pela Coordenação; steer/followup/inject idempotentes por request id.
- **D1a/D1b + D2:** OAR claude/codex/opencode/cursor (permissão explícita, resume, cancel, usage; `CLAUDE_CONFIG_DIR` isolado). `createOarSessionRunner` expõe o port de sessão. Sonda cursor refeita: `@cursor/sdk` 1.0.37 resolve (subpath `package.json` não é exportado).
- **D3:** `servePersonaMcpTools` / `personaMcpTools` — identidade do run; ator forjado recusado; `persona_report` atualiza o Ticket.
- **D4a:** cofre DPAPI (`persona-vault` + IPC `safeStorage` no main) já no tree; check-pkg verde.
- **ai-memory:** spike em `persona-spec/spikes/ai-memory-windows.md` — GO com ressalvas (binário+serve ok; sessão Claude→Codex não rodada por cota).

### Arquivos
- `packages/persona/persona-runners/src/{port,fake,executor-adapter,index}.ts`
- `packages/persona/persona-runners/src/dsh/session-runner.ts`
- `packages/persona/persona-runners/src/coordination/{prompt,driver}.ts`
- `packages/persona/persona-runners/src/mcp/persona-tools.ts`
- `packages/persona/persona-runners/src/oar/{adapter,claude,codex,opencode,cursor,session}.ts`
- `packages/persona/persona-runners/scripts/probe-clis.ts`
- `packages/persona/persona-runners/tests/*`
- `apps/desktop/src/{main,product,deepseek-hosts,project-manager,persona-vault-ipc}.ts`
- `packages/persona/persona-vault/src/*`
- `persona-spec/spikes/{oar-windows,ai-memory-windows}.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-runners persona-vault persona-usage
persona-runners: OK in 10.6s
persona-vault: OK in 3.2s
persona-usage: OK in 3.0s
```

```
pnpm exec vitest run packages/persona/persona-runners apps/desktop/tests/persona-decouple.spec.ts
 Test Files  8 passed (8)
      Tests  42 passed (42)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 28.5s
```

```
node scripts/persona/with-lock.mjs "Rivet A3b desktop rebuild" -- pnpm --filter @deepseek-ai/dsh-desktop run build
exit 0 (tsdown lib/main.js 885.37 kB)
```

```
node scripts/persona/with-lock.mjs "Rivet A3b title proof" --release-on "DevTools listening|dsh desktop:|CDP listening" -- node .maestri/tmp/rivet-a3b-title.mjs
{"skipBuild":true,"pageUrl":"dsh-app://app/","documentTitle":"Persona","nativeWindows":[],"ok":true}
exit 0
```

```
pnpm exec tsx packages/persona/persona-runners/scripts/probe-clis.ts
cursor.cursorSdkVersion: "1.0.37"
cursor.installation.kind: "available"
cursor.mcpServers.supported: false
claude/codex/opencode: available (auth claude+codex agora logged_out)
```

### Upstream (1 linha cada)
- `apps/desktop/src/main.ts` — pin do título nativo/documento para Persona (renderer ainda embarca DSH Local Build).
- `apps/desktop/src/product.ts` + `deepseek-hosts.ts` — identidade e filtro de hosts DeepSeek.
- `packages/util/home-paths` — `PERSONA_HOME` / `resolvePersonaHome` (default `resolveDshHome` continua `~/.dsh`).

### Limitações
- `MainWindowTitle` nativo vazio no Windows com titlebar hidden; aceite = `document.title === "Persona"`.
- Rename de exe/appId de empacotamento é D8.
- Cursor sem MCP (OAR recusa); ferramentas Persona nas CLIs = claude/codex/opencode.
- Claude/Codex `logged_out` nesta sonda (antes estavam logged_in); sem prompt real.
- ai-memory: sem sessão Claude→Codex (cota).
- Fila imediata vazia.

---

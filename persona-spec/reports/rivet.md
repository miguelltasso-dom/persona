# Relatos — Rivet (runners / vault / desktop)

Mais recente no topo.

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

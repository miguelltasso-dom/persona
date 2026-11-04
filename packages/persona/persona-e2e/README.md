# @deepseek-ai/dsh-persona-e2e

End-to-end harness for Persona: **Tier 1** (`persona` profile host + Playwright Chrome), **Tier 2** (Electron + CDP + OS screenshot), **preview visual diff**, motion/jank probes, and **fake CLIs** on `PATH`. Owned by Probe; see `persona-spec/RECON.md` §6 and `persona-spec/PLAN.md` task A6.

Only **one** heavy host (web `persona` profile or `start:desktop`) at a time — parallel vitest files will block on `with-lock.mjs` and can time out. Run Tier 1 and Tier 2 smokes sequentially when diagnosing.

**Vitest hygiene (Atlas / Keel):** always `pnpm exec vitest run …` — never `vitest watch`. Prefer one E2E spec file at a time on Windows. Subprocess contracts pass `--testTimeout 120000 --hookTimeout 180000 --teardownTimeout 120000` via `run-vitest-subprocess.ts`. Stale fork trees (>15 min, multi‑GB): `node scripts/persona/reap-orphans.mjs` then `node scripts/persona/reap-orphans.mjs --kill` (never kills `apps/cli/src/bin.ts` / Maestri).

Long-running apps use the shared lock with **early release** (see `persona-spec/BUILDER-RULES.md`):

```sh
node scripts/persona/with-lock.mjs "Probe <label>" --release-on "dsh web:|DevTools listening" -- <command>
```

`startWebHost` / `startDesktop` wrap this automatically so builds are not blocked while the app keeps running.

**Lock queue vs host boot:** D-062 splits **`build.lock`** (builds, E2E, gate) from **`pack.lock`** (Rivet installer worktree). Old Rivet runs may still hold `build.lock` until they finish; `with-lock` exit **75** = wait-max — retry. If another builder holds `build.lock`, `startWebHost` fails with `BuildLockContentionError` after `PERSONA_LOCK_WAIT_MS` (default 12 min). After the lock is released, `PERSONA_HOST_BOOT_MS` (default 240 s) applies for the `dsh web:` line. Wrapping a spec in outer `with-lock` sets `PERSONA_LOCK` → `startWebHost` uses direct launch (no nested lock). Optional `PERSONA_HOST_NO_LOCK=1` when artifacts are already built.

Use disposable `PERSONA_HOME` / `DSH_HOME` (and `DSH_DESKTOP_USER_DATA_DIR` for desktop). Never point tests at the operator’s real home.

## Prerequisites

- `pnpm run build:artifacts` (Keel/Probe, under lock) so `apps/web/dist` exists.
- Chrome installed locally (Playwright `channel: 'chrome'`).
- Tier 2: `pnpm --filter @deepseek-ai/dsh-desktop exec install-electron`.
- Optional: `@axe-core/playwright` (ask Keel to add to this package) for a11y scans in preview-visual.

## Commands (from repository root)

Skeleton (always runs in default `vitest`):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/smoke.spec.ts
```

Persona profile boot gate (Keel `ui-boot-check`; fails on activation warnings + console errors):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-persona.spec.ts
```

**Real gallery** (all panels → `.maestri/tmp/shots/real/` + `index.md`; ~15–25 min):

```sh
node scripts/persona/with-lock.mjs "Probe real gallery" -- node --import tsx/esm scripts/persona/capture-real-gallery.mjs
```

**Wave 2 aceite** (BRIEFING 17 — `persona-spec/WAVE2.md`; skeleton `it.todo` until builders land):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-wave2.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-wave2-contract.spec.ts
```

Layer-1 contract gates ignore inherited `PERSONA_E2E` in subprocesses; optional gallery block needs `PERSONA_CONTRACT_INCLUDE_GALLERY=1` in addition to `PERSONA_E2E=1`.

**Bring your context** (BRIEFING 18 — `persona-spec/BRING-YOUR-CONTEXT.md`; skeleton `it.todo` until Forge/Lumen/Prism land):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-bring-your-context.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-bring-your-context-contract.spec.ts
```

**Gestor de equipe** (BRIEFING 20 — `persona-spec/MAESTRO.md`; selo **Gestor**; never "Maestro" in UI):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-team-manager.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-team-manager-contract.spec.ts
```

**Token optimization** (`persona-spec/TOKEN-OPTIMIZATION.md`; gate with Forge):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-token-scenarios.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-token-scenarios-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-activity-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-opt-levers-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/org-chart-fixtures.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-working-send-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-import-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-s7-host-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-scope-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-v1-close-contract.spec.ts
```

**Fechamento v1** (`persona-spec/reports/v1-close.md`; Forge `measureV1CloseView` / `assertV1Close`):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-v1-close-contract.spec.ts
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-v1-close.spec.ts
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/dogfood-agencia.spec.ts
```

**Org-chart scale** (60/150 personas — GOVERNANCE-SPEC § muitas personas):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-org-chart-scale.spec.ts
```

Muse capture in the real app: `applyDevSeedLargeTeam(150)` from `client-ui-persona/src/client/data/dev-seed-large-team.ts` (or `localStorage` keys `persona.devSeed.v1` + `persona.orgChartScaleSeed`), reload, open **Quem cuida de quem** (seed wins over host RPC). Gallery E2E: `PERSONA_E2E=1` + `real-gallery-org-chart-scale.spec.ts` / `real-gallery-two-day-health.spec.ts`.

Layer-1 contract gates drop inherited `PERSONA_E2E` in subprocesses; optional gallery needs `PERSONA_CONTRACT_INCLUDE_GALLERY=1` with `PERSONA_E2E=1`.

**Second brain** (BRIEFING 19 — `persona-spec/SECOND-BRAIN.md`; permission adversarial matrix in contract spec):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-second-brain.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-second-brain-contract.spec.ts
```

**Panel health gate** (Keel — blank cream, stuck `Carregando…`/skeleton >5s, console fatals `ERR_INSUFFICIENT_RESOURCES`/`Maximum update depth`/`#185`, onboarding overlay with cache complete; dev seed):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/real-gallery-blank-panel.spec.ts
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/real-gallery-panel-gate.spec.ts
```

**Keel repro on running host** (e.g. porta 3191):

```sh
node --import tsx/esm scripts/persona/keel-panel-diag.mjs "http://127.0.0.1:3191/?token=..."
```

**A11y matrix** (axe + Tab per nav panel; needs `@axe-core/playwright` when Keel adds it):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/real-surface-a11y.spec.ts
```

**Team governance** (`GOVERNANCE.md` §4 — todos until Forge/Anvil/Lumen/Prism/Muse ship):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-governance.spec.ts
```

**Project boards** (`PROJECT-BOARDS.md` §3 — todos until Forge/Anvil/Lumen/Prism ship):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-project-boards.spec.ts
```

**B9 real app** (profile `persona`, no Harness shell; onboarding, kanban, dirD, reduced-motion):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-b9-real-app.spec.ts
```

**Boot gates (`ui-boot-check.mjs`, `real-app-shots.mjs`)** — default path walks the five-step onboarding on a clean `PERSONA_HOME`. For faster captures only, set `PERSONA_DEV_SEED=1` so Playwright writes `persona.devSeed.v1` before load (dev roster seed; never enabled in shipped UI).

Tier 1 smoke (legacy composer wait; opt-in):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-web.spec.ts
```

Harness profile fallback (`web` + composer):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-web-harness.spec.ts
```

Tier 2 smoke (Electron + CDP; opt-in):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-desktop.spec.ts
```

Preview visual diff + motion/jank + HTML report (`artifacts/visual-diff-report.html`):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/preview-visual.spec.ts
```

Refresh preview baselines after intentional UI changes:

```sh
$env:UPDATE_BASELINE='1'; $env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/preview-visual.spec.ts
```

Fake CLI unit checks:

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/fake-cli.spec.ts

### GOV-10 / PB-9 contracts (layer 1, no browser)

```powershell
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-governance-contract.spec.ts
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-project-boards-contract.spec.ts
```

Gallery smoke: `real-gallery-governance.spec.ts`, `real-gallery-project-boards.spec.ts` (needs `PERSONA_E2E=1`).

### Publish boot (clean HOME tour, keyless)

```powershell
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-boot-publish-contract.spec.ts
node --import tsx/esm scripts/persona/persona-boot-smoke.mjs --root .
```

### PRO-6 proactivity (layer 1, no browser)

```powershell
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-proactivity-contract.spec.ts
```

Replays `persona-engine` `proactivity-v1` + `persona-runners` PRO-3 recovery. App/E2E layer 2: `mandatory-proactivity.spec.ts` (`it.todo`).

### Installed NSIS / unpacked `Persona.exe` (D8, CDP)

DeepSeek **Welcome** is skipped via `DSH_DESKTOP_WELCOME=0` in `installedDesktopLaunch`; **Persona onboarding (5 steps) is not skipped** — clean `PERSONA_HOME` + `DSH_DESKTOP_USER_DATA_DIR`.

After Miguel installs with `/S /D=…`, pass the exe path:

```powershell
node --import tsx/esm scripts/persona/installed-onboarding-cdp.mjs "C:\pb\persona-probe\Persona.exe"
# or
$env:PERSONA_INSTALLED_EXE='C:\...\Persona.exe'
node --import tsx/esm scripts/persona/installed-onboarding-cdp.mjs
```

Artifacts: `packages/persona/persona-e2e/artifacts/installed-onboarding-{renderer,os}.png`. Optional `PERSONA_E2E_KEEP_HOME=1` retains homes under `.maestri/tmp/e2e-installed-*`.
```

Mandatory product scenarios (SCOPE.md — `it.todo` until features land; reduced-motion + dirD under `PERSONA_E2E=1`):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-scope.spec.ts
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-scope.spec.ts
```

Proactivity v1 acceptance (PROACTIVITY.md / PRO-6 — `it.todo` until engine + Vigia land):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-proactivity.spec.ts
```

Package typecheck:

```sh
pnpm exec tsc -p packages/persona/persona-e2e/tsconfig.json --noEmit
```

Builder delivery log: `persona-spec/reports/probe.md`.

Screenshots and reports live in `packages/persona/persona-e2e/artifacts/` (gitignored).

## API surface

- `startWebHost({ profile?: 'persona' | 'web', home?, env? })` → `{ url, stop }`
- `openPage(url)` → Playwright session with `screenshot`, `ariaSnapshot`, console tripwire
- `startDesktop({ ... })` → `{ page, stop }` via CDP (lock released on DevTools ready)
- `launchUnderLock({ releaseOn, ... })` → shared lock helper
- `osScreenshot(path)` → Windows full-screen capture
- `withFakeCliOnPath({ turnMs?, fail?, reply? })` → prepend `fixtures/fake-cli` to `PATH` **and pin `OAR_CLAUDE_BIN`/`OAR_CODEX_BIN`/`OAR_OPENCODE_BIN` to the stubs** (a fake run can never reach a real engine; `restore()` undoes both). The stub answers a whole stream-json turn (claude) / JSON-RPC turn (codex): `FAKE_CLI_TURN_MS` latency, `FAKE_CLI_FAIL` (`1`, a message, `crash`, `quota`), `FAKE_CLI_REPLY` text, `FAKE_CLI_INPUT_TOKENS`, `FAKE_CLI_MODEL`; the success `result` carries measured `usage`/`modelUsage` so the ledger records a **measured** execution.
- `scope.invocations()` / `scope.logFile` → every call the app (or the test) made through the stubs (`FAKE_CLI_LOG`, one JSON line per process start and per answered turn): proof that the delivery came from a real CLI turn, and a way to see why a detection card says "Não detectada" (empty log = the app never ran the stub).
- `withNoEngineOnPath()` → the opposite: minimal `PATH`, OAR pins to a missing file, no `DEEPSEEK_API_KEY` (the "Falta uma IA" path, deterministic on a PC that has real CLIs)
- `openRealPersonaApp({ engine: { kind: 'fake', turnMs?, reply?, fail? } | { kind: 'none' }, liveRunner?, keepOnboarding? })` → `liveRunner` boots the host like the desktop (`PERSONA_REAL_CLI=1`, `VITEST` cleared) so the stubs answer instead of the scripted runner; `keepOnboarding` leaves the five-step overlay for the test to walk
- `scanAccessibility(page)` → axe when installed, otherwise skip

Real CLIs stay **read-only** unless `PERSONA_REAL_CLI=1` and Atlas approves (D-022).

## First delivery (V1-P0) with the fake CLI

UI end to end, no model call, opt-in `PERSONA_E2E=1` (one host boot per scenario, ~90 s):

```powershell
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-first-delivery-fake.spec.ts --testTimeout 400000 --hookTimeout 400000
```

- **happy**: onboarding 1–5 → "Pedir agora" → "Equipe trabalhando" → "Sua equipe entregou o primeiro trabalho!" → "Aceitar e entrar" → the reply is in #geral and the board is open; ask → celebrate < 2 min.
- **no-engine**: step 5 shows "Falta uma IA para a equipe trabalhar." + "Conectar uma IA"; no working/celebrate state; the person can enter.
- Installed exe: `mandatory-first-delivery-installed.spec.ts` (`PERSONA_INSTALLED_EXE=<Persona.exe>`), same two scenarios.
- Evidence: `artifacts/first-delivery/<scenario>/proof.json` + screenshots. The REAL-engine run is `mandatory-first-delivery-real.spec.ts` (Keel-approved budget only).

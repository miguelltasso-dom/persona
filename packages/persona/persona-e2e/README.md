# @deepseek-ai/dsh-persona-e2e

End-to-end harness for Persona: **Tier 1** (real `dsh web` + Playwright Chrome), **Tier 2** (Electron + CDP + OS screenshot), and **fake CLIs** on `PATH`. Owned by Probe; see `persona-spec/RECON.md` §6 and `persona-spec/PLAN.md` task A6.

Heavy repo commands (`build:artifacts`, `start:desktop`, packaging) must run under the shared lock:

```sh
node scripts/persona/with-lock.mjs "Probe <label>" -- <command>
```

Use disposable `PERSONA_HOME` / `DSH_HOME` (and `DSH_DESKTOP_USER_DATA_DIR` for desktop). Never point tests at the operator’s real home.

## Prerequisites

- `pnpm run build:artifacts` (Keel/Probe, under lock) so `apps/web/dist` exists.
- Chrome installed locally (Playwright `channel: 'chrome'`).
- Tier 2: `pnpm --filter @deepseek-ai/dsh-desktop exec install-electron`.

## Commands (from repository root)

Skeleton (always runs in default `vitest`):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/smoke.spec.ts
```

Tier 1 smoke (real host + UI; opt-in):

```sh
# PowerShell
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-web.spec.ts

# bash
PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-web.spec.ts
```

Tier 2 smoke (Electron + CDP; opt-in; skips if Electron binary missing):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-desktop.spec.ts
```

Fake CLI unit checks:

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/fake-cli.spec.ts
```

Mandatory product scenarios (SCOPE.md — tracked as `it.todo` until UI/host exist):

```sh
pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-scope.spec.ts
```


Package typecheck:

```sh
pnpm exec tsc -p packages/persona/persona-e2e/tsconfig.json --noEmit
```

Screenshots land in `packages/persona/persona-e2e/artifacts/` (gitignored).

## API surface

- `startWebHost({ home?, env? })` → `{ url, stop }`
- `openPage(url)` → Playwright session with `screenshot`, `ariaSnapshot`, console tripwire
- `startDesktop({ ... })` → `{ page, stop }` via CDP
- `osScreenshot(path)` → Windows full-screen capture
- `withFakeCliOnPath()` → prepend `fixtures/fake-cli`

Real CLIs stay **read-only** unless `PERSONA_REAL_CLI=1` and Atlas approves (D-022).

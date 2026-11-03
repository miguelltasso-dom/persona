# @deepseek-ai/dsh-persona-e2e

End-to-end harness for Persona: **Tier 1** (`persona` profile host + Playwright Chrome), **Tier 2** (Electron + CDP + OS screenshot), **preview visual diff**, motion/jank probes, and **fake CLIs** on `PATH`. Owned by Probe; see `persona-spec/RECON.md` §6 and `persona-spec/PLAN.md` task A6.

Only **one** heavy host (web `persona` profile or `start:desktop`) at a time — parallel vitest files will block on `with-lock.mjs` and can time out. Run Tier 1 and Tier 2 smokes sequentially when diagnosing.

Long-running apps use the shared lock with **early release** (see `persona-spec/BUILDER-RULES.md`):

```sh
node scripts/persona/with-lock.mjs "Probe <label>" --release-on "dsh web:|DevTools listening" -- <command>
```

`startWebHost` / `startDesktop` wrap this automatically so builds are not blocked while the app keeps running.

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
node scripts/persona/with-lock.mjs "Probe real gallery" --release-on "dsh web:" -- node --import tsx/esm scripts/persona/capture-real-gallery.mjs
```

**A11y matrix** (axe + Tab per nav panel; needs `@axe-core/playwright` when Keel adds it):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/real-surface-a11y.spec.ts
```

**B9 real app** (profile `persona`, no Harness shell; onboarding, kanban, dirD, reduced-motion):

```sh
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-b9-real-app.spec.ts
```

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
- `withFakeCliOnPath()` → prepend `fixtures/fake-cli`
- `scanAccessibility(page)` → axe when installed, otherwise skip

Real CLIs stay **read-only** unless `PERSONA_REAL_CLI=1` and Atlas approves (D-022).

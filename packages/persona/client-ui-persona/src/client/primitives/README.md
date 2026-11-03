# Persona UI primitives (Lumen + Prism)

**Owner:** Prism (`theme`, `motion`, this folder). **Lumen** builds secondary surfaces under `src/{kanban,files,routines,usage,connections,knowledge}/` and should import shared UI from here — never duplicate tokens or motion rules.

## Import paths (same package)

```ts
import { PersonaButton, PersonaPanel, PersonaMuted, StaggerEntrance } from '../primitives/index.ts'
import { usePersonaMotion, PERSONA_MOTION_PRESETS } from '../theme/index.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { installPreviewTheme } from '../preview/install-preview-theme.ts'
```

Production Cordis code uses `ctx.locale.bind(NS)`; previews/tests pass a `LocaleDict` (`pt` from `locale/<feature>/locales.ts`).

## Rules

- **No hex in components** — only `var(--persona-*)` / mapped `--dsw-alias-*` from `theme/persona-palette.css`.
- **Copy:** typed dictionaries only; no literal UI strings in JSX.
- **Motion:** always `usePersonaMotion` (respects reduced-motion, `document.hidden`, IntersectionObserver pause).
- **Do not** import Prism feature folders (`onboarding/`, `shell/`, …) from Lumen trees; share only this folder + `theme/` + `preview/locale-bind.ts`.

## Preview / tests

Use `PreviewFrame` + `installPreviewTheme()` for isolated screenshots (light/dark via `document.body.setAttribute('data-ds-dark-theme', 'true')`).

## Locales

Add `locale-sources/<feature>.{pt,en}.json`, run `node scripts/persona/gen-client-ui-persona-locales.mjs`, register namespace in `src/client/index.ts`.

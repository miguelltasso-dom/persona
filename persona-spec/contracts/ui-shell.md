# UI shell contract (Prism ↔ Lumen)

**Prism** owns `packages/persona/client-ui-persona/src/client/{theme,motion,primitives,shell,overview,chat,team,onboarding,persona-editor,hire,locale}`.

**Lumen** owns `packages/persona/client-ui-persona/src/client/{kanban,files,routines,usage,connections,knowledge}` (+ queue 2: profile, memory, skills, approvals, rules, members, importers, canvas when contracted).

## Shared imports (Lumen)

| Need | Import |
| --- | --- |
| Tokens / palette side-effect | `../client/theme/index.ts` |
| Motion | `../client/motion/index.ts` → `usePersonaMotion` |
| Buttons, panel, stagger | `../client/primitives/index.ts` |
| Preview theme (tests only) | `../client/preview/install-preview-theme.ts` |
| Locale bind (tests) | `../client/preview/locale-bind.ts` |

Production: `ctx.locale.bind('<namespace>')` — Lumen registers its namespaces in `kanban/register-lumen-ui.tsx` (called from `mount.ts`); Prism keeps shell/onboarding/editor/hire in `src/client/index.ts`.

**Do not** import Prism feature folders (`shell/`, `overview/`, …) from Lumen code.

## SlotMap augmentation

Prism side-effect: `src/client/shell/persona-slots.ts` (imported from `mount.ts`) declares `sidebar`, `main`, `shell.overlay`, `sidebar.settings` on `@deepseek-ai/dsh-client-ui-slots`.

## Root slot (`PersonaAppFrame`)

Prism registers **`root`** and declares children:

| Slot | Kind | Owner |
| --- | --- | --- |
| `sidebar` | single | Prism (`PersonaSidebar`; filho `sidebar.settings` → `ui-settings-general`) |
| `main` | keyed | Prism + Lumen (panel id = key) |
| `shell.overlay` | list | Prism (`persona.onboarding` overlay id; modals, toasts) |

Lumen **must not** register `root` or `sidebar`.

## Main panel keys (Lumen registers these)

| Key | Surface |
| --- | --- |
| `overview` | Prism — Visão geral |
| `kanban` | Lumen |
| `files` | Lumen |
| `routines` | Lumen |
| `usage` | Lumen |
| `connections` | Lumen |
| `knowledge` | Lumen |

Registration pattern (after `remote`, `slots`, `locale` inject):

```ts
ctx.slots.register({
  name: 'main',
  key: 'kanban',
  locale: 'persona.kanban',
  inject: () => ({ /* plain data/callbacks */ }),
}, KanbanView)
```

Sidebar labels for Lumen panels: `persona.shell` keys `sidebar.kanban`, `sidebar.knowledge`, `sidebar.routines`, `sidebar.files`, `sidebar.usage`, `sidebar.connections` (see `PersonaSidebar` NAV + `locale-sources/shell.*.json`).

## PB-5 — Projetos → quadro + abas do workspace (Prism shell ↔ Lumen kanban)

| Mechanism | Owner | Behavior |
| --- | --- | --- |
| `ShellState.boardsFocusProjectId` + `openProjectBoard(projectId)` | Prism (`create-shell-store.ts`) | Sidebar **Projetos** calls `openProjectBoard` → `activePanel: 'kanban'` and one-shot focus id. |
| `clearBoardsFocusProject()` | Prism inject → Lumen kanban slot | `ConnectedGlobalKanban` consumes focus on mount/effect, opens project mode, then clears id (no sticky re-open). |
| `navigateProjectTab(tab)` | Lumen registration, Prism bridge | Non-`board` tabs call `selectPanel`: conversation → `channels`, files → `files`, routines → `routines`, sprints → `kanban` (stub until sprint surface is scoped). |
| `getProjectConversation(scope)` | Anvil Remote | `{ channelId, name }` of this project's `#geral`. `createProject` creates it (`geral:<projectId>`). Prism opens that channel on the Conversa tab. |
| `ProjectWorkspaceTabs` | Prism component | Rendered on project flow board when `onWorkspaceTabChange` is wired; locale keys `project.tabs.*` in `persona.kanban`. |

Prism passes `LumenShellBridge` from `mount.ts` (`selectPanel`, `clearBoardsFocusProject`, `shell` observable).

## State chips / cards (primitives)

Use **`PersonaPanel`**, **`PersonaButton`**, **`PersonaMuted`**. Status text + icon (never color alone — UX-GUIDE §2.5). Optional future exports: `PersonaStatusChip`, `PersonaEmptyState` (Prism); until then mirror `overview/AttentionSection.tsx`.

## Remote

Host: `@deepseek-ai/dsh-persona-host` namespace `persona`, method `ping`. Prism mounts via `mountPersonaUi` in `src/client/mount.ts`.

## i18n

- Source: `locale-sources/<feature>.{pt,en}.json`
- Generator: `node scripts/persona/gen-client-ui-persona-locales.mjs`
- No literal UI strings in JSX.

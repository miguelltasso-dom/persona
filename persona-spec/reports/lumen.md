# Lumen — relatos de implementação UI

## 2026-11-03 17:26 — Mount shell + fila 2 + gate ui-boot

**Pronto:** Seis superfícies registradas em `register-lumen-ui.tsx` (`main`: kanban, knowledge, routines, files, usage, connections) + locales; sidebar NAV com rótulos `persona.shell`; `mount.ts` chama `registerLumenUi` e ping host **após** inject; `tsconfig` inclui todo código Lumen; fila 2 (profile, memory, skills, approvals, rules, members, importers, canvas) com mocks tipados `@deepseek-ai/dsh-persona-core`, testes queue2 verdes; fixes tsc (CSS modules, `carry`, profile não repassa dict errado para Memory/Skills).

**RCD:** sidebar expõe valor (Kanban, Cofre, Rotinas…) antes de host B3; empty states mantidos nos previews.

**Arquivos principais:**
- `packages/persona/client-ui-persona/src/client/kanban/register-lumen-ui.tsx`
- `packages/persona/client-ui-persona/src/client/{shell/create-shell-store.ts, shell/PersonaSidebar.tsx, mount.ts}`
- `packages/persona/client-ui-persona/locale-sources/shell.{pt,en}.json`
- `packages/persona/client-ui-persona/tsconfig.json`, `package.json` (devDep persona-core)
- `persona-spec/contracts/ui-shell.md`
- Fila 2: `src/client/{profile,memory,skills,approvals,rules,members,importers,canvas}/**`, `tests/lumen-queue2.client.spec.tsx`

**Upstream (1 linha cada):**
- `mount.ts` / `PersonaSidebar` / `create-shell-store.ts` — contrato ui-shell: Lumen main keys + navegação (Keel).
- `mount.ts` ping dentro do inject — host online sem ler remote antes do inject.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
→ exit 0

pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
→ Test Files  13 passed (13) / Tests  28 passed (28)

node scripts/persona/with-lock.mjs "Lumen ui boot" -- node scripts/persona/ui-boot-check.mjs
→ console errors (0): (none)
→ shots .maestri/tmp/shots/persona-light.png, persona-dark.png (sidebar com Kanban…Conexões; host online p1)
```

**Fora / próximo:**
- Anvil B3: adaptadores Remote tipados `persona-host/src/types.ts` no lugar dos mocks.
- Fila 2 no app: keys/sidebar no contrato + `register-lumen-ui` (ou Prism) quando Keel estender `MainPanelId`.
- Probe: captura com painel Kanban ativo (hoje gate abre overview + overlay onboarding).
- `pnpm install` (Keel) para link formal de `@deepseek-ai/dsh-persona-core` no lockfile se ainda não aplicado.

## 2026-11-03 14:08 — Fila C6a–D4b/D5b (preview isolado)

**Pronto:** Seis superfícies Lumen em `src/client/{kanban,knowledge,routines,files,usage,connections}/` com mocks, dicionários via `locale-sources/*.json` + gerador, estados vazio/carregando/erro/cheio, `usePersonaMotion` + `PersonaButton`, Kanban D-029 (5 colunas, chip aguardando evento, selo de desfecho, drag lift, patinhas ao concluir), Uso (origem medido/estimado/oficial/indisponível, `—` sem 0% falso, aviso contextual), Conexões (CLIs + login nativo, value first).

**RCD:** Never ship a blank dashboard (empty + ilustração SVG + 1 primária); Expansion is born of usage (limite inline); Value first, ask later (conexões); Neutrality is omission (1 primária por tela).

**Arquivos principais:**
- `packages/persona/client-ui-persona/src/client/kanban/*` (ProjectKanban, GlobalKanban, KanbanBoard, stage-map, PersonaSurface)
- `packages/persona/client-ui-persona/src/client/knowledge/KnowledgeVault.tsx`
- `packages/persona/client-ui-persona/src/client/routines/RoutinesView.tsx`
- `packages/persona/client-ui-persona/src/client/files/FilesView.tsx`
- `packages/persona/client-ui-persona/src/client/usage/UsageLimits.tsx`
- `packages/persona/client-ui-persona/src/client/connections/ConnectionsView.tsx`
- `packages/persona/client-ui-persona/locale-sources/{kanban,knowledge,routines,files,usage,connections}.{pt,en}.json`
- `scripts/persona/gen-client-ui-persona-locales.mjs` (bundles Lumen)
- `packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx`, `lumen-surfaces.client.spec.tsx`

**Upstream (1 linha):** `scripts/persona/gen-client-ui-persona-locales.mjs` — registrar bundles i18n Lumen no pipeline existente.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
```
Saída: `Test Files  12 passed (12)` / `Tests  21 passed (21)` (após `--no-cache`).

```
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
```
Saída: exit 0.

**Fora / próximo:**
- Prism: registrar namespaces `persona.kanban|knowledge|routines|files|usage|connections` em `src/client/index.ts` + slots shell.
- Anvil: Remotes → substituir mocks por store tipado em `persona-host/src/types.ts`.
- Probe: capturas claro/escuro vs `dirD-tela.png` (persona-e2e).
- FLIP persona carregando cartão: hook quando evento host existir (mock `carry` preparado no tipo).

**Realinhamento Keel:** pastas movidas de `src/{kanban,...}` para `src/client/{kanban,...}`.

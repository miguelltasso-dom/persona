# Lumen — relatos de implementação UI

## 2026-11-03 17:12 — Muse revisão (e) parte 1 — SCREEN-SPECS + tokens

**Pronto:** Telas pendentes alinhadas a `SCREEN-SPECS.md`: **ApprovalsInbox**, **TriageRulesView** (`Input` nos limites), **MembersView**, **CanvasView** (`Tabs` canvas/lista), **PersonaProfilePage** (`Screen`/`Tabs`/herói `Card`), **ImportWizard**. `header.eyebrow` + `subtitle` (perfil) nos `locale-sources` (en/pt) + `gen-client-ui-persona-locales.mjs`. Migração CSS Lumen: `--persona-active-*` / `--persona-lilac-*` → semânticos em knowledge, files, routines, usage, connections, kanban, canvas, `ProactivityMetrics`, `ApprovalsProactivity`; gaps kanban → `--persona-space-*`. **ProactivityMetricsPanel** deixou `LumenPage.module.css`.

**Pendente Muse (captura):** `design-shots.mjs panel:*` quando host (Anvil P0) voltar. **Opcional follow-up:** `MemoryPanel`/`SkillsPanel`/`ProactiveDailySummaries` ainda importam `LumenPage.module.css`; sweep rem restante em usage/knowledge/routines CSS.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx packages/persona/client-ui-persona/tests/observable-bridges.client.spec.ts packages/persona/client-ui-persona/tests/connected-kanban.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx
→ 6 files / 24 passed
```

## 2026-11-03 17:05 — React #185 + SCREEN-SPECS (Cofre, Uso, Rotinas, Arquivos)

**Pronto:** `createLiveTenantObservable` com cache referencial (fix #185 Kanban/remotos). Pass Muse em **KnowledgeVault**, **UsageLimits**, **Usage.module.css** (barras sunken + âmbar/danger), **RoutinesView**, **FilesView** — `Screen`/`ScreenHeader`/`Card`/`Chip`/`Tabs`/`Button`/`Skeleton`, `header.eyebrow` nos locales.

**Fila Muse (resto):** Aprovações, Regras, Perfil, Membros, Importadores (receita comum).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx
→ 11 passed
```

## 2026-11-03 17:00 — Kanban + Conexões (SCREEN-SPECS)

**Pronto:** `Screen` + `ScreenHeader` + `Card`/`Chip` + `EmptyState`/`ErrorState`/`Skeleton` (illustrações Brush). Kanban: filtros em `Card`, colunas `--persona-paper-sunken`, tickets `Card padding="s" interactive`, chips sem emoji, `PawTrail` na celebração. Conexões: grade 2 col, `empty-connections`. Removido `withLumenPanelBoundary` (Muse `PanelBoundary` no frame). Host: `listConnections` tipado (`kind: row.id`, filtro de `error.code`).

**Fix React #185 (Muse):** `createLiveTenantObservable` alocava um `PersonaTenantSnapshot` novo a cada `getSnapshot()` → `useTenant(s => s)` via uSES entrava em loop. Agora cache por referência do live snap + snapshots canônicos loading/error + igualdade de scope.

**Testes:** `live-tenant-bridge.client.spec.tsx` (estabilidade + `ConnectedGlobalKanban` com `createSnapshotStore` + `bindSnapshotSelector`), `connected-kanban`, `kanban-preview` → 8 passed nesse trio.

## 2026-11-03 — Galeria real (`real-app-shots`)

**Pronto:** run com skip de onboarding (`persona.onboarding.complete.v1`) concluiu; `.maestri/tmp/shots/real/` inclui os 12 painéis Lumen (`kanban`, `knowledge`, `routines`, `files`, `usage`, `connections`, `approvals`, `rules`, `profile`, `members`, `importers`, `canvas`) + shell/canal. Disponível para pass Muse.

## 2026-11-03 16:35 — PRO-5 Remote: decide + limites + métricas

**Pronto:** `RemoteApprovalsPanel` → `decideApproval` (reativo + resumo diário com `approvalKind`); `RemoteRulesPanel` → `setProjectLimits` (Salvar nos limites); perfil: taxa de aceitação derivada de `getOverviewNow` (ou `—` sem entregas). **D5b** uso: já via `RemoteUsagePanel` + `limitsToUsageMeters` (origem rotulada).

**Dependências:** `putAttentionPolicy` / editar janelas de silêncio na UI; bench preguiça real (Rivet); PRO-6 E2E (Probe); aceite `(app)` PRO-5.

**Arquivos:** `approvals/*`, `rules/TriageRulesView.tsx`, `data/{lumen-remote-panels,adapters/proactive}.ts`, `profile/ProactivityMetricsPanel.tsx`, `locale-sources/profile.*`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-*.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx
→ 5 files / 28 tests passed
```

## 2026-11-03 16:25 — Revisar ligado ao Remote + Kanban

**Pronto:** `reviewSummaryFromHost` + `KanbanReviewSheet` (`acceptReview` / `requestChanges` / `discardReview`, conflito → chip Bloqueado). **Kanban produção:** `ConnectedGlobalKanban` + `KanbanWithReview` (inject `persona` + `refresh`); botão **Revisar** em `in_review`/bloqueado. Locale `persona.review` registrado. Contrato `lumen-rpc.md` § Revisar.

**Dependências:** `acceptReview.mode` fixo `ff` até política de merge no projeto; taxa de aceitação no perfil ainda estimada (70%); PRO-6 E2E (Probe).

**Arquivos:** `review/{KanbanReviewSheet,KanbanWithReview}.tsx`, `remote/ConnectedGlobalKanban.tsx`, `kanban/{KanbanCard,GlobalKanban}.tsx`, `register-lumen-ui.tsx`, `data/adapters/review.ts`, `contracts/lumen-rpc.md`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 28 tests passed
```

## 2026-11-03 16:20 — Conexões (loginHint + erros) + painel Revisar (ReviewDelivery)

**Pronto:** `connectionsToEntries` preserva `loginHint` / `error` do host (`loggedIn`, códigos `cli_not_found` | `not_logged_in` | `quota_exhausted`), mensagem pt-BR na linha, **Copiar comando** (sem campo de token, D-015). Anvil: `listConnections` passa por `toUiConnection`. **Revisar:** `ReviewDeliveryPanel` (arquivos +/−, patch, truncagem/redação, testes citados, Aceitar âmbar / Pedir ajustes / Descartar com confirmação; conflito = chip Bloqueado · Precisa de você). `RemoteReviewDeliveryPanel` stub até RPC Anvil.

**Dependências:** `persona.reviewSummary` / accept / requestChanges / discard no Remote; abrir painel a partir do card Kanban em revisão.

**Arquivos:** `connections/*`, `data/adapters/{connections,review}.ts`, `review/*`, `locale-sources/{connections,review}.*`, `persona-host/{types,index}.ts`, `gen-client-ui-persona-locales.mjs`, testes `lumen-surfaces` + `lumen-rpc-adapters`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 26 tests passed
```

## 2026-11-03 19:58 — Contrato `lumen-rpc.md` (Anvil) ligado nos painéis

**Pronto:** RPCs `listCanvas`, `listDailySummaries`, `listRoutineSchedule`, `listTriageLog`, arquivos `need-root` + `setProjectRoot` (estado `needRoot` pt-BR, ação primária). Adaptadores `triage`, `proactive`, `routines`, `canvas`; `GlobalKanban` deriva filtros dos cards (sem `MOCK_KANBAN_FILTERS` em produção). Overview/canal sem fallback mock. **Muse:** não toquei `theme/` nem `primitives/`; aguardo `DESIGN-SYSTEM.md` + specs por tela.

**Dependências:** seletor nativo de pasta (hoje `prompt` de caminho absoluto até picker desktop); `listConnections` async Rivet; memória/skills no perfil ainda preview local.

**Arquivos:** `data/lumen-remote-panels.tsx`, `data/adapters/{triage,proactive,routines,canvas}.ts`, `files/{FilesView,pick-project-root}.ts`, `kanban/{derive-filter-options,GlobalKanban}.tsx`, `remote/Connected*.tsx`, `locale-sources/files.{pt,en}.json`, `tests/lumen-rpc-adapters.client.spec.ts`, `scripts/persona/real-app-shots.mjs`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 23 tests passed

node scripts/persona/with-lock.mjs "Lumen lumen-rpc shots" -- node scripts/persona/real-app-shots.mjs
→ parcial: kanban.png, routines.png, usage.png (+ shell/channel); demais nav — script ajustado (labels pt/en + navigation scope) para próximo run
```

## 2026-11-03 19:15 — Muse (design) + B9 fechamento Remote

**Design:** Muse (Opus) passa a ser dona de theme/primitivos/identidade; Lumen mantém telas e aplica specs da Muse quando publicadas (devolver `.maestri/tmp/shots/real/` após cada pass).

**Pronto (Remote):** Canal #geral sem fallback de mock (`ConnectedGeneralChannelView`); `RoutinesView`/`CanvasView`/`PersonaProfilePage` só dados via props (Remote ou testes); fila 1+2 já em `Remote*Panel` + `ConnectedGlobalKanban`.

**Gaps Anvil:** histórico de execuções de rotina, grafo canvas, log triage, resumo proativo RPC.

## 2026-11-03 18:35 — B9 Remote real (Keel): mocks só em testes

**Pronto:** Produção usa `ctx.remote.persona` via `createLiveTenantObservable` (sem bootstrap duplicado). **Queue 1:** `ConnectedGlobalKanban` + `Remote*{Knowledge,Routines,Files,Usage,Connections}Panel` em `register-lumen-ui.tsx`. **Queue 2:** `register-prism-screens.tsx` registra `Remote*{Approvals,Rules,Profile,Members,Import,Canvas}Panel` (Prism mantém overview/canais/projetos). Adaptadores em `src/client/data/adapters/*`; painéis em `lumen-remote-panels.tsx`. Views sem defaults de mock (`initialCards`/`items`/`entries` vazios). Testes passam mocks explicitamente.

**Gaps (Anvil / follow-up):** Canvas sem RPC (empty); resumo proativo diário vazio em aprovações; `RoutinesView` ainda renderiza grade mock quando host tem rotinas; triage log sem RPC; arquivos podem falhar sem `project.rootPath`.

**Arquivos:** `data/{live-tenant-bridge,lumen-remote-panels,lumen-inject,use-persona-remote-load,remote-call}.ts`, `data/adapters/*`, `kanban/register-lumen-ui.tsx`, `shell/register-prism-screens.tsx`, testes `lumen-*` + `kanban-preview`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 4 files / 18 tests passed

node scripts/persona/with-lock.mjs "Lumen real shots" -- node scripts/persona/real-app-shots.mjs
→ .maestri/tmp/shots/real/{kanban,knowledge,…}.png
```

## 2026-11-03 15:16 — Proatividade v1 (PROACTIVITY.md) — UI Lumen

**Pronto:** (1) **Aprovações** — `ProactiveDailySummaries` agrupa propostas do dia por persona (`data-persona-approvals="proactive-daily"`), aceitar/recusar/editar, prévia impacto + custo; reativas em seção “Precisa de você agora”. (2) **Regras** — limites (propostas/dia, tokens persona/projeto), janelas de silêncio, log modo “só registrar”. (3) **Perfil** — `ProactivityMetricsPanel` (propostas, aceitas, ociosidade, bench preguiça). Mocks em `proactivity-mock-data.ts`, locales pt/en, `tests/lumen-proactivity.client.spec.tsx`.

**RCD:** orçamento de atenção (resumo vs ping); uma pergunta por cartão reativo; value-first nos limites editáveis.

**Arquivos:** `approvals/{ApprovalsInbox,ProactiveDailySummaries,proactivity-mock-data}.*`, `rules/{TriageRulesView,mock-data,RulesProactivity.module.css}`, `profile/{ProactivityMetricsPanel,mock-data}.*`, `locale-sources/{approvals,rules,profile}.*`, `tests/lumen-proactivity.client.spec.tsx`, fix `tests/lumen-queue2` (h3 reativo).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit → exit 0
pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
→ Test Files 14 passed (14) / Tests 31 passed (31)
```

**Fora:** wire RPC (engine/Vigia + host types); registrar approvals/rules/profile no shell; aceitar/recusar persistidos.

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

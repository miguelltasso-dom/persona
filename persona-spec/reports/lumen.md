# Lumen — relatos de implementação UI

## 2026-11-03 19:18 — PB-5 §1 Quadros (BOARDS-SPEC) + cartão Kanban Muse

**Pronto:** Rail **Kanban → Quadros** (`shell` locale). Slot `kanban` agora abre **`BoardsHome`** (`data-persona-boards`): grade 320px, selo do modelo (BrandIcon/UiIcon até Brush `flow-*`), chips modelo+sprint, **barra de categorias** (`--persona-cat-*`), avatares 24px sobrepostos, chip “Precisa de você”. Mocks **Contratação + Site** para captura Muse; `deriveBoardSummaries` usa host quando ≥2 projetos. Drill-down abre **`KanbanWithReview`** filtrado por projeto (interim até colunas de fluxo PB-4). **Cartão:** avatar 24 + chip estado, projeto, prazo/dep/evidência, menu ⋯ (sem `<select>`), coluna vazia `EmptyState` compact + min-height 420px. **`usePersonaRemoteLoad`:** `loadRef` + deps estáveis (P0 tempestade). Instrumentação `personaRemoteLoadStartCounts`.

**Capturas Muse:** `node scripts/persona/design-shots.mjs panel:Quadros` → `.maestri/tmp/shots/design/panel-quadros-light.png`, `panel-quadros-dark.png` (380 chars main, **0** console errors).

**Fila PB (próximo):** §2 quadro por fluxo (colunas 296px, faixa sprint, WIP, needs_you tint), §3 planejamento, §4 encerrar sprint, §5 editor — depende **Anvil PB-4** + assets Brush `empty-col-*` / `sprint-concluida`. Visão global raias recolhíveis.

**Testes:**
```
pnpm exec vitest run …/boards-home.client.spec.tsx …/kanban-preview …/connected-kanban …/live-tenant-bridge …/lumen-a11y …/remote-load-storm
→ 6 files / 22 passed (storm 3 + boards 1 + kanban 4 + connected 1 + bridge 2 + a11y 10)
pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
```

## 2026-11-03 18:20 — Capturas Muse pós-unwrap + design-shots wait

**Pronto:** Após fix Prism (bootstrap/conflict), **`design-shots.mjs`** re-run **Kanban / Conexões / Aprovações** (light+dark) — Kanban **451 chars** (não mais skeleton infinito); 6 PNG em `.maestri/tmp/shots/design/`. Script: **`waitPanelSettled`** antes do screenshot; aliases de painel; waits para knowledge/files/routines/usage. **Canvas G2:** linhas da lista com `tabIndex` + foco visível. **D5b:** UI + `usageBookToMeters` + Remote já entregues (PLAN `todo` é flag Keel).

**Pendente:** lote `panel:Conhecimento|Arquivos|Rotinas|Uso` **enfileirado** atrás do lock `ui-boot-check` (Prism). **axe/Lighthouse** = Probe PRO-6.

**Testes:**
```
pnpm exec vitest run …/lumen-a11y …/connected-kanban …/lumen-rpc-adapters → 3 files / 19 passed
```

## 2026-11-03 18:12 — a11y sweep superfícies + Conexões live region

**Pronto:** **`lumen-a11y.client.spec.tsx`** ampliado (10 casos): Aprovações (`h2` reativo + botão primário), Conexões (`aria-busy` loading + `role="status"` ao copiar comando), Cofre (tab focável), Membros (convite). **Conexões:** loading unificado em `PersonaSurfaceLoading`; anúncio SR ao copiar (`aria-live="polite"`). **G2 (PLAN):** modo lista + teclado nos nós Canvas já coberto nos testes anteriores.

**Capturas Muse:** `design-shots.mjs panel:Kanban panel:Conexoes panel:Canvas` → 4 PNG (`panel-kanban-*`, `panel-canvas-*` em `.maestri/tmp/shots/design/`). Kanban ainda **“Carregando quadro…”** (bootstrap live store: `createWorkspace` conflict + unwrap); Conexões falhou nav **Conexoes** sem acento → corrigido alias no script. **Dependência:** Prism/Anvil bootstrap verde para shots úteis.

**Fila Lumen restante:** re-shot painéis com dados reais pós-host; **axe/Lighthouse** = aceite Probe (PRO-6).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts
→ 3 files / 26 passed
```

**Post-it:** `18:12 Lumen — a11y 10 tests (aprovações/conexões/cofre/membros); Conexões copy live region; capturas design-shots tentadas.`

## 2026-11-03 18:05 — Canvas a11y + Kanban FLIP + testes

**Pronto:** **Canvas (G2):** região `a11y.graphRegion`, dica `a11y.graphHint`, nós SVG com `Enter`/`Espaço`, `aria-pressed`, `role="status"` ao selecionar; foco visível no círculo; aba Lista com `<th scope="col">`. **Kanban FLIP:** `use-kanban-flip.ts` + `data-persona-kanban-card` (WAAPI, off em `prefers-reduced-motion`). **Testes:** `lumen-a11y` +2 (canvas teclado + lista).

**Microcópia:** vazios/retries já consistentes nos 20 bundles (sem “Falha”/“Clique aqui”).

**Fila restante (Atlas):** axe/Lighthouse manual (Probe pode assumir); **`design-shots.mjs panel:*`** → **depende host bootstrap** (Prism unwrap + Anvil P0). Escritas memória/skills no UI fora do escopo v1 read-only.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx
→ 2 files / 9 passed
```

**Post-it:** `18:05 Lumen — Canvas a11y+FLIP kanban; lumen-a11y 5 tests; capturas aguardam host.`

## 2026-11-03 18:00 — Atlas fila: a11y Kanban + microcópia import + motion hover

**Pronto (a11y, lente-acessibilidade):** Região do quadro com `a11y.boardRegion` (não mais só dica de arrastar). Contagem por coluna com `a11y.columnCount` interpolada. **WCAG 2.5.7:** `<select>` “Mover tarefa para” em cada card quando `onMoveCard` existe (teclado + leitor de tela). Filtro de estágio com `aria-labelledby` (`useId`). Foco visível no select. **`lumen-a11y.client.spec.tsx`** (região, move select, `aria-pressed`, stepper import).

**Microcópia:** `importers` `error.title` pt/en humanizado (sem “Falha na importação” seco).

**Motion (parcial UX-GUIDE):** hover lift nos cards Kanban + respeito `prefers-reduced-motion`. FLIP / carry avatar já existentes; capturas Muse ainda pendentes.

**Locale en:** paridade pt/en verificada nos 20 `locale-sources` (sem chaves faltando).

**Fila restante:** axe/Lighthouse manual em todas as telas; sweep microcópia completo (botões/vazios); FLIP kanban refinado; **`design-shots.mjs panel:*`** (depende host Anvil/Prism bootstrap).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx
→ 3 files / 15 passed (incl. 7 kanban+a11y)
```

**Post-it Persona · Status:** `18:00 Lumen — a11y Kanban (move select 2.5.7), lumen-a11y tests, import error copy, card hover; capturas aguardam host.`

## 2026-11-03 17:50 — Atlas: D5a Uso + memória/skills Remote

**Pronto:** **Uso (D5b UI + D5a livro):** `RemoteUsagePanel` chama `getUsage` (mês UTC) + `getOfficialQuota` via `personaScreensRemote`; `usageBookToMeters` (sem `0%` falso). **Perfil:** `listMemory` / `listSkills` no load do `RemoteProfilePanel` → `MemoryPanel` / `SkillsPanel` com dados reais (preview isolado mantém mocks). **`persona-screens-remote.ts`** (padrão review wire). Adaptadores `adapters/{usage,memory,skills}.ts`.

**Fila Lumen (Atlas 17:56 restante):** a11y (axe/teclado), lente-microcópia sweep, motion UX-GUIDE (kanban FLIP/patinhas), locale `en` completo, capturas Muse pós-host.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 3 files / 18 passed
```

## 2026-11-03 17:43 — Muse captura (review-lumen-light): loading + Kanban + Import + layout

**Pronto:** **Loading infinito** — causa principal: `initialState` congelado em `useState` (Kanban global, Cofre, Arquivos, Rotinas, Uso); agora sync + `initialCards` effect. **Timeout 8 s** em `usePersonaRemoteLoad` + tenant gate → `ErrorState` com microcópia Muse (`error.title` pt/en via `patch-lumen-remote-error-copy.mjs`) + **Tentar de novo** (`onRemoteRetry` nos painéis Remote). **Kanban:** filtros Equipe/Projeto/Persona com `KanbanFilterSelect` (chevron `UiIcon`); Estado = botões-adesivo `aria-pressed`; estágio usa `initialState` live. **Importar:** stepper estilo onboarding; um primário (Continuar); Escolher exportação = secondary + ícone attach. **Arquivos:** tabela `width:100%` (remove `max-width` shell). **Membros:** convite `size="m"`. **Perfil/Import:** `Screen` default (não reading).

**Pendente (Atlas 17:56):** Uso → RPC D5a fold/official; Memória/Skills → `listMemory`/`listSkills`; fila a11y/microcópia/motion/en. **Capturas:** aguardo host; depois `design-shots.mjs panel:*`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/connected-kanban.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx
→ 4 files / 19 passed
```

## 2026-11-03 17:29 — Muse polish: Memory/Skills/Proactive + rem sweep

**Pronto:** **MemoryPanel**, **SkillsPanel**, **ProactiveDailySummaries** migrados para `Card`/`Chip`/`Button` + CSS próprio; removido **`LumenPage.module.css`**. **ApprovalsProactivity.module.css** — tokens semânticos/espaço. Sweep `rem` → `--persona-space-*` / `--persona-radius-*` em knowledge, routines, usage, files.

**Fila Lumen (PLAN):** itens C6–C7, D4b, PRO-5 UI, E9/F2 preview **done**; **D5b** UI (`UsageLimits` + `RemoteUsagePanel` + `limitsToUsageMeters`) pronta — PLAN ainda `todo` aguarda **D5a Rivet** (livro/cota oficial no host). **Muse capturas** `panel:*` bloqueadas em **Anvil P0** (host).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx … (8 arquivos)
→ 8 files / 34 passed
```

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

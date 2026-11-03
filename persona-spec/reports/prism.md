# Prism — relatos (mais recente no topo)

## 2026-11-03 — Keel P0: unwrap RemoteResult (Muse dona)

**Causa painéis “Carregando…” / seed** — `ctx.remote.persona.*` → `RemoteResult`; live store usava retorno cru (`channels.find is not a function`). **Muse** autorizada: proxy único de unwrap em `createPersonaLiveStore` (+ teste). **Prism:** moratória em `bootstrap-tenant.ts`, `persona-live-store.ts`, `seed-default-team.ts` até `"unwrap done"` no Status; não comecei o mesmo conserto. Depois: revisar proxy + `ui-boot-check`.

**Paralelo (outros arquivos)** — `ConnectedPersonaEditor` (hire + `setPersonaAutonomyLevel` no Salvar), `autonomy-remote.md`, Members/Canvas `onRemoteRetry`, `KanbanReviewSheet` load `{state}`.

---

## 2026-11-03 — Keel: fronteira Muse + canal Status

**Fronteira (ok)** — Muse: JSX/CSS DMs, Projetos, Busca, Contratar. Prism: `ConnectedDirectMessagesView`, DMs live, dados `ProjectsPanel`, `setPersonaAutonomyLevel`, hire remote.

**Comunicação Prism↔Muse** — sem `maestri ask` direto; usar post-it **Persona · Status** com `[Prism→Muse] …` / `[Muse→Prism] …`; reler Status a cada relato; repasse via Keel se preciso.

**Host** — inject `personaRunners`: Anvil P0 (Prism segue mocks/contratos até voltar).

---

## 2026-11-03 — check-pkg verde + PRO-4 autonomy seam + fronteira Muse

**check-pkg** — `KnowledgeVault` Card `tone` spread; `live-tenant-bridge` test usa `snapStore.set` (sem cast); stubs `setPersonaAutonomyLevel`; `CanvasView` illustration `empty-vault`; `PersonaProfilePage` chip danger em `error` (não `blocked`). → **OK 39s**.

**PRO-4 (dados)** — `autonomy-map.ts` (tier ↔ host mode); `PersonaRemote` `setAutonomy`/`getAutonomy` full row; `PersonaLiveStore.setPersonaAutonomyLevel` (patch budgets). UI editor ainda mock; Muse SCREEN-SPECS depois.

**Observables** — `live-rail-bridge` (Muse) + `live-tenant-bridge` já cacheiam referência (React #185).

**Fronteira Muse (auditoria e)** — resposta acordada: **Muse** JSX/CSS de DMs, Projetos, Busca, Contratar; **Prism** `ConnectedDirectMessagesView`, live DMs, `ProjectsPanel` dados, `setPersonaAutonomyLevel`, hire remote. `maestri ask "Muse"` falhou (`No route for POST /ask`) — Keel/Miguel repassar se necessário.

**Testes** — `vitest` autonomy-map, live-tenant-bridge, observable-bridges → 7 passed.

**Dependências** — host `personaRunners` inject (seed/capturas); C8 1ª tarefa Anvil; Muse vitrines antigas (editor/hire).

---

## 2026-11-03 — Muse: seed realista (#geral / Visão geral)

**Template** — `SUGGESTED_TEAM_GALLERY` + `equipeAnimais` (via `GALLERY_SUGGESTED_DRAFTS`): Atlas/Bento/Nina/Sol/Luna com papéis Coordenação/Engenharia/Pesquisa/Relacionamento/Vigia + `avatarRef` + roles coordination/watchdog. `MOCK_INTRO_LINES` usa nomes dos bichos.

**Dev harness** — `seedDevHarnessScenario` (gated `persona.devSeed.v1`): `completeOnboarding` displayName Miguel, 4 `postMessage` idempotentes no #geral, `proposeHire` `dev-harness-v1-hire` → títulos em `attentionTitles` (live store). Tarefa `doing` via ingest da msg do Miguel. Reações: sem RPC no host. Muse: `localStorage persona.devSeed.v1=1` no initScript de `design-shots.mjs` (avisado via `maestri ask`).

**Arquivos** — `seed-default-team.ts`, `mock-data.ts`, `persona-live-store.ts` (refresh approvals + `runDevHarnessSeedIfEnabled`).

**Testes** — `vitest` seed-default-team (4 passed).

---

## 2026-11-03 — Keel P1: painéis em branco (slot inject) + C5b dados

**Causa kanban** — `InjectFace` expõe `useLive`/`useTenant`, não `hooks`; `ConnectedGlobalKanban` lia `hooks.live` → throw → main vazio. Corrigido: `refresh` no inject raiz; painel usa `useLive`/`useTenant`.

**Connections** — `ConnectionsView` sincroniza `initialState` quando o Remote load muda (loading→ready/empty).

**C5b (dados)** — `passThroughFollowers` + DMs (`selectDm`/`postDmMessage`/stream dm); `ChannelMessageUi.taskTitle` para cartões (Muse estiliza no #geral); contrato `channel-stream-remote.md`.

**PRO-4** — Visão geral: `nowRows`/`awayEvents`/`attentionTitles` já live; `userName` do member owner (não mensagem).

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → (ver abaixo)
```

**Pendente:** C8 1ª tarefa pós-onboarding (host); cartão de tarefa visual (Muse); `Contexto usado` Remote; Probe detector painel vazio.

---

## 2026-11-03 — check-pkg verde: kanban remoto, review wire, C5c roster sync

**Kanban** — `ConnectedGlobalKanban` usa `useSyncExternalStore` nos observables (sem `InjectFace` quebrado); cards do live store.

**Review (Lumen/Prism seam)** — `persona-review-remote.ts` tipa `reviewSummary`/`acceptReview`/… até Typert regen; `ReviewDeliveryPanel` empty illustration; locales `empty.illustration`.

**C5c** — `ChannelComposer` re-sincroniza persona “Responde” quando `members` muda pós-onboarding.

**Fixes** — `connectionsToEntries` omit `errorCode`; kanban `exactOptionalPropertyTypes` spreads.

**Verificação**

```
node scripts/persona/gen-client-ui-persona-locales.mjs → OK (review)
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 21.3s
pnpm exec vitest run …/apply-message-stream …/roster-from-draft → 3 passed
ui-boot-check → exit 1 (EADDRINUSE 127.0.0.1:3080; host já em execução — re-rodar sob with-lock quando Probe liberar)
```

**Pendente PLAN:** C5b cartões/pass-through/DM; PRO-4 dados Anvil; C8 1ª tarefa; F5 a11y; Typert regen review RPCs.

---

## 2026-11-03 — C5b stream + onboarding galeria + S5 roster host

**Onboarding (S5/C8)** — passo 4 usa `GALLERY_SUGGESTED_DRAFTS` ← `SUGGESTED_TEAM_GALLERY` (nomes genéricos; refs brush); `rosterFromDrafts` envia `galleryRef` + `systemRoles` em `completeOnboarding`.

**Canal (C5b)** — `followMessages` no `PersonaLiveStore` (pós-bootstrap, `AbortSignal`); merge `applyMessageStreamFrame`; contrato `persona-spec/contracts/channel-stream-remote.md`. `refresh`/`listMessages` mantidos; envio otimista local antes de `postMessage`.

**Gates / Probe** — `persona-e2e/README.md`: onboarding real vs `PERSONA_DEV_SEED=1`. `PersonaSidebar` TS (`className ?? ''`) → `check-pkg` verde.

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 17.9s
pnpm exec vitest run …/apply-message-stream.client.spec.ts …/roster-from-draft.client.spec.ts …/seed-default-team.client.spec.ts → 7 passed
ui-boot-check: bloqueado em with-lock aguardando "Probe real gallery" (não re-executado neste turno)
```

**Dependências:** C5c composer↔personas reais (Muse `ChannelComposer`); cartões de tarefa/pass-through; PRO-4 dados live (`PRO-2` Anvil).

---

## 2026-11-03 — Keel P1: seed fora do bootstrap (D-043 / D-045)

**Produção** — `PersonaLiveStore.bootstrap` só `getOnboarding` + `refresh`; zero personas até `completeOnboarding` / `commitOnboardingRoster`. Galeria `SUGGESTED_TEAM_GALLERY` (refs brush; nomes genéricos) não auto-cria.

**Dev** — `runDevHarnessSeedIfEnabled` só em `mount.ts` após bootstrap, gated por `persona.devSeed.v1` (`PERSONA_DEV_SEED=1` nos gates). `real-app-shots.mjs` e `ui-boot-check.mjs`: onboarding real ou dev seed (removido skip via `persona.onboarding.complete.v1`).

**Testes** — `persona-host/tests/onboarding.spec.ts` fresh home → `firstUse` + 0 personas; client gallery/dev-seed specs.

---

## 2026-11-03 — Brush banners + onboarding Remote + seed equipe

**Banners (Brush)** — `node scripts/persona/build-assets.mjs` → 125 files, 2.54 MiB; exports `teamBannerLight/Dark`, `railFoliage`, `railFoliageLight/Dark`. Faixa `#geral` usa WebP claro/escuro; rodapé do rail com arte Brush (fallback gradiente).

**Onboarding** — contrato `persona-spec/contracts/onboarding-remote.md`; `getOnboarding` autoritativo; `localStorage` só cache otimista; `PersonaLiveStore.completeOnboarding()` chama RPC quando Anvil expuser (senão `commitOnboardingRoster`).

**Remote** — `seedDefaultTeamIfEmpty` (Atlas/Bento/Nina/Sol/Luna); `markVisit`; mocks só enquanto `!live.ready`.

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → OK
pnpm exec vitest run …/onboarding-remote.client.spec.ts …/seed-default-team.client.spec.ts → 5 passed
node scripts/persona/with-lock.mjs "Prism banner shots" -- node scripts/persona/real-app-shots.mjs → exit 0
Capturas: .maestri/tmp/shots/real/persona-{light,dark}-*.png
```

**Dependência:** Anvil `completeOnboarding` (wire já pronto). Muse: `DESIGN-SYSTEM.md` + dona theme/primitives — não editar até spec por tela.

---

## 2026-11-03 — PROACTIVITY.md (UI v1): Agora, while away, editor, estados honestos

**Escopo (Atlas / Miguel)**

- Visão geral: faixa **Agora** (estado + tarefa + fila por persona), painel **Enquanto você estava fora** (peak-end, `sessionStorage` por sessão, links secundários para tarefas).
- Editor de persona: **autonomia** (só quando pedido · propor · agir dentro de limites) + **orçamento de atenção** com hints (PROACTIVITY §4–§6).
- Faixa `#geral`: estados `working` · `resting` (zzz legítimo) · `stuck` · `waiting`; pose `descansando` quando em repouso.

**Arquivos:** `team/persona-work-state.ts`, `overview/{OverviewNowStrip,AwayWhileOutPanel,mock-overview-proactivity}.tsx`, `OverviewView.tsx`, `PersonaEditor.tsx`, `persona-draft.ts`, `locale-sources/shell.*`, `persona-editor.*`, `mount.ts`, testes preview.

**Verificação**

```
node scripts/persona/gen-client-ui-persona-locales.mjs
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 16.2s
pnpm exec vitest run …/overview-preview …/team-strip-preview …/persona-editor-preview
→ Test Files  3 passed (3) | Tests  3 passed (3)
node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle → OK
```

**Fora:** dados ainda mock (`MOCK_OVERVIEW_NOW` / host stream); links do away summary sem navegação real; wire autonomia/orçamento → Forge/host.

---

## 2026-11-03 — Revisão Keel (dirD + UX-GUIDE): marca, rail, #geral, RCD chip, a11y

**Princípios RCD / lentes**

1. **Marca (lente acessibilidade AA):** símbolo âmbar 40 px + wordmark branco ~28 px (`--persona-active-rail-ink`), sem wordmark escuro sobre roxo.
2. **Rodapé (usabilidade):** sidebar coluna flex — marca fixa, `navScroll`, rodapé fixo + `padding-bottom`/`safe-area-inset-bottom` (Configurações visível em 1280×720 e 1920×1080).
3. **Toque (AA):** nav ~18 px, linhas `min-height: 3.5rem`, ícones 24 px, `:focus-visible` no rail.
4. **Neutrality is omission:** chip de atenção na Visão geral = `overview.attentionAction` (“Revisar”); ação primária âmbar só na tarefa sugerida; atenção em `secondary`.
5. **Never blank dashboard:** default `activePanel: channels` → `#geral` (faixa “Sua equipe neste canal”, mensagens, composer); Visão geral com intro da equipe + 1ª tarefa quando o usuário navega.
6. **Foco:** onboarding input + itens do rail com anel `focus-visible`; gate registra `Tab×2` → `BUTTON`.

**Arquivos (principal):** `PersonaSidebar.{tsx,module.css}`, `PersonaAppFrame.module.css`, `create-shell-store.ts`, `GeneralChannelView.tsx`, `TeamChannelStrip.tsx`, `OverviewView.tsx`, `OnboardingWizard.module.css`, `locale-sources/shell.{pt,en}.json`, `scripts/persona/{ui-boot-check,compare-shot-dirD}.mjs`

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona
→ client-ui-persona: OK in 13.4s

pnpm exec vitest run …/overview-preview.client.spec.tsx …/team-strip-preview.client.spec.tsx
→ Test Files  2 passed (2) | Tests  2 passed (2)

node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
console errors (0):
(none)
[a11y] focus after Tab×2: BUTTON
{"actualPath":"…/persona-light-channel.png","referencePath":"…/dirD-tela.png","diffRatio":0.3485262345679012,"diffPixels":451690,"pass":true,"diffOverlay":"…/persona-light-channel.diff.png"}
shots: …/persona-light.png, persona-dark.png, persona-light-channel.png, persona-light-720.png, persona-light-1080.png
```

**Capturas:** `.maestri/tmp/shots/persona-light.png` (1ª visita + overlay onboarding), `persona-dark.png`, `persona-light-channel.png` (Probe vs dirD), `persona-light-channel.diff.png`, `persona-light-720.png`, `persona-light-1080.png`.

**Fora / próximo:** diff ~35% ainda esperado (viewport 1440×900 vs ref 1671×941, motion/tokens); Tab completo rail+composer no gate; Probe axe/motion-jank separado.

---

## 2026-11-03 — build-assets gerador + check-pkg + assets/shell/#geral (em curso)

**Correções**

- `build-assets.mjs`: imports antes dos `export const` (elimina TS1005 em `generated-imports.ts`).
- Recriado `assets/asset-url.ts`; `preview/shell-translate.ts` para testes (`TranslateNS<'persona.shell'>`).

**Verificação**

```
node scripts/persona/build-assets.mjs
node scripts/persona/check-pkg.mjs client-ui-persona
→ client-ui-persona: OK in 15.2s

node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
→ lib/client.js + lib/assets (~2.13 MiB bundle output)

node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
console errors (0): (none)
→ sidebar: Equipe/Busca/…/Conectado/Configurações; onboarding passo 1 overlay (home temp)
```

---

## 2026-11-03 — URGENTE boot branco (remote inject + sidebar.settings)

**Pronto**

- `mountPersonaUi`: removido `ctx.remote.persona.ping()` antes de `ctx.inject`; ping só dentro de `registerUi` (padrão Forge).
- `PersonaSidebar`: declara filho `sidebar.settings` + `renderSlot('sidebar.settings', { wide: true })` para `ui-settings-general` / `configForms`.
- Spike `ui-composition.md`: `ui-settings` + `ui-settings-general` ativos; `message-quotes`, `ui-secret-mask`, `directory-picker` desativados (Keel patch).

**Gate ui-boot-check (Chrome real)**

```
node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
[light] title="DSH Local Build" text: Persona | Visão geral | … | Persona host online · p1 | Configurações | Precisa de você | … | Passo 1 de 5 | …
[dark] (mesmo conteúdo)
--- all console (light) ---
console errors (0):
(none)
shots: C:/Users/migue/dev/persona/.maestri/tmp/shots/persona-light.png, persona-dark.png
```

Captura: shell Persona + overlay onboarding + “Precisa de você” + Configurações no rodapé (alinhado RCD / dirD: rail roxa, conteúdo claro).

**Arquivos:** `mount.ts`, `PersonaSidebar.{tsx,module.css}`, `persona-slots.ts`, `persona-spec/spikes/ui-composition.md`, `persona-spec/contracts/ui-shell.md`

**Rebuild:** `with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` (após fix mount).

---

## 2026-11-03 — A7p2 shell + overlay onboarding + C5d/C5b previews

**Pronto**

- SlotMap Persona (`persona-slots.ts`), `PersonaAppFrame`/`PersonaSidebar` com `PropsRuntime<'root'>` + `useShell` (InjectFace).
- `mountPersonaUi`: root/sidebar/main overview + `shell.overlay` id `persona.onboarding`; ping no store compartilhado; onboarding overlay com dismiss (RCD: valor antes de config).
- Visão geral “Precisa de você” primeiro; shell pt-BR; contrato `persona-spec/contracts/ui-shell.md` atualizado (Lumen paths, augmentation).
- Previews: faixa de equipe (`TeamChannelStrip`), stream mock (`ConversationStreamPreview`); teste `team-strip-preview.client.spec.tsx`.
- `tsconfig` exclude pastas Lumen; teste onboarding-builder usa chave de locale; motion delay fix oxlint.
- Bundle `lib/client.js` sob trava.

**Arquivos (principal)**

- `packages/persona/client-ui-persona/src/client/{shell,mount.ts,overview,onboarding,team,chat}/**`
- `locale-sources/shell.{pt,en}.json`, `tests/*.client.spec.*`, `persona-spec/contracts/ui-shell.md`

**Verificação**

```
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
→ exit 0

pnpm exec vitest run … (10 arquivos Prism, excl. kanban-preview Lumen)
 Test Files  10 passed (10)
      Tests  13 passed (13)

node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
→ lib/client.js ~94.73 kB

pnpm exec oxlint <pastas Prism> → exit 0
```

## 2026-11-03 — Revisão 2 #geral: assets Sol/Luna + ui-boot-check

**Pronto**

- `node scripts/persona/build-assets.mjs` → 112 arquivos, 2.47 MiB (poses/avatares Sol e Luna incluídos).
- Faixa/mensagens: `resolveCharacterId` + `mapTeamToStrip` lista **todos** os `team.personas`; silhueta só sem URL de pose; fallback `MOCK_CHANNEL_ROSTER` / `MOCK_GERAL_MESSAGES` quando host vazio.
- Tema escuro: `installPersonaColorScheme()` no `mount.ts`; init script do gate ajustado (sem `body` nulo).
- Logo rail: `symbol.svg` com `filter` invert no sidebar; pipeline reserva `banner-team-{light,dark}.webp` e `rail-foliage.webp` quando Brush entregar.
- `check-pkg client-ui-persona` OK.

**Arquivos:** `map-host-ui.ts`, `ConnectedGeneralChannelView.tsx`, `TeamChannelStrip.tsx`, `install-color-scheme.ts`, `mount.ts`, `PersonaSidebar.module.css`, `build-assets.mjs`, `ui-boot-check.mjs`, `lumen-remote-panels.tsx`.

**Gate (verbatim)**

```
node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
→ exit 0
dirD compare: diffRatio=0.34817978395061727 pass=true
shots: .maestri/tmp/shots/persona-light-channel.png, persona-light-channel.diff.png, persona-dark.png, …
[channel text inclui Sol/Luna “Descansando · zzz” com roster completo]
```

**Fora / próximo**

- (app) capturas claro/escuro vs `dirD-tela.png`, reduced-motion, teclado — Probe/aceite S5.
- Onboarding overlay ainda usa `dict: onboardingPt` no inject (trocar por locale ativo quando host i18n estiver no caminho).
- C5b/c: registrar conversa/composer no shell; Lumen main keys; `kanban-preview.client.spec.tsx` (Lumen) fora do typecheck Prism.
- Rodar `node --import tsx/esm apps/cli/src/bin.ts persona --no-open` quando Probe liberar host.

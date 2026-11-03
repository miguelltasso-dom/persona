# Prism — relatos (mais recente no topo)

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

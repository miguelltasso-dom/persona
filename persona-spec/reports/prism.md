# Prism — relatos (mais recente no topo)

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

**Fora / próximo**

- (app) capturas claro/escuro vs `dirD-tela.png`, reduced-motion, teclado — Probe/aceite S5.
- Onboarding overlay ainda usa `dict: onboardingPt` no inject (trocar por locale ativo quando host i18n estiver no caminho).
- C5b/c: registrar conversa/composer no shell; Lumen main keys; `kanban-preview.client.spec.tsx` (Lumen) fora do typecheck Prism.
- Rodar `node --import tsx/esm apps/cli/src/bin.ts persona --no-open` quando Probe liberar host.

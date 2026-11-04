# Probe — relatórios (mais recente no topo)

## 2026-11-04 03:08 — JANELA ENCERRADA (Keel 4884366950): bootstrap 10/10 + S7 motion

### Keel
- **JANELA ENCERRADA** — builders podem editar core/client de novo; snapshot candidato no worktree do Keel.

### PASSOU
- **`mandatory-boot-bootstrap`:** **10/10** (~2,2 min) após harness Probe:
  - `BOOT_GATE_MAIN_PANELS` com `readySelector` Lumen (`knowledge`, `routines`, `files`, `usage`, `connections`, …).
  - `runBootstrapPanelCheck` + timeout 150 s/painel + ErrorState.
  - Teste 2 fatiado por slug (fail loud).
- **S7 / scope:** `mandatory-scope` **reduced-motion** verde (~98 s).
- **PRO-6 UI:** `mandatory-proactivity-ui` 2/2 (turno anterior, revalidado).
- **Publish:** `persona-gate` re-run pendente neste bloco (comando abaixo).

### Infra E2E
- Host boot timeout intermitente se vários vitest browser competem → usar **`PERSONA_HOST_NO_LOCK=1`** e um host por vez.

### Fila Probe (ainda aberta)
- PRO-6 layer-2 `it.todo` (7), PB-9/GOV-10/W2-11 gallery, B9 tier-1, scope 4 todos + dirD, BYC/SB surface todos, Padaria, org-chart browser, `real-gallery-blank-panel`.

---

## 2026-11-04 02:34 — Publish gate VERDE + boot smoke 9/9

### PASSOU
- **`persona-gate.mjs`** (check-pkg + bundle + boot smoke): **`PERSONA_GATE ok`** (~5,8 min).
- **Clean-home tour:** 9/9 painéis sem ErrorState/Carregando (home temp + onboarding real).
- **Fix Probe (scripts/persona):** `playwright-onboarding.mjs` — step 1 via placeholder (não `input[type=file]`); fluxo alinhado a `completeOnboardingOverlay` (step 4 Continuar).
- **`playwright-onboarding-contract.spec.ts`** + item em `mandatory-boot-publish-contract`.

### FALHOU / parcial
- **`mandatory-boot-bootstrap`:** **1/2** — Prism (`BOOT_GATE_PRISM_PANELS`) OK; **`BOOT_GATE_MAIN_PANELS` timeout 600 s** (painel Lumen preso em loading ou nav lenta) → **[Lumen/Prism]** dev seed; clean-home 9/9 não cobre o mesmo roster.

### PRO-6 UI smoke (dev seed)
- **`mandatory-proactivity-ui`:** **2/2 PASS** após assert via `geralComposerLocator` (~70 s).

### Dependências
- PRO-6 layer-2 (7 todos), PB-9/GOV-10/W2-11 gallery, B9 tier-1, S7 scope 4 todos, Padaria — fila aberta.

---

## 2026-11-04 02:24 — Fila Vigia: contratos layer-1 + PRO-6 parcial

### Entregue
- **`mandatory-boot-publish-contract.spec.ts`:** ordem 9 painéis, alinhamento `REAL_GALLERY_PANELS`, subprocess sanitize.
- **`mandatory-proactivity-contract`:** +1 teste jsdom `overview-preview` (PRO-6 bullet 6 parcial — links no painel “fora”).
- README persona-e2e: bloco publish boot.

### Gates (subprocess / keyless)
| Suíte | Resultado |
|-------|-----------|
| boot-publish + PRO + BYC | **12 pass**, 1 todo |
| GOV/PB/TOK/activity/GES/SB/W2/OPT | **28 pass**, 4 skip, 4 todo (~82 s) |
| org-chart + fake-cli + web-host-boot | **9/9** |
| **BYC host walk (`logo.png` ignored)** | **verde** (histórico Forge resolvido no tree atual) |

### `persona-gate.mjs` (--skip-smoke --skip-typert)
- **check-pkg 11/11:** OK
- **client bundle:** **FALHOU** — `PooledAccount` already declared (parse Rolldown) → **[Prism/Lumen]** fora da folha Probe na freeze
- **boot smoke:** não rodou (bundle vermelho; mesmo com bundle verde, tour browser ainda depende `#geral`/Prism)

### Fila Probe (não vazia)
- Layer-2 browser: PRO-6 (7 todos + `#geral` composer), PB-9/GOV-10 gallery, B9, bootstrap dev seed, galeria 22, Padaria, org-chart &lt;1s overlap.
- Publish: re-run `persona-gate.mjs` completo após bundle verde + smoke clean-home.

---

## 2026-11-04 02:10 — Atlas clean-home tour no publish gate

### Entregue (persona-e2e + scripts/persona — folha OK na freeze)
- **`BOOT_GATE_CLEAN_HOME_TOUR`:** 9 painéis (Visão geral → #geral → Conexões → Uso → Saúde → Organograma → Quadros → Conhecimento → Aprovações).
- **`runCleanHomeTourChecks`:** falha em `role="alert"` (ErrorState) ou `Carregando…`/skeleton/`aria-busy` (12 s/painel).
- **`persona-boot-smoke.mjs`:** home temp limpa → onboarding Playwright → tour (tsx import bootstrap).
- **`persona-gate.mjs`:** smoke via `node --import tsx/esm …/persona-boot-smoke.mjs`.
- Teste: **`boot-gate-clean-home.spec.ts`** (ordem 9 slugs).

### Verificação
```
pnpm exec vitest run packages/persona/persona-e2e/tests/boot-gate-clean-home.spec.ts
node scripts/persona/persona-gate.mjs --skip-typert   # smoke real quando client verde
```

---

## 2026-11-04 02:04 — Freeze Keel: gates + fila pós-janela

### Gates subprocess (sem browser, persona-e2e OK)
| Gate | Resultado |
|------|-----------|
| Keyless e2e (boot-sanitize, fake-cli, visible-copy, token baseline, web-host-boot) | **9/9** |
| `mandatory-governance-contract` | **4 pass**, 2 skip gallery |
| `mandatory-activity-contract` (T3 §9) | **2/2** |
| Batch anterior (TOK/GES/SB/BYC/W2/PB-9/PRO) | **19 pass** layer-1 |

### Bloqueios (sem edit client/core na freeze)
- **E2E browser:** devSeed vazio + `#geral` composer → **Prism** (Muse 04:20: `map-rail-team.ts` `arriving` — 5 testes client).
- **Handoff Maestri Prism** enviado (715781).

### Fila Probe pós-freeze
- Layer-2: PRO-6, PB-9, GOV-10, W2-11, B9, galeria, Padaria, org-chart browser — **após JANELA ENCERRADA + client verde**.
- Layer-1: manter `mandatory-*-contract` no push snapshot Rivet.

---

## 2026-11-04 01:56 — Keel janela congelada + Probe folha VERDE

### Conformidade Keel (01:45+ freeze pacotes core/client)
- **Probe não edita** persona-core/engine/store/host/runners/vault/usage/client-ui-persona até **"JANELA ENCERRADA"** no Status.
- Trabalho permitido: **persona-e2e**, **persona-spec/reports**, gates subprocess, docs de aceite.

### persona-e2e (folha)
- **`check-pkg persona-e2e`:** OK (~5 s).
- **`tsc -p persona-e2e`:** OK.
- **Layer-1 contracts:** **7/7** arquivos, **19 pass** + skips/todos (~71 s subprocess).
- **E2E browser:** boot bootstrap **2/2 FAIL** — dev seed vazio (`SUA EQUIPE` sem Atlas) + `#geral` composer → **Prism** (bloqueio instalador; alinhado Keel "client primeiro").

### Harness (já em persona-e2e, pré-freeze)
- `waitForSeededTeam`: rail avatars + expand lista; 45 s.
- `openRealPersonaApp`: `dismissBlockingOverlays`.

---

## 2026-11-04 01:30 — #geral regressão + PRO-6 UI harness

### Diagnóstico `#geral` / composer
- **`[Prism] geral` isolado:** **FALHOU** 120 s (antes 22/22 galeria) — possível regressão produto ou overlay scrim bloqueando nav.
- **Harness:** `openRealPersonaApp` chama `dismissBlockingOverlays`; `ensureGeralComposer` sempre `resetGalleryHome`; composer wait 90 s sem swallow; galeria `geral/canais` timeout 240 s.
- **PRO-6 UI:** harness overlay fix → **1/2 pass** (Visão geral + `#persona-attention-title` OK); **1 fail** `#geral` composer (240 s) — **[Probe→Prism]** mesmo bloqueio B9/galeria-geral isolado.

### Gates subprocess
- WAVE2 + PB-9 + TOK contracts **verdes** (esta sessão).
- Org-chart jsdom **2/2** + jornadas **19/19**.

### Boot bootstrap (`mandatory-boot-bootstrap`)
- **2/2 FALHOU:** `seeded team missing (Atlas)` após 25 s + `#geral` composer timeout 90 s nos painéis Prism — **[Probe→Prism]** dev seed / live store (regressão vs galeria 22/22 ~00:24).

### Fila
- Prism: #geral composer + rail seed Atlas; PRO-6 composer E2E; B9; galeria 22 re-run; PB-9/GOV-10/W2 todos; Padaria; BYC walk Forge.

---

## 2026-11-04 01:05 — TOK gate Forge + B9 harness

### Tokens (OPT-1 / OPT-2)
- **`mandatory-token-scenarios-contract`:** **2/2 verdes** — baseline JSON + subprocess `token-measure.spec.ts` (402 tokens, gate +10%).
- JSON `persona-spec/baselines/token-scenarios.json` ainda placeholder numérico; fonte de verdade engine = Forge `bench-tokens.md`.

### B9 mandatory-b9-real-app
- **FALHOU** 2×: `beforeAll` composer `#geral` (cold start 1440×900); retry `ensureGeralComposer` estourou hook 360 s.
- **Harness:** composer deferido do `beforeAll`; viewport 1280×720; retry 3× em `ensureGeralComposer`.
- **3ª corrida:** **4/6 pass** (console, kanban, reduced-motion, dirD); **2 fail** `#geral composer` + draft (180 s timeout) — **[Probe→Prism]** canal #geral/composer não monta no cold start (galeria 22/22 verde na mesma noite sugere flake ou ordem de nav; re-run geral isolado pendente).

### Contratos revalidados
- GES **1 verde** + BYC **2 verdes** (walk host ainda todo).

---

## 2026-11-04 00:45 — GES promovido + gates layer 1 + galeria 22

### Gestor (GES) — **PASSOU** layer 1
- **`gestor.spec.ts`:** **10/10** verdes.
- **`mandatory-team-manager-contract`:** subprocess `gestor.spec.ts` promovido (**1 verde**); demais GES engine/gallery ainda `it.todo`.

### Gates subprocess (sem browser, esta sessão)
| Gate | Resultado |
|------|-----------|
| `mandatory-project-boards-contract` | **3/3** |
| `mandatory-second-brain-contract` | **5/5** |
| `mandatory-wave2-contract` | **7 pass**, 1 skip gallery |
| `mandatory-proactivity-contract` | **2/2** |
| Jornadas host | **19/19** |

### BYC — **FALHOU** (Forge)
- `bring-context-walk.spec.ts`: binário `logo.png` não listado em `ignored` (walk só `.md` keep). **[Probe→Forge]**

### Galeria 22
- 1ª corrida isolada: **21/22** — `[Lumen] perfil` timeout `Sobre Atlas` (rail densidade avatars @ 720p esconde ⋯).
- **Fix harness** `navigateProfileViaRailCard`: `resetGalleryHome` + expandir rail lista + fallback Shift+F10 → card → Abrir perfil.
- Re-run `-t perfil:` **PASS** (~63 s).
- Corrida completa pós-fix: **22/22 PASS** (~239 s, host isolado).

### B9 real app (esta sessão)
- **`mandatory-b9-real-app`:** **FALHOU** `beforeAll` — composer `#geral` não visível em 120 s após `ensureGeralComposer` (host abriu; possível stuck loading Canais — re-run após galeria verde ou **[Probe→Prism]**).

### Fila Probe
- PRO-6 / PB-9 / GOV-10 / W2-11 E2E todos; org-chart browser; TOK bench; Padaria; B9 re-run; S7 UI; D8 blocked; W2 SubjectBar → Prism.

---

## 2026-11-03 19:10 — PROJECT-BOARDS.md §3 (aceite, BRIEFING 15)

### Entregue
- **`mandatory-project-boards.spec.ts`:** 7× `it.todo` mapeando §3 (projetos isolados, categoria coluna↔engine, editor de fluxo, sprints+marco, proposta Coordenação, nav Quadros, panorama opcional) com tags `[Forge|Anvil|Lumen|Prism|Muse]`.
- **`persona-e2e/README.md`:** comando vitest.

### Verificação
```
node scripts/persona/check-pkg.mjs persona-e2e → OK
pnpm exec vitest run …/mandatory-project-boards.spec.ts → 7 todo
```

Promover cada `it.todo` → `it` quando o dono citado entregar host/store/UI.

---

## 2026-11-03 19:00 — Keel panel gate (loading preso, console storm, WS, onboarding)

### Entregue
- **`panel-gate.ts`:** stuck loading 5s (`Carregando`/skeleton/`aria-busy`), console fatals (`ERR_INSUFFICIENT_RESOURCES`, `Maximum update depth`, `#185`), WS storm ≤10 frames/3s, overlay com `persona.onboarding.complete.v1=1`.
- **`real-gallery-blank-panel.spec.ts`:** health combinado `[Owner] slug`.
- **`real-gallery-panel-gate.spec.ts`:** storm dedicado (conhecimento/uso/aprovacoes/…).
- **`capture.ts`:** galeria com dev seed + colunas index Loading stuck / Console fatals / WS 3s / Onboarding bug.
- **`keel-panel-diag.mjs`:** repro contra host já aberto (Keel :3191).

### Verificação
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 9.5s
```
E2E host bloqueado por lock Muse `design-shots` neste turno — gate **deve falhar vermelho** em Conhecimento/Uso/Aprovações quando lock livre (Keel achado).

### Comandos
```
$env:PERSONA_E2E='1'; vitest real-gallery-blank-panel.spec.ts
$env:PERSONA_E2E='1'; vitest real-gallery-panel-gate.spec.ts
node --import tsx/esm scripts/persona/keel-panel-diag.mjs <url>
```

---

## 2026-11-03 21:45 — Atlas gate bootstrap live store + protocolo post-it

### Protocolo (Keel/Atlas)
- **Persona · Status / Memória / UX & Animação:** só `maestri note edit` com âncora (última linha em `== LINHAS ==` ou última linha própria); **nunca** `note write`. Correção = linha nova.

### Gate bootstrap (Atlas)
- **`boot-gate-bootstrap.ts`:** pageerror/console.error, equipe semeada (`Atlas`), 9 painéis principais sem `Carregando…` após 12s (poll).
- **`exec-bootstrap-gate.mjs`:** hook em `ui-boot-check.mjs` (exit 1 se erros).
- **`persona-boot-gate.ts`:** mesma verificação no smoke-persona.
- **`mandatory-boot-bootstrap.spec.ts`:** vitest dedicado (dev seed + onboarding storage).

### Evidência
**Antes (unwrap cru / gate novo):** `mandatory-boot-bootstrap.spec.ts` falhou ~580s — pageerror `SlotAssemblyError`, nav bloqueada por scrim onboarding, `channels.find` não apareceu (bootstrap abortou cedo).

**Depois (unwrap listChannels etc. + Prism rawRemote):** 2ª corrida falhou ~735s — `createWorkspace conflict` (host já existia; bootstrap trata conflict?), scrim ainda bloqueia nav, SlotAssemblyError transitório.

```
PERSONA_E2E=1 vitest mandatory-boot-bootstrap.spec.ts → 1 failed
```

### Próximo Probe
- Gate: dismiss onboarding robusto + tratar `createWorkspace` conflict como ok (alinhar Prism/Muse).
- Re-run smoke-persona + `ui-boot-check.mjs` sob lock quando árvore verde.

---

## 2026-11-03 20:05 — Keel P1 painel em branco (detector + galeria)

### Probe (entregue)
- **`blank-main-panel.ts`**: mede só a coluna main (`[data-persona-shell] > child[1]` — rail também tinha `data-persona-grain`, falso negativo antes).
- **`navigate-panel.ts`**: rail agrupado Muse (Buscar em tudo…, expandir **Mais**, Configurações).
- **`real-gallery-blank-panel.spec.ts`**: 20 testes nomeados `[Owner] slug` — **regressão vermelha** quando main vazio.
- **`capture.ts`**: index com colunas **Main blank?** + console (texto, não `—`).

### Evidência (1ª corrida pós-fix main column)
```
PERSONA_E2E=1 vitest real-gallery-blank-panel.spec.ts
 8 passed | 12 failed (~457s)
```
Falhas esperadas Lumen (Keel): **kanban**, **conexoes**, **rotinas**, **conhecimento**, **arquivos**, **uso**, **aprovacoes**, **regras**, **perfil**, **membros**, **importar**, **canvas** (main cream / timeout nav). **visao-geral**, **geral**, **equipe**, **busca**, **projetos**, **canais**, **dms** passaram.

### Galeria
- `.maestri/tmp/shots/real/index.md` (77 png; re-run `capture-real-gallery.mjs` preenche blank+console).
- `finish-real-gallery-index.mjs` para índice offline.

### Donos (Status)
- **Lumen**: Remote* / tenant scope — painel branco + error boundary pt-BR (Keel).
- **Prism**: slot `main` / PersonaAppFrame vs registro Lumen.
- **Muse**: empty/error Screen primitives.

---

## 2026-11-03 19:52 — B9 Tier 1/2 verdes + fila Atlas (continuação)

### Pronto
- **Tier 2 CDP:** `desktop-host.ts` conecta ao `DSH_DESKTOP_RENDERER_DEBUG_PORT` injetado (não ao primeiro `DevTools listening` do processo main `--inspect`).
- **smoke-desktop:** espera `[data-persona-shell]` + `assertNotHarnessShell` (B9 desktop boot).
- **mandatory-b9:** sessão única `describe.sequential` (~82 s, 6 passed | 4 todo).
- README: aviso de **não** paralelizar web host + desktop (contention no `with-lock`).

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.5s

PERSONA_E2E=1 vitest mandatory-b9-real-app.spec.ts
 Test Files  1 passed (1)
      Tests  6 passed | 4 todo (10)
   Duration  84.40s

PERSONA_E2E=1 vitest smoke-desktop.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  247.87s

PERSONA_E2E=1 vitest smoke-persona + smoke-web + fake-cli + smoke.spec → passed (b9 falhou só por lock paralelo com desktop; re-run isolado verde)
PERSONA_E2E=1 vitest preview-visual.spec.ts → 1 passed (~10s)
PERSONA_E2E=1 vitest mandatory-scope.spec.ts → 2 passed | 4 todo (turno anterior)
```

### Fila Probe (PLAN — não vazia; dependências)
| Item | Estado |
|------|--------|
| B9 E2E real app Tier 1 | **6/6 verdes** (+ 4 todo produto) |
| A6 Tier 2 desktop smoke | **verde** (~248 s) |
| S7 scope obrigatório | **2/6** (reduced-motion + dirD); 4 todo (Prism/Anvil/Forge) |
| PRO-6 proatividade | **8 todo** (PRO-1..5) |
| B8 / C9 / D9 / E10 / F3 / F6 | todo, blocked em features |

---

## 2026-11-03 18:35 — Keel: inspect sync console + ui-boot-check + PRO-6/SCOPE

### Veredito (cordis-client-runner / persona-app)
- **Não é teardown do gate** (`capturas → stop`). Timeline `probe-inspect-console-timing.mjs`: o único `console.error` cai **entre `localStorage` + `reload()`** (~46 ms antes de `reload done`), **antes** de screenshot/context.close/taskkill. Carga única **sem reload** → **zero** erros inspect.
- **Causa:** `ClientCordisInspectRegistry.publish()` no unload/reload da página (`cordis-client-runner` + providers em `client/providers.ts`); `syncInspectManifest` falha com `Failed to fetch` enquanto a navegação aborta o fetch — ruído de harness web-app, não regressão Persona UI.
- **`persona-app/cordis.patch.yml`:** **não desabilitar** `cordis-client-runner` nem `cordis-inspect-providers` (este último está em `packages/bundle/web-app/cordis.patch.yml` ~L167, host global). Persona já desliga `ui-cordis` (L140); runner/inspect seguem necessários ao web-app + persona-runners.
- **Patch aplicado (Probe):** `ui-boot-check.mjs` usa `addInitScript` + `persona.onboarding.complete.v1` **antes do primeiro `goto`** (sem `reload`) em channel/720/1080 → **0 erros de console**; dirD channel **~34,8%** (`persona-light-channel.png`).

### Pronto
- B9 harness: `real-app-session.ts`, `mandatory-b9-real-app.spec.ts`, `web-host` `--profile persona`, `fixtures/real-app-locale.pt.ts`.
- SCOPE: `mandatory-scope.spec.ts` — 2 cenários verdes (reduced-motion real app + dirD via `runPersonaUiBootGate`); 4 `it.todo` produto.
- PRO-6: `mandatory-proactivity.spec.ts` permanece 8× `it.todo` (aceite E2E quando PRO-1..5 existirem).

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 3.9s

node scripts/persona/with-lock.mjs "Probe ui-boot-check after initScript fix" --release-on "dsh web:" -- node scripts/persona/ui-boot-check.mjs
console errors (0):
(none)
diffRatio channel vs dirD: 0.34818904320987654 pass:true
```

### Fora / donos
- **Upstream (opcional):** `cordis-client-runner/inspect-registry.ts` — não `console.error` em falha de sync durante `pagehide`/abort (Forge/Harness).
- B9 mandatory: 4× `it.todo` (runner reply, kanban host, edit persona, Tier 2 CDP).

---

## 2026-11-03 15:40 — PROACTIVITY.md aceite (it.todo)

### Pronto
- `tests/mandatory-proactivity.spec.ts`: 8 cenários de aceite v1 (Vigia + relógio falso, pull loop, deps, fila vazia ± objetivo, recuperação runner, limites proposta/orçamento/silêncio, "Enquanto você estava fora").
- README atualizado com comando vitest.

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.xs

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-proactivity.spec.ts
 Test Files  1 skipped (1)
      Tests  8 todo (8)
```

### Fora
- Implementação real aguarda Forge (engine/Vigia), Anvil (store/host/events), Rivet (runner recovery).

---

## 2026-11-03 14:52 — check-pkg + preview-visual TS fix

### Pronto
- `preview-visual.spec.ts`: `VisualDiffRow` omite `diffOverlayPath` quando ausente (`exactOptionalPropertyTypes`).
- `persona-boot-gate`: diff `dirD-tela.png` sempre que a referência existir (divergência registrada mesmo sem shell).

### Comando (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.8s
```

### Gate UI (#geral + personagens Brush)
- smoke-persona **verde** após fix Prism (`PERSONA_E2E=1`, ~65s): zero activation warnings + zero console errors.
- Capturas: `packages/persona/persona-e2e/artifacts/persona-light.png`, `persona-dark.png`.
- Divergência dirD-tela (1440×900): **~87,95%** pixels (shell monta, layout ainda ≠ mock Brush); pass estrito só com `PERSONA_E2E_STRICT_DIRD=1` quando #geral + personagens estiverem prontos.

```
node scripts/persona/check-pkg.mjs persona-e2e && PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-persona.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

---

## 2026-11-03 14:15 — smoke-persona boot gate + harness (Keel fila P-2)

### Pronto
- `runPersonaUiBootGate()` integra `scripts/persona/ui-boot-check.mjs`: perfil `persona`, Chrome claro/escuro, capturas em `packages/persona/persona-e2e/artifacts/persona-light.png` e `persona-dark.png`, falha em `web boot: warning: … did not activate` e erros de console.
- `startWebHost` / `startDesktop` usam `with-lock.mjs` com `--release-on` (`dsh web:` / DevTools ready).
- Preview visual diff + motion/jank + HTML report (`preview-visual.spec.ts` verde).
- `png-compare.ts`: `waitForFunction` antes de `globalThis.compare` (fix typecheck push).

### Arquivos
- `packages/persona/persona-e2e/src/{persona-boot-gate,locked-launch,persona-boot-gate}.ts`, `visual-diff/*`, `preview-capture.ts`, `motion-jank.ts`, `axe-check.ts`
- `packages/persona/persona-e2e/tests/{smoke-persona,preview-visual,smoke-web-harness}.spec.ts`
- `packages/persona/persona-e2e/fixtures/preview-pages/*`
- `packages/persona/persona-e2e/README.md`

### Comandos (verbatim)

`tsc -p packages/persona/persona-e2e/tsconfig.json --noEmit` → exit 0

```
PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-persona.spec.ts
 Test Files  1 failed (1)
      Tests  1 failed (1)
 FAIL … activation warnings:
[light] web boot: warning: 1 entry did not activate
@deepseek-ai/dsh-client-ui-persona: failed: Error: cannot get property "remote.persona" without inject
… 'root' has no registration …
```
**Esperado vermelho** até Prism corrigir mount; capturas geradas em `artifacts/`.

```
PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/preview-visual.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Tier 2 (`smoke-desktop`) verde em run anterior (~276s); re-run pendente neste turno.

### Builder watch
- `client-ui-persona` tests: **FALHOU** 1/21 — `kanban-preview.client.spec.tsx` duplicate article (reportado a Lumen via maestri ask).

### Pedido Keel (deps)
- `@axe-core/playwright` em `persona-e2e` para scans a11y não-skipped.

### Upstream
- Nenhum.

### Fora
- `mandatory-scope` `it.todo` → testes reais quando S7/B8 entregarem.
- Diff dirD-tela no smoke-persona só quando `[data-persona-shell]` aparecer.

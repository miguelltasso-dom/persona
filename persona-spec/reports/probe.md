# Probe — relatórios (mais recente no topo)

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

# Atlas — relatos (mais recente no topo)

## 2026-11-04 02:02 — [Muse] listGestorPlans TypeError (refresh 57×)

**Causa:** `listGestorPlansRemote` aplicava `unwrapRemote` em lista **já desembrulhada** pelo `unwrapPersonaRemote` → `!result.ok` em array → `result.error.code` undefined.

**Fix:** `settleGestorWire` (wire **ou** valor); `unwrapRemote` tolera `{ ok: false }` sem `error`; `isRemoteResult` trata qualquer `ok: false`.

**Efeito colateral:** `gestorPlansById` volta a popular → cartão do plano no #geral; console limpo no refresh.

**Testes:** `gestor-remote.client.spec.ts` + `remote-unwrap` (gestorPlansById assert).

---

## 2026-11-04 02:00 — P0 home limpo: equipe vazia ≠ ErrorState (CTO)

**Causa:** `refresh()` falho gravava `snap.error` **sem** `tenant` no snapshot → `live-tenant-bridge` → `TENANT_ERROR` em **todos** os painéis Lumen; organograma caía no **mock demo** (Milo…) quando RPC/live vazio.

**Correção produto (client):**
- Bridge: erro só bloqueia tenant se **sem** escopo (`!ready || tenant null`); equipe vazia com workspace = `ready`.
- `refresh` catch: mantém `tenant`, `ready: true`, time vazio, `error: null` (log no console).
- Saúde / Quem cuida: superfície **`empty`** ilustrada + CTA onboarding (`openTeamSetup`); sem mock roster com equipe vazia.
- Locale `governance.*` (`org.empty.*`, `health.empty.*`).
- Capturas Muse: `design-shots.mjs empty-panels` (home limpo, onboarding.complete sem devSeed) + `seed-panels` (devSeed).

**Testes:** `live-tenant-bridge` + `empty-team-panels` (7/7).

**Repro capturas:** `node scripts/persona/with-lock.mjs x -- node scripts/persona/design-shots.mjs empty-panels seed-panels`

---

## 2026-11-04 02:08 — [Muse] seed silencioso + client VERDE (janela)

**Hipótese do sintoma (equipe vazia + Lumen ErrorState, console vazio):**
1. `refresh()` engolia exceções **sem log** → `snap.error` → `live-tenant-bridge` → `TENANT_ERROR` → painéis “Não consegui falar com a equipe”, mesmo com host “Conectado”.
2. Dev seed só chamava `completeOnboarding` quando `!onboarding.completed`; host pode marcar **completed com 0 personas** (home limpo + reload design-shots) → pulava onboarding e `seedDevTeamIfEmpty` não bastava se RPC falhou em silêncio.

**Feito:**
- `console.info('[persona] dev seed', { tenant, seeded, devSeedFlag })` em `runDevHarnessSeedIfEnabled` + bootstrap; `console.error` em falhas de seed/refresh; `listGestorPlans` best-effort no refresh.
- Seed: se `listTeam` vazio → **sempre** tenta `completeOnboarding` (idempotente) → depois `seedDevTeamIfEmpty`.
- **Gates:** `check-pkg client-ui-persona` OK + `pnpm -C packages/persona/client-ui-persona bundle` OK.

**Repro Muse:** `MUSE_DUMP=1` (ou `MUSE_CONSOLE=1`) no `design-shots.mjs channel` — procurar `[persona] dev seed` e, se ainda vermelho, `[persona] refresh falhou` / `[persona] listGestorPlans falhou`.

---

## 2026-11-04 01:52 — [Probe] #geral composer E2E + boot seed (P1)

**Causa (dupla):**
1. **Harness:** após WAVE2, `ConnectedGeneralChannelView` usa `composer.placeholderInSubject` → placeholder **"Mensagem em Geral…"**; Probe ainda esperava só `Escreva uma mensagem em #geral…` / `Mensagem para #geral…` → timeout 90s com composer montado.
2. **Bootstrap:** `publishHostOnboardingState()` rodava **antes** do dev seed com `onboarding.complete=1` + host `firstUse` → overlay reabria e seed/rail atrasava; bootstrap também engolia falha (tenant null, seed early exit) — `unwrapWire` + rethrow já landados.

**Feito:**
- `persona-e2e/src/geral-composer.ts` — wait por `[data-persona-area="composer"] textarea` + placeholders (incl. Geral).
- `navigate-panel.ts`, `real-app-session.ts`, `dogfood-padaria.ts` usam helper.
- `persona-live-store.ts` — dev seed **dentro** de `bootstrap()` após primeiro `refresh`, **antes** de `publishHostOnboardingState`.
- `seed-default-team.ts` — marker idempotente não pula retry se equipe vazia.

**Testes:**
```
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/bootstrap-tenant.client.spec.ts packages/persona/client-ui-persona/tests/remote-unwrap.client.spec.ts packages/persona/client-ui-persona/tests/seed-default-team.client.spec.ts
```
**[Probe]** Re-run: `mandatory-boot-bootstrap`, `mandatory-b9-real-app`, galeria `[Prism] geral` isolado.

---

## 2026-11-04 01:45 — Gestor recusar + cartão pós-ação (GES-4 wire)

**Feito:**
- Host `rejectGestorPlan` + `GestorHost.rejectPlan`; store `listDisplayPlans` + fix `putPlan` atualizar `body_json`.
- `listGestorPlans` devolve proposed/applied/rejected/commented (cartão no chat após aprovar/recusar).
- Client: `rejectGestorPlanRemote`, live store, #geral `Agora não` → `onRejectGestorPlan`.

**Arquivos:** `persona-store/gestor/repos.ts`, `persona-host/{gestor.ts,index.ts,types.ts}`, `gestor-remote.ts`, `persona-live-store.ts`, `GeneralChannelView.tsx`, `ConnectedGeneralChannelView.tsx`, testes.

**Testes:**
```
pnpm exec vitest run packages/persona/persona-host/tests/gestor.spec.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

**Pendente:** Ajustar (comentário/plano) — Forge/Muse composer; post automático `[[gestor-plan:id]]` ao propor (host/orquestração); typert regen `rejectGestorPlan`; T3 §9 ActivityGroup.

---

## 2026-11-04 01:35 — Dev seed GestorPlanCard (Muse captura)

**Feito:** `seedDevHarnessScenario` chama `proposeGestorAssemble` (Atlas, “Monte um time para o Site”) + `postMessage` no #geral com `gestorPlanMarker(planId)` (`dev-harness-v1-gestor-*`). `setPersonaSystemRoles` best-effort p/ `team_manager`.

**Arquivos:** `seed-default-team.ts`, `remote-unwrap.client.spec.ts`.

**Testes:**
```
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/remote-unwrap.client.spec.ts packages/persona/client-ui-persona/tests/seed-default-team.client.spec.ts
```

**[Muse→Prism]** Polimentos composer (1) outline duplo + (2) ícones `/` — **SIM, você faz** (só CSS + `icon` em `composer-slash-commands.ts`; Atlas fora do composer). Seed Gestor: **Atlas já landou** — não duplique em `seed-default-team`; recarregue com `persona.devSeed.v1=1`.

---

## 2026-11-04 01:28 — P0 bundle purity (BYC, opção b)

**Feito:** `bring-context-paste-local.ts` no client (espelho de `bringContextPrompt`, `parseBringPaste`, `decideBringApply` + tipos). `bring-context-ui.ts` e `bring-context-remote.ts` deixam de importar valores de `@deepseek-ai/dsh-persona-core`.

**Testes / bundle:**
```
pnpm -C packages/persona/client-ui-persona bundle
```
exit 0 (~32s)
```
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/bring-context-ui.client.spec.ts packages/persona/client-ui-persona/tests/bring-context-remote.client.spec.ts
 Test Files  2 passed (2)
      Tests  4 passed (4)
```

**Nota:** preview local usa FNV-1a para `contentHash`; host RPC continua canônico.

**[Muse→Prism]** bundle verde — pode retomar capturas de integração.

---

## 2026-11-04 01:15 — BYC-1 onboarding apply + organize (Prism)

**Feito:**
- `mergeBringOrganizePreview` em `bring-context-remote.ts` (mesmo caminho que Importar).
- Onboarding passo 2: `BringYourContextBlock` usa `onOrganizePreview` + `onApplyReview` (`applyContextProposals` / fallback `createVaultRecord`) via `mount.ts` → `OnboardingShellOverlay` → `OnboardingWizard`.
- Import `BringContextImportPage` refatorado para chamar `mergeBringOrganizePreview`.

**Arquivos:** `bring-context-remote.ts`, `BringYourContextBlock.tsx`, `OnboardingWizard.tsx`, `OnboardingShellOverlay.tsx`, `mount.ts`, `BringContextImportPage.tsx`, `tests/bring-context-remote.client.spec.ts`.

**Testes:**
```
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/bring-context-remote.client.spec.ts
```
```
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  12.35s
```

**Pendente / deps:** BYC-4 revisão completa (Lumen); gestor `[[gestor-plan:id]]` no corpo ao propor (host/orquestração Forge); typert regen RPCs; W2-3 bolinha no cartão kanban (Lumen); Muse integra `composer-commands.ts` — evitar refactor pesado em `ChannelComposer`/`GeneralChannelView`.

**Próximo na fila Atlas:** PRO-4 dados live overview; gestor Ajustar/Recusar no chat; T3 §9 ActivityGroup (depende eventos host).

---

## 2026-11-04 00:38 — T3-UX-HARVEST (Prism wire, Muse spec)

**Feito (ordem de impacto):**
- §1: roving ↑/↓ no rail (`RailTeam` + `rail-roving-focus.ts`); →/← nos grupos do sidebar; F2 renomeia assunto; `composer-focus.ts` + restore ao sair da Busca (`ConnectedSearchView`, Escape → #geral); F6 já estava (`area-navigation.ts`).
- §3: `composer-memory.ts` (histórico ↑, bolso Ctrl+S, colagem ≥32 KiB → anexo); integrado em `ChannelComposer`.
- §4 (UI): botão âmbar fila/direcionar + dicas Ctrl+Enter quando persona `working` (steer real: Forge/Anvil).
- §5: `MessageQuoteToolbar` + chip de citação no composer.
- §6: `/` menu (`composer-slash-commands`, `ComposerSlashMenu`); `$` skills pendente.
- §8: `/limites` → `ComposerLimitsPanel`; `PooledQuotaBar` compact na gaveta Contexto (`TurnContextDrawer`).
- §10: menu assunto Concluir + Lembrar depois (callbacks opcionais no `SubjectBar`).
- §12/§13: props `quotaBlocked`/`resume` e chip de autonomia no composer (wire live pendente).

**Gestor (turno anterior):** host RPCs, plano no chat, arriving + paw — ver commit local.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/composer-memory.client.spec.ts packages/persona/client-ui-persona/tests/area-navigation.client.spec.ts packages/persona/client-ui-persona/tests/pooled-activity.client.spec.tsx
```

**Pendente:** §9 `ActivityGroup` no fio (precisa eventos de ferramenta do host); §4 fila tracejada + RPC steer; §11 painel `/lado`; §6 `$` skills; §12 faixa âmbar live (Lumen); autonomia live no composer; capturas Muse.

**Muse:** editor Gestor + plano chat + chegada prontos para captura (BRIEFING 20).

---

## 2026-11-04 00:30 — BRIEFING 20 Gestor de equipe (wire Prism)

**Feito:** host `listGestorPlans`, `proposeGestorAssemble`, `setPersonaSystemRoles`; `GestorPlanMessageCard` no #geral; `approveGestorPlan` + arriving; locales gestor/gestorPlan; testes gestor.

---

## 2026-11-04 00:20 — BYC-1 onboarding + RPC pasta vault (BRIEFING 18)

**Feito:** `BringYourContextBlock` no passo 2; host preview BYC; Cofre drawer.

**Pendente:** BYC-4 Lumen; apply/dedup host; typert regen.

---

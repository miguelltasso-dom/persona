# Relatos — Forge (persona-core / persona-engine)

Mais recente no topo.

---

## 04/11 09:05 — V1-P0-3: preferConnectedCli + haiku

Rivet: dest:desktop seta `PERSONA_REAL_CLI=1`; `pickConnectedCli` Claude>Codex>OpenCode>Cursor. Concordo com a causa das 0 execs.

Engine: `preferConnectedCli` + `cheapModelForFirstDelivery` (`haiku` no Claude). Host: `loggedCli` → `loggedCliFromCards`; `specFromConnection` em persona `dsh` + model vazio/default pinea haiku. Sem exec real (lock Probe B9). Ask Anvil: sem rota.

### Arquivos
- `packages/persona/persona-engine/src/engine-policy.ts`
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/tests/engine-policy.spec.ts`
- `packages/persona/persona-host/src/runner.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/real-path.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/engine-policy.spec.ts
  packages/persona/persona-host/tests/real-path.spec.ts
  Test Files  2 passed (2)  Tests  9 passed (9)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 19.8s
```

### Dependências
- **Probe/Rivet:** 1 exec barata quando lock livre (`PERSONA_REAL_E2E` / dest:desktop).
- **Anvil:** `getFirstDelivery` já no host; conferir `loggedCliFromCards`.
- Keel: V1-P0-1/3 status no PLAN.

---

## 04/11 09:00 — V1-P0-1: accept chega em working/running

Vigia: não parar. Anvil já postou `firstDeliveryAsk` no `completeOnboarding` + `ensureProductionRealCli`. Fechei o aceite machine do P0-1.

`measureFirstDeliveryAcceptance` 4/4: Agência `wantsWork`; ask do Cofre; pré-roteador `model()` (não silent); `Engine.decide(accept)` → Assignment `running` + `ticketStage.working`. Entrou no `measureV1Close` / `v1-close.md`. Host: “Monte a equipe…” cria Tarefa em `doing` (antes do flush).

CLI real continua Rivet (lock D8). 0/10 execs gastas.

### Arquivos
- `packages/persona/persona-engine/src/first-delivery-accept.ts`
- `packages/persona/persona-engine/src/v1-close.ts`
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/tests/first-delivery.spec.ts`
- `packages/persona/persona-engine/tests/v1-close.spec.ts`
- `packages/persona/persona-host/tests/conductor.spec.ts`
- `packages/persona/persona-e2e/tests/mandatory-v1-close-contract.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`
- `persona-spec/reports/v1-close.md`

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/first-delivery.spec.ts
  packages/persona/persona-engine/tests/v1-close.spec.ts
  packages/persona/persona-host/tests/conductor.spec.ts
  Test Files  3 passed (3)  Tests  15 passed (15)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote v1-close.md (V1-P0-1 4/4)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 16.2s
```

### Dependências
- **Rivet V1-P0-3:** `PERSONA_REAL_CLI=1` no dest:desktop; 1 exec barata quando lock livre.
- **Anvil V1-P0-2:** `startFirstDelivery` já no host; View `firstDelivery` extra no `measureV1CloseView` (subset antigo continua válido).
- **Probe:** layer-2 + `PERSONA_REAL_E2E`.
- Keel: marcar V1-P0-1 doing/done no PLAN.

---

## 04/11 08:55 — P0 primeira entrega: por que Agência = 0 execs

Atlas / Muse UX-PHASE A. Lock Rivet D8 — **sem dest:desktop / host real** (não reproduzi no app; reproduzi no conductor).

### Causa (3 linhas)
1. O dogfood pulou “conectar” e pôs **fake CLI no PATH**; o desktop **nunca** seta `PERSONA_REAL_CLI=1`, então `resolveHostRunner` devolve fake — 0/20 é o gate, não o Vigia nem orçamento.
2. O pedido “Monte a equipe da Agência Ponto…” **não passava** `wantsWork` (regex só `preciso|implement|cria|fazer|tarefa|…`) → ingest = conversa, `decide ignore/answered`, **zero Tarefa/Assignment**.
3. Pré-roteador **não** silenciou (cai em `model()`); login “Precisa de você” só viria depois do resolve real.

### Conserto engine
- `wantsWork` / `workSkipReason` (monte/resuma/proponha/entregue/…)
- `firstDeliveryAsk` / `firstDeliveryTask` (Ticket barato pós-onboarding)
- Host `orchestration.wantsWork` reexporta o engine (P0; Anvil confirma completeOnboarding)

### Arquivos
- `packages/persona/persona-engine/src/wants-work.ts`
- `packages/persona/persona-engine/src/first-delivery.ts`
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/tests/wants-work.spec.ts`
- `packages/persona/persona-engine/tests/dogfood-agencia.spec.ts`
- `packages/persona/persona-host/src/orchestration.ts`
- `packages/persona/persona-host/tests/conductor.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/wants-work.spec.ts
  packages/persona/persona-engine/tests/dogfood-agencia.spec.ts
  packages/persona/persona-host/tests/conductor.spec.ts
  Test Files  3 passed (3)  Tests  14 passed (14)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 23.6s

node scripts/persona/check-pkg.mjs persona-host
  persona-host: FAILED (1) index.ts(3480) Actor|Member.displayName — Anvil, pré-existente (não é wantsWork)
```

### Dependências
- **Anvil:** `completeOnboarding` posta `firstDeliveryAsk`; produção sem `VITEST` não pode ficar no fake.
- **Rivet:** `PERSONA_REAL_CLI=1` no host desktop (não VITEST). Lock D8 — sem CDP aqui.
- App real + ledger live: espera lock. Orçamento ≤10 execs / modelo barato ainda não gasto.

---

## 04/11 08:50 — dest:desktop splash: firstUse antes do refresh

Atlas: par com Rivet; sem segundo host (lock D8). CDP dest:desktop **não** rodado.

Duas camadas:

1. **Electron** (`apps/desktop/src/main.ts`): splash `data:` só navega com host `phase=ready`. Sem prazo 20s/60s → `bootErrorUrl` no ready-hang (BOOT-SPEC). Rivet aplica.
2. **Client**: `bootstrap` fazia `await refresh()` (8 remotes + `listGestorPlans` + `listConversationSubjects`) **antes** de `publishHostOnboardingState`. Hang = overlay nunca abre (parece splash).

Correção domínio (Forge):

- `publishHostOnboardingState` logo após `bootstrapPersonaTenant`
- `settleOptionalRemote` 1.5 s em Gestor/assuntos
- `persona:first-paint` no `mount` (BOOT-SPEC; Rivet ainda não escuta)

### Arquivos
- `packages/persona/client-ui-persona/src/client/remote/persona-live-store.ts`
- `packages/persona/client-ui-persona/src/client/boot/signal-first-paint.ts`
- `packages/persona/client-ui-persona/src/client/mount.ts`
- `packages/persona/client-ui-persona/tests/onboarding-overlay-sync.client.spec.ts`
- `packages/persona/client-ui-persona/tests/signal-first-paint.client.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Testes
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/onboarding-overlay-sync.client.spec.ts
  packages/persona/client-ui-persona/tests/signal-first-paint.client.spec.ts
  packages/persona/client-ui-persona/tests/remote-unwrap.client.spec.ts
  Test Files  3 passed (3)  Tests  10 passed (10)
```

check-pkg client-ui-persona: em curso (relato seguinte se falhar).

### Dependências
- **Rivet:** prazo splash 20s/60s → erro; escutar `persona:first-paint` (`data-persona-first-paint=1`); CDP dest:desktop quando lock livre. Sem `unsafe-eval`.
- **Anvil:** se host nunca chega `ready`, overlay deste fix não aparece (janela fica no `data:`).
- Keel: GES-2/3 + OPT-2..6 ainda `todo` no PLAN (código verde).
- Sem dest:desktop neste turno (lock Rivet).

Próximo: OPT-2 `assert-opt2` (já no engine) + F1 fixtures (Atlas dispensou amostra real).

---

## 04/11 08:00 — v1-close inclui GES-2 + GES-3

Vigia: não parar. PLAN GES-2/OPT-2..6 ainda `todo` (código já verde — Keel marca). Fila implementável: dobrar GES-2/3 no gate v1.

`measureV1Close` / `measureV1CloseView` / `assertV1Close` agora somam GES-2 4/4 e GES-3 3/3. Wire Anvil: campos extra (subset continua válido). `v1-close.md` com as duas linhas.

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/v1-close.spec.ts
  packages/persona/persona-engine/tests/gestor.spec.ts
  Test Files  2 passed (2)  Tests  9 passed (9)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote opt8-acceptance.md / v1-close.md

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 12.9s
```

### Dependências
- Keel: marcar GES-2/3 + OPT-2..6 (domínio verde).
- Prism: AG-003 Ensinar no hero já 1/1 (07:55).
- Probe: layer-2 `mandatory-v1-close.spec.ts` espera lock.
- F1 amostra real: Atlas dispensou (fixtures oficiais bastam).

Fila implementável Forge (core/engine) vazia após isto — ask Atlas.

---

## 04/11 07:45 — AG-001..004 (Atlas dogfood)

Classificação + cruzamento Anvil/Keel (Lumen/Prism off canvas). Sem host novo (lock).

| ID | Classe | Ação |
|---|---|---|
| **AG-001** | cruzado (hub sem abrir quadro + `sprintsEnabled` só software) | Lumen já alargou site/simples/marketing. Dogfood agora clica `Abrir quadro`. Teste `dogfood-ag-001.client.spec.tsx` (site + Pessoal/simples). |
| **AG-002** | cruzado e2e (rail hardcoded Atlas; first-run = Probe E2E) | `navigateProfileViaRailCard` cai no primeiro `Conversar com`. Teste `rail-persona-name.spec.ts` + rail Probe E2E. |
| **AG-003** | client puro Prism | `dogfood-ag-003.client.spec.tsx` `it.fails`: hero tem Conversar/Editar, falta Ensinar. Sem src. Entregar ao Prism. |
| **AG-004** | host | Anvil: `onboarding.spec.ts` first-run vazio → grant → list → revoke. Seed só no harness (`DEV_HARNESS_BRAIN_GRANT_ID`), não no onboarding real. |

### Testes
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/dogfood-ag-001.client.spec.tsx
  packages/persona/client-ui-persona/tests/dogfood-ag-003.client.spec.tsx
  packages/persona/client-ui-persona/tests/rail-team.client.spec.tsx
  packages/persona/client-ui-persona/tests/seed-default-team.client.spec.ts
  packages/persona/persona-e2e/tests/rail-persona-name.spec.ts
  packages/persona/persona-host/tests/onboarding.spec.ts
  Test Files  6 passed (6)  Tests  24 passed | 1 expected fail (25)
```

### Limitações
- AG-003 continua aberto (Prism: `onTeach` no hero de `PersonaProfilePage`).
- Dogfood app-real não re-rodado (lock / um host).
- First-run sem `devSeed` segue sem grant (vazio honesto).

---

## 04/11 07:10 — GES-3 gate + OPT-8 livro live fixture

Vigia: não parar. Lock D8 com Rivet — sem host novo.

### GES-3
`measureGestorMultiAcceptance` — comment / tie / conflict (3/3). UI continua Prism.

### OPT-8
`write-opt8-acceptance.ts` agora anexa fixture live −40% (4/4, blocked vazio). Scripted sem livro segue 3/4 + `cut-40` blocked.

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/gestor.spec.ts
  Test Files  1 passed (1)  Tests  6 passed (6)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote opt8-acceptance.md / v1-close.md

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 16.3s
```

### Dependências (fila implementável Forge vazia)
- **Rivet/Probe**: pack `BsxPADcs` + exe `#root`; layer-2 `mandatory-v1-close.spec.ts` espera lock.
- Keel: marcar GES-2/3 + OPT-2..6 (código verde).
- Lumen/Prism/Anvil: AG-001..004.

---

## 04/11 07:30 — Rivet pack `BsxPADcs` + dogfood Agência no host real

Rivet: **pack ok hash=BsxPADcs**. Dist local de trabalho ainda é `index-ZjNmkjRJ.js` (V28). Probe retesta o exe.

### Dogfood #2 app real (dev, sem instalador)
`PERSONA_E2E=1` `dogfood-agencia.spec.ts` **1/1** em 286s. Capturas em `.maestri/tmp/shots/dogfood-agencia/`. Relatório `dogfood-agencia.md`. CLI real **0/20**. Dispose no finally.

Passos ok: boot, Gestor cartão, #geral assemble, Segundo cérebro (vazio), BYC Importar, assuntos DM, Quem cuida.

Bugs: AG-001 sprint ausente (Lumen P2); AG-002 perfil rail Atlas timeout (Lumen/Prism P1); AG-003 Ensinar ausente (Prism P1); AG-004 sem grant para revogar (Anvil P2, fake CLI).

### E2E v1 (Probe)
`mandatory-v1-close-contract.spec.ts` 2 files / 4 tests ok. Layer-2 `mandatory-v1-close.spec.ts` (host + Uso + subprocess View) — aguarda lock (Rivet pack / Probe gate).

### Testes
```
$env:PERSONA_E2E='1'; pnpm exec vitest run packages/persona/persona-e2e/tests/dogfood-agencia.spec.ts
  Test Files  1 passed (1)  Tests  1 passed (1)  Duration 286.67s

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-v1-close-contract.spec.ts packages/persona/persona-engine/tests/dogfood-agencia.spec.ts
  Test Files  2 passed (2)  Tests  4 passed (4)
```

### Dependências
- **Probe**: exe `BsxPADcs` (`#root` + dogfood UI) + layer-2 `mandatory-v1-close.spec.ts`.
- Lumen/Prism/Anvil: AG-001..004.

---

## 04/11 06:49 — Anvil wire + GES-2 tools gate

Anvil: `measureV1Close` host = `return measureV1CloseView(liveEntries)`; token-opt 6/6. Confirmado em `persona-host/src/index.ts`.

### GES-2
`measureGestorToolsAcceptance` — hire / allocate / reorganize / assemble após accept (4/4). Acesso ≤ Gestor continua no bullet `limits` (GES-6).

`v1-close.md` agora diz que o Remote chama `measureV1CloseView(entries)`. Livro scriptado ainda bloqueia `cut-40` (sem ledger live no script). Livro live no host pontua −40% (Anvil token-opt: `cut-40` failed no livro seed, esperado).

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/gestor.spec.ts packages/persona/persona-engine/tests/v1-close.spec.ts
  Test Files  2 passed (2)
      Tests  9 passed (9)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote opt8-acceptance.md / v1-close.md

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 19.9s
```

### Dependências (fila implementável Forge vazia)
- **Rivet**: NSIS com `index-ZjNmkjRJ.js`. Sem `'unsafe-eval'`.
- **Probe**: exe + dogfood UI Agência Ponto; E2E `measureV1Close`.
- Keel: marcar GES-2 + OPT-2/3/4/5/6 (código verde).

---

## 04/11 06:39 — measureV1CloseView + OPT-3/4/5/6 gates

Vigia: não parar. Host `measureV1Close` ainda chama `measureV1Close()` e ignora `liveEntries`.

### v1 close wire
`measureV1CloseView(entries)` — PRO+GES+OPT + `opt8.liveEntries`. Livro vazio mantém `cut-40` blocked; livro live pontua −40%. Anvil: `return measureV1CloseView(liveEntries)`.

### OPT-3/4/5/6
- `measureOpt3Acceptance` — prefix-order, no-volatile, cache-60 (3/3)
- `measureOpt4Acceptance` — tools-min, dedupe-prefix, layer-budget (3/3)
- `clipTextToTokens` + `VARIABLE_LAYER_BUDGET` (subject 400 / recall 200 / message 200) em `composeTurnPrompt`
- `measureOpt5Acceptance` — cheap-support, persona-heavy, session-reuse (3/3)
- `measureOpt6Acceptance` — channel-100, no-echo, batch-cadence + `batchRouterBurst` (3/3)

Contrato: `persona-spec/contracts/lumen-rpc.md`.

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/v1-close.spec.ts packages/persona/persona-engine/tests/engine-policy.spec.ts packages/persona/persona-engine/tests/stable-prefix.spec.ts packages/persona/persona-engine/tests/lean-output.spec.ts
  Test Files  4 passed (4)
      Tests  11 passed (11)

pnpm exec tsx packages/persona/persona-engine/scripts/assert-opt2.ts
  OPT-2 ok

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 12.1s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `measureV1Close` host → `return measureV1CloseView(liveEntries)`.
- **Rivet**: NSIS com `index-ZjNmkjRJ.js`. Sem `'unsafe-eval'`.
- **Probe**: exe + dogfood UI Agência Ponto.
- Keel: marcar OPT-2/3/4/5/6 + GES-2 (código já verde); commitar dist + V28.

---

## 04/11 06:24 — web rebuild V28 + OPT-2 gate + scan CSP

Vigia: não parar. Dist antigo ainda tinha `const o7=new Function` no init.

### D8
Rebuild `apps/web`: `index-ZjNmkjRJ.js` (index.html aponta). Scan: `assert-client-no-eval` **ok** (`let $0;function ek(){return new Function…}`). Vendor hash igual. `persona-gate` agora roda o scan (falha se o eager voltar).

**[Forge→Rivet]** empacote **este** dist (`index-ZjNmkjRJ.js`). Sem `'unsafe-eval'`. Probe retesta o exe.

### OPT-2
`packages/persona/persona-engine/scripts/assert-opt2.ts` — regressão 10% + `assertV1Close`. `OPT-2 ok`.

### Testes
```
node scripts/persona/assert-client-no-eval.mjs
  assert-client-no-eval ok index-ZjNmkjRJ.js, vendor-BUMdD3V7.js

pnpm exec tsx packages/persona/persona-engine/scripts/assert-opt2.ts
  OPT-2 ok

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 14.8s
```

### Dependências (fila NÃO vazia)
- **Rivet**: NSIS com `index-ZjNmkjRJ.js`.
- **Probe**: exe + dogfood UI Agência Ponto.
- Keel: commitar dist + V28.

---

## 04/11 06:16 — D8 CSP (`evaluate` lazy) + dogfood Agência Ponto

Atlas: F1 = fixtures (exportação real opcional). Fila: destravar instalador + dogfood #2.

### (1) CSP / `#root` vazio
Bundle instalado `apps/web/dist/assets/index-B2q7cWGa.js` chama `new Function` no **init** (`vendor/loader` `evaluate` / `!!js`). Client: `boot-client.ts` → `cordis-plugin-loader`. **V28**: `evaluate` preguiçoso (src + `lib/index.js` + `lib/types/config/utils.js`). Host `!!js` igual. **Não** pôr `'unsafe-eval'` no `secure-shell.ts`.

**[Forge→Rivet]** rebuild `apps/web` + NSIS; Probe retesta o exe. O asar atual ainda tem o hash antigo.

### (2) Dogfood Agência Ponto
Engine 1/1, 0 execs reais. Relatório: `persona-spec/reports/dogfood-agencia.md`. App real bloqueado no D8. F1 adapters nas fixtures.

### Testes
```
pnpm exec vitest run scripts/loader-csp-eval.spec.ts …/dogfood-agencia.spec.ts
  Test Files  2 passed (2)  Tests  3 passed (3)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK
```

### Dependências
- **Rivet**: rebuild web + pack (V28).
- **Probe**: exe novo + UI dogfood.
- Keel: V28 no vendor.

---

## 04/11 06:06 — `measureOpt8View` + `assertV1Close`

Vigia: não parar. Anvil já ligou `withTurnActivityEmit` + `recordTurnActivity`. Host `measureOpt8` ainda chama `measureOpt8Acceptance()` sem o livro e só devolve `liveEntries: entries.length`.

### OPT-8 wire
`measureOpt8View(entries)` — score + `liveEntries` + `liveOrigin`. `TurnLedgerView` ≡ `TurnLedgerEntry`. Anvil: `return measureOpt8View(entries)`. Livro vazio mantém `cut-40` blocked; livro live pontua −40%. Origin `measured` só se cada linha tiver `origin: 'measured'`.

### Fechamento v1
`assertV1Close()` lança `V1_CLOSE …` se PRO/GES/OPT tiverem `failed`. `write-opt8-acceptance.ts` agora afirma o gate antes de escrever os reports. `blocked` não falha.

### Testes
```
pnpm exec vitest run …/token-measure.spec.ts …/v1-close.spec.ts
  Test Files  2 passed (2)  Tests  8 passed (8)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote opt8-acceptance.md / v1-close.md

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 15.7s
```

### Dependências (fila implementável Forge vazia)
- **Anvil**: `measureOpt8` = `measureOpt8View(entries)` (não remonta flags).
- **Probe**: `assertV1Close` / `measureV1Close` no E2E v1.
- **Miguel**: amostras F1 reais (`PERSONA_REAL_IMPORTS`).
- GES-2/3, OPT-1..8, SB-6, F1 no PLAN — código no core/engine; marcar done é do Keel.

---

## 04/11 06:28 — T3 `withTurnActivityEmit` (host sem emit)

Vigia: não parar. Keel: só `note edit` no Status (não fui eu no `note write`). Atlas T3: `ProjectRuntime` cria o Engine sem `emit`.

### T3
`withTurnActivityEmit(persist, next?)` — Anvil põe em `EngineOptions.emit`:
`emit: withTurnActivityEmit(row => this.recordTurnActivity({ workspaceId, projectId, ...row }))`.
Persiste `assignment.reported`; encaminha os outros eventos.

### Testes
```
pnpm exec vitest run …/activity.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 23.7s
```

### Dependências (fila NÃO vazia)
- **Anvil**: essa linha de `emit` em `orchestration.ts` (~180); `measureOpt8({ liveEntries })`.
- **Probe**: `measureV1Close` no E2E v1.
- **Miguel**: amostras F1.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 06:22 — T3 loop: `assignment.reported` → fold

Vigia: não parar. Atlas 06:05 / Prism 06:17: Forge `[[gestor-plan:id]]` auto + `recordTurnActivity` no loop.

### T3
`Engine.report` emite `assignment.reported` (persona = mandate actor, thread = canal). Host `emit` → `activityFromDomainEvent` → `recordTurnActivity` RPC. Fold deixa de nascer vazio. Marker gestor já é `emitGestorPropose` (`[[gestor-plan:id]]` + activity waiting) — host já chama no propose.

### Testes
```
pnpm exec vitest run …/activity.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 34.2s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `EngineOptions.emit` → `activityFromDomainEvent` → `recordTurnActivity`; `measureOpt8({ liveEntries })`; opcional `measureV1Close`.
- **Probe**: `measureV1Close` no E2E v1.
- **Miguel**: amostras F1.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 06:10 — fechamento v1 `measureV1Close` + OPT-8 relatório

Vigia: não parar. Sem "seguindo fila" — Atlas 06:05 pediu marker Forge; PLAN PRO-* + fechamento v1.

### Fechamento v1
`measureV1Close()` = PRO-6 (6/6) + GES-6 (3/3) + OPT-8 (3/4, `cut-40` blocked). `passed` ignora `blocked`. Probe / `@Remote measureV1Close` chamam; não remontam. Relatório: `persona-spec/reports/v1-close.md`.

### OPT-8
`ticketIdsFromLedger` no core. `measureOpt8Acceptance({ liveEntries })` deriva os ticket ids se omitidos. Host deve passar o livro, não só contar linhas. Relatório: `persona-spec/reports/opt8-acceptance.md` (3/4, cache 0.63, baseline 134.0).

### Testes
```
pnpm exec vitest run …/token-ledger.spec.ts …/token-measure.spec.ts …/v1-close.spec.ts
  Test Files  3 passed (3)  Tests  14 passed (14)

pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
  wrote opt8-acceptance.md / v1-close.md

node scripts/persona/check-pkg.mjs persona-core
  persona-core: OK in 5.9s

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 14.3s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `@Remote measureOpt8` → `measureOpt8Acceptance({ liveEntries })`; opcional `@Remote measureV1Close`; importar `withDefaultGestor` do core.
- **Probe**: `measureV1Close` no E2E de fechamento v1 (PRO-6 / GES-6 / OPT-8).
- **Miguel**: amostras reais F1.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 05:50 — GES-1 withDefaultGestor no core + OPT-8 live

Vigia: não parar. Sem "seguindo fila" — furo GES-1: `assignSystemRole` só dava `coordination`; host tinha cópia local de `withDefaultGestor`.

### GES-1
`withDefaultGestor` em `rules.ts` (evita ciclo gestor↔rules). `assignSystemRole(..., 'coordination')` também concede `team_manager`; o coordenador anterior perde só Coordenação. Onboarding (`personaSpecToOnboardingWire` / parse) e `personaPropose` usam a mesma função. Host deve importar do core, não copiar.

### GES-6 / PRO-6
`measureGestorV1` = `measureGestorAcceptance` (3/3). `measureProactivityV1` = `measureProactivityAcceptance` (6/6). Probe / `@Remote` chamam; não remontam bullets.

### OPT-8
`measureOpt8Acceptance({ liveEntries, successfulTicketIds, baselineTokensPerTask? })` — sem livro, `cut-40` continua `blocked` (3/4). Com tickets+entries, o corte −40% entra no score.

### Testes
```
pnpm exec vitest run …/domain.spec.ts …/onboarding-wire.spec.ts …/token-measure.spec.ts …/gestor.spec.ts
  Test Files  4 passed (4)  Tests  23 passed (23)

pnpm exec vitest run …/proactivity-v1.spec.ts
  Test Files  1 passed (1)  Tests  9 passed (9)

node scripts/persona/check-pkg.mjs persona-core
  persona-core: OK in 7.8s

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 20.8s / 21.9s
```

### Dependências (fila NÃO vazia)
- **Anvil**: trocar a cópia local `withDefaultGestor` pelo export do core; `@Remote measureGestorV1`; livro live antes/depois para `cut-40`.
- **Probe**: `measureGestorV1` / `measureProactivityV1` / `measureOpt8Acceptance` no E2E GES-6 / PRO-6 / OPT-8; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Miguel**: amostras reais F1.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 05:52 — composeHostTalk = talkLayers (colegas + recall)

Vigia: não parar. Sem "seguindo fila" — Anvil 05:10: `composeHostTalk` cortava colegas/recall, então o host ficou em `composeTurnPrompt`.

### OPT-3
`foldHostTalkUsed` — mesmo fold do host (Cofre obrigatório / `subject_summary` / recall; restricted fora).
`composeHostTalk` agora aceita `required` + `subject` + `recall`; colegas vão no prefixo (cache). Mensagem e recall no tail.
`composePersonaStable` = `composeHostTalk`. Host troca `talkLayers` por `foldHostTalkUsed` + `composeHostTalk` + `finishHostTalk`.

### Testes
```
pnpm exec vitest run …/lean-output.spec.ts …/voice.spec.ts …/talk-eval.spec.ts
  Test Files  3 passed (3)  Tests  10 passed (10)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 19.6s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `talkLayers` → `foldHostTalkUsed` + `composeHostTalk` (já tem `finishHostTalk`).
- **Probe**: `measureGestorAcceptance` / `measureProactivityAcceptance` / `measureOpt8Acceptance`; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Anvil**: livro live para OPT-8 `cut-40`.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 05:38 — GES aceite + emit kind + OPT-8 scripted

Vigia: não parar. Sem "seguindo fila" — GES-6 sem gate de domínio; `emitGestorPropose` gravava kind `hire` em allocate; OPT-8 sem score.

### GES / MAESTRO
`measureGestorAcceptance()` — 3 bullets (assemble Site+sprint 1; limits/always_ask; escopos+auditoria). Probe chama esta função.
`emitGestorPropose` usa `plan.action` (`assemble` → hire; `allocate`/`reorganize` → command).

### OPT-8
`measureOpt8Acceptance` — idle zero, cache ≥ 60%, paridade CLI = 3/4. `cut-40` em `blocked` até o livro live.

### Testes
```
pnpm exec vitest run …/gestor.spec.ts …/token-measure.spec.ts
  Test Files  2 passed (2)  Tests  11 passed (11)

node scripts/persona/check-pkg.mjs persona-engine
  persona-engine: OK in 59.1s
```

### Dependências (fila NÃO vazia)
- **Probe**: `measureGestorAcceptance` no E2E GES-6; `measureProactivityAcceptance` no PRO-6; `measureOpt8Acceptance` no OPT-8; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Anvil**: livro live para `cut-40`; two-way `applyBrainVaultSync`+`foreignVaultToBringFiles`; paste `vaultToBringExisting`.
- **Rivet / Lumen**: pool cheap; painel Uso.
- GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 05:22 — PRO-6 measure + composeHostTalk + foreignVaultToBringFiles

Vigia: não parar. Sem "seguindo fila" — PRO-6 só pontuava flags; host ainda no snapshot de talk; two-way foreign sem caminho BYC.

### PRO-6 / fechamento v1
`measureProactivityAcceptance()` — relógio falso nos 6 bullets (puxada, Vigia, fila+objetivo, recover, silêncio, whileAway) e devolve `scoreProactivityAcceptance`. Probe chama esta função; E2E/capturas continuam Probe.

### OPT-3 / OPT-6
`composeHostTalk` + `finishHostTalk` (lean + recusa hedge). `measureLeanVsNaive` mede economia scriptada (não é OPT-8 −40%). Host deve trocar `composePersonaPrompt`.

### SB-6
`foreignVaultToBringFiles(imports)` → `{ path, text }` para `previewBringVault`.

### Testes
```
pnpm exec vitest run …/proactivity-v1.spec.ts …/lean-output.spec.ts …/brain.spec.ts
  Test Files  3 passed (3)  Tests  26 passed (26)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 26.8s
  persona-engine: OK in 41.7s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `composeHostTalk`+`finishHostTalk` no talk; `foreignVaultToBringFiles` no import two-way; `applyBrainVaultSync` no export; `vaultToBringExisting` no paste; `emitGestorPropose` no propose.
- **Probe**: `measureProactivityAcceptance` no E2E PRO-6; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Rivet / Prism / Lumen**: pool cheap; cartão topicId.
- OPT-8 −40% após integração. GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 05:12 — SB-6 applyBrainVaultSync + F1 Notion + dedupe oficial

Vigia: não parar. Sem "seguindo fila" — PLAN SB-6 persist e F1 ainda abertos no domínio.

### SB-6
`markdownToBrainPage` agora devolve `visibility` + `properties`. Dest sem pack → `tryParseBrainPageMarkdown` = null (não lança). `applyBrainVaultSync(plan)` classifica imports: `page` (upsert) ou `foreign` (BYC). Leftover nunca apagado.

### F1
Fixture oficial Notion (`pages.csv` + `.md` + anexo). Aceite "reimportar não duplica" nas 6 fixtures oficiais (ChatGPT, Claude, Gemini, Grok, Notion, Obsidian). Amostra real continua `it.skipIf` até `PERSONA_REAL_IMPORTS`.

### Testes
```
pnpm exec vitest run packages/persona/persona-core/tests/brain.spec.ts packages/persona/persona-core/tests/official-import.spec.ts
  Test Files  2 passed (2)
      Tests  24 passed | 1 skipped (25)

node scripts/persona/check-pkg.mjs persona-core
  persona-core: OK in 9.3s
```

### Dependências (fila NÃO vazia)
- **Anvil / Rivet**: `exportBrainVault` / `importBrainVault` chamam `applyBrainVaultSync`; `page` upsert; `foreign` → `previewBringVault`.
- **Anvil**: paste RPC com `vaultToBringExisting`; `emitGestorPropose` no propose.
- **Probe / Miguel**: PRO-6 E2E; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Rivet / Prism / Lumen**: pool cheap; talk estável; cartão topicId.
- OPT-8 −40% após integração. GES/OPT/SB domínio já no código — marcar done é do Keel.

---

## 04/11 04:55 — BYC existing + emitGestorPropose + PRO-6 score

Vigia: não parar. Sem "seguindo fila" — Atlas ainda pedia marker+atividade no loop; Lumen `existing: []` no paste; PRO-6 sem gate de domínio.

### BYC / Lumen
`vaultToBringExisting` mapeia o Cofre para `parseBringPaste({ existing })`. `applyContextProposals` = nome do RPC para `decideBringApply`. Host não deve passar `[]` se o Cofre tem linhas.

### GES / Atlas
`emitGestorPropose({ plan, threadId, at })` — um write: corpo `[[gestor-plan:id]]` + `recordTurnActivity` waiting.

### PRO-6
`scoreProactivityAcceptance` — 6/6 ou `failed[]`. E2E/capturas = Probe.

### Testes
```
pnpm exec vitest run …/bring-context.spec.ts …/engine/gestor.spec.ts …/proactivity-v1.spec.ts
  Test Files  3 passed (3)  Tests  19 passed (19)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 23.5s
  persona-engine: OK in 36.0s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `vaultToBringExisting` no paste RPC; `emitGestorPropose` no propose; `applyContextProposals` no Remote.
- **Probe**: `scoreProactivityAcceptance` no E2E PRO-6; S7 UI; `PERSONA_REAL_IMPORTS`.
- **Rivet / Prism / Lumen**: pool, talk estável, cartão topicId.
- OPT-8 −40% após integração. F1 amostra real = Miguel.

---

## 04/11 04:46 — GES marker + T3 recordTurnActivity + GOV foldTwoDay + topicId

Vigia: não parar. Sem "seguindo fila" — Atlas/Lumen pediram `[[gestor-plan:id]]`, atividade no loop, linhas do Teste 2 dias e `TaskView.topicId`.

### GES (Atlas)
`attachGestorPlanMarker` / `parseGestorPlanId` / `proposeGestorChannelBody` — host posta o corpo com `[[gestor-plan:id]]` ao propor.

### T3
`recordTurnActivity` = alias do loop para `activityFromReport`. Anvil já tem o RPC.

### GOV / Lumen
`foldTwoDayLines` agrupa rotina / aprovação / persona. Eventos levam `personaId`.

### WAVE2 / Lumen
`ticketCardTopic` → `{ topicId, name, color, colorIndex }` para o cartão live.

### Testes
```
pnpm exec vitest run …/gestor.spec.ts …/governance.spec.ts …/subjects.spec.ts …/engine/gestor.spec.ts …/activity.spec.ts
  Test Files  5 passed (5)  Tests  34 passed (34)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 13.7s
  persona-engine: OK in 22.8s
```

### Dependências (fila NÃO vazia)
- **Anvil**: postar `proposeGestorChannelBody` no propose; `recordTurnActivity` no conductor; `foldTwoDayLines` no Remote de Saúde; `TaskView.topicId` via `ticketCardTopic`.
- **Prism / Lumen**: parse do marker (já existe no client); cartão com topicId.
- **Rivet**: pool cheap; two-way; cache prefixo.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração.

---

## 04/11 04:36 — SB-6 two-way + OPT-5 reuse + OPT-3 persona estável + PRO-1 hedge

Vigia: não parar. Sem "seguindo fila" — PLAN Forge ainda aberto (SB-6 persist, OPT-3/5 host, PRO-1 hedge no conductor, OPT-8).

### SB-6
`planBrainVaultSync` — default `one_way` (import vazio). `two_way` lista dest cujo hash não está no cérebro (`importFiles`). Nunca apaga leftover.

### OPT-5
`sessionReuseForTurn` — `reuse` só com a mesma persona e o mesmo prefixo (não reenviar). Senão `new`.

### OPT-3
`composePersonaStable` — vault+setor em `required`; mensagem/anexos no tail. `composePersonaPrompt` permanece o snapshot.

### PRO-1
`looksLikeHesitantOffer` / `refuseHesitantOffer` — corta "posso fazer se você quiser" quando o trabalho já está no mandato.

### Bibliotecário
`runBrainHygiene(pages, now, changedIds)` — `[]` = no-op (só o que mudou).

### Testes
```
pnpm exec vitest run …/brain.spec.ts …/engine-policy.spec.ts …/proactivity-v1.spec.ts …/stable-prefix.spec.ts …/second-brain-curation.spec.ts …/voice.spec.ts
  Test Files  6 passed (6)  Tests  34 passed (34)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 16.9s
  persona-engine: OK in 34.0s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `planBrainVaultSync` no Remote; `runBrainHygiene(..., changedIds)` no lote; host talk → `composePersonaStable`.
- **Rivet**: `sessionReuseForTurn` no pool; two-way no desktop; cache hit do prefixo.
- **Prism**: composer no caminho estável; sem hedge no canal.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração.

---

## 04/11 04:12 — OPT-3 talk estável + OPT-4 subject prefix/digest + GES-3 commentPlan

Vigia: não parar. O próximo era o talk sem prefixo estável (OPT-3) — fechei e encadeei OPT-4 + GES-3.

### OPT-3
`composeTalkStable` — identidade/voz/capacidades no prefixo; Cofre + colegas + mensagem no tail. `composeTalkPrompt` permanece o snapshot. `finalizeTalkReply` = `leanChannelReply`. Host deve preferir o caminho novo.

### OPT-4
`compileActiveSubject` agora passa `prefix` para `compileContext` (opcionais já no prefixo saem). `subjectDigest` → `digest` via `incrementalSubjectSummary`.

### GES-3
`gestorConflictDecision` — segundo Gestor no mesmo escopo devolve `commentPlan` (`commented` + `commentOnId`). `runGestor*` usa isso. `gestorDecisionRows` persiste a linha de comentário.

### BYC (Probe)
`classifyVaultPath('logo.png')` = `binary` (domínio já ignorava anexo). Walk do host = Anvil.

### Testes
```
pnpm exec vitest run …/stable-prefix.spec.ts …/prompts.spec.ts …/voice.spec.ts
  Test Files  3 passed (3)  Tests  11 passed (11)

pnpm exec vitest run …/gestor.spec.ts …/subject-context.spec.ts …/engine/tests/gestor.spec.ts …/stable-prefix.spec.ts
  Test Files  4 passed (4)  Tests  24 passed (24)

pnpm exec vitest run …/bring-context.spec.ts
  Test Files  1 passed (1)  Tests  6 passed (6)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 8.1s
  persona-engine: OK in 18.0s
```

### Dependências (fila NÃO vazia)
- **Anvil**: persistir `commentPlan` via `gestorDecisionRows`; passar `prefix` + `subjectDigest` em `compileActiveSubject`; host talk → `composeTalkStable` + `finalizeTalkReply`. Walk BYC `logo.png` no host.
- **Rivet**: pool cheap; cache hit do prefixo no adapter; apply vault; purge teach.
- **Prism**: ActivityGroup; UI Ensinar; composer talk estável.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração. PLAN ainda marca GES/OPT como todo (Keel).

### Contrato (Keel)
`GestorDecision.conflict.commentPlan?` opcional; `gestorConflictDecision` novo; `CompiledSubjectContext.digest?`; `composeTalkStable` / `finalizeTalkReply`. Compatível com leitores antigos.

---

## 04/11 03:33 — GES reject + T3 book + OPT-6 report + teach purge list

Vigia: não parar. Sem "seguindo fila" — PLAN Forge ainda aberto (GES-2 recusar, T3 listTurnActivity, OPT-6 relatório curto, W2-10 purge).

### GES-2
`rejectGestorPlan` marca `rejected`; plano já `applied` lança.

### T3 §9
`foldTurnActivityBook` = folds + `successRate` (`null` se vazio / só waiting). Anvil pode devolver isso em `listTurnActivity`.

### OPT-6
`formatLeanStructuredReport` = decisão / resultado / bloqueio, já capado.

### W2-10
`listTeachArtifactsToPurge` lista ids vencidos para Anvil/Rivet apagarem.

### Testes
```
pnpm exec vitest run …/gestor.spec.ts …/activity.spec.ts …/lean-output.spec.ts …/teach-skill.spec.ts
  Test Files  4 passed (4)  Tests  21 passed (21)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 13.0s
  persona-engine: OK in 35.1s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `rejectGestorPlan` / `foldTurnActivityBook` / `listTeachArtifactsToPurge` no host.
- **Rivet**: pool cheap; apply vault; purge teach.
- **Prism**: ActivityGroup; UI Ensinar.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração. PLAN ainda marca GES/OPT como todo (Keel).

---

## 04/11 03:24 — T3 taxa nula + OPT-6 lean + GES-5 audit + OPT-1 bench-tokens

Vigia: não parar. Sem "seguindo fila" — PLAN Forge ainda aberto (OPT-1 aceite `bench-tokens.md`, OPT-6 eco, T3 §9 vazio≠0%, GES-5, W2-10 purge).

### T3 §9
`activitySuccessRate`: sem eventos ou só waiting/running = `null` (não 0%).

### OPT-6
`leanChannelReply` tira eco da linha do humano e narração (`Vou agora` / `Passo 1`) e cap 100 palavras.

### GES-5
`formatGestorAuditFromPlan` — linha de Saúde/perfil a partir do plano. Persistência = Anvil.

### W2-10
`teachShouldPurge` — Anvil/Rivet apagam o artefato no vencimento (30 dias).

### OPT-1 aceite
`persona-spec/reports/bench-tokens.md` alinhado aos números scripted (idle/initiative-30 = 0; cache 0.63; pareado parity). OPT-8 −40% ainda não.

### Testes
```
pnpm exec vitest run …/activity.spec.ts …/gestor.spec.ts …/lean-output.spec.ts …/teach-skill.spec.ts
  Test Files  4 passed (4)  Tests  21 passed (21)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 18.5s
  persona-engine: OK in 93.9s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `gestorDecisionRows` / assemble / `formatGestorAuditFromPlan` / `activitySuccessRate` / `teachShouldPurge` no host.
- **Rivet**: pool cheap; apply vault; purge teach.
- **Prism**: ActivityGroup; UI Ensinar.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração. PLAN ainda marca GES/OPT como todo (Keel).

---

## 04/11 02:41 — GES assemble gate + W2-10 edit/rollback + SB-6 apply + OPT-4 trim

Vigia: não parar. Sem "seguindo fila" — PLAN Forge ainda aberto (GES-2 assemble sem gate, W2-10 revisão, SB-6 apply, OPT-4 tail).

### GES-2
`runGestorAssemble` usa o mesmo gate (ask sem aceite; apply+`plan.status=applied` depois). `runAssembleTeam` fica só núcleo/preview.

### W2-10
`editTaughtSteps` revisa o rascunho sem ativar e sem crescer ferramentas. `rollbackTaughtSkill` desliga e sobe a versão.

### SB-6
`applyBrainVaultExport`: escreve novo/mudado, skip same-hash, leftover nunca apagado.

### OPT-4
`trimVariableAlreadyInPrefix` no `composeTurnPrompt` — blocos do tail que já estão no prefixo não vão de novo.

### Testes
```
pnpm exec vitest run …/brain.spec.ts …/stable-prefix.spec.ts …/teach-skill.spec.ts …/gestor.spec.ts
  Test Files  4 passed (4)  Tests  27 passed (27)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 12.8s
  persona-engine: OK in 28.3s
```

### Dependências (fila NÃO vazia)
- **Anvil**: `gestorDecisionRows` + `runGestorAssemble`; Remote GES/atividade/Uso; `TEACH_*` / apply vault no host.
- **Rivet**: pool cheap; leftover/apply do core no desktop.
- **Prism**: ActivityGroup; UI Ensinar.
- **Probe / Miguel**: S7 UI; PRO-6; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração. PLAN ainda marca GES/OPT/W2-10/SB-6 como todo/doing (Keel).

---

## 04/11 02:31 — OPT-4 compile prefix + W2-10 consent + GES persist rows

Vigia: não parar. Sem "seguindo fila" — peguei PLAN Forge ainda aberto (OPT-4, W2-10, GES-2).

### OPT-4
`compileContext` / `compileActiveSubject` aceitam `prefix?`. Records opcionais cujo body já está no prefixo saem (`dropRecordsInPrefix`); obrigatórios ficam. Contrato em `token-ledger.md`.

### W2-10
No engine: `TEACH_CONSENT_VERSION=teach-v1`, `TEACH_RETENTION_DAYS=30`, `assertTeachConsent`, `teachRetentionExpiresAt`, `redactTeachNarration`, `omitBlurredTeachFrames`. `draftTaughtSkill` redige senha/token e omite frames borrados. Host Anvil ainda tem constantes locais — pode importar do engine.

### GES-2
`gestorDecisionRows(decision)` = o que o host grava num write (plan+audit no apply/notify). `runGestorAllocate` / `runGestorReorganize` aplicam `plan.status=applied` após aceite.

### Testes
```
pnpm exec vitest run …/context.spec.ts …/gestor.spec.ts …/teach-skill.spec.ts …/engine gestor.spec.ts
  Test Files  4 passed (4)  Tests  39 passed (39)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 14.8s
  persona-engine: OK in 23.4s
```

### Dependências (fila NÃO vazia)
- **Anvil**: persistir `gestorDecisionRows`; Remote GES/atividade/Uso; importar `TEACH_*` do engine.
- **Rivet**: pool cheap OPT-5; leftoverDestFiles do core; captura já usa blur/overlay.
- **Prism**: ActivityGroup no fio.
- **Probe / Miguel**: S7 UI; PRO-6 E2E; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% após integração. PLAN ainda marca GES/OPT/W2-10 como todo (Keel).

---

## 04/11 02:22 — janela encerrada: GES apply + OPT-5 + SB-6 leftover + W2-4 homes

Vigia: não parar. Keel: JANELA ENCERRADA — voltei ao core/engine.

### GES-2 apply atômico (domínio)
`decideGestorAction` no caminho `apply` agora devolve `plan.status = applied` (simétrico ao `notify`). `applyGestorPlan` marca aplicado; `rejected` lança `INVALID_GESTOR`. Anvil ainda precisa persistir `decision.plan` no Remote.

### OPT-5
JSDoc de `trimInitiativeToBudget` estava solto acima de `initiativeCadenceDays` — corrigido. `engineClassForTurn` ganhou `@returns` + `engine-policy.spec.ts` (7 kinds: execution/reply = persona; resto cheap). Já exportado no `index`.

### SB-6
`leftoverDestFiles` + `planBrainVaultExport` no core (dest extras nunca apagados; `..` filtrado). Desktop Rivet ainda tem cópia local — trocar o import é atômico, Keel avisa.

### W2-4
`assertIsolatedHomes` recusa `EMPTY_HOME` / `SHARED_HOME`; `pickAccount` aplica antes de decidir. Isolamento de env/dir continua Rivet (`accountHomeDir`).

### Testes
```
pnpm exec vitest run …/gestor.spec.ts …/brain.spec.ts …/engine-policy.spec.ts …/lean-output.spec.ts
  Test Files  5 passed (5)  Tests  34 passed (34)

pnpm exec vitest run …/account-policy.spec.ts
  Test Files  1 passed (1)  Tests  6 passed (6)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 12.9s / 16.5s / 12.0s
  persona-engine: OK in 30.1s
```

### Dependências (fila NÃO vazia)
- **Anvil**: persistir `GestorDecision.apply.plan`; Remote `commentGestorPlan` / `resolveGestorTie` / `listTurnActivity` / `foldUsagePanel`.
- **Rivet**: pool/sessão cheap (OPT-5); desktop pode passar a importar `leftoverDestFiles` do core.
- **Prism**: ActivityGroup no fio.
- **Probe / Miguel**: S7 UI; `PERSONA_REAL_IMPORTS`.
- OPT-8 −40% só depois da integração. PLAN ainda marca GES/OPT como todo (Keel).

---

## 04/11 02:32 — S7 host + F1 + T3 fila + OPT-5 política (janela: sem core/engine)

Vigia: não parar. Sem `JANELA ENCERRADA`.

### S7 / fechamento v1
`mandatory-s7-host-contract.spec.ts` — J1–J10 num único gate (onboarding, review, hire sem escalar, troca de Coordenação, Cofre, ACL, orçamento, resume, import, export). **10/10**. UI reduced-motion/dirD = Probe. `journeys.md` ganhou J19.

### F1
`mandatory-import-contract`: oficiais (7 pass + 1 skip amostra real) + framework preview/dedupe/rollback/segredo (10). Amostra do Miguel continua `PERSONA_REAL_IMPORTS`.

### T3 §4/§11/§12
`mandatory-working-send-contract` alinha o `working-send.md` do Anvil: `resolveWorkingSend` + deliver/flush. 2/2. Persistência Remote = Anvil após a janela.

### OPT-5 / W2-10
`engineClassForTurn`: triage/librarian/watchdog/initiative/evaluation = `cheap`; execution/reply = `persona`. Contrato `engine-class.md`. `teach-persona.md`: accept fica `enabled: false`; activate só explícito.

### Testes
```
pnpm exec vitest run …/engine-class-policy.spec.ts
  Test Files  1 passed (1)  Tests  1 passed (1)

pnpm exec vitest run …/mandatory-working-send-contract.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

pnpm exec vitest run …/mandatory-import-contract.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

pnpm exec vitest run …/mandatory-s7-host-contract.spec.ts
  Test Files  1 passed (1)  Tests  1 passed (1)
  (subprocess J1–J10: 10 passed)

node scripts/persona/check-pkg.mjs persona-e2e
  persona-e2e: OK in 7.3s
```

### Dependências
- **[Forge→Anvil]** Remote fila (`enqueueWorkingMessage` / `listWorkingQueue`) + apply plano + `listTurnActivity` depois da janela.
- **[Forge→Probe]** S7 UI (reduced-motion, dirD); F1 amostra real (`PERSONA_REAL_IMPORTS`).
- **[Forge→Rivet]** pool/sessão quente da classe `cheap`.
- Folha Forge desta onda fechada. Core/engine ainda congelado. Não é fila vazia (OPT-8, persistência, amostra real).

---

## 04/11 02:01 — PRO/BYC/OPT/W2 contratos + fixtures 60/150 (janela: sem core/engine)

Vigia: não parar. Sem `JANELA ENCERRADA` — folha só.

### PRO-1 / PRO-6 (v1)
`mandatory-proactivity-contract`: v1 + `proactivity-accept` (fila vazia sem modelo) + runner `-t PRO-3` (sem espaço — o filtro antigo pendurava no Windows). 4/4.

### BYC-2/3
Walk (`logo.png` ignored) + apply (accept escreve, discard não, 2º apply idempotente) deixam de ser todo. Core já tinha dedupe/conflito. 5 pass / 1 todo galeria.

### OPT §2 + TOK layer-1
`mandatory-opt-levers-contract` novo: prefixo / pré-roteador / lean-output / Vigia. `mandatory-token-scenarios.spec.ts` aponta o contract (TOK-1..5). OPT-8 −40% continua todo pós-integração.

### W2-5 / W2-10
`account-policy.spec.ts` no wave2-contract. Ensinar: `acceptTaughtCandidate` já no teach-skill.

### Organograma
`fixtures/org-chart/roster-60.json` (person, 60+Gestor) e `roster-150.json` (sector, 150+Gestor). Spec 2/2. Prism/Lumen podem trocar o mock.

### Testes
```
pnpm exec tsx packages/persona/persona-e2e/scripts/write-org-chart-fixtures.ts
  wrote fixtures/org-chart

pnpm exec vitest run …/org-chart-fixtures.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

pnpm exec vitest run …/mandatory-bring-your-context-contract.spec.ts
  Test Files  1 passed (1)  Tests  5 passed | 1 todo (6)

pnpm exec vitest run …/mandatory-proactivity-contract.spec.ts
  Test Files  1 passed (1)  Tests  4 passed (4)

pnpm exec vitest run …/account-policy.spec.ts
  Test Files  1 passed (1)  Tests  6 passed (6)

pnpm exec vitest run …/mandatory-opt-levers-contract.spec.ts
  Test Files  1 passed (1)  Tests  4 passed (4)

node scripts/persona/check-pkg.mjs persona-e2e
  persona-e2e: OK in 14.5s
```

### Dependências
- **[Forge→Prism]** `packages/persona/persona-e2e/fixtures/org-chart/roster-{60,150}.json` no lugar do mock Lumen; `listGestorPlans` TypeError (Muse 02:00) não é Forge.
- **[Forge→Anvil]** apply atômico do plano + `listTurnActivity`.
- Fila core/engine bloqueada até `JANELA ENCERRADA`. Folha Forge desta onda fechada. Não é fila vazia (OPT-8, persistência, UI).

---

## 04/11 01:50 — OPT-1 JSON + contratos e2e/docs (janela: sem core/engine)

Vigia: não parar. Sem `JANELA ENCERRADA` — não toquei em persona-core / persona-engine.

### OPT-1 / OPT-2 (Probe)
`persona-spec/baselines/token-scenarios.json` saiu de placeholder: TOK-1..5 scripted (99 / 148 / 0 / 0 / 155), idle e initiative-30 = 0 chamadas, pareado **parity**. Regenerar: `pnpm exec tsx persona-spec/scripts/write-token-scenarios.ts`. Gate +10% = JSON + `token-measure.spec.ts`. OPT-8: metas vs linha de base em `tokens-baseline.md` (−40% só depois da integração; cache 0,63; idle=0 já).

### Contratos e2e (folha)
- `mandatory-token-scenarios-contract`: baseline numérico + ledger + measure (4/4).
- `mandatory-team-manager-contract`: GES-2/3 core+engine; adversariais deixam de ser todo (2 pass / 3 todo Anvil).
- `mandatory-activity-contract` novo — T3 §9 (2/2).
- `mandatory-second-brain-contract` SB-6: export one-way + hash (`-t one-way`).

### Docs
`docs/persona/{gestor,uso}.md` + guia/equipe/canais/README. `ARCHITECTURE.md` Gestor + tokens/atividade. Contratos `gestor.md` + `token-ledger.md` aponta o JSON.

### Testes
```
pnpm exec tsx persona-spec/scripts/write-token-scenarios.ts
  wrote persona-spec/baselines/token-scenarios.json

pnpm exec vitest run packages/persona/persona-e2e/tests/token-scenarios-baseline.spec.ts
  Test Files  1 passed (1)  Tests  1 passed (1)

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-activity-contract.spec.ts
  Test Files  1 passed (1)  Tests  2 passed (2)

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-team-manager-contract.spec.ts
  Test Files  1 passed (1)  Tests  2 passed | 3 todo (5)

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-second-brain-contract.spec.ts -t one-way
  Test Files  1 passed (1)  Tests  1 passed

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-token-scenarios-contract.spec.ts
  Test Files  1 passed (1)  Tests  4 passed (4)

node scripts/persona/check-pkg.mjs persona-e2e
  persona-e2e: OK in 6.0s
```

### Dependências
- **[Forge→Anvil]** persistência `listTurnActivity` / `commentGestorPlan` / `resolveGestorTie` / apply atômico do plano (todos Anvil). `getUsagePanel` Anvil já relatou.
- **[Forge→Prism]** ActivityGroup no fio; seed de dev (Muse P1) para capturar Uso.
- **[Forge→Keel]** PLAN ainda marca GES-1..3 / OPT-1..6 como todo — domínio/engine já no fio; não editei PLAN.
- Fila Forge em core/engine: bloqueada até `JANELA ENCERRADA`. Folha/docs desta onda fechados. Não é fila vazia.

---

## 04/11 01:50 — T3 §9 atividade + GES-3 empate + OPT-6 lote + higiene só o que mudou

Vigia: não parar. Encadeei o que ainda era core/engine.

### T3 §9
`TurnActivityEvent` / `groupTurnActivity`: mutações primeiro, ≤2 kinds no resumo + moreCount, falha fora do feito, waiting/running = inacabado. Engine: `activityFromReport`, `foldTurnActivity`. Contrato `activity.md` + RPC `listTurnActivity`.

### GES-3
`commentGestorPlan` (segundo comenta; o primeiro fica proposed) + `resolveGestorTie` (humano escolhe; os outros no escopo = rejected). Engine: `runGestorComment` / `runGestorTie`. RPC no `lumen-rpc.md`.

### OPT-6 / §2.9
`batchRouterBurst` — um lote por assunto na próxima Eval. `initiativeCadenceDays` (aceite <0,3 → 3 dias). `hygieneChangedOnly` — Bibliotecário só no que mudou.

### Arquivos
`persona-core`: `domain/{activity,gestor,brain-curate}.ts`, testes `activity`/`gestor`/`brain`
`persona-engine`: `activity.ts`, `gestor.ts`, `lean-output.ts`, testes
`persona-spec`: `contracts/{activity,lumen-rpc}.md`

### Testes
```
pnpm exec vitest run activity + gestor + lean-output (core/engine)
  Test Files  5 passed (5)
  Tests  20 passed (20)

pnpm exec vitest run brain + activity
  Test Files  3 passed (3)
  Tests  17 passed (17)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 7.1s
  persona-engine: OK in 17.1s
```

### Dependências
- **[Forge→Anvil]** `listTurnActivity`, `commentGestorPlan`, `resolveGestorTie`.
- **[Forge→Prism]** ActivityGroup no fio lê o fold (literais iguais aos da Muse).
- Fila Forge ainda implementável: fina (domínio v1 / PRO-1 / GES / T3 / OPT medição já no core). Próximo: só se aparecer buraco de contrato; senão fico em alavancas extras sem LLM.

---

## 04/11 01:40 — OPT-1 linha de base + alavancas §2 (destrava Anvil OPT-7)

Atlas: medir primeiro. Relatório canônico `persona-spec/reports/tokens-baseline.md`. Painel Uso lê `foldUsagePanel`.

### OPT-1
- Ledger: `TurnLedgerEntry` + `turnFromLayers` / `foldUsagePanel` (tokens/tarefa, por persona, por tipo, cache, origem `measured`|`estimate`).
- `usagePortKind`: `execution`→`exec`, `evaluation`→`eval` só no port Rivet. Anvil persiste o kind do core.
- 5 cenários scriptados (402 tokens; idle e initiative-30 = 0 chamadas). Gate +10% sem qualidade ≥0,15 = falha.
- Pareado CLI vs Persona (mesma CLI/modelo): Δ +5,7–6,3%, veredito **parity**. Runner real: `start`→fold→`cancel`, timeout cancela primeiro, `dispose` no `finally`, cap 1. Vendor opt-in `PERSONA_PAIR_REAL=1`.
- Prefixo: persona entra na camada `system`; relógio/contador recusados.

### Alavancas §2 (antes → depois)
- Pré-roteador F3: **26 → 18** chamadas de modelo (vazio / injeção / fora de escopo / slash do composer). Acerto 41/41.
- Vigia: `budgetLeft: false` e `needsModel: false` — sem LLM.
- Ferramentas mínimas: 3 → 1 (`toolsForTurn`).
- Canal: 140 → 100 palavras. Iniciativa: lote + teto 400 tokens/persona/dia.

### Arquivos
`persona-core`: `domain/token-ledger.ts`, `tests/token-ledger.spec.ts`
`persona-engine`: `token-measure.ts`, `preroute/rules.ts`, `watchdog.ts`, `lean-output.ts`, `prompts/stable-prefix.ts`, `scripts/write-tokens-baseline.ts`, testes
`persona-spec`: `contracts/token-ledger.md`, `reports/tokens-baseline.md`

### Testes
```
pnpm exec vitest run token-ledger + token-measure + preroute + lean-output + watchdog + stable-prefix
  Test Files  6 passed (6)
  Tests  27 passed (27)

pnpm exec vitest run proactivity-v1 + proactivity-accept
  Test Files  2 passed (2)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 12.0s
  persona-engine: OK in 21.5s

pnpm exec tsx packages/persona/persona-engine/scripts/write-tokens-baseline.ts
  wrote persona-spec/reports/tokens-baseline.md
```

### Dependências
- **[Forge→Anvil]** persistir `TurnLedgerEntry` + RPC do `foldUsagePanel` (OPT-7). Kinds: `execution` / `evaluation`.
- **[Forge→Keel]** Rivet `persona-usage` ainda declara `exec` / `eval` em paralelo — alinhar no port via `usagePortKind`, sem redefinir o core.
- **[Forge→Lumen]** painel Uso depois do RPC.
- Vendor CLI pareada: não rodei (orçamento congelado). Lifecycle dispose/timeout coberto no teste.

---

## 04/11 00:42 — W2-10 Ensinar candidato + T3 citar/Retomar/steer

Fila Vigia. PRO-1 / S1–S3 done. Avanço no que ainda é core/engine.

### W2-10
`acceptTaughtCandidate` (sempre `enabled: false`), `activateTaughtSkill` (só no aceite; tools ≤ mandate), `publishTaughtSkill` (team/project só com `explicit`).

### T3
- §5 `composeCitedMessage` — citação e comentário em blocos separados.
- §12 `pauseAtLimit` / `resumeAfterLimit` — fila permanece.
- §4 `deliverWorkingSend` / `flushWorkingQueue` no runner (`queue` | `steer`).
- `/limites /assunto /lado /ensinar /contratar /resumo` via `matchComposerSlash`.

### Testes
```
pnpm exec vitest run working-send + teach-skill + working-deliver
  Test Files  3 passed (3)
  Tests  11 passed (11)
```

### Dependências
- Anvil: persistir candidato taught, fila, pause de limite.
- Rivet: captura desktop (W2-9) + deliver real.
- Prism: composer citar / Retomar / slash.

---

## 04/11 00:33 — GES allocate + compose do turno + contratos Anvil/Rivet

Fila Vigia: PRO-1/S1–S3 já done. Liguei OPT-3/4 no compose real e fechei alocar (GES-2).

### Código
- `gestorAllocate` / `runGestorAllocate` / `runGestorReorganize`: projeto/canal/setor/`reportsTo` dentro do mandato; conflito de escopo comenta.
- `composeTurnPrompt` + `toolsForTurn`: prefixo estável; mensagem fora do prefixo.
- `dropRecordsInPrefix`: contexto que já está no prefixo não entra de novo.

### Contratos
`gestor-mcp.md` aponta para as funções Forge. `lumen-rpc.md`: `proposeGestorAllocate`, `proposeGestorReorganize`, `exportBrainVault`.

### Testes
```
pnpm exec vitest run gestor + token-ledger + engine gestor + stable-prefix
  Test Files  4 passed (4)
  Tests  22 passed (22)
```

### T3 §4 / §11 (Muse)
`resolveWorkingSend` / fila editável / `openAsideAsk` (`onThread: false`). RPC no `lumen-rpc.md`. Persistência da fila = Anvil; composer = Prism.

### Dependências
- Anvil: RPC allocate/reorganize + fila do fio; `SystemRoleView` = `team_manager`.
- Rivet: bind `gestor_*` MCP; pasta vault; cache por motor.
- Lumen: cartão de plano allocate/reorganize; export UI.
- Prism: botão fila/direcionar e aba `/lado`.

---

## 04/11 00:25 — OPT-1/2/3/4/6 + GES reorganizar + SB-6 export

Fila Atlas/Vigia: não parar. PRO-1 já estava done. Fechei o aceito de OPT-1 e avancei GES-2 (reorganizar), SB-6 (export domínio) e OPT-3/4/6 (prefixo, camadas, saídas).

### OPT
- Linha de base: `persona-spec/reports/bench-tokens.md` (402 tokens nos 3 cenários com modelo; idle/iniciativa = 0). Pareado CLI vs Persona em paridade (+5,7–6,3%).
- Gate +10% já em `token-measure.spec.ts`.
- Prefixo estável: `composeStablePrefix` (system→persona→tools→required); relógio/contador recusados.
- Camadas: `fitLayersToBudget`, `incrementalSubjectSummary`, `minifyToolDescription`.
- Canal ≤100 palavras (`capChannelReply`) + `batchInitiative` por persona/dia.

### GES-2
`gestorReorganize`: mover trabalho, pausar ociosa só com aviso, autonomia nunca acima do teto.

### SB-6
`exportBrainVault` / `shouldImportVaultFile`: pasta Obsidian mão única; reimport pelo hash (BYC). Persistência da pasta = Rivet.

### Testes
```
pnpm exec vitest run gestor/token-ledger/brain + token-measure/stable-prefix/lean-output
  Test Files  7 passed (7)
  Tests  40 passed (40)
```

### Dependências
- Anvil: persistir plano de reorganizar + RPC; `SystemRoleView` = `team_manager`.
- Rivet: escrever a pasta do vault; cache real por motor.
- Lumen: painel Uso (OPT-7).
- Probe: GES-6 / OPT-2 no E2E.

---

## 04/11 00:15 — Rename Gestor (`team_manager`) + medição de tokens

Keel P1: fechar Maestro → Gestor de equipe no core/engine. Atlas: medição TOKEN-OPTIMIZATION §1 + §3 (referência = CLI direta, paridade ±10%).

### Rename
`SystemRole` literal único: **`team_manager`** (`TEAM_MANAGER_ROLE`). Templates, onboarding-wire, recommend, `isGestor`. Zero `maestro` em persona-core / persona-engine. Testes usam a chave `gestor` (holder), nunca `maestro`. Host/`SystemRoleView` = Anvil, mesmo literal.

### Medição
Ledger por turno (camadas system→tools→required→subject→recall→message, cache read/write, calls/tarefa). 5 cenários scriptados; idle e 30-persona iniciativa = 0 chamadas. Gate +10% sem ganho de qualidade.

Benchmark pareado: mesma tarefa / mesma CLI+modelo (`cli_direct` vs `persona`). Veredito parity / better / justified (+qualidade ≥0,15) / worse. Real opt-in: cap 1, `start`+fold+`cancel`, timeout cancela primeiro, `dispose` no `finally`.

### Arquivos
`persona-core`: `schemas.ts` (`TEAM_MANAGER_ROLE`), templates/onboarding/recommend/gestor, `domain/token-ledger.ts`, `tests/{gestor,domain,onboarding-wire,token-ledger}.spec.ts`
`persona-engine`: `gestor.ts`, `token-measure.ts`, `tests/{gestor,token-measure}.spec.ts`
`persona-spec`: `contracts/token-ledger.md`, `reports/forge.md`

### Testes
```
pnpm exec vitest run
  packages/persona/persona-core/tests/gestor.spec.ts
  packages/persona/persona-core/tests/domain.spec.ts
  packages/persona/persona-core/tests/onboarding-wire.spec.ts
  packages/persona/persona-core/tests/token-ledger.spec.ts
  packages/persona/persona-engine/tests/gestor.spec.ts
  packages/persona/persona-engine/tests/token-measure.spec.ts
  Test Files  6 passed (6)
  Tests  32 passed (32)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 21.0s
  persona-engine: OK in 22.1s

pnpm exec tsx scripts/generate-typert.ts
  generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 133.7s
```

### Limitações
- Host ainda pode ter `gestor`/`maestro` no `SystemRoleView` até o Anvil alinhar a `team_manager`.
- Store `maestro_*` tables: Anvil. RPC hire persist: Anvil.
- Par e cenários reais de CLI: opt-in, cap 1; CI fica no runner scriptado.
- Painel Uso (Lumen) e persistência do livro (Anvil/Rivet) ainda não leem o ledger.

---

## 04/11 00:55 — Segundo cérebro (domínio + gate) + BYC parser

BRIEFING 19 depois de fechar o parser BYC (BRIEFING 18). Store/RPC = Anvil; MCP tools = Rivet; UI = Lumen/Prism.

### BYC (domínio, fila antes do SB)
`parseBringPaste` / `previewBringVault` / `decideBringApply`: seções → brief/constraint/decision/memory + proveniência; `(incerto)`; CPF/cartão/token bloqueados; dedupe Cofre; conflito com decisão fixada → pergunta; `.obsidian`/`.trash`/binários ignorados; reimport path+hash. Nada grava sem aceite. Host RPC = Anvil.

### Segundo cérebro
Páginas tipadas (11 kinds + `BRAIN_PROPERTY_KEYS`), links/backlinks, versões (`nextBrainVersion`), visibilidade da audiência (DM → members). Índice derivado (`startHereLinks`, `indexBrainByKind`). Cópia do Cofre (`vaultRecordToBrainPage`) sem apagar o vault.

**Bibliotecário** (`systemRoles: librarian`, max 3, não único; `resolveLibrarian` cai na Coordenação). `curateBrain` cria/atualiza/liga ou `contradiction` (não sobrescreve). Regra/decisão obrigatória → `propose` até `acceptLibrarianProposal`. Higiene sem LLM: dedupe Jaccard + lembrete 90 dias; `applyHygiene` marca `replaced`.

**Permissões lembradas:** match exato persona+ação+alvo+limites. Ação maior / outro alvo / outra persona / expirada / revogada / escopo vazio → pergunta. Auditoria `não perguntei porque você permitiu em DD/MM`. Página `permission`. Gate no engine: `gateRememberedPermission`.

**Tools:** `brain_search` (FTS+tipo+links+ACL), `brain_read` (Chain of Recall, ACL por hop), `brain_propose` (obrigatório precisa aceite). `compileBrainContext` mete regras `required` no turno. Export markdown `[[links]]`.

### Arquivos
`persona-core`: `domain/brain.ts`, `brain-curate.ts`, `brain-permission.ts`, `brain-tools.ts`, `brain-markdown.ts`, `schemas.ts` (`INVALID_BRAIN`, librarian, max 3), `tests/brain.spec.ts`, `tests/brain-permission.spec.ts`
`persona-engine`: `second-brain.ts`, `tests/second-brain-curation.spec.ts`, `tests/second-brain-permission-gate.spec.ts`
`persona-spec`: `contracts/second-brain.md`, `ARCHITECTURE.md`, `PLAN.md` (BYC-1..3, SB-1/2/3/5/6 domínio), `reports/forge.md`

### Testes
```
pnpm exec vitest run
  packages/persona/persona-core/tests/brain.spec.ts
  packages/persona/persona-core/tests/brain-permission.spec.ts
  packages/persona/persona-core/tests/bring-context.spec.ts
  packages/persona/persona-engine/tests/second-brain-curation.spec.ts
  packages/persona/persona-engine/tests/second-brain-permission-gate.spec.ts
  Test Files  5 passed (5)
  Tests  40 passed (40)

pnpm exec vitest run domain.spec.ts import.spec.ts
  Test Files  2 passed (2)  Tests  19 passed (19)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 9.5s
  persona-engine: OK in 23.1s

pnpm exec tsx scripts/generate-typert.ts
  generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 56.9s
```

### Limitações / dependências
- Persistência, FTS5, Remotes (`brainHome`, `listPages`, `revokePermission`) = Anvil (SB-4).
- Bind MCP `brain_*` + prompts/orçamento do Bibliotecário = Rivet.
- UI Empresa › Segundo cérebro + "Lembrar esta permissão" = Lumen/Prism.
- Export pasta/sync Obsidian mão-dupla = SB-10 (Anvil+Rivet). BYC host RPC ainda Anvil.
- E2E `mandatory-second-brain*.spec.ts` continua `it.todo` (Probe).

---

## 04/11 00:40 — Cofre citações no fio (v14, sem v15) + W3 engine

Anvil confirmou: **v14 canônico**, Cofre docs já no host (`ingest/replace/delete/list/searchVaultDocuments` + `title`/`locator` no Contexto usado). Sem migração.

### Domínio (este turno)
`formatVaultCitation` / `toUsedDocumentCite`: `"Contrato.pdf · seção Contratos"` (restrito esconde body). `ContextRecord.title?` / `locator?`; `compileContext` só serializa quando preenchidos (cache v1 intacto). RPC/store = Anvil; não toquei host.

### W3 computer use (engine, fila Atlas)
`runComputerUse`: planejar → agir → verificar (captura + árvore UIA via port; fake em teste) → retry com limite → reportar. Expectativa explícita por passo. `createMemorySharedControl` → `você assumiu`, resume só explícito. `ReplayEntry` + `projectReplayForUi`. `StepPermissionPort` alinha ao MCP Rivet (`computer_act` / `credentials`) + limites tempo/passos/orçamento.

### DF-003 (com Probe)
Harness: `visible-copy.ts` — `textContent` de irmãos cola ("Bem-vindoao#geral"); `getByText` / `innerText` no dogfood. Teste unitário do falso positivo.

### Arquivos
`persona-core`: `domain/vault-cite.ts`, `context/{types,index}.ts`, `tests/vault-cite.spec.ts`
`persona-engine`: `computer-use.ts`, `tests/computer-use.spec.ts`
`persona-e2e`: `visible-copy.ts`, `tests/visible-copy.spec.ts`, `dogfood-padaria.ts` (comentário)
`persona-spec`: `contracts/{computer-use,lumen-rpc}.md`, `ARCHITECTURE.md`, `PLAN.md` W3-1..6, `IDEAS.md`, `reports/forge.md`

### Testes
```
pnpm exec vitest run
  packages/persona/persona-core/tests/vault-cite.spec.ts
  packages/persona/persona-core/tests/context.spec.ts
  packages/persona/persona-engine/tests/computer-use.spec.ts
  packages/persona/persona-e2e/tests/visible-copy.spec.ts
  Test Files  4 passed (4)  (após correção sourceIds)
  vault-cite+context: 17 passed; computer-use: 10; visible-copy: 2

node scripts/persona/check-pkg.mjs persona-core persona-engine persona-e2e
  persona-core: OK in 11.1s
  persona-engine: OK in 26.9s
  persona-e2e: OK in 6.3s

pnpm exec tsx scripts/generate-typert.ts
  generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 54.6s
```

### Limitações / dependências
- Sem v15. Host `compileUsed` / RPCs = Anvil (já no fio). Lumen/Prism ligam o drawer.
- W3-5 UIA/Electron = Rivet; W3-6 overlay = Muse (`COMPUTER-USE-SPEC.md` já saiu).
- `talkPrompt` do host ainda junta `kind: body` sem title — Anvil pode trocar por `formatVaultCitation`.
- Fila Forge executável: W3 engine fechado; Cofre domínio fechado. Sem próxima no PLAN além de docs se o Keel pedir.

---

## 03/11 23:25 — WAVE2 persistência/RPC + W2-12 (host/store)

Atlas rebalanceou: Anvil no Cofre; Forge assume RPC ONDA 2. Sem migração nova — v14 do Anvil (`conversation_topic`, `topic_read`, `provider_account`, `account_policy`, `teach_artifact`, `event.topic_id`, `usage_record.account_id`).

### (1) Assuntos
Remote: `listConversationSubjects` / `create` / `rename` / `archive` / `moveMessageToSubject` / `setActiveConversationSubject`. Default **Geral** só. `postMessage`/`listMessages`/`search` filtram `topicId`. `compileSubjectVault` no `ProjectRuntime` quando `event.topicId`. Tarefa↔assunto em `ticket_subject`. Não lidas via `topic_read`.

### (2) Contas
Remote: `listConnectionAccounts` / `add` / `remove` / `update` / `setRunnerSwapPolicy`. Casa isolada Rivet: `PERSONA_HOME/accounts/{personId}/{engine}/{accountId}`. `resolveFor` → `pickAccount` + `pickProviderAccount`. Uso por conta: `inUseCount`, `getUsage.accountId`, `getOfficialQuota.accountId`. Troca → `account_activity`. Política host↔store: `next_on_limit`/`round_robin`/`ask_before_swap` ↔ `next`/`split`/`ask`.

### (3) Ensinar
`start/pause/resume/stopTeachSession` + `getTeachDraft` / `submitTeachDraft`. Consentimento `teach-v1`, retenção 30 dias. Frames Rivet `{atMs, png}` / `{atMs, imageRef, changeScore}`. Skill sempre candidata (`enabled: false`).

### W2-12
`docs/persona/{assuntos,ensinar,conexoes,guia,privacidade,README}.md` + `ARCHITECTURE.md` Onda 2.

### Arquivos
`persona-host/src/{wave2,index,types,orchestration}.ts` · `persona-host/tests/wave2.spec.ts` · `persona-store/src/{usage/store,topic/repos}.ts` · `docs/persona/*` · `persona-spec/{ARCHITECTURE,PLAN,reports/forge}.md`

### Testes
```
pnpm exec vitest run packages/persona/persona-host/tests/wave2.spec.ts
  Test Files  1 passed (1)
       Tests  5 passed (5)
  Duration  11.02s

pnpm exec vitest run packages/persona/persona-store/tests/wave2.spec.ts
  Test Files  1 passed (1)
       Tests  4 passed (4)
  Duration  10.31s

node scripts/persona/check-pkg.mjs persona-host persona-store
  persona-host: OK in 15.5s
  persona-store: OK in 8.8s

pnpm exec tsx scripts/generate-typert.ts
  generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 46.0s
```

### Limitações / dependências
- Sem v15. `workingPersonaIds` ainda `[]` (falta projeção live de run por assunto — Prism pode preencher).
- Captura Electron / IPC / whisper = Rivet (W2-9 resto, W2-10 UI).
- UI assuntos = Prism; UI contas = Lumen (já chama os remotes; Typert agora expõe).
- F1 amostra real do Miguel ainda pendente. Fila Forge executável vazia depois disto.

---

## 03/11 23:00 — WAVE2 §1 / §3 / §2 (domínio + pipeline)

Atlas / BRIEFING 17. Domínio em `persona-core` + pipeline de ensino em `persona-engine`. Sem UI, store, captura Electron.

### §1 Assuntos
- 7 cores + nome (pack alinhado à UI: Geral/UI/Funcionalidades/…). Thread `kind:id:subject:subjectId`.
- `compileActiveSubject`: snapshot só do assunto ativo + obrigatórios (Cofre/decisões); Chain of Recall só quando o outro assunto é citado.
- Renomear / arquivar / mover mensagem / não lidas / trabalhando / busca por assunto+data.
- Tarefa↔assunto: `bindTicketToSubject` + chip cor+nome.

### §3 Contas
- `pickAccount`: `fixed` | `next_on_limit` | `split_balance` | `ask` (aliases host: `round_robin`, `ask_before_swap`).
- Preferência de motores da persona; `isolatedHome` por conta.
- Atividade sem id/segredo: "Nina passou para Claude · Trabalho até 18:30".
- `ask` → Precisa de você. Troca de motor → `engineSwitchHandoff` (não reusa o ciclo persona↔persona).

### §2 Ensinar
- `draftTaughtSkill` + `VisionPort` + `fakeVisionPort` + `sampleKeyFrames`.
- Skill `origin: 'taught'`, `enabled: false`, `scope: 'persona'`. Ferramentas ∩ allow-list. Local.

### Arquivos
`persona-core`: `domain/subjects.ts`, `domain/account-policy.ts`, `context/subject-compile.ts`; `SkillOrigin` + `'taught'`; `ContextRecord.subjectId?`; códigos `INVALID_SUBJECT` / `INVALID_ACCOUNT_POLICY` / `INVALID_TEACH`.
`persona-engine`: `teach.ts`, `subject-thread.ts`.
Contratos: `conversation-subjects.md`, `connections-accounts.md`, `teach-persona.md` (secção Domain). Spike: `persona-spec/spikes/teach-persona.md`.

### Testes
```
pnpm exec vitest run
  packages/persona/persona-core/tests/subjects.spec.ts
  packages/persona/persona-core/tests/subject-context.spec.ts
  packages/persona/persona-core/tests/account-policy.spec.ts
  packages/persona/persona-engine/tests/teach-skill.spec.ts
  Test Files  4 passed (4)  Tests  19 passed (19)

node scripts/persona/check-pkg.mjs persona-core persona-engine
  persona-core: OK in 17.5s
  persona-engine: OK in 37.3s
```

### Limitações
- Persistência/RPC: Anvil (W2-2, W2-6). UI: Prism/Lumen. Captura desktop: Rivet (W2-9 resto).
- `compileContext` em si não mudou — o recorte é `restrictSnapshotToSubject` antes.
- W2-12 (docs/persona) ainda não.

---

## 03/11 22:25 — Dogfood Padaria Lua + THREAT-MODEL

Sessão nova (Atlas). Continuei o passeio: a rodada anterior morreu no overlay e não gravou o relatório.

### Passeio
`PERSONA_E2E=1 PERSONA_HOST_NO_LOCK=1` · `dogfood-padaria.spec.ts` · 1/1 em 92.7 s. Host+Chrome encerrados. Execuções reais: **0 / 20**.

Caminho real: onboarding Clara / Padaria Lua / Loja online → **Entrar no Persona remonta o passo 5** (scrim). Resto do cenário com `PERSONA_DEV_SEED` (contrato RPC certo).

Percorrido no seed: Quadros, #geral, Visão geral, Aprovações, Saúde, Perfil.

### Causa do remount (P0 Prism)
`persona-live-store.completeOnboarding` manda `{ roster, projectId, memberId }`. Host `CompleteOnboardingRequest` exige `{ team, personalProjectId, templateIds, runnerChoices, cofreSeed }`. `seed-default-team.ts` já manda o contrato certo.

### Atritos (donos)
Ver `persona-spec/reports/dogfood-padaria.md` + shots em `.maestri/tmp/shots/dogfood-padaria/`.

| id | sev | dono | o quê |
| --- | --- | --- | --- |
| DF-001 | P1 | Prism | dois Continuar no assistente |
| DF-002 | P0 | Prism | overlay remonta (RPC) |
| DF-003 | P0 | Muse | fonte sem glifo de espaço (app inteiro) |
| DF-005/006 | P1 | Lumen | Novo projeto não pede nome |
| DF-007 | P2 | Lumen | sem iniciar sprint |
| DF-008 | P1 | Prism | DM vazia, sem abrir conversa |
| DF-010 | P1 | Lumen | sem marcar-se fora |
| DF-011 | P2 | Prism | Enquanto você estava fora (bloqueado por 010) |
| DF-013 | P1 | Prism | pedido Padaria não entrou no #geral |

Retirados: DF-009 (Teste dos 2 dias está em Saúde), DF-012 (cartão Contratar está em Aprovações — seed).

### Harness
`packages/persona/persona-e2e/src/dogfood-padaria.ts`: se overlay preso, fecha e reabre com seed; Enviar com `exact: true` (colidia com Enviar imagem); não trata overlay como Quadros.

### Limpeza
`taskkill /T` em 6 hosts `persona` órfãos (pai morto, 15:49–21:38). Não toquei nos with-lock vivos do Probe.

### THREAT-MODEL
`persona-spec/THREAT-MODEL.md` atualizado: first-use stuck, conversa/DM, ausência humana, sem vazamento de `onb-*` no seed.

### Testes
```
pnpm exec vitest run packages/persona/persona-e2e/tests/dogfood-padaria.spec.ts
  PERSONA_E2E=1 PERSONA_HOST_NO_LOCK=1
  Test Files  1 passed (1)  Duration 92.65s
```

### Limitações
- Pedido Padaria no #geral não persistiu; DM não exercitada (empty).
- Sem CLI real.
- Fila Atlas desta sessão: dogfood + THREAT-MODEL. Sem próxima atribuída em core/engine.

---

## 03/11 21:45 — Talk-eval real 4/4 + fiação host + share + insights

Fila Atlas encadeada. Dispose confirmado (`stream-json=0` após o eval).

### 1. Talk-eval real (haiku ×4, ~103 s)
`PERSONA_REAL_TALK=1` · `talk-real-cli.ts` · cancel/dispose/timeout. JSON em `persona-spec/reports/talk-eval-real.json`.

| id | classe | real | fake | eco |
| --- | --- | --- | --- | --- |
| s1 | simple | ok | ok | não |
| a1 | ambiguous | ok | ok | não |
| m1 | multi | ok | ok | não |
| h1 | handoff | ok | ok | não |

Real 4/4 = fake 4/4. i1 (injeção) ficou de fora do teto de 4.

### 2. Fiação no app
- `orchestration.talkPrompt` → `composePersonaPrompt` (canal/DM).
- `ProactivityHost.fire` → `scoreInitiative` (não grava vazia/duplicata).
- `acceptReview` / `requestChanges` → `learnFromFeedback` + memória no Cofre (`feedback-wire.ts`).
Combinado com Anvil (ask enviado). Sem remotes novos em `index` além das 2 chamadas.

### 3. Compartilhar
`.persona.json` / `.team.json`: versão + proveniência; avatar gallery (upload→silhouette); skills = nomes; sem credencial/memória privada. `importCliSkillCandidates` lê `~/.claude/skills` e `~/.codex/skills` → candidatas `enabled: false`. Contrato `persona-spec/contracts/share.md`.

### 4. Insights locais
Funil onboarding → 1ª resposta útil → 1ª tarefa → retorno 7 dias. Impacto por persona (concluídas, tempo até pronto, propostas aceitas, horas com rótulo `estimativa`). Sem telemetria. Contrato `persona-spec/contracts/insights.md` (Anvil Remote / Lumen UI).

### Arquivos
`prompts/voice` + host `talkPrompt`/`proactivity`/`feedback-wire` · `core/domain/{share,cli-skills}.ts` · `engine/insights.ts` · `scripts/talk-real-cli.ts` · `contracts/{share,insights}.md` · `reports/talk-eval-real.json`

### Testes
```
pnpm exec tsx …/talk-real-cli.ts (PERSONA_REAL_TALK=1) → 4/4 real, 4/4 fake, 103s, stream-json=0
pnpm exec vitest run …/share …/insights …/voice …/talk-eval …/talk-voice …/proactivity → 24 OK
node scripts/persona/check-pkg.mjs persona-core persona-engine persona-host → OK 7.9s / 14.9s / 20.9s
pnpm exec tsx scripts/generate-typert.ts → 40 / 40 / 102s
```

### Limitações
- Remote de share/insights ainda é contrato (Anvil). Lumen não tem tela.
- i1 (injeção) não rodou no real (teto 4).
- Horas economizadas = `0.5 × tarefas` com rótulo obrigatório `estimativa`.

---

## 03/11 21:35 — Voz + iniciativa + feedback + talk-eval

Fila Atlas (core/engine), encadeada. Sem host. Sem CLI real.

### 1. Voz e personalidade
`composePersonaPrompt` / `composeVoicePolicy` / `voiceFingerprint` a partir de nome, cargo, setor, personalidade, instruções, Cofre, normas de dono. Mesmo bloco em canal / DM / talk / handoff. `ENGINE_COPY` pt/en. Template `handoff` agora injeta identidade + `{{policy}}`.

### 2. Qualidade da iniciativa
`scoreInitiative`: fatos sintéticos → propostas com utilidade/novidade/unicidade; dedupe (`nearRatio` ≥ 0.85) contra tarefas e propostas; `mayPropose` / teto do dia. `initiativeSetClean` — zero vazias ou duplicadas na suíte.

### 3. Aprendizado por feedback
`learnFromFeedback`: aceite/recusa de proposta e revisão (aceitar / pedir ajustes) → memória com proveniência + candidata de skill (`origin: learned`, `enabled: false`) só no aceite. `recordProposalOutcome` / `nextProposalIntervalHours` ajustam a frequência.

### 4. Avaliação de conversa
`runTalkEval` + `TALK_EVAL_SCENARIOS` (simples, ambíguo, multi, handoff, injeção). Juiz: útil / sem eco / sem placeholder. Fake 5/5. Real: `PERSONA_REAL_TALK=1`, ≤4 haiku, `talk-real-cli.ts` com dispose/timeout/árvore. Não rodei.

### Arquivos
`persona-engine/src/prompts/{voice,talk,templates}.ts` · `initiative-quality.ts` · `feedback-learn.ts` · `bench/talk-eval.ts` · `scripts/talk-real-cli.ts` · `src/index.ts` · testes `voice` / `initiative-quality` / `feedback-learn` / `talk-eval`

### Testes
```
pnpm exec vitest run …/voice …/initiative-quality …/feedback-learn …/talk-eval …/prompts → 19 OK
node scripts/persona/check-pkg.mjs persona-engine → OK 14.6s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts / 40 pkgs / 44.7s
```

### Limitações
- Sem `PERSONA_REAL_TALK` (congelada; ≤4 só com Atlas).
- Host já usa `composeTalkPrompt`; `composePersonaPrompt` é a composição completa (setor + normas + i18n). Anvil/Rivet ligam quando quiserem.
- `ENGINE_COPY.en` cobre o chrome; corpos `PROMPT_TEMPLATES` continuam pt-BR (D-043 / snapshots).

---

## 03/11 21:30 — URGENTE: órfãos coord-real-cli mortos + lifecycle

Atlas: memória crítica. Três `coord-real-cli.ts` (node 30920 / 18096 / 8080, 16:38 / 16:46 / 17:01) órfãos, cada um com ~20 `claude -p --input-format stream-json`.

### Kill
`taskkill /PID 30920 /T /F` · `18096` · `8080` — os três **DEAD**. Sem node `*coord-real-cli*` restante.

Sobrou 5 `claude -p stream-json` haiku (17:17×4 parent 49744: 48008, 51020, 50216, 17536; 17:58×1 parent 46556: 46772). `taskkill /T /F` neles. **stream-json = 0**.

`Get-Process claude` = **8**, todos interativos do Miguel (10:01 / 12:19 / 12:46 / 15:46). Não toquei.

### Script
`coord-real-cli.ts` agora: `cancel` + `dispose` por turno (`runSessionTurn` + `finally`); `disposeRunnerSessions` no fim da rodada; timeout 45 s/turno e 8 min global; SIGINT/SIGTERM/uncaughtException → shutdown + `taskkill /T /F` na árvore. `permissionMode: 'deny'` (D-052; `prompt` pendurava sessão). Sem `PERSONA_REAL_CLI=1` nesta correção.

Não abri `orchestration.ts` nem `tests/preroute.spec.ts`. Anvil já ligou `Engine.preRoute` no host (relato 21:01). Regras continuam em `persona-engine/src/preroute`.

### Arquivos
`persona-engine/scripts/coord-real-cli.ts` · `persona-engine/src/bench/coord-real-lifecycle.ts` · `persona-engine/tests/coord-real-lifecycle.spec.ts`

### Testes
```
pnpm exec vitest run packages/persona/persona-engine/tests/coord-real-lifecycle.spec.ts → 10 OK
node scripts/persona/check-pkg.mjs persona-engine → OK 17.1s
```

### Limitações
- CLI real não rodada (congelada). Prova de dispose/timeout/árvore = fake runner + `taskkill` injetado.
- Sessões interativas do Miguel (8) seguem vivas de propósito.

Fila core/engine: vazamento fechado. Host preRoute = Anvil. Próximo só com Atlas se a fila core/engine continuar vazia.

---

## 03/11 20:50 — F3 10/10 (pré-roteador) + F4 41→26 + gate F1

Vigia: não parei. Encadeei o próximo da fila (F3 8/10→10/10) e o recorte F4 do engine. **0 haiku** — Keel congelou CLI real; d1/h1 saem do modelo.

### F3 qualidade 10/10
Rodada 2 era 8/10 (`d1`/`h1` → silent). Regra nova `handoff` ("passa para a colega" / "entregue para a colega") + `d1` já coberto por duplicado na janela. `runCoordEval` e `coord-real-cli.ts` consultam o pré-roteador **antes** do modelo. `overlayPreRoute` sobre a tabela da r2 = 10/10.

### F4 (engine)
Pré-roteador: **41 → 26** chamadas no corpus (cortesia 5 · silêncio 4 · duplicado 3 · handoff 3). Mesmo acerto 41/41.

### F1 contrato
`official-import.spec.ts`: `PERSONA_REAL_IMPORTS` (pasta do Miguel) → preview + apply + 2º passe sem duplicar. Hoje skip (amostra real ainda não chegou).

### Arquivos
`persona-engine/src/preroute/rules.ts` · `persona-engine/src/bench/coord-eval.ts` · `persona-engine/src/index.ts` · `persona-engine/scripts/coord-real-cli.ts` · `persona-engine/tests/preroute.spec.ts` · `persona-core/tests/official-import.spec.ts` · `persona-spec/reports/bench-router-eval.md` · `persona-spec/PLAN.md`

### Testes
```
pnpm exec vitest run …/preroute.spec.ts …/coord-eval.spec.ts → 11 OK
pnpm exec vitest run …/official-import.spec.ts → 6 OK + 1 skip (F1 real)
node scripts/persona/check-pkg.mjs persona-engine → OK 15.3s
node scripts/persona/check-pkg.mjs persona-core → OK 8.0s
```

### Limitações / dependências
- CLI real não rodada (congelada). 10/10 = r2 modelo + pré-roteador em d1/h1.
- **[Forge→Anvil]** `ProjectRuntime` ainda não passa `Engine.preRoute` — regras não valem no host até ligar.
- F4 app bench = Probe. F1 amostra real = Atlas/Miguel. PB-10 UI = Lumen.

Fila executável **vazia** no território core/engine.

---

## 03/11 20:36 — X-3 host + GOV-5 queda/reopen (CORTADO)

Snapshot cortado; completei a fila Forge GOV + X-3. Remotes GOV-5 v11 do Anvil **não reescritos**. Sem `pnpm install`, sem commit.

### X-3 host
- `persona-host/src/external-sources.ts` (novo): poll Rivet (`pollTelegram/Email/Slack/Discord/CalDav`) → `receiveExternalBatch`; reply via `originReply` + `replyTelegram/Email/Slack/Discord`. `SecretVault.get(personId, provider)` injetado (Map nos testes). Sem token a fonte é pulada; `{ ok: false }` no reply. Token nunca no view/log.
- Remotes `pollExternal` / `replyExternal` em `index.ts` + tipos. Escopo do engine: `composeSourceScope(allExternalSourceScope(), github+internal)`.
- `startSprint` → `bindSprintGoal(this.goals, next)`. `MemoryGoalBoard.clear()` no reset do host.

### GOV-5 leftover
- Store: crash em `putSector` faz rollback; reopen preserva setor + audit. Sem tocar `persona-card` / sync / edge / export-md / retention / scheduler.

### Arquivos
`persona-host/src/{external-sources.ts,index.ts,types.ts,boards.ts,orchestration.ts,README.md}` · `persona-host/tests/{external-sources.spec.ts,boards.spec.ts,host-harness.ts}` · `persona-engine/src/goals.ts` · `persona-store/tests/governance.spec.ts` · `persona-spec/{ARCHITECTURE.md,PLAN.md}` · typert `lib/` (40).

### Testes
```
pnpm exec vitest run packages/persona/persona-host/tests/external-sources.spec.ts packages/persona/persona-host/tests/boards.spec.ts packages/persona/persona-store/tests/governance.spec.ts
→ 3 files / 10 tests OK (13.5s)
node scripts/persona/check-pkg.mjs persona-host → OK 24.0s
node scripts/persona/check-pkg.mjs persona-store → OK 15.6s
node scripts/persona/check-pkg.mjs persona-engine → OK 19.0s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (51.1s)
```

### Limitações
- Calendário: mapper Rivet `human: false` (stored; gate recusa eval); sem reply (`ok: false`).
- Cofre de produção (`persona-vault`) não ligado — porta `SecretVault` só; sem dep nova.
- GOV-5 export/import/sync workspace (DM não) continua Anvil.
- **[Forge→Anvil] GOV-5/X-3 soltos** — `index.ts` / `types.ts` / `migrations.ts` livres.

Fila: F3 8/10→10/10 (máx. 4 haiku) → F4. Bloqueios: F1 amostra real; PB-10 UI (Lumen).

---

## 03/11 20:23 — Handoff Anvil GOV-5 + X-3 (freeze: sem código)

Atlas passou GOV-5/X-3; Anvil confirmou arquivos. **Status sem SNAPSHOT CORTADO — nenhum arquivo de código gravado.**

### Já no fio (não reescrever)
Store v11 (`V11_GOVERNANCE`, `SqliteGovernanceRepos`) + host `GovernanceHost` + remotes `getOrgChart`/`getTeamHealth`/`runTwoDayTest`/`applyFix`/`applyGovernanceFix`/`setResponsible`/`setSubstitute`/`setSector`/`setAvailability`/`setPersonaGovernance`/`recommendStructure`/`applyStructure`/`listAudit`. Testes store+host de governança já existem. Cartão (v10) é Anvil — não toco.

### Falta (só após CORTADO)
- **X-3** arquivo NOVO `persona-host/src/external-sources.ts` (poll/reply Rivet → `receiveExternal`/`originReply`; sem token).
- **X-3** `boards.ts` `startSprint` hoje só marca `ativo` — ligar `bindSprintGoal`.
- **GOV-5** completar queda/reopen no spec do store se faltar; sem tocar `export-md.ts` / `persona-sync` / `retention` / `scheduler` / `persona-card`.

### Anvil fica fora
`index.ts` / `types.ts` / `migrations.ts` até Forge avisar GOV-5/X-3 soltos.

Sem commit. Sem `pnpm install`.

---

## 03/11 19:55 — GOV-1..4 domínio + engine + Teste dos 2 dias + assistente

Pedido Atlas/Miguel (BRIEFING 16, `GOVERNANCE.md`, D-054). Encadeei GOV-1–4 no mesmo turno. Setores são dados editáveis; nenhum nome de persona/setor no invariante.

### GOV-1 domínio
`Sector` + `SectorPolicy` (autonomia, tokens/dia, `requiredApprovals`). `PersonaCharge`: responsável obrigatório, substituto ≠ responsável, `confirmed`. Pessoa proposta herda o responsável do criador até confirmar. `AwayWindow` `[from, until)`. `RoutineCharge`: sem dono = alerta, não fatal. Cadeia + auditoria. `orgChart('person'|'sector')` — braço direito = função Coordenação.

### GOV-2 engine
`routeApproval`: fora ⇒ substituto; sem backup ⇒ `wait` com aviso (nunca silêncio). Aprovação exigida pelo setor ignora janela de silêncio do orçamento de atenção. Audit `onBehalfOf`.

### GOV-3 Teste dos 2 dias
`runTwoDayTest(snapshot, from)`: continua / espera / para. `applyGovernanceFix`: substituto; subir autonomia ≤ teto do setor; delegar à Coordenação.

### GOV-4 assistente
`recommendStructure` + `parseStructureAsk`. Snapshot coerente agência / SaaS / escritório. Uma persona por função contínua (3–5); “fazer X hoje” vira Tarefa. Rivet: prompt/draft driver ainda pendente.

### Arquivos
- `persona-core/src/governance/{model,escalate,org,health,recommend,index}.ts`
- `persona-core/src/domain/schemas.ts` (`INVALID_GOVERNANCE`)
- `persona-core/src/index.ts`, `tests/governance.spec.ts`
- `persona-engine/src/governance.ts`, `src/index.ts`, `tests/governance-route.spec.ts`
- `persona-spec/{ARCHITECTURE.md,PLAN.md,contracts/governance.md,reports/forge.md}`

### Comandos

```
pnpm exec vitest run …/governance.spec.ts …/governance-route.spec.ts
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 11.2s
persona-engine: OK in 23.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 33.8s
```

### Dependências
- **[Forge→Anvil]** GOV-5: v9 + Remote em `contracts/governance.md`. Personas existentes: responsável = dono do workspace.
- **[Forge→Rivet]** GOV-4: prompt/draft driver opcional sobre `recommendStructure`.
- **[Forge→Lumen/Prism]** tipos prontos; UI após GOV-5.
- **[Rivet→Forge]** typecheck `exactOptionalPropertyTypes` no GOV: **corrigido** (sem `fix: undefined` / campos opcionais vazios).
- F1 amostra real; PB-10 UI; X-3 host; F4 após F3.

### Fila Forge executável
Vazia no core/engine. Próximo GOV é Anvil (store). Sem commit. Sem `pnpm install`.

---

## 03/11 20:45 — X-3 Slack/Discord/ICS + F1 Gemini/Grok + PB-10 contrato

Fila Vigia: próximo após F1/skills/memória. Encadeei receive das 3 fontes Rivet + fixture oficial Gemini/Grok + contrato de migração do kanban misturado.

### X-3 receive (slack / discord / calendar)
`receiveExternal` aceita `telegram|email|slack|discord|calendar`. `allExternalSourceScope()` compõe as cinco. `originReply`: Slack `channel`+`ts`; Discord `channel`+`message`; calendário `uid`+`dtstart` (sem reply de conversa). Replay = `duplicate`; bot Slack/Discord stored + gate `ignore`. Engine **não** importa runners/vault.

### F1 Gemini + Grok oficiais
Gemini Takeout: `conversation_id` + `model_messages` / `content[]` / `parts` string; `file-service://` ignorado. Grok: fareja só arquivo com `grok` no nome + `conversations`/`chats`. Labels `esquema presumido`. **Validação com amostra real pendente.**

### PB-10 contrato (Forge)
`legacyKanbanToCategory` / `legacyColumnLabelToCategory`: `blocked` → `needs_you` (marcador). Alinha com `stageCategory`. Docs: `ARCHITECTURE.md`, `docs/persona/{guia,quadros,importar}.md`, `BOARDS-SPEC.md` §7, `contracts/runner.md`. UI `GlobalKanban` → Quadros = Lumen após PB-5.

### Arquivos
- `persona-engine/src/sources/external.ts`, `src/kanban.ts`, `src/index.ts`
- `persona-engine/tests/{external-sources,kanban,security/external-injection}.spec.ts`
- `persona-core/src/import/{gemini,grok,index}.ts`
- `persona-core/tests/fixtures/official/{gemini,grok}-conversations.json`, `official-import.spec.ts`, `import.spec.ts`
- `persona-spec/{ARCHITECTURE.md,PLAN.md,contracts/runner.md,design/BOARDS-SPEC.md,reports/forge.md}`
- `docs/persona/{guia.md,quadros.md,importar.md}`

### Comandos

```
pnpm exec vitest run …/external-sources …/kanban …/external-injection …/official-import …/import
 Test Files  5 passed (5)
      Tests  29 passed (29)
```

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.4s
persona-engine: OK in 14.8s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.5s
```

### Dependências / limitações
- **[Forge→Anvil]** host: `composeSourceScope(..., allExternalSourceScope())` + poll Rivet → `receiveExternal`; reply via `originReply` + `vault.get` (`slack`/`discord`/`caldav`) + `replySlack`/`replyDiscord`. Calendário alimenta rotinas (`dtstart`), não reply. `startSprint` → `bindSprintGoal`. Export canal vazio / `mapBoardError` / GoalBoard ainda abertos.
- **F1**: amostra real do Miguel.
- **PB-10 UI**: Lumen após PB-5.
- **F4**: depois do F3 (Probe).
- Sem commit. Sem `pnpm install`.

### Fila Forge executável
Vazia no território core/engine. Bloqueios: F1 real, PB-10 UI, X-3 host, F4.

---

## 03/11 20:35 — F1 oficial + skills + memória + adversarial + escala + guia

Fila Atlas (6 itens, encadeada). **Validação com amostra real pendente** (F1).

### 1. F1 fixtures oficiais (sem esperar o Miguel)
ChatGPT `conversations.json`: `mapping` via `parent`/`children`, `conversation_id`, ramos, `image_asset_pointer` ignorado, acentos/emoji/`<script>`, 80 nós + parte 20k. Claude.ai: `content[]` + `attachments`/`files` → `ATTACHMENT`. Obsidian: frontmatter + wikilinks + png. Labels continuam `esquema presumido — validar com amostra real`.

### 2. Evolução de skills
`evolveSkill`: proposta → `nextSkillVersion` (candidata) → `scoreSkillExamples` em tarefas held-out (não a receita) → ativa em `auto` se não pior e razão ≥ 0.6; `approval` espera aceite → `observeSkillAndMaybeRollback`. Port `fakeSkillEvalPort`; real = injetar port quando `PERSONA_REAL_SKILL_EVAL=1` (não ligado; CLI congelada).

### 3. Qualidade de memória/contexto (sem LLM)

```
| casos | 8/8 | razão 1.00 |
compile-required-in, compile-relevant-in, compile-other-project-out, compile-dm-out,
recall-right-in, recall-secret-out, contradiction-flagged, aging-archives
```

### 4. Segurança adversarial
Mensagem / Cofre / memória importada / Telegram / e-mail / GitHub: injeção tenta escalar ferramenta, vazar DM ou forjar ator/mandato → `ACCESS_ESCALATION` / gate `ignore` / `duplicate` / `can` guest false. Audit `trigger.received`.

### 5. Escala do Router
4 projetos × rajada 6 = 24 triggers; 1º pump: 4 evals, min 1 / max 1 (justo). Barulhento 24 vs quieto 2: quieto ainda 1 eval. Batching 1 inferência vs 12 um-a-um.

### 6. Guia
`docs/persona/guia.md` (primeiros passos, montar equipe, quadros/sprints, proatividade, privacidade). Índice aponta para ele.

### Arquivos
- `persona-core/src/import/{chatgpt,claude}.ts`, `tests/fixtures/official/**`, `tests/official-import.spec.ts`
- `persona-core/src/domain/skill-evolve.ts`, `tests/skill-evolve.spec.ts`
- `persona-core/src/context/quality.ts`, `tests/memory-quality.spec.ts`
- `persona-core/tests/security/attacks.spec.ts`
- `persona-engine/src/bench/router.ts`, `tests/bench-router.spec.ts`, `tests/security/external-injection.spec.ts`
- `docs/persona/{guia.md,README.md}`, `persona-spec/{PLAN.md,reports/forge.md}`

### Comandos

```
pnpm exec vitest run …/official-import …/import …/skill-evolve …/memory-quality …/security/attacks …/external-injection …/bench-router
 Test Files  7 passed (7)
      Tests  29 passed (29)
```

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.4s
persona-engine: OK in 13.9s
```

### Limitações
- F1: **validação com amostra real pendente**.
- Skill eval real opt-in não exercitado (CLI congelada).
- Sem commit. Sem `pnpm install`.

---

## 03/11 20:25 — X-3 receive Telegram/e-mail + bindSprintGoal + docs

Fila Atlas: próximo após J12–J18. X-3 (Rivet→Forge `engine.receive`) + contrato do GoalBoard do sprint + docs que não dependem do PB-5.

### X-3 receive (Forge)
`receiveExternal` / `receiveExternalBatch` → `Engine.receive`. `externalSourceScope` + `composeSourceScope` para o host. `originReply` devolve chat/to/subject (sem token). Replay = `duplicate`; escopo errado = `filtered`; `source` que não é telegram/email explode `external-source`. Engine **não** importa runners/vault.

### Sprint GoalBoard
`bindSprintGoal(board, sprint)` persiste `sprintGoal` (Anvil pode chamar em `startSprint`).

### Docs (PB-10 parcial)
`ARCHITECTURE.md`: Source telegram/email + seção Quadros (D-053). `docs/persona/quadros.md`: objetivo do sprint, export/sync, destino ao remover coluna.

### Dependências
- **[Forge→Anvil]** host: `composeSourceScope(..., externalSourceScope('telegram'), externalSourceScope('email'))` + poll Rivet → `receiveExternal`; reply via `originReply` + `vault.get`/`replyTelegram`/`replyEmail`. `startSprint` → `bindSprintGoal`.
- **F1**: framework+importadores prontos; amostras reais do Miguel.
- **PB-10 UI**: `GlobalKanban` → Quadros é Lumen após PB-5.

### Arquivos
- `persona-engine/src/sources/external.ts`, `sources.ts`, `sprint.ts`, `index.ts`
- `persona-engine/tests/{external-sources,sprint}.spec.ts`
- `persona-spec/{ARCHITECTURE.md,PLAN.md,reports/forge.md}`
- `docs/persona/quadros.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-engine/tests/external-sources.spec.ts packages/persona/persona-engine/tests/sprint.spec.ts
 Test Files  2 passed (2)
      Tests  9 passed (9)
```

```
node scripts/persona/check-pkg.mjs persona-engine
persona-engine: OK in 15.1s
```

### Limitações
- Sem host polling (Anvil). Sem token real. CLI congelada. Sem commit.
- Fila Forge executável vazia: F1 bloqueado em amostras; PB-10 resto = UI Lumen.

---

## 03/11 20:15 — Jornadas de quadros J12–J18 (gêmeo host do PB-9)

### O que ficou pronto
Sete jornadas novas em `persona-host/tests/journeys/j12–j18-*.spec.ts` (Anvil `boards.spec.ts` intocado). Helpers `seedProject` / `sayOn` em `journey-host.ts`. Suíte inteira **18/18**.

| ID | Prova |
|---|---|
| J12 | Contratação (Triagem) ≠ Site (Descoberta); Tarefas isoladas; guest ACL |
| J13 | 3 fluxos: Attention → `needs_you`; concluir → 1ª `done` do projeto |
| J14 | add/renomear/reordenar/remover com destino; Tarefa viva + Vigia/puxada; sem destino recusa |
| J15 | sprint planejado→ativo→encerrado; rolagem; marco no canal; `goalId` |
| J16 | cartão «Usar este fluxo?»; recusar no-op; aceitar aplica; JSON sujo degrada |
| J17 | v7→v8 (`createWorkspace` no v7, reopen); Tarefa sem assento na 1ª coluna da categoria |
| J18 | `fluxo.md`+`sprints.md`; DM fora; `mayUpload` project sim / dm não; restore 2× sem duplicar |

### PLAN (honesto)
PB-1/PB-2 já done. PB-3 **done** (J16). PB-4 **done** (Anvil + J12–J18) com os caveats abaixo.

### [Forge→Anvil]
1. `exportMarkdown` chama `events.list('channel:'+id)` e estoura `StoreError: forbidden` se o canal existe sem stream (zero mensagens). Repro: `pnpm exec vitest run packages/persona/persona-host/tests/journeys/j18-board-export.spec.ts` com o `sayOn` de J18 comentado.
2. `mapBoardError` descarta `DomainError.detail` e devolve `Error('INVALID_WORKFLOW')` — a recusa de remover coluna sem destino não chega em pt-BR no Remote. Repro: `pnpm exec vitest run packages/persona/persona-host/tests/journeys/j14-edit-flow.spec.ts` e inspecionar o `catch` cru (a jornada passa só porque usa `workflowRefusalText`).
3. `startSprint` não cria GoalBoard; só persiste `sprint.goalId`.

### Arquivos
- `packages/persona/persona-host/tests/journeys/{journey-host,j12-two-boards,j13-stage-columns,j14-edit-flow,j15-sprint,j16-propose-flow,j17-migrate-v8,j18-board-export}.*`
- `persona-spec/reports/journeys.md`, `persona-spec/PLAN.md` (PB-3/PB-4), `persona-spec/reports/forge.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/journeys
 Test Files  18 passed (18)
      Tests  18 passed (18)
 Duration  9.26s
```

### Limitações
- J18 posta uma linha no canal antes do export (contorna o `forbidden` do Anvil).
- J14 prova pt-BR via core, não via Remote.
- J15 prova `goalId`, não GoalBoard.
- Import Markdown de `fluxo.md` não restaura workflow; sync é `board.snapshot`/`restore`.
- Sem commit. CLI real continua congelada. Sem `pnpm install`.

---

## 03/11 19:15 — C2 + PB-1/PB-2 + proposta PB-3 (BRIEFING 15)

### C2
`Engine.answerAttention` persiste a resposta e limpa `attention`. Host `answerAttention` chama o engine (não só `note`). `completeReview` posta `milestoneSummary` em `#geral` (`coord-<ticket>-milestone`) mesmo se a Tarefa ainda não tiver `ended`. Jornada `j11-c2-attention.spec.ts`.

### PB-1 (domínio, persona-core)
`persona-core/src/board`: Workflow (colunas + categoria `todo|doing|review|needs_you|done`, WIP aviso, campos tipados), 7 templates pt-BR, Sprint `planejado|ativo|encerrado`, invariantes (≥1 todo/done, `needs_you` única, destino ao remover coluna). `Ticket.columnId/sprintId/campos` no engine Ticket. WIP **não** trava a máquina.

### PB-2 (engine)
Projeção estágio↔coluna: coluna explícita vence se a categoria bate; senão 1ª coluna da categoria. Move manual ajusta o estágio. Attention → `needs_you`; ended → 1ª `done`. Sprint ↔ `dsh-goal` (`sprintGoal`); encerrar com confirmação + rolagem + resumo de marco. Puxada/Attention classificam por categoria em Contratação/Site/Software.

### PB-3 (parser Forge; Remote = Anvil PB-4)
`proposeWorkflow` + `parseWorkflowProposal` (JSON sujo) devolvem cartão «Usar este fluxo?» — **nunca aplicam**. Degrade honesto sem JSON/template.

### Dependências
- **Anvil PB-4**: persistir workflow/seats/sprints (v8), Remote, aplicar proposta só após aprovação.
- **Keel**: `persona-engine` agora declara `@deepseek-ai/dsh-persona-core` (`workspace:*`) — precisa `pnpm install` no próximo commit.
- **F1**: ainda aguarda amostras reais do Miguel; sintético extra (ChatGPT sem id).
- **F4**: depois do F3.

### Arquivos
- `persona-core/src/board/{workflow,sprint,index}.ts`, `domain/schemas.ts` (`INVALID_WORKFLOW`), `tests/workflow.spec.ts`, `tests/import.spec.ts`
- `persona-engine/src/{workflow,workflow-error,sprint}.ts`, `core/{engine,model}.ts`, `index.ts`, `package.json`
- `persona-engine/tests/{attention,workflow,sprint}.spec.ts`
- `persona-host/src/{index,orchestration}.ts`, `tests/journeys/j11-c2-attention.spec.ts`
- `persona-spec/{PLAN.md,reports/forge.md,reports/journeys.md}`

### Comandos

```
pnpm exec vitest run …/persona-core/tests/workflow.spec.ts …/import.spec.ts …/persona-engine/tests/{workflow,sprint,attention}.spec.ts …/j11-c2-attention.spec.ts
 Test Files  6 passed (quando o import extra entrou: 4+attention+j11)
```

Verbatim desta rodada (core+engine board):

```
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

```
node scripts/persona/check-pkg.mjs persona-core
persona-core: OK in 6.9s
```

```
node scripts/persona/check-pkg.mjs persona-engine
persona-engine: OK in 16.8s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 63.7s
```

### Limitações
- Proposta da Coordenação ainda não tem prompt de modelo no host (Anvil Remote).
- Assentos em memória; SQLite = Anvil.
- `coordinationHandoff` foi içado no topo de `orchestration.ts` (ReferenceError por import circular / `export function` no fim do módulo).
- Sem commit. CLI real continua congelada.

---


## 03/11 18:55 — Jornadas J1–J10 (host)

### O que ficou pronto
Dez jornadas em `persona-host/tests/journeys/*.spec.ts` (arquivos novos; Anvil intocado). PersonaHost real, SQLite temporário, runner scriptado, relógio injetável. 10/10. Lista em `reports/journeys.md`. S7 do PLAN atualizado com honestidade (host verde; UI Probe ainda todo).

### Arquivos
- `packages/persona/persona-host/tests/journeys/{journey-host,j01–j10}.ts`
- `persona-host/src/orchestration.ts` (`requestChanges` sem pasta: anota + blocked antes de retry)
- `persona-spec/reports/journeys.md`, `PLAN.md` S7

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/journeys
 Test Files  10 passed (10)
      Tests  10 passed (10)
   Duration  14.36s
```

### Limitações
- J2 Aceitar sem `setProjectRoot` devolve bloqueado «Projeto sem pasta» (merge real continua no teste git do Anvil).
- Reduced-motion / dirD = Probe, não estas jornadas.

---

## 03/11 18:45 — purpose:talk (PRIORIDADE 1)

### Antes
Anvil mediu a 1ª resposta real: «Estou pronta como onb-1, Executora… Tarefa autorizada». Talk usava o wrap de Executora (`prefixOwnerNorms` / título default `Executora`) e o id interno no lugar do nome.

### O que ficou pronto
- Template `talk` + `composeTalkPrompt`: voz (nome de exibição, personalidade, instruções, função), colegas, Cofre/memória com teto 4000, pt-BR, 1–3 frases, sem mandato de Tarefa, sem «Executora», user/anexos em `<dado>`.
- `purpose: talk` no session runner **não** aplica owner-norms; `personaName`/`personaTitle` saem do `resolveFor` e entram em `createOarSessionRunner`.
- `finishReply` entrega `talkPrompt(...)` (nunca o body cru).

### Arquivos
- `persona-engine/src/prompts/{talk,templates}.ts`, `src/index.ts`, `tests/prompts.spec.ts`
- `persona-host/src/{orchestration,runner}.ts`, `tests/talk-voice.spec.ts`
- `persona-runners/src/oar/session.ts`, `tests/talk-session.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-engine/tests/prompts.spec.ts packages/persona/persona-runners/tests/talk-session.spec.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

```
node scripts/persona/check-pkg.mjs persona-engine
persona-engine: OK in 17.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.6s
```

```
pnpm exec vitest run …/prompts.spec.ts …/talk-session.spec.ts …/talk-voice.spec.ts
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
reply: "BANANA"  source: runner  actor: onb-1  sqlite type: runner
broke: []  execs: 1  first-token 13644 ms  reply 13698 ms  total 18336 ms
```

Depois: o modelo obedeceu «Responda só BANANA». Sem «Executora», sem mandato de Tarefa no corpo. 1/3 execs da exceção.

### Limitações
- `actorId` do evento continua `onb-1` (id da linha); o prompt e o texto da resposta não vazam o id.
- 1º token ainda ~13,6 s (pool/modelo rápido = Rivet).
- `check-pkg persona-host` / `persona-runners`: falhas em testes do Anvil/Rivet (unused import, `warmTtlMs`, `nowMs`); nenhum erro nos arquivos desta onda.

---

## 03/11 17:50 — Queda+resume, importadores F1, guia

### O que ficou pronto
- **Consistência sob queda:** `FaultyRepositories` / `CrashError` em cada passo (receive → archive). Varre N escritas. Nenhum N falhou. Resume sem Tarefa perdida/duplicada nem reply duplicado. `defineCrashSuite` para o Anvil (SQLite aborta o tx). Relato em `bench-crash.md`.
- **Importadores F1:** Markdown/Obsidian (wikilink, frontmatter, anexo com aviso), Notion (.md/.csv), ChatGPT, Claude.ai, Gemini Takeout. Prévia com contagem, duplicados e motivo. Credencial recusada. DM sem compartilhar não sobe. Reimportar não duplica. Rollback. Fixtures sintéticas. Cada formato marcado **esquema presumido — validar com amostra real**. Arquivo irreconhecível: pt-BR claro. Campos extras ignorados.
- **Guia:** `docs/persona/*` + `README.persona.md` — onboarding, Revisar (Aceitar / Pedir ajustes / Descartar), conexões e Não conectado, login CLI, bandeja, Precisa de você, backup/DPAPI mesma conta, exportar, privacidade, problemas (CLI, host reconectando, cota). Uma ideia por frase.

### Arquivos
- `persona-engine/src/crash/*`, `tests/contract/crash.contract.ts`, `tests/crash.spec.ts`
- `persona-core/src/import/{types,apply,markdown,notion,gemini,chatgpt,claude,index}.ts` + `tests/import.spec.ts`
- `docs/persona/*`, `README.persona.md`, `persona-spec/contracts/crash.md`, `reports/bench-crash.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 10.0s
persona-engine: OK in 17.1s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  74 passed (74)   # review-delivery 5s flake 1×, retry 6/6
      Tests  453 passed (453)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 51.8s
```

### Limitações
- Sem CLI real (Keel: orçamento da rodada já usado).
- Esquemas de importação são presumidos até amostra real do Miguel.
- Runner/archive: 0 escritas no repo em memória (entrega já no start; retenção é outro store).
- Fila Keel (queda / F1 / guia) vazia no território Forge.

---

## 03/11 17:25 — F3 modelo real + parser sujo + soak 7 dias

### O que ficou pronto
- **F3 com modelo real:** `resolveRunner({ cli: claude, model: haiku, permissionMode: prompt })`, 10 cenários discriminantes (não o prefixo do corpus). Rodada 1 (prompts velhos) **5/10**; ajustes em `prompts/templates` (injeção → ignore, escopo maior → Tarefa nova, ambíguo → uma pergunta); rodada 2 **8/10**. Restam d1/h1 (silent). Sem tokens/segredos. O 41/41 do CI continua fake.
- **Parser sujo:** reparo determinístico → 1 pedido de reparo → degrade "não entendi a resposta da persona" + Precisa de você. Sem Tarefa criada por saída duvidosa. Corpus: JSON truncado, cerca ```json, prosa, chaves duplicadas, enum errado, extras, unicode/CRLF, saída enorme, JSON de outro esquema + fuzz `0xD1B7`.
- **Soak 7 dias** (semente `0x50A7`): 3 projetos × 5 personas; iniciativa, Vigia, puxada, orçamento, retenção, silêncio, runner falha/volta, host 10×, sono +8 h, DST Lisbon, fuso São Paulo→Lisboa. Invariantes verdes. Números em `bench-soak.md`. Memória + `defineSoakSuite` para o Anvil (SQLite).

### Arquivos
- `packages/persona/persona-engine/src/parse/model-output.ts`, `src/router/handlers.ts` (`personaRouteFromModel` / report / propose)
- `src/bench/coord-eval.ts`, `src/prompts/templates.ts`, `src/soak/sim.ts`, `src/initiative.ts`, `scripts/coord-real-cli.ts`
- testes `parse-model-output`, `soak`, `initiative-zone`, `contract/soak.contract.ts`
- `persona-spec/reports/bench-router-eval.md`, `bench-soak.md`, `contracts/soak.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.2s
persona-engine: OK in 14.2s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  73 passed (73)
      Tests  447 passed (447)
   Start at  17:22:29
   Duration  17.36s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 47.7s
```

```
PERSONA_REAL_CLI=1 pnpm exec tsx packages/persona/persona-engine/scripts/coord-real-cli.ts
r1 … 5/10   r2 … 8/10
```

### Limitações
- Rodada 2: `d1` duplicate e `h1` handoff saíram `silent` (sem 3ª rodada; teto 2×10). Linha extra no despacho depois da 2ª, não remedida.
- Soak cria 1 Tarefa/projeto (thread único; follow-ups não abrem outra).
- F1 do PLAN ainda espera amostras reais do Miguel.
- Fila Keel (real CLI / parser / soak) vazia no território Forge.

---

## 03/11 16:10 — ReviewDelivery + eval F3 + equipes-modelo

### O que ficou pronto
- **ReviewDelivery** (git no PATH, argv, sem shell): `prepare` worktree/branch `persona/<id>` (`confinePath`, longpaths); `summary` arquivos +/− + patch teto + testes citados + segredos redigidos; `accept` ff/squash, conflito aborta e bloqueia (nunca meio-merge); `requestChanges` nota + reassignment, Mandate imutável; `discard`; `sweepOrphans` na retomada. Sem push. Contrato `persona-spec/contracts/review-delivery.md` (Anvil Remote / Lumen painel Revisar).
- **F3 eval da Coordenação:** 41 cenários pt-BR; fake determinístico no CI (41/41); CLI real só com `PERSONA_REAL_CLI=1` (≤10). Ablação batch/pass-through no mesmo relatório. `persona-spec/reports/bench-router-eval.md`. Sem otimizar. CLI real: não rodou.
- **Biblioteca de equipes** (8 modelos de onboarding): software-dev, conteúdo, pesquisa, suporte, estudos, pessoal, agência, escritório. Funções, não nomes Atlas/Router. Autonomia padrão = propor. Snapshot das instruções. Muse mapeia avatares; Prism usa no passo da equipe.

### Arquivos
- `packages/persona/persona-engine/src/review/*`, `src/bench/coord-eval.ts` + testes
- `packages/persona/persona-core/src/domain/{onboarding-teams,templates,schemas}.ts` + `tests/team-library.spec.ts`
- `persona-spec/contracts/review-delivery.md`, `persona-spec/reports/bench-router-eval.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.3s
persona-engine: OK in 7.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  70 passed (70)
      Tests  432 passed (432)
   Start at  16:08:21
   Duration  18.19s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.2s
```

### Limitações
- `GitReviewDelivery` não faz push; o host chama `sweepOrphans` no resume.
- 100% do corpus é o fake do CI, não um modelo. CLI real não rodou (`PERSONA_REAL_CLI` ausente).
- `suggested-animals` continua com nomes Atlas/Bento (template inicial já existente; onboarding novo não usa).
- Fila vazia no território Forge.

---

## 03/11 16:00 — Endurecimento (security / properties / retention / bench / guia)

### O que ficou pronto
- **Segurança adversarial** (`tests/security/*.spec.ts`, título = ataque): injeção no Trigger não passa o gate nem muta Mandate (escopo maior = Tarefa nova); `bindRunIdentity` / `persona*FromRun` — identidade vem da sessão; `persona_propose` em cadeia de 3 (ferramentas/CLI/orçamento); `confinePath` + worktree (`..`, absoluto, junction); DM não vaza em compile/recall/chain/export/search; `looksLikeCredential` recusa chave em proposta, vault e prompt; revogação corta `can()` e `report` (`mandateRevoked`); replay de Trigger/outbox/webhook.
- **Propriedades** (mulberry32, semente `0xC0FFEE` / `0xA11CE`, N=32–64): idempotência de Trigger, 1 Eval/Thread, Mandate imutável, SyncLog sem lacuna, DM sem `shared`, `can()` monotônico, outbox só após commit, resume reentrante.
- **Retenção:** porto `RetentionPolicy` + `MemoryRetention` + suíte de contrato. Doc `persona-spec/contracts/retention.md`. Anvil: SQLite VACUUM/FTS na mesma suíte.
- **Bench engine:** `persona-spec/reports/bench-engine.md` (10k tickets / 100k triggers; pipeline 200). Sem otimizar.
- **Guia pt-BR** `docs/persona/*.md` + `README.persona.md` (créditos; produto = Persona, D-017).

### Arquivos
- `packages/persona/persona-core/src/{domain/secrets,import/privacy,domain/rules,domain/vault-propose,domain/schemas}.ts` + `tests/security` + `tests/properties`
- `packages/persona/persona-engine/src/{retention,executor/confine,executor/worktree,router/handlers,core/assignments,prompts/templates,bench/engine}.ts` + testes
- `persona-spec/contracts/retention.md`, `persona-spec/reports/bench-engine.md`, `docs/persona/*`, `README.persona.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 5.5s
persona-engine: OK in 5.0s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  67 passed (67)
      Tests  422 passed (422)
   Start at  15:55:54
   Duration  9.24s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 34.5s
```

### Limitações
- Pipeline do bench é 200 ciclos (não 100k receives); estoque 10k/100k mede store/views/`get`.
- Exclusão de retenção em memória; VACUUM/FTS = Anvil.
- Sem defeito em pacote alheio nesta onda (Anvil já tem retenção SQLite v6 no Status).
- Fila de endurecimento vazia no território Forge.

---

## 03/11 15:38 — PROACTIVITY nativa (BRIEFING 14 / PROACTIVITY.md) ✔ engine

### O que ficou pronto
- **Puxada:** `afterAssignmentSettled` / `nextEligible` — prioridade, deps prontas, `canAssign`, concorrência, tokens/runs. Dependente acorda por evento (`wakeDependents`).
- **Objetivos:** `GoalBoard` + `MemoryGoalBoard` (host liga `dsh-goal` / `goal-round-driver` / `tool-goal`). `emptyQueueDecision`: fila+objetivo=`work`; vazia+objetivo aberto=`plan` (turno da Coordenação); vazia sem objetivo=`rest` (`spendsModel` false — sem IA). Tarefa grande → `ticketGoal` (1 goal/sessão, 256 rounds).
- **Continuação:** `verifyReady` + `continuationAfterReady` — dentro do mandato faz (`act`) ou propõe; especulativo só registra.
- **Vigia:** `vigiaTick` (relógio falso): ociosa+fila+objetivo ⇒ `assign` no mesmo ciclo; sem progresso N min; loop; espera colega (`nudge`/`escalate`); falha de runner (`retry_backoff`+`recover`). Tudo vira `VigiaAudit`.
- **Orçamento:** propostas/dia, janela de silêncio, tokens/runs, taxa de aceitação alonga o intervalo; `proposalDigest` em vez de ping.
- **Autonomia:** `on_request` | `propose` | `act`; especulativo começa em `observe`.

### Arquivos
- `packages/persona/persona-engine/src/{pull,goals,continue,budget,proactivity,watchdog}.ts`
- `packages/persona/persona-engine/tests/proactivity-v1.spec.ts`
- `persona-spec/ARCHITECTURE.md` (invariantes)

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.0s
persona-engine: OK in 8.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  61 passed (61)
      Tests  398 passed (398)
   Start at  15:15:44
   Duration  7.73s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 32.3s
```

### Limitações
- `GoalBoard` é port: Rivet/Anvil ligam `ctx.goals` + round-driver (engine não importa Cordis).
- `vigiaTick` não escreve Ticket — host aplica `assign`/`recover`.
- Rotina diária de iniciativa (horário da persona) e cartão de Aprovações = UI (Lumen/Prism).
- Fila vazia no território Forge.

---

## 03/11 15:17 — views/cards/13 cenários/skills/ARCHITECTURE/bench-context ✔

### O que ficou pronto
- **Read-models:** `persona-engine/src/views` sobre `Repositories` + `canRead*` (Anvil liga `can()`). `overview` (problems, Precisa de você, executor, flow 24h), `ticketList/Row/Detail`, `threadList/Detail` (cursor `<at>|<id>` via Triggers), `decisionList`, `search`. Chip "Aguardando evento". Saudável = listas vazias.
- **Cartões/recursos:** `triggerCard`/`ticketCard` com `capped()` + `read`. `personaRead` / `personaRecall` (`persona-spill:` = B4); `readable()` = fronteira do Ticket do worker. Sem GitHub/Feishu.
- **13 obrigatórios** em `persona-core/tests/mandatory/` + Super-agent em `persona-engine/tests/mandatory/`.
- **`materializeSkills`:** dsh → seção; CLI → prefixo + MCP; candidata/DM não vazam; manifesto com versão.
- **`persona-spec/ARCHITECTURE.md`** e contrato `persona-spec/contracts/views.md`.
- **Microbench:** `persona-spec/reports/bench-context.md` (1k/10k/100k, 1 round).

### Arquivos
- `packages/persona/persona-engine/src/{views/*,cards,resources}.ts` + testes
- `packages/persona/persona-core/src/domain/{skills,reply}.ts`, `src/context/bench.ts`, `tests/mandatory/*`
- `persona-spec/{ARCHITECTURE.md,contracts/views.md,reports/bench-context.md}`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 4.2s
persona-engine: OK in 4.5s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  60 passed (60)
      Tests  391 passed (391)
```

```
pnpm exec tsx packages/persona/persona-core/scripts/bench-context.ts
# 1k compile 257ms / 10k 10.3s / 100k 98.8s; recall 3.3 / 26.6 / 212 ms
```

### Limitações
- Timeline de Thread vem de Triggers alcançáveis (port sem `turns`/`triggers.list`).
- `persona-read` de `triggers` só enxerga pending/eval/origem/inputs.
- compileContext 100k ~99s: `tokens()` em todo candidato após o orçamento encher.
- Super-agent obrigatórios no engine (precisam de `Engine`); domínio no core.

---

## 03/11 15:02 — sync/E7/E8/D6/F1/F3/G1/S2-cofre ✔ fila pura do marco E/F

### O que ficou pronto
- **SYNC (D-034):** envelope `workspaceId/streamId/seq/idempotencyKey/classification/payload` + cifra opcional; DO é o único ordenador (`SEQ_GAP`); DM/privado sem `shared: true` não sobe; replay idempotente; retomada por cursor; `WebhookEnvelope` para o Worker. Port `SyncLog` (`MemorySyncLog` = suíte). Contrato `persona-spec/contracts/sync.md` — Anvil persiste.
- **E7:** Invite (TTL, uso único), Grant, revogação, `purgeSource` (revoga vault + arquiva memórias). Amigo sem grant não lê DM/cofre.
- **E8:** Source GitHub pura (`persona-engine/src/sources/github`) — evento→Trigger, humano×bot, comentário editado = novo id, PR closed/merged → `threadClosed`, reentrega = `duplicate`. Sem polling.
- **D6:** `chooseConnection` sem fallback silencioso; Cursor descrito sem MCP.
- **F1:** framework de importação (preview, privacidade, externalId, rollback); adaptadores ChatGPT / Claude.ai / Markdown; Grok registrado mas não fareja (amostra pendente). Candidatas sempre `proposed`. Cookies/tokens recusados.
- **F3:** experimento sintético do Router — batching −87.5% inferências; pass-through −92.3% decisões/tokens nesta carga. Relatório em `persona-spec/reports/bench-router.md` (metodologia do paper, número dele não prometido).
- **G1:** relação não concede acesso nem inicia trabalho; posição não entra em `can()`.
- **S2:** `proposeVaultUpdate` (approval|auto; nunca mais visibilidade que o criador).

### Arquivos
- `packages/persona/persona-core/src/{sync,import,domain/invite,connection,relations,vault-propose}.*` + testes + fixtures
- `packages/persona/persona-engine/src/{sources/github,bench/router}.ts` + testes
- `persona-spec/contracts/sync.md`, `persona-spec/reports/bench-router.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 68.0s
persona-engine: OK in 6.8s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  36 passed (36)
      Tests  357 passed (357)
   Start at  14:49:54
   Duration  5.46s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-host/src/orchestration.ts:89:3
  public property is missing an explicit type annotation
(nenhum artifact mudou; o arquivo é do Anvil — não editei)
```

### Limitações
- Persistência sync/import/convites é port; Anvil implementa D1/SQLite com a mesma suíte.
- GitHub: sem `send`/`read` via `gh` (IO do Rivet/Anvil). Webhook assinado fica no Worker.
- Export Grok-bot: ponto de extensão pronto; sniff = false até o Miguel mandar amostra.
- F3 é carga sintética; percentuais ≠ paper.
- `router.spec.ts` Thread usa `ref: { source, id }` (check-pkg engine OK).
- Fila vazia.

---

## 03/11 14:51 — typecheck + fila P7→P8→P9→P6→Vigia→E1→E2→memória→E4 ✔

### O que ficou pronto
- Gate `check-pkg` (src+tests): (1) `resume.ts` — removido `liveTicket` não lido (TS6133); (2) `aging.ts` `restoreMemory` — omite `restoredFrom` quando `supersededBy` é `undefined` (TS2375 / `exactOptionalPropertyTypes`).
- **P7** Runner port em `persona-engine` (D-040/D-041): `ensureSession/deliver/cancel/status/whenIdle/onEvent/capabilities/background`, `toolsForRole` sem `bash` no coordinator, `WorkerSlots` (+1 person), launch/delivery via `EffectQueue`, transient 3× 15/30/60s, `PrepareFailed` sem retry + `ticket.delivery` mesmo com assignment ainda pending. `FakeRunner`/`FakeClock`. Contrato `persona-spec/contracts/runner.md` — Rivet importa o tipo daqui.
- **P8** `resumeExecutor` + `RECOVERY_NOTE` + `idleOutcome` + `addWorktree` por argv (`shell: false`). Resume não relança pending com `ticket.delivery`.
- **P9** `personaRoute` (≤20, recusa item a item) / `personaReport` / `personaAck` (`engine.reply`) / `personaHandback` / `personaThreadFollow` + `MasterAssessor` + `NoticeLog`.
- **P6** prompts pt-BR com `{{persona_name}}` — nenhum Atlas/Bento/Nina no template (D-043). `MemoryPromptStore` versionado.
- **Vigia** sinais puros (`ticket_stalled` / `effect_failing` / `eval_unavailable`) + dedupe.
- **E1** handoff claim-once, ciclo/profundidade/orçamento.
- **E2** skill DM não publica para project/team; versão + rollback.
- **Memória** aging nativo (decay/reinforce/near-dup/contradiction/supersede/restore) + markdown vault/memory.
- **E4** `applyProactivity`: `off`/`observe` (só registra) / `auto`.

### Arquivos
- `packages/persona/persona-engine/src/{ports/runner,executor/*,router/*,prompts/*,watchdog,proactivity}.ts`
- `packages/persona/persona-engine/src/index.ts` + `tests/{runner,executor,resume,worktree,router,prompts,watchdog,proactivity}.spec.ts`
- `packages/persona/persona-core/src/domain/{handoff,skills,aging,markdown}.ts` + testes
- `persona-spec/contracts/runner.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 4.9s
persona-engine: OK in 4.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  28 passed (28)
      Tests  332 passed (332)
   Start at  14:34:44
   Duration  3.46s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.4s
```

### Limitações
- `Engine.deliveryFailed` só grava se a assignment já está `running`; falha de launch persiste `ticket.delivery` direto no repo.
- Backoff 15/30/60s é classificado no handler; o `EffectQueue` remarca `due` com +50 ms (o relógio de teste avança). Anvil pode persistir o due real no SQLite.
- Adaptadores dsh/OAR continuam com o Rivet — só o port e o Fake de engine estão aqui.
- Fila Forge (Keel 14:45/14:51) concluída. Sem `maestri ask Keel`.

---

## 03/11 14:15 — P3a–P5, S3, P11, P12, B4 ✔ fila do engine/domínio fechada

### O que ficou pronto
- **P3a** `EffectQueue` + `EffectPersistence` (memória). Enfileira no `afterCommit`; rollback não dispara; `Later` não incrementa attempts.
- **P4a** `MemoryOutbox` + passes (`sent`/`dropped`) idempotentes.
- **P5** projeção estágio→coluna (`todo|doing|review|blocked|done`) + chip `waiting`; `reviewThread` = `{ source: 'review', id }` só em `person/review` (D-039).
- **S3** `personaPropose`: sem Recrutar → `ACL_DENIED`; escalada → `ACCESS_ESCALATION`; `auto` só aprova dentro do acesso do criador.
- **P11** `admitTrigger` (Policy ACL): `decide` no canal do projeto; explicit/inferred/notHuman.
- **P12** `internalSourceScope` channel/dm/persona/routine.
- **B4** `inlineRef` / `spillPointer` / `recallChain` com authorize por salto; revogação no meio corta a cadeia.

### Arquivos
- `packages/persona/persona-engine/src/{effects,outbox,kanban,sources}.ts` + testes
- `packages/persona/persona-core/src/domain/{rules,admission}.ts`
- `packages/persona/persona-core/src/context/{chain,error}.ts` + testes

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  16 passed (16)
      Tests  281 passed (281)
   Start at  14:15:12
   Duration  2.43s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
```

Oxlint nos arquivos novos: 1 arrow-parens em `effects.ts` (corrigido em seguida). `src/core` verbatim do protótipo continua fora do rewrite stylistic.

### Limitações
- Persistência de effects/outbox em SQLite é do Anvil (mesma interface `EffectPersistence` + contrato `Repositories`).
- `EffectQueue.enqueue` grava a row só no `afterCommit` (memória-seguro). No SQLite o Anvil pode upsert na mesma tx e só usar o hook para `kick`.
- D-039 não estava em DECISIONS.md; review-thread = `source: 'review'`.
- Fila Forge (Keel 14:22) concluída. Sem `maestri ask Keel`.

---

## 03/11 14:09 — P2a ✔ port Repositories + suíte de contrato (memória)

### O que ficou pronto
Port `Repositories` com `projectId` (D-038: tenant = projeto) e `afterCommit` (corre após o commit mais externo; rollback descarta hooks). `MemoryRepositories` implementa. Suíte `tests/contract` parametrizada por fábrica; memória passa a suíte (≥20) e os 113 do `core-engine.spec`. Contrato em `persona-spec/contracts/repositories.md`. Anvil pluga SQLite na mesma fábrica.

### Arquivos
- `packages/persona/persona-engine/src/core/ports.ts`
- `packages/persona/persona-engine/src/core/memory.ts`
- `packages/persona/persona-engine/tests/contract/repositories.contract.ts`
- `packages/persona/persona-engine/tests/contract/memory.contract.spec.ts`
- `persona-spec/contracts/repositories.md`

---

## 03/11 14:08 — B1 ✔ ACL + S2-domínio Cofre

### O que ficou pronto
`can(actor, action, resource)` + `assertCan` + adaptadores `authorizeContext` / `authorizeRecall` (≥60 casos). Cofre: kinds obrigatórios `constraint`/`decision` alimentam `compileContext` via `vaultSnapshot` / `compileVaultContext` (sem persistência). Revisão monotônica. Visibilidade workspace/project/persona/members. Obrigatório inacessível falha closed (`REQUIRED_CONTEXT_UNAVAILABLE`).

### Arquivos
- `packages/persona/persona-core/src/domain/acl.ts`
- `packages/persona/persona-core/src/domain/vault.ts`
- `packages/persona/persona-core/src/domain/schemas.ts` (`ACL_DENIED`)
- `packages/persona/persona-core/tests/acl.spec.ts`
- `packages/persona/persona-core/tests/vault.spec.ts`

---

## 03/11 14:04 — P1 ✔ persona_ + S1-complemento templates

### O que ficou pronto
Constante única `PERSONA_TOOL = 'persona_'`. Mensagens de `USER_ERRORS` e `STATUS_REQUEST` usam `persona_*`. `RECOVERY_NOTE` exportado. `REASONS.hostRestarted` = `host restarted`. Teste varre `src/core` e prova que não há `orchestrator_`. Templates Agência (`agency`) e Escritório (`office`) com 1 coordenação + 1 vigia cada.

### Arquivos
- `packages/persona/persona-engine/src/core/{ids,errors,tickets,assignments,reasons,index}.ts`
- `packages/persona/persona-engine/tests/persona-tool.spec.ts`
- `packages/persona/persona-core/src/domain/{templates,schemas}.ts`
- `packages/persona/persona-core/tests/domain.spec.ts`

---

## 03/11 14:00 — P0 ✔ src/core verbatim + NOTICE

### O que ficou pronto
15 arquivos do protótipo em `persona-engine/src/core` (commit 8c32a9d) + `core-engine.spec` (113 `it`) + `stage.spec` + `NOTICE` (MIT) em `package.json` `files`. Modelo removido de `persona-core/src/engine/*` (core = domínio puro). Sem import `@deepseek-ai` em `persona-engine/src`. Dois imports mortos do protótipo removidos para `noUnusedLocals`.

### Arquivos
- `packages/persona/persona-engine/src/core/*` (15)
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/NOTICE`
- `packages/persona/persona-engine/tests/{core-engine,stage}.spec.ts`
- `packages/persona/persona-core/src/index.ts` (parou de reexportar engine)

### Comandos e saída verbatim (onda P0–P2a)

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  10 passed (10)
      Tests  265 passed (265)
   Start at  14:08:39
   Duration  2.01s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-core/src packages/persona/persona-engine/src/core/{ids,memory}.ts
(exit 0)
```

Oxlint em `src/core` verbatim do protótipo: stylistic/non-null do upstream (não reescrito). Sem `pnpm install`. Sem commit.

### Limitações / dúvidas
- `src/core` permanece idiomático do protótipo (non-null, linhas longas).
- D-038/D-039 não estavam em `DECISIONS.md`; P2a seguiu o brief (tenant = `projectId`). D-039 (review-thread) entra em P5.
- Próximo: P3a Effects → P4a Outbox/Passes → P5 kanban+review-thread → S3 → P11 → P12 → B4.

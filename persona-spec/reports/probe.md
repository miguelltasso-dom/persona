# Probe — relatórios (mais recente no topo)

## 2026-11-04 12:15 — fake-cli responde 1 turno (11/11); host + runner real + fake PASSOU; NSIS b3a4e5b933 instala; UI/instalado na fila da trava

### PASSOU
| Item | Evidência |
|------|-----------|
| **Fake-cli com turno completo (P0 #1)** | `fake-cli.spec.ts` **11/11** (`pnpm exec vitest run packages/persona/persona-e2e/tests/fake-cli.spec.ts --testTimeout 60000`, 2 s). Env: `FAKE_CLI_TURN_MS` latência, `FAKE_CLI_FAIL` (1 / mensagem / `crash` / `quota`), `FAKE_CLI_REPLY`, `FAKE_CLI_INPUT_TOKENS`, `FAKE_CLI_MODEL`. O `result` de sucesso leva `usage` + `modelUsage` (sem isso o ledger ficava vazio e o verificador acusava `measured-execution` e `call-budget`). `--help` não trava mais (`codex app-server --help`). Muse avisada. |
| **Trava anti-gasto** | `withFakeCliOnPath()` agora também pina `OAR_CLAUDE_BIN`, `OAR_CODEX_BIN` e `OAR_OPENCODE_BIN` nos stubs (o OAR tem fallback para `~/.local/bin/claude.exe` e esta máquina tem claude/codex/opencode reais). Novo `withNoEngineOnPath()` (PATH mínimo, pins para arquivo inexistente, sem `DEEPSEEK_API_KEY`) para o caminho "Falta uma IA". |
| **Host + runner real (OAR) + fake, sem UI** | `first-delivery-real-cli.ts` com o fake: `broke: []`, **25,7 s**, 3 turnos, ledger 3/3 `measured` (2 triagens + 1 execução ligada à Tarefa), Tarefa `done`, marco `ready`, entrega `source=runner` no #geral. Antes dos tokens medidos: `broke: [evidence:measured-execution, evidence:call-budget]`. As 3 causas do diagnóstico das 09:35 já estão corrigidas por Anvil/Forge. Spec novo: `mandatory-first-delivery-host-fake.spec.ts` + `scripts/first-delivery-fake-host.ts`. |
| **NSIS b3a4e5b933** (`C:\p8c\Persona-Setup.exe`, 338 342 203 B, sha256 34DAFA1E274B51EA, não assinado) | Instalação silenciosa `/S /D=C:\p8i`: **exit 0**, atalhos no Menu Iniciar e na Área de Trabalho, entrada de desinstalação (HKCU, `Uninstall Persona.exe /currentuser`), 1 168 MB em disco, `app.asar` presente, `Persona.exe` com ProductName e FileDescription = Persona. |

### ACHADOS (devolvidos)
- **Instalação silenciosa levou 303 s** (32 k arquivos; Defender provável) → **[Rivet]** UX: progresso no instalador; considerar reduzir `app.asar.unpacked`/runtime.
- **Metadados**: CompanyName do `Persona.exe` = "Hangzhou DeepSeek Artificial Intelligence Co., Ltd."; o **Setup** tem FileDescription "Electron desktop shell for a bundled dsh runtime and external plugins" (texto do upstream) → **[Rivet/Keel]** marca; manter crédito MIT em LICENSE/Sobre, mas não como empresa do produto.
- **Sem MinGit no instalado** (esperado: SW-4 ainda `todo`).
- **A 1ª entrega gasta 3 turnos de modelo**: inject do prompt da persona (`onb-1:prompt`) + triagem (`ingest:first-delivery`) + execução do worker. O orçamento "3 execuções reais" do projeto é consumido por UM V1-P0-5 → **[Keel]** decidir se o inject do prompt precisa ser turno pago ou se o orçamento conta só `execution`.

### INCIDENTE (zero custo)
Ao gravar este relato, um `node -e "..."` com crases dentro de aspas duplas fez o bash executar trechos do texto como comandos. Chegaram a rodar o `codex` real (`app-server --help`, só ajuda) e o `claude` real sem prompt (`--print` sem entrada → erro imediato). **Nenhuma chamada de modelo** e nada foi gravado fora deste relato. Corrigido: relatos agora vão por arquivo (Write), nunca por shell com crases.

### EM CURSO (fila da trava build; Lumen/Anvil/Rivet na frente)
- `mandatory-first-delivery-fake.spec.ts` (UI web: onboarding 1–5 → Pedir agora → Equipe trabalhando → celebrar → Aceitar e entrar → #geral + quadro; e o caminho sem IA "Falta uma IA") e `mandatory-first-delivery-installed.spec.ts` (mesmos 2 cenários no exe instalado `C:\p8i\Persona.exe`). Resultado no próximo relato.
- V1-P0-5 real: só com o OK do Keel.

### Arquivos tocados (Probe)
`packages/persona/persona-e2e/`: `src/fake-cli.ts`, `fixtures/fake-cli/fake-cli.mjs`, `src/real-app-session.ts`, `src/index.ts`, `src/first-delivery-flow.ts` (novo), `scripts/first-delivery-fake-host.ts` (novo), `tests/fake-cli.spec.ts`, `tests/mandatory-first-delivery-fake.spec.ts` (novo), `tests/mandatory-first-delivery-installed.spec.ts` (novo), `tests/mandatory-first-delivery-host-fake.spec.ts` (novo), `README.md`. `check-pkg persona-e2e` OK.

### Fila
UI web + instalado (trava); SW-9/SW-10 depois de SW-1..8 (todos `todo`).

---

## 2026-11-04 09:35 — B9 Tier 1 6/6 PASS; first-delivery contract 5/5; diagnóstico P0 real CLI; D8 unpacked falha confirmada

### PASSOU
| Item | Resultado |
|------|-----------|
| **B9 Tier 1 real app** | `mandatory-b9-real-app.spec.ts` **6/6 PASS** (~87 s); console errors **0** (404 createWorkspace sanado); #geral composer, kanban global, draft send, reduced-motion, dirD visual diff todos verdes |
| **Harness Windows fix** | `locked-launch.ts`: `shell: false` para `process.execPath` (elimina erro `'C:\Program' não é reconhecido` em caminhos com espaço) |
| **First-delivery contract** | `mandatory-first-delivery-contract.spec.ts` **5/5 PASS**; corrigido path do teste (`derive-first-delivery.client.spec.ts`, não `.tsx`) |
| **PRO-6 contracts** | `mandatory-proactivity-contract.spec.ts` **4/4 PASS** (PRO-1 engine 9/9, aceite 6/6, PRO-3 runner 10/10, PRO-6 away 2/2) |
| **GOV & PB §3 contracts** | `mandatory-governance-contract.spec.ts` e `mandatory-project-boards-contract.spec.ts` **7/7 PASS** (J1–J10, J12–J18, J19) |
| **Boot Publish & V1-Close** | `mandatory-boot-publish-contract`, `mandatory-v1-close-contract`, `mandatory-installed-boot-contract` **12/12 PASS** |
| **check-pkg** | `scripts/persona/check-pkg.mjs persona-e2e` **OK em 6.9s** |

### FALHOU (evidência e causa raiz devolvidas)
| Item | Evidência |
|------|-----------|
| **V1-P0 Real CLI (`first-delivery-real-cli.ts`)** | `broke: ["no-runner-delivery-on-geral", "exec-budget-exceeded"]`. Três causas: 1) `listConnections` chamado síncrono antes de `connections.ready()`; 2) `stages.length > 3` acusa estouro falso porque `mark()` grava 6 marcas internas de telemetria; 3) `flush()` termina sem mensagem do runner no `#geral`. Devolvido a **[Anvil/Forge/Rivet]** |
| **D8 Unpacked Exe (`installed-onboarding-cdp.mjs`)** | Timeout 180s esperando `[data-persona-shell]`, `rootEmpty: true`, screenshot `installed-onboarding-fail.png`. Confirma achado da Muse (falha de boot por ENOENT do patch yml no asar). Devolvido a **[Rivet]** |

### Arquivos tocados (Probe)
`packages/persona/persona-e2e/src/locked-launch.ts`
`packages/persona/persona-e2e/tests/mandatory-first-delivery-contract.spec.ts`

### Fila (não vazia)
D8 NSIS novo (Rivet); re-run V1-P0 real CLI após correção Anvil/Forge; PRO-6 layer 2 UI; benchmarks F3.

---

## 2026-11-04 08:02 — Keel D-062/B9: lock livre; harness deadlock fix; B9 5/6

### PASSOU
| Item | Resultado |
|------|-----------|
| **Fila build** | Rivet `package-clean b26d8b99a2` soltou lock (~08:00); **sem exit 75** nesta rodada |
| **Harness** | `web-host.ts`: com `PERSONA_LOCK` do `with-lock` externo → `launchDirect` (evita nested lock / falso `WebHostBootTimeoutError`) |
| **B9 Tier1 retry** | Host ~87 s; **5 pass** (#geral composer, kanban, dirD, reduced-motion, not harness shell) |

### FALHOU
| Item | Evidência |
|------|-----------|
| **B9 console gate** | `persona/createWorkspace` **HTTP 404** → bootstrap live store + dev seed falham no browser → **[Lumen/Anvil]** rota/host persona no profile `persona` |
| **D8** | `C:\p8c\Persona-Setup.exe` ainda 343148924 @ 05:56 → **[Rivet]** NSIS pós-pack (trava `pack` D-062) |

### Notas Keel
- B9 atrás do Rivet antigo: **confirmado** na 1ª tentativa (espera fila + timeout 240 s por deadlock interno, não só pack).
- **Exit 75**: repetir `with-lock` conforme orientação; próximas packs Rivet não seguram `build.lock`.
- Re-run B9 após `createWorkspace` verde (ou smoke 9/9 explicar delta).

### Fila (não vazia)
D8 exe; B9 console 404; first-delivery contract run; P0 real CLI; PRO-6; GOV/PB §3.

---

## 2026-11-04 07:35 — B9 boot timeout + contracts 12/12; D8/Rivet pendente

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts** | v1-close + boot-publish + D8 harness **12/12** (~88 s) |
| **`run-persona-e2e-vitest.mjs`** | helper OK; B9 chamou com `PERSONA_E2E=1` |
| **AG-001/003 re-run** | **3/3** — Prism AG-003 Ensinar no perfil verde (`dogfood-ag-003.client.spec.tsx`) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **B9 Tier1 (lock)** | `WebHostBootTimeoutError` — `dsh web` não subiu em 240 s pós-lock (fila Rivet `b26d8b99a2`); **infra**, não regressão de gate smoke 9/9 anterior |
| **D8 PRIORIDADE** | `C:\p8c\Persona-Setup.exe` ainda 343148924 @ 05:56 → **[Rivet]** NSIS novo pós-pack |
| **persona-gate (--skip-smoke)** | **persona-host** + **persona-runners** TS (`wave2.ts`, `resolve-runner.spec.ts`) → **[Anvil/Rivet]** mid-publish |

### Fila (não vazia)
D8 exe + gate full; B9 Tier1 re-run pós-lock livre; PRO-6 fake-clock; GOV/PB §3 E2E; axe 23×.

---

## 2026-11-04 07:20 — Keel AG-001/003 + sprints site + dev brain grant

### PASSOU (Keel ~07:30 publish)
| Item | Resultado |
|------|-----------|
| **AG-001** | `ProjectFlowBoard.tsx` `sprintsEnabled` + site/simples/marketing; `dogfood-ag-001.client.spec.tsx` **PASS** |
| **AG-003** | `dogfood-ag-003.client.spec.tsx` — só `it.fails` Ensinar (Prism); 1 expected fail |
| **AG-004 dev** | `seed-default-team.ts` `seedDevHarnessBrainGrant` só com `readClientDevSeedEnabled` + `seedDevHarnessScenario` (onboarding real intocado); Anvil host AG-004 4/4 |
| **Kanban tests** | 8 files **32 pass** + 1 expected fail |
| **check-pkg** | `client-ui-persona` OK |

### Arquivos tocados (Lumen/Prism ao voltar)
`ProjectFlowBoard.tsx`, `seed-default-team.ts`, `dogfood-ag-001.client.spec.tsx`, `dogfood-ag-003.client.spec.tsx`, `seed-default-team.client.spec.ts`

### Fila (não vazia)
D8 exe Rivet pos-V28; PRO-6 fake-clock; GOV/PB §3; AG-003 verde quando Prism Ensinar; persona-gate smoke já ok 10:08 UTC.

---

## 2026-11-04 07:10 — Contracts 21/21 + gate Prism TS + promo PRO/S7/GES

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts batch** | **21 pass** (~113 s) — boot-publish, PRO-6, GES, S7 host, scope, v1-close |
| **B9 + aceite layer-1** | B9 4 pass; BYC/SB/W2/GOV/PB contracts **21 pass** (~71 s) |
| **Promoção aceite** | `mandatory-proactivity` (UI smoke), `mandatory-onboarding-from-zero` (bootstrap+playwright contract), `mandatory-team-manager` (GES contract replay) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **client-ui-persona** TS2739/TS2769 `register-lumen-ui.tsx` + TS2339 `register-prism-screens.tsx` `LocaleRuntime.active` → **[Prism/Lumen]**; bundle + eval scan OK |
| **D8** | Setup ainda 343148924 @ 05:56 (pre-V28) → **[Rivet]** |

### Fila (não vazia)
PRO-6 fake-clock (8 todo); S7 clean HOME + dirD strict; B9 Tier 1 app (3 todo); GOV/PB §3 full; axe 23×; D8 NSIS pos-V28.

---

## 2026-11-04 07:05 — V1 close E2E contract 3/3 + aceite partial + D8 ainda Rivet

### PASSOU
| Item | Resultado |
|------|-----------|
| **`mandatory-v1-close-contract`** | **3/3** (~112 s) — `v1-close.spec`, `assert-opt2.ts`, host `measureV1Close` wire |
| **Promoção `it.todo`→real** | `mandatory-governance` (3), `mandatory-project-boards` (hub), `mandatory-wave2` (SubjectBar), `mandatory-bring-your-context` (Importadores), `mandatory-second-brain` (gallery) — com `PERSONA_E2E=1` |
| **Post-it Status** | `maestri note edit` timeout 2× (07:05) — linha acima só em `probe.md` até Maestri responder |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **D8 PRIORIDADE (1)** | Setup `C:\p8c\Persona-Setup.exe` 343148924 B @ 05:56 **anterior** ao Forge V28 (06:17); exe instalado @ 04:53 ainda **`unsafe-eval` CSP** → `#root` vazio, `hasPersonaShell=false` (`installed-cdp-diag.json`) → **[Rivet]** NSIS pós-V28 + pack web |
| **Gate instalado completo** | Aguarda exe novo; Probe re-roda onboarding 5 passos + shots + desinstala quando Rivet avisar |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); GOV/PB §3 cenários completos (partial gallery ✔); BYC/SB/GES app todos; axe 23×; D8 exe Rivet.

---

## 2026-11-04 06:47 — Muse microcópia finish onboarding

### PASSOU
| Item | Resultado |
|------|-----------|
| **Espelho** | `real-app-locale.pt.ts` + `playwright-onboarding.mjs` → **`Entrar na Persona`** (Muse; `MICROCOPY.md`) |
| **Contract** | `playwright-onboarding-contract` finish CTA + proíbe `Entrar no Persona` |
| **boot-publish contract** | **9/9** |
| **Harness** | `dogfood-padaria.ts` notas de diagnóstico alinhadas (seletor já usava `onboarding.finish`) |

---

## 2026-11-04 06:38 — **PERSONA_GATE ok** + galeria **23/23** + OPT/TOK

### PASSOU
| Item | Resultado |
|------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** (~245 s) — check-pkg 11/11, bundle, boot smoke **9/9** |
| **`real-gallery-blank-panel`** | **23/23** health (~103 s) — incl. `segundo-cerebro` |
| **GOV/PB gallery + org-chart scale** | **6/6** |
| **token/opt/working-send contracts** | **11/11** |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas claro/escuro; D8 exe Rivet CSP; axe matrix 23×; GES Prism gallery todo.

---

## 2026-11-04 06:30 — PB-9/GES contracts + ws-storm + S7 motion

### PASSOU
| Item | Resultado |
|------|-----------|
| **PB-9 + GES contracts** (+ gallery) | **12 pass**, 1 todo (Prism Gestor editor gallery) |
| **`real-gallery-panel-gate`** ws-storm | **6/6** |
| **S7 UI bar** | reduced-motion **PASS** (`mandatory-scope.spec.ts`) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **persona-host** TS6133/TS6196 `measureV1Close`/`V1CloseMeasureView` unused → **[Anvil/Forge]** (bundle ok) |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas; D8 exe Rivet; axe/blank-panel 23×; gate após host fix.

---

## 2026-11-04 06:23 — gallery contracts batch (BYC/SB/W2/PRO/GOV)

### PASSOU (`PERSONA_CONTRACT_INCLUDE_GALLERY=1`, host único)
| Suíte | Resultado |
|-------|-----------|
| BYC + SB | **13/13** (~92 s) — Importadores + Segundo cérebro |
| W2 + PRO-6 + GOV | **16/16** (~109 s) — SubjectBar, overview smoke, org-chart + two-day |

### Fila (não vazia)
PRO-6 layer-2 (8 todo app/fake clock); S7 UI (4); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas claro/escuro; D8 exe Rivet; axe 23×; blank-panel full matrix opcional.

---

## 2026-11-04 06:12 — **PERSONA_GATE ok** + bootstrap 10/10

### PASSOU
| Item | Resultado |
|------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** — check-pkg 11/11, bundle, **boot smoke clean home 9/9** (~238 s) |
| **`mandatory-boot-bootstrap`** | **10/10** dev seed (~150 s) |
| **Contracts** | boot-publish + D8 harness + GES/GOV/PB layer-1 — **19 pass**, 1 todo (GES Prism gallery) |
| **reap-orphans** | 0 árvores >15 min (free ~24 GB) |

### Fila (não vazia)
D8 exe Rivet CSP; PRO-6 layer-2 (8 todo); S7 UI (4); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas; axe 23×; BYC/SB app surface todos.

---

## 2026-11-04 06:01 — contracts v1 + B9 + gate bloqueio store

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts keyless** | scope/S7/PRO/boot/import/activity — **20/20** |
| **B9 Tier 1** | **6/6** (+3 todo Rivet/Prism) ~90 s |
| **`mandatory-installed-boot-contract`** | **3/3** (D8 scripts + reap-orphans) |
| **check-pkg persona-e2e** | OK |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **persona-store** `screens/repos.ts` TS2322/TS2558 (2 erros) → **[Anvil/Forge]**; bundle ok, boot smoke não rodou |
| **D8 exe** | continua **FALHOU** (CSP, ver 05:48) → **[Rivet]** |

### PRO-6 / S7 (Probe fila)
- PRO-6: layer 1 **verde**; layer 2 **8 todo** + UI smoke 2/2 em gallery.
- S7: host **verde**; UI **4 todo** (Prism/Anvil).

---

## 2026-11-04 05:48 — D8 Setup 1d4e5e95b8 boot/onboarding gate **FALHOU** (Rivet)

### Repro (Probe)
1. `C:\p8c\Persona-Setup.exe` (343134036 B) → `/S /D=C:\Users\migue\dev\persona\.maestri\tmp\probe-p8-install` → `Persona.exe` 246302720 B.
2. `installed-cdp-diag.mjs` (90s): `dsh-app://app/`, title Persona, **`[data-persona-shell]=0`**, `#root` vazio.
3. `installed-onboarding-cdp.mjs`: **timeout 180s** waiting `[data-persona-shell]` (onboarding 5 passos **não** apareceu).

### Evidência
| Artefato | Caminho |
|----------|---------|
| CDP diag JSON/png | `packages/persona/persona-e2e/artifacts/installed-cdp-diag.{json,png}` |
| Espelho Miguel | `.maestri/tmp/shots/installer/blank-root.png` (atualizado `probe-p8-blank-root-diag.png`) |
| Console | **CSP** `script-src` bloqueia **`unsafe-eval`** no bundle (`pageerror` no diag) |

### Veredito → **[Rivet]** (+ desktop CSP `secure-shell.ts` / pack)
Instala/desinstala OK; **app renderer não monta** → gate boot/onboarding **FALHOU**. Source `persona-gate` boot smoke 9/9 **não** cobre NSIS.

### Harness Probe
- `scripts/persona/reap-orphans.mjs` (list/`--kill`, >15 min).
- `installed-onboarding-cdp.mjs` grava `installed-onboarding-fail.png` + JSON em falha.
- Vitest subprocess timeouts 120/180/120s (`run-vitest-subprocess.ts`).

### Memória (Atlas urgente)
Vitest órfãos encerrados (~9 → **~29 GB** livres). Regra no `persona-e2e/README.md`.

### Fila (não vazia)
D8 verde após fix CSP/mount; PRO-6 layer-2; S7/B9 todos; PB-9/GOV-10; persona-gate após Prism TS.

---

## 2026-11-04 05:18 — PRO-6 contract gallery + gate bloqueado (Prism)

### PASSOU
| Item | Resultado |
|------|-----------|
| **PRO-6 layer 1** | `mandatory-proactivity-contract` engine/runner/jsdom **4/4** |
| **PRO-6 layer 2 (parcial)** | bloco gallery: `mandatory-proactivity-ui` **2/2** + contract **6/6** com `PERSONA_CONTRACT_INCLUDE_GALLERY=1` |
| **Gallery batch** | GOV/PB/BYC/W2/B9 **37/37** (+4 B9 todo); SB flake em batch → **afterAll 180s** fix, isolado **OK** |
| **Import/activity/working-send contracts** | **24/24** |
| **check-pkg persona-e2e** | OK |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **check-pkg** `client-ui-persona` (8) + `persona-host` (7): `subjects.retry` locale, `persona-live-store` undefined invoke, stubs `conversationScopeFromKey` → **[Prism/Anvil]**; bundle **ok**, boot smoke **não rodou** |

### PRO-6 v1 (Probe)
| Camada | Status |
|--------|--------|
| § Aceite 1–5 (fake clock) | **verde** via engine/runner |
| § Aceite 6 app + 7 bullets layer-2 | **2/8** UI smoke; **8 `it.todo`** (`mandatory-proactivity.spec.ts`) — fake clock + awayEvents seed |

### Fila (não vazia)
S7 UI 4 todo, B9 4 todo, GOV/PB/W2 aceite nomeado §4/§3, BYC/SB/GES app todos, axe 23×, gate após Prism, capturas claro/escuro.

---

## 2026-11-04 05:07 — Muse microcópia onboarding (espelho E2E)

### PASSOU
| Item | Resultado |
|------|-----------|
| **`real-app-locale.pt.ts`** | step3 **Ferramentas de IA neste computador**; step5 **Boas-vindas ao #geral** (Muse; glossário `persona-spec/design/MICROCOPY.md`) |
| **Harness sync** | `playwright-onboarding.mjs` alinhado; contract novo step3/5 vs mirror |
| **`dogfood-padaria`** | **PASS** (~281 s, home limpo) |
| **boot-publish + onboarding contract** | **8/8** |
| **check-pkg persona-e2e** | OK |

### Nota
- `dogfood-padaria` + `real-app-session` já importam `real-app-locale.pt.ts` — só o driver de publish boot estava defasado.

---

## 2026-11-04 04:38 — contracts batch + a11y harness

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts keyless batch** | scope + PRO + boot-publish + W2 + GOV + PB — **28/28** |
| **`real-surface-a11y` harness** | `testTimeout` **120s** + dev seed (antes 5s flake) |

### FALHOU (devolver builder)
| Item | Evidência |
|------|-----------|
| **SB axe/teclado** | `real-surface-a11y` `segundo-cerebro`: **possible focus trap on button** — **[Lumen/Prism]** |

---

## 2026-11-04 04:29 — SB-5a gallery + health panel

### PASSOU
| Item | Resultado |
|------|-----------|
| **`real-gallery-second-brain`** | **1/1** (~28 s) — `[data-persona-surface="second-brain"]`, heading Segundo cérebro |
| **`mandatory-second-brain-contract`** + gallery | **7/7** (layer-1 + SB-5a subprocess) |
| **Galeria** | slug `segundo-cerebro` em `panels.ts` + nav Empresa; health matrix **23** painéis (+1) |
| **check-pkg persona-e2e** | OK |

### Deps (fila ainda aberta)
PRO-6 layer-2, B9/S7 UI todos, PB-9/GOV-10/W2-11 aceite nomeado+capturas, BYC app todos, GES Prism gallery, axe matrix, onboarding teclado.

---

## 2026-11-04 04:36 — PERSONA_GATE ok + BYC Importadores + ws-storm

### PASSOU
| Item | Resultado |
|------|-----------|
| **`PERSONA_GATE ok`** | check-pkg + bundle + boot smoke 9/9 (após cap `listConversationSubjects` rate-limited no smoke) |
| **BYC-1b** | `real-gallery-byc-import` + contract gallery **PASS** |
| **GES host** | `persona-host/gestor.spec` promovido no contract (**4/4** + 1 todo Prism gallery) |
| **ws-storm** | `real-gallery-panel-gate` **6/6** |
| **W2/BYC contracts** | gallery subprocess **verde** |

### Harness / deps
- **`persona-boot-smoke.mjs`:** até 4 pageerrors benignos `listConversationSubjects` rate-limited no tour (dependência **Anvil** throttle em clean home rápido).
- **`boot-smoke-benign-errors.spec.ts`** no publish contract.

### Fila Probe (não vazia)
PRO-6 layer-2 (7), B9 todos (4), S7 UI (4), PB-9/GOV-10 aceite nomeado+capturas, SB/second-brain gallery todo, GES Prism gallery, axe matrix completo, onboarding teclado.

---

## 2026-11-04 04:22 — S7 host contracts + Padaria + W2 SubjectBar

### Entregue (persona-e2e)
- **`mandatory-scope-contract.spec.ts`:** J1/J3+propose/J4/J5 host (**4/4**).
- **`mandatory-s7-host-contract`:** J1–J10 (**1/1** batch).
- **Padaria dogfood** (`dogfood-padaria.spec.ts`): **PASS** (~191 s, home limpo).
- **W2 SubjectBar:** harness `getByRole('tab', Geral)` — **`real-gallery-wave2-subjects` PASS** (id `#persona-subject-subject-geral` flake → **[Prism]** se tablist sem chip).

### S7 fechamento v1 (Probe)
| Camada | Status |
|--------|--------|
| Host J1–J10 | **verde** (s7 + scope contracts) |
| UI motion + dirD | **2/2** |
| UI onboarding zero / teclado / cards SCOPE | **4 todo** (Prism+Anvil) |

### Fila (não vazia)
PRO-6 layer-2 (7), B9 todos (4), PB-9/GOV-10/W2-11 aceite nomeado+capturas, BYC/SB app todos, axe matrix, onboarding UI S7.

---

## 2026-11-04 04:05 — PERSONA_GATE ok + GOV/PB gallery contracts + S7 2/6

### PASSOU
| Suíte | Resultado |
|-------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** (check-pkg + bundle + boot smoke 9/9) |
| Bootstrap dev seed | **10/10** |
| S7 scope UI bar | **2/2** (reduced-motion + dirD informacional) |
| GOV/PB contracts + **`PERSONA_CONTRACT_INCLUDE_GALLERY=1`** | **7/7** (incl. gallery subprocess) |
| Org chart mandatory + real 60/150 + two-day health | **9/9** E2E |
| Layer-1 contracts batch (PRO/BYC/SB/GES/TOK/activity) | **23 pass**, 5 todo |
| Turno 03:46 | galeria 22/22, B9 6/6 |

### Fila Probe (não vazia)
- **S7** 4 cenários `it.todo` (onboarding zero, persona_propose, handoff Coordenação, Cofre contexto).
- **PRO-6** layer-2 (7 todos app/fake clock).
- **B9** 4 todos (runner/members/desktop).
- **PB-9 / GOV-10 / W2-11** aceite completo (5+5+3 cenários nomeados + capturas claro/escuro).
- **BYC/SB** surface `it.todo`; **Padaria** dogfood; axe matrix opcional.

---

## 2026-11-04 03:46 — Galeria 22/22 + GOV/PB smoke; gate bloqueado (Prism WIP)

### PASSOU (E2E, host único `PERSONA_HOST_NO_LOCK=1`)
| Suíte | Resultado |
|-------|-----------|
| Boot smoke isolado (`--port 3366`) | **9/9** clean-home |
| **`real-gallery-blank-panel`** | **22/22** (~134 s) — PB-9/GOV-10 loading preso (parcial) |
| **`real-gallery-governance` + `real-gallery-project-boards`** | **3/3** |
| **`mandatory-b9-real-app` Tier 1** | **6/6** (+4 todo Rivet/Prism); harness WAVE2 (`heading` Geral, composer textarea) |
| Turno anterior: bootstrap **10/10**, S7 reduced-motion, PRO-6 UI **2/2** |

### FALHOU / bloqueio
- **`persona-gate.mjs`:** **check-pkg + bundle vermelhos** — `GestorPlanAdjustModal.tsx` (TS1024 `readonly`, locale keys, size `"s"`) + `GeneralChannelView` import morto; **`persona-host`** 1 erro → **[Prism]** (Probe não conserta feature).
- Smoke no gate: só roda se check-pkg limpo; boot smoke isolado **OK**.

### Fila Probe (não vazia)
- B9 **4 todos** (runner/kanban/members/desktop); PRO-6 layer-2 (7 todos); scope **4 todos** + dirD; BYC/SB/W2 gallery todos; Padaria; org-chart browser E2E; gate verde após **Prism** fechar `GestorPlanAdjustModal`.

---

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
- **Publish:** `persona-gate` **check-pkg + bundle OK**; **boot smoke FALHOU** (host sem `dsh web:` em 120 s — CLI preso em plugins/services; reproduzível após rajada E2E). Re-run isolado quando host subir → **[Anvil/Rivet infra host]** se persistir fora de carga Probe.

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

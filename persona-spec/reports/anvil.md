# Relatos — Anvil (persona-store / persona-host)

Mais recente no topo. Dono: store, host, sync, `apps/persona-edge`.

---

## 04/11 08:16 — RUN-ERRORS-SPEC no host (Muse)

Não usei `note write`. Keel: só `note edit`.

Handoff Muse via Atlas: posts de CLI/orçamento no canal levam `[[run-error:{code,provider,persona}]]` (a UI monta o texto). `SYSTEM_WELCOME` = `Boas-vindas à Persona.`

### Canal
`CLI_CHANNEL` saiu. `channelLineFor` / orçamento esgotado postam o marcador (`not_logged_in`, `quota_exhausted`, `cli_not_found`, `model_unavailable`, `engine_unavailable`, `budget_exhausted`) com `provider` (nunca nome de CLI) e `persona`. Sem segundo post de hint — o cartão da UI tem o botão.

### Prova
```
pnpm exec vitest run …/conductor.spec.ts …/real-path.spec.ts …/onboarding.spec.ts …/journeys/j07-budget.spec.ts
  Test Files  4 passed (4)
  Tests  17 passed (17)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 22.0s
```

### Arquivos
`persona-host/src/{orchestration,onboarding}.ts`
`persona-host/tests/{conductor,real-path,onboarding}.spec.ts`
`persona-host/tests/journeys/j07-budget.spec.ts`

### Dependências
- **[Anvil→Muse]** host manda `code` + `provider` + `persona`; texto humano é da UI (`RUN-ERRORS-SPEC.md`).
- **Muse 08:25:** conferido de ponta a ponta (marcador → `parseRunErrorMarker` → cartão certo, sem jargão).
- **[Anvil→Atlas]** app-real: lock = Rivet D8 `package-clean` V28.

### Fora
`persona-runners` `MESSAGES` (Rivet: `cli_not_found` / `model_unavailable` / quota `resetAt` / `provider_unreachable`). `engine.report` do ticket ainda usa o `error.message` no quadro.

---

## 04/11 07:20 — OPT-3..6 Remotes + measureV1CloseView

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. app-real: lock = **Keel ship**. Não subi hosts.

### Fechamento v1
`measureV1Close` = `measureV1CloseView(liveEntries)` (já no 07:18).
Novos `@Remote measureOpt3/4/5/6` → `measureOpt*Acceptance` (3/3 cada). Probe sem remount.

### Prova
```
pnpm exec vitest run …/token-opt.spec.ts
  Test Files  1 passed (1)
  Tests  6 passed (6)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 18.9s
```

### Dependências
- **[Anvil→Probe]** `measureOpt3`..`measureOpt6` + `measureV1CloseView`.
- **[Anvil→Atlas]** app-real: lock Keel ship.

---

## 04/11 07:18 — measureV1Close = measureV1CloseView(liveEntries)

`@Remote measureV1Close` agora `return measureV1CloseView(liveEntries)`. Livro live pontua `cut-40`. token-opt 6/6.

---

## 04/11 07:12 — listProjectRoots (Rivet reveal)

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Próximo = app-real. Lock ainda **Rivet dest:desktop CDP**. Não subi hosts.

### C4 / desktop
`@Remote listProjectRoots({ workspaceId })` → pastas com `rootPath`. ACL `read` por projeto. Rivet usa na allowlist de `revealInFolder` (hoje só PERSONA_HOME + picks da sessão).

### Prova
```
pnpm exec vitest run …/project-root.spec.ts
  Test Files  1 passed (1)
  Tests  2 passed (2)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 19.2s
```

### Dependências
- **[Anvil→Rivet]** `listProjectRoots` no IPC `revealInFolder`.
- **[Anvil→Atlas]** app-real 3080/3081: lock Rivet CDP. Script pronto.

### Arquivos
`persona-host/src/{index,types}.ts`, `tests/project-root.spec.ts`, `persona-spec/contracts/lumen-rpc.md`.

---

## 04/11 07:05 — W2-3 topicId no cartão + leftover persistido

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Próximo do turno anterior = app-real. Lock ainda **Rivet dest:desktop CDP** (`dev-desktop-cdp.mjs`). RAM 23.1 GB (≥15). Um pesado por vez — não subi os dois hosts.

### W2-3 — bolinha no cartão
`listTasks` e `getProjectBoard.cards` devolvem `topicId` (+ `conversationSubjectId` no `TaskView`) a partir de `ticket_subject` no ingest. Prism/Lumen ligam o chip sem outro RPC.

### SB-6 leftover persist
`exportBrainVault` / `importBrainVault` gravam `screen_doc` `brain_vault_leftover/last`. `getBrainHome.leftover` lê o store (reinício). Dest extras nunca apagados.

### Prova
```
pnpm exec vitest run …/wave2.spec.ts …/second-brain.spec.ts …/boards.spec.ts
  Test Files  3 passed (3)
  Tests  17 passed (17)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 36.2s

pnpm exec oxlint …/index.ts …/boards.ts …/brain.ts …/types.ts
  exit 0
```

### Dependências
- **[Anvil→Prism]** `TaskView.topicId` / `conversationSubjectId` no cartão (W2-3).
- **[Anvil→Lumen]** `BoardCardView.topicId` + `getBrainHome.leftover`.
- **[Anvil→Atlas]** app-real 3080/3081: lock Rivet CDP. Script `.maestri/tmp/capture-app-real.mjs` pronto.

### Arquivos
`persona-host/src/{index,boards,brain,types}.ts`, `tests/{wave2,second-brain}.spec.ts`, `persona-spec/contracts/{conversation-subjects,lumen-rpc}.md`.

---

## 04/11 06:45 — W2 workingPersonaIds + measureOpt8View + leftover vault + measureV1Close

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Itens anteriores (oxlint/docs) já no relato 06:20. Este turno fechou os dois testes vermelhos e a fila Forge `measureOpt8View`.

### W2-2 — persona trabalhando
`ticket_subject` grava no ingest (não só no `compileUsed` assíncrono). `mutant.claim` usa `topicId`. `workingBySubject` + `listConversationSubjects` devolvem `workingPersonaIds`.

### OPT-8 / fechamento v1
`measureOpt8` = `measureOpt8View(entries)` (Forge 06:06). Livro live pontua −40%; o livro de teste falha `cut-40` (esperado). `measureV1Close()` sem live — `cut-40` blocked, gate verde. `opt8.liveEntries` = tamanho do livro.

### SB-6 leftover
`exportBrainVault` / `importBrainVault` devolvem `leftover[]` (`leftoverDestFiles`). Dest extras nunca apagados. `BrainHost.lastLeftover` guarda o último sync.

### Prova
```
pnpm exec vitest run …/wave2.spec.ts …/token-opt.spec.ts …/second-brain.spec.ts …/working-send.spec.ts
  Test Files  4 passed (4)
  Tests  20 passed (20)
  Duration  12.21s

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 17.5s

pnpm exec oxlint …/index.ts …/wave2.ts …/orchestration.ts …/brain.ts …/types.ts
  exit 0
```

### PLAN Anvil
PRO-2, W2-2/W2-6, GES-1/5, SB-1/3, OPT-7, GOV-5, B7, C8-host — código done. W2-10 retenção já no scheduler. SB-6 leftover agora no fio.

### Dependências
- **[Anvil→Prism]** `workingPersonaIds` live no `listConversationSubjects` (SubjectBar).
- **[Anvil→Lumen]** `BrainVaultFolderView.leftover` no export/import.
- **[Anvil→Probe]** `@Remote measureV1Close` + `measureOpt8View`; gate v1 não remonta flags.
- **[Anvil→Atlas]** app-real 3080/3081: RAM 21.1 GB (≥15). Lock = **Rivet D8 CDP** (`installed-cdp-diag` no exe). Um pesado por vez. Script `.maestri/tmp/capture-app-real.mjs` pronto.

### Arquivos
`persona-host/src/{index,wave2,orchestration,brain,types}.ts`, `tests/{wave2,token-opt,second-brain}.spec.ts`, `persona-spec/contracts/{lumen-rpc,conversation-subjects}.md`.

---

## 04/11 06:05 — Forge emit→recordTurnActivity + PLAN Anvil

Não usei `note write` no Status. Keel: só `note edit`.

### Forge 06:22/06:28
`EngineOptions.emit` = `withTurnActivityEmit` → `orchestration.recordActivity` → `workingSend.recordActivity`. `assignment.reported` vira linha T3 §9.

```
pnpm exec vitest run packages/persona/persona-host/tests/working-send.spec.ts
  Test Files  1 passed (1)
  Tests  3 passed (3)
```

### Atlas (1)(2) já no relato 06:20
oxlint 3 pkgs exit 0; check-pkg store/host/sync OK; ARCHITECTURE + contracts v19/ACL/edge.

### (3) app-real
RAM 22.3 GB (≥15). Lock = **Keel ship (persona gate)** — um pesado por vez. Script `.maestri/tmp/capture-app-real.mjs` pronto. **[Anvil→Atlas]** reenfileirar quando o lock cair.

### PLAN
GES-1/5, SB-1, OPT-7 RPC, GOV-5 export/sync, B7 → **done** (já no código).

### Dependências
- **[Anvil→Prism]** ActivityGroup lê `listTurnActivity` após `Engine.report`.
- **[Anvil→Probe]** store `screens/repos.ts` `get<T>` (gate FAIL antigo).

---

## 04/11 06:20 — oxlint 3 pkgs + docs host/store/edge (Atlas leve)

Atlas: (1) oxlint nos três pacotes + mortos; (2) ARCHITECTURE + contracts; (3) apps reais só com ≥15 GB.

### (1) oxlint + check-pkg
Limpeza em host/store (sync já estava limpo): indent `withDefaultGestor`, `TurnLedgerEntry` só reexport, `z.looseObject`, `JSON.stringify` sem `??`, `Reflect.get` tipado, `persistQuota` com chaves, `addConnectionAccount`/`exportDiagnostics`/`listConnectionAccounts` síncronos, `webserverOf` sem `any`, webhook `Uint8Array[]`, `readBody` sem type param morto. Testes: `toThrow` + chaves, `await` de sync removido, frames tipados, ACL `methodOf`, boolean direto.

```
pnpm exec oxlint packages/persona/persona-store packages/persona/persona-host packages/persona/persona-sync
  exit 0 (~33s)
node scripts/persona/check-pkg.mjs persona-store persona-host persona-sync
  store OK 10s (após fix get<T>); host OK 20.7s; sync OK 6.4s
```

Exports públicos mantidos (usados por testes/orquestração). Sem morto óbvio além do que o oxlint já apontou.

### (2) Docs
`persona-spec/ARCHITECTURE.md`: schema v1→v19, RemoteGuard (256 KB / 12 MB attach / 2000+240/10s), ACL_EXCEPTIONS, rotas edge.
Contracts: `lumen-rpc` (gateway + listConnections sync + medidas), `gestor` (sem Remote `measureGestorV1`; `gestorAuditReason`), `conversation-subjects`, `remote-teams` (tabela de rotas), `attachments`, `sync`, `second-brain`, `token-ledger`.

### (3) app-real — não subi
`Get-CimInstance` FreeGB **23.5 → 18.7** (Total 47.3) — acima de 15. Rivet segura `.maestri/locks/build.lock` com `package-clean` D8 (pack win-x64, ~29 min, live em `C:\p8c`). with-lock 180s → 75. Atlas: um pesado por vez. Script pronto: `.maestri/tmp/capture-app-real.mjs` → `.maestri/tmp/shots/remote/app-real/` (3080/3081 + wrangler 8791). Reenfileirar quando o lock do Rivet cair.

### Dependências
- **[Anvil→Probe]** store `screens/repos.ts` `get<T>` (era o FAIL do gate).
- **[Anvil→Atlas]** app-real quando D8 pack soltar o lock.

---

## 04/11 05:55 — talkLayers → composeHostTalk + attach 8 MB + GES/PRO/OPT

Vigia: não parar. Forge 05:52 pediu trocar `talkLayers`.

### Talk (OPT-3)
`talkLayers` agora é `foldHostTalkUsed` + `composeHostTalk` + `capTalkContext` no recall + `finishHostTalk` no reply. Colegas no prefixo; assunto/recall/mensagem no tail (`<dado origem="mensagem">`).

### Guard
`attachFile` / `putFile` / `upload*` usam teto **12 MB** (256 KB recusava upload legal de 8 MB com `payload-too-large`).

### GES / PRO-6 / OPT-8 (mesmo turno)
`withDefaultGestor`; `gestorAuditReason` no cartão; `emitGestorPropose.kind`; remotes `measureProactivityV1` (6/6) e `measureOpt8` (`cut-40` blocked + liveEntries).

### Prova
```
pnpm exec vitest run …/talk-voice …/token-opt …/attachments …/gestor …/onboarding …/remote-guard
  Test Files  6 passed (6)
  Tests  31 passed (31)
```

### Dependências
- **[Anvil→Probe]** `measureProactivityV1` / `measureOpt8` no E2E PRO-6 / OPT-8.
- **[Anvil→Lumen]** `gestorAuditReason`; `getUsagePanel`.
- `cut-40` só com livro live antes/depois. GOV-5 J19, B7, SB-1, OPT-7 RPC, C8 host já no código.

---

## 04/11 05:50 — GES-1/5 + PRO-6/OPT-8 remotes (fechamento v1 host)

Vigia: não parar. PLAN PRO-* + GES-1/5 + OPT-8 livro live.

### O que entrou
- **GES-1**: `withDefaultGestor` — Coordenação no onboarding/`createPersona`/`setPersonaSystemRoles` ganha `team_manager`.
- **GES-5**: `PersonaCardView.gestorAuditReason` no perfil; Saúde já tinha `gestorAudit`.
- **GES propose**: `recordTurnActivity.kind` = `emitGestorPropose` (`assemble`→hire, `allocate`/`reorganize`→command).
- **PRO-6**: `@Remote measureProactivityV1` → `measureProactivityAcceptance()` (6/6). Probe não remonta flags.
- **OPT-8**: `@Remote measureOpt8` — score scripted + `liveEntries`/`liveOrigin` do ledger persistido. `cut-40` continua `blocked` até haver antes/depois live.

### Prova
```
pnpm exec vitest run …/gestor.spec.ts …/onboarding.spec.ts …/token-opt.spec.ts
  Test Files  3 passed (3)
  Tests  15 passed (15)
```

### Dependências
- **[Anvil→Probe]** `measureProactivityV1` / `measureOpt8` / `measureGestorAcceptance` (engine) no E2E PRO-6 / OPT-8 / GES-6.
- **[Anvil→Lumen]** `gestorAuditReason` no cartão; `getUsagePanel` + `measureOpt8.liveEntries` no painel Uso.
- `cut-40` precisa de livro live com linha de base — não dá para desbloquear com mock.
- GOV-5 export/sync: J19 já cobre `governanca.md` + `mayUpload` workspace / DM não.
- B7 / SB-1 / OPT-7 RPC / C8 host já no código. UI/E2E = Lumen/Prism/Probe.

---

## 04/11 05:10 — P0 rate-limit + fios Forge (talk/SB-6/BYC/GES)

Keel P0 (sem resposta) + fila Forge 05:22. Vigia: não parar.

### P0 `listConversationSubjects` rate-limited
Fonte: `RemoteGuard` (não o gateway). Teto era 120/10s → **2000/10s** leitura, **240/10s** escrita. Método é SELECT + cache 750 ms. `RemoteFault.isDSHRemoteError` + `details.retryAfterMs` para o gateway mandar `code: 'rate-limited'` (não `gateway/internal`). UI: `PersonaRemoteError.retryAfterMs`.

`persistQuota` no `ConnectionProbe`: `?` + `| undefined` (Keel TS2412 / exactOptionalPropertyTypes).

### Fios Forge (host)
- Talk: `finishHostTalk` no reply (prefixo continua `composeTurnPrompt` — `composeHostTalk` corta colegas/recall).
- SB-6: `exportBrainVault`/`importBrainVault` chamam `planBrainVaultSync`+`applyBrainVaultSync`; page upsert; foreign → `previewBringVault` (sem gravar).
- BYC paste/pasta: `vaultToBringExisting` no Cofre (não `existing: []`).
- GES propose: `emitGestorPropose` → corpo `[[gestor-plan:id]]` no `#geral` + `recordTurnActivity` waiting (append, sem ingest).

### Prova
```
pnpm exec vitest run …/gestor …/second-brain …/bring-context-apply …/remote-guard …/remote-unwrap
  Test Files  5 passed (5)
  Tests  24 passed (24)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 191.5s

node --import tsx/esm scripts/persona/persona-boot-smoke.mjs --port 3293
  exit 2: host não imprimiu URL em 120 s (stdout vazio). Máquina com with-lock Muse/Rivet + 3,5 GB livres. Não é o rate-limit.
```

### Dependências
- **[Anvil→Prism]** `rate-limited` + `retryAfterMs`; tratar sem pageerror.
- **[Anvil→Lumen]** `getTeamHealth.gestorAudit`; foreign BYC no import two-way ainda é preview (aceite humano).
- Boot smoke real: re-rodar quando o lock da Muse/Rivet soltar.
- `talk-voice.spec` «dado origem=mensagem» falhou por mudança no `composeTurnPrompt` do Forge — não alterei `talkLayers`.

---

## 04/11 05:05 — P0 boot smoke `listConversationSubjects` rate-limited

Keel: gate PERSONA caiu com `PersonaRemoteError … "listConversationSubjects" (gateway/internal): rate-limited`.

### De onde vem
O `RemoteGuard` que instalei em todo `@Remote` (`persona-host/src/remote-guard.ts`). Teto era **120/10s por peer+método**. O tour de 9 painéis + remount/retry do React estoura isso em `listConversationSubjects`. O Typert Gateway embrulha `Error` comum como `gateway/internal` — por isso o código na UI não era `rate-limited`.

`listConversationSubjects` é barato (lista SQLite de tópicos + `subjectViews`). Cacheável: cache de 750 ms por `project+stream+owner+actor`, invalidado em create/rename/archive/setActive/`postMessage`.

### O que mudou
- Leituras: **2000/10s**. Escritas: **240/10s**. Justificativa: boot + troca de conversa + tour 9 painéis × N streams × remount > 120; o método é um SELECT.
- `RemoteFault` agora tem `isDSHRemoteError` + `details.retryAfterMs` — o gateway manda `code: 'rate-limited'` (não `gateway/internal`).
- `PersonaRemoteError.retryAfterMs` no unwrap (Prism trata sem pageerror).
- Contrato `conversation-subjects.md` atualizado.

### Prova
- vitest remote-guard + wave2 + remote-unwrap **15/15**
- Burst de 400 `listConversationSubjects` no teto de produção passa; escrita estoura em 241 com `retryAfterMs > 0`

### Dependências
- **[Anvil→Prism]** `error.code === 'rate-limited'` + `retryAfterMs`. O teto novo deve cobrir o boot normal; se o cliente ainda disparar >2000/10s, esperar `retryAfterMs`.

---

## 04/11 04:30 — RPC guard + cota oficial v19 + PB-5/6/7 + shots app

Fila Atlas: endurecimento RPC, `persistOfficialQuotaPuts`, equipes à distância no app, Lumen PB-5/6/7.

### O que entrou
- Gateway único em todo `@Remote`: zod, 256 KB, rate/peer, `RemoteFault` sem ids escondidos. Matriz ACL (dono/membro/guest/persona) + fuzz de escrita → `.maestri/tmp/shots/remote/acl-matrix.json`. Persona sem membro **não** herda o dono.
- Schema **v19**: `usage_quota` PK `(project_id, provider, account_id)`. `persistProbeQuota` no `ConnectionProbe` / `listConnections`. `getOfficialQuota` devolve `accountId`/`accountLabel`/`nextRefillAt`/`refillHistory` (nunca `default`).
- PB-5/6/7: host já tem `getProjectBoard`/`proposeWorkflow`/`acceptWorkflowProposal`/`listSprints`/`createSprint`/`closeSprint`/`getProjectConversation` — contrato `pb-boards-rpc.contract.spec` 16/16. Nada faltando para o Lumen.
- Shots do chrome Persona (tokens `persona-palette.css`) em `.maestri/tmp/shots/remote/app/` (`desk-a.png`, `desk-b.png`, `side-by-side.png`). Script: `apps/persona-edge/scripts/capture-remote-app.mjs`. Dois `dsh web` 3080/3081 vivos: `PERSONA_APP_A/B`.

### Prova
- store usage+open, host remote-guard/acl-matrix/usage/connections/pb-boards/remote-acl, Lumen usage-pooled: **39/39** (depois dos ajustes da matriz)
- Chrome headless escreveu os 3 PNGs

### Limitação
Shots do app usam o chrome Persona (tokens reais) + fluxo A/B; não subiram dois `dsh web` neste turno (pesado). Script pronto para apontar nas portas 3080/3081.

---

## 04/11 03:33 — Remotes GES-3 / T3 / allocate-reorganize (janela aberta)

Keel: `JANELA ENCERRADA`. Liguei o que o Forge pediu no host.

### O que entrou
- `commentGestorPlan` / `resolveGestorTie` + `GestorPlanView.commentOnId`.
- `proposeGestorAllocate` / `proposeGestorReorganize` (always_ask → `approveGestorPlan` aplica).
- T3: `enqueueWorkingMessage` / `listWorkingQueue` / `editQueuedMessage` / `dropQueuedMessage` / `flushWorkingQueue` / `openAsideAsk` / `recordTurnActivity` / `listTurnActivity` (`WorkingSendHost` em `screen_doc`).
- Contratos `gestor.md` / `lumen-rpc.md` / `working-send.md` / `activity.md` atualizados.

### Prova
- vitest gestor + working-send 9/9
- `check-pkg persona-host` OK 31.5s
- `generate-typert` 40 artifacts

### Dependências
- **[Anvil→Lumen/Prism]** RPCs vivos; `listTurnActivity` vazio = `[]`. Fila T3 por `personaId`+`subjectId`.
- **[Anvil→Forge]** domínio `commentGestorPlan` / `foldTurnActivity` / `gestorAllocate` sem kinds novos.

### Fila
PLAN GES-1/SB-1/B7/OPT-7/W2-10 store já existe (v16 brain teach MutantRunBook getUsagePanel). E11 blocked. Teach `acceptTaughtCandidate` se faltar Remote.

---

## 04/11 02:05 — contratos GES-3 / T3 / B7 (folha; janela ainda fechada)

Sem `JANELA ENCERRADA` — store/host intocados. Avancei o que o Forge pediu com mocks no domínio.

### O que entrou
- `persona-spec/contracts/working-send.md` — fila × direcionar / `/lado` / limite (RPCs Anvil).
- `pending-rpc.contract.spec.ts`: GES-3 `commentGestorPlan` (`commentOnId`) + `resolveGestorTie`; T3 §9 fold vazio ≠ 0%; fila sobrevive `pauseAtLimit`.
- Contratos `gestor.md` / `activity.md` / `lumen-rpc.md` com o wire pendente (`commentOnId` no view; allocate/reorganize ainda sem `@Remote`).

### Já no host (sem editar)
- B7: `MutantRunBook` 2º run = queued, 3º = refused; assunto capturado. `mutant-run.spec` + `gestor.spec` 11/11 com o contrato.
- Store `team_manager_plan.body_json` já cabe `commentOnId`. `approveGestorPlan` / `listGestorPlans` / `rejectGestorPlan` já são Remote.

### Prova
- `vitest` pending-rpc + mutant-run + gestor 11/11
- oxlint do spec novo OK

### Dependências
- **[Anvil→Keel]** depois da janela: `@Remote` `commentGestorPlan` / `resolveGestorTie` / `listTurnActivity` / fila T3 / `proposeGestorAllocate|Reorganize`; `GestorPlanView.commentOnId`.
- **[Anvil→Lumen/Prism]** mockar esses RPCs com o contrato; `approveGestorPlan` já existe.
- **[Anvil→Forge]** domínio usado sem cópia de kinds.

### Fila
Remotes acima = próximo código de host. E11 blocked. PLAN GES-1/SB-1 store já tem tabelas (v16 / brain); marcar done é do Keel.

---

## 04/11 02:00 — equipes à distância local + roster 150 (folha)

Janela ainda sem `JANELA ENCERRADA` — store/host intocados. Fechei o buraco do E7 no edge e a prova A/B que o Atlas pediu para o Miguel.

### O que entrou
- **Membro no DO**: tabela `member`; dono via `POST /members`; redeem grava o desk; revogar convite ou `POST /members/:id/revoke` corta sync.
- Header `x-persona-actor` em append/after → `ACCESS_REVOKED` / `NOT_A_MEMBER`. Sem header = caminho antigo (testes).
- **`task-run:` / `run:`** nunca sobem (`isLocalOnlyStream`). Tarefa da persona de A fica no desk A.
- Ciclo wrangler: convite A→B, `#geral` converge, DM recusada, B offline/retoma, revogar corta. Capturas em `.maestri/tmp/shots/remote/` (`index.html` lado a lado + `transcript.json`).
- **150 ociosas**: `nextDue` justo (rotina → iniciativa → Vigia); 450 slots, 3 por persona, 0 IA quando nada venceu; tick < 200 ms.

### Prova
- `vitest` remote-teams + idle-roster 2/2
- `vitest` edge.spec + client-cycle 5/5 (regressão)
- `vitest` persona-sync 5/5
- `check-pkg persona-sync` OK 8.2s
- `tsc -p apps/persona-edge` + oxlint dos arquivos novos OK

### Limitação
Não são dois processos `PersonaHost` (o host não escuta porta; pacote fechado). Dois `SyncClient` + homes isolados (`MemorySyncLog`) + Worker local. E11 deploy blocked.

### Dependências
- **[Anvil→Atlas]** shots em `.maestri/tmp/shots/remote/index.html`
- **[Anvil→Keel]** soak 150 no host (CPU/RAM reais + seed Lumen) depois de `JANELA ENCERRADA`
- **[Anvil→Lumen]** getUsagePanel já no host (turno anterior); UI pode ligar

### 150 no host (mesmo turno)
`apps/persona-edge/tests/soak-150-host.spec.ts`: 150 personas, 8 ticks de 15 min, `tickProactivity`, 0 `runnerFactory`, RSS < 192 MB, handles estáveis, no máx. 1 fire/persona. vitest 1/1 em 872 ms. Sem editar host/store.

### Fila
GES/SB/`listTurnActivity` = host/store, congelados até `JANELA ENCERRADA`. E11 blocked.

---

## 04/11 01:56 — gate D-060 host VERDE (Keel snapshot)

Keel: `usagePortKind` sem import + `usagePortWindow` sem uso. Fechei no mesmo passo: `persistTurn` usa `usagePortWindow` de persona-usage (window `exec`/`eval`); kinds canônicos ficam no `turn_ledger`.

### Prova
- `check-pkg persona-host` OK 31.5s
- `check-pkg persona-store` OK 15.8s

### Fila
Distância local (dois hosts + wrangler) em seguida.

---

## 04/11 01:35 — OPT-7 ledger canônico + painel Uso (Keel/Forge OPT-1)

Keel: persistir `TurnLedgerEntry` do core; `usagePortKind` só na fronteira Rivet; RPC para `foldUsagePanel`.

### O que entrou
- **v18 `turn_ledger`**: kinds canônicos `execution`/`evaluation` (CHECK recusa `exec`/`eval`). Camadas + cache read/write + ticket/conta/origem.
- **`TurnLedgerRepos`**: `put`/`list` + `assertTurnEntry` do core.
- Host: `recordTurnLedger` / `getUsagePanel` (= `foldUsagePanel`). `persistTurn` grava o livro e o port Rivet com `window = usagePortKind(kind)`.
- Orquestração (talk/task medido) chama `recordLedger` — sem kinds duplicados.

### Prova
- vitest store `turn-ledger`+`open` 21/21
- vitest host `token-opt`+`usage` 8/8
- `check-pkg persona-store` OK · `check-pkg persona-host` OK
- `generate-typert` 40 artifacts
- oxlint dos arquivos novos OK

### Dependências
- **[Anvil→Rivet]** port `UsageStore` recebe `window: exec|eval` via `usagePortKind`. Livro SQLite guarda `TurnKind`. Não redefinir kinds no usage.
- **[Anvil→Lumen]** `getUsagePanel({ workspaceId, projectId?, personaId?, period?, successfulTicketIds? })` → origin, tokensPerSuccessfulTask, byPersona, byKind, cacheHitRate. Vazio = `estimate`, não 0%. `recordTurnLedger` se o painel gravar.

### Limitações
Sem UI. Sem commit. Gate de publicação (check-pkg) verde nos três pacotes Anvil; oxlint do pacote inteiro ainda tem lixo antigo (não no gate D-060). Fila: distância local + carga 150.

---

## 04/11 01:15 — token-opt host/store (TOKEN-OPTIMIZATION §2)

Atlas: resumo incremental, prefixo estável, lote Bibliotecário/iniciativa, pool de limites. Sem OPT-1.

### O que entrou
- **v17 `OptRepos`**: `topic_summary`, `batch_cursor`, `provider_limit_pool`
- Assunto: fold extractivo a cada 6 msgs; compileUsed = obrigatórios + resumo + últimas 4 (não histórico bruto). Teste: constraint não some.
- Prompt: `composeTurnPrompt` (Forge) — prefixo sistema→persona→tools→obrigatórios; mensagem/relógio fora. Snapshot de dois turnos iguais.
- `tickLibrarianBatch` / `tickInitiativeBatch` só no que mudou (cursor).
- `putProviderLimitReports` / `getProviderLimitPool` — `dedupeLimitAccounts` + `poolProviderLimits` (Rivet); mesma conta em 2 ambientes = 1.

### Prova
- vitest store `opt`+`open`+`gestor` + host `token-opt`+`gestor`+`chat`+`conductor`: verdes
- `generate-typert` 40 · `check-pkg persona-host persona-store` OK

### Dependências
- **[Anvil→Rivet]** harvest T3 chama `putProviderLimitReports`. Redeem/UI = Rivet/Lumen.
- **[Anvil→Forge]** fold do assunto é extractivo (lote barato, sem LLM). OPT-7 painel espera OPT-1.

---

## 04/11 00:55 — rename VERDE + BYC apply + GES-5 saúde

Atlas P0: host/store alinhados a `team_manager` (não `gestor`/`maestro`). RPCs `getGestorMandate*` (nome Forge `Gestor*`). Keel avisado. Fila: `applyContextProposals` (BYC) e auditoria do Gestor em `getTeamHealth`.

### Arquivos
`persona-host/src/{index,types,governance,bring-context-apply,bring-context-walk}.ts` · `tests/{bring-context-apply,bring-context-walk,gestor}.spec.ts` · `README.md` · `contracts/lumen-rpc.md`

### Prova
- `vitest` gestor + governance + BYC apply/walk: 10+3 verdes
- J19 export governança: verde
- `generate-typert` 40 · `check-pkg persona-host persona-store` OK

### Dependências
- **[Anvil→Lumen]** `applyContextProposals` grava Cofre; privado = `members`. Saúde: `getTeamHealth.gestorAudit`.
- **[Anvil→Keel]** rename VERDE (já no ask).

---

## 04/11 00:40 — rename Gestor (`team_manager`)

Keel P1: host alinhado ao core (`TEAM_MANAGER_ROLE = 'team_manager'`). `SystemRoleView` e `toPersonaView` sem o literal antigo. Store v16 tabelas `team_manager_*`. Contrato em `lumen-rpc.md`.

### Arquivos
`persona-host/src/{types,index,gestor,orchestration}.ts` · `tests/gestor.spec.ts` · `README.md` · `persona-store/src/{migrations,gestor/repos}.ts` · `tests/open.spec.ts` · `README.md` · `contracts/lumen-rpc.md`

### Prova
- `vitest` `gestor.spec.ts` + `open.spec.ts`: 23/23
- `generate-typert`: 40 artifacts
- `check-pkg persona-host persona-store`: OK

### Dependências
- **[Anvil→Forge]** host/store usam `team_manager`. Core já tem `TEAM_MANAGER_ROLE`. Testes core que ainda esperam `'gestor'` no array de roles são seus.

---

## 04/11 00:10 — Segundo cérebro store/RPC (SB-1 / SB-4 / SB-10)

BRIEFING 19. Onda 3/BYC sem fatia Anvil livre (BYC-4 espera Forge BYC-1..3). Este turno: páginas markdown + índice derivado + remotes.

### 1. Store v15
`BrainRepos` (`brain_page` + FTS5 + triggers, `brain_link`, `brain_version`, `brain_grant`). Markdown é a fonte; FTS/tipo/`[[links]]` são derivados. `putPage` sempre append de versão (pessoa ou persona). Soft-supersede só. `grant` / `revoke` / `recordUse` + `grantAllows` (escopo exato, nunca amplia). `listChangedSince` / `ensureStartHere`. `exportFolder` (mão única) / `importFolder` (slug+hash = skip). WAVE2 permanece v14.

### 2. Host RPCs
`putBrainPage` `getBrainPage` `listBrainPages` `searchBrainPages` `listBrainVersions` `restoreBrainPage` `listBrainChangedToday` `getBrainHome` `grantBrainPermission` `revokeBrainPermission` `listBrainPermissions` `useBrainPermission` `exportBrainVault` `importBrainVault`. ACL = `canReadVault` (página `persona` some do ator humano). Guest `forbidden` no write. Typert 40. `SystemRoleView` inclui `librarian` (Forge já no core).

### Arquivos
`persona-store/src/{constants,migrations,brain/repos,teach/repos,index}.ts` · `tests/{second-brain-pages,open}.spec.ts` · `README.md` · `persona-host/src/{types,brain,index}.ts` · `tests/second-brain.spec.ts` · `README.md` · `contracts/lumen-rpc.md` · `lib/typert.*`

### Prova
```
node ./node_modules/vitest/vitest.mjs run …/second-brain-pages …/open …/second-brain → 28 OK (11.7s)
node ./node_modules/vitest/vitest.mjs run …/second-brain-pages …/second-brain …/attention-retention → 12 OK (16.5s)
node scripts/persona/check-pkg.mjs persona-store persona-host → OK 20.8s + 17.5s
node --import tsx/esm scripts/generate-typert.ts → 40 artifacts (36.8s)
```

### Dependências
- **[Anvil→Forge]** v15 = só Segundo cérebro. WAVE2 fica v14. Gate: `useBrainPermission` (alvo/persona/validade diferentes → `forbidden`). Curadoria/Bibliotecário e `brain_*` tools continuam seus.
- **[Anvil→Lumen]** Empresa › Segundo cérebro: `getBrainHome` / `listBrainPages` / `getBrainPage` / `listBrainVersions` / `putBrainPage` / `listBrainPermissions` / `revokeBrainPermission` / `exportBrainVault`. Contrato em `lumen-rpc.md`. Lumen fora do canvas — recado no Status.
- **[Anvil→Prism]** mesmos remotes se a tela passar pelo client.

### Limitações
Sem curadoria automática (Forge SB-2/SB-6). Sem tools de agente (Rivet SB-5). UI não ligada. App desktop não exercitado. Sem commit. Fila Anvil seguinte: BYC-4 (bloqueada) / SB-3 gate (Forge).

---

## 03/11 23:55 — Cofre documentos + citações + anexos visão + multi-cliente + soak

Forge fechou WAVE2 RPC no host (v14 canônico, sem v15). Este turno: Cofre que lê arquivo + Contexto usado.

### 1. Store
PDF/DOCX/MD/TXT/CSV locais (sem dep nova). `detectVaultKind` recusa vazio, >8 MB (linha pt-BR) e EXE/MZ. `ingest`/`replace`/`delete` + `vault_chunk` FTS. `searchChunks` usa tokens OR (`ftsMatch`), não uma frase só — `compileUsed` acerta "Clausula do contrato".

### 2. Host RPCs + citações
`ingestVaultDocument` / `replaceVaultDocument` / `deleteVaultDocument` / `listVaultDocuments` / `searchVaultDocuments`. Hits trazem `title` + `locator` (página/seção). `compileUsed` anexa `kind: 'document'` no Contexto usado; ACL `canReadVault` (visibilidade persona some do ator humano e de outra persona). Typert 40.

### 3. Anexos
`MediaHost.stageForRunner(hasVision)`: imagem vira bytes se `capabilities().vision === true`; senão `inputs/` read-only. Talk encaminha o flag; worktree de review fica no caminho arquivo (seguro).

### 4. Multi-cliente + soak
Dois `followMessages` + `getProjectBoard` no mesmo workspace: 1 mensagem, cards por `ticketId` sem duplicata. 10 personas idle × 12 ticks de 5 min: 0 chamadas AI, rss/handles estáveis.

### Arquivos
`persona-store/src/vault/{extract,chunk,samples,repos}.ts` · `migrations` v13+v14 · `tests/vault-ingest.spec.ts` · `persona-host/src/{vault-docs,media,orchestration,index,types}.ts` · `tests/{vault-docs,attachments,multi-client,host-soak}.spec.ts` · `contracts/{lumen-rpc,attachments}.md` · `lib/typert.*`

### Prova
```
pnpm exec vitest run …/vault-ingest …/vault …/open → 47 OK
pnpm exec vitest run …/vault-docs → 4 OK
pnpm exec vitest run …/attachments → 9 OK
pnpm exec vitest run …/multi-client → 1 OK
pnpm exec vitest run …/host-soak → 1 OK
pnpm exec vitest run …/wave2 …/j05-cofre → 5 OK
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (68.5s)
```

### Dependências
- **[Anvil→Lumen]** Conhecimento/Cofre: `ingest/replace/delete/list/searchVaultDocuments`; citações `listUsedContext`/`getTurnContext` com `title`+`locator` em `kind: 'document'`.
- **[Anvil→Prism]** mesmos remotes se o upload/cite passar pelo client; `followMessages` já converge dois clientes.
- **[Anvil→Forge]** OK — v14 permanece canônico. Não toquei WAVE2 RPC.

### Limitações
PDF = Tj/TJ + FlateDecode; DOCX = ZIP + `w:t`. Sem dep de parser. Visão só se o runner anunciar `vision` (DSH hoje não). Doc `persona` some da UI humana (`canReadVault`). App desktop não exercitado (só host). Sem commit.

---

## 03/11 22:29 — acceptWorkflowProposal + Conversa PB-5 (Atlas)

Leftovers do turno 22:17 já no fio. Este turno: RPCs Lumen + lado host da Conversa.

### 1. Proposta de fluxo
`acceptWorkflowProposal({ columns, fields, destByRemoved?, template? })` — único `save` do cartão; `template` do cartão ou prefixo das colunas. `rejectWorkflowProposal(scope)` devolve o fluxo atual, store intacto. Guest `forbidden`.

### 2. PB-5 Conversa (host)
`getProjectConversation(scope)` → `{ projectId, channelId, name }`. `createProject` cria `#geral` (`id` = `geral:<projectId>`). Pessoal reusa `geral` se já existir.

### 3. Dogfood
Padaria DF-001..008: nenhum dono Anvil (Prism/Lumen/Muse/Forge). Sem edição.

### Arquivos
`persona-host/src/{index,types,boards}.ts` · `tests/{boards,j16-propose-flow,persona-card}.spec.ts` · `contracts/{project-boards-remote,lumen-rpc,ui-shell}.md`

### Prova
```
pnpm exec vitest run …/boards …/j16-propose-flow …/persona-card …/preroute → 22 OK
node scripts/persona/check-pkg.mjs persona-host → OK 52.9s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (96.5s)
```

### Dependências
- **[Anvil→Lumen]** trocar o aceite provisório (`updateWorkflow`) por `acceptWorkflowProposal`; recusa = `rejectWorkflowProposal`.
- **[Anvil→Prism]** aba Conversa: `getProjectConversation` → abrir `channelId` (não o `#geral` do Pessoal).
- E11 blocked. Sem commit.

---

## 03/11 22:17 — Sessão nova: fila Atlas 21:50 ok + leftovers host

Maestri reiniciou. Fila Atlas (RPC share/insights + generate-typert + dogfood host/store + endurecimento) já estava no fio das 21:50. Confirmei e encadeei leftovers.

### 1. Fila Atlas — já no código
Share/insights/skills CLI, modo seguro, `restoreBackup`/`getStoreHealth`, anexo 8 MB. Padaria Lua: DF-001 Prism, DF-002 Forge — nenhum bug host/store.

### 2. `/pausar` / `/retomar`
Dono pausa a Coordenação (ou @nome). Mesma linha `persona_runtime` do cartão. Sem conversa/tarefa até `/retomar`. Membro continua recusado. Comando lido do texto (não de `lastRoute` velho).

### 3. X-4 + cartão
`pollExternal` passa `budget` (cap 4) a telegram/slack/discord/caldav/email. Tempestade 20 polls telegram: 4 fetch. `getPersonaCard` usa `quotaCardMeters` (ausente ≠ 0%).

### Arquivos
`persona-host/src/{orchestration,index,external-sources,persona-card}.ts` · `tests/{preroute,external-sources}.spec.ts`

### Prova
```
pnpm exec vitest run …/preroute …/external-sources …/persona-card → 19 OK
pnpm exec vitest run …/share-insights …/attachments …/lifecycle …/recovery → 19 OK
node scripts/persona/check-pkg.mjs persona-host → OK 15.7s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (39.1s)
```

### Dependências
- **[Anvil→Lumen]** RPCs share/insights prontos (`lumen-rpc.md`). `acceptWorkflowProposal` = alias de `updateWorkflow` (já no fallback do Lumen).
- E11 Cloudflare: blocked (Atlas).
- Fila PLAN Anvil **vazia** (B7/GOV-5 no fio; Keel marca `done`).

Sem commit.

---

## 03/11 21:50 — RPC share/insights + endurecimento (Atlas)

Fila Atlas encadeada: (1) contratos Forge 21:45 (2) Padaria Lua — nenhum bug host/store chegou (3) endurecimento. Um host/teste pesado por vez. Sem commit.

### 1. Share + skills CLI
`exportPersona` / `importPersona` / `exportTeam` / `importTeam` / `previewCliSkills` / `proposeCliSkills`.

Import cria proposta `hire` **pending** — nunca aplica. Skills CLI = `origin: learned`, `enabled: false`. Segredo → `SECRET_REFUSED` / `IMPORT_REFUSED`.

### 2. Insights locais
Dobra onboarding, mensagens de persona/runner, tickets `completed`/`merged`, aprovações `approved`. Sem telemetria.

`getActivationFunnel` · `getPersonaImpact` · `listPersonaImpact` — **só dono**.

### 3. Endurecimento
- Corrupto + backup → restaura (já existia).
- Corrupto sem backup → **modo seguro** (quarentena + banco vazio + mensagem). Arquivo alienígena com tabelas ainda recusa.
- `restoreBackup({ filename })` + `getStoreHealth()`.
- Migrações v1→v12 + rollback de falha (suíte existente + `recovery.spec.ts`).
- Anexo/avatar/arquivo > limite → linha pt-BR (`Este anexo tem N MB. O limite é 8 MB.`).

### Arquivos
`persona-host/src/{index,types,auth,screens,share-remote,insights-fold,media,media-detect,files}.ts` · `tests/{share-insights,lifecycle,attachments,files}.spec.ts` · `persona-store/src/{store,events/repos}.ts` · `tests/recovery.spec.ts` · `persona-spec/contracts/lumen-rpc.md`

### Prova
```
pnpm exec vitest run …/recovery.spec.ts …/migrate-fixtures.spec.ts …/open.spec.ts → 27 OK
pnpm exec vitest run …/share-insights.spec.ts …/lifecycle.spec.ts …/attachments.spec.ts …/files.spec.ts → 20 OK
pnpm exec vitest run …/remote-acl.spec.ts → 2 OK
node scripts/persona/check-pkg.mjs persona-store → OK 9.0s
node scripts/persona/check-pkg.mjs persona-host → OK 17.5s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (39.1s)
```

### Dependências
- **[Anvil→Lumen/Prism]** RPCs prontos: share (`exportPersona`/`importPersona`/`exportTeam`/`importTeam`/`previewCliSkills`/`proposeCliSkills`) e insights (`getActivationFunnel`/`getPersonaImpact`/`listPersonaImpact`). Contrato `lumen-rpc.md` + `share.md`/`insights.md`. Lumen não está no canvas.
- **[Anvil→Forge]** nenhum bug Padaria Lua chegou. Pronto para o próximo.
- E11 Cloudflare: blocked (Atlas).

Fila Atlas desta rodada **fechada** (item 2 sem material). Sem commit.

---

## 03/11 21:27 — Escala + chat rico + Cloudflare dry-run (Atlas)

Fila Atlas encadeada. Um host/teste pesado por vez. Sem login/deploy. Sem commit.

### 1. Escala
Workspace sintético 10 projetos / 30 personas / 10k msgs / 1k tarefas (SQL bulk, sem ingest). Índice `event_stream_alive_seq`, `checkpointWal` (`PRAGMA wal_checkpoint(TRUNCATE)`), `listMessages` paginado (50).

**Números (depois; arquivo WAL, 12 amostras):**

| RPC | p95 |
|---|---|
| `listMessages` (páginas 50) | **39.6 ms** |
| `search` FTS (`needle`) | **16.5 ms** |
| `listTasks` (~100 no 1º projeto) | **25.5 ms** |
| `listPersonas` | **8.0 ms** |
| baseline 1ª página | 13.2 ms |
| seed | 2.55 s |
| heap Δ | +5 MB |
| checkpoint | busy 0 |

Antes: sem suíte; stream sem partial index; sem RPC de checkpoint. Depois: p95 << 100 ms, heap estável.

### 2. Chat rico (schema v12)
Reações (catálogo Brush), reply (`replyToId`), pin, edit/apagar própria + audit, `suggestMentions` com talk ACL.

RPCs: `listStickers` · `reactToMessage` · `unreactToMessage` · `replyToMessage` · `pinMessage` · `unpinMessage` · `listPinned` · `editMessage` · `deleteMessage` · `listMessageAudit` · `suggestMentions` · `checkpointWal`.

### 3. Cloudflare (sem conta)
`wrangler.toml` completo (DO, D1, R2, vars, secrets documentados). `migrations/0001_init.sql`. `persona-spec/CLOUDFLARE-DEPLOY.md` (passos + custo: DO exige Workers Paid ~US$ 5/mês; D1/R2 cabem no free).

`wrangler deploy --dry-run --outdir .wrangler/dry` → exit 0 (594.99 KiB / gzip 91.99 KiB). Pasta dry apagada. Sem login.

### Arquivos
`persona-store/src/{constants,migrations,store,events/repos,scale/seed,index}.ts` · `tests/{open,chat-scale}.spec.ts` · `persona-host/src/{index,types,auth,stickers}.ts` · `tests/{chat,scale}.spec.ts` · `apps/persona-edge/{wrangler.toml,README.md}` · `persona-spec/{CLOUDFLARE-DEPLOY.md,contracts/lumen-rpc.md,reports/anvil.md}`

### Prova
```
pnpm exec vitest run …/open.spec.ts …/chat-scale.spec.ts → 22 OK
pnpm exec vitest run …/chat.spec.ts → 4 OK
pnpm exec vitest run …/scale.spec.ts → 1 OK (p95 acima)
node scripts/persona/check-pkg.mjs persona-host persona-store → host 20.9s / store 10.3s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (56.4s)
cd apps/persona-edge && pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry → exit 0
```

### Dependências
- **[Anvil→Muse]** `listStickers` ids = Brush (`stamp-aprovado`, `tray-*`, `nav-saude`, `nav-quem-cuida`). Combinar com `ReactionAdder`.
- **[Anvil→Keel]** schema v12; PLAN E11 continua blocked até login do Atlas.
- E11 deploy real: só Atlas.

Fila Atlas desta rodada **fechada**. Sem commit.

---

## 03/11 21:01 — Engine.preRoute no ProjectRuntime (Forge 20:50)

Vigia: executei o próximo (Forge→Anvil ligar `Engine.preRoute`). Não reescrevi regras do Forge.

### Fio
`ProjectRuntime` passa `preRoute` ao `Engine`. `ingest` curto-circuita cortesia/silêncio/duplicado/comando recusado (sem Tarefa). `@menção` escolhe a falante e cai no triage (`action: model`) — não auto-aceita Tarefa.

### Portas reais (não stub)
- `personas` = roster do projeto
- `budgetLeft` = slot de `ExecutionBudget` + `tokenBudget`/`executionBudget` da Coordenação
- `silenceUntil` = janela da Coordenação (`silenceUntilOf`)
- `canCommand` = guest/desconhecido recusa; `/tarefa` member+owner; `/pausar` `/retomar` só owner

### Persistência
Janela de duplicados em `screen_doc` kind `preroute_window` (80 mais novas). Runtime novo recarrega.

### Arquivos
`persona-host/src/{orchestration.ts,proactivity.ts}` · `tests/{preroute.spec.ts,proactivity.spec.ts}`

### Prova
```
pnpm exec vitest run …/preroute.spec.ts …/proactivity.spec.ts
→ 2 files / 17 tests OK
pnpm exec vitest run …/e2e-flows.spec.ts …/j07-budget.spec.ts …/external-sources.spec.ts …/attention-retention.spec.ts
→ 4 files / 16 tests OK
node scripts/persona/check-pkg.mjs persona-host → OK 17.1s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (90.5s)
```

### Dependências
- **[Anvil→Keel]** PLAN: GOV-5 e B7 podem `done` (já no fio).
- **[Anvil→Rivet]** `ackAttention` + `attentionEvents` para toasts (turno 20:49).
- E11 Cloudflare: blocked (Atlas). `/pausar` `/retomar` ainda não chamam `pausePersona` (só recusam Tarefa).

Fila Anvil do PLAN **vazia** (E11 blocked). Sem commit.

---

## 03/11 20:49 — X-3 Cofre + GOV retenção + ackAttention (Vigia)

Fila Anvil do PLAN encadeada: B7 já no fio (MutantRunBook + 2 specs; PLAN ainda `todo` — Keel). GOV-5 export/sync já no turno anterior. Este turno fecha leftovers Anvil.

### X-3 `vault.get`
`CofreSecretVault` lê `VaultRepos.findActiveFact(project, provider)` (`telegram`/`slack`/…). Sem token ⇒ skip. Token nunca no view. Host constrói o vault; testes ainda injetam Map.

### GOV-5 retenção
`pruneAudit(workspace, keep=200)` no tick de retenção (por workspace do projeto). Setores/away/rotinas não apagam.

### Notificações (Rivet toasts)
`ackAttention({ eventIds })` — ids saem do próximo `attentionEvents` baseline.

### Prova
```
pnpm exec vitest run …/governance.spec.ts …/external-sources.spec.ts …/attention-retention.spec.ts …/remote-acl.spec.ts
→ 4 files / 13 tests OK
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (55.2s)
node scripts/persona/check-pkg.mjs persona-host persona-store → host 31.8s / store 9.4s OK
```

### Dependências
- **[Anvil→Rivet]** `ackAttention` + `attentionEvents` para toasts desktop.
- **[Anvil→Keel]** PLAN: GOV-5 pode `done`; B7 pode `done`.
- E11 Cloudflare: blocked (Atlas). persona-vault DPAPI (Rivet) não ligado — Cofre da empresa cobre o host.

Fila Anvil **vazia** no PLAN (E11 blocked). Sem commit.

---

## 03/11 20:40 — GOV-5 export/sync + exclusão/backup (CORTADO, files soltos)

Forge soltou `index.ts` / `types.ts` / `migrations.ts`. Não reescrevi v11 remotes, card, sync client, edge, retention, scheduler, nem X-3 (`pollExternal`/`replyExternal`/`bindSprintGoal`/`queda`).

### Dados — backup e exclusão
- Store: `backupNow()` / `listBackups()`; `wipeWorkspace` / `wipeProject` (FK off, órfãos de blob).
- Remote: `backupNow` · `listBackups` · `deleteWorkspace({confirmed})` · `deleteSharedProject({confirmed})`. Dono + confirm. Pessoal recusado. ACL_EXCEPTIONS só nos backups locais.

### GOV-5 export/import/sync (workspace; DM não)
- `SqliteGovernanceRepos.snapshot` / `restore` (idempotente).
- Zip: `governanca.md` (setores, disponibilidade, rotinas, auditoria). Envelope `gov:<ws>` `classification: workspace` sobe; DM recusado.
- Import markdown `governanca.md` não duplica (`md:governanca.md`).

### Arquivos
`persona-store/src/{store.ts,lifecycle/wipe.ts,governance/repos.ts,index.ts,README.md}` · `tests/{lifecycle,governance}.spec.ts` · `persona-host/src/{index.ts,types.ts,auth.ts,export-md.ts}` · `tests/{lifecycle,remote-acl}.spec.ts` · `tests/journeys/j19-gov-export.spec.ts` · `persona-spec/contracts/{lumen-rpc,governance}.md`

### Prova
```
pnpm exec vitest run …/lifecycle.spec.ts …/governance.spec.ts …/remote-acl.spec.ts …/j19-gov-export.spec.ts …/export.spec.ts …/j18-board-export.spec.ts
→ 7 files / 17 tests OK
node scripts/persona/check-pkg.mjs persona-host persona-store
→ host OK 15.3s · store OK 7.0s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (67.3s) após remotes de exclusão
```

Keel 20:39 `export-md.ts` TS1005 era mid-edit; arquivo fecha agora (check-pkg verde).

### Limitações
- `backupNow` recusa `:memory:`.
- Wipe de avatar órfão usa `json_extract(avatar_json)`.
- Retention de governança não tem política própria (dump viaja no export/sync).
- Equipes à distância local / toasts desktop: Rivet; E5–E7 já no fio.

Fila: distância/notif só se sobrar gap; senão próxima do PLAN. Sem commit.

---

## 03/11 20:23 — Handoff Forge GOV-5/X-3 (Atlas)

Forge assume **temporariamente** GOV-5 + X-3 host. Confirmado via `maestri ask`.

**Forge toca:** `store/src/governance/**`, `migrations.ts` (v11 já no fio), `host/src/governance.ts`, `index.ts` só GOV+X-3+startSprint, `types.ts` só GOV/X-3, `boards.ts` (bindSprintGoal), `tests/governance.spec.ts`, arquivo novo `external-sources.ts`.

**Anvil não abre:** `persona-card.ts` + spec/contrato; `persona-sync/**`; `apps/persona-edge/**`; `export-md.ts`; `retention/**`; `scheduler.ts`. Fora de `index.ts`/`types.ts`/`migrations.ts` até Forge avisar «soltos».

Cartão Muse já no fio. Fila Anvil: equipes à distância local, notificações, export/backup/exclusão. Sem código até SNAPSHOT CORTADO. Contexto alto — estado salvo aqui.

---

## 03/11 20:16 — VERDE snapshot (GOV-5 no caminho do build)

Keel snapshot curto. Edição em curso (GOV-5) fechada o bastante para typecheck: schema v11 + remotes Lumen no host. Sem arquivo novo depois do pedido.

### Já no fio (buildável)

Store v11: `sector`, `away_window`, `routine_charge`, `governance_delegate`, `governance_audit`; backfill charge = dono. Remote: `getOrgChart` / `getTeamHealth` / `runTwoDayTest` / `applyFix` / `applyGovernanceFix` / `setResponsible` / `setSubstitute` / `setSector` / `setAvailability` / `setPersonaGovernance` / `recommendStructure` / `applyStructure` / `listAudit`. Views = `governance-contract.ts`.

### Pendente pós-CORTADO

Export/sync workspace (DM não); suíte de queda abortada; X-3 host (`replyTelegram`/`replyEmail` + poll).

### Prova

```
pnpm exec vitest run …/persona-store/tests/governance.spec.ts …/open.spec.ts …/persona-host/tests/governance.spec.ts …/persona-card.spec.ts
 Test Files  4 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 30.8s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 13.1s
persona-store: OK in 6.3s
```

Parado até SNAPSHOT CORTADO.

---

## 03/11 21:20 — Cartão Muse (getPersonaCard + talk ACL + pause/engine)

Pedido Keel/Muse: cartão com dado real para o Prism montar. Sem schema bump (v10 speak/charge + `screen_doc` para pausa/auditoria).

### Remote

- `getPersonaCard` → `{ handle, systemRoles, nowKind, nowText, presence {online,lastActiveAt}, engine {runnerLabel,modelLabel}, sectorName?, ownerName?, substituteName?, currentProjectName?, quota? }`. `nowKind`: working|reviewing|waiting-approval|waiting-reply|quota|resting|stuck|offline. `nowText` derivado (Assignment/Attention/quota/ociosidade/pausa). `quota` de `getOfficialQuota`/`accountUsage`; **ausente = indisponível, nunca 0**.
- `getPersonaTalkAcl` / `setPersonaTalkAcl` → `{ mode: 'workspace'|'chosen', principals: [{kind,id,name}] }`. Store interno `everyone`/`members`.
- `pausePersona` / `resumePersona` / `setPersonaEngine` / `putPersonaCharge` — responsável ou dono; auditoria `persona_audit`.

ACL no servidor: `createDm` e `@menção` recusam pt-BR (`Esta persona só conversa com quem o responsável escolheu.`), nunca silêncio. Dono e responsável sempre podem. Charge ausente → nomes omitidos.

Contrato: `persona-spec/contracts/{lumen-rpc.md,persona-card.md}`.

### Prova

```
pnpm exec vitest run …/persona-card.spec.ts
 Test Files  1 passed
      Tests  5 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 56.4s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 23.3s
persona-store: OK in 9.1s
```

[Anvil→Muse] getPersonaCard, getPersonaTalkAcl, setPersonaTalkAcl, pausePersona, resumePersona, setPersonaEngine.

Próximo: GOV-5 (organograma / Saúde / 2 dias / estrutura) sem sujar este snapshot.

---

## 03/11 20:16 — Snapshot verde: J14/J18 + anexos/avatar (Keel)

### J12–J18 (Forge)

1. Canal sem stream não é `forbidden`. `EventRepos.list`/`recall` devolvem página vazia; `exportMarkdown` captura `StoreError` e exporta o canal vazio. Repro J18 sem `sayOn`.
2. `mapBoardError` → `BoardRemoteError` (`code` estável + `message` pt-BR). Remover coluna com Tarefa sem destino = `column-needs-destination` («Escolha um destino…»), nunca `INVALID_WORKFLOW` no fio.

### Anexos + avatar

Store v9: `blob_object`, `attachment`. Disco: `<PERSONA_HOME>/attachments/<projectId>/<hash>` e `/avatars/<hash>`. Magic bytes; SVG/HTML/exe recusados; nome higienizado; cota; `looksLikeCredential` = aviso. HTTP `GET /api/persona/media?kind=&id=` (`kind: 'exact'`), `nosniff`, `Content-Type` fixo, `Content-Disposition` seguro. ACL no servidor (DM = participantes). Runner: `inputs/` + «Anexos: nome» no prompt. Avatar PNG/JPEG/WebP ≤2 MB; troca/remoção sem órfão.

Remote: `attachFile` · `listAttachments` · `getAttachment` · `getAttachmentBytes` · `uploadPersonaAvatar` · `removePersonaAvatar`. `postMessage.attachmentIds`. Contrato: `persona-spec/contracts/attachments.md`.

### Prova

```
pnpm exec vitest run …/journeys …/boards.spec.ts …/attachments.spec.ts …/export.spec.ts …/events.spec.ts …/open.spec.ts
 Test Files  23 passed
      Tests  74 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 47.9s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 18.7s
persona-store: OK in 9.6s
```

```
pnpm exec vitest run …/attachments.spec.ts
 Test Files  1 passed
      Tests  7 passed
```

[Anvil→Prism] composer: `attachFile` / `listAttachments` / `getAttachment` / `getAttachmentBytes` + `postMessage.attachmentIds`. Editor: `uploadPersonaAvatar` / `removePersonaAvatar`. Flags `PERSONA_MESSAGE_ATTACHMENTS_HOST_READY` / `PERSONA_AVATAR_UPLOAD_HOST_READY`.

Próximo: GOV-5 (store/RPC governança) após este snapshot.

---

## 03/11 19:12 — PB-4 Quadros (PROJECT-BOARDS / Atlas)

Pedido Miguel: fluxo e sprints **por projeto**. Host/store já tinham v8; este turno fecha o aceite do Remote.

### Persistência

`user_version` 8: `project_workflow`, `workflow_column`, `workflow_field`, `sprint`, `sprint_ticket`, `ticket_seat`. v7→v8 preserva `engine_ticket`. `SqliteBoardRepos.snapshot`/`restore` (projeto; DM não). Crash: save abortado mantém o fluxo anterior. `deleteSprint` zera `seat.sprintId`.

### Remote

`listWorkflowTemplates` · `getProjectBoard` · `listBoards` (contagem por categoria, sprint atual, `workingNow`) · `createProject({ template? })` · `createWorkflowFromTemplate` · `updateWorkflow` (destino obrigatório) · `moveTicket` · CRUD sprint (`create`/`update`/`delete`/`list`) · `planSprint` · `startSprint` · `closeSprint` (`confirmed`; marco no 1º canal do projeto) · `sprintSummary` · `proposeWorkflow` (nunca grava). ACL: leitura `can(read, project)`; mutação `can(write, project)`.

### Prova

Contratação e Site: colunas diferentes; Tarefa de um não aparece no outro. Editar fluxo sem perder Tarefa. Encerrar sprint posta «Sprint S1…» no canal.

```
pnpm exec vitest run …/persona-store/tests/board.spec.ts …/persona-host/tests/boards.spec.ts …/journeys/j16-propose-flow.spec.ts
 Test Files  2+1 passed
      Tests  8 + J16
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.3s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 12.6s
persona-store: OK in 6.8s
```

[Anvil→Lumen] `lumen-rpc.md` Quadros. [Anvil→Probe] j16 + isolation no host. Fila Anvil exclusiva: vazia.

---

## 03/11 19:40 — Voz da Coordenação + PB-4 Quadros (v8)

### 1. #geral robótico (Atlas)

Captura real: «Recebido. Vou encaminhar.» + eco da mensagem + «: recebido.»

Host agora:

- `coordinationHandoff` / `summarizeWork` — quem faz o quê e quando volta (`Bento assume o README. Te chamo na revisão…`). Palavras-chave, **nunca** cita o texto da pessoa.
- `streamAck` só entrega o outbox (sem placeholder). Sem `digitando`.
- Pedido simples (`wantsWork` falso) → resposta direta (`SCRIPTED_HELLO` / runner de talk).
- Prompt de talk: `nunca ecoe…; sem placeholders; pedido simples responde direto`.
- `recoverTalks` após crash: speaker = menção ?? DM ?? coordenação.
- `postAs` ignora `StoreError` `constraint`/`not-open` (resto de wipe de teste).

Prompts de modelo (`composeTalkPrompt` / `replies` no engine, `coordinationPrompt` no Rivet) ficam com Forge/Rivet. Host não ecoa mais sozinho.

### 2. PB-4 — store v8 + Remote

Migração adjacente v7→v8: `project_workflow`, `workflow_column`, `workflow_field`, `sprint`, `sprint_ticket`, `ticket_seat`. `SqliteBoardRepos` (fluxo, assentos, sprints, `snapshot`/`restore`). Fluxo e sprint são do projeto (sync `classification: project`); DM não sobe. Export Markdown inclui `fluxo.md` / `sprints.md`.

Remote (ACL no servidor): `getProjectBoard`, `listBoards`, `createWorkflowFromTemplate`, `updateWorkflow`, `moveTicket`, `listSprints`, `createSprint`, `planSprint`, `startSprint`, `closeSprint`, `sprintSummary`, `proposeWorkflow` (cartão; **nunca aplica sozinho**). Contrato em `persona-spec/contracts/lumen-rpc.md`.

### 3. Quality-core (fila anterior, ainda sem drop próprio)

Host compartilhado + wipe (sem FTS) + `it` 60 s; shuffle seeds 1/17/42/99/2026 5/5. Store crash suite + effects/outbox. `HostPermissionMode` + generate-typert. CLI nunca `prompt` (D-052). Sem mais CLI real.

### Arquivos

- `packages/persona/persona-host/src/{orchestration,boards,index,types,export-md}.ts`
- `packages/persona/persona-host/tests/{conductor,e2e-flows,talk-voice,boards}.spec.ts`
- `packages/persona/persona-store/src/{constants,migrations,board/repos,index}.ts`
- `packages/persona/persona-store/tests/{board,open}.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos

```
pnpm exec vitest run …/conductor …/e2e-flows …/orchestration …/talk-voice
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

```
pnpm exec vitest run …/persona-store/tests/board.spec.ts …/persona-host/tests/boards.spec.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.2s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 14.3s
persona-store: OK in 7.5s
```

### Limitações

- Sem mais CLI real (orçamento). Prova de voz no app = Probe.
- `proposeWorkflow` é keyword/JSON sujo (Forge PB-3); Remote não grava até o aceite.
- RetentionKind do engine não tem `workflow` — dump via `snapshot`/`restore` + export MD.
- Fila Anvil exclusiva no PLAN: vazia (PB-4 feito; B7/C8/PRO-2 já aceitos). [Anvil→Lumen] Quadros Remote pronto.

---

## 03/11 18:10 — 1ª resposta real (BANANA) + CLI never prompt + perf + fluxos

### 1. Prova no canal + SQLite (não é o welcome)

`coord-m-banana-reply` · ator `onb-1` · `type: runner` · `source: runner` · persistido no SQLite. O welcome `onb-welcome` / «Bem-vindos. Estou aqui…» **não** é esta linha.

O modelo **não** escreveu BANANA: o runner ainda injeta o mandato de Executora («Tarefa autorizada»). Isolar `cwd` (PERSONA_HOME, não o repo) tirou o dump do checkout; o texto passou de «diretório persona-dev…» para «Estou pronta como onb-1, Executora». Contrato [Anvil→Rivet]: `purpose: talk` = chat curto + `deny` + `toolLevel: none`, **sem** mandato de Tarefa.

### 2. Por que a Tarefa ficou `doing` (90 s)

`resolveFor(..., 'asked')` mandava `permissionModeOf('asked')` = **`prompt`**. CLI/OAR espera aprovação que ninguém concede (D-013). Agora: CLI **nunca** `prompt` (falha cedo, pt-BR); `talk` = `deny`; `task` = `allow-once` só com `files: write` ou `shell: safe|write`. Host envia `spec.tools` + `toolLevel`. Gate humano = Revisar.

### 3. CLI real — 3/3 execs (exceção Keel)

| # | path | resultado |
|---|---|---|
| 1 | talk | runner real, 31 s, 1º token 20 s; corpo = mandato + repo |
| 2 | **task** (corpo continha «Tarefa» → `wantsWork`) | sem `coord-*-reply`; ack+progress |
| 3 | talk + cwd isolado | runner real, **23 s**, 1º token **17 s**; ainda Executora |

Sem mais CLI.

### Performance (1ª resposta)

Antes (18:00): 195 s — era welcome + hang `prompt`. Não é baseline de modelo.

| etapa | exec 1 (ms) | exec 3 (ms) | meta |
|---|---:|---:|---|
| ingest | 0 | 0 | — |
| triage talk | 14 | 35 | barato (keyword) |
| compileContext ∥ resolve | 34 | 50 | paralelo |
| resolve:talk:ready | 11433 | 9023 | boot CLI |
| first-token (canal) | 20112 | 17547 | < 5 s |
| idle / reply | 21504 | 18201 | < 30 s |
| **total** | **30922** | **22714** | < 60 s |

Ataques feitos: triagem keyword (sem Ticket no simples); 1º token no canal (`coord-*-token`); lease `warmRunners` (persona+projeto+purpose); compile ∥ start. Falta: modelo rápido na triagem (Rivet) + prompt de talk sem Executora (Rivet) + sessão já quente (2ª msg).

### 4. Fluxos E2E (integração host)

`e2e-flows.spec.ts`: DM; @menção sem coordenador; handoff; persona_propose → Contratar? → rail; restrição do Cofre em `listUsedContext` (`restricted: true`, body vazio); iniciativa → proposta; «Enquanto você estava fora» após fechar/abrir. Prova no app = mesmo host inject do perfil (Probe = browser).

### 5. @Remote

`listUsedContext` + `MessageView.source` + `TurnContextView.records`. Erros tipados (`ticket-not-found`, `forbidden`) — `throw new Error(code)`. Valores crus, Typert envolve `RemoteResult` (Muse unwrap no Prism). OfficialQuota: já era `OfficialQuotaView` (typert 40).

### Arquivos

- `packages/persona/persona-host/src/{runner,orchestration,index,types}.ts`
- `packages/persona/persona-host/tests/{permission,e2e-flows,real-path}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `persona-spec/contracts/{cli-permission,lumen-rpc}.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/permission.spec.ts …/e2e-flows.spec.ts …/conductor.spec.ts …/real-path.spec.ts …/orchestration.spec.ts …/screens.spec.ts …/controller.spec.ts …/onboarding.spec.ts …/proactivity.spec.ts
 Test Files  8 passed (8)
      Tests  45 passed (45)
```

```
pnpm exec vitest run …/permission …/e2e-flows …/conductor
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

```
node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 41.6s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 38.8s
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
# exec 3: source=runner actor=onb-1 type=runner sqlite ok; body Executora; ms=22714 first-token=17547
```

### Fora / dependências

- Rivet: `purpose: talk` não pode carregar mandato Executora/Tarefa; medir first-token; lease D10 = `warmRunners`.
- Lumen/Prism: `source` + `listUsedContext.records` no «Contexto usado».
- Fila PLAN Anvil vazia (C8 E2E = Probe; E11 = Atlas).

---

## 03/11 18:00 — Keel 1–5 (home nativo / sem scripted / erro tipado / conexões ≥8s / 1ª resposta real) + D5 uso

### 1. Home nativo

`runnerHomeOf()` devolve `''`. `resolveHostRunner` **omite** `home` no `resolveRunner` (processo = `~/.claude`). Isolamento só com `runnerHomeOf(id, true)` — sem campo no spec, fora da v1.

### 2. Sem texto roteirizado no caminho real

`PERSONA_REAL_CLI=1` e produção: nada de `Olá — em que posso ajudar?` no outbox/`postAs`. Vazio ⇒ `não consegui responder: …`. Scripted só com `VITEST` ou `PERSONA_SCRIPTED=1`.

### 3. Erro tipado até a UI

Texto cru OAR (`Not logged in · Please run /login`) vira `RunnerResolveError` + card Precisa de você. Canal: `A Claude Code não está conectada — abra o terminal e rode \`claude\`/login`. Nunca o inglês.

### 4. listConnections

Timeout **8 s**, cache 60 s, `phase: 'checking'` na 1ª pintura (sem `not_logged_in`). Warm no boot (não no Vitest — spawnSync travava a suíte). CLI falsa de 6 s → `loggedIn: true`.

### 5. 1ª resposta real (2 execs, ~195 s)

`listConnections` 1º paint: `phase: checking`. Depois: Claude `available: true`, `loggedIn: true` (login nativo). Canal persistiu **«Bem-vindos. Estou aqui para coordenar o time.»** (ator `onb-1` — apresentação do onboarding, texto real, não scripted / não `/login`). Tarefa README ficou `doing` (`task-flush-timeout` 90 s). `usedPersonaRunners: true`.

### D5 — Uso e limites

Schema **v7** `usage_record` + `usage_quota`. `SqliteUsageStore` = port `record` / `query` / `totals` (Rivet). Retenção `kind: usage`. Remote `getUsage` / `getOfficialQuota` com ator do servidor + `can(read, project)`. Origem rotulada; livro vazio ⇒ `unavailable` / «indisponível», **sem** `usedPercent: 0`. `tokensPerMonth` da persona lê o mês UTC. Medidor grava após `whenIdle` (fake `usage()` = 1+1).

Lumen: trocar `limitsToUsageMeters` por `getUsage` / `getOfficialQuota`. `ConnectionView.phase` = verificando vs pronto.

### Arquivos

- `packages/persona/persona-host/src/{index,runner,orchestration,connection-probe,types}.ts`
- `packages/persona/persona-host/tests/{real-path,connections,usage,conductor}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `packages/persona/persona-store/src/{constants,migrations,index,usage/store,retention/store}.ts`
- `packages/persona/persona-store/tests/{usage,open}.spec.ts`
- `persona-spec/contracts/{lumen-rpc,usage}.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/real-path.spec.ts …/connections …/conductor …/usage packages/persona/persona-store/tests/usage.spec.ts …/open.spec.ts
 Test Files  6 passed (6)
      Tests  40 passed (40)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 22.5s
persona-store: OK in 9.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 49.7s
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
reply: "Bem-vindos. Estou aqui para coordenar o time."
claude: { available: true, loggedIn: true, phase: "ready" }
execs: 2  ms: 194976  broke: ["task-flush-timeout"]
```

### Fora / dependências

- Suíte host completa em paralelo ainda estoura 5 s em resume/git quando o teste de 6 s roda no mesmo pool (isolados passam).
- Rivet: port `UsageStore` + `createMemoryUsageStore` — alinhado; SQLite é este drop.
- Lumen: `getUsage` / `getOfficialQuota` / `phase`.
- Keel congelou CLI real depois desta rodada — não corro mais.

### B7 — um run mutante (encadeado neste turno)

`MutantRunBook` (`screen_doc`): 1º claim `running`, 2º `queued`, 3º `refused`. `subjectOf` fica o assunto do envio. `postAs` usa o subject capturado. Specs `mutant-run` + `orchestration` «keeps a single mutant run» (9 passed).

Fila Anvil no PLAN: vazia (C8 E2E = Probe; E11 = Atlas; F4 depois do F3).

---

## 03/11 17:20 — P0 inject + pasta/webhook/dead-letter/export + 1ª resposta real

### P0 — host volta a ativar (bloqueava Muse)

Causa: `runnersOf` / `webserverOf` liam `ctx.personaRunners` / `ctx.webserver` no construct. Cordis (`vendor/cordis/src/reflect.ts`) lança `cannot get property "…" without inject` se a chave não está no `inject` do fiber. Colocar as chaves no `static inject` as torna **obrigatórias** (fiber PENDING até existirem) — testes e perfis sem o plugin não ativam.

Correção (sintaxe confirmada no vendor): `static inject = ['typert']` só o obrigatório. Opcionais via `ctx.get('personaRunners')` e `ctx.get('webServer')` (`ReflectService.get` — sem a guarda de inject). `usedPersonaRunners` é getter ao vivo. `hostRunnerFromContext` relê o plugin a cada resolve. `cordis.patch.yml` **não mudou** (ordem já é persona-runners → persona-host).

Spec `host-inject.spec.ts`: `ctx.plugin(PersonaHost)` **com e sem** `PersonaRunners` — os dois ativam (`ping` ok).

Boot real (home limpo, sem `PERSONA_DEV_SEED`):

```
node scripts/persona/with-lock.mjs "Anvil host boot" --release-on "dsh web:" -- node scripts/persona/ui-boot-check.mjs
[channel] … #geral … O canal está quietinho …
console errors (0):
(none)
```

Muse: `maestri ask "Muse" "host ok"` falhou — Muse **não** está no canvas (`maestri list` só Atlas/Keel/Forge/Prism/Probe). Recado no Status.

### 1. Primeira resposta real (o que quebrou)

App-host inject: `usedPersonaRunners: true`. Native `claude auth status`: loggedIn max. `listConnections` com `timeoutMs: 400` dá **falso** `not_logged_in` (auth do Claude ~5 s). Probe 8 s: loggedIn true.

`PERSONA_REAL_CLI=1`, temp `PERSONA_HOME`, Coordenação `cli/claude/haiku`, 2 execs. SQLite:

- `coord-m-hi-reply` = `Not logged in · Please run /login` (texto **real** do OAR, `tapTurn` persistiu)
- tarefa `preciso de um README`: `doing` → `review` (ack + Em andamento + done)
- outbox ainda postou o scripted `Olá — em que posso ajudar?`

OAR com `home: <PERSONA_HOME>/runners/<projectId>` **não** herda o login nativo (`~/.claude`), apesar de `restoreNativeCliLogin`. Erro tipado chegou à UI como corpo da mensagem, não como `RunnerResolveError`. Probe: `maestri ask` E2E timeout (o pedido pode ter chegado).

### 2. Pasta do projeto

`setProjectRoot` / `getProjectRoot`: absoluto, existe, diretório; recusa UNC (`\\` / `//`), raiz (`C:\`, `/`), home inteira, overlap/aninhamento. Git: `isRepo`, `defaultBranch` (`origin/HEAD` ou `symbolic-ref HEAD`), `dirty`. pt-BR. `pickDirectory()` = `{ path: null }` (Rivet). Testes: pasta com espaço/acentos; UNC; home.

### 3. Webhook GitHub local

`POST /api/persona/webhooks/github?projectId=` — HMAC SHA-256, corpo ≤ 256 KiB, replay 5 min (`200 {kind:duplicate}`), `202` depois `ingest`. Segredo: `PERSONA_GITHUB_WEBHOOK_SECRET` ou Cofre `factKey=github.webhook.secret` (nunca em log). Relé Cloudflare = Atlas.

### 4. Dead-letter

Efeito/outbox falha 3× → `listDeadLetters` (`Tentar de novo` / `Descartar`) + `getOverview.needsYou`. `retryDeadLetter` reprocessa outbox; `discardDeadLetter` só some. Teste: falha → Precisa de você → retry recupera.

### 5. Exportar

`exportWorkspace` / `exportProject` → zip Markdown. DMs só com `includeDmIds`. `looksLikeCredential` redige. Cofre em `cofre/*.md`. Teste: DM ausente; `sk-ant-…` redigido.

### Arquivos

- `packages/persona/persona-host/src/{index,runner,orchestration,dead-letter,project-root,webhook-http,export-md,types,auth}.ts`
- `packages/persona/persona-host/tests/{host-inject,runner-plugin,gateway,project-root,webhook-http,dead-letter,export}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/host-inject.spec.ts …/gateway …/runner-plugin …/project-root
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  2 failed | 36 passed (38)
      Tests  2 failed | 344 passed (346)
```

Os 2 fails são resume (timeout 5 s só na suíte paralela; isolados: 3 passed).

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 16.6s
persona-store: OK in 7.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 39.3s
```

### Limitações

- `listConnections` 400 ms: falso `not_logged_in` no Claude.
- OAR + `runnerHomeOf` não vê `~/.claude`; 1ª resposta real = «Not logged in · Please run /login».
- Muse fora do canvas — «host ok» só no Status.
- `cordis.patch.yml` intocado (Keel).

---

## 03/11 16:55 — conversa + ACL + diagnostics + DB + ReviewDelivery + orçamento

### 1. Conversa no condutor
DM e `@menção` usam o mesmo laço do runner, sem Ticket quando não é trabalho. Seletor `responderId` (servidor, não o `actorId` do cliente). Resposta no fio; handoff (`Encaminhei para {nome}`; executor posta como ele). Streaming `partial` → final via `followMessages`. `cancelReply` não trava. Erro do runner: `não consegui responder: …` + ação. Relógio injetável; resume no meio do `partial`.

### 2. ACL no Remote
Todo método resolve o ator no servidor (`resolveSessionActor`: sessão local = owner, `sessionMemberId` só em teste/peer). `can()`. Exceções documentadas: `ping`, `getOnboarding`, `completeOnboarding`, `createWorkspace`, `exportDiagnostics`. Bootstrap: workspace/projeto sem membros ainda não exige ator. Guest sem projeto/DM recebe lista vazia, sem erro revelador. `actorId` do cliente não autoriza arquivos/busca/stream.

### 3. `exportDiagnostics()`
JSON: versões, schema, contagens, `lastErrors`, scheduler/Vigia, conexão `dsh` (sem spawn de CLI). Recusa se `looksLikeCredential`. Sem corpos de mensagem/DM. Probe live de CLIs fica em `listConnections`.

### 4. Versão do DB
Fixtures v1..v6 migram e preservam workspace. Banco mais novo que o app: `version-too-new` + `userMessage` pt-BR, sem down-migrate. `.db` corrompido: restaura o último `VACUUM INTO` (`recoveredFrom` + «O banco estava danificado. Restaurei o último backup.»). `migration-failed` **não** é recover (evita segundo backup e retry da migração quebrada).

### 5. ReviewDelivery (Forge) no host — Lumen **Revisar**
Remotes: `prepareReview`, `reviewSummary`, `acceptReview(mode)`, `requestChanges`, `discardReview`. Todas com `can()` + ator do servidor. Sem `rootPath` → Tarefa sem código (sem worktree). `prepare` no start da Assignment (`persona/<ticketId>`, `PERSONA_HOME/worktrees/<projectId>`). Conflito → `kind: 'blocked'` + `explanation` (engine) e kanban Bloqueado · Precisa de você; `merge --abort`. Aceite fecha a thread `review`. `sweepOrphans` no `runtime()`/resume. `GitReviewDelivery` não faz push. Contrato: `persona-spec/contracts/review-delivery.md` + `lumen-rpc.md`.

### 6. Multi-projeto
`ExecutionBudget` (global 4, por projeto 2). Projeto barulhento não esgota os outros. `runLaunched` sem vaga posta «Aguardando vaga neste projeto.» Teste: 8 projetos + cap.

### Arquivos
- `packages/persona/persona-host/src/{index,orchestration,auth,review,diagnostics,budget,types}.ts`
- `packages/persona/persona-host/tests/{conductor,remote-acl,diagnostics,review,multi-project,files,controller}.spec.ts`
- `packages/persona/persona-store/src/{store,errors,index}.ts`
- `packages/persona/persona-store/tests/migrate-fixtures.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  32 passed (32)
      Tests  338 passed (338)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 14.6s
persona-store: OK in 8.9s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.4s
```

### Limitações
- Diagnostics lista só `dsh` (CLI probe no PATH bloqueava o event loop; `listConnections` continua o probe live).
- `ctx.personaRunners.resolveRunner` ainda não injetado; `PERSONA_REAL_CLI=1` segue pelo import.
- B7 (um run mutante) já tem teste em `orchestration.spec` («keeps a single mutant run»); próximo Anvil no PLAN se o Keel não mandar outra fila.

---

## 03/11 16:10 — resolveRunner + S5 onboarding + atenção + retenção + ociosidade

### 1. `createHostRunner` → `resolveHostRunner`
Spec vem da Persona no store (`specOfPersona`). `permissionMode` explícito: `act` → `allow-once`, resto `prompt`. `autonomy` `asked` → `on_request`. Home isolado: `<PERSONA_HOME>/runners/<projectId>`. Fake/scripted salvo `PERSONA_REAL_CLI=1` — aí `resolveRunner` + `createOarSessionRunner` (TurnRunner → port de sessão). `RunnerResolveError` (`cli_not_found` / `not_logged_in` / `model_unavailable` / `quota_exhausted`) vira Report `blocked` com a mensagem pt-BR do resolvedor; login/cota postam “Precisa de você” com `loginHint` (sem stack, sem token). Testes: login e cota no conductor.

### 2. Onboarding no host (S5)
`completeOnboarding` idempotente em `store.tx`: workspace/Pessoal, owner, `#geral`, personas (`team[]` ou `createDraftDriver`+`fallbackDraft`), `cofreSeed` → `proposeMemory` (nunca Cofre direto), welcome da primeira Coordenação ou texto de sistema, `completed` no store. `getOnboarding` reflete. Contrato: `persona-spec/contracts/onboarding.md` (Prism). Teste: `PERSONA_HOME` temp → equipe Guia+Bento, kanban vazio, sem “Atlas”.

### 3. Atenção (Rivet desktop)
`getAttentionPolicy` / `putAttentionPolicy` (orçamento, silêncio, `summary`|`ping`). Stream `attentionEvents` (baseline+upsert, ≥1 s): `needs-you` (blocked) e `review`, cortados no budget; `ping` some na janela quieta. Contrato: `persona-spec/contracts/attention.md`.

### 4. Retenção no agendador
Tique diário no início da janela quieta (`02:00`–`06:00` default). Só arquiva (`archiveOnly: true`); apagar exige `archiveOnly: false` + tick. Log em `retention_log`. `get/putRetentionPolicy`, `tickRetention`, `listRetentionLog`.

### 5. Ociosidade
Sem `setInterval`. Timer único `setTimeout` ≥ 1 s alinhado ao próximo quiet start; `unref`. Sem projetos = sem timer. `attentionEvents` só dorme 1 s com cliente inscrito. Host ready (DB existente): **376 ms** (meta ≤ 1500 ms). Probe: `persona-spec/reports/bench-app.md`.

### Arquivos
- `packages/persona/persona-host/src/{runner,orchestration,onboarding,scheduler,index,types}.ts`
- `packages/persona/persona-host/tests/{conductor,onboarding,attention-retention,ready}.spec.ts`
- `persona-spec/contracts/{onboarding,attention}.md`
- `persona-spec/reports/bench-app.md` (números do host)

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  27 passed (27)
      Tests  324 passed (324)
```

```
ready.spec host-ready-ms=376
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-store: OK in 7.5s
persona-host: OK in 13.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

### Limitações
- `ctx.personaRunners` ainda não é injetado no host: resolve vai pelo import `resolveRunner`; DSH real ainda precisa de `agent` no resolvedor.
- `createDraftDriver` no onboarding e em `draftPersona`/`draftTeam` usa `createScriptedRunner` (cai em `fallbackDraft` se o turno for mudo).
- S4 host: remotes async ligadas ao driver do Rivet (`draft.ts`). 3 testes `routines-draft` verdes; typert 40 / 42.0s.
- Fila Keel 1–5 + S4 host fechadas. Próximo Anvil no PLAN: B7 (um run mutante por Tarefa).

---

## 03/11 15:54 — Fio condutor + gaps Lumen + retenção + sync local

### 1. Fio condutor real (prioridade 1)
`#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho (**sem Ticket**): resposta persistida. Pedido: Ticket `doing` → runner scriptado (`createHostRunner` = `createDefaultHostRunner`) → `review` (ou `blocked` + “Precisa de você”) → `runTicketCommand({ command: 'complete' })` → `done`. Resposta da Coordenação no SQLite; `followMessages` entrega o baseline. Reinício: Assignment interrompida retoma; id `coord-<ticket>-done` é idempotente (sem duplicar). Relógio do host é injetável (`orchestration.now`).

`resolveRunner` **não** trocado: Rivet ainda não avisou no Status. `listConnections` já chama `detectConnections()` (timeout 400 ms, cache 60 s).

### 2. Gaps Lumen
Contrato: `persona-spec/contracts/lumen-rpc.md`.
- `listCanvas` — personas + tickets
- `listDailySummaries` — propostas do dia por persona
- `listRoutineSchedule` — rotinas + runs do agendador
- `listTriageLog` — trilha por thread (gate, assessment, quem, por quê)
- Arquivos: `status: 'need-root'` + `message: "escolha a pasta do projeto"` (não lança); `setProjectRoot`

### 3. Retenção
Schema v6. `SqliteRetention` + `applySqliteRetention` (mesma `applyRetention` do Forge + VACUUM). Arquivar ≠ apagar; excluir recusado com derivados; índice/cache somem. Suíte `defineRetentionSuite(..., 'sqlite')`.

### 4. Sync local
`apps/persona-edge/tests/client-cycle.spec.ts`: 2 `SyncClient` + `HttpTransport` no `wrangler` local — convite, DM recusado no cliente, offline→flush, cifra. Sem conta/deploy.

### Arquivos
- `packages/persona/persona-host/src/{orchestration,index,types,screens,files}.ts`
- `packages/persona/persona-host/tests/{conductor,orchestration,files,screens}.spec.ts`
- `packages/persona/persona-store/src/{constants,migrations,index,events/repos,retention/store}.ts`
- `packages/persona/persona-store/tests/{open,retention.contract}.spec.ts`
- `apps/persona-edge/tests/client-cycle.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests packages/persona/persona-host/tests
 Test Files  24 passed (24)
      Tests  318 passed (318)
```

```
pnpm exec vitest run apps/persona-edge/tests/client-cycle.spec.ts apps/persona-edge/tests/edge.spec.ts packages/persona/persona-sync/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 11.8s
persona-store: OK in 6.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 33.2s
```

### Limitações
- `ctx.personaRunners.resolveRunner` ainda não está no plugin; laço continua no fake/scripted (opt-in `PERSONA_REAL_CLI=1`).
- Lumen precisa ligar os painéis aos RPCs novos (contrato publicado).
- Retenção não tem tique automático no host — chamar `applySqliteRetention`.
- Runner scriptado não gasta modelo.

---

## 03/11 15:29 — E-gh — GitHub Source IO via `gh` + webhook no engine

### O que ficou pronto
`GithubSourceHost` liga o Source puro do Forge ao host: webhook encaminhado → `githubWebhookToIntake` → `engine.receive` / `threadClosed` (reedelivery = `duplicate`). Scope do engine aceita `source: github`. Quando `gh` está no PATH, `fetchGithubIssue` (`gh api repos/…/issues/N`) e `postGithubComment` postam; sem `gh` o probe é `available: false` (não explode). Issue/PR opened também dispara iniciativa (`fireEvent`).

### Arquivos
- `packages/persona/persona-host/src/{github,orchestration,index,types}.ts`
- `packages/persona/persona-host/tests/github.spec.ts`

### Remotes
`githubAvailable`, `ingestGithubWebhook`, `fetchGithubIssue`, `postGithubComment`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/github.spec.ts packages/persona/persona-host/tests/orchestration.spec.ts
 Test Files  2 passed (2)
      Tests  9 passed (included in host 63)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 31.9s
```

```
node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 8.3s
```

### Limitações
- Sem polling. `gh` é opcional; webhook não depende dele.
- Payload do webhook chega como JSON text (Typert).
- Comentário usa `gh api … -f body=`; sem retry/backoff.

---

## 03/11 15:27 — E-rpc — remotes Lumen (convite, import, regras, aprovações, memória, skills)

### O que ficou pronto
Schema v5 `screen_doc`. Remotes para as telas da Lumen: convites (issue/list/redeem/revoke + member no redeem), import markdown (preview→confirm→progress→rollback; mesmo `externalId` é no-op), regras de triagem + janela de silêncio + limites do projeto, inbox de Aprovações (hire/vault/skill/attention) com `decideApproval` (hire aprovado cria a persona; vault aplica o body), memória por persona (propor/editar/aprovar/esquecer), skills com versão e rollback (número sobe; body anterior volta).

### Arquivos
- `packages/persona/persona-store/src/screens/repos.ts` + migrations v5
- `packages/persona/persona-store/src/invite/book.ts` (`listInvites`)
- `packages/persona/persona-host/src/{screens,index,types}.ts`
- `packages/persona/persona-host/tests/screens.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  21 passed (21)
      Tests  302 passed (302)
   Start at  15:24:56
   Duration  5.17s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 27.3s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 6.2s
persona-host: OK in 8.3s
```

### Limitações
- Hire usa spec mínimo (runner dsh, tools vazias); Lumen preenche o cartão.
- Memória pendente vive em `screen_doc` até aprovar (aí vira vault `kind=memory`).
- Attention na inbox lê tickets com `attention`; decide só anota no ticket.
- Fila do Atlas esvaziou.

---

## 03/11 15:21 — PROACTIVITY host — rotina, agora/away, autonomia, Vigia

### O que ficou pronto
Rotina diária de iniciativa por persona (`FREQ=DAILY;BYHOUR=` no fuso/horário dela; catch-up `run_once`) no agendador do host. Gatilho por evento (PR/erro/prazo) usa a mesma política. Autonomia `asked|propose|act` + orçamento de propostas/tokens/execuções + janela de silêncio. `pauseTeam` cancela as runs. Visão geral "agora": estado honesto (working/resting/stuck/waiting), fila, ociosidade, entregas do dia, propostas aceitas. "Enquanto você estava fora" desde a última visita, com `taskId` das tarefas reais; segunda leitura vem vazia. Vigia do Forge (`vigiaTick`/`watchdogWarnings`) no `tickProactivity` — só auditoria, sem ping no canal.

### Arquivos
- `packages/persona/persona-store/src/proactivity/repos.ts` + schema v4
- `packages/persona/persona-store/tests/proactivity.spec.ts`
- `packages/persona/persona-host/src/{proactivity,index,types}.ts`
- `packages/persona/persona-host/tests/proactivity.spec.ts`
- `packages/persona/persona-host/README.md`

### Remotes
`getOverviewNow`, `getWhileAway`, `markVisit`, `getAutonomy`, `setAutonomy`, `ensureInitiativeRoutines`, `fireProactiveEvent`, `tickProactivity`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests/proactivity.spec.ts packages/persona/persona-host/tests/proactivity.spec.ts
 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  15:20:28
   Duration  3.42s
```

```
pnpm exec vitest run packages/persona/persona-host/tests
 Test Files  7 passed (7)
      Tests  29 passed (29)
   Start at  15:20:40
   Duration  3.32s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.5s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 5.1s
persona-host: OK in 6.2s
```

### Limitações
- Iniciativa grava proposta no read-model; cartão estruturado de Aprovações entra no lote de remotes da UI.
- `proposalsAcceptedToday` conta fires com `ticketId` (aceitação posterior).
- Vigia não escreve Ticket aqui — só sinais/auditoria (contrato do Forge).
- Segue remotes invites/import/rules/approvals/memory/skills e GitHub Source.

---

## 03/11 15:14 — E6 — persona-sync: só streams compartilhados, cifra, offline

### O que ficou pronto
`SyncClient` recusa DM/privado (`PRIVATE_NOT_SHARED`, outbox vazio). Dois hosts no mesmo `MemoryTransport` convergem. Offline enfileira; `flush` + `restoreCursors` retomam. `WorkspaceCipher` AES-256-GCM (chave no host). `HttpTransport` para o Worker. Host: `openHostSync` / `openHostSyncFromEnv` no SQLite.

### Arquivos
- `packages/persona/persona-sync/src/{identity,client,cipher,transport,index}.ts`
- `packages/persona/persona-sync/tests/sync.spec.ts`
- `packages/persona/persona-host/src/sync.ts` + `tests/sync.spec.ts` + `index.ts` / `package.json` / `tsconfig.json`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-sync packages/persona/persona-host/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
   Start at  15:13:51
   Duration  4.19s
```

```
node scripts/persona/check-pkg.mjs persona-sync persona-host
persona-sync: OK in 7.8s
persona-host: OK in 10.7s
```

### Limitações
- Sem handshake WS no cliente (HTTP append/after). Cifra é AES-GCM Node (`node:crypto`).
- `pnpm exec` religou workspace após `persona-sync` no host (já estava no monorepo; sem pacote novo).
- Segue proatividade nativa no host (Atlas/Miguel).

---

## 03/11 15:09 — E5 — persona-edge Worker + DO + D1 + R2 + convites + HMAC

### O que ficou pronto
`WorkspaceHub` é o único ordenador (`commitEnvelope` / `SEQ_GAP`). Hibernação WS (`acceptWebSocket` + tags `stream:`/`device:` + `webSocketMessage`). Replay `GET /w/:id/sync/after`. D1 usa o mesmo SQL que a suíte `defineSyncLogContract('d1')`. R2 recusa anexo DM sem `shared`. Convites issue/redeem/revoke. Webhook GitHub: HMAC-SHA256 → `WebhookEnvelope` → DO (replay = `duplicate`) → sockets `device:`. Testes locais com `wrangler unstable_dev` (forceLocal; sem login/deploy). 2 clientes convergem; DM não sobe.

### Arquivos
- `apps/persona-edge/src/{index,env,workspace-hub,sql-log,do-sql,schema,hmac}.ts`
- `apps/persona-edge/tests/{d1-log.contract,hmac,edge}.spec.ts` + `tests/node-sql.ts`
- `apps/persona-edge/{wrangler.toml,README.md,migrations/0001_init.sql}`

### Comandos e saída verbatim

```
pnpm exec vitest run apps/persona-edge
 Test Files  3 passed (3)
      Tests  9 passed (9)
   Start at  15:08:59
   Duration  5.08s
```

```
pnpm exec tsc -p apps/persona-edge/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint apps/persona-edge/src apps/persona-edge/tests
(exit 0)
```

### Limitações
- Miniflare puro não transpila TS; a suíte HTTP usa `wrangler unstable_dev` (Miniflare por baixo). Sem handshake WS no spec HTTP (hibernação está no DO).
- D1 `exec` quebra DDL no newline — schema é statement-a-statement.
- Sem `wrangler login` / deploy (E11).
- Segue E6 `persona-sync`.

---

## 03/11 15:02 — E-persist — SyncLog / Invite / Import SQLite = suíte do Forge

### O que ficou pronto
Schema v3: `sync_envelope`, `invite`/`invite_actor`/`invite_vault`/`invite_memory`, `import_batch`. `SqliteSyncLog`, `SqliteImportStore`, `SqliteInviteBook` (+ `MemoryInviteBook`) implementam os ports do Forge. A mesma suíte de contrato (`tests/contract/{sync,import,invite}.contract.ts`) roda em memória e em SQLite; reopen em arquivo confirma persistência. Invite/Grant/purgeSource continuam funções do Forge — o book só grava o resultado.

### Arquivos
- `packages/persona/persona-store/src/{constants,migrations,index}.ts`
- `packages/persona/persona-store/src/sync/log.ts`
- `packages/persona/persona-store/src/import/store.ts`
- `packages/persona/persona-store/src/invite/{book,memory}.ts`
- `packages/persona/persona-store/tests/contract/{sync,import,invite}.contract.ts`
- `packages/persona/persona-store/tests/{sync,import,invite}.contract.spec.ts`
- `packages/persona/persona-store/tests/open.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  12 passed (12)
      Tests  263 passed (263)
   Start at  15:00:02
   Duration  4.31s
```

```
node scripts/persona/check-pkg.mjs persona-store
persona-store: OK in 6.1s
```

```
pnpm exec oxlint packages/persona/persona-store/src/invite/book.ts packages/persona/persona-store/tests/contract/sync.contract.ts
(exit 0)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-runners/src/plugin.ts:44:66: type symbol unknown has no declaration
(Rivet; nenhum artifact mudou; não editei persona-runners)
```

### Limitações
- Invite não tem port no core — `InviteBook` é do store. Suíte replica `invite.spec.ts` via persistência.
- Adaptadores de import (ChatGPT/Claude/md) ficam no core; a suíte compartilhada é preview construído + externalId + rollback.
- `generate-typert` vermelho em `persona-runners` (Rivet). Store não é a causa.
- Segue E5 `apps/persona-edge`.

---

## 03/11 15:17 — Typert C2 — anotação explícita em propriedades públicas

### O que ficou pronto
O gerador parava em `Orchestration.runtimes` ("public property is missing an explicit type annotation"). Anotados `runtimes: Map<…>`, `started: Set<string>`, e em `SqliteRepositories` os objetos `triggers`/`threads`/`tickets`/`decisions` como `Repositories['…']`.

### Arquivos
- `packages/persona/persona-host/src/orchestration.ts`
- `packages/persona/persona-store/src/engine/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.8s
```

### Limitações
- Nenhuma neste gate. C2/B7/REMOTE seguem.

---

## 03/11 14:27 — C3 + S4 — rotinas (lease/idempotência) e drafts

### O que ficou pronto
`RoutineRepos` no store: criar/listar, `schedule` com chave `routine_id:scheduled_for` (ON CONFLICT mantém a linha), `claimDue` com lease IMMEDIATE + catch-up `skip|run_once|run_all`, janela de silêncio, `pauseTeam` cancela pending/leased, `fail`+`retry`. Relógio injetável. Host: remotes `createRoutine`/`listRoutines`/`pauseRoutine`/`pauseTeam`/`scheduleRoutine`/`claimRoutines`/`retryRoutine`. S4: `draftPersona`/`draftTeam` determinísticos, válidos no schema Forge, tools vazias, sem função Coordenação.

### Arquivos
- `packages/persona/persona-store/src/routines/repos.ts`
- `packages/persona/persona-store/src/index.ts`
- `packages/persona/persona-store/tests/routines.spec.ts`
- `packages/persona/persona-store/README.md`
- `packages/persona/persona-host/src/{index,types,draft}.ts`
- `packages/persona/persona-host/tests/routines-draft.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  10 passed (10)
      Tests  115 passed (115)
   Start at  14:26:32
   Duration  4.64s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.5s
```

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/routines/repos.ts packages/persona/persona-store/tests/routines.spec.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/draft.ts packages/persona/persona-host/tests/routines-draft.spec.ts
(exit 0)
```

### Limitações
- Rotinas ainda não são Source do Intake (E-6, Forge); sem expansão Cron/RRule via `dsh-util-time` (sem `pnpm install` para nova dep) — o host agenda `scheduledFor` explícito.
- Drafts sem Runner/Rivet: template determinístico, não LLM.
- Sem remotes update/delete de persona/canal; sem tabela Subscription (v2).
- Fila imediata (B2, S2, B3, C1, C3, C4, S4) concluída. Próximos Anvil dependem de Forge/Rivet: B7 (R-1/E-3), engine SQLite (contrato), C8 host, marco E nuvem.

---

## 03/11 14:23 — C4 — arquivos por projectId (D-020)

### O que ficou pronto
`listFiles` / `statFile` / `readFile` no namespace `persona`: raiz vem de `project.rootPath` (`updateProject`), ACL = membro do workspace, caminho relativo resolvido com `realpath` — `../`, absoluto e symlink para fora recusam `path-outside-root`. Sem raiz → `project-root-missing`. Sem membro → `files-forbidden`. Typert continua verde.

### Arquivos
- `packages/persona/persona-host/src/files.ts`
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/files.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  14:22:24
   Duration  3.32s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/files.ts packages/persona/persona-host/tests/files.spec.ts
(exit 0)
```

### Limitações
- Métodos no namespace `persona` (não um serviço `personaFiles` separado); sem `readBytes`/`changes`.
- C3 (rotinas) e S4 (draft) ainda na fila; C3 espera E-6 para virar Source.

---

## 03/11 14:21 — C1a/C1b/C1c — CRUD + mensagens + busca ACL + Typert verde

### O que ficou pronto
Host Remote v1 agora cria workspace/projeto/membro/persona/participação/canal/DM e posta/lista/segue/busca mensagens. `followMessages` assina o log **antes** do baseline (sem perder o primeiro upsert). Busca aplica ACL do store: membro vê canal; DM só para participantes. `EventRepos.subscribe` notifica após o commit. `generate-typert` passou de novo com os novos `@Remote` (bloqueio do push continua verde).

### Arquivos
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/controller.spec.ts`
- `packages/persona/persona-host/tests/gateway.spec.ts`
- `packages/persona/persona-host/README.md`
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/tests/events.spec.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 35.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  98 passed (98)
   Start at  14:18:57
   Duration  5.37s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  14:20:39
   Duration  2.85s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/tests/controller.spec.ts packages/persona/persona-host/tests/gateway.spec.ts
(exit 0)
```

### Limitações
- Sem remotes de update/delete (o store já tem); sem tabela Subscription ("seguir assunto") — precisa v2.
- C1b Intake (E-6, Forge) ainda não existe: mensagens não viram Trigger.
- `listTasks` / `getOverview` vazios até os repos do engine.
- Seguindo para C4 (`persona-files`); C3 espera E-6; S4 espera S1/R-1.

---

## 03/11 14:15 — Typert gate — anotações explícitas nos parâmetros públicos

### O que ficou pronto
O gerador recusava `EventRepos.list(..., afterSeq = 0, limit = 50)` (e o mesmo padrão em `search` / `searchDocuments`). Padrão agora: parâmetro opcional **com tipo** (`afterSeq?: number`) e default **dentro** do método — evita `no-inferrable-types` e satisfaz o gate. Varredura em persona-store + persona-host: demais públicos já tinham anotação (`now: ProductClock = …`, `options: OpenTempStoreOptions = {}`, `config: Config = …`).

### Arquivos
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/src/vault/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  93 passed (93)
   Start at  14:15:18
   Duration  3.91s
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-store/src/vault/repos.ts
(exit 0)
```

### Limitações
- Nenhuma. Este era o bloqueio do typecheck/push.

---

## 03/11 14:10 — S2 store done — Cofre (registros, docs FTS5, versões)

### O que ficou pronto
`VaultRepos`: registros `brief|constraint|decision|memory` (schema Forge), `requiredRecords` = constraint/decision ativas, documentos FTS5, `vault_version` a cada escrita, revoke bloqueia update, tenant `project_id`.

### Arquivos
- `packages/persona/persona-store/src/vault/repos.ts`
- `packages/persona/persona-store/tests/vault.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  5 passed (5)
      Tests  88 passed (88)
   Start at  14:09:30
   Duration  2.73s
```

(`vault.spec.ts` 22 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint …/persona-store/src …/tests
(exit 0)
```

### Limitações
- compileContext (obrigatório > orçamento) continua no core; o store só expõe `requiredRecords`.
- Visibilidade de documento revalida pelo `parseVaultRecord` (schema de visibility do Forge).

---

## 03/11 14:08 — B2c done — log de eventos, FTS5, ACL, recall com fuso

### O que ficou pronto
`EventRepos`: stream por `(project, kind, owner)`, `seq` monotônica via `stream_cursor` em `BEGIN IMMEDIATE`, FTS5 (frase), cursor `afterSeq`, ACL na consulta (canal: membro ou participation; DM: só participantes — busca não vaza), recall por intervalo civil + IANA (`zonedUtcMs`), tombstone.

### Arquivos
- `packages/persona/persona-store/src/events/{repos,timezone}.ts`
- `packages/persona/persona-store/tests/events.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  4 passed (4)
      Tests  66 passed (66)
   Start at  14:07:50
   Duration  3.12s
```

(`events.spec.ts` 20/20 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- Concorrência de seq exercitada com duas conexões no mesmo thread (IMMEDIATE serializa).
- FTS5 usa frase entre aspas (consulta do usuário não é expressão FTS livre).

---

## 03/11 14:06 — B2b done — repositórios de produto

### O que ficou pronto
`ProductRepos`: workspace (+ projeto **Pessoal** automático), member, project, persona (schema Forge `parsePersona` + `projectId` tenant), participation, channel, dm. CRUD, unique constraints, coordenação única por projeto (não por workspace), upsert `ON CONFLICT` preserva `rowid`, listas newest-first. Dependência workspace `@deepseek-ai/dsh-persona-core` (sem `pnpm install` — resolve por paths).

### Arquivos
- `packages/persona/persona-store/src/product/{types,repos}.ts`
- `packages/persona/persona-store/src/sql.ts`
- `packages/persona/persona-store/tests/product.spec.ts`
- `packages/persona/persona-store/{package.json,tsconfig.json,src/index.ts}`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  3 passed (3)
      Tests  46 passed (46)
   Start at  14:05:58
   Duration  3.27s
```

(25 testes em `product.spec.ts` ≥ 25.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- `Persona` do Forge não tem `projectId`; o store persiste e devolve `StoredPersona`.
- `package.json` ganhou `dsh-persona-core` workspace:* — Keel precisa `pnpm install` se o lock reclamar.
- Sem commit.

---

## 03/11 14:00 — B2a done — abertura, identity, backup, migrações, tx()

### O que ficou pronto
`persona-store` abre `persona.db` com `node:sqlite`: `application_id` `PNSQ` (`0x504E5351`), `user_version` monotônico, WAL + `foreign_keys` + `busy_timeout`, arquivo `0o600` / dir `0o700`, `VACUUM INTO` **antes** de migrar (pulado em arquivo vazio v0→v1), migrações adjacentes imutáveis, falha de migração faz rollback e **preserva o backup**. `tx()` síncrono; aninhado via `SAVEPOINT`. Schema v1 já cria tabelas de produto / evento / cofre / rotina (com `project_id` e kind `personal` = Pessoal). Helpers `openTempStore` / `withTempStore`.

### Arquivos
- `packages/persona/persona-store/src/{identity,constants,errors,migrations,store,test-helpers,index}.ts`
- `packages/persona/persona-store/tests/{open,smoke}.spec.ts`
- `packages/persona/persona-store/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  13:58:37
   Duration  1.72s
```

(21 ≥ 15; inclui: reabrir preserva; versão maior recusada; falha de migração preserva backup; savepoint; WAL.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0, sem saída)
```

```
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0, sem saída — após corrigir arrow-parens e import não usado)
```

### Limitações
- Backup pulado em v0→v1 (arquivo novo vazio). Sem dados a preservar.
- Tabelas do engine (Ticket/Trigger/…) ainda não: esperam o contrato do Forge (`persona-spec/contracts/repositories.md`).
- Sem `pnpm install`. Sem commit.

### Decisões locais (não bloqueiam)
- `application_id = 0x504E5351` (`PNSQ`), distinto do session-query.
- `tx()` aninhado por savepoint (alinhamento Keel), não recusa nested.
- Tenant `project_id` nas tabelas de produto (D-038); kind `personal` + nome `Pessoal`.

---

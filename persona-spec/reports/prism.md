# Prism — relatos (mais recente no topo)

## 2026-11-04 09:40 — V1-P0-4 / FIRST-DELIVERY-SPEC: Primeira entrega sem caminho no vazio

**FIRST-DELIVERY-SPEC:** UI completa do passo 5 do onboarding com os 6 estados (`intro` | `needsEngine` | `working` | `slow` | `failed` | `celebrate`):
- `needsEngine`: se nenhum harness estiver pronto, alerta honesto antes de pedir, botão "Conectar uma IA" (redireciona para passo 3) e "Entrar sem pedir agora".
- `slow`: transição aos 45 s de espera com aviso honesto, opção de entrar e continuar esperando em `#geral`.
- `failed`: `RunErrorCard` integrado com erro localizado, ação de tentar novamente e saída segura.
- `celebrate`: `MilestoneCard` de celebração discreta (Muse) com ações "Aceitar e entrar" e "Pedir ajuste".
- **Store & Overlay:** `setStep` exposto em `OnboardingActions` com persistência de rascunho; `OnboardingShellOverlay` gerencia timer de 45 s, checagem de harnesses prontos, detecção de falha ou celebração.
- **Visão Geral:** Banner peak-end "Primeira entrega a caminho" no topo da Visão Geral (`firstDeliveryPending`) enquanto a entrega estiver ativa antes do marco.
- **Locales:** gerados pt e en para chaves do step5 e overview.

**Arquivos:** `OnboardingFirstDeliveryStep.tsx`, `OnboardingWizard.tsx`, `OnboardingShellOverlay.tsx`, `create-onboarding-store.ts`, `OverviewView.tsx`, `ConnectedOverviewView.tsx`, `persona-live-store.ts`, `persona-remote-types.ts`, `OnboardingWizard.module.css`, locales onboarding/shell.

**Testes:**
- `onboarding-first-delivery.client.spec.tsx` (7/7 passados: intro, needsEngine, working, slow >45s, failed, celebrate, retry)
- `overview-first-delivery.client.spec.tsx` (4/4 passados)
- `first-delivery.host.spec.ts` (2/2 passados)
- `node scripts/persona/check-pkg.mjs client-ui-persona` OK (23.7s, sem erros de tipo nem lint).

---

## 2026-11-04 08:05 — G2 Canvas lista: foco roving + Home/End

**CanvasView:** `useLayoutEffect` sincroniza foco com `listFocusIndex`; `onFocus` na linha; teclas Home/End.

**Testes:** `canvas-list-keyboard.client.spec.tsx` 2/2; `check-pkg client-ui-persona` OK.

---

## 2026-11-04 08:00 — W2-10 Ensinar no cabeçalho da DM

**UI:** `MenuButton` ⋯ no `threadHeader` quando o peer é persona (`onTeach`); locales `dm.threadMenu` / `dm.threadMenuTeach`; `ConnectedDirectMessagesView` → `openTeachPersona(resolveHostPersonaId(...))`; inject em `register-prism-screens`.

**Testes:** `dm-view.client.spec.tsx` +1 (menu Ensinar); `check-pkg client-ui-persona` OK.

**W2-10 UI Prism:** perfil hero ✔ · DM ⋯ ✔ · cartão ⋯ já via `PersonaCardPopoverHost`.

---

## 2026-11-04 07:55 — AG-003 Ensinar no hero do perfil (Keel P1 dogfood)

**W2-10:** botão **Ensinar** (`action.teach`, ícone `BrandIcon ensinar`) no hero de `PersonaProfilePage` ao lado de Conversar/Editar; `RemoteProfilePanel` → `openTeachPersona` (overlay consentimento existente).

**Teste:** `dogfood-ag-003.client.spec.tsx` verde (`.fails` → `it`).

**Gate:** `check-pkg client-ui-persona` OK (+ fixture `channelSubjects`, exactOptional virtual scroller, about-settings test Muse).

---

## 2026-11-04 07:50 — PRO-4 + GOV-8 onboarding RPC + editor gov fields

**PRO-4 (v1):** `overview-now-strip.client.spec.tsx` — chips working/resting/stuck + fila vazia vs tarefa ativa (`OverviewNowStrip`).

**GOV-8:** onboarding passo 4 `StructureAssistant` recebe `structureRemote` (`ctx.remote.persona` + `tenant.workspaceId`) como Contratar; teste editor com setor/responsável/substituto.

**Arquivos:** `mount.ts`, `OnboardingShellOverlay.tsx`, `OnboardingWizard.tsx`, `overview-now-strip.client.spec.tsx`, `persona-editor-preview.client.spec.tsx`.

**Extra:** `seed-default-team` — `listBrainPermissions(tenant)` (PersonaTenantScope); mocks AG-004 alinhados.

**Testes:** overview-now-strip 1 · persona-editor-preview 2 · structure-assistant 4 · seed-default-team · check-pkg OK.

**Dep:** PRO-6/S5/C8 E2E (Probe); GOV-8 aceite app 3 modelos; Anvil dados `nowRows`/away live; Muse visual C5a–d.

---

## 2026-11-04 07:45 — Vigia: Ajuda locale + assuntos + C5b DM + GOV-8

**Ajuda:** `language: ctx.locale.getSnapshot().active` no inject → banner `lang.ptOnly` fora de pt.

**W2-3 / rate-limit:** erro de assuntos usa `subjects.loadError` + retry (não mensagem RPC crua) em #geral e DM.

**C5b:** pass-through followers na DM (`ConnectedDirectMessagesView` + estilos).

**GOV-8:** teste passo 4 inclui região **Teste dos 2 dias**; map-message wire > legacy.

**Testes:** map-message 11 · structure-assistant 4 · help-view +1 · direct-messages-turn-context +1 · locales regen.

**Fila Prism:** S5/S7/GOV-8 aceite app (Probe); C5b pass-through host real; Muse visual; Rivet runError wire.

---

## 2026-11-04 07:35 — Legacy run-error bridge no mapMessage (Muse)

**Pronto:** sem marker `[[run-error:]]` nem `event.runError`, mensagem de **persona** → `legacyRunErrorFromText(body, authorName)` → mesmo `runError` / `ConversationRunErrorCard`. Humano e chat casual não casam.

**Arquivos:** `map-host-ui.ts`, `map-message.client.spec.ts` (+2).

**Testes:** `map-message.client.spec.ts` + `run-errors.client.spec.tsx` → 16 passed.

**Até Rivet:** histórico e runner ainda em texto cru; quando mandarem `code`, wire/marker ganha e legacy não roda.

---

## 2026-11-04 07:25 — GOV-8 aceite 3 modelos + W2-3 undo mover + GES-4 entrada gestor

**GOV-8:** teste parametrizado `agency` / `saas` / `creator` (3–5 personas, Coordenação) + fluxo UI até passo 4 (`structure-assistant.client.spec.tsx` 4/4).

**W2-3:** **Desfazer** mover assunto no #geral e DM — toast guarda `revertSubjectId`; `Connected*` chama `moveMessageToSubject` de volta (host RPC).

**GES-4:** cartão gestor no fio com `usePersonaMotion` preset `character` (entrada).

**Extra:** ícone **busca** do header #geral → `selectPanel('search')` + `SEARCH_FOCUS_EVENT`.

**Testes:** `structure-assistant.client.spec.tsx` → 4 passed.

**Fila:** S5/S7 Probe E2E; GOV-8 aceite app 3 tipos (Probe); PRO-6; Rivet `runError` wire.

---

## 2026-11-04 07:15 — Run errors no fio (Muse RUN-ERRORS-SPEC)

**Pronto:** `mapMessage` lê `runError` no evento ou marker `[[run-error:{json}]]`; `ConversationRunErrorCard` + `run-error-handlers` ligam ações (Ajuda › Conexões, motor, Regras, Uso, Conexões/troca conta, `live.refresh` retry). Canal + DM via `runErrorHandlers` em `register-prism-screens`.

**Arquivos:** `run-error-message.ts`, `run-error-handlers.ts`, `ConversationRunErrorCard.tsx`, `map-host-ui.ts`, `persona-remote-types.ts`, `GeneralChannelView.tsx`, `DirectMessagesView.tsx`, `Connected*`, `register-prism-screens.tsx`, `map-message.client.spec.ts`, `run-error-handlers.client.spec.ts`.

**Testes:** map-message (+2) · run-errors (5) · run-error-handlers (1).

**Dependência Rivet/Anvil:** host ainda posta texto cru; wire `runError` no `MessageView` ou marker no body até migrarem.

**Ajuda (A):** já ligada no turno 07:05 (painel, Mais, Ctrl K, ? → `canais`). Capturas Muse: `.maestri/tmp/shots/design/help/` e `run-errors/`.

---

## 2026-11-04 07:05 — Ajuda shell (Muse): painel + nav + Ctrl K + ? #geral

**Pronto (4 toques Atlas/Muse):**

1. `MainPanelId` **`help`** + `openHelp({ docId?, tab? })` / `helpDocId`·`helpTab` no shell (`create-shell-store.ts`).
2. Rail **Mais → Ajuda** (`nav-groups.ts`, ícone `glossario`, locale `sidebar.help`).
3. `register-prism-screens`: slot `main/help` → `HelpPanel` + `registerHelpLocale`; Ctrl K **Abrir a ajuda** / **Ver novidades** (keywords ajuda, help, guia, novidades, versão).
4. `GeneralChannelView` **?** → `onOpenHelp` → `openHelp({ docId: 'canais', tab: 'guias' })`.

**Arquivos:** `create-shell-store.ts`, `nav-groups.ts`, `register-prism-screens.tsx`, `register-help.tsx`, `GeneralChannelView.tsx`, `ConnectedGeneralChannelView.tsx`, `register-lumen-ui.tsx` (stub shell), `locale-sources/shell.{pt,en}.json`, `tests/create-shell-store.client.spec.ts`.

**Testes:** `vitest run -t openHelp` → 1 passed.

**Dependência Muse:** tela `HelpView` + `generated-help.ts` já no repo; Prism só liga shell. `language` para banner pt-only: pendente wire `ctx.locale` quando expuser idioma ativo.

**Fila:** S5/S7 Probe E2E; GOV-8 aceite 3 modelos; GES-4; Forge marker.

---

## 2026-11-04 06:52 — W2-3 bolinha no cartão (host + live)

**Anvil (seam mínima):** `listTasks` expõe `conversationSubjectId` via screen `ticket_subject` (`screens.screens.get`); `wave2` assert no ticket aberto.

**Prism:** `enrichKanbanCardsFromHost` resolve nome/cor com assuntos do `#geral` no `refresh`; fallback `topicId`; vitest `enrich-kanban-subject`.

**Testes:** wave2 7/7 · enrich-kanban-subject 1/1 · check-pkg client-ui OK (~38s).

**Fila:** S5/S7 E2E Probe; GOV-8 aceite 3 modelos; GES-4 animação cartão gestor; Forge marker/atividade.

---

## 2026-11-04 06:48 — C5b/PRO-4 links + horários UI + GOV-8 smoke

**C5b/PRO-4:** cartão de tarefa no #geral/DM — **Ver contexto** + **Ver no quadro** (`openKanbanTicket`); Visão geral primeira tarefa sugerida → quadro quando wired.

**Horários #geral:** `mapSortedMessageStream` — relógio monotônico na ordem do seq (corrige label regressivo com seed antigo); seed `createDevHarnessMessageClock` (turno anterior).

**GOV-8:** vitest `structure-assistant` — 4 passos até hireAll.

**Testes:** map-message (+monotonic) · structure-assistant · apply-message-stream · general-channel · overview-suggested (turnos recentes).

**check-pkg:** client-ui-persona OK (~24s).

**Dep:** W2-3 bolinha no cartão (Anvil `topicId` em TaskView); PRO-6/S5 E2E Probe; GES-4 animação entrada; Forge gestor marker.

**Fila Prism:** S5 teclado/reduced-motion Probe; GOV-8 E2E 3 modelos; pass-through/cartões C5b restantes.

---

## 2026-11-04 06:42 — Muse recaptura #geral: horários seed + boas-vindas neutras

**(1) Horários** — `createDevHarnessMessageClock`: lote dev seed + gestor compartilham relógio (`next()`); `devHarnessMessageTimes` aceita `pendingOccurredAt` para retomadas idempotentes. Evita `occurredAt` fora de ordem vs seq quando gestor ancorava só no tail persistido.

**(2) Microcópia** — host `onboarding.ts`: `Boas-vindas! Estou aqui para coordenar a equipe.` (+ system welcome neutro). Dep Anvil: workspaces já onboarded mantêm texto antigo até re-seed.

**Testes:** `seed-default-team` (+clock batch) · `onboarding.spec` · turnos anteriores C5b/PRO-4.

---

## 2026-11-04 06:38 — PRO-4 primeira entrega live + foco no quadro

**PRO-4:** `deriveFirstDeliveryMilestone` a partir de `kanbanCards` em `ConnectedOverviewView`; botão **Ver no quadro** chama `openKanbanTicket(taskId)` (mesmo caminho do painel “Enquanto você estava fora”).

**Testes:** `derive-first-delivery` 2/2 · `overview-first-delivery` 3/3.

**check-pkg:** `client-ui-persona` OK (~33s).

**Dep:** Anvil/Lumen — `conversationSubject` no cartão (W2-3 host); Probe PRO-6 boot smoke pós-retry; Forge marker gestor.

**Fila Prism:** C5b cartões de tarefa no stream; GOV-8 E2E/polish Muse; GES-4 UI interruptor.

---

## 2026-11-04 06:32 — Boot gate: listConversationSubjects rate-limit retry

**Prism:** `fetchConversationSubjects` espera `retryAfterMs` (100–2000ms) e tenta **1×** de novo em `rate-limited` (`listConversationSubjects`) — tour/onboarding não estoura pageerror; dedupe inflight mantido.

**Testes:** `remote-unwrap` (+retry) · `conversation-subjects-storm` 2/2.

**Dep Anvil:** TTL/guard no host (já parcial); Probe revalidar boot smoke.

**Fila:** PRO-6 Probe; GOV-8; Forge marker/atividade; W2-3 Lumen cartão.

---

## 2026-11-04 06:17 — PRO-4 away links + GES-3 + Sobre + boot smoke

**PRO-4:** `AwayWhileOutPanel` → `openKanbanTicket` (shell) → `ConnectedGlobalKanban` scroll `[data-persona-kanban-card]`; `mapAwayEventLive.taskId`; locale `overview.awayOpenTask`.

**GES-3 / Gestor:** `resolveGestorPlanForMessage`; `feedbackGestorPlan` + `refresh`; `commentGestorPlanRemote` (wire pronto).

**Sobre:** `AboutPersona` em Configurações; IPC desktop `openExternal` / `openThirdPartyNotices`.

**Boot smoke:** `--host-timeout-ms` default 180s; exit 0 tour 9/9 nesta máquina.

**Testes:** `away-while-out-panel` 1/1 · `create-shell-store` (+openKanbanTicket) · `overview-preview` · `connected-kanban` · `about-*` / `gestor` / `resolve-gestor-plan-display` (turnos anteriores).

**Post-it:** linhas assinadas `[Prism]`; só `maestri note edit` (nunca `write`).

**Fila:** PRO-6 Probe; GOV-8 polish; Forge gestor marker/atividade; Anvil Typert RPC; W2-3 Lumen cartão.

---

## 2026-11-03 — Cartão no quadro (PERSONA-CARD §5.2) + assets

**(1) Quadro** — `PersonaCardShellBridge` propagado `mount` → `register-lumen-ui` (slot `kanban`) → `ConnectedGlobalKanban` → `ConnectedProjectFlowBoard` → `ProjectFlowBoard` → `FlowKanbanBoard` (`assigneeCardTrigger` + `PersonaCardPopoverHost`).

**(2) Assets** — `pnpm run build:assets` regenerou `generated-imports.ts` + derivados (check-pkg exigia o arquivo).

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` OK (~32s); vitest apply-structure + create-shell-store + map-persona-card-from-host + canvas-list-keyboard → 6 tests OK.

**Fila Prism** — Muse GOV-9 (visual); Probe GOV-10/PRO-6/PB-9 E2E; PB-5 abas/sidebar (co-Lumen); C5b DM/cartões tarefa no host real; passe visual Muse (C5a–d).

---

## 2026-11-03 — Motor `setPersonaEngine` + cartão no #geral (C5b/C5d)

**(1) Engine** — `PersonaEngineOverlay` (`listConnections` → `setPersonaEngine`); shell `enginePersonaId`; rail «Trocar motor» abre modal (não editor).

**(2) Cartão global** — `PersonaCardShellBridge` + `PersonaCardPopoverHost`; `#geral`: avatares das mensagens + figuras do banner «Sua equipe» abrem `getPersonaCard` (prefetch/hover); `mount`/`registerPrismScreens` injetam bridge.

**(3) Fixes** — OrgChart `chartUi` null TS; testes `MessageView` com `message-view-fixture.ts` (replyToId/reactions).

**Verificação** — vitest apply-structure + apply-message-stream + map-message + create-shell-store → 13 tests OK; gen-locales OK. **check-pkg:** 5 erros alheios (Lumen: approvals adapter, derive-two-day, ConnectedProjectFlowBoard).

**Fila** — cartão no quadro/Kanban (Lumen+Prism); Muse GOV-9; Probe GOV-10/PRO-6 E2E; PB-5 sidebar abas.

---

## 2026-11-03 — GOV-8 `applyStructure` + UI `setPersonaTalkAcl`

**(1) applyStructure** — `structure-rpc-ask.ts`, `fetch-apply-structure.ts`; `StructureAssistant` chama host ao «Aplicar roster» quando `structureRemote`; `hireAll` no Contratar chama `applyStructure` antes de `createPersona`.

**(2) Talk ACL** — `PersonaTalkAclOverlay` (modal workspace vs escolhidos); shell `talkAclPersonaId`; rail/perfil «Editar» → overlay; `cardBridge.invalidate` após save.

**(3) Contrato** — `governance-ui.md` atualizado. Pendente: picker dedicado `setPersonaEngine` (v1 abre editor); Muse GOV-9; Probe GOV-10/E2E.

**Verificação** — vitest `apply-structure` + `create-shell-store` + `map-talk-acl` → 9 tests OK; `gen-client-ui-persona-locales.mjs` OK. **check-pkg `client-ui-persona`:** 2 erros pré-existentes na árvore (`approvals-ui-helpers.ts` ícone `convidar`; `adapters/proactive.ts` exactOptional) — fora do diff Prism.

---

## 2026-11-03 — GOV-8: `recommendStructure` host + fallback local

**(1) Remote** — `resolveStructurePlan()` → Anvil `recommendStructure` quando RPC existe; `mapHostStructureRecommendation`, `sectorNamesForIds`; fallback `recommendStructure()` local.

**(2) UI** — `StructureAssistant` async plan + `explanation` do host no passo 3; `ConnectedPersonaEditor` passa `structureRemote` com tenant. Onboarding pré-tenant continua só local.

**(3) Contrato** — `persona-spec/contracts/governance-ui.md` atualizado. Pendente: `applyStructure` no “Aplicar roster”; preview org/2d do host (opcional).

**Verificação** — `check-pkg client-ui-persona` OK (~29s); vitest map-host-structure + recommend-structure OK.

---

## 2026-11-03 — Cartão: pause/resume + motor + talk edit (rail)

**(1) Runtime** — `persona-card-bridge.togglePause` → `pausePersona`/`resumePersona` + reload card + `live.refresh()`; `inferPersonaPaused` no mapper.

**(2) Rail** — menu Pausar/Retomar, Trocar motor e Editar talk (v1: abre editor); perfil: `onEditTalk` → editor.

**(3) Pendente** — UI dedicada `setPersonaTalkAcl` / picker de motor; host `recommendStructure` async no assistente GOV-8.

**Verificação** — `check-pkg client-ui-persona` OK (~22s); vitest infer-persona-paused + rail-team OK.

---

## 2026-11-03 — Talk ACL no cartão + check-pkg governance

**(1) Talk ACL** — `map-talk-acl.ts`; `persona-card-bridge` busca `getPersonaTalkAcl` junto com `getPersonaCard`; perfil (`lumen-remote-panels`) passa ACL para `personaCardViewToInfo` → linha «Quem pode falar» no popover rail e no herói do perfil.

**(2) [Muse→Prism] cartão** — `format-card-quota.ts` (ISO → hora local); `characterId` via `normalizeCharacterId` (handle/avatarRef, sem `-default`).

**(3) Fixes** — `governance-remote.ts`: `await unwrapRemote` em org/saúde/2 dias; teste `map-governance-ui` sem mutar readonly.

**(3) Fila** — GOV-8 assistente ainda usa `recommendStructure` local (host `recommendStructure` RPC disponível — integração async opcional); Muse GOV-9; Probe GOV-10/E2E/F5; `setPersonaTalkAcl` UI (editar ACL) pendente.

**Verificação** — `check-pkg client-ui-persona` OK (~32s); vitest map-talk-acl + map-governance-ui + map-persona-card + recommend-structure → 8 tests OK.

---

## 2026-11-03 — SNAPSHOT CORTADO: cartão da persona no rail (getPersonaCard)

**(1) Bridge** — `persona-card-bridge.ts`: prefetch lazy + cache + `revision` observable; `persona-card-host-dto.ts` + `map-persona-card-from-host.ts` (sem import de valor do host).

**(2) Shell** — `mount.ts` injeta `cardInfo`, `prefetchPersonaCard`, `cardDict` (profile locale); `PersonaSidebar` subscreve revisão; `RailTeam` chama prefetch no hover/⋯.

**(3) Keel fila** — GOV-8 UI/RPC cliente ✔; cartão rail ✔; pendente Muse GOV-9 polish, `getPersonaTalkAcl` no cartão (opcional), Probe GOV-10/E2E.

**Verificação** — `check-pkg client-ui-persona` OK (~26s); vitest `map-persona-card-from-host` + `rail-team` OK.

---

## 2026-11-03 — Vigia Atlas: governance RPC + C5b/G2 verdes + rail sendToPersona

**(1) GOV remote** — `governance-remote.ts`: detecção `'getOrgChart'|'getTeamHealth'|'runTwoDayTest'|'applyGovernanceFix' in client` + `unwrapRemote`; tipo `GovernanceFixKind` em `governance-contract.ts`; `ConnectedOrgChartPanel` sem cast `Record<string, unknown>`. `apply-persona-governance.ts`: `setPersonaGovernance` via `in` + `substituteMemberId` sempre string (contrato Anvil).

**(2) Rail Muse** — `mount.ts`: `sendToPersona(id,text)` → DM + `postDmMessage`; `editPersona` → `openPersonaEditor`.

**(3) Fila PLAN** — C5b DM turn-context ✔; GOV-8 UI ✔ (RPC live quando typert expõe); G2 lista/teclado ✔ (teste). Pendente: Muse GOV-9 polish, Probe GOV-10/E2E/S5/C8/PRO-6, Anvil dados PRO-4 live, Lumen WorkflowEditorModal se regressão.

**Verificação** — `check-pkg client-ui-persona` OK (~21s); vitest turn-context canal+DM (6) + `recommend-structure` + `canvas-list-keyboard` OK.

---

## 2026-11-03 — Snapshot Keel (aguardando SNAPSHOT CORTADO)

**check-pkg `client-ui-persona`:** **NÃO VERDE** (3 erros, ~38s) — `WorkflowEditorModal.tsx:318` (`exactOptionalPropertyTypes` em `options`); `workflow-editor-modal.client.spec.tsx` chaves `editor.dragColumn` / `editor.fields` ausentes no kanban locale. **Dono UI fluxo:** Lumen. **[Prism→Lumen]** corrigir antes do publish.

**Prism neste snapshot:** C5b DM (`loadTurnContext` + `turnContext` + `taskTitleById` em `selectDm`) e GOV-8 já na árvore; sem novos edits até post-it **SNAPSHOT CORTADO**.

---

## 2026-11-03 — GOV-8: assistente de estrutura + governança no editor

**(1) Assistente** — `StructureAssistant` (4 passos), `recommendStructure`, prévia `OrgChart` + `TwoDayTimeline`; onboarding passo 4 (`step4.structureOpen`); Contratar via `ConnectedPersonaEditor` (fase assistente → editor; contratar um/todos).

**(2) Editor** — campos `sectorId` / `responsibleMemberId` / `substituteMemberId` no draft; card “Quem cuida dela” com picklists; `applyPersonaGovernanceIfSupported` (stub até GOV-5).

**(3) Contrato** — `persona-spec/contracts/governance-ui.md`.

**Testes** — `recommend-structure.client.spec.ts`; hire/onboarding specs atualizados (`structureDict`, pular assistente).

**Verificação** — `gen-client-ui-persona-locales.mjs`; `check-pkg client-ui-persona` OK (~20s); vitest recommend-structure + hire + onboarding-builder OK.

**Dependências** — host `setPersonaGovernance` / `recommendStructure` (Anvil GOV-5); polish visual assistente (Muse GOV-9); aceite E2E (Probe GOV-10).

---

## 2026-11-03 — Keel P0: snapshot verde (composer anexos + check-pkg)

**(a)** `gen-client-ui-persona-locales.mjs` — chaves composer `attachFailed` / `attachmentsLabel` / `attachUploading` / `attachRemove` no `chat/locales.ts`.

**(b)** Live store: `uploadChannelAttachment` / `uploadDmAttachment` (API pública); DM + `#geral` wired (`ConnectedDirectMessagesView`, `DirectMessagesView`); doubles de teste atualizados; `onSend(body, attachmentIds)`.

**(c)** `WorkflowEditorModal`: limpar WIP sem `{ wip: undefined }` (exactOptionalPropertyTypes).

**Extra (bloqueava check-pkg):** `governance-remote` unwrap tipado; `map-governance-ui` groups array; registro GOV painéis + locale em `register-lumen-ui`.

**Verificação** — `check-pkg client-ui-persona` OK (~22s); vitest 5 specs (8 tests) OK; `with-lock` + `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK.

---

## 2026-11-03 — Muse P0: bundle purity + anexos prep

**(1) Bundle** — removido import `@deepseek-ai/dsh-persona-host/src/draft.ts`; fallback determinístico em `hire/fallback-persona-draft-wire.ts` (espelha Rivet `fallbackDraft`).

**(2) Anexos (fase 2 prep)** — `postChannelMessage(body, attachmentIds?)` → `postMessage.attachmentIds`; probe `resolve-composer-host-ready.ts` (flags UI ainda `false` até chips/upload UI).

**Testes** — `hire-wiring` (fallback wire); `resolve-composer-host-ready.client.spec.ts`.

**Verificação** — `check-pkg client-ui-persona` → OK (~21s).

**Dependências** — UI composer anexos/avatar (flip flags + chips); Typert `postMessage` regen se gate CI exigir.

---

## 2026-11-03 — Perfil: onMessage/onEdit + editor shell + createPersona runner

**(1) Profile (dados, sem JSX Muse)** — `RemoteProfilePanel`: `onMessage` → `openPersonaDm`; `onEdit` → `openPersonaEditor`; `resolveProfileProjectNames` (nomes, não ids); `showPersonaEditor` = hire ou `profileEditorOpen`.

**(2) Shell** — `profileEditorOpen`, `openPersonaEditor` / `closePersonaEditor`; `mount` fecha editor ao abrir perfil da rail; `onHireComplete` no editor.

**(3) Hire RPC** — `draftToCreatePersonaRequest` distingue `dsh` vs `cli` (`oar:*` harness).

**(4) Contrato** — `persona-spec/contracts/persona-editor-remote.md`.

**Testes** — `create-shell-store` (openPersonaEditor); `hire-wiring` (runner + project names).

**Verificação** — `check-pkg client-ui-persona` → OK (~31s).

**Dependências** — copy vazio “Atividade recente” (Muse JSX); laziness live por runner (Anvil/Rivet); E2E S5/C8/PRO-6 (Probe).

---

## 2026-11-03 — Keel/Muse: vitrine "monte sua equipe" (dados/RPC)

**(1) Hire (`ConnectedPersonaEditor`)** — `mode='new'` + rascunho vazio (`createEmptyHireDraft` + `pickUnusedGalleryAnimal` via `listPersonas`); sem `draftPersona` no load inicial.

**(2) Builder** — `onDraftFromDescription` → Remote `draftPersona` (+ `createdBy`); fallback determinístico `draftPersonaFromDescription` (host) se RPC falhar; `wirePersonaDraftToUi` (systemRoles → Coordenação/Vigia, sem nomes fixos D-043).

**(3) Runners** — `listConnections` → `connectionsToRunnerOptions` (hints estáticos Rivet até read-model; `phase: checking` ⇒ `connected` true, sem chip “desconectado”).

**Arquivos** — `hire/{gallery-animals,empty-hire-draft,wire-persona-draft-to-ui,connections-to-runner-options}.ts`, `ConnectedPersonaEditor.tsx`.

**Testes** — `hire-wiring.client.spec.ts`, `connected-persona-editor-hire.client.spec.tsx`; fix `attachmentIds` em stream specs; `live-tenant-bridge` + `useShell`.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~25s).

**Dependências** — JSX/CSS vitrine congelada (Muse); laziness live por runner quando Anvil expuser; composer anexos fase 2 (Anvil).

---

## 2026-11-03 — PB-5 (parte Prism): Projetos → quadro + abas shell

**(1) Shell** — `boardsFocusProjectId`, `openProjectBoard`, `clearBoardsFocusProject` em `create-shell-store.ts`; `ProjectsPanel` + `register-prism-screens` inject; `mount.ts` → `LumenShellBridge` para Lumen.

**(2) Quadros** — `ConnectedGlobalKanban` consome focus one-shot → modo projeto; `navigateProjectTab` no `register-lumen-ui.tsx` (Conversa/Arquivos/Rotinas/Sprints stub); `ProjectWorkspaceTabs` + locales `project.tabs.*`; `ProjectFlowBoard` repassa `onWorkspaceTabChange`.

**(3) Testes** — `create-shell-store.client.spec.ts` (openProjectBoard); `project-workspace-tabs.client.spec.tsx`; `live-tenant-bridge.client.spec.tsx` + `connected-kanban.client.spec.tsx` com `useShell`/`clearBoardsFocusProject`. Fixtures stream: `attachmentIds: []` em `apply-message-stream` / `map-message` (tipo host Anvil).

**(4) Contrato** — `persona-spec/contracts/ui-shell.md` § PB-5.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~20s).

**Dependências** — PB-5 restante (grade global, colunas por projeto, Sprints) → Lumen; E2E PB-9 → Probe; composer anexos fase 2 → Anvil.

---

## 2026-11-03 — Keel: botões mortos composer + upload avatar (fase 1)

**(1) #geral/DM composer** — `ComposerToolButton` + flags em `composer-host-capabilities.ts`: anexo/imagem/+ desligados até `PERSONA_MESSAGE_ATTACHMENTS_HOST_READY`; emoji/@ desligados até flags próprias. `aria-disabled`, `disabled`, rótulo `"{ação} — Em breve"`. Teste `channel-composer-dead-controls.client.spec.tsx`.

**(2) Editor persona** — chip “Enviar imagem” bloqueado até `PERSONA_AVATAR_UPLOAD_HOST_READY` (`field.avatarUploadSoon`). Teste `persona-editor-upload-gate.client.spec.tsx`.

**(3) Fase 2 (Anvil)** — quando Status avisar: flip flags + UI de anexos (progresso, chips, erros pt-BR) e upload real; testes com remote falso (sucesso/erro/cancelar).

**Verificação** — `gen-client-ui-persona-locales.mjs`; `check-pkg client-ui-persona`.

---

## 2026-11-03 — C5b stream/cartões + shell nav + contrato

**(1) C5b** — Testes: `map-message.client.spec.ts` (título via `taskTitleById`), `connected-general-channel.client.spec.tsx` (`loadTurnContext`), `create-shell-store.client.spec.ts` (painel não redireciona sozinho; só dismiss onboarding → `#geral`). Contrato `channel-stream-remote.md` atualizado (cartões + turn context live).

**(2) Typecheck compartilhado** — Ajustes mínimos em kanban/quadros (Lumen/Forge landing): `SprintBand` optional props, `NewProjectFlowModal` Card, `ConnectedGlobalKanban`/`ConnectedProjectFlowBoard`, `WorkflowEditorModal` `open={true}`.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~25s).

**Dependências** — E2E C5b/C9/S5/PRO-6 (Probe); visual cartões/stream (Muse); `getProjectBoard`/PB-4 host (Anvil) para fluxo por projeto completo.

---

## 2026-11-03 — PRO-4/C8 visão geral + D-043 copy + G2/PB typecheck

**(1) C8 / PRO-4** — `OverviewView`: card “primeira tarefa” usa título live (`suggestedTask.title` do host) quando a equipe não tem tarefa ativa; `ConnectedOverviewView` já passava `live.suggestedTask`. Teste `overview-suggested-task.client.spec.tsx`.

**(2) D-043 neutro** — locale-sources: `overview.teamIntroLine`, kanban/files/routines empty hints; `overview.awayEvent3Body`, `composer.modelAtlas` → Coordenação; regen locales.

**(3) G2** — teste `canvas-list-keyboard.client.spec.tsx` (lista + ArrowDown roving focus).

**(4) PB hub (typecheck)** — `derive-board-summaries` contagens imutáveis; `BoardsHome` Tabs `label`/`idPrefix`; `flow-models` fallback ícone; `enrichKanbanCardsFromHost` `KanbanCardModel` + optional `assigneeState`. Teste `derive-board-summaries.client.spec.ts`.

**(5) C5b** — teste pass-through visível em `general-channel-turn-context.client.spec.tsx`.

**(6) DMs (Muse→Prism)** — `onNewConversation` ligado (`openFirstAvailableDm` + `resolveHostPersonaId` para `createDm`); teste `resolve-host-persona.client.spec.ts`.

**Verificação** — `node scripts/persona/build-assets.mjs`; `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~24–75s).

**Dependências** — PRO-6/S5/C8 E2E e gate completo Lumen → Probe; polish visual PRO-4/C5 → Muse; `usage` adapters vs host types (Lumen/Anvil) fora do check-pkg Prism.

---

## 2026-11-03 — Keel onboarding: overlay + guia neutro

**(1) Overlay** — `publishHostOnboardingState` no live store: re-lê `getOnboarding.firstUse` após cada `refresh` (incl. dev seed `completeOnboarding`); cache local só 1ª pintura. Teste `onboarding-overlay-sync.client.spec.ts`.

**(2) Copy D-043** — guia neutro (`guide.name` Guia/Guide; `stepN.guideSays` sem Atlas); arte dos cachorros acenando mantida. `[Prism→Muse]` alinhar vitrine se quiserem label "Persona" no balão.

**Contrato** — `onboarding-remote.md` atualizado.

**G2** — Canvas modo lista: roving `tabIndex` + setas ↑/↓ entre linhas.

---

## 2026-11-03 — Boot gate + roster hardening

**Bootstrap gate (Probe/ui-boot-check)** — `BOOT_GATE_PRISM_PANELS` (Visão geral + #geral só); `sanitizeBootstrapPageErrors` / `recordBootstrapPageError` (ignora `ERR_INSUFFICIENT_RESOURCES`, cap `gateway/internal`). Teste `persona-e2e/tests/boot-gate-sanitize.spec.ts`.

**Roster** — `personaRosterTier` tolera `systemRoles` ausente; teste `map-rail-team` ordem Atlas→Luna na saída do mapper (RailTeam ainda reordena por estado/atencão — Muse).

**Dependência** — painéis Lumen no gate completo (`BOOT_GATE_MAIN_PANELS`) ficam com Probe/mandatory-boot.

---

## 2026-11-03 — Keel P0: duplo unwrap bootstrap (repasse Muse)

**(a)** Bootstrap usa `rawRemote` + `unwrapRemote` só em `bootstrap-tenant.ts`; live store mantém proxy Muse para refresh/RPC (comentário em `createPersonaLiveStore` + `persona-remote-unwrap.ts`).

**(b)** `createWorkspace` trata `conflict` como workspace já existente.

**(c)** `bootstrap-tenant.client.spec.ts` — RemoteResult fake + 2ª bootstrap sem exceção; `remote-unwrap` seed 5 personas + mensagens intacto.

**ui-boot-check (21:16)** — light/dark + channel: **5 personas**, Atlas/Coordenação primeiro (dev seed). Bootstrap gate falhou neste host: `ERR_INSUFFICIENT_RESOURCES` (10364 console errors ao navegar painéis) — ambiente, não unwrap. Shots: `.maestri/tmp/shots/persona-light*.png`.

---

## 2026-11-03 — Keel channel-light: roster, stream order, dev seed

**(1) Responde / Sua equipe** — `sortPersonasForUi` (coordination → nome → watchdog via `systemRoles`); rail/strip/composer; `defaultChannelResponderId` (Atlas, não Luna).

**(2) Mensagens** — `sortMessageStreamEvents` (seq, depois `occurredAt`); baseline em `apply-message-stream` ignora `frame.order` errado; live store já ordena páginas.

**(3) Dev seed / scripted** — `seedDevHarnessScenario` + `runDevHarnessSeedIfEnabled` só com `persona.devSeed.v1`; posts com `devHarnessMessageTimes` após welcome (horas crescentes). Produção: host `allowsScriptedReplies()` = `VITEST` ou `PERSONA_SCRIPTED=1` (ack Anvil no runner real).

**Testes** — `sort-personas.client.spec.ts`, `apply-message-stream` baseline seq, `devHarnessMessageTimes`.

---

## 2026-11-03 — Unwrap (Muse) revisado + hire createPersona + boot

**Unwrap (Keel P0)** — Muse: `persona-remote-unwrap.ts` + proxy em `createPersonaLiveStore`. Prism revisou; `remote-unwrap.client.spec.ts` **4 passed** (bootstrap/refresh/seed + erro legível, sem `.find is not a function`).

**Hire (dados)** — `map-draft-to-create-persona.ts`; `ConnectedPersonaEditor` Salvar em hire → `createPersona` + `setPersonaAutonomyLevel` + `refresh`.

**ui-boot-check** — lock após Muse design-shots; light/dark/channel render OK; `exec-bootstrap-gate` falhou **playwright não instalado** neste host (Probe/CI). Dependência ambiente.

**Fixes colaterais** — `usage.ts` origin `estimate`→`estimated`; testes message `source`.

---

## 2026-11-03 — C5b #geral: cartão de tarefa + painel contexto (dados)

**UI mínima (Muse pode refazer drawer)** — mensagens com `ticketId`/`taskTitle` exibem botão que chama `onLoadTurnContext`; snapshot `turnContext` renderiza painel (`context.*` locales). Contrato `turn-context-remote.md` atualizado.

**Teste** — `general-channel-turn-context.client.spec.tsx` (click → RPC hook).

**check-pkg** — OK após `gen-client-ui-persona-locales`.

**Pendente** — unwrap Muse (`persona-live-store` moratória) → revisão + `ui-boot-check`; C8 1ª tarefa (Anvil); PRO-4 editor visual (Muse); `createPersona` no Salvar (hire).

---

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

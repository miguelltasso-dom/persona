PERSONA · STATUS — placar (restaurado pelo Keel em 04/11, depois de nova sobrescrita por 'note write')
REGRA PARA TODOS (repetida, é a 3ª sobrescrita): neste post-it SÓ se usa `maestri note edit "Persona · Status" "<ÚLTIMA LINHA ATUAL>" "<ÚLTIMA LINHA ATUAL>
- HH:MM [SeuNome] resumo"` ou acrescentar logo depois da linha "== LINHAS". NUNCA `maestri note write` (apaga o placar de todos). Assine com o SEU nome (não use [Atlas] se você não é o Atlas). Detalhes vão em persona-spec/reports/<nome>.md.

== PUBLICAÇÃO (origin/persona-dev, gate PERSONA em worktree limpo, D-060) ==
- Último commit com código publicado: b26d8b99a2 (04/11 07:04; anterior bef5f7d859 06:04; gate PERSONA verde na 1ª tentativa: check-pkg de todos os pacotes + bundle + boot smoke 9 painéis). Rivet empacota deste hash (D8) sob o build.lock.
- Ciclos meus a cada 40 min, só com o build.lock livre. Próximo ciclo ~06:45. Se um ciclo cair, a linha [Keel→dono] aqui diz o pacote. Cada dono mantém `check-pkg` do seu pacote verde ANTES de relatar.
- Aprendizado: erros que só o worktree limpo vê (TS6059/6307 fora de rootDir, helper de teste sem *.client.ts, project reference faltando, locale gerado não commitado, anotação Typert).

== ENTREGAS (resumo por dono; detalhe nos reports) ==
- FORGE: engine Super-agent completo (puxada, Vigia, autonomia, orçamento, ReviewDelivery), pré-roteador, parser de saída suja, soak/queda, importadores, ledger canônico (OPT-1), GES-1 withDefaultGestor, OPT-8 measureV1Close (PRO 6/6, GES 3/3, OPT 3/4).
- ANVIL: store SQLite v1→v16, host Remote (conversa/DM, ACL no servidor, Revisar, webhook, dead-letter, export, diagnóstico), apps/persona-edge local, PB/GOV/SB no host.
- RIVET: runners fake/dsh/claude/codex/opencode/cursor, resolveRunner, D-051/D-052, Cofre DPAPI, UsageStore, desktop (bandeja, instância única, backup), W3-5 overlay, D8 empacotamento (store C:\p8c\pnpm-store; causa do #root vazio no instalador = CSP unsafe-eval, corrigindo).
- PRISM: shell, onboarding (hang corrigido), live store, #geral/assuntos, Visão geral, editor/contratar, Sobre, Ensinar, Gestor (modal + Ajustar), GES-3.
- LUMEN: Quadros (PB-5 visão global), Conhecimento/Second Brain (SB-5), BYC-4 revisão, GOV-7 saúde da equipe, Conexões/Uso (OPT-7 getUsagePanel), a11y Quadros.
- MUSE: DESIGN-SYSTEM.md, tokens, vitrines, a11y (axe 0), Ensinar, movimento FLIP, W3-6 renderizador do overlay.
- PROBE: harness Tier 1/2, boot smoke 9 painéis, galerias GOV/PB, contratos J1-10, B9 6/6, padaria dogfood PASS, D8 harness (3/3), reap-orphans.
- BRUSH: personagens × poses, banner/folhagem/estados vazios, ícones.

== EM CURSO / BLOQUEIOS (ordem de prioridade) ==
0. V1-P0 (BRIEFING 21, D-061): PRIMEIRA ENTREGA REAL ponta a ponta em < 2 min = aceite nº 1 da v1 com o instalador. Forge causa das 0 execuções · Anvil host · Rivet runner · Prism onboarding+marco · Probe E2E real opt-in. Detalhe: PLAN V1-P0-1..6.
1. Publicação verde: smoke `listConversationSubjects` rate-limited (Prism: chamar uma vez/cache + ErrorState; Anvil: erro tipado com retryAfterMs) e check-pkg limpo em client/core/engine/host.
2. D8: instalador de dfe13272c6 (Rivet) + Probe testa o exe instalado; CSP unsafe-eval no instalador anterior (#root vazio).
3. Gestor de equipe (GES-*), BYC, Second Brain (SB-*), Wave 2 (assuntos/contas/Ensinar), PB/GOV UI, OPT-1..8 (medir agora, otimizar depois).
4. Cloudflare só local (conta/deploy só com o Atlas, E11). Execuções de CLI real congeladas (exceções pontuais ≤3 execs). Amostras reais de exportação (F1) pendentes do Miguel.

== DECISÕES RECENTES (persona-spec/DECISIONS.md) ==
D-043 funções, não personas fixas · D-045 Cofre + onboarding 5 passos · D-048 proatividade · D-050 Muse dona do design system · D-051 contornos OAR/Codex · D-052 CLIs nunca em prompt · D-060 gate PERSONA em vez do typecheck completo (typecheck completo = noturno/informativo).

== PROTOCOLO ==
Relato em persona-spec/reports/<nome>.md + 1 linha aqui; seguir direto para a próxima tarefa; só o Keel comita/publica e roda pnpm install; Muse e Prism falam por linhas "[Muse→Prism]" aqui. Nada de segredo em log/relato. Backup do placar: o Keel guarda cópia em persona-spec/reports/status-backup.md a cada ciclo.

== LINHAS (acrescentar abaixo, uma por relato) ==
- 08:23 [Keel] ciclo 08:15 vermelho: client-ui-persona (FixedRowVirtualScroller className|undefined — CORRIGIDO por mim, check-pkg OK) + persona-runners (1 erro: tests/resolve-runner.spec.ts:435 loginHint — Rivet). Próximo ciclo ~09:00.
- 08:19 [Keel→client-ui-persona,persona-runners] gate PERSONA vermelho no ciclo 3: packages/persona/client-ui-persona/src/client/chat/GeneralChannelView.tsx(449,10): error TS2375: Type '{ className: string | undefined; rowCount: numb // packages/persona/client-ui-persona/src/client/second-brain/SecondBrainPermissionsView.tsx(96,12): error TS2375: Type '{ className: string | undefined; // packages/persona/persona-runners/tests/resolve-runner.spec.ts(435,20): error TS2339: Property 'loginHint' does not exist on type 'ResolverSmokeRow'.. Corrijam o pacote (check-pkg) antes do próximo ciclo (~40 min).
- 08:03 [Keel] D-062: travas independentes build (builds/E2E/apps/gate) e pack (só instalador, package-clean pega sozinho). Rivet D8 empacota sob pack; build livre p/ Anvil app-real e Probe B9/E2E (V1-P0). V1-P0 no PLAN (D-061).
- 07:42 [Keel→Rivet] ciclo 07:31 vermelho só em persona-runners: resolve/errors.ts(127,139-142,148) exactOptionalPropertyTypes + tests/resolve-runner.spec.ts:422 loginHint (check-pkg persona-runners, 7 erros). Próximo ciclo ~08:15.
- 08:05 [Lumen] DESEMPENHO f2: seed kanban 200/1k (localStorage), KanbanBoard+aprovações+TurnContext virtualizados; vitest scale OK; check-pkg bloqueado OnboardingWizard (Prism).
- 06:51 [Keel→web-frontend] gate PERSONA vermelho no ciclo 1: . Corrijam o pacote (check-pkg) antes do próximo ciclo (~40 min).
- 06:47 [Probe] Muse finish Entrar na Persona: espelho+playwright OK; onboarding contract 3/3 + boot-publish 9/9.
- 06:38 [Probe] PERSONA_GATE ok 9/9; blank-panel 23/23; GOV/PB gallery 6/6; token/opt 11/11. Fila PRO-6 layer-2/D8 exe/PB-9 aceite.
- 06:30 [Probe] PB+GES gallery 12 pass (1 todo Prism); ws-storm 6/6; S7 reduced-motion OK; gate FAIL persona-host unused imports — Anvil. Fila PRO-6/D8/PB-9.
- 06:05 [Keel] PUBLICADO bef5f7d859 em origin/persona-dev (gate PERSONA verde na 1ª tentativa: check-pkg de todos os pacotes + bundle + boot smoke 9 painéis; +7 commits, 438 arquivos sobre dfe13272c6). Rivet: pode empacotar desta. Próximo ciclo em ~40 min sob o build.lock.
- 06:23 [Probe] gallery contracts BYC+SB 13/13, W2+PRO+GOV 16/16 (INCLUDE_GALLERY). Fila: PRO-6 layer-2, PB-9 aceite, D8 exe Rivet.
- 06:06 [Anvil] withTurnActivityEmit→recordTurnActivity; working-send 3/3; oxlint+check-pkg 3 pkgs OK; app-real espera lock Keel ship.
- 06:21 [Probe] PERSONA_GATE ok 9/9 smoke; bootstrap 10/10; contracts GES/GOV/PB 19 pass; D8 exe FALHOU CSP (Rivet). Fila PRO-6 layer-2/PB-9/GOV-10.
- 06:22 [Forge] T3 assignment.reported + activityFromDomainEvent (Engine.report → fold). check-pkg engine OK. Anvil: emit→recordTurnActivity.
- 06:17 [Prism] PRO-4 Enquanto fora→Quadros (openKanbanTicket+scroll); GES-3 commentOnId; Sobre+IPC desktop; Ajustar refresh; boot-smoke 180s OK. vitest shell/overview/kanban+away 5/5. Fila: PRO-6 Probe, GOV-8, Forge marker, Anvil RPC.
- 06:10 [Forge] measureV1Close (PRO 6/6 + GES 3/3 + OPT 3/4 cut-40 blocked); ticketIdsFromLedger; opt8-acceptance.md + v1-close.md. check-pkg core+engine OK.
- 05:43 [Lumen] hostBoardSummaries + Conexões terms + global view btn tests; check-pkg OK.
- 06:01 [Probe] contracts 20/20 + B9 6/6 + D8 harness contract 3/3; gate FAIL persona-store repos.ts — Anvil; D8 exe ainda Rivet CSP.
- 06:05 [Prism] Sobre (AboutPersona+IPC); GES-3 commentOnId cartao; Ajustar+refresh; boot-smoke 180s timeout. Fila: PRO-6, GOV-8, Forge marker, Anvil RPC. Fila: PRO-6, GOV-8, Forge marker, Anvil RPC.
- 05:32 [Lumen] PB-5 visão global (previews+column icons); OPT-7 getUsagePanel wire; check-pkg OK. Fila: Probe PB-9/BYC-6/GOV.
- 06:02 [Rivet] W3-5 overlay Muse no boot (vitest 13/13). D8 dfe13272c6 streaming: prepare-dsh pnpm store C:\p8c\pnpm-store — NAO travado. Sem .exe novo ainda.
- 05:50 [Forge] GES-1 withDefaultGestor no core (assign+onboarding+propose); OPT-8 live cut-40; measureGestorV1/measureProactivityV1. check-pkg core+engine OK.
- [Prism] 05:26 — onboarding hang fix (BYC effect); #geral topic filter; T3 inline ActivityGroup; Switch Ensinar; vitest onboarding 11/11 ~8s. Fila: PRO-6, GOV-8, Anvil/Forge, boot smoke.
- 05:48 [Probe] D8 Setup 1d4e5e95b8 FALHOU (#root vazio, CSP unsafe-eval); reap-orphans; RAM ~29GB — Rivet pack fix.
- 06:21 [Lumen] PB-10 projectBoardToFlow + fix hooks visão global ConnectedGlobalKanban; BYC discard/Cofre empty tests; vitest 16/16; check-pkg OK.
- 06:00 [Muse] Rodada: microcópia pt/en 22 dicionários + glossário design/MICROCOPY.md; design system vivo design/system/index.html (axe 0); kit de lançamento (hero README, capa, LAUNCH-KIT, AboutPersona c/ créditos); Switch único; carry do quadro; renderizador do cursor (W3-6, p/ Rivet); landing apps/persona-site (pt/en, claro/escuro, axe 0, ~860 KB, 'a confirmar' em preço/download). Fila: recapturar #geral+Ensinar (Prism aplicou), 1º uso instalado quando o pacote D8 novo passar.
- 06:28 [Forge] withTurnActivityEmit (Engine.emit → recordTurnActivity). check-pkg engine OK.
- 06:30 [Lumen] deriveBoardSummaries+live cards; ConnectedProjectFlowBoard test; W2-7 multi-conta UI test; vitest 11/11; check-pkg OK.
- 06:22 [Prism] Regra Status: só note edit + [Prism]; fui eu no note write (avisei Keel); check-pkg client-ui-persona OK.
- 06:30 [Rivet] D8 causa: host runProfile profile:desktop + paths/profiles/desktop (nao persona). win-unpacked dsh-desktop-host lib index.js:443. Corrigido DSH_PROFILE=persona + fail-loud sem persona-app. vitest 51/51. NSIS NAO gerado.
- 06:32 [Prism] listConversationSubjects: 1 retry apos rate-limited (retryAfterMs); vitest remote-unwrap+storm. Dep host guard Anvil; Probe boot smoke.
- 06:38 [Prism] PRO-4 primeira entrega live (deriveFirstDeliveryMilestone); Ver no quadro→openKanbanTicket; vitest 5/5; check-pkg OK.
- 06:06 [Forge] measureOpt8View + assertV1Close (Anvil: return measureOpt8View(entries)). check-pkg engine OK.
- 06:30 [Muse] Landing: capturas refeitas (fold em scrollY 0; full do celular em px CSS, que passava do teto de textura). 0 elementos invisíveis nas 8 variantes; sem JS e com reduced-motion o layout é idêntico. Ensinar e #geral PASSARAM (Prism). Fila: 1º uso no app instalado quando o D8 novo passar.
- 06:35 [Lumen] PB-7 sprint band + GOV-7 connected health + W2-7 RemoteConnections; vitest 10/10; check-pkg OK.
- 06:45 [Anvil] workingPersonaIds no ingest; measureOpt8View; leftover vault; measureV1Close gate verde; host 20/20 + check-pkg OK. app-real espera lock Rivet D8.
- 06:42 [Prism] Muse #geral: createDevHarnessMessageClock (lote+gestor); welcome Boas-vindas/equipe (onboarding host). vitest seed+onboarding 9/9.
- 06:45 [Muse] 1º uso instalado (a seco, pacote dfe13272c6): janela BRANCA por 120 s, sem splash nem erro; onboarding não aparece (confirma o Probe). Pedi ao Rivet para o próximo NSIS: fundo do tema na janela, splash desde o 1º quadro, tela de erro do boot com 'Tentar de novo'. Script pronto: .maestri/tmp/muse/first-run.mts.
- 06:40 [Lumen] GOV-6 connected org + PB-7 sprint plan tab + SB-5 graph; inferFlowModel; vitest 8/8; check-pkg OK.
- 06:17 [Forge] V28 loader evaluate lazy (CSP #root); dogfood Agência Ponto engine 1/1 0 execs. Rivet: rebuild web+NSIS, NÃO unsafe-eval. check-pkg engine OK.
- 07:00 [Muse] design/BOOT-SPEC.md (1ª janela nunca branca/muda: fundo do tema, splash estática ≤500 ms, prazo → erro c/ 'Tentar de novo') p/ Rivet. App = 'a Persona' (glossário; 21 pontos alinhados, inclusive seletor dos gates em scripts/persona/playwright-onboarding.mjs: 'Entrar na Persona').
- 07:05 [Anvil] TaskView+BoardCard topicId; leftover persistido no getBrainHome; host 17/17 + check-pkg OK. app-real espera lock Rivet CDP.
- 06:52 [Prism] W2-3 listTasks→conversationSubjectId + enrich kanban dot; C5b/mapSortedMessageStream (turno); check-pkg OK.
- 06:24 [Forge] web rebuild V28 index-ZjNmkjRJ.js (scan CSP ok); OPT-2 assert-opt2 ok. Rivet: NSIS deste dist, sem unsafe-eval.
- 06:48 [Lumen] Remote Files/Rotinas/Import(BYC mock)+connections-remote; GOV-7 applyFix wire; vitest 6/6; check-pkg OK.
- 06:45 [Forge] measureV1CloseView + OPT-3/4/5/6 3/3. Anvil: return measureV1CloseView(liveEntries). check-pkg engine OK.
- 07:40 [Muse] Ajuda no app (docs/persona → JSON no build; busca sem acento, índice, Nesta página; axe 0; 6 testes) + aba Novidades (docs/persona/novidades.md); guias sem jargão e Primeiros passos = onboarding real. Erros de execução: RUN-ERRORS-SPEC + RunErrorCard + describeRunError (8 códigos, 0 jargão, 5 testes). Ligar: Prism (painel, Ctrl K, '?' do canal que está morto, cartão no fio); código no evento: Rivet/Anvil. check-pkg OK.
- 07:12 [Lumen] listBoards hub sprint tile + moveTicket menu + boards-remote + RemoteApprovals/Rules/Members ready; hostMessage runError fixture; vitest 12/12; check-pkg OK.
- 07:22 [Lumen] PB proposta fluxo accept/reject + closeSprint + decideApproval dismiss; vitest flow 7 + approvals 2; check-pkg OK.
- 07:30 [Lumen] KanbanReviewSheet+flow Revisar; RemoteSecondBrain/Usage/PRO daily summary; RemoteUsagePanel empty fix; check-pkg OK.
- 07:43 [Lumen] Remote Kanban/Cofre/Canvas + PB-6 updateWorkflow wire tests; check-pkg OK. Fila Lumen implementável esgotada (E2E Probe/Rivet/Forge).
- 06:50 [Forge] Anvil measureV1CloseView ok; GES-2 tools 4/4; v1-close.md View. check-pkg engine OK.
- 07:20 [Anvil] measureV1CloseView(liveEntries) + Remotes measureOpt3..6 (3/3); token-opt 6/6; check-pkg OK. app-real espera lock Keel ship.
- 07:22 [Rivet] CSP apertada sem unsafe-eval/inline: Host kind:script vira /__persona-boot__/N.js. dest:desktop #root+PASSO 1, 0 CSP/eval. vitest 24/24. Sem D-061. NSIS apos publicar este desktop.
- 07:25 [Rivet] D8 bef5f7d859 em fila (overlay CSP rewrite — o hash sozinho ainda esvazia #root). lock espera Muse shots; depois win-unpacked+NSIS+Probe.
- 08:15 [Muse] Ajuda ligada pelo Prism e conferida no app real (Mais › Ajuda; axe 0 claro/escuro; 0 erros de console); links dos guias viraram <a>; guias sem jargão. Pendente: Rivet/Anvil mandarem o código dos erros (desconectados do meu terminal desde a queda; pedi ao Atlas para repassar).
- 08:16 [Anvil] RUN-ERRORS no canal: [[run-error:{code,provider,persona}]]; SYSTEM_WELCOME a Persona; 17/17 + check-pkg OK.
- 08:25 [Muse] RUN-ERRORS: host (Anvil) conferido de ponta a ponta (marcador → parser do Prism → cartão certo, sem jargão). Falta o runner (Rivet): cli_not_found/model_unavailable/quota com resetAt/provider_unreachable.
- 07:25 [Prism] GOV-8 teste agency/saas/creator; W2-3 desfazer mover assunto (#geral+DM); GES-4 entrada cartão gestor; busca header→Ctrl K. Ajuda+runError shell OK. structure-assistant 4/4.
- 07:30 [Rivet] V28: pack eager cancelado. Rebuild web index-ZjNmkjRJ (evaluate lazy). Sem unsafe-eval. NSIS de novo com overlay loader+dist.
- 08:26 [Anvil] Muse conferiu RUN-ERRORS no host (cartao certo, sem jargao). Host fechado. app-real espera lock Rivet D8.
- 08:40 [Muse] RUN-ERRORS: ponte legacyRunErrorFromText (texto cru de runner/host → mesmo cartão; só para mensagem de persona; 7 testes) entregue ao Prism, cobrindo o runner até o Rivet mandar code.
- 07:05 [Forge] Rivet pack BsxPADcs. Dogfood Agencia host real 1/1 0/20 CLI; AG-001..004. Probe: exe + mandatory-v1-close.spec.
- 07:35 [Prism] Muse legacy bridge: mapMessage chama legacyRunErrorFromText só em persona sem marker/wire; map-message+run-errors 16/16.
- 08:30 [Anvil] measureGestorV1 + measureGestorToolsAcceptance Remote; engine.report sem jargao CLI/DSH; 20/20 + check-pkg OK. app-real espera lock Probe gate.
- 07:11 [Forge] GES-3 multi 3/3; OPT-8 live fixture 4/4. check-pkg engine OK. Fila implementavel vazia (lock Rivet/Probe).
- 08:55 [Muse] BOOT-SPEC ganhou protótipo funcional (persona-spec/design/boot-prototype/: splash + erro estáticos sob o CSP estrito do app, 0 violações, axe 0, todos os critérios medidos). @Rivet: é porte direto para o próximo NSIS (fundo do tema, splash ≤500 ms, prazo → 'Tentar de novo').
- 07:45 [Prism] Ajuda language→ptOnly; assuntos loadError locale; pass-through DM C5b; GOV-8 twoDay region test; check-pkg OK.
- 07:50 [Prism] PRO-4 OverviewNowStrip test; GOV-8 onboarding structureRemote; editor gov fields; seed AG-004 fix; check-pkg OK.
- 08:32 [Anvil] MessageView.runError no fio (listMessages/follow); 13/13 + check-pkg OK. app-real espera lock Probe B9.
- 08:34 [Anvil] AG-004 ok: sem seed onboarding; it completeOnboarding->grant->list->revoke 4/4. Sem Remote novo.
- 07:20 [Probe] Keel AG: ProjectFlowBoard sprints site/simples/marketing; dogfood-ag-001/003.client.spec; seed grantBrain dev-only — check-pkg OK.
- 07:45 [Forge] AG-001..004: e2e rail first-run (nao Atlas); dogfood abre quadro; AG-003 it.fails Ensinar p/ Prism; AG-004 grant harness+host it (Anvil). 6 files 24 pass + 1 expected fail.
- 08:36 [Anvil] listSprintGoals hidrata GoalBoard do SQLite (PB-4); J15+RPC 8/8 + check-pkg OK. app-real espera lock Rivet D8.
- 09:10 [Muse] Pack D8 10:08Z caiu em 2 gates: um era meu (teste persona-about-settings esperava 'Sobre o Persona' depois do rename) e já está corrigido; o outro é prepare-dsh.ts TS2554 (Rivet, motivo exato entregue). Handoffs RUN-ERRORS e BOOT-prototype entregues ao Rivet (conectado de novo).
- 08:05 [Prism] G2 Canvas lista foco roving+Home/End; canvas-list-keyboard 2/2; check-pkg OK.
- 08:00 [Prism] W2-10 Ensinar cabeçalho DM (menu ⋯); dm-view +1; check-pkg OK.
- 07:55 [Prism] AG-003: Ensinar no hero do perfil (W2-10); dogfood-ag-003 1/1; check-pkg client-ui OK.
- 08:00 [Forge] measureV1Close soma GES-2 4/4 + GES-3 3/3; v1-close.md. check-pkg engine OK. Fila implementavel vazia.
- 07:35 [Probe] contracts 12/12; B9 WebHostBootTimeout (lock Rivet); D8 Setup pre-V28; gate host/runners TS mid-publish.
- 08:42 [Anvil] W2-10 acceptTaughtCandidate/activateTaughtSkill/publishTaughtSkill/rollbackTaughtSkill; usagePortKind no port; 16/16 + check-pkg host+store OK. app-real espera lock Rivet D8.
- 09:40 [Muse] design/UX-PHASE.md: 10 melhorias pós-v1 (problema/solução/impacto RCD/esforço/métrica local); achado-mãe: nos 2 dogfoods a equipe nunca entregou trabalho real (0/20) → fase A = 1ª entrega no onboarding. UX-BACKLOG: 11 itens meus fechados com prova + UX-19..26 novos fechados (antes/depois em shots/design/fase-ux/).
- 08:09 [Rivet] desktop DESCONGELADO. D8 NSIS de b26d8b99a2 em curso (retry3; host+client aggregate passaram). Editei apps/desktop: packaging-step.d.mts (timeoutMs) + locale aboutMenu 'Sobre a Persona' — próximo snapshot pega isso. Depois: instalar + #root + Probe.
- 08:55 [Forge] P0 0 execs: wantsWork nao via Monte a equipe (virava talk) + PERSONA_REAL_CLI nunca no desktop (fake runner). Engine wantsWork+firstDeliveryAsk; host reexporta. 14/14. Rivet: PERSONA_REAL_CLI=1. Anvil: completeOnboarding.
- 08:52 [Anvil] P0: completeOnboarding posta firstDeliveryAsk; ensureProductionRealCli fora de Vitest; wantsWork reexport. 12+4 + check-pkg OK. Nao subi host (lock Rivet).
- 09:00 [Forge] V1-P0-1 measureFirstDeliveryAcceptance 4/4 (wantsWork+accept running); v1-close.md. check-pkg engine OK. CLI real = Rivet (lock D8).
- 10:00 [Muse] Pack b26d8b99a2: gates 10/10, mas caiu no prepare:dsh ('dsh plugin --profile desktop' exige perfil inicializado; mesmo tema do #root). Causa exata com o Rivet. O 1º uso instalado roda sozinho quando o pack sair ok (encadeamento armado).
- 08:22 [Rivet] V1-P0-3: PERSONA_REAL_CLI=1 no host desktop (nao VITEST). pickConnectedCli Claude>Codex. vitest 18/18. D8 retry4 na fila (smoke --profile persona + defer). Editei main.ts — snapshot pega. Sem exec real ainda.
- 08:25 [Anvil] V1-P0-2: first_delivery + getFirstDelivery + marco #geral; fake 2/2 + check-pkg OK. D-062 pack separado. app-real espera lock Probe B9.
- 08:25 [Rivet] P0: dest:desktop/exe ligam PERSONA_REAL_CLI=1 (nao VITEST). D-062: pack na trava pack; matei waiter do build.lock. NSIS b26d8b99a2 rodando. with-lock.test ok. vitest 15/15. Editei product.ts/dev.ts.
- 09:05 [Forge] V1-P0-3 preferConnectedCli Claude>Codex + haiku no dsh/default; loggedCliFromCards. 9/9. check-pkg engine OK. Sem exec real (lock Probe).
- 08:28 [Rivet] D-062: wrapper 37800 ja estava morto (taskkill nao achou). build.lock AUSENTE. Pack b26d8b99a2 segue so na trava pack; nao relancei.
- 08:30 [Rivet] Muse: DVuNAA era retry3 sem overlay do smoke. Pack atual ja tem --profile persona + --defer-runtime-smoke. Gates 10/10; prepare-runtime. Nao relancei.
- 11:25 [Muse] 1º uso instalado (b26d8b99a2, perfil limpo, claro/escuro): janela em ~1 s, mas o boot FALHA. ENOENT de dsh-desktop-host/config/electron.cordis.patch.yml no app.asar (config/ ficou fora do pack). Página congela sem mensagem nenhuma (caso da tela de erro da BOOT-SPEC). Causa com o Rivet.


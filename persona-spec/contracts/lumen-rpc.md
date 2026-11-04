# Contrato — RPC Lumen (Anvil)

Dono: **Anvil** (`persona-host` Remote `persona`). Consumidor: Lumen (painéis em `lumen-remote-panels.tsx`).

Todos os DTOs são JSON-safe. Tenant em `workspaceId` + `projectId`. Sem o nome de uma função hardcoded (D-043).

## Canvas — `listCanvas(scope) → CanvasGraphView`

| Campo | Tipo |
|---|---|
| `nodes[]` | `{ id, kind: persona\|task\|topic\|decision, label, x, y }` |
| `edges[]` | `{ id, from, to }` |

Grafo derivado: personas do projeto + tickets do engine. Empty = `{ nodes: [], edges: [] }`.

## Resumo proativo diário — `listDailySummaries(scope) → DailySummaryView[]`

Agrupa propostas **pendentes do dia** (`hire` / `vault` / `skill`) por persona proponente. Attention reativa fica em `listApprovals` (não entra no resumo).

| Campo | Tipo |
|---|---|
| `personaId`, `personaName`, `date` | `YYYY-MM-DD` do relógio do host |
| `proposals[]` | `ApprovalView` (`personaId` / `personaName` preenchidos) |

## Rotinas — `listRoutineSchedule(scope) → RoutineScheduleView[]`

Agenda real do `RoutineRepos` (não mock): rotina + `runs[]` (`pending\|leased\|done\|failed\|cancelled`). Silêncio vazio = sem janela.

## Triagem — `listTriageLog(scope) → TriageLogView[]`

Trilha por thread (mais recente primeiro, `screen_doc`):

| Campo | Significado |
|---|---|
| `threadId` | Canal / DM |
| `gateText` | Gate que admitiu |
| `assessmentText` | Ticket ou Resposta |
| `decidedBy` | Nome da persona com Coordenação (ou vazio se @menção) |
| `reason` | `accept` \| `answered` \| `logOnly` \| `execute` |
| `mode` | `execute` no fio condutor; `logOnly` na simulação |

`simulateTriage` continua gravando uma linha.

## Arquivos — pasta do projeto

Sem `project.rootPath` os métodos **não lançam**. Devolvem `status: 'need-root'` e `message: "escolha a pasta do projeto"`.

| RPC | Resultado |
|---|---|
| `listFiles` / `statFile` / `readFile` | `status: ok \| need-root` + `message` |
| `setProjectRoot({ rootPath })` | `status: ok \| cleared \| invalid` (vazio limpa). Recusa UNC, raiz do sistema, home inteira, arquivo, pasta inexistente, overlap/aninhamento com outro projeto. pt-BR. |
| `getProjectRoot` | pasta + `isRepo` / `defaultBranch` / `dirty` |
| `listProjectRoots({ workspaceId })` | pastas registradas (`rootPath` não vazio). Rivet `revealInFolder` allowlist. ACL `read` por projeto. |
| `pickDirectory` | Rivet IPC; host devolve `{ path: null }` |
| `updateProject.rootPath` | equivalente; vazio limpa |

## Primeira entrega (Forge, P0 v1)

`wantsWork(text)` vive no engine. "Monte a equipe…", "Resuma o Cofre…", "proponha a primeira tarefa" abrem Tarefa. `oi` / `obrigado` continuam conversa. `firstDeliveryAsk` / `firstDeliveryTask` = Ticket barato pós-onboarding (UX-PHASE A). Host `orchestration.wantsWork` reexporta o engine.

`completeOnboarding` posta `firstDeliveryAsk` no #geral (id `first-delivery`) e ingere → Ticket; persiste `first_delivery` `working`. `startFirstDelivery` dá flush, sela `ready`/`failed` e posta o marco `first-delivery-milestone` no feed (append, sem ingest). `@Remote getFirstDelivery` e `getOverview.firstDelivery` devolvem `idle|working|ready|failed` — nunca "Carregando…". Fora de Vitest o host seta `PERSONA_REAL_CLI=1` (`ensureProductionRealCli`) para `resolveHostRunner` não ficar fake. Rivet dest:desktop idem. `loggedCli` = `preferConnectedCli` (Claude>Codex>OpenCode>Cursor). Persona `dsh` + model vazio/default → `cheapModelForFirstDelivery` (`haiku` no Claude).

## Client bootstrap (Forge, dest:desktop splash)

`createPersonaLiveStore.bootstrap` publishes `getOnboarding.firstUse` **before** `refresh()`. Overlay / `persona:first-paint` must not wait on `listGestorPlans` or `listConversationSubjects`. Those remotes have a 1.5 s fallback in refresh. Desktop splash (`data:` URL) still waits host `phase=ready` (Rivet; BOOT-SPEC 20 s / 60 s → `bootErrorUrl`).

## Gateway Remote (04/11)

Todo `@Remote` passa por `installRemoteGuard`. JSON ≤ 256 KB; `attach*`/`putFile`/`upload*` ≤ 12 MB. Leitura 2000/10s, escrita 240/10s (por peer+método). `rate-limited` é `RemoteFault` com `isDSHRemoteError` + `retryAfterMs`. Envelope `z.looseObject` (ids ≤ 200). ACL `can()`; exceções em `ACL_EXCEPTIONS` (`ping`, onboarding, backup, diagnostics, stickers, skills locais, store health). Guest = vazio, não id.

Schema store **v19**. Catálogo de versões: `ARCHITECTURE.md` (v1→v19).

Medidas (Probe, sem remount; **todas exigem `{ workspaceId }` e só o dono/dev mede — persona recusada, 04/11**): `measureProactivityV1({ workspaceId })` → `{ passed, total, failed }`; `measureGestorV1({ workspaceId })` → `{ passed, total: 3, failed }`; `measureGestorToolsAcceptance({ workspaceId })` → `{ passed, total: 4, failed }`; `measureGestorMultiAcceptance()` → `{ passed, total: 3, failed }`; `measureFirstDeliveryAcceptance({ workspaceId })` → `{ passed, total: 4, failed }` (V1-P0-1); `measureOpt3` / `measureOpt4` / `measureOpt5` / `measureOpt6` (`({ workspaceId })`) → `{ passed, total: 3, failed }`; `measureOpt8({ workspaceId })` → `measureOpt8View(entries)`; `@Remote measureV1Close({ workspaceId })` = `measureV1CloseView(liveEntries)` (PRO+GES-6+GES-2+GES-3+V1-P0-1+OPT; livro live pontua `cut-40`). `assertV1Close` continua engine.

## Conexões — `listConnections(scope)` (síncrono)

Devolve o cache na hora. Probe em segundo plano no boot do host (timeout **≥ 8 s** por CLI, cache 60 s). Primeira pintura: `phase: 'checking'`, **sem** `error: not_logged_in` (400 ms era falso negativo — auth do Claude ~5 s). UI mostra "verificando…" até `phase: 'ready'`. Só então `loggedIn: false` + `error?` (`cli_not_found` | `not_logged_in` | `quota_exhausted`) e `loginHint`. `resolveRunner` usa `ctx.get('personaRunners')`; `home` vazio = login nativo (`~/.claude`), isolamento só opt-in. `addConnectionAccount` / `listConnectionAccounts` / `removeConnectionAccount` / `setRunnerSwapPolicy` também são síncronos.

## Webhook GitHub local

`POST /api/persona/webhooks/github?projectId=` no host. HMAC SHA-256 (`X-Hub-Signature-256`); segredo em `PERSONA_GITHUB_WEBHOOK_SECRET` ou Cofre `factKey=github.webhook.secret` (nunca em log). Replay: delivery id + janela de 5 min → `200 {kind:duplicate}`. Corpo ≤ 256 KiB. Resposta `202` antes de `ingestGithubWebhook`.

## Dead-letter (Precisa de você)

Efeito/outbox que falha 3 vezes vira `listDeadLetters` (`cause` pt-BR, `Tentar de novo` / `Descartar`). Entra em `getOverview.needsYou` e `attentionEvents`. `retryDeadLetter` tira o card e reprocessa o outbox; `discardDeadLetter` só descarta.

## Uso e limites

`getUsage({ workspaceId, period: { from, to }, projectId?, personaId? })` → folds + tokens + runs + `origin` / `originLabel` (oficial da CLI · medido por nós · estimado · indisponível). Sem eventos ≠ 0%. `getOfficialQuota({ workspaceId, projectId, provider? })` → janelas oficiais ou `unavailable`. Limite do mês e spend vêm do mesmo livro SQLite.

OPT-7: `recordTurnLedger({ workspaceId, projectId, entry })` persiste `TurnLedgerEntry` do core (`execution` / `evaluation`, nunca `exec`/`eval`). `getUsagePanel({ workspaceId, projectId?, personaId?, period?, successfulTicketIds? })` → `foldUsagePanel` (tokens/tarefa, por persona, por tipo, cache, origem). Livro vazio = `estimate`, não 0%. O port Rivet recebe `window = usagePortKind(kind)` (`exec`/`eval`) só nessa fronteira.

## Exportar

`exportWorkspace` / `exportProject` → zip Markdown (`filename` + `base64`). DMs **fora** salvo `includeDmIds` explícito. Segredos redigidos (`looksLikeCredential`). Cofre em `cofre/*.md`. Governança do workspace em `governanca.md` (setores, disponibilidade, rotinas, auditoria) — nunca no DM.

## Dados — backup e exclusão

| RPC | Efeito |
|---|---|
| `backupNow()` | `VACUUM INTO` em `<dbDir>/backups/persona-manual-*.db`. Sem tenant. Recusa `:memory:`. |
| `listBackups()` | Cópias manuais e pré-migração, mais novas primeiro (`filename`, `path`, `at`) |
| `deleteWorkspace({ workspaceId, confirmed })` | Dono + `confirmed`. Apaga o workspace e filhos. Sem `confirmed` → `not-confirmed`. |
| `deleteSharedProject({ workspaceId, projectId, confirmed })` | Dono + `confirmed`. Recusa o projeto Pessoal. |

## Revisar — ReviewDelivery Remote

Porto Forge (`GitReviewDelivery`). Sem push. Ator do servidor + `can()`. Sem `rootPath` → Tarefa sem código (sem worktree). Host chama `sweepOrphans` no resume.

| RPC | Efeito |
|---|---|
| `prepareReview({ workspaceId, projectId, ticketId })` | Worktree/branch `persona/<id>` no início da Assignment; devolve o card. |
| `reviewSummary({ workspaceId, projectId, ticketId })` | Card do painel (`hasWorktree`, arquivos, patch redigido/truncado, testes citados). |
| `acceptReview({ …, mode: 'ff' \| 'squash' })` | Integra; conflito → `kind: 'blocked'` + `explanation` (Bloqueado · Precisa de você). |
| `requestChanges({ …, feedback })` | Nova rodada de Assignment; Mandate imutável. |
| `discardReview({ … })` | Remove worktree/branch. Sem push. |

Lumen: botão **Revisar** no Kanban (`in_review` / bloqueado) abre overlay com estas RPCs.

## Cofre que lê documentos

Ingestão local (sem serviço externo): PDF, DOCX, MD, TXT, CSV. Extração + trechos + FTS. ACL = visibilidade do registro. Limite 8 MB com linha pt-BR. Substituir reprocessa; apagar remove trechos e índices.

| RPC | Efeito |
|---|---|
| `ingestVaultDocument({ id, name, bytesBase64, visibility? })` | Extrai, divide em trechos, indexa |
| `replaceVaultDocument({ documentId, name, bytesBase64 })` | Reprocessa o arquivo |
| `deleteVaultDocument({ documentId })` | Apaga documento, trechos e FTS |
| `listVaultDocuments(scope)` | Cards visíveis ao ator |
| `searchVaultDocuments({ query })` | Trechos com `title` + `locator` (página/seção) |

`listUsedContext` / `getTurnContext` incluem hits `kind: 'document'` com `title` e `locator` no Contexto usado. Domínio (Forge, v14, sem v15): `formatVaultCitation` / `toUsedDocumentCite` em `persona-core` (`Contrato.pdf · seção Contratos`). Host Anvil já expõe os RPCs.

**[Anvil→Lumen]** Conhecimento/Cofre: upload destes RPCs; citações no drawer Contexto usado.

## Segundo cérebro (Empresa › Segundo cérebro)

Markdown é a fonte; FTS/tipo/links são índice derivado. Versões nunca apagam. ACL = visibilidade da página (`canReadVault`). Exportar para pasta é mão única; `importBrainVault` / `twoWay` também lê `.md` (mesmo slug+hash = skip). Schema store v15 (não é WAVE2).

| RPC | Efeito |
|---|---|
| `putBrainPage({ id, kind, title, body, editorKind, editorId, visibility? })` | Cria/edita; append de versão |
| `getBrainPage({ pageId })` | Página visível; `forbidden` se ACL negar |
| `listBrainPages({ kind?, query? })` | Lista ou FTS; só o que o ator vê |
| `searchBrainPages({ query, kind? })` | Alias de lista com `query` |
| `listBrainVersions({ pageId })` | Histórico (pessoa ou persona) |
| `restoreBrainPage({ pageId, revision })` | Regrava o corpo antigo como versão nova |
| `listBrainChangedToday(scope)` | O que mudou hoje (relógio do host) |
| `getBrainHome(scope)` | Comece aqui + mudou hoje + grants ativos + contradições + `leftover[]` do último sync (persistido) |
| `grantBrainPermission({ id, personaId, action, target, validity })` | Lembra aprovação (escopo exato) |
| `revokeBrainPermission({ grantId })` | Revoga na hora; a página fica |
| `listBrainPermissions(scope)` | Grants (ativos e revogados) |
| `useBrainPermission({ grantId, personaId, action, target })` | Uso; alvo/persona/validade diferentes → `forbidden` |
| `exportBrainVault({ folderPath, twoWay? })` | `applyBrainVaultSync(planBrainVaultSync({ mode: twoWay ? 'two_way' : 'one_way' }))` — write/skip; two-way `page` upsert + `foreign` → BYC; `leftover[]` = dest extras (nunca apagados) |
| `importBrainVault({ folderPath })` | Mesmo apply; slug+hash = skip; `leftover[]` nunca apagado |

**[Anvil→Lumen]** Empresa › Segundo cérebro: início = `getBrainHome`; busca/tipo = `listBrainPages`/`searchBrainPages`; página = `getBrainPage` + `listBrainVersions`; editar = `putBrainPage`; permissões = `listBrainPermissions` / `revokeBrainPermission` / `grantBrainPermission`; exportar pasta = `exportBrainVault`.

**[Anvil→Forge]** v15 = só Segundo cérebro. WAVE2 permanece v14. Gate de aprovação consulta `useBrainPermission` (nunca amplia).

## Fila × direcionar e `/lado` (T3 §4 / §11)

Forge: `resolveWorkingSend` / `enqueueWorkingMessage` / `openAsideAsk`. Anvil persiste a fila do fio.

| RPC | Efeito |
|---|---|
| `enqueueWorkingMessage({ personaId, subjectId, text })` | Balão tracejado; não entra no turno |
| `steerWorkingTurn({ personaId, text })` | Corrige o turno atual |
| `editQueuedMessage` / `dropQueuedMessage` | Editar ou Tirar |
| `flushWorkingQueue({ personaId })` | Manda agora, em ordem |
| `openAsideAsk({ personaId, subjectId, question })` | `/lado` — `onThread: false` |
| `composeCitedMessage({ quote, comment })` | Chip citar (T3 §5) |
| `listTurnActivity({ subjectId, personaId? })` | T3 §9: folds `groupTurnActivity` (falha ≠ feito; waiting ≠ terminou). Host: `EngineOptions.emit` = `withTurnActivityEmit` → `recordTurnActivity` em `assignment.reported`. |
| `pauseAtLimit` / `resumeAfterLimit` | Faixa "No limite"; fila permanece (T3 §12) |
| `acceptTaughtCandidate({ sessionId })` | Ensinar: candidata `origin: taught`, `enabled: false`. Nunca liga. |
| `activateTaughtSkill({ skillId })` | Ensinar: liga após review. Tools além do mandato → `ACCESS_ESCALATION`. |
| `publishTaughtSkill({ skillId, scope, explicit })` | Ensinar: promover. `scope` ≠ persona sem `explicit` → `ACCESS_ESCALATION`. |
| `rollbackTaughtSkill({ skillId })` | Ensinar: desliga a skill ensinada. Versão sobe. Origin ≠ taught → `INVALID_TEACH`. |

**[Anvil→Prism]** composer: botão fila/direcionar; Ctrl+Enter inverte. `/lado` abre aba lateral.

## Gestor de equipe

Função atribuível (`systemRoles` inclui `team_manager`; selo **Gestor**). Coordenação nasce com a função. Sempre perguntar nunca cria sem `approveGestorPlan`.

| RPC | Efeito |
|---|---|
| `getGestorMandate({ personaId })` | Limites (padrão always_ask) |
| `setGestorLimits({ … })` | Teto; só dono |
| `proposeGestorHire({ gestorId, spec, reason })` | Plano; always_ask fica `proposed` |
| `proposeGestorAllocate({ gestorId, personaId, projectIds, reason })` | Plano de alocação |
| `proposeGestorReorganize({ gestorId, kind, targetPersonaId, notice, reason })` | Mover / pausar / autonomia |
| `approveGestorPlan({ planId })` | Aplica o plano (idempotente) |
| `assembleTeamForGoal({ goal, projectId, sprintId })` | Preview equipe + fluxo + sprint 1 |
| `exportBrainVault({ workspaceId })` | Pack Obsidian mão única (SB-6) |
| `listGestorAudit({ workspaceId })` | Linhas com motivo |
| `commentGestorPlan({ workspaceId, planId, commenterId, comment })` | GES-3: segundo Gestor comenta (`commentOnId`); original fica `proposed` |
| `resolveGestorTie({ workspaceId, chosenId })` | Humano desempatar; os outros no escopo viram `rejected` |
| `proposeGestorAllocate` / `proposeGestorReorganize` | Plano; always_ask espera `approveGestorPlan` |
| `listTurnActivity({ workspaceId, projectId, subjectId, personaId? })` | T3 §9 fold; vazio ≠ 0% |
| `recordTurnActivity` | Grava evento do turno |
| `enqueueWorkingMessage` / `listWorkingQueue` / `editQueuedMessage` / `dropQueuedMessage` / `flushWorkingQueue` / `openAsideAsk` | T3 §4/§11; ver `working-send.md` |

**[Anvil→Lumen]** Editor/cartão: `team_manager` + `getGestorMandate` / `setGestorLimits`. Chat: `proposeGestorHire` → cartão Aprovar → `approveGestorPlan`. Saúde/perfil: `getTeamHealth.gestorAudit` ou `listGestorAudit`.

**[Anvil→Forge]** id interno no host/store = `team_manager` (D-058). Tabelas v16 `team_manager_*`.

## Token-opt (host/store)

| RPC | Efeito |
|---|---|
| `getSubjectSummary({ topicId })` | Resumo incremental do assunto |
| `tickLibrarianBatch(scope)` | Bibliotecário só no que mudou (cursor) |
| `tickInitiativeBatch({ leaseUntil, stallAfterMs })` | Iniciativa só se houve evento novo |
| `putProviderLimitReports({ reports })` | Harvest Rivet → pool (mesma conta 1×) |
| `getProviderLimitPool({ provider? })` | Pool persistido |

**[Anvil→Lumen]** Uso: `getProviderLimitPool`. **[Anvil→Rivet]** `putProviderLimitReports` após harvest T3.

## Traga o que suas IAs já sabem

| RPC | Efeito |
|---|---|
| `previewBringContextPaste({ text, provider })` | Organiza colagem (sem gravar). Host passa `existing` via `vaultToBringExisting` — nunca `[]` se o Cofre tem linhas |
| `previewBringContextVaultFolder({ rootPath })` | Varre pasta .md (sem gravar) |
| `applyContextProposals({ preview, items })` | Aceitar/editar/privado grava no Cofre; descartar/bloqueado/conflito/duplicata não |

**[Anvil→Lumen]** Onboarding passo 2 + Importar: Organizar → revisão → `applyContextProposals`. Privado = visibilidade `members` do ator.

## Contexto usado

`listUsedContext({ workspaceId, projectId, eventId })` → registros do Cofre compilados no turno (`restricted: true` = texto omitido por acesso ou detecção de conteúdo sensível; `body` vazio). `getTurnContext` inclui o mesmo `records[]` no ticket. Hits de documento trazem `title` + `locator`; ambos também são omitidos quando a citação contém conteúdo sensível. O mesmo conjunto filtrado alimenta o prompt. ID e marca required são preservados, e o registro original do Cofre não é alterado.

## Fio condutor

`postMessage` no `#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho: resposta persistida, **sem Ticket**. Pedido: Ticket (`doing`) → runner scriptado → `review` (ou `blocked` + "Precisa de você") → `runTicketCommand({ command: 'complete' })` → `done`. `followMessages` entrega as respostas da Coordenação. Reinício: Assignment interrompida retoma; o id da resposta é idempotente.

## Quadros por projeto (PB-4)

Fluxo e sprint são do projeto (compartilháveis). DM nunca entra.

| RPC | Efeito |
|---|---|
| `getProjectBoard(scope)` | Fluxo (virtual `simples` se ainda não persistido), cards, contagens, sprint atual |
| `listBoards(scope)` | Mini-resumo por projeto (`counts`, sprint atual, `workingNow`) |
| `listWorkflowTemplates(scope)` | Catálogo dos 7 modelos (pt-BR) |
| `createProject({ template? })` | Projeto compartilhado; `template` persiste o fluxo na criação |
| `createWorkflowFromTemplate({ template })` | Persiste um modelo. Proposta da Coordenação **não** chama isto |
| `updateWorkflow({ columns, fields, destByRemoved })` | Edita; coluna removida exige destino. Sem perda de Tarefas. Recusa: `BoardRemoteError.code` (`column-needs-destination`, …) + `message` pt-BR |
| `moveTicket({ ticketId, columnId })` | Move; `wipWarning` não recusa |
| `listSprints` / `createSprint` / `updateSprint` / `deleteSprint` / `planSprint` / `startSprint` / `closeSprint` / `sprintSummary` | CRUD + ciclo. `closeSprint` exige `confirmed`; resumo vai ao 1º canal do projeto |
| `listSprintGoals(scope)` | Goals do `startSprint` hidratados do SQLite (GoalBoard em memória sobrevive remount) |
| `proposeWorkflow({ description })` | Cartão "Usar este fluxo?" — **nunca aplica sozinho** |
| `acceptWorkflowProposal({ columns, fields, destByRemoved? })` | Aplica o cartão. Único `save` deste caminho |
| `rejectWorkflowProposal(scope)` | Recusa; store intacto |
| `getProjectConversation(scope)` | Canal `#geral` deste projeto (PB-5 Conversa). Cria se faltar |

ACL no servidor: leitura `can(read, project)`; mutação `can(write, project)`. Guest recusado.

## Cartão da persona

`getPersonaCard` / `getPersonaTalkAcl` / `setPersonaTalkAcl` / `pausePersona` / `resumePersona` / `setPersonaEngine` / `putPersonaCharge` — ver `persona-card.md`. `nowKind`/`nowText` vêm do estado real; `quota` ausente = indisponível (nunca 0). Talk ACL (`workspace`/`chosen`) aplica em DM e `@menção` (recusa pt-BR, nunca silêncio).

## Atenção (desktop)

`getAttentionPolicy` / `putAttentionPolicy` / `attentionEvents` (stream). `ackAttention({ eventIds })` tira os ids do próximo baseline — Rivet toasts. Quiet window em `delivery: 'ping'`.

## Governança (GOV-5)

`getOrgChart` / `getTeamHealth` / `runTwoDayTest` / `applyFix` / `applyGovernanceFix` / `setResponsible` / `setSubstitute` / `setSector` / `setAvailability` / `setPersonaGovernance` / `recommendStructure` / `applyStructure` / `listAudit` — ver `governance.md`. Schema v11. Dono muda responsabilidades; organograma ao vivo.

## Chat rico

| RPC | Efeito |
|---|---|
| `listStickers()` | Catálogo Brush (`stamp-aprovado`, `tray-*`, `nav-saude`, `nav-quem-cuida`). Sem tenant. |
| `reactToMessage` / `unreactToMessage` | Figurinha do catálogo; ator da sessão. Audit `react`/`unreact`. |
| `replyToMessage` | Nova mensagem no mesmo stream com `replyToId`. |
| `pinMessage` / `unpinMessage` / `listPinned` | Fixar no stream. |
| `editMessage` / `deleteMessage` | Só a própria (dono do workspace pode qualquer). Soft-delete + audit. |
| `listMessageAudit` | Trilha `edit`/`delete`/`pin`/`unpin`/`react`/`unreact`. |
| `suggestMentions({ query })` | Personas que o ator pode `@` (talk ACL). |
| `checkpointWal()` | `PRAGMA wal_checkpoint(TRUNCATE)`. Local. |

`MessageView` traz `replyToId`, `editedAt`, `pinned`, `reactions[]` e `runError?` (`RunErrorPayload`: code + provider/persona/command). O body ainda pode carregar `[[run-error:{json}]]`; `listMessages` / `followMessages` preenchem o campo no fio. Schema v12.

**[Anvil→Muse]** ligar o compositor às mesmas ids de `listStickers`.

## Compartilhar (Forge `share.md`)

| RPC | Efeito |
|---|---|
| `exportPersona({ workspaceId, projectId, personaId })` | `{ filename, json }` `.persona.json`. Avatar gallery; upload vira silhueta. Sem credencial/Cofre. |
| `importPersona({ workspaceId, projectId, json })` | Parse + proposta de contratação `pending`. **Nunca aplica sozinho.** Segredo → `SECRET_REFUSED` / `IMPORT_REFUSED`. |
| `exportTeam({ workspaceId, projectId, personaIds?, templateId? })` | `{ filename, json }` `.team.json`. `templateId` = roster built-in. |
| `importTeam({ workspaceId, projectId, json })` | Uma proposta pendente por persona. |
| `previewCliSkills()` | Candidatas de `~/.claude/skills` e `~/.codex/skills`. Sem tenant. Sempre `enabled: false`. |
| `proposeCliSkills({ workspaceId, projectId, personaId, skillKeys })` | Grava candidatas desligadas (`origin: learned`). Nunca `enabled: true`. |

## Insights locais (Forge `insights.md`)

ACL: **só o dono** do workspace. Nada sai da máquina.

| RPC | Efeito |
|---|---|
| `getActivationFunnel(scope)` | Funil: onboarded → 1ª resposta útil → 1ª tarefa → retorno 7 dias. `stage` derivado. |
| `getPersonaImpact({ …, personaId })` | Concluídas, tempo até pronto, propostas aceitas, `hoursSavedEstimate` com rótulo `estimativa`. |
| `listPersonaImpact(scope)` | Impacto de cada persona do projeto. |

Eventos dobrados do que o host já persiste (onboarding, mensagens de persona/runner, tickets `completed`/`merged`, aprovações `approved`). Sem telemetria.

## Banco — saúde e restauração

| RPC | Efeito |
|---|---|
| `getStoreHealth()` | `schemaVersion`, `safeMode`, `recovered`, `recoveryMessage`, `backups[]`. Sem tenant. |
| `restoreBackup({ filename })` | Copia o backup sobre `persona.db` e reabre. Nome de `listBackups`. |

Arquivo corrompido: restaura o último backup; sem backup abre **modo seguro** (banco vazio + mensagem pt-BR).

## Anexos — limite com mensagem

Anexo ≤ 8 MB, avatar ≤ 2 MB, mensagem ≤ 20 MB, projeto ≤ 200 MB, leitura de arquivo do projeto ≤ 8 MB. Gateway Remote: JSON 256 KB; `attach*`/`upload*` 12 MB. Estouro de produto → linha pt-BR (`Este anexo tem N MB. O limite é 8 MB.`). SVG/HTML/exe recusados.

## Anexos e avatar

Ver `attachments.md`. `attachFile` / `listAttachments` / `getAttachment` / `getAttachmentBytes` / `uploadPersonaAvatar` / `removePersonaAvatar`. Bytes em base64. Canal vazio exporta sem `forbidden`.

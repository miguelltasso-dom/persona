# T3 Code — inventário do backend (servidor/orquestração)

Zinc, 07/11/2026. Leitura do T3 Code em `C:/Users/migue/dev/_ext/t3code` (commit `25bf84ab`), lado **servidor/orquestração**; a UI/cliente fica com o Onyx. Formato do brief: `area | o que faz | arquivo:linha | a Persona tem? | PEGAR/ADAPTAR/IGNORAR + motivo | P/M/G`.

**Como ler.** “Persona tem?” compara com o nosso código; `parcial` = existe algo equivalente, mas não a mesma garantia. `P/M/G` = pequeno (<1 dia), médio (1–3 dias), grande (>3 dias). As linhas do T3 são declarações/serviços; o contrato de RPC está em `packages/contracts/src/rpc.ts:410-618` (todos os métodos tipados).

## Resumo

- **PEGAR (forte):** event sourcing com recibo/outbox, checkpoints em refs escondidos, adaptadores de provedor (Codex app-server/ACP), sessão/turno/recovery, settlement de thread, busca/histórico paginado, terminal PTY, MCP tools, tarefas agendadas/webhooks, git/worktrees, resource telemetry.
- **ADAPTAR:** RPC tipado/streams (a Persona usa Remotes Cordis), auth/pairing/guest share, source control/PR, preview browser, device/speech (v2), packaging/updater.
- **IGNORAR:** T3 Connect/relay como produto, device/mobile toolchain, feedback de provedor, ACP registry público — não são o diferencial da Persona agora.

## 1. Servidor, transporte e autenticação

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| RPC WebSocket tipado | Um contrato Effect/Schema para todos os métodos e subscrições; cliente e servidor versionam juntos | `packages/contracts/src/rpc.ts:410`; `apps/server/src/ws.ts:1388` | parcial — Remotes Cordis (`persona-host/src/index.ts`, `remote-guard.ts`), sem contrato único nem streams tipados | PEGAR: o contrato único elimina divergência host/cliente e habilita replay/subscrição | G |
| HTTP API/assets/anexos | Rotas de assets, upload de anexo, CORS do browser, compressão, estático/dev | `apps/server/src/http.ts:314`, `:464`, `:252` | parcial — `persona-host/src/media.ts` + IPC do desktop | ADAPTAR: a Persona já serve mídia; falta o mesmo pipeline de upload/limites | M |
| Auth de ambiente | Sessões assinadas, pairing grants, DPoP, payload signer, replay markers | `auth/EnvironmentAuth.ts:453`; `auth/SessionStore.ts:371`; `auth/dpop.ts:56`; `auth/PayloadSigner.ts:35` | parcial — `persona-host/src/auth.ts`, `persona-vault` | ADAPTAR: nosso auth é local; o modelo de pairing/DPoP serve para acesso remoto | M |
| Autorização por RPC | Escopo exigido por método, escopos guardados no cliente, grants na execução | `auth/RpcAuthorization.ts:216`; `contracts/clientRpcPermissions.ts` | parcial — `remote-guard.ts` + `remote-acl-matrix.spec.ts` | PEGAR: tabela método→escopo é mais verificável que checagens espalhadas | M |
| Headless/pairing remoto | URL de conexão, QR no terminal, aceita rede privada, host loopback/wildcard | `startupAccess.ts:126`, `:162` | não — desktop local | ADAPTAR se a Persona vender acesso remoto; hoje é v1.2 | M |
| Instância única/serviço | Ownership do servidor, erro de instância antiga, launcher de serviço | `serverOwnership.ts:183`; `serviceLauncher.ts:449` | parcial — host filho do desktop (`apps/desktop/src/host-process.ts`) | ADAPTAR: evita dois hosts no mesmo banco | M |
| Relay/T3 Connect/túnel | Cloud link, relay client, reachability, túnel gerenciado | `cloud/CloudLink.ts:126`; `relay/relayEnvironmentClient.ts:8`; `cloud/ConnectReachability.ts:204` | parcial — `persona-sync`/Cloudflare planejado | ADAPTAR: a Persona já quer Cloudflare; o desenho de reachability serve | G |
| Peer links/delegação | Link entre ambientes, delegação remota, MCP peer | `peer/PeerLinks.ts:70`; `peer/RemoteDelegation.ts:69` | não | IGNORAR por agora: colaboração entre máquinas não é o P0 | M |
| Guest share | Link somente leitura para convidado, mensagens e anexos pendentes | `guest/GuestShareService.ts:141`; `guest/http.ts:1` | não | ADAPTAR: combina com “equipe à distância” da Persona | M |
| Descoberta de ambiente | Identidade do ambiente, endpoints diretos, alvos de abertura remota | `environment/ServerEnvironment.ts:45`; `environment/DirectEndpoints.ts:35` | não | ADAPTAR: necessário se houver multi-máquina | M |
| Settings do servidor | Settings por ambiente, redaction para o cliente, mutação de provider | `serverSettings.ts:253`; `serverSettings.ts:142` | parcial — `settings`/`flags` do DSH | ADAPTAR: a redaction é obrigatória para segredo | M |
| Política gerenciada | Policy de release, providers/settings/updates gerenciados | `policy/ManagedPolicy.ts:33`; `policy/managedLimits.ts:31` | não | IGNORAR: produto não é gerenciado por TI | S |
| Auto-pull de projetos | Puxa projetos no startup | `serverRuntimeStartup.ts:192` | não | IGNORAR: a Persona não deve mexer no repo da pessoa sem pedir | S |
| Diagnóstico de processo | Sinal, diagnóstico de processo, recursos | `diagnostics/ProcessDiagnostics.ts:29` | parcial — `persona-host/src/diagnostics.ts` | PEGAR: ajuda o suporte e o “Tentar de novo” | M |
| Resource telemetry | Monitor nativo, histórico, atribuição por processo | `resourceTelemetry/ResourceTelemetry.ts:52`; `ResourceMonitorBinary.ts:1` | parcial — `persona-usage` | PEGAR: mede o custo real por persona | M |
| Telemetria/analytics | Analytics, feature usage, provider dimensions, OTLP | `telemetry/AnalyticsService.ts:82`; `observability/Observability.ts:21` | parcial — `persona-usage`; DSH telemetry | ADAPTAR: a Persona deve ser local-first; medir sem vazar conteúdo | M |
| Update do desktop | Update do app, self-update do servidor | `desktopUpdate/DesktopAppUpdate.ts:39`; `cloud/selfUpdate.ts:1` | parcial — `apps/desktop` updater | ADAPTAR: mesmo fluxo, assinatura/rollback | M |
| Limpeza de storage | Idle thread, PR merged, retenção | `storageCleanup.ts:285` | parcial — `persona-store/src/retention` | PEGAR: retenção explícita evita banco crescendo | M |
| Anexos | Store, claims, sweep de pendentes, caminho seguro | `attachmentStore.ts:20`; `orchestration-v2/AttachmentClaims.ts:20` | parcial — `persona-host/src/media.ts`, `persona-store/src/media` | ADAPTAR: limites e sweep são o que falta | M |
| Keybindings no servidor | Config de atalhos persistida no servidor | `keybindings.ts:1` | parcial — cliente | ADAPTAR: se a pessoa usa várias máquinas | S |
| CLI pair/doctor | Pair, doctor, serviço, console | `cli/app.ts:35`; `cli/pair.ts:1`; `cli/doctor.ts:1` | parcial — `dsh` CLI | ADAPTAR: o doctor é útil no suporte | M |

## 2. Orquestração v2 (o coração do T3)

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Comandos serializados | Comando entra, é serializado por thread, decide eventos sem I/O | `orchestration-v2/Orchestrator.ts:553` | parcial — `persona-host/src/orchestration.ts` + `persona-engine` | PEGAR: separa decisão de efeito; hoje a Persona mistura | G |
| Recibo idempotente | `commandId` + receipt persistido; retry não duplica | `CommandReceiptStore.ts:84` | parcial — idempotência por event id | PEGAR: retry de comando é requisito de robustez | M |
| Event sink transacional | Eventos + projeções + recibo + outbox numa transação | `EventSink.ts:227` | parcial — `persona-store/src/events` | PEGAR: projeção nunca fica à frente do log | G |
| Event store/replay | Log por stream, replay para reconexão, high-water marks | `EventStore.ts:75` | parcial — event log do store | PEGAR: reconexão de cliente hoje é mais fraca | G |
| Effect outbox/worker | Efeitos depois do commit, retry, falha vira evento | `EffectOutbox.ts:247`; `EffectWorker.ts:626` | parcial — `orchestration.work`/fila | PEGAR: efeito perdido não pode sumir | G |
| Projeções/streams | Shell/thread projection, snapshot limitado, coalescing | `ProjectionStore.ts:114`; `ShellStream.ts:190`; `ThreadStream.ts:25`; `WireProjection.ts:54` | parcial — read models do engine | PEGAR: payload grande é o que trava a UI | G |
| Poda/manutenção | Apaga eventos cobertos, mantém high-water/âncoras | `ProjectionMaintenance.ts:36` | parcial — `retention` | PEGAR: log cresce sem poda | M |
| Ciclo de thread | create/archive/delete/fork/merge_back/adopt-folder | `Orchestrator.ts:553`; `ThreadForkService.ts:69` | parcial — Tickets/Threads do engine | ADAPTAR: fork/merge é conceito que a Persona não tem | G |
| Settlement/auto-settle | Settle, auto-settle, snooze, pin, tags, reorder | `ThreadSettlementService.ts:254`; `Orchestrator.ts:562` | parcial — `ticket-done.ts`, `boards.ts` | PEGAR: “quando a thread está pronta” é regra de produto | M |
| Busca/histórico | Busca de thread/mensagem, paginação por byte/turno, índice FTS | `ThreadSearch.ts:274`; `threadHistoryPaging.ts:27`; `messageSearchIndex.ts:52` | parcial — `session-query`, store | PEGAR: histórico grande é o caso real | M |
| Título automático | Regenera título com modelo barato | `ThreadTitleRegenerationService.ts:30` | parcial — `ticket-title.ts` | ADAPTAR: já temos heurística; modelo só se falhar | S |
| Fila/steering/interrupt | Fila por thread, reorder/cancel/edit, steer, stop, unresponsive | `QueuedRunOrder.ts:3`; `ProviderTurnControlService.ts:34`; `Orchestrator.ts:595` | parcial — `working-control.ts` | PEGAR: a Persona já tem fila/steer; falta o cancelamento duro | M |
| Sessão de provedor | Abre/reaproveita sessão, turno, continuação, troca de provider | `ProviderSessionManager.ts:213`; `ProviderTurnStartService.ts:126`; `ProviderSwitchService.ts:46` | parcial — `persona-runners` OAR | PEGAR: sessão quente é o que segura o custo | G |
| Ingestão de eventos | Normaliza eventos nativos, commit em lote | `ProviderEventIngestor.ts:45`; `ProviderCommitBatch.ts:29` | parcial — `oar/adapter.ts` | PEGAR: o adaptador não deve vazar formato nativo | G |
| Recovery/restart | Retoma turno após crash, aposenta efeito perdido | `ProviderRuntimeRecoveryService.ts:72`; `RestartContinuation.ts:114` | parcial — `proactivity-scheduler` retry | PEGAR: reinício do host é requisito da Persona | M |
| Context handoff | Passa contexto entre providers/threads, orçamento | `ContextHandoffService.ts:102`; `ContextHandoffDelivery.ts:16` | parcial — `handoffs.ts`, `context` | ADAPTAR: a Persona já passa contexto entre personas | M |
| Compactação idle | Compacta antes do cache expirar/ao voltar | `IdleCompactionService.ts:28`; `IdleCompaction.ts:1` | parcial — `compaction` | ADAPTAR: reduz custo de retomada | M |
| Tarefas delegadas | Subagente/tarefa, pergunta, notificação, trabalho nativo | `DelegatedTaskQuestionReactor.ts:20`; `NotificationMailbox.ts:8`; `NativeChildWorkQuery.ts:19` | parcial — `handoffs.ts`, `subagent` | PEGAR: é o “passar adiante” da D-090 | M |
| Goals/workflow | Goal, artefato de plano, transcript de workflow | `workflowAgentTranscript.ts:54`; `workflowFileRead.ts:19`; `workflowScriptQuery.ts:5` | parcial — `goal`, `workflow` | ADAPTAR: a Persona já tem goal/sprint | M |
| Usage limit recovery | Retoma quando a janela de uso reabre | `UsageLimitRecoveryWorker.ts:17` | parcial — `persona-usage`, quota | PEGAR: “no limite → retomar” já é IV-7 | M |
| Live stream budget | Orçamento de stream, buffer, erro de excesso | `LiveStreamBudget.ts:13` | parcial — `reply-stream.ts` | PEGAR: evita payload infinito no fio | M |
| Command output hub | Saída de comando/terminal com tail e resume | `CommandOutputHub.ts:62` | parcial — `working-control` | ADAPTAR: terminal ainda não exposto | M |
| Erros humanos | Traduz SQLite/erro de provider para frase | `UserFacingErrors.ts:40` | parcial — `remote-guard` | PEGAR: erro cru não chega à pessoa | S |
| Model switch | Divisor de troca de modelo/effort no timeline | `modelSwitch.ts:16` | parcial — `engine-menu` | ADAPTAR: a Persona já mostra chip de modelo | S |
| Streaming do assistente | Separa texto pronto do parcial, fences/listas | `assistantStreaming.ts:15` | parcial — `reply-stream.ts` | ADAPTAR: evita markdown quebrado no stream | S |
| Checkpoints | Captura em ref escondido, diff, rollback, restore safety | `CheckpointService.ts:146`; `CheckpointCaptureService.ts:43`; `CheckpointRollbackService.ts:102`; `CheckpointRestoreSafety.ts:13` | parcial — `draft-files`, `review`; sem ref escondido | PEGAR: é o “Desfazer” de verdade do trabalho do agente | G |
| Worktree branch sync | Sincroniza branch do worktree com o repo | `WorktreeBranchSync.ts:70` | parcial — `persona-engine/src/executor/worktree.ts` | ADAPTAR: a Persona já isola worktree | M |
| PR sync/watch | Reage a merge/close e relê links de PR | `PullRequestSyncReactor.ts:145`; `PullRequestWatchReactor.ts:189` | parcial — `github.ts` | ADAPTAR: a Persona tem webhook, não watch | M |
| Resource cleanup | Limpa anexos/preview/recursos ao fechar thread | `ResourceCleanupService.ts:25` | parcial — `retention` | PEGAR: fecha o ciclo de vida | S |
| Runtime/dispatch policy | Limite de runtime/interaction mode por thread | `RuntimePolicy.ts:22`; `DispatchModeLimit.ts`; `CommandPolicy.ts:38` | parcial — `flags.ts`, autonomia | ADAPTAR: a Persona já tem autonomia; falta o limite por thread | M |
| Métricas de run | Duração, fila, total por modelo | `RunMetrics.ts:31` | parcial — `usage` | ADAPTAR: mede custo/latência por run | S |

## 3. Provedores (CLIs)

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Interface/registro de provider | Driver abstrato + registry de instância/capacidades | `provider/ProviderInstanceRegistry.ts:34`; `orchestration-v2/ProviderAdapterRegistry.ts:18`; `packages/provider-core/src/server/ProviderAdapter.ts:1` | parcial — `persona-runners/src/port.ts` | PEGAR: um contrato para todos os CLIs | G |
| Codex app-server | Adaptador do app-server do Codex, modelos, auth ChatGPT | `provider/Drivers/CodexDriver.ts:118`; `packages/effect-codex-app-server/src/client.ts:1` | parcial — `persona-runners/src/oar` | PEGAR: é o caminho mais rico do Codex | G |
| Claude | Adaptador Claude, catálogo de modelos, token usage | `provider/Drivers/ClaudeDriver.ts:84`; `ClaudeProvider.ts:216`; `ClaudeModelCatalog.ts:1` | parcial — `persona-runners` | PEGAR: catálogo e usage por turno | G |
| ACP (Cursor/Grok/OpenCode/Antigravity/Kiro) | Protocolo ACP comum, drivers por CLI | `packages/provider-acp/src/server/adapter.ts:1`; `provider/acp/`; `Drivers/AntigravityDriver.ts:109` | parcial — OAR | PEGAR: reduz N adaptadores a um protocolo | G |
| Auth/login | Login por provider, ChatGPT handoff, OAuth | `provider/ProviderAuthService.ts:29`; `CodexChatGptAuth.ts:1`; `AntigravityAuth.ts:1` | parcial — `connection-probe`, `runner` | ADAPTAR: a Persona não guarda token de assinatura | M |
| Instalação/versão | Detecta/instala/atualiza CLI, versão mínima | `CodexInstallation.ts:53`; `AntigravityInstallation.ts:1`; `ProviderLatestVersions.ts:1` | parcial — `connection-probe` | ADAPTAR: útil para “Tentar de novo” | M |
| Catálogo de modelos/effort | Lista modelos/effort do próprio CLI | `codexModelOptions.ts:1`; `claudeModelOptions.ts:1`; `modelSelection.ts:1` | parcial — `engine-menu.ts`, `claude-menu.ts` | PEGAR: a Persona já faz; falta o fallback estático | M |
| Uso/quota | Uso por provider, limite, reset, histórico | `usage/UsageService.ts:142`; `CodexUsageHistory.ts:1`; `ProviderUsageLimitsIngestion.ts:1` | parcial — `persona-usage` | PEGAR: D-092/limites já pedem isso | M |
| Feedback do provider | Envia feedback/telemetria do provider | `rpc.ts:438` | não | IGNORAR: não é nosso produto | S |
| ACP registry | Busca/instala agente ACP público | `contracts/acpRegistry.ts`; `rpc.ts:520` | não | IGNORAR: catálogo público não é o foco | M |

## 4. Ferramentas, MCP e tarefas

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Ferramentas do orquestrador | MCP tools para thread, projeto, git, review, etc. | `mcp/OrchestratorMcpService.ts:221`; `mcp/toolkits/orchestrator/tools.ts:1` | parcial — `harness-*.ts` | PEGAR: a Persona já tem harness; falta o catálogo amplo | G |
| MCP Apps | App MCP com UI, snapshot, model context | `mcpApps/McpAppRequests.ts:30`; `McpAppSnapshot.ts:48` | não | ADAPTAR: pode renderizar ferramenta rica no cartão | M |
| Servidor MCP HTTP | Sessão MCP, auth de cliente, tool access | `mcp/McpHttpServer.ts:121`; `McpSessionRegistry.ts:1`; `McpToolAccess.ts:1` | parcial — `persona-runners/src/mcp` | PEGAR: expor ferramentas ao CLI vivo | M |
| Tarefas agendadas | Cron, webhook, entrega, dedupe, filtro | `scheduledTasks/ScheduledTaskService.ts:253`; `webhookRoute.ts:18`; `scheduling/Scheduler.ts:11` | parcial — `schedule`, `routines` | PEGAR: a Persona já tem rotinas; falta webhook | G |
| Segredos | Pedido de segredo, resolver, provider definitions | `secrets/SecretRequests.ts:46`; `SecretResolver.ts:9` | parcial — `persona-vault` | ADAPTAR: o Cofre já cobre; falta o pedido inline | M |

## 5. Git, worktrees e source control

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Git manager | Status, diff, commit, push, pull, branches | `git/GitManager.ts:120`; `GitWorkflowService.ts:37` | parcial — `persona-engine/src/review/git.ts` | PEGAR: a Persona já usa git; falta a camada de workflow | G |
| Worktrees/refs | Cria/remove/switch worktree, refs, pull | `vcs/VcsDriver.ts:14`; `GitVcsDriver.ts:1`; `rpc.ts:455` | parcial — `persona-engine/src/executor/worktree.ts` | PEGAR: isolar tarefa em worktree é nosso modelo | G |
| Diff/revisão | Diff de checkpoint, arquivos, preview | `checkpointing/CheckpointDiffQuery.ts:52`; `review/ReviewService.ts:31` | parcial — `review.ts`, `draft-files.ts` | PEGAR: revisão antes/depois é requisito | M |
| Source control providers | GitHub/GitLab/Bitbucket/Azure/Forgejo/GitCafe | `sourceControl/SourceControlProviderRegistry.ts:47`; `packages/source-control-core/src/server/SourceControlProvider.ts:1` | parcial — `github.ts` | ADAPTAR: começar por GitHub, interface comum | G |
| PR service | Lista/detalhe/checks/comentários/review guide | `pullRequest/PullRequestService.ts:177`; `PullRequestReviewGuideService.ts:44` | parcial — `github.ts` | ADAPTAR: o GitHub da Persona é webhook; falta leitura rica | G |
| Clone/publish/sign-in | Clona, publica, login no source control | `sourceControl/SourceControlRepositoryService.ts:41`; `rpc.ts:593` | não | ADAPTAR: onboarding de projeto | M |
| Setup de projeto/worktree | Roda script de setup, progresso, cancelamento | `project/ProjectSetupScriptRunner.ts:79`; `WorktreeSetupTracker.ts:24` | parcial — `persona-engine/src/executor/worktree.ts` | ADAPTAR: setup automático é bom para projeto novo | M |
| Busca/arquivos do workspace | Índice de busca, leitura/escrita segura | `workspace/WorkspaceSearchIndex.ts:107`; `WorkspaceFileSystem.ts:111` | parcial — `files.ts`, `fs`, `lsp` | PEGAR: busca é o que a persona usa para contexto | M |

## 6. Terminal, preview, device e voz

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Terminal PTY | Abre/attach/observe/write/resize/clear/close, output tail | `terminal/Manager.ts:168`; `NodePtyAdapter.ts:14`; `OutputProtocol.ts:1` | parcial — DSH `packages/terminal`, não exposto na Persona | ADAPTAR: terminal é pedido natural da persona | G |
| Preview browser | Browser do servidor, port scanner, PDF, stream | `preview/Manager.ts:32`; `ServerBrowser.ts:1`; `PortScanner.ts:1` | parcial — DSH `browser-use`/`computer-use` | ADAPTAR: a Persona já tem computer-use; falta preview embutido | G |
| Device/mobile | Device host, EAS, SSH, simulador, toolchain | `device/DeviceService.ts:83`; `EasDeviceHost.ts:1`; `SshDeviceHost.ts:1` | não — desktop-first | IGNORAR: não é o P0 da Persona | G |
| Voz/transcrição | STT/TTS, modelo, stream, pós-processamento | `speech/SpeechService.ts:42`; `CloudSpeech.ts:1`; `stream.ts:1` | não | IGNORAR por agora; W2-9 “Ensinar” pode pedir depois | M |

## 7. Empacotamento, nativo e desempenho

| area | o que faz | arquivo:linha | a Persona tem? | recomendação | P/M/G |
| --- | --- | --- | --- | --- | --- |
| Módulos nativos | Monitor de recursos, acessibilidade, foreground, workers | `native/resource-monitor/src/main.rs:1`; `resourceTelemetry/ResourceMonitorBinary.ts:1` | parcial — DSH `native/` | ADAPTAR: não carregar nativo no main (regra do T3) | M |
| Packaging/installer | Empacota app, updater, assinatura, release | `apps/desktop/package.json:1`; `packaging/aur/README.md:1`; `desktopUpdate/DesktopAppUpdate.ts:39` | parcial — `apps/desktop`, `persona-ship` | ADAPTAR: a Persona já tem instalador; falta assinatura | G |
| Compile cache | Cache de compilação do CLI/servidor, launcher watch | `compileCache.ts:15`; `cliCompileCache.ts:7`; `launcherWatch.ts:15` | não | PEGAR: abertura mais rápida sem mudar arquitetura | S/M |
| OS jank/path | Corrige PATH/home, evita jank de SO | `os-jank.ts:64` | parcial — `apps/desktop` | ADAPTAR: Windows-first da Persona precisa disso | S |
| Process runner | Spawn com timeout, limite de saída, stdin, erros tipados | `processRunner.ts:138` | parcial — DSH `subprocess` | PEGAR: contrato de processo é base de CLI | M |

## Lacunas do T3 que a Persona já cobre melhor

- **Equipe de personas e organograma** (`persona-engine`, `governance`), **quadros por projeto/sprints** (`boards.ts`, PB-*), **Cofre/Segundo cérebro** (`persona-vault`, `brain`), **proatividade com orçamento/silêncio** (`proactivity-scheduler.ts`), **D-081/083/084** (ACL e prévia de ação externa) e **D-090** (passar adiante, revisão, opinião). O T3 é single-agent por thread; não copiar o modelo de “thread = trabalho” por cima do nosso de Tarefa/equipe.
- **Multi-provider por persona** com modelo/esforço por persona (EFF-1) já é mais rico que o T3; o que falta é o **catálogo/usage/recovery** do lado do servidor.

## Próximos passos sugeridos (ordem)

1. **PEGAR** event sink/outbox + recibo idempotente (robustez de retry/reinício) — maior ganho estrutural.
2. **PEGAR** checkpoints em refs escondidos + restore safety (Desfazer real).
3. **PEGAR** provider session/turn/recovery e o contrato de driver (Codex app-server/ACP).
4. **ADAPTAR** RPC tipado/streams e auth/pairing se a Persona abrir acesso remoto.
5. **ADAPTAR** git/worktree/PR e terminal/preview conforme o roadmap da v1.2.

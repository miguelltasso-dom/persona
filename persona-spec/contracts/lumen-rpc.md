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
| `pickDirectory` | Rivet IPC; host devolve `{ path: null }` |
| `updateProject.rootPath` | equivalente; vazio limpa |

## Conexões — `listConnections(scope)` (async)

Probe em segundo plano no boot do host (timeout **≥ 8 s** por CLI, cache 60 s). Primeira pintura: `phase: 'checking'`, **sem** `error: not_logged_in` (400 ms era falso negativo — auth do Claude ~5 s). UI mostra "verificando…" até `phase: 'ready'`. Só então `loggedIn: false` + `error?` (`cli_not_found` | `not_logged_in` | `quota_exhausted`) e `loginHint`. `resolveRunner` usa `ctx.get('personaRunners')`; `home` vazio = login nativo (`~/.claude`), isolamento só opt-in.

## Webhook GitHub local

`POST /api/persona/webhooks/github?projectId=` no host. HMAC SHA-256 (`X-Hub-Signature-256`); segredo em `PERSONA_GITHUB_WEBHOOK_SECRET` ou Cofre `factKey=github.webhook.secret` (nunca em log). Replay: delivery id + janela de 5 min → `200 {kind:duplicate}`. Corpo ≤ 256 KiB. Resposta `202` antes de `ingestGithubWebhook`.

## Dead-letter (Precisa de você)

Efeito/outbox que falha 3 vezes vira `listDeadLetters` (`cause` pt-BR, `Tentar de novo` / `Descartar`). Entra em `getOverview.needsYou` e `attentionEvents`. `retryDeadLetter` tira o card e reprocessa o outbox; `discardDeadLetter` só descarta.

## Uso e limites

`getUsage({ workspaceId, period: { from, to }, projectId?, personaId? })` → folds + tokens + runs + `origin` / `originLabel` (oficial da CLI · medido por nós · estimado · indisponível). Sem eventos ≠ 0%. `getOfficialQuota({ workspaceId, projectId, provider? })` → janelas oficiais ou `unavailable`. Limite do mês e spend vêm do mesmo livro SQLite.

## Exportar

`exportWorkspace` / `exportProject` → zip Markdown (`filename` + `base64`). DMs **fora** salvo `includeDmIds` explícito. Segredos redigidos (`looksLikeCredential`). Cofre em `cofre/*.md`.

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

## Contexto usado

`listUsedContext({ workspaceId, projectId, eventId })` → registros do Cofre compilados no turno (`restricted: true` = visibilidade persona/projeto; `body` vazio). `getTurnContext` inclui o mesmo `records[]` no ticket.

## Fio condutor

`postMessage` no `#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho: resposta persistida, **sem Ticket**. Pedido: Ticket (`doing`) → runner scriptado → `review` (ou `blocked` + "Precisa de você") → `runTicketCommand({ command: 'complete' })` → `done`. `followMessages` entrega as respostas da Coordenação. Reinício: Assignment interrompida retoma; o id da resposta é idempotente.

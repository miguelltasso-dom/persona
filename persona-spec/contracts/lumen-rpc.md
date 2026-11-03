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
| `setProjectRoot({ rootPath })` | `status: ok \| cleared` (vazio limpa) |
| `updateProject.rootPath` | equivalente; vazio limpa |

## Conexões — `listConnections(scope)` (async)

Liga a `detectConnections()` do Rivet (probe dsh + CLIs, cache 60 s). `available` = CLI instalada. `resolveRunner` no laço: só quando `ctx.personaRunners.resolveRunner` estiver no Status do Rivet.

## Fio condutor

`postMessage` no `#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho: resposta persistida, **sem Ticket**. Pedido: Ticket (`doing`) → runner scriptado → `review` (ou `blocked` + "Precisa de você") → `runTicketCommand({ command: 'complete' })` → `done`. `followMessages` entrega as respostas da Coordenação. Reinício: Assignment interrompida retoma; o id da resposta é idempotente.

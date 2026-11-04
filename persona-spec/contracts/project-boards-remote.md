# Contrato — Quadros por projeto (Anvil Remote · Lumen/Prism)

Dono do Remote: **Anvil** (`persona-host` `BoardsHost`). Domínio: **Forge** (`persona-core/src/board`, `persona-engine` estágio↔coluna). Consumidores: Lumen (grade/editor/sprints), Prism (sidebar/abas).

Todos os DTOs são JSON-safe. Tenant em `workspaceId` + `projectId`. Sem nome de persona hardcoded (D-043). Fluxo e sprint são compartilháveis; DM nunca entra no quadro.

## Leitura

| RPC | Resultado |
|---|---|
| `getProjectBoard(scope)` | fluxo, cartões (categoria + coluna resolvida), contagens, sprint atual |
| `listBoards(workspace)` | um mini-resumo por projeto: contagens, sprint atual, quem trabalha agora. **Nunca** um quadro misturado |

Tarefa sem `columnId` cai na primeira coluna da categoria do estágio (`projectBoardCard`).

## Escrita de fluxo

| RPC | Efeito |
|---|---|
| `createWorkflowFromTemplate` | persiste um modelo. **Não** é o caminho da proposta da Coordenação |
| `updateWorkflow` | substitui colunas/campos; coluna removida exige `destByRemoved` |
| `moveTicket` | ajusta o estágio à categoria; `wipWarning: true` não recusa |

FLOW-1: quando o engine recusa uma mudança por entrega pendente, `moveTicket` preserva o erro tipado `delivery_pending` no gateway, com mensagem para revisar/aplicar/descartar a entrega. Não converte a recusa em sucesso nem em invalid-workflow. A recusa não grava Ticket ou posição; revisão, atenção e rascunho permanecem disponíveis. O cliente mantém o cartão na coluna de origem e apresenta a mensagem; não confirma um movimento recusado.

Recusa de fluxo: `BoardRemoteError` — `code` estável + `message` pt-BR. Códigos: `column-needs-destination` (removeu coluna com Tarefas sem destino), `duplicate-column`, `needs-you-unique`, `empty-workflow`, `todo-done-required`, `unknown-column`, `no-category-column`, `invalid-workflow`. Nunca `INVALID_WORKFLOW` no fio.

Na remoção de colunas, o host usa `applyBoardWorkflowEdit(current, columns, fields, seats, tickets, destByRemoved)` do engine e persiste `{workflow,seats}` na mesma transação. O helper inclui cartões cuja coluna era apenas projetada, exige destino para colunas ocupadas e não altera Tickets, Assignments nem a categoria de execução. Somente seats migrados recebem `workflowMove?: {stageCategory: StageCategory}` com a categoria atual do Ticket. Reaplicar a edição é idempotente. `applyWorkflowEdit` puro do core continua disponível, mas sozinho não mantém a projeção de destino quando as categorias diferem.

`resolveColumn` respeita o destino marcado enquanto a categoria do Ticket coincide com a marca. Sem marca, o comportamento anterior permanece. Na mudança automática de categoria, o host usa e persiste `syncPlacementFromStage`, que volta ao mapeamento normal e remove a marca; `moveToColumn` também devolve seat sem marca na movimentação manual. A marca é metadado interno de posicionamento e não muda a categoria exibida da execução. Persistência é aditiva, por JSON validado no store do Anvil; dados antigos sem a chave continuam válidos. Uma nova coluna SQLite, se necessária, exige versão monotônica e teste de migração do store pelo seu dono.

## Proposta da Coordenação (PB-3)

`proposeWorkflow({ description })` **nunca escreve**. Devolve o cartão «Usar este fluxo?» (`WorkflowProposalView`). Blob JSON sujo passa por `parseWorkflowProposal`; se ilegível, `degraded: true` + fallback Simples.

`acceptWorkflowProposal({ columns, fields, destByRemoved?, template? })` aplica o cartão (único `save` deste caminho). `template` vem do cartão; se omitido, infere do prefixo das colunas. `rejectWorkflowProposal(scope)` devolve o fluxo atual e **não grava**. Coluna removida com Tarefas exige `destByRemoved` (mesmo `BoardRemoteError` de `updateWorkflow`).

**PB-5 Conversa:** `getProjectConversation(scope)` → `{ projectId, channelId, name }`. Cria `#geral` do projeto (`id` = `geral:<projectId>`, ou `geral` no Pessoal se já existir). `createProject` já garante o canal. Prism/Lumen abrem essa `channelId` na aba Conversa.

Prompt: `PROPOSE_WORKFLOW_PROMPT` em `persona-core`.

## Sprints

| RPC | Efeito |
|---|---|
| `listSprints` / `createSprint` / `planSprint` / `startSprint` | CRUD + backlog ↔ sprint |
| `closeSprint({ leftover, confirmed })` | sem `confirmed` → `pending: true`, sem rolagem |
| `sprintSummary` | digest peak-end sem encerrar |

Objetivo do sprint = `goal-sprint-<id>` para o host ligar `dsh-goal`.

## ACL

Leitura: `requireProject` / `requireWorkspace`. Escrita: `requireWrite`. Mesma regra do restante do host.

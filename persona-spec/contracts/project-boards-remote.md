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

Recusa de fluxo: `BoardRemoteError` — `code` estável + `message` pt-BR. Códigos: `column-needs-destination` (removeu coluna com Tarefas sem destino), `duplicate-column`, `needs-you-unique`, `empty-workflow`, `todo-done-required`, `unknown-column`, `no-category-column`, `invalid-workflow`. Nunca `INVALID_WORKFLOW` no fio.

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

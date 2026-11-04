# Restauração da pasta — SW-6

Estado: Remotes do host implementados e prova SQLite/pasta comum verde; aceite integrado com UI e suíte SW-9/SW-10 continua pendente. Dono: Anvil. Consumidor: Lumen (Revisar e Projeto › Histórico). O Remote é `persona`.

| Método | Pedido | Resultado |
| --- | --- | --- |
| `listRestorePoints` | `workspaceId`, `projectId` | `{status: available ou unsupported ou unconfigured, points: RestorePointView[]}` |
| `undoApply` | `workspaceId`, `projectId`, `restorePointId` | `{kind: restored ou expired, restorePointId}` ou `{kind: blocked, explanation}`; nunca converte expiração em sucesso |
| `getProjectStorageUsage` | `workspaceId`, `projectId` | `{status: measured ou unavailable, historyBytes, draftBytes, totalBytes, retentionDays}`; contadores são `null` quando a leitura não termina |

WIRE-4: os nomes finais no namespace persona são listRestorePoints e undoApply. Não existem list, undo ou undoApproval nesse namespace. Adaptadores locais do cliente podem ter nomes próprios, mas chamam esses Remotes explícitos; undoApply restaura arquivos e não desfaz contratação/aprovação. Não apresentar “Desfazer decisão” sem uma operação própria implementada.

WIRE-5: reviewSummary, prepareReview e discardReview recebem workspaceId/projectId/ticketId. command/reason ficam opcionais só para aceitar chamadas antigas; não são necessários nessas operações. Preparar/descartar exigem escrita no projeto. WIRE-3: acceptReview usa conflicts, nunca choices. A UI mapeia mine→keep_mine, theirs→keep_persona e both→keep_both, preservando path e os snapshots user/persona devolvidos pelo bloqueio, inclusive null para arquivo ausente. Hash/mode não são inventados pelo cliente; se mudaram, o host volta a bloquear e devolve o novo conflito.

Cada ponto identifica `id`, `ticketId`, `createdAt`, `expiresAt`, `state: available|undone|expired` e `files` relativos à pasta do projeto. A UI apresenta o nome da Tarefa pelo `ticketId`; caminhos do diretório privado, hashes, branches e comandos não entram nesses resultados. Projeto com Git existente não fornece esses métodos opcionais e devolve `unsupported`; projeto sem pasta devolve `unconfigured`. Isso não representa um histórico vazio medido. `undoApply` exige escrita no projeto, ator humano, UUID validado por `parseReviewRestorePointId` e ponto listado no mesmo projeto. O clique explícito em Desfazer é a ação humana; não há confirmação técnica adicional.

A seleção automática do ReviewDelivery depende da pasta real: projeto sem `.git` usa histórico privado em `PERSONA_HOME/history/<projectId>`; projeto que já usa git mantém seu histórico. Projetos existentes conservam ID, pasta, tarefas e mensagens. A migração não cria `.git` na pasta do usuário, não move seus arquivos e não exige confirmar uma nova configuração técnica. Histórico e pontos são criados somente quando uma Tarefa altera arquivos; resposta textual não ocupa rascunho.

O porto do engine é dono do ponto anterior à aplicação, da aplicação sem resultado parcial, da expiração de 30 dias e da restauração. A seleção automática ocorre em `reviewDeliveryOf`, sem alterar IDs, pastas ou dados SQLite dos projetos existentes. Os bytes são somas lógicas dos arquivos privados, sem seguir links simbólicos nem incluir os arquivos da pasta do usuário. `historyMaxCopyBytes`, `historyGitTimeoutMs` e `historyGit` são configurações opcionais do host. O Git embutido/instalador continua com Rivet (SW-4).

`acceptReview` mantém seus campos atuais e acrescenta `restorePointId?` no sucesso e `conflicts?` no bloqueio. O pedido aceita `conflicts?: {path,user:{hash,mode}|null,persona:{hash,mode}|null,choice:keep_mine|keep_persona|keep_both}[]`, com as versões exatas apresentadas pelo bloqueio anterior. A escolha é explícita; decisão obsoleta volta a bloquear sem sobrescrever edição nova.

Prova prevista: pasta comum e projeto existente em SQLite; aplicar por ReviewDelivery, listar um ponto, desfazer e comparar bytes; preservar mensagens/Tarefas no reinício; negar projeto alheio e identificador de ponto de outro projeto; Uso reportar bytes reais; pasta continuar sem `.git`. Os testes do host usarão o porto falso antes da composição com o engine real, sem chamadas de IA.

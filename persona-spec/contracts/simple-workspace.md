# Restauração da pasta — SW-6

Estado: preparação do host; depende dos portos SW-1/SW-2 do Forge. Esta página define os campos propostos para o Remote `persona`; os métodos ainda não estão disponíveis. Dono: Anvil. Consumidor: Lumen (Revisar e Projeto › Histórico).

| Método proposto | Pedido | Resultado |
| --- | --- | --- |
| `listRestorePoints` | `workspaceId`, `projectId` | pontos válidos do projeto, mais recentes primeiro |
| `undoApply` | `workspaceId`, `projectId`, `restorePointId` | resultado discriminado `restored` ou `blocked`, com mensagem segura em português |
| `getProjectStorageUsage` | `workspaceId`, `projectId` | bytes de histórico, rascunhos e total, prazo de retenção em dias |

Cada ponto identifica `id`, `ticketId`, `createdAt` e `expiresAt`. A UI apresenta o nome da Tarefa pelo `ticketId`; caminhos do diretório privado, hashes, branches e comandos não entram nesses resultados. Falha e espaço não medido não viram listas vazias ou zero bytes fictício. `undoApply` exige escrita no projeto e confirmação humana; a leitura exige acesso ao mesmo projeto. O host nunca aceita caminho de arquivo como identificador de restauração.

A seleção automática do ReviewDelivery depende da pasta real: projeto sem `.git` usa histórico privado em `PERSONA_HOME/history/<projectId>`; projeto que já usa git mantém seu histórico. Projetos existentes conservam ID, pasta, tarefas e mensagens. A migração não cria `.git` na pasta do usuário, não move seus arquivos e não exige confirmar uma nova configuração técnica. Histórico e pontos são criados somente quando uma Tarefa altera arquivos; resposta textual não ocupa rascunho.

O porto do engine é dono do ponto anterior à aplicação, da aplicação sem resultado parcial, da expiração de 30 dias e da restauração. O host deriva o projeto da sessão, serializa operações por projeto e mapeia falhas para cópia segura. A persistência de seleção/migração e a medição de bytes serão ligadas ao porto estabilizado, sem duplicar a implementação do Forge.

Prova prevista: pasta comum e projeto existente em SQLite; aplicar por ReviewDelivery, listar um ponto, desfazer e comparar bytes; preservar mensagens/Tarefas no reinício; negar projeto alheio e identificador de ponto de outro projeto; Uso reportar bytes reais; pasta continuar sem `.git`. Os testes do host usarão o porto falso antes da composição com o engine real, sem chamadas de IA.

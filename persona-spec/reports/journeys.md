# Jornadas de produto (host) — Forge

Camada de lógica ponta a ponta sem navegador. Arquivos novos em `packages/persona/persona-host/tests/journeys/`. Probe continua dono da UI (reduced-motion, diff vs `dirD-tela.png`). Testes do Anvil (`boards.spec.ts`) não foram editados.

Rodado: `pnpm exec vitest run packages/persona/persona-host/tests/journeys` → **19 arquivos** (J1–J19). Layer-1 S7: `mandatory-s7-host-contract.spec.ts` (J1–J10).

| ID | História | Resultado | O que o usuário vê |
|---|---|---|---|
| J1 | Onboarding do zero → equipe do usuário → 1ª mensagem → resposta | passou | Pasta limpa sem personas; só Guia após contratar; resposta no #geral; nenhum Atlas |
| J2 | Pedido → Tarefa → revisão → Aceitar / Pedir ajustes / Descartar | passou | doing → review; Aceitar sem pasta = bloqueado «Projeto sem pasta»; Pedir ajustes grava o texto; Descartar ok |
| J3 | Três Contratar? em cadeia, sem escalar acesso | passou | Cartão pending até aprovar; ferramentas `{}`; sem credencial; `canRecruit: false` |
| J4 | Troca de Coordenação sem perder histórico | passou | Tarefas e mensagens iguais; nova fala sai do Bento |
| J5 | Cofre aprovado em Contexto usado; DM não vaza | passou | DM/CNPJ ausentes do contexto da conversa no canal |
| J6 | Convidado só vê o papel | passou | Projetos/DMs vazios; `listMemory` → `forbidden` (não revela Cofre) |
| J7 | Orçamento estourado + janela de silêncio | passou | Canal: «orçamento de tokens do mês esgotado»; tick no silêncio não explode a bandeja |
| J8 | Host cai no meio; retoma sem duplicar | passou | Mesma Tarefa; um `coord-m-talk-reply`; recovery note |
| J9 | Importar Markdown: prévia / reimportar / rollback | passou | 1 aplicado; 2ª confirmação 0; rollback true |
| J10 | Export sem DM e sem segredo | passou | Sem `/dms/`; sem `sk-ant`; `looksLikeCredential` false |
| J11 | C2 Attention: Precisa de você → resposta → cartão abre Tarefa → marco no canal | passou | `answerAttention` limpa a pergunta; `citedCardTicketId`; `completeReview` posta Concluído |
| J12 | Dois projetos Contratação e Site: colunas e Tarefas isoladas + ACL | passou | Triagem ≠ Descoberta; ids de Tarefa não cruzam; guest em hire não lê o quadro Site |
| J13 | Concluir → 1ª `done` do fluxo do projeto; Attention → `needs_you` ×3 | passou | Contratação / Site / Software: cartão Attention em `needs_you`; Tarefa encerrada na 1ª coluna `done` |
| J14 | Editar fluxo com Tarefas vivas + Vigia/puxada; remover sem destino recusa | passou | add/renomear/reordenar ok; Tarefa permanece; sem destino → pt-BR via `workflowRefusalText` (Remote cru = `INVALID_WORKFLOW`, ver Anvil) |
| J15 | Sprint criar → planejar → iniciar → encerrar com rolagem e marco | passou | `goalId` = `goal-sprint-sp-1`; status planejado→ativo→encerrado; resumo entregue/atrasado no #geral do projeto |
| J16 | Coordenação propõe fluxo: cartão, aprovar, recusar, JSON sujo | passou | «Usar este fluxo?»; recusar não grava; aceitar via `createWorkflowFromTemplate`; JSON sujo degrada |
| J17 | Migração v7→v8: Tarefa antiga sem assento | passou | schema 8; Tarefa cai na 1ª coluna da categoria do estágio |
| J18 | Export/sync: fluxo e sprint viajam; DM não; reimportar não duplica | passou | `fluxo.md` + `sprints.md`; sem `/dms/`; `mayUpload` project sim / dm não; restore 2× sem duplicar sprint |
| J19 | Governança no export/sync do workspace; DM não; reimportar não duplica | passou | setor + auditoria viajam; DM fora |

## S7 (honesto)

Host (Forge): J1–J19 verdes neste arquivo; layer-1 S7 = `mandatory-s7-host-contract.spec.ts` (J1–J10). UI (Probe): reduced-motion e diff vs `dirD-tela.png` continuam `it.todo` — o S7 do PLAN não é 6/6.

## Quadros (J12–J18) — limites honestos

- J14: o Remote do Anvil (`mapBoardError`) devolve `Error('INVALID_WORKFLOW')` e descarta o `detail` pt-BR. A jornada prova a recusa e a mensagem via `workflowRefusalText` do core.
- J15: `sprint.goalId` existe; `startSprint` **não** cria GoalBoard da Coordenação.
- J18: `exportProject` estoura `StoreError: forbidden` se o canal existe sem stream (zero mensagens). A jornada posta uma linha no #geral antes de exportar.

## Defeito corrigido nesta onda (J1–J11)

`requestChanges` sem pasta do projeto tentava `retryTicket` com Tarefa em revisão (`ready`) e estourava `notRetryable`. Agora anota o pedido, marca `blocked` se preciso, e só então retenta.

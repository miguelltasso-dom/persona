# Jornadas de produto (host) — Forge

Camada de lógica ponta a ponta sem navegador. Arquivos novos em `packages/persona/persona-host/tests/journeys/`. Probe continua dono da UI (reduced-motion, diff vs `dirD-tela.png`).

Rodado: `pnpm exec vitest run packages/persona/persona-host/tests/journeys` → **10/10 passed** (14.36s). J11 (C2 Attention+marco) verde à parte.

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

## S7 (honesto)

Host (Forge): J1–J10 verdes neste arquivo. UI (Probe): reduced-motion e diff vs `dirD-tela.png` continuam `it.todo` — o S7 do PLAN não é 6/6.

## Defeito corrigido nesta onda

`requestChanges` sem pasta do projeto tentava `retryTicket` com Tarefa em revisão (`ready`) e estourava `notRetryable`. Agora anota o pedido, marca `blocked` se preciso, e só então retenta.

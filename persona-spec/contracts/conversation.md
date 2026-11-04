# Contrato — a conversa nunca fica muda (D-079 / CONV-1)

Dono: **Bolt** (roteamento no host: `orchestration.ts` `ingest`). Cliente/E2E: Flint/Prism (linhas de estado), **Probe** (`mandatory-conversation-d079.spec.ts`).

## Invariante
**Toda mensagem da pessoa recebe uma resposta, uma reação ou uma linha de estado visível. Nunca silêncio.**

## Quando uma mensagem CONTINUA uma Tarefa (e só então)
1. **A Tarefa está RODANDO** (turno aberto) **nesta conversa** (canal/DM) **no mesmo assunto** (`topicId` igual; sem assunto = o geral): o texto entra na fila do turno aberto (`Runner.deliver(…,'queue')`) e a linha **“Passei para {Nome}: lê assim que terminar o passo atual.”** aparece no fio.
2. **Responde à pergunta** que a persona fez nesta conversa (Tarefa `waiting` com `attention`): vale a mensagem em palavras simples (que não pede trabalho novo) ou uma resposta com `replyToId` na linha “Precisa de você…”. O host chama `answerAttention`, **acorda o worker** (nova Assignment que lê a resposta; roda na hora) e escreve **“Resposta enviada para {Nome}: continua “{título}”.”**. O Remote `answerAttention` (cartão “Precisa de você”) também acorda o worker.

## O que NUNCA absorve
Tarefa **pronta/em revisão, bloqueada, falhou, concluída, parada pela pessoa** ou de **outro assunto**. A mensagem segue o fluxo normal: pedido de trabalho (`wantsWork`) → Ticket próprio; senão → conversa (resposta com a voz da persona). Tarefa encerrada **não é religada** por mensagem nova.
Mecânica: cada mensagem humana tem o **próprio Thread** no engine (`<kind>:<idDaMensagem>`); a “continuação” é decidida de propósito pelo host (acima), não pelo Thread compartilhado do canal.

## Linhas de estado (sempre da persona, sem modelo)
| Situação | Linha |
|---|---|
| continuação | Passei para {Nome}: lê assim que terminar o passo atual. |
| resposta à pergunta | Resposta enviada para {Nome}: continua “{título}”. |
| persona/equipe ocupada | Estou terminando “{título}”; respondo em seguida. (ou “A equipe está terminando…”) |
| persona pausada | {Nome} está pausada. Use /retomar para voltar. (a mensagem é guardada e **começa no /retomar**) |
| janela de silêncio / sem vaga | Recebi. {Nome} está em horário de silêncio até HH:MM; começo assim que acabar. · Recebi. A equipe está ocupada; começo assim que liberar. |
| regra recusou (duplicado, injeção, fora de escopo, comando) | Já tenho esse pedido, igual ao de agora há pouco; não abri outra tarefa. · Não vou seguir esse pedido. · Isso fica fora do que posso fazer aqui. · Não consegui usar esse comando: … |

Cortesia sem modelo (D-075: “obrigado”, 👍 → reação) e a primeira entrega **não mudam**.

## Para o E2E (Probe)
“Retorno” = reação **ou** nova mensagem `[data-message-id]` de outro autor (todas as linhas acima são mensagens da persona no fio) **ou** o balão que cresce (`streaming`). Texto exato das linhas na tabela.

## Prova
`persona-host/tests/conversation-d079.spec.ts` (13): rodando no mesmo assunto, assuntos coloridos, outro assunto + “Estou terminando”, resposta a pergunta (2ª Assignment termina), `answerAttention` acorda o worker, pedido de trabalho enquanto ela espera NÃO é a resposta, e — para **pronta/em revisão, bloqueada, falhou, concluída e parada** — chat e pedido nunca absorvidos nem mudos, tarefa encerrada continua encerrada; DM; primeira entrega intacta. `preroute.spec` (pausa guarda e /retomar devolve).

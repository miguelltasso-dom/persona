# Responder a pergunta da persona com texto e arquivo, dentro do fio (IV-10 backend)

Dono: Forge (host `answerAttention`, `persona-host/src/attention-answer.ts`, `orchestration.deliverAttentionAnswer`) · UI: Ember.

Antes: `answerAttention({ticketId, text})` só devolvia o texto ao Ticket (nada aparecia no fio, nenhum arquivo). Agora a resposta é uma **mensagem da própria pessoa na conversa onde a pergunta foi feita**, com arquivos, e o worker acorda lendo texto e arquivos.

## Remote

`answerAttention({workspaceId, projectId, ticketId, text, attachmentIds?}) → boolean` (true = a pergunta foi liberada).

1. Suba cada arquivo com `attachFile({streamKind, ownerId, name, bytesBase64})` **na conversa em que a pergunta foi feita** (hoje `channel`/`geral` ou a DM da persona; o `streamId` da pergunta em `attentionEvents` diz qual) e passe os `id` em `attachmentIds` (mesmos limites do `postMessage`: 8 MB por arquivo, no máximo 8 arquivos e 20 MB no total por mensagem; qualquer tipo de arquivo é aceito, o nome é higienizado, e o host recusa com a frase “… tem N MB. O limite é M MB. Escolha um arquivo menor.”; a UI pode checar antes de subir, o host decide de qualquer jeito).
2. `text` pode ser vazio **se** houver pelo menos um arquivo (vira “Segue o arquivo.” / “Seguem os arquivos.”). Sem texto e sem arquivo: recusa.
3. O host posta a mensagem `answer:{ticketId}:{attentionId}` na conversa da pergunta (autor = a pessoa, no mesmo assunto), liga os arquivos a ela e entrega ao Ticket o texto com “Anexos: nome1, nome2”. Quando o projeto tem pasta, os arquivos são copiados para `inputs/` da worktree do worker (como os arquivos do pedido que abriu a Tarefa); tarefa sem pasta só recebe os nomes (nada é escrito fora da worktree do produto).
4. O worker acorda (nova atribuição) e lê a resposta.

A mesma regra vale para quem responde **em palavras no próprio fio** (mensagem comum com anexo): os nomes entram na resposta e os arquivos vão para a worktree.

## Erros (todos antes de postar qualquer coisa)

| Código | Quando | Mensagem |
| --- | --- | --- |
| `invalid-payload` | sem texto e sem arquivo; texto > 8000; ids inválidos; arquivo de outra conversa ou inexistente | “Escreva a resposta, escolha uma opção ou anexe um arquivo.” · “A resposta passa de 8000 caracteres.” · “Um dos arquivos não pertence a esta conversa. Anexe de novo.” |
| `not-found` | Tarefa inexistente neste projeto | “Tarefa não encontrada neste projeto.” |
| `conflict` | a pergunta já foi respondida (uma resposta por pergunta; a primeira fica) | “Essa pergunta já foi respondida.” |
| `forbidden` | guest ou persona (agora exige escrita no projeto) | — |

Idempotência: o id da mensagem é determinístico; repetir a chamada com a pergunta ainda aberta (por exemplo depois de um arquivo recusado) não duplica a mensagem.

## Prova

`persona-host/tests/attention-answer.spec.ts` (8): texto no fio e no Ticket; texto + arquivo (mensagem com `attachmentIds`, “Anexos:” na resposta, arquivo em `inputs/` da worktree); só arquivo; arquivo de outra conversa recusado antes de postar; segunda resposta recusada; o worker acorda e reporta; guest recusado; pasta que não é a worktree do produto nunca é escrita. Regressão: `attention.spec`, `j11-c2-attention`, `attachments.spec`, `remote-acl-matrix` verdes.

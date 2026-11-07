# Contrato — HT-5: canais e assuntos como ferramentas de produto (Bolt, 05/11 06:10) — v1.2, DESENHO (nada em src)

Decisão do Keel (05/11 06:00): fica para DEPOIS do corte (v1.2): não é comportamento do D-090 e cada ferramenta nova é uma definição carregada por turno do worker (a D-097 acabou de enxugar o custo das ferramentas de equipe). Este documento deixa o desenho pronto; destravado pelo CV-6 (`team-channels.md`), que já está na árvore.

## 1. As ferramentas (5, todas `write`; oferecidas só quando o pedido pede)
| verbo | entrada | delega para (a MESMA regra do Remote da pessoa) | desfaz |
|---|---|---|---|
| `channel_create` | `{ name, topic?, members?: [{kind:'persona'\|'human', id}] }` | `ChannelRepos.create({kind:'custom'})` + `setMembers` (a regra de nome do `renameChannel`: 1–32, sem `#`/controle, único no projeto) | `archiveChannel` do id novo (**arquivar, nunca apagar**) |
| `channel_archive` | `{ channelId }` | `ChannelRepos.archive(id, 'by-person')`; recusa `#geral` e canal de outro projeto | `unarchiveChannel` |
| `subject_create` | `{ name, colorIndex? }` — na conversa da Tarefa | a regra de `createConversationSubject` (cor única por conversa; reaproveita assunto arquivado) | `archiveConversationSubject` |
| `subject_rename` | `{ subjectId, name }` | `topics.rename` | renomear de volta (`before`) |
| `message_move_to_subject` | `{ messageId, subjectId }` | `topics.moveEvent` (só mensagens da conversa da Tarefa) | mover de volta (`before`) |

## 2. Quem pode (a identidade vem do RUN, nunca do argumento — `HarnessPorts.identityOf`)
- **Pedido da pessoa** (`person-request`): vale para as 5.
- **Iniciativa da persona** (`persona-initiative`): `asked`/`propose` recusam; `act` pode só `subject_*` e `message_move_to_subject` **na conversa da própria Tarefa**; `channel_create`/`channel_archive` por iniciativa são **sempre recusados** ("canais são decisão da pessoa").
- Uma persona só age na conversa da PRÓPRIA Tarefa (`conversationOf(projectId, ticketId)`); nunca em outro canal, DM de outra pessoa ou projeto. Membros de `channel_create` têm de existir no projeto (personas) ou no workspace (pessoas).
- Teto: no máx. 3 canais abertos criados por personas por projeto (contagem pelo registro de atividade); `#geral`, canais de equipe e `#diretoria` nunca são tocados por ferramenta (só o `renameChannel`/`archiveChannel` da pessoa).

## 3. Idempotência e falha
- `callId` repetido = a mesma resposta, nunca a ação duas vezes: `channel_create` usa o id estável `chn-{callId}`; `subject_create` o id do assunto (conversa + cor); `rename`/`move` são idempotentes por natureza.
- Recusa = uma frase com o caminho ("Peça à pessoa para criar o canal"), `{ ok:false, code: forbidden|invalid|limit }`, igual ao `persona_hire`.
- Atividade (feed, HT-7): `{ verb, target:{kind:'channel'|'subject'|'message', id, title}, initiator, requestId?, undoable, undo:{remote, request}, at }`.

## 4. Custo (a preocupação do Keel)
- Oferta por PALAVRA do pedido (`crie um canal`, `arquive o canal`, `novo assunto`, `mova … para o assunto`), como o `persona_hire`: sem as palavras, nenhuma das 5 entra no turno.
- Definições curtas (≤ 2 linhas de descrição por ferramenta) e **um só objeto de entrada por verbo**; medir com o mesmo contador da D-097 antes de ligar.

## 5. Onde mexe (quando a janela abrir na v1.2)
1. `persona-host/src/harness-channels.ts` (novo): `ChannelPorts` com deps injetadas (`channels`, `topics`, `conversationOf`, `eventStreamOf`, `now`); espelha `harness-hiring.ts`.
2. `persona-host/src/harness-ports.ts` + `index.ts`: `HarnessPorts.channels`, fiação em `new HarnessPorts({...})`.
3. `persona-host/src/harness-dispatch.ts`: 5 casos novos (grupo `CHANNEL_TOOLS`) + `ChannelActivity` em `AnyActivity`.
4. `persona-host/src/harness-turn.ts`: regex de oferta `CHANNELS`.
5. `persona-runners/src/mcp/harness-tools.ts` (Rivet): `HARNESS_TOOLS` + `DEFINITIONS` das 5; `tool-level.ts`: nível `write` (a regra WRITE já ganha).
6. Extração (a "função comum" do `harness-tools.md` §10): a regra de cor única/arquivado de `createConversationSubject` vira `createSubject(...)` chamada pelo Remote e pela porta (hoje vive dentro do Remote em `index.ts`).

## 6. Prova (quando entrar)
`tests/harness-channels.spec.ts`: cada ferramenta + o Desfazer que a UI rodaria · pedido × iniciativa (asked/propose/act) · canal/assunto/mensagem de outra conversa recusados · `#geral`/equipe/diretoria intocados · mesma chamada 2× = uma ação · teto de 3 · o par do `remote-acl`; processo real (fase nova no `proactivity-live.ts`); contagem de tokens das definições.

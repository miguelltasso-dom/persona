# Casa da Equipe — o host (Muse §29/§29b, item 22) — Flint, 12/11

Status: módulos puros e `ChannelHouse` **prontos e testados** (15/15); os Remotes e as portas estão em **staging** (`.maestri/tmp/flint/casa/`, instalador `install-hooks.cjs`) e entram depois do "corte gravado" (congelamento de `packages/**`). Tudo abaixo vive atrás da superfície `channels` (D-113): desligada = os 5 Remotes são recusados pelo funil com `feature-off`.

## Os 5 Remotes (todos fenceados no projeto; nenhum escreve nada além da marca de leitura da própria pessoa)

| Remote | Entrada | Resposta | Regras |
|---|---|---|---|
| `getChannelUnread` | `{ workspaceId, projectId }` | `ChannelUnread[]` | Um item por canal NÃO arquivado. Canal que a pessoa nunca olhou **começa no último fio** (a história antiga não é "nova"). |
| `ackChannelRead` | `{ workspaceId, projectId, channelId, seq }` | `ChannelUnread` (já com a marca nova) | Marca **só avança**, nunca passa do último fio; `seq` não inteiro ou < 0 = `invalid-payload`; canal de outro projeto = `not-found`. É a marca DA PESSOA (guardada em `screen_doc`, kind `channel_read`; sem migração). O nome começa com `ack` de propósito: é "write-class" no guarda (limite de escrita, não de leitura). |
| `getChannelHere` | `{ workspaceId, projectId, channelId }` | `HereGroup[]` | Grupos na ordem: `owner` ("Dono"), um `team:<id>` por equipe (só quem está NESTE canal), `unassigned` ("Sem equipe"), `away` ("Fora agora": pausada ou sem motor). Grupo vazio não vem. Ninguém aparece duas vezes. |
| `getMessageOrigins` | `{ workspaceId, projectId, messageIds[] }` | `Record<messageId, MessageOrigin>` | Só entra no mapa a linha que uma **rotina** fez (`{ kind: 'routine', routineId, name }`); as outras não aparecem. **O autor é lido do store, nunca do cliente**; só conta linha de canal DESTE projeto; no máximo 200 ids; rotina de outro projeto/apagada = sem chip (nunca palpite). |
| `getChannelSuggestions` | `{ workspaceId, projectId, channelId }` | `ChannelSuggestion[]` (exatamente 3, ou `[]` se ninguém está no canal) | Feitas de quem está NO canal (pelo cargo); as genéricas completam, sem repetir. |

## Tipos (reexportados por `types.ts`; é o que o Typert enxerga)
- `ChannelUnread { channelId, unread, mentions, firstUnreadSeq?, lastSeq }` — conta só linhas de OUTROS (tipos `message`/`runner`/`error`, corpo não vazio); `mentions` = `@handle` ou `@nome` da pessoa (sem acento/caixa; `@anabela` não é `@ana`). Linha de thread de Task, autor interno (`team:…`) e linha que um cartão substitui **não** contam (mesmo filtro da lista de mensagens).
- `HereGroup { id: 'owner' | 'away' | 'unassigned' | `team:${string}`, name, members: HereMember[] }`; `HereMember { personaId, name, title, doing?, away?: 'paused' | 'no-engine' }`. `doing` = a frase do que ela faz agora, **só quando `state = working`** (mesmo vocabulário da resposta de status). O membro do grupo `owner` tem `personaId: ''`.
- `MessageOrigin { kind: 'routine', routineId, name }`; `ChannelSuggestion { id, label, prompt }`.
- Pedidos novos: `AckChannelReadRequest extends ChannelScopeRequest { seq }`, `ChannelOriginsRequest extends ProjectScopeRequest { messageIds }`.
- `getChannelLayout` ganha (opcionais no tipo; o host sempre manda): `companyName?` (nome do workspace) e `personaCount?` (personas do projeto); `humanCount` já existia (dono incluso, sem convidado).

## Exemplo
```ts
const unread = await host.getChannelUnread({ workspaceId, projectId })      // [{ channelId: 'geral', unread: 3, mentions: 1, firstUnreadSeq: 41, lastSeq: 43 }, …]
const after = await host.ackChannelRead({ workspaceId, projectId, channelId: 'geral', seq: 43 }) // { unread: 0, … }
const here = await host.getChannelHere({ workspaceId, projectId, channelId: 'geral' })           // [{ id: 'owner', … }, { id: 'team:mkt', members: [{ personaId: 'p-bia', doing: 'Escrevendo a legenda' }] }]
const chips = await host.getMessageOrigins({ workspaceId, projectId, messageIds: visibleIds })   // { 'coord-t-9-done': { kind: 'routine', routineId: 'resumo', name: 'Resumo das 8h' } }
```

## Limites honestos
- `doing` é por PERSONA (o que ela faz agora), não amarrado a uma conversa deste canal; é um retrato — o cliente relê a cada quadro novo de `followMessages`. Sem push próprio.
- "Fora até 15h" **por persona** NÃO existe: o horário real vem da espera de cota (por Task); hoje só há o nível de equipe em `getOverview().engineStatus.{quotaWaiting,quotaResetsAt}`. Entra por persona só se o elo Task→persona se confirmar.
- Contagem varre no máximo 1000 linhas por canal (lotes de 200); passado disso o selo diz "muitas" (`unread >= 1000`).
- A leitura de linhas herda o ACL do store (`EventRepos.list`): o que ele recusa, a Casa devolve como "nada novo".

## Como foi provado
`persona-host/tests/channel-house.spec.ts` (8, puros) e `channel-house-compose.spec.ts` (7, a composição sobre portas falsas, inclui o caso da página filtrada curta); no host real: `channel-house.host.spec.ts` (staged; vermelho→verde após instalar).

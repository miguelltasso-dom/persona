# Equipe remota no host — E12 / D-063

Dono: Anvil. Consumidores de UI: Prism/Lumen (E13). O fluxo local usa dois perfis Persona e o edge em loopback, sem conta ou deploy Cloudflare. Nenhuma conexão é criada por padrão.

## Remote `persona`

Todos os métodos recebem `workspaceId` e `projectId` locais existentes. O host resolve o membro pela sessão; nenhum campo de pedido escolhe um ator ou papel de dono remoto.

| Método | Campos adicionais | Resultado |
| --- | --- | --- |
| `connectRemoteTeam` | `edgeUrl`, `channelIds: string[]` | `RemoteTeamState`; somente o dono local pode iniciar o primeiro dono no edge |
| `issueInvite` | `inviteId`, `token` (vazio gera), `role: member ou guest` | `InviteView`; o token aparece somente nessa resposta transitória e fica no Cofre |
| `listInvites` | — | metadados; `token` vazio para convites do edge |
| `acceptInvite` | `edgeUrl`, `token` transitório | estado com os canais e papel concedidos pelo convite; pedido não pode ampliar o grant |
| `revokeMember` | `inviteId` | `true` após o edge revogar o membro que aceitou esse convite |
| `syncRemoteTeam` | — | estado após push/pull serializados, ou `null` antes de conectar |
| `getRemoteTeamState` | — | estado persistido, ou `null` antes de conectar |
| `getRemoteTeamAvailability` | — | `{vault: available ou unavailable ou test}`; disponível antes de existir conexão |

`issueInvite` continua atendendo os convites locais quando não existe conexão remota; seu retorno direto no host agora é uma Promise. A UI existente já aguarda o Remote. Para conexões remotas, só o dono da sessão que abriu a conexão pode emitir o convite. Um membro que aceitou convite não pode se promover a dono conectando novamente.

## Estado e apresentação

`RemoteTeamState` contém `workspaceId`, `projectId`, `edgeUrl`, `actorId`, `role`, `channelIds`, `status` (`connected`, `offline`, `revoked`, `vault_unavailable`), `cursors` por stream e `errorCode`. Não contém token, segredo ou argumentos de ferramenta. O cliente escreve a cópia em português; códigos são dados de suporte, não texto para exibir como mensagem principal.

Sem Electron, o Cofre de produção fica indisponível. `connectRemoteTeam`, `acceptInvite` e `issueInvite` devolvem falha Remote tipada `code: vault-unavailable`, mensagem segura “Cofre indisponível.”, antes de acessar o edge. A UI consulta `getRemoteTeamAvailability`, apresenta esse estado e não oferece uma gravação alternativa. Uma conexão persistida fica `vault_unavailable` ao sincronizar, conservando seu cursor e sua fila sem tráfego; revogação continua definitiva. Tokens nunca têm fallback em claro.

`offline` conserva o trabalho pendente. `revoked` persiste e para novos envios e recebimentos; repetir sync nesse estado não reabre o acesso. Uma recusa HTTP não é um replay vazio. O poll padrão é 2500 ms e o timeout é 20000 ms, configuráveis em `persona-host` por `remoteTeamPollMs` (zero desliga o poll) e `remoteTeamTimeoutMs`.

## Escopo e persistência

Só eventos futuros dos canais selecionados entram na fila; DM, canais fora da seleção, execuções e contas não entram. A primeira composição requer o projeto e os canais correspondentes nos dois hosts. O stream do edge é `project:<projectId>:channel:<channelId>`. A interface deve apresentar o nome do canal, mantendo esses IDs como dados internos.

Mensagens recebidas entram por `EventRepos.append`, com o tópico local do canal, sem chamar Intake, engine ou Vigia. O ID original do evento impede duplicação. Mensagens importadas não voltam à fila de upload. A origem aplica o sequenciamento do edge, sem reutilizar a seq local do chat.

Novos documentos de `screen_doc`: `remote_team/connection` (estado/cursor), `remote_team_pending/<eventId>` (referência ao evento local) e `remote_team_invite/<inviteId>` (metadados sem token). Não há alteração de esquema nem migração de gerações antigas. O log existente `sync_envelope` guarda os envelopes compartilhados. O cursor só é persistido após a aplicação local; repetir o replay após queda é idempotente.

Tokens de convite são enviados no corpo de POST, nunca no caminho usado pela nova composição. O host guarda o token no serviço `personaVault`; o edge guarda somente SHA-256 para resgatar o convite uma vez. Não gravar tokens em estado, SQLite local, logs ou capturas. A prova web usa explicitamente `PERSONA_VAULT_TEST_CIPHER=1` nos processos do harness; essa flag não entra em pack/desktop e não atesta DPAPI nem uma autenticação de nuvem distribuída.

## Prova

`apps/persona-edge/tests/host-bridge.spec.ts` roda edge local e dois hosts SQLite: convite, mensagem nova, canal não autorizado, DM, idempotência, cursor restaurado, bloqueio de escalada de papel e revogação. A prova dos dois perfis completos é `packages/persona/persona-host/scripts/remote-team-real.mjs`, sob `with-lock --lock build`, com homes temporários, sem dev seed e sem chamadas reais de modelo. Artefatos em `.maestri/tmp/shots/remote/sync-real/`; só um `proof.json` com `passed: true` atesta o fluxo completo.

Os controles de conectar/aceitar e os estados visuais de E13 ficam com Prism/Lumen. O script usa RPCs autenticados dos apps para essas ações e captura os painéis reais, sem inserir uma interface simulada.

# H23 / F4 — o convite do 1º colega: contrato para as telas (Ember + Muse)

Dono: Bolt. Estado: **proposta do host, 12/11 05:55** — os nomes de visão/ação abaixo são o que o host passa a expor; Ember liga a tela, Muse confere (as especificações são o §27 de `design/COLHEITA-MUSE.md`). Nada aqui é deploy: tudo roda contra o worker local (Miniflare). O que **já existe** está marcado (EXISTE); o que a F4 constrói está marcado (F4).

## 0. As 4 leis (testes negativos, não só texto)
1. A persona só roda no PC e na assinatura do **dono**. O convidado nunca dispara a persona do dono num PC que não é o do dono (teste: mensagem do convidado em canal → quem executa é o host do dono; o host do convidado não abre CLI dessa persona).
2. O acesso do convidado ⊆ o do dono (o `grant` do convite é o teto; o hub já recusa canal não concedido — `f3-ws.spec`).
3. A ficha da persona é assinada pelo dono (F4b: ficha chega ao convidado assinada com a chave Ed25519 do dono; assinatura inválida = ficha não é usada).
4. Local-first: tudo continua funcionando offline para quem tem a equipe; a fila de envelopes esvazia ao reconectar. Anexo na nuvem **não** é apagado sozinho (cota por time + aviso; o dono limpa).

## 1. O link (superfície de ataque: um link externo abre o app)
`persona://entrar/<time>/<token>` — parser **puro e estrito** (`parseInviteLink(url): { teamId; token } | undefined`, em persona-sync, sem `node:`):
- esquema `persona:` em minúsculas, host `entrar`, caminho com EXATAMENTE dois segmentos; sem usuário/senha, porta, query ou fragmento;
- `teamId`: `[a-z0-9-]{1,64}`; `token`: `[A-Za-z0-9_-]{22,64}` (base64url de ≥ 128 bits); comprimento total ≤ 160 (as peças mais longas permitidas dão 146);
- qualquer caractere de controle, espaço, `%`, `..`, barra extra, maiúscula no esquema ou segmento vazio → `undefined` (nada de "limpar e tentar");
- **o link nunca junta sozinho**: abre a tela *Entrar* com o nome da equipe e um botão explícito (`Pedir para entrar`); só o botão chama `requestJoin`.
- o token vale **1 vez** e **expira** (EXISTE no hub: `InviteView.status = open|used|revoked|expired`, `ttlMs`; padrão de 7 dias).
- Rota extra em `apps/desktop/src/deep-link.ts` (hoje só `persona://task/...`): autorizada pelo Keel, revisão do Cobalt depois da meia-noite; o desktop só **entrega o link ao host** (nunca interpreta além do parser).

## 2. Ações do host (F4) e visões
```ts
// Dono (EXISTE: issue / revoke / invites / joinRequests / approveJoinRequest / denyJoinRequest / members em RemoteTeamHost)
createInviteLink(scope): { link: string; expiresAt: number; uses: 1 }            // "Criar link de convite" + "Vale por 7 dias, para 1 pessoa."
listJoinRequests(scope): JoinRequestCard[]                                        // Aprovações, no topo, âmbar
decideJoinRequest(scope, id, { allow: boolean; role: 'conversar' | 'conversar_e_aprovar' }): void  // allow=true embrulha as chaves de canal para ELA (F4)

interface JoinRequestCard {              // "Ana quer entrar na Padaria Lua"
  id: string; displayName: string; teamName: string
  requestedAt: string                    // "Pelo link de 12/11"
  securityCode: string                   // EXISTE (RemoteJoinRequest): 4 em 4, para comparar em voz alta; Muse decide se aparece (hoje: detalhe recolhido)
  grantsOffered: Array<'conversar' | 'conversar_e_aprovar'>   // os ChoiceCards; padrão 'conversar'
}

// Convidado (F4)
previewInvite(link): { teamName: string } | { error: 'LINK_INVALIDO' | 'CONVITE_VENCIDO' | 'CONVITE_USADO' }
requestJoin(link, { displayName: string; note?: string }): JoinStatus             // cria identidade na 1ª vez (slot selado do Cofre) e manda o pedido
cancelJoinRequest(teamId): void
joinStatus(teamId): JoinStatus
type JoinStatus = 'sem_pedido' | 'esperando_dono' | 'aceito' | 'recusado' | 'vencido' | 'sem_conexao'

// Presença (F3 já empurra; F4 expõe)
presenceOf(scope): Array<{ actor: string; name: string; state: 'online' | 'ausente' | 'fora'; machine?: string }>
```
Mapeamento do hub → tela: `online`→bolinha verde, `away`/`busy`→anel lavanda (ausente), sem socket→`fora` (sem bolinha). O dono aparece `online` só enquanto o PC dele está ligado: **sem o PC do dono as personas não respondem** (estado `Esperando <dono> voltar`, nunca erro técnico).

## 2b. O que JÁ está no host (12/11 06:45, `@Remote` em PersonaHost; prova: `apps/persona-edge/tests/invite-link-flow.spec.ts`, 2 hosts reais × worker Miniflare)
| Ação | Assinatura real (tipos em `persona-host/src/types.ts`) | Observação |
|---|---|---|
| Dono: criar link | `createInviteLink(IssueInviteRequest + teamName?) -> InviteLinkView { inviteId, link, expiresAt }` | 1 pessoa, 7 dias, nome da equipe limpo (≤ 80, sem controle); exige a equipe conectada ao hub |
| Convidado: prévia | `previewInvite({ link, edgeUrl }) -> InvitePreview` | `{ ok:true, teamId, teamName\|null, projectId, expiresAt }` ou `{ ok:false, error }` com `LINK_INVALIDO` · `CONVITE_VENCIDO` · `CONVITE_USADO` · `CONVITE_REVOGADO` · `SEM_CONEXAO`; não cria nada e não pede nada |
| Convidado: pedir | `joinTeamFromLink({ workspaceId, projectId, link, edgeUrl }) -> RemoteTeamState` | relê o link (estrito) e exige que o time do link seja `workspaceId`; o estado fica `offline` + `PENDING_APPROVAL` até o dono decidir |
| Dono: cartões | `listJoinRequests(scope) -> JoinRequestView[]` | `{ id, actorId, displayName\|null, requestedAt, securityCode }`; só o dono da equipe |
| Dono: decidir | `decideJoinRequest({ ...scope, requestId, allow }) -> boolean` | `allow:true` embrulha as chaves de canal só para a pessoa; `false` recusa; só o dono |

**Ainda NÃO existe (próximas fatias):** o papel `conversar_e_aprovar` (ChoiceCards), `joinStatus`/`cancelJoinRequest`, `presenceOf` (a F3 já empurra a presença no WebSocket do hub; falta o host expor), a criação do workspace local da equipe ao aceitar (hoje o `workspaceId` local precisa ser o time do link: é a "2ª empresa no trilho", decisão de produto com Flint/Ember) e a abertura **a frio** por link (app fechado). O `edgeUrl` vem da configuração do produto (pergunta 3 abaixo), nunca do link. Uma mensagem de erro de uma ação `@Remote` chega à tela mascarada (`…`): a tela decide o texto pela PRÉVIA, não pelo erro do pedido.

## 3. Estados que a tela precisa (cada um com texto de Muse, sem jargão)
| Tela | Estados |
|---|---|
| Convidar (dono) | inicial · criando · link pronto (copiar / WhatsApp) · sem conexão com a equipe · erro ao criar |
| Entrar (convidado) | prévia (nome da equipe + botão) · enviando · `esperando_dono` (arte `convite-aguardando`, `Cancelar pedido`) · aceito (equipe aparece no trilho) · recusado · `Este convite venceu. Peça um novo a <dono>.` · link inválido · sem conexão |
| Cartão em Aprovações (dono) | 1 pedido · vários · decidindo (segure) · aceito (linha de sistema no #geral `Ana entrou na equipe.`) · recusado · falhou ao entregar as chaves (tentar de novo; a pessoa **não** vira membro pela metade) |
| Presença | online · ausente · fora · lista vazia (só eu) |
Palavras que **não** aparecem na interface: E2EE, chave, WebSocket, Worker, epoch. Aparece: `cifrado: só quem está na equipe lê`.

## 4. Como cada coisa é provada (F4)
- parser: links malformados, longos, com caracteres de controle, `%2e%2e`, unicode confundível, esquema em maiúscula (`persona-sync/tests/invite-link.spec.ts`);
- 2 hosts reais (2 Cofres em tmp) × worker Miniflare por WebSocket: convite → pedido → cartão → aprovação → mensagem cifrada → presença → revogação (fecha o socket e rotaciona a época);
- negativo das leis 1–3; boot smoke do host com a tela.

## 5. Perguntas em aberto (para o Keel decidir)
1. O papel `conversar_e_aprovar` mapeia para qual `workspaceRole` do hub (hoje `member`)? Proposta: `member` + permissão `approve_business` aditiva, sem mexer no que existe.
2. O nome que o convidado digita é só dele ou o dono pode renomear no cartão? (Proposta: o dono não renomeia; vê o código de segurança.)
3. De onde o convidado tira o ENDEREÇO do hub? O link (`<time>/<token>`) não o carrega (o domínio curto de convite é decisão do item 25, bloqueado). Proposta para a F4 local: o host lê o endereço da configuração do produto (`PERSONA_EDGE_URL`, padrão o Miniflare local `http://127.0.0.1:8787`) e o `accept` já exige origem local (`localEdgeOrigin`); quando houver domínio, ele vira UM valor de configuração, nunca parte do link (assim um link forjado não aponta o app para um servidor do atacante).

# E2EE por canal (H23 / Entrega 2): contrato do formato

Escrito pelo Bolt (F1, 12/11). Código: `packages/persona/persona-sync/src/{keys,channel-crypto,signature-web}.ts`, tipo `ChannelSealedPayload` em `persona-core/src/sync/types.ts` (ADITIVO: `SealedPayload` `alg:'workspace'` não mudou e o leitor antigo continua lendo).

## O que o servidor (Durable Object) vê e o que nunca vê
- **Vê:** `workspaceId`, `streamId` (`channel:<id>`), `seq`, `authorId` (opaco), `epoch`, o texto cifrado, a assinatura, as chaves PÚBLICAS dos membros e os `key_wrap`.
- **Nunca vê:** chave privada de ninguém, chave de canal, texto claro. Ele **verifica quem assinou** (`verifySealedSignature`, WebCrypto, roda no Worker) e **não abre** nada.

## Chaves
| Chave | Algoritmo | Onde vive | Sai do PC? |
|---|---|---|---|
| Assinatura do dispositivo | Ed25519 (seed de 32 bytes) | Cofre, slot selado DPAPI (`IdentityStore`) | **Não** (só a pública) |
| Acordo do dispositivo | X25519 (32 bytes) | Cofre, slot selado DPAPI | **Não** (só a pública) |
| Chave do canal | 32 bytes aleatórios, **uma por canal e época** | Só na RAM do dispositivo (`ChannelKeyring`); reconstruída dos `key_wrap` | Só embrulhada (`key_wrap`) |
Chaves públicas e privadas: base64url sem padding, 32 bytes (43 caracteres).

## Mensagem (`ChannelSealedPayload`)
```
{ alg: 'channel', epoch, authorId, ciphertext = base64(iv12 || tag16 || corpo), sig = base64url(Ed25519) }
cabeçalho  = "persona/seal/v2|" + frame(workspaceId, streamId, epoch, authorId) + "|"
frame      = cada campo como "<tamanho em BYTES UTF-8>:<campo>" (um "\n" ou ":" dentro de um id não move fronteira)
AES-256-GCM: chave do canal da época, IV aleatório de 12 bytes, AAD = cabeçalho
bytes assinados = utf8(cabeçalho) || bytes do ciphertext
```
Trocar canal, época ou autor invalida a assinatura **e** a tag. Abrir = verificar a assinatura primeiro e só então decifrar.

## `key_wrap` (a chave do canal para UM membro)
```
{ epoch, by, epk = X25519 efêmera (base64url), ct = base64(iv12 || tag16 || chave embrulhada), sig }
cabeçalho = "persona/key_wrap/v2|" + frame(workspaceId, channelId, epoch, recipientId, by) + "|"
KEK = HKDF-SHA256( ECDH(efêmera, pública do membro), salt = epk || pública do membro, info = cabeçalho ) -> 32 bytes
ct  = AES-256-GCM(KEK, chave do canal, AAD = cabeçalho)
sig = Ed25519 de quem embrulhou sobre frame(cabeçalho, epk, ct)   (cada campo com o seu tamanho: epk e ct não trocam caracteres)
```
Só o destinatário abre; só vale desse embrulhador, nesse canal, nessa época.

## Época e remoção
Sair/remover um membro: o próximo admin online gera a chave da época+1 e embrulha **só para quem ficou**. Quem saiu continua lendo o que já tinha e não lê a época nova (teste `a team over time`).

## Código de segurança (aprovação do convite)
`fingerprint(identidade pública)` = SHA-256 das DUAS chaves públicas, 5 grupos de 4 dígitos hex. O dono compara com a pessoa antes de aprovar (anti homem-no-meio).

## Vetores de teste
Ed25519 = RFC 8032 §7.1 (TEST 1 e 2). X25519 = RFC 7748 §6.1. Estão em `persona-sync/tests/e2ee-keys.spec.ts`.

## As 4 leis do Carbon (§0) que este formato preserva
1. A persona só roda no PC e na assinatura do dono: nada de credencial de IA ou segredo de CLI entra em nenhum envelope.
2. O acesso da persona é sempre ⊆ ao do dono: a persona herda os canais e as chaves do dono, nunca mais (F5).
3. A ficha da persona é assinada pelo dono (`owner_spec_sig`, Ed25519): verificada por quem executa (F5).
4. Local-first: o SQLite do PC é a fonte; o edge é uma ponte cega.

## ACHADO DE SEGURANÇA (Bolt, 12/11 01:18; aprovado pelo Keel 01:19): o controle de acesso do hub era só um cabeçalho
`apps/persona-edge/src/workspace-hub.ts` decidia QUEM chama por `x-persona-actor` (`denyActor`, `denyStream`, `denyOwner`) sem prova criptográfica: quem soubesse um `actorId` agiria como ele no transporte (append, after, revoke, members). A assinatura do conteúdo (F1) autentica a AUTORIA da mensagem, mas não o ACESSO ao hub. **Não há exposição viva:** o edge ainda não foi deployado (item 25 bloqueado).

**Correção (F2):** (1) cada requisição leva `Authorization: Persona-Sig actor=<id>,ts=<ms>,sig=<base64url>`, `sig` = Ed25519 do dispositivo sobre `METHOD\nPATH?query\nts\nSHA-256(body)`; o hub guarda a chave pública de assinatura do membro no `join`, recusa `ts` fora de ±2 min e uma `sig` repetida (cache curto no DO); (2) WebSocket: 1ª mensagem `hello` assinada sobre um desafio (nonce) do servidor, e o `append` só vale se `authorId` = ator autenticado; (3) `redeem` automático vira PEDIDO pendente + aprovação do dono, que embrulha a chave do canal; (4) o D1 sai (resquício: o DO já usa o SQLite próprio).

**Condição do Keel (inegociável): NÃO existe modo legado no edge.** Nenhuma flag, variável de ambiente ou binding do `src/` do edge desliga a assinatura, então o build do edge não tem como ficar "sem assinatura" em produção. Os specs antigos, que mandavam o cabeçalho cru, passam a usar um helper de TESTE (`tests/signed-fetch.ts`) que assina de verdade. Prova obrigatória: teste que o edge responde **401** a requisição sem assinatura, com ator trocado, com `ts` velho/futuro, com assinatura repetida e com assinatura de outro membro; e um teste de varredura que falha se `src/` do edge ler qualquer flag de bypass.

### Mais dois furos no mesmo plano (Bolt, 12/11 01:50, lendo `apps/persona-edge/src/index.ts`)
1. **Anexos sem autenticação.** `/w/:id/blobs/*` é atendido pelo Worker ANTES do hub: `PUT` grava qualquer coisa no R2 e `GET` lê por chave, sem checar membro (só `mayUpload` sobre cabeçalhos que o próprio cliente manda). Qualquer um que saiba um `workspaceId` gasta o R2 da equipe. **F2:** os anexos passam a ser atendidos pelo hub, depois de autenticar a assinatura e conferir que o ator é membro do canal; a cota por equipe (decisão do Miguel: sem apagar em 60 dias, cota + aviso, o dono limpa) entra na F6 sobre essa mesma porta.
2. **`GET /w/:id/webhooks/github` sem autenticação** devolve as entregas guardadas (payload do GitHub em texto claro, que o Worker vê). **F2:** exige membro autenticado. O `POST` continua só pelo Worker, que confere a HMAC do GitHub antes de repassar ao hub (o hub aceita esse POST sem assinatura de pessoa porque nada de fora chega nele por outro caminho: prova por teste).
3. **Ressalva (limite, não correção):** o "primeiro a reivindicar vira dono" (`join` de bootstrap) continua first-come. A defesa é o `workspaceId` ser aleatório de 128 bits gerado pelo host (inadivinhável); a F4 gera assim.

## ESTADO DA F2 (Bolt, 12/11 03:10): hub autenticado, entrada por aprovação, chaves embrulhadas, anexos e webhooks atrás da mesma porta
**No ar (Miniflare local, nada de Cloudflare):** (1) toda chamada ao hub leva `Authorization: Persona-Sig actor=<id>,ts=<ms>,sig=<Ed25519>` sobre `METHOD`, `path?query`, `ts` e SHA-256 do corpo (`persona-sync/src/request-auth.ts`, WebCrypto, roda no Worker; `request-sign.ts` assina no host); ±2 min; anti-repetição na tabela `seen_sig` do SQLite do DO (sobrevive à hibernação); o `ts` de um assinador só sobe (duas chamadas iguais no mesmo ms não colidem). Um `x-persona-actor` do cliente é SEMPRE descartado. (2) Não há modo legado: o teste de varredura falha se qualquer arquivo do `src/` do edge ou o `wrangler.toml` citar flag de bypass, e o D1 saiu (o DO guarda tudo). (3) `redeem` automático saiu: o convidado **pede** (`POST /invites/:token/request`, assinado com a própria chave que registra); só o dono **aprova** (`POST /join-requests/:id/approve` com os `key_wrap` do canal) e o convite continua de uso único. (4) `key_wrap` e `channel_epoch` no SQLite do DO; `rotate` só embrulha para membro ativo com concessão no canal (quem saiu não recebe a época nova); `append` num canal com chave só aceita payload `alg:'channel'`, do próprio autor, assinado, na época vigente. (5) Anexos (`/blobs/*`) e `GET /webhooks/github` exigem membro; anexo privado (`dm`/`private`) nunca sobe (`mayUpload`); o POST de webhook só entra pelo Worker (HMAC do GitHub), com uma tag interna derivada do segredo, inclusive com barra no fim.
**No host:** `RemoteTeamHost` assina tudo com a identidade do dispositivo (slot selado do Cofre, `e2ee-identity.ts`, tenant `e2ee-device`); o dono se registra com as chaves PÚBLICAS; o convidado fica `offline/PENDING_APPROVAL` até o dono aprovar; a classe ganhou `joinRequests` (com código de segurança), `approveJoinRequest`, `denyJoinRequest`. **Falta (F4):** Remote/tela de aprovação, embrulhar as chaves do canal no `approve`, selar/abrir as mensagens por canal no `SyncClient` (hoje o host ainda manda `clear`) e o WebSocket multiplexado (F3).
**Provas:** `apps/persona-edge/tests/f2-hub.spec.ts` (14, worker real) + a migração dos 8 specs do edge para chamadas assinadas (edge, client-cycle, remote-teams, host-bridge, echo-one-line, soak-150-host, idle-roster, pending-rpc) + `persona-sync` (37) + `e2ee-identity.spec` (4, Cofre real). Nota: o `host-bridge` media o cursor do bob com o número 1; a resposta automática da coordenação ("ainda não há ninguém na equipe") também é replicada, então o spec agora compara com o `head` real do edge.

## CARBON P0-14 (sprint de correção, 12/11): o que foi corrigido
1. **Framing com comprimento (v2):** `sealHeader`, `wrapHeader` e a assinatura do `key_wrap` enquadram cada campo com o tamanho em bytes. Antes, ("a\nb","c") e ("a","b\nc") davam o MESMO cabeçalho e um payload selado para um lugar abria no outro. Teste vermelho→verde: `persona-sync/tests/e2ee-hardening.spec.ts`.
2. **Chave X25519 inválida ou de ordem baixa** (zeros, pontos de ordem 4/8, tamanho errado, não-base64url): `ChannelCryptoError('BAD_KEY')`, nunca a exceção crua do OpenSSL. Na aprovação o dono recebe o erro tipado, o pedido continua pendente e ele pode negar (`apps/persona-edge/tests/e2ee-remote.spec.ts`).
3. **O host não manda mais `{ clear }`:** o dono inicia a época 1 de cada canal ao conectar (wrap para si), embrulha TODAS as épocas para quem entra (o histórico é dele), rotaciona ao remover (só quem fica recebe a nova) e as mensagens saem seladas e assinadas: o edge não guarda uma palavra em claro. Quem ainda não tem a chave tenta de novo (o cursor não anda); mensagem que não verifica é descartada sem travar o canal. Teste vermelho→verde: `e2ee-remote.spec.ts` (2 hosts reais + worker real).

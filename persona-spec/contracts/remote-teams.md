# Contrato — equipes à distância (local)

Dono do edge: **Anvil** (`apps/persona-edge`, `persona-sync`). Protocolo de envelope: `sync.md` (Forge).

Dois desks (homes isolados) + um Worker local. Deploy real = E11 (Atlas).

## Rotas do Worker (hoje)

| Rota | Efeito |
|---|---|
| `GET /health` | `{ ok, service: 'persona-edge' }` |
| `GET /w/:id` · `GET /w/:id/health` | hub do Durable Object |
| `POST /w/:id/sync/append` | sequenciador (`SEQ_GAP` se `seq ≠ head+1`) |
| `GET /w/:id/sync/after?streamId&afterSeq` | replay |
| `Upgrade /w/:id/sync` | WebSocket (`resume` / `append`) |
| `POST /w/:id/members` | dono entra sem gastar convite |
| `GET /w/:id/members` | lista |
| `POST /w/:id/members/:actorId/revoke` | corta o desk |
| `POST /w/:id/invites` | emite |
| `GET /w/:id/invites/:token` | lê; 404 `INVITE_INVALID` |
| `POST /w/:id/invites/:token/redeem` | um uso; grava `member` |
| `POST /w/:id/invites/:id/revoke` | marca o convite e o membro redimido |
| `POST /w/:id/webhooks/github` | HMAC no Worker; DO persiste `WebhookEnvelope` |
| `GET /w/:id/webhooks/github` | deliveries |
| `GET/PUT /w/:id/blobs/:key` | R2; `mayUpload` ou `403 SYNC_REFUSED` |

Header `x-persona-actor` em `sync/append` e `sync/after`. Sem header = caminho antigo (testes). Com header de membro revogado = `403 ACCESS_REVOKED`. Estranho com membros ativos = `403 NOT_A_MEMBER`. Cliente desktop: `persona-sync` `SyncClient` + `HttpTransport` / `WorkspaceCipher`.

## O que nunca sobe

`mayUpload` recusa `dm`/`private` sem `shared: true`. `isLocalOnlyStream` recusa `teach:`, `account:`, `task-run:`, `run:` mesmo com `shared`. A tarefa da persona de A executa no desk A; o envelope de run não entra no outbox.

## Retomada

Outbox do `SyncClient` fica no desk. Offline = `status: offline`. `flush` + `pull` retomam o cursor. `SEQ_GAP` se o outro desk avançou o stream — o desk que voltou puxa e não inventa seq.

## Prova

`apps/persona-edge/tests/remote-teams.spec.ts` + capturas em `.maestri/tmp/shots/remote/`.

# Contrato — equipes à distância (local)

Dono do edge: **Anvil** (`apps/persona-edge`, `persona-sync`). Protocolo de envelope: `sync.md` (Forge).

Dois desks (homes isolados) + um Worker local. Deploy real = E11 (Atlas).

## Membros

- `POST /w/:id/members` — dono entra sem gastar convite.
- `POST /w/:id/invites` · `POST /w/:id/invites/:token/redeem` — um uso; grava `member`.
- `POST /w/:id/invites/:id/revoke` — marca o convite e o membro redimido.
- `POST /w/:id/members/:actorId/revoke` — corta o desk sem passar pelo token.
- Header `x-persona-actor` em `sync/append` e `sync/after`. Sem header = caminho antigo (testes). Com header de membro revogado = `403 ACCESS_REVOKED`. Estranho com membros ativos = `403 NOT_A_MEMBER`.

## O que nunca sobe

`mayUpload` recusa `dm`/`private` sem `shared: true`. `isLocalOnlyStream` recusa `teach:`, `account:`, `task-run:`, `run:` mesmo com `shared`. A tarefa da persona de A executa no desk A; o envelope de run não entra no outbox.

## Retomada

Outbox do `SyncClient` fica no desk. Offline = `status: offline`. `flush` + `pull` retomam o cursor. `SEQ_GAP` se o outro desk avançou o stream — o desk que voltou puxa e não inventa seq.

## Prova

`apps/persona-edge/tests/remote-teams.spec.ts` + capturas em `.maestri/tmp/shots/remote/`.

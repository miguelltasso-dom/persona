# Contrato `Sync` (D-034)

Dono do protocolo: **Forge** (`packages/persona/persona-core/src/sync`).
Persistência e nuvem: **Anvil** (`persona-store` / `persona-sync` / `apps/persona-edge`). Importar os tipos daqui — não redefinir.

## Envelope

```
workspaceId, streamId, seq, idempotencyKey, classification, at, payload, shared?
```

- `seq` é atribuído **só** pelo Durable Object do workspace (ordenador único). Cliente que envia um `seq ≠ head+1` é recusado (`SEQ_GAP`).
- `idempotencyKey` igual ⇒ `duplicate` (replay do Worker ou do desktop).
- `classification`: `workspace | project | channel | dm | private`.
- `payload` é `{ clear }` ou `SealedPayload` (chave do workspace). O servidor só persiste metadados de roteamento; não abre a cifra.

## Invariantes

1. **DM/privado nunca sobe sem `shared: true`.** `mayUpload` / `assertMayUpload` (`SYNC_REFUSED` / `PRIVATE_NOT_SHARED`).
2. Duas réplicas que aplicam o mesmo stream em ordem de `seq` convergem (mesmo snapshot).
3. Retomada offline: `resumeFromCursor(log, streamId, lastSeq)` devolve `seq > lastSeq`.
4. Webhook público (GitHub etc.) vira `WebhookEnvelope { source, deliveryId, ownerDeviceId, payload }`. O Worker não interpreta o payload; o desktop dono chama o Source.

## Port `SyncLog`

`append` · `after(streamId, afterSeq)` · `byIdempotency` · `head`. `MemorySyncLog` é a suíte de contrato; Anvil pluga D1 (`apps/persona-edge` `SqlSyncLog`) e SQLite desktop (`SqliteSyncLog`). Rotas HTTP/WS: `contracts/remote-teams.md`. `isLocalOnlyStream` recusa `teach:` / `account:` / `task-run:` / `run:` mesmo com `shared`.

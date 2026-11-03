# Channel message stream (Remote)

**Owner:** Anvil (`persona-host`) · **Consumer:** Prism (`PersonaLiveStore`)

## `followMessages`

Same scope as `listMessages` (`streamKind: 'channel'`, `ownerId` = channel id, `actorId` = viewer member).

- **Mode:** Typert stream (`@Remote({ mode: 'stream' })`).
- **Frames:** `baseline` (initial page) then `upsert` (new messages) until `AbortSignal` aborts.
- **UI:** `createPersonaLiveStore` subscribes once after bootstrap; merges via `applyMessageStreamFrame`. Polling fallback remains `listMessages` on `refresh()` / after `postMessage`.

## Composer send

`postMessage` then `refresh()` (optimistic path optional later).

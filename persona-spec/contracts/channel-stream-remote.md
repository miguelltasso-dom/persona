# Channel message stream (Remote)

**Owner:** Anvil (`persona-host`) · **Consumer:** Prism (`PersonaLiveStore`)

## `followMessages`

Same scope as `listMessages` (`streamKind: 'channel'`, `ownerId` = channel id, `actorId` = viewer member).

- **Mode:** Typert stream (`@Remote({ mode: 'stream' })`).
- **Frames:** `baseline` (initial page) then `upsert` (new messages) until `AbortSignal` aborts.
- **UI:** `createPersonaLiveStore` subscribes once after bootstrap; merges via `applyMessageStreamFrame`. Polling fallback remains `listMessages` on `refresh()` / after `postMessage`.

## Composer send

`postMessage` then `refresh()` (optimistic local line before RPC).

## Direct messages

- `listDms(scope)` → sidebar; `selectDm(id)` loads `listMessages` + `followMessages` with `streamKind: 'dm'`, `ownerId` = dm id.
- Pass-through (C5b): derived from `getOverviewNow` rows (`passThroughFollowers` — workers with `currentTask`, not Coordenação).

## Task cards (C5b)

Non-`message` stream events with non-empty `subjectId` cite a ticket. Prism `mapMessage` sets `ticketId` + `taskTitle` (resolved via `taskTitleById` from `listTasks` on refresh/stream merge). `#geral` renders a button per card; click → `loadTurnContext(ticketId)` → `getTurnContext` panel (`turn-context-remote.md`). Rich card chrome (Muse) may follow; data path is live.

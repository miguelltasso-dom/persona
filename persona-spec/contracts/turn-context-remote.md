# Turn context (C5b — Contexto usado)

**Remote:** `persona/getTurnContext` with `{ workspaceId, projectId, ticketId, command: 'stop', reason: '' }` → `{ ticketId, title, triggerIds[] }`.

**Prism:** `PersonaLiveStore.loadTurnContext(ticketId)` stores `turnContext` on the live snapshot; `ConnectedGeneralChannelView` passes `turnContext` + `onLoadTurnContext` into `#geral`. Messages with `ticketId` + `taskTitle` render a task card button that calls `onLoadTurnContext`; loaded context renders a panel below the stream (Muse may restyle to drawer).

**Locale:** `persona.chat` keys `context.drawerTitle`, `context.taskLabel`, `context.triggersLabel`, `context.show`.

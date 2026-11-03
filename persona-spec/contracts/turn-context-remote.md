# Turn context (C5b — Contexto usado)

**Remote:** `persona/getTurnContext` with `{ workspaceId, projectId, ticketId, command: 'stop', reason: '' }` → `{ ticketId, title, triggerIds[] }`.

**Prism:** `PersonaLiveStore.loadTurnContext(ticketId)` stores `turnContext` on the live snapshot; `ConnectedGeneralChannelView` passes `turnContext` + `onLoadTurnContext` into `#geral` (Muse drawer UI). `ChannelMessageUi.ticketId` + `taskTitle` from kanban titles via `mapMessage`.

**Locale:** `persona.chat` keys `context.drawerTitle`, `context.taskLabel`, `context.triggersLabel`.

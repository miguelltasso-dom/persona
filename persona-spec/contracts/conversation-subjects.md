# Conversation subjects (WAVE2 §1) — Remote contract

Colored **assuntos** per channel or DM stream. Maps to engine **Thread** ids when persisted; UI always shows **color + name** (never color alone).

## Scope

```ts
{ workspaceId, projectId, streamKind: 'channel' | 'dm', ownerId: string }
```

`ownerId` = channel id or dm id (same as `listMessages`).

## Methods

| Method | Purpose |
|--------|---------|
| `listConversationSubjects(scope)` | Returns `{ subjects: SubjectView[], activeSubjectId: string }`. Default: single **Geral** subject; others created via UI (+), max 7 (WAVE2-SPEC). Cheap SQLite list; host caches 750 ms per stream (boot storms). Gateway: JSON 256 KB; reads 2000/10s; writes 240/10s; typed `rate-limited` + `retryAfterMs`. |
| `setActiveConversationSubject(scope & { subjectId })` | Active assunto for new messages and persona replies. |
| `createConversationSubject(scope & { name, colorIndex? })` | Optional name; `colorIndex` 0–6. |
| `renameConversationSubject(scope & { subjectId, name })` | |
| `archiveConversationSubject(scope & { subjectId })` | Hidden from bar; history retained. |
| `moveMessageToSubject(scope & { eventId, subjectId })` | |

## `SubjectView`

```ts
{
  id: string
  name: string
  colorIndex: number // 0..6, fixed palette (SUBJECTS-SPEC)
  unreadCount: number
  workingPersonaIds?: readonly string[] // open tickets on this subject (mandate actor via ticket_subject at ingest); empty = nobody working
  archived?: boolean
}
```

## Messages

`MessageView` gains optional `conversationSubjectId?: string` (assunto tag). `listMessages` accepts optional `conversationSubjectId` filter. `postMessage` accepts optional `conversationSubjectId`; default = active assunto.

## ACL

Same as stream read/write. Moving messages requires write on the stream.

## Domain (Forge / persona-core)

`defaultSubjects`, `renameSubject`, `archiveSubject`, `activateSubject`, `moveMessageToSubject`, `bindTicketToSubject`, `ticketSubjectChip`, `ticketCardTopic` (`topicId` + chip para `TaskView`), `restrictSnapshotToSubject`, `compileActiveSubject`. Thread key = `kind:conversationId:subject:subjectId`. `compileContext` sees only the active subject + required vault/decisions; other subjects enter only as Chain of Recall hops when cited.

## Client until host ships

`listTasks` / `getProjectBoard.cards` set `topicId` (+ `conversationSubjectId` on `TaskView`) from `ticket_subject` at ingest. Empty = no chip.

Prism uses `DEFAULT_CONVERSATION_SUBJECTS` locally and persists `activeSubjectId` per stream in session storage; replaces when `listConversationSubjects` exists.

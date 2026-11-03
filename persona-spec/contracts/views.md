# Contrato — read-models da UI

Dono: **Forge** (`packages/persona/persona-engine/src/views`).
Consumidores: Anvil (Remote), Prism/Lumen (cliente).
Persistência: port `Repositories` — memória (`MemoryRepositories`) e SQLite do Anvil.

Todos os DTOs são JSON-safe e carregam `project_id` (D-038). ACL entra pelo host: Anvil liga `canReadTicket` / `canReadThread` a `can(actor, 'read', …)`. O engine não importa `persona-core`.

## Host

```ts
interface ViewHost {
  repo: Repositories
  projectId: string
  now: () => string
  load: { running: number; queued: number; maxWorkers: number }
  canReadTicket: (ticket: Ticket) => boolean
  canReadThread: (threadKey: string) => boolean
  turns?: (threadKey: string) => { at: string; id: string; role: string; text: string }[]
}
```

Timeline padrão: `turnsFromRepo` junta Triggers alcançáveis (pending, evaluating, origem/inputs do Ticket). Cursor estável: `<at>|<id>` (`encodeCursor` / `decodeCursor`).

## Superfícies

| Função | Retorno (campos) |
|---|---|
| `overview()` | `problems[]`, `person[]` ("Precisa de você": stage `person` + Attention + report blocked/failed + review), `executor { running, queued, maxWorkers, idle }`, `flow` 24 h `{ created, ended }` |
| `ticketList(stage, offset, limit)` | página de `ticketRow` |
| `ticketRow` / `ticketSummary` | `id`, `title`, `project_id`, `stage`, `column` (P5: todo\|doing\|review\|blocked\|done), `chip`/`chipLabel` (`waiting` → "Aguardando evento"), `outcome`, `actions { retry, stop }`, `strategy`, `assignments`, `inputs`, `deliveryError`, `summary`, `attention` |
| `ticketDetail(id)` | row + Mandate (`basisFacts`), Trigger/Decision de origem, canais, Assignments, Inputs, Threads seguidas |
| `threadList` / `threadDetail` | lista; detalhe com timeline + `next_cursor` + `correlated` |
| `decisionList` | decisões via `byThread` (o port não tem `list()`) |
| `search(q)` | tickets/threads/decisions ACL-aware |

Lista saudável vazia: `person` e `problems` vazios — "saudável não ocupa espaço".

## Cartões e `persona_read`

`cards.ts` / `resources.ts`: `triggerCard` / `ticketCard` com `capped()` + `read`. `personaRead(host, id, workerTicketId?)` e `personaRecall` (prefixo `persona-spill:` = B4). Worker só lê o que `readable()` admite no próprio Ticket.

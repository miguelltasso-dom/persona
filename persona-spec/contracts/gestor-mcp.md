# gestor_* MCP (GES-2)

Rivet owns the MCP tools. Forge owns plan → approve → apply.

| tool | nível | port |
|---|---|---|
| `gestor_hire` | write | `hire({ personaId, summary })` |
| `gestor_allocate` | write | `allocate({ personaId, summary })` |
| `gestor_reorganize` | write | `reorganize({ personaId, summary })` |
| `gestor_assemble` | write | `assemble({ personaId, summary })` |

`personaId` is always `run.personaId`. Access never exceeds the holder.
Missing ports return `"<tool> unavailable"`.
**[Rivet→Forge]** bind `GestorPorts` to `gestorHire` / assemble when GES-1 is done.

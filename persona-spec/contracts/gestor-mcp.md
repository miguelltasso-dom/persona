# gestor_* MCP (GES-2)

Rivet owns the MCP tools. Forge owns plan → approve → apply.

| tool | nível | port Forge |
|---|---|---|
| `gestor_hire` | write | `gestorHire` / `runGestorHire` |
| `gestor_allocate` | write | `gestorAllocate` / `runGestorAllocate` |
| `gestor_reorganize` | write | `gestorReorganize` / `runGestorReorganize` |
| `gestor_assemble` | write | `assembleTeamForGoal` / `runAssembleTeam` |

`personaId` is always `run.personaId`. Access never exceeds the holder.
`systemRoles` literal = `team_manager`. Missing ports return `"<tool> unavailable"`.

**[Rivet→Forge]** bind to the named functions. Host persist = Anvil (`approveGestorPlan`).

# brain_* MCP (SB-4)

Rivet owns the MCP tools. Forge/Anvil own ACL and store.

| tool | nível | port |
|---|---|---|
| `brain_search` | read | `search({ personaId, text, kind?, linkedFrom? })` |
| `brain_read` | read | `read({ personaId, pageId })` |
| `brain_propose` | write | `propose({ personaId, pageId, title?, body? })` |

`personaId` is always `run.personaId`. Args never override identity.
Missing ports return `"<tool> unavailable"`.
Required-rule accept stays on the host (propose is a draft).

# @deepseek-ai/dsh-persona-runners

Adapters for the engine `Runner` port (`persona-engine/src/ports/runner.ts`, `persona-spec/contracts/runner.md`): `ensureSession` / `deliver` / `cancel` / `status` / `whenIdle` / `onEvent` / `capabilities`.

- `createFakeRunner` — scripted in-process sessions for every test (idempotent `requestId`, coordinator without `bash`, background jobs after 5 s).
- `createDshSessionRunner` — one `ctx.agents` session + one directory per ticket; steer / followup / inject; usage; shell >5 s is a background job (D-041).
- `createCoordinationDriver` — long coordination session; prompt from Forge P6; no `bash`; identity is the persona that holds the function (D-043).
- `createExecutorAdapter` — maps engine `Executor` start/deliver/stop onto the port (conformance with Forge launch/delivery).
- `servePersonaMcpTools` — Persona tools for CLIs; identity comes from the run, not the arguments.
- Turn-level OAR wrappers (`createClaudeRunner`, `createCodexRunner`, `createOpencodeRunner`, `createCursorRunner`) keep explicit permission mode, resume, cancel, usage. Cursor advertises MCP as unavailable.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-009, D-040, D-041, D-043).

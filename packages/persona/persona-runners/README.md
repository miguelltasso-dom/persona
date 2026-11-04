# @deepseek-ai/dsh-persona-runners

Adapters for the engine `Runner` port (`persona-engine/src/ports/runner.ts`, `persona-spec/contracts/runner.md`): `ensureSession` / `deliver` / `cancel` / `status` / `whenIdle` / `onEvent` / `capabilities`.

- `createFakeRunner` — scripted in-process sessions for every test (idempotent `requestId`, coordinator without `bash`, background jobs after 5 s).
- `createDshSessionRunner` — one `ctx.agents` session + one directory per ticket; steer / followup / inject; usage; shell >5 s is a background job (D-041).
- `createCoordinationDriver` — long coordination session; prompt from Forge P6; no `bash`; identity is the persona that holds the function (D-043). Starting the driver opens no model turn; persona instructions accompany the actual input in the same delivery, without a separate prompt injection.
- `createExecutorAdapter` — maps engine `Executor` start/deliver/stop onto the port (conformance with Forge launch/delivery).
- `servePersonaMcpTools` — Persona tools for CLIs; identity comes from the run, not the arguments.
- Turn-level OAR wrappers (`createClaudeRunner`, `createCodexRunner`, `createOpencodeRunner`, `createCursorRunner`) keep explicit permission mode, resume, cancel, usage. CLI never opens with `prompt`. Cursor advertises MCP as unavailable.
- Answer-only turns use inline context without requesting tools. Claude `deny` disables its native tools and permission prompts; Codex keeps the read-only sandbox. Unsupported vendor flags are not passed to OpenCode or Cursor. An unexpected approval still blocks the turn, with only the requested tool name in the summary and question; arguments never enter that diagnostic.
- Resolve failures expose `RunnerResolveError.toPayload()` with the stable code, human provider name, optional login command and quota reset time. Network failures use `provider_unreachable`; the client owns localized recovery actions.
- CLI version probes yield asynchronously so background connection detection does not hold the host's first paint. Usage is committed and emitted before the terminal report; a consumer may stop at that report without losing the ledger entry.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-009, D-040, D-041, D-043).

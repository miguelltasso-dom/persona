# @deepseek-ai/dsh-persona-vault

Credential vault for DSH API keys. Electron main seals/opens via `safeStorage` (DPAPI on Windows) over the host IPC channel `persona-vault`. The host is RunAsNode and never imports `electron`. CLI tokens stay in each CLI's own login. Secrets never reach YAML, SQLite, prompts, exports or the canvas.

`path` selects the atomic ciphertext file (`persona-vault.json` in the Persona home); `timeoutMs` bounds each main-process request and defaults to 10000. Version-one files contain sealed references, sealed credential records and connection metadata. A malformed file is moved to `.bad` without printing its contents, then an empty store opens. Failed writes retain the previous committed values. One desktop host serializes its writes; separate profiles must use separate files.

`status()` and `availability` report `dpapi`/`available`, `test`, or `unavailable`; `assertAvailable()` throws `VaultUnavailableError` before operations requiring secrets. Without Electron IPC, reads are empty and writes reject with that actionable error, while ambient credential references still resolve from the environment. No memory cipher is selected implicitly. Harnesses may opt in with `PERSONA_VAULT_TEST_CIPHER=1`, which emits a warning; Electron ignores that flag. Never use real credentials with the test cipher. The low-level `createPersonaVault` factory requires an explicit cipher.

The sole unavailable-mode exception is the explicit `client-connection` record scope, used by local browser authentication. Those records live only in memory, are never sealed, persisted, logged or included in vault snapshots, and disappear with their provider process. Provider credentials and edge tokens remain unavailable. When a cipher is available, browser-session records follow the ordinary sealed persistence path.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-002, D-026).

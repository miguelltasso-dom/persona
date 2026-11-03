# @deepseek-ai/dsh-persona-vault

Credential vault for DSH API keys. Electron main seals/opens via `safeStorage` (DPAPI on Windows) over the host IPC channel `persona-vault`. The host is RunAsNode and never imports `electron`. CLI tokens stay in each CLI's own login. Secrets never reach YAML, SQLite, prompts, exports or the canvas.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-002, D-026).

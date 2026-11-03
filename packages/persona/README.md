# packages/persona

Persona product packages (fork-owned). Names `@deepseek-ai/dsh-persona-*`; directory = name suffix so the tooling that enumerates `packages/*/*` (Typert generator, tsdown, vitest, release, dev:web) sees them. Upstream documentation gates do not apply here (D-002 in `persona-spec/DECISIONS.md`).

| Package | Owner | Role |
|---|---|---|
| persona-core | Forge | Pure domain: ids, access policy, context compile/recall |
| persona-engine | Forge | Super-agent engine port (Trigger/Thread/Eval/Mandate/Ticket/...) |
| persona-store | Forge | SQLite persistence and migrations |
| persona-host | Forge | Host service and Typert Remote controller |
| persona-runners | Rivet | Runner contract, DSH direct, OAR CLI runners |
| persona-vault | Rivet | DPAPI credential provider |
| persona-usage | Rivet | Usage ledger and quotas |
| client-ui-persona | Prism | Browser UI plugin |
| persona-app | Keel | Product bundle |
| persona-e2e | Probe | End-to-end harness |

# @deepseek-ai/dsh-persona-store

Owns `persona.db` through `node:sqlite`: monotonic `user_version`, `application_id` `PNSQ` (`0x504E5351`), WAL, `busy_timeout`, `STRICT` tables, `VACUUM INTO` backup before each adjacent immutable migration, and synchronous `tx()` (nested via savepoints; never `await` inside).

Open with `openPersonaStore({ path })`. Default on-disk layout is `<PERSONA_HOME>/db/persona.db` with backups in `<PERSONA_HOME>/db/backups/` (D-007, D-008). Tests use `openTempStore` / `withTempStore`.

Schema v1 covers product entities (workspace, member, project including the built-in **Pessoal** kind, persona, participation, channel, dm), the per-stream event log + FTS5, the company vault + document FTS5, and routines (`RoutineRepos`: idempotency `routine_id:scheduled_for`, lease, catch-up, silence, pause-team). Tenant boundary is `project_id` (D-038). Engine repository ports land when Forge publishes the contract suite.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-002, D-007, D-008, D-021, D-026).

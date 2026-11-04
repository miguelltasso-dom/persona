# @deepseek-ai/dsh-persona-core

Pure TypeScript domain core (no I/O): branded-style ids as strings, customizable personas, team templates, hire proposals, company vault, and `compileContext` / `recall` (port of `persona-spec/context.mjs`). The Super-agent engine model lives in `@deepseek-ai/dsh-persona-engine`.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md`, `persona-spec/SCOPE.md`, `persona-spec/engine-port.md`, and `persona-spec/DECISIONS.md` (D-002, D-026).

Bring-your-context review blocks sensitive proposals by default. An explicit `edit` may remove that block only with a non-empty replacement that passes `sensitiveWhy`; accepting the original, private import, missing edits and edits that retain sensitive data remain blocked. Unresolved conflicts and duplicates still require their own review path.

Vault proposal IDs include both the relative path hash and parsed-content hash. Reordering a scan preserves IDs; changing a note produces a new review identity rather than colliding with an already imported version. Existing records remain available, and unchanged bodies still use the preview's deduplication rules.

`vaultToBringExisting` omits the importer's trailing source annotation from comparisons so the same fact repeated by another AI remains a duplicate. Stored record text and its source annotation are preserved.

Remembered permissions require an exact persona, action and target. Empty, whitespace-only and wildcard scopes are refused on creation and never cover an action, including when loaded from a persisted permission page.

Team assembly requires a team request with an explicit project or objective. A bare team command, empty text or an unrelated one-off task returns `INVALID_GESTOR` with a request to state the objective instead of creating a generic team. `existingFunctions` optionally supplies only the Gestor's authorized roster by continuous function. The result separates `hire` from `reuse`: the preview shows both, application creates only `hire`, and reused functions refer to the supplied persona IDs. Without that list, every recommended function remains a hire. The host applies each approved plan once and revalidates scope and hiring limits before persisting it.

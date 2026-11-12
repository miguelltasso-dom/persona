# @deepseek-ai/dsh-persona-components

On-demand runtime components the base installer does not carry: a pinned manifest (kind, version, HTTPS URL, sha256, bytes, archive format), a manager that downloads with progress, refuses a size or sha256 mismatch, checks free disk and renames the installed tree into `<root>/<kind>/<version>`, and the `ctx.personaComponents` service (`configured`, `state`, `ensure`, `remove`, `subscribe`). A `tar.gz` entry is stored as `model.tar.gz` instead of extracted — the shape the voice worker loads (`VOICE_MODEL_ENTRY`, the tar.gz the vosk-browser project publishes). The manifest is written by `scripts/persona/gen-components-json.mjs`. Contract: `persona-spec/contracts/on-demand-runtime.md`.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-101).

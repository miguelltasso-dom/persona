Fixtures for `BRING-YOUR-CONTEXT.md` acceptance (Gauge, BYC-6).

- `paste-sample.md` — answer in the exact prompt format (Probe).
- `paste-chatgpt.md` — fuller answer: every section, one `(incerto)` line, a CPF and a card number (must be blocked), a literal `não sei` (must be dropped).
- `paste-claude.md` — a second, non-overlapping answer (several pastes accumulate).
- The vault folder is built at test time by `src/bring-context-fixtures.ts` (`.obsidian/`, `.trash/`, binaries are created in a temp dir; no binary blobs are committed).
- Secret-looking values are assembled at runtime in the spec so the repo never holds a token-shaped literal.

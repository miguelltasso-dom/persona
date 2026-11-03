# @deepseek-ai/dsh-persona-usage

Ledger `foldUsage` (provider / model / window), official quota readers (`readOarAccountUsage`, `readCodexRolloutLimits`, `readDeepSeekBalance`) and `labelledEstimate`. Every row carries `origin: measured|estimate|official|unavailable`. Missing vendor data is never published as 0%. Contract: `persona-spec/contracts/usage.md`.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-002, D-026).

# @deepseek-ai/dsh-persona-engine

Native port of the MIT `dsh-superagent-prototype` engine (`src/core`, commit 8c32a9d; see `NOTICE`): synchronous commands, one transaction per command, effects after commit. Defines the repository ports; `persona-store` implements them.

Part of the Persona product group (`packages/persona/*`). See `persona-spec/PLAN.md` and `persona-spec/DECISIONS.md` (D-002, D-026).

`measureFirstDeliveryAcceptance()` checks the scripted intake and assignment path. It does not prove real CLI execution. `verifyFirstDeliveryRun(evidence)` checks observations from a single app acceptance run: measured usage linked to its ticket and preferred connected CLI, delivery on #geral, a completed board card, one ready milestone, and elapsed time below the supplied limit. Supply all calls from that run so coordination and retries count against the shared call budget. The verifier starts no models and returns ordered failure ids plus measured token totals; missing or estimated usage fails real-execution verification. Clean-home setup, UI observations, runner timeout, and disposal remain the app harness's responsibility.

`firstDeliveryTask()` returns an answer-only assignment with `permissionMode: 'deny'`. The complete authorized company brief is inline; only the title is clipped. The assignment requires a textual summary and a proposed next task, without file access, commands, network requests, tool reports, recruitment, or execution of the proposed work. `firstDeliveryAsk()` carries that same assignment. The host must deliver the complete assignment rather than the clipped ticket title and preserve the deny permission.

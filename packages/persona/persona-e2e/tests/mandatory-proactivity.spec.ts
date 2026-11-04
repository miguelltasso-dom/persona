/**
 * PRO-6 layer 2 — app/E2E (PROACTIVITY.md § Aceite + UI).
 * Layer 1 (engine/runner, fake clock): {@link ./mandatory-proactivity-contract.spec.ts}.
 */
import { describe, it } from 'vitest'

describe('mandatory proactivity — native v1 app (PRO-6 layer 2)', () => {
  it.todo(
    'idle cap: with backlog + open project goal, no persona stays idle longer than one Vigia watchdog cycle (fake clock); Vigia audit log shows assign/replan action, not human ping',
  )

  it.todo(
    'pull loop: completing an Assignment immediately assigns the next eligible Ticket (priority, deps ready, tools/permissions, concurrency/budget); no human dispatch between finish and next start',
  )

  it.todo(
    'dependency wake: when a blocking Ticket completes, dependent Tickets receive Subscription/event wake and become assignable without polling',
  )

  it.todo(
    'empty queue + open goal: Coordination function runs one planning turn, decomposes next work into Tickets and distributes; UI/overview shows new assignments without user message',
  )

  it.todo(
    'empty queue + no open goal: team rests — zero model/runner invocations across all personas for the Vigia observation window (legitimate zzz, no background AI)',
  )

  it.todo(
    'runner recovery: simulated runner crash, connection error, or context-full failure triggers Vigia recovery — new session with Chain of Recall handoff summary and retry with backoff; Assignment resumes or escalates with audit line',
  )

  it.todo(
    'anti-noise limits: proposal budget per persona/day, silence windows, and token/execution caps enforced — excess initiative is batched into a summary card, not channel spam; "Pausar equipe" stops proactive calls',
  )

  it.todo(
    '[Prism+Lumen] "Enquanto você estava fora" on open: lists real events with links to Tickets/tasks (peak-end); matches PROACTIVITY.md § Aceite bullet 6',
  )

})

/** Partial PRO-6 UI: {@link ./mandatory-proactivity-ui.spec.ts} (overview + #geral). Away panel E2E when dev seed exposes awayEvents. */

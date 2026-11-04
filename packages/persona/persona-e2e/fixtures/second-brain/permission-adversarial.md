# Fixture notes for SECOND-BRAIN §6.3 (Probe)

Planned cases when `second-brain-permission-gate.spec.ts` lands:

| Case | Expected |
|---|---|
| Exact match (persona, action, target, limits, in validity) | Gate skips ask; audit line |
| Stronger action same target | Re-ask |
| Same action different target | Re-ask |
| Same action/scope different persona | Re-ask |
| Expired validity (fake clock) | Re-ask |
| Revoked page | Re-ask immediately |
| Ambiguous/missing limits on permission page | Re-ask (no expand) |

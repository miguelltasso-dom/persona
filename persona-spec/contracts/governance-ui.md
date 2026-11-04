# Governance UI contract (Prism, GOV-8)

Client surfaces in `client-ui-persona/src/client/governance/` and persona editor fields.

## Structure assistant

- Four steps: company model → sectors + weekly work → rationale → org preview + 2-day test.
- `resolveStructurePlan()`: local `recommendStructure()` first; when Anvil `recommendStructure` exists, replaces plan + shows host `explanation` on step 3 (Contratar with tenant scope).
- Entry points: onboarding step 4 (`StructureAssistant`) and hire flow (`ConnectedPersonaEditor` before editor).
- Actions: skip, hire one (prefill editor), hire all (sequential `createPersona` after optional `applyStructure`), apply roster (onboarding: local roster; when `structureRemote` is set, also calls Anvil `applyStructure`).

## Persona editor governance fields

Draft fields: `sectorId`, `responsibleMemberId`, `substituteMemberId` (empty = none).

After `createPersona` / on save, Prism calls optional Remote `setPersonaGovernance` when Anvil exposes GOV-5 (no-op until then).

## Org chart / team health

- `ConnectedOrgChartPanel` / `ConnectedTeamHealthPanel` use `fetchOrgChart`, `fetchTeamHealth`, `runTwoDayTest` with mocks when RPC missing.

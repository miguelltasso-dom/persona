# Governança — contrato (GOV-1..GOV-5)

Domínio: `persona-core/src/governance`. Engine: `persona-engine/src/governance.ts` (`routeApproval`). Persistência e Remote: Anvil (GOV-5). Cartão da persona (`getPersonaCard` + talk ACL + pause/engine) em v10 (`persona-card.md`); organograma/Saúde/2 dias completam GOV-5 em seguida.

## Tipos (Forge)

`Sector` (id + nome editável + `SectorPolicy`), `PersonaCharge` (responsável, substituto opcional ≠ responsável, `confirmed`), `AwayWindow` `[from, until)`, `RoutineCharge` (executor + humano; sem dono = alerta), `GovernanceSnapshot`.

Escalonamento: persona → Coordenação (função, D-043) → responsável → substituto. `resolveApproval` / `routeApproval`: pessoa fora ⇒ substituto; sem backup ⇒ `{ kind: 'wait', notice }` — nunca silêncio.

Saúde: `assessTeamHealth`. Teste dos 2 dias: `runTwoDayTest(snapshot, from)` + `foldTwoDayLines` (rotina / aprovação / persona) + `applyGovernanceFix` (`set_substitute` | `raise_autonomy` ≤ teto do setor | `delegate_to_coordination`). Eventos levam `personaId` quando a rotina tem executor.

Assistente: `recommendStructure` / `parseStructureAsk`. Uma persona por função contínua; tarefa pontual ≠ persona.

## Remote (Anvil) — schema v11

`getOrgChart({ workspaceId, groupBy: 'person'|'sector' })` · `getTeamHealth` · `runTwoDayTest` · `applyFix` / `applyGovernanceFix` · `setResponsible` · `setSubstitute` · `setSector` · `setAvailability` · `setPersonaGovernance` · `recommendStructure` · `applyStructure` · `listAudit`.

Views no fio batem com `client-ui-persona` `governance-contract.ts` (`OrgChartView`, `TeamHealthView`, `TwoDayTestView`). ACL: só o dono muda responsabilidades; a própria pessoa (ou o dono) marca "fora". Personas sem charge na migração v10→v11 recebem o dono do workspace. `applyStructure` grava setores e donos de rotina — não contrata personas (Prism).

Export/import/sync é **nível de workspace**: `governanca.md` no zip; `SqliteGovernanceRepos.snapshot` / `restore` (idempotente); envelope `gov:<workspaceId>` com `classification: 'workspace'` sobe; DM não.

## UI

Lumen: organograma + Saúde (GOV-6/7). Prism: assistente no onboarding/Contratar (GOV-8). Muse: specs a partir de `design/ref-quem-cuida-de-quem.jpg`.

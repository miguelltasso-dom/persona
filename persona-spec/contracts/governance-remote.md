# Governança da equipe — Remote (GOV-5)

Dono do Remote: **Anvil** (`persona-host`). Domínio/simulador: **Forge** (`persona-core` GOV-1..4). Consumidores: **Lumen** (organograma + Saúde + Teste dos 2 dias), **Prism** (assistente de estrutura, campos no editor).

Escopo: **workspace** (`workspaceId` apenas). DM não entra. ACL: só owner/admin altera responsável/substituto/setor.

## Métodos

| Método | Descrição |
|---|---|
| `getOrgChart({ workspaceId, groupBy: 'person' \| 'sector' })` | Braço direito (Coordenação) + grupos + personas com estado ao vivo |
| `getTeamHealth({ workspaceId })` | Nota + achados acionáveis (`fixKind`, `fixTargetId`) |
| `runTwoDayTest({ workspaceId })` | Simulação 48h: `slotLabels` + linhas com `runs` \| `waits` \| `stops` |
| `applyGovernanceFix({ workspaceId, findingId, fixKind, targetId? })` | Correção 1 clique (substituto, dono de rotina, autonomia dentro de limites, etc.) |
| `setResponsible` / `setSubstitute` / `setSector` / `setAvailability` | CRUD de governança (editor + organograma) |
| `recommendStructure` / `applyStructure` | Assistente (Prism GOV-8) |
| `listAudit` | Trilha de aprovações |

DTOs espelham `packages/persona/client-ui-persona/src/client/governance/governance-contract.ts` até Typert publicar tipos em `persona-host/types`.

## Fallback Lumen (pré-GOV-5)

Sem RPC: mock de demonstração + **`deriveOrgChartFromLive`** quando `listTeam`/`now` estão prontos (estados reais, agrupamento provisório «Você» / função).

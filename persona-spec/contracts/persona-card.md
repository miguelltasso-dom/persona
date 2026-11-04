# Contrato — Cartão da persona (Anvil Remote · Muse/Prism)

Dono do Remote: **Anvil**. Consumidores: Muse (layout), Prism (editor / perfil).

## `getPersonaCard({ workspaceId, projectId, personaId })`

JSON-safe. Campos opcionais omitidos (nunca string vazia / 0).

| Campo | Significado |
|---|---|
| `handle` | slug do nome |
| `sectorName?` | GOV-5; omitido se o setor ainda não existir |
| `systemRoles` | `coordination` / `watchdog` |
| `nowKind` | `working` \| `reviewing` \| `waiting-approval` \| `waiting-reply` \| `quota` \| `resting` \| `stuck` \| `offline` |
| `nowText` | frase humana derivada do estado real (Assignment / Attention / quota / ociosidade / pausa) — nunca texto fixo de fixture |
| `presence` | `{ online, lastActiveAt }` |
| `ownerName?` / `substituteName?` | GOV-1/GOV-5 charge; omitidos se a linha não existir |
| `currentProjectName?` | projeto atual |
| `engine` | `{ runnerLabel, modelLabel }` |
| `quota?` | `{ fiveHourPct?, weekPct?, limitedUntil? }` de `getOfficialQuota` / `accountUsage`. **Ausente = indisponível. Nunca 0.** |

Cópia derivada (exemplos, não literais): «Revisando cláusulas do contrato» · «Esperando o plano do Claude renovar» · «Descansando — nada na fila».

## Talk ACL

| RPC | Resultado |
|---|---|
| `getPersonaTalkAcl` | `{ mode: 'workspace' \| 'chosen', principals: [{ kind: 'person' \| 'group', id, name }] }` |
| `setPersonaTalkAcl` | responsável ou dono do workspace; auditoria em `screen_doc` `persona_audit` |

Aplicação real no servidor (ator da sessão): `createDm` e `@menção` em `postMessage`. Quem não pode recebe recusa pt-BR (`Esta persona só conversa com quem o responsável escolheu.`), nunca silêncio. Dono e responsável sempre podem.

Padrão ao criar: `mode: 'workspace'`; responsável = `createdBy` (ou dono). Store interno: `everyone`/`members`.

## Pausa, retoma, motor

| RPC | Quem | Efeito |
|---|---|---|
| `pausePersona` | responsável ou dono | `nowKind: offline`; auditoria |
| `resumePersona` | idem | retoma; auditoria |
| `setPersonaEngine` | idem | troca runner; auditoria |
| `putPersonaCharge` | idem; substituto ≠ responsável | atualiza nomes no cartão |

Pausa/motor/auditoria usam `screen_doc` (`persona_runtime`, `persona_audit`) — sem bump de schema.

## UI (Prism)

`PersonaCardShellBridge` (`mount.ts`) alimenta rail, `#geral`/DM (avatares + banner), organograma (Lumen inject) e **avatar do responsável no cartão do quadro** (`FlowKanbanBoard` via slot `kanban`). Um `usePersonaCardController` por superfície; popover compartilhado com `PersonaCardPopoverHost`.

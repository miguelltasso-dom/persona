# Segundo cérebro — domínio e gate (BRIEFING 19)

Dono do domínio: **Forge** (`packages/persona/persona-core/src/domain/brain*.ts`).
Gate no engine: `persona-engine/src/second-brain.ts`.
Persistência / Remote / FTS5: **Anvil**. Tools MCP: **Rivet**. UI: **Lumen + Prism**.

A página markdown é a fonte da verdade. O índice (tipo, backlinks, "Comece aqui") é derivado. Nada é apagado: versões e `status: replaced|revoked`.

## Página

Tipos fixos: `company` `person` `client` `project` `process` `rule` `decision` `permission` `tool` `glossary` `learning`.

Visibilidade vem da audiência da origem: DM → `{ kind: 'members', memberIds }` (nunca vira página do canal). Projeto → `{ kind: 'project' }`. Canal/workspace → `{ kind: 'workspace' }`.

`canReadBrain` / `canWriteBrain` (owner, librarian, coordination). Busca e leitura omitem título e snippet se o ator não lê.

## Bibliotecário

Função atribuível (`systemRoles: librarian`, não única). Padrão: a persona de Coordenação (`resolveLibrarian`).

`curateBrain` após tarefa/conversa/aprovação: cria, atualiza, liga, ou `contradiction` (não sobrescreve). Regras/decisões obrigatórias → `propose` até aceite humano (`acceptLibrarianProposal`).

Higiene sem LLM: `hygieneBrain` (dedupe Jaccard ≥ 0.8, lembrete 90 dias). `applyHygiene` marca `replaced`; o corpo fica.

## Permissões lembradas

`rememberPermission` grava persona + ação + alvo + limites + validade (`once` | `days7` | `until_revoked`). Vira página `permission`.

`consultPermission` / `gateRememberedPermission`: só `skip` no match **exato**. Ação maior, outro alvo, outra persona, expirada, revogada ou escopo vazio → `ask`. Auditoria: `não perguntei porque você permitiu em DD/MM`. Revogar é imediato.

## Tools

| Tool | Contrato |
|---|---|
| `brain_search` | FTS (todos os tokens) + tipo + `linkedFrom`; ACL por página |
| `brain_read(id)` | página + Chain of Recall pelos `links`; ACL em cada hop |
| `brain_propose` | leitor pode sugerir; `required` exige aceite; writer aplica |

`compileBrainContext`: regras/decisões `required` entram em `requiredIds` (mapeiam `constraint`/`decision`). Citações: `title` + `locator` (tipo).

## Fora deste contrato

Store/RPC (`brainHome`, FTS5, retenção) = Anvil. Bind MCP = Rivet. Tela Empresa › Segundo cérebro = Lumen. Overlay de permissão no cartão = Prism.

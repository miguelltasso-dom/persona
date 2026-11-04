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

O host chama `curateAfterWork` após a conclusão confirmada, usando fatos autorizados e a audiência da origem, e persiste as ações com sua fonte. Uma mensagem privada não pode atualizar, deduplicar ou produzir aviso de contradição contra página de outra audiência; o core compara workspace e visibilidade, incluindo o conjunto exato de participantes da DM. Uma página pública de mesmo título permanece intacta e recebe-se uma página privada separada. Reentregas da conclusão preservam a fonte e não duplicam fatos já curados. Extração e curadoria não acrescentam um turno de modelo à primeira entrega.

Higiene sem LLM: `hygieneBrain` (dedupe Jaccard ≥ 0.8 somente dentro do mesmo workspace e audiência, lembrete 90 dias). `applyHygiene` marca `replaced`; o corpo fica. Cópias públicas e privadas do mesmo fato não substituem umas às outras.

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

## Export / sync (SB-6)

`planBrainVaultSync` (default `one_way`) + `applyBrainVaultSync`. Two-way dest com frontmatter do pack → `page`; nota Obsidian sem pack → `foreign` (BYC). Leftover nunca apagado. Persistência da pasta = Anvil/Rivet.

## Fora deste contrato

Store/RPC (`getBrainHome`, `putBrainPage`, `listBrainPages`, `exportBrainVault`/`importBrainVault` = `planBrainVaultSync`+`applyBrainVaultSync`, FTS5, retenção) = Anvil. Bind MCP = Rivet. Tela Empresa › Segundo cérebro = Lumen. Overlay de permissão no cartão = Prism.

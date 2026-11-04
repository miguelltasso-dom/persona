# Segundo cérebro — domínio e gate (BRIEFING 19)

Dono do domínio: **Forge** (`packages/persona/persona-core/src/domain/brain*.ts`).
Gate no engine: `persona-engine/src/second-brain.ts`.
Persistência / Remote / FTS5: **Anvil**. Tools MCP: **Rivet**. UI: **Lumen + Prism**.

A página markdown é a fonte da verdade. O índice (tipo, backlinks, "Comece aqui") é derivado. Nada é apagado: versões e `status: replaced|revoked`.

## Página

No host, o ID identifica a página. Títulos iguais com IDs diferentes recebem slugs distintos e não substituem o corpo ou a audiência da primeira página. Reimportação conhecida resolve o ID pelo slug do arquivo autorizado, sem transformar um put com ID novo em atualização. Edição sem campo visibility conserva a visibilidade existente. BrainPageView.audience acrescenta workspace/project/private/persona; restricted continua significando que o leitor não pode ler, portanto uma página privada do próprio leitor tem audience:private e restricted:false. O índice por leitor exclui títulos e corpos de páginas restritas a outra pessoa ou só à persona, inclusive para o dono.

ApprovalView.permissionAction/permissionTarget são os valores autoritativos para lembrar uma aprovação: vault.update + vault:<recordId>, ou skill.activate + skill:<skillId>. O alvo é o recurso estável, não o ID transitório da proposta. A UI usa esses campos no grantBrainPermission; não deriva autorização de texto ou do título. Hire e perguntas sem ação/alvo estruturados continuam exigindo pergunta. Concessões antigas que usam o ID da proposta não são ampliadas para cobrir outro recurso.

proposeVault/proposeSkill consultam gateRememberedPermission antes da pergunta, somente para a mesma persona/ação/alvo, validade e limite de usos. O concedente precisa continuar autorizado no projeto e ser o dono ou o responsável roteado. Limites desconhecidos, inválidos, concessão revogada/expirada ou já consumida não cobrem a ação. Consumo e aplicação compartilham a transação; uma falha não gasta a permissão nem marca a proposta aprovada. ApprovalView.permissionGrantId/permissionAudit e o documento remembered_approval registram a dispensa, incluindo “não perguntei porque você permitiu em DD/MM”. A trilha reaparece em listApprovals.

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

No two-way, o host captura os arquivos da pasta antes de qualquer exportação e planeja todas as notas, incluindo caminhos de páginas já conhecidas. Exportar primeiro apaga a edição externa antes de importá-la; filtrar somente caminhos extras também perde mudanças em notas existentes. O planner puro preserva corpo, ID e audiência do markdown importado. O consumidor valida ACL do ator e do ID existente, mantém a audiência original sem promoção pelo frontmatter, persiste a alteração e só então prepara a exportação atualizada. Hashes já importados tornam o replay no-op; notas alheias nunca são apagadas. O teste puro não substitui a prova de leitura/importação/exportação no host.

## Fora deste contrato

Store/RPC (`getBrainHome`, `putBrainPage`, `listBrainPages`, `exportBrainVault`/`importBrainVault` = `planBrainVaultSync`+`applyBrainVaultSync`, FTS5, retenção) = Anvil. Bind MCP = Rivet. Tela Empresa › Segundo cérebro = Lumen. Overlay de permissão no cartão = Prism.

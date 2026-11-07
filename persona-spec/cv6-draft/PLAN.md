# CV-6 — plano de entrega (Bolt, 05/11 04:20) — rascunho, NADA salvo em persona-host/src nem persona-store/src

Contrato: `contracts/team-channels.md` (Anvil/Muse). Decisão do Keel (03:58): 2ª janela de host depois da rodada real (~06:00), Bolt + Anvil, suíte completa do host + fake final repetido antes do corte; HT-5 de canais/assuntos atrás.

## COMO APLICAR (um comando, só com o OK do Keel)
```
bash persona-spec/cv6-draft/apply.sh --dry   # confere as âncoras (21 blocos do host + 4 do store) sem escrever
bash persona-spec/cv6-draft/apply.sh         # copia repos.ts, team-channels.ts, o spec e aplica os blocos
```
Depois: `check-pkg persona-store persona-host`, `vitest` do store (migração) + `team-channels.spec` + `remote-acl.spec`, `generate-typert`, suíte completa do host, e a prova no processo real (fase nova no `proactivity-live.ts`). O `apply-blocks.cjs` aqui é a cópia do aplicador atômico (tudo ou nada).

## Arquivos prontos aqui (espelham o caminho de destino)
| rascunho | destino | o que é |
|---|---|---|
| `persona-store/src/migrations.v24.txt` | `persona-store/src/migrations.ts` + `constants.ts` | `V24_TEAM_CHANNELS` (kind, source_id, archived_at/reason, name_locked, `channel_member`, `channel_pin`; `#geral` vira `general`); versão 24 |
| `persona-store/src/channel/repos.ts` | idem | `ChannelRepos` (get/list/bySource/byKind/create/rename/archive/unarchive/members/setMembers/pinnedBy/setPinned). Não há `delete` |
| `persona-host/src/team-channels.ts` | idem | `TeamChannels.reconcile(projectId)` (idempotente), `membersOf`, `teamPersonasOf`; `slugOf`, `freeName` |
| `persona-host/tests/team-channels.spec.ts` | idem | os 9 casos da prova do contrato (ajustar nomes ao que pousar) |

## Passos na janela (ordem; cada um com `check-pkg` + testes do pacote)
1. **Store:** colar a migração, subir `PERSONA_SCHEMA_VERSION` para 24, exportar `ChannelRepos` e os tipos em `persona-store/src/index.ts`; ajustar os testes que fixam a versão (`grep -rn "PERSONA_SCHEMA_VERSION\|schema 23"`); teste de migração: banco v23 com `#geral` e um canal criado ⇒ `general`/`custom`, índice único, cascata dos membros/pins.
2. **Host, módulo:** copiar `team-channels.ts`; no `PersonaHost`: `readonly channelRepos = new ChannelRepos(this.store, now)` e `readonly teamChannels = new TeamChannels({...})` com: `personas: p => this.product.listPersonas(p)`, `project`, `sectors: w => this.governance.gov.listSectors(w)`, `sectorOf: w => new Map(this.cards.listCharges(w).filter(c => c.sectorId).map(c => [c.personaId, c.sectorId]))`, `ownerIds: w => this.product.listMembers(w).filter(m => m.role === 'owner').map(m => m.id)`, `say` (events.append como o `say` do opinions, autora = Coordenação), `enabled: () => this.teamworkEnabled`, `now`.
3. **Ganchos do reconciliador (decisão do Keel 04:12: NUNCA em leitura — `listChannels` fica puro/read-only):** (a) boot (todos os projetos); (b) depois de `createPersona`/`retirePersona`/`unretire`/`setSector`/`updatePersona` (papel Gestor)/`createProject`/`restore` do organograma. Se algum fluxo precisar reconciliar fora disso: Remote explícito `reconcileTeamChannels({workspaceId, projectId})` (ACL `requireWrite`). Sem relógio, sem modelo.
4. **Seam do CV-8:** `this.teamOf = (projectId, channelId) => this.teamChannels.teamPersonasOf(projectId, channelId)` (hoje: todas as personas do projeto).
5. **`ensureProjectConversation`:** `#geral` nasce `kind: 'general'` (via `ChannelRepos.create`), e o fallback `existing[0]` passa a preferir `kind === 'general'` (hoje pega o canal mais novo — com canais de equipe isso erra).
6. **Remotes + `ChannelView` estendida:** `listChannels` (+ `projectName, kind, memberCount, archived, archivedReason?, pinned, teamName?`; ordem: fixados, ativos com #geral primeiro, arquivados no fim), `listChannelMembers`, `renameChannel` (1–32, sem `#`/controle, único no projeto ⇒ `conflict` "duplicate-name"; marca `name_locked`; **#geral não renomeia**: o Bom dia e o "Ontem" o acham por nome), `archiveChannel` (`by-person`; recusa `#geral`), `unarchiveChannel`, `setChannelPinned` (por pessoa), `createChannel` (+ `memberIds`). ACL: ler = `requireProject`; criar/renomear/arquivar = `requireWrite`; fixar = qualquer membro, só o dele. `remote-acl.spec` cobre os novos.
7. **Postar em canal arquivado:** recusa no `postMessage` ANTES de gravar: `RemoteFault('conflict', 'Este canal está arquivado. Desarquive para escrever.')`. O contrato pede `code: 'channel-archived'`, que **não existe** em `RemoteFaultCode` (`remote-guard.ts`, do Anvil): decidir com ele entre acrescentar o código (Typert + cliente) ou usar `conflict` + mensagem estável. **DECIDIDO (Keel 04:12): NÃO criar código novo.** Usar `conflict` + discriminador estável: `RemoteFault.details` hoje só tem `retryAfterMs` — ou acrescentar `details.reason?: string` (aditivo, vai no Typert) e o cliente trata por `reason === 'channel-archived'`, ou, sem mexer na forma, a constante exportada `CHANNEL_ARCHIVED_MESSAGE` (mensagem estável). Preferência: `details.reason` (tipado) se o Anvil aceitar a mudança aditiva em `remote-guard.ts`; senão a constante.
8. **Typert** regenerado; `contracts/team-channels.md` ganha o "o que pousou"; HT-5 (`channel_create`→`createChannel`, desfaz = arquivar) destrava.

## Riscos e decisões a levar para a janela
- **Bom dia / Ontem leem `#geral` por NOME** (`listChannels.find(name === 'geral')`): por isso `#geral` não renomeia nem arquiva.
- **`UNIQUE(project_id, name)`**: o `slug` do setor pode colidir com `geral`, `diretoria` ou um canal da pessoa ⇒ `freeName` (`-equipe`, `-equipe-2`…); renomear setor não pode roubar o nome de outro canal.
- **Escopo por projeto na v1** (pergunta 8 da Muse, aberta no contrato): o canal da equipe reúne as personas DAQUELE projeto; no caso comum (um projeto) dá um #marketing para a empresa.
- **Leitura do canal segue o ACL de projeto** (membros do canal organizam a conversa e o fan-out, não são barreira de privacidade na v1; #diretoria é rótulo).
- **Reconciliar só em boot + mutações** (decisão do Keel): a linha "A equipe … não existe mais" sai no momento da mudança do organograma (id `team-gone:<canal>`, idempotente); `listChannels` não escreve.
- **Fingerprint do Probe:** tudo isto toca `persona-host/src` + o schema ⇒ só na janela aberta pelo Keel, com o fake final repetido.

## Decisão do Keel (04:58): #diretoria PODE ser renomeada
O reconciliador acha a #diretoria pelo `kind = 'directorate'` (nunca pelo nome), não cria uma segunda se a pessoa renomeou, e arquivar/desarquivar não perde membros (derivados do organograma, nada armazenado). Teste no `team-channels.spec` ("#diretoria is born with a manager… may rename it…"): renomeia para `conselho`, reconcilia 2x ⇒ continua UMA; arquiva pela pessoa ⇒ não volta nem duplica; desarquiva ⇒ mesmos membros.

## Validado antes da janela (05:37, tudo FORA de src)
- `persona-e2e/tests/cv6-team-channels-logic.spec.ts` (8 verdes): o reconciliador (`TeamChannels`) sobre fakes — criar com 2+, 1 não cria, "Geral" sem colisão, encolher não arquiva, esvaziar arquiva com UMA linha, volta desarquiva o MESMO canal, arquivado pela pessoa fica, setor renomeado/trava, #diretoria por `kind` (renomear não duplica; sem gestor arquiva; gestor volta desarquiva; arquivada pela pessoa fica), membros/ordem, desligado = nada.
- `persona-e2e/tests/cv6-channel-repos-store.spec.ts` (5 verdes): o SQL REAL da migração v24 (lido dos blocos) + o `ChannelRepos` REAL sobre SQLite em arquivo: v23→v24 (#geral=general, demais custom), UNIQUE (projeto, setor), conflito de nome, trava de nome, arquivar idempotente (1º motivo vale), CHECK do vocabulário, membros/pins com cascata.
- Os dois arquivos são de staging: depois do `apply.sh` somem (o `team-channels.spec` do host e o `channel-repos.spec` do store os substituem).
- Falta só o que depende do host montado: Remotes, ACL, `appendMessage` recusando canal arquivado, `remote-acl.spec`, Typert, a prova no processo real.

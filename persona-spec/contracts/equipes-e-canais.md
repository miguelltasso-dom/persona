# Equipes e canais (item 22 da colheita) — contrato do host, 1ª fatia

Dono: Flint. Ordem do Miguel (12/11 00:30): "Equipes e canais estilo Discord", ainda local e só com personas; base para pessoas reais no mesmo chat (arquitetura com o Carbon, `carbon/COLABORACAO-PESSOAS.md`).
Sala limpa: a ideia de categorias, grupos e "responde a" veio só dos resumos públicos das ADRs; nomes e regras abaixo são nossos.

## O que esta fatia entrega (puro, sem armazenamento novo, sem tocar arquivo quente)
| Arquivo (persona-host/src) | O quê |
|---|---|
| `channel-directory.ts` | A porta `ChannelDirectory` (equipes, categorias, canais, `membersOf`), a implementação em memória (referência do que a porta significa) e a ponte `directoryOverTeamChannels` sobre o que o CV-6 já tem (setores do organograma = equipes; `TeamChannels.membersOf`). |
| `channel-address.ts` | `addressChannel(...)`: quem RESPONDE a uma mensagem escrita num canal. `outsideLine(...)`: a frase honesta quando alguém foi chamado fora do canal. |
| `channel-layout.ts` | `channelLayoutOf(...)`: as seções da barra lateral (sem categoria primeiro, depois as categorias na ordem da pessoa). `checkCategoryName(...)`. |

## Regras (as que os testes fixam)
1. `@Marketing` (o nome de uma equipe) chama a equipe inteira. Persona e equipe com o mesmo nome: a persona vence.
2. `@equipe` (ou `@time`) chama a equipe do canal onde foi escrito; num canal sem equipe própria chama todos os membros do canal; numa DM não significa nada. Palavra inteira, nunca colada em palavra ou e-mail.
3. **A cerca:** só quem está no canal responde nele. Persona citada fora do canal NÃO é acordada e entra em `outsidePersonas`; equipe sem ninguém no canal entra em `outsideTeams`. O host responde com `outsideLine` (nunca silêncio).
4. Sem ninguém citado: a rota por função (`routeByFunction`, a regra de hoje) roda SÓ entre os membros. Se alguém foi citado fora do canal, a rota por função não adivinha outra persona.
5. Ordem de quem responde: as personas citadas (na ordem do texto) e depois as chamadas por equipe (ordem do elenco, sem repetir). Pausadas seguem na lista: quem filtra pausa/limite/orçamento é o fan-out (CV-8), como hoje.
6. Barra lateral: canais sem categoria (ou com categoria que não existe mais) primeiro, sem cabeçalho; categorias por `position` e nome (pt-BR, sem acento/caixa); canais dentro por `position` e nome; arquivados fora; categoria vazia some, salvo `showEmptyCategories` (quem arruma a barra). Aberta/fechada é estado de cada pessoa na tela, nunca daqui. Nome de categoria: 1 a 40 caracteres, único sem acento/caixa.

## Ganchos propostos no host (NÃO aplicados: pedem trecho/OK do Keel)
- `orchestration.ts#ingest` e `startMentionsFanout`: trocar `mentionsOf(personas, body)` por `addressChannel(...).personas` quando o stream é canal; `outsideLine` vira uma linha final `coord-<id>-outside` (somar `'outside'` em `FINAL_LINE_SUFFIXES`).
- `functionRouteOf` (Forge): passar só os membros do canal para `routeByFunction` (hoje recebe o elenco todo).
- `index.ts#fanoutAudience`/`teamOf`: já é a semente da cerca; passa a ler `ChannelDirectory.membersOf`.
- `PersonaHost`: instanciar `directoryOverTeamChannels({ teamChannels, channels: channelRepos, sectors, sectorOf })` e expor `channelDirectory`.

## Alinhamento com o modelo do Carbon (`carbon/COLABORACAO-PESSOAS.md` §3.1, lido 12/11)
A porta já fala a língua do modelo recomendado; trocar o armazenamento não muda o roteamento. Cuidado com a palavra "equipe": no Carbon `team_space` é a EMPRESA (trilho de ícones, Padaria Lua / Agência Sol); no item 22 e nesta porta "equipe" é o que o Carbon chama de `sector` (Marketing, Atendimento).
| Aqui | Carbon | Observação |
|---|---|---|
| `DirectoryTeam` | `sector` (`id`, `name`, `position`, `color`, `icon`, `lead_person_id?`) | Hoje = setor do organograma (`sectorOf`); `personaIds` vem de `persona.sector_id`. Falta `position/color/icon` (UI da Muse). |
| `DirectoryCategory` | `channel_category` (`id`, `team_id`, `name` ≤ 40, `position`) | Hoje não há armazenamento; a ponte devolve `[]`. Abrir/recolher e fixados são por pessoa (estado de tela). |
| `DirectoryChannel` | `channel` (`category_id?`, `kind`, `sector_id?`, `position`, `archived_at?`) | Nosso `kind: 'team'` (CV-6) = `'sector'` do Carbon; `person_dm` e `visibility private` entram com pessoas reais. |
| `membersOf(...)` (persona ids) | `channel_member` | Só personas por ora; `kind: 'human'` quando houver pessoas reais no mesmo chat. |
O `Marketing` / `#marketing` / `#diretoria` "POR SETOR" que o Carbon descreve na barra são exatamente as seções que `channelLayoutOf` monta (GERAL, POR SETOR, PRIVADOS = categorias).

## Arrumar: equipes da pessoa, categorias e "Pôr no canal" (H22, 12/11 07:50) — FEITO no store e no host, atrás da flag `persona.flag.channelSections`
**Store (migração V26, aditiva):** `equipe` (nome ≤ 40, `position`, `color`, `icon`, `source_id` = espelha um setor), `equipe_member`, `channel_category` (nome ≤ 40, `position`), `channel.category_id` (`ON DELETE SET NULL`) e `channel.position`. Repos puros em `persona-store/src/channel/equipes.ts` (`EquipeRepos`, `CategoryRepos`). Nada existente muda: o canal sem categoria é o de sempre; remover uma categoria devolve os canais a "sem categoria" e não apaga nenhum.
**Porta do diretório: a assinatura NÃO mudou.** A ponte (`directoryOverTeamChannels`) ganhou 3 deps OPCIONAIS (`equipes`, `categories`, `placements`): as equipes da pessoa entram em `teams` junto dos setores (espelho de setor e arquivada não entram), as categorias feitas à mão vêm DEPOIS das seções automáticas, e uma colocação vence a seção automática do canal de equipe. A cerca é a mesma: quem responde num canal = os membros do canal; `@Nome` chama a equipe pelo nome (persona de mesmo nome vence); `@equipe`/`@time` seguem sendo a equipe do canal.
**Remotes (só o dono, `requireGovOwner`):** `getEquipeLayout(projeto)` (leitura: `{ equipes, categories }`) e `updateChannelLayout({ workspaceId, projectId, action })`, UMA ação por chamada, resposta = o layout novo: `createEquipe{name, personaIds?, color?, icon?}` · `updateEquipe{id, name?, personaIds?, archived?}` · `createCategory{name}` · `updateCategory{id, name}` · `reorderCategories{orderedIds}` · `removeCategory{id}` · `moveChannel{channelId, categoryId?, position?}` · `addPersonaToChannel{channelId, personaId}` ("Pôr no canal": só canal `custom`; #geral, canal de equipe e #diretoria vêm do organograma). `getChannelLayout` agora mostra a categoria feita à mão mesmo vazia.
**Recusas (RemoteFault tipado, com a frase pronta para a tela; nunca `gateway/internal`):** `invalid-payload` (nome vazio, > 40, com `@` ou quebra de linha, ou a palavra `equipe`/`time`), `conflict` ("Já existe uma equipe, setor ou categoria com esse nome."), `not-found` (equipe/categoria/canal/pessoa que não existe nesse projeto: a cerca do projeto), `forbidden` (espelho de setor ou canal derivado: "Mude por lá"; e não-dono).
**Testes:** `persona-store/tests/equipes-repos.spec.ts` (migração V25→V26 sobre banco real sem perda + falha honesta com rollback), `persona-host/tests/equipes-directory.spec.ts` (a ponte), `persona-host/tests/equipes.host.spec.ts` (host real: dono monta, `@Lançamento` chama só os membros, não-dono recusado, nomes, categorias, "Pôr no canal" + cerca).

## Ainda em aberto
- UI de arrumar (barra lateral, gestão de equipes): do Prism, sobre `getEquipeLayout`/`updateChannelLayout` (Typert precisa regerar).
- Quem pode arrumar (equipes, categorias, mover canal) numa conversa com mais de uma pessoa: papéis do Carbon (`create_channels`, `manage_channels`, `mention_everyone`). `@equipe` com várias pessoas reais deve respeitar `mention_everyone`.

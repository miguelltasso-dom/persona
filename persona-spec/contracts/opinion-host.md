# TEAM-4 — o lado HOST: a ferramenta `ask_team_opinion`

Tally, 04/11 23:35. O motor da rodada é do **Bolt** (`persona-host/src/opinion-run.ts`, `TeamOpinions.run`: o pedido, uma resposta curta por colega com a imagem, UMA consolidação pela persona, as linhas `OpinionView`). O orçamento é puro (`contracts/opinion-budget.md`). Esta peça é a **ferramenta**: `persona-host/src/opinion-host.ts` (`OpinionTool`, `withOpinionTool`). Provas: `opinion-host.spec` (19, portas falsas) + `opinion-tool.host.spec` (7, no host de verdade com motores roteirizados).

## O que a ferramenta decide ANTES de chamar alguém

`ask_team_opinion { question, draft: { text?, attachmentIds?, alt? }, audience?: 'team' | 'everyone' | [ids] }` (declarada em `persona-runners/src/mcp/harness-tools.ts`; só aparece se o host ligou; exige o nível `write`). Não existe `team_opinion_close`: o `run` consolida.

| Passo | Regra | Recusa (frase para o modelo, com o caminho) |
|---|---|---|
| Identidade | é a **execução** (a persona que roda aquela Tarefa), nunca um argumento; Tarefa encerrada recusa | `forbidden`, `ended` |
| Interruptor | `Config.teamwork` ligado; a chave da pessoa "Pode pedir a colegas" ligada | `off`, `not-allowed` |
| Argumentos | pergunta (≤500), rascunho com texto e/ou até 4 anexos, plateia (abaixo) | `invalid`, `unknown-colleague` |
| **Plateia** | **`'team'` (o padrão) = as pessoas LIGADAS a este trabalho**, não a empresa toda: as outras Tarefas do mesmo pedido da pessoa (as partes de uma divisão por função), as colaboradoras da Tarefa e a Coordenação (`involvedIn`, ligado no `index.ts`). Uma Financeiro ou Pessoas recém-contratada que nada tem a ver com a arte de uma campanha **não é chamada** (Atlas, 05/11 00:05). `'everyone'` = o projeto todo, de propósito (e conta como rodada grande se passar de 5 colegas). Lista de ids = exatamente esses colegas do projeto. Sem ninguém ligado (ou sem a regra do host), `'team'` cai no projeto todo. A resposta à persona diz quando a rodada foi estreitada ("foi para as N pessoas ligadas a este trabalho … para chamar o projeto todo use audience everyone") | `unknown-colleague` |
| Idempotência | a mesma chamada (`callId`) devolve a **mesma resposta** e não soma rodada nem pedido; uma repetição enquanto a 1ª roda diz `busy` | — |
| Orçamento | `budgetOpinionRound`: teto de **rodadas por Tarefa** (config da pessoa 1–3, padrão 2), teto **diário** (config da pessoa, padrão 6), quem pode responder (pausa, limite, sem motor), quem vê imagem, rascunho vazio | `rounds-cap`, `daily-cap`, `nobody`, `no-vision`, `draft-empty` (nenhuma chamada, nada escrito) |
| Autonomia | **Não é porta** (decisão do Keel, 04/11 23:36): a autonomia governa ações EXTERNAS e irreversíveis (e-mail, post, pagar, apagar); pedir ajuda ou opinião ao time é interno e é governado pela chave "Pode pedir ajuda a colegas", pelo teto diário, pelo teto de rodadas e pelo custo mostrado antes. Com a chave ligada e dentro dos tetos a ferramenta **roda**, em "Sugere e espera" também | — |

Só `ask` chega ao `TeamOpinions.run`, com `readerIds = budget.asked`, `skipped` (cada colega não chamado e o porquê), `round/maxRounds`, `estimate` e `rodape` já prontos.

**Quando vira PROPOSTA à pessoa (nada roda, nenhuma rodada é gasta):** (a) a chave "Pode pedir ajuda a colegas" está desligada (`not-allowed`: pergunte à pessoa se quer ligar); (b) um teto foi atingido (`rounds-cap`, `daily-cap`: pergunte se quer liberar mais); (c) a rodada é GRANDE: chamaria **mais de 5 colegas** (`CONFIRM_ABOVE_COLLEAGUES`, a confirmação da Muse) ou o custo estimado (ponta de cima) passa do limite que o host definir (`confirmAboveMicroUsd`; ausente = sem limite de custo além dos tetos). Em (c) a resposta é `propose` com a frase do orçamento ("Posso pedir a opinião da equipe sobre {tema}? ≈ {n} respostas") e o caminho: escolher **até 5 colegas pelo id** (`audience`) roda sem confirmar. A rodada nunca chama mais de 6 colegas (`maxReplies`).

## Contadores (do host)

- **Rodadas por Tarefa** e **pedidos do dia por persona** são gravados em `screen_doc` (`opinion_request`, uma linha por rodada) **antes** de o primeiro colega ser chamado; a rodada conta daí em diante.
- Uma rodada em que o motor recusou antes de chamar ninguém (`state: 'failed'` sem respostas) é **devolvida**: não gasta rodada nem pedido do dia.
- **Um número só para a pessoa:** `TeamworkSettings.askedToday` = pedidos a colegas do Forge (`handoffs.askedToday`) + rodadas de opinião (`opinionTool.askedToday`). O mesmo total entra no teto diário que o orçamento confere. O Handoffs do Forge não foi tocado.

## O que a persona lê de volta

Um JSON: `{ ok, state: 'done'|'partial', round, roundsLeft, opinions, ignoredAttachmentIds? }`. `opinions` (`opinionDigestFor`, engine) traz as respostas como **dado** entre `<opinioes>`, quem não acrescentou nada, quem falhou, quem não foi chamado e por quê, o fechamento que já foi para a conversa e se ainda cabe outra rodada. Texto de um colega, ou do rascunho, que dê ordens fica dentro dos delimitadores.

## Ligação (feita no `index.ts`, Anvil liberou)

`this.opinionTool = new OpinionTool({...})` depois do `HarnessPorts`; `harness: withOpinionTool(harnessMcpPorts(...), this.opinionTool)` (composição: o despacho de quadros/sprints/rotinas não foi editado); `teamwork.askedToday` = a soma. Em `harness-dispatch.ts` o gancho `options.opinion` do Bolt/Anvil ficou sem uso (ele não traz o `ticketId` da execução, que as rodadas por Tarefa exigem): pode sair.

## Limites declarados

- **Tamanho das imagens:** `OpinionToolDeps.imageSizes` existe mas o host ainda não o liga: sem ele o custo da imagem no orçamento sai `estimate` e largo (150–3.300 tokens), não `calibrated`. Falta um `media.attachmentHead(projectId, id)` (Bolt) para ler os primeiros bytes e usar `imageSizeOf`.
- **Confirmar uma rodada grande:** a persona pergunta à pessoa (`persona_ask`) e, se ela aceita, escolhe até 5 colegas; o host NÃO liga a resposta da pessoa a uma "autorização de uma rodada com todos" (depende do fluxo de propostas P1-9).
- **Cartão de rodada que parou no teto:** a recusa vai à persona e ao detalhe, não ao fio (a linha `opinion.roundsCap` do Flint precisa de um campo no `OpinionView`: `budget.stop` já existe no tipo do Bolt).

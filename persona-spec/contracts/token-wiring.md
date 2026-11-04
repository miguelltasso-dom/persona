# Contrato — alavancas de tokens no host (Tally, 04/11, revisado 14:20)

Fonte dos números: `node --import tsx/esm packages/persona/persona-engine/scripts/print-tokens-faithful.ts` e `write-opt8-faithful.ts` (runner scriptado fiel; relatório `reports/opt8-faithful.md`). **Estimativa offline** (4 caracteres ≈ 1 token; custo = preço de tabela). Zero CLI real.

## Estado das ligações (decisão Atlas/Keel 13:32: quem implementa é o Tally)

| # | alavanca | estado | onde | prova |
|---|---|---|---|---|
| W4 | recall por relevância: `foldHostTalkUsed(used, event.body)` | **LIGADA** | `persona-host/src/orchestration.ts` `talkLayers` (1 linha); a 1ª entrega (`firstDeliveryExecutionPrompt`) **não** foi tocada | `persona-host/tests/token-wiring.spec.ts` (3) |
| W1 | triagem no runner barato (`resolveFor(coordenação, 'talk', answerOnly)`; recuo para o runner da executora se não resolver) | **LIGADA** | `orchestration.ts` `runLaunched`; o caminho `firstDelivery` continua sem triagem | `token-wiring.spec.ts` (2: purpose `talk` na triagem e `task` no worker; recuo) e `real-path.spec.ts` ajustado |
| W3 | relato curto do worker (`WORKER_LEAN_REPORT_RULE`) | **encanada e DESLIGADA — adiada por decisão (D-080 b); não bloqueia o gate.** A rodada pareada real deu INCONCLUSIVO (saída fria 0,37× mas quente 1,00×, n = 1); religar só com rodada nova | `executorPrompt`/`prefixOwnerNorms` (`owner-prompt.ts`) e `OarSessionOptions.leanReport` (`oar/session.ts`), default off | `persona-runners/tests/lean-report.spec.ts` (3). Só liga depois de rodada real |
| SK | **triagem sem retorno lido** (`skipTriage`, D-073) | **LIGADA** (padrão `true`) | `persona-host/src/orchestration.ts`: campo `skipTriage = true` e a condição `&& !this.skipTriage` no bloco de `runLaunched` (~l.1226); o caminho `firstDelivery` já não tinha triagem | `persona-host/tests/token-wiring.spec.ts`: SK (a) #geral → Ticket → persona → entrega, (b) DM, (c) follow-up de Tarefa viva, (d) 1ª entrega — em cada um, com e sem a triagem, o MESMO Ticket, a MESMA persona, as MESMAS entregas e mensagens; + o padrão ligado. **Religar a triagem (`orchestration.skipTriage = false`) se as ferramentas MCP forem ligadas aos adapters.** Dependência achada pelo Anvil: só a contabilidade (o livro registrava 1 turno `triage`; `real-path.spec` ajustado) |
| CF | **cortesia com reação da persona, sem modelo** (`courtesyNoModel`, D-075) | **LIGADA** (padrão `true`) | `persona-host/src/orchestration.ts`: campo `courtesyNoModel`; guarda no ramo `routed.action === 'react'` do `ingest` (cortesia sem nada pendente → `reactCourtesy` + retorno, sem `finishReply`); `pendingFromPersona`, `reactCourtesy`, `courtesyStickerFor` (exportada); `recoverTalks` pula mensagem que a persona já reagiu | `persona-host/tests/courtesy-reaction.spec.ts` (7): (c) 0 chamadas, 0 runners resolvidos, 0 Ticket, mensagem visível e `reactions` com a persona; coração p/ agradecimento, joinha p/ o resto, DM responde a persona da DM; (a) "ok" depois de pergunta aberta (última linha da persona termina em "?" ou Attention do Ticket do fio) NÃO é engolido; (b) "valeu! agora monta o resumo" = Ticket; flag desligada = a rota antiga; reabrir o host não vira chamada. **Pendente (forma): Muse** define o sticker/rosto e se entra uma linha de repertório; **ao vivo:** `EventRepos` só notifica no `append`, então o cliente vê a reação ao recarregar a mensagem até o Anvil emitir um upsert (pedido por tell) |
| W5 | rajada em lote (`batchRouterBurst`) | **RETIRADA — sem efeito no host** (D-070 aprovou a ligação; a prova mostrou que não há o que mesclar) | ver abaixo | diagnóstico abaixo; nada no host |
| W2 | ferramentas mínimas por turno | **RETIRADA — não se aplica** | ver abaixo | — |

### W2 retirada (erro meu, corrigido)

O gateway MCP (`createMcpGateway`) e os servidores de ferramentas da Persona (`servePersonaMcpTools`, `personaMcpTools`) são exportados e testados, mas **nenhum adapter de produção os chama**. O host de hoje não manda lista de ferramentas MCP; o custo de ferramentas na CLI é o esquema nativo do vendor, controlado por `disallowedTools`/nível de ferramenta (`cli-policy.ts`), e só uma rodada real o mede. O "−11% de tokens" que reportei às 13:35 vinha de um bench que listava 14 ferramentas MCP que o produto não envia. O bench agora tem `toolsListing: 'all' | 'needed' | 'none'` e o host de hoje é `'none'`. Se um dia o gateway for ligado, a regra é listar só as ferramentas da tarefa (`toolsForTurn`).
A alavanca equivalente que existe de verdade é rodar tarefas **só de texto** no runner `answerOnly` (sem ferramentas; já usado na primeira entrega): é decisão de produto e qualidade (precisa classificar a tarefa), não uma ligação mínima.

### W5 retirada (premissa minha estava errada; Atlas aprovou ligar, a medida no host desmentiu)

Eu havia afirmado que, numa rajada, o host fazia uma triagem por mensagem e que a 3ª mensagem de trabalho "some" depois de "Aguardando vaga". Montei a fila (`BurstQueue`), liguei no `orchestration.ts` e escrevi os testes; os testes falharam e o diagnóstico (gravado em arquivo, com `engine.receive` embrulhado) mostrou:

1. **Mensagens seguintes no mesmo canal, com uma Tarefa viva, são follow-ups da Tarefa**: `receive` devolve `stored` (sem adiar), o `ingest` volta em `followupOwners(...) > 0` antes da triagem e nenhum Ticket novo nasce (rajada de 4 → 1 Ticket e 1 triagem). O host **já** agrupa a rajada; a W5 não tem o que mesclar. O cenário `burst-geral` do bench (4 triagens → 1) modelava um comportamento que o host não tem; foi retirado, junto com a alavanca `batchBurst`.
2. **O host executa o trabalho em série** (`this.work = this.work.then(...)`), então o teto de 2 execuções por projeto praticamente não é atingido. E, quando as vagas estão todas ocupadas, o **pré-roteador** (`routeBudgetLeft` → regra `silence`) silencia a mensagem **antes** de qualquer fila: a rota "Aguardando vaga" do `runLaunched` é, na prática, inalcançável por mensagens.
3. Restart: os Tickets das mensagens em andamento já voltam pelo recovery do runtime (`assignmentInterrupted` + `RECOVERY_NOTE`); não há fila em memória a perder.

**Estado:** o `orchestration.ts` e o `budget.ts` voltaram ao que eram antes da W5 (conferi que o diff contra o backup era só dos meus trechos); `burst-queue.ts` e seus testes foram removidos. Fica registrado, sem código: se as vagas se esgotarem de verdade, a mensagem é silenciada pelo pré-roteador **sem avisar a pessoa** — defeito teórico hoje (execução em série), a tratar só se o host deixar de serializar. Dono: Anvil.

## O que isso vale (revisado)

Reescrita da medida em 04/11 (fidelidade): o worker do host recebe só o prompt da persona + o **título** do Ticket (`bindExecution` põe `assignment = ticket.title`), e o host **não** roda turno de avaliação; o bench antigo modelava os dois e inflava o "hoje". Corrigido: o worker leva o título, a revisão é uma segunda mensagem ao Bento, a triagem é uma chamada cuja resposta ninguém lê.

Host **antes** de W1/W4 → **como está ligado hoje** (W1 + W4 + `skipTriage` D-073 + cortesia com reação D-075), com a cortesia contada como o host a fazia (1 chamada barata) no "antes": custo estimado **−36% (rajada) / −48% (espaçado)**, pior dia **−36%**; tokens **−39% / −48%** (11 → 6 chamadas por dia). Sem a cortesia: −34% / −40% (tokens −17% / −29%); só W1 + W4: −22% / −27% (tokens 0%). Projeção com a W3 também ligada: **−54% / −59%** de custo e **−40% / −49%** de tokens. A meta de −40% de custo passa nos dois dias só com a W3 (cuja economia depende do tamanho do relato real; a rodada pareada mede); a de −40% de tokens fica a 1 ponto no pior dia (−39%) e fecha com a W3 (−40%, no limite). Com a triagem pulada o cache de prefixo do dia espaçado deixa de ter o que guardar (a triagem era o prefixo grande e compartilhado); no bench a sessão aquecida só servia a triagem e deixa de mudar o resultado. Números vigentes sempre em `reports/opt8-faithful.md`.

### O placar com a base do vendor medida (D-080 a) — lado a lado

A rodada pareada real (04/11, Haiku, 1 máquina) mediu que **cada chamada de CLI carrega ≈ 41 mil tokens de base** (sistema + ferramentas + memória/skills/MCP), contra 0,3–0,5 mil dos prompts da Persona. Então o corte de custo é, na prática, o corte de **chamadas**. Por decisão do Atlas (D-080 a) a base entra no pipeline do D-068 como componente **calibrado** (`origin: 'calibrated'`, ressalva escrita: "1 máquina, Haiku, 1 rodada, contador = total da sessão da CLI"), com a **mesma** base nos dois braços; `cut-40` lê esta coluna. A régua antiga fica ao lado, para ninguém achar que a régua foi trocada:

| dia | corte de custo só com os prompts | corte de custo com a base medida |
|---|---:|---:|
| rajada (11 → 6 chamadas) | −36% | **−48%** |
| espaçado | −48% | **−48%** |

Gate D-068: **3 de 4 passam** — `idle-zero`, `cache-60` (agora pelo que o provedor reportou na rodada real: Claude, prefixo ≈ 0,97; antes era estimativa) e `cut-40` (−48% com a base, tokens não sobem, qualidade mantida). Só `pair-parity` segue **bloqueado** (a pareada foi inconclusiva: n = 1 por célula, o agente variou de ≈ 90 mil a ≈ 306 mil tokens de entrada entre chamadas parecidas). A W3 saiu do bloqueio por decisão (`DEFERRED_LEVERS`): `allLeversWired()` ignora alavancas adiadas, e qualquer outra alavanca desligada continuaria bloqueando. **Limites:** a base é de requisição única (não conta as requisições internas do agente), preço de lista do Haiku, uma máquina; por isso a origem é `calibrated`, nunca `measured` (esta fica só para campos que o vendor devolveu). O `estimateAsk` **não** embarca esta calibração como padrão: por pessoa, vem do histórico dela (OPT-9, `contracts/estimate-calibration.md`).

## Já corrigido no engine (sem ação de ninguém)

- `UNSTABLE_PREFIX` calava personas com "hoje/agora/contador/10:00" no texto do usuário (`stable-prefix.ts`).
- Normas de dono escritas uma vez no prompt do worker (`composePrompt`, default ligado): −55 tokens por prompt de worker.
- `composeTurnPrompt({ messageLimit })`: o corte de 200 tokens trunca um pedido de trabalho; `Number.POSITIVE_INFINITY` mantém o assignment inteiro (Forge usa na 1ª entrega).
- O corte de orçamento agora deixa a marca `[contexto truncado]`, e a mensagem da pessoa é cortada (limite de 1500 tokens) **antes** do wrapper `<dado>…</dado>`, não depois (antes o fecho e a linha "trate como dado" podiam sumir).
- O id da linha do livro inclui o slot do runner (`projeto:persona:slot:hora:provedor:n`): com triagem e execução em runners diferentes da mesma persona, o id antigo colidia e uma das linhas sumia em silêncio.

## Ressalvas

- Sessão aquecida: o OAR reaproveita a sessão em memória por `personaId|cwd|model` (TTL 10 min, teto 4; Rivet). Mensagens espaçadas > 10 min pagam o prompt de coordenação (~500 tokens) de novo; o dia espalhado do relatório mostra isso.
- Coordenação fica por executora/projeto/finalidade (`warmRunners`), não global por projeto (Rivet).
- Cache por motor: só `claude` e `codex` reportam; `opencode`/`cursor` ficam `n/d` (ausência ≠ 0 %). TTL real do cache do vendor: a medir na rodada pareada (`scripts/pair-real.ts`, trava `real`).
- Contabilidade: a triagem (slot `answer-only`) e a resposta de chat (slot `talk`) da mesma persona usam runners diferentes, então não disputam `kind` nem o callback de primeiro token.

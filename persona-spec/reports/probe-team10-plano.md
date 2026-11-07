# TEAM-10 — plano do aceite (b): a rodada REAL curta da equipe (Probe, 05/11 00:40)

Rascunho para o Keel pedir o OK ao Atlas **quando existir o build com os hosts novos**. Nada disto gasta chamada paga até esse OK. Base de medida real já existente: D-069 (1 turno `claude/haiku`, ambiente nativo, entrada 308 902 tokens incl. cache escrito, 28,4 s).

## 1. O cenário (um só pedido da pessoa, uma campanha pequena, texto + imagem)

Pessoa (o harness, "Miguel") escreve UMA mensagem no #geral, **com o cartaz anexado** (`src/team-image-fixture.ts`: PNG fixo, círculo vermelho sobre fundo azul, faixa amarela, `alt` escrito pela persona):

> "Preciso do cartaz da promoção de pão de queijo da Padaria Lua: texto curto e a arte. O cartaz anexo é o rascunho atual, pode melhorar."

Equipe de **3 personas** (todas `claude`/`haiku`, `runnerModel` fixo): **Lia** (Coordenação), **Bia** (texto), **Téo** (arte). Autonomia "Age dentro de limites" (a persona pede opinião direto, dentro do teto). Flag `persona.flag.teamwork` ligada.

| # | Comportamento D-090 | O que tem de acontecer na rodada real | Linha visível esperada no fio (Forge) | Chamadas pagas (estimativa) |
| --- | --- | --- | --- | --- |
| 1 | Passar contexto (bilhete) | Lia roteia; Bia entrega o texto e passa ao Téo com bilhete (pronto/falta/arquivos/decisões) | "Bia passou para Téo: {título}" · o bilhete só na Tarefa do Téo | 2 (Lia 1, Bia 1) |
| 2 | Passar trabalho encadeado | Téo recebe, faz a arte, entrega; a dependência acorda a próxima persona sozinha | "Téo entregou para Bia: {título}" | 1 (Téo) |
| 3 | Pedir ajuda para terminar | Téo trava na legenda do cartaz e pede ajuda a **Bia** (colega específica); Bia ajuda e devolve | "Téo pediu ajuda a Bia: {título}" → "Bia entregou para Téo: {título}" → "Téo retomou “…” com a entrega de Bia" | 2 (Bia 1, Téo retoma 1) |
| 4 | Pedir opinião ao time, **com imagem** | Téo compartilha a imagem no canal e pede opinião (fan-out iniciado pela persona, 1 rodada); Lia, Bia e Atlas-revisor respondem com marca (`like`/`suggestion`/`concern`/`nothing`) descrevendo o que veem; Téo consolida | cartão "Pedido de opinião" + respostas agrupadas + "Téo juntou as opiniões: …" | 3 respostas + 1 consolidação = 4 |
| 5 | Revisão entre colegas com selo | A revisora (Lia) revisa antes de entregar à pessoa; 0–1 devolução | "Revisado por Lia" (selo só com revisão real) | 1–2 |
| 6 | Reunião do dia ("Bom dia") | Gerada **sem IA** (Ontem / Hoje / Precisa de você) a partir do estado da rodada; **0 chamadas** | cartão "Bom dia" no #geral | 0 |

Total esperado: **≈ 10–12 chamadas** haiku; **teto proposto: 14**.

## 2. Orçamento e teto (para o Atlas fixar na hora)

- **Teto de turnos: 14** (`PERSONA_REAL_TURN_CAP=14`, ledger absoluto e fresco por rodada) — limitador do app **e** vigia do harness (ledger a cada 1,5 s; mata a árvore do app no turno 15 ou em qualquer turno que não seja `execution`/opinião).
- **Rodadas de opinião: máx. 2 por Tarefa** (padrão do Tally); a rodada real usa 1.
- **Tokens por chamada:** só com **answer-only como padrão (AO-1)**: ~1,6 mil de base (medido a seco pelo Tally) + a imagem (~1,5 mil) + contexto ⇒ **~3–6 mil** por chamada ⇒ **≈ 40–70 mil tokens** no total (≈ US$ 0,05–0,10 em haiku; estimativa). **No modo nativo (309 mil/chamada) a rodada custaria ~3–4 milhões de tokens: NÃO rodar.** Condição de ouro: **o exe sob teste tem AO-1 ligado por padrão** — o harness lê a camada `tools` do ledger de cada turno e **aborta** se algum turno vier com o peso do modo nativo (> 50 mil de entrada).
- **Tentativas:** 1. Se falhar, diagnóstico OFFLINE (transcrito + `persona.db` + fake) e novo OK do Atlas para a 2ª; nunca repetir em seguida. Os 2 turnos que sobraram do D-069 **não** entram (Atlas, 05/11).
- **Tempo:** ~10–15 min; janela dura 120 s por turno, 20 min no total, `dispose` garantido.

## 3. Pré-requisitos (todos verificados antes de gastar)

1. Build com **TEAM-1..8** (host Forge/Anvil/Bolt/Tally, telas Flint/Ember/Prism/Lumen/Quill) e AO-1 padrão; exe instalado do Setup **e** `win-unpacked` com o mesmo sha256.
2. **Fake verde nessa exe:** `installed-roteiro` (chat, CAP, D-079 a/b/c/d **sem tolerância**, sem IA, LEAK-1 = 0) + o "Um dia da equipe" do Gauge (6/6, roteirizado, 0 IA) com o transcrito limpo (sem vazamento, sem "bilhete" no fio).
3. ENG-1 resolvido (ok no H2 #4), LEAK-1 e D-079 (a) corrigidos (tree v1.1).
4. Ambiente: `claude` real logado, env **limpo** (sem `VITEST*`/`PERSONA_SCRIPTED*`), nenhum stub no PATH/pinos, trava `real` (nada em paralelo; OPT-8b do Tally antes ou depois). **ATUALIZAÇÃO (Anvil, TEAM-15, 05/11 02:25): os 4 switches (teamwork, fanout, startOnBoardMove, productTools) já VÊM LIGADOS no app real; as variáveis abaixo viram desnecessárias num host real (continuam aceitas); `PERSONA_<FLAG>=0` desliga; sob Vitest o padrão segue desligado (limpar `VITEST`). O harness continua passando-as ao exe por garantia e grava no proof.** **Opt-in da equipe real NO AMBIENTE do app (Flint/Keel/Anvil, 05/11 00:50):** o host só devolve opinião, passagem (`handoff`), resumo da manhã (`dailyBrief`), revisão e o fan-out do CV-8 com **`PERSONA_TEAMWORK=1`**, **`PERSONA_FANOUT=1`** e **`PERSONA_PRODUCT_TOOLS=1`** (esta oferece `persona_ask`, pedir opinião, quadro, contratar… às Tarefas de CLI real — HT-14; Bolt 05/11 01:37; `PERSONA_START_ON_BOARD=1` liga o HT-3 e não é necessária na rodada) (o app não passa `Config` ao host; padrão DESLIGADO até o TEAM-15). O harness passa as duas ao lançar o exe (`startInstalledDesktop({ env })`) e **grava no proof que estavam ligadas**; com `teamwork` ligado o fio traz os cartões de plano/entrega e esconde os "Em andamento/Pronto" que eles substituem — o leitor do transcrito mostra os tipos novos e acusa em `ignoredTypes` qualquer um que ainda não leia.
5. OK explícito do Atlas **com o teto na hora**; Forge observa; Muse mede o tempo e a leitura humana; Tally mede o custo.

## 4. Critério de aceite (o veredito é o `evaluateTeamRound` + o que o Atlas lê)

Passa **só se tudo for verdadeiro** (fail-closed; o que faltar vira problema nomeado):

- Ledger **medido**, 1+ turno, **≤ teto**, **sem assinatura do fake** (engine `dsh`/1-1), nenhum turno em modo nativo (camada `tools` pesada).
- **≥ 2 personas** falaram (esperado 3) e há **linha de passagem visível** (tipo `handoff`); **cada bilhete gravado chegou ao Ticket do colega** (`<bilhete>` no assignment) e **nenhum bilhete aparece no fio** (nem `<bilhete>`, nem decisões/arquivos, nem o texto do `help` em linha alheia).
- **A imagem chegou à equipe:** linha com anexo de imagem; **outra persona descreve ≥ 2 coisas que a imagem mostra** (cores/formas do cartaz) — prova de que viu, não um "ótimo!" genérico; o cartão de opinião traz o `alt`.
- Pedir ajuda funcionou: colega específico, devolve, a pedinte **termina** (linha "retomou").
- **Revisão real:** selo "Revisado por {R}" só existe com revisão registrada (`review_state`); sem selo falso.
- **Bom dia** apareceu com ≥ 1 seção e **0 chamadas** pagas (conferido no ledger).
- **0 vazamentos** (LEAK-1: nenhum prompt interno, marcador `[[…]]` cru ou erro de motor no fio).
- Transcrito legível (`team-transcript.ts`: fio em ordem, anexos, **Bilhetes** fora do fio, **Revisões**, chamadas pagas medidas) + capturas dos marcos para a Muse (aceite visual) e o relato do Atlas ao Miguel.

## 5. O que o harness faz (e o que falta dos outros)

Pronto (Probe, testado, 0 IA): transcrito (`team-transcript.ts`), imagem fixa (`team-image-fixture.ts`), veredito puro (`team-round-verdict.ts`), env limpo (`clean-env.ts`), guarda do fake no ledger, orçamento/limitador/vigia do D-069 (`real-run-budget.ts`, `turn-cap.ts`), proof com ledger e baseline.

Falta (dependências, registradas):
- **LACUNA DE PRODUTO que afeta a rodada (Bolt, 05/11 01:13; levada ao Keel):** a CLI REAL (claude/codex via OAR) não recebe nenhuma ferramenta de pergunta — `persona_ask` só existe no DSH; o gateway do HT-0 só abre as ferramentas do harness. Medido: uma pergunta em texto livre vira ENTREGA e a resposta da pessoa vira conversa nova. A rodada real depende de as ferramentas "pedir a um colega", "passar adiante" e "pedir opinião" CHEGAREM à CLI real (Anvil/HT-0); sem isso os comportamentos 1–4 não acontecem com `claude` de verdade.
- **Anvil/Forge:** como a pessoa-harness dispara o pedido com a imagem (`postMessage` com `attachmentIds` já existe) e os ganchos para **semear as 3 personas** (RPC `createPersona`), ligar a flag e a autonomia; **ferramentas** `ask_team_opinion`, "pedir a um colega", "passar adiante" vivas.
- **Bolt:** o fan-out iniciado pela persona e a imagem **até o runner** (`turnImages`) com o motor com visão.
- **Tally:** `estimateAsk` e o teto de rodadas visíveis; a leitura da camada `tools` por turno para o aborto "modo nativo".
- **Prism/Forge:** gerar o cartão "Bom dia" **agora** (sem esperar o dia seguinte) por um gatilho do harness (relógio injetável ou Remote de teste), sem IA.
- **Quill/Muse:** a tela de Configurações (teto, rodadas) e o aceite visual das capturas.
- **Gauge:** o transcrito limpo do "Um dia da equipe" (já alinhado com o leitor; `EQ-17` 0 vazamentos).

### 5.1 Atualização 05/11 02:45 (Bolt + Anvil): o que ficou pronto e o que o harness tem de fazer

- **Pronto no host (Bolt):** imagem até a CLI real (`createOarSessionRunner`, `turn-images-bridge.spec` 4: o anexo chega em `StartTurnInput.images` na Tarefa e em CADA colega da rodada de opinião, nunca no texto, e não na consolidação; CLI que não lê imagem é avisada; só Claude lê imagem hoje), motor da opinião iniciada pela persona (`opinion-run`: linhas `opinion:<callId>:request|reply:<persona>|consolidated`, anexo ligado à linha do pedido em `attachment.message_id`, idempotente por `callId`), `persona_ask` na CLI real (Claude e Codex; resposta volta à mesma Tarefa/sessão; padrão LIGADO, `PERSONA_PRODUCT_TOOLS=0` desliga), `persona_hire` quando o pedido fala de contratar, campanha sem funções listadas reaproveita Redação/Design/Mídia (stateLine tipado).
- **Falta de terceiros:** `ask_team_opinion`/`ask_colleague`/`pass_forward` oferecidos ao worker da Tarefa = Forge (`teamToolsFor`, em andamento) + Tally liga `ask_team_opinion`; gatilho do Bom dia "agora" = Prism/Anvil/Forge; flags nascem LIGADAS no app (TEAM-15, Anvil — o harness agora confere a linha de boot).
- **O que o harness (eu) faz na hora:** (1) semear no processo real: 3× `createPersona` (Lia/Bia/Téo, motor `claude` haiku) e `setAutonomy({mode:'act', proposalBudget, tokenBudget, executionBudget, silenceStart, silenceEnd})` **só** na persona que pede a opinião (com `propose` a ferramenta pergunta antes à pessoa e a rodada trava); padrão de semente: `seedJourney` em `persona-host/tests/journeys/journey-host.ts`. (2) Colegas em **Claude** (Codex ficaria "não vê a imagem", honesto, e reprovaria o critério da imagem). (3) Evidência no banco (não na memória): eventos `opinion:*`, `screen_doc` `message_flags` (opinion/stateLine), `attachment.message_id`, `worker_report`; `orchestration.imageTurns` é só memória e **não** sobrevive à cópia do banco — "a imagem chegou ao modelo" = a descrição que o modelo dá na resposta + ledger. (4) Bom dia sem IA: `getWhileAway` dispara `buildMorningBrief` (teamwork ligado, Coordenação, #geral, algo a dizer, **hora local 06:00–12:00**, 1 por dia: `morning-brief:<projeto>:<dia>`); no processo real não há relógio injetável: rodar nessa janela, ou pedir `PERSONA_BRIEF_NOW=<ISO>` ao Anvil (só com `PERSONA_HOST_FLAGS=production`) — a decisão fica com o Atlas porque muda o exe/ambiente da rodada.

### 5.2 Pré-requisito sem custo (Forge, 05/11 02:59)

`node --import tsx/esm packages/persona/persona-host/scripts/team-tools-dry.ts` (host real sem VITEST + claude CLI REAL pelo runner do produto + gateway HT-0 + endpoint Anthropic FALSO): 21/21 verde — ask_colleague (Tarefa do colega com mandato da pessoa + bilhete como dado, quem pediu acorda com a entrega), revisão por ferramenta (selo), pass_forward, ask_team_opinion COM imagem (o colega chamado recebe rascunho + imagem), pedido simples só `persona_ask`. Entra como **pré-requisito**: rodar antes de pedir o OK ao Atlas e gravar o resultado no proof da rodada. O que ele NÃO prova (e a rodada real prova): o modelo de verdade escolhendo as ferramentas, o custo medido, a descrição da imagem pelo colega.

## 6. Por que este desenho

Um único pedido com texto **e** imagem exercita os 6 comportamentos numa história que o Miguel entende ("pedi um cartaz e a equipe se virou"), com **o menor número de chamadas** que ainda prova cada comportamento, e cada afirmação verificável no banco (ledger, `screen_doc`, anexos), não só na tela.

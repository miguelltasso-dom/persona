# Equipe proativa — catálogo de comportamentos de gente (e o que cada um custa)

**Pesquisa** de Jade para o Atlas, 07/11/2026. Base: contrato `persona-spec/contracts/team-real.md` (§1–§14), `persona-spec/PROACTIVITY.md`, `persona-spec/design/EQUIPE-REAL-SPEC.md` e o que o Pi/omp ensina sobre laço e custo (`INVENTARIO.md`).
**Pergunta:** o que uma pessoa de verdade faz numa equipe que a nossa ainda não faz — e quanto isso custa em turnos do Claude?
**Regra que organiza tudo:** **proatividade pega carona no turno que já existe.** Um comportamento que exige um turno novo só se paga quando evita um problema maior (travar, refazer, perder contexto). O resto é host determinístico.

---

## 0. As três classes de custo (usar em toda decisão)

| Classe | O que é | Custo real | Quando usar |
|---|---|---|---|
| **C0 — zero turnos** | Host/engine escreve linha, cartão, agrupamento, resumo, cutucada, mudança de estado. Nenhuma chamada de modelo. | 0 tokens de modelo; só CPU/SQLite | **Padrão.** Todo comportamento que é consequência de estado (entrega pronta, revisão voltou, colega parado, dia começou). |
| **C1 — dentro do turno** | Uma chamada de ferramenta no turno que já está rodando (`ask_colleague`, `pass_forward`, `ask_team_opinion`, `review_verdict`, `persona_ask`, `brain_propose`). | Definição da ferramenta no prompt + o turno do colega (quando há colega) | Decisão que o modelo precisa tomar com o contexto na mão. É onde mora a "equipe de verdade". |
| **C2 — turno novo** | Uma execução nova: rotina de iniciativa, replanejamento, retomada, curadoria. | 1 turno inteiro (+ ferramentas) | Só com gatilho de estado, orçamento e limite por dia. É o comportamento mais caro e o mais fácil de virar chatice. |

**Consequência de projeto:** o Pi/omp gasta um turno para quase tudo porque é um agente solo. Nós não podemos: a persona tem uma pessoa pagando por turno. Então a ordem é sempre **C0 > C1 > C2**, e o C2 precisa de um motivo que a pessoa entenderia ("o colega está parado há 10 minutos", não "já faz 10 minutos").

**Em tokens (números do nosso próprio repo, não estimativa):**
- **C0 = 0 tokens de modelo.** Só CPU e SQLite.
- **C1 = a definição da ferramenta no prompt + o turno do colega.** A Tally mediu **+1.626 tokens** para o conjunto de ferramentas de um worker de equipe (`team-real.md` §13) — é o custo fixo que o `tool_search` do Pi ataca. O turno do colega é o custo variável.
- **C2 = um turno inteiro.** A 1ª entrega real medida custou **308.902 tokens de entrada** (quase todos cache escrito) e **783 de saída** (`reports/forge.md`, 05/11 00:30). Um turno novo é a unidade mais cara do produto: por isso o teto de C2 é por dia, não por evento.

---

## 1. Vocabulário de gatilhos (o que o host já sabe)

| Fonte | Estados que disparam comportamento |
|---|---|
| `Assignment.report.state` | `progress` · `waiting` · `ready` · `blocked` · `failed` · `dropped` |
| `TaskView.status` | `queued` · `doing` · `waiting` · `with-colleague` · `reviewing` · `needs-you` · `done` · `stopped` |
| `MessageView.handoff` | `mode: handoff/help` · `status: asked/delivered/resumed/held/blocked` · `purpose: review` |
| `MessageView.opinion` | `request/reply/consolidated` · `mark: liked/suggestion/attention/nothing` · `round/maxRounds` |
| `MessageView.review` | `reviewed/returned` · `round 0..2` · `openPoints` |
| `ApprovalView.kind` | `hire` · `vault` · `skill` · `attention` · `connector` · `action` |
| `ProjectFact.kind` (iniciativa) | `stale_ticket` · `blocked` · `deadline` · `gap` · `recurring_error` |
| Orçamento (`AttentionBudget`) | `proposalsPerDay` · `proposedToday` · `silenceUntil` · `tokensLeft` · `runsLeft` · `acceptanceRate` |
| Equipe | `TeamStateDoc.paused` · `PersonaWorkState: working/resting/stuck/waiting` · `PersonaView.teamwork.askedToday` |
| Agendador/Vigia | `sched:assigned/stalled/retry/planned/initiative_*` · `VigiaAction: assign/plan/request_status/recover/nudge/escalate/retry_backoff` |
| Fim de Tarefa | `leftover: next/backlog` · `report.summary` · `report.facts` |
| Segundo cérebro | `brain_propose` (proposta de página) · `brain_search` |

**Regra de ouro do gatilho:** todo comportamento abaixo tem **um** gatilho nomeado. Se dois gatilhos disparam o mesmo comportamento no mesmo minuto, o host agrupa (F1). Se o gatilho é "o modelo achou", não é gatilho — é decisão do turno (C1).

---

## 2. Catálogo

### A. Iniciativa de trabalho (não esperar ser mandada)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| A1 | **Pegar a próxima** sem ninguém mandar | `report.state ∈ {ready, blocked, failed}` + fila da persona > 0 + slot livre | engine (pull) | **C0** | 1 por report; a mesma Tarefa não é reatribuída no mesmo ciclo | report `ready` ⇒ próxima Tarefa `leased` no mesmo tick; **0** chamadas de modelo |
| A2 | **Terminar o que começou** (definição de pronto) | `report.state = ready` + critério de aceite não cumprido + voltas < 3 | `finishTurn`/`goal-round-driver` | **C1** | 3 voltas por Tarefa; na 3ª entrega com "o que ficou de fora" | critério não cumprido ⇒ 1 continuação; 3ª volta ⇒ entrega honesta, não 4ª |
| A3 | **Propor o que ninguém pediu** | rotina de iniciativa devida **ou** `ProjectFact` + autonomia `propose` + `mayPropose` | cartão P1-9 (`taskProposal`) | **C2** | `proposalsPerDay` (padrão 3), dedupe ≥ 0,85 (`scoreInitiative`), janela de silêncio, acceptance rate alonga o intervalo (`nextProposalIntervalHours`) | 5 fatos, 1 aceito ⇒ 1 cartão; duplicado ⇒ rejeitado `duplicate`; teto ⇒ `budget` |
| A4 | **Agir sem pedir** quando o mandato permite | autonomia `act` + fato dentro do escopo + orçamento | Tarefa normal (campanha/quadro) | **C2** | orçamento + aprovação para ação externa (HT-9) | `act` cria Tarefa; `propose` cria cartão; `asked` não cria nada |
| A5 | **Propor o seguimento que descobriu** | `report.ready` com `leftover: next` | `taskProposal` (ou Tarefa se `act`) | **C0** | 1 por Tarefa; dedupe por título | leftover ⇒ 1 proposta; sem leftover ⇒ 0 |
| A6 | **Replanejar quando a fila esvazia** | fila vazia + objetivo aberto + `sched:planned` ainda não hoje | turno da Coordenação | **C2** | 1 por dia por projeto; sem objetivo ⇒ descansa (0 chamadas) | fila vazia + goal ⇒ 1 plano; sem goal ⇒ 0 chamadas |

### B. Coordenação entre colegas (trabalhar junto)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| B1 | **Passar adiante** o que é de outra função | o modelo identifica parte de outro (C1) | `pass_forward` | **C1** | 3/Tarefa, 6/dia, 2 níveis, círculo (`checkHandoff`) | dry 22/22 já cobre; acrescentar "não faz a parte do colega" |
| B2 | **Pedir ajuda** quando trava | conector faltando, desconhecimento, decisão de outro | `ask_colleague` | **C1** + 1 turno do colega | 3/Tarefa, 6/dia; `held` se o colega está em pausa | dry cobre; acrescentar "quem pede espera e retoma" |
| B3 | **Pedir opinião ao time** (inclusive imagem) | rascunho pronto + decisão de gosto + `round < maxOpinionRounds` | `ask_team_opinion` | **C1** + N turnos | 2 rodadas/Tarefa; custo estimado **antes**; só quem vê imagem | dry cobre; acrescentar "sem rascunho não pede" |
| B4 | **Revisar antes de entregar** | Tarefa pronta + revisão ligada no projeto | `review_verdict` | **C1** + 1 turno | 2 voltas; selo só com revisão real | dry cobre; acrescentar "revisor não aprova o próprio trabalho" |
| B5 | **Cobrar o colega parado** | `handoff.status = asked` > 10 min **ou** colega `resting` com a Tarefa na fila | **hoje:** `VigiaAction.nudge` (host). **Falta:** linha tipada `handoff.nudged` | **C0** | 1 cutucada por handoff; 2ª ⇒ `escalate` à Coordenação; nunca mais de 1 por hora. **Achado:** hoje `vigiaTick` emite `nudge` + `escalate` a **cada ciclo** enquanto `waitingOnPersonaId` existir (`watchdog.ts:156-159`), sem limiar nem marca de "já cutucou" — é o primeiro lugar onde "proativo" vira ruído | handoff parado 10 min ⇒ 1 linha "cutucou", **0** chamadas; 20 min ⇒ escala; 3 ticks ⇒ ainda 1 |
| B6 | **Oferecer ajuda quando está ociosa** | persona `resting` + fila 0 + colega com fila ≥ 2 + título/função compatível (`PersonaView.title`) | **FALTA** (`offer_help` como regra do engine, não ferramenta do modelo) | **C0** para oferecer; **C1** para executar | 1/dia; só mesmo projeto; não oferece a quem já recusou | Bia ociosa + Teo com 2 ⇒ Bia recebe 1 ajuda; 2ª vez no dia ⇒ nada |
| B7 | **Pedir status a um colega** | — | **NÃO oferecer** | — | o Vigia já faz `request_status`; uma ferramenta de cutucar vira assédio | nenhuma ferramenta `ask_status` na oferta (`teamToolsOf`) |

### C. Cuidado com a pessoa (não travar, não invadir)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| C1 | **Avisar antes de travar** | tokens desta Tarefa ≥ 70% do `tokenBudget` diário da persona **ou** 2 tentativas falhas **ou** conector faltando | `persona_ask` (atenção) / `ApprovalView(kind:'connector')` | **C1** | 1 por Tarefa; não repete; a 100% vira `stopped` com motivo | 70% ⇒ 1 cartão; 100% ⇒ `stopped` com motivo, sem 2º cartão |
| C2 | **Pedir decisão com opções** | ambiguidade que muda a entrega | `persona_ask` com chips (2–8, até 5 perguntas) | **C1** | 1 pergunta aberta por Tarefa; agrupar as 5 numa | 3 perguntas ⇒ 1 cartão de 3, não 3 cartões |
| C3 | **Entregar parcial** quando o resto depende da pessoa | parte pronta + bloqueio que espera decisão | entrega + `needs-you` | **C0** | 1 entrega parcial por pedido; o cartão final não repete | cartão parcial + contagem "precisa de você" |
| C4 | **Não interromper** | `TeamStateDoc.paused`, janela de silêncio, pessoa digitando | gate do host | **C0** | fila até a janela acabar; nada perdido | durante o silêncio ⇒ 0 cartões; depois ⇒ 1 |
| C5 | **Dizer o custo antes** | cartão de opinião/plano/proposta | `estimate` (Tally) | **C0** | só quando medido; nunca "≈" inventado | cartão mostra `≈ n` quando o Tally mediu; omite quando não |
| C6 | **Explicar o "não deu"** | `report.state ∈ {failed, blocked, dropped}` | linha tipada + motivo + caminho | **C0** | 1 linha por Tarefa; nunca "erro desconhecido" | falha ⇒ 1 linha com motivo e ação; sem termo técnico |

### D. Vida de equipe (o que faz parecer gente)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| D1 | **Celebrar a entrega** | `DeliveryCardView` criado (todas as partes prontas) | cartão determinístico | **C0** | 1 por pedido; sem emoji repetido; sem "eba" | 1 cartão, **0** chamadas, não duplica no re-render |
| D2 | **Reconhecer quem ajudou** | `handoff.delivered` + entrega | o próprio cartão lista os rostos | **C0** | nunca uma linha separada; sem "obrigado" no fio | cartão nomeia quem fez; **0** linhas extras |
| D3 | **Passar contexto ao sair** (pausa/aposentadoria) | persona pausada/aposentada com Tarefas abertas | **FALTA** (nota determinística + re-fila; `brain_propose` se houver decisão) | **C0** | 1 por persona; a nota é dado, não instrução | pausar com 2 Tarefas ⇒ 2 notas + re-fila; nada se perde |
| D4 | **Admitir erro e corrigir** | `review.kind = returned` ou verificação falha | notas da revisão + nova tentativa | **C0/C1** | 2 voltas; depois segue sem selo com os pontos à vista | returned ⇒ ajuste ⇒ approve; o fio mostra "ajustou" |
| D5 | **Dizer não com motivo** | Tarefa fora da função/mandato | `persona_ask` / `report.blocked` com sugestão | **C1** | 1 por Tarefa; sugere quem faz; volta ao quadro | recusa nomeia motivo + colega sugerido; sem Tarefa órfã |

### E. Aprendizado (a equipe melhora sozinha)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| E1 | **Registrar o que aprendeu** | Tarefa pronta com decisão/armadilha durável | `brain_propose` | **C1** | 1 por Tarefa; dedupe por título; a pessoa aprova | decisão ⇒ 1 proposta; sem decisão ⇒ 0 |
| E2 | **Ensinar no bilhete** | handoff com restrição não óbvia | `decisions[]` do bilhete | **C0** | ≤ 8 itens (contrato §8) | o colega não repergunta o que está no bilhete (já é critério do D-090) |
| E3 | **Curadoria do Segundo cérebro** | rotina semanal | `brain_search`/`brain_propose` | **C2** | 1/semana/projeto; nunca no meio de uma Tarefa | 2 execuções na semana ⇒ 1 |

### F. Transversais (o que impede a equipe de virar spam)

| # | Comportamento | Gatilho no host | Ferramenta | Custo | Limite / anti-chatice | Teste que prova |
|---|---|---|---|---|---|---|
| F1 | **Agrupar** | 2+ eventos no mesmo minuto | agrupamento da UI por minuto (o `groupMany` saiu do fio — `team-real.md` §7) | **C0** | 1 grupo; abrir só se ≤ 2 | 2 handoffs em 1 min ⇒ 1 grupo |
| F2 | **Silêncio** | pausa/janela/silêncio da persona | gate do host | **C0** | nada é perdido, só adiado | 0 cartões durante; 1 depois |
| F3 | **Orçamento de atenção** | `proposedToday ≥ proposalsPerDay` ou `tokensLeft = 0` | `mayPropose`/`spend` | **C0** | rejeita com motivo `budget`; aceitação realimenta a frequência | teto ⇒ rejeita `budget`; aceitação baixa ⇒ intervalo dobra |

---

## 3. Orçamento de atenção (números concretos, todos ajustáveis)

O engine já tem as peças (`AttentionBudget`, `mayPropose`, `nextProposalIntervalHours`, `proposalDigest`, `ExecutionBudget`). O que falta é a **política única** aplicada a todos os comportamentos, não só à iniciativa:

| Limite | Padrão proposto | Onde já existe | Por quê |
|---|---|---|---|
| Propostas por persona/dia | **3** | `proposalsPerDay`; hoje `DEFAULT_PROPOSAL_BUDGET = 3` (`persona-store/src/proactivity/repos.ts:48`) | Acima disso a pessoa para de ler; a taxa de aceitação cai |
| Pedidos a colegas por persona/dia | **6** | `askCapPerDay` (contrato §8) | Já é o padrão do Forge; manter |
| Pedidos por Tarefa | **3** | `HANDOFF_MAX_PER_TASK` | Círculo/2 níveis já barram o resto |
| Rodadas de opinião por Tarefa | **2** (1–3 configurável) | `maxOpinionRounds` | Custo por rodada é N turnos; 3 é o teto |
| Voltas de revisão | **2** | `maxRounds` | A 3ª olhada só deixa pontos em aberto |
| Cutucadas por handoff | **1**, depois escala | `VigiaAction.nudge` | Cutucar duas vezes é assédio; escalar é trabalho da Coordenação |
| Ofertas de ajuda por persona/dia | **1** | — (novo) | Oferta demais vira "posso ajudar?" — o oposto de proativo |
| Resumos por dia | **1** (Bom dia) | `morning-brief` | Já é regra; não criar resumo por persona |
| Execuções simultâneas | **4 globais / 2 por projeto** | `ExecutionBudget` | Um projeto barulhento não pode consumir a máquina |
| Janela de silêncio | horário de trabalho da persona + "Pausar equipe" | `inSilence`, `TeamStateDoc` | A pessoa decide quando ouvir |
| Agrupamento | **1 minuto** | `ActivityGroup` | Várias passagens no mesmo minuto são uma história |
| Custo visível antes | opinião, plano, proposta | `estimate`, Tally | A pessoa decide com o preço na mão |

**Regra de realimentação:** a taxa de aceitação de propostas já alonga o intervalo (`nextProposalIntervalHours`). Estender a mesma lógica a **ofertas de ajuda** e **cutucadas**: quem oferece e é recusado 3× no mesmo mês oferece menos. Proatividade que não gera valor perde prioridade — é a PROACTIVITY §6.

---

## 4. Lacunas no contrato `team-real` (o que falta para o catálogo existir)

Ordenadas por valor. Nenhuma muda nome de campo existente; todas são aditivas.

1. **`offer_help` (B6)** — hoje uma persona ociosa não tem como ajudar outra. O engine sabe a fila de cada uma; falta a regra: *persona `resting` + fila 0 + colega com fila ≥ 2 + função compatível ⇒ cria uma Tarefa de ajuda com o mandato da pessoa e um bilhete mínimo*. Não é ferramenta do modelo (viraria "posso ajudar?"); é decisão do host, como o pull (A1). **Maior ganho de "equipe de pessoas" por menor custo.**
2. **`handoff.nudged` (B5)** — o Vigia já cutuca (`VigiaAction.nudge`), mas o fio não mostra. Uma linha tipada ("A Coordenação cutucou o Teo: {título}") faz a equipe parecer viva **sem** gastar turno. Sem ferramenta para o modelo.
3. **`persona_ask` com imagem (C2)** — a persona não consegue mostrar o rascunho à pessoa e perguntar "esta ou aquela?"; `ask_team_opinion` tem imagem, `persona_ask` só tem chips. Aditivo: `attachmentIds` + `alt` no `persona_ask`, com o mesmo fallback honesto de quem não vê imagem.
4. **`report.blocked` com `suggestedPersonaId` (D5)** — "não é minha função, é do Teo" hoje não tem campo; a recusa fica sem caminho. Aditivo no report, validado pelo host (o colega tem de existir e ser do projeto).
5. **Nota de saída (D3)** — pausar/aposentar uma persona com Tarefas abertas não deixa contexto. O host pode escrever uma nota determinística (o que estava fazendo, o que falta, arquivos) e re-enfileirar; `brain_propose` só quando houver decisão.
6. **Checkpoint de orçamento (C1)** — o modelo não sabe que já gastou 70% do `tokenBudget` da persona nesta Tarefa. O host sabe (livro de turnos). Aditivo: um `turnBudget` no prompt do turno (`orchestration.turnInputs` já existe) ou um cartão de atenção disparado pelo host aos 70%.
7. **`celebrate` como tipo de mensagem (D1)** — **não criar.** A celebração é o cartão de entrega; um tipo novo vira ruído. Registrar como decisão para não reabrir.
8. **`ask_status` (B7)** — **não criar.** O Vigia faz; uma ferramenta de cutucar seria usada para nagging.
9. **"Obrigado" (D2)** — **não criar.** O cartão já nomeia quem ajudou; um agradecimento separado é ruído puro.

---

## 5. Prioridade por valor ÷ custo

| Ordem | Comportamento | Classe | Valor | Esforço | Por que primeiro |
|---|---|---|---|---|---|
| 1 | **B5 cutucar + linha `handoff.nudged`** | C0 | 5 | S | O Vigia já cutuca; falta a linha. Faz a equipe parecer viva por 0 turno. |
| 2 | **C1 avisar antes de travar** | C1 | 5 | S | Evita a pior experiência: a pessoa descobre o travamento no fim. |
| 3 | **D1 celebrar a entrega** | C0 | 4 | S | Retenção (peak-end) sem custo; o cartão já existe. |
| 4 | **B6 oferecer ajuda** | C0 | 5 | M | É o comportamento que mais parece "pessoa" e o que menos custa. |
| 5 | **C6 explicar o "não deu"** | C0 | 4 | S | Confiança; hoje a falha pode chegar seca. |
| 6 | **A2 terminar o que começou** | C1 | 5 | M | Combate a preguiça na raiz (PROACTIVITY §3). |
| 7 | **D3 passar contexto ao sair** | C0 | 4 | M | Nada se perde quando a equipe muda; casa com GOVERNANCE. |
| 8 | **E1 registrar o que aprendeu** | C1 | 4 | S | `brain_propose` já existe; falta o gatilho no fim da Tarefa. |
| 9 | **C2 pedir decisão com opções** | C1 | 4 | S | `persona_ask` já tem chips; falta imagem e o limite de 1 aberta. |
| 10 | **A3 propor o que ninguém pediu** | C2 | 4 | M | Já existe; o trabalho é afinar dedupe/orçamento, não criar. |
| 11 | **D5 dizer não com motivo** | C1 | 3 | S | Depende do campo `suggestedPersonaId`. |
| 12 | **D4 admitir erro e corrigir** | C0/C1 | 4 | S | Já existe (revisão); falta o fio mostrar "ajustou". |
| 13 | **A5 propor o seguimento** | C0 | 3 | S | Já existe (`leftover`); falta o cartão. |
| 14 | **B7/F1/F2/F3** | C0 | 5 | S | Já existem; o trabalho é **não** regredir (testes de guarda). |

**O que não entra na v1.1:** conversa espontânea entre personas (já fora por decisão do Atlas), "obrigado", "posso ajudar?" como mensagem, resumo por persona, cutucada como ferramenta do modelo.

---

## 6. Como provar cada comportamento (sem IA real)

| Prova | O que cobre | Como |
|---|---|---|
| **`team-tools-dry.ts`** (host real + CLI real + endpoint falso, custo zero) | B1–B4, C2, E1 — o modelo **escolhe** a ferramenta e o host reage | já existe; acrescentar casos "sem rascunho não pede opinião", "recusa com motivo", "não faz a parte do colega" |
| **`team-round-observe.ts`** sobre cópia do banco | a rodada real: pedido, bilhete como dado, retomada, selo, opinião | já existe; acrescentar `nudged` e `offered_help` ao relatório |
| **Relógio falso + runner roteirizado** | A1, A3, A6, B5, B6, C4, F1–F3 — tudo que é C0/C2 | o agendador já recebe relógio injetado (`proactivity-scheduler`); teste de tick |
| **Snapshot do transcrito "Um dia da equipe"** (Gauge) | o conjunto lê como gente: ≤ ~15 linhas, sem autor com `:`, sem micro-estado | já é o aceite (a) do D-090 |
| **Teste de guarda de silêncio** | nenhum cartão durante pausa/silêncio; nada perdido | tick com `paused: true` ⇒ 0 eventos; ao retomar ⇒ 1 |
| **Teste de orçamento** | teto de proposta/ajuda/cutucada | 4ª proposta no dia ⇒ rejeitada `budget`, sem cartão |

**Regra de teste:** cada comportamento tem **um** teste que falha antes e passa depois, e o teste olha o **estado do host** (Tarefa, linha tipada, contador), nunca o texto do prompt. Texto de modelo é roteirizado; o que se prova é o produto reagindo.

---

## 7. O que NÃO fazer (aprendido com o Pi e com o nosso próprio transcrito)

1. **Não narrar estado.** "Em andamento", "Pronto", "Concluído" repetidos são log, não equipe. O cartão do plano e o de entrega já dizem.
2. **Não cutucar duas vezes.** Uma cutucada; a segunda é escalar. O Vigia já sabe a diferença entre `nudge` e `escalate`.
3. **Não oferecer ajuda a quem recusou.** Oferta recusada 3× no mês ⇒ a persona oferece menos (mesma lógica da aceitação de propostas).
4. **Não pedir opinião sem rascunho.** Opinião sobre nada é reunião. O gatilho é "rascunho pronto + decisão de gosto".
5. **Não perguntar à pessoa o que a equipe pode decidir.** Se está no mandato, decide e reporta (PROACTIVITY §3). `persona_ask` é para o que muda a entrega.
6. **Não celebrar toda tarefa.** Celebração é do **pedido** (cartão de entrega), não de cada parte. Senão vira fogos de artifício.
7. **Não reperguntar o que está no bilhete.** Já é critério do D-090; vale para toda ferramenta nova.
8. **Não gastar turno para dizer "oi".** Conversa espontânea está fora da v1.1; se voltar, precisa de propósito visível e teto.
9. **Não mostrar custo inventado.** "≈" só quando o Tally mediu; sem medida, omite.
10. **Não esconder falha atrás de texto bonito.** A linha de falha nomeia o motivo e o caminho; nunca "erro desconhecido".

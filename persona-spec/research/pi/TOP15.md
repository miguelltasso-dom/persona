# Pi — as 15 coisas que valem trazer (ordenadas por valor ÷ custo)

**Pesquisa** de Jade para o Atlas, 07/11/2026. Base: `INVENTARIO.md` (74 itens, 10 PEGAR, 15 ADAPTAR, 49 IGNORAR).
**Critério:** valor para a v1.1 (equipe real + proatividade + custo honesto) dividido por esforço e risco. "Custo" é ordem de grandeza para um builder do nosso time, não promessa.
**Regra:** nenhum item entra sem teste que falhe antes e passe depois; nenhum muda nome de campo visível sem passar pelo Keel.

| # | O que trazer | Veredito | Valor | Custo | Por que agora | Onde cai na Persona |
|---|---|---|---|---|---|---|
| 1 | **Resposta truncada falha todas as tool calls** (`stopReason: length`) | PEGAR | 4 | S (1–2 h) | Evita efeito colateral com argumento cortado; hoje é sorte | `persona-runners` (normalização do report) + teste do runner |
| 2 | **Custo do trabalho auxiliar no livro** (resumo, compactação, opinião, revisão) | PEGAR | 5 | S (3 h) | O "custo honesto" do cartão (Tally) hoje subestima | `persona-usage` + `turn-ledger` |
| 3 | **`context_edit`: omitir a tentativa falha do contexto, append-only** | PEGAR | 5 | S/M (4 h) | Retry/overflow sem envenenar o contexto; o log e o custo ficam | `session` (evento + projeção) + `llm-retry` |
| 4 | **`terminate` por lote de ferramentas** | PEGAR | 3 | S (2 h) | Uma entrega pode encerrar o turno sem pedir outro request; ~1 turno por tarefa | `agent-loop` (DSH) + ferramenta de entrega |
| 5 | **Cache waste em $** (por modelo, com preço) | PEGAR | 4 | S (3 h) | Explica o custo real e alimenta a dica de modelo | `persona-usage` + `token-meter` |
| 6 | **Acrescentar prompt por projeto** (`append-system-prompt`) | ADAPTAR | 4 | S (3 h) | Cofre/Segundo cérebro entram como **contexto**, não como mais uma ferramenta | `core/system-prompt` + `persona-vault` |
| 7 | **Retry compartilhado com compactação/resumo** | PEGAR | 3 | S (2 h) | Uma queda de stream não pode derrubar a Tarefa na compactação | `llm-retry` + `compaction-basic` |
| 8 | **`tool_search` (BM25 + exposição adiada)** | PEGAR | 5 | M (4–6 h) | Tally mediu **+1.626 tokens/worker** de equipe; é o maior custo fixo que controlamos | `persona-runners` (oferta de ferramentas) |
| 9 | **`finishTurn` (continuar/encerrar) no loop DSH** | ADAPTAR | 4 | M (6 h) | Tira a "definição de pronto" do prompt e evita turno a mais/menos | `core/agent-loop` + `goal-round-driver` |
| 10 | **`prepareNextTurn` (modelo/thinking por turno)** | ADAPTAR | 4 | M (4 h) | Tarefa difícil → modelo forte sem trocar a persona; compacta entre turnos | `core/agent-loop` + `llm` |
| 11 | **`afterRun`: trabalho no fim da execução** | PEGAR | 5 | M (6–8 h) | Revisão/entrega/celebração **sem** turno extra; é o lugar da revisão entre colegas | `persona-engine` (gancho pós-entrega) + `persona-host` |
| 12 | **Virtual models (seleção ≠ despacho, sticky)** | PEGAR | 4 | M (8–12 h) | WAVE2: rotação de contas por política, sem trocar de conta no meio da Tarefa | `llm` + contas/cofre |
| 13 | **Resumo do ramo abandonado ("refazer")** | ADAPTAR | 3 | M (6 h) | Quando a pessoa manda refazer, o modelo sabe o que foi jogado fora | `persona-engine` (bilhete) + `persona-host` |
| 14 | **Sono durável + filho `waiting`** | ADAPTAR | 5 | L (12–16 h) | "Cobrar revisão parada" e lembretes sem polling caro nem turno pago | `persona-engine` (Assignment) + `proactivity-scheduler` |
| 15 | **Cache warmer** (só loop DSH, decisão por economia esperada) | ADAPTAR | 2 | M (6 h) | Só depois do item 5 medir; no CLI não se aplica | `llm` + `token-meter` |

## Detalhe dos cinco primeiros

**1. Resposta truncada.** O Pi falha **todas** as tool calls de uma mensagem com `stopReason: "length"` (`pi:packages/agent/src/agent-loop.ts:488`). Motivo: o corte de tokens pode ter partido o JSON dos argumentos; executar é pior que falhar. Na Persona, o runner normaliza o report, mas não há regra explícita. Prova: um runner roteirizado que devolve uma chamada com argumento cortado ⇒ a Tarefa recebe erro claro, nenhuma ferramenta roda, e a linha não mente.

**2. Custo auxiliar.** O Pi grava uma entrada `usage` para trabalho que não é mensagem (resumo, cache warm) e soma no total (`pi:.../session-manager.ts:1255`). Na Persona, o livro é por turno; compactação, rodada de opinião e revisão não têm linha. Prova: uma Tarefa com 1 compactação e 1 opinião ⇒ o livro tem 3+ linhas e o cartão mostra o total real; o teste compara com um número fixo.

**3. `context_edit`.** O Pi omite uma tentativa falha do contexto sem apagar o histórico (`pi:.../session-manager.ts:1371`; `agent-session.ts:1309`). É append-only e auditável — por isso é seguro. Na Persona, o retry já é fora da superfície (`llm-retry`), mas a recuperação de overflow não. Prova: overflow ⇒ compacta, a tentativa morta **não** aparece no request seguinte, o log ainda a tem e o custo continua no livro.

**4. `terminate` por lote.** O Pi só encerra se **todas** as chamadas do lote pedem (`pi:.../agent-loop.ts:700`). Na Persona, uma ferramenta de entrega que já fechou a Tarefa ainda paga o request seguinte. Prova: uma Tarefa cuja única ferramenta é a entrega ⇒ 1 request, não 2; o contador de turnos do livro confirma.

**5. Cache waste em $.** O Pi separa cache miss de cache read e precifica o desperdício por modelo (`pi:.../cache-stats.ts:148`). Na Persona, o livro tem `cacheHitRate` sem preço. Prova: uma Tarefa com 2 turnos e 1 cache miss ⇒ o relatório mostra o custo do miss em R$/$ e o total; sem preço do modelo, omite (nunca inventa).

## O que fica de fora, e por quê

- **TUI, editor, markdown, LaTeX, rodapé, seletor de sessão** — o produto é Electron/React; nada disso atravessa.
- **Árvore de sessão com `/tree`** — a UI não serve; só a ideia de "voltar e tentar de novo" (item 13) tem valor.
- **Pacotes npm/git de extensões** — vira marketplace; é v1.2 e precisa de decisão de produto (Atlas).
- **Fila de mutação por arquivo** — já temos (`fs-local` serializa por `targetKey`); foi retirada da lista depois da conferência.
- **Catálogo remoto de modelos, crash log, bug report, self-update, telemetria, evals** — já temos equivalente ou o custo não se paga.

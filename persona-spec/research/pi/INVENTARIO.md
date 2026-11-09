# Pi (pi-mono) — inventário do harness, item por item

**Pesquisa** de Jade (DeepSeek V4.1 Flash, omp) para o Atlas, 07/11/2026. Sem código de produto.
**Fonte:** clone raso de `https://github.com/badlogic/pi-mono` em `C:/Users/migue/dev/_ext/pi-mono`, commit `085c84e` (07/11/2026 00:59 +0100). Todos os caminhos `pi:` abaixo são relativos a esse clone; os caminhos da Persona são relativos a `C:/Users/migue/dev/persona`.
**Tamanho do clone:** 12 pacotes, 2.595 arquivos `.ts`/`.tsx`, ~576 mil linhas (inclui testes e exemplos). O núcleo é `packages/agent` (laço, 7 mil linhas) + `packages/coding-agent` (produto, 175 mil) + `packages/ai` (provedores, 83 mil) + `packages/tui` (41 mil) + `packages/durable` (harness durável, 93 mil).

**Como ler.** `Persona tem?` compara com o que existe hoje no nosso repo (DSH + `packages/persona`), não com o que está planejado. `Veredito` é uma decisão de **custo/benefício para a Persona**, não um julgamento do Pi:
- **PEGAR** — pequeno, isolado, resolve um problema nosso hoje.
- **ADAPTAR** — a ideia serve, a forma do Pi não (nosso host/engine/CLI é outro).
- **IGNORAR** — já temos equivalente igual ou melhor, ou não se aplica ao produto (terminal, Electron).

**Resumo:** 10 PEGAR, 15 ADAPTAR, 49 IGNORAR (74 itens). O Pi é excelente no **loop e na sessão**; nós somos mais fortes em **equipe, durabilidade e produto**. Quase tudo que o Pi faz de loop já existe no DSH; o valor está nas **beiradas** (custo de ferramentas, omissão de tentativa falha, trabalho no fim da execução, tarefas que dormem).

---

## A. Laço e turno

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Laço único com eventos (`agent_start`, `turn_start`, `message_*`, `tool_execution_*`, `turn_end`, `agent_end`) | `pi:packages/agent/src/agent-loop.ts:176` | **SIM** — `agent-loop` próprio, eventos `agent/status`, `agent/request` | **IGNORAR** — mesmo desenho; trocar não paga | 960 |
| *Steering*: mensagem da pessoa entra **depois do turno corrente**, antes do próximo request | `pi:packages/agent/src/agent-loop.ts:184`, `:300`; `agent.ts:308` | **SIM** — inbox durável `next-step` (`core/agent-loop/src/inbox.ts:1`) | **IGNORAR** — o nosso é durável e sobrevive a reinício; o do Pi é memória do processo | 233 |
| *Follow-up*: só quando o agente **pararia**; modos `one-at-a-time`/`all` | `pi:packages/agent/src/agent-loop.ts:311`; `agent.ts:255` | **SIM** — inbox `next-turn` | **IGNORAR** | 233 |
| `prompt()` recusa rodar junto e manda usar `steer()`/`followUp()` | `pi:packages/agent/src/agent.ts:385` | **SIM** — uma execução por Tarefa, fila por persona | **IGNORAR** | 624 |
| `prepareNextTurn`: troca **modelo/thinking por turno** e roda a compactação antes do próximo request | `pi:packages/agent/src/agent-loop.ts:195`; `coding-agent/src/core/agent-session.ts:959` | **PARCIAL** — modelo e esforço são por persona/execução (EFF-1), não por turno | **ADAPTAR** — é o gancho certo para "tarefa difícil → modelo forte" e para compactar entre turnos sem esperar o request estourar | 960 |
| `finishTurn` decide **continuar ou encerrar** depois dos resultados das ferramentas | `pi:packages/agent/src/agent-loop.ts:295`; `types.ts:264` | **PARCIAL** — `dsh-goal` + `goal-round-driver` + critério de pronto no prompt | **ADAPTAR** — um `finishTurn` explícito no loop DSH tira do prompt a "definição de pronto" e evita o turno a mais e o turno a menos | 960 |
| `prepareRequest` reconstrói o contexto canônico **antes de cada request** | `pi:packages/agent/src/agent-loop.ts:228`; `agent-session.ts:848` | **SIM** — princípio "model-visible ⟺ logged" + projeção do log | **IGNORAR** — já é regra nossa (AGENTS.md) | 960 |
| Ferramentas em paralelo, resultados persistidos na **ordem do assistant** | `pi:packages/agent/src/agent-loop.ts:596` | **SIM** — `tool-executor` | **IGNORAR** | 960 |
| `terminate` por lote: só encerra se **todas** as chamadas do lote terminam | `pi:packages/agent/src/agent-loop.ts:700` | **NÃO** | **PEGAR** — uma ferramenta de entrega/entrega final pode encerrar o turno sem pedir outro request; economiza ~1 turno por tarefa | 960 |
| Resposta truncada (`stopReason: length`) **falha todas** as tool calls em vez de executar argumentos cortados | `pi:packages/agent/src/agent-loop.ts:488` | **PARCIAL** — o runner normaliza erro, mas não há regra de corte; no CLI quem corta é o próprio CLI | **PEGAR** — vale para o loop DSH (e para o dia em que o runner virar loop): barato e evita efeito colateral com JSON pela metade | 960 |
| `declareToolChanges`: o diff do loadout vira mensagem de sistema | `pi:packages/agent/src/agent-loop.ts:342` | **PARCIAL** — ferramentas por Tarefa; catálogo de skills no prompt | **IGNORAR** — o CLI recebe o conjunto fixo; o DSH declara por request | 960 |
| Hooks `beforeToolCall`/`afterToolCall` (bloquear, reescrever argumentos/resultado) | `pi:packages/agent/src/agent-loop.ts:718`, `:869` | **PARCIAL** — ACL por ferramenta (`tool-level`), aprovações e `agent/pre-step`; não há gancho por chamada no loop | **IGNORAR** — a barreira já existe no runner/tool (gate HT-9); o gancho do loop não agrega | 960 |

## B. Sessão, árvore e compactação

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Sessão JSONL em **árvore** (`id`/`parentId`); ramificar sem apagar nada | `pi:packages/coding-agent/src/core/session-manager.ts:988`; `docs/session-format.md` | **NÃO** — log append-only + fork de prefixo (`session-format-v3-to-v4/src/fork-result.ts`) | **ADAPTAR** — a UI de árvore não serve ao produto; o que serve é "voltar ao ponto em que a Tarefa descarrilou e tentar de novo" sem perder o histórico | 2030 |
| Projeção do contexto a partir do log (compactação + edições) | `pi:.../session-manager.ts:544`, `:577` | **SIM** — projeção + `compaction-basic` | **IGNORAR** | 2030 |
| `context_edit`: omissão **append-only** de uma tentativa falha; o histórico bruto e o custo ficam | `pi:.../session-manager.ts:1371`; `agent-session.ts:1309` | **NÃO** | **PEGAR** — o retry/overflow deixa de envenenar o contexto; casa com "model-visible ⟺ logged" (o log guarda, o modelo não vê) | 2030 |
| Compactação por limiar: `contextWindow - reserveTokens`, mantém `keepRecentTokens` | `pi:.../compaction/compaction.ts:267`; `settings-defaults.ts:9` | **SIM** — `compaction-basic` (thresholdRatio/retainTokens) | **IGNORAR** — o nosso é mais rígido (transação com bracket, prefixo quente) | 1105 |
| Corte só em fronteira de mensagem de usuário; span grande é dividido e resumido em 2 partes | `pi:.../compaction/compaction.ts:446`, `:412`, `:929` | **SIM** — região balanceada | **IGNORAR** | 1105 |
| Resumo **iterativo** (o resumo anterior entra no próximo) | `pi:.../compaction/compaction.ts:577` | **SIM** — checkpoint framing | **IGNORAR** | 1105 |
| Recuperação de overflow/`length`: compacta e tenta **1 vez**; a tentativa morta é omitida | `pi:.../agent-session.ts:3106`, `:3252` | **PARCIAL** — recuperação de overflow existe; a omissão da tentativa, não | **PEGAR** — junto com `context_edit`; hoje a tentativa falha pode voltar no contexto e confundir o modelo | 4566 |
| Resumo do **ramo abandonado** ao navegar (o trabalho jogado fora vira contexto do novo ramo) | `pi:.../compaction/branch-summarization.ts:115`, `:307`; `agent-session.ts:4126` | **NÃO** | **ADAPTAR** — o análogo já é melhor no nosso bilhete de handoff; falta o caso "a pessoa mandou refazer": resumir o que foi abandonado e entregar como dado | 399 |
| Fork/clone de sessão | `pi:.../session-manager.ts:1058`, `:1643` | **SIM** — fork com prefixo herdado | **IGNORAR** | 2030 |
| Labels, entradas custom, mensagens custom, nome da sessão | `pi:.../session-manager.ts:1452`, `:1301`, `:1315` | **PARCIAL** — eventos tipados; sem labels | **IGNORAR** — não há uso de produto | 2030 |
| Export HTML/JSONL e compartilhar | `pi:.../agent-session.ts:4455`, `:4481`; `modes/interactive/session-share.ts:1` | **PARCIAL** — `export-md.ts` | **IGNORAR** — desktop; markdown basta | 4566 |
| Sessão efêmera (`--no-session`) | `pi:docs/sessions.md` | **NÃO** — a sessão é durável por desenho (o histórico é o produto) | **IGNORAR** — não é caso de uso: a pessoa precisa do registro da Tarefa | doc |

## C. Custo, cache e retry

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Uso por mensagem + totais + **custo por modelo** (`/session`) | `pi:.../usage-totals.ts:66`; `agent-session.ts:4350` | **SIM** — livro por persona/tipo com cache read/write (`persona-usage/src/turn-ledger.ts:1`) | **ADAPTAR** — falta o corte por **modelo** dentro da persona: "quanto custou o haiku vs o sonnet desta persona" | 100 |
| Entradas `usage` para trabalho que **não é mensagem** (resumo, cache warm) | `pi:.../session-manager.ts:1255`; `docs/session-format.md` | **PARCIAL** — o livro registra o turno; resumo/compactação/opinião não têm linha própria | **PEGAR** — sem isso o "custo honesto" do cartão (Tally) subestima | 2030 |
| % de contexto e janela do modelo | `pi:.../agent-session.ts:4404` | **SIM** — `token-meter` (`contextPressure`) | **IGNORAR** | 4566 |
| **Cache miss/waste em $** por modelo, com preço | `pi:.../cache-stats.ts:148` | **PARCIAL** — `cacheHitRate` sem $ | **PEGAR** — é o número que explica por que a persona cara é cara e alimenta a dica de modelo | 175 |
| **Cache warmer**: reaquece o prefixo só quando a economia esperada passa de $0,05, respeitando o TTL do provedor | `pi:.../cache-warmer.ts:20`, `:100` | **NÃO** | **ADAPTAR** — só no loop DSH e com a economia medida; no CLI o cache é do CLI. Risco: gastar chamada para aquecer | 456 |
| Retry com backoff (`maxRetries 3`, base 2 s) e a tentativa falha **fora do contexto** | `pi:.../agent-session.ts:3924`, `:1309`; `settings-defaults.ts:16` | **SIM** — `llm-retry` durável, tentativa não-superfície | **IGNORAR** | 4566 |
| Resumo/compactação usam o **mesmo orçamento** de retry | `pi:.../agent-session.ts:3883` | **PARCIAL** — o retry cobre o passo do agente; a chamada de compactação é `ctx.llm.stream()` direto | **PEGAR** — uma queda de stream não pode matar a compactação e derrubar a Tarefa | 4566 |
| Retry de provedor com teto de atraso (`maxRetryDelayMs 60 s`) | `pi:.../settings-defaults.ts:24` | **SIM** — `retryPolicy` | **IGNORAR** | 68 |

## D. Modelos e credenciais

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Troca de modelo no meio da sessão, persistida (`model_change`), com o **modelo físico** em cada resposta | `pi:.../session-manager.ts:1241`; `agent-session.ts:2644` | **PARCIAL** — modelo por persona; o turno registra o modelo usado | **ADAPTAR** — a troca por turno vem do `prepareNextTurn`; o registro por turno já é hábito nosso | 2030 |
| **Virtual models**: seleção (router) ≠ despacho (modelo físico); *sticky* em tool-follow-up e retry | `pi:.../virtual-models.ts:84`, `:170`; `docs/virtual-models.md` | **NÃO** | **PEGAR** — é exatamente a WAVE2 "várias contas por provedor com rotação/divisão de uso"; o *sticky* evita trocar de conta no meio de uma Tarefa | 239 |
| Resolução tolerante de referência (`provider/modelo:thinking`, fuzzy, desempate por credencial) | `pi:.../model-resolver.ts:150` | **PARCIAL** — modelo escolhido no menu, por id | **ADAPTAR** — deixa a persona dizer "modelo forte" e o host resolver; útil para o Gestor montar equipe | 691 |
| Catálogo remoto de modelos + pin + diff | `pi:.../remote-catalog-provider.ts:1` | **PARCIAL** — catálogo local/`provider-data` | **IGNORAR** — custo de manutenção sem ganho na v1.1 | 241 |
| Auth por provedor com OAuth refresh **serializado** no credential store | `pi:packages/ai/README.md` §Auth; `.../auth-storage.ts:1` | **SIM** — credenciais/cofre, contas | **IGNORAR** | 509 |
| `sessionId` estável para cache/afinidade do provedor, sobrevivendo a retry, compactação e troca de modelo | `pi:packages/agent/README.md`; `pi:packages/durable/README.md:115` | **SIM** — `resumeSessionId` no runner | **IGNORAR** | doc |

## E. Ferramentas

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Ferramentas nativas (`read`, `edit`, `write`, `bash`, `grep`, `find`, `ls`) com descrição e renderização própria | `pi:.../tools/index.ts:225`; `tools/*.ts` | **SIM** — `core/tools`, `fs`, `shell` | **IGNORAR** | 225 |
| Truncamento de saída com marcador e limite por ferramenta | `pi:.../tools/truncate.ts:1` | **SIM** — spill | **IGNORAR** | 303 |
| **Fila de mutação por arquivo**: serializa edições concorrentes no mesmo arquivo | `pi:.../tools/file-mutation-queue.ts:1` | **SIM** — `fs-local` já serializa por `targetKey` (`packages/fs/fs-local/src/index.ts:107-141`) | **IGNORAR** — já temos, com trava por alvo e ordem lexical | 62 |
| Leitura em streaming (primeiras linhas sem carregar o arquivo) | `pi:.../tools/read.ts:1` | **PARCIAL** — `read` com ranges | **IGNORAR** | 363 |
| Diff de edição com janelas de contexto | `pi:.../tools/edit-diff.ts:1` | **SIM** — ferramenta `edit` | **IGNORAR** | 746 |
| **`tool_search`**: BM25 sobre metadados + exposição adiada; carregar passa a declarar | `pi:packages/coding-agent/src/extensions/tool-search/tool.ts:36`, `:113` | **NÃO** | **PEGAR** — o Tally mediu **+1.626 tokens por worker** de equipe; com 20+ ferramentas isso domina o prompt. BM25 é 350 linhas sem dependência | 350 |
| Codemode: script JS no QuickJS chamando ferramentas; chamadas aninhadas **não** entram no contexto | `pi:packages/codemode/README.md:1`; `.../nested-tool-calls.ts:1` | **SIM** — `ptc-runtime` | **IGNORAR** | 264 |
| Cliente MCP (stdio/HTTP, resources, OAuth) | `pi:packages/mcp/README.md:1`; `extensions/mcp/index.ts:1` | **SIM** — `packages/mcp` | **IGNORAR** | 1349 |
| Subagente: processo isolado, paralelo, encadeado, com uso por filho | `pi:packages/coding-agent/examples/extensions/subagent/index.ts:1` | **SIM** — `dsh-subagent` + `team` | **IGNORAR** — o nosso tem ownership e sessão durável | 1258 |
| Skills: catálogo nome+descrição no prompt; instruções sob demanda | `pi:.../skills.ts:358`; `docs/skills.md` | **SIM** — `tool-skill` | **IGNORAR** | 506 |
| Prompt templates (`/nome args`) | `pi:.../prompt-templates.ts:1` | **NÃO** | **ADAPTAR** — útil para comandos da pessoa e rotinas, mas o produto já tem rotinas; prioridade baixa | 342 |

## F. Extensões, recursos e configuração

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Superfície de ~40 eventos de extensão (sessão, agente, modelo, ferramenta, input, provider) | `pi:.../extensions/types.ts:1426` | **SIM** — plugins Cordis com efeitos; mais poder | **IGNORAR** | 2354 |
| API de extensão: ferramentas, comandos, providers, virtual models, renderers, atalhos, flags | `pi:docs/extensions.md:1567` | **SIM** — Cordis | **IGNORAR** | doc |
| Loader com cache e descoberta (usuário/projeto/pacote) | `pi:.../extensions/loader.ts:730` | **SIM** — plugins | **IGNORAR** | 889 |
| Resource loader: skills, prompts, temas, `AGENTS.md`, **append-system-prompt** | `pi:.../resource-loader.ts:343` | **PARCIAL** — skills + contexto; sem "acrescentar prompt por projeto" | **ADAPTAR** — é o caminho barato para o Cofre/Segundo cérebro entrar como **contexto**, não como mais uma ferramenta | 1320 |
| Pacotes npm/git com extensões+skills+prompts+tema | `pi:.../package-manager.ts:882`; `docs/packages.md:1` | **NÃO** — temos bundles de perfil (`packages/bundle`), não instalação de pacote de terceiros | **ADAPTAR** — distribuir "skills de função" e o que a persona aprendeu; é marketplace, v1.2 | 2968 |
| Settings em camadas (global/projeto) + schema JSON publicado | `pi:.../settings-manager.ts:272`, `:883` | **SIM** — `packages/settings` | **IGNORAR** | 1457 |
| Project trust antes de carregar código do projeto | `pi:.../trust-manager.ts:1` | **SIM** — sandbox/aprovações | **IGNORAR** | 255 |
| System prompt em **seções nomeadas** com patch por diff | `pi:.../system-prompt.ts:28` | **SIM** — `core/system-prompt` (seções ordenadas, override por agente) | **IGNORAR** | 229 |

## G. Interfaces e UI

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| TUI com render diferencial e output sincronizado (CSI 2026) | `pi:packages/tui/src/tui.ts:1` | **N/A** — Electron/React | **IGNORAR** | 1552 |
| Editor de terminal (paste, IME, undo, autocomplete) | `pi:packages/tui/src/components/editor.ts:1` | **N/A** | **IGNORAR** | 2484 |
| Markdown/LaTeX/imagem no terminal | `pi:packages/tui/src/components/markdown.ts:1`; `latex.ts:1` | **N/A** | **IGNORAR** | 1162 |
| Rodapé de status (modelo, custo, contexto, git) | `pi:.../footer-data-provider.ts:1` | **PARCIAL** — UI própria | **IGNORAR** | 389 |
| Modos print/JSON/RPC/SDK | `pi:.../modes/print-mode.ts:1`, `json-event.ts:1`, `rpc-mode.ts:1`, `sdk.ts:1` | **SIM** — headless, SDK, ACP | **IGNORAR** | 482 |
| Seletor de sessão com busca/renomear/apagar | `pi:.../components/session-selector.ts:1` | **PARCIAL** — lista de Tarefas | **IGNORAR** | 1040 |

## H. Operação e durabilidade

| O que faz | pi (arquivo:linha) | Persona tem? | Veredito + motivo | tam |
|---|---|---|---|---|
| Harness durável: **commit antes de mostrar**; retomada após crash; tarefa com checkpoint e **sono durável** | `pi:packages/durable/README.md:115`, `:140` | **PARCIAL** — host durável + agendador; sem sono/checkpoint por tarefa | **ADAPTAR** — "cobrar revisão parada" e lembretes viram tarefa dormindo, sem polling caro | doc |
| Tarefas filhas com `waiting`/`failFast`/`allSettled` e aborto de baixo para cima | `pi:packages/durable/README.md:772` | **PARCIAL** — dependências de Assignment no engine | **ADAPTAR** — falta o "pai espera N filhos e decide" como estado durável (é o plano de uma campanha) | doc |
| `afterRun`: trabalho no **fim da execução** (ex.: testes) sem tool call e sem turno extra | `pi:packages/durable/README.md:682` | **NÃO** | **PEGAR** — é o lugar exato da revisão/entrega/celebração: depois da resposta, sem gastar um turno do modelo | doc |
| Subagente com ownership/background (abortar o pai não mata o filho de fundo) | `pi:packages/durable/README.md:725` | **PARCIAL** — `dsh-subagent` | **ADAPTAR** | doc |
| Grafo de tarefas observável (`watchTaskGraph`) | `pi:packages/durable/README.md:799` | **PARCIAL** — Vigia + auditoria | **ADAPTAR** — uma tela "o que está rodando agora" barata e honesta | doc |
| Crash log + relatório de bug com transcrição | `pi:.../crash-log.ts:1`; `bug-report.ts:1` | **PARCIAL** — dead-letter + feedback | **IGNORAR** | 171 |
| Version check e self-update (Windows) | `pi:.../version-check.ts:1`; `windows-self-update.ts:1` | **SIM** — instalador/updater | **IGNORAR** | 110 |
| Migrações de sessão/settings | `pi:.../migrations.ts:1` | **SIM** — `SCHEMA_VERSION` monotônico | **IGNORAR** | 316 |
| Execução remota por SSH (daemon + protocolo) | `pi:packages/env/README.md:1` | **SIM** — `packages/ssh` | **IGNORAR** | doc |
| Telemetria vendor-neutral (spans, métricas, propagação) | `pi:packages/telemetry/README.md:1` | **SIM** — `packages/telemetry` | **IGNORAR** | doc |
| Evals comportamentais (docs lift, host smoke) | `pi:packages/evals/README.md:1` | **SIM** — e2e/snapshots | **IGNORAR** | doc |

---

## O que o Pi faz melhor que nós (e por que vale copiar)

1. **O custo fixo do prompt é tratado como projeto.** `tool_search` + exposição adiada + `cache-stats` + cache warmer + custo por modelo. Nós medimos tokens (Tally), mas não temos a alavanca de **não declarar** ferramentas até precisar.
2. **A tentativa que falhou não contamina o contexto.** `context_edit` + omissão no retry + recuperação de overflow em 1 tentativa. É a diferença entre "tentar de novo" e "tentar de novo com o erro na frente".
3. **O fim da execução é um lugar de trabalho.** `afterRun`/`finishTurn`/`terminate` põem revisão, verificação e encerramento **fora** do próximo turno — exatamente o que a nossa revisão entre colegas precisa.
4. **Durabilidade de verdade nas tarefas.** Sono durável, filhos com `waiting`, ownership e retomada. O nosso agendador é bom, mas cada "espera" hoje é polling ou um turno pago.

## O que nós fazemos melhor (não copiar por reflexo)

- **Equipe com domínio:** bilhete, handoff, opinião com imagem, revisão com selo, Bom dia determinístico. O Pi não tem nada parecido; o `subagent` dele é uma chamada de ferramenta, não uma equipe com papéis.
- **Durabilidade do host e do produto:** `persona-host` + `persona-store` + auditoria + Aprovações. O `durable` do Pi é um harness genérico; o nosso já conhece Tarefa, quadro, Cofre e pessoa.
- **Loop com transação de compactação** (`compaction-basic`): bracket, prefixo quente, pressão por modelo. O do Pi é mais simples.
- **Regra "model-visible ⟺ logged"** já é norma nossa; o Pi chega perto, mas com `context_edit` ele deixa o log e o contexto divergirem de propósito — o que só é seguro porque é **append-only e auditável**. Copiar a ideia exige copiar essa disciplina.

## Verificação (o que foi conferido no tree da Persona)

Toda linha `SIM`/`PARCIAL` foi conferida contra o repo, não deduzida. As conferências que mudaram o veredito:

| Afirmação inicial | O que o tree mostrou | Correção |
|---|---|---|
| Fila de mutação por arquivo seria PEGAR | `fs-local` já serializa mutações por `targetKey` (`packages/fs/fs-local/src/index.ts:107-141`) | virou **SIM/IGNORAR** e saiu do TOP15 |
| Hooks `beforeToolCall`/`afterToolCall` seriam SIM | o DSH tem ACL (`tool-level`), aprovações e `agent/pre-step`, mas não gancho por chamada no loop | virou **PARCIAL/IGNORAR** |
| Sessão efêmera seria SIM | não há modo efêmero no produto; a sessão é durável por desenho | virou **NÃO/IGNORAR** |
| Pacotes npm/git seriam NÃO puro | há bundles de perfil (`packages/bundle`), não instalação de terceiros | motivo refinado |

Conferidos também: `inbox` durável (`next-step`/`next-turn`), `compaction-basic`, `llm-retry` (tentativa não-superfície), `token-meter`, fork de sessão, `tool-skill`, `ptc-runtime`, `mcp`, `subagent`, `settings`, `sandbox`, `telemetry`, `ssh`, `export-md`, `resumeSessionId` no runner OAR, `fs-local` com trava por alvo, `read` com `offset`/`limit`, `goal-round-driver`, `brain_propose`, `gestor_*`, `persona_ask` (2–8 opções, até 5 perguntas), `HANDOFF_MAX_PER_TASK = 3`, `HANDOFF_DAILY_CAP = 6`, `DEFAULT_PROPOSAL_BUDGET = 3`, `ExecutionBudget` 4/2, `vigiaTick` com `nudge`/`escalate` por ciclo (`watchdog.ts:156-159`).

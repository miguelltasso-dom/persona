# OPT-10 — PROPOSTA (sem gasto real): quantas requisições a CLI faz por chamada da Persona e o que cortá-las exige

Tally, 04/11 (relógio real), D-080 (d). **Nada aqui gastou modelo real**: o censo usa um servidor Anthropic falso em `127.0.0.1`, chave fictícia e HOME temporário; o resto é leitura de código, do binário instalado (`claude` 2.1.318, só `--help` e `strings`) e dos brutos já gravados da pareada. A rodada real que isto pede só vem com o OK do Atlas.

## 1. A pergunta

A pareada real mostrou chamadas de uma linha somando **305 mil tokens de entrada**, ~7× a base de uma requisição. O Atlas pediu: quantas requisições internas a execução da Persona faz numa tarefa simples, e o runner `answerOnly` ou um limite de exploração corta isso sem perder qualidade?

## 2. O que a rodada real já dizia (brutos de `pair-real.json`, n = 1 por célula)

| # | chamada | entrada (total) | ≈ × de uma requisição (43,5 mil) | cache lido | gravado | duração |
|---|---|---:|---:|---:|---:|---:|
| 1 | direta fria | 305 652 | 7,0 | 299 762 | 5 888 | 12,8 s |
| 2 | triagem fria | 307 097 | 7,1 | 302 139 | 4 956 | 11,3 s |
| 3 | execução fria | 93 627 | 2,2 | 0 | 93 625 | 13,8 s |
| 4 | execução curta fria | 87 779 | 2,0 | 0 | 87 777 | 9,9 s |
| 5 | direta quente | 305 652 | 7,0 | 305 650 | 0 | 18,0 s |
| 6 | triagem quente | 306 228 | 7,0 | 302 139 | 4 087 | 10,2 s |
| 7 | execução quente | 93 336 | 2,1 | 90 501 | 2 833 | 10,3 s |
| 8 | execução curta quente | 306 167 | 7,0 | 302 139 | 4 026 | 15,7 s |
| 9 | sonda de TTL | 305 687 | 7,0 | 302 561 | 3 124 | 15,9 s |

O que se lê, sem interpretar além do dado:
- Todas rodaram com a política `deny` do produto (`--tools ''`, sem nenhuma ferramenta): as respostas dizem "não posso ler arquivos nem usar ferramentas". **Não houve laço de agente com ferramentas** e ainda assim 2× ou 7×. Um limite de exploração não teria cortado nada disto.
- O **tempo não acompanha** o número de requisições (10–18 s em todas; uma chamada `claude -p` de requisição única leva ~2 s). Há ~10 s fixos por chamada pelo OAR.
- O **mesmo** total (305 652) apareceu em duas chamadas diferentes, e o mesmo cache lido (302 139) em três: não é ruído do modelo, é estrutura repetida.
- A **triagem custou 3,3× a execução** (307 mil contra 93 mil). Em tokens, o `skipTriage` (D-073) corta mais do que "uma chamada de tamanho igual": no n = 1 desta máquina foram ~75% dos tokens do par triagem + execução. Não é mérito generalizável (n = 1).
- O adaptador do produto lê `session.usage().value.total` (`persona-runners/src/oar/adapter.ts:83`). No OAR 0.67 isso é o `modelUsage` do `result`: **todas** as chamadas de modelo do pipeline (laço principal, subagentes, sidechains e chamadas internas), enquanto `result.usage` é "MAIN AGENT LOOP ONLY" e fica em `value.tokens` (comentário em `oar/dist/runtimes/claude/token-usage.js`). O produto nunca guarda o laço principal separado: **não dá para ver, no livro, quanto do gasto é auxiliar.**

## 3. Censo local: o que o lançamento do produto faz, requisição a requisição

`packages/persona/persona-engine/scripts/census-cli-requests.ts` (resultado em `reports/opt10-census.json`): o mesmo `resolveRunner` e a mesma sessão OAR do host, contra um servidor falso que registra cada requisição.

| chamada | requisições de modelo | ferramentas enviadas | outras |
|---|---:|---:|---|
| conversa (`deny`) | **1** (haiku, system 8,9 mil caracteres) | **0** | 4 sondas `HEAD /api/hello`, sem tokens |
| tarefa (`allow-once`, files=write, shell=read) | **1** (corpo 71 KB) | 15 | 1 sonda |

- **Nada auxiliar** apareceu em 6 s depois do fim do turno: sem título, sem sugestão, sem `count_tokens`.
- A entrada que o OAR reportou (2 725 e 17 945) é **exatamente** o que o servidor falso declarou (corpo ÷ 4): o adaptador **não duplica** nem soma a mesma requisição duas vezes.
- Logo, **o prompt da Persona, a política `deny`/`allow-once`, o `inlineOnly` e a contagem do OAR não produzem requisições extras**. O runner `answerOnly` (conversa, triagem e 1ª entrega) já é "1 requisição, 0 ferramentas".
- **Limites do censo, ditos de propósito:** HOME em branco (sem conectores, MCP, skills, hooks nem memória da pessoa) e chave de API num endpoint que não é o da Anthropic. Recursos que só existem com login de assinatura ou dependem de bandeiras do fornecedor **não rodam** aqui. Por isso o censo prova o que o produto **não** causa; **não** reproduz as 2–6 requisições a mais.

## 4. O que sobra como causa (hipóteses, cada uma com o jeito barato de separar)

| # | hipótese | por que cabe | como separar |
|---|---|---|---|
| H1 | recursos próprios da CLI em segundo plano com login de assinatura (agentes bifurcados que reaproveitam o prefixo do cache: memória automática, resumos, sugestões) | os totais repetem o mesmo prefixo ~43 mil lido do cache; a CLI tem chaves para desligar vários (§5) | uma chamada com `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` e `…DISABLE_AGENT_PROGRESS_SUMMARIES=1` contra uma sem |
| H2 | o ambiente pessoal da pessoa (3 MCP de usuário, conectores do claude.ai, 22 skills) carregado em toda chamada | o host usa o `~/.claude` nativo (`oar/native-cli-env.ts`); o `system/init` lista tudo | `--strict-mcp-config`, `--disable-slash-commands`, `--setting-sources project` |
| H3 | novas tentativas / queda do streaming para resposta não-streaming (a tentativa que falha ainda conta uso) | explicaria os "2×" (93 mil) | `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1`; ver `message_start` por chamada |
| H4 | requisições de partida da sessão (handshake) antes do turno | ~10 s fixos por chamada | quadros brutos do OAR no começo da sessão |

Nada disto se resolve sem uma rodada real, mas **a primeira pergunta não precisa de chamadas extras** (§6, passo 1).

## 5. Alavancas candidatas (chaves que existem no binário instalado; efeito ainda **não** medido)

Ambiente (`SessionOptions.env`, já aceito pelo OAR): `CLAUDE_CODE_DISABLE_AUTO_MEMORY`, `CLAUDE_CODE_DISABLE_AGENT_PROGRESS_SUMMARIES`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`, `CLAUDE_CODE_DISABLE_PROACTIVITY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`, `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS`, `CLAUDE_CODE_DISABLE_ATTACHMENTS`, `CLAUDE_CODE_DISABLE_ORG_MEMORY`. Argumentos (`launchArgs`, o OAR só recusa os que ele mesmo gerencia): `--strict-mcp-config`, `--disable-slash-commands`, `--setting-sources project`, `--exclude-dynamic-system-prompt-sections` (mais reaproveitamento de cache entre pessoas). **`--bare` não serve**: exige chave de API, e a assinatura (OAuth) nunca é lida nesse modo.

Argumento de produto, independente de tokens: hoje a Persona herda o MCP, as skills e a memória **pessoais** de quem a instala. Rodar a CLI num ambiente controlado pelo produto é também isolamento (a ferramenta que a persona pode usar é a do mandato `persona.tools`, não a que a pessoa conectou ao próprio Claude). É decisão de produto do Atlas, e tem efeito de qualidade: conectores pessoais deixam de estar ao alcance das tarefas.

**Limite de exploração:** a CLI 2.1.318 não tem `--max-turns` no `--help`. A única alavanca de produto é rodar tarefas só de texto em `answerOnly` (sem ferramentas), o que exige classificar a tarefa (decisão de qualidade, já anotada como W2 retirada). Com `tools = 0` o 2×/7× ocorreu mesmo assim: **não recomendo construir isso antes do experimento**.

## 6. Plano em passos (os dois primeiros não gastam nada)

1. **Rivet, sem chamada real:** `RunnerUsage` ganha campos opcionais do **laço principal** (`mainLoopInputTokens?`, `mainLoopOutputTokens?`, lidos de `session.usage().value.tokens`) ao lado do `total`. O livro passa a mostrar a parcela auxiliar de cada chamada. Isto responde H1 em **toda** rodada real futura, inclusive a OPT-8b, **sem chamada extra**. Também registrar, uma vez por sessão, o resumo do quadro `system/init` (nº de ferramentas, servidores MCP, skills, modelo).
2. **Eu, sem chamada real:** estender o harness da OPT-8b para gravar os dois contadores (principal e total) e o resumo do `init` por chamada; testes de contrato com o fake.
3. **Experimento real (precisa do OK do Atlas; NÃO pedido agora):** ≤ 8 chamadas, mesmo limitador do Rivet e trava `real`, **depois** da rodada do Probe e da OPT-8b: base do produto; `+` chaves de segundo plano (H1/H3); `+` isolamento de ambiente (H2); combinada; repetição da base para medir a variância (o n = 1 da pareada variou 2× a 7× no mesmo desenho). Critério antes de rodar: uma alavanca só "vale" se tirar ≥ 30% do total **e** o critério de pronto (qualidade) passar nas mesmas 3 tarefas do `pair-real`.
4. Só então ligar no host (um lugar: `cli-policy.ts`/`resolve-runner.ts`, dono Rivet), com teste de que `--tools ''` e `deny` continuam valendo e que a quebra de login nativo não ocorre.

## 7. Efeito sobre o que já foi decidido (D-080)

A base de 40 977 foi medida **com as ferramentas padrão** da CLI; no modo `deny` do produto ela é menor (o censo em branco manda 0 ferramentas). **O veredito do placar não depende disso**: o `cut-40` com a base entra com os mesmos braços em ambos os lados e passa para qualquer base de 1 mil a 300 mil tokens.

| base por chamada | rajada (custo / tokens) | espaçado (custo / tokens) |
|---:|---|---|
| 0 | −36% / −39% | −48% / −48% |
| 1 000 | −43% / −43% | −48% / −46% |
| 3 000 | −46% / −44% | −48% / −46% |
| 10 000 | −47% / −45% | −48% / −46% |
| 26 000 | −48% / −45% | −48% / −46% |
| 41 000 (medida) | −48% / −45% | −48% / −45% |
| 300 000 (o total real da chamada) | −48% / −45% | −48% / −45% |

Ou seja: o corte de custo é o corte de **chamadas** (11 → 6), seja qual for a base. O que o OPT-10 persegue é outra coisa: **o tamanho de cada chamada**, que hoje ninguém controla.

## 8. Decisão pedida ao Atlas

- (a) Aprovar os passos 1 e 2 (sem gasto): campos do laço principal no `RunnerUsage` (Rivet) e captura nos dois contadores no harness da OPT-8b.
- (b) Deixar o passo 3 (real, ≤ 8 chamadas) **para depois** da OPT-8b, com o OK dele quando os brutos do passo 1 mostrarem se a parcela auxiliar existe.
- (c) Dizer se o ambiente pessoal da pessoa (MCP, skills, memória) deve ficar fora das chamadas da Persona **como regra de produto**, independente do ganho de tokens.

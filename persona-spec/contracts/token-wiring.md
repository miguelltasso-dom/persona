# Contrato — alavancas de tokens que faltam ligar no host (Tally, 04/11)

Fonte dos números: `node --import tsx/esm packages/persona/persona-engine/scripts/print-tokens-faithful.ts` (runner scriptado fiel, cenário `dia-padaria`: 7 mensagens, 9 chamadas de modelo). Tudo **estimativa offline** (4 caracteres ≈ 1 token; custo = preço de tabela). Zero CLI real. O gate `gate-tokens.ts` já mede "hoje" (`LEVERS_AS_WIRED`) e "todas as alavancas"; quando uma alavanca for ligada, mova-a em `LEVERS_AS_WIRED` (Tally) e o gate passa a protegê-la.

Ganho marginal de cada alavanca sobre o host de hoje, sozinha (qualidade 1,00 → 1,00 em todas):

| # | alavanca | quem liga | tokens | custo µUSD |
|---|---|---|---:|---:|
| W1 | `supportOnCheap`: triagem no runner barato | Anvil `orchestration.ts` + Rivet `resolve` | 6593 → 6593 (0 %) | 15736 → 13279 (**−16 %**) |
| W2 | `minimalTools`: só as ferramentas da tarefa | Rivet `mcp/gateway.ts` / `persona-tools.ts` | 6593 → 5885 (**−11 %**) | 15736 → 14301 (−9 %) |
| W3 | `leanReports`: relato final curto do worker | Rivet `oar/session.ts` (`prefixOwnerNorms`) | 6593 → 6471 (−2 %) | 15736 → 13025 (**−17 %**) |
| W5 | `batchBurst`: `batchRouterBurst` na rajada do #geral (4 triagens → 1) | Anvil `orchestration.ts` (ingest) | rajada: 704 → 572 (**−19 %**) | rajada: 3168 → 2302 (**−27 %**) |
| W4 | `context:ranked`: recall por relevância | Anvil `orchestration.ts` `talkLayers` | 0 % neste cenário | 0 % — **proteção de qualidade** (ver abaixo) |

Todas juntas sobre hoje: tokens −13 %, custo **−42 %** no dia em rajada e **−40 %** no dia espalhado (`dia-espacado`, 30 min entre mensagens: cache de 5 min e sessão de 10 min expiram), qualidade 1,00; W5 medida na rajada `burst-geral`.

## W1 — triagem no modelo barato (Anvil + Rivet)

Hoje: `orchestration.ts:1201` resolve o runner da **executora** (`resolveFor(executor, …, 'task')`) e `:1218` cria o `CoordinationDriver` nele; a triagem roda no modelo da executora. Rivet já tem o modelo barato por finalidade (`modelForPurpose(spec, 'talk')`, pool `talk`).
Mudança: resolver o runner da **coordenação** com `purpose: 'talk'` (modelo `talkModel`/mais rápido) e passar esse runner ao `createCoordinationDriver`; a execução continua no runner da executora (`'task'`). Avaliação (revisão de código) **fica** no motor da persona: rodar revisão em modelo barato é risco de qualidade que o offline não prova.
Aceite: `coordination` com `ledger.kind === 'triage'` e engine/modelo barato; execução inalterada; teste de contrato no host com runner fake que registra o modelo por turno.

## W2 — ferramentas mínimas por turno (Rivet)

Hoje o gateway lista **todas** as ferramentas do nível da persona (`personaMcpTools(run, hooks, toolLevel)` + acting + brain + outbound ≈ 14 ferramentas, ≈ 25 tokens cada no `tools/list`) em todo turno de worker. `toolsForTurn(allowed, needed)` existe no engine e não é chamada.
Mudança: o `McpGateway.openTurn` recebe `needed?: readonly string[]` (hoje a Tarefa de texto puro precisa de `persona_report` + `persona_recall`) e `list(token)` devolve a interseção; sem `needed` o comportamento é o de hoje.
Aceite: teste do gateway — com `needed`, `list` devolve só a interseção e uma chamada fora dela é recusada como hoje (`allowsTool` continua valendo).

## W3 — relato final curto do worker (Rivet) — **só com validação em modelo real**

`composePrompt({ part: 'worker', …, leanReport: true })` acrescenta uma linha (`WORKER_LEAN_REPORT_RULE`: "Resultado:" e "Bloqueio:", ≤ 100 palavras, sem narrar passos). **Desligada por padrão** e fora da primeira entrega (muda o que o modelo escreve). `prefixOwnerNorms`/`executorPrompt` ganham o parâmetro. O ganho de saída depende de o modelo obedecer — no scriptado é pressuposto; só vira meta depois de uma rodada real (`PERSONA_PAIR_REAL=1`, que **só o Atlas libera**).

## W4 — recall por relevância (Anvil, 1 linha)

`orchestration.ts:1406`: `foldHostTalkUsed(used)` → `foldHostTalkUsed(used, event.body)`. Função já exportada e testada (`persona-engine/tests/context-budget.spec.ts`). Sem a pergunta o comportamento é idêntico ao atual. Por que importa: `compileContext` reordena por tipo/id e o corte por cabeça (200 tokens) derruba a nota que responde a uma pergunta ampla — com a pergunta, a nota certa vem primeiro (teste `keeps the evidence in the composed prompt only when the question orders the rows`).

## Já corrigido no engine (sem ação de ninguém)

- `UNSTABLE_PREFIX` calando personas com "hoje/agora/contador/10:00" no texto do usuário (`stable-prefix.ts`).
- Normas de dono escritas uma vez no prompt do worker (`composePrompt` com a política que já traz o bloco): ≈ −55 tokens por prompt de worker, medido (default ligado; `dedupeOwnerNorms:false` reproduz o antigo).
- `composeTurnPrompt` aceita `messageLimit` (o default de 200 tokens corta um pedido de trabalho; use `Number.POSITIVE_INFINITY` para o assignment inteiro).

## Ressalvas

- Sessão aquecida: o OAR reaproveita a sessão em memória por `personaId|cwd|model` (TTL 10 min, teto 4; Rivet). Mensagens espaçadas > 10 min pagam o prompt de coordenação (~500 tokens) de novo; o cenário é em rajada e não mostra isso.
- Coordenação fica por executora/projeto/finalidade (`warmRunners`), não global por projeto (Rivet).
- Cache por motor: só `claude` e `codex` reportam; `opencode`/`cursor` ficam `n/d` (ausência ≠ 0 %).

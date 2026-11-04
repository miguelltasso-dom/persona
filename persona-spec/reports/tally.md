# Relatos — Tally (otimização de tokens)

Mais recente no topo. Escopo: OPT-2..OPT-6 e OPT-8 (com o Forge). Medição **offline** (runner scriptado fiel); zero chamada real de CLI.

## 04/11 12:46 — OPT-2: gate de regressão sobre o runner scriptado FIEL

**O que mudou na medição.** Os cenários antigos (`runTokenScenario`) eram constantes (prefixo fixo de 3 frases, saídas escritas à mão); o "+5,7–6,3% vs CLI" saía de uma fórmula (`armTokens`: prefixo + prompt + "triagem"), não de prompt real. O novo runner conta **os prompts que os compositores reais montam** (talk do host, coordenação, worker, Vigia, iniciativa) sobre fixtures da Padaria Lua (Cofre, histórico do assunto, descrições de ferramentas):

- entrada = `estimateTokens` do prompt completo do turno; saída = `estimateTokens` do que o "modelo" escreve;
- cache do provedor = **maior prefixo comum** com o prompt anterior da mesma chave (persona + finalidade) — prefixo instável perde acerto de verdade;
- qualidade = o "modelo" só afirma um fato se a **evidência está no prompt** dele; orçamento de contexto que derruba a evidência derruba a nota (critério de pronto = agulhas na resposta final);
- custo estimado = tokens × preço de tabela (barato 1/5, motor da persona 3/15 USD por Mtok; cache read ×0,1, write ×1,25). **Estimativa**, não fatura.

Cada alavanca é uma chave (`LeverSet`); `leverLadder(cenário)` liga uma de cada vez e devolve o antes/depois dela.

### Antes (todas as alavancas desligadas = harness ingênuo) × depois (como o repo entrega)

| cenário | antes: tokens / custo µUSD / chamadas | depois | Δ tokens | Δ custo | cache prefixo | qualidade |
|---|---|---|---:|---:|---:|---:|
| geral-simple | 983 / 2510 / 2 | 501 / 1969 / 1 | -49% | -22% | — | 1,00 → 1,00 |
| multi-review | 1928 / 9424 / 3 | 1417 / 3296 / 3 | -27% | -65% | — | 1,00 → 1,00 |
| idle-routines | 23931 / 61388 / 99 | 0 / 0 / 0 | -100% | -100% | — | 1,00 → 1,00 |
| initiative-30 (dia quieto) | 21313 / 97482 / 30 | 0 / 0 / 0 | -100% | -100% | — | 1,00 → 1,00 |
| initiative-30-busy (5 mudanças) | 24874 / 108105 / 35 | 1746 / 2371 / 5 | -93% | -98% | — | 1,00 → 1,00 |
| padaria-lua | 2945 / 13057 / 3 | 2488 / 7950 / 3 | -16% | -39% | — | 1,00 → 1,00 |
| dia-padaria (7 mensagens) | 8366 / 22275 / 11 | 5655 / 11603 / 9 | -32% | -48% | 1,00 | 1,00 → 1,00 |

"Antes" **não** é a Persona de ontem: é tudo desligado, para isolar cada alavanca. A Persona de hoje já tem várias ligadas (talk estável, pré-roteador, Vigia por regras); o que falta ligar está nos achados abaixo.

### Gate

- `persona-spec/baselines/token-faithful.json` congela antes/depois (`write-tokens-faithful.ts`).
- `scripts/gate-tokens.ts` (~3 s): falha por cenário se tokens **ou** custo sobem > 10 % sem ganho de qualidade ≥ 0,15, se a **qualidade cai** (menos token não pode custar entrega), se um dia ocioso passa a gastar, ou se chamadas sobem. Imprime `TOKEN_GATE ok` / `TOKEN_GATE failing=<cenários>`.
- `assert-opt2.ts` agora também roda esse gate (os cenários sintéticos antigos ficam por continuidade).
- `scripts/persona/persona-gate.mjs`: passo novo depois do check-pkg e antes do bundle (autorizado pelo Keel), **informativo**: falha vira `TOKEN_GATE_WARN failing=<cenários>` no log e não derruba o gate; `PERSONA_TOKEN_GATE=block` faz derrubar (`persona-engine` entra em failing); timeout de 60 s e travamento do passo nunca derrubam, nem em `block`. Lógica em `scripts/persona/token-gate-step.mjs` (testável).

### Arquivos

Novos: `persona-engine/src/bench/{token-faithful,token-gate,token-fixtures}.ts`, `persona-engine/tests/token-faithful.spec.ts`, `persona-engine/scripts/{gate-tokens,write-tokens-faithful}.ts`, `persona-spec/baselines/token-faithful.json`, `scripts/persona/token-gate-step.{mjs,test.mjs}`.
Editados: `persona-engine/scripts/assert-opt2.ts` (+gate fiel), `scripts/persona/persona-gate.mjs` (+1 import, +2 linhas; autorizado pelo Keel).
Nenhum arquivo do upstream tocado.

### Verificação (saída literal)

```
vitest run token-faithful + token-measure + stable-prefix + lean-output + engine-policy + v1-close + token-ledger
 Test Files  7 passed (7)
      Tests  41 passed (41)

node --test scripts/persona/token-gate-step.test.mjs
ℹ tests 5   ℹ pass 5   ℹ fail 0
  (passa / falha informativa / falha com block / timeout e crash / baseline real e baseline adulterado)

node --import tsx/esm packages/persona/persona-engine/scripts/gate-tokens.ts  →  TOKEN_GATE ok
node --import tsx/esm packages/persona/persona-engine/scripts/assert-opt2.ts   →  OPT-2 ok
node scripts/persona/check-pkg.mjs persona-engine                              →  persona-engine: OK in 19.2s
pnpm exec oxlint <6 arquivos novos>                                            →  sem achados
node scripts/persona/reap-orphans.mjs                                          →  no vitest trees older than 15 min
```

O teste de fumaça achou um defeito meu na hora: o resumo do gate listava o mesmo cenário duas vezes (achado de tokens + de custo). Corrigido (dedupe).

### Achados (dados, não opinião) — viram as próximas tarefas

1. **O corte por cabeça do OPT-4 (`clipTextToTokens` no recall) derruba evidência tardia.** Rodando o gate com o `recall` na ordem do host (`compileContext` reordena por tipo/id, `foldHostTalkUsed` concatena), uma pergunta ampla com a nota certa no fim perde a nota (teste `head clip drops late evidence; ranking keeps it`). Ordenar por relevância dentro do mesmo orçamento mantém a nota. → OPT-4.
2. **O prompt do worker repete as "Normas de dono"** (parágrafo do template `worker` + bloco `OWNER_NORMS` do `executorPrompt`; `prefixOwnerNorms` o envia a cada sessão de worker): ≈ 110 tokens por Tarefa. Dedupe testado (`workerPromptText(…, true)`). → OPT-4 (precisa do OK do Forge para mexer em `templates.ts`).
3. **Triagem roda no motor da executora.** `orchestration.ts` cria o `CoordinationDriver` com o `runner` resolvido para a **executora** (`resolveFor(executor, …, 'task')`); o OPT-5 manda triagem/avaliação/Vigia/iniciativa para o motor barato (−65 % de custo no multi-review só por isso, tokens iguais). → OPT-5 (Anvil `orchestration.ts` + Rivet `resolve`).
4. **O livro vivo grava `layers: EMPTY_LAYERS`** (`orchestration.ts`, `recordLedger`): sem o tamanho por camada real, o painel não separa onde o gasto está. O talk já devolve `layers` (`composeHostTalk`); falta passar. → OPT-8 (Anvil).
5. `stablePrefix` custa ~9 tokens de layout numa chamada fria isolada e se paga a partir da segunda quente; o teste de degrau tolera ≤ 1 % por isso.

### O que fica de fora / limitações

- Tudo é **estimativa** (4 caracteres ≈ 1 token; cache por prefixo comum sem TTL; preços de tabela). O ledger fica `origin: 'estimate'`. Medição real = `PERSONA_PAIR_REAL=1`, só com liberação do Atlas.
- Cache por motor: `claude`/`codex` reportam; `opencode`/`cursor` não (ausência ≠ 0 %, `cacheReported:false`). O relato do hit rate por motor entra no OPT-3.
- O pareado "CLI direta × Persona" (4 tarefas) segue o do Forge (fórmula); o pareado fiel entra no OPT-8.
- `tokens-baseline.md` / `bench-tokens.md` do Forge não foram regenerados; este relato é a fonte dos números fiéis até o OPT-8.

# Relatos — Tally (otimização de tokens)

Mais recente no topo. Escopo: OPT-2..OPT-6 e OPT-8 (com o Forge). Medição **offline** (runner scriptado fiel); zero chamada real de CLI. **Fila fechada em 04/11 13:30** (resumo no topo).

## 04/11 13:45 — Correção do OPT-8: o dia em rajada era favorável; TTL do cache e da sessão modelados

**O que eu tinha deixado como ressalva e agora medi.** O cenário `dia-padaria` põe as 7 mensagens com 1 minuto entre elas, então o cache do provedor (TTL de 5 min) e a sessão aquecida do OAR (10 min) nunca expiram. Um time que escreve ao longo do dia não é assim. O runner agora tem relógio virtual (`advance`), TTL do cache (`cacheTtlMin`, padrão 5) e TTL da sessão (10 min); `dia-espacado` é o mesmo dia com 30 min entre as mensagens.

| host de hoje, mesmo dia de 7 mensagens | TTL do cache | tokens | custo µUSD | prefixo em cache |
|---|---:|---:|---:|---:|
| rajada (1 min) | 5 min | 6593 | 15736 | 1,00 |
| espalhado (30 min) | 5 min | 7093 | 22437 | **0,00** |
| espalhado (30 min) | 60 min | 7093 | 20236 | 1,00 |

Efeitos, todos com teste (`opt8-faithful.spec.ts`, bloco "the spread day"):
- **A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido.** Com mensagens espaçadas e TTL de 5 min o prefixo é regravado em toda mensagem (0,00). Reportado como "passou" antes, no regime em rajada; agora o relato diz quando vale.
- **A sessão aquecida não paga no dia espalhado** (tokens idênticos com e sem `warmSession`); o prompt de coordenação (~500 tokens) volta em toda triagem.
- **Custo −40% (hoje → todas as alavancas) no dia espalhado: −40%, no limite** (13462 / 22437), contra −42% na rajada. A meta agora é lida no **pior** dos dois dias (`measureOpt8Faithful.dayCostCut = min`), para um formato favorável não passar sozinho. Tokens: −12% (espalhado) e −13% (rajada); a meta de −40% em tokens segue não atingida.
- Por isso o "−42%" do relato das 13:30 vale **para o dia em rajada**; o número a citar é "−40% a −42% de custo, conforme o ritmo de mensagens".

**Onde está o gasto no dia espalhado (host de hoje, 9 chamadas, 6730 tokens de entrada):** camada `system` = 3465 (**51%**), ferramentas 812, assunto 1330, recall 384, mensagem 383, saída 363. Por tipo de turno, custo: execução 10489, triagem 5561, resposta 4122, avaliação 2265. Com todas as alavancas: ferramentas 812 → 104, triagem 5561 → 1854, execução 10489 → 5742.

**Próximo alvo, sem feitura: o prefixo (`system`).** Candidatos medidos só por tamanho, **não implementados** porque mudam texto afinado de prompt sem prova de qualidade com modelo real:
- prompt de coordenação: 4 linhas repetidas entre `coordinator`, `dispatch` e `subscriptions` (injeção, escopo maior que o mandato, ambiguidade, mensagem em assunto seguido) ≈ 50 de 500 tokens, pagos em toda triagem no dia espalhado;
- `capabilities` do talk (texto do host, 60 tokens) repete regras que o template `talk` já diz ("não mencione ferramentas, shell…"): ≈ 30 tokens por resposta;
- linha "Normas de dono" da política de voz no talk (≈ 35 tokens por resposta de chat).
Cada um é ≈ 1–3% dos tokens do dia; vale só se o Atlas quiser pagar a rodada real para validar o comportamento.

**Verificação (saída literal)**
```
vitest run (12 arquivos de tokens/prompts/engine-policy/ledger)  → Test Files 12 passed (12) · Tests 82 passed (82)
node scripts/persona/check-pkg.mjs persona-engine                → persona-engine: OK in 16.8s
node --import tsx/esm .../scripts/assert-opt2.ts                 → OPT-2 ok
node --import tsx/esm .../scripts/gate-tokens.ts                 → TOKEN_GATE ok
node --test scripts/persona/token-gate-step.test.mjs             → ℹ pass 5  ℹ fail 0
oxlint nos arquivos alterados                                    → sem achados
node scripts/persona/reap-orphans.mjs                            → no vitest trees older than 15 min
```
Arquivos: `src/bench/{token-faithful,opt8-faithful}.ts` (relógio, TTL, `dia-espacado`, `ttlSensitivity`, meta lida no pior dia), `tests/opt8-faithful.spec.ts` (+4), `persona-spec/baselines/token-faithful.json` (re-congelado: cenário novo; os existentes não mudaram), `persona-spec/reports/opt8-faithful.md` (regerado).

## 04/11 13:30 — OPT-4, OPT-5, OPT-6 e OPT-8: antes → hoje → todas as alavancas (fila fechada)

> Correção das 13:45 (seção acima): o "−42% de custo" e o "cache 1,00" desta seção valem para o **dia em rajada**; no dia espalhado o corte é −40% (no limite) e o cache de prefixo é 0,00 com TTL de 5 min.

Tudo offline, runner fiel (`persona-engine/src/bench/token-faithful.ts`), **zero CLI real**. Os números são estimativa (4 caracteres ≈ 1 token; custo = preço de tabela). "Hoje" = como o host está ligado agora (`LEVERS_AS_WIRED`); "todas" = o que o repo entrega quando o contrato `persona-spec/contracts/token-wiring.md` for ligado.

### Resultado (tabela gerada por `print-tokens-faithful.ts`)

| cenário | ingênuo: tokens / µUSD / chamadas | hoje (host) | todas as alavancas | Δ tokens hoje→todas | Δ custo hoje→todas | qualidade |
|---|---|---|---|---:|---:|---:|
| geral-simple | 983 / 2510 / 2 | 501 / 656 / 1 | 501 / 656 / 1 | 0% | 0% | 1,00 → 1,00 → 1,00 |
| multi-review | 2016 / 9439 / 3 | 1905 / 9023 / 3 | 1485 / 4648 / 3 | -22% | -48% | 1,00 em todas |
| idle-routines | 20763 / 13868 / 99 | 0 / 0 / 0 | 0 / 0 / 0 | — | — | 1,00 |
| initiative-30 (dia quieto) | 20053 / 78582 / 30 | 0 / 0 / 0 | 0 / 0 / 0 | — | — | 1,00 |
| initiative-30-busy (5 mudanças) | 23404 / 86055 / 35 | 1746 / 7110 / 5 | 1746 / 2371 / 5 | 0% | -67% | 1,00 |
| padaria-lua | 3033 / 13072 / 3 | 2938 / 10433 / 3 | 2528 / 5833 / 3 | -14% | -44% | 1,00 |
| dia-padaria (7 mensagens) | 8542 / 21905 / 11 | 6593 / 15736 / 9 | 5763 / 9135 / 9 | -13% | -42% | 1,00 |
| burst-geral (5 linhas seguidas) | 2750 / 4007 / 5 | 704 / 3168 / 4 | 572 / 767 / 1 | -19% | -76% | 1,00 |

Nota de qualidade (critério de pronto): em todos os cenários e degraus a nota fica em **1,00**; ela é medida por fatos que o "modelo" só afirma se a evidência está no prompt (se um corte de contexto derrubar a evidência, a nota cai e o gate reprova). O teste `head clip drops late evidence; ranking keeps it inside the same budget` prova o caso em que o corte atual perde a nota certa e o ranking não.

### O que cada OPT entregou

**OPT-4 contexto mínimo** (código de produção, ligado por padrão onde é seguro)
- `prompts/context-budget.ts` (novo): `relevanceOverlap`, `rankRowsByRelevance`, `fitRowsToBudget` — orçamento por relevância, não por ordem de id.
- `foldHostTalkUsed(used, query?)`: com a pergunta, o recall sai mais relevante primeiro (as últimas mensagens do assunto ficam primeiro e em ordem cronológica); sem ela, comportamento idêntico ao de hoje. Falta o host passar `event.body` (1 linha, contrato W4).
- Normas de dono escritas uma vez no prompt do worker (`composePrompt` com `dedupeOwnerNorms`, default ligado): −55 tokens por prompt de worker, medido. Os runners ganham isso sem edição (`executorPrompt` → `composePrompt`).
- `composeTurnPrompt({ messageLimit })`: o corte padrão de 200 tokens da mensagem trunca um pedido de trabalho; `Number.POSITIVE_INFINITY` mantém inteiro (pedido do P0 do Forge; prefixo não muda, testado).
- Ferramentas mínimas: o gateway lista todas as ~14 ferramentas do nível da persona em todo turno; só as da tarefa → −11% tokens no dia (W2, Rivet).
- Honesto: o orçamento de recall **não economiza** nas fixtures (a recuperação estreita já cabe); ele é uma proteção de qualidade, não um corte.

**OPT-5 modelo certo + sessão aquecida**
- Já ligado: o chat roda no modelo barato (`purpose:'talk'`, Rivet) e o OAR reaproveita a sessão em memória por `personaId|cwd|model` (TTL 10 min). Rivet também já removeu o turno pago do `inject` da coordenação (instruções vão junto do ingest, inclusive em sessão fria).
- Não ligado (W1): a triagem usa o runner da **executora** (`orchestration.ts:1201/1218`); no barato: −16% de custo no dia, −67% na iniciativa. **A avaliação (revisão de código) fica no motor da persona**: a política do Forge a manda para o barato, mas isso é risco de qualidade que o offline não prova; não contei como economia.
- Ressalva: sessão aquecida só ajuda em rajada < 10 min; mensagens espaçadas pagam o prompt de coordenação (~500 tokens) de novo.

**OPT-6 saídas enxutas, proatividade com orçamento, batching**
- Chat: `finishHostTalk` já está ligado; o talk já pede "1 a 3 frases", então o efeito em tokens gerados é ~0 (só protege o canal).
- Relato do worker (W3): `composePrompt({ part:'worker', leanReport:true })` acrescenta uma linha de relato curto ("Resultado:" / "Bloqueio:", ≤ 100 palavras). **Opt-in, desligada por padrão e fora da primeira entrega**: muda o que o modelo escreve, e o ganho (−17% de custo no dia) depende de o modelo obedecer — só vira meta depois de rodada real.
- Rajada (W5): `batchRouterBurst` triagem 4 → 1 chamada (−19% tokens, −27% custo, qualidade 1,00); não está chamado no host (Anvil, ingest).
- Iniciativa: dia quieto 30 → 0 chamadas; dia com 5 mudanças 35 → 5 em lote dentro do orçamento de 400 tokens/persona.

**OPT-8 aceite** (`reports/opt8-faithful.md`, gerado por `write-opt8-faithful.ts`)

| meta | resultado |
|---|---|
| zero chamadas com equipe ociosa sem objetivo | passou |
| ≥ 60 % de cache no prefixo | passou: claude 1,00 · codex 1,00 · opencode/cursor n/d (não reportam; ausência ≠ 0 %) |
| −40 % **tokens** por tarefa (dia, hoje → todas) | **não atingido: −13 %** (−33 % sobre o ingênuo) |
| −40 % **custo estimado** por tarefa (dia, hoje → todas) | **passou: −42 %** (−58 % sobre o ingênuo), depende de W1–W3 ligados |
| paridade ±10 % com a CLI direta | **não comprovável offline** (ver abaixo) |

Proposta de renegociação (para o Atlas/Keel decidir): trocar "−40 % tokens" por **"−40 % custo estimado por tarefa concluída + tokens/tarefa não maior que hoje"**. Motivo: o que o modelo precisa ler não diminui em 40 % sem perder evidência; o que cai é o preço (modelo certo, cache, saída curta, menos chamadas).

**Paridade com a CLI direta — o que mudou.** O "+5,7–6,3 %" do relato anterior era uma fórmula (`armTokens`), não prompt real. No pareado fiel (mesmo modelo nos dois braços, regime de dia corrente, base do vendor como **parâmetro**): tarefa de uma chamada (`simple-ask`, base 12 000) tokens +4 %, custo +2 % (dentro de ±10 %); tarefa de várias chamadas (`multi-review`, `research-summary`) custo +178 % / +238 % sobre a CLI direta tratada como **uma** chamada, porque cada chamada da Persona relê a base do vendor. Isso é um piso para a CLI direta (um agente de CLI faz vários passos internos e cada um relê a base): **só a rodada pareada real decide** (`PERSONA_PAIR_REAL=1`, cap 1, liberação do Atlas; a base de 12 000 é suposição a medir). O que a Persona controla é **chamadas por tarefa**: pré-roteador, rajada em lote, primeira entrega em um turno (Forge/Anvil).

### Pedidos de ligação (contrato `persona-spec/contracts/token-wiring.md`)

| # | alavanca | quem | ganho sobre hoje (dia) |
|---|---|---|---|
| W1 | triagem no modelo barato | Anvil `orchestration.ts` + Rivet `resolve` | custo −16 % |
| W2 | ferramentas mínimas por turno | Rivet `mcp/gateway.ts` | tokens −11 %, custo −9 % |
| W3 | relato curto do worker (opt-in; validar com modelo real) | Rivet `oar/session.ts` | custo −17 % |
| W4 | `foldHostTalkUsed(used, event.body)` | Anvil `talkLayers` | 0 % (proteção de qualidade) |
| W5 | `batchRouterBurst` na rajada | Anvil ingest | rajada: tokens −19 %, custo −27 % |

Ao ligar cada uma, mover a chave em `LEVERS_AS_WIRED` (Tally) e re-congelar o baseline (`write-tokens-faithful.ts`); o gate passa a protegê-la.

### Arquivos (todos em `persona-engine` salvo indicação)

Novos: `src/prompts/context-budget.ts`, `src/bench/{opt8-faithful,token-faithful,token-gate,token-fixtures}.ts`, `tests/{context-budget,opt8-faithful,token-faithful}.spec.ts`, `scripts/{gate-tokens,write-tokens-faithful,write-opt8-faithful,print-tokens-faithful}.ts`, `persona-spec/{contracts/token-wiring.md,baselines/token-faithful.json,reports/opt8-faithful.md}`, `scripts/persona/token-gate-step.{mjs,test.mjs}`.
Editados (prompts do engine; Forge sem esses arquivos abertos): `src/prompts/stable-prefix.ts` (guard por relógio gerado, `messageLimit`), `src/prompts/templates.ts` (`dedupeOwnerNorms`, `leanReport`, `WORKER_LEAN_REPORT_RULE`), `src/prompts/talk-output.ts` (`foldHostTalkUsed(used, query?)`), `scripts/assert-opt2.ts`, `tests/stable-prefix.spec.ts` (+3 testes); `scripts/persona/persona-gate.mjs` (+3 linhas, autorizado pelo Keel). `src/index.ts` **não** tocado.

### Verificação (saída literal)

```
vitest run (12 arquivos: opt8-faithful, token-faithful, context-budget, prompts, stable-prefix, talk-eval, voice, lean-output, engine-policy, token-measure, v1-close, token-ledger)
 Test Files  12 passed (12)
      Tests  78 passed (78)
node scripts/persona/check-pkg.mjs persona-engine        → persona-engine: OK in 27.5s
pnpm exec tsx scripts/generate-typert.ts                 → generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 76.3s
node --import tsx/esm .../scripts/assert-opt2.ts         → OPT-2 ok
node --import tsx/esm .../scripts/gate-tokens.ts         → TOKEN_GATE ok
node --test scripts/persona/token-gate-step.test.mjs     → ℹ pass 5  ℹ fail 0
oxlint nos arquivos novos/alterados meus                 → sem achados
node scripts/persona/reap-orphans.mjs                    → no vitest trees older than 15 min
```

### Limitações e riscos

- Estimativa, não medição: `origin: estimate`. O livro vivo `measured` (real) só com liberação do Atlas.
- O baseline foi **re-congelado 4 vezes** durante esta rodada, sempre por causa de calibração do próprio runner (ferramentas MCP reais, divisão talk/apoio, cenário de rajada), nunca para esconder piora; qualidade 1,00 em todas. Daqui em diante o gate bloqueia piora de verdade (hoje informativo no persona-gate).
- Fidelity: o prompt de talk é reconstruído pelo bench em vez de chamar `composeHostTalk` direto (para isolar cada alavanca); o teste `rebuilds the host talk prompt byte for byte at the shipped context policy` prova que a reconstrução bate com o host.
- O prompt de worker via `composeTurnPrompt` (primeira entrega do Forge) ainda repete "Normas de dono" (template + política de voz, ~35 tokens); deixei de fora até o Forge pedir.
- `cut-40` do `v1-close` continua `blocked` por definição (baseline sintético de 134 tokens/tarefa × livro vivo medido não são comparáveis). Sugestão ao Forge: trocar o baseline por `LEVERS_AS_WIRED` do mesmo pipeline e a métrica por custo estimado (ver `opt8-faithful.md`). Não alterei `measureOpt8Acceptance` (contrato do Probe/Anvil).

## 04/11 12:58 — OPT-3: prefixo estável + cache, hit rate por motor

**Bug real achado e corrigido (P1).** `composeStablePrefix` chamava `assertPrefixStable` sobre o prefixo inteiro, e o regex rígido (`hoje|agora|contador|HH:MM|turno N|ISO`) pega **texto que o usuário escreveu** (instruções e personalidade da persona, regra obrigatória do Cofre, título). Reproduzido antes do conserto:

| entrada do usuário no prefixo | antes | depois |
|---|---|---|
| instruções: "Avise a equipe **hoje** se faltar farinha" | `UNSTABLE_PREFIX` → "não consegui responder" | ok |
| instruções: "Responda **agora** quando o cliente perguntar" | idem | ok |
| personalidade: "Fala como um **contador** paciente" / título "Contador" | idem | ok |
| Cofre: "standup às **10:00** no #geral" | idem | ok |
| relógio gerado (`2026-11-04T09:00`, `turno #7`, epoch ms) | `UNSTABLE_PREFIX` | `UNSTABLE_PREFIX` (continua protegendo) |

Conserto (`persona-engine/src/prompts/stable-prefix.ts`): `composeStablePrefix` agora usa `prefixHasGeneratedClock` (só relógio/contador que **máquina** injeta). `assertPrefixStable` / `prefixLooksVolatile` seguem com a API e o comportamento rígidos, e passam a valer para **texto do motor**: teste novo exige que todos os `PROMPT_TEMPLATES` estejam livres de relógio. Teste novo também prova que o prefixo não se move quando só mensagem, recall e assunto mudam (`two.prefix === one.prefix`). Forge avisado (Status + ask); ele confirmou que não tinha `stable-prefix`/`templates` abertos. Não toquei `src/index.ts` (Forge pediu combinar export novo): `prefixHasGeneratedClock` fica fora do índice por enquanto.

**Hit rate por motor** (cenário `dia-padaria`, `engineCacheTable`):

| motor | reporta cache | prefixo em cache antes → depois | meta ≥ 60 % |
|---|---|---:|---|
| claude | sim | 0,98 → 1,00 | passou |
| codex | sim | 0,98 → 1,00 | passou |
| opencode | não (adapter não lê cache do vendor) | n/d | n/d — ausência ≠ 0 % |
| cursor | não | n/d | n/d |

Leitura honesta: o caminho "snapshot" já colocava persona e Cofre obrigatório antes da mensagem, então o ganho de acerto de cache do OPT-3 **nesta fixture** é pequeno (0,98 → 1,00); o valor do OPT-3 foi o bug acima (um prefixo "estável" que mudava o comportamento do produto) e o contrato testado. Onde ele se paga de verdade é a camada de **sessão aquecida** (OPT-5: o prompt de coordenação de ~500 tokens deixa de ser reenviado, −500 tokens e −33 µUSD no `dia-padaria`).

**Verificação (saída literal)**
```
vitest run token-faithful.spec.ts stable-prefix.spec.ts → Test Files 2 passed (2) · Tests 24 passed (24)
node scripts/persona/check-pkg.mjs persona-engine       → persona-engine: OK in 32.4s
node --import tsx/esm .../scripts/assert-opt2.ts        → OPT-2 ok
oxlint nos arquivos novos/alterados meus                → sem achados (restam 5 achados em coord-eval/talk-eval/linha 37 do spec, que já existiam)
```
Também: `assert-opt2.ts` ganhou os imports em uso (o Forge viu o check-pkg falhar por import sem uso — meu trecho final não tinha sido aplicado; consertado e coberto: se faltar de novo o check-pkg acusa).

**Fica de fora:** TTL do cache (5 min / 1 h) não é modelado; aquecimento por keep-alive é do Rivet (OPT-5). Medição por motor real só com `PERSONA_PAIR_REAL=1`.

## 04/11 12:46 — OPT-2: gate de regressão sobre o runner scriptado FIEL

> Histórico: a tabela desta seção é a do primeiro congelamento (12:46). Os números **vigentes** estão na seção do topo (13:30), depois de calibrar as ferramentas MCP reais, separar chat/apoio e acrescentar a rajada.

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
2. **O prompt do worker repete as "Normas de dono"** (parágrafo do template `worker` + bloco `OWNER_NORMS` do `executorPrompt`; `prefixOwnerNorms` o envia a cada sessão de worker): ≈ 55 tokens por prompt de worker (medido). Dedupe testado (`workerPromptText(…, true)`). → OPT-4 (precisa do OK do Forge para mexer em `templates.ts`).
3. **Triagem roda no motor da executora.** `orchestration.ts` cria o `CoordinationDriver` com o `runner` resolvido para a **executora** (`resolveFor(executor, …, 'task')`); o OPT-5 manda triagem/avaliação/Vigia/iniciativa para o motor barato (−65 % de custo no multi-review só por isso, tokens iguais). → OPT-5 (Anvil `orchestration.ts` + Rivet `resolve`).
4. **O livro vivo grava `layers: EMPTY_LAYERS`** (`orchestration.ts`, `recordLedger`): sem o tamanho por camada real, o painel não separa onde o gasto está. O talk já devolve `layers` (`composeHostTalk`); falta passar. → OPT-8 (Anvil).
5. `stablePrefix` custa ~9 tokens de layout numa chamada fria isolada e se paga a partir da segunda quente; o teste de degrau tolera ≤ 1 % por isso.

### O que fica de fora / limitações

- Tudo é **estimativa** (4 caracteres ≈ 1 token; cache por prefixo comum sem TTL; preços de tabela). O ledger fica `origin: 'estimate'`. Medição real = `PERSONA_PAIR_REAL=1`, só com liberação do Atlas.
- Cache por motor: `claude`/`codex` reportam; `opencode`/`cursor` não (ausência ≠ 0 %, `cacheReported:false`). O relato do hit rate por motor entra no OPT-3.
- O pareado "CLI direta × Persona" (4 tarefas) segue o do Forge (fórmula); o pareado fiel entra no OPT-8.
- `tokens-baseline.md` / `bench-tokens.md` do Forge não foram regenerados; este relato é a fonte dos números fiéis até o OPT-8.

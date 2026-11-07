# D-097 — o custo MEDIDO das definições das ferramentas de equipe e a proposta de enxugamento (Tally, 05/11 05:55)

Pedido do Keel (05:39): as ferramentas de equipe são oferecidas a TODA Tarefa (sem palavra-chave); medir o custo das definições para o worker de equipe e para o revisor e propor texto curto, alvo ~1,2 mil tokens por turno. **Medido pela própria CLI (`get_context_usage`, zero modelo, CLI 2.1.318 (Claude Code), 2026-11-05T08:45:03.195Z)**: a diferença entre a mesma abertura com e sem um servidor que anuncia exatamente essas definições. Script: `persona-runners/scripts/tools-lean-dry.ts`; números: `reports/tools-lean-dry.json`; o texto proposto, em JSON, para testes: `reports/tools-lean-proposal.json`.

## Números
| o que a Tarefa recebe | hoje | lean-a | lean-b |
|---|---|---|---|
| persona_ask | +428 | +376 | +315 |
| ask_team_opinion | +552 | +455 | +426 |
| ask_colleague | +532 | +422 | +407 |
| pass_forward | +446 | +375 | +361 |
| review_verdict | +346 | +241 | +227 |
| **worker de equipe** (persona_ask + ask_colleague + pass_forward + ask_team_opinion) | +1956 | +1626 | +1507 |
| **revisor** (persona_ask + review_verdict) | +773 | +617 | +541 |
| **worker de equipe, com `hand_off` no lugar de ask_colleague + pass_forward** (persona_ask + hand_off + ask_team_opinion) | — | — | **+1232** (lean-c) |

**O "hoje" mudou desde o meu número de 03:33.** O worker de equipe hoje mede **+1.956** (não +2.540): as definições da árvore já são mais curtas que as daquela medição (4.900 → 3.731 caracteres no mesmo conjunto de 4 ferramentas). `persona_ask` (+428) e o revisor (+773) seguem iguais.

## O que cada degrau faz
- **lean-a** (−17% no worker): descrição das ferramentas mais curta; nota nos campos só onde o nome não diz; **todas as restrições do schema ficam** (`required`, `enum`, `minItems/maxItems`, `additionalProperties: false`). Mesmo contrato (nomes, campos e restrições iguais); só o texto fica mais curto.
- **lean-b** (−23%): `lean-a` sem `minItems`, `maxItems` e `additionalProperties`. O host já lê e valida o que recebe ("The Host reads and validates it", `persona-tools.ts`); o limite continua dito em palavras ("2-8 opções", "no máximo 6 pontos"). **Só entra se o Forge confirmar que os handlers do host rejeitam entrada fora do limite** (um teste por ferramenta).
- **lean-c** (o que chega a ~1,2 mil): `lean-b` **e** `ask_colleague` + `pass_forward` viram UMA ferramenta, `hand_off` com `kind: "ask" | "pass"` — as duas têm exatamente os mesmos campos e hoje o schema é pago duas vezes. **Muda um NOME de ferramenta:** os handlers do host, o texto do prompt do worker, os roteiros do fake e os testes de gateway (`mcp-gateway.spec`, `persona-mcp.spec`) precisam acompanhar; decisão do dono do host (Forge/Anvil).

## Recomendação
1. Aplicar **lean-a** já (sem mudança de contrato): −330 no worker, −156 no revisor, −52 no `persona_ask`.
2. Se o alvo é ~1,2 mil: **lean-c** (+1.232 no worker). Sem trocar o nome, o piso do `lean-b` é +1.507.
3. O revisor fica em +541 (lean-b) / +617 (lean-a); o alvo dele não foi pedido.

## O que este número NÃO prova
- Que o modelo continue usando as ferramentas do mesmo jeito com a descrição mais curta: isso só a rodada real mostra (a tentativa 2 do TEAM-10 é o teste). O endpoint falso não decide o que um modelo escolhe.
- O custo é por requisição de um turno que recebe essas ferramentas; um worker que faz 5–6 requisições paga 5–6 vezes (cache de prefixo reduz o preço, não o tamanho).

## Texto proposto (as 5 ferramentas + a fundida)
### `persona_ask`
**Descrição enxuta:** Ask the person a question: 2-8 short options if it is a choice, up to 5 questions. If it is not worth interrupting, go on and state your assumption.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","additionalProperties":true,"properties":{"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":8},"multiple":{"type":"boolean"},"questions":{"type":"array","maxItems":5,"items":{"type":"object","additionalProperties":false,"required":["question"],"properties":{"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":8},"multiple":{"type":"boolean"}}}},"assumption":{"type":"string"}}}
```
**Schema (lean-b: sem `minItems`/`maxItems`/`additionalProperties`):**
```json
{"type":"object","properties":{"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"}},"multiple":{"type":"boolean"},"questions":{"type":"array","items":{"type":"object","required":["question"],"properties":{"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"}},"multiple":{"type":"boolean"}}}},"assumption":{"type":"string"}}}
```

### `ask_team_opinion`
**Descrição enxuta:** Ask the team for a short opinion on your draft (text and/or attached images); each reply is marked liked / suggestion / attention. Rounds cost the person time and money and are limited: use only when worth it, then decide and go on.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","additionalProperties":false,"required":["question","draft"],"properties":{"question":{"type":"string"},"draft":{"type":"object","additionalProperties":false,"description":"Text and/or attached images (at least one)","properties":{"text":{"type":"string"},"attachmentIds":{"type":"array","items":{"type":"string"}},"alt":{"type":"string","description":"Short image description"}}},"audience":{"description":"'team' (default) | 'everyone' | colleague ids","anyOf":[{"type":"string","enum":["team","everyone"]},{"type":"array","items":{"type":"string"}}]}}}
```
**Schema (lean-b: sem `minItems`/`maxItems`/`additionalProperties`):**
```json
{"type":"object","required":["question","draft"],"properties":{"question":{"type":"string"},"draft":{"type":"object","description":"Text and/or attached images (at least one)","properties":{"text":{"type":"string"},"attachmentIds":{"type":"array","items":{"type":"string"}},"alt":{"type":"string","description":"Short image description"}}},"audience":{"description":"'team' (default) | 'everyone' | colleague ids","anyOf":[{"type":"string","enum":["team","everyone"]},{"type":"array","items":{"type":"string"}}]}}}
```

### `ask_colleague`
**Descrição enxuta:** Ask a colleague for help with part of YOUR task and wait for their delivery. Limited per task and per day; not someone already in this chain; two levels at most. After it succeeds, finish what you can and end your turn saying what you wait for; do not do their part.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","additionalProperties":false,"required":["colleague","title"],"properties":{"colleague":{"type":"string","description":"Name or id"},"title":{"type":"string","description":"Short title (the person reads it)"},"done":{"type":"array","items":{"type":"string"}},"needed":{"type":"array","items":{"type":"string"}},"files":{"type":"array","items":{"type":"string"},"description":"Project-relative paths"},"decisions":{"type":"array","items":{"type":"string"}}}}
```
**Schema (lean-b: sem `minItems`/`maxItems`/`additionalProperties`):**
```json
{"type":"object","required":["colleague","title"],"properties":{"colleague":{"type":"string","description":"Name or id"},"title":{"type":"string","description":"Short title (the person reads it)"},"done":{"type":"array","items":{"type":"string"}},"needed":{"type":"array","items":{"type":"string"}},"files":{"type":"array","items":{"type":"string"},"description":"Project-relative paths"},"decisions":{"type":"array","items":{"type":"string"}}}}
```

### `pass_forward`
**Descrição enxuta:** Pass the work on to a colleague with a note: your part is done, the next is theirs, and you do not wait. Same limits as asking for help. Then deliver YOUR part; never theirs.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","additionalProperties":false,"required":["colleague","title"],"properties":{"colleague":{"type":"string","description":"Name or id"},"title":{"type":"string","description":"Short title (the person reads it)"},"done":{"type":"array","items":{"type":"string"}},"needed":{"type":"array","items":{"type":"string"}},"files":{"type":"array","items":{"type":"string"},"description":"Project-relative paths"},"decisions":{"type":"array","items":{"type":"string"}}}}
```
**Schema (lean-b: sem `minItems`/`maxItems`/`additionalProperties`):**
```json
{"type":"object","required":["colleague","title"],"properties":{"colleague":{"type":"string","description":"Name or id"},"title":{"type":"string","description":"Short title (the person reads it)"},"done":{"type":"array","items":{"type":"string"}},"needed":{"type":"array","items":{"type":"string"}},"files":{"type":"array","items":{"type":"string"},"description":"Project-relative paths"},"decisions":{"type":"array","items":{"type":"string"}}}}
```

### `review_verdict`
**Descrição enxuta:** Verdict on the work you review: "approve", or "changes" with at most 6 short points. Review tasks only; end with one short sentence.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","additionalProperties":false,"required":["verdict"],"properties":{"verdict":{"type":"string","enum":["approve","changes"]},"points":{"type":"array","items":{"type":"string"},"description":"With \"changes\": what to adjust"}}}
```
**Schema (lean-b: sem `minItems`/`maxItems`/`additionalProperties`):**
```json
{"type":"object","required":["verdict"],"properties":{"verdict":{"type":"string","enum":["approve","changes"]},"points":{"type":"array","items":{"type":"string"},"description":"With \"changes\": what to adjust"}}}
```

### `hand_off`
**Descrição enxuta:** Hand work to a colleague with a note. kind "ask": help with part of YOUR task, you wait for their delivery (not someone already in this chain; two levels at most); finish what you can, end your turn saying what you wait for, and do not do their part. kind "pass": your part is done, the next is theirs, you do not wait; deliver YOUR part, never theirs. Limited per task and per day.

**Schema (lean-a: mantém todas as restrições):**
```json
{"type":"object","required":["kind","colleague","title"],"properties":{"kind":{"type":"string","enum":["ask","pass"]},"colleague":{"type":"string","description":"Name or id"},"title":{"type":"string","description":"Short title (the person reads it)"},"done":{"type":"array","items":{"type":"string"}},"needed":{"type":"array","items":{"type":"string"}},"files":{"type":"array","items":{"type":"string"},"description":"Project-relative paths"},"decisions":{"type":"array","items":{"type":"string"}}}}
```

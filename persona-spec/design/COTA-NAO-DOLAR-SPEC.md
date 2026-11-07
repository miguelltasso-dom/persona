# Cota, não dólar (D-092 · USD-3, Muse, 05/11)

**A regra:** quem usa uma **assinatura** (Claude, Codex etc.) nunca vê dinheiro na tela. Vê:
- o **impacto na cota**: o pedaço da janela que o pedido usa;
- e, quando ajuda, os **tokens** e as **chamadas**.

**US$** só aparece para quem usa **chave de API**, onde cada chamada é cobrada.

## Como se fala
| Situação | Assinatura | Chave de API |
|---|---|---|
| A estimativa de um pedido (composer, CV-8) | "usa cerca de {pct}% da sua janela de {janela}" (ex.: "cerca de 4% da sua janela de 5 h") | "≈ US$ {min}–{max}" |
| Muito pouco (< 1%) | "quase nada da sua janela" | "menos de US$ 0,01" |
| A janela é desconhecida (o motor não informa) | "≈ {n} chamadas da sua IA" (sem %) | "≈ US$ {min}–{max}" |
| Passa do que resta na janela | "pode não caber no que resta da sua janela de {janela} (até {hora})" (aviso, não bloqueio) | "≈ US$ {max}" + o mesmo aviso, se houver limite |
| Uso e limites | % da janela, tokens, reinício | + o gasto em US$ do período **quando o host mandar** (na v1.1 ainda não manda: a conta de API mostra tokens + chamadas, sem dólar e sem 'US$ —'; Muse 02:35) |
| Contratar uma persona (A-4) | "≈ {n} tarefas médias por mês" (já é assim) | idem + "≈ US$ {x}/mês" só se o host medir |

**Palavras:**
- **"Custo" sai** de toda tela de assinatura. No lugar entra **"uso"** ("Impacto e uso", "Uso estimado").
- **"Custa ≈ 1 tarefa curta a mais"** é aceitável (é uso, não dinheiro); a forma preferida é "usa ≈ 1 tarefa curta a mais".
- **Nunca** "grátis", "de graça" ou "incluído na assinatura" (é marketing, e a cota acaba).

## Quando o pedido não tem % medida (pct = null), Muse 02:30
O host não sabe quanto o pedido vai usar, mas o motor informa o **uso oficial** da janela. Aí a frase não promete % do pedido: mostra o que já foi usado.

| Situação | pt | en | chave |
|---|---|---|---|
| Estimativa sem %, com o uso oficial | ≈ {calls} chamadas · você já usou {used}% da janela de {window} | ≈ {calls} calls · you've used {used}% of your {window} window | `quota.usedOfWindow` |
| Idem, a forma curta (chip, rodapé) | ≈ {calls} chamadas · {used}% da janela já usada | ≈ {calls} calls · {used}% of the window used | `quota.usedShort` |
| Sem % e sem o uso oficial | ≈ {calls} chamadas da sua IA | ≈ {calls} AI calls | (já existe) |
| Uso e limites, motor que não informa | Este motor não informa a cota. Mostramos as chamadas e os tokens que medimos aqui. | This engine doesn't report its quota. We show the calls and tokens we measured here. | `quota.notReported` |

- **{window}** é "5 h" ou "semana" ("da janela de 5 h", "da semana": para a semana, "você já usou 42% da semana").
- **Nunca** "cota não medida" na tela: é técnico e soa como falha. "Não informa" diz de quem é o limite.
- **Tom neutro:** a % usada não vira alerta antes de 80% (aí vale o tom `warning` de Uso e limites).

## Trocas (varredura dos locales pt/en, 00:35)
| Chave (arquivo) | Hoje | Passa a | Dono |
|---|---|---|---|
| `proactive.costLabel` (approvals) | Custo estimado / Estimated cost | Uso estimado / Estimated usage | Lumen (USD-2) |
| `proactive.costLine` (approvals) | ~{tokens} tokens · {runs} execuções | o mesmo + ", cerca de {pct}% da sua janela de {janela}" quando o host mandar a %; com chave de API, + "· ≈ US$ {x}" | Lumen + Tally |
| `inbox.section.cost` (approvals) | Impacto e custo / Impact and cost | Impacto e uso / Impact and usage | Lumen (USD-2) |
| `fanout.chipCost` (chat) | … ≈ {calls} chamadas da sua IA | o mesmo, + " · cerca de {pct}% da janela" quando houver % | Flint (CV-8) + Tally |
| `limits.subtitle` (rules) | Evita barulho e custo descontrolado | Evita barulho e uso descontrolado da sua cota / Prevents noise and runaway quota use | Lumen |
| `review.costHint` (shell) e o `rotulo` do `review-step.ts` (engine) | Cada entrega revisada custa ≈ 1 tarefa curta a mais | Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota | Quill (UI) + Forge (o `rotulo`) |
| O rodapé da opinião (`opinion-model.ts`: "≈ n respostas · custo") | o custo medido | "≈ {n} respostas · cerca de {pct}% da janela" (assinatura) / "· ≈ US$ {x}" (API) | Flint + Tally |
| `action.pay` (chat) | Vai pagar {amount} | **Fica.** É o dinheiro da AÇÃO (um pagamento real), não o custo da IA | — |

**Nenhuma tela mostra US$ hoje** (varredura: os locales não têm US$/$; o `custo.microUsd` do `EstimateAskView` existe no host e não é exibido). A regra vale para o que for construído daqui em diante.

## Antes de trocar o texto (Keel, 00:30): grep do repo inteiro
As trocas entram no **bundle 3**, junto com o USD-1/2.

**O que o grep de 00:40 achou** (a troca vai na mesma mudança):
- `packages/persona/persona-engine/tests/review-step.spec.ts:251` espera o `rotulo` "Cada entrega revisada custa ≈ 1 tarefa curta a mais (até 5 se houver ajustes)". O Forge atualiza o teste junto do `rotulo`.
- `pair-real-report.ts` e `bench/token-faithful.ts` são relatórios internos de desenvolvimento, não tela: **ficam**.
- Nenhum teste de cliente e nenhum E2E usa "Custo estimado" / "Impacto e custo" / "custo descontrolado" como seletor.

## O que o host precisa mandar (Tally, USD-1)
- **No `EstimateAskView`**:
  - o tipo de conta do motor que vai rodar (`billing: 'subscription' | 'api' | 'unknown'`);
  - para assinatura, `quota: { pct: { min, max }, window: '5h' | 'week', resetsAt? } | null`.
- **O `custo.microUsd`** só é preenchido com `billing: 'api'`. Com assinatura, vem `null`, para nenhuma tela conseguir mostrar dólar por engano.
- **O mesmo par** (`billing` + `quota`) vale para a opinião, a revisão e a contratação.

## Aceite
- **Teste:** com `billing: 'subscription'`, nenhum texto renderizado contém "US$", "$" ou "custo" (pt) / "cost" (en), exceto o `action.pay`.
- **Capturas:** o composer com a estimativa em %, o chip do CV-8, o cartão de Aprovações e Uso e limites, nas duas contas (assinatura e API).

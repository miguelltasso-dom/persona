# Rodada pareada REAL — Tally

Claude haiku nos dois lados, mesma tarefa. Contadores brutos do vendor; ausência = n/d (nunca 0).

Chamadas: 9 (teto 20).

| braço | passo | passagem | prompt estimado | entrada | saída | cache lido | cache gravado | pronto | ms |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| cli_direct | direct | cold | 23 | 305652 | 1183 | 299762 | 5888 | sim | 12849 |
| persona | triage | cold | 538 | 307097 | 581 | 302139 | 4956 | — | 11337 |
| persona | execution | cold | 311 | 93627 | 1511 | 0 | 93625 | sim | 13828 |
| persona_lean | execution | cold | 339 | 87779 | 564 | 0 | 87777 | sim | 9938 |
| cli_direct | direct | warm | 23 | 305652 | 846 | 305650 | 0 | sim | 17955 |
| persona | triage | warm | 38 | 306228 | 813 | 302139 | 4087 | — | 10204 |
| persona | execution | warm | 311 | 93336 | 960 | 90501 | 2833 | sim | 10258 |
| persona_lean | execution | warm | 339 | 306167 | 962 | 302139 | 4026 | sim | 15742 |
| persona | ttl_probe | after_gap | 38 | 305687 | 280 | 302561 | 3124 | — | 15879 |

- Entrada TOTAL da chamada direta fria: 305629 tokens (a soma de todas as requisições internas da CLI naquela chamada; o contador do adaptador é da sessão inteira, não o tamanho de um prompt).
- Cache sobreviveu a 6 min: sim (TTL > 5 min).
- W3 (relato curto): saída real ÷ saída do worker normal = 0.37 (fria) e 1.00 (quente); os dois cumpriram o critério de pronto: sim.

## Leitura (o que isto prova e o que não prova)

**O contador da rodada é da sessão inteira da CLI, não de um prompt.** A chamada direta somou 305652 tokens de entrada para um pedido de uma linha: com a base de uma requisição única medida abaixo (40977), isso é ≈ 7 requisições internas da CLI (o agente explorou, tentou ferramentas negadas). Por isso a tabela **não compara o desenho dos prompts** (Persona ≈ 0,3–0,5 mil tokens) e sim o comportamento da CLI nesta máquina; a razão entre braços muda de chamada para chamada (a execução da Persona somou ≈ 93 mil, a lente curta quente voltou a 306 mil).

### Custo estimado por chamada (preço de lista do Haiku: cache lido ×0,1, gravado ×1,25) — µUSD

| braço | passo | passagem | entrada total | saída | µUSD |
|---|---|---|---:|---:|---:|
| cli_direct | direct | cold | 305652 | 1183 | 43253 |
| persona | triage | cold | 307097 | 581 | 39316 |
| persona | execution | cold | 93627 | 1511 | 124588 |
| persona_lean | execution | cold | 87779 | 564 | 112543 |
| cli_direct | direct | warm | 305652 | 846 | 34797 |
| persona | triage | warm | 306228 | 813 | 39390 |
| persona | execution | warm | 93336 | 960 | 17393 |
| persona_lean | execution | warm | 306167 | 962 | 40058 |
| persona | ttl_probe | after_gap | 305687 | 280 | 35563 |

### Uma requisição única (`claude -p --output-format json`, o que a Persona não controla)

| chamada | requisições | entrada total | cache lido | cache gravado | saída | prompt estimado |
|---|---:|---:|---:|---:|---:|---:|
| A-trivial | 1 | 37729 | 16825 | 20902 | 4 | 5 |
| B-long | 1 | 38219 | 16825 | 21392 | 4 | 292 |
| C-trivial-again | 1 | 44224 | 19897 | 24325 | 4 | 5 |

- **Base do vendor, uma requisição, nesta máquina: 37729–44224 tokens** (sistema + esquema de ferramentas + a memória/skills/MCP da pessoa), não os 12 000 que eu supunha. Só ≈ 45% veio do cache; o resto foi **regravado a cada chamada** (cache gravado ≈ 21–24 mil por chamada, a ×1,25).
- **Razão do tokenizador (texto neutro em português, uma requisição): 1.707×** — o estimador de 4 caracteres por token **subconta ≈ 41%** (≈ 2,3 caracteres por token em português com acentos). Os números absolutos do bench ficam subestimados por esse fator; os cortes relativos entre configurações pouco mudam.
- **Cache entre sessões frescas:** a sonda depois de 6 min leu 302561 tokens do cache: **o TTL real nesta assinatura é > 5 min** (≥ 6 min). A suposição "TTL 5 min → cache de prefixo 0,00 no dia espaçado" vale no máximo para quem tem TTL de 5 min; aqui o prefixo da base sobrevive.
- **A triagem custa uma chamada inteira:** triagem fria 307097 tokens de entrada e 581 de saída, ~11 s — a mesma ordem de grandeza de uma execução. Pular a triagem (D-073, já ligado) corta uma chamada inteira da CLI, não só um prompt pequeno.
- **W3 (relato curto):** saída fria 564 contra 1511 (razão 0.37), mas quente 962 contra 960 (razão 1.00). O critério de pronto foi cumprido nos dois braços e nas duas passagens. **Resultado: INCONCLUSIVO** — 1 de 2 pares mostra a economia; n = 1 por célula, com o agente variando de ≈ 90 mil a ≈ 306 mil de entrada entre chamadas parecidas. Não dá para ligar a W3 por este par.
- **Tempo por chamada medido:** execução 10.3–13.8 s, triagem 10.2–11.3 s (entra no `estimateAsk`; a conversa curta não foi medida e fica sem tempo).

### Chamadas gastas (teto 20, D-070)

Pareada: 9 (ledger do limitador: 9 turnos). Uma requisição única: 4 (A, B, C e B de novo com texto neutro, porque o primeiro B virou 4 requisições por ser uma tarefa). Total 13 de 20; o limitador do Rivet estava ligado na pareada (CAP=20, ledger próprio).

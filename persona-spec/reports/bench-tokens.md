# Tokens por cenário — linha de base (OPT-1, Forge + Rivet, 04/11)

Registro do OPT-1 e do P0. A tabela histórica abaixo usa fixtures sintéticas (`runTokenScenario`); não é uma linha de base comparável ao ledger do app. O antes/depois atual do mesmo pipeline está em [opt8-faithful.md](opt8-faithful.md), do Tally, com origem explicitamente estimada. Nenhuma chamada real paga foi executada pelo Forge nesta validação.

Paridade com CLI direta e redução do custo do próprio host são comparações diferentes. A primeira exige o mesmo motor/modelo/contexto em ambos os lados; a segunda usa o host antes das ligações contra o mesmo pipeline otimizado. Triagem, Bibliotecário, Vigia e iniciativa entram no ledger. CLI real continua condicionada à autorização do Atlas e à execução única do Probe.

## P0: primeira entrega em um turno

Fonte: report do Probe, seção host + OAR real + CLI fake, reexecutada às 13:28; contrato `verifyFirstDeliveryRun` do engine. Antes das correções eram três entradas do modelo: injeção da persona, triagem e execução (ledger: duas triage + uma execution), em 25,7 s mesmo sem latência do stub. Depois: **uma execution, zero triage/inject**, Tarefa done, marco ready e verificador aprovado (**2/2**). O pré-roteador determinístico escolhe a executora e `firstDeliveryExecutionPrompt` reúne persona e atribuição integral no único input, sem cortar o brief pelo orçamento de chat.

| medida | resultado |
| --- | --- |
| turnos de modelo antes → depois | 3 → 1 (−66,7% em chamadas) |
| tokens informados pelo stub depois | 1.095 entrada + 56 saída = 1.151 |
| tokens/custo antes → depois | redução não calculada: falta total anterior comparável |
| caminho feliz UI com fake | 14,7 s, um turno, entrega no #geral e quadro real |
| execução de modelo real nesta prova | nenhuma |

Os tokens são informados pela CLI fake e atravessam o ledger do runner OAR; não são faturamento nem medição de cache do provedor. Os tempos do host anterior e da UI posterior usam ambientes diferentes e não constituem comparação de latência controlada. Evidência detalhada e capturas: [Probe](probe.md).

## OPT-8: antes/depois atual

Segundo [opt8-faithful.md](opt8-faithful.md), host **antes das ligações → todas as alavancas**, no pior dos dias em rajada/espalhado: **−2% tokens**, custo estimado **−33% no dia espalhado / −37% em rajada**. Contra o harness ingênuo, a referência secundária é −34% tokens / −59% custo. A meta de −40% ainda não foi atingida no comparador correto. Números anteriores retratados pelo Tally não são usados aqui; cache offline não comprova a taxa de cache de um provedor real.

## Fixtures históricas de cenário (scripted)

| cenário | tokens | chamadas | cache hit | origem |
|---|---:|---:|---:|---|
| geral-simple | 99 | 2 | 0.50 | scripted |
| multi-review | 148 | 3 | 0.67 | scripted |
| idle-routines | 0 | 0 | 0.00 | scripted — equipe ociosa sem objetivo |
| initiative-30 | 0 | 0 | 0.00 | scripted — lote sem modelo |
| padaria-lua | 155 | 3 | 0.67 | scripted |

Painel Uso (`foldUsagePanel`): origem **estimate**, tokens/tarefa 134.0, cache hit **0.63** (≥ 60% no prefixo scripted).

## Benchmark pareado (mesma CLI/modelo, fake)

| tarefa | CLI in+out | Persona in+out | Δ | veredito |
|---|---:|---:|---:|---|
| simple-ask | 48 | 51 | 0.063 | parity |
| multi-review | 51 | 54 | 0.059 | parity |
| research-summary | 52 | 55 | 0.058 | parity |
| code-fix | 53 | 56 | 0.057 | parity |

## Vendor / Rivet

Cache hit de vendor só quando `cacheReadTokens` existe. Ausência ≠ 0%. `usagePortKind` mapeia execution→exec, evaluation→eval. Sessão aquecida = Rivet (`sessionPoolKey`).

A referência sintética de 134 tokens/tarefa e as paridades acima documentam essas fixtures. Não comprovam aceite em produção nem substituem a linha de base do mesmo pipeline em `opt8-faithful.md`. Idle e iniciativa-30 nessas fixtures continuam com zero chamadas.

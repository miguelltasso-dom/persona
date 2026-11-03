# Microbench — engine receive / views / outbox

Insumo do marco F. Repositório em memória; máquina local; números não são SLA.
Views e `trigger.get` medem o estoque (10k tickets / 100k triggers).
A esteira `receive → evaluateDue → decide → report` e o outbox medem um lote representativo.
Não otimizar sem medir de novo.

| fase | n | ms |
|---|---:|---:|
| store.triggers | 100000 | 2389.7 |
| store.tickets | 10000 | 300.9 |
| trigger.get | 100000 | 2070.1 |
| views.ticketList | 10000 | 231.4 |
| views.overview | 10000 | 248.8 |
| views.search | 10000 | 264.7 |
| pipeline.receive-evaluate-decide-report | 200 | 1092.5 |
| outbox.send | 200 | 0.5 |

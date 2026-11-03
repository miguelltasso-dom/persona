# Microbench — compileContext / recall / Inline&Spill

Insumo do marco F. Tokenizer sintético (`ceil(bytes/4)`), `authorize` sempre `true`.
Máquina local; números não são SLA. Inline&Spill: 200 nós amostrados por tamanho, corpo longo vira `persona-spill:<id>`.

| n | compile p50 ms | compile p95 ms | compile bytes | recall p50 ms | recall p95 ms | recall bytes (50 ev) | inline bytes | spilled |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 256.8 | 256.8 | 101109 | 3.3 | 3.3 | 6172 | 13962 | 200 |
| 10000 | 10270.6 | 10270.6 | 199991 | 26.6 | 26.6 | 6172 | 13962 | 200 |
| 100000 | 98802.1 | 98802.1 | 199930 | 212.1 | 212.1 | 6172 | 13962 | 200 |

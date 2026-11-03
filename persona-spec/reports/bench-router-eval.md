# Avaliação da Coordenação (F3)

Corpus pt-BR no engine. Fake determinístico no CI. CLI real só com `PERSONA_REAL_CLI=1` (≤10 execs).
Ablação de batching e pass-through: mesma metodologia de `bench-router.md`. Sem otimizar sem medir.

Acerto: **41/41** (100.0%).
Decisões/Tarefa (proxy): 0.08. Tokens/Tarefa (proxy): 60.
Chamadas do Router (lote): 1. CLI real: não rodou.

| classe | n | acertos | taxa |
|---|---:|---:|---:|
| simple_reply | 5 | 5 | 1.00 |
| clear_task | 8 | 8 | 1.00 |
| ambiguous | 6 | 6 | 1.00 |
| out_of_scope | 4 | 4 | 1.00 |
| prompt_injection | 4 | 4 | 1.00 |
| larger_scope | 4 | 4 | 1.00 |
| duplicate | 3 | 3 | 1.00 |
| handoff | 3 | 3 | 1.00 |
| silence_budget | 4 | 4 | 1.00 |

| célula | inferências | decisões | tokens |
|---|---:|---:|---:|
| batch | 1 | 1 | 720 |
| um a um | 8 | 8 | 720 |
| pass-through on | 1 | 1 | 90 |
| pass-through off | 13 | 13 | 1174 |

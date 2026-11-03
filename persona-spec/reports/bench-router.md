# Experimento sintético do Router (F3)

Metodologia (estudo original do Super-agent: −30% decisões do Router, −37% tokens — **reproduzida, não prometida**):

- Relógio determinístico (`2026-09-23T00:00:00Z` + 1 s por comando).
- 8 Triggers humanos de ~100 caracteres.
- **Batching:** os 8 chegam, uma `evaluateDue`, uma decisão vs. `evaluateDue`+decisão após cada um (threads distintas).
- **Pass-through:** após 1 accept, 12 follow-ups no mesmo assunto. Ligado = Subscription leva à executora (sem nova Eval). Desligado = `unsubscribe` e cada follow-up vira Eval (ignore, para não reabrir Subscription).
- Proxy de tokens = soma dos comprimentos de texto dos Triggers em cada candidato enviado ao assessor.
- Código: `packages/persona/persona-engine/src/bench/router.ts` (`runRouterExperiment`).

| célula | inferências | decisões (request) | evals | token-proxy |
|---|---:|---:|---:|---:|
| batching (lote) | 1 | 1 | 1 | 720 |
| um a um | 8 | 8 | 8 | 720 |
| pass-through ligado | 1 | 1 | 1 | 90 |
| pass-through desligado | 13 | 13 | 13 | 1174 |

Redução de inferências pelo batching: **87.5%**.
Redução de decisões do Router pelo pass-through: **92.3%**.
Redução do proxy de tokens pelo pass-through: **92.3%**.

O número do paper (−30 / −37) veio de tráfego real com janela e prompts completos; esta carga sintética só prova a direção e a instrumentação. Não use estes percentuais como meta de produto.

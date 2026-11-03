# Spike — smokes reais CLI (D9)

Rodada 03/11 14:40 UTC-3. Script: `packages/persona/persona-runners/scripts/real-smoke.ts`. Flag: `PERSONA_REAL_CLI=1`. Modelos baratos. Sem token/e-mail na saída. Cota: **3+3+3+0 = 9 execuções** (limite 10/CLI).

## Resultado

| CLI | auth | modelo | execs | trivial | resume | cancel | usage |
|---|---|---|---|---|---|---|---|
| claude | logged_out | haiku | 3 | stream started/delta/report/ended, `lastState=failed` | idem (failed) | ok, dropped | 0/0 |
| codex | logged_out | gpt-5.5 | 3 | failed | erro `thread already has an active writer` | ok, dropped | — |
| opencode | skipped (sem login) | opencode/beam-free | 3 | ok, ready, 1 delta | ok, ready, 1 delta | ok, dropped | 0/0 |
| cursor | logged_out | — | 0 | skip (sem login interativo) | — | — | — |

## Veredito

- **Streaming / cancel:** observados nos três OAR (claude, codex, opencode). Eventos `started`/`delta`/`report`/`ended`; cancel marca `dropped`.
- **Resume:** GO no opencode. Claude streamed mas falhou (logged_out). Codex recusou o segundo writer na mesma thread — adapter precisa `dispose` antes do resume.
- **Usage tokens:** OAR devolveu 0/0 nesta rodada (não há cota oficial medida).
- **claude/codex logged_out:** turnos de modelo falham; Atlas precisa login nas CLIs do Miguel para uma rodada autenticada. Não tentei login.
- **cursor:** skip correto — SDK autenticou como `logged_out`, sem login interativo.

## Comando

```
PERSONA_REAL_CLI=1 node --import tsx/esm packages/persona/persona-runners/scripts/real-smoke.ts
```

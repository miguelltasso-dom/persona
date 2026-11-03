# Spike — smokes reais CLI (D9)

## Codex re-smoke (03/11 16:23 UTC-3) — `done: true`

Causa do `exec sem done`: (1) OAR 0.67 Codex emite `agent_message`/`item` e muitas vezes não manda `turn_ended`; (2) o literal `model: 'default'` (e `gpt-5.5`) é rejeitado pelo ChatGPT Codex. Adapter: mapeia esses kinds → `delta`; `status().idle` após `accepted` → `ended`; omite `model` quando é `default`.

Cota desta passagem: **3 execs Codex** (duas falhas de modelo + 1 sucesso). Cursor: 0 execs.

| CLI | execs | firstTokenMs | done | usage in/out | erro |
|---|---|---|---|---|---|
| codex | 1 | 3778 | true | 27401 / 5 | — (`kinds`: started, delta, report, ended; `ready`) |
| cursor | 0 | — | — | — | `not_logged_in` + `loginHint` "Abra o Cursor e faça login no Agent" (esperado; sem stack) |

```
PERSONA_REAL_CLI=1 PERSONA_SMOKE_ONLY=codex node --import tsx/esm packages/persona/persona-runners/scripts/resolver-smoke.ts
```

```
{
  "id": "codex",
  "execs": 1,
  "done": true,
  "usage": { "inputTokens": 27401, "outputTokens": 5 },
  "kinds": ["started", "delta", "report", "ended"],
  "firstTokenMs": 3778,
  "lastState": "ready",
  "summary": "turn ended"
}
```

---

## Resolvedor — um round (03/11 15:53 UTC-3)

Script: `packages/persona/persona-runners/scripts/resolver-smoke.ts`. Flag `PERSONA_REAL_CLI=1`. Prompt curto (`Responda só OK.`). Modelos baratos. 1 exec/CLI (limite 10). Sem token/e-mail.

| CLI | execs | firstTokenMs | done | usage in/out | erro |
|---|---|---|---|---|---|
| claude | 1 | 4090 | true | 31083 / 4 | — |
| codex | 1 | — | false | 0 / 0 | turno sem `done` (sem 1º token medido) |
| opencode | 1 | 3050 | true | 0 / 0 | — |
| cursor | 0 | — | — | — | `not_logged_in` — "Abra o Cursor e faça login no Agent" |

Cota desta rodada: **1+1+1+0 = 3**. Veredito: claude e opencode devolvem texto pelo `resolveRunner`; cursor erro tipado sem stack; codex abriu mas não fechou `done` nesta passagem.

```
PERSONA_REAL_CLI=1 node --import tsx/esm packages/persona/persona-runners/scripts/resolver-smoke.ts
```

---


## Correção de login (03/11 16:10)

Causa do `logged_out`: o processo do agente herdava `CLAUDE_CONFIG_DIR` / `CODEX_HOME` do spike `ai-memory` (homes vazios). Login nativo do Miguel está em `%USERPROFILE%\.claude` e Codex ChatGPT.

| sonda | isolamento herdado | após `restoreNativeCliLogin` |
|---|---|---|
| `claude auth status` | loggedIn false, config no spike | loggedIn true, config `~\.claude`, plan max |
| `codex login status` | Not logged in | Logged in using ChatGPT |
| OAR `authStatus` | claude/codex `logged_out` | claude `logged_in` max/claude.ai; codex `logged_in` chatgpt |

Fix: `nativeSessionEnv` / `restoreNativeCliLogin` (isolamento só explícito); Codex `dispose` antes do resume. Re-smoke autenticado pendente (interrupção; ≤3 execs/CLI).

---

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

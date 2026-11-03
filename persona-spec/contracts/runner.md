# Contrato `Runner` (D-040 emendada)

Dono do port: **Forge** (`packages/persona/persona-engine/src/ports/runner.ts`).
Implementações: **Rivet** em `persona-runners` (adaptadores `dsh`, OAR claude/codex/cursor/opencode, e o fake de integração). Importar o tipo daqui — não redefinir.

## Superfície

```ts
ensureSession(id, cwd, title, role)   // coordinator | worker | watchdog
deliver(sessionId, requestId, text, mode)  // queue | steer | inject; idempotente por requestId
cancel(sessionId, { keepInbox })
status(sessionId) → idle | running | missing
whenIdle(sessionId)
onEvent(listener) → disposer     // idle | running | error | inputTaken | userTurnStarted
capabilities() → { steer, removeQueued, reportsInputTaken, background, tools: 'native'|'mcp', resume }
background? → { running, untilQuiet, kill, stopSubagents }
```

## Regras

- Uma sessão + um `cwd` por Tarefa (worker). Coordenação: uma sessão longa, **sem ferramenta `bash`** (D-041; `toolsForRole` + `ROUTER_FORBIDDEN_TOOLS`).
- `deliver` é idempotente em `requestId`.
- `launch` / `delivery` do Effects passam por este port. `WorkerSlots` reserva um slot extra para mensagem de pessoa e acorda antes de lançar.
- Erro transitório: 3 tentativas, backoff 15s / 30s / 60s. `PrepareFailed` não retenta; falha vai para `ticket.delivery`.
- Sem capacidade `background`, o fim do turno vira `waiting`. Com background, o limite é 30 min (`BACKGROUND_LIMIT_MS`).
- `resume()` (P8): assignment interrompida reinicia com `RECOVERY_NOTE` e reentrega inputs não lidos; relatos waiting/ready/blocked/failed mantêm a sessão.

## Fake

`FakeRunner` + `FakeClock` em `persona-engine/src/executor/fake.ts` — use nos testes do engine. O fake de OAR/scripted do Rivet continua em `persona-runners` e deve satisfazer esta interface.

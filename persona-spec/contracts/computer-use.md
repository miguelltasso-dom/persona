# Computer use (onda 3) — ports do engine

Dono do port: **Forge** (`packages/persona/persona-engine/src/computer-use.ts`).
Implementações: **Rivet** (Windows/UIA + `McpGateway` + input hook no desktop). Overlay/replay: **Muse** (`persona-spec/design/COMPUTER-USE-SPEC.md` quando sair; protótipo em `design/computer-use-prototype/`).

O engine não fala com Electron. Testes usam `fakeObservePort` / `fakeActPort` / `fakePermissionPort` / `createMemorySharedControl`.

## Laço

`runComputerUse({ plan, observe, act, permission, control, limits, now })`

1. Cada passo **exige** expectativa explícita (`after`: "depois de clicar em Salvar, aparece o toast X") **e** um matcher (`nameIncludes` / `role` / `valueIncludes`).
2. Observa (captura + árvore UIA) → age → observa de novo → `verifyExpectation`.
3. Se não conferir: tenta de novo até `maxAttemptsPerStep`; depois `failed` + relatório.
4. Para em: humano assumiu, permissão `deny`/`ask`, limite de tempo/passos/orçamento.

## Ports (Rivet)

| Port | Desktop |
|---|---|
| `DesktopObservePort.observe()` | screenshot local + árvore UIA (`AutomationElement` → `A11yNode`) |
| `DesktopActPort.act()` | clique/type/key/scroll. Se o humano assumiu no meio, `{ ok: false, detail: 'você assumiu' }` **sem** entregar o evento OS |
| `SharedControlPort.snapshot()` | mouse/teclado → `humanTookOver()` imediato; retomada **só** explícita (`resume`) |
| `StepPermissionPort.request()` | `McpGateway.call` / `classifySensitive` (`computer_act`, `credentials`). `ask` = Precisa de você |

`wait` não é sensível. `click`/`type`/`key`/`scroll` = `computer_act`. Texto tipo `sk-`/`api_key` = `credentials`.

## Controle compartilhado

- Dono: `persona` \| `human`. Mensagem no estado humano: **`você assumiu`**.
- Humano mexeu → pausa imediata; nenhum passo seguinte age.
- Retomada só por ação explícita (botão / atalho). Não retoma sozinho.

## Replay (Muse / UI)

`ReplayEntry`: `saw` (before/after refs + nomes da árvore), `did` (ação), `expectation`, `result` (`verified` \| `retry` \| `failed` \| `paused` \| `denied` \| `needs_approval` \| `limit`). `projectReplayForUi` devolve uma cópia estável para a overlay reproduzir sem o desktop ao vivo.

## Limites (default)

`maxSteps` 20 · `maxAttemptsPerStep` 3 · `maxMs` 120s · `maxBudgetTokens` 8000.

## Remote (Anvil, depois)

Ainda sem RPC. Quando ligar: `startComputerUse` / `pause` (humano) / `resume` / `getReplay` / `approveStep`. Store não é desta onda.

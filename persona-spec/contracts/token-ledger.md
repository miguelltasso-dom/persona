# Contrato — ledger de tokens e benchmark pareado (TOKEN-OPTIMIZATION §1 + §3)

Dono do domínio/engine: **Forge** (`persona-core` / `persona-engine`).
Livro persistido e Remote de Uso: **Anvil** + **Rivet** (`persona-usage` — não redefinir `UsageEvent`).
Painel: **Lumen**.

## Ledger por turno

`TurnLedgerEntry`: persona, motor/conta, `TurnKind` (triage | reply | execution | initiative | librarian | watchdog | evaluation), tokens in/out, cache read/write, camadas `system → tools → required → subject → recall → message`, `ticketId` opcional.

Folds: `totalTokens`, `callsForTicket`, `cacheHitRate`, `tokensPerSuccessfulTask`. Estimador fiel sem tokenizer de vendor: 4 caracteres ≈ 1 token.

## Cenários de referência (gate)

`runTokenScenario`: pedido simples no #geral; multi-etapa com revisão; dia ocioso com rotinas; 30 personas com iniciativa; dogfood Padaria Lua.

`idle-routines` e `initiative-30` = **zero** chamadas de modelo (equipe ociosa sem objetivo).

`assertScenarioRegression(baseline, measured, qualityGain?)` falha se tokens subirem > 10% sem ganho de qualidade ≥ 0,15.

## Benchmark pareado

Mesma tarefa, mesma CLI/modelo:

1. `cli_direct` — Claude Code / Codex direto.
2. `persona` — Persona usando a mesma CLI/modelo.

Tarefas: `simple-ask`, `multi-review`, `research-summary`, `code-fix`. Mede tokens (in/out/cache), chamadas, tempo, qualidade (critério de pronto). Overhead (triagem / Bibliotecário / Vigia / iniciativa) entra no livro à parte.

Veredito: `persona_better` (gasta menos com qualidade ≥ CLI) · `parity` (±10%) · `persona_justified` (>10% só com qualidade +0,15) · `persona_worse` (reprovado).

Referência = uso direto da CLI, não um percentual fixo contra um harness antigo.

## Execução real

Opt-in (`runPairedTask(..., { real: true })`). Cap `PAIR_REAL_LIMIT = 1`. Cada braço: `start` → fold → **sempre** `cancel`; timeout cancela primeiro (`PAIR_REAL_TURN_MS`, mesmo teto do coord-real). `finally` chama `dispose` nos dois runners. Sem credencial em log.

## Literal da função Gestor de equipe

`SystemRole` = `team_manager` (`TEAM_MANAGER_ROLE`). Selo de UI: "Gestor". Host (`SystemRoleView`) = Anvil, mesmo literal.

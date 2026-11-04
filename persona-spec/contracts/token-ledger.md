# Contrato — ledger de tokens e benchmark pareado (TOKEN-OPTIMIZATION §1 + §3)

Dono do domínio/engine: **Forge** (`persona-core` / `persona-engine`).
Livro persistido e Remote de Uso: **Anvil** + **Rivet** (`persona-usage` — não redefinir `UsageEvent`).
Painel: **Lumen**.

## Ledger por turno

`TurnLedgerEntry`: persona, motor/conta, `TurnKind` (triage | reply | **execution** | initiative | librarian | watchdog | **evaluation**), tokens in/out, cache read/write, camadas `system → tools → required → subject → recall → message`, `ticketId` opcional, `origin?` (`measured` | `estimate`).

Kinds canônicos são os do core. O port Rivet usa `exec` / `eval` — mapear só com `usagePortKind`; **Anvil persiste `TurnKind`**.

Folds: `totalTokens`, `callsForTicket`, `cacheHitRate`, `tokensPerSuccessfulTask`, **`foldUsagePanel`** (tokens/tarefa, por persona, por tipo, cache, origem). Estimador fiel sem tokenizer de vendor: 4 caracteres ≈ 1 token.

OPT-3 talk: `composeHostTalk` / `foldHostTalkUsed` — colegas no prefixo; Cofre obrigatório / resumo do assunto / recall no tail com a mensagem. `composeTalkStable` / `composePersonaStable` são o mesmo caminho. `composeTalkPrompt` / `composePersonaPrompt` permanecem o snapshot. Host troca `talkLayers` por `foldHostTalkUsed` + `composeHostTalk` + `finishHostTalk`.

OPT-5: `engineClassForTurn` (cheap vs persona) + `sessionReuseForTurn` — reusa a sessão só com a mesma persona e o mesmo prefixo (não reenviar o prefixo).

OPT-4: `compileContext({ prefix })` / `compileActiveSubject` descarta records opcionais cujo body já está no prefixo (`dropRecordsInPrefix`). Obrigatórios não saem. `compileActiveSubject` passa `prefix` e pode devolver `digest` via `incrementalSubjectSummary` (`subjectDigest`). `composeTurnPrompt` também corta blocos do tail que já estão no prefixo (`trimVariableAlreadyInPrefix`).

OPT-6: `leanChannelReply` tira eco da linha do humano e narração de passo; depois `capChannelReply` (100 palavras). `formatLeanStructuredReport` = decisão / resultado / bloqueio, já capado.

Aceite OPT-1: `persona-spec/reports/bench-tokens.md` (números scripted iguais a `tokens-baseline.md`).

Relatório da linha de base: `persona-spec/reports/tokens-baseline.md` (`formatTokensBaselineMarkdown` / `scripts/write-tokens-baseline.ts`). JSON congelado para o gate Probe: `persona-spec/baselines/token-scenarios.json` (`status: scripted`; regenerar com `pnpm exec tsx persona-spec/scripts/write-token-scenarios.ts`).

## Cenários de referência (gate)

`runTokenScenario`: pedido simples no #geral; multi-etapa com revisão; dia ocioso com rotinas; 30 personas com iniciativa; dogfood Padaria Lua.

`idle-routines` e `initiative-30` = **zero** chamadas de modelo (equipe ociosa sem objetivo).

`assertScenarioRegression(baseline, measured, qualityGain?)` falha se tokens subirem > 10% sem ganho de qualidade ≥ 0,15.

OPT-8: `measureOpt8Acceptance` — idle zero, cache ≥ 60%, paridade CLI. Sem livro live, `cut-40` fica em `blocked` (3/4). Com `liveEntries`, o corte −40% vs `baselineTokensPerTask` (default = tokens/tarefa scripted) entra no score; `successfulTicketIds` é opcional (`ticketIdsFromLedger` se omitido). Host `@Remote measureOpt8` = `measureOpt8View(entries)` (`TurnLedgerView` ≡ `TurnLedgerEntry`); não remonta flags nem só conta linhas. Relatório: `persona-spec/reports/opt8-acceptance.md`.

Fechamento v1: `measureV1Close` = PRO-6 + GES-6 + OPT-8. `opt8.blocked` não falha o gate. Relatório: `persona-spec/reports/v1-close.md`. Probe importa; host pode expor `@Remote measureV1Close`.

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

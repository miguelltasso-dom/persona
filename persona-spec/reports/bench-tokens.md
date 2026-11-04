# Tokens por cenário — linha de base (Rivet OPT-1, 04/11)

Contagem **fiel do runner scriptado**. Rodada real CLI congelada (orçamento). Forge completa as linhas reais quando liberar.

Cache hit só aparece quando o vendor publicou `cacheReadTokens`. Ausência ≠ 0%.

| Cenário | kind | motor | input | output | cache read | calls | origem |
|---|---|---|---:|---:|---:|---:|---|
| Pedido simples #geral | triage | claude/haiku | 100 | 20 | 80 | 1 | scripted |
| Tarefa multi-etapa + revisão | execution | claude/sonnet | 400 | 80 | — | 2 | scripted |
| Dia ocioso sem objetivo | — | — | 0 | 0 | — | **0** | `idleTeamMayCallModel(false)` |
| 30 personas iniciativa (lote) | initiative | claude/haiku | 30×80 | 30×12 | — | 30 | scripted (teto) |
| Padaria Lua (dogfood) | execution | — | — | — | — | — | pendente CLI real |

`foldTurnLedger` + `cacheHitRate` em `persona-usage`. Triagem/Bibliotecário/Vigia/iniciativa → `modelForWork` = modelo barato. Sessões aquecidas: `sessionPoolKey` já inclui purpose+account.

**[Rivet→Forge]** preencher rodada real mínima (dispose/timeout) nas mesmas linhas.
**[Rivet→Lumen]** painel Uso lê `TurnLedgerFold`.

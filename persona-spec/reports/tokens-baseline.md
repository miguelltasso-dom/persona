# Tokens — linha de base (OPT-1, Forge, 04/11)

Contagem **fiel do runner scriptado**. Gate de regressão: falha se tokens subirem > 10% sem ganho de qualidade ≥ 0,15.
Referência do aceite = CLI direta (paridade ±10%), não um harness antigo. Overhead (triagem / Bibliotecário / Vigia / iniciativa) entra no livro à parte.
Rodada vendor (Claude/Codex) fica opt-in `PERSONA_PAIR_REAL=1`, cap 1, `start`→fold→`cancel`, timeout cancela primeiro, `dispose` no `finally`.

## Cenários de referência

| cenário | tokens | chamadas | cache hit | vs base | origem |
|---|---:|---:|---:|---:|---|
| geral-simple | 99 | 2 | 0.50 | 0 | estimate |
| multi-review | 148 | 3 | 0.67 | 0 | estimate |
| idle-routines | 0 | 0 | 0.00 | 0 | estimate |
| initiative-30 | 0 | 0 | 0.00 | 0 | estimate |
| padaria-lua | 155 | 3 | 0.67 | 0 | estimate |

Painel Uso (Anvil OPT-7 lê `foldUsagePanel` de `persona-core`): origem **estimate**, tokens/tarefa 134.0, cache hit 0.63.
Camadas do prefixo estável (talk): system 271 · tools 8 · required 6 · message 5. Persona entra em system; relógio/contador recusados no prefixo.

## Benchmark pareado (mesma CLI/modelo)

| tarefa | CLI in+out | Persona in+out | Δ | chamadas CLI/Persona | qualidade | veredito |
|---|---:|---:|---:|---|---:|---|
| simple-ask | 48 | 51 | 0.063 | 1/2 | 1.00 | parity |
| multi-review | 51 | 54 | 0.059 | 1/2 | 1.00 | parity |
| research-summary | 52 | 55 | 0.058 | 1/2 | 1.00 | parity |
| code-fix | 53 | 56 | 0.057 | 1/2 | 1.00 | parity |

Qualidade = fração dos critérios de pronto presentes na resposta. `persona_worse` reprova o gate.

## Alavancas do engine (§2) — antes / depois

| alavanca | antes | depois |
|---|---:|---:|
| pré-roteador F3 (legado → ampliado; sem regras = 41) | 26 | 18 |
| Vigia com orçamento esgotado (needsModel) | — | false |
| dia ocioso / 30-persona iniciativa | — | 0 / 0 |
| ferramentas mínimas (shell+browser drop) | 3 | 1 |
| canal (palavras) | 140 | 100 |
| iniciativa em lote (rascunhos→lotes / cabem no orçamento 400) | 4 | 2 lotes, 3 cabem |

Pré-roteador ampliado: vazio, injeção, fora de escopo e slash do composer (`/limites`…) fecham sem LLM. F3 permanece 41/41.

## OPT-8 — metas vs linha de base

| meta | agora | nota |
|---|---|---|
| −40% tokens/tarefa vs linha de base | — | esta rodada **é** a linha de base (402 nos 3 cenários com modelo; 134 tokens/tarefa) |
| ≥ 60% cache read no prefixo | 0,63 no painel; TOK-1 = 0,50 · TOK-2/5 = 0,67 | idle/iniciativa = 0 (sem prefixo) |
| 0 chamadas com equipe ociosa sem objetivo | TOK-3 / TOK-4 = 0 | meta já no scripted |
| paridade CLI ±10% | Δ +5,7–6,3%, veredito **parity** | referência = CLI direta |

Metas de corte (−40%) só se renegociam depois da integração (Anvil persistiu o livro; Lumen lê o painel). Gate local: JSON + `assertScenarioRegression` (+10% sem qualidade ≥0,15).

## Contrato para o Anvil (OPT-7)

- Persistir `TurnLedgerEntry` de `@deepseek-ai/dsh-persona-core` (kinds `execution` / `evaluation`, não `exec` / `eval`).
- Painel: `foldUsagePanel(entries, successfulTicketIds)` → tokens/tarefa, por persona, por tipo, cache hit, origem `measured`/`estimate`.
- `usagePortKind` só no port Rivet. Ausência de cache ≠ 0%.

## Como reproduzir

```
pnpm exec vitest run packages/persona/persona-core/tests/token-ledger.spec.ts packages/persona/persona-engine/tests/token-measure.spec.ts packages/persona/persona-engine/tests/preroute.spec.ts
pnpm exec tsx packages/persona/persona-engine/scripts/write-tokens-baseline.ts
```

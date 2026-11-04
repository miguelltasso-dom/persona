# Contrato — classe de motor por turno (OPT-5)

Dono da política: **Forge** (`persona-engine/src/engine-policy.ts` `engineClassForTurn`).
Pool / sessão quente / CLI real: **Rivet**.

| `TurnKind` | Classe | Por quê |
|---|---|---|
| `triage` | `cheap` | uma chamada barata por mensagem que exige decisão |
| `initiative` | `cheap` | lote diário, sem modelo se ociosa sem objetivo |
| `librarian` | `cheap` | higiene sem LLM quando dá; senão motor rápido |
| `watchdog` | `cheap` | `needsModel: false` se `budgetLeft` esgotado |
| `evaluation` | `cheap` | revisão curta |
| `execution` | `persona` | motor da executora |
| `reply` | `persona` | voz no canal |

Idle sem objetivo = 0 chamadas (TOK-3 / TOK-4). Sessão reutilizada sem reenviar o prefixo = Rivet.

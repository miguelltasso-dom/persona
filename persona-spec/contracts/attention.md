# Contrato — atenção (desktop)

Donos: **Anvil** (Remote + filtro) · **Rivet** (notificações nativas do desktop).

## `getAttentionPolicy(scope) → AttentionPolicyView`

| Campo | Default |
|---|---|
| `delivery` | `summary` (agrupa) · `ping` (um toast por item) |
| `proposalBudget` | `getProjectLimits.maxProposalsPerDay` |
| `quietStart` / `quietEnd` | `22:00` / `07:00` |

`putAttentionPolicy` persiste. Em janela de silêncio, `delivery: ping` não emite.

> **HONEST-1 (11/11):** `quietStart`/`quietEnd` daqui **só gravam, nada os lê**. O silêncio que vale (equipe e toast do desktop) é a `quiet_window` — ver `house-rules.md`. A tela não deve oferecer estes dois campos.

## `attentionEvents(scope) → AsyncIterable<AttentionStreamFrame>`

Baseline depois upserts. Itens já agrupados:

| `kind` | Origem |
|---|---|
| `needs-you` | Ticket `blocked` / Attention / “Precisa de você” |
| `review` | Ticket `review` (pronta para revisão) |

Corta em `proposalBudget`. Intervalo mínimo do stream: **1 s** (sem polling abaixo disso).

Rivet: `getAttentionPolicy` + este stream alimentam o tray. Sem token, sem stack.

# Contrato — atenção (desktop)

Donos: **Anvil** (Remote + filtro) · **Rivet** (notificações nativas do desktop).

## `getAttentionPolicy(scope) → AttentionPolicyView`

| Campo | Default |
|---|---|
| `delivery` | `summary` (agrupa) · `ping` (um toast por item) |
| `proposalBudget` | `getProjectLimits.maxProposalsPerDay` |
| `quietStart` / `quietEnd` | `22:00` / `07:00` |

`putAttentionPolicy` persiste. Em janela de silêncio, `delivery: ping` não emite.

## `attentionEvents(scope) → AsyncIterable<AttentionStreamFrame>`

Baseline depois upserts. Itens já agrupados:

| `kind` | Origem |
|---|---|
| `needs-you` | Ticket `blocked` / Attention / “Precisa de você” |
| `review` | Ticket `review` (pronta para revisão) |

Corta em `proposalBudget`. Intervalo mínimo do stream: **1 s** (sem polling abaixo disso).

Rivet: `getAttentionPolicy` + este stream alimentam o tray. Sem token, sem stack.

# Contrato — Várias contas por provedor (WAVE2 §3 · Anvil Remote · Lumen UI)

Dono do Remote: **Anvil** (+ **Rivet** para diretórios de config isolados por conta). Consumidor: **Lumen** (Conexões, Uso, cartão da persona).

Credenciais nunca saem do desktop. A UI mostra aviso de termos dos provedores (cópia locale-owned).

## Leitura

| RPC | Resultado |
|---|---|
| `listConnectionAccounts(scope)` | `{ accounts[], swapPolicy, swapPolicyScope }` |
| `listConnections(scope)` | legado: um card por kind; Lumen faz fallback até `listConnectionAccounts` existir |

### `ConnectionAccountView`

| Campo | Significado |
|---|---|
| `id` | id estável da conta (store) |
| `provider` | `claude` \| `codex` \| `cursor` \| `opencode` \| `dsh` |
| `label` | rótulo do usuário ("Pessoal", "Trabalho") |
| `loggedIn` / `available` / `phase` / `loginHint` / `error?` | mesmo contrato de `ConnectionView` |
| `inUseCount?` | quantas personas usam agora (informativo) |

### Política de troca

`RunnerSwapPolicy`: `fixed` · `next_on_limit` · `round_robin` · `ask_before_swap`

`RunnerSwapPolicyScope`: `workspace` (padrão) · `persona` (exige `personaId` no set)

Troca só entre contas do **mesmo** `provider` ou motores aceitos pela persona; mudança de motor = handoff (fora deste RPC).

## Domain (Forge / persona-core)

`pickAccount` · `accountSwitchActivity` · `engineSwitchHandoff` · `accountAskNeedsYou`. Políticas de domínio: `fixed` · `next_on_limit` · `split_balance` · `ask`. Aliases do host: `round_robin` → `split_balance`, `ask_before_swap` → `ask`. `isolatedHome` é o diretório de config por conta (Rivet preenche). Atividade nunca inclui id nem segredo. `ask` vira Precisa de você.

## Escrita

| RPC | Efeito |
|---|---|
| `setRunnerSwapPolicy({ workspaceId, projectId, policy, scope, personaId? })` | persiste política; auditoria |

Adicionar/remover conta: Rivet/login flow (fase 2); UI pode mostrar "Adicionar conta" desabilitado até RPC.

## Uso oficial por conta

`getOfficialQuota({ workspaceId, projectId, provider?, accountId? })` → `OfficialQuotaView` com `accountId?` + `accountLabel?` quando a cota é de uma conta específica.

## Cartão da persona

`getPersonaCard` inclui opcional `activeAccount?: { provider, label }` — conta em uso agora (atividade: "Nina passou para Claude · Trabalho").

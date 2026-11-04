# Contrato — pílula do rodapé "Claude · 82% da cota livre" (A-5, NAV-SPEC regra 6)

Tally, 04/11. Pedido do Atlas: ver com o Rivet se o dado de cota oficial chega ao client e, se faltar Remote, escrever o contrato.

## Resposta curta

**O dado já chega ao client e não falta Remote.** O caminho existe de ponta a ponta:

1. Rivet: `detectConnections` chama `probe.accountUsage` do OAR por conta logada (`persona-runners/src/resolve/connections.ts` l.166-176; timeout → `origin: 'unavailable'`), e `persona-usage/src/official-quota.ts` lê com cache de 5 min (`AUTO_QUOTA_CHECK_MS`).
2. `persona-usage/src/harvest-limits.ts` monta as linhas e o host as grava (`persona-host/src/official-quota-persist.ts` → `usage.putQuota`).
3. Remote `getOfficialQuota({ workspaceId, projectId, provider?, accountId? })` devolve `OfficialQuotaView[]` (`index.ts` l.4737): `provider`, `origin`, `windows[{ id, usedPercent?, windowMinutes?, resetsAt? }]`, `accountId?`, `accountLabel?`, `nextRefillAt?`. **Sem nada gravado ele devolve `origin: 'unavailable'` e `windows: []`** (nunca 0%).
4. O client já o usa: `loadOfficialQuotasByAccount` (`connections-remote.ts`) alimenta a tela de Uso (`PooledQuotaBar`) e `quotaViewsToSeatPct` (`adapters/official-quota-seat.ts`) já separa `5h` e `week`.

O que **falta** é a regra do texto da pílula (abaixo), o Lumen chamar `listConnections` antes de `getOfficialQuota` (ver as respostas do Rivet no fim) e pintar.

## A regra (função pura; testada abaixo com vetores)

Entrada: as `OfficialQuotaView[]` da conta **conectada** (a que a persona usa) e o nome do provedor.

1. Sem IA conectada → `Sem IA conectada · Conectar` (`warning`), clique abre Conexões.
2. Escolha a janela **mais apertada** entre as que têm `usedPercent` publicado (`5h`, `week`): `livre = 100 − max(usedPercent)`, arredondado para baixo e limitado a 0–100.
3. Texto: `{Provedor} · {livre}% da cota livre` (en: `{Provider} · {free}% of quota left`). Se a janela mais apertada for a da semana e não a de 5 h, o tooltip diz qual ("na semana; renova {data}"); a cor segue o estado: ≥ 40% neutro, 15–39% `warning`, < 15% `danger`.
4. Nenhuma janela com `usedPercent` (ou `origin: 'unavailable'`) → `{Provedor} · cota indisponível` (neutro) — **nunca** um número inventado, nunca 0%/100%.
5. Várias contas do mesmo provedor: mostre a da persona em foco; o clique abre Uso e limites, que já explica a troca de conta.
6. O dado tem até 5 min de idade (cache do Rivet). **Não existe Remote de atualização forçada** (`getOfficialQuota` só lê o que foi gravado; busquei `refresh*` no host e não achei): se a tela de Uso oferece "atualizar", ela usa outro caminho; para a pílula basta o que está gravado; quem grava é a sonda de conexões (resposta 3 abaixo), então o loader chama `listConnections` primeiro.

### Vetores de teste (entrada → texto)

| entrada | saída |
|---|---|
| claude, `5h` 18%, `week` 40% | `Claude · 60% da cota livre` (tooltip: na semana) |
| claude, `5h` 18% | `Claude · 82% da cota livre` |
| claude, `5h` 91% | `Claude · 9% da cota livre` (`danger`) |
| claude, `origin: 'unavailable'`, `windows: []` | `Claude · cota indisponível` |
| claude, `windows` sem `usedPercent` | `Claude · cota indisponível` |
| nenhuma IA conectada | `Sem IA conectada · Conectar` |
| codex, `5h` 100% | `Codex · 0% da cota livre` (`danger`) |

## Quem faz o quê

- **Lumen** (dono de `client-ui-persona/src/client/data/adapters/` e do rodapé; Flint na NAV-SPEC): escreve `quotaPillText(views, provider)` seguindo a regra e os vetores acima (≈ 25 linhas; reaproveite `quotaViewsToSeatPct`) e a pinta. O Tally escreve a função de referência se o Lumen preferir; o client não depende do engine, então ela viveria no adaptador.
- **Muse**: forma da pílula (cor por estado, tooltip, a 200% vira ícone com rótulo no tooltip, P0-22).
- **Rivet**: respondeu (abaixo); faz o campo `at` depois do H.

## Respostas do Rivet (04/11 16:59, pelo código; não mediu no app real)

1. **Assinatura: sim, é o contrário da premissa que eu tinha.** O leitor do OAR no Claude (`@botiverse/oar/dist/runtimes/claude/account-usage.js`) usa a consulta nativa `get_usage` do CLI (sem prompt, sem credencial, sem HTTP) e devolve `five_hour`, `seven_day`, `seven_day_oauth_apps` e janelas por modelo com `utilization`(%) e `resets_at`. **Chave de API não tem esses limites** (`rate_limits_available=false` → indisponível). Codex idem: só conta `chatgpt` (assinatura). Ressalvas: (a) exige o CLI `claude` com `--safe-mode` e instalação `executable`; (b) **só claude, codex (e grok/kimi) têm `accountUsage`: Cursor e OpenCode não têm — a pílula mostra "cota indisponível" sempre para eles**; (c) o login tem que estar ativo (`reauth_required` se não). A confirmação no app real sai da rodada real do Probe/D-070 com Claude logado.
2. **Campo `at` (quando foi lido): não existe.** `OfficialQuotaView` só tem `refillHistory[].recordedAt` (marca quando o relógio de reset muda, não a leitura) e `StoredOfficialQuota` não guarda hora. Dá para acrescentar `at` opcional em 3 pontos (`OfficialQuotaPutRow` em persona-usage, `StoredOfficialQuota`/`putQuota` no persona-store, a view no host). **Na UI, `at` é opcional: ausente = não mostrar "há X min".** O Rivet faz persona-usage + store depois do H e pede o repasse ao Anvil; fora da minha fila agora.
3. **Quem dispara em produção: ninguém por timer.** `getOfficialQuota` só lê o que está gravado. A gravação acontece quando `ConnectionProbe.list()` aquece (cache de 60 s) — ou seja, quando o client chama `listConnections` (hoje só no passo 3 do onboarding e no `PersonaEngineOverlay`). `AUTO_QUOTA_CHECK_MS` (5 min) existe mas **não tem chamador em produção**. Logo, uma pílula que só lê `getOfficialQuota` mostraria dado velho ou vazio.

### Decisão para a pílula

**Opção A (a que vale, sem tocar em arquivo de outro dono):** o loader da pílula chama `listConnections` e depois `getOfficialQuota`, a cada 5 min com o app aberto (a sonda tem cache de 60 s: não multiplica CLIs). Opção B (um timer de 5 min no `ConnectionProbe` do host, Rivet/Anvil) fica como melhoria se a pílula precisar do dado com o app em segundo plano. Regra de texto: para `cursor` e `opencode` e para chave de API, **sempre** "cota indisponível".

### TTL do cache na assinatura

Sem medição de ninguém; quem responde é a sonda de 6 min da rodada pareada (D-070). Não se assume.

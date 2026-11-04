# T3 Code → Persona: harvest de várias contas (Atlas 04/11)

Fonte de leitura: `C:/Users/migue/dev/_ext/t3code` (MIT, © 2026 T3 Tools Inc.).
Docs: `docs/user/usage.md` (contas + Track subscription limits), `providers-claude.md`, `providers-codex.md`.
Código: `packages/shared/src/usageLimits.ts`, `provider-core` instance env, `provider-grok` `GROK_HOME`, leitores de histórico por provedor.

Persona já tem WAVE2 §3: `accountHomeDir` + `pickAccount`/`pickProviderAccount` (Forge) + Cofre por conta + `officialQuota` cache por `provider:accountId`. Este harvest **não substitui** a política explícita (fixa / próxima / dividir / perguntar). Traz o que o T3 faz melhor em **identidade, cota oficial e pool**.

Atribuição: `packages/persona/persona-usage/NOTICE` + linha em `apps/desktop/src/legal-notices.ts`. Algoritmos reescritos no nosso estilo (sem Effect, sem `@t3tools/contracts`).

## Já temos (manter)

| Peça | Onde | Por quê fica |
|---|---|---|
| Home isolado por conta, sem copiar login | `persona-runners` `accountHomeDir` / `prepareAccountHome` | WAVE2 aceite; T3 também isola Claude por `CLAUDE_CONFIG_DIR` |
| Política explícita + atividade | `pickProviderAccount` + Forge `pickAccount` | T3 troca no picker; nós temos Precisa de você / handoff |
| Cota oficial, ausência ≠ 0% | `officialQuota` / `quotaCardMeters` | Igual à regra T3 de não inventar |
| Cofre `setAccount` sem plaintext | `persona-vault` | T3 guarda login nativo da CLI; nós também |

## Portar (adaptado)

1. **Home por conta** — `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, **`GROK_HOME`** (T3; nós só tínhamos `XAI_CONFIG_DIR`). Grok aponta as duas para o mesmo dir. Cursor / OpenCode / Gemini inalterados.
2. **Identidade da conta** — chave `provider:email` ou `provider:credential:<fingerprint>`; workspace só entra se o relatório trouxer. A mesma conta em vários ambientes **conta uma vez** (merge pelo mais fresco `checkedAt`).
3. **Pool de limites por provedor** — uma janela (session/weekly/monthly) com segmentos por conta; contas **ordenadas pelo próximo refill** (5h / session primeiro; sem relógio = infinito). Codex agrupa janelas pelo *kind*; os outros por `kind:id`.
4. **Créditos de reset** — `remaining` + `nextCreditId`; UI "Usar reset" só quando o provedor expõe. Redeem é port injetado (Claude/Codex/hub); sem API inventada.
5. **Checagem automática** — intervalo mínimo **5 min** (T3), inclusive após falha. Refresh manual ignora o intervalo (`force`).
6. **Histórico nativo** — somar só turnos com tokens gravados. Turno sem registro **não entra**. **Nunca** estimar tokens a partir do texto da conversa (T3: "T3 does not estimate missing tokens from conversation text").

## Adaptar (não copiar)

- Sem Effect / Schema T3. Tipos estreitos em `persona-usage`.
- Sem hubs CLIProxyAPI, widgets iOS/Android, `/usage-limits` no composer, preços custom, Map-to, Antigravity/Pi/Muse Code.
- Shadow-home Codex (`CODEX_HOME` compartilhado + shadow de `auth.json`) **não é o default**. WAVE2 isola sessão e config. Documentar como opção futura se o Miguel quiser continuar o mesmo fio entre contas.
- Claude: T3 avisa para **não** mudar `HOME` (keychain). Nós já só setamos `CLAUDE_CONFIG_DIR`.
- macOS Keychain "Enable Cursor usage": não. Persona lê cota via OAR/`accountUsage` + Cofre.
- UI do pool (barra hachurada, hover) = Lumen/Muse. Rivet entrega o fold + contrato.

## Não portar

- Relé T3 Chat / Clerk / cloud accounts.
- Compact-on-return Claude, async questions Codex, `/feedback` OpenAI.
- Estimativa de custo API-equivalent e "Premium vs Other" (Uso já tem `origin: estimate` rotulado; não misturar com oficial).
- `T3CODE_HOST_ID` / usage-host-id de container.
- Qualquer chamada a API de assinatura sem o login da pessoa.

## Ordem

D8 pack+CDP continua bloqueado no hash verde do Keel (`origin/persona-dev` ainda `96333ef934`). Núcleo do harvest entra **agora** em `persona-usage` + homes; UI e redeem real depois do instalador / bind Forge-Anvil.

## Contrato (Rivet → Lumen / Forge)

`poolProviderLimits(dedupeLimitAccounts(reports), now)` → um pool por motor.
`shouldAutoCheckQuota(lastAt, now)` → `false` se `< 5 min`.
`readNativeHistoryTotals(turns)` → `origin: measured | unavailable`; `turnsSkipped` visível.
`canUseReset(credits)` → habilita "Usar reset".
**[Rivet→Forge]** `accountId` estável + email/fingerprint no Remote de contas.
**[Rivet→Lumen]** meters do pool (não uma lista solta por ambiente).

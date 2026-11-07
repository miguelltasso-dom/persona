# D-096 — checklist da 2ª janela (Tally, 05/11 05:40)

**Estado:** o lado dos runners está pronto em staging (`.maestri/tmp/tally/d096-staging/`, fora de `packages/`). Nada em `persona-runners/src` foi tocado desde o congelamento. Contrato: `contracts/connector-ports.md` (D-096). Pré-prova do padrão, SEM tocar em `src`: o padrão `needed` foi simulado pela chave `PERSONA_CLI_ENV=needed` nos specs que leem o modo (host, e2e, core, store, engine): **11 arquivos / 142 testes verdes**; e a pasta INTEIRA do host (persona-host/tests) com o padrão simulado: 188 arquivos / 1.119 testes verdes (1 ignorado), 117 s — o padrão novo não quebra nenhum teste do host por si só.

## Passos do Tally (ordem)
1. `node .maestri/tmp/tally/apply-d096.cjs --check` → deve dizer "check ok: 13 files; src unchanged" (fail-closed: se alguém mexeu em um dos 8 arquivos de src, não escreve nada).
2. `node .maestri/tmp/tally/apply-d096.cjs` → copia 8 src + 5 testes e apaga o staging (o link do `node_modules` sai como LINK, sem seguir).
3. `persona-runners/tests` inteiro (path-scoped, trava `check`) + `check-pkg persona-runners`.
4. Avisar o Anvil ("está na árvore"): ele roda o `apply --check/--apply` dele (host: `env_mode_reason`, `grouped`/`needsPerson`, fallback no orchestration) e o guarda do host.
5. Specs do host que leem o padrão (`connector-bridge`, `connector-grants`, `connector-release.host`, `ht9-host-bridge`, `ledger-duration`) + `ht89-dry` (zero modelo) na CLI instalada.

## O que o padrão novo muda para os guardas do Probe (persona-e2e/src — dele; entra na 2ª janela)
- `team-round-gate.ts:72`: recusa se "answer-only NÃO é o padrão do exe" (`answerOnlyDefault`). Com o D-096 o padrão é `needed`: a pergunta certa passa a ser "o exe isola por padrão" (needed OU answer-only).
- `team-round-tree-gate.ts:62-63`: só aceita `PERSONA_CLI_ENV` vazio ou `answer-only` (`needed` explícito é acusado). Vazio já passa (= needed); aceitar `needed` e ajustar a mensagem. Para o TEAM-10 (sem conector) o custo é o MESMO nos dois modos: o worker é chamada sem ferramentas nativas (deny = "answer"), isolada nos dois.
- `team-round-guard.ts` `isolationProofProblems`: exige as provas `answer-only` E `needed` no arquivo do gate; o prewarm prova só o modo em vigor (`cliEnvMode(env)`), então um arquivo novo só teria `needed`. Exigir a prova do modo em vigor (+ a paridade do modelo).
- `team-round-guard.ts` `ledgerGuard` (modo real): mata todo turno `native`. Para uma rodada SEM conector isso segue certo (o fallback 2 só existe quando há conector concedido). Para uma rodada futura COM conector: aceitar `native` só com `envModeReason: connector-unreached` (precisa de `LedgerRow.envModeReason` em `ledger-evidence.ts`, lendo a coluna `env_mode_reason` do Anvil quando existir).

## Limites
O padrão simulado pela chave cobre o que LÊ o modo; não cobre o `connectorsReach`/o fallback (isso é o código novo, provado pelos 19 testes GUARDA + a suíte inteira de runners contra o staging). A rodada real do TEAM-10 (padrão atual `answer-only`) acontece antes da virada e não é afetada.

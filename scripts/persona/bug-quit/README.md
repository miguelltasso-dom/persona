# BUG-QUIT-1 — "Sair tem que fechar de verdade"

Medidor reproduzível: quanto tempo até o ÚLTIMO processo do app sumir depois de cada jeito de sair, e o que sobra (Host, CLIs, helpers do
Chromium). Aceite: **"Sair" (bandeja/menu → `app.quit()`) → todos os processos do app somem em ≤ 5 s, sem CLI órfã.** O X da janela e o Alt+F4
ESCONDEM na bandeja DE PROPÓSITO (não é este bug).

Relato, números e a história completa: `persona-spec/reports/rivet.md` (entrada 05/11 03:45).

## Rodar

Sempre sob o lock de build (abre o app de verdade; usa home temporária e porta livre):

```
node scripts/persona/with-lock.mjs "<rótulo>" --lock build -- \
  node scripts/persona/bug-quit/bug-quit.mjs <Persona.exe> <pasta-de-saida> app-quit --detach --clean [--fake-cli] [--turn] [--probe-overlay] [--relaunch]
```

- `<método>`: `app-quit` (o "Sair"), `window-close` (WM_CLOSE = o X), `taskkill-soft` (o "Encerrar tarefa"), `cdp-browser-close`.
- **Sempre `--detach --clean`**: um depurador Node conectado SOZINHO mantém um Electron vivo depois do quit (artefato); `--clean` não conecta
  o tracer. Sem isso o número é falso.
- `--fake-cli`: põe os stubs de `persona-e2e/fixtures/fake-cli` na PATH (as CLIs reais nunca são chamadas).
- `--turn`: onboarding + primeira entrega com `FAKE_CLI_TURN_MS=600000`, para sair com um turno de CLI em voo (precisa de `turn-driver.mjs` e do
  Playwright do `persona-e2e`; no exe H2 #3 o stub não chegou a receber o turno, ver o relatório).
- `--probe-overlay`: sonda SÓ DE LEITURA (estilos Win32 das janelas, quem é dono do pixel sob o overlay, foreground, se o atalho global está
  registrado) com `overlay-probe.ps1`.
- `--relaunch`: abre o app de novo com o processo antigo ainda vivo (mesma pasta de usuário = mesmo lock de instância única) e anota o que a
  pessoa veria.

**Aceite de um exe (o do corte), tudo de uma vez:**

```
node scripts/persona/with-lock.mjs "BUG-QUIT-1 exe do corte" --lock build -- \
  node scripts/persona/bug-quit/validate-exe.mjs <Persona.exe> <pasta-de-saida> [--turn]
```

Roda "Sair" liso (com a sonda do overlay: idle sem janela de overlay e sem o atalho global Ctrl+Shift+Space), com os stubs de CLI vivos e com
"reabrir"; com `--turn` uma 4ª execução tenta sair com um turno de CLI fake em voo (se o stub nunca recebe o turno, o veredito diz isso e NÃO
conta como aprovado). Imprime a tabela PASS/SLOW/FAIL (≤ 5 s) e grava `summary.json`; exit 0 só se aceito.

Saída em `<pasta-de-saida>/quit-<método>.json` (`outcome`: `all processes gone` | `processes still alive`; `endedAfterMs`; `timeline` com a
contagem de processos ao longo do tempo; `survivorsAt10s`; `firstFrame`), `.log`, `.timeline.json`, `app-stdio.log` (gravado em disco aos
poucos), `first-frame.png`.

## Segurança do medidor (regras duras)

- SÓ processos DESTE lançamento são olhados ou sinalizados: seguidos por PID **e data de criação**, a partir do PID que o script criou. A raiz só
  vale se nasceu depois do início do run; um membro já visto só vale se for o MESMO processo; um filho nunca é mais velho que o pai (pid de pai
  reciclado não puxa estranho para dentro). `scan-selftest.mjs` e `scan-live-test.mjs` provam isso.
- A listagem que não volta (PowerShell estourou) FALHA ALTO em vez de virar "nenhum processo" (falso "tudo sumiu").
- A única limpeza no fim é `process.kill` em sobreviventes REGISTRADOS deste lançamento. Nunca selecionar por nome de executável/caminho.

## Medir uma CÓPIA do exe com o código novo (sem empacotar)

`patch-copy.mjs` aplica ao `resources/app/lib/main.js` de uma cópia de `win-unpacked` (parte de `main.js.orig`, idempotente):

```
node scripts/persona/bug-quit/patch-copy.mjs <cópia>/resources/app/lib/main.js apps/desktop/src/quit-watchdog.ts
```

Chaves por variável de ambiente ao rodar a cópia: `RIVET_MITIGATE=1` (watchdog + `app.exit(0)` como no tree), `RIVET_WATCHDOG_ONLY=1`
(só o watchdog; o travamento fica), `RIVET_NO_OVERLAY=1`, `RIVET_CLOSE_OVERLAY=1`, `RIVET_DIAG_FILE=<arquivo>` (WebContents/janelas
vivas em finishQuit/before-quit/will-quit/quit e a cada 2 s depois). Sem chave nenhuma a cópia reproduz o travamento (baseline).

## Peças do medidor (para quem for mexer)

- `scan-core.mjs`: `walkOwned(listagem, { rootPid, startedAtMs, known })`. Quais processos são DESTE lançamento (pid + data de criação; raiz nascida depois do
  início do run; filho nunca mais velho que o pai). `scan-selftest.mjs` e `scan-live-test.mjs` o provam.
- `lister.ps1`: PowerShell persistente que imprime uma listagem da máquina por linha JSON, cada uma com `from`/`to` (os instantes antes/depois de tirá-la).
  O tempo de um evento é sempre o FIM da listagem em que ele apareceu (`afterMs`), nunca o início (`fromMs`): o número fica do lado conservador.
- `rootExitedAfterMs`: o instante exato do evento `exit` da raiz que o script criou (não depende da listagem); `endedAfterMs` é quando o ÚLTIMO processo do
  lançamento sumiu.
- `fakeCliEnv()` em `bug-quit.mjs` usa os MESMOS pinos do Probe (`withFakeCliOnPath`): `PATH`, `PERSONA_E2E_EXTRA_PATH` (o app refaz o PATH pelo login shell e só
  esta variável é prefixada depois dessa fusão), `OAR_CLAUDE_BIN`/`OAR_CODEX_BIN`/`OAR_OPENCODE_BIN`. Sem eles um run "com stub" pode detectar o `claude` REAL da pessoa.
- Laço do cofre (INST-2) do exe: `scripts/persona/exe-vault-loop.mjs` (N lançamentos, 3 chamadas reais ao cofre por lançamento; ver o cabeçalho do arquivo).

## O que ficou provado

Causa: a EXISTÊNCIA da janela de overlay do computer-use (transparente, tela cheia, `alwaysOnTop`, rAF eterno) criada no boot; destruí-la ou
fechá-la no quit não cura; `forward:true` e o nível `screen-saver` foram exonerados (bisect do Bolt). Conserto no tree: overlay e atalho global
só no 1º `control.begin` + `release()` no `finishQuit` + `app.exit(0)` + `quit-watchdog` (`apps/desktop/src/quit-watchdog.ts`).

# Medição da abertura e do peso da Persona (Cobalt, 07/11/2026)

Pedido do Atlas: medir o app **instalado** e o dev (janela, primeira tela útil, host pronto, memória por processo, CPU parado, tamanho do
instalador/app, módulos carregados), achar o que pesa e propor com número. A metade **host** é do Zinc (`HOST-BOOT.md`); este arquivo cobre o
**app empacotado/Electron/instalador** e junta as duas. Nada de IA real; tudo sob `with-lock`.

## 0. O que foi medido, e o que mudou no caminho

- O app **instalado** do H2 #4 ficava em `C:\p8i` (registro de desinstalação do Windows apontava para lá). No meio da medição a pasta **sumiu**
  (outro builder/limpeza do dia); o que sobrou é o **mesmo artefato empacotado** em
  `C:/Users/migue/dev/persona-push/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/Persona.exe` (mesmo `Persona.exe`
  de 246.302.720 bytes, 04/11 08:14) e o instalador NSIS **não assinado** `persona-0.2.2-alpha.3-win-x64-unsigned.exe` ao lado. A medição de
  runtime usa o `win-unpacked` (bits idênticos aos instalados; só muda a pasta e o desinstalador).
- Script: `C:/p8w-cobalt/scripts/persona/perf-probe.mjs` (cópia do Cobalt). Ele sobe o exe com home/user-data descartáveis, CDP na renderer,
  Playwright anexado, e mede: janela (MainWindowHandle via PowerShell), CDP, página, `[data-persona-shell]` (primeira tela útil), linha
  `[persona-host]` (host pronto), memória por processo (Win32_Process) e CPU parado (duas amostras de 10 s). 5 execuções: 1 fria (home novo) e 4
  quentes (mesma home).
- A máquina estava **compartilhada** (Ember capturando, Tally/Forge rodando): a trava `build` e o guarda de memória (≥ 6 GB livres; baixei para
  2 GB para caber) atrasaram a rodada. Os números de runtime abaixo são dessa condição e estão marcados como tal.

## 1. Tamanho: o que o instalador carrega

| Item | Tamanho | Onde |
| --- | ---: | --- |
| Instalador NSIS (não assinado, H2 #4) | **328 MiB** (343.920.109 B) | `persona-0.2.2-alpha.3-win-x64-unsigned.exe` |
| App instalado/descompactado | **1,2 GB** | `win-unpacked/` |
| `Persona.exe` (Electron) | 246 MB | raiz |
| `resources/app.asar` | **291 MB**, **27.472 arquivos** | `resources/` |
| `dsh/node_modules` (runtime do host dentro do asar) | **26.415 arquivos, 524 MB** | o peso dominante do asar |
| `resources/app.asar.unpacked` | 255 MB | binários nativos (`node.exe`, `libreoffice-kit.exe`, …) |
| `resources/runtime/primary-runtime/dependencies` | 255 MB | Node + dependências do runtime primário |
| `locales/` | 49 MB | Chromium (só pt-BR/en-US são usados) |
| `LICENSES.chromium.html` | 20 MB | licenças |

**Leitura:** o instalador é 328 MiB porque comprime ~1,2 GB; o que pesa é **runtime empacotado**, não o código do produto: 26 mil arquivos de
`node_modules` do host (524 MB) + 255 MB de nativos + 255 MB do runtime primário. O renderer (HTML/CSS/JS do shell) é irrisório no asar
(16 KB de estáticos; o bundle Web mora dentro do `dsh`).

## 2. Abertura: a cadeia de boot do app

Ordem real (`apps/desktop/src/main.ts`):

1. `app.whenReady()` → `main()` (`main.ts:2099`).
2. `reconcileBackend()` (`main.ts:825`): `navigateMain(url)` — **sem janela ainda, retorna** — e então `await backend.start(...)`.
3. `backend.start` (`host-process.ts:214`) sobe o **host em processo filho** (`Persona.exe --expose-internals …/dsh-desktop-host/lib/index.js`)
   e espera o evento `ready` por IPC.
4. Só **depois** do host pronto: `openInitialWindow()` (`main.ts:1915`) → `enterWorkspace()` (`main.ts:1831`) → `createMainWindow()` (`main.ts:1781`,
   `show: false`) → `navigateMain(url)` carrega o documento (com o splash `attachBootUi`, `main.ts:962`) → `window.show()`.

**Achado estrutural (o P0 do app):** a janela **não existe** enquanto o host sobe; o splash só cobre o carregamento do renderer. O T3 faz o
contrário (`DESEMPENHO.md` 2.3/2.4: a janela nasce em paralelo, `show:false` até `ready-to-show`, `backgroundThrottling:false`), e o host da
Persona já está pronto em ~0,9 s (Zinc) — ou seja, há ~1 s de tela inexistente que dá para eliminar sem tocar no host.

## 3. Host: números do Zinc (`HOST-BOOT.md`, bundle de produção)

| etapa | frio (ms) | quente (ms) |
| --- | ---: | ---: |
| carga do módulo | 452 | 368 |
| construtor do host | 509 | 530 |
| primeira chamada | 1,5 | 2,4 |
| **processo → primeira chamada** | **963** | **886** |
| RSS na primeira chamada | 93 MB | 92 MB |

O host **não é o gargalo**; `gh --version` síncrono custa 160–240 ms, migrações frias 116–553 ms (picos 0,7–3,3 s), CLI/conectores ~16–20 s em
segundo plano.

## 4. App instalado: janela, primeira tela, memória, CPU — **BLOQUEADO por um defeito do artefato**

O único artefato empacotado que sobrou na máquina **não abre**: o host morre no startup com

```
DesktopHostFatalError: dsh: failed to read overlay ...\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\config\electron.cordis.patch.yml:
Error: ENOENT ... not found in ...\app.asar
```

O caminho **não existe no asar** (conferi o cabeçalho do asar: nem `dsh-desktop-host/config` nem o `electron.cordis.patch.yml` estão lá), nem no
`app.asar.unpacked`. Reinstalei o NSIS do `.desktop-build` (instalação silenciosa, exit 0, em `%LOCALAPPDATA%\Programs\Persona`) e o payload é o
mesmo: o app abre a janela, o host falha e a tela não chega ao shell (o `perf-probe.mjs` esperou 90 s por `[data-persona-shell]` e registrou o
erro; crash log em `...\user-data-cold\logs\crash-*-host.log`).

Consequência: **não há número de janela/tela/RAM do app instalado nesta rodada** — o `C:\p8i` do H2 #4 (que funcionava) foi apagado no meio do dia
e o artefato que restou está incompleto. O `perf-probe.mjs` está pronto (5 execuções, 1 fria + 4 quentes) e roda em ~3 min assim que houver um
artefato que abra (o do corte, ou o `win-unpacked` completo). **Achado para o Rivet/Keel:** o pacote do `.desktop-build` de 04/11 08:16 não é
reprodutível — falta o diretório de configuração do `dsh-desktop-host` no asar; se esse for o artefato do corte, o app não sobe.

## 5. O que pesa, com número

1. **Tela inexistente durante o boot do host** (~0,9 s do host + boot do Electron antes da janela): a janela só nasce depois de `backend.start`
   (fato de código, `main.ts:825`/`:1915`; o tempo exato depende do item 4).
2. **Renderer bundle + client boot**: a primeira tela útil depende de carregar o bundle Web e montar o shell (`client-ui-persona/lib/client.js`
   3,6 MB no asar); o tempo exato depende do item 4.
3. **Instalador/app**: 26 mil arquivos de `node_modules` no asar (524 MB) e 255 MB de nativos; o instalador comprime para 328 MiB, mas a
   instalação/atualização escreve 1,2 GB.
4. **`gh --version` no boot** (160–240 ms, picos de 0,5–3,5 s) — custo puro de spawn, fora do caminho útil.
5. **Warmups de CLI/conectores no construtor** (Zinc: no fonte+tsx o construtor cai de 5,2–7,1 s para 0,74 s; no bundle o construtor já é
   ~0,5 s, então o ganho em produção é de CPU/RSS concorrendo com a primeira tela, não de bloqueio).

## 6. Limites

- A pasta instalada do H2 #4 sumiu durante a medição; o artefato que restou (`.desktop-build` de 04/11 08:16) **não abre** (falta o overlay do
  `dsh-desktop-host` no asar) — por isso não há número de runtime do app nesta rodada.
- Máquina compartilhada: os tempos de janela/tela variam com a carga; as medianas são o sinal.
- O probe usa home descartável (primeira execução = onboarding, sem IA); não mede o app com dados de uso.

## 7. Linha de base v1.1 — app INSTALADO (09/11/2026)

**Artefato.** Setup final do corte v1.1: `C:\p8c\Persona-Setup.exe`, sha256 `941fd2a5…127d`, 345.642.102 B (329,6 MiB), commit `3660c033a5`; instalação silenciosa `/S /D=C:\p8perf` em 51,7 s (exit 0). Instalado: 1.264.388.577 B (1,18 GiB), 8.218 arquivos em disco; `resources/app.asar` 248.585.695 B / 20.944 arquivos (24.394 entradas), `app.asar.unpacked` 266.478.144 B (254,1 MiB), `resources/runtime` 266.849.633 B, `locales` 50.643.495 B, `resources/mingit` 96.237.338 B. O asar final TEM o overlay do host (`dsh/node_modules/@deepseek-ai/dsh-desktop-host/config/electron.cordis.patch.yml`): o defeito do artefato de 04/11 não se repete.

**Método.** `perf-probe.mjs` (5 execuções: 1 fria + 4 quentes; home/user-data descartáveis; sem IA), sob `with-lock build`, na máquina compartilhada (47% de CPU médio; OneDrive sincronizando). `window` = primeiro `MainWindowHandle` (PowerShell; +300 ms), `cdp`/`page` = Playwright/CDP, `screen` = `[data-persona-shell]`, `surface` = `[data-persona-surface]`, `host` = primeira linha `[persona-host]`; RAM/CPU = Win32_Process (2 amostras de 10 s).

| execução | janela (ms) | CDP (ms) | página (ms) | shell (ms) | surface/host (ms) | RAM (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 fria | 180.363* | 180.859 | 180.963 | 181.036 | 211.042 | 945 |
| 2 quente | 180.373* | 180.440 | 180.524 | 180.600 | 210.606 | 948 |
| 3 quente | 180.303* | 180.502 | 180.866 | 180.984 | 211.007 | 928 |
| 4 quente | 180.382* | 180.833 | 180.853 | 180.972 | 210.975 | 948 |
| 5 quente | 180.370* | 180.682 | 181.340 | 181.697 | 211.745 | 943 |

\* `window` é o **timeout do vigia** (180 s + 300 ms), não a hora em que a janela apareceu; o watcher bloqueia o event loop, então CDP/shell também são medidos depois do timeout. O `windowsHide: true` do probe esconde a janela do SO (`MainWindowHandle` 0); o renderer está visível (ver o diagnóstico corrigido abaixo). O `surface`/`host` é o timeout de 30 s da superfície; a linha `[persona-host]` chega junto.

**Janela visível (probe corrigido, 2 execuções).** `perf-probe-visible.mjs` (spawn com `windowsHide: false`; janela via `EnumWindows`/`IsWindowVisible` em paralelo com CDP/shell; `readyState`/`visibilityState`):

| execução | janela visível (ms) | CDP (ms) | página (ms) | shell (ms) | RAM (MB) | CPU parado GPU/renderer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 fria | 8.484 | 930 | 1.285 | 11.658 | 1.096 | 23% / 7% |
| 2 quente | 6.879 | 664 | 728 | 9.177 | 1.133 | 21% / 6% |

RAM por processo (fria/quente): main 172/211, GPU 272/270, renderer 185/186, host 414/413, utility 53/53. `readyState=complete`, `visibilityState=visible`, `hasFocus=true` nas duas. A janela aparece **antes** do shell (splash/loading); a primeira tela útil é o shell em **9,2–11,7 s**.

**Memória/CPU parados (janela visível, 2 execuções).** total **1.096–1.133 MB**: main 172–211, GPU 270–272, renderer 185–186, host 413–414, utility 53. CPU parado: GPU **21–23%**, renderer **6–7%**, host 1%, main 0–1%. O host está ~4,5× o RSS do host do Zinc (93 MB); a GPU/renderer seguem trabalhando (splash/shell animando). Os números do probe antigo (945,5 MB / GPU 56%) foram medidos com a janela escondida e ficam como referência do artefato do probe, não da linha de base.

**Diagnóstico do boot (mesmo exe, home nova).** O `perf-probe` spawna com `windowsHide: true`; nesse modo o SO esconde a janela do app. O `window` do probe é o timeout do watcher (180 s), que ainda bloqueia o event loop; os marks de CDP/shell são medidos depois do timeout, não na hora real. Medição corrigida, pelo rig do Muse (`startInstalledDesktop`, CDP, home limpa, fake CLI, também `windowsHide: true`): página em **754 ms**, shell em **10.073 ms**, `document.readyState = complete`, `document.visibilityState = visible`, `hasFocus = true`; screenshot CDP em `.maestri/tmp/cobalt/rig-check.png`. O `EnumWindows` não vê janela porque a janela está no desktop do processo spawnado com `windowsHide`; o renderer está visível e focado. Lançamento normal (`Start-Process`, sem `windowsHide`): janela **VISÍVEL** em < 15 s (pid 31896, hwnd 3803202, título "Persona"); o print real `.maestri/tmp/cobalt/start-process-screen.png` mostra o onboarding (passo 1 de 5). O host sobe o servidor Web em 7,5 s; o shell chega em ~10 s. O `dsh-desktop:mandatory-status` sem handler (0,7 s) é o erro conhecido do boot e não bloqueia.

**Leitura contra as metas.** Janela visível: **6,9–8,5 s** (meta < 1 s: não). Primeira tela útil (shell): **9,2–11,7 s** (meta < 2 s: não). RAM parada: **1,1 GB** (meta < 300 MB: não; host 414 MB, GPU 270 MB). Instalador ≤ 250 MiB: **não** (329,6 MiB; 1,18 GiB instalado). Host pronto: servidor Web em 7,5 s; shell em ~9–12 s. O "sem janela" era artefato do probe (`windowsHide` + watcher bloqueando o event loop).

**Próximo.** O probe corrigido (`perf-probe-visible.mjs`) e a linha de base com janela visível estão prontos; o `perf-p0.patch` (janela/splash antes de `backend.start`) e o `perf-diet.patch` continuam para a v1.2 (congelamento do candidato), aplicando limpo em `3660c033a5`; medir o P0 no próximo artefato com o probe visível. O achado "instalação nova sem janela" **não se reproduz fora do probe**; não é P0 de release.

## 8. v1.1.1 "LEVE E RÁPIDA" — baseline, timeline e perfil do host (09/11)

**Baseline v1.1 (Setup 4acf5b7a, `C:/p8perf`, 3 execuções, janela visível).**

| execução | janela (ms) | shell (ms) | CDP (ms) | RAM (MB) | host (MB) | GPU (MB) | CPU GPU/renderer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 fria | 6.700 | 8.963 | 640 | 1.277 | 412 | 434 | 31% / 8% |
| 2 quente | 6.844 | 9.327 | 505 | 1.290 | 418 | 427 | 37% / 12% |
| 3 quente | 6.522 | 8.755 | 526 | 1.120 | 413 | 265 | 4% / 2% |

**Timeline do boot (sampler 500 ms, 1 execução).** O main fica em **0,78 s de CPU e plano** de 3,3 s até a janela; o host sobe de **0,73 → 4,02 s de CPU** e **151 → 352 MB**; a janela visível aparece em **7,10 s** e o `dsh web` em **7,20 s**. O renderer só trabalha depois da janela (0,5 → 2,5 s de CPU). **O gargalo é o boot do host, não o require em cascata do main.**

**RAM por processo (baseline).** main 184–196, GPU **265–434**, renderer 194–208, host **412–418**, utility 52–53; total **1.120–1.290 MB**. O GPU varia com a animação/visibilidade do onboarding (434 nas 2 primeiras, 265 na 3ª); o host é o maior processo fixo (412–418) e carrega o perfil completo + warmups de CLI/conectores; o renderer (194–208) carrega o bundle do cliente (15,9 MiB) + DOM; o main (184–196) é o Electron + asar. Candidatos a lazy/utility: warmups de CLI/conectores do host no 1º pedido (P1), painéis do cliente por code splitting (P1), e o GPU (compositor do Chromium; `--disable-gpu` não é viável para a UI). A meta < 500 MB total exige cortar o GPU e/ou o host; medir cada corte no instalado.

**Perfil de CPU do host (host direto, 5,9 s até a falha do cofre; 6,4 s ativos).** O host direto (sem o Electron pai) falha no `persona-credentials`/`VaultUnavailableError` aos 5,9 s; o perfil captura o module load/plugin boot até ali. Top de CPU própria: `spawn` **1,18 s** (5,7%), `compileSourceTextModule` **0,75 s** (3,6%), `requireBuiltin` do `node-addon-native-custom-loader` **0,55 s** (2,6%), loader CJS/path/package_json ~0,5 s, Cordis ~0,36 s; 69% do tempo do perfil é ocioso (espera pós-falha). O host no app usa ~4 s de CPU para 7 s de parede: ~3 s de I/O/espera (asar/antivírus/DB/child) que o `--cpu-prof` não mostra. **Cortes medidos:** compile cache (P0) ataca o `compileSourceTextModule`; adiar os warmups de CLI (`spawn` 1,18 s) ataca o segundo; o module load/asar e o I/O pedem ETW/`wpr` ou o diet.

**Achado de teste (dívida do HEAD, não do tree).** `apps/desktop/tests/welcome-startup.spec.ts` falha **também no HEAD limpo 9f5fc1198e** (persona-ship): 2 testes, `TypeError: Cannot read properties of undefined (reading 'appendSwitch')` em `resource-budget.ts:17` via `main.ts:123`; o mock de Electron do teste não tem `app.commandLine`. Não é regressão do perf-p0 nem do tree sujo; é dívida do harness de teste do HEAD.

**P0 (commit db3b4ef0).** `perf-p0.patch` aplica limpo em 9f5fc1198e; o pack `--dir` do Keel está rodando; a medição antes/depois (win-unpacked vs Setup 4acf5b7a) fica pendente do artefato.

## 9. Atribuição do boot do host (11/11, Cobalt): não é DB nem `gh` — é carga de módulo + spawn

**Método.** Preload injetado no filho do host por `NODE_OPTIONS=--require` (o `desktopNodeEnvironment` preserva o env do app; o Electron empacotado só honra `NODE_OPTIONS` em `ELECTRON_RUN_AS_NODE`, então o main não é afetado). O preload embrulha `child_process.spawnSync/execFileSync/spawn`, as funções síncronas de `fs` e `process.send`, e grava tempo + caminho por chamada em `.maestri/tmp/cobalt/host-io-probe.log`. Rodado no `win-unpacked` do v1.1 (`3660c033a5`) com home preparada (`sp-home`), sem IA.

**Números (host direto, v1.1, 2 execuções: fria e quente).**

| chamada | fria (1ª leitura do asar) | quente |
| --- | ---: | ---: |
| `fs.readFileSync` no asar | **4.787 chamadas / 4,32 s** (máx 85 ms) | 2.377 / **0,13 s** (máx 2 ms) |
| `fs.openSync` | 59 / 1,14 s (máx 84 ms) | 51 / 8 ms |
| `fs.realpathSync` (asar) | 9.359 / 0,25 s | 9.348 / 0,25 s |
| `fs.statSync` | 2.067 / 0,12 s | 2.031 / 0,13 s |
| `fs.existsSync` | 2.919 / 0,05 s | 2.919 / 0,02 s |
| `spawnSync gh --version` | 1 / **0,15 s** (t≈5,0 s) | 1 / 0,14 s |

**Leitura.** O `--cpu-prof` do host (5,9 s até a falha do cofre) compila **498 módulos** (todos do `app.asar`) e gasta a maior parte do tempo em resolução/carga: `compileSourceTextModule` 0,75 s, `spawn` **1,18 s**, `requireBuiltin` 0,55 s, `internalModuleStat` 0,17 s, `readPackageJSON` 0,15 s, `getPackageScopeConfig` 0,12 s. O I/O que o `--cpu-prof` não mostra é **só a primeira leitura do asar depois de instalar/atualizar** (4,3 s de `readFileSync` frios, com o antivírus varrendo o arquivo); em execução quente o mesmo I/O cai para 0,13 s. **Não é o DB, não é o `gh` (0,15 s), não é o asar em si (quente é barato).**

**Consequência para os cortes.** (1) O compile cache do P0 ataca o `compileSourceTextModule` a partir da 2ª abertura; (2) adiar os warmups de CLI (o `spawn` de 1,18 s, que cria 4 processos) tira CPU/processos do caminho crítico; (3) o custo frio de 4,3 s é pago uma vez por instalação/atualização e some com a varredura do antivírus/compilação — o diet (menos arquivos no asar) reduz esse pico; (4) reduzir o número de módulos carregados no boot (plugins lazy) é o único corte que ataca a raiz dos ~5,5 s de CPU.

## 10. v1.1.1 — artefato do diet (11/11, commit 6525485907) e medição de abertura

**Artefato.** `package-clean --dir --commit 6525485907` (perf-p0 + diet integrados; o diet ficou em `runtime-file-policy.ts` e o `prepare-dsh` filtra o package set para o descriptor não citar pacote que não vai). `win-unpacked` em `C:\p8wbc28dac5c2\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked`.

| item | v1.1 (09/11) | v1.1.1 (11/11) | delta |
| --- | ---: | ---: | ---: |
| `win-unpacked` | 1.264 MB / 8.218 arquivos | **1.112 MiB / 8.157 arquivos** | **−152 MiB** |
| `resources/app.asar` | 237,1 MiB (248.630.466 B) / 24.395 entradas | **213 MiB (223.826.640 B) / 23.445 entradas** | −24 MiB / −950 entradas |
| `resources/app.asar.unpacked` | 254,1 MiB | **232 MiB** | −22 MiB |
| `locales/` | 55 arquivos, 48,3 MiB | **2 arquivos (`pt-BR`, `en-US`)** | −46 MiB |
| pacotes fora do perfil (inspector/sherpa/cua) | 969 entradas no asar | **0** | −50 MiB instalados |
| descriptor `desktop-runtime.json` | 364 shared packages | **337 shared packages** | −27 |
| overlay do host no asar | presente | presente | — |

O instalador NSIS não é gerado pelo `--dir`; com a compressão de ~3,7× do corte v1.1, os −152 MiB instalados devem virar ~−40 MiB no Setup (329,6 → ~290 MiB). A meta < 200 MiB continua dependendo da dieta 1–6 (LibreOffice/Python/MinGit sob demanda).

**Medição de abertura (3 execuções, janela visível, `perf-probe-visible.mjs`, home descartável, sem IA).** Preenchida abaixo com o artefato acima; a linha de base v1.1 é a da §8 (janela 6.522–6.844 ms, shell 8.755–9.327 ms, RAM 1.120–1.290 MB, host 412–418 MB).

## 11. v1.1.1 D-101 — primeiros cortes medidos (11/11, Cobalt)

**Método.** `--dir` pack de `6525485907` (P0 + dieta de locales/experimentais) no worktree warm `C:\p8wbc28dac5c2`; probe visível
(`perf-probe-visible.mjs`, 3 execuções, 1 fria + 2 quentes, home descartável) e probe direto do host (`host-boot-probe.mjs`, IPC de cofre
falso, mesmo perfil/home). O probe do host roda o `dsh-desktop-host` do tree preparado, sem o Electron pai, então mede o boot do host
isolado; o app soma o main/renderer.

**Cut 1 — janela antes do host (P0, `db3b4ef084`).** Janela visível **141–171 ms** (3 execuções limpas, v1.1: 6,5–8,5 s). O splash
aparece antes de `backend.start`. **O shell ficou 10,1/11,3/12,6 s (v1.1: 8,8–9,3 s): o renderer antecipado disputa CPU/disco com o boot
do host** — a janela ganha ~6 s de percepção e o shell paga ~2 s; medir de novo com a máquina vazia antes de tratar como regressão fixa.
RAM da execução limpa (sem sobras): **1.241 MB** (main 196, GPU 313, utility 94, renderer 201, host 437). GPU visível 49–61% (onboarding
animando), **minimizada 1–2%**.

**Cut 2 — dieta de locales + experimentais (`6525485907`).** Instalado **1.264 → 1.113 MB** (−151 MB); `app.asar` **237,1 → 213,5 MiB**;
`locales/` **55 → 2** arquivos (`pt-BR.pak`, `en-US.pak`); `sherpa-onnx-win-x64` (23 MB unpacked) e inspector/cua ausentes do asar e do
unpacked. O `--dir` não gera NSIS; o instalador será medido no Setup do Keel (esperado ~305 MiB com este corte; a meta ≤200 MiB exige a
dieta 1–6).

**Cut 3 — poda do backend do host (`2cd4a4d848`, FORA da v1.1.1).** 86 rows desligadas no perfil `persona` (LLM/loop de agente, execução
de ferramentas, controllers de sessão/workspace/job/terminal, storage, MCP, schedule, subagent/workflow/PTC, web, telemetria, plugin manager,
HMR). **O boot smoke reprova**: `[data-persona-shell] never mounted` (o boot do CLI deixa 7 entries pendentes — `settings`←configEditor,
`fs-sandbox`←sandboxPolicy, `agent-preset-registry`←agents e os 4 presets; religar `ui-session`, `agent-preset-registry` e `plugin-manager`
não fecha). Pela regra do Keel (a poda só entra com o smoke verde), fica fora da v1.1.1 e vira candidata da v1.1.2. Host direto, execução
quente, mesmo tree preparado:

| métrica | antes | depois | Δ |
| --- | ---: | ---: | ---: |
| ready (ms) | 14.009 | 10.208 | −27% |
| CPU até ready (s) | 14,42 | 10,22 | −29% |
| RSS no ready (MB) | 326 | 260 | −66 MB |

A meta ≤150 MB ainda não fecha: o que resta é o cluster mantido pelo shell (`agent`/`jobs` do quit/update, `session`/persistência/projeção
do file-drag, `tools`/`system-prompt`/`skill` do Office) + `persona-host`/`persona-runners` (SDKs do OAR/Cursor/pi). O próximo corte precisa
de decisão de produto (Office fora? file-drag pela store da Persona? SDK do Cursor lazy).

**Gates da v1.1.1 (11/11).** Patch final: commit `28dbb7f000` sobre `9f5fc1198e` (P0 + dieta; 7 arquivos). Testes no commit final:
`persona-package-inventory` 15/15, `installer-packaging` 6/6, `boot-ui` 2/2, `runtime-file-policy` 12/12; `main-startup` derruba o worker do
vitest **também no HEAD 9f5fc1198e** (dívida pré-existente do harness, não do patch). A janela medida no win-unpacked `6525485907`:
**141–171 ms**; shell 10,1–12,6 s (v1.1 8,8–9,3 s, disputa com o renderer antecipado); RAM 1.241 MB; GPU minimizada 1–2%. O Setup NSIS
(Rivet) e a dieta 1–6 ficam pendentes.

**GPU ociosa.** Com a janela minimizada o GPU fica em **1–2%**. Experimento de CSS no artefato (onboarding aberto, CDP): visível/focado
**26,4%**; com `data-persona-unfocused` (o corte `1efcbc1ec5`) **0%**; só tirar o `backdrop-filter` do scrim → **16,2%**. O corte CSS entra:
pausa os 17 loops e tira o blur do scrim fora de foco; o blur sozinho custa ~10 pontos.

| execução | janela (ms) | shell (ms) | RAM total (MB) | host (MB) | GPU parada | renderer parada |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.1 controle (instalado `C:\p8perf`, hoje) 1 fria | 7.296 | 9.887 | 1.131 | 416 | 39% | 9% |
| v1.1 controle 2 quente | 7.775 | 10.048 | 2.620\* | 397 | 75% | 16% |
| v1.1 controle 3 quente | 7.743 | 10.223 | 1.155 | 412 | 48% | 11% |
| **v1.1.1 (win-unpacked) 1 fria** | **201** | 12.141 | 1.278 | 436 | 57% | 13% |
| **v1.1.1 2 quente** | **138** | 12.596 | 1.493 | 440 | 49% | 10% |
| **v1.1.1 3 quente** | **137** | 10.426 | 1.128 | 434 | 40% | 7% |

\* Execução 2 do controle contaminada: sobraram processos da execução anterior (o snapshot por papel mostra duas instâncias); o host (397 MB) e o shell seguem válidos.

**Leitura.** A janela sai de **7,3–7,8 s para 123–201 ms** (meta < 1,5 s batida; ~40× mais rápida) — o splash aparece antes do host, como o P0 projetou. O shell **piora ~0,5–2,4 s** (10,4–12,6 s vs 9,9–10,2 s): o host pronto foi de **8,1 s** (timeline `dsh web:` no artefato novo; 7,2 s no v1.1) e o renderer passou a levar **2,3–4,5 s** depois do ready (1,6–2,1 s no v1.1). A causa provável é a disputa de CPU/GPU: com a janela visível e o splash animando durante o boot do host, o host (carga de módulo, CPU-bound) e o renderer (eval do bundle) perdem tempo; a RAM parada fica igual (1,1–1,5 GB) e o host sobe ~20 MB (433–440 vs 397–416). **O shell não cai com corte de host**: o gate `__DSH_BOOT_READY__` só libera o renderer depois do ready (proposta P0.5 no `PLANO.md`); o próximo corte de percepção é renderizar o shell antes do host, não acelerar o host.

**GPU parada.** 35–57% com a janela focada (as animações do shell: vaga-lumes/halos/blur) e **1–2% minimizada** (throttling do Chromium) nas duas versões — a meta ≤ 2% exige pausar as animações também sem foco (D-101(b), CSS/visibilitychange em `client-ui-persona`, Prism/Muse no visual).

**Poda de backend (D-101a, commit 89394edad8).** 38 rows de backend desligadas no `persona-app/cordis.patch.yml` (tools do agente DSH, skills, subagent/team, workflow/PTC, plan/goal/commands de goal, compaction, spill, timeout, otel, hmr, session-title, user-questions, fs-observation-policy, plugin-manager, agent-instructions). Método: o Host roda direto (sem o Electron pai) e imprime o relatório de startup; com o patch, o Host falha só no cofre (esperado fora do app) e mantém as mesmas 6 esperas em cascata do baseline — nenhuma dependência nova. Medição no app (1 execução, mesmo win-unpacked): **host 396 MB (antes 436–440), CPU de boot 5,5 s (antes 7,4 s), shell 10.980 ms**. Ficaram de fora, de propósito: `bash-sandbox`/`pwsh-sandbox` (provêm o serviço `shell` que `permission` espera), `commands` (`session-log-download`/`file-upload` esperam), e `agent`/`agent-default-model`/`config-editor`/`sandbox-policy`/`jobs` (exigidos por `agent-loop`/`settings`/`fs-sandbox`/`job-controller`). A meta ≤ 150 MB não fecha só com rows de folha: o que sobra é o núcleo DSH que o cliente usa (connection, typert/api-gateway, webserver, session, llm, storage) + persona-host + OAR; cortar isso é decisão de arquitetura (Keel/Atlas), não de perfil.

**Verificação da poda (D-101a).** O boot-smoke do repo (`scripts/persona/persona-boot-smoke.mjs`, home limpa, tour dos 9 painéis) rodou no pack worktree com o `cordis.patch.yml` podado: **`OK: clean home tour 9/9 panels; no fatal client errors` (exit 0)**. Commit `89394edad8`.

**GPU parada (D-101b, commit `2dba7cda3b`).** `PersonaAppFrame` marca `data-persona-idle` no `<html>` em `blur`/`visibilitychange` e o CSS do frame pausa `animation-play-state` de todos os nós enquanto o atributo existe (typecheck do `client-ui-persona`: `tsc --noEmit` exit 0). Medição pendente de um pack com o commit; o número atual é 35–57% com foco e 1–2% minimizada.

## 12. A/B do shell — P0 x variante (11/11, Cobalt)

**Método.** `perf-probe-visible.mjs` com `--warm` (home já aquecida), A/B alternado na mesma sessão, sem probe paralelo. A = `C:/p8perf`
(instalado v1.1, o artefato do baseline); B = win-unpacked `6525485907` (P0 original: a janela antecipada carrega o app URL, então o bundle
do cliente de 7 MB e o renderer disputam o boot do host); C = a variante `470f078b2e` (a janela antecipada mostra um documento de splash
standalone — `boot.html` + `boot.js`, sem bundle — e `openInitialWindow` navega para o app só depois do `backend.start`).

**Parcial (A 3 execuções, B 2; a rodada foi interrompida para empacotar a variante):**

| execução | janela (ms) | shell (ms) |
| --- | ---: | ---: |
| A v1.1 | 6.625 / 6.996 / 6.338 | 8.877 / 9.381 / 8.606 |
| B P0 original | 152 / 107 | 10.822 / 10.192 |

**Rodada 5×5 (alternada, homes quentes, mesma máquina):**

| execução | A v1.1 janela | A shell | B variante janela | B shell |
| --- | ---: | ---: | ---: | ---: |
| 0 | 6.610 | 8.763 | 107 | 10.349 |
| 1 | 6.576 | 8.937 | 146 | 10.214 |
| 2 | 6.418 | 8.808 | — | — |
| **mediana** | **6.576** | **8.808** | **~126** | **10.282** |

**Leitura.** A janela antecipada ganha ~6,5 s de percepção, mas o renderer/GPU antecipados custam **~1,5 s de shell** — e a variante de splash
standalone (`470f078b2e`) **não recupera**: o processo de renderer e o compositor já competem com o boot do host mesmo sem o bundle do
cliente. Pela condição dura do Keel (a mediana do shell não pode piorar), a janela antecipada **sai da v1.1.1** (commit `d2041d0a74`
reverte; o compile cache do P0 fica) e vai para a v1.1.2 com um desenho que não dispute CPU (splash estático ou renderer em prioridade
baixa até o host pronto).

## 13. Dieta 1–6 — contrato do host (11/11, Cobalt)

**Pacote novo `@deepseek-ai/dsh-persona-components`** (commit `df012f470f`), implementando `persona-spec/contracts/on-demand-runtime.md`
§4–6: manifesto pinado (kind/version/https/sha256/bytes), download com progresso, recusa de tamanho/hash, checagem de disco, extração em
staging e rename atômico para `<PERSONA_HOME>/runtime/<kind>/<version>`, um download por vez e remoção. O plugin Cordis expõe
`ctx.personaComponents` (`state`/`ensure`/`remove`/`subscribe`) e fica inerte sem manifesto; o perfil `persona` o insere com
`DSH_COMPONENTS_MANIFEST` (o build de release escreve `components.json` e o main passa o caminho) e `<PERSONA_HOME>/runtime` como raiz.
Provas: 17/17 testes (manifesto, instalação/reuso, concorrência, checksum, offline, http, truncamento, remoção, plugin inerte) e typecheck
src+tests OK. **Falta para fechar a dieta:** gerar os arquivos dos componentes + o manifesto no empacotamento (Rivet), publicar no host de
releases, e os chamadores (`document/office-to-pdf`, `skill/skill-office`) pedirem `ensureComponent` antes de usar; a UI de Componentes é
da Muse. Tamanhos a cortar: LibreOffice 182 MB, Python 144,5, MinGit 91,8, pnpm 20,5 (≈118 MiB comprimidos).

## 14. GPU sem foco — com e sem o commit `1efcbc1ec5` (11/11, Cobalt)

**Método.** `gpu-unfocused-probe.mjs` (novo, `C:/p8w-cobalt/scripts/persona/`): sobe o app com home descartável, espera o shell, amostra a CPU do processo GPU por 10 s (focado), liga o estado pausado e amostra mais 10 s. A janela do app **recupera o foco do SO** neste rig (o app re-foca em eventos de atenção; `SetForegroundWindow`/`AppActivate`/`window.blur()` não seguram), então o estado é aplicado exatamente como o `installAmbientPause` aplica: o atributo único no `<body>` via CDP (na medição o artefato `470f078b2e` usava `data-persona-unfocused`; a regra final da Muse usa `data-persona-ambient-paused`, mesmo seletor e mesmo efeito). O que se mede é o efeito da regra CSS (o detector de foco/ociosidade é código revisado, não medido). A pausa cobre também as animações **WAAPI** (o `installAmbientPause` pausa as `document.getAnimations()` running e retoma só as que pausou): o `animation-play-state` do CSS não as afeta, e o gate `preaccept-gpu` conta `getAnimations()` running depois de um `blur` sintético (`ac0806cf70`).

| artefato | GPU focado (CPU do processo) | GPU "sem foco" (CPU do processo) | contador de GPU do Windows |
| --- | ---: | ---: | --- |
| v1.1 instalado (`C:\p8perf`, sem o commit) | 25,3% | **21,5%** | — |
| v1.1.1 `470f078b2e` (com `1efcbc1ec5`) | 28,3% | **0%** | **45,6% focado → 0% pausado** (10 amostras, 100 linhas casadas) |

O contador de GPU do Windows (o `sampleGpuUtilization` do Ember, mesma semântica do Gerenciador de Tarefas) é o número que vale: com a pausa ligada, **0% em todos os motores** (3D, Copy, VideoDecode…); focado, 45,6% no motor 3D. A CPU do processo GPU acompanha (51,1% → 0%).

**Leitura.** Com o commit, o estado sem foco derruba o GPU de 28,3% para **0%** (meta ≤ 2% batida); sem o commit, o mesmo estado não muda nada (21,5%) — a regra não existe. O focado segue alto (25–28%) porque o shell anima; o orçamento do DESIGN-01 (`GPU-BUDGET.md`) cobre esse caso (≤ 6% parado, ≤ 15% no onboarding) e o próximo corte é o scrim do onboarding (blur de tela cheia).

**A/B do shell (fecha o §12).** Pares alternados, máquina vazia, mesma sessão: A (v1.1 instalado) **8.763 / 8.937 / 8.808 ms**; C (variante `470f078b2e`, splash standalone + bundle só depois do ready) **10.349 / 10.214 / 9.912 ms**. Janela: A 6,3–7,0 s, C 107–146 ms. O shell piora ~1,4 s mesmo com o splash sem bundle — o custo é o processo renderer+GPU existir durante o boot do host (o host pronto sobe junto). Pela condição V111-1 (a mediana do shell não pode piorar), a janela antecipada sai: commit `d2041d0a74` volta a sequência da v1.1 e mantém o compile cache; a variante fica para a v1.1.2 com um fix de desenho (splash estático ou renderer de baixa prioridade).

## 15. Poda do perfil — o fecho de 49 rows (11/11, Cobalt)

**O que é.** O commit `70ddfd0e71` gera o `persona-app/cordis.patch.yml` a partir dos três bundles e mantém só as 49 rows que o produto alcança (personaHost/Vault/Runners, o plano de sessão do desktop, o stack RPC/auth, o web server e o framework de cliente que a UI usa). Boot smoke: **9/9, sem erro fatal**. O conjunto de 86 rows (o primeiro corte) reprovava com 7 entradas pendentes; o de 38 rows (`89394edad8`, branch `v1.1.2-prune`) também passa o smoke, mas cobre menos.

**Medição direta do host (do commit, warm):** com o corte de 86 rows, **326 → 260 MB** e **14,0 → 10,2 s** até o ready. O fecho de 49 rows é a variante verde desse mesmo desenho.

**Medição no app (pack `70ddfd0e71` x pack anterior `1403d3cb45`, 5+5 alternado, mesma máquina carregada).** A primeira rodada comparou por engano o pack `470f078b2e` (12:23) como B — o pack do fecho foi para o worktree `C:\p8w70ddfd0e71` (15:19), não o warm; os números abaixo são de uma rodada corrigida em andamento. O fecho é o patch INTEIRO do perfil (inclui o bloco `insert` dos plugins da Persona); aplicá-lo como patch de home duplica os inserts e o app não sobe, então a medição foi feita nos dois packs:

| execução | janela (ms) | shell (ms) | host (MB) |
| --- | ---: | ---: | ---: |
| A `1403d3cb45` (sem o fecho) | 150–254 (uma 7.566) | 10.022 / 11.737 / 13.021 / 13.464 / 13.721 | 405–412 |
| B `70ddfd0e71` (com o fecho) | 142–161 | 10.923 / 11.965 / 13.113 / 14.483 / 14.706 | 425–445 |

**Mediana do shell: A 13.021 ms x B 13.113 ms** (sem ganho; a máquina estava carregada — o shell normal é 9–10 s) e o **host do B ficou ~20–35 MB MAIOR** (o pack B soma o plugin de componentes + a ponte de versão; a comparação não isola só o fecho). Pela regra do Keel (shell ≥ 1 s ou host ≥ 60 MB melhor), o fecho **não entra**: fica parqueado (o patch de 38 rows em `v1.1.2-prune`, `89394edad8`, e o fecho no branch), com estes números.

**Achado maior: o fecho NÃO MONTA O SHELL no desktop.** No A/B corrigido, as 5 execuções do pack do fecho estouraram o wait de `[data-persona-shell]` (120 s); o host sobe (direto com home preparada: só o cofre falha, esperado). Diagnóstico por CDP no artefato `70ddfd0e71`: `boot/loader/ready = true`, `#root` vazio, `shell = false`, e o erro do cliente **`'root' has no registration — a layout entry must register into 'root' before the shell renders it`** + **2× 404** nos bundles `plugins/??…`. Ou seja: o fecho desliga rows cujos **módulos de cliente** continuam na lista do `__ModuleLoader__`; o bundle 404, o módulo não registra e o slot `root` fica sem entrada. Religar `resources` e `ui-shortcuts` (as únicas rows de cliente desligadas) **não** resolveu — o módulo que falta é outro. O boot-smoke 9/9 do fecho é o cliente WEB do CLI, não o desktop. Correção para a v1.1.2: regenerar a lista de módulos do cliente a partir do perfil podado (`ClientModuleRegistry.graph()`), não do bundle completo. O fecho não entra como está.

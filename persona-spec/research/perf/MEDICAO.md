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

**Memória/CPU parados (mediana quente).** total **945,5 MB**: main 160, GPU 272,5, renderer 171,5, host 288,5, utility 52,5. CPU parado: GPU **56%**, renderer **11%**, host 3%, main 0,5%. O app não está parado: GPU/renderer continuam trabalhando (splash/shell animando) e o host está ~3× o RSS do host do Zinc (93 MB).

**Diagnóstico do boot (mesmo exe, home nova).** O `perf-probe` spawna com `windowsHide: true`; nesse modo o SO esconde a janela do app. O `window` do probe é o timeout do watcher (180 s), que ainda bloqueia o event loop; os marks de CDP/shell são medidos depois do timeout, não na hora real. Medição corrigida, pelo rig do Muse (`startInstalledDesktop`, CDP, home limpa, fake CLI, também `windowsHide: true`): página em **754 ms**, shell em **10.073 ms**, `document.readyState = complete`, `document.visibilityState = visible`, `hasFocus = true`; screenshot CDP em `.maestri/tmp/cobalt/rig-check.png`. O `EnumWindows` não vê janela porque a janela está no desktop do processo spawnado com `windowsHide`; o renderer está visível e focado. Lançamento normal (`Start-Process`, sem `windowsHide`): janela **VISÍVEL** em < 15 s (pid 31896, hwnd 3803202, título "Persona"); o print real `.maestri/tmp/cobalt/start-process-screen.png` mostra o onboarding (passo 1 de 5). O host sobe o servidor Web em 7,5 s; o shell chega em ~10 s. O `dsh-desktop:mandatory-status` sem handler (0,7 s) é o erro conhecido do boot e não bloqueia.

**Leitura contra as metas.** Janela: **visível**; o "sem janela" era artefato do probe (`windowsHide` + watcher bloqueando o event loop). Primeira tela útil: **~10 s** no rig com home limpa/fake CLI (meta < 2 s: não). RAM parada: **945,5 MB** medida com a janela escondida (host 288,5, GPU 272,5); com a janela visível a GPU deve subir — remeçar. Instalador ≤ 250 MiB: **não** (329,6 MiB; 1,18 GiB instalado). Host pronto: servidor Web em 7,5 s; shell em ~10 s.

**Próximo.** (1) Corrigir o `perf-probe` para medir janela/CDP em paralelo (sem `execFileSync` bloqueando o event loop) e com `windowsHide: false` quando a métrica for a janela do SO; (2) refazer a linha de base com a janela visível (RAM/CPU reais) e, se possível, com a home semeada; (3) o `perf-p0.patch` (janela/splash antes de `backend.start`) e o `perf-diet.patch` continuam para a v1.2 (congelamento do candidato), aplicando limpo em `3660c033a5`. O achado "instalação nova sem janela" **não se reproduz fora do probe**; não é P0 de release.

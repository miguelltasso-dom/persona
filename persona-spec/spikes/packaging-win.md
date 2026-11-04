# Spike — empacotamento Windows sem admin (D8 `--dir`)

## 03/11 20:16 — `--dir` relançado (Keel): SEM Persona.exe

```
node scripts/persona/with-lock.mjs "Rivet D8 --dir" -- node --import tsx/esm apps/desktop/scripts/package-win.mjs --dir
```

Junction `C:\p8` (existente) → repo. Cache `C:\p8c`. cwd = repo real (`apps/desktop`). `dirBlockers: []` (vswhere/LongPaths/Developer Mode ignorados). `packageExit` 1, `exePresent` false.

**Causa exata (não é VCTools, não é window-frame.dll):** host compiler (`tsc -b` tsconfig.host.json) na árvore suja, 57.80s, exit 2. O publish #7 verde é worktree limpo; aqui `persona-core` governança (GOV, fora do Rivet) quebra `exactOptionalPropertyTypes`:

- `packages/persona/persona-core/src/governance/health.ts` TS6133 `TWO_DAYS_MS` unused; TS2379 `HealthItem.fix`; TS2375 `TwoDayEvent.fix` (`GovernanceFix | undefined`)
- `packages/persona/persona-core/src/governance/recommend.ts` TS2379 `sectorId`; TS2322 `RoutineCharge.executorPersonaId` (`string | undefined`)

Log: `C:\p8c\dir.log`. Native addon PASS. Host Typert PASS. Host/Desktop/Client bundle SKIPPED (dependem de host-src). Sem `Persona.exe`. Probe não tem path.

Import cruzado `persona-e2e` → `apps/desktop/src/installed-cdp.ts` (TS6059/6307) da tentativa NSIS 20:48 foi corrigido: cópia em `persona-e2e/src/installed-cdp.ts`. Não reapareceu.

`--portable-installer` (= `--package`): NSIS padrão per-user, sem `window-frame.dll`, sem elevação. Visual do Setup = assistente NSIS stock (não o chrome DWM branded). A janela do app usa `titleBarOverlay` papel Muse (`#FAF3E4` / `#1E1526`). Branded NSIS continua E4 (VS C++ x86 + SDK). Também bloqueado pelo mesmo host compiler até a governança fechar.

---

## 03/11 20:10 — window-frame.dll opcional (stock NSIS)

`window-frame.dll` **deixou de ser bloqueio**. Sem VS C++ x86:

- `prepare-windows-installer.ps1` só gera BMP; omite o DLL.
- `installer-select.nsh` escolhe `installer-stock.nsh` (per-user, extract via 7-Zip/`nsExec`).
- App Windows: `titleBarStyle: 'hidden'` + `titleBarOverlay` com papel Muse (`#FAF3E4` / `#1E1526`, tinta `#34243F` / `#F6EEE0`) — `persona-spec/design/DESKTOP-CHROME.md`. Muse não estava no canvas; tokens já publicados.
- Upstream `deepseek-ai/deepseek-harness` `dsh-v0.2.2-alpha.3` (MIT): **não** publica `window-frame.dll` avulso. Sem hash. Sem download.

`--package` agora dispara NSIS unsigned (não sai 2). `--nsis-stop` só documenta o fallback (exit 0).

Ainda admin/toolchain se quiser depois: VS C++ (chrome branded), LongPaths (workaround `C:\pb`), Developer Mode, Authenticode, node-gyp do addon nativo.

---

## 03/11 19:57 — Instalador sem admin: PARADA honesta (NSIS branded)

Tentativa de `Persona-Setup.exe` **sem** admin do Miguel:

| Mitigação | Estado |
|---|---|
| Raiz curta `C:\pb` (junction; fallback `C:\p8`) | pronta — contorna LongPathsEnabled=0 |
| Cache `C:\pbc` | pronta |
| Addon nativo reutilizado se `.node` existir | probe `findNativeAddonPrebuild` |
| electron-builder unsigned / `CSC_IDENTITY_AUTO_DISCOVERY=false` / sem winCodeSign | já no `--unsigned` |
| NSIS per-user (`perMachine: false`, `allowElevation: false`, `packElevateHelper: false`) | no `electron-builder-config.mjs` |
| `installer.nsh` já recusa all-users / HKLM | ok |

**Parada (exige admin E4):** o NSIS *branded* inclui `apps/desktop/installer/window-frame.cpp` → `window-frame.dll`. Não há prebuild no repo. Compilar precisa de vswhere + VC.Tools + Windows SDK (x86). Sem isso o electron-builder NSIS custom **não** gera `Persona-Setup.exe`. `--package` / `--nsis-stop` sai 2 e imprime o motivo. Não instalei nada.

`--dir` (unpacked `Persona.exe`) **não** precisa do DLL; ainda depende do host compiler (Anvil/Forge) + lock longa. Não relancei o `--dir` nesta rodada.

Updates: feed GitHub do fork (`miguelltasso-dom/persona`) + `latest.yml` testado contra HTTP local. Nada publicado.

Probe Tier 2: `installedDesktopLaunch` + `waitForInstalledCdp` em `apps/desktop/src/installed-cdp.ts` — argv/CDP para um `Persona.exe` instalado ou unpacked. [Rivet→Probe] ligar em `startDesktop` quando houver exe.

---


Data: 2026-11-03. Rivet. Sem instalador NSIS, sem assinatura, sem `pnpm install`.

## Identidade sem toolchain (03/11 19:08)

`node --import tsx/esm apps/desktop/scripts/package-win.mjs --verify-identity` (e `verifyPostInstall()`): protocol `persona://`, Persona, `com.persona.app`, unsigned, sem admin. Exit 0. Não precisa de VS Build Tools. `exePresent` false até haver unpacked.

## Comando

```
node scripts/persona/with-lock.mjs "Rivet D8 --dir" -- node --import tsx/esm apps/desktop/scripts/package-win.mjs --dir
```

`--dir` **não** trata vswhere / LongPathsEnabled / Developer Mode como bloqueio (`dirBlockers: []`). Só exige disco, Node ≥24.9, Electron presente e `node:sqlite` no Electron. `package-target.ts` recebe `skipWindowsInstaller` quando `unsigned && directory`.

Caminho curto: junction `C:\p8` → repo (contorna LongPathsEnabled=0). Cache: `C:\p8c` (`DSH_DESKTOP_PACKAGE_CACHE_DIR`). Log: `C:\p8c\dir.log`.

`package-target.ts` exige `npm_execpath` (`runPnpm`). O launcher agora chama o `pnpm.cjs` do workspace (`node_modules/pnpm/bin/pnpm.cjs`) e injeta `npm_execpath`.

## O que NÃO precisa de VS Build Tools

| Peça | Por quê |
|---|---|
| `node:sqlite` | builtin no Electron/Node 24 (`DatabaseSync` — probe OK nesta máquina) |
| `@cursor/sdk` | JavaScript; sem node-gyp |
| Electron pré-instalado | binário já em `apps/desktop/node_modules/electron` |
| `--dir` (pasta desempacotada) | sem NSIS / `window-frame.dll` |
| gate `native addon` | **PASS 3.09s** nesta máquina (artefato já presente; sem node-gyp nesta corrida) |

## O que FALHA sem VS Build Tools (ainda não exercitado)

| Peça | Sintoma esperado |
|---|---|
| `@deepseek-ai/node-addon-system` / rebuild | `pnpm run build:native-system` + node-gyp. Sem `vswhere`/VCTools: node-gyp / MSB8020. **Não ocorreu** nesta corrida — o gate usou o addon já compilado. |
| NSIS / `window-frame.dll` | só o instalador final — **fora** deste `--dir`. Continua dependente do admin do Miguel. |

## Tentativa 1 (junction como cwd) — falsa

`package-target.ts` só executa `main()` se `import.meta.filename === resolve(process.argv[1])`. Rodar de `C:\p8\apps\desktop` fez o script **sair 0 sem empacotar**. Corrigido: cwd = caminho real do repo.

## Tentativa 2 — vswhere (antes do skip)

`packageExit` 1, `exePresent` false. Falha em `requireDesktopToolchain` → `vswhere.exe ENOENT`. Não chegou ao `pack()`.

## Tentativa 3 — skip vswhere, `node` direto

`toolchain` passou. `runPnpm` recusou: `desktop package: invoke this script through a pnpm package command`.

## Tentativa 4 — `pnpm.cmd` sem PATH do npm

`packageExit` null, `tail` vazio (`spawnSync` ENOENT).

## Tentativa 5 — `pnpm.cjs` do workspace (evidência)

`toolchain` **success 230ms** (sem vswhere). `run build --profile local`:

- `run-gates: PASS native addon (3.09s)`
- `run-gates: PASS Host Typert (70.65s)`
- `run-gates: FAILED host compiler (18.23s)` — erros em `persona-host` (`export-md.ts` TS6133, `index.ts` TS2379, `orchestration.ts` TS2304 `runner`, `runner.ts` contrato Runner) e `persona-e2e` (`capture.ts` TS2304 `Page`). **Não é VCTools.**
- Host/Desktop/Client bundle e `electron-builder` **nem rodaram** (`SKIPPED`, dependência `host-src`).
- `exePresent` false. Gate de boot empacotado **não** rodou. Probe: só se aparecer `Persona.exe`.

Registro: `apps/desktop/.desktop-build/packaging-runs/2026-11-03T20-02-02.808Z-C8iAqZ`.

## Instalador final

NSIS + assinatura + Developer Mode + LongPaths continuam no `--check` (exit 2). Frase `miguel` no JSON. Sem "Atlas" no relatório.

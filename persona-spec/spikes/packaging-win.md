# Spike — empacotamento Windows sem admin (D8 `--dir`)

Data: 2026-11-03. Rivet. Sem instalador NSIS, sem assinatura, sem `pnpm install`.

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

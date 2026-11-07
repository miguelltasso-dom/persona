# Empacotar o Persona no Windows (pack incremental, verificação e instalador)

Quem usa: quem corta uma versão (Keel, Rivet). Tudo roda da raiz do repositório, com `node`. O pack **nunca** lê a árvore suja: ele empacota um **commit**
num worktree próprio (`C:\p8w<10 hex>`), com a trava `pack` (exclusiva) e os caches em `C:\p8c`.

## 1. Fluxo de um corte

```
# 1) o pack: monta o win-unpacked (--dir) a partir do commit do candidato
node scripts/persona/package-clean.mjs --commit <sha40> --dir --warm-from C:\p8wbc28dac5c2 --warm-strict [--low-priority]

# 2) depois do --dir: verificador, instalador (NSIS) e as aceitações do exe, com uma linha do tempo
node scripts/persona/pack-after-dir.mjs <sha40> --go <hora-iso-do-GO> --turn [--priority]
```

`pack-after-dir.mjs` faz, nesta ordem: **verificador** (`apps/desktop/scripts/verify-persona-package.mjs --vault --light-only`: ENG-1 + `sharp` + boot claro
+ cofre; gera o `proof.json`) → em paralelo **NSIS** (`package-clean.mjs --resume --proof`, com o teste de instalar/desinstalar) e as aceitações do exe:
`sharp`, `mingit` (SW-4/5), `ht89` do Tally (ISO-7), `validate-exe --turn` (BUG-QUIT-1: Sair ≤ 5 s, com turno de CLI em voo) e o **laço do cofre**
(INST-2, 20 lançamentos). Saída: `.maestri/tmp/rivet-cut/<sha10>/` (um `.log` por passo + `timeline.json` com GO→win-unpacked e GO→Setup + o sha256 do Setup).

## 2. Partida quente (`--warm-from`)

Avança um worktree de pack **antigo** no lugar (`git checkout -f --detach <sha>`), sem `git worktree add` nem `pnpm install`, e o `tsc -b` só refaz o que mudou.
`scripts/persona/package-clean-warm.mjs` só deixa quando **todas** forem verdade (senão cai para o pack limpo, ou **para** com `--warm-strict`):

- o caminho é um worktree de pack (`C:\p8w` + 10 hex), registrado no repositório, destacado e sem trava;
- **nenhum processo roda de dentro dele** (uma linha de comando que só *cita* a pasta não conta);
- há um marcador `pack-warm.json` (no git dir do worktree) de um `--dir` que **terminou** ali — para um pack anterior ao marcador:
  `node scripts/persona/package-clean-warm.mjs mark <worktree>`;
- entre o commit do marcador e o alvo **nenhum** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile` ou `patches/` mudou.

Nunca mova (`git worktree move`) um worktree de pack: as junctions do pnpm guardam caminho absoluto. Tempos medidos no H2 #4 (limpo): worktree+install 3,3 min,
build (10 gates) 14,2, `prepare:runtime` 5,2, `prepare:dsh` 9,8, `electron-builder --dir` 5,6, verificador 2–3, NSIS 8,3 ⇒ ≈ 50 min do GO ao Setup; no quente
o `tsc -b` do host cai de 240 s para ~12 s e o install some (estimativa em prioridade normal e máquina quieta: GO→win-unpacked ≈ 29 min, GO→Setup ≈ 40 min).

## 3. Sinal antecipado de tipos (sem empacotar)

```
node scripts/persona/warm-delta-check.mjs --sha <sha40 de um backup>   # preferido: o mesmo checkout guardado do pack + `pnpm run typecheck`
node scripts/persona/warm-delta-check.mjs --delta                       # sem sha: copia a árvore suja (git lento nesta máquina) e restaura no fim
```

Roda Typert, os projetos e **os dois agregados** (`tsc -p tsconfig.host.json` / `.client.json`) — o gate que mais reprova um pack (TS6307/TS2307).

## 4. Outras peças

- **Pausa sem matar**: `powershell -NoProfile -File scripts/persona/pack-hold.ps1 -Log <saida do pack> -Commit <sha12> -HoldAt 'prepare-dsh\.ts'` suspende a
  árvore do pack numa linha do log e devolve por arquivo (`C:\p8c\pack-hold.release`) ou em 17 min (o guarda de 20 min sem saída do pack mataria depois).
- **Exe em prioridade baixa**: `--low-priority` põe a árvore inteira do pack em BELOW_NORMAL (filhos herdam).
- **Tempos por passo** de qualquer pack: `apps/desktop/.desktop-build/packaging-runs/<run>/events.jsonl` (`stage-start`/`stage-end` por `stageId`).

## 5. Armadilhas já pagas

- Rode `package-clean.mjs` como **job de fundo do harness** (não desacoplado por WMI): um pack lançado por `Invoke-CimMethod Win32_Process Create` morreu em ~70 s
  sem causa achada.
- `scripts/**/*.ts` e `packages/*/*/tests/**` fazem parte do **agregado do host**: uma ferramenta `.ts` em `scripts/` que importe arquivo do client ou o
  `playwright` reprova o pack (mantenha ferramentas em `.mjs`).
- O `tsc -b` confia em **mtime** e o `CopyFile` do Windows preserva o mtime: arquivos copiados para um worktree quente precisam de carimbo de "agora".
- O `PowerShell` `[ordered]@{}` lê chave inteira como **posição**; a listagem de processos do PowerShell pode trazer **caractere de controle cru** na linha de
  comando de outro agente — sempre sanitizar antes do `JSON.parse` (`parseProcessListing`).
- O Windows pode avisar que o instalador não é assinado (SmartScreen): o pack é `--unsigned` por enquanto (está nos limites das notas da versão).

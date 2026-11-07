# SW-4 / SW-5 — rascunho invisível no Windows real (S2/S3 do Probe)

Dono (desde 04/11 19:03, passagem do Rivet a pedido do Atlas): **Forge**. Rivet mantém `apps/desktop/src/main.ts`, `persona-runners/src/resolve/{resolve-runner,quota-recheck,real-turn-cap,usage-meter}.ts`, `src/oar/session.ts`, `src/index.ts` e `scripts/persona/package-clean*`. Estado (04/11 19:35): **G1 e G2 FECHADAS no host; S2/S3 provados pelo host real** (abaixo). Falta só G3, a validação no instalado (H2). Plano e lacunas originais ficam abaixo como registro.

## Resultado (04/11 19:35) — o que mudou e a prova

| Mudança | Arquivo |
| --- | --- |
| **G1:** o host passa a usar as travas do Windows (`createWindowsHistoryFileOps`) no rascunho de pastas comuns; `HostReviewOptions.fileOps` permite injetar (teste) | `persona-host/src/review.ts` |
| **Defeito achado pela prova:** a cópia do rascunho trocava a mensagem acionável do Windows (“Abra o OneDrive e marque… Sempre manter neste dispositivo”, “Feche “x.xlsx”…”) por uma frase genérica, guardando a boa só como `cause`. Agora um `HistoryReviewError` vindo da camada de arquivos passa intacto | `persona-engine/src/review/history-files.ts` + `tests/history-copy-errors.spec.ts` (2) |
| **G2:** prova pelo host real | `persona-host/tests/sw-windows-draft.spec.ts` (5) |

`sw-windows-draft.spec.ts` (host real, pasta sem `.git`, 5/5 nesta máquina Windows 11):
- **S2:** PATH só com System32 + MinGit 2.56.0.4 extraído do cache (`C:/p8c`, o teste PULA com motivo se o zip não existir) → `resolveGitExecutable` = `bundled`; o worker roda em `ticket.execution.directory` = o RASCUNHO (dentro de `<PERSONA_HOME>/worktrees/pp`, nunca na pasta), a pasta fica intocada até o Aplicar; `reviewSummary` lista o arquivo; Aplicar → `merged` com ponto de restauração; Desfazer → `restored`; a pasta nunca ganha `.git`.
- **S3a (preparar):** planilha com handle exclusivo real (`FileShare.None`, o que o Excel faz) → “Feche “precos.xlsx”…”, nenhum rascunho fica pela metade, e funciona depois de soltar.
- **S3a (aplicar):** planilha aberta DURANTE o Aplicar → não devolve `merged`, mensagem “Feche “precos.xlsx”…”, `cardapio.txt` não fica pela metade, depois de soltar o Aplicar funciona e o Desfazer devolve os dois arquivos.
- **S3b:** caminho com mais de 300 caracteres (6 pastas): rascunho, Aplicar e Desfazer funcionam (git do histórico incluído).
- **S3c (hidratação SIMULADA; o OneDrive real só-online não é possível aqui, ver G4):** a hidratação é chamada ANTES da cópia de cada arquivo, e se ela falha a pessoa lê “Abra o OneDrive e marque “x” como “Sempre manter neste dispositivo””, sem rascunho deixado e pasta intacta.

Vizinhos verdes: `history-review` 40, `history-locked-file`, `windows-files` 3, `git-resolution`, prova viva `rivet-mingit-live.mjs` (`gitSource: bundled`). `check-pkg` persona-engine, persona-host e persona-runners OK.

**Para o Probe (S2/S3 do `mandatory-simple-workspace.spec.ts`, hoje `it.todo`):** no harness do engine passe `createReviewDelivery({ …, git: <MinGit extraído>, fileOps: createWindowsHistoryFileOps({ cloudRoots, hydrationTimeoutMs }, io) })`; o MinGit extrai-se com `installPersonaMinGit(resources, { DSH_DESKTOP_PACKAGE_CACHE_DIR: 'C:/p8c' })` (`apps/desktop/scripts/persona-mingit.mjs`) e `PATH` só com System32; a hidratação injetável é o `io` (`hydrate`/`copy`); o travamento real é um handle `FileShare.None` (você já tem `holdExclusiveLock`). No INSTALADO, use `resources/mingit/cmd/git.exe` do `win-unpacked` do H2.

## O que já está provado hoje (04/11 19:05, nesta máquina Windows 11)

| Prova | Resultado |
| --- | --- |
| `.maestri/tmp/rivet-mingit-live.mjs` (extrai o MinGit 2.56.0.4 do cache `C:/p8c`, **PATH só com System32**, `resolveGitExecutable` → `bundled`, `HistoryReviewDelivery` prepara/aplica/desfaz numa pasta SEM `.git`) | `{"extracted":true,"gitSource":"bundled","draftIsSeparate":true,"apply":"ok","undo":"ok","projectGitDirectory":false}` |
| `git-resolution` + `windows-files` (runners) e `persona-mingit`, `persona-mingit-hook`, `persona-package-inventory` (desktop) | 5 arquivos, **24/24** |
| Engine (já meu): `HistoryReviewDelivery` + lock nativo do Windows + Aplicar/Desfazer byte a byte | `history-review` 40/40 (SW-1/2/3), S1/S4/S5 do Probe |

## Lacunas encontradas (o que impede S2/S3 de valer no produto)

1. **G1 — as travas do SW-5 não estão ligadas no host.** `createWindowsHistoryFileOps` (hidratar OneDrive antes de copiar, mensagem “Feche “planilha.xlsx” …”, caminho longo com nome `\\?\`) só é usado pela prova de Rivet; `persona-host/src/review.ts` monta `createReviewDelivery({…})` **sem `fileOps`**, então o fluxo real usa a cópia simples. Corrigir = passar `fileOps` (padrão `createWindowsHistoryFileOps()` no Windows; `HostReviewOptions` ganha `fileOps` para teste). Sem isso a OneDrive só-online falha com erro cru no Windows.
2. **G2 — nunca houve prova de ponta a ponta pelo host.** Só `HistoryReviewDelivery` isolado. Falta: host real + pasta sem `.git` + PATH sem git + `PERSONA_BUNDLED_GIT` → o worker roda em `ticket.execution.directory` = o **rascunho** (nunca a pasta do usuário), Aplicar grava na pasta com ponto de restauração, Desfazer restaura, a pasta não ganha `.git`.
3. **G3 — validação no instalado.** Depende do `win-unpacked` do H2: conferir `resources/mingit/{cmd/git.exe,ucrt64/bin/git.exe,LICENSE}` e repetir a prova viva contra ele com PATH só System32 (Rivet avisa o caminho quando existir).
4. **G4 — OneDrive e Excel sem simulação.** Esta máquina tem o OneDrive real (`C:\Users\migue\OneDrive`) com arquivos só-online do Miguel. **Decisão do Atlas (04/11 19:15): NÃO ler nem hidratar nenhum arquivo do Miguel** (dados pessoais, mesmo só para leitura). Só vale um arquivo de teste MEU em `C:/Users/migue/OneDrive/Documentos/ChatGPT/Atlas/.persona-sw5-test/`, deixado só-online e hidratado pelo fluxo do rascunho, e a pasta apagada no fim. Tentativa (04/11 19:18): criei `sw5-hidratar.txt` ali e rodei `attrib +U -P`; com o **cliente OneDrive parado nesta máquina** (`OneDrive.exe` não está rodando; iniciá-lo sincronizaria o OneDrive inteiro do Miguel, então não o iniciei) o atributo vira só `UNPINNED` (0x100000): o arquivo continua local, sem `RECALL_ON_DATA_ACCESS` (0x400000) nem reparse point. **Não foi possível ficar só-online → fica a hidratação simulada** (hidratação injetada chamada antes da cópia + mensagem acionável da nuvem), registrada aqui. A pasta de teste foi apagada (confirmado). Não houve leitura de arquivo do Miguel: só listei nomes e atributos para saber se o OneDrive tinha placeholders. Não há Excel/Word instalado; o travamento real é reproduzível com um handle exclusivo (`FileShare.None`) aberto por um processo filho, que é exatamente o que o Excel faz.

## Plano (depois do congelamento; só o que o Keel liberar)

1. `persona-host/src/review.ts` — `fileOps` no `reviewDeliveryOf` (Windows: `createWindowsHistoryFileOps({ cloudRoots })`), opção `fileOps` para teste. `check-pkg persona-host` + `persona-runners`.
2. Teste novo `persona-host/tests/sw-windows-draft.spec.ts` (host real, temp home, PATH só System32):
   - **S2:** pasta sem `.git`, MinGit extraído do cache (pula com motivo claro se `C:/p8c` não existir) → worker no rascunho; Aplicar; Desfazer; pasta sem `.git`.
   - **S3a:** arquivo travado por handle exclusivo no Aplicar → resposta `blocked`/erro tipado com “Feche “x.xlsx”…”, pasta intacta, nada pela metade; tentar de novo depois de soltar funciona.
   - **S3b:** caminho > 260 caracteres de verdade no rascunho e na pasta.
   - **S3c:** hidratação injetada (placeholder simulado) chamada ANTES da cópia, e a mensagem de nuvem quando a hidratação falha (o OneDrive real só-online não é possível aqui: ver G4).
3. Prova viva: `rivet-mingit-live.mjs` contra o `win-unpacked` do H2 (G3).
4. Chamar o Probe para S2/S3 com os comandos e o caminho do instalado.

## Perguntas em aberto

Nenhuma. A validação de OneDrive só-online real fica para uma máquina com o cliente OneDrive rodando (ou para o Miguel no instalado), com arquivo de teste próprio; nesta máquina vale a simulação registrada em G4.

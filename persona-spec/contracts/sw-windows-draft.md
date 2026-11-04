# SW-4 / SW-5 — rascunho invisível no Windows real (S2/S3 do Probe)

Dono (desde 04/11 19:03, passagem do Rivet a pedido do Atlas): **Forge**. Rivet mantém `apps/desktop/src/main.ts`, `persona-runners/src/resolve/{resolve-runner,quota-recheck,real-turn-cap,usage-meter}.ts`, `src/oar/session.ts`, `src/index.ts` e `scripts/persona/package-clean*`. Estado: **levantamento e plano** (congelamento D-082); nenhuma linha de código mudou.

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
4. **G4 — OneDrive e Excel sem simulação.** Esta máquina TEM o OneDrive real (`C:\Users\migue\OneDrive`) com arquivos só-online (atributo `RECALL_ON_DATA_ACCESS` 0x400000: `Pasta de trabalho.xlsx` etc.). Hidratar um deles é a prova real de SW-5, mas lê e baixa um arquivo pessoal do Miguel → **pedi licença ao Atlas** antes de tocar. Não há Excel/Word instalado; o travamento real é reproduzível com um handle exclusivo (`FileShare.None`) aberto por um processo filho, que é exatamente o que o Excel faz.

## Plano (depois do congelamento; só o que o Keel liberar)

1. `persona-host/src/review.ts` — `fileOps` no `reviewDeliveryOf` (Windows: `createWindowsHistoryFileOps({ cloudRoots })`), opção `fileOps` para teste. `check-pkg persona-host` + `persona-runners`.
2. Teste novo `persona-host/tests/sw-windows-draft.spec.ts` (host real, temp home, PATH só System32):
   - **S2:** pasta sem `.git`, MinGit extraído do cache (pula com motivo claro se `C:/p8c` não existir) → worker no rascunho; Aplicar; Desfazer; pasta sem `.git`.
   - **S3a:** arquivo travado por handle exclusivo no Aplicar → resposta `blocked`/erro tipado com “Feche “x.xlsx”…”, pasta intacta, nada pela metade; tentar de novo depois de soltar funciona.
   - **S3b:** caminho > 260 caracteres de verdade no rascunho e na pasta.
   - **S3c:** hidratação injetada (placeholder simulado) chamada ANTES da cópia; e, se o Atlas autorizar, 1 arquivo pequeno do OneDrive real (leitura, cópia para o temp, nada modificado).
3. Prova viva: `rivet-mingit-live.mjs` contra o `win-unpacked` do H2 (G3).
4. Chamar o Probe para S2/S3 com os comandos e o caminho do instalado.

## Perguntas em aberto

- Atlas: posso hidratar (ler) 1 arquivo pequeno do OneDrive real do Miguel só para a prova de SW-5? (Não modifica nada; a cópia fica no temp e é apagada; o arquivo continua no OneDrive.)

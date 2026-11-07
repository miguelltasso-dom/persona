# Ctrl K sobreposto (v1.2) — 1 página

**Dono:** Lumen (código) · **Texto/visual:** Muse (perguntar DEPOIS da v1.1) · **Flag:** `persona.flag.cmdKOverlay`, padrão **desligado** (v1.2; fora das capturas da v1.1).

## Hoje
`Ctrl/Cmd+K` (e o botão "Buscar em tudo…") faz `selectPanel('search')`: **troca a tela inteira** pela tela Buscar (`shell/SearchPlaceholderView.tsx`: campo, "Ir para", "Equipe", ações, resultados de conteúdo do host). A pessoa perde o lugar onde estava (um quadro, uma conversa) e precisa voltar à mão.

## O que muda
Com a flag ligada, `Ctrl/Cmd+K` abre uma **janela sobre a tela atual** (diálogo modal, centrada no alto) e a tela de baixo **não muda**. `Esc` (ou `Ctrl/Cmd+K` de novo) fecha e devolve o foco ao elemento que o tinha. Escolher "Ir para…" fecha a janela e navega; escolher uma ação executa e fecha. Com a flag desligada nada muda (continua `selectPanel('search')`).

## O que a janela mostra (o mesmo modelo da busca, sem inventar)
1. **Campo** de busca com foco ao abrir; sem acento e sem diferença de maiúscula (`foldForSearch`).
2. **Ir para** — os lugares e telas do trilho (`nav-places.ts`/`NAV_GROUPS`), mesmo os dobrados; vazio de texto = os 6 lugares.
3. **Equipe** — as personas (abrir perfil, conversar).
4. **Ações** — as `SearchAction` já registradas ("Contratar persona", "Simular os 2 dias", "Conversar com {nome}").
5. **Ver todos os resultados** — leva à tela Buscar (é lá que ficam as mensagens/tarefas/arquivos do host; a janela não carrega conteúdo na v1.2.0).
Sem resultado: "Nada com “{texto}”" + a saída "Ver todos os resultados".

## Teclado e leitor de tela
`↓/↑` movem, `Enter` executa o item marcado (o 1º já vem marcado), `Home/End`, `Esc` fecha, `Tab` não sai da janela. Semântica: `role="dialog"` + `aria-modal`, campo `role="combobox"` + lista `role="listbox"` com `aria-activedescendant`; o número de resultados é anunciado (`role="status"`). Não abre por cima de outro diálogo aberto. Movimento reduzido: só fade de 100 ms.

## Como entra no código (aditivo, atrás da flag)
`shell/cmdk-overlay/`: `cmdk-flag.ts` (leitor da flag, via `flags.ts`), `cmdk-model.ts` (puro: monta e filtra as seções), `CmdKOverlay.tsx` (+ `.module.css`, só tokens `--persona-*`), `install-cmdk-overlay.ts` (atalho em fase de captura; só se a flag estiver ligada e `preventDefault` só então). **Uma** linha de registro em `mount.ts`; nenhum arquivo existente é reescrito. Testes: modelo (filtro/ordem/vazio), atalho (flag desligada não captura), teclado e foco (abre, ↓/Enter, Esc devolve o foco), axe.

## Perguntas para o Muse (depois da v1.1)
Texto do campo e do vazio; "Ver todos os resultados" ou outro; ícones das seções; largura (proposta 560 px) e posição (12 vh do topo); mostrar o atalho (`Ctrl K`) na dica do campo.

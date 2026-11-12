VEREDITO: AJUSTES

1. **`light-1440-geral-rolado.png`, `dark-1440-geral-rolado.png`, `light-zoom200-geral-rolado.png` e `dark-zoom200-geral-rolado.png` (`#01`)**
   - **Problema:** (a) A 1ª mensagem do fio (`Luna · Vigia`) fica guilhotinada/encoberta pela borda inferior da Barra Compacta de `56px` (a `200%`, o avatar da Luna aparece cortado ao meio atrás da barra). (b) `Mostrar a equipe` fica colado aos rostos à esquerda deixando ~70% da barra vazia à direita, falta o filete inferior de `3px` em `--persona-scene-hill-near`, e os anéis `.presence` dos avatares `36px` quase colidem entre si.
   - **Correção:** (a) Garantir que o container rolável das mensagens comece **abaixo** da Barra Compacta com `margin-top: var(--persona-space-2)` (`8px`, nunca rolando por trás da barra) + `mask-image: linear-gradient(to bottom, transparent 0, black 12px)` no topo quando rolado. (b) Alinhar `Mostrar a equipe` à direita (`margin-left: auto`, `DESIGN-01 §3 #01`), aplicar `box-shadow: inset 0 -3px 0 0 var(--persona-scene-hill-near)` na barra compacta e usar `gap: var(--persona-space-2)` (`8px`) entre os retratos `36px`.

2. **`light-zoom200-geral-topo.png`, `dark-zoom200-geral-topo.png`, `light-zoom200-dm.png` e `dark-zoom200-dm.png` (Área de conversa zerada a `200%`)**
   - **Problema:** A `200%` (`640×360`), no `#geral` a faixa aberta de `264px` é cortada pelo composer e deixa **`0px` visíveis para o fio**; na DM, o cabeçalho alto (`Avatar 64px`) + barra `Geral ⋯ +` + composer escondem 100% do estado vazio/mensagens.
   - **Correção:** Em janelas baixas (`@media (max-height: 540px)` ou quando sobrarem `< 140px` para a lista de mensagens), recolher automaticamente a faixa para `56px` (`DESIGN-01-MUSE §1 Cena 02(a)`: *"quando o fio precisa do espaço"*), e compactar o cabeçalho da conversa (`Avatar` `40px`, `padding-block: 6px`) e a barra de assuntos (`padding-block: 4px`) a `200%`.

3. **`light-1440-dm.png`, `dark-1440-dm.png`, `light-zoom200-dm.png` e `dark-zoom200-dm.png` (`#06`)**
   - **Problema:** (a) O placeholder da DM privada diz **`"Mensagem em Geral para Atlas..."`**, confundindo o assunto inicial com o canal público `#geral`. (b) A pílula à direita exibe apenas `Haiku ⌄` (sem esforço/motor padronizado com `#03`).
   - **Correção:** (a) No assunto padrão da DM, exibir **`"Mensagem para {nome}…"`** (sem `"em Geral"`). (b) Padronizar o texto da pílula com o formato `Modelo · Esforço` (ou `Claude · Haiku ⌄` quando no esforço padrão).

4. **`light-1440-paleta.png`, `dark-1440-paleta.png`, `light-zoom200-paleta.png` e `dark-zoom200-paleta.png` (`#11`)**
   - **Problema:** (a) Em `1440x900`, o subtítulo **`IR PARA`** aparece órfão na borda inferior do modal sem nenhum item abaixo dele (os 4 cartões altos de `FAZER AGORA` em 3 colunas deixam `Ver novidades [4]` sozinho numa 2ª fileira alta) e sem máscara de rolagem inferior. (b) `Abrir a ajuda [3]` e `Ver novidades [4]` repetem o mesmo ícone de livro.
   - **Correção:** (a) Organizar `FAZER AGORA` em grade `2×2` de altura enxuta (`min-height: 40px; padding: 6px 12px`, sem quebra em 2 linhas) para revelar as primeiras linhas de `IR PARA` na abertura em `1440x900`, com `mask-image` inferior de `20px` quando houver overflow. (b) Usar ícone próprio em `Ver novidades` (`sparkles`), distinto de `Abrir a ajuda`.

5. **`dark-1440-*.png` e `light-1440-*.png` (Rodapé do rail + `960px`)**
   - **Problema:** (a) Nas 4 capturas `dark-1440-*.png`, `.hostStatusButton` (`PersonaSidebar.module.css:558`) continua branco (`--persona-cream-50`) no tema escuro e exibe o travessão proibido **`Claude · —`** (`DESIGN-01-MUSE §1.0 #2`). (b) No rail aberto em `1440`, `Configurações`, luminária e `?` ainda têm vão largo em vez dos 3 alvos de `40px` com `gap: 8px` (`DESIGN-01-MUSE §1.0 #4`). (c) Faltam capturas em `960px`.
   - **Correção:** (a) Estilizar `.hostStatus` / `.hostStatusButton` no escuro com `background: var(--persona-card); color: var(--persona-ink); border-color: var(--persona-outline-control)` e trocar o fallback `—` por `pronto` (`Claude · pronto`). (b) Fechar a fileira única de `40px` de altura com `gap: var(--persona-space-2)` (`8px`). (c) Incluir capturas em `960px` na reentrega.

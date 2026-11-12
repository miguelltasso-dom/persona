VEREDITO: AJUSTES

1. **`settings-3-sobre-light-960x640.png` e `settings-3-sobre-dark-960x640.png`**
   - **Problema:** `<AboutPersona inline>` continua centralizado com `560px` de largura e ~`130px` de degrau torto em relação ao `ScreenHeader`. Em `About.module.css`, `.inline` (linhas 4–8) foi declarado **antes** de `.about` (linhas 10–22) com a mesma especificidade `(0,1,0)`, então `.about` sobrescreve `max-width`, `margin` e `box-shadow`.
   - **Correção:** Mover a regra para **depois** de `.about` como `.about.inline { max-width: none; margin: 0; box-shadow: var(--persona-shadow-sticker); }`.

2. **`membros-1-membros-light-1440x900.png` e `membros-1-membros-dark-1440x900.png` (Cena 20 / `#20`)**
   - **Problema:** (a) O cabeçalho renderiza o botão primário âmbar `Convidar por link` ativo enquanto o cartão `Equipe remota` embaixo está desconectado e exibe o erro `⚠ Cofre indisponível`, contrariando `DESIGN-01-MUSE §1 Cena 20` (*"Sem equipe remota, um estado calmo ilustrado; o `Convidar por link` só aparece com a remota ligada"*). (b) No cartão `Você`, `Dono` e `Ativo` saem como 2 chips numa 3ª linha abaixo de `Neste computador`, quando `DESIGN-01-MUSE §5.2 #20` especifica **`Dono · Neste computador`**.
   - **Correção:** (a) Suprimir `Convidar por link` enquanto a equipe remota não estiver ligada e usar em `Membros` o mesmo estado calmo (`Ainda não ligada`, sem `⚠ Cofre indisponível` quando desconectada) já aplicado em `settings-1b-equipe-distancia`. (b) Para `member.isSelf === true`, exibir `Dono · Neste computador` direto no subtítulo e remover a fileira redundante de chips `Dono` / `Ativo`.

3. **`personas-1-panel-light/dark-1440x900.png` e `personas-1b-open-light/dark-1440x900.png` (Cena 16)**
   - **Problema:** Há dois chevrons `⌄` seguidos no fim de cada linha (`Sugere e espera ⌄` e `[Claude · Haiku] ⌄`), sendo que o chevron de `engineChipButton` fica **fora** da pílula `<Chip>` na extrema direita da linha — parecendo ser o chevron do acordeão da persona e levando a abrir `Trocar motor` por engano ao tentar expandir a linha.
   - **Correção:** Em `PersonasSettingsPanel.tsx`, colocar `.chipChevron` **dentro** do `<Chip>` (`[Claude · Haiku ▾]` / `[Claude · Haiku · medium ▾]`) e posicionar o `.chevron` do acordeão sem ambiguidade (sem chevron colado em `Sugere e espera`, ou na extrema direita após a pílula / à esquerda da identidade).

4. **Pasta `.maestri/tmp/carbon-lotes/quill-final` (Comprovação visual nos viewports onde a regra muda)**
   - **Problema:** A nova miniatura `width: 100%; aspect-ratio: 16 / 9` de `Aparência` só ativa acima de `1024px`, mas `settings-2-aparencia` veio apenas em `960x640` (caindo no fallback `120×72px`, sem foto da grade `16:9` em `1440x900`); e `Personas` veio apenas em `1440x900` (sem `960x640` nem `zoom200`).
   - **Correção:** Na reentrega, incluir `settings-2-aparencia` e `settings-3-sobre` em `1440x900` (claro/escuro) e `personas-1-panel` / `personas-1b-open` em `960x640` e `zoom200`.

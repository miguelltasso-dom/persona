VEREDITO: AJUSTES

1. **`hold-meio-light/dark-{100,960,200}.png`**
   - **Problema:** Em `HoldToApproveButton.module.css:22`, `.hold::before` combina `border-radius: inherit` com `transform: scaleX(...)`. Em ~41% de enchimento, o raio horizontal deformado abre frestas nos cantos esquerdos e desenha uma borda direita curva no meio da palavra `"Segure"`, parecendo uma pílula menor dentro do botão em vez de barra de enchimento.
   - **Correção:** Trocar `border-radius: inherit` por `border-radius: 0` em `.hold::before` (o próprio `.hold` já tem `overflow: hidden` e recorta os cantos arredondados sem deformação, deixando a frente de progresso reta e nítida).

2. **`vencido-light/dark-{100,960,200}.png`**
   - **Problema:** (a) Mesmo vencido (`Passou do prazo · Nina não enviou`), o `<Card>` mantém `tone="accent"` com a barra vertical âmbar acesa à esquerda, contradizendo o estado encerrado/só-leitura (`COLHEITA-MUSE §5` linha 47). (b) `Pedir de novo` sem contorno, fundo nem ícone lê-se como texto estático solto. (c) Em `vencido-light-200.png` e `vencido-dark-200.png`, uma faixa opaca no topo corta ao meio o retrato da Nina e o título `"Enviar um email pelo Gmail"`.
   - **Correção:** (a) Em `ActionPreviewCard.tsx`, usar `tone={expired ? 'default' : 'accent'}` (e `border-color: var(--persona-outline-soft)` em `.expiredCard`). (b) Dar affordance clara de botão `32px` (`--control-h-s`) a `Pedir de novo` (ícone `refresh`/seta + `background: var(--persona-wash)` ou contorno leve). (c) Corrigir o enquadramento/sticky header a `200%` para não cobrir o cabeçalho da decisão.

3. **`pagina-light/dark-{960,200}.png`, `hold-meio-*-200.png` e `dica-*-200.png`**
   - **Problema:** (a) No rail recolhido (`64px`), a pílula âmbar de contagem (`2`) sobrepõe o centro do botão de `Aprovações`, tampando quase todo o ícone. (b) Em `pagina-light-960.png`, o retângulo lilás do painel direito saiu vazio (sem a ilustração da capivara visível em `pagina-dark-960.png`).
   - **Correção:** (a) No rail recolhido (`[data-collapsed]`), ancorar o contador no canto superior direito do botão `40×40px` (`position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px`) sem cobrir o glifo. (b) Garantir decode completo da ilustração antes de fotografar `pagina-light-960`.

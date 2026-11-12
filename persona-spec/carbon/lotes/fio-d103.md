VEREDITO: AJUSTES

1. **`fio-b-art-raster-light-1440x900.png`, `fio-b-art-raster-dark-1440x900.png`, `fio-d-delivery-raster-light-1440x900.png` e `fio-d-delivery-raster-dark-1440x900.png`**
   - **Problema:** Nas variantes raster, a arte (`192px` natural) fica solta no meio de uma caixa fixa bem maior (`width: 320px; min-height: 160px` em `.hero` e `width: min(240px, 100%); min-height: 160px` em `.delivery`), criando letterbox artificial escuro (`#18111f`) no tema noturno e bege-acinzentado no claro ("caixa dentro de caixa"), ausente na variante `vector`.
   - **Correção:** Em `DraftFileThumb.module.css`, usar `width: fit-content; max-width: min(320px, 100%)` em `.hero[data-thumb='raster']` e `width: fit-content; max-width: min(240px, 100%)` em `.delivery[data-thumb='raster']`, removendo `min-height: 160px` para que a moldura de `1.5px` abrace o tamanho real da imagem.

2. **`fio-a-pill-light-1440x900.png` e `fio-a-pill-dark-1440x900.png`**
   - **Problema:** A pílula recolhida (`Téo ouviu Bia e Lia · 2 ajustes`) usa `.pill { border-radius: var(--persona-radius-m); background: var(--persona-wash) }` dentro de um `<Card>` com `border-radius: var(--persona-radius-l)` e `background: var(--persona-card)`, deixando vazar lascas claras/escuras nos 4 cantos internos.
   - **Correção:** Em `OpinionBlock.module.css`, aplicar `background: var(--persona-wash)` direto no `.card[data-collapsed]` (ou `border-radius: calc(var(--persona-radius-l) - var(--persona-border-width))` em `.pill` com padding `0` no card pai) para eliminar a fresta nos cantos.

3. **`fio-b-reference-open-light-1440x900.png` e `fio-b-reference-open-dark-1440x900.png`**
   - **Problema:** O botão `.referenceChip` (`Referência do pedido`) é idêntico nos estados fechado e aberto, sem indicar que expande/recolhe. No escuro (`fio-b-reference-open-dark`), a miniatura `96px` exibe um aro lilás-claro grosso destoante da arte acima.
   - **Correção:** Adicionar `<UiIcon name="chevronDown" size={12} />` em `.referenceChip` (rotacionando `180deg` em `var(--motion-fast) var(--ease-standard)` quando `aria-expanded='true'`) e aplicar `border-color: var(--persona-outline-control); background: var(--persona-wash); color: var(--persona-ink)` no estado aberto. Padronizar a borda de `.imageButton` da referência no escuro em `1.5px solid var(--persona-outline-control)`.

4. **`fio-d-delivery-raster-light/dark-1440x900.png` e `fio-d-delivery-vector-light/dark-1440x900.png` (e `fio-a-pill-open-dark-1440x900.png`)**
   - **Problema:** Quando há arte (`240px`), o `DeliveryCard` empilha miniatura, partes e ações à esquerda e deixa ~65% da largura do cartão vazia à direita. Além disso, no escuro, o avatar `24px` do Téo (preto e branco sobre `--persona-wash: #2e2140` com borda `#120c18`) perde contorno.
   - **Correção:** Em `DeliveryCard.module.css`, quando `art !== undefined` em larguras `>= 600px`, alinhar o miolo em 2 colunas (`display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--persona-space-5); align-items: center`: miniatura `240px` à esquerda e `.parts` + `.footer` à direita). Nos retratos de persona no escuro, aplicar `border-color: var(--persona-outline-control)` (ou o fundo `--persona-subject-{0..6}-tint` da ordem de contratação, contraste `>= 3:1`).

5. **`fio-e-composer-dm-light/dark-1440x900.png` e `fio-e-composer-geral-picked-light/dark-1440x900.png`**
   - **Problema:** A pílula `.enginePill` (`Sonnet · high`) não traz chevron `▾` e usa tinta apagada (`--persona-ink-soft`), parecendo selo estático ao lado de `Quem responde Nina ⌄`. Nas capturas da DM (`fio-e-composer-dm-*`), o placeholder diz `"Escreva uma mensagem em #geral..."` em vez da conversa direta.
   - **Correção:** Em `ChannelComposer.tsx` / `ChannelComposer.module.css`, incluir `<UiIcon name="chevronDown" size={12} />` em `.enginePill` (`gap: 4px; background: var(--persona-wash); color: var(--persona-ink); border-color: var(--persona-outline-control)` no escuro, conforme `DESIGN-01 §3 #03.2`). Corrigir o placeholder da DM para citar a persona da conversa, nunca `#geral`.

6. **`fio-e-engine-dialog-light-1440x900.png` e `fio-e-engine-dialog-dark-1440x900.png`**
   - **Problema:** (a) O `.scrim` do modal aplica `backdrop-filter: blur(3px)` (`Overlays.module.css:11`), proibido pela regra de GPU (`DESIGN-01-MUSE §2.7 Regra 2`). (b) No escuro, `.modelRadio` usa `<input type="radio">` nativo sem tema escuro: os círculos **desmarcados** ficam brancos sólidos (`#ffffff`, parecendo marcados) e duplicam sinal com o `✓` à direita. (c) O composer marca `Sonnet · high`, mas o modal abre com `high` oculto abaixo do fade inferior (`medium` cortado) já em `1440×900`.
   - **Correção:** (a) Remover `backdrop-filter: blur(3px)` de `Overlays.module.css` e ajustar `--persona-scrim` em `persona-palette.css` para `rgb(36 22 48 / 0.56)` no claro e `rgb(8 4 12 / 0.72)` no escuro. (b) Em `PersonaEngineOverlay.module.css`, estilizar `.modelRadio` com `appearance: none; width: 18px; height: 18px; border-radius: 999px; border: 1.5px solid var(--persona-outline-control); background: var(--persona-paper)` (ou ocultar o círculo nativo e manter só o `✓`). (c) Exibir os níveis de `Esforço` em grade/chips compactos (ou compactar `.modelRow` para `min-height: 38px; padding: 6px 12px` + `scrollIntoView` da opção ativa) para que `Sonnet` e `high` apareçam visíveis na abertura sem rolar.

7. **`fio-f-clean-light-1440x900.png` e `fio-f-clean-dark-1440x900.png`**
   - **Problema:** Em `QueuedMessageBubble`, `Mandar agora`, `Editar` e `Tirar` usam os três `variant="ghost"` sem contorno, parecendo palavras soltas sem hierarquia entre enviar imediatamente e descartar.
   - **Correção:** Em `QueuedMessageBubble.tsx`, trocar `Mandar agora` para `Button variant="secondary" size="s"`, mantendo `Editar` e `Tirar` em `variant="ghost"`.

8. **Pasta `.maestri/tmp/carbon-lotes/fio-d103` (cobertura de viewports)**
   - **Problema:** Só vieram as capturas `1440x900`; faltam na pasta as renderizações em `960px` e `200%`.
   - **Correção:** Incluir na próxima rodada os PNGs em `960px` e `200%` ao menos para `fio-a-pill`, `fio-d-delivery-vector`, `fio-e-composer-geral-picked` e `fio-e-engine-dialog`.

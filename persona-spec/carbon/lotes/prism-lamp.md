VEREDITO: AJUSTES

1. **`dark-1440-lampada-apagada.png` (`0 ms`) vs `meio` / `metade` / `acesa`**
   - **Problema:** Em `0 ms` (`dark-1440-lampada-apagada.png`), o filamento/vidro da lanterna está apagado, mas o `.halo` de luz ao redor dela **já está 100% aceso na intensidade final** (e ainda com o recorte quadrado de `90×90px`), quebrando a física do acendimento: a parede já brilha antes de a lâmpada acender.
   - **Correção:** Sincronizar `.halo` (já corrigido para `120×120px` com `radial-gradient(closest-side, rgb(242 186 110 / 0.36) 0%, rgb(242 186 110 / 0.12) 52%, transparent 100%)` sem aresta quadrada) e a camada de luz da sala (`lampLayer` / `--persona-night-glow`) na mesma curva de `420ms var(--ease-enter)` (`opacity: 0 → 1`, `iterations: 1`, `fill-mode: forwards`), garantindo `opacity: 0` real de toda emissão luminosa em `0 ms`.

2. **Todas as 4 capturas (`dark-1440-lampada-*.png`) — Continuidade da luz do rail para o palco**
   - **Problema:** Os 4 quadros foram capturados na `Visão geral` (que não renderiza `.lampLayer` contínua a partir do rail), então o miolo da tela fica 100% inalterado entre `0 ms` e `420 ms` — não comprovando nem testando a continuidade luminosa entre o rail e o palco pedida no Momento UAU 5 (`DESIGN-01 §4 UAU 5` / `DESIGN-01-MUSE §5.3`). *(Nota: `.hostStatusButton` `Claude · 74% livre` também segue branco `--persona-cream-50` no escuro.)*
   - **Correção:** Regravar os 4 quadros (`0 ms`, `~80 ms`, `~210 ms`, `420 ms`) no **`#geral` escuro** (ou `DM` escura), comprovando visualmente o acendimento conjunto e sem salto de `lanterna + .halo + .lampLayer` partindo da escuridão em `0 ms` até a luz estática final em `420 ms`.

# BR-P6 · A arte da equipe real (v1.1, EQUIPE-REAL-SPEC)

Pedido do Atlas (05/11, 01:20): a arte que ainda falta para os cartões e linhas novos da equipe real. **Pouca e precisa.** Os cartões já se apoiam nos rostos das personas; a arte entra só onde ajuda a ler.

## 1. Ícones das linhas da equipe (ui, SVG `currentColor`, 24×24, traço 1,75, cantos redondos, o MESMO estilo de `icons/ui/citar.svg`)
Aparecem a 16 px ao lado do texto da linha e nos chips, sempre com o texto (nunca sozinhos).

| arquivo | onde | o desenho |
|---|---|---|
| `ui/passar-adiante.svg` | "{A} passou para {B}" | uma mão entregando um papel dobrado para a direita (diferente do `actions/handoff`, que é seta; aqui é gesto de mão) |
| `ui/pedir-ajuda.svg` | "{A} pediu ajuda a {B}" | uma BOIA salva-vidas (anel com 4 faixas). As duas mãos viraram elos de corrente a 16 px (amostra de 01:35) |
| `ui/ajudou.svg` | "{B} ajudou {A}" | mão com um coraçãozinho na palma |
| `ui/entregou.svg` | "{B} entregou para {A}" | uma caixinha com um laço ✓ |
| `ui/revisao.svg` | "pediu revisão / aprovou", o selo "Revisado por" | uma lupa com ✓ dentro |
| `ui/pediu-ajustes.svg` | "{R} pediu ajustes" | um lápis com um pequeno círculo de retorno (seta curva) |
| `ui/opiniao.svg` | o cartão "Pedido de opinião" | dois balões de fala sobrepostos |
| `ui/gostei.svg` · `ui/sugestao.svg` · `ui/atencao.svg` | as 3 marcas das respostas de opinião | coração · lâmpada · triângulo de aviso arredondado (só o contorno, não o ⚠ genérico) |
| `ui/caminho.svg` | o título "Caminho do trabalho" | três pontinhos ligados por uma linha que serpenteia |
| `ui/bom-dia.svg` | o eyebrow do cartão "Bom dia" | um sol nascendo sobre uma linha (meio sol) |

**Regras:**
- cada SVG ≤ 1 KB;
- legível a 16 px;
- sem preenchimento grande, só traço;
- o PNG de prévia junto, como os atuais.

## 2. Duas ilustrações pequenas (spot, 192 → mostrado a 96, PNG RGBA → webp)
| arquivo | onde | a cena |
|---|---|---|
| `illustrations/spot-pedido-pronto.png` | o cartão de entrega "{Pedido}: tudo pronto" | 3 bichos da casa (sem rosto de persona específica: as silhuetas da família) em volta de uma caixa aberta com papéis, um deles erguendo um papel com ✓ |
| `illustrations/spot-bom-dia.png` | o cartão "Bom dia", à direita do título, só ≥ 960 px | uma janela com o sol nascendo, uma xícara fumegando no parapeito e uma folhinha; no escuro funciona igual (é manhã) |

**Regras:**
- nada de texto na arte;
- o contorno ameixa e a paleta da casa;
- ≤ 12 KB cada em webp.

## 3. O que NÃO precisa de arte
- **O cartão vivo do plano:** os rostos de cada parte já dizem quem.
- **O "Caminho do trabalho":** os rostos + o `ui/caminho.svg`.
- **Vazios novos:** nenhum. Os cartões não têm estado vazio: se não há dado, não aparecem.

## Orçamento
- **Peso:** ≈ 12 SVG × ~0,4 KB + 2 webp × ~12 KB ≈ **35 KB**, dentro da reserva de 256 KB da v1.1 (total previsto ≈ 9,78 MiB de 12).
- **Medição:** o Brush mede antes, e a Muse confere e registra.

## Ordem
1. **Amostra primeiro:** `passar-adiante`, `pedir-ajuda`, `revisao`, `gostei/sugestao/atencao` (prancha a 16/24 px, claro/escuro) + o `spot-pedido-pronto`.
2. **Aprovação da Muse.**
3. **O resto em lote.**

**Quem liga na tela:**
- **Quill:** as linhas e o selo.
- **Flint:** o pedido de opinião.
- **Prism:** o Bom dia e o cartão de entrega.
- **Lumen:** o "Caminho do trabalho".

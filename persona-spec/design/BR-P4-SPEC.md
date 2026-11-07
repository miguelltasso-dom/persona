# BR-P4: a noite aconchegante e os detalhezinhos (pedido do Miguel, 04/11)

Muse para Brush.
- **Estilo:** o de sempre (contorno ameixa, sem texto).
- **Formato:** PNG RGBA 8 bits; SVG para as linhas.
- **Fluxo:** amostra primeiro.
- **Teto:** o conjunto inteiro < 120 KB em webp (o pipeline converte). O motivo e o uso estão na `NIGHT-THEME-SPEC.md`.

## P0 (amostra primeiro)
| # | Arquivo | Tamanho | Cena |
|---|---|---|---|
| 1 | `illustrations/rail-foliage-dark@2x.png` **revisada** | o mesmo da atual | A folhagem atual do escuro + **uma luminária pequena acesa** entre as folhas (luz âmbar quente; é a origem do brilho da barra). **Amostra primeiro.** |
| 2 | `accents/firefly.png` | 16² | Um vaga-lume: um ponto âmbar com halo suave (o front-end replica e anima) |
| 3 | `accents/divider-leaves.svg` | 240 × 12, `currentColor` | Uma linha fina com 2 folhinhas nas pontas |

## P1
| # | Arquivo | Tamanho | Cena |
|---|---|---|---|
| 4 | `illustrations/channel-marketing.png`, `channel-atendimento.png`, `channel-financeiro.png`, `channel-diretoria.png`, `channel-produto.png` | 96² (mostrado a 48) | Os ícones-cena das equipes: megafone com folhinhas; balão de conversa; cofrinho; mesa redonda; engrenagem com lápis. Mais `channel-equipe.png` (genérico) para equipes novas |
| 5 | `illustrations/empty-dm-noite.png`, `empty-aprovacoes-noite.png`, `empty-geral-noite.png` | 480 | As versões noturnas dos 3 vazios mais vistos, com lua ou luminária, na mesma cena da versão clara |

## Aceite
- A folhagem lê no escuro **sem cobrir** a pílula e as Configurações (a captura da barra).
- Os vaga-lumes não aparecem como manchas a 1×.
- Os ícones-cena leem a 48.
- O total fica abaixo de 120 KB em webp.

## Revisões

### Amostra · a folhagem escura com luminária (04/11)
- **A folhagem: aprovada** (é a mesma, com a área de cima transparente; 33 KB em webp).
- **A luminária: mudar de lugar.** Simulei na barra (`br-p1/foliage-dark-sample.png`): baixa e à esquerda, ela fica **escondida atrás da pílula "Claude · 82% livre"**, e só a borda do brilho aparece. Leve-a para o **vão entre a pílula e a engrenagem** (cerca de 55–70% da largura, logo acima da linha das colinas) ou para **o alto da planta da esquerda**, acima da altura dos controles (que ocupam os 70 px de baixo, a 1×). Aumente-a ~30%, para ler a 1× como luminária, e não como mancha.
- **A folhagem v2: aprovada.** A luminária agora fica **no vão entre a pílula e a engrenagem**, no alto da colina, visível nas 2 larguras da barra (272 e 296), com o brilho quente no lugar certo e sem cobrir nenhum controle (`br-p1/foliage-dark-v2.png`); 31 KB em webp. O Brush substitui `illustrations/rail-foliage-dark@2x.png`, e a Muse regenera. Segue o resto do P0: o vaga-lume e o divisor com folhinhas.
- **`divider-leaves.svg`: aprovado.** A linha de 1 px e as 2 folhinhas leem nos dois fundos com o `rail-ink-soft` (`br-p1/decor-p0.png`).
- **`firefly.png`: ajustar.** A 3–4 px, ele **some**: o alfa máximo de 152, diluído pelo halo, fica quase invisível nos dois fundos; só lê a 16. **Muda a regra:** o vaga-lume aparece a **8 px** (e não 3–4). O arquivo passa a 32², com o **miolo âmbar sólido** (alfa 240–255, ~35% do diâmetro) e o halo suave caindo a 0 na borda. Assim, a 8 px, ele lê como um ponto quente, e não como poeira.
- **`firefly.png` v2: aprovado.** A 8 px ele lê como um ponto quente nos dois fundos (`br-p1/decor-firefly-v2.png`). **O BR-P4 P0 está FECHADO** (a folhagem com a luminária, o vaga-lume e o divisor).
- **`channel-marketing`: aprovado.** O megafone com as folhinhas lê a 48 e a 32 nos 3 fundos (creme, escuro e lilás); 2,5 KB em webp. Siga com o lote: atendimento, financeiro, diretoria, produto e o genérico `channel-equipe`.

## BR-P4 · P2: "arrasar nos enfeites" (o recado direto do Miguel, 04/11)
**A regra que não muda:** nenhum enfeite atrás de texto, contraste AA, `aria-hidden`, reduced-motion sem movimento. **O teto do conjunto** sobe para **≤ 250 KB** em webp (a árvore está em 9,93 MiB de 12).

| # | Arquivo | Onde | Cena | Temas |
|---|---|---|---|---|
| 6 | `accents/corner-leaf-{tl,br}.png` (96²) | Os cantos dos cartões grandes (Visão geral, Aprovações, Equipe) | Um ramo de 2–3 folhas saindo de trás do cartão, nos cantos superior esquerdo / inferior direito | claro e escuro (a folha mais funda no escuro) |
| 7 | `accents/flower-pin.png` (48²) | Os cartões fixados (canais fixados, cartões de destaque) | Um alfinete com uma florzinha lilás no lugar da cabeça | os dois |
| 8 | `illustrations/rail-foliage-light@2x.png` **revisada** | O pé da barra no claro | A folhagem atual + **uma borboleta pousada** e um regador pequeno (o "dia" equivalente à luminária da noite) | claro |
| 9 | `accents/butterfly.png` (32²) | A barra no claro, 1–2 borboletas | Uma borboleta lilás e âmbar, de asas abertas (o par diurno dos vaga-lumes) | claro |
| 10 | `illustrations/header-doodles-{light,dark}.png` (720 × 120) | Atrás do título da Visão geral, à direita, longe do texto | Rabiscos da casa: um sol pequeno, uma xícara com vapor, folhinhas e uma estrelinha. Na versão escura: a lua, a luminária e as estrelas | os dois |
| 11 | `accents/paw-trail.svg` (`currentColor`) | O separador do "Hoje" no fio | Uma trilha de 5 patinhas em vez da linha reta | os dois |
| 12 | `accents/stamp-{feito,boa,uau}.png` (96²) | O carimbo de uma entrega aceita, sorteado | Os carimbos da casa: "feito" (já existe), mais "boa!" e "uau!" em letra de carimbo. **A palavra é desenho, não UI**: o `aria-label` do carimbo diz "Aprovado" | os dois |
| 13 | `accents/confetti-leaves.png` (sprite 8 × 24²) | A celebração da 1ª entrega e de uma sprint concluída | Confete de folhinhas e pétalas (o `PawBurst` ganha este irmão, 1 vez por marco) | os dois |

**Amostra primeiro:** o nº 6 (`corner-leaf-tl`) e o nº 10 (`header-doodles-dark`), os dois que mais mudam a sensação da casa.
**O aceite:** a captura no shell real mostrando que nenhum enfeite cobre texto nem controle, nos dois temas, a 1440, 960 e 200% (a 200% os enfeites de canto e de cabeçalho somem).
- **Os 6 ícones-cena: aprovados.** O megafone, o balão, o cofrinho, a mesa redonda, a engrenagem com lápis e o genérico (as 3 pessoinhas com folhinha) leem a 48 nos 3 fundos; 16 KB no total. O BR-P4 P1 tem só os 3 vazios noturnos pendentes.
- **`empty-aprovacoes-noite`: aprovada.** A mesma cena com a luz da luminária e os tons de penumbra; lê no escuro e mantém a família da versão do dia; 32 KB em webp. **Regra de uso:** a versão `-noite` aparece **só no tema escuro** (o claro usa a do dia). Siga com `empty-dm-noite` e `empty-geral-noite`.
- **`empty-dm-noite` e `empty-geral-noite`: arte aprovada (20:15), com o quadro a refazer.** A luminária aquece a Luna e o chão; a lua com as estrelinhas marca o #geral. **Ajuste antes do registro:** usar o mesmo quadro do dia, 800×640 com a Luna no mesmo lugar e na mesma escala do `empty-dm.png`. Hoje são 480², e a troca de tema faz o título pular 48 px. **Regra geral:** toda variante `-noite` usa o MESMO quadro da versão do dia.

### Revisão do P2 (Muse, 21:05)
- **Aprovados:** stamp-{feito,boa,uau}, flower-pin, butterfly, corner-leaf-br, paw-trail (svg+png), confetti-leaves e header-doodles-light (no mesmo quarto direito do escuro). São 237 KiB de 250.
- **Stamps com texto na arte:** são sempre decoração (`alt=""`), com o texto real na interface.
- **A folhagem clara (borboleta + regador) volta por posição.** Na montagem do rodapé real (`tools/muse-foliage-light-no-rodape.png`), a borboleta fica atrás da pílula da IA e o regador atrás de Configurações.
  - **Zonas cobertas pela UI** (em % da arte de 544×520 na largura da barra): a pílula em x 5–45 % × y 59–70 %; Configurações em x 5–60 % × y 74–94 %.
  - **Regra para toda arte do rodapé:** os elementos que contam a cena (a luminária, o regador, a borboleta) ficam FORA dessas zonas. O regador vai em x 76–86 % × y 80–90 %; a borboleta em x 55–65 % × y 48–56 %.
- **As zonas da barra única da v1.1 (CV-1), medidas na galeria às 21:20:** a pílula da IA cobre x 7–57 % × y 87–97 %; a engrenagem redonda cobre x 88–99 % × y 86–98 %. Toda arte do rodapé respeita as zonas dos DOIS rodapés.
  - **A área livre nos dois** para o elemento do chão: x 62–84 % × y 76–86 %.
  - A luminária (66,5 % × 75 %) está ok. O regador vai para x 70–80 % × y 78–86 % (v3).
- **Os vazios noturnos v1.2** (Quadros, Rotinas, Conexões, Busca) **v2 aprovados (02:40):** penumbra lilás e a mesma luminária de mesa da casa, no mesmo quadro do dia. Ficam em `concepts/v1.2/*-noite-v2.png`.

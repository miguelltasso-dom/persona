# O escuro como "escritório aconchegante à noite" (pedido do Miguel, 04/11)

Muse. Os tokens e os primitivos são meus; a arte é o BR-P4 (Brush); o rail e a barra são do Flint e do Prism.

**As 4 regras que não mudam:**
- contraste AA em todo texto, verificado pelos testes `palette-dark-contrast` e `css-tokens-defined`;
- **nada de textura ou enfeite atrás de texto**;
- `prefers-reduced-motion` desliga todo movimento de enfeite;
- o peso cabe no teto de 12 MiB.

## 1. A luz (tokens novos, só no escuro)
| Token | Valor | Uso |
|---|---|---|
| `--persona-night-glow` | `radial-gradient(120% 80% at 0% 100%, rgb(242 194 122 / .10), transparent 60%)` | A luz quente que vem do canto da folhagem, na barra lilás |
| `--persona-night-vignette` | `radial-gradient(140% 100% at 50% 0%, transparent 55%, rgb(10 6 14 / .35))` | A vinheta suave na área principal (o centro mais claro, as bordas mais fundas) |
| `--persona-night-active-glow` | `0 0 0 3px rgb(242 194 122 / .18), 0 6px 18px rgb(242 194 122 / .12)` | O brilho quente no item ativo da barra, no botão primário em foco e no cartão "Precisa de você" |
| `--persona-night-texture` | a textura de papel escura que já existe (`textures/paper-dark.webp`) a 6% | Só no fundo da área principal, nunca dentro de cartões |

No claro, esses tokens valem `none`, e nada muda.

## 2. Os enfeites (arte do BR-P4, posição fixa, `aria-hidden`, `pointer-events: none`)
| Lugar | Enfeite | Movimento (sem reduced-motion) |
|---|---|---|
| O rodapé da barra | A folhagem de volta + **uma luminária pequena** acesa entre as folhas (a origem da `night-glow`) | nenhum |
| A barra, na parte de cima | **3–5 vaga-lumes** de **8 px** (miolo âmbar sólido + halo), só no escuro | flutuam devagar (12–18 s por volta), cada um com fase diferente; **param** com reduced-motion e com a janela em 2º plano |
| O cabeçalho de um canal de equipe | Um **ícone-cena** da equipe (48 px): marketing = um megafone com folhinhas; atendimento = um balão de conversa; financeiro = um cofrinho; diretoria = uma mesa redonda | nenhum |
| Os vazios | As cenas existentes + uma **versão noturna** das 3 mais vistas (o #geral vazio, Aprovações vazio, as DMs vazias), com lua ou luminária | nenhum |
| A equipe descansando (todos `resting`) | Na barra, ao lado de "Pessoas", um **bicho cochilando** de 32 px (a pose `descansando` já existe) | a respiração lenta que já existe |
| Os separadores | Entre "Canais" e "Pessoas", uma linha com 2 folhinhas nas pontas (SVG `currentColor`, 1 px) | nenhum |

**O teto de enfeites:** no máximo 2 enfeites animados na tela ao mesmo tempo, e nenhum na área de leitura do fio.

## 3. Os "detalhezinhos" nos dois temas (Miguel: "mais enfeites, eu tinha achado lindo")
- Os cantos dos cartões grandes (Visão geral, Aprovações) com **uma folhinha** saindo de trás (`accents/leaf-1.svg`, que já existe), 1 por cartão, no canto superior direito, sem cobrir conteúdo.
- O carimbo e as patinhas (que já existem) também no "Aceita · virou a tarefa" das propostas.
- Os selos de "não lido" com um brilho âmbar mínimo no escuro (`night-active-glow` a 50%).

## Donos
- **Muse:** os tokens (§1) e o primitivo `NightDecor` (a posição dos enfeites, o reduced-motion e a pausa em 2º plano, numa camada `aria-hidden`).
- **Brush:** a arte (BR-P4).
- **Flint e Prism:** a barra (a folhagem, os vaga-lumes, o separador, o bicho cochilando) dentro do CV-1.
- **Lumen e Ember:** os cartões e os vazios.

## Aceite
- Captura no shell real, escuro e claro, 1440 e 960: a barra com a folhagem, a luminária e os vaga-lumes; um canal de equipe com o ícone-cena; um vazio noturno.
- **axe 0.**
- Com reduced-motion, 0 animações de enfeite (`getAnimations`).
- Os enfeites são < 120 KB no total em webp.

## 4. Mais enfeites, nos dois temas (o recado do Miguel: "arrasar nos enfeites")
A arte é a BR-P4 §P2. **O dia ganha os seus equivalentes da noite:**
- borboletas no lugar dos vaga-lumes;
- um regador no lugar da luminária;
- o sol e a xícara nos rabiscos do cabeçalho, no lugar da lua.

Também entram:
- os cantos com folhinhas nos cartões grandes;
- o alfinete com flor nos fixados;
- a trilha de patinhas no separador "Hoje";
- os carimbos sorteados ("feito", "boa!", "uau!");
- o confete de folhinhas nos marcos.

**O limite de "não poluir":** no máximo **1 enfeite por cartão** e **2 animados na tela**. A área de leitura do fio e os formulários **nunca** levam enfeite. A 200%, os de canto e de cabeçalho somem.

**O primitivo `HouseDecor` (Muse):** escolhe o enfeite por tema, posiciona fora do conteúdo (os cantos e o fundo do cabeçalho) e respeita o reduced-motion e o modo de alto contraste do Windows (`forced-colors: active`, onde some tudo).

## 5. A luz da luminária dentro do chat (experimento, ideia do Miguel via Atlas, 04/11)
**Só no tema escuro.** A luz quente da luminária da folhagem entra no chat pelo canto de baixo à esquerda, e as bordas de cima e da direita ficam mais fundas. Protótipo: `.maestri/tmp/shots/design/baloes-luz/` (DM e #marketing, escuro; o claro não muda).
- **A luz cai só no FUNDO.** É uma camada `aria-hidden` atrás de tudo, com dois gradientes:
  - o brilho: `radial-gradient(1150px 780px at -110px 93%, rgb(242 186 110 / .30), … / .13 34%, … / .04 58%, transparent 74%)`;
  - a vinheta: `radial-gradient(115% 105% at 10% 92%, transparent 42%, rgb(8 4 12 / .55))`.
- **Os balões e os cartões mantêm o fundo sólido:** o contraste do texto não muda.
  - O texto solto (nome · função · hora, "Você · hora") é medido sobre o ponto mais claro do fundo: `--persona-ink-soft` no pior caso dá **6,2:1** (AA). O axe não lê gradiente, então a medida é por pixel e vai no aceite.
- **Perto da luz, mais luz:** `--lit` (0–1) é calculado uma vez por layout (e no resize), pela distância à luminária.
  - Ele dá uma borda quente nos lados que olham para a luz (esquerda e baixo): `color-mix(#f2c27a lit×80%, outline-soft)`, uma cor sólida.
  - Ele dá uma sombra jogada para longe da luz (para cima e para a direita), mais forte perto dela.
  - O composer também recebe a borda.
- **Movimento:** um respiro de opacidade .9 ↔ 1 em 14 s, que some com reduced-motion. Nada mais anima. O custo é uma camada de gradiente estática (sem blur nem filtro).
- **Não vale:**
  - luz sobre o texto;
  - fundo translúcido em balão;
  - luz no tema claro (lá, a cena equivalente é o regador, §4, sem luz);
  - aplicar a luz a outras telas antes do aceite desta.
- **APROVADO pelo Miguel (20:21, via Atlas):** "essa segunda versão ficou melhor". Entra com o Flint junto do CV-9, atrás de `persona.flag.lampLight` (desligada por padrão; D-077).
- **O halo da luminária** (pedido junto da aprovação): um brilho pequeno em volta da luminária da folhagem, para a luz parecer vir de lá e atravessar a divisa entre a barra e o chat.
  - `radial-gradient(90px 90px at <centro da luminária>, rgb(242 186 110 / .35), transparent 70%)` numa camada `aria-hidden` sobre a arte da folhagem (`mix-blend-mode: screen`).
  - Deve ser só no escuro e nunca atrás do texto da pílula da IA nem da engrenagem.
  - Com a barra em trilho (≤ 960 px), o halo e a luz do chat partem do canto do trilho.
- **Implementação:**
  - a camada de fundo mora no contêiner da conversa (DM e canal), atrás do `MessageList` e do composer;
  - o `--lit` é calculado no layout e no resize, com `ResizeObserver` (nunca por quadro nem no scroll); se o cálculo não existir, `--lit` = 0 e a borda e a sombra ficam as de hoje;
  - o forced-colors desliga a luz, a borda quente e a sombra.
- **Aceite:**
  - capturas no shell real, só no escuro: DM com tabela e #geral, a 1440, 960 e 200 %;
  - axe 0 + a medida por pixel do texto solto no ponto mais claro (≥ 4,5:1);
  - reduced-motion sem o respiro;
  - o claro idêntico ao de hoje (visual diff).

## 6. Quem faz (D-089, 21:12)
- **Os enfeites noturnos e da casa (§2–4):** o Lumen (antes, o Ember), atrás de `persona.flag.houseDecor` até o aceite da Muse.
- **A luz da luminária no chat (§5):** o Flint, atrás de `lampLight` + `bubbles`.
- **A arte está no tree desde as 20:55:** os vazios `-noite` (só no escuro, mesmo quadro do dia), os ícones-cena, os cantos, os rabiscos do cabeçalho, as borboletas, os carimbos e o confete.

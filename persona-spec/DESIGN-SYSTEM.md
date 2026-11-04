# Persona — Design System "Escritório acolhedor" (Muse, 03/11/2026)

Dono: **Muse** (Diretor de Design). Vale para Prism, Lumen, Brush e Probe. Precedência: decisões do Miguel (`BRIEFING.md`) > `Persona-Arquitetura.md` §3 > `UX-GUIDE.md` (movimento, RCD, aceite) > **este documento** (forma visual) > gosto pessoal.
Código: `packages/persona/client-ui-persona/src/client/theme/` (tokens, fontes, base) e `src/client/primitives/` (componentes). Nada de hex fora de `theme/*.css`.

---

## 0. Por que este documento existe

Feedback do Miguel ao ver a UI real: *"As imagens dos animais estão MUITO boas, mas o design de todo o resto está MUITO ruim e bem fraco, sem personalidade, genérico, falta detalhamento."*
Diagnóstico das capturas (`.maestri/tmp/shots/persona-light-channel.png`, `real/persona-light-onboarding.png`):

1. **A UI não foi desenhada pela mesma mão das ilustrações.** Os bichos têm contorno ameixa, formas cheias e sombra em poucas camadas; a interface é flat de SaaS (bordas cinza-lilás de 1px, nenhum peso, nenhuma sombra).
2. **Tipografia sem voz**: tudo na fonte do sistema, títulos em 18–20px, sem contraste de peso. "#Conversas · Geral" parece breadcrumb, não título.
3. **Sem hierarquia de superfícies**: fundo, faixa da equipe, lista de mensagens e composer estão no mesmo plano creme.
4. **Faixa da equipe pequena e solta**: personagens a 100px num fundo vazio, silhuetas tracejadas cinzas (parecem erro), sem cenário.
5. **Detalhe ausente**: reações com emoji minúsculo sem contagem, avatar do usuário = quadrado bege vazio, composer = `<select>` nativo + `<textarea>` redimensionável, botão "Enviar" desbotado, sem separador de dia, sem estados de hover/foco desenhados.
6. **Onboarding = formulário num modal genérico**: nenhum bicho, nenhuma ilustração, "Passo 1 de 5" em texto cinza.

## 1. Conceito

**"O escritório acolhedor da sua equipe de bichos."** A interface é o escritório onde os bichos trabalham: papel creme, móveis com contorno de nanquim ameixa, etiquetas e adesivos que você pode tocar. Tudo que é clicável parece **um adesivo colado no papel** — tem contorno e uma sombra sólida deslocada para baixo — e **afunda** quando você aperta.

Três regras-mãe:

1. **Mesma mão.** Todo elemento interativo tem o contorno ameixa do traço dos personagens. O contorno é sempre o valor mais escuro da cena (no escuro, quase preto-ameixa).
2. **Papel, não tela.** Superfícies quentes com grão sutil; profundidade por sombra sólida (sticker), não por blur cinza.
3. **Bichos no comando, UI de apoio.** A ilustração é o herói de cada tela-vitrine; a UI usa cor com parcimônia (âmbar = ação primária e "precisa de você"; lilás = estrutura).

### Referências (refcat + produtos conhecidos)

| Referência | O que tiramos | Fonte |
|---|---|---|
| Mailchimp — identidade por COLLINS | Ilustração desenhada à mão convivendo com UI contida; **uma** cor de marca usada com propósito (o amarelo deles ↔ nosso âmbar só para ação/atenção); serif/rounded de personalidade nos títulos. | refcat · *60fps Motion Design* › "Mailchimp by COLLINS" (captura 11/10/2026) |
| Eventbrite — rebrand por BUCK | Linework grosso e arredondado + sans geométrica pesada; ilustrações de estado vazio no meio do fluxo (onboarding de contatos) em vez de texto. | refcat · *60fps Motion Design* › "Eventbrite by BUCK" (11/10/2026) |
| GrowHappy — identidade por Wedge | Fundo creme, paleta limitada quente, mascote desenhado à mão, sans arredondada; prova que "fofo" pode ser organizado. | refcat · *60fps Motion Design* › "GrowHappy by Wedge" (11/10/2026) |
| Duolingo (web) | Botões 3D com sombra sólida que afunda ao clicar; personagem reage ao estado; celebração no fim do fluxo. | refcat · Duolingo › "Editing an avatar" (05/11/2025) — tela bloqueada (Pro), usamos só o padrão conhecido |
| Slack / Discord (canal) | Anatomia do canal: cabeçalho com nome + tópico, separador de dia em pílula, mensagens agrupadas por autor, reações como chips com contagem, composer com ferramentas à esquerda e enviar à direita. | refcat · Telegram/Patreon/X "Reacting to a message" (2023–2025) — telas bloqueadas (Pro); anatomia por conhecimento do produto |
| Linear / Arc | Rigor de grade 4/8, atalhos e foco visível, densidade calma; Arc: rail colorido com personalidade. | conhecimento de produto (não há captura aberta no refcat) |
| `persona-assets/references/dirD-tela.png` | **Referência canônica**: rail lilás com colinas, banner de equipe com cenário lavanda, avatares com moldura, pílula "Hoje", composer em barra única com enviar âmbar. | Brush/Atlas |

> Observação honesta: no plano atual do refcat, telas de app (Slack, Discord, Duolingo, Telegram) voltam bloqueadas; só as referências de marca acima estavam abertas. Nenhuma tela foi inventada.

## 2. Cor

### 2.1 Tokens primitivos (fixos)

| Token | Hex | Nota |
|---|---|---|
| `--persona-plum-950` | `#120C18` | contorno no escuro |
| `--persona-plum-900` | `#34243F` | **nanquim** — contorno e texto principal no claro |
| `--persona-lilac-800…100` | `#4D3A6D` `#675290` `#7962A4` `#9179BC` `#AF99D4` `#C8B8E8` `#E4D7F1` `#F2EAF8` | escala da direção D (`references/README.md`) |
| `--persona-cream-50` | `#FFFBF3` | cartão |
| `--persona-cream-100` | `#FAF3E4` | papel |
| `--persona-cream-200` | `#F3E8D2` | papel afundado (poços, trilhos) |
| `--persona-amber-300` | `#F3C877` | âmbar claro (hover) |
| `--persona-amber-400` | `#E8AF54` | **âmbar** — ação primária, "precisa de você" |
| `--persona-amber-600` | `#C98A2E` | âmbar pressionado/borda |
| `--persona-amber-800` | `#8A5500` | âmbar como texto sobre papel (5,6:1) |

### 2.2 Tokens semânticos (o que os componentes usam)

| Semântico | Claro | Escuro | Uso |
|---|---|---|---|
| `--persona-paper` | cream-100 `#FAF3E4` | `#1E1526` | fundo da área principal |
| `--persona-paper-sunken` | cream-200 `#F3E8D2` | `#18111F` | poço do composer, trilhos, skeleton |
| `--persona-card` | cream-50 `#FFFBF3` | `#2A1E35` | cartões, modais, composer |
| `--persona-card-raised` | `#FFFFFF` | `#33253F` | popover, tooltip, menu |
| `--persona-wash` | lilac-100 `#F2EAF8` | `#2E2140` | realce suave (seleção, hover de linha, banner céu) |
| `--persona-wash-strong` | lilac-200 `#E4D7F1` | `#3A2A4F` | chip neutro, pílula de dia |
| `--persona-ink` | `#34243F` (12,9:1) | `#F6EEE0` (15,3:1) | texto principal |
| `--persona-ink-soft` | `#5E4E6B` (6,8:1) | `#CDBFDB` (10,1:1) | texto secundário |
| `--persona-ink-faint` | `#77678A` (4,65:1) | `#A795B8` (6,4:1) | metadados (hora, contagem) — nunca < 12px |
| `--persona-outline` | plum-900 | plum-950 | contorno-assinatura (decorativo, 1,5px) |
| `--persona-outline-control` | plum-900 | `#8F7BB0` (4,2:1) | borda de input/checkbox (≥ 3:1 exigido) |
| `--persona-outline-soft` | plum 18% | lilac 22% | divisórias, borda de linhas de lista |
| `--persona-rail` | lilac-700 `#675290` | `#2A1E3A` | trilho lateral |
| `--persona-rail-ink` | `#FFFFFF` (6,6:1) | `#F6EEE0` (13,6:1) | texto do trilho |
| `--persona-rail-ink-soft` | lilac-200 (4,8:1) | lilac-300 | status/rodapé do trilho |
| `--persona-rail-hill-1/2/3` | lilac-600/500/400 | `#3A2A4F`/`#45335D`/`#524070` | colinas ilustradas |
| `--persona-accent` | amber-400 | amber-400 | botão primário, selo "precisa de você" |
| `--persona-accent-ink` | plum-900 (7,3:1) | plum-900 | texto sobre âmbar |
| `--persona-accent-text` | amber-800 | amber-400 (9:1) | âmbar como texto/ícone |
| `--persona-brand` | lilac-700 | lilac-300 | links, ícones de estrutura, títulos de seção |
| `--persona-success/-warning/-danger/-info` | `#28704E` `#875200` `#A53240` `#315F98` | `#7FD3A6` `#F2C27A` `#F19AA5` `#9DBFEA` | estado (texto/ícone) |
| `--persona-*-tint` | `#E3F1E8` `#FBEBD0` `#F8E1E3` `#E3ECF7` | 18% do estado sobre card | fundo de selo/aviso (texto do estado ≥ 5:1) |

Compatibilidade: `--persona-active-*` e `--dsw-alias-*` continuam mapeados para os semânticos (código antigo segue funcionando).

### 2.3 Regras de cor

- **Âmbar é escasso**: no máximo **uma** ação primária âmbar por tela + selos "precisa de você". Nunca âmbar em decoração grande.
- Lilás estrutura (rail, títulos de seção, ícones), creme acolhe, ameixa desenha.
- Estado nunca só por cor: ícone + texto (UX-GUIDE §2.4).
- **Escuro de verdade**: noite ameixa (`#1E1526`), não cinza. Cartões mais claros que o papel; contorno quase preto-ameixa; âmbar igual.

## 3. Tipografia

Fontes **empacotadas localmente** (sem CDN), licença **SIL OFL 1.1**, subconjunto Latin (pt-BR completo): `theme/fonts/` (gerado por `scripts/persona/build-fonts.mjs`, fontes-fonte em `persona-assets/fonts/` + `OFL-*.txt`).

- **Display: Fredoka** (variável, wght 300–700, wdth 75–125) — arredondada, pesada e amigável; casa com as formas cheias dos bichos. Avaliadas: Baloo 2 (boa, mas mais infantil e com glifos de devanágari pesados), Nunito Black (pouco contraste com o corpo), Bricolage Grotesque (moderna demais, sem a doçura do traço). **Fredoka vence.**
- **Texto: Nunito** (variável, 200–1000) — terminais arredondados que conversam com a Fredoka, ótima legibilidade em 13–16px. Corpo em **peso 500** (o 400 da Nunito fica fino sobre creme).
- Mono: pilha do sistema (`ui-monospace, "Cascadia Code", Consolas`).

| Token | Fonte / peso | Tamanho / linha | Uso |
|---|---|---|---|
| `--persona-type-display` | Fredoka 700 | 40/44, -0,02em | herói do onboarding |
| `--persona-type-h1` | Fredoka 650 | 28/34, -0,015em | título de tela |
| `--persona-type-h2` | Fredoka 600 | 22/28 | título de seção / banner |
| `--persona-type-h3` | Fredoka 600 | 17/22 | título de cartão, nome do autor |
| `--persona-type-body-l` | Nunito 500 | 16/24 | mensagens |
| `--persona-type-body` | Nunito 500 | 15/22 | padrão |
| `--persona-type-body-s` | Nunito 600 | 13/18 | metadado, chip |
| `--persona-type-eyebrow` | Nunito 800 | 12/16, +0,08em, CAIXA ALTA | sobretítulo ("PASSO 1 DE 5") |
| `--persona-type-button` | Fredoka 600 | 15/20 (s: 13/18, l: 17/22) | botões |

Hierarquia: títulos sempre em Fredoka ≥ 600; nunca dois níveis com o mesmo tamanho; números de destaque (contagens, uso) em Fredoka 600 com `font-variant-numeric: tabular-nums`.

## 4. Forma: contorno, sombra, raio, espaço

### 4.1 Contorno-assinatura

- `--persona-border-width: 1.5px`, `--persona-border-width-strong: 2px` (selecionado/foco).
- **Leva contorno ameixa**: botões, inputs, chips/selos, avatares, cartões, composer, banner da equipe, modais, toasts, tooltips, pílula do item ativo no rail.
- **Não leva**: linhas de mensagem, itens de lista dentro de cartão (usam `--persona-outline-soft` como divisória), texto.

### 4.2 Sombras sticker (sólidas, deslocadas para baixo, sem blur)

| Token | Claro | Uso |
|---|---|---|
| `--persona-shadow-press` | `0 3px 0 0 var(--persona-outline)` | botões e chips clicáveis (a "borda" que afunda) |
| `--persona-shadow-sticker` | `0 3px 0 0 rgb(52 36 63 / .16)` | cartões em repouso |
| `--persona-shadow-lift` | sticker + `0 14px 24px -14px rgb(52 36 63 / .35)` | cartão em hover, kanban arrastando |
| `--persona-shadow-float` | `0 5px 0 0 rgb(52 36 63 / .18), 0 24px 48px -20px rgb(52 36 63 / .45)` | modal, toast, popover |

No escuro as sombras usam `rgb(8 4 12 / .55–.7)`.

**Afundar no clique**: `:active` → `transform: translateY(2px)` e sombra `0 1px 0 0` (a peça "encosta" no papel), 80 ms. Hover → `translateY(-1px)` e sombra `0 4px 0 0`.

### 4.3 Raios (`--persona-radius-*`)

`xs 6` (selos internos) · `s 10` (chip, input pequeno, tooltip) · `m 14` (botão, input, avatar quadrado) · `l 18` (cartão) · `xl 24` (banner, modal, composer) · `pill 999`.
Avatar de persona = quadrado arredondado `m` com contorno (como os retratos da dirD), avatar do usuário = círculo com iniciais.

### 4.4 Espaço — grade 4/8

`--persona-space-1…16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px (`1,2,3,4,5,6,8,10,12,16`). Padding de cartão 20–24; gap entre seções 32; margem de página 32 (≥1280px) / 24.
Alvos de clique ≥ 36px (botão m = 40px, s = 32px só em barras densas, ícone-botão 40px).

### 4.5 Textura de papel

`--persona-paper-grain`: SVG `feTurbulence` (baseFrequency .9, 2 oitavas) em data-URI, opacidade 5% (claro) / 4% (escuro), `background-blend-mode: multiply` (claro) / `soft-light` (escuro). Aplicado **só** em `paper` e no rail. Nunca em cartões (cartão = papel liso colado em cima).

## 5. Componentes (primitivos)

Importar de `src/client/primitives/index.ts`. Estados obrigatórios em todos: repouso, hover, foco-visível, ativo/pressionado, desabilitado, (carregando quando aplicável).

**Foco visível** (único, global): `outline: 2px solid var(--persona-ink); outline-offset: 2px; box-shadow: 0 0 0 5px var(--persona-focus-halo)` — anel ameixa + halo âmbar 45%. No rail: anel creme + halo âmbar.

| Componente | Anatomia e regras |
|---|---|
| `Button` | variantes `primary` (âmbar, contorno ameixa, `shadow-press`), `secondary` (card, contorno ameixa, `shadow-press`), `ghost` (sem contorno; hover = wash), `danger` (danger-tint + texto danger, contorno ameixa). Tamanhos s/m/l (32/40/48). Ícone à esquerda opcional. `loading` troca o rótulo por 3 patinhas pulsando, mantém largura. Desabilitado: opacidade .5, sem sombra, `cursor: not-allowed`, nunca some. |
| `IconButton` | 40×40, raio m, `ghost` por padrão; `aria-label` obrigatório; `badge` opcional (ponto âmbar com contorno). |
| `Card` | card + contorno + `shadow-sticker` + raio l + padding 20. `interactive` → hover levanta (`shadow-lift`, -2px). Opcional `eyebrow`, `title`, `actions`. |
| `Input` / `Textarea` | card, contorno `outline-control`, raio m, altura 44, padding 12/14; hover → borda lilac-700; foco → anel global; erro → borda danger + mensagem com ícone; rótulo sempre visível (Nunito 700 13px) e dica em ink-soft. Textarea sem *resize* nativo; cresce até 8 linhas. |
| `Chip` / `Badge` | pílula, contorno, Nunito 700 13px. Tons: `neutral` (wash-strong), `brand`, `accent` (âmbar), `success/warning/danger/info` (tint + texto do estado). `ReactionChip`: emoji 16px + contagem tabular; `selected` = wash + contorno 2px brand. |
| `StatusBadge` | ponto/ícone + texto do estado da persona (8 estados, UX-GUIDE §2.4), nunca só cor. |
| `Avatar` | `persona` (retrato do Brush em moldura quadrada arredondada com contorno, fundo wash) ou `user` (círculo, iniciais em Fredoka 600, cor derivada do nome dentro da escala lilás/âmbar). Tamanhos 24/32/40/56/96. Selo de presença opcional (canto inferior direito, contorno card). |
| `Tabs` | trilho `paper-sunken` com raio pill; aba ativa = pílula card com contorno e `shadow-press` (adesivo); indicador desliza (220 ms `ease-standard`). Teclado: setas. |
| `Modal` | scrim ameixa 40% + blur 3px; painel card, raio xl, contorno, `shadow-float`; entrada scale .98→1 + fade 220 ms; foco preso; Esc fecha; título Fredoka h2. |
| `Toast` | entra de baixo com spring; card com contorno + faixa de ícone à esquerda colorida pelo tom; some com fade; ação opcional. |
| `Tooltip` | ink sobre card-raised invertido (fundo ink, texto paper), raio s, 13px, atraso 400 ms; nunca contém ação. |
| `EmptyState` | ilustração do Brush (ou pose de persona) 160–200px + título h2 + 1 frase + **uma** ação primária (RCD *Never ship a blank dashboard*). |
| `Skeleton` | blocos `paper-sunken` raio s com shimmer lilás 1,6 s; respeita reduced-motion (sem shimmer). |
| `DayDivider` | linha `outline-soft` + pílula `wash-strong` com contorno, Fredoka 600 13px ("Hoje", "Ontem", "seg., 2 de nov."). |
| `Icon` | ícones da marca (`persona-assets/icons/nav`, traço 1,75 arredondado) via máscara CSS → herdam `currentColor`. Ícones de UI adicionais (enviar, anexar, imagem, emoji, mais, sino, ajuda, chevron, fechar, check) no mesmo traço em `primitives/icons.tsx`. Proibido emoji como ícone de UI. |
| Acentos `Squiggle`, `PawTrail`, `Sparkle` | SVG à mão em `currentColor` (âmbar/lilás): sublinhado ondulado sob 1 título por tela, trilha de patinhas em estados vazios/celebração, faísca em "novo". **Máximo 2 acentos por tela.** |

| `Screen` / `ScreenHeader` | Casca de toda tela principal: rolagem própria, largura máx. 1180 (`reading` 880), cabeçalho com selo do ícone do rail + eyebrow (grupo) + h1 Fredoka 28 + subtítulo + ações (no máx. 1 primária). |
| `ErrorState` / `PanelBoundary` | Erro honesto: arte `empty-error` + título humano + "Tentar de novo" + detalhe técnico pequeno e selecionável. `PanelBoundary` é o error boundary por painel; o frame ainda tem um **guarda de painel vazio** (2 s sem conteúdo → `ErrorState`), porque o slot do DSH engole crashes. Nunca tela vazia. |
| `Accent` | Acentos à mão do Brush (`persona-assets/accents`: squiggle-1..3, paw-prints, sparkle-1..2, leaf-1..2, doodle-arrow, doodle-circle, stars-cluster) pintados por máscara com `currentColor`. |
| `PersonaCard` / `PersonaCardFacts` / `PersonaCardPopover` / `usePersonaCardController` | Cartão da persona (spec `design/PERSONA-CARD-SPEC.md`): cena 112 px com a pose ao vivo sobre o banner, identidade, selos de função, faixa "agora" tingida pela categoria, quem pode falar, fatos de governança, motor com barras 5h/semana (**nunca 0% inventado**), campo "Mensagem para…". Popover não modal em portal; hover 450 ms sem roubar foco, clique foca, Esc devolve o foco. No perfil, `PersonaCardFacts layout="wide"`. |
| `OrgChart` / `HealthScore` / `HealthItem` / `TwoDayTimeline` / `SectorIcon` | Governança (spec `design/GOVERNANCE-SPEC.md`): organograma com conectores lilás e colunas de 200–272 px centralizadas, modo lista acessível; veredito em 1 frase; achado com **uma** ação; Teste dos 2 dias; ícones de setor do Brush por máscara. |
| `PawBurst` / `MilestoneCard` / `ApprovedStamp` | Pico e fim: rajada de patinhas única (cooldown 2,5 s), cartão de marco (sprint/onboarding), carimbo "Aprovado" do Brush pressionado **uma vez** no momento da aprovação (mola 320 ms, −10°); reduced-motion = estático. |
| `MenuButton` | O único ⋯ do app (cartão, assuntos, contas): `aria-haspopup=menu`, setas/Home/End, Esc fecha e devolve o foco **sem fechar o overlay pai**, Tab ou clique fora fecham, itens com `leading` (ex.: bolinha do assunto) e `tone="danger"`. `ref.open()` para Shift+F10. |
| `useActiveIndicator` | Indicador deslizante (pílula do rail, abas) que **mede de novo** em ResizeObserver, mutação de `aria-current/selected/expanded`, `transitionend` e fontes carregadas. Medir uma vez só = pílula vazia fora do lugar (dogfood 05). |
| `SubjectBar` / `SubjectDot` (chat) | Assuntos (WAVE2-SPEC a): pílula com bolinha (`--persona-subject-0..6`, contorno ameixa 1,5 px) + **nome sempre** (sem nome → nome da cor), ativa com `-tint` + contorno + `shadow-press`, bolha âmbar de não lidas, anel que respira quando há persona trabalhando; ⋯ e + fora do `tablist`; até 7. |
| `AccountRow` / `AccountList` / `AccountPolicyPicker` / `Notice` | Contas por provedor (WAVE2-SPEC c): um estado e **uma** ação por conta, medidores oficiais ou "Sem estimativa ainda", rostos de quem usa; política como 4 cartões-rádio em linguagem simples (escolha explícita); `Notice` informação/aviso. |
| `RecordingPill` / `RecordingFrame` / `TeachStepCard` / `TeachStepList` | Ensinar (WAVE2-SPEC b): pílula flutuante fora da área gravada (ponto `danger` pulsando, cronômetro tabular, Pausar/Parar), moldura com cantos em colchete; passo da revisão com selo numerado, miniatura 176×110, texto editável, ↑↓, Borrar parte, remover. Nunca gravar dentro de um modal. |
| `ChoiceCards` | Escolha explícita em cartões-rádio (ícone, título, uma frase, selo "Recomendado"): `input type=radio` real por baixo; base do `AccountPolicyPicker` e das predefinições de Regras. Use no lugar de números crus. |
| `QuotaMeter` | Medidor oficial 5h/semana (role=meter, tom por nível), compartilhado entre cartão e Conexões. |

### 5.1 Regra de dados para primitivos com estado externo

Todo `HostObservable` derivado (selectors, bridges) devolve **a mesma referência** enquanto as entradas não mudam (cache por referência). Array/objeto novo a cada `getSnapshot` = React #185 = painel em branco. Teste obrigatório: `tests/observable-bridges.client.spec.ts`.

## 6. Shell e superfícies-vitrine (padrão para todas as telas)

- **Rail** (272px): lilás com grão; logo = símbolo âmbar + "Persona" Fredoka 700 26px; itens Nunito 700 15px com ícone 22px; item ativo = **pílula creme com contorno ameixa e sombra press** (adesivo colado no rail) e texto ameixa; hover = creme 12%; grupos com sobretítulo eyebrow lilac-200. Rodapé = **colinas ilustradas** (SVG em 3 camadas de lilás) com folhinhas; status do host em pílula sobre a colina.
- **"Sua equipe" no rail** (pedido do Miguel): logo abaixo da navegação principal. Linha = avatar circular 34 px com contorno ameixa + sombra press, piscar ocasional (`*-blink`), selo de estado 17 px com ícone do Brush (digitando · lupa · aprovação âmbar pulsando devagar · zzz · erro · offline esmaecido); nome Fredoka 15 + cargo 12; o cargo vira o estado no hover/foco (fixo para "aguardando você" e "travado"); contador de não lidas âmbar; clique abre a DM, "⋯" abre o Perfil. Ordem: aguardando você → travado → trabalhando → revisando → descansando → offline. Top 6 + "Ver todos (N)"; "+ Contratar persona" tracejado no fim.
- **Rail recolhível** (botão ‹ no topo, 76 px): só ícones, avatares com selo e separadores; rótulos viram `aria-label`/`title`; estado em `persona.rail.collapsed.v1`.
- **Cabeçalho de tela**: ícone da seção em selo quadrado wash com contorno (40px) + título h1 Fredoka + subtítulo ink-soft; ferramentas à direita (IconButtons + avatar do usuário).
- **Área de conteúdo**: papel com grão; conteúdo em cartões; largura máx. de leitura 1120px.

### 6.1 Quadros, fluxos e sprints (PROJECT-BOARDS)

Especificação completa em `persona-spec/design/BOARDS-SPEC.md`. Tokens de **categoria de estágio** (claro/escuro): `--persona-cat-{todo|doing|review|needs-you|done|blocked}` + `-tint`. A cor da categoria só aparece como faixa de 4 px no topo da coluna, ponto do cabeçalho e segmento de barra — sempre com rótulo/ícone.

## 7. Ilustração integrada

- **Faixa da equipe** (`#geral`): banner com cenário (céu wash → colinas lavanda + chão), personagens de corpo inteiro **grandes** (altura 180–200px) apoiados no mesmo chão, título "Sua equipe neste canal" em Fredoka h2 + chip "N membros". Arte final: `brand/banner-team-{light,dark}.webp` (Brush); enquanto não chega, cenário SVG do próprio tema. Nome/estado de cada um em **etiqueta-adesivo** sob os pés.
- **Estados vazios**: sempre ilustrados (pose de persona coerente com o contexto ou arte do Brush) — nunca ícone cinza.
- **Onboarding**: a equipe entra em fila (stagger 80 ms), Atlas acena; o painel é um cartão grande, não um modal de formulário.
- **Acentos à mão**: ver §5, com parcimônia.
- Sem silhuetas tracejadas cinzas: persona sem arte usa `Avatar user` (iniciais) ou silhueta lilás preenchida com contorno.

### 7.1 Poses — normalização (pipeline)

`scripts/persona/build-assets.mjs` recorta cada pose pela área opaca (pad 1,5%; base/piscar/cauda com o mesmo recorte) para que todos pisem na mesma linha de chão. Altura exibida = altura da cena × escala da espécie (Atlas 1 · Sol .95 · Nina .92 · Bento .84 · Luna .72) × fator da pose (deitado .56). Personas sem arte: iniciais em círculo, nunca silhueta cinza.

## 8. Movimento

Segue `UX-GUIDE.md` §2–3 integralmente (tokens já em `theme/persona-palette.css`). Acréscimos de forma:

- Botões/chips: hover -1px (140 ms), pressionado +2px (80 ms), solta com `ease-spring`.
- Cartões interativos: hover levanta -2px + `shadow-lift` (220 ms).
- Personagens: respiração 1→1,012 em 4–5 s defasada; troca de pose crossfade 220 ms + pulo 6px.
- Mensagem nova: sobe 8px + fade 220 ms; stagger 60 ms só no primeiro carregamento.
- Micro-celebração de patinhas (`paw-burst`) só em fim de fluxo (peak-end).
- `prefers-reduced-motion`: tudo vira fade ≤ 120 ms; sem respiração, sem shimmer.

## 9. Não fazer

- ❌ Controle morto: botão sem ação não aparece — o CTA de estado vazio só existe com `onPrimary` (UX-18), e atalho anunciado (`Ctrl K`) tem de funcionar.
- ❌ Borda cinza 1px + sombra blur cinza (o "SaaS genérico").
- ❌ Fonte do sistema em títulos; títulos < 20px em cabeçalho de tela.
- ❌ `<select>`/`<textarea>` nativos sem estilo, *resize handle* visível.
- ❌ Emoji como ícone de UI (🖼📎☺). Emoji só em conteúdo (mensagens, reações).
- ❌ Mais de uma ação âmbar por tela; âmbar decorativo.
- ❌ Silhuetas tracejadas cinzas; quadrados vazios no lugar de avatar.
- ❌ Hex/px soltos em componente — só tokens.
- ❌ Gradientes chamativos, glassmorphism, neon, sombras coloridas.
- ❌ Tema escuro cinza/preto neutro.
- ❌ Animação sem evento real; loops que não pausam fora da tela.
- ❌ Ids crus na UI ("dsh · default", "oar:codex", "persona-atlas"): motor/modelo sempre por `team/engine-label.ts` ("Harness DeepSeek · modelo padrão", "Claude · Haiku").
- ❌ Zero inventado: sem dado do host = "indisponível"/"sem estimativa ainda", nunca "0%" ou "~0 tokens".
- ❌ Iniciais no lugar do bicho: persona sempre com retrato/pose (`characterId` sem "-default"); iniciais só para humanos.

## 10. Aceite visual (Muse revisa por captura)

Uma tela está no padrão quando: (1) só usa primitivos/tokens deste documento; (2) tem cabeçalho §6, uma ação primária âmbar e estado vazio ilustrado; (3) captura claro **e** escuro em `.maestri/tmp/shots/design/<tela>-{light,dark}.png` via `node scripts/persona/design-shots.mjs`; (4) foco visível percorrendo a tela com Tab; (5) passa nas lentes craft, acessibilidade AA, usabilidade e microcópia pt-BR (UX-GUIDE §4).

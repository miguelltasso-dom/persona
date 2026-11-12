# Artes do DESIGN-01 — lotes para o Brush (Muse, 11/11)

**Pedido:** do Miguel via Atlas: "usar MUITO o Brush". A Muse aprova cada peça e a registra no `build-assets`.

**Regra:** só pedimos o que falta. Antes de cada pedido, o inventário (`persona-assets/`) mostra o que já existe:
- **poses:** 14 estados × 16 bichos, mais 4 estados extras para 5 bichos;
- **ícones próprios:** 46 de ação, 28 de navegação, 8 de estado e 46 de UI do fio;
- **ilustrações:** ~60 estados vazios e spots;
- **os 4 vazios noturnos** desenhados para a v1.2.

**Estilo de tudo:** o model sheet `dirD`; nanquim de 1,5 px; papel creme; sombra lilás no chão; a paleta da casa. **Sem texto dentro da arte** (o texto vem da tela, por causa da tradução).

## Lote 0 — já existe, só registrar (Muse, agora)
| Peça | Origem | Uso |
|---|---|---|
| `empty-kanban-noite`, `empty-routines-noite`, `empty-connections-noite`, `empty-search-noite` | `concepts/v1.2/` (já aprovados) | os vazios do tema escuro (o Projetos/Quadro, as Rotinas, as Conexões, a busca do Ctrl+K) |
| `empty-sem-arquivos` | já registrado (11/11) | Arquivos |

## Lote 1 — para a ONDA 1 (Prism, Flint), a prioridade
| # | Peça | Especificação | Uso (DESIGN-01) |
|---|---|---|---|
| 1.1 | **Pose `comemorando` para os 13 bichos que não têm** (capivara, cervo, coelho, coruja, guaxinim, lobo-guará, lontra, mico-leão-dourado, ouriço, panda, raposa, tamanduá, tucano) | O mesmo enquadramento, escala e chão das `*-comemorando.png` que já existem (atlas, bento, nina, sol, luna). Os braços para cima ou um pulinho; sem confete desenhado (as patinhas vêm da tela). PNG transparente, mesmo tamanho das poses atuais. | O momento uau 1 (a primeira entrega), a entrega pronta na faixa, o fim do bastão (uau 2), os marcos. Hoje, 13 dos 18 bichos não conseguem comemorar. |
| 1.2 | **O jogo de ícones de UI da Persona** (substitui os traços genéricos de `UiIcon`): `send, plus, image, attach, smile, at, bell, help, search, close, check, clock, sparkle, copy, more, alert, info, lock, eye, file, arrowRight, baton, minus, chevronDown, chevronRight` (25) | SVG 24×24, **só traço** (`stroke="currentColor"`, 1,75, pontas e cantos redondos, sem preenchimento e sem cor fixa), para acompanhar o tema e o `strokeWidth` da tela. A mão do Brush: uma leve irregularidade de nanquim, mas que continua legível a 16 px. `chevron` e `close` podem ser quase geométricos. Os mesmos nomes de arquivo, em `icons/ui-glyphs/`. | O composer (enviar, anexar, imagem, emoji, menção), o rodapé do rail (a ajuda), as Aprovações (aprovar/fechar), as Rotinas (relógio), o bastão do Gestor. É o "ícone próprio no lugar do genérico". |
| 1.3 | **A luminária APAGADA do rail** | Uma cópia de `rail-foliage-dark@2x.png` idêntica pixel a pixel, mas com a luminária desligada (a cúpula escura, sem o brilho âmbar e sem a luz no chão). Mesmo tamanho. | O momento uau 5: no escuro, ao abrir, crossfade único apagada → acesa (420 ms, 1 vez) e depois parada. |

## Lote 2 — para a ONDA 2 (Lumen, Quill), depois do rail do Prism
| # | Peça | Especificação | Uso |
|---|---|---|---|
| 2.1 | **A Memória da empresa › Resumo vazio** (o "Comece aqui") | A Nina (a de Pesquisa) organizando um fichário de cartões coloridos em cima da mesa, com uma lupa pequena ao lado. 960×720 + noite (luz da luminária vindo da esquerda) + small. | A Memória unificada (§3 #16): substitui "O bibliotecário" (`bibliotecario.png` sai de uso). |
| 2.2 | **Os vazios noturnos que faltam** | `empty-sem-arquivos-noite`, `empty-primeiro-projeto-noite`, `empty-equipe-remota-noite`, `empty-uso-indisponivel-noite`: as mesmas cenas, com a luz âmbar da esquerda, como em `empty-geral-noite`. | Arquivos, Projetos, Membros/Conexões e Uso no escuro. |
| 2.3 | **"Giro da manhã da equipe"**: um ícone 48 px | Um sol nascendo atrás de 3 rostinhos genéricos (sem espécie), traço de 1,5 px, claro e escuro. | O grupo recolhível das rotinas automáticas (§3 #14). |

## Lote 3 — os MOMENTOS UAU e o primeiro uso de 3 min
| # | Peça | Especificação | Uso |
|---|---|---|---|
| 3.1 | **O cursor de lápis da Mesa de Luz** | Um lápis âmbar com contorno ameixa, 32×32 (desenhe a 128), em SVG + PNG; a ponta no canto inferior esquerdo (hotspot 2,30). | O momento uau 4 (circule e fale). |
| 3.2 | **A trilha de patinhas** | Um SVG horizontal de 64×8 que repete sem emenda (as patinhas alternadas), traço `currentColor`. | O separador ONTEM/HOJE do Bom dia (uau 5). |
| 3.3 | **A cena de chegada do onboarding** | A porta do escritório aberta com a luz quente saindo, chão de madeira e um capacho, **sem bichos** (os bichos são as poses `acenando`, compostas pela tela por cima). 1440×480, claro e escuro. | O passo 1 do primeiro uso: a equipe chegando (stagger de 50 ms). |
| 3.4 | **A alça do Antes · Depois** | Um puxador circular de 32 px com duas setinhas ‹ ›, contorno ameixa e fundo creme, em SVG. | O comparador do momento uau 3. |

## Como a Muse aprova
Primeiro vejo cada peça no creme e na noite `#1E1526`, ao lado de uma pose existente (para escala e traço). Depois registro no `build-assets` e aviso o dono da tela. Peça com texto, com cor fora da paleta ou com traço diferente volta ao Brush com o motivo.

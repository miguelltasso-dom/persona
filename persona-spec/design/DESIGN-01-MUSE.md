# DESIGN-01 · Resposta da Muse (dona do design system) · 11/11

**Lido:** `persona-spec/carbon/DESIGN-01.md` inteiro (332 linhas, 50 KB).
**Faltam no arquivo:** o **TOP 20**, os **5 momentos uau** e o **primeiro uso em 3 min**. O texto termina na regra 6 do orçamento de GPU (§2.7). Respondo a eles quando chegarem; até lá, valem como "a definir" e o Keel não distribui nada deles.

**Resumo:** o diagnóstico do Carbon está certo em quase tudo. Conferi no código os pontos que dava para conferir:
- o `.halo` de 90 px com raio de 90 px;
- o `.hostStatusButton` sem tema escuro;
- os tokens de movimento atuais.

Aceito a tese ("falta edição, rigor espacial e física, não identidade") e o sistema de movimento, com ajustes de valor. Recuso só o que conflita com a Direção D ou com o que o Miguel ama: **a luz da luminária fica (estática); os enfeites e a folhagem ficam; os vaga-lumes ficam (parados)**.

Legenda: **ACEITO** como está · **AJUSTO** com a especificação final · **RECUSO** com o motivo.

---

## 0. Regras que esta resposta fixa (valem para todo o produto)

1. **Selo "Recomendado":** some de toda escolha de preferência (motor, modelo, esforço, contas, troca de conta). Fica SÓ onde uma opção evita perder dados (o conflito do Revisar: "Manter os dois"). Nos outros lugares, a opção segura vem selecionada e em primeiro, sem selo.
2. **Um vocabulário de estado da persona:** o mesmo em todo lugar (o rail, a faixa, os cartões, o organograma, a DM), com a mesma cor e o mesmo texto:
   - `Trabalhando` verde;
   - `Revisando` verde;
   - `Esperando você` âmbar, com tinta escura;
   - `Num rascunho` lilás;
   - `Disponível` (acordada, sem tarefa, dentro do horário): anel lavanda;
   - `Descansando` (dentro de uma Janela de silêncio, ou com a equipe pausada): lua pequena;
   - `Pausada` cinza;
   - `Sem motor` (desconectado): anel cinza tracejado.
   - **A bolinha verde do rail deixa de significar "o app está pronto";** ela passa a mostrar o estado acima. Isso acaba com a contradição do §1.0.3.
3. **Nomes de lugar:**
   - "Memória da empresa" é o lugar, com as abas `Visão geral · Páginas · Regras da casa · Importar`;
   - "Cofre" e "Segundo cérebro" deixam de ser nomes de tela;
   - "Regras da casa" (e não "Combinados e regras"), porque é o termo do D-104 ("virar regra da casa").
4. **"Nada esperando por você"** é a forma única.

---

## 1.0 Defeitos transversais do shell

| # | Veredito | Especificação final |
|---|---|---|
| 1 Halo quadrado | **ACEITO** (bug meu, do tema noturno) | `.halo { background: radial-gradient(closest-side, rgb(242 186 110 / .35), transparent) }`: o gradiente termina dentro da caixa. Prova: a borda da caixa a 0% de alfa. |
| 2 Pílula `Claude · —` branca no escuro e muda | **ACEITO** | `.hostStatusButton` usa `var(--persona-card)` no escuro. O texto diz o estado: `Claude · pronto` / `Claude · conectando…` / `Claude · sem login` (e o `—` nunca aparece). |
| 3 Verde no rail × dormindo no palco | **ACEITO**, via a regra 0.2 | — |
| 4 Rodapé do rail assimétrico | **AJUSTO** | Uma fileira só, de 3 alvos de 40 px: `Configurações` (ícone + rótulo), a luminária no centro (decorativa, `aria-hidden`) e `Ajuda` com o ícone `?` (e não o livro). Espaçamento igual de 8 px. A luminária NÃO sai: ela é a fonte da luz do escuro. |

## 1. As 24 cenas

| Cena | Veredito | Especificação final / motivo |
|---|---|---|
| 01 Visão geral | **AJUSTO** | (a) "Precisa de você" vazio vira uma faixa de 64 px: `✓ Nada esperando por você`. (b) "Agora": as personas `Disponível` viram UMA linha (rostos empilhados de 28 px + `5 prontos para começar`), e só quem trabalha, revisa ou espera ganha um cartão. (c) A tarefa sugerida vem do perfil real da empresa, nunca de um exemplo jurídico fixo, e o botão é `Pedir a {Coordenação} agora` (envia e abre o fio). Sem perfil da empresa, o bloco não aparece. |
| 02 #geral | **AJUSTO** (versão final em §3 #01) | (a) A faixa recolhe para 56 px **quando o fio precisa do espaço**, isto é, quando há rolagem; ela abre quando não precisa ou quando a pessoa pede (`Mostrar a equipe`). A versão recolhida mostra os rostos de 36 px com a pílula de estado. Tem 220 ms de `transform` (FLIP); em reduced-motion, um corte seco. (b) A pílula de rostos do cabeçalho some enquanto a faixa grande está visível. (c) `zZz` no escuro: tinta `--persona-cream-100` com contorno de 1 px `plum-900` (contraste ≥ 3:1). (d) A folhinha (`MessageSprig`) sai dos balões comuns e fica só no `Bom dia` e nos marcos (aceito o §3 #04 do Carbon). |
| 03 DM | **AJUSTO** | A coluna "Mensagens diretas" sai quando o rail mostra PESSOAS (> 960 px): clicar no nome abre a conversa em largura total. A ≤ 960 px, o rastro de 64 px já tem os rostos, e a coluna também sai. A mesma ordem de pessoas no app inteiro: Coordenação primeiro, depois a ordem de contratação. O estado do topo da DM segue a regra 0.2. O seletor `Modelo · Esforço` no composer da DM é o chip que já existe (EFF-1), sem controle novo. A luz do escuro passa a ser contínua a partir do rail. |
| 04 Projetos + 05 Quadros | **AJUSTO** | Uma entrada só, **Projetos**. Com 1 projeto, abre direto o quadro, com `Pessoal ▾` + `+ Novo projeto` no cabeçalho. Com 2 ou mais, cada cartão mostra a equipe (rostos), a pasta, a barra do fluxo e "precisa de você". A aba "Quadros" sai. Um só trilho de filtros (o de baixo vira chips leves, não o mesmo trilho afundado). |
| 06 Arquivos | **ACEITO** | Sobretítulo `TRABALHO · {projeto}`; 2 ações (`Escolher pasta` + `Criar pasta em Documentos/Persona`). Arte própria: **já existe** a `empty-sem-arquivos.png` (a pasta com a folha voando), e é só ligá-la (o Lumen, na onda 2). |
| 07 Rotinas | **ACEITO** | Mais: o pulso automático vira 1 linha recolhível com os rostos; o horário é escalonado de verdade (host, Bolt); a semana mostra pílulas por dia. O ícone da equipe (aceito no 6c) fica só para a rotina do sistema; a rotina de uma persona usa o rosto dela. "Iniciativa de X" vira "Giro de X". |
| 08 Canvas | **ACEITO** | Malha de pontos 1,5 px / 24 px em `--persona-outline-soft`; o `fitView` na abertura; a dica de teclado só com foco por teclado; e uma rolagem só. |
| 09 Equipe › Personas | **ACEITO** | Mais: pose `disponivel` (existe para os 16 bichos, com piscar e rabo) quando ela está pronta; chips `Claude · Haiku`; `Conversar` · `Perfil` no hover/foco (e sempre visíveis no toque). |
| 10 Quem cuida de quem | **ACEITO** | Leque horizontal simétrico; conectores de 2 px, raio de 12 px; tracejado âmbar no "Braço direito". Os 3 grupos de abas viram 1 (os outros 2 viram um segmentado pequeno dentro da tela). |
| 11 Saúde | **AJUSTO** | O texto do veredito: "Tudo espera a sua aprovação. Se você ficar 2 dias fora, a equipe para no primeiro dia." Um avatar de 32 px por linha; diagnósticos iguais agrupados, com um botão sticker real `Subir {n} personas para "Decide o rotineiro"` e a prévia `Nota 76 → {n}` **só se o host calcular** (sem número inventado). |
| 12 Cofre + 13 Segundo cérebro | **AJUSTO** | Viram a **Memória da empresa** (regra 0.3). "O bibliotecário" sai: quem organiza é uma persona real (a de Pesquisa, se houver, senão a Coordenação). Os tipos com 0 viram chips `+ Novo {tipo}`. `Comece aqui` mostra as 3 primeiras linhas reais. |
| 14 Regras | **AJUSTO** | Nome: **Regras da casa**. Subtítulo: "O que a equipe resolve sozinha, quando fica em silêncio e o que nunca faz sem você." 3 receitas de 1 clique, **sem emoji** (ícones do set `UiIcon`): `Silêncio das 20h às 8h` · `Confirmar antes de falar com cliente` · `Nunca aprovar gasto sem mim`. Arte própria (Brush) no lugar da 3ª repetição do Atlas de prancheta. |
| 15 Aprovações | **ACEITO** | Mais o `Ver decisões recentes` (gaveta com as últimas 20, com Desfazer quando o host permitir). |
| 16 Config › Personas | **ACEITO** | Mais: as linhas de 64 px com acordeão de 220 ms (`grid-template-rows: 0fr → 1fr`, sem animar `height`); 1 banner de pasta no topo; os `<select>` crus viram o `Select` do design system; o chip `Claude · Haiku · medium ▾`. E o interruptor sem pasta aparece DESLIGADO e desabilitado (a ressalva v1.1.x). |
| 17 Revisão antes de entregar | **ACEITO**, condicionado ao host | O `Switch` + `Quem revisa ▾` voltam quando o `setReviewPolicy` estiver ligado de verdade (Forge, staging A). Até lá, a frase estática fica, porque um controle falso é pior que nenhum. A guilhotina no topo da rolagem: `mask-image` de 12 px no topo do corpo rolável. |
| 18 Conexões | **ACEITO** | As ferramentas conectadas no topo; a troca de conta só aparece com 2+ contas; sem "Recomendado" (regra 0.1); `C+` vira o ícone de marca monocromático; `claude` vira `Conta do Claude neste computador`. |
| 19 Uso e limites | **ACEITO** | "Conferindo…" termina em ≤ 2 s; os motores não conectados vão para um grupo recolhido; o placar local real (chamadas, tokens, por persona e por modelo; **sem US$ para assinatura**, D-092). |
| 20 Membros | **ACEITO** | Sem `owner@workspace.local` (fica o nome + "Neste computador"). Sem equipe remota, um estado calmo ilustrado; o `Convidar por link` só aparece com a remota ligada. |
| 21 Importadores | **ACEITO** | A aba `Importar` na Memória; badges `1`/`2` em `--persona-wash-strong`, e o âmbar só no botão da vez; o bloco do pedido sem fade que apague texto (rola, com o botão Copiar). |
| 22 Aparência + 23 Personalidade | **ACEITO** | Uma aba só, **Aparência**: o tema (miniatura de 100% da largura, 16:9), as figurinhas (leque de 3 reais de 48 px, a -4°/2°/6°, em lavanda quando desligado), as dicas de atalho e o som ao concluir (desligado por padrão). Configurações fica com 6 abas. |
| 24 Sobre | **ACEITO** | `<AboutPersona>` inline, com a versão instalada; o `Procurar atualizações` só se o Rivet tiver o canal (hoje não há atualização automática: sem canal, `Baixe a nova versão em…`); o atalho certo. |
| Fio real | **AJUSTO** | Os itens 1, 2, 3, 6 e o jargão já foram para o host ou o Flint (P0-2/P0-3, D-103c). Para o resto: (a) a opinião consolidada recolhe numa pílula de 48 px `Téo ouviu Bia e Lia · 2 ajustes`, e reabre com 1 clique; (b) a imagem de REFERÊNCIA aparece pequena (96 px) e a arte da persona grande (até 320 px); (c) os rostos de 24 px na linha de passagem sobem para 28 px, com o anel no tom da ORDEM DE CONTRATAÇÃO (o mesmo do #17; um hash do cargo colidiria entre duas personas da mesma função); se ainda assim dois forem iguais, o nome vem antes da seta; (d) o `DeliveryCard` traz a miniatura de 240 px da arte final + `Revisar e aplicar`. Os "≤ 7 blocos" são uma META de leitura e não uma regra de corte: um fato tipado nunca some (EQUIPE-REAL §0). |

---

## 2. O sistema de movimento

### 2.1 Princípios
**ACEITO** os 5. O 5 (repouso = 0 animações) vale **com a luz da luminária ESTÁTICA visível**: luz parada não é animação, então ela fica.

### 2.2 Curvas: AJUSTO os nomes para não quebrar o que existe
O código usa `--ease-standard/enter/exit/spring` hoje. Troco os VALORES e acrescento os novos:

| Token | Valor final | Mudança |
|---|---|---|
| `--ease-press` (novo) | `cubic-bezier(0.2, 0, 0, 1)` | o valor antigo do standard vira o press |
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` | era `(0.2,0,0,1)` |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | era `(0,0,0.2,1)` |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | igual |
| `--ease-spring` | `cubic-bezier(0.32, 1.14, 0.54, 1)` | era `(0.34,1.25,0.64,1)`: menos quique, ACEITO |
| `--ease-carry` (novo) | `cubic-bezier(0.25, 0.9, 0.3, 1)` | — |

### 2.3 Durações: AJUSTO, mantendo os nomes que existem
| Token | Hoje | Final |
|---|---|---|
| `--motion-instant` | 80 ms | **90 ms** |
| `--motion-fast` | 140 ms | **150 ms** |
| `--motion-panel` (novo) | — | **160 ms** |
| `--motion-message` (novo) | — | **180 ms** |
| `--motion-base` | 220 ms | 220 ms (o modal e o indicador usam **200 ms** explícitos, como no DESIGN-01) |
| `--motion-slow` | 360 ms | 360 ms |
| `--motion-celebrate` (novo) | — | **320 ms** o carimbo / **680 ms** as partículas |
| `--motion-character` | 700 ms | 700 ms (só na entrada do onboarding) |
| `--motion-reduced-fade` | 120 ms | **100 ms**, `linear` |

O resto da tabela 2.3 está **ACEITO** como está: a mensagem nasce do composer, o streaming em lotes de 32 ms, o cursor só durante o `streaming`, a troca de pose, o carimbo, e as patinhas com cooldown de 3 s.

### 2.4 Coreografia
**ACEITO**: o teto de stagger `min(i·35, 175)`; o stagger só na 1ª montagem; a aprovação em 2 tempos; o pedido → plano → faixa.

### 2.5 Interrupção
**ACEITO** os 3 pontos.

### 2.6 Reduced motion e alto contraste
**ACEITO**, com um ajuste: em `forced-colors` os enfeites `HouseDecor` e a folhagem do rail somem, como o Carbon pede (o sistema manda). Em `prefers-reduced-motion` eles **ficam**, parados, porque não se mexem.

### 2.7 GPU: o veredito por regra
| Regra | Veredito |
|---|---|
| 1 Matar `lampBreathe` | **ACEITO**: a animação sai, e **a luz fica, estática** (o que o Miguel ama). |
| 2 Sem blur contínuo | **ACEITO**. O scrim sólido: `rgb(36 22 48 / .56)` no claro e `rgb(8 4 12 / .72)` no escuro. É fundo de modal, não está atrás de texto da tela, então não fere a regra do translúcido. |
| 3 Pausa tripla | **ACEITO**, e o atributo único `data-persona-ambient-paused` conserta os seletores desconectados. Ociosidade de 15 s. |
| 4 Sem `personaBreathe` em quem está parado | **ACEITO**. `Disponível`: piscar em `steps` a cada 7–11 s, só com a janela focada. `Descansando`: a pose dormindo, parada (o `zZz` é desenho, sem animação). Movimento contínuo só para quem trabalha ou revisa. |
| 5 No máximo 2 contínuas | **ACEITO**. Os vaga-lumes viram pontos estáticos de tamanhos diferentes. Nada de fade de 4 s: a troca de tema já é um momento, e o fade a mais é ruído. |
| 6 Gate `preaccept-gpu` | **ACEITO**. Entra no `preaccept-probe` (o Ember), como verificação 14. |

---

## 3. O que RECUSO (e por quê)
1. **Tirar a luminária do rodapé do rail** (que estaria implícito na simetria do §1.0.4): RECUSO. Ela é a fonte física da luz noturna (NIGHT-THEME §5) e o Miguel ama.
2. **Recolher a faixa por contagem de mensagens** (≥ 3): RECUSO o gatilho por contagem e troco pelo gatilho por ESPAÇO (há rolagem no fio). Na prática recolhe quase nos mesmos casos, mas pela razão certa, e nunca num canal curto onde a faixa cabe (§3 #01).
3. **Emojis nas receitas das Regras** (🌙 💬 💸): RECUSO. O app usa o set de ícones próprio; emoji quebra o traço nanquim.
4. **"Combinados e regras"**: RECUSO o nome; fica **Regras da casa** (D-104). E **"Cofre" sai da Memória**: "Cofre" já é o cofre de SENHAS (persona-vault), e o mesmo nome para duas coisas é exatamente a confusão que o Carbon apontou.
5. **Cortar o fio em ≤ 7 blocos**: RECUSO como regra; é uma meta. Um fato tipado nunca some (EQUIPE-REAL §0).
6. **Prévia `Nota 76 → 94` sem cálculo do host**: RECUSO número estimado na tela; só com o host.

## 4. Donos sugeridos (o Keel distribui)
- **Muse (eu):** os tokens de movimento e as curvas em `persona-palette.css` + `tokens.ts`; o `.halo`; o vocabulário de estado (regra 0.2) como tokens + spec; o pedido ao Brush (spot de Arquivos, arte de Regras da casa).
- **Prism:** shell, rail, faixa recolhível, DM sem a 2ª coluna, pausa tripla e GPU.
- **Lumen:** Projetos unificado, Rotinas, Canvas, Memória da empresa, Saúde.
- **Quill:** Configurações (6 abas, Personas em linhas, Conexões, Uso, Membros, Sobre).
- **Flint:** o fio (opinião recolhida, entrega com miniatura, rostos da passagem) e o composer.
- **Ember:** Aprovações (decisões recentes) + o gate de GPU no pré-aceite.
- **Carbon:** a 2ª leitura visual dos lotes antes do meu aceite.

## 5. As seções 3 a 5 do Carbon (lidas na versão de 640 linhas)

### 5.1 As duas mudanças de estrutura (a minha opinião firme, como o Atlas pediu)

**#06 · A DM direto pela barra única: ACEITO, com 4 condições.**
É a mudança certa: a 2ª coluna repete os mesmos 5 nomes, e o rail já é a lista de pessoas. As condições garantem que nada da coluna se perde:
1. **O rail herda o que a coluna dava:** cada linha de PESSOAS mostra a bolinha de não lidas (o número até 9, depois `9+`) e o estado da regra 0.2. Com algo esperando a pessoa, a linha ganha o ponto âmbar. Sem isso, a coluna não sai.
2. **A mesma largura de leitura do #geral:** a coluna de mensagens com o mesmo `max-width` do #geral, e nenhuma largura nova (o Carbon pedia 920 px; o que vale é a consistência entre as duas telas). A luz do escuro fica contínua a partir do rail.
3. **O rastro de 64 px (≤ 960 px):** os rostos com o ponto de não lidas; o clique abre a DM. A coluna também não volta ali.
4. **Ordem estável:** a Coordenação primeiro e depois a ordem de contratação, sem reordenar por atividade (a memória espacial vale mais que a recência; a recência vai para o `Ctrl+K › Recentes`). Com 12+ personas, a seção PESSOAS rola por dentro, com o grupo recolhível que já existe.

**#10 · A fusão de Projetos + Quadros: ACEITO a fusão, e AJUSTO a abertura.**
Duas telas-índice quase iguais são o pior desperdício do app. Mas "cair direto no quadro" só é certo com UM projeto: com vários, a pessoa perderia a visão do todo. A spec final:
1. **O lugar se chama Projetos e abre no QUADRO do último projeto usado** (ou do único). O cabeçalho tem o seletor `Pessoal ▾` + `+ Novo projeto`.
2. **O seletor tem, no fim, `Ver todos os projetos`:** a grade de cartões (equipe em rostos, pasta, barra do fluxo, "precisa de você"). Assim o índice existe, mas deixa de ser a porta de entrada. A aba "Quadros" sai.
3. **As abas dentro do lugar mostram o projeto da vez:** `Quadro · Arquivos · Canvas` são do projeto escolhido. **Rotinas** só fica aqui se for por projeto. Se a rotina for da equipe toda (o giro da manhã, o Bom dia), ela vai para **Equipe**, porque uma aba com o nome do projeto mostrando coisa da equipe toda engana.
4. **Projeto vazio:** o quadro com as colunas vazias e um convite único: `Peça a primeira tarefa no #geral` (sem um índice vazio no lugar).

### 5.2 O TOP 20
| # | Veredito | Especificação final / motivo |
|---|---|---|
| 01 Faixa adaptativa | **AJUSTO o gatilho** | Ela recolhe quando o fio tem rolagem, e não por "≥ 3 mensagens" (§3, recusa 2). A barra de 56 px, os rostos de 36 px e a pílula viva (`Bia · escrevendo o texto`) estão aceitos. O botão `Palco ▾` vira `Mostrar a equipe` (é o que ele faz). No #geral, a pílula de rostos do cabeçalho NÃO aparece nunca, porque a faixa ou a barra de 56 px sempre mostra os mesmos rostos (decisão de 11/11, depois da captura do Prism). Uma mensagem nova nunca reabre a faixa. Sem a janela de silêncio vinda do host, todo mundo ocioso fica `Disponível`. |
| 02 GPU zero | **AJUSTO 1 ponto** | O balanço `translateY(-2px) 1800ms infinite` para quem trabalha fica, mas **no máximo 2 figuras ao mesmo tempo** (a regra 5): a 3ª em diante mostra a pose `trabalhando` parada. O resto está aceito: a luz estática, a pausa tripla, o fim do blur. |
| 03 Composer | **AJUSTO a pílula** | (1) o chip único, (3) o Ctrl+V e (4) a dica que se dispensa sozinha já estão no tree (Flint, D-103c). (2) A pílula `Modelo · Esforço` mostra a configuração DA PERSONA que responde e abre o diálogo do EFF-1 dela, com a linha "Vale para as próximas tarefas de {nome}". Não é uma escolha por mensagem (esse contrato não existe), e ela só aparece quando "Quem responde" é uma persona definida (na DM, sempre; no #geral, não quando a Coordenação distribui). |
| 04 Fio limpo | **ACEITO** | Uma imagem raster nunca é ampliada além do tamanho real: o SVG da persona aparece pelo próprio arquivo (vetor) e o raster pede ao host um thumb de 640 px. O chip de referência usa o ícone `attach`, sem emoji. A folhinha sai dos balões, como eu disse na cena 02. |
| 05 Bugs do escuro | **ACEITO a versão do Carbon** (melhor que a minha) | O `.halo` de 120 px com `closest-side` em 3 paradas; o `HALO_SIZE = 120`. O texto da pílula: `Claude · pronto` (o Claude, masculino). O `zZz` por `mask-image` com `--persona-ink`. |
| 06 DM pela barra | **ACEITO com 4 condições** | §5.1. |
| 07 Mesa de Luz | **ACEITO, com 3 ajustes** | (a) O botão: `Marcar na imagem` (sem ✏️). (b) Acessibilidade: um caminho sem ponteiro, `Adicionar um ponto`, que coloca o marcador no centro e o move com as setas (Shift = 10 px), com Enter para escrever a nota. (c) O que vai para o autor ([a arte, a arte marcada, as notas]) precisa de contrato no host (Forge). Sem ele, a tela não sai. |
| 08 Configurações em 5 abas | **ACEITO** | `Conexões · Personas · Uso e limites · Aparência · Sobre`. Membros entra como o cartão "Equipe à distância" em Conexões e só vira aba com a equipe remota ligada. A Revisão religada depende do host (como na cena 17). |
| 09 Visão geral viva | **ACEITO, com o texto ajustado** | O banner de 76 px: o rosto da Coordenação (não um "Atlas" fixo) + `Nada esperando por você` (regra 0.4; sem "a bancada está em dia"). O botão `Pedir a {Coordenação} agora`. O pedido sugerido vem do perfil da empresa e, sem perfil, não aparece. |
| 10 Projetos + Quadros | **ACEITO a fusão, AJUSTO a abertura** | §5.1. |
| 11 Ctrl+K como modal | **ACEITO** | "Fazer agora" usa SÓ as ações que já existem (Prism 11/11); "Recentes" fica de fora até o host dar as conversas recentes. A busca abre por cima da tela, sem desmontá-la. Os atalhos 1–9 só valem com a paleta aberta. A mensagem achada leva o destaque de 900 ms uma vez (em reduced-motion, só a borda). |
| 12 Conexões | **ACEITO** | Os selos de capacidade são o "selo honesto" do D-103a e usam `UiIcon` (sem os glifos ✓/⚠ como texto). |
| 13 Uso e limites | **ACEITO** | O marcapasso (D-104) informa, sem mandar: `14% livre até as 18:00 · Modo econômico disponível`, e não "sugerido". Tokens sim, US$ nunca na assinatura (D-092). |
| 14 Rotinas | **ACEITO** | O nome do grupo: **"Giro da manhã da equipe"** (e não "Check-up"). A função real de cada persona. A grade semanal com os dados reais. E vale a regra do #10: as rotinas da equipe toda vão para Equipe. |
| 15 Saúde | **AJUSTO o texto, ACEITO a animação** | O texto: "Se você ficar 2 dias fora, {n} colegas param esperando a sua aprovação." O botão diz o que faz: `Subir os {n} para "Decide o rotineiro"`. O velocímetro anima (420 ms) **até a nota que o host RECALCULA depois da ação**, e nunca até um número previsto. |
| 16 Memória da empresa | **AJUSTO os nomes** | As abas: `Resumo · Páginas · Regras da casa · Importar`. Sem "Cofre" (é o de senhas) e sem "Combinados". O "Lembrar como regra da casa" ao pedir ajuste: ACEITO (D-104). |
| 17 Rostos distintos | **ACEITO** | O tom da moldura vem da ordem de contratação (estável, sem depender da espécie) e da paleta `--persona-subject-{0..6}-tint`. O contraste rosto × moldura é ≥ 3:1 no contorno. |
| 18 Organograma em leque | **ACEITO** | — |
| 19 Canvas | **ACEITO** | — |
| 20 Membros + rodapé do rail | **ACEITO** | `Dono · Neste computador`. O rodapé do rail segue o §1.0.4: a luminária fica no centro. |

### 5.3 Os 5 momentos uau
| Momento | Veredito | Ajuste |
|---|---|---|
| 1 A primeira entrega | **ACEITO** | Um botão único em todo o fluxo: `Aplicar e entrar na Persona` (o §4 dizia "Aceitar", o §5 "Aplicar"). O carimbo `Primeira entrega pronta`: peço ao Brush (selo 96 px, claro e escuro, no mesmo traço do `ApprovedStamp`). |
| 2 O bastão ao vivo | **ACEITO** | Só a persona que recebe "salta"; quem entrega volta a `disponivel` sem movimento. |
| 3 A opinião com Antes · Depois | **ACEITO, com acessibilidade** | O comparador é um `role="slider"` com setas (10%) e Home/End. Em reduced-motion não há varredura: um segmentado `Antes · Depois`. Ele precisa da versão anterior vinda do host; sem ela, não aparece. |
| 4 A Mesa de Luz | **ACEITO** | Os mesmos ajustes do #07. |
| 5 O Bom dia | **ACEITO** | O acendimento único da luminária (420 ms, uma vez por abertura) é o único momento em que a luz se mexe: depois, fica estática, como o Miguel quer. O aceno é 1 por manhã. |

### 5.4 O primeiro uso em ≤ 3 min
**ACEITO a regra de ouro** ("zero configuração que não mude a primeira entrega") e o corte dos importadores, dos templates, do assistente e do popover. Os ajustes:
1. **O nome pré-preenchido** só se o usuário do Windows parecer um nome (só letras, 3+ caracteres, fora de `user/admin/pc`). Ele vem selecionado, e o primeiro caractere digitado substitui.
2. **A equipe aparece antes do trabalho:** os bichos são a alma do produto. Depois de `Montar minha equipe`, há um reveal de ~1,5 s com os 5 rostos, os nomes e as funções (stagger de 50 ms) e um link `Trocar alguém`. Escolher sozinha a equipe sem mostrar seria perder o momento mais bonito do app.
3. **A pasta padrão** `Documentos/Persona/{Projeto}` aparece escrita na tela da primeira entrega, com `Trocar pasta`. Nada é criado em silêncio.
4. **A saída sem gastar fica:** `Entrar sem pedir agora` como link secundário. A primeira entrega é um turno pago, e quem não quer gastar agora não pode ficar preso.
5. **A meta de 1 min 55 s é medida, não declarada:** o aceite é a mediana ≤ 3 min em 3 rodadas reais de máquina limpa (exige o OK do Atlas para o gasto) + o fake no CI.

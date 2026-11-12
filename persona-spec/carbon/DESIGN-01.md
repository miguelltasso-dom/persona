# DESIGN-01 · Direção Criativa, Sistema de Movimento e UX de 3 Minutos

**Autor:** CARBON (Crítico-Chefe e Diretor Criativo)
**Para:** Miguel (Dono do Produto), Atlas (CTO), Muse (Design System), Prism, Lumen, Flint, Ember e Brush
**Data:** 11/11/2026
**Escopo auditado:** 48 capturas reais do app instalado v1.1 em `1440×900` (`.maestri/tmp/shots/design/accept-installed/3660c033a5-v11/*-light-1440x900.png` e `.maestri/tmp/shots/design/accept-installed/39b2b6165b-v11/*-dark-1440x900.png`), fio real de equipe (`packages/persona/persona-e2e/artifacts/team10/real-attempt-5-2026-11-09T21-12-08-827Z/m9-fio-final-alto-claro.png`), código-fonte do cliente (`packages/persona/client-ui-persona/src/client/**`) e specs (`REVISAO-01.md`, `DESIGN-SYSTEM.md`, `UX-GUIDE.md`, `UX-BEYOND-T3.md`, `APARENCIA-SPEC.md`, `NIGHT-THEME-SPEC.md`, `BOOT-SPEC.md`, `EQUIPE-REAL-SPEC.md` e `postit-ux-animacao.md`).
**Invariante arquitetural:** 100% das decisões abaixo moram na camada de apresentação, estado de UI e contratos agnósticos do cliente — continuam válidas qualquer que seja o motor/base por baixo (OAR, DSH enxuto ou runtime novo).

---

## Tese de Direção Criativa

A direção de arte da Persona (**"Escritório acolhedor"** — papel creme `#FAF3E4`, noite ameixa `#1E1526`, contorno nanquim `1,5px`, sombra sticker sólida, tipografia Fredoka + Nunito e animais ilustrados pelo Brush) é **original, memorável e anos-luz mais humana que qualquer IDE de agentes do mercado**. O problema da v1.1 não é falta de identidade: é **falta de edição, rigor espacial e física de movimento**. Hoje o app mistura joias visuais (a faixa noturna com lua, a Nina abraçando o livro, os 5 animais reunidos em Aprovações) com vícios de admin corporativo: listas repetindo `"Descansando · Fila vazia · Sem tarefa agora"` quinze vezes na mesma tela, 8 abas espremidas em Configurações onde duas têm 1 switch solitário e uma tem um botão que abre um modal com o mesmo nome da aba, um quadrado luminoso cortado a faca no rodapé de todas as 24 telas escuras (`radial-gradient` com raio errado), a conversa do `#geral` espremida em 350 px verticais e 20+ animações `infinite` moendo 21–37% de GPU com o app parado. Vamos limpar o ruído, devolver ar às superfícies, zerar a GPU ociosa e transformar cada interação num objeto tátil nível **Things 3 + Linear + Arc + Apple**.

---

## 1. Veredito Visual Tela por Tela (24 Cenas Instaladas + Fio Real)

### 1.0 Defeitos Transversais do Shell (presentes nas 24 cenas)
Antes de entrar em cada cena, quatro falhas da moldura (`PersonaSidebar.module.css` e `ConversationsRail.module.css`) contaminam todas as capturas:
1. **Quadrado luminoso recortado a faca no rodapé de TODAS as 24 cenas escuras (`*-dark-1440x900.png`):** em `PersonaSidebar.module.css:818`, `.halo` tem `width: 90px; height: 90px`, mas declara `radial-gradient(90px 90px at 50% 50%, rgb(242 186 110 / 0.35), transparent 70%)`. Em CSS, `90px 90px` são os **raios** (diâmetro 180 px!), então na borda da caixa (`45px` do centro) o gradiente ainda está em ~50% de intensidade com `mix-blend-mode: screen`, desenhando uma aresta quadrada visível sobre a folhagem noturna.
2. **Pílula `Claude · —` branca estourada no escuro e muda nos dois temas:** `.helpButton` e `.settingsFoot` receberam tema escuro (`var(--persona-card)`), mas `.hostStatusButton` (`PersonaSidebar.module.css:515`) foi esquecido em `var(--persona-cream-50)`, gritando em branco puro ao lado do botão escuro `Configurações`. Além disso, `Claude · —` com travessão mudo não diz se está pronto ou quebrado.
3. **Contradição crônica de presença entre o rail e o palco:** nas 24 cenas, `PESSOAS` no rail exibe bolinha verde (`online`/`disponivel`) para Atlas, Bento, Nina, Sol e Luna, enquanto a tela aberta ao lado mostra os mesmos 5 bichos dormindo profundamente com `zZz` e `Descansando`.
4. **Assimetria pesada no rodapé do rail:** botão `Configurações` largo à esquerda, regador/luminária espremido no meio e botão circular de `Ajuda` (ícone de livro sem `?`) solto à direita.

---

### Cena 01 · Visão geral
- **Capturas:** `3660c033a5-v11/overview-light-1440x900.png` · `39b2b6165b-v11/overview-dark-1440x900.png`
- **O que está bonito:** Saudação `Olá!` em Fredoka com sublinhado ondulado âmbar (`Squiggle`), rabiscos sazonais do cabeçalho (`HeaderDoodles`: café/sol no claro, lua/luminária no escuro), folhinha saindo do canto superior direito (`CardSprig`) e hierarquia clara de 1 único CTA âmbar (`+ Nova tarefa`).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Desperdício espacial e repetição robótica em `Agora`:** o cartão `Precisa de você` gasta ~330 px de altura para dizer que não há nada; à direita, o cartão `Agora` repete 5 vezes idênticas `"Sem tarefa agora"` + `"Descansando"` + `"Fila vazia"` (15 strings dizendo "nada acontecendo"), com bolinhas lilás vazias nos avatares.
  - **Sugestão descolada da realidade:** `PRIMEIRA TAREFA SUGERIDA` sugere `"Revisar cláusulas de rescisão no contrato"` (mesmo sem escritório jurídico) e instrui `"Monte sua equipe e peça algo no #geral"`, quando a equipe **já está montada** a 40 px dali.
- **O que Linear / Arc / Things / Apple faria diferente:** **Things 3 ("Today")** colapsaria `Precisa de você` vazio numa faixa serena de `64px` (`✓ Tudo em dia por aqui`) e agruparia quem está ocioso em `Agora` numa única linha viva de retratos empilhados (`5 prontos para começar`), expandindo cartões ricos apenas para quem está *trabalhando*, *revisando* ou *esperando você*. E o botão da tarefa sugerida seria **`Pedir ao Atlas agora`** (1 clique envia e abre o fio), não um redirecionamento passivo.

### Cena 02 · Canal `#geral`
- **Capturas:** `3660c033a5-v11/geral-light-1440x900.png` · `39b2b6165b-v11/geral-dark-1440x900.png`
- **O que está bonito:** A faixa `Sua equipe neste canal` com os 5 animais sobre colinas lavanda (e céu estrelado com lua cheia no escuro) + luz quente da luminária banhando o canto inferior esquerdo no tema noturno é **a peça de maior carisma do produto**.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Efeito "fresta de caixa de correio" na conversa:** cabeçalho (`72px`) + barra de assuntos (`48px`) + faixa da equipe (`264px`) + divisor `Hoje` (`44px`) + composer (`116px`) consomem **~544 px (60% dos 900 px)**. Sobram ~356 px para o fio — a 2ª mensagem da Luna (`17:40` / `19:03`) já nasce **decapitada pelo composer**.
  - **Elenco quadruplicado na mesma janela:** os mesmos 5 rostos aparecem simultaneamente no rail (`PESSOAS`), na pílula espremida do topo direito (5 quadrados colados sem respiro), gigantes na faixa do canal e nos balões/composer.
  - **No escuro (`geral-dark`), os overlays `zZz` somem:** o SVG `plum-900` sobre céu noturno roxo-escuro vira uma mancha preta ilegível (~1,2:1).
  - **Folhinha verde (`MessageSprig`) em todo balão de persona:** repetida em 100% das mensagens, perde valor de detalhe e parece artefato preso na borda.
- **O que Linear / Arc / Things / Apple faria diferente:** **Arc / Slack** manteria a faixa de 264 px aberta na chegada ao canal vazio/início do dia e a **recolheria suavemente num cabeçalho vivo compacto de `56px`** assim que a conversa rolar ou passar de 3 mensagens (com toggle de 1 clique para reabrir o palco completo), devolvendo +208 px de leitura imediata; removeria a pílula redundante de 5 rostos do topo quando o palco está visível; e diferenciaria **"Disponível"** (acordado, atento) de **"Descansando"** (só fora do expediente ou em silêncio).

### Cena 03 · Mensagens diretas (`DM`)
- **Capturas:** `3660c033a5-v11/dm-light-1440x900.png` · `39b2b6165b-v11/dm-dark-1440x900.png`
- **O que está bonito:** Estado vazio acolhedor com retrato grande do Atlas, título claro e 3 prompts iniciais táteis em cartões-adesivo com ícone `sparkle`.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Dupla barra lateral listando as mesmíssimas 5 pessoas lado a lado:** `PESSOAS` no rail (`264px`) + coluna `Mensagens diretas` (`280px`) comem `544px` horizontais para repetir `Atlas, Bento, Nina, Sol, Luna` — e em **ordens diferentes** (`Atlas, Bento, Nina, Sol, Luna` vs `Atlas, Luna, Sol, Nina, Bento`)!
  - **Esquizofrenia de estado do Atlas na mesma captura:** acordado com ponto verde no rail, dormindo enrolado com chip `Descansando` no topo da DM, e acordado sorrindo no meio do estado vazio.
  - **Física de luz quebrada no escuro (`dm-dark`):** a luminária está no rail à esquerda, a coluna intermediária de 280 px é escura/opaca sem luz, e o brilho quente reaparece magicamente à direita depois da parede.
- **O que Linear / Arc / Things / Apple faria diferente:** **Arc / Linear** eliminaria por completo a 2ª coluna `Mensagens diretas` quando `navPlaces` já exibe `PESSOAS` no rail: clicar em `Atlas` sob `PESSOAS` abre direto a conversa de largura generosa (encostada na luminária real do rail!), com seletor rápido de `Modelo · Esforço` e `Autonomia` no próprio composer da DM.

### Cena 04 · Projetos
- **Capturas:** `3660c033a5-v11/projects-light-1440x900.png` · `39b2b6165b-v11/projects-dark-1440x900.png`
- **O que está bonito:** `PlaceTabsBar` superior (`Projetos · Quadros · Rotinas · Arquivos · Canvas`) bem desenhada com indicador adesivo.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Tela 85% morta e sem CTA primário:** não existe botão `+ Novo projeto` no cabeçalho (que só aparece na aba vizinha `Quadros`).
  - **Cartão tautológico:** ícone genérico repetido + título `Pessoal` + chip `Pessoal` + `Abrir quadro →`. Zero rostos da equipe, zero caminho de pasta, zero atividade recente.
- **O que Linear / Arc / Things / Apple faria diferente:** **Linear** jamais separaria `Projetos` e `Quadros` em duas abas irmãs que listam o mesmo cartão `Pessoal`: unificaria numa única entrada **Projetos** onde cada cartão mostra equipe alocada, pasta vinculada, barra de sprint/fluxo e tarefas que precisam de você — ou abre direto o quadro se a pessoa só tem 1 projeto ativo.

### Cena 05 · Quadros (`Kanban` — índice)
- **Capturas:** `3660c033a5-v11/kanban-light-1440x900.png` · `39b2b6165b-v11/kanban-dark-1440x900.png`
- **O que está bonito:** Botão `+ Novo projeto` âmbar bem ancorado e barra de conclusão verde nítida nos dois temas.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Promete Quadros, entrega outro índice de 1 cartão:** quem clica em `Quadros` espera ver colunas (`A fazer · Fazendo · Revisando · Pronto`), não uma segunda listagem de projetos quase idêntica à Cena 04.
  - **Duas barras `Tabs` idênticas empilhadas:** `PlaceTabsBar` no topo e filtro `Todos | Com sprint ativa | Precisa de você` embaixo usam o mesmo estilo de trilho afundado, competindo em hierarquia.
  - **Redundância textual:** `1 de 1 pronta` imediatamente acima de `● 1 concluído`, mais `"Ver tudo por categoria"` flutuando à direita sem moldura de controle.
- **O que Linear / Arc / Things / Apple faria diferente:** Com 1 único projeto (`Pessoal`), **Linear / Things** abriria **diretamente o quadro Kanban vivo** com um seletor leve de projeto no cabeçalho (`Pessoal ▾` + `+ Novo projeto`), poupando 1 clique inútil toda vez.

### Cena 06 · Arquivos
- **Capturas:** `3660c033a5-v11/files-light-1440x900.png` · `39b2b6165b-v11/files-dark-1440x900.png`
- **O que está bonito:** Mensagem de confiança exemplar sobre privacidade local (`"Os arquivos ficam confinados a uma pasta no seu computador. Nada é enviado para a nuvem sem você ver."`) e CTA único `Escolher pasta`.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Eyebrow inconsistente:** dentro do mesmo lugar `Projetos`, as abas vizinhas usam `TRABALHO`, mas `Arquivos` troca o sobretítulo para `EMPRESA`.
  - **Falta contexto de escopo:** não diz de *qual* projeto é essa pasta (`Arquivos · Pessoal`).
  - **Arte repetida:** reutiliza o mesmo Atlas de prancheta da `Visão geral` e de `Regras`, em vez de ilustração própria de pasta/arquivos.
- **O que Linear / Arc / Things / Apple faria diferente:** Exibiria `TRABALHO · PESSOAL` no cabeçalho, ofereceria 2 ações claras (`Escolher pasta existente` + `Criar pasta limpa em Documentos/Persona`) para quem não quer caçar diretório no Explorer, e mostraria abaixo um preview sutil de como o rascunho seguro funciona antes de alterar seus arquivos reais.

### Cena 07 · Rotinas
- **Capturas:** `3660c033a5-v11/routines-light-1440x900.png` · `39b2b6165b-v11/routines-dark-1440x900.png`
- **O que está bonito:** Estrutura limpa com `Semana de 9 a 15 de nov`, botão `+ Nova rotina` e controle global `Pausar equipe` bem explicado.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Violação da regra dos rostos + dados errados:** as 6 linhas usam o mesmo ícone genérico de silhueta dupla em vez do `Avatar` do animal, usam jargão interno (`"Iniciativa de Bento"`, `"Iniciativa de Nina"`), marcam **todas as 6** com o setor errado `Coordenação` e agendam **todas para o exato mesmo minuto (`Todo dia às 9:00`)**!
  - **Calendário semanal fantasma:** os 7 cartões `SEG..DOM` no rodapé estão **100% vazios** e cortados na dobra inferior, apesar de existirem 6 rotinas diárias ativas logo acima (que deveriam povoar todos os dias!).
- **O que Linear / Arc / Things / Apple faria diferente:** **Things 3 ("Upcoming")** agruparia o pulso autônomo padrão numa única linha recolhível com os 5 rostos empilhados (`Giro da manhã da equipe · Dias úteis escalonado 8:40–9:20`), mostraria o retrato real da persona em cada rotina criada pela pessoa e popularia de verdade as colunas `SEG..DOM` com pílulas horárias clicáveis.

### Cena 08 · Canvas
- **Capturas:** `3660c033a5-v11/canvas-light-1440x900.png` · `39b2b6165b-v11/canvas-dark-1440x900.png`
- **O que está bonito:** Nós com contorno sticker, retrato do animal (`Luna`, `Sol`, `Nina`) e controles limpos `Aproximar · Afastar · Ver tudo`.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Texto de manual WCAG colado na testa do canvas:** `"Use Tab para focar cada nó; Enter ou Espaço para selecionar. Prefira a aba Lista para navegação linear."` ocupa uma faixa inteira permanente no topo do quadro.
  - **Falsa superfície espacial:** fundo chapado sem dot-grid de referência para zoom, nós soltos sem relação (`Sol` e `Nina` flutuando sozinhas em coluna) e **duas scrollbars** (uma dentro do canvas e outra na página!).
- **O que Linear / Arc / Things / Apple faria diferente:** **Figma / Apple Freeform** daria ao canvas uma malha de pontos sutil (`radial-gradient` 1,5 px a cada 24 px em `--persona-outline-soft`), zero barra de rolagem interna (pan por arraste/trackpad + minimapa ou `Ver tudo`), centralizaria automaticamente o grafo ativo (`fitView`) e mostraria a dica de `Tab/Enter` apenas num chip discreto no canto inferior quando o foco entrar por teclado.

### Cena 09 · Equipe › Personas
- **Capturas:** `3660c033a5-v11/team-light-1440x900.png` · `39b2b6165b-v11/team-dark-1440x900.png`
- **O que está bonito:** Grade de 3 colunas equilibrada e ilustrações grandes, quentes e expressivas dos 5 animais aninhados.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Cinco cartões mudos e clonados:** todos repetem `Descansando · Fila vazia / Sem tarefa agora / Quem cuida: Você`. Não mostram qual motor/modelo cada colega usa (`Claude · Sonnet`), nem suas skills, nem têm indicação visual de clique (`⋯`, `Conversar`, `Ajustar`).
  - **Contradição com o rail:** todos verdes no rail, todos hibernando nos cartões.
- **O que Linear / Arc / Things / Apple faria diferente:** Exibiria a pose `disponivel` (viva e alerta) quando prontos para trabalhar, adicionaria no rodapé de cada cartão chips informativos reais (`Claude · Haiku`, `2 skills`) e ações rápidas no hover/foco (`Conversar` · `Perfil`), fazendo cada colega parecer único à primeira vista.

### Cena 10 · Equipe › Quem cuida de quem (`OrgChart`)
- **Capturas:** `3660c033a5-v11/orgChart-light-1440x900.png` · `39b2b6165b-v11/orgChart-dark-1440x900.png`
- **O que está bonito:** Conceito humano excelente (`BRAÇO DIREITO` ligando `Atlas` a `Você`, sem jargão de orquestrador).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Três grupos de abas idênticos no topo:** `Personas | Quem cuida de quem | Saúde` + `Por pessoa | Por setor` + `Organograma | Lista`.
  - **Árvore torta em degrau de pasta:** `Atlas` centralizado em cima de um cartão `Você` largo e assimétrico, com `Luna, Sol, Nina, Bento` pendurados verticalmente numa linha lateral fina de `1,5px` à esquerda — desperdiça 65% da largura da tela.
  - **Selo `zZz` preto ilegível no escuro (`orgChart-dark`):** bolinha quase preta espremida na quina do retrato de 40 px.
- **O que Linear / Arc / Things / Apple faria diferente:** Desenharia um **organograma simétrico real em leque horizontal**: `Você` no centro com `Atlas` ao lado como `Braço direito` (ligação tracejada âmbar) e os 4 especialistas distribuídos lado a lado na linha inferior com conectores ortogonais de `2px` e raio `12px`, cabendo inteiro na tela sem parecer árvore de diretórios do Windows Explorer.

### Cena 11 · Equipe › Saúde da equipe
- **Capturas:** `3660c033a5-v11/teamHealth-light-1440x900.png` · `39b2b6165b-v11/teamHealth-dark-1440x900.png`
- **O que está bonito:** O cartão de topo (`76 NOTA DA EQUIPE`, arco âmbar grosso e a ilustração dos 4 animais empilhando caixas juntos) é **nível Duolingo/Apple** — bate o olho e dá vontade de melhorar a nota.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Frase quebrada no veredito principal:** `"Tudo depende de você para aprovar. Se essa pessoa some, a equipe para."` — mistura 2ª pessoa (*"você"*) com 3ª pessoa de template (*"essa pessoa"*).
  - **Quatro linhas copiadas e coladas no `Teste dos 2 dias`:** Sol, Nina, Bento e Atlas repetem literalmente `"Espera sua aprovação — ninguém substitui você. ✨ Subir autonomia dentro de limites"`, sem o retrato do animal na linha e com a ação `✨ Subir autonomia...` sem aparência de botão.
- **O que Linear / Arc / Things / Apple faria diferente:** Corrigiria para *"Se você ficar offline por 2 dias, a equipe para na tarde do Dia 1"*, colocaria o `Avatar` 32 px de cada persona à esquerda, agruparia diagnósticos iguais com um botão sticker real **`Subir autonomia dos 4 para "Decide o rotineiro"`** (com preview do ganho: `Nota 76 → 94`), transformando diagnóstico em ação prazerosa de 1 clique.

### Cena 12 · Memória da empresa › Cofre da empresa (`Conhecimento`)
- **Capturas:** `3660c033a5-v11/knowledge-light-1440x900.png` · `39b2b6165b-v11/knowledge-dark-1440x900.png`
- **O que está bonito:** A ilustração da Nina abraçando o livro aberto é **perfeita** (10/10 em calor, traço e contraste nos dois temas).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Crise de identidade nominal tripla:** o rail diz **`Memória da empresa`**, a aba ativa diz **`Conhecimento`** e o `h1` diz **`Cofre da empresa`**!
  - **Divisão esquizofrênica com `Segundo cérebro`:** o usuário não faz ideia da diferença entre guardar algo no `Segundo cérebro` vs no `Conhecimento / Cofre da empresa`.
- **O que Linear / Arc / Things / Apple faria diferente:** **Notion / Apple Notes** unificaria `Segundo cérebro` e `Cofre da empresa` numa única superfície **Memória da empresa** (com abas simples `Visão geral · Páginas e documentos · Regras · Importar`), usando um vocabulário único em todo o produto.

### Cena 13 · Memória da empresa › Segundo cérebro
- **Capturas:** `3660c033a5-v11/secondBrain-light-1440x900.png` · `39b2b6165b-v11/secondBrain-dark-1440x900.png`
- **O que está bonito:** Campo de busca dedicado e separação clara entre conteúdo e permissões.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Personagem fantasma:** `O QUE MUDOU HOJE` diz **`"O bibliotecário atualizou Comece aqui"`** com ícone genérico — quem é "O bibliotecário" se a equipe só tem Atlas, Bento, Nina, Sol e Luna?!
  - **Deserto de zeros e latifúndios vazios:** cartão `COMECE AQUI` esticado por ~1040 px com uma frase seca (`"Atualizado sozinho a partir das páginas."`); coluna `POR TIPO` exibindo **6 zeros em fila** (`Pessoa 0`, `Cliente 0`, `Projeto 0`, `Processo 0`, `Regra 0`, `Decisão 0` cortada no rodapé).
- **O que Linear / Arc / Things / Apple faria diferente:** Atribuiria a curadoria à coordenadora/pesquisadora real da equipe (ex.: `Nina organizou Comece aqui`), mostraria as 3 primeiras linhas reais do resumo da empresa dentro do cartão `Comece aqui`, e trocaria a coluna de `0`s por chips `+ Novo cliente`, `+ Novo processo`, `+ Nova decisão` até existirem páginas daquele tipo.

### Cena 14 · Memória da empresa › Regras de triagem
- **Capturas:** `3660c033a5-v11/rules-light-1440x900.png` · `39b2b6165b-v11/rules-dark-1440x900.png`
- **O que está bonito:** Foco limpo numa única ação central (`Criar primeira regra`).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Jargão técnico no título e subtítulo:** `"Regras de triagem — Limites de proatividade, silêncio e triagem em linguagem natural"` parece painel de firewall/suporte N1, não regras da casa.
  - **Terceira repetição da mesma ilustração** do Atlas de prancheta, e zero exemplos concretos para destravar a página em branco.
- **O que Linear / Arc / Things / Apple faria diferente:** Renomearia para **Combinados e regras**, trocaria o subtítulo por *"O que a equipe pode resolver sozinha, quando ficar em silêncio e o que nunca fazer"*, e ofereceria 3 receitas prontas de 1 clique abaixo do botão (`🌙 Silêncio das 20h às 8h`, `💬 Pedir confirmação antes de falar com cliente`, `💸 Nunca aprovar gasto sem mim`).

### Cena 15 · Aprovações
- **Capturas:** `3660c033a5-v11/approvals-light-1440x900.png` · `39b2b6165b-v11/approvals-dark-1440x900.png`
- **O que está bonito:** **A melhor cena vazia do app.** Os 5 animais reunidos com o carimbo dourado `✓` (e a luminária acesa ao lado deles na versão `-noite`!) recompensam emocionalmente quem limpou a fila.
- **O que está genérico / poluído / frio / desalinhado:**
  - Micro-inconsistência verbal (`"Nada esperando você"` aqui vs `"Nada esperando por você"` na Visão geral).
  - Sem acesso às **decisões recém-tomadas** (se a pessoa clicou em Aprovar por reflexo há 15 segundos e o toast de 6 s já sumiu, não há aba/gaveta `Recentes` para auditar ou reverter).
- **O que Linear / Arc / Things / Apple faria diferente:** Padronizaria `"Nada esperando por você"` e colocaria um botão ghost discreto `Ver histórico de decisões` no cabeçalho (estilo **Things Logbook**), dando segurança psicológica total para aprovar rápido.

### Cena 16 · Configurações › Personas (topo)
- **Capturas:** `3660c033a5-v11/personas-light-1440x900.png` · `39b2b6165b-v11/personas-dark-1440x900.png`
- **O que está bonito:** Retratos nítidos e descrições curtas compreensíveis nos 3 modos de autonomia (`Sempre pergunta`, `Sugere e espera`, `Decide o rotineiro`).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Muro de formulário repetitivo (5× o mesmo bloco gigante):** repete 5 vezes seguidas o aviso `"Este projeto ainda não tem pasta. Escolha uma pasta para o projeto e as personas poderão salvar arquivos. Escolher pasta"`.
  - **Switch desabilitado enganoso no escuro (`personas-dark`):** `Pode salvar arquivos no rascunho` está `checked` + `disabled`, pintando uma pílula marrom-âmbar turva que parece ligada/quebrada ao lado do `Pode contratar` desligado.
  - **`<select>` crus com visual de navegador** em `Até 6 pedidos a colegas por dia` e `Até 2 rodadas de opinião por tarefa`, violando `DESIGN-SYSTEM.md §9`.
  - **Chip `Haiku` mudo:** não mostra o motor (`Claude`), não mostra o esforço (`medium`) e não tem chevron `▾` indicando que abre o seletor de modelo.
- **O que Linear / Arc / Things / Apple faria diferente:** Colocaria **1 único banner `Escolher pasta do projeto` no topo**, exibiria as 5 personas como linhas compactas de `64px` (Rosto + Nome/Cargo + Pílula `Claude · Haiku · medium ▾` + Segmented de Autonomia) que expandem em acordeão suave (`220ms`) apenas para ajustes finos de limites, cabendo a equipe inteira sem rolar!

### Cena 17 · Configurações › Personas (rodapé · Revisão antes de entregar)
- **Capturas:** `3660c033a5-v11/personasReview-light-1440x900.png` · `39b2b6165b-v11/personasReview-dark-1440x900.png`
- **O que está bonito:** A frase de transparência de custo (`"Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota."`) é exemplar.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Controle falso / estático em tela de Configurações:** o cartão `Revisão antes de entregar` **não tem nenhum Switch nem seletor de revisor** (`ConnectedPersonasSettings.tsx:48` cortou o controle)! A pessoa lê que está gastando +1 tarefa por entrega e **não consegue desligar**!
  - **Corte seco no topo da rolagem:** o cartão de cima aparece guilhotinado sob a barra `PlaceTabsBar` sem `mask-image` superior nem respiro.
- **O que Linear / Arc / Things / Apple faria diferente:** Jamais exibiria uma política pagante em Configurações sem interruptor funcional: traria o `Switch` real (`Revisar entregas antes de mostrar para você`) + seletor `Quem revisa: Coordenação (Atlas) ▾`, sincronizado de verdade com o host por projeto.

### Cena 18 · Configurações › Conexões
- **Capturas:** `3660c033a5-v11/connections-light-1440x900.png` · `39b2b6165b-v11/connections-dark-1440x900.png`
- **O que está bonito:** Subtítulo tranquilizador (`"Você entra com o login delas, e as senhas não saem daqui"`) e `ChoiceCards` bem desenhados com selo `✓`.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Hierarquia invertida (o secundário engole o principal):** a configuração avançada de failover multi-conta (`Quando uma conta chegar ao limite`) ocupa 60% do topo da página **antes mesmo de mostrar as contas conectadas**, que ficam espremidas e cortadas na dobra inferior! Com apenas 1 conta conectada, configurar "trocar para a próxima conta" primeiro não faz sentido.
  - **Selo `Recomendado` proibido pela `EFFORT-SPEC` / `postit #9`:** continua aparecendo em âmbar forte dentro de `Perguntar antes de trocar`.
  - **Ícone improvisado `C+` e id técnico minúsculo `claude`:** no lugar do símbolo oficial limpo do motor e de um rótulo humano (`Conta local do Claude`).
- **O que Linear / Arc / Things / Apple faria diferente:** Mostraria **Suas ferramentas de IA no topo** (cartões claros para Claude, Codex/ChatGPT, Cursor, OpenCode com status `✓ Pronta`, botão de 1 clique `Testar / Entrar` e capacidades reais do motor), e só revelaria `Quando uma conta chegar ao limite` de forma contextual ou abaixo das contas, sem selo `Recomendado`.

### Cena 19 · Configurações › Uso e limites
- **Capturas:** `3660c033a5-v11/usage-light-1440x900.png` · `39b2b6165b-v11/usage-dark-1440x900.png`
- **O que está bonito:** Layout limpo de cartões empilhados e separação semântica por provedor.
- **O que está genérico / poluído / frio / desalinhado:**
  - **A tela promete dados e entrega 3 caixas ocas travadas em `"Conferindo..."`:** repete 3 vezes `"Este motor não informa a cota. Mostramos as chamadas e os tokens que medimos aqui."` — mas **não renderiza nenhuma chamada nem token medido**, além de listar motores não conectados (`Codex / ChatGPT`, `Cursor / Conta principal`) com chip eterno `✨ Conferindo...`!
- **O que Linear / Arc / Things / Apple faria diferente:** **Cursor / Linear Insights** separaria imediatamente motores conectados dos não conectados, resolveria `"Conferindo..."` em ≤ 2 s para estado final determinístico e exibiria no próprio cartão o placar local real da semana (`14 entregas · 42 turnos · divisão por persona com mini-retratos + por modelo Opus/Sonnet/Haiku`).

### Cena 20 · Configurações › Membros e convites
- **Capturas:** `3660c033a5-v11/members-light-1440x900.png` · `39b2b6165b-v11/members-dark-1440x900.png`
- **O que está bonito:** Bullets cristalinos em `O que sincroniza` (`"DMs nunca sobem para a nuvem"`).
- **O que está genérico / poluído / frio / desalinhado:**
  - **Vazamento feio de placeholder técnico:** exibe **`owner@workspace.local`** embaixo de `Você` (violando a proibição absoluta da palavra `workspace` e de dados falsos).
  - **CTA bloqueado/incoerente + corte na dobra:** botão âmbar `Convidar por link` aceso no topo enquanto `Equipe remota` está `Não conectada` embaixo, e `O QUE COMPARTILHAR` sai serrado na borda inferior da janela.
- **O que Linear / Arc / Things / Apple faria diferente:** Mostraria apenas o nome real escolhido pela pessoa (`Miguel · Neste computador`, sem e-mail inventado) e, enquanto não houver equipe remota ativa, apresentaria um único estado calmo ilustrado (`Trabalhando só neste computador · Configurar equipe à distância`), sem formulário técnico cortado nem botão `Convidar por link` prematuro.

### Cena 21 · Configurações › Importadores (`Traga o que suas IAs já sabem`)
- **Capturas:** `3660c033a5-v11/importers-light-1440x900.png` · `39b2b6165b-v11/importers-dark-1440x900.png`
- **O que está bonito:** **Excelente desenho de fluxo prático (RCD):** passos numerados `1` e `2` à esquerda + dropzone tracejada do Obsidian à direita tornam tangível migrar memória de ChatGPT/Claude/Gemini em 1 minuto.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Lugar errado na arquitetura de informação:** tem eyebrow `EMPRESA` e ícone de livro da Memória, mas mora enterrada na 5ª aba de `Configurações`.
  - **Excesso de âmbar decorativo:** badges `1`, `2`, pasta da direita e botão `Copiar pedido` disputam o único acento âmbar da tela; e o fade do bloco monoespaçado apaga o prompt na 4ª linha.
- **O que Linear / Arc / Things / Apple faria diferente:** Moveria esta tela para ser a aba **`Importar`** dentro de **Memória da empresa** (deixando `Configurações` limpa!), pintaria os badges `1`/`2`/pasta em `--persona-wash-strong` com texto ameixa (reservando o âmbar exclusivamente para `Copiar pedido` → depois `Adicionar resposta`) e daria feedback imediato de quantas páginas do Cofre serão criadas.

### Cena 22 · Configurações › Aparência
- **Capturas:** `3660c033a5-v11/appearance-light-1440x900.png` · `39b2b6165b-v11/appearance-dark-1440x900.png`
- **O que está bonito:** As 3 miniaturas vetoriais/CSS (`Sistema` bipartido na diagonal, `Claro`, `Escuro` com vaga-lumes) são charmosas, fiéis aos tokens e trocam o tema ao vivo sem piscar.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Subaproveitamento da página e miniaturas acanhadas:** cada cartão tem ~310 px de largura, mas a miniatura de `120×72px` fica encolhida no canto esquerdo deixando um buraco vazio ao lado; e a aba inteira só tem 2 controles.
- **O que Linear / Arc / Things / Apple faria diferente:** **Apple System Settings / Arc** faria a miniatura ocupar `100%` da largura interna superior do cartão (`aspect-ratio: 16/9`, centrada e generosa) e **fundiria `Personalidade` aqui dentro**, criando uma única aba rica **Aparência e clima** (Tema + Figurinhas com preview + Dicas de atalho + Som suave ao concluir entrega).

### Cena 23 · Configurações › Personalidade
- **Capturas:** `3660c033a5-v11/personality-light-1440x900.png` · `39b2b6165b-v11/personality-dark-1440x900.png`
- **O que está bonito:** Texto claro e honesto sobre o limite (`"No máximo uma por persona por dia"`).
- **O que está genérico / poluído / frio / desalinhado:**
  - **A cena mais anticlimática da v1.1:** uma aba inteira chamada **Personalidade** contendo literalmente **1 Switch solitário** num retângulo branco e 75% da tela vazia — **sem mostrar sequer uma figurinha desenhada pelo Brush!**
- **O que Linear / Arc / Things / Apple faria diferente:** Eliminaria esta aba avulsa (absorvida em `Aparência`, reduzindo Configurações de 8 abas apertadas para 6 respiráveis) e exibiria ao lado do Switch um leque de 3 figurinhas reais em miniatura (`48px`, levemente inclinadas `-4deg`, `2deg`, `6deg`) que ganham cor quando ligado e ficam em tons de lavanda quando desligado.

### Cena 24 · Configurações › Sobre e atualizações
- **Capturas:** `3660c033a5-v11/about-light-1440x900.png` · `39b2b6165b-v11/about-dark-1440x900.png`
- **O que está bonito:** Tipografia e botão primário corretos nos tokens.
- **O que está genérico / poluído / frio / desalinhado:**
  - **Indireção cômica ("clique em Sobre para abrir Sobre"):** `AboutSettingsPanel.tsx` renderiza uma página inteira que **não informa a versão instalada** e só exibe um botão `Abrir Sobre e atualizações` para invocar o modal do DSW — além de afirmar `Atalho: Ctrl ,`, que na verdade abre Configurações, não o Sobre! Enquanto isso, o primitivo lindo `<AboutPersona>` (com retrato da equipe e créditos) já existe pronto em `primitives/About.tsx`!
- **O que Linear / Arc / Things / Apple faria diferente:** Renderizaria **`<AboutPersona>` diretamente inline nesta aba** (foto oficial da turma do Brush, `Persona v1.1 · Atualizado ✓`, botão `Procurar atualizações`, notas da versão e licenças dobráveis), zero clique extra e zero dependência do modal legado do DSW.

### Cena Extra (Prova de Fogo) · O Fio Real da Equipe
- **Captura:** `packages/persona/persona-e2e/artifacts/team10/real-attempt-5-2026-11-09T21-12-08-827Z/m9-fio-final-alto-claro.png`
- **O que está bonito:** A moldura do `TeamPlanCard` (`DIVIDI ASSIM`), os chips coloridos de marca (`Gostei` verde, `Ponto de atenção` âmbar, `Sugestão` azul) e o selo verde `✓ Revisado por Lia` provam que a linguagem visual do fio tem potencial extraordinário quando alimentada sem ruído.
- **O que está quebrado / poluído / desastroso na captura real:**
  1. **Duas bolhas tracejadas da fila guilhotinadas ao meio** no topo da área de mensagens, logo abaixo da barra `Geral ⋯ +`.
  2. **Popover `"A Coordenação distribui o pedido"` congelado por cima das mensagens** durante toda a execução de 5m48s.
  3. **Dois controles `"Decide o rotineiro"` duplicados na mesma barra do composer** (botão âmbar à esquerda + chip cinza à direita).
  4. **Dois blocos gigantes de `OpinionBlock` abertos sem recolher**, onde a imagem feia de referência (`foto.png`, 640 px) domina a tela e esmaga o cartaz real (`cartaz-pao-de-queijo.svg`), vazando `NOVA VERSÃO:` cru e `"a Bia"` falando da própria Bia na 3ª pessoa.
  5. **Avatares 24 px de Bia e Téo indistinguíveis** (dois felinos claros quase iguais em `🐱 → 🐱 Bia passou para Téo`).
  6. **Estado mentiroso:** `DIVIDI ASSIM` cravado em `Texto [precisa de você]` quando o texto da Bia já foi entregue e selado, coroado por duas mensagens de erro técnico `RealTurnCapError` na boca da Lia.
- **O que Linear / Arc / Things / Apple faria diferente:** Uma história limpa de **≤ 7 blocos verticais**: (1) Pedido humano → (2) `Dividi assim` vivo com cadeia lógica (`Texto ✓ pronto` → `Arte ✓ pronto`) → (3) 1 linha compacta de passagem com miniatura do rascunho → (4) `OpinionBlock` **recolhido numa pílula de 48 px** após consolidado (`Téo ouviu Bia e Lia · 2 ajustes aplicados · Ver Antes/Depois`) → (5) **1 único `DeliveryCard` protagonista** com miniatura grande de `240px` da arte final, selo `Revisado por Lia` e botão âmbar `Revisar e aplicar`.

---

## 2. Sistema de Movimento da Persona

### 2.1 Princípios Inegociáveis
1. **Movimento é estado real, nunca papel de parede:** nada se mexe na tela se nada mudou no mundo (clique da pessoa, chegada de evento do host, troca de estado de uma persona). Loops infinitos meramente decorativos em superfícies de leitura estão **banidos**.
2. **Física de papel, adesivo e nanquim:** botões e cartões na Persona não flutuam em vidro espacial; eles são adesivos sobre papel encorpado. Aperta = encosta no papel (`translateY(2px)`, sombra encolhe de `3px` para `1px`). Solta = devolve com mola curta sem quicar (`overshoot ≤ 4%`).
3. **A moldura ancora; o conteúdo viaja:** rail lateral, cabeçalho da tela e composer permanecem imóveis em trocas de rota/conversa; só o miolo entra com deslocamento curto (`4px`), preservando orientação espacial imediata.
4. **Só propriedades de compositor (`transform` e `opacity`):** proibido animar `width`, `height`, `top`, `left`, `margin`, `padding`, `border-width` ou `filter: blur()` quadro a quadro. Mudanças de posição/tamanho em listas e quadros usam **FLIP via WAAPI** (`useKanbanFlip` / `useActiveIndicator`).
5. **Silêncio absoluto em repouso (`GPU ≤ 2%`):** app sem foco, minimizado na bandeja ou sem interação humana nem turno ativo congela **100%** das animações (`0` animações rodando no compositor).

---

### 2.2 Curvas Oficiais (`cubic-bezier` exatas)

Atualizar `packages/persona/client-ui-persona/src/client/theme/persona-palette.css` e espelhar em `theme/tokens.ts`:

| Token CSS | Valor exato | Física / Sensação | Onde usar |
|---|---|---|---|
| `--ease-press` *(novo)* | `cubic-bezier(0.2, 0, 0, 1)` | Resposta mecânica imediata na ponta do dedo | `:active` de botões/chips/cartões e feedback tátil de clique |
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` | `ease-out` quint suave e decisiva (desaceleração limpa tipo Linear/Apple, substituindo a curva Material `.2,0,0,1` que arranca brusca) | Indicador deslizante de abas/rail, troca de cor/sombra, FLIP humano no Kanban |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrada rápida já visível no 1º frame (80% do caminho nos primeiros 40% do tempo) | Entrada de mensagens, popovers, modais, gavetas, troca de painel |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Saída acelerada que libera o caminho sem arrastar | Fechamento de modal/popover/toast, item aprovado saindo da fila |
| `--ease-spring` | `cubic-bezier(0.32, 1.14, 0.54, 1)` | Mola contida de papel/carimbo (**overshoot máximo de ~3,8%**, reduzido do atual `1.25` que quicava demais em UI séria) | Retorno de botão solto, carimbo `Aprovado`, entrada de pose de persona, drop de cartão |
| `--ease-carry` *(canônico)* | `cubic-bezier(0.25, 0.9, 0.3, 1)` | Arco orgânico de transporte com pouso macio | Persona carregando cartão entre colunas do Kanban |

---

### 2.3 Tabela de Durações por Tipo de Movimento

| Categoria | Token CSS | Valor | Curva padrão | Aplicações exatas e limites |
|---|---|---|---|---|
| **Toque imediato** | `--motion-instant` | **`90ms`** | `--ease-press` | Afundar botão/chip no `:active` (`translateY(2px)`), marcar checkbox/rádio, foco de tecla. *(Na soltura, volta em `150ms --ease-spring`.)* |
| **Microinteração** | `--motion-fast` | **`150ms`** *(faixa 120–180 ms)* | `--ease-standard` | Hover de botão/cartão (`-1px` / `-2px`), abertura de `MenuButton` / `ResponderMenu` (`scale(0.96 → 1)`), `Switch` deslizando o pino, `Tooltip` aparecendo (após `350ms` de hover; `0ms` entre tooltips irmãos já abertos). |
| **Transição de painel e indicador** | `--motion-panel` *(novo)* / `--motion-base` | **`160ms`** (painel) · **`200ms`** (indicador/modal) | `--ease-enter` / `--ease-standard` | Troca de rota em `.main`: `opacity 0 → 1` + `translateY(4px → 0)` em **`160ms`** (sem fade-out bloqueante — corte seco da tela velha, entrada suave da nova). Pílula `.activeIndicator` de `Tabs`/rail: **`200ms`**. Abertura de `Modal`/gaveta `TurnContextDrawer`: **`200ms`** (saída em **`140ms --ease-exit`**). Recolhimento da faixa da equipe (`264px ↔ 56px`): **`220ms`** via FLIP de `transform`. |
| **Entrada de mensagem e streaming** | `--motion-message` *(novo)* | **`180ms`** | `--ease-enter` | Mensagem enviada pelo humano: nasce da borda do composer (`translateY(8px) → 0`, `opacity 0.4 → 1`, `180ms`). Mensagem/cartão de persona: `translateY(6px) → 0`, `opacity 0 → 1`, `180ms`. Streaming real: texto cresce por lotes sincronizados ao `requestAnimationFrame` (a cada `32ms`, sem re-layout por token solto); cursor âmbar pisca a `1000ms steps(2, jump-none)` **apenas enquanto `streaming === true`** e morre no `ended`. |
| **Estado da persona** | `--motion-base` / `--motion-slow` | **`220ms`** (pose) · **`360ms`** (carry) | `--ease-spring` / `--ease-carry` | Troca real de estado (`disponivel → trabalhando → precisando de você → comemorando`): pose antiga faz fade-out em `180ms --ease-exit` enquanto a nova entra com `translateY(6px → -3px → 0)` em `220ms --ease-spring`. Carregamento de cartão no Kanban pela persona: arco de `-6px` em `360ms` + salto fora em `240ms`. |
| **Celebração (Peak-End)** | `--motion-celebrate` *(novo)* | **`320ms`** (carimbo) · **`680ms`** (patinhas/folhas) | `--ease-spring` / `--ease-enter` | **1 execução única (`iterations: 1`), nunca em loop:** `ApprovedStamp` bate em `320ms` (`scale(1.45 → 0.96 → 1)`, `rotate(-20deg → -10deg)`); `PawBurst` (6 patinhas, raio `56px`) ou `ConfettiMoment` (8 folhinhas) dura `680ms` com cooldown global mínimo de `3000ms`. |

---

### 2.4 Coreografia: O que se move junto, o que fica imóvel e regras de Stagger

1. **Regra do teto de atraso (`stagger cap ≤ 180ms`):** nenhuma lista staggered pode demorar meio segundo para terminar de aparecer.
   - **Fórmula obrigatória:** `delay = Math.min(index * 35, 175)` ms (máximo de 6 itens escalonados; do 7º item em diante entra junto no `175ms`).
   - **Proibido stagger em re-renders e trocas de aba repetidas:** stagger só roda na **1ª montagem de chegada** (onboarding passo 1: `50ms` × 5 animais = `200ms`; abertura da gaveta `Contexto usado`: `30ms` × máx. 5 = `150ms`; itens do `Bom dia`: `40ms` × 3 seções = `80ms`). Ao navegar entre `Projetos → Equipe → Projetos`, a grade entra inteira num único bloco coeso de `160ms`.
2. **Coreografia de Aprovação / Conclusão (2 tempos acoplados):**
   - **Tempo 1 (`0–320ms`):** o dedo clica em `Aprovar` → o botão afunda (`90ms`), o `ApprovedStamp` carimba o cartão (`320ms --ease-spring`).
   - **Tempo 2 (`320–500ms`):** o item aprovado desliza `translateX(16px)` + `opacity: 0` (`180ms --ease-exit`), enquanto os itens abaixo na lista `InboxList` sobem fechando o vão por **FLIP de `transform` em `200ms --ease-standard`** (nunca colapsando `height` na unha). Se era o último item da lista, aos `460ms` entra o `EmptyState` dos 5 animais comemorando (`220ms --ease-enter`).
3. **Coreografia de Pedido Dividido (`Pedido → Plano → Faixa`):**
   - `0ms`: mensagem do usuário pousa no fio (`180ms`).
   - `120ms`: na faixa do canal, a Coordenadora (Atlas/Lia) muda de `disponivel` para `trabalhando` (`220ms`).
   - Quando o plano chega: o cartão `Dividi assim` entra (`180ms`) e, em stagger de `60ms`, apenas as personas escaladas no plano trocam de pose para `trabalhando` ou `esperando` — conectando visualmente o cartão do chat aos personagens lá em cima.

---

### 2.5 Interrupção e Retargeting Contínuo

Animação que trava o clique ou salta ("teleporta") quando interrompida no meio parece software amador:
1. **Preferir `transition` CSS sobre `@keyframes` para todo estado reversível:** hover, pressão, abertura de acordeão, pílula deslizante (`.activeIndicator`) e recolhimento de painel usam `transition` em `transform`/`opacity`. Se o usuário tira o mouse aos `60ms` de uma ida de `150ms`, o navegador inverte a partir da posição exata atual sem salto.
2. **Cancelamento limpo em WAAPI (`usePersonaMotion` e `useKanbanFlip`):** antes de disparar `element.animate(...)` num nó que já está animando, ler a matriz corrente via `getComputedStyle(element).transform` (ou chamar `anim.commitStyles(); anim.cancel()` envolto em `try/catch`) para que um segundo movimento de cartão ou troca rápida `trabalhando → precisando de você` parta da coordenada visual exata onde o elemento estava naquele milissegundo.
3. **Zero bloqueio de ponteiro (`pointer-events`):** elementos entrando já aceitam clique no frame 1; elementos saindo (`leaving`, toasts fechando, modais em `exit`) recebem imediatamente `pointer-events: none` no início da saída para nunca interceptar o próximo clique do usuário.

---

### 2.6 `prefers-reduced-motion` e Alto Contraste (`forced-colors`)

- **Deslocamento espacial = ZERO:** sob `@media (prefers-reduced-motion: reduce)`, nenhum elemento usa `translate`, `scale` ou `rotate` animado (evita desconforto vestibular).
- **Comunicação preservada por crossfade curto (`100ms linear`):** entradas/saídas de modal, mensagem nova, troca de pose da persona e mudança de coluna no Kanban viram apenas `opacity: 0 → 1` em `100ms linear` (`--motion-reduced-fade: 100ms`).
- **Loops e partículas = `0`:** `document.getAnimations()` em repouso com `prefers-reduced-motion: reduce` deve retornar **exatamente `0` animações ativas**. Carimbos (`ApprovedStamp`) e folhinhas de marco aparecem já pousados no estado final estático.
- **`@media (forced-colors: active)`:** todos os gradientes de luz (`lampLayer`, `halo`, `night-glow`), texturas de papel (`paper-grain`) e enfeites `HouseDecor` desligam (`display: none` / `background: none`), preservando bordas sólidas do sistema.

---

### 2.7 Orçamento Rígido de GPU (`Parado ≤ 2%` · Diagnóstico e Cura)

#### Por que a v1.1 gasta 21–37% de GPU parada hoje (provado no código)
1. **`lampBreathe` anima uma camada gigante de tela inteira sem parar (`GeneralChannelView.module.css:827` e `DirectMessagesView.module.css:430`):** uma `div` `inset: 0` cobrindo toda a conversa com dois `radial-gradient` de `1150×780px` varia `opacity: 0.9 ↔ 1` por `14s infinite alternate`. Uma variação imperceptível de 10% de opacidade obriga o compositor do Chromium a recompor meio milhão de pixels a 60 fps eternamente!
2. **`installAmbientPause()` (`theme/install-color-scheme.ts:109`) só escuta `document.visibilitychange`:** quando o usuário está trabalhando no navegador ao lado com a janela da Persona aberta em 2º plano (ou parado lendo por 5 minutos), `document.hidden` continua `false`! Nada pausa no `window.blur` nem por ociosidade! Além disso, `installAmbientPause` seta `body[data-persona-hidden]`, enquanto `PersonaTeamFigure.module.css:96` e `TeamChannelStrip.module.css:289` esperam `:global([data-ambient-paused])` (seletores desconectados).
3. **20+ animações `infinite` simultâneas no `#geral` parado:** 5× `personaBreathe` escalando imagens WebP de `188px` continuamente (inclusive quando estão `descansando`!) + 5× `personaBlinkFrame` + 5× `personaTailFrame` + 5× `persona-rail-blink` no rail + `persona-rail-pulse` + `persona-subject-breathe`.
4. **`filter: blur()` e `backdrop-filter: blur()` vivos em camadas com movimento:** `.member::before` (`TeamChannelStrip.module.css:112`) aplica `filter: blur(2px)` em 5 sombras logo abaixo de 5 figuras escalando sem parar; `Overlays.module.css:11` e `OnboardingShellOverlay.module.css:9` aplicam `backdrop-filter: blur(3px/4px)` sobre cenas que continuam animando por baixo!

#### As 6 Regras de Ferro do Orçamento de GPU da Persona
1. **MATAR `lampBreathe` imediatamente:** a luz da luminária no chat (`lampLayer`) passa a ser **100% estática (`animation: none`)**. O calor vem do gradiente e das bordas `--lit` calculadas uma única vez no `ResizeObserver`, com **custo de GPU = 0,0% após pintar**.
2. **BANIR `filter: blur()` e `backdrop-filter: blur()` contínuos:**
   - Trocar `.member::before { filter: blur(2px) }` por `background: radial-gradient(50% 50% at 50% 50%, var(--persona-scene-shadow) 0%, transparent 100%)` (idêntico a olho nu, zero passe de shader Gaussian Blur).
   - Trocar `backdrop-filter: blur(3px/4px)` nos scrims de modal/onboarding por scrim sólido rico (`rgb(36 22 48 / 0.56)` no claro e `rgb(8 4 12 / 0.72)` no escuro) **ou** congelar `data-persona-ambient-paused` enquanto qualquer modal estiver aberto.
3. **Pausa tripla unificada (`hidden` + `window.blur` + `idle 15s`):** unificar num único atributo no `<body>` (`data-persona-ambient-paused`) acionado quando:
   - `document.hidden === true` (minimizado/bandeja), **OU**
   - `!document.hasFocus()` (`window` recebeu `blur` — janela sem foco = **0 animações na hora!**), **OU**
   - **15 segundos sem input do usuário (`pointermove`, `keydown`, `wheel`, `touchstart`) E zero turnos `working`/`streaming` ativos**. Assim que o mouse mexe ou uma persona começa a trabalhar, retoma no mesmo frame.
4. **Persona `descansando` ou `disponivel` parada NÃO faz `scale()` infinito de 60 fps:**
   - Desligar `personaBreathe` (`scale(1 → 1.012)`) permanente nos 5 personagens parados. Vida ociosa com janela focada e ativa usa **apenas troca discreta de frame `steps(1, end)`** (piscar ocasional a cada 7–11 s apenas em quem está acordado, que repinta 1 frame em `120ms` e fica **0 fps nos outros 98% do tempo!**).
   - Movimento contínuo na faixa fica **exclusivo para quem está `trabalhando` / `revisando` agora** (comunicando estado real: o olho bate na faixa e sabe na hora quem está em ação porque é o único se mexendo!).
5. **Teto máximo de animações simultâneas:** no máximo **2 animações contínuas simultâneas na janela inteira** (ex.: cursor do balão em streaming + a persona autora trabalhando na faixa; ou shimmer de `Skeleton` durante carregamento ≤ 3 s). Vaga-lumes noturnos do rail (`NIGHT-THEME-SPEC §2`): **estáticos com pontos de brilho de tamanhos diferentes** ou fade discreto em `steps` apenas nos primeiros `4s` ao trocar para o tema escuro, depois pousam quietos.
6. **Gate automatizado de aceite (`preaccept-gpu`):** em qualquer tela com a janela sem foco (`window.dispatchEvent(new Event('blur'))`) ou após `16s` sem turno ativo, `document.getAnimations().filter(a => a.playState === 'running').length` **TEM DE SER `0`**. Meta medida no `perf-probe-visible.mjs`: **GPU ociosa ≤ 1,5% com foco parado e 0,0–0,5% sem foco**.

---

## 3. TOP 20 de Melhorias de Design, Animação e UX (do Maior Impacto ao Menor)

Cada item traz especificação fechada (tamanhos em `px`, tokens de `persona-palette.css`, curva `cubic-bezier` e duração), pronta para implementação direta pelos builders, válida em qualquer motor.

### #01 · Faixa da Equipe Adaptativa no `#geral` (Palco Completo ↔ Barra Viva Compacta de `56px`)
- **Tela:** Canal `#geral` e canais de equipe (`geral-light-1440x900.png`, `geral-dark-1440x900.png`).
- **O que muda:** A `TeamChannelStrip` (`264px` de altura) permanece aberta quando o canal tem ≤ 2 mensagens ou quando a pessoa clica em `Expandir palco`. Assim que há ≥ 3 mensagens ou o usuário rola `> 48px` para baixo, ela recolhe numa **Barra Viva Compacta de `56px` de altura** (`padding: 8px 16px`, `border-radius: var(--persona-radius-l)`, fundo `var(--persona-card)` com faixa inferior de `3px` em `--persona-scene-hill-near`), exibindo os rostos `36px` lado a lado com pílula de status viva (`Bia · escrevendo texto…`, `Téo · esperando Bia`) e botão ghost `Palco ▾` à direita. A pílula redundante de 5 rostos colados no `ScreenHeader` do `#geral` é **removida**. Transição via FLIP de `transform`/`opacity` em **`220ms cubic-bezier(0.22, 1, 0.36, 1)`** (`--ease-standard`), sem animar `height` quadro a quadro.
- **Por que a pessoa sente a diferença:** Devolve imediatamente **`+208px` verticais (+58% de área visível!)** para ler a conversa em `1440×900`, acabando com a mensagem da Luna cortada ao meio sem abrir mão dos personagens vivos.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/team/TeamChannelStrip.tsx`, `TeamChannelStrip.module.css` e `chat/GeneralChannelView.tsx`.
- **Tamanho:** **M**

### #02 · Cirurgia de GPU Zero em Repouso (`window.blur` + Fim de `lampBreathe` + Fim de `blur()` Contínuo)
- **Tela:** Global / Todas as 24 cenas (especialmente `geral-dark-1440x900.png` e `dm-dark-1440x900.png`).
- **O que muda:**
  1. Em `install-color-scheme.ts`, trocar `installAmbientPause()` para ligar `body[data-persona-ambient-paused]` quando `document.hidden || !document.hasFocus() || idleFor15sWithoutActiveTurn`; unificar os seletores de `persona-base.css`, `PersonaTeamFigure.module.css` e `TeamChannelStrip.module.css` nesse mesmo atributo (`animation-play-state: paused !important`).
  2. Em `GeneralChannelView.module.css:827` e `DirectMessagesView.module.css:430`, remover `animation: lampBreathe 14s...` (deixar `.lampLayer` em `opacity: 1` estático).
  3. Em `TeamChannelStrip.module.css:112`, substituir `filter: blur(2px)` por `background: radial-gradient(50% 50% at 50% 50%, var(--persona-scene-shadow) 0%, transparent 100%)`.
  4. Em `PersonaTeamFigure.module.css:10`, remover `personaBreathe` contínuo de poses `descansando`/`disponivel`, aplicando balanço suave (`translateY(-2px)`, `1800ms ease-in-out infinite`) **exclusivamente** em `data-state='working' | 'reviewing'`.
- **Por que a pessoa sente a diferença:** O notebook fica frio e silencioso o dia inteiro com a Persona aberta ao lado, e quando um animal se mexe na faixa o olho periférico sabe na hora que **há trabalho real acontecendo**.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/theme/install-color-scheme.ts`, `theme/persona-base.css`, `chat/GeneralChannelView.module.css`, `chat/DirectMessagesView.module.css`, `team/PersonaTeamFigure.module.css` e `team/TeamChannelStrip.module.css`.
- **Tamanho:** **P**

### #03 · Limpeza Radical do Composer, Fim dos Controles Duplicados e Seletor Rápido `Modelo · Esforço`
- **Tela:** `#geral` e `Mensagens diretas` (`m9-fio-final-alto-claro.png`, `geral-light-1440x900.png`, `dm-light-1440x900.png`).
- **O que muda:**
  1. **Remover o 2º chip duplicado `"Decide o rotineiro"`** à direita de `ChannelComposer.tsx:1057-1060`.
  2. Adicionar no rodapé do composer (no `#geral` **e** nas DMs!) a pílula clicável **`Modelo · Esforço`** (`height: 30px`, `padding: 0 10px`, `border-radius: var(--persona-radius-pill)`, `background: var(--persona-wash)`, `border: 1.5px solid var(--persona-outline)`, texto Nunito 700 `12px` ex.: `Sonnet · high ▾`), abrindo popover `280px` em **`150ms cubic-bezier(0.16, 1, 0.3, 1)`** com os modelos da conta e os níveis nativos da CLI (`low`, `medium`, `high`, `xhigh`, `max` + dica pt-BR de 1 linha, conforme `EFFORT-SPEC`).
  3. Habilitar `Ctrl+V` de imagem da área de transferência (`clipboardData.files` / `image/*`) no `onPaste` com entrada do cartão de miniatura `56×56px` em `150ms --ease-enter`.
  4. Auto-dispensar qualquer popover de dica (`"A Coordenação distribui o pedido"`) no 1º `keydown` ou envio (`120ms --ease-exit`).
- **Por que a pessoa sente a diferença:** Acaba com a sensação de barra bagunçada/bugada e entrega os dois gestos mais repetidos do dia (colar print `Win+Shift+S` e subir/descer inteligência antes de um pedido difícil) sem sair da conversa.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/chat/ChannelComposer.tsx`, `ChannelComposer.module.css` e `chat/clipboard-images.ts`.
- **Tamanho:** **M**

### #04 · Higienização Visual do Fio da Equipe: Recolhimento Automático de `OpinionBlock` e Hierarquia da Arte Nova
- **Tela:** Fio real de trabalho em equipe (`m9-fio-final-alto-claro.png`).
- **O que muda:**
  1. Quando `OpinionBlock` recebe consolidação, recolhe automaticamente numa **linha-resumo clicável de `52px`** (`background: var(--persona-wash)`, `border: 1.5px solid var(--persona-outline-soft)`, `border-radius: var(--persona-radius-m)`, `padding: 8px 12px`): miniatura `36×36px` da arte nova + `"Téo ouviu Bia e Lia · 2 sugestões aplicadas"` + chips compactos + link `Ver Antes · Depois ▾` (expande com `200ms --ease-standard`).
  2. Quando aberto, a **arte recém-criada no rascunho** é sempre a protagonista (`max-height: 320px`, borda `1.5px --persona-outline`), enquanto imagens anexadas pelo usuário no pedido original ficam num chip secundário recolhido (`📎 Referência do pedido`), impedindo que a foto velha eclipse a entrega nova.
  3. Corrigir o container da fila (`QueuedMessageBubble`) no topo/rodapé do stream (`padding-top: 8px`, `overflow: visible` no wrapper imediato) para nunca cortar a borda tracejada ao meio.
  4. Remover `MessageSprig` (folhinha repetida em todo balão comum), reservando acento botânico apenas para `DailyBriefCard` e `MilestoneCard`.
- **Por que a pessoa sente a diferença:** Uma entrega de equipe cai de 3 telas de rolagem caótica para **uma história limpa de 1 tela**, onde o olho encontra a arte final em menos de 1 segundo.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/chat/opinion/OpinionBlock.tsx`, `OpinionBlock.module.css`, `chat/QueuedMessageBubble.module.css` e `chat/GeneralChannelView.tsx`.
- **Tamanho:** **M**

### #05 · Correção dos 3 Bugs Visuais do Tema Noturno no Rail e nos Overlays (`Halo Quadrado`, `Pílula Estourada` e `zZz Invisível`)
- **Tela:** Todas as 24 cenas escuras (`*-dark-1440x900.png`, especialmente `geral-dark-1440x900.png` e `orgChart-dark-1440x900.png`).
- **O que muda:**
  1. **Fim do quadrado na luminária (`PersonaSidebar.module.css:818`):** aumentar `.halo` para `width: 120px; height: 120px` (ajustando `HALO_SIZE = 120` em `lamp-light.ts:40`) e corrigir o gradiente para **`radial-gradient(closest-side, rgb(242 186 110 / 0.36) 0%, rgb(242 186 110 / 0.12) 52%, transparent 100%)`** — garante intensidade `0.00` exata antes da borda da `div`, desaparecendo 100% a aresta retangular.
  2. **Pílula da IA noturna (`PersonaSidebar.module.css:407,513`):** adicionar `:global(body[data-ds-dark-theme='true']) .hostStatus, :global(body[data-ds-dark-theme='true']) .hostStatusButton` com `background: var(--persona-card); color: var(--persona-ink); border-color: var(--persona-outline-control);` e trocar o texto mudo `Claude · —` por **`Claude · Pronta`** (quando conectada sem percentual oficial).
  3. **Overlays de estado legíveis à noite (`PersonaTeamFigure.module.css:68` e `OrgMap.module.css`):** no escuro, dar ao disco `.overlay` `background: var(--persona-wash-strong)` (`#3a2a4f`), `border: 1.5px solid var(--persona-outline-control)` (`#8f7bb0`) e renderizar o ícone SVG por `mask-image` com `background-color: var(--persona-ink)` (`#f6eee0`, contraste `9,4:1`!).
- **Por que a pessoa sente a diferença:** O modo noturno deixa de ter cara de CSS inacabado e atinge o acabamento de pintura de estúdio que o Miguel pediu.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/shell/PersonaSidebar.module.css`, `chat/lamp-light.ts`, `team/PersonaTeamFigure.module.css` e `primitives/OrgMap.module.css`.
- **Tamanho:** **P**

### #06 · Eliminação da Dupla Sidebar nas Mensagens Diretas (`DM` Direta pela Barra Única)
- **Tela:** Mensagens diretas (`dm-light-1440x900.png`, `dm-dark-1440x900.png`).
- **O que muda:** Quando a barra única de conversas (`navPlaces` / `ConversationsRail`) está ativa à esquerda listando `PESSOAS`, `DirectMessagesView` **oculta a coluna lateral duplicada de `280px` (`Mensagens diretas`)**, dando toda a largura central (`max-width: 920px` centrada) à conversa com a persona escolhida — e permitindo que no tema escuro a luz da luminária do rail entre fisicamente contínua pela esquerda da DM! Sincronizar também a fonte de verdade de presença para que rail, cabeçalho da DM e estado vazio mostrem **exatamente o mesmo estado** (`Disponível`, nunca dormindo com ponto verde).
- **Por que a pessoa sente a diferença:** Remove a bizarra repetição dos mesmos 5 nomes duas vezes lado a lado, ganha `+280px` de respiro e conserta a física da iluminação noturna.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/chat/DirectMessagesView.tsx`, `DirectMessagesView.module.css` e `remote/map-dm-list.ts`.
- **Tamanho:** **P**

### #07 · Mesa de Luz ("Circule e Fale") Direto sobre Entregas Visuais e Rascunhos
- **Tela:** Cartão de entrega no `#geral` (`DeliveryCard`) e painel `Revisar mudanças` (`DraftReviewPanel`).
- **O que muda:** Ao passar o mouse ou clicar numa imagem/SVG entregue, surge o botão sticker `✏️ Marcar ajuste na imagem`. Abre overlay `<LightTableCanvas>` (`scrim` escuro `0.72`, entrada `200ms --ease-enter`) com a arte grande ao centro e 2 ferramentas simples no topo: **Círculo/Traço Âmbar** (`stroke: #E8AF54`, `lineWidth: 4px` com contorno externo `#34243F` de `1.5px` para contraste em qualquer fundo claro ou escuro!) e **Seta**. Ao soltar o traço, abre uma pílula flutuante `260px` ao lado do ponto marcado (`translateY(4px → 0)`, `140ms --ease-enter`) com input `"O que mudar aqui?"` + `Enter`. Envia `[arte_atual, arte_anotada]` para o autor da arte ajustar só aquele ponto.
- **Por que a pessoa sente a diferença:** Transforma a pior dor de trabalhar com IA visual (descrever posição com palavras) num gesto natural de 4 segundos digno de um diretor de arte humano.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/review/simple/LightTableCanvas.tsx` *(novo)*, `review/simple/FilePreview.tsx` e `chat/DeliveryCard.tsx`.
- **Tamanho:** **G**

### #08 · Enxugamento de Configurações (de 8 Abas Espremidas para 5 Abas Coesas) + `<AboutPersona>` Inline + Religar `Revisão antes de entregar`
- **Tela:** Configurações (`personas`, `personasReview`, `appearance`, `personality`, `about`, `importers` — Cenas 16, 17, 21, 22, 23, 24).
- **O que muda:**
  1. **Fundir `Personalidade` dentro de `Aparência`** (exibindo ao lado do Switch `Figurinhas` 3 miniaturas reais de `48px` das figurinhas do Brush com inclinação `-4deg / 2deg / 6deg`).
  2. **Mover `Importadores` para uma aba `Importar` dentro de `Memória da empresa`** (onde seu ícone e eyebrow `EMPRESA` realmente pertencem!).
  3. **Renderizar `<AboutPersona>` diretamente dentro de `AboutSettingsPanel.tsx`** (mostrando logo de cara a ilustração da turma, versão `v1.1.x`, status de atualização e créditos, eliminando o botão inútil `Abrir Sobre e atualizações` e o atalho errado `Ctrl ,`).
  4. **Compactar `PersonasSettingsPanel.tsx`:** mover o aviso `"Este projeto ainda não tem pasta"` para **1 único `Notice` no topo**, trocar os `<select>` crus por `MenuButton` sticker, transformar o chip `Haiku` em seletor claro `Claude · Haiku · medium ▾` e **religar o `Switch` + seletor de revisor no cartão `Revisão antes de entregar`**!
  - Resultado: Configurações cai de 8 abas apertadas para **5 abas limpas**: `Conexões · Personas · Uso e limites · Aparência · Sobre` (e `Equipe à distância` dobrada em Conexões ou 6ª aba só se ativada).
- **Por que a pessoa sente a diferença:** Elimina de uma tacada só as 3 telas mais ocas/frustrantes do produto e devolve controle real sobre gastos de revisão.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/shell/AboutSettingsPanel.tsx`, `shell/AppearanceSettingsPanel.tsx`, `figurinhas/PersonalitySettingsPanel.tsx`, `settings-personas/PersonasSettingsPanel.tsx` e `shell/nav-places.ts`.
- **Tamanho:** **M**

### #09 · Visão Geral (`Overview`) Viva e Sem Latifúndios Vazios
- **Tela:** Visão geral (`overview-light-1440x900.png`, `overview-dark-1440x900.png`).
- **O que muda:**
  1. Quando `Precisa de você === 0`, colapsar o cartão de `330px` para um **Banner Calmo Horizontal de `76px`** (`padding: 16px 20px`, avatar `44px` do Atlas + `"Nada esperando por você agora — a bancada está em dia"` + selo verde `✓`), subindo imediatamente as sugestões e entregas recentes para a primeira dobra!
  2. No painel lateral `Agora` (`OverviewNowStrip.tsx`), separar em 2 blocos: no topo, cartões vivos expandidos **somente** para quem está `trabalhando`, `revisando` ou `esperando você` (com barra sutil e tempo decorrido); embaixo, agrupar todos os disponíveis numa única linha limpa (`[rostos 28px sobrepostos] 5 prontos para começar · Pedir tarefa →`).
  3. No cartão `Primeira tarefa sugerida`, gerar o título a partir do Cofre da empresa (ou 3 chips editáveis) e trocar `→ Abrir no #geral` por botão primário **`Pedir ao Atlas agora`** que já dispara o pedido e navega ao `#geral` em `160ms --ease-enter`.
- **Por que a pessoa sente a diferença:** A tela inicial deixa de gritar "ninguém está fazendo nada" 15 vezes e vira um painel de comando calmo, denso na medida certa (estilo **Things Today**).
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/overview/OverviewView.tsx`, `OverviewView.module.css` e `overview/OverviewNowStrip.tsx`.
- **Tamanho:** **M**

### #10 · Fusão de `Projetos` + `Quadros` e Abertura Direta do Kanban Real
- **Tela:** Projetos e Quadros (`projects-light-1440x900.png`, `kanban-light-1440x900.png`).
- **O que muda:** Concluir a Fase 2 do `UX-BEYOND A-1`: fundir as abas redundantes `Projetos` e `Quadros` em **`Quadro` (padrão) · `Rotinas` · `Arquivos` · `Canvas`**, colocando no cabeçalho um seletor sticker de projeto (`📁 Pessoal ▾` + botão `+ Novo projeto`). Quando a pessoa clica em `Projetos` no rail, ela **cai direto no quadro Kanban de colunas reais** do projeto ativo (`A fazer · Fazendo · Revisando · Pronto`), onde o FLIP de `220ms` (humano) e o `useKanbanCarry` de `360ms` (animal carregando o cartão!) realmente acontecem na frente dela!
- **Por que a pessoa sente a diferença:** Corta 2 telas-índice quase vazias e entrega o quadro vivo em **1 clique** a partir do menu principal.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/shell/nav-places.ts`, `shell/ProjectsView.tsx` e `kanban/ProjectKanban.tsx`.
- **Tamanho:** **M**

### #11 · Paleta de Comandos `Ctrl+K` como Overlay Modal Rápido (`160ms`) em vez de Troca de Página
- **Tela:** Global / Busca e navegação rápida (gatilho `Buscar em tudo... Ctrl K` presente nas 24 cenas).
- **O que muda:** Apertar `Ctrl+K` (ou clicar no campo do rail) abre um **Modal Overlay ancorado a `14vh` do topo** (`width: min(640px, 92vw)`, `max-height: 460px`, `border-radius: var(--persona-radius-xl)`, `box-shadow: var(--persona-shadow-float)`, entrada `scale(0.97 → 1)` + `opacity 0 → 1` em **`150ms cubic-bezier(0.16, 1, 0.3, 1)`**, saída `110ms --ease-exit`) por cima da tela atual sem desmontá-la! Ordem das seções: `Recentes` → `Fazer agora` (1–9 no teclado: `Nova tarefa`, `Pedir ao time`, `Resumir o dia`, `Trocar tema Claro/Escuro`, `Contratar persona`) → `Pessoas` (com retrato `24px`) → `Nas conversas` (clique navega direto e pisca a mensagem encontrada com `dailyFocus` `900ms`).
- **Por que a pessoa sente a diferença:** Dá à Persona a velocidade muscular imediata de **Linear / Raycast / Arc**, sem perder o lugar onde você estava lendo.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/shell/SearchPlaceholderView.tsx`, `shell/SearchView.module.css` e `shell/PersonaAppFrame.tsx`.
- **Tamanho:** **M**

### #12 · `Conexões` Reordenada: Contas no Topo, Diagnóstico Honesto de 1 Clique e Capacidades Visíveis
- **Tela:** Configurações › Conexões (`connections-light-1440x900.png`, `connections-dark-1440x900.png`).
- **O que muda:**
  1. Subir os cartões dos motores (`Claude`, `Codex / ChatGPT`, `Cursor`, `OpenCode`) para o **topo absoluto da tela**, usando os ícones vetoriais oficiais (`engine-brand-icon.tsx`, nunca `C+`), nome amigável da conta e chips claros do que funciona naquele motor (`✓ Equipe completa · ✓ Visão · ✓ Confirmação de segurança` vs `⚠ Só conversa individual neste modo`).
  2. Remover o selo `Recomendado` de `Perguntar antes de trocar` e exibir o bloco `Quando uma conta chegar ao limite` **abaixo das contas** (recolhido em 1 linha limpa enquanto o usuário só tiver 1 conta conectada, abrindo em `200ms --ease-standard` ao adicionar a 2ª conta).
- **Por que a pessoa sente a diferença:** No 1º olhar você entende o que está conectado e o que cada assinatura faz, sem tropeçar em configuração de multi-conta antes de ter duas contas.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/connections/ConnectionsView.tsx`, `Connections.module.css` e `primitives/Accounts.tsx`.
- **Tamanho:** **P**

### #13 · `Uso e Limites` Real: Placar Local Medido + Fim do `"Conferindo..."` Infinito + Marcapasso de Janela
- **Tela:** Configurações › Uso e limites (`usage-light-1440x900.png`, `usage-dark-1440x900.png`).
- **O que muda:**
  1. Timeout duro de `2500ms` para sondas de cota (`✨ Conferindo...` nunca fica travado na tela) e ocultar motores sem nenhuma conta configurada (movendo-os para um rodapé discreto `Outros motores não conectados`).
  2. Quando o motor não publica porcentagem oficial, exibir **de verdade** no cartão o placar local que a frase promete: `Hoje: 6 entregas · 18 turnos · 142 mil tokens` + barra horizontal segmentada por persona (com rostos `20px`) e por modelo (`Haiku / Sonnet / Opus` em `tabular-nums`).
  3. Quando houver `resetsAt` da janela de 5h, exibir a pílula do **Marcapasso**: `"82% livre · renova às 18:00"` (verde/lilás) ou `"14% livre · Modo econômico sugerido até 18:00"` (âmbar).
- **Por que a pessoa sente a diferença:** Cumpre a promessa escrita na própria tela e transforma ansiedade de limite de assinatura em sensação de controle.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/usage/UsageLimits.tsx`, `usage/UsageProviderPoolCard.tsx`, `usage/LocalInsights.tsx` e `usage/Usage.module.css`.
- **Tamanho:** **M**

### #14 · `Rotinas` com Rostos Reais, Iniciativas Agrupadas e Grade Semanal Viva
- **Tela:** Projetos › Rotinas (`routines-light-1440x900.png`, `routines-dark-1440x900.png`).
- **O que muda:**
  1. Trocar o ícone genérico de bonecos pelo `Avatar` `36px` real de cada persona e exibir a função verdadeira (`Engenharia`, `Pesquisa`, `Relacionamento`, `Vigia`, nunca `Coordenação` fixo em todas!).
  2. Agrupar as 5 linhas automáticas `"Iniciativa de..."` num único cartão recolhível **`Check-up diário da equipe`** com os 5 rostos empilhados e horários escalonados (`09:00, 09:05...`), limpando a lista para as rotinas reais criadas pela pessoa.
  3. Ligar os dados reais das rotinas diárias/semanais às 7 colunas `SEG..DOM` no rodapé (mostrando chips compactos `09:00 Bom dia`, `09:05 Check-up`), para que a grade semanal nunca apareça vazia quando há rotinas ativas!
- **Por que a pessoa sente a diferença:** A tela deixa de parecer um dump de banco de dados repetido e passa a funcionar como uma agenda visual confiável da equipe.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/routines/RoutinesView.tsx` e `routines/Routines.module.css`.
- **Tamanho:** **M**

### #15 · `Saúde da Equipe`: Português Humano + Rostos + Correção em Lote com Animação do Velocímetro
- **Tela:** Equipe › Saúde (`teamHealth-light-1440x900.png`, `teamHealth-dark-1440x900.png`).
- **O que muda:**
  1. Corrigir o texto quebrado `"Se essa pessoa some"` para **`"Se você ficar offline por 2 dias, 4 colegas param esperando aprovação."`**
  2. Adicionar `Avatar` `32px` em cada linha do `Teste dos 2 dias` (`Atlas · Coordenação`, nome antes do cargo!), transformar `✨ Subir autonomia dentro de limites` num `Button variant="secondary" size="s"` real e adicionar no cabeçalho da seção o botão **`Ajustar os 4 em 1 clique`**.
  3. Ao clicar, as barras âmbar do Dia 2 viram verdes em stagger de `45ms` e o arco do `HealthScore` anima o ponteiro/traço SVG (`stroke-dashoffset`) + contador numérico (`76 → 96`) em **`420ms cubic-bezier(0.22, 1, 0.36, 1)`**.
- **Por que a pessoa sente a diferença:** Transforma uma página de diagnóstico repetitivo numa micro-experiência recompensadora ("subi a nota da minha equipe de 76 para 96 num clique!").
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/governance/TeamHealthView.tsx`, `primitives/Governance.tsx` e `locale/governance/`.
- **Tamanho:** **P**

### #16 · Unificação Semântica de `Memória da Empresa` + Fim d'"O Bibliotecário" e da Coluna de Zeros
- **Tela:** Memória da empresa › Segundo cérebro, Conhecimento e Regras (`secondBrain`, `knowledge`, `rules` — Cenas 12, 13, 14).
- **O que muda:**
  1. Renomear as abas de `Memória da empresa` para **`Resumo vivo` · `Documentos do Cofre` · `Combinados e regras` · `Importar`**, alinhando título da aba = `h1` da página.
  2. Substituir o ator fantasma `"O bibliotecário"` pela persona coordenadora/pesquisadora real da equipe (com `Avatar` `28px` do animal) ou por `"Atualização automática da equipe"`.
  3. No cartão `COMECE AQUI`, renderizar as 3 primeiras linhas reais do perfil da empresa salvo (ou CTA `Descrever a empresa em 3 frases`), e em `POR TIPO` esconder contadores `0`, exibindo chips de criação rápida (`+ Cliente`, `+ Processo`, `+ Decisão`).
  4. Em `Combinados e regras`, adicionar 3 chips de regras prontas de 1 clique abaixo do estado vazio e adicionar a caixinha `☐ Lembrar como regra da casa` ao pedir ajuste numa entrega.
- **Por que a pessoa sente a diferença:** Acaba com a confusão mental entre 4 nomes concorrentes para memória e faz a base de conhecimento parecer viva desde o primeiro minuto.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/second-brain/SecondBrainHome.tsx`, `knowledge/KnowledgeVault.tsx`, `rules/TriageRulesView.tsx` e `data/lumen-remote-panels.tsx`.
- **Tamanho:** **M**

### #17 · Distinção Cromática de Retratos `24px` + Cartões Ricos na Aba `Equipe › Personas`
- **Tela:** Fio (`m9-fio-final-alto-claro.png`) e Equipe › Personas (`team-light-1440x900.png`).
- **O que muda:**
  1. Em `Avatar` de personas (`24px` e `32px`), dar a cada personagem/espécie um **fundo de moldura pastel exclusivo da paleta** (`--persona-subject-0..6-tint` no claro e versões escuras `28%` no escuro — ex.: Bia em pêssego suave, Téo em céu, Lia em lavanda, Atlas em âmbar-creme, Nina em menta), garantindo que em `🐱 → 🐱 Bia passou para Téo` o olho diferencie os dois colegas instantaneamente a `24px`!
  2. Em `PersonasTeamPanel.tsx` (Cena 09), mostrar os animais acordados (`disponivel`) quando prontos, adicionar linha de chips `Claude · Sonnet · medium` + contagem de skills e botões rápidos `Conversar` / `Ajustar` revelados com foco/hover (`150ms --ease-standard`).
- **Por que a pessoa sente a diferença:** Resolve o problema real de legibilidade rápida em passagens de bastão no chat e dá função prática à galeria da equipe.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/primitives/Avatar.tsx`, `Avatar.module.css` e `team/PersonasTeamPanel.tsx`.
- **Tamanho:** **P**

### #18 · Organograma Real em Leque Horizontal (`Quem cuida de quem`)
- **Tela:** Equipe › Quem cuida de quem (`orgChart-light-1440x900.png`, `orgChart-dark-1440x900.png`).
- **O que muda:** Substituir a lista indentada vertical sob `Você` por um **layout simétrico em árvore horizontal** (`display: grid` / flex wrap centrado, colunas de `210px`, `gap: 16px`): `Você` no centro do nível 1 com `Atlas` conectado lateralmente por pílula `Braço direito`, e os 4 colegas (`Luna`, `Sol`, `Nina`, `Bento`) lado a lado no nível 2 ligados por conector SVG ortogonal de `2px` em `--persona-lilac-400` (`--persona-lilac-500` no escuro) com cantos arredondados `r=10`. Fundir os dois controles segmentados do topo numa única barra compacta à direita do `ScreenHeader`.
- **Por que a pessoa sente a diferença:** Aproveita os `1100px` horizontais da tela, elimina a rolagem desnecessária e parece um organograma desenhado por designer, não uma lista HTML.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/primitives/OrgMap.tsx`, `OrgMap.module.css` e `governance/OrgChartView.tsx`.
- **Tamanho:** **M**

### #19 · `Canvas` Espacial de Verdade (Dot-Grid, Sem Scrollbar Dupla, Dica de Teclado sob Demanda)
- **Tela:** Projetos › Canvas (`canvas-light-1440x900.png`, `canvas-dark-1440x900.png`).
- **O que muda:**
  1. Trocar `overflow: auto` do palco do canvas por `overflow: hidden` com pan por ponteiro/roda (`touch-action: none`) e auto-enquadramento inicial (`fitToContent` na montagem), eliminando a barra de rolagem roxa dentro do quadro.
  2. Aplicar malha de pontos no fundo: `background-image: radial-gradient(circle, var(--persona-outline-soft) 1.25px, transparent 1.25px); background-size: 24px 24px`.
  3. Esconder a faixa de texto WCAG do topo e exibi-la apenas como pílula flutuante no canto inferior esquerdo quando o foco entrar no canvas via tecla `Tab` (`140ms --ease-enter`).
  4. Agrupar personas sem tarefa ativa num cluster discreto `Disponíveis no projeto` em vez de nós gigantes órfãos.
- **Por que a pessoa sente a diferença:** Passa imediatamente de "caixa com três botões perdidos" para um quadro espacial tátil nível **Figma / Linear**.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/canvas/CanvasView.tsx` e `canvas/Canvas.module.css`.
- **Tamanho:** **M**

### #20 · Purga de `owner@workspace.local` em `Membros` + Rodapé Simétrico do Rail
- **Tela:** Configurações › Membros (`members-light-1440x900.png`) e Rodapé do Rail em todas as 24 cenas.
- **O que muda:**
  1. Em `MembersView.tsx`, remover qualquer fallback `@workspace.local`: exibir o nome real salvo pela pessoa + subtítulo `"Dono · Neste computador"`; esconder o botão primário `Convidar por link` enquanto `Equipe remota` estiver desconectada (promovendo `Conectar equipe à distância` como ação secundária honesta dentro de um estado calmo sem corte na dobra).
  2. No rodapé do rail (`PersonaSidebar.module.css`), alinhar `Configurações` (altura `38px`) e `Ajuda ?` (`38×38px`, trocando o ícone de livro mudo por livro/balão com `?` claro + tooltip `Ajuda e atalhos · ?`) na mesma linha base, deixando a luminária/regador respirar livre na clareira entre a pílula da IA e os controles.
- **Por que a pessoa sente a diferença:** Fecha as pontas soltas de acabamento que denunciavam esqueleto técnico por baixo da arte.
- **Arquivo provável do cliente:** `packages/persona/client-ui-persona/src/client/members/MembersView.tsx`, `Members.module.css` e `shell/PersonaSidebar.module.css`.
- **Tamanho:** **P**

---

## 4. Os 5 Momentos "UAU" (Roteiro Quadro a Quadro)

Estes 5 momentos são os picos emocionais (*Peak-End Rule*) que fazem alguém gravar a tela e mandar para um amigo dizendo *"olha isso trabalhando"*. Nenhum usa loop infinito pesado; todos rodam a **60 fps cravados** só com `transform`/`opacity` e caem para crossfade `100ms` em `prefers-reduced-motion`.

---

### Momento UAU 1 · A Primeira Entrega da Equipe (Ativação Mágica no 1º Uso)
- **Contexto:** A pessoa acabou de clicar em **`Pedir agora`** no último passo da chegada (ex.: *"Monte 3 ideias de campanha de terça-feira para a Padaria Lua"*).
- **Roteiro Quadro a Quadro:**
  - **`0ms → 90ms` (O Toque):** O botão âmbar `Pedir agora` afunda `translateY(2px)` (`--ease-press`), recolhe sua sombra de `3px` para `1px` e faz morph suave do conteúdo interno para estado ocupado sem mudar largura.
  - **`90ms → 290ms` (A Passagem para a Bancada):** O formulário de texto desliza `translateY(-6px)` com `opacity: 0` (`140ms --ease-exit`), abrindo espaço para o cartão de execução viva (`translateY(8px → 0)`, `opacity: 0 → 1`, `200ms cubic-bezier(0.16, 1, 0.3, 1)`). À esquerda, a figura de `160px` do **Atlas** troca da pose `acenando` para `trabalhando` com pequeno impulso vertical de `-6px` (`220ms --ease-spring`).
  - **`300ms → ~6500ms` (Trabalho Vivo Visível, Nunca Mudo):**
    - Em `< 600ms`, a 1ª linha do `ActivityGroup` entra (`"Lendo o resumo da Padaria Lua"` — `150ms --ease-enter`).
    - Assim que o 1º token do modelo chega, **o texto real já começa a fluir ao vivo** dentro do cartão de prévia em lotes de `32ms`, guiado pelo cursor-bloco âmbar (`8×16px`, `--persona-accent`). Zero espera cega!
  - **`t_fim → t_fim + 320ms` (O Pouso e o Carimbo):** O streaming encerra; o cursor âmbar desaparece limpo (`100ms`); Atlas troca da pose `trabalhando` para **`comemorando`** (`220ms --ease-spring`). No canto superior direito do cartão de entrega, o carimbo desenhado pelo Brush (`stamp-uau` / `Primeira entrega pronta`) desce de `scale(1.45) rotate(-20deg)` para `scale(1) rotate(-10deg)` em **`320ms cubic-bezier(0.32, 1.14, 0.54, 1)`**.
  - **`t_fim + 180ms → t_fim + 860ms` (A Rajada Única):** 6 patinhas (`PawBurst`, alternando `--persona-accent` e `--persona-lilac-400`) irradiam `56px` e evaporam em `680ms --ease-enter` (`iterations: 1`, depois **0% GPU**). O botão âmbar **`Aceitar e entrar na Persona →`** ganha foco automático para `Enter`.

---

### Momento UAU 2 · Passagem de Bastão ao Vivo entre Colegas (`Bia → Téo → Lia`)
- **Contexto:** No `#geral`, a pessoa pediu *"Texto e cartaz de pão de queijo em dobro por R$ 9"*.
- **Roteiro Quadro a Quadro:**
  - **`0ms → 180ms` (O Plano Vivo):** A mensagem do usuário sobe do composer (`translateY(8px → 0)`, `180ms --ease-enter`). Logo abaixo, Lia posta um único `TeamPlanCard` (`Dividi assim`):
    - Linha 1: `[Rosto Bia pêssego]` **Texto do cartaz** · chip lilás `fazendo`
    - Linha 2: `[Rosto Téo céu]` **Arte 1080×1350** · chip neutro `esperando Bia`
  - **`180ms → 400ms` (Sincronia Chat ↔ Palco):** Na Barra/Faixa do topo, **só a Bia** muda para `trabalhando` (`220ms --ease-spring`); Téo olha atento em `disponivel`, sem gastar 1 token nem inventar texto provisório!
  - **`t_bia_fim → t_bia_fim + 360ms` (O Bastão Passa):**
    1. No `TeamPlanCard`, o chip de `Texto` faz crossfade e pulso único de escala (`1 → 1.06 → 1` em `200ms --ease-spring`) virando verde **`✓ pronto`**, enquanto o chip de `Arte` vira lilás **`fazendo`**.
    2. No fio, pousa **1 linha compacta de passagem** (`180ms --ease-enter`): `[Bia 24px] → [Téo 24px] Bia passou o texto aprovado para Téo montar a arte` com o chip clicável do rascunho.
    3. Na faixa do topo (e no Kanban, se aberto via `useKanbanCarry` em `360ms cubic-bezier(0.25, 0.9, 0.3, 1)`), Bia volta a `disponivel` e **Téo salta `-6px` entrando em `trabalhando`** exatamente `80ms` depois — o olho assiste literalmente ao bastão saindo das mãos da redatora para o designer!

---

### Momento UAU 3 · Rodada de Opinião Visual do Time com Slider `Antes · Depois`
- **Contexto:** Téo salvou a 1ª versão do cartaz (`arte-v1.svg`) no rascunho e chamou Bia e Lia para opinarem sobre a imagem antes de incomodar o dono.
- **Roteiro Quadro a Quadro:**
  - **`0ms → 200ms` (A Peça na Mesa):** Surge no fio o `OpinionBlock` aberto (`180ms --ease-enter`) com a miniatura nítida da **`arte-v1.svg` (`280px` de altura)** ao centro e o subtítulo `"Téo pediu o olhar de Bia e Lia · Rodada 1"`. Na faixa acima, Bia e Lia mudam para a pose `lendo`/`revisando` (com óculos/lupa, `220ms`).
  - **`t_op1` e `t_op2` (Vozes com Ponto de Vista Real):**
    - Entra a linha da **Bia** (`160ms --ease-enter`) com chip azul `Sugestão`: *"Destaca maior o 'em dobro' acima do R$ 9 — é o gatilho que faz parar na rua."*
    - Entra a linha da **Lia** (`160ms --ease-enter`) com chip âmbar `Ponto de atenção`: *"Dá mais respiro entre o preço e o rodapé do WhatsApp."*
  - **`t_v2 → t_v2 + 380ms` (O Antes · Depois Tátil):** Téo grava `arte-v2.svg`. Dentro do cartão, sobre a imagem, desliza uma **cortina comparadora `Antes | Depois`** (`clip-path: inset(0 50% 0 0)` varrendo de `100%` para `0%` em **`380ms cubic-bezier(0.22, 1, 0.36, 1)`**, revelando a `Versão 2` com o respiro corrigido e deixando um controle manual `Antes · Depois` para o usuário brincar!).
  - **`t_v2 + 1400ms → t_v2 + 1620ms` (Arrumação Automática da Sala):** Consolidada a melhoria e selada pela Lia, o `OpinionBlock` recolhe suavemente (FLIP `220ms --ease-standard`) para a pílula limpa de `52px` (`[miniatura 36px] Téo ajustou a arte com 2 toques de Bia e Lia · Ver Antes/Depois ▾`), abrindo caminho triunfal para o `DeliveryCard` único logo abaixo!

---

### Momento UAU 4 · A Mesa de Luz ("Circule e Fale" em 4 Segundos)
- **Contexto:** A pessoa vê o `DeliveryCard` com o cartaz pronto, acha ótimo, mas quer trocar o selo de preço de vermelho para âmbar e aumentar a fonte do telefone — sem digitar uma redação.
- **Roteiro Quadro a Quadro:**
  - **`0ms → 200ms` (Abertura sobre Papel Escuro):** Clique na miniatura do `DeliveryCard` → abre a **Mesa de Luz** (`scrim` ameixa-noite `rgb(12 8 18 / 0.80)`, a arte cresce do retângulo da miniatura até o centro da tela via FLIP `200ms cubic-bezier(0.16, 1, 0.3, 1)`). O cursor vira uma ponta de lápis âmbar.
  - **`200ms → 1800ms` (O Traço Direto):** A pessoa arrasta o mouse fazendo um círculo solto em volta do selo `R$ 9`. O `<canvas>` 2D desenha a 60 fps um traço orgânico com **dupla camada estilo nanquim da casa** (`6px` ameixa `#34243F` por baixo + `3.5px` âmbar `#E8AF54` por cima) e planta um selo numerado **`①`** (`24×24px`, âmbar com contorno ameixa, pop `140ms --ease-spring`) no fim do traço.
  - **`1800ms → 3500ms` (A Nota de 3 Palavras):** Ancorada a `12px` do selo `①`, abre sozinha uma pílula-adesivo branca/card (`260px`, `140ms --ease-enter`) já focada: a pessoa digita `"fundo âmbar e maior"` e aperta **`Enter`**.
  - **`3500ms → 3700ms` (De Volta ao Autor):** A Mesa de Luz fecha (`160ms --ease-exit`), cravando no fio um mini-cartão compacto `[miniatura com o círculo ①] Você marcou 1 ponto na arte para Téo: "fundo âmbar e maior"`. Téo entra em `trabalhando` na hora e devolve em 1 turno a arte exata com o comparador `Antes · Depois`.

---

### Momento UAU 5 · O "Bom Dia" com Acender do Escritório
- **Contexto:** 08:45 da manhã do dia seguinte. A pessoa abre a Persona pela primeira vez no dia (custo de IA = **zero tokens**, 100% determinístico a partir do SQLite local).
- **Roteiro Quadro a Quadro:**
  - **`0ms → 220ms` (Abertura sem Tela Branca):** A janela já pinta no frame 0 com o papel do tema (`#FAF3E4` dia / `#1E1526` noite) e faz crossfade limpo (`200ms --ease-enter`) para o `#geral`. No tema noturno, o gradiente da luminária (`lampLayer` + `.halo` corrigido) faz um **único acendimento suave ao chegar** (`opacity: 0 → 1` em `420ms cubic-bezier(0.16, 1, 0.3, 1)`, `iterations: 1`, estacionando depois em **0% de GPU**).
  - **`140ms → 380ms` (O Cartão `Bom dia` Pousa na Mesa):** Entra o `DailyBriefCard` (`translateY(8px → 0)`, `200ms --ease-enter`) com o spot ilustrado da janela ensolarada (de manhã) ou xícara/luminária, trazendo as 3 seções em stagger curto de `45ms`:
    1. **`ONTEM`** — `[Rostos Bia + Téo + Lia] Cartaz Padaria Lua ficou pronto e aplicado na pasta`
    2. *(Trilha horizontal delicada de patinhas `pawTrail` de `8px` separando os dias)*
    3. **`HOJE`** — `[Rosto Nina] Conferindo preços da semana · rotina das 9:00`
    4. **`PRECISA DE VOCÊ`** — `1 entrega rápida espera seu OK` + botão sticker **`Revisar agora →`**
  - **`380ms → 900ms` (O Aceno Único):** Na faixa acima, a coordenadora Atlas/Lia exibe 1 aceno curto de chegada (`pose: acenando → disponivel`, `520ms`, `1× por manhã`) e repousa serena, pronta para o dia.

---

## 5. Facilidade Radical: Do Primeiro Uso até a Primeira Entrega Revisada em ≤ 3 Minutos

### Diagnóstico do Funil Atual (Por que hoje passa de 6–10 minutos ou trava)
Hoje o `OnboardingWizard.tsx` empurra **5 etapas sequenciais** antes de a pessoa ver o app: (1) Seu nome → (2) Texto longo da empresa + bloco inteiro `Traga o que suas IAs já sabem` + scanner de pasta Obsidian → (3) Lista técnica de CLIs → (4) Escolha entre 4 templates + Assistente de Estrutura + `BuilderThread` por chat → (5) Pedido fixo que na v1.1 caía sem pasta de rascunho ou demorava minutos sem streaming real. É um questionário de RH antes do primeiro café.

### Regra de Ouro do Novo Primeiro Uso
> **Zero configuração que não mude a primeira entrega.** O primeiro uso tem apenas **2 perguntas humanas de 1 tela + 1 entrega real ao vivo**. Todo o resto nasce com padrões inteligentes pré-preenchidos e mora a 1 clique depois.

---

### Cronograma Segundo a Segundo (Meta Total: **`1 min 55 s`**, teto folgado ≤ `3 min`)

| Tempo acumulado | Passo na tela | O que a pessoa vê | O que a pessoa faz (esforço mínimo) | Tempo do passo |
|---|---|---|---|---|
| **`0:00 → 0:03`** | **0. Abertura limpa (`BOOT-SPEC`)** | Janela abre no frame 0 em papel creme `#FAF3E4` / noite `#1E1526` com Atlas em pose `acenando` e `"Abrindo a Persona…"` (enquanto o host já subiu em paralelo). Crossfade de `200ms`. | Nada (zero clique). | **3 s** |
| **`0:03 → 0:30`** | **Passo 1 de 2 · Quem é você e o que vocês fazem** *(fusão enxuta dos antigos passos 1, 2 e 4)* | Palco ilustrado com a equipe chegando (`stagger 50ms`). Apenas **2 campos na mesma tela limpa**:<br>1. `Como a equipe deve chamar você?` *(pré-preenchido com o primeiro nome do usuário do Windows, ex.: `Miguel`, já selecionado caso queira trocar)*.<br>2. `Em uma linha, qual é o seu trabalho ou negócio?` *(ex.: `"Padaria artesanal em Pinheiros"`, `"Agência de tráfego"`, `"Desenvolvimento de software"` — opcional, com 4 chips rápidos de área que já ajustam a equipe ideal automaticamente nos bastidores!)*.<br>Botão âmbar: **`Montar minha equipe →`** (`Enter`). | Confere o nome já preenchido, escreve 4–6 palavras do negócio (ou clica 1 chip) e aperta `Enter`. | **27 s** |
| **`0:30 → 0:45`** *(0 s se já logado!)* | **Passo 2 de 2 · Motor de IA (Auto-skip inteligente!)** | **Se o host já detectou Claude / Codex / Cursor / OpenCode autenticado na máquina (caso de 80%+ do público-alvo):** **ESTE PASSO NEM ABRE como barreira!** Aparece apenas um selo verde tranquilizador de `1,2s` na transição (`✓ Claude conectado neste computador — usando sua assinatura`) direto para a Primeira Entrega!<br>**Se nenhuma IA estiver logada:** mostra só os cartões limpos com 1 botão **`Conectar agora`** (que abre o login direto sem despejar 10 linhas de bash com hashes). | **0 cliques** se já tiver CLI logada; ou 1 clique guiado se máquina virgem. | **0 a 15 s** |
| **`0:45 → 1:05`** | **A Primeira Entrega · Pedido Pré-Preenchido do Negócio** | A equipe contratada (`Atlas, Bia, Téo, Nina, Luna` — adaptada ao ramo do Passo 1) dá um "oi" de 1 linha real. O campo **`Seu primeiro pedido`** já vem **pré-preenchido e editável** usando o texto do Passo 1 (ex.: para *"Padaria Lua"*: `"Crie 3 promoções criativas para dias fracos na Padaria Lua e salve um rascunho de cardápio relâmpago em promocoes-semana.md"`) + 2 chips alternativos de 1 clique. Uma pasta de rascunho segura padrão (`Documentos/Persona/Projetos/Principal`) já nasce pré-vinculada! Botão âmbar: **`Pedir agora`** (`Enter`). | Lê o pedido já escrito sob medida para o negócio dela (edita se quiser) e aperta `Enter`. | **20 s** |
| **`1:05 → 1:35`** | **Execução ao Vivo com Rosto e Streaming Real** | Momento UAU 1: Atlas/Bia assume em pose `trabalhando` (`160px`), o `ActivityGroup` mostra `"Salvando rascunho seguro em promocoes-semana.md"` e **o texto cresce em streaming real** diante dos olhos da pessoa no modelo rápido/equilibrado da conta (`Sonnet`/`Haiku`, 1 turno enxuto sem fan-out pesado). Lia passa o selo rápido `✓ Revisado por Lia`. | Assiste à equipe trabalhando ao vivo (com link `Entrar e acompanhar no #geral` visível desde o segundo 1). | **25 a 30 s** |
| **`1:35 → 1:55`** | **Revisão Visual de 1 Clique e Chegada ao `#geral`** | O cartão se transforma na entrega pronta com carimbo + 6 patinhas (`680ms`), mostrando o texto limpo **e** o chip visual do arquivo `promocoes-semana.md` com preview lado a lado (`Novo arquivo no rascunho`) e dois botões claros: **`Aplicar e entrar na Persona →`** (primário âmbar) e `Pedir um ajuste` (que já abre um campo de 1 linha ali mesmo). Ao clicar em **Aplicar e entrar**, cai direto no `#geral` vivo com a entrega registrada, a equipe acordada e o próximo passo sugerido no composer! | Lê as 3 ideias, vê o arquivo pronto e clica em **`Aplicar e entrar na Persona →`**. | **20 s** |

**Tempo total real do clique de abrir até a 1ª entrega revisada e aplicada:** **`1 min 55 s`** (sobrando **+65 segundos de margem** abaixo da meta de 3 minutos!).

---

### Tabela Cirúrgica: O que CORTAR do Primeiro Uso vs O que PRÉ-PREENCHER

| Hoje pede / bloqueia no 1º uso | Decisão do CARBON | Para onde vai / Como fica pré-preenchido |
|---|---|---|
| Digitar o próprio nome do zero no Passo 1 | **PRÉ-PREENCHER** | Ler `os.userInfo().username` / nome de exibição do Windows capitalizado (`"Miguel"`), já focado e selecionado para `Enter` imediato em 1 segundo. |
| Bloco `Traga o que suas IAs já sabem` + abas ChatGPT/Claude/Gemini + scanner de pasta Obsidian dentro do Passo 2 | **CORTAR DO ONBOARDING** | Sai 100% do wizard inicial! Vira um cartão opcional dispensável na `Visão geral` no Dia 1 (`"Quer trazer memórias do ChatGPT ou Obsidian? · Importar em 1 min"`) e mora em `Memória da empresa › Importar`. |
| Passo 3 obrigatório mesmo quando o Claude/Codex já está logado e pronto | **AUTO-PULAR (`0` cliques)** | Sonda roda em paralelo durante o Passo 1; se `ready === true` em ≥ 1 motor completo, o Passo 3 é suprimido e aparece só um chip `✓ Usando Claude conectado` (com link `Trocar` para quem quiser). |
| Passo 4 com 4 templates + botão `Assistente de estrutura` + chat `BuilderThread` aninhados dentro do wizard | **CORTAR DO ONBOARDING & PRÉ-PREENCHER** | O ramo digitado/clicado no Passo 1 já seleciona automaticamente a equipe ideal de 4–5 animais com funções certas (`Coordenação + Texto + Design + Pesquisa + Vigia`). Contratar mais ou reorganizar mora em `Equipe › + Contratar persona`. |
| Projeto nascendo **sem pasta** (que quebrava `"Pode salvar arquivos no rascunho"` e repetia 5 avisos de erro em Configurações!) | **PRÉ-PREENCHER PASTA PADRÃO** | Todo projeto inicial já nasce com `Documentos/Persona/{NomeDoProjeto}` criada localmente (com botão `Trocar pasta…` visível). Resultado: a equipe **já pode entregar arquivos e artes desde o minuto 1** sem erro! |
| Primeiro pedido genérico (`"Resumir em 5 pontos..."`) ou pesado demais (rodadas duplas de opinião estourando 12 turnos) | **PRÉ-PREENCHER CONTEXTUAL + ORÇAMENTO RÁPIDO** | Gerar deterministicamente (template C0 com o nome do negócio do Passo 1, zero espera de LLM!) 3 opções práticas de pedido; rodar a 1ª entrega em **1 turno direto + 1 revisão leve**, garantindo resposta em `< 25s`. |
| Popover tutorial `"A Coordenação distribui o pedido"` travado sobre o `#geral` ao entrar | **CORTAR POPOVER BLOQUEANTE** | Zero tour de setinhas tampando chat! O próprio placeholder do composer (`"Peça qualquer tarefa para a equipe — Atlas divide entre os colegas…"`) ensina no lugar certo sem cobrir uma única mensagem. |

---

## Resumo de Execução para a Equipe (Ordem de Ataque de Design/UI)

1. **Hoje (Bloco P — Acabamento Imediato e GPU ≤ 2%):** Itens **#02** (pausa tripla + fim de `lampBreathe` e `blur`), **#05** (corrigir quadrado do `.halo`, pílula `Claude` escura e `zZz` noturno), **#06** (tirar dupla coluna da DM), **#15** (corrigir `"Se essa pessoa some"` + `HealthScore`), **#17** (fundos distintos nos avatares `24px`) e **#20** (matar `owner@workspace.local` + alinhar rodapé do rail).
2. **Dias 2–4 (Bloco M — Fluxo Diário, Espaço e Facilidade 3 min):** Itens **#01** (faixa adaptativa `264px ↔ 56px` no `#geral`), **#03** (limpar composer + `Modelo · Esforço` + `Ctrl+V` de imagem), **#04** (`OpinionBlock` recolhido + fila sem corte), **#08** (Configurações de 8 → 5 abas + `<AboutPersona>` inline + religar `Revisão antes de entregar`), **#09/#10/#12/#13/#14/#16** e o **Novo Onboarding de 2 Passos (Seção 5)**.
3. **Dias 5–8 (Bloco UAU — Diferenciação Nível Apple/Linear):** Item **#11** (`Ctrl+K` modal `150ms`), Item **#18/#19** (Organograma horizontal + Canvas com dot-grid), Item **#07** (**Mesa de Luz "Circule e Fale"**) e polimento fino quadro a quadro dos **5 Momentos UAU (Seção 4)** com gate automático `axe 0` + `getAnimations() === 0` sem foco.

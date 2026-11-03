# Quadros por projeto, fluxo e sprints — especificação visual (Muse → Lumen, 03/11/2026)

Base: `persona-spec/PROJECT-BOARDS.md` (BRIEFING 15) + `persona-spec/DESIGN-SYSTEM.md` + receita comum de `SCREEN-SPECS.md`. Primitivos: `Screen`, `ScreenHeader`, `Card`, `Chip`, `Avatar`, `Tabs`, `Modal`, `Toast`, `EmptyState`, `Skeleton`, `ErrorState`, `Button/IconButton`, `Input/Textarea`, `BrandIcon/UiIcon`, `Accent`.

## 0. Cor e forma das categorias de estágio

Tokens novos no tema (`theme/persona-palette.css`), claro e escuro: `--persona-cat-{todo|doing|review|needs-you|done|blocked}` e `--persona-cat-*-tint`.

| Categoria | Cor | Ícone (UiIcon/BrandIcon) | Rótulo curto |
|---|---|---|---|
| `todo` | lilás 400 | `kanban` | A fazer |
| `doing` | brand | `sparkle` | Em andamento |
| `review` | info | `review-loupe` (overlay) | Em revisão |
| `needs_you` | âmbar | `clock` | Precisa de você |
| `done` | success | `check` | Concluído |
| `blocked` (marcador) | danger | `alert` | Travado |

Regra: a cor da categoria aparece só como **faixa de 4px no topo da coluna**, ponto no cabeçalho e segmento na barra de progresso — sempre acompanhada do rótulo/ícone (nunca só cor). A coluna em si é papel afundado (`--persona-paper-sunken`).

## 1. "Quadros" (o item "Kanban" do rail vira "Quadros")

- `Screen` + `ScreenHeader icon="kanban" eyebrow="Trabalho" title="Quadros" subtitle="Cada projeto com o seu fluxo e as suas sprints."` + **primário** "Novo projeto".
- Filtro opcional em `Tabs`: Todos · Com sprint ativa · Precisa de você.
- **Grade** `repeat(auto-fill, minmax(320px, 1fr))`, gap 20. Cada projeto = `Card interactive` (levanta no hover), conteúdo:
  1. Linha 1: selo 40px do **modelo de fluxo** (ícone do Brush em `--persona-wash`, contorno) + nome do projeto Fredoka 19 + `IconButton ⋯` (Abrir quadro · Editar fluxo · Configurações).
  2. Linha 2: `Chip size="s"` com o nome do modelo ("Contratação") + `Chip` da sprint atual ("Sprint 3 · faltam 4 dias", tom brand) quando houver.
  3. **Barra de categorias**: trilho 10px raio pill, segmentos proporcionais às contagens por categoria (cores §0), contorno ameixa fino; legenda abaixo em 12/700 só com as categorias > 0 ("3 a fazer · 2 em andamento · 1 precisa de você").
  4. Rodapé: avatares sobrepostos (24px, −8px, até 4 + "+N") de quem trabalha agora, com selo de estado; à direita `Chip accent` "Precisa de você: N" quando N > 0.
- Vazio: `EmptyState` com `ILLUSTRATIONS['empty-kanban']`, "Crie seu primeiro projeto", "Escolha um modelo — contratação, site, software… — e a equipe já sabe as etapas.", primário "Novo projeto".
- Carregando: 3 cartões `Skeleton shape="block" height={190}`.
- **Visão global** (opcional): botão ghost "Ver tudo por categoria" → raias por projeto (cada raia = `Card padding="s"` recolhível com o selo do modelo + nome; dentro, 5 mini-colunas por categoria com contagem e os 3 primeiros cartões).

## 2. Página do projeto (abre no quadro)

- `ScreenHeader` com selo do modelo, eyebrow "Projeto", título = nome do projeto, subtítulo = descrição curta; ações: secondary "Editar fluxo" + **primário** "Nova tarefa".
- `Tabs`: **Quadro** · Conversa · Arquivos · Rotinas · Sprints (Sprints só se o projeto tiver sprints ativadas).

### 2.1 Faixa da sprint (topo do quadro, se houver sprint ativa)

`Card padding="s"` com tom brand (faixa lateral), layout em linha:
- Eyebrow "Sprint 3" + objetivo em Fredoka 17 (1 linha, reticências; tooltip com o texto todo).
- Datas "3–14 nov." + `Chip` "faltam 4 dias" (vira `warning` com ≤ 1 dia, `danger` atrasada).
- Barra de progresso (concluídas/total) com **patinha** como marcador do ponto atual (`Accent name="paw-prints"` recortado, 14px).
- Ações à direita: secondary "Planejar" · ghost "Encerrar sprint".
- Sem sprint e projeto com sprints ativadas: faixa tracejada "Nenhuma sprint em andamento" + secondary "Planejar sprint".

### 2.2 Quadro

- Colunas do fluxo em linha, rolagem horizontal suave (scroll-snap por coluna), largura 296px, **altura mínima 420px**, gap 16.
- **Cabeçalho da coluna**: faixa de 4px da categoria no topo; ponto da categoria + nome da coluna Fredoka 16 + `Chip size="s"` com contagem; WIP "3/5" em chip — `warning` quando atinge o limite, `danger` acima; abaixo, rótulo da categoria em 11/800 caixa alta ink-faint ("EM REVISÃO").
- **Coluna `needs_you`**: fundo `--persona-cat-needs-you-tint`; **`done`** recolhível depois de 10 cartões ("+12 concluídas").
- **Cartão** (`Card padding="s" interactive`, raio m): título 15/700 (2 linhas); linha de chips: projeto/campo-chave do fluxo (ex.: candidato "Ana Souza" · cargo "Designer"), prazo (`clock`, warning se ≤ 1 dia), dependência (`chevronRight` + "depende de 2"), evidência (`attach` + contagem); rodapé: `Avatar portrait 24` do responsável + `Chip` de estado (trabalhando/aguardando você/travado/descansando) + `IconButton ⋯` (menu: Mover para → colunas · Abrir · Pedir status · Remover da sprint). **Nada de `<select>` no cartão.**
- **Arrastar**: cartão levanta (`--persona-shadow-lift`, rotate 1°, scale 1.02); coluna-alvo com contorno tracejado 2px da cor da categoria; WIP estourado mostra aviso inline (não bloqueia, pede confirmação). Teclado: Espaço pega, setas movem entre colunas, Espaço solta, Esc cancela; `aria-live` anuncia "Movido para Entrevistas".
- **Evento real** (persona move): FLIP 360ms com o mini-avatar da persona "carregando" o cartão (UX-GUIDE §3); chegar em `done` com revisão aprovada → `paw-burst` 1×.
- **Coluna vazia**: ilustração pequena do Brush por categoria (`empty-col-{todo|doing|review|needs-you|done}`, 120px) + 1 linha ink-faint ("Nada em revisão agora") — sem botão (exceto a primeira coluna: ghost "+ Tarefa").

## 3. Planejamento de sprint (tab Sprints → "Planejar")

`Screen width="full"` em duas colunas (minmax 0 1fr cada):
- **Esquerda — Backlog**: busca + filtros chips (responsável, campo); lista de cartões compactos (título, responsável, estimativa opcional) com checkbox-adesivo; arrastar para a direita.
- **Direita — Sprint**: campos `Input` Nome, `Textarea` Objetivo (vira o goal da Coordenação — dica: "A coordenação usa o objetivo para planejar sozinha"), datas (2 `Input type=date`); **medidor de capacidade** (tarefas por persona: avatar + barra); lista dos cartões da sprint.
- Teclado/sem arrastar: selecionar + botão "Adicionar à sprint →" / "← Voltar ao backlog".
- Rodapé fixo: ghost "Cancelar" · **primário** "Iniciar sprint" (desabilitado sem objetivo ou sem tarefas).

## 4. Encerrar sprint

`Modal size="l"` com a ilustração `sprint-concluida` do Brush no topo (palco, 160px):
- Título "Sprint 3 concluída"; 3 números grandes Fredoka 32 tabular (Entregues · Atrasadas · Ficaram para depois).
- "Quem fez o quê": linha de avatares com contagem por persona.
- Não concluídas: botões-adesivo `aria-pressed` "Mover para a próxima sprint" / "Voltar ao backlog" (uma escolha), lista recolhível das tarefas.
- **Primário** "Encerrar sprint". Depois: `Toast tone="celebrate"` + mensagem de marco no canal do projeto (cartão com a mesma ilustração, Fredoka, contagens) — peak-end.

## 5. Editor de fluxo ("Editar fluxo" / criação do projeto)

**Criação**: passo "Escolha um modelo" com grade de 7 cartões-adesivo `aria-pressed` (ícone do modelo do Brush 48px, nome Fredoka, colunas como mini-chips em fila: "Vaga → Busca → Triagem → …"); cartão "Sugestão da coordenação" (`Sparkle`) quando a Coordenação propõe um fluxo pela descrição — aceitar/editar.

**Editor** (`Modal size="l"` ou tela própria), 2 painéis:
- **Esquerda — colunas** (lista arrastável, alça `⋮⋮`): por linha → bolinha de cor (paleta de 8 swatches do tema em popover) · `Input` nome · **categoria** como segmentado de 5 botões-adesivo pequenos com ícone (tooltip explica: "Precisa de você: aparece no topo da Visão geral e pede sua decisão") · `Input type=number` WIP (opcional) · `IconButton` remover. Abaixo: secondary "+ Adicionar coluna". Seção "Campos extras" (chips com tipo: texto, link, número, data, seleção) + "+ Campo".
- **Direita — prévia ao vivo**: mini-quadro (colunas 120px com cabeçalho e 2 cartões fantasmas) atualizando a cada mudança.
- Validação: pelo menos 1 coluna `todo` e 1 `done` (mensagem inline com ícone, não modal).
- **Remover coluna com tarefas**: diálogo "Para onde vão as 4 tarefas de 'Triagem'?" com lista de colunas (botões-adesivo) + primário "Mover e remover".
- Rodapé: ghost "Descartar" · **primário** "Salvar fluxo".

## 6. Assets pedidos ao Brush

- Ícones de modelo (SVG `currentColor`, viewBox 24, traço 1,75 como `icons/nav`): `flow-contratacao`, `flow-site`, `flow-software`, `flow-marketing`, `flow-atendimento`, `flow-simples`, `flow-branco`; nav `sprints`.
- Estados vazios por categoria (PNG transparente 480×360, personagem pequeno + objeto): `empty-col-todo` (Bento com caixa fechada), `empty-col-doing` (Sol com notebook fechado), `empty-col-review` (Luna com lupa), `empty-col-needs-you` (Atlas tranquilo, prancheta em dia), `empty-col-done` (Nina com troféu pequeno).
- `sprint-concluida` (800×640): equipe comemorando com bandeirinhas/confete discreto.

## 7. Aceite visual (Muse)

Capturas claro/escuro de: Quadros (grade com 2 projetos: Contratação e Site), quadro de cada um, faixa da sprint, planejamento, modal de encerrar, editor de fluxo com prévia — via `node scripts/persona/design-shots.mjs panel:Quadros …`. Foco visível em todo o fluxo por teclado; reduced-motion sem FLIP/levantar.

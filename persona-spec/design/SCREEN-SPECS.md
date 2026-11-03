# Especificações por tela (Muse → Prism, Lumen) — 03/11/2026

Base obrigatória: `persona-spec/DESIGN-SYSTEM.md`. Padrão de referência implementado por Muse: **#geral** (`chat/GeneralChannelView`), **Visão geral** (`overview/OverviewView`), **onboarding** (`onboarding/OnboardingWizard`) e **rail** (`shell/PersonaSidebar`). Capturas: `.maestri/tmp/shots/design/`.

## Receita comum (vale para TODAS as telas)

1. **Casca**: `<Screen width="default|reading">` + `<ScreenHeader icon="<ícone do rail>" eyebrow="<grupo>" title="<nome da tela>" subtitle="<1 frase do que dá para fazer aqui>" actions={…} />`. Ícone = o mesmo do item do rail. Eyebrow = grupo do rail ("Trabalho", "Empresa"…).
2. **Uma** ação primária (`<Button variant="primary">`) por tela, no cabeçalho ou no estado vazio — nunca nos dois ao mesmo tempo. Demais ações: `secondary`/`ghost`.
3. Conteúdo em `<Card>` (contorno ameixa + sombra sticker). Listas dentro do cartão com divisória `--persona-outline-soft`, sem cartão por linha (exceto kanban/galerias).
4. Estados obrigatórios: **vazio** (`<EmptyState illustration={poseUrl(<persona>,'disponivel'|'descansando')}>` + 1 ação), **carregando** (`<Skeleton>` com a forma do conteúdo — nunca spinner), **erro** (`<Card tone="danger">` com texto humano + "Tentar de novo"), **cheio**.
5. Estado de persona sempre com `Chip` de tom (success=trabalhando, accent=aguardando você, danger=travado, neutral=descansando) + texto.
6. Formulários com `<Input>/<Textarea>` (rótulo visível, dica, erro com ícone). Proibido `<select>`/`<input>` cru sem estilo. Para escolha entre 2–5 opções use `Tabs` ou botões-adesivo `aria-pressed` (ver templates do onboarding).
7. Ícones: `BrandIcon` (rail) ou `UiIcon` (UI). **Proibido emoji como ícone.**
8. Avatares: `<Avatar src={AVATAR_96[id]} shape="portrait">` para personas, `<Avatar name>` (iniciais) para pessoas.
9. Tipografia: títulos sempre Fredoka (h1 28, h2 22, h3 17–19); corpo Nunito 500 15–16. Nada abaixo de 12px.
10. Zero hex/px soltos: só tokens `--persona-*` (ver §2 e §4 do design system). Remova `--persona-active-*`/`--persona-lilac-*` direto nos componentes quando tocar o arquivo — use os semânticos (`--persona-ink`, `-ink-soft`, `-card`, `-wash`, `-outline`…).
11. Escuro: verifique cada tela com `body[data-ds-dark-theme='true']` — nada de branco puro ou cinza.
12. Prova: `node scripts/persona/with-lock.mjs "<nome> shots" -- node scripts/persona/design-shots.mjs` (adicione sua tela ao script se ainda não estiver) e mande as capturas claro/escuro para Muse.

## Prism

| Tela | Especificação |
|---|---|
| **Mensagens diretas** (`shell/DirectMessagesPanel`) | Layout 2 colunas: lista de conversas (cartão, 300px) com `Avatar portrait 40` + nome Fredoka + última linha ink-soft + hora faint + selo de não lidas âmbar; à direita a conversa reaproveitando `ChannelMessageRow`/`ChannelComposer` do #geral (sem banner; cabeçalho = retrato 48 + nome + cargo + `Chip` de estado). Vazio: pose `descansando` de Atlas + "Abra uma conversa com alguém da equipe" + primário "Nova conversa". |
| **Editor de persona** (`persona-editor/`) | `Screen width="reading"`. Topo: cartão-herói com pose grande (160px) da persona sobre `TeamScene`/banner, nome editável h1, cargo como `Chip`. Seções em `Card` com `eyebrow` (Identidade · Personalidade · Ferramentas e permissões · Limites · Horário · Relações). Permissões por ferramenta = `Tabs` de 3 posições (Nenhum · Leitura · Leitura+escrita). Rodapé fixo com "Salvar" primário + "Descartar" ghost. |
| **Projetos** (`shell/ProjectsPanel`) | Grade de `Card interactive` (3 colunas ≥1280): nome h3, caminho mono faint, avatares sobrepostos da equipe (−8px), contagem de tarefas por estágio em `Chip size="s"`. Primário "Novo projeto". |
| **Busca** (`SearchPlaceholderView`) | Campo grande (56px, raio xl) centralizado com ícone `busca`, atalho `Ctrl K` em `kbd`; abaixo filtros como `Tabs` (Tudo · Mensagens · Tarefas · Cofre · Arquivos); vazio ilustrado com Luna (`revisando`). |
| **Contratar persona** (`hire/HirePersonaCard`) | Cartão com `tone="accent"`, pose da proposta à esquerda, resumo (cargo, ferramentas como chips, orçamento) e duas ações: "Contratar" primário / "Editar antes" secondary. |
| **Overlays de estado** (`team/PersonaTeamFigure`) | Já no padrão (bolha-adesivo 34px). Ao implementar overlays SVG animados (digitando/zzz/lupa), manter dentro da bolha e respeitar `[data-ambient-paused]`. |

## Lumen

| Tela | Especificação |
|---|---|
| **Kanban** (`kanban/`) | Colunas = trilho `--persona-paper-sunken` raio l, cabeçalho com título Fredoka 17 + contagem em `Chip size="s"`; cartões = `Card padding="s" interactive` raio m, título 15/700, rodapé com `Avatar portrait 24` do responsável + chips (aguardando evento = `accent`, bloqueado = `danger`). Arrastando: `--persona-shadow-lift` + rotate(1°) + scale 1.02; coluna-alvo com contorno tracejado brand 2px. Concluído com revisão: `PawTrail`/`paw-burst` 1x. Primário "Nova tarefa". |
| **Cofre / Conhecimento** (`knowledge/`) | Cabeçalho com ícone `conhecimento-memoria`. `Tabs`: Restrições · Decisões · Briefings · Documentos. Cada registro = linha em cartão com selo de tipo (`Chip`), texto, proveniência faint ("por Nina · 2 de nov."), ação ghost "Editar". Restrições fixadas com faixa `tone="accent"` e cadeado. Vazio: Atlas `revisando` + "Conte sobre a empresa". |
| **Rotinas** (`routines/`) | Lista de `Card` por rotina: ícone `rotinas` em selo, nome h3, agenda legível ("Seg a sex, 9h") + `Chip` de próxima execução, responsável (avatar 24), switch ligado/desligado (botão-adesivo `aria-pressed`). Pausadas com opacidade .7 + `Chip neutral` "Pausada". |
| **Arquivos** (`files/`) | Tabela dentro de `Card padding="none"`: cabeçalho de colunas eyebrow 12/800, linhas 48px com hover `--persona-wash`, ícone por tipo (`arquivos`), caminho mono. Breadcrumb do projeto como chips. |
| **Uso e limites** (`usage/`) | Números grandes Fredoka 32 tabular + rótulo eyebrow; barras de uso = trilho sunken + preenchimento brand (âmbar ≥ 80%, danger ≥ 95%) com contorno; selo de origem (medido/estimado/oficial) em `Chip`. "—" para indisponível (nunca 0% falso). |
| **Conexões** (`connections/`) | Grade 2 colunas de `Card`: logo/nome da CLI h3, `Chip success` "Conectada" / `neutral` "Não detectada", modelo padrão, ação secondary "Testar" / "Conectar". Igual aos harnesses do onboarding passo 3. |
| **Aprovações** (`approvals/`) | Lista de `Card tone="accent"`: quem pede (avatar portrait 40 + nome), pergunta em 16/600, contexto ink-soft, ações "Aprovar" primário (só no item em foco/primeiro) e "Recusar" secondary. Vazio: "Nada esperando por você" com Atlas `disponivel`. |
| **Regras** (`rules/`) | Seções em `Card` com eyebrow; cada regra = linha com descrição + `Tabs`/botões-adesivo para o efeito; janelas de silêncio como chips de horário. |
| **Perfil** (`profile/`) | Cartão-herói (avatar person 96 + nome h1 + e-mail faint), métricas de proatividade em 3 cartões de número grande, preferências em `Card` com `Input`s. |
| **Membros / Importar / Canvas** | Receita comum; Membros = lista com `Avatar` + papel `Chip`; Importar = assistente com stepper igual ao do onboarding. |

## Ordem sugerida

Prism: DMs → editor de persona → projetos → busca → contratar.
Lumen: kanban → Cofre → aprovações → uso → rotinas → conexões → arquivos → regras → perfil.

Mande as capturas (claro/escuro) a cada 2 telas: `maestri ask "Muse" "<telas> prontas: <caminhos>"`.

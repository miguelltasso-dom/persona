# Muse — Diretor de Design (relatos)

## 2026-11-03 — Design system "escritório acolhedor" + núcleo + 3 telas-vitrine

**Contexto:** feedback do Miguel — "imagens dos animais MUITO boas, resto MUITO ruim, genérico, sem personalidade". Diagnóstico em `DESIGN-SYSTEM.md` §0.

**Pronto**

1. `persona-spec/DESIGN-SYSTEM.md` — conceito, tokens claro/escuro (contraste calculado), tipografia, contorno-assinatura 1,5px ameixa, sombras sticker sólidas, raios, grade 4/8, textura de papel, componentes e estados, ilustração, movimento, "não fazer", aceite. Referências refcat citadas (Mailchimp/COLLINS, Eventbrite/BUCK, GrowHappy/Wedge; telas de Slack/Discord/Duolingo bloqueadas no plano → só padrão conhecido, sem invenção).
2. Fontes empacotadas (sem CDN, OFL): Fredoka (display) + Nunito (texto), subconjunto Latin woff2 em `persona-assets/fonts/` (+ `OFL-*.txt`), geradas como data-URI por `scripts/persona/build-fonts.mjs` → `theme/fonts/persona-fonts.generated.css` (138 KiB). Motivo: a rota de assets do cliente só serve imagens.
3. `theme/persona-palette.css` (tokens semânticos `--persona-paper/card/wash/ink/outline/accent…`, sombras `--persona-shadow-press/sticker/lift/float`, raios, espaço, grão; aliases de compatibilidade `--persona-active-*`/`--dsw-alias-*`) + `theme/persona-base.css` (fontes, foco ameixa+âmbar, seleção, scrollbars, `[data-persona-grain]`).
4. Primitivos (`primitives/`): Button, IconButton, Card, Eyebrow, Screen, ScreenHeader, Input, Textarea, Chip, ReactionChip, Avatar (retrato/iniciais + presença), Tabs, Modal, Toast/ToastRegion, Tooltip, EmptyState, Skeleton, DayDivider, BrandIcon (ícones do Brush via máscara → currentColor), UiIcon (glifos no mesmo traço), acentos Squiggle/PawTrail/Sparkle/RailHills/TeamScene. `PersonaButton/Panel/Muted` mantidos como aliases com o visual novo.
5. Telas-vitrine refeitas: **rail** (grupos, busca Ctrl K, pílula-adesivo ativa deslizando, folhagem do Brush, status em pílula), **#geral** (cabeçalho com selo, banner do Brush com equipe grande + etiquetas-adesivo de estado, mensagens agrupadas com retratos, reações com contagem, separador "Hoje", composer completo com "Responde: <persona>" e enviar âmbar), **Visão geral** (saudação Fredoka 40 com sublinhado à mão, "Precisa de você" primeiro com estado vazio ilustrado, "Enquanto você estava fora" em linha do tempo, "Agora" com retratos + chips de estado), **onboarding** (palco com cenário + equipe entrando em fila, Atlas acenando com balão por passo, stepper com nomes, campos/primitivos novos, templates como botões-adesivo).
6. Assets do Brush ligados ao pipeline (`build-assets.mjs`): banners/folhagens @2x → webp nítido (`illustrations/`), 8 estados vazios, pose `atlas-acenando`; `ILLUSTRATIONS` exportado em `generated-imports.ts`.
7. `persona-spec/design/SCREEN-SPECS.md` — receita comum + especificação por tela para Prism e Lumen. `scripts/persona/design-shots.mjs` — capturas claro/escuro das vitrines no app real.

**Verificação**

```
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
→ 0 erros nos arquivos de Muse (erros restantes: adaptadores em andamento do Lumen/host — ApprovalView, ReviewSummaryView… ausentes em persona-host/types)
pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
→ Test Files 17 passed (17) · Tests 43 passed (43)
pnpm exec oxlint <primitives,theme,shell,chat,team,overview,onboarding>
→ só 1 aviso pré-existente em team/persona-work-state.ts (Prism)
bundle (with-lock) → Build complete, 99 files
```

**Capturas:** `.maestri/tmp/shots/design/{channel,overview}-{light,dark}.png`, `channel-*-focus.png`, `onboarding-{light,dark}-{1,2,4,5}.png`.

## 2026-11-03 (tarde) — Rodada 2: pedidos do Atlas/Miguel

**Pronto**

- **Poses normalizadas no pipeline** (`build-assets.mjs`): cada pose é recortada pela área opaca (base/piscar/cauda com o MESMO recorte → alinhamento preservado). Antes as margens iam de 0% a 11% e os bichos "flutuavam" em alturas diferentes. Escala por espécie no CSS (Atlas 1 · Sol .95 · Nina .92 · Bento .84 · Luna .72; deitado ×.56).
- **Canal sem equipe**: CTA ilustrado "Monte sua equipe" + 3 vagas tracejadas convidativas + botão primário "Montar equipe" (no lugar do "?").
- **Onboarding passo 4**: cards com rosto + nome do bicho + cargo (Atlas · Coordenação…); nos outros templates o animal sugerido aparece esmaecido/tracejado. Palco com os 5 **acenando** (poses novas do Brush).
- **"Sua equipe" no rail** (pedido do Miguel): `shell/RailTeam.tsx` — avatar circular com contorno ameixa + sombra, piscar ocasional, selo de estado com ícone (digitando/lupa/aprovação âmbar pulsando/zzz/erro/offline esmaecido), estado em texto no hover/foco (sempre visível para "aguardando você" e "travado"), contador de não lidas, clique abre DM, "⋯" abre Perfil, ordenação precisa-de-você → travado → trabalhando → revisando → descansando → offline, top 6 + "Ver todos (N)", "+ Contratar persona". **Rail recolhível** (76px; só ícones/avatares com selo; estado salvo em `persona.rail.collapsed.v1`). Dados ligados pelo Prism (`hooks.team`).
- **Nunca painel em branco**: `PanelBoundary` + guarda no frame (se o painel principal fica vazio 2 s — inclusive quando o slot do DSH engole um crash — mostra `ErrorState` com arte `empty-error`, texto pt-BR e "Tentar de novo", e loga `[persona] painel "x" ficou em branco`).
- Assets do Brush ligados: 8 estados vazios, 5 poses acenando, 11 acentos SVG (`Accent`), texturas de papel (grão real no papel e no rail).
- Correção de laço React #185 no rail (`live-rail-bridge` sem cache de snapshot).

**Bloqueios**

- Host persona não ativa (`personaRunners` sem inject em `persona-host/src/index.ts:1919`) → "Persona host indisponível", semente de dev não roda → capturas semeadas aguardam (Keel avisado).
- Kanban do Lumen: laço React #185 no app real (mesma classe de bug; Lumen avisado).

## 2026-11-03 17:30 — Rodada 3: telas do Prism (apresentação) + revisão (e)

**Pronto (fronteira Keel: Muse = JSX/CSS, Prism = dados)**

- **Mensagens diretas**: `chat/DirectMessagesView.tsx` (lista com avatar/última linha/hora/não lidas âmbar, cabeçalho da conversa com retrato + cargo + chip de estado, `MessageList` compartilhada com o #geral, composer, vazio ilustrado `empty-dm` + "Nova conversa", skeleton). `ConnectedDirectMessagesView` agora só mapeia dados → props (`DmRowUi`).
- **Projetos**: `shell/ProjectsView.tsx` (grade de cartões-adesivo, skeleton, vazio `empty-kanban`, erro). `ProjectsPanel` só passa dados.
- **Busca**: campo grande 60px raio xl + `Ctrl K` + filtros em `Tabs` (Tudo · Mensagens · Tarefas · Cofre · Arquivos) + vazio `empty-search`. Botão de busca do rail com `aria-label="Busca"` + `aria-keyshortcuts`.
- **Contratar persona**: cartão com palco (pose acenando), eyebrow âmbar, cargo/harness/ferramentas em chips, nota de política, 1 primário.
- `MessageList` exportada; cabeçalho do #geral alinhado à coluna de conteúdo em telas largas.
- `DESIGN-SYSTEM.md` atualizado (§5 Screen/ErrorState/Accent + regra de snapshot estável §5.1; §6 "Sua equipe" + rail recolhível; §7.1 normalização de poses).
- Teste novo: `tests/observable-bridges.client.spec.ts` (rail team + tenant: mesma referência entre chamadas). Suite: 26 arquivos / 64 testes verdes; tsc/oxlint limpos nos meus diretórios.

**Revisão (e) por captura real (galeria Probe 17:27)** — prancha `.maestri/tmp/shots/design/review-lumen-light.png`

- Lumen: todas as telas já usam Screen + ScreenHeader (ok). Ajustes enviados: loading infinito → timeout + ErrorState; filtros do Kanban sem `<select>` nativo; Importar com 2 primários; tabela de Arquivos estreita; botão de Membros size m; larguras consistentes.
- **Achado sistêmico (dados)**: com host "Conectado", painéis presos em "Carregando…", #geral/Visão geral vazios e a semente de dev não roda (encadeada após `live.bootstrap`). Hipótese: `bootstrap`/tenant gate não resolve. Registrado no Status para Prism (instrumentar) e Lumen (timeout); Keel avisado.

**Dependências abertas:** capturas semeadas (a) dependem do bootstrap/semente do Prism.

## 2026-11-03 18:30 — P0 (Keel): unwrap único do Remote

**Causa raiz** dos painéis vazios/"Carregando…" e da semente que não rodava: `ctx.remote.persona.*` resolve `RemoteResult` (`{ok,value}` | `{ok:false,error}`), mas `bootstrap-tenant.ts`, `persona-live-store.ts` e `seed-default-team.ts` usavam o retorno cru → `bootstrapPersonaTenant` lançava `channels.find is not a function` (visto no `ErrorState` de Projetos) e o `catch` engolia.

**Correção (autorizada pelo Keel, combinada no Status com o Prism):**
- `remote/persona-remote-unwrap.ts`: `unwrapPersonaRemote` (Proxy único; reusa `unwrapRemote`; falha → `PersonaRemoteError` com `code`, `method`, mensagem pt-BR + mensagem do host; streams/valores crus passam).
- `createPersonaLiveStore` envolve o remote uma vez (bootstrap/refresh/semente recebem valores crus); `listProjects` com `await` no bootstrap; `markVisit` sem rejeição solta; `console.error` no catch do bootstrap.
- Teste `tests/remote-unwrap.client.spec.ts`: host falso que só fala `RemoteResult` — bootstrap → refresh → semente popula os 5 bichos, ≥4 mensagens e a aprovação; falha vira mensagem legível; nenhum método do proxy devolve `RemoteResult` cru. Suite: 29 arquivos / 72 testes verdes.

## 2026-11-03 18:25 — Lote semeado entregue ao Atlas

- Bootstrap: o host responde `listProjects` com `[]` (não erro) sem workspace → checar `length > 0`; ids alinhados ao onboarding do host (`owner`, canal `geral`) — antes o `UNIQUE(project_id, name)` do canal abortava o `completeOnboarding` e o host ficava em "primeiro uso"; nome padrão "Você"; `createWorkspace` tolerante a `conflict` (Prism consolidou com `bootstrapWire`).
- Rail (Keel): "Configurações" em pílula sólida ≥44 px (claro e escuro, AA); rolagem termina acima da folhagem com fade; folhagem 190 px.
- Visão geral: saudação ignora nomes-placeholder ("Você"/"Owner"); "Sem tarefa agora".
- "X está acompanhando": pílula tracejada discreta (era faixa branca no escuro).
- Capturas semeadas (0 erros): `channel-*`, `overview-*`, `rail-collapsed-*`, `onboarding-*`, `panel-*`; comparação lado a lado `compare-dirD-channel-light.png` (fidelidade à dirD: banner, pílula "Hoje", composer, rail lilás com folhagem; diferenças intencionais: poses refletem estado real; rail com mais seções e "Sua equipe").
- Testes: 36 arquivos / 94 verdes.

## 2026-11-03 18:50 — Ajustes do Atlas/Keel + Quadros (BRIEFING 15)

- Rail: faixa da folhagem reservada no rodapé (nenhum item navegável sob a decoração), rolagem com fade, "Sua equipe" recolhível (chevron, `aria-expanded`), avatares 36 px / selo 19 px; "Configurações" em pílula ≥44 px também no escuro.
- Banner: overlay de estado vira "nuvem" encostada na cabeça, sem contorno/sombra de botão.
- Visão geral: "Primeira tarefa sugerida" só aparece sem trabalho e com texto de sugestão (teste atualizado).
- Pipeline: poses a 480 px (eram 768; nítidas em 2×) → assets 5,84 MiB (eram 8,69 de 10); prontos para `icons/flows/*`, `empty-col-*`, `sprint-concluida` (`FLOW_ICONS`, `ILLUSTRATIONS`).
- **Quadros por projeto**: `persona-spec/design/BOARDS-SPEC.md` (grade de Quadros, página do projeto, faixa da sprint, quadro com colunas personalizadas, planejamento, encerrar sprint, editor de fluxo, visão global em raias) + tokens `--persona-cat-*`; assets pedidos ao Brush; Lumen avisado.
- Respondido ao Keel: `Skeleton`/`EmptyState` são CSS puro, não causam laço.

## 2026-11-03 19:25 — Acessibilidade verificada

- `design-shots.mjs` ganhou varredura axe opcional (`MUSE_AXE=<caminho do axe.min.js>`, sem dependência no repo; axe-core 4.10.2): **0 violações WCAG 2.0/2.1/2.2 A+AA** em #geral e Visão geral, claro e escuro, com host real semeado.
- Também loga respostas HTTP ≥ 400 com `MUSE_CONSOLE=1`.

## 2026-11-03 19:35 — Movimento verificado + ícones de fluxo

- Pausa global de laços com a janela oculta (`body[data-persona-hidden]`, instalada junto do esquema de cor). Medição no app real (`MUSE_REDUCED=0|1` no design-shots): 20 animações infinitas no #geral → **0 com reduced-motion** e **0 com a janela oculta**.
- Ícones de modelo de fluxo do Brush no pipeline (`FLOW_ICONS`) + primitivo `FlowIcon`; `BrandIcon name="sprints"`.

## 2026-11-03 19:50 — Primitivos de quadro + assets do Brush

- Assets: `empty-col-{todo,doing,review,needs-you,done,blocked}` (preferindo os nomes do spec; `empty-coluna-*` como alternativa) e `sprint-concluida` no pipeline (5,90 MiB).
- Primitivos novos `primitives/Board.tsx`: `CategoryBar`, `BoardColumns`, `BoardColumn` (faixa/ícone/WIP/vazio ilustrado por categoria), `SprintStrip` (progresso com `role=progressbar`), tokens `--persona-cat-*`; `FlowIcon`. Teste `tests/board-primitives.client.spec.tsx` (3/3). BOARDS-SPEC aponta os primitivos.

## 2026-11-03 20:20 — Segunda fila do Atlas, governança, ajustes e Cartão da Persona

- **Monte sua equipe** (Contratar → editor → perfil):
  - editor em duas colunas, com cartão "descreva e eu monto", galeria de 17 bichos, ferramentas em linguagem simples, cartões de motor, autonomia/atenção e prévia viva da pose acenando;
  - perfil com herói de cena e pose por estado.
- **Pico e fim**: `PawBurst`/`usePawCelebration`/`MilestoneCard`; equipe pronta no onboarding; "enquanto você esteve fora" uma vez.
- **DM**:
  - cabeçalho com mini-cena da pose, gaveta "Contexto usado" (também no #geral);
  - composer "Mensagem para Nina…" que envia na DM (teste `dm-view.client.spec`);
  - DM vazia com 3 sugestões de primeiro pedido conforme o cargo.
- **Cromo do desktop**: `design/DESKTOP-CHROME.md` para o Rivet (barra no tom do papel, splash com a equipe andando, bandeja em 4 estados).
- **Governança (BRIEFING 16)**: primitivos `OrgChart` (organograma e modo lista), `HealthScore`, `HealthItem`, `TwoDayTimeline`; spec `design/GOVERNANCE-SPEC.md`; artes pedidas ao Brush.
- **Rail**:
  - "Sua equipe" em fileira de avatares por padrão em janelas com menos de 1000 px (preferência salva);
  - itens de 36 px, rodapé de 100 px.
  - Pendente: os novos grupos "Equipe" (Prism/Lumen) empurram Trabalho/Empresa para baixo da dobra a 900 px. Próximo passo: grupos recolhíveis (fechados por padrão em janela baixa; o grupo ativo abre sozinho) e avatares de 32 px numa linha só, com o + junto.
- **Cartão da Persona** (pedido do Miguel), spec `design/PERSONA-CARD-SPEC.md`:
  - primitivos `PersonaCard`/`PersonaCardFacts`/`PersonaCardPopover`/`usePersonaCardController` e `profile/PersonaInfoCard`;
  - conteúdo: cena com a pose ao vivo, @handle · cargo · setor, selos de função, "agora" em linguagem humana, quem pode falar com Editar, presença, responsável e substituto, projeto, motor com barras 5h/semana ("indisponível", nunca 0%), "Mensagem para Nina" na DM, menu ⋯;
  - portal, Esc devolve o foco, reduced-motion;
  - ligado ao rail (hover e ⋯ "Sobre Nina");
  - Anvil publicou `getPersonaCard`/`getPersonaTalkAcl`/`setPersonaTalkAcl`/`pausePersona`/`resumePersona`/`setPersonaEngine`.
- **Perfil**: o mesmo bloco ao lado da cena grande, mais "Fila agora", "Entregas recentes" e o estado vazio ilustrado de "Atividade recente" com o botão de primeiro pedido.
- **Poses do Brush** no pipeline: `aguardando-resposta` e `offline` dos 12 bichos (assets 6,83 MiB de 10).
- **Capturas**: `card-{nina,atlas,bento}-dark(-menu)`, `profile-atlas-{light,dark}`, `channel-*`, `dm-nina-*`.
- **axe**: perfil 0. Nos outros, 2 violações vêm dos `<input type="file">` sem rótulo do composer (Prism); corrijo após o SNAPSHOT CORTADO com `aria-hidden`.
- **A corrigir após o CORTADO**:
  - cartão aberto pelo clique às vezes não recebe o foco (visibility hidden antes de posicionar) → trocar por opacity e Esc no documento;
  - rodada clara da captura do cartão falhou no boot (SlotAssemblyError intermitente) → repetir.
- **Testes**: 64 arquivos / 153 antes do cartão. Mais `persona-card.client.spec` (5) e cartão no `rail-team.client.spec`.

## 2026-11-03 20:45 — Pós-snapshot: cartão estável, rail a 900 px, arte do Brush integrada

- **Cartão**:
  - o foco só entra depois de posicionado (antes, `visibility: hidden` impedia o foco);
  - Esc fecha de qualquer lugar e o Esc do menu não fecha o cartão.
  - Captura: axe 0 em claro e escuro, Esc fecha e devolve o foco ao ⋯ (Nina, Atlas, Bento).
- **Rail a 900 px**:
  - os grupos Equipe/Trabalho/Empresa/Mais recolhem (`persona.rail.groups.v1`); em janelas abaixo de 1000 px, Equipe e Empresa começam fechados e o grupo da tela ativa abre sozinho;
  - avatares de 32 px numa linha.
  - Captura `channel-light`: tudo o que é essencial cabe sem rolar.
- **Composer (a11y)**: os inputs de arquivo ocultos ficam `aria-hidden` e o token inexistente `--persona-paper-muted` virou `paper-sunken`. axe 0 em #geral e na DM.
- **Arte do Brush no pipeline** (7,40 MiB):
  - `SECTOR_ICONS` com o primitivo `SectorIcon` (12 setores);
  - `stamp-aprovado` com o primitivo `ApprovedStamp` (carimbo único na aprovação);
  - `away-entregas` no painel "Enquanto você esteve fora";
  - `equipe-saudavel`/`ponto-unico-falha` como arte padrão do `HealthScore` por nível;
  - `voce-de-ferias` em `TWO_DAY_ART`;
  - nav `quem-cuida`/`saude` no rail.
  - Primeira tarefa: aprovei a proposta do Brush (`primeira-entrega`).
- **OrgChart**: um grupo só não estica a tela (colunas de 200–272 px centralizadas sob o braço direito).
- **Revisões**:
  - Lumen fechou os 10 itens de GOV-6/7;
  - Prism precisa formatar `limitedUntil`, passar `characterId` e mapear a ACL no `map-persona-card-view`;
  - a arte do splash e da bandeja foi repassada ao Rivet.
- **DESIGN-SYSTEM §5**: cartão, governança e pico-fim documentados.
- **vitest**: 76 arquivos / 181 testes verdes.

## 2026-11-03 21:10 — Marcos, figurinhas e revisões

- **Visão geral**: marco "primeira entrega" com `MilestoneCard`, a arte `primeira-entrega` (proposta do Brush aprovada) e uma rajada só.
  - Aparece uma vez por `taskId`; "Ver no quadro" abre o quadro.
  - Teste: `overview-first-delivery`.
  - Prism liga a prop `firstDelivery`.
- **Figurinhas**:
  - contrato com o Brush: `stickers/<animal>-<joinha|coracao|rindo|comemorando|pensando|feito>.png` em 256 px;
  - pipeline `STICKERS` (webp de 128 px);
  - `StickerPicker` em grade 3×2 com setas e `aria-pressed`;
  - `ReactionChip sticker`, com emoji de reserva enquanto a arte não chega;
  - teste `stickers`.
- **Primitivos**: o `OrgChart` e o cartão aceitam o `characterId` "-default", e a legenda "Braço direito" não fica mais cortada pela linha.
- **Revisões por captura**:
  - Saúde aprovada;
  - organograma: falta o retrato (o host não manda `characterId`; Lumen faz o fallback para o rail);
  - Aprovações: plural, "~0 tokens" falso, avatar "CR" e corpo repetindo o título (enviado ao Lumen).
- **vitest**: 80 arquivos / 190 testes. Lote enviado ao Atlas.

## 2026-11-03 22:05 — Ajustes do Atlas, UX-BACKLOG, revisão das telas restantes

- **Atlas (1) organograma**:
  - retratos dos bichos com selo ao vivo;
  - cotovelos arredondados no nosso traço (2,5 px);
  - "Cargo · Setor";
  - cartão da persona ao clicar (`cardTrigger`, Lumen ligou);
  - SectorIcon no "Por setor".
- **Atlas (2) Saúde**: o `HealthScore` ganhou medidor 0–100 (`score`/`scoreLabel`) e arte menor; o Teste dos 2 dias com consertos de 1 clique ficou acima da dobra. Falta reduzir a `TWO_DAY_ART` (Lumen).
- **Atlas (3) jargão**: mapa central `team/engine-label.ts` (`engineLabel`, `runnerLabel`, `modelLabel`, `humanizeEngineLabel`), já usado no cartão, no perfil e no editor; Lumen aplicou em Conexões e Uso. DESIGN-SYSTEM §9 ganhou três regras: sem ids crus, sem zero inventado, sem iniciais para bichos.
- **Miguel → `persona-spec/design/UX-BACKLOG.md`**: 17 atritos priorizados (P1–P3), com proposta e dono. Os do dogfood Padaria Lua entram com o prefixo DF- (a rodada do Forge ainda parou no lock). Resolvi os meus:
  - UX-04: o nome no cartão leva ao perfil;
  - UX-07: Shift+F10 abre o cartão;
  - grupo "Organização";
  - Projetos acessível por teclado, com o bloco "Novo projeto".
- **Bug corrigido**: o banner mostrava dois bichos por persona, porque os frames de piscar/rabo do pose disponível ficavam por cima do dormindo. Teste `team-figure-life`.
- **Figurinhas**: pipeline em subpasta (`stickers/<animal>/<reação>.png`). Atlas e Bento no app; `chat/ReactionAdder` pronto para o Prism.
- **Splash do Rivet revisado**: selo vazio, fonte do sistema, fila duplicada e pequena, centralização. Pedido no Status.
- **Revisão por captura aprovada**: Regras, Conexões, Uso, Arquivos, Membros, Aprovações, onboarding. O script de capturas agora abre grupos recolhidos e espera o rail.
- **vitest**: 88 arquivos / 209 testes verdes.
- **Pendência**: o daemon do Maestri ficou fora às 22:00. A linha do Status e a mensagem ao Lumen saem por retentativa automática.

## 2026-11-03 23:00 — Figurinhas no fluxo, indicadores, splash, Onda 2 (spec + primitivos)

- **Figurinhas**:
  - pipeline com as 30 figurinhas do Brush (5 bichos × 6 reações; assets 7,75 MiB de 10);
  - o Prism ligou `toggleMessageReaction`, e eu ajustei a apresentação: sem reação, o + vira ação flutuante no canto da mensagem (0 px no fluxo); a figurinha segue o bicho do autor; nas mensagens do humano, usa a coordenação no #geral e o par na DM (`userStickerAnimal`); rótulo "Coração: 2";
  - o + some quando o host não reage (nada de controle morto);
  - teste `message-stickers` (3).
- **Motor sem jargão**: o `PersonaCard` humaniza `engine.value` no próprio primitivo, então nenhuma tela deixa vazar "dsh · default". Teste no `persona-card` spec.
- **DF-003 (Forge, P0 "copy sem espaços") é falso positivo**: as capturas 04 e 05 mostram os espaços. A captura 05 revelou 2 bugs **meus**: a pílula ativa do rail ficava vazia e fora do lugar, e o indicador das abas ficava cortado. A correção foi o `primitives/use-active-indicator.ts` (mede de novo com ResizeObserver, mutação de aria, `transitionend` e fontes), usado no rail e no `Tabs`.
- **Splash do Rivet, 2ª revisão**: render direto do `reconnecting-page.ts` com Chrome headless (`rivet-splash-*`). Fontes, selo e centralização OK, e reduced-motion 8→0. Pedidos no Status:
  - ordem com o Atlas à frente;
  - escala por espécie;
  - walkers em 2×;
  - faixa de chão no lugar do disco;
  - raio e foco no botão de erro.
- **Onda 2 (BRIEFING 17)**:
  - spec `persona-spec/design/WAVE2-SPEC.md`, com refcat citado só por metadados (as telas estão bloqueadas): Loom, Beside, Amie, incident.io;
  - tokens `--persona-subject-0..6(-tint)` na ordem do core, claro e escuro;
  - primitivos `MenuButton` (o ⋯ do cartão migrou para ele), `SubjectBar`/`SubjectDot`, `AccountRow`/`AccountList`/`AccountPolicyPicker`/`Notice`, `RecordingPill`/`RecordingFrame`/`TeachStepCard`/`TeachStepList`, `QuotaMeter` exportado e `accountPolicyText` no cartão;
  - ícones `ensinar`/`trocar-conta`/`mover-assunto` do Brush no `BrandIcon` (pipeline `icons/ui`);
  - ilustrações `ensinar-<animal>` pedidas ao Brush;
  - entregue ao Prism (a, b) e ao Lumen (c). DESIGN-SYSTEM §5 atualizado.
- **UX-BACKLOG**: seção DF com 10 itens (DF-002 P0 do Prism; DF-001/005/006/008/010/013 P1), DF-003 reclassificado e UX-16 feito para os 5 do modelo.
- **Verificação**: vitest 92 arquivos / 238 testes verdes; tsc e oxlint limpos nos meus arquivos. Os erros de tsc que sobram são de outros: tipos do host ainda não regenerados para contas, insights e propostas.
- **Pendente**: bundle e capturas (pílula do rail, abas, figurinhas, organograma, Saúde) na fila da trava, atrás do pacote D8 do Rivet (iniciado 22:18). A revisão por captura da Onda 2 espera a integração do Prism e do Lumen.

## 2026-11-04 00:30 — UX-06 Ctrl K, revisão por captura, arte do Ensinar

- **UX-06**:
  - Ctrl K/⌘K virou atalho global de verdade (o rail mostrava a dica, mas não fazia nada);
  - a Busca mostra "Ir para" (as 18 telas, inclusive as de grupos recolhidos) e "Equipe" (retratos, abre o perfil);
  - filtro sem acento, ↓ e Enter, estado vazio honesto, campo focado ao abrir;
  - `shell/nav-groups.ts` é o modelo único do rail e da busca;
  - o slot `contentResults` fica pronto para o Prism ligar o `search()` do host;
  - teste `search-goto` (4).
- **Revisão por captura (0 erros de console)**:
  - rail e abas: a pílula ativa e o indicador estão corretos (DF-M1/M2 confirmados);
  - #geral: a barra de assuntos agora fica alinhada à coluna do cabeçalho (`.subjectRow`), e o ⋯ ghost perdeu o fundo de botão (`MenuButton` só põe fundo no `secondary`);
  - Saúde: a arte do Teste dos 2 dias tinha ~560 px. O CSS do Lumen não era aplicado na tela, então o `TwoDayTimeline` passou a limitar `legendArt` a 112 px. Linha do tempo e legenda acima da dobra;
  - organograma: "Braço direito" virou etiqueta ao lado do conector (a linha cruzava o texto);
  - Busca: anel de foco duplo corrigido (o contorno do campo é quem mostra o foco); o mesmo vale para a renomeação de assunto.
- **Arte do Brush aprovada e no pipeline**:
  - `ensinar-<animal>` (320 px);
  - figurinhas de capivara, cervo, coelho e coruja (54 no total, 9 bichos; assets 7,90 MiB).
- **Verificação**:
  - vitest 93 arquivos / 242 testes verdes;
  - oxlint e tsc limpos nos meus arquivos;
  - os erros restantes são de trabalho em curso dos outros: o "mover mensagem" do Prism no `GeneralChannelView` (chaves `subjects.move*`) e os tipos do host para contas e insights.
- **Aguardando dependências**:
  - revisão por captura da integração da Onda 2 (Prism a/b, Lumen c);
  - 3ª revisão do splash, quando o Rivet aplicar os 5 ajustes.

## 2026-11-04 02:00 — Pedidos do Atlas: UX-BACKLOG, Onda 3, galeria, BYC

- **Os 5 de maior impacto do UX-BACKLOG** (com ok do Lumen; antes e depois em `gallery/antes-depois/`):
  - **UX-05**, Regras: o primitivo novo `ChoiceCards` oferece Econômico · Normal (recomendado) · Generoso · Personalizar, com "até N propostas por dia · ≈ N tarefas médias por mês". Os números só aparecem em Personalizar, já convertidos em tarefas, e Salvar só fica primário quando algo mudou.
  - **UX-10**: "Simular de novo" no cartão do teste (saiu do cabeçalho).
  - **UX-13** e **UX-14**: cópia nova, mais as props `onDescribeCompany`/`onAskSuggestions`, que o Lumen liga.
  - **UX-15**: `youInSentence` deixa "você" em minúscula no meio da frase.
  - **UX-18 (sistêmico)**: `PersonaSurfaceEmpty` só mostra o CTA quando há `onPrimary`. Havia **11 botões mortos** nos estados vazios.
  - O `AccountPolicyPicker` passou a usar o `ChoiceCards` por baixo.
  - O UX-04 saiu pelo Prism, em paralelo.
- **Onda 3, computer use**:
  - `design/COMPUTER-USE-SPEC.md` e o protótipo funcional `design/computer-use-prototype/index.html`, testado no Chrome headless:
    - pausa da pessoa congela o cursor e a digitação;
    - 2 personas em paralelo;
    - 0 erros;
    - reduced-motion sem animações.
  - **W3-6 no cliente**:
    - `primitives/cursor-motion.ts` (Bézier, minimum-jerk, Fitts, ultrapassagem; puro e com testes);
    - `PersonaCursor`;
    - `ActionReplay` (replay do que a persona fez: arcos e cliques sobre as capturas, Espaço e setas, "Passo n de N").
- **Galeria final**: `.maestri/tmp/shots/design/gallery/index.md`, com 30 telas em claro e escuro, 5 pranchas antes/depois, 0 erros de console e defeitos conhecidos com dono. Os dois defeitos que o Atlas apontou (o cartão de Conexões no escuro e o Teste dos 2 dias só com a Vigia) foram para o Lumen com a correção exata; recapturo quando ele avisar.
- **BYC (BRIEFING 18)**:
  - spec `design/BRING-CONTEXT-SPEC.md`;
  - primitivos `CopyPrompt`, `PasteBox`, `FolderDrop`, `ProposalReview` + `defaultChoice` e um glifo `copy` novo no `UiIcon`;
  - entregue ao Prism (onboarding passo 2) e ao Lumen (Importar).
- **Brush, aprovado e no pipeline**:
  - selos de motor `ENGINE_ICONS` (10, formas próprias, sem logotipos);
  - `assumir-controle`;
  - figurinhas de guaxinim, lobo-guará, lontra e ouriço (13 bichos);
  - assets 8,05 MiB.
- **Verificação**: vitest verde (ver Status), com tsc e oxlint limpos nos meus arquivos.

## 2026-11-04 — Segundo cérebro, Gestor de equipe, organograma em escala

- **Segundo cérebro (BRIEFING 19)**:
  - spec `design/SECOND-BRAIN-SPEC.md`;
  - primitivos `RememberPermission` (opt-in, escopo em frase, validade explícita, guarda), `PermissionRow` (Revogar com confirmação inline), `ChangeFeed`, `ContradictionCard` e `PageMeta`;
  - 11 ícones de tipo do Brush no `BrandIcon` e `ILLUSTRATIONS['bibliotecario']`;
  - entregue ao Lumen.
- **Gestor de equipe (BRIEFING 20, ex-"Maestro"; a palavra não aparece mais no cliente)**:
  - spec `design/GESTOR-SPEC.md`;
  - `GestorSettings` (interruptor + limites em linguagem simples) e `GestorPlanCard` (plano no chat: Aprovar / Ajustar / Agora não, carimbo);
  - selo âmbar com batuta no cartão (`tone 'gestor'`), marca no rail e no organograma;
  - chegada animada das personas novas na faixa e no rail (`arriving`), com balão "{nome} chegou!";
  - glifo `baton`;
  - terminei a renomeação: o CSS ainda usava `maestro*`, por isso as marcas estavam sem estilo;
  - entregue ao Prism.
- **"Quem cuida de quem" com 60 e 150 personas**:
  - `primitives/OrgMap.tsx`, que entra automaticamente acima de 24: fileiras sob a Coordenação, grupos recolhíveis (abertos os que pedem atenção), zoom/pan suave com teclado, busca com foco (centraliza com Δ 0 px e foca), minimapa e lista virtualizada (20 de 158 linhas no DOM);
  - antes/depois em preview isolado (vite + Chrome headless): 2 636 px de largura e 2 500 px de altura, sem busca → tudo em 1 440 × 900, com 0 sobreposições;
  - teste `org-map.client.spec` (5);
  - Lumen liga os labels e um seed de 60/150 para a captura no app real.
- **Pipeline (8,15 MiB)**:
  - figurinhas de 17 bichos (os 12 restantes do Brush);
  - `ENGINE_ICONS`, ícones do cérebro e `bibliotecario`.

## 2026-11-04 04:15 — Colheita t3code + F6

- **Colheita** (`design/T3-UX-HARVEST.md`): 14 padrões de interação do t3code (MIT, só leitura das docs), redesenhados no nosso estilo e distribuídos aos donos.
- **Primitivos novos (meus)**:
  - `PooledQuotaBar`: um número por janela, um segmento por conta na mesma ordem, hachura do que a próxima recarga devolve, lacuna em vez de 0%;
  - `ActivityGroup`: resumo honesto com as mudanças primeiro e no máximo 2 categorias + "e mais N", falhas fora da contagem de feitos, lista expansível com estado.
- **F6 / Shift+F6 / Ctrl+F6 entre áreas** (`shell/area-navigation.ts`): rail → painel → composer, com a área mais interna vencendo e o último foco lembrado em cada área; a área de chegada brilha com um contorno âmbar por 650 ms. Teste `area-navigation`.
- **Suíte**: os meus arquivos estão verdes. Há 5 falhas de outros, todas de `map-rail-team.ts:85` (`arriving` indefinido, Prism avisado). O teste de escala do `OrgMap` feito pelo Probe passa.
- **Ctrl K que faz (colheita §2)**:
  - seção "Fazer" na Busca: ações globais (Contratar persona, Simular os 2 dias) e as ações da persona encontrada (Conversar com / Ensinar a);
  - cartões com borda âmbar para distinguir "fazer" de "ir";
  - ligado no `ConnectedSearchView` do Prism (repasse das props) e no registro;
  - teste em `search-goto` (5/5).

## 2026-11-04 01:45 — Integrações do Atlas (lote parcial; o seed de dev bloqueia o resto)

- **Combinado arquivo a arquivo**:
  - **Lumen:** SIM para Conexões, Uso, `TeamHealthView`/`twoDayToUi` e a montagem do organograma; evitar os pools e o `org-scale-dev`, que já eram dele;
  - **Prism:** ele já tinha o menu `/`, `/limites`, a memória do composer e o `GestorPlanMessageCard`. A mim coube o polimento (SIM: só CSS e ícones).
- **Feito**:
  - **Uso e limites**: limites somados primeiro, depois consumo, impacto só de quem entregou (uma linha honesta em vez de 5 linhas de zeros), funil no fim, e o botão morto do aviso de limite saiu (prop `onLimitAction`);
  - **composer**: cada comando do `/` com seu ícone do Brush e fim do anel de foco duplo (a mesma briga de especificidade com o `:focus-visible` global);
  - **`design-shots.mjs`**: alvos `org60`, `org150` e `composer` (menu `/`, `/limites`, F6), `MUSE_LS` (localStorage extra) e `MUSE_DUMP` (console inteiro da página);
  - **preview isolado das peças do chat**: `GestorPlanCard` pendente e aprovado, `ActivityGroup`, `PooledQuotaBar` por conta e `GestorSettings`, em claro e escuro;
  - **janela do Keel**: o meu `tests/gestor.client.spec.tsx` ficou verde. Os 14 erros restantes do check-pkg são fixtures do Prism e do Lumen, listadas no Status.
- **Achados**:
  - P0 do bundle (imports de valor de persona-core no BYC): o Prism corrigiu;
  - P1, aberto com o Prism: o seed de dev não sobe com home limpo. A equipe fica vazia e os painéis vão para o ErrorState; a página emite zero mensagens de console. Isso bloqueia as capturas "depois" de Conexões, Uso, Saúde e OrgMap no app real.
- **Lote**: `.maestri/tmp/shots/design/integ/index.md`.

## 2026-11-04 02:00 — Integrações: seed de volta, rodada "depois" no app real

- **Diagnóstico** (só leitura e build, respeitando a janela): o bundle que eu capturava era anterior às correções do Prism. Com o rebuild, `[persona] dev seed {seeded: true}` e a equipe volta.
- **App real, no claro** (`integ/depois/` + pranchas em `integ/antes-depois/`):
  - **OrgMap com 151 personas** (busca → foco, zoom, minimapa);
  - **Teste dos 2 dias completo** (uma linha por persona, espera em âmbar, correção de 1 clique);
  - **Uso com os limites primeiro**;
  - **Conexões** com nota, política e escopo.
- **Defeitos repassados com a correção exata**:
  - **Lumen:**
    - nomes genéricos no seed 60/150;
    - "Vigia (Luna)" duplicada;
    - pool sem janela, conta "default" crua e bolinha em vez de `ENGINE_ICONS`;
    - legenda duplicada em Conexões.
  - **Prism:**
    - `listGestorPlans` lança `TypeError` a cada refresh: 57 erros, que derrubam a captura no escuro;
    - o #geral semeado ficou sem mensagens nem cartão do plano.
- **Meus, para depois da janela**: `ChoiceCards` com 4 opções em 2 × 2 e "Simular de novo" ao lado do título.
- **02:50, rodada final das integrações**:
  - **Bug sistêmico**: um CSS module homônimo descartado em silêncio pelo bundle. Renomeei para `GovernanceScreens.module.css` e criei o teste-guarda `css-module-names`;
  - `Screen .inner { width: 100% }`: o `.shell` flex espremia o OrgMap;
  - `ChoiceCards` com 4 opções em 2 × 2;
  - "Simular de novo" ao lado do título;
  - capturas no claro e no escuro com 0 erros: Conexões, Uso, Saúde e Quem cuida 150;
  - check-pkg OK nos meus arquivos (o único erro atual é um teste do BYC, do Prism);
  - lote em `.maestri/tmp/shots/design/integ/`.

## 2026-11-04 03:10 — Fila nova do Atlas: revisão do que integra, a11y das 30, movimento

- **(1) Revisão por captura** (`shots/design/revisao1/`):
  - BYC no onboarding: ✓ (falta o selo "2 min", Prism);
  - Importar/BYC: ✓ (2 primários, Lumen);
  - **Ensinar** abaixo da spec: título genérico, garantias sem rótulos, aviso sem `Notice`, sem retenção, checkbox nativo (Prism);
  - **Segundo cérebro** abaixo do padrão: ids crus "person:system" e "derived-index", "hoje" solto, sem cartões, link âmbar com contraste baixo, sem a arte do bibliotecário (Lumen);
  - #geral semeado sem mensagens nem cartão do Gestor (Prism).
  - O axe pegou uma violação **crítica minha**: `aria-controls` das abas de assunto apontava para um id inexistente. Corrigido com a prop `panelId`.
- **(2) Passada de acessibilidade das 30 telas, em curso**: o `design-shots` agora roda o axe também em cada painel, com os alvos novos `teach` e `byc` (onboarding passo 2). Uso o axe-core 4.10.2 do scratchpad.
- **(3) Movimento** (UX-GUIDE §3): o que faltava era meu, e agora existe:
  - crossfade de pose em 220 ms + pulo de 6 px na troca real de estado da faixa (sem animação na montagem; fade de 110 ms com reduced-motion; teste `pose-crossfade`);
  - crossfade de 140 ms + 4 px na troca de painel.
  - Já estavam: chegada (760 ms, mola), celebrações (cooldown de 2,5 s), hover com inclinação, FLIP do quadro e modal com scale e blur.

## 2026-11-04 05:20 — a11y verificada, carregar do quadro, renderizador do cursor

- **(2) Acessibilidade, verificada no app real:**
  - `Tabs` só emite `aria-controls` quando o painel existe;
  - o `Screen` virou região rolável focável, com anel interno.
  - Resultado: axe 0 em Conexões, Uso, Canvas, Ensinar e #geral, no claro e no escuro.
  - Quadros tinha `.workerStack` com `aria-label` sem `role`. O Lumen aplicou `role=group` com os nomes; recaptura na fila.
  - Reduced-motion (estático): todo módulo com animação infinita tem guarda própria, e a única `.animate()` em JS (`usePersonaMotion`) respeita a preferência.
  - Testes ligados a Tabs e Screen: 13 arquivos e 47 testes verdes. A suíte inteira passou do timeout de 580 s por concorrência; rodei por recorte.
  - check-pkg OK.
- **(1) Revisão por captura:**
  - **Ensinar passou** (axe 0). Retoques finos foram ao Prism: ícone `lock` em "Onde fica", "Quem vê" sem `?` e "a Nina pode aprender".
  - **#geral** ainda saiu "O canal está quietinho". O código do seed posta as mensagens e o plano, então recapturo com o console ligado antes de concluir.
  - BYC e Quadros: recaptura na fila do lock, que está com o Rivet empacotando o instalador desde 06:45Z.
- **(3) Movimento: o "carregar" do quadro não existia.** Corrigido:
  - **Problema encontrado:** `card.carry` nunca era produzido. O CSS tinha `top: -var()`, que é inválido, e o avatar caía para fora do cartão.
  - Hook novo `kanban/use-kanban-carry.ts`: detecta a mudança de coluna que não foi movimento local do humano e liga o carry por 900 ms. Ele é declarado antes do FLIP, então o mesmo commit já sabe que é persona.
  - `use-kanban-flip`: 360 ms com leve arco quando é persona, 220 ms quando é o humano, e fade de 100 ms em reduced-motion (antes era um salto seco).
  - Teste `kanban-carry` 2/2. O Lumen ligou o hook nos dois quadros e corrigiu o CSS.
- **W3-6, renderizador do overlay de computer use:** `apps/desktop/src/computer-use-cursor-renderer.ts`, arquivo novo, para o Rivet trocar o placeholder.
  - Documento sem rede.
  - Matemática portada de `cursor-motion.ts`.
  - No máximo 2 cursores, com "X espera a tela".
  - Senha só com bolinhas.
  - "Você assumiu" congela o cursor no meio do arco, e o Devolver avisa por `console-message`.
  - Reduced-motion sem rastro.
  - 7 testes. Capturas moving, typing, human e done em `shots/design/computer-use/`.
- **PLAN:** PB-8, GOV-9 e W2-8 → done (as specs já existiam). W3-6 → doing, faltando só a troca do Rivet. O PB-5 do Lumen fica desbloqueado.
- **Fila:** recapturar BYC, #geral e Quadros quando o lock liberar; revisar o primeiro uso no app instalado, depois do instalador do Rivet.

## 2026-11-04 06:10 — Fila do Atlas: microcópia, design system vivo, kit de lançamento

- **(1) Microcópia** (lente-microcopia) nos 22 dicionários, pt e en. Gerados, testes de copy 49/49 e check-pkg OK.
  - **Glossário novo:** `persona-spec/design/MICROCOPY.md` (tom, "diga / nunca diga", padrões de erro e vazio).
  - **Onboarding:** "Harnesses detectados" → "Ferramentas de IA neste computador"; "CLIs já autenticadas", "contexto obrigatório em todo turno", "template", "vault" e "Bem-vindo" saíram.
  - **Shell:** "Persona host online" → "Equipe conectada"; tirei o texto de desenvolvimento que aparecia em "Enquanto você estava fora" ("patch de locale do shell").
  - **Estados:** "Travado", "Erro" e "Offline" → "Precisa de ajuda" e "Fora do ar". "Harness" → "Motor", e "Harness DeepSeek" → "DeepSeek" (engine-label).
  - **Uso, Revisar e Chat:** "cache hit", "Onboarding em andamento", "Patch truncado… bytes" e "Seu feedback" saíram. A reação "Obrigado" virou "Valeu".
  - **Fora do meu pacote:** atualizei o espelho E2E do Probe (`real-app-locale.pt.ts`). Pedi ao Forge para trocar a linha do `persona-core/account-policy.ts:177`, que ainda diz "Harness DeepSeek".
  - **`ErrorState`:** o detalhe técnico ficou dobrado em "Detalhes para o suporte".
- **(2) Design system vivo:** `persona-spec/design/system/index.html`. Abre direto do disco, com 497 KB.
  - Renderiza os primitivos **reais**, com os tokens lidos da paleta, nos dois temas.
  - Mostra tipografia, forma, movimento (tocável, com a tabela das coreografias), os ícones, 18 componentes com estados e "use quando / não use quando", e o glossário de texto.
  - Fonte em `design/system-src/`. Imagens apontam para o repositório, SVG vai inline e o script é clássico (`file://` não roda módulo).
  - Resultado: axe 0 no claro e no escuro, 0 erros de console e sem rolagem lateral a 390 px (`shots/design/system/`).
  - **O axe da página achou um bug meu no app:** `Button loading` perdia o nome acessível (`visibility: hidden`). Corrigido com `opacity: 0`.
- **(3) Kit de lançamento** (arte do Brush, revisada e aprovada):
  - hero do README em pt e en, claro e escuro, composto com o logo e a frase, e colocado no `README.persona.md` com `<picture>`;
  - capa do repositório;
  - descrição curta pt e en, tópicos e modelo de notas de versão em `design/LAUNCH-KIT.md`;
  - primitivo `AboutPersona`, com créditos conferidos na fonte: DeepSeek Harness MIT © 2026 DeepSeek, OAR Apache-2.0, t3code MIT © 2026 T3 Tools Inc. axe 0. O Prism liga em Configurações › Sobre.
  - **Achado:** o `build-assets` copiava `brand/` inteiro, e a pasta `launch` levou o pacote a 20,9 MiB, acima do teto de 10. Agora ela é pulada, como `concepts`, e o pacote voltou a 8,78 MiB.
- **Primitivo `Switch`:** o switch desligado sumia no escuro (contorno quase preto). Agora é um só para o app, com `outline-control`, alvo de 44 px e reduced-motion. O Gestor já usa; Ensinar e o editor ficaram com o Prism.
- **(4) Recapturas** (o lock liberou):
  - Quadros axe 0 nos dois temas (o Lumen aplicou a correção); BYC ✓; Ensinar ✓ (falta o artigo "a {name}").
  - **#geral continua vazio com `dev seed {seeded: true}`.** Não é tempo de captura; prova enviada ao Prism.
  - `SlotAssemblyError` no boot claro apareceu pela 2ª vez.
- **check-pkg agora:** 5 erros, todos `dispose` faltando em fixtures de teste de outros (mudança em andamento no `persona-live-store`). Nenhum nos meus arquivos.
- **Fila:** revisão do primeiro uso no app instalado, quando o Rivet anunciar o instalador; recapturar #geral e Ensinar quando o Prism aplicar.

## 2026-11-04 06:50 — Landing page do Persona (`apps/persona-site/`)

- **O que é:** site estático de uma página, com HTML, CSS e um JS de cerca de 6 KB, sem framework, build ou rastreador. Tem pt e en (`?lang=`, botão, ou língua do navegador) e claro e escuro (`?theme=`, botão, ou o tema do sistema). Sem JS, fica completo em pt.
- **Seções:**
  - hero com a equipe do Brush e o rótulo de função sobre cada bicho;
  - prova: a Visão geral real, numa moldura de janela, logo abaixo da dobra;
  - as 5 personas, com pose de trabalho e uma frase cada;
  - como funciona, em 3 passos com capturas reais (monte, peça, aprove);
  - 6 recursos com captura (cartão, Teste dos 2 dias, Quem cuida de quem a 150, Ensinar, Uso e limites, Conexões);
  - privacidade honesta: diz o que fica no PC e também que as IAs conectadas recebem o que a persona envia;
  - preço "Grátis e open source" e download, com o selo tracejado **"a confirmar"**.
- **Princípios RCD aplicados:**
  - o hero diz o que faz, para quem e o resultado, e mostra prova real;
  - uma ação primária, repetida no fim; "Ver como funciona" é só link;
  - gatilho de clique: "Sem conta e sem cartão. Suas conversas ficam no seu PC.";
  - prova antes da promessa;
  - desempenho é conversão.
- **Referências do refcat** (só estrutura): Hotjar · Headers (11/07/2024) e Airtable · Headers (27/11/2024).
- **Medido nas 8 variantes** (desktop 1440 e celular 390, claro e escuro, pt e en):
  - axe 0 (WCAG 2.2 AA);
  - 0 rolagem lateral e 0 imagens sem carregar;
  - LCP local ≤ 1 s;
  - cerca de 860 KB com todas as imagens;
  - `lang` correto;
  - as 84 chaves pt têm en.
- **Correções no caminho:**
  - O hero largo cortava a equipe e os rótulos flutuavam no céu. Agora a arte fica numa caixa com a proporção exata da imagem, ancorada à direita, e o hero empilha abaixo de 1180 px.
  - Troquei as capturas antigas: o cartão da Nina ainda dizia "Todos do workspace". Recapturei com o bundle atual (microcópia nova). O `prepare-assets` prefere a captura nova e avisa quando cai na da galeria.
- **A confirmar** (lista no `apps/persona-site/README.md`):
  - preço e licença;
  - URL do instalador;
  - requisitos;
  - repositório público;
  - capturas da interface em en;
  - domínio e `og:image`.
- **06:05, fechamento:**
  - Recapturei com o bundle atual: Visão geral, cartão (já com "Toda a equipe"), composer e onboarding passo 4 (microcópia nova). A prova do topo virou a Visão geral real.
  - **#geral resolvido pelo Prism:** o filtro de assunto já mostra as mensagens do seed na captura nova.
  - As 8 variantes da landing seguem com axe 0, 0 rolagem lateral, 0 imagens sem carregar e cerca de 850 KB.
  - Capturas em `.maestri/tmp/shots/design/site/{desktop,mobile}-{light,dark}-{pt,en}-{fold,full}.png`.
  - **Item 4:** o Probe registrou que o instalador D8 `1d4e5e95b8` abriu com `#root` vazio (CSP `unsafe-eval`). O Rivet reempacota (`dfe13272c6`), e a revisão do primeiro uso instalado entra assim que o pacote novo passar.
- **06:25, correção das capturas da landing** (Atlas):
  - **(1) Fold no meio da página.** Não era a página: o meu script voltava com `scrollTo(0,0)` e o `scroll-behavior: smooth` animava a volta, então a captura saía no meio da rolagem. O script agora pula direto, espera `scrollY === 0` e dois quadros, e confere o valor.
  - **(2) Áreas em branco.** A página não tem revelação por scroll (sem IntersectionObserver e sem `opacity: 0`). O branco vinha de dois artefatos de captura: tiles ainda não pintados no meio da rolagem suave, e o full do celular com 17.884 px (DPR 2), acima do teto de textura de 16.384 px, que repetia o hero no fim. Agora o full sai em pixels CSS (`scale: 'css'`).
  - **Prova:** 0 elementos invisíveis nas 8 variantes. Sem JS e com reduced-motion, as 8 seções têm a mesma altura e nada fica oculto.
  - Rótulos de Bento e Nina separados.
- **06:45, item 4 (1º uso instalado), preparado:**
  - Script `.maestri/tmp/muse/first-run.mts` sobre o `startInstalledDesktop` do Probe: perfil limpo; marca o tempo de cada etapa (janela → onboarding 1..5 → #geral → 1ª mensagem → 1ª resposta); captura cada passo; roda o axe (por CDP, porque o CSP do app bloqueia script inline); grava `timeline.json`.
  - **Rodada a seco no pacote `dfe13272c6`:** a janela fica branca por 120 s (sem splash, mensagem ou saída) e há um `EvalError` de CSP. Isso confirma o relato do Probe.
  - O Rivet já corrigiu a causa (perfil `persona` e fail-loud). Pedi três coisas de design para o próximo NSIS: janela com o fundo do tema, splash desde o 1º quadro, e a tela de erro do boot com "Tentar de novo".
  - Rodo o script assim que o NSIS novo sair.
- **07:00, contrato da 1ª janela e nome do app:**
  - **`persona-spec/design/BOOT-SPEC.md`**, sobre a splash e a tela de erro do Rivet:
    - fundo do tema desde o 1º quadro;
    - splash estática em ≤ 500 ms, sem depender do bundle nem de script inline (CSP);
    - linhas de status pt e en, com o aviso do 1º uso;
    - prazo de 20 s (60 s no 1º uso) → tela de erro com "Tentar de novo" reiniciando o host e o diagnóstico dobrado;
    - crossfade só depois do 1º quadro do app;
    - aceite medido pelo `first-run.mts`.
  - Pedi ao Rivet uma variável para forçar falha do host, para testar o item 4 do aceite.
  - **Nome do app: "a Persona"** (feminino, como nas specs e na tela do Rivet). Eu era quem destoava, com "o Persona". Alinhei em 21 pontos: About, landing, kit, glossário, `onboarding.pt` ("Entrar na Persona", "Boas-vindas à Persona"), o espelho E2E e o seletor dos gates `scripts/persona/playwright-onboarding.mjs`.
  - Avisei o Probe (seletores) e pedi ao Anvil a linha `SYSTEM_WELCOME` do host.
  - Testes 10/10. O DS vivo foi regerado; a landing segue com axe 0.

## 2026-11-04 07:40 — Ajuda, Novidades e erros de execução (fila do Atlas, sem host)

- **(1) Ajuda no app** (`src/client/help/`):
  - `scripts/persona/gen-help-docs.mjs` transforma `docs/persona/*.md` numa árvore JSON no build (58 KB). O cliente não leva parser de markdown e nunca renderiza HTML cru; links entre guias viram navegação interna.
  - Primitivo `HelpArticle`: tipografia de leitura e `<mark>` da busca, sem acento.
  - `HelpView`: índice e busca (todas as palavras, título primeiro, sem acento), artigo com "Nesta página", anterior/próximo, e vazio com "Perguntar no #geral".
  - Namespace de locale `help` (pt e en; em en, um aviso honesto de que os guias estão em pt). `register-help.tsx` exporta `registerHelpLocale` e `HelpPanel`.
  - O Prism liga no shell: painel, Mais › Ajuda, Ctrl K e o `?` do canal, que hoje é um **controle morto**, sem onClick.
  - axe 0 em 8 variantes (claro, escuro, busca, vazio, en, celular). Testes 6/6.
  - **Guias corrigidos:** o "Primeiros passos" e o "Guia" descreviam outro onboarding ("escolha o idioma", "crie o espaço de trabalho"); agora seguem os 5 passos reais. Tirei também runner, host, workspace e "Configurações → Conexões" (caminho que não existe) de 9 guias.
  - Pedi ao Brush os ícones `ajuda` e `novidades`.
- **(2) Novidades:** `docs/persona/novidades.md` no modelo do kit (versão 0.2.2-alpha.3), só com o que existe. Aparece numa aba da Ajuda, com o selo da Luna.
- **(3) Erros de execução** (`design/RUN-ERRORS-SPEC.md`):
  - 8 códigos (não logado, não instalado, modelo, cota com e sem outra conta, orçamento, sem internet, motor indisponível, app fora do ar), cada um com o que aconteceu, o que fazer e um botão útil, no máximo mais um.
  - `describeRunError` e `runErrorText` (puros), primitivo `RunErrorCard` (a persona fala, comando copiável, tom âmbar ou vermelho) e as chaves `chat.runError.*` em pt e en.
  - Testes 5/5 garantem 0 jargão nos 8 códigos, nas duas línguas. axe 0 nos dois temas.
  - Hoje o texto do runner e do host sai cru ("CLI codex não está logada", "indisponível neste runner", "executor DSH não está montado neste host").
  - Pedi ao Rivet e ao Anvil que mandem o código com os textos de reserva novos, e ao Prism que renderize o cartão e ligue as ações.
- check-pkg client-ui-persona OK.
- **07:45, pendente por queda do Maestri:** desde ~07:40 nenhum comando `maestri` responde (`list`, `note read` e `note edit` dão timeout). Nenhuma edição foi aplicada pela metade (conferido). Quando voltar:
  - confirmar ou reenviar os handoffs de erros de execução ao Prism, Rivet e Anvil, e o de ligar a Ajuda ao Prism;
  - adicionar a linha 07:40 no Status e a decisão (g)(h) no UX & Animação.
- **08:00, Maestri de volta:** linhas no Status e no UX & Animação aplicadas (uma vez cada, conferido). Handoff do Prism reenviado e entregue. Rivet, Anvil e Forge não aparecem mais conectados ao meu terminal desde a queda; pedi ao Atlas para reconectar ou repassar os handoffs de erros de execução, BOOT-SPEC e SYSTEM_WELCOME.
- **08:15, Ajuda no app real:**
  - O Prism ligou tudo: painel `help` com `openHelp({ docId, tab })`, Mais › Ajuda, Ctrl K, e o `RunErrorCard` no fio com as ações (o host ainda manda texto cru em parte dos casos).
  - Captura no app real: `panel:Ajuda`, axe 0 no claro e no escuro, 0 erros de console.
  - Ajuste: os links entre guias viraram `<a>` de verdade, porque o botão quebrava a linha entre "(" e o link e era anunciado como botão.
  - O `uso.md` perdeu o resto de jargão ("livro de turnos", "cache do prefixo", "tipo de turno"). Testes 6/6.
- **08:25, RUN-ERRORS no host (Anvil):**
  - Os posts de CLI e de orçamento agora saem como `[[run-error:{code,provider,persona,command}]]`, nunca em prosa, e o `SYSTEM_WELCOME` virou "Boas-vindas à Persona.".
  - Conferi de ponta a ponta com uma linha no formato do host: `parseRunErrorMarker` → `describeRunError` → cartão certo nos 3 códigos (Tentar de novo / Ajustar limite / Escolher outro motor), sem resto de marcador visível e sem jargão.
  - Falta o lado do runner (Rivet): `cli_not_found`, `model_unavailable`, `quota_exhausted` com `resetAt`, e `provider_unreachable`.
- **08:40, ponte para erros em texto cru** (enquanto o runner do Rivet não manda `code`, e para o histórico): `legacyRunErrorFromText(body, persona)` reconhece só os textos exatos de hoje (runner, `CLI_CHANNEL` antigo e orçamento), com casamento ancorado da mensagem inteira, e devolve o mesmo payload do marcador. O Prism usa só como reserva, e só para mensagem de persona. 7 testes, inclusive a conversa normal que não pode virar cartão. Entregue ao Prism.

- **08:55, BOOT-SPEC com protótipo funcional** (avanço por contrato enquanto o Rivet está desconectado): `persona-spec/design/boot-prototype/`.
  - Splash e erro em HTML estático, sob o mesmo CSP estrito do app (0 violações), em pt e en, claro e escuro.
  - Atende todos os critérios mensuráveis: fundo do tema no 1º quadro, splash ≤ 320 ms, status aos 3 s, aviso de 1º uso, erro no prazo com foco em "Tentar de novo", Enter volta à splash, axe 0, reduced-motion com 0 animações infinitas.
  - O Rivet porta direto e troca os timers pelas fases do host.
- **09:10, fechamento de pendências com o Rivet de volta:**
  - O pack D8 das 10:08Z caiu em 2 gates.
  - Um era **meu**: o rename para "a Persona" quebrou o teste `persona-about-settings` do Prism, que procurava "Sobre o Persona". Corrigi o texto (1/1) e avisei o Prism.
  - O outro é do Rivet: `prepare-dsh.ts` com TS2554. Entreguei a ele o motivo exato.
  - Varredura do rename: os testes do Probe e do Anvil já checam a ausência do texto antigo. Sobra o `aboutMenu` do desktop (Rivet), pedido.
  - Handoffs pendentes entregues ao Rivet: códigos no runner (RUN-ERRORS) e o protótipo da BOOT-SPEC.
  - **Lição:** uma troca de texto que é contrato (título, botão) precisa de um grep nos testes de todos os pacotes antes, não só no meu.

## 2026-11-04 09:40 — Fase de UX pós-v1 e fechamento do backlog

- **`persona-spec/design/UX-PHASE.md`:** as 10 maiores melhorias, cada uma com problema (com a evidência dos dogfoods e do backlog), solução, impacto (ativação, retenção ou confiança, com o princípio RCD), esforço/dono e métrica local (sem telemetria).
  - **Achado que ordena a lista:** nos dois dogfoods, a equipe nunca entregou trabalho real (Agência: 0/20 execuções reais; Padaria: presa no onboarding). A ativação da Persona é a 1ª entrega aceita.
  - **Ordem:**
    - A: 1ª entrega no onboarding, onboarding que nunca prende, conectar a IA sem terminal misterioso;
    - B: uma decisão num lugar, falar com quem você quer, projeto e sprint;
    - C: "Estou fora", avisos só quando importa, autonomia visível, corrigir o rumo (steer).
  - **Regra da fase:** nenhum controle morto, com checagem automática no gate.
- **UX-BACKLOG:**
  - 11 itens meus mudaram de "feito" para **fechado**, com prova (quadros antes/depois ou teste);
  - nova seção com 8 problemas resolvidos hoje (UX-19 a UX-26: `?` morto → Ajuda, erros crus → cartão, janela branca → BOOT, switch no escuro, botão carregando sem nome, jargão, carry do quadro, detalhe técnico do erro);
  - quadros novos em `.maestri/tmp/shots/design/fase-ux/antes-depois/`.
- **Rivet:** RUN-ERRORS já está no código do runner; `aboutMenu` corrigido. Decidi que este NSIS leva só o fundo do tema na janela (risco zero, preserva a validação do `#root` pedida pelo Keel); o porte do protótipo de boot vai no próximo.
- O pack de 10:39Z caiu num overlay do Rivet (`as never`), já retirado. O vigia do instalador está rearmado.
- **10:00, 1º uso instalado:** o pack de `b26d8b99a2` passou nos gates (10/10) mas caiu no `prepare:dsh` (`dsh plugin --profile desktop` pede um perfil inicializado; mesmo tema do `#root`). Causa exata enviada ao Rivet. O encadeamento "espera o pack ok → roda o first-run claro e escuro sob lock" está rearmado.
- **11:25, 1º uso instalado, pacote `b26d8b99a2`** (o encadeamento rodou sozinho; win-unpacked, perfil limpo, claro e escuro):
  - A janela anexa em 1,0 s no claro e 0,76 s no escuro, mas **o boot falha**: `dsh-desktop:boot … failed to read overlay …\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\config\electron.cordis.patch.yml: ENOENT`. A pasta `config/` do `dsh-desktop-host` ficou fora do asar.
  - **Para quem usa:** a página congela (até o screenshot por CDP estoura 30 s) e **nenhuma mensagem aparece**. É o caso exato da tela de erro da BOOT-SPEC, que ainda não foi portada.
  - Causa exata enviada ao Rivet; Probe avisado. O script agora guarda o erro inteiro (900 caracteres).
  - **11:35, causa raiz do ENOENT:** `apps/desktop-host/package.json` tem `"files": ["lib/index.js", "lib/cli.js"]` e deixa `config/electron.cordis.patch.yml` fora do pacote montado (conferido em `targets/win-x64/dsh/...`). A correção é uma linha (`"config/"` em `files`) e foi entregue ao Rivet.

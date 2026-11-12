# Muse — Diretor de Design (relatos)

## 12/11 08:45 · Colheita: o sprint de correção, os aceites e as passadas de leigo nº 2 e nº 3
- **ACEITES escritos no Status:**
  - 5 (parte 1), 7, 10, 15 (o Cofre com o cartão 2FA) e 16 (as 2 partes);
  - 19a completo (com o P1-08, a 200% de verdade);
  - 19b completo (Conexões + o editor de Rotinas; este depende da recaptura no shell real com o patch de modais do Flint);
  - 26, fatias 1 e 2 (visual, atrás da flag toolsCatalog);
  - os 2 lotes de passada de leigo do Lumen.
- **Arte da noite 2 toda aprovada:**
  - as reações do time inicial;
  - a Estação;
  - o canal pronto;
  - o convite;
  - as 7 categorias;
  - os glifos `key`, `equipe-nova` e `estacao` (no UI_PATHS, ui-glyphs 42/42).
- **Specs:** §26 (Ferramentas), §27 (o convite do 1º colega) e §28 (a Estação), mais as decisões do 10, do 16b, do 19b e do Cofre.
- **Passadas de leigo:**
  - **nº 2** (snapshot de correção): 9 de 11 tickets fechados. Achou a quebra do e2e no passo 2 (getByText sem escopo; o Prism corrigiu em 5 lugares).
  - **nº 3** (snapshot 2): 'Olá, <nome>!' certo. O L9 foi medido e é a entrada do painel (< 300 ms). Sobra 'Probe Probe' no rail.
- **Erro meu:** às 05:43 editei o PanelBoundary dentro do congelamento. Revertido às 05:48, antes do corte, e avisado ao Keel. A regra foi para a memória (olhar o relógio antes de editar em congelamento).
- **Em aberto:**
  - §23 (fonte C + balão v5 + R2, do Quill): 'Pode.' quebra em 'Po/de.' (overflow-wrap) e 2 achados de a11y no FixedRowVirtualScroller;
  - as Travas e a janela de silêncio (Prism);
  - o editor de Rotinas no shell real (Flint).

## 12/11 02:40 · Colheita, noite 1: as escolhas do Miguel, os aceites e a 1ª passada de leigo
- **O Miguel escolheu:**
  - a **capivara viva** (item 21, o protótipo em `.maestri/tmp/muse/capivara-viva.html`), e o time inteiro está aprovado: 17 bichos mais a capivara, por transplante de rosto (`face-transplant.py`);
  - a **fonte C** (Geist no texto, Fredoka nos títulos), os **balões v2** e o **rosto R2** (40 px, enquadrado na cabeça). As medidas e os tokens foram ao Quill (COLHEITA-MUSE §23).
- **ACEITES:** os itens 4, 7, 16 (parte da Memória) e 5 (parte 1).
- **Specs novas:**
  - §16b, Jeito de trabalhar;
  - §21, Personas vivas, com o capricho;
  - §22, Equipes e canais, com a gramática círculo = gente e quadrado = persona;
  - §23, a Conversa.
- **Decisões:**
  - o Cofre (Configurações › Cofre, o cartão do 2FA);
  - o 19b (o e-mail dentro de 'Quando' e o formulário do IMAP);
  - os textos de cerca do item 22.
- **Processo novo:**
  - o aceite é o pré-aceite do Ember mais a Muse, sem lote ao Carbon;
  - a **passada de leigo** a cada snapshot.
- **A passada de leigo nº 1** (`.maestri/tmp/shots/design/leigo/snapshot1`, com `.maestri/tmp/muse/layperson-pass.mts`):
  - os 5 tickets de antes estão corrigidos;
  - 11 novos aos donos. O ALTO é o onboarding ainda chamar a memória de 'Cofre'.

## 11/11 22:03 · COLHEITA agentes.chat: a spec de tela entregue
- **Spec:** `persona-spec/design/COLHEITA-MUSE.md` cobre os itens 5, 6, 11, 13, 14, 18, 19a e 20, com estados, medidas, movimento sobre os tokens que já existem e o texto PT-BR. Saiu em sala limpa: nomes nossos e nenhum nome interno deles.
- **Decisões:**
  - o painel do 19a é a seção **"Seus números"** da Visão geral (não "Minha Casa");
  - o estado de conta não conferida chama `naoConferido`, e o vermelho fica só no logout confirmado;
  - o "segure" usa o verbo da ação: `Segure para enviar/publicar/pagar/apagar`;
  - a régua usa os tokens `--control-h-*` e `--control-r-*` (o Quill cria).
- **Donos avisados:** Prism, Quill, Rivet, Flint, Cobalt e Gauge.
- **Arte com o Brush:**
  - vazio **Seus números** (dia e noite): aprovado no design depois da limpeza de alfa;
  - **conversa da tarefa**: o balão "…" deve ficar vazio, e falta a noite;
  - **cofre**: ficar só com o cofre e uma chave na pata.
  - Para o acabamento, a ferramenta `.maestri/tmp/muse/alpha-clean.py`: o halo sai e o alfa vai a 255, com 4% de margem.
- **Próximo:** o aceite final de cada item com tela, depois do pré-aceite do Ember e do Carbon.

## ✅ 09/11 19:25 — ACEITE DO INSTALADO v1.1 (Setup 39b2b6165b, sha256 4acf5b7a…9a04; cliente lib 6c 1688d21b)
- **Escuro:** 24/24 cenas × 1440/960/200% (pré-aceite 72/72).
- **Claro:** 24/24 (72/72 no 3660c033a5, com o mesmo cliente); geral/dm/personas refeitos no Setup novo (9/9).
- Axe 0. Nenhum P0.
- **O fio da tentativa 5** lê como equipe: só a resposta final, opiniões em palavras simples, a arte como arquivo.
- **v1.1.x (nas notas):**
  - o interruptor sem pasta aparece ligado;
  - o avatar 'E' na fila;
  - a pontuação dupla no corte ('….');
  - as abas de Configurações cortadas a 200%;
  - os 2 'Decide o rotineiro' (a confirmar).
- **Pastas:** `.maestri/tmp/shots/design/accept-installed/{3660c033a5,39b2b6165b}-v11`.

## ▶ RETOMADA (07/11, ordem do Miguel via Atlas: força total até fechar a v1.1)
- **Fila:** o aceite final em lote do bundle 5, na ordem Quill → Ember → Prism → Lumen → Flint, só o que passar no pré-aceite do Ember. Depois, a varredura do instalado do corte.
- **Novo:** `.maestri/tmp/muse/accept-installed-v11.mts` (a varredura do INSTALADO com os padrões de produção, PERSONA_THEME real e a sonda do pré-aceite em cada captura; 23 cenas × 3 tamanhos × 2 temas) + `scripts/persona/preaccept-manifests/muse-installed.json`.
- **Aceites do lib 6 (7bd08b15), todos com o pré-aceite do Ember:**
  - SW-7 "Num rascunho";
  - Ember: V2 b5 + b6 sem iniciais;
  - Lumen: decoração + Saúde, e o **Revisar no app real (18/18: cabe nas 3 larguras; sucesso inteiro a 200%; o toast só depois que a folha fecha)**;
  - Prism: b6 na galeria + **o shell real 36/36 (o cartão da persona cabe; "Este motor não informa a cota."; a faixa da equipe sem sobreposição)**;
  - Flint: lotes 1, 3 e 4;
  - Quill: EFF-1 (b5) + os singulares b6;
  - Gauge: **"Um dia da equipe" de fábrica no lib 6 (9/9, 54/54; a opinião sem versão nova sem o Antes/Depois vazio)**.
- **Decisões de hoje:**
  - EFF-1 com os NÍVEIS NATIVOS (EFFORT-SPEC §1);
  - a opinião sem versão nova esconde o bloco;
  - o popover CV-3 a 200% entra no 6b;
  - a Revisão escondida ganha uma frase estática (review.alwaysOn, no tree do Forge);
  - o cartão sem responsável leva o ícone da equipe, neutro e sem letra (Lumen, 6b);
  - o "Atl…" do Gestor na faixa a 200% sai no 6b (com o OK do Keel);
  - o custo do conector ISO-5 (v1.2: grant.iso5Cost / iso5CostUnknown, em tokens, nunca em US$);
  - **os ARQUIVOS NO RASCUNHO (EQUIPE-REAL §e)**:
    - no lib 6c: o interruptor + "Ferramentas" (Quill), e a linha tipada + a miniatura na opinião + a prévia no Revisar (Flint/Lumen);
    - prioridade 2: o chip no bilhete e o bloco no "Pronto".
- **Espera:**
  - o lote do 6b: EFF-1 nativo (Quill); o cartão sem responsável (Lumen); a faixa sem o "Atl…" (Prism); a frase da Revisão (Forge); o Flint lote 2 no shell real;
  - o 6c dos arquivos;
  - a transcrição da tentativa 3/4;
  - o Setup do corte para a varredura do instalado.

## ⏸ PAUSA TOTAL (05/11, ~06:35, ordem do Miguel via Atlas: cota semanal do Claude em 85%) — ESTADO EXATO

**Nada pela metade:** nenhuma edição aberta e nenhum job meu rodando. O observador D-069 já tinha encerrado.

### Feito e NO TREE (a v1.1)
- **Arte (`build-assets.mjs`, último build 02:32: 745 arquivos, 9,76 MiB de 12):**
  - BR-P4 (noite/enfeites), BR-P5 (36 figurinhas), BR-P6 (12 ícones da equipe real + 2 spots a 96), BR-P7 (5 ícones de meio em `icons/actions`), o kit do mico, a folhagem clara v3;
  - **mudanças no pipeline:**
    - as poses de estado em q76/alpha 90;
    - as reações `bom-dia`/`ate-amanha`;
    - as pranchas `stickers-preview-*` excluídas;
    - as peças de decoração em `illustrations/`;
    - só os 5 `icons/actions` de meio entram;
    - **o clean preserva os `.ts/.tsx` escritos à mão** em `client/assets`.
- **Código meu no cliente:**
  - `primitives/PersonaCard.tsx` (o `QuotaMeter` não desenha com pct não finito) + `primitives/Accounts.tsx` (só medidores com número) + teste novo `tests/quota-meter-finite.client.spec.tsx` (5/5);
  - `theme/persona-palette.css` (os tokens `--persona-night-glow/-vignette/-active-glow`).
  - Testes verdes; `check-pkg` não foi rodado por mim depois do último (os donos rodaram a suíte inteira).
- **Specs publicadas hoje:**
  - EQUIPE-REAL-SPEC (§0 a regra do fio; os ajustes do transcrito; o resumo a pedido; a opinião sem visão);
  - COTA-NAO-DOLAR-SPEC (D-092, a frase do pct=null);
  - EFFORT-SPEC (§4.1, a versão mínima da v1.1 + a linha de origem + o layout empilhado);
  - APARENCIA-SPEC (TH-1);
  - BR-P5/P6/P7-SPEC;
  - NEXT-STEP-SHORTCUTS §1 (Aprovações sem a regra 1 + o hábito) e §3.1 (atalhos, v1.2);
  - CONVERSAS §0.1 (o rodapé do trilho) e §4.1 (CV-7);
  - NIGHT-THEME §5–6 (a luz da luminária).
- **v1.2 pronta FORA do pipeline (`persona-assets/concepts/v1.2/`):** os kits da preguiça, do tatu-bola e da arara-azul; os 4 vazios noturnos v2. Ferramenta `persona-assets/tools/life-composite/composite.py`.

### Aceites dados (linhas ACEITE na Status)
- **Bundle 2:**
  - IV-9, IV-8, Aprovações V2 + A-4b (Ember);
  - CV-4 e DMs a 200% (Prism);
  - Canvas, E13 (Quill);
  - A-5 e o composer a 200% (Flint).
- **Bundle 3/4:**
  - IV-10 e P1-9 (Ember);
  - Conexões, Ensinar, Configurações › Personas, P1-7 (Quill);
  - TH-1, Equipe › Personas, Resumir o dia, IV-6 (Prism);
  - cartões de ação externa e permissão (Ember);
  - Revisar mudanças (Lumen).

### Pela metade (esperando os outros, nada meu aberto)
- **EFF-1 (modelo + capricho, LIGADO na v1.1 por ordem do Atlas):** host feito (Anvil); tela no tree até 07:15 (Quill: o layout empilhado, a lista completa de 12 modelos, a linha de origem, o chip). **Falta:** a captura no shell real com a lista do host + o turno no ledger (Opus + Máximo, Tally). O meu aceite depende disso.
- **Bundle 5 (não saiu antes da pausa):** as correções do Lumen (o texto sem nome do Revisar; a Saúde sem a rotina do sistema), do Quill (a NextStepBar em Aprovações; Quadros com o inReviewSince), do Flint (o composer Parar; a opinião recolhida com a imagem; a opinião sem visão; o agrupamento que quebra em cartão; o action.missing) e do Prism.
- **A capturar e aceitar:**
  - a captura do Flint (CV-1/trilho, CV-9 balões + luz, P0-22, opinião, prévia no fio) nunca chegou;
  - Lumen: os enfeites (houseDecor), o P1-10 e a Saúde neutra.

### Decisões de corte que eu tomei (para o Keel/Atlas)
- **NextStepBar:** OFF no corte (sem prova visual da regra certa; v1.2).
- **Ressalvas da v1.1:**
  - "Adicionar/Remover conta" a 200% (a borda passa 11/2 px; o primário inteiro);
  - "Claude Max…" a 18 px no rodapé de Uso (a 1ª da v1.2).
- **Alvos de 20–22 px:** ok na v1.1 e a 24 px na v1.2.
- **Os 3 bichos da v1.2:** fora da v1.1 (orçamento).

### Próximos passos quando o Atlas chamar
1. Revisar as capturas do bundle 5 na ordem Quill → Ember → Prism → Lumen → Flint (com o pré-aceite do Ember).
2. Aceitar o EFF-1 (a captura + o turno).
3. Revisar o transcrito da tentativa 2 do TEAM-10, quando for remarcada (critérios: o pedido inteiro, nenhum "Em andamento", um só Bom dia em cartão, a captura sem o onboarding).
4. A varredura final do instalado da v1.1 (`.maestri/tmp/muse/accept-installed.mts`, PERSONA_THEME claro/escuro; com a passada `MUSE_NAV_PLACES=1`).
5. Registrar na v1.2: os 3 bichos + os 4 vazios noturnos (o build-assets e a medida do peso).

---

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
- **11:50, Fase A item 1 especificado** (`persona-spec/design/FIRST-DELIVERY-SPEC.md`, só spec, aguardando a prioridade do Atlas):
  - **Correção honesta do UX-PHASE:** o passo 5 "Primeira entrega" **já existe** (Prism). Eu tinha descrito como ausente. O buraco real é outro: só há `intro | working | celebrate`, e não existe saída sem motor, com falha ou com demora.
  - **A spec acrescenta:**
    - `needsEngine` (decidido antes do clique), `slow` aos 45 s ("Entrar e acompanhar") e `failed` com o `RunErrorCard`;
    - "Aceitar e entrar";
    - o cartão "Primeira entrega a caminho";
    - os eventos locais `first_delivery_*` (ativação = aceita);
    - o texto pt e en;
    - o aceite em E2E nos 3 caminhos, todos com ação.
  - O UX-PHASE item 1 foi reescrito com esse estado real.
- **13:20, item 4 do UX-PHASE com o Lumen:** `persona-spec/design/DECISIONS-SPEC.md`. Causa do UX-01: a Visão geral recebe `attentionTitles: string[]`, sem id. A spec traz uma fonte única `Decision[]` com dedupe por id no store; o mesmo ciclo nas duas telas (o carimbo e os 750 ms que já existem, saída de todas as listas e contadores juntos, desfazer só se `reversible`, foco e aria-live); "Aprovar" direto para o risco baixo e "Revisar" com `focus=<id>`; contratação só com o porquê. Entregue ao Lumen; do Anvil precisa `id`, `blocking`, `risk` e `reversible` no host.

## 2026-11-04 13:40 — Revisão do 1º uso no app instalado (item 4 do Atlas): `persona-spec/design/FIRST-RUN-REVIEW.md`

- **Pacote `b3a4e5b933`**, perfil limpo, sem IA conectada. **O boot funciona**: o ENOENT sumiu, o onboarding vai do 1 ao 5 e há 0 erros de console.
- **Achados:**
  - **FR-1 P0 (Rivet):** a splash do harness de origem, "HARNESS · Loading plugins…" em inglês e fundo branco, por 17 s.
  - **FR-2 P0 (Prism):** "Pedir agora" não muda o passo 5; a entrega falha no #geral (o `RunErrorCard` "motor não disponível") e o onboarding não diz nada. É a prova da FIRST-DELIVERY-SPEC.
  - **FR-3 P1:** a 2ª mensagem fica 90 s sem resposta e sem aviso.
  - **FR-4 P1:** 17 a 19 s até o passo 1.
  - **FR-5 P2:** o avatar do cartão de erro sai como inicial.
  - **FR-6 a11y:** listas inválidas nos passos 3 e 5.
- **Funcionou de ponta a ponta:** o `RunErrorCard` no app instalado, o glossário, o passo "Primeira entrega".
- **Limitação:** o escuro não foi testado (o app segue o `nativeTheme`). Corrigi também um falso positivo do meu script.
- Entregue ao Prism e ao Rivet.
- **13:55, specs dos 4 pontos do Prism:** `persona-spec/design/UX-PHASE-PRISM-SPEC.md` (seletor de DM e "Quem responde" com a dica de 1ª vez; "Estou fora" com o `Switch`, `ChoiceCards` e a consequência; chip de autonomia e "O que {persona} pode fazer"; balão tracejado do steer). Só primitivos existentes. Entregue ao Prism.
- **14:05, caminho feliz do 1º uso:** o fake CLI do Probe só responde versão e auth (não faz turno), então não mede a 1ª entrega aceita. Perguntei ao Keel: (a) `PERSONA_REAL_TALK` com a conta real (precisa de ok), (b) o Probe estender o fake, (c) esperar o dogfood real. Não rodo nada com conta real sem ok.
- **14:10, decisão do Keel:** opção (b). O Probe estende o fake-cli para responder um turno curto (com latência e, se der, modo de falha por env), e o pedido foi combinado com ele. O `first-run.mts` já aceita `MUSE_FAKE_CLI=1` (`withFakeCliOnPath`) e marca a ativação ("Aceitar"). Vou medir na execução real única do V1-P0-5 em vez de gastar outra. O encadeamento está rearmado para o próximo pack (`b3a4e5b933` + overlay), sem o fake, para comparar com FR-1 e FR-2.
- **14:20, caminho feliz com o fake novo:** o Probe estendeu o fake (`FAKE_CLI_TURN_MS`, `FAKE_CLI_FAIL`, `FAKE_CLI_REPLY`…) e o meu vigia rodou sozinho. Deu o mesmo resultado sem IA (passo 3 com tudo "Não detectada"). Causa: `mergeLoginShellEnvironment` (desktop) põe o PATH do login shell por cima do herdado, e o fake no PATH não chega ao app instalado. É limitação do teste, não do produto. Propus ao Probe e ao Rivet uma `PERSONA_E2E_EXTRA_PATH` prefixada depois do merge, só para teste.
- **14:30, NSIS `b3a4e5b933`:** FR-1 confirmado por medição própria (1º quadro é a splash da Persona). O tempo até o passo 1 caiu de 17,5–19,2 s para 14,3 s. P3 novo: a splash usa a fonte do sistema, e o `color-contrast` ×1 continua. O `FIRST-RUN-REVIEW` foi atualizado.
- **14:40, FR-1b com precisão:** o `color-contrast` da splash é a splash antiga do harness, que ficou no DOM por baixo ("Loading plugins…" 3.7:1, lida pelo leitor de tela em inglês). Correção entregue ao Rivet: não renderizar no perfil persona. O `first-run.mts` ganhou o detalhe do axe (seletor e cores) e o `MUSE_ONLY_BOOT=1`.
- **14:50, FR-6 com seletores exatos:** no passo 3, o Notice `role=note` está dentro do `ul.harnessList`; no passo 5, o `li` fica dentro do `div` do `StaggerEntrance` (**meu**), e a lista tem `aria-label` = nome do usuário. Corrigi o meu primitivo (`as="li"` e `className`, teste 2/2) e entreguei ao Prism o resto.
- **15:05, SW-7 (D-064) entregue ao Lumen:** `persona-spec/design/SIMPLE-WORKSPACE-SPEC.md`.
  - Glossário novo: rascunho, mudanças, Aplicar na pasta, Desfazer, versão de antes.
  - O estado "Num rascunho" na faixa da equipe.
  - Revisar com antes e depois por tipo (texto, planilha, imagem, PDF).
  - Aplicar com os casos do Windows (arquivo aberto, OneDrive), Desfazer por 30 dias no Histórico, e o conflito com 3 escolhas.
  - Configurações avançadas só com pasta git.
  - Tabela trocando as chaves atuais do `review`, que hoje dizem "diff", "integrar", "worktree e a branch".
  - Aceite com a varredura de jargão.
- **15:05, caminho feliz:** o Probe entregou o fake que faz turno inteiro e também pina `OAR_*_BIN`, que pode contornar o merge do PATH do login shell. Minha medição no instalado está na fila do lock, atrás do Probe e do Rivet.
- **15:20, `FileChangeRow` (SW-7) pronto:** primitivo com `fileTypeOf` e `summarizeFileChanges` (resumo em palavras), os ícones novos `file`, `fileText` e `fileSheet`, o apagado com risco e frase (nunca só cor), e expandir acessível. Testes 4/4. Na página viva do DS, com axe 0 nas 3 variantes. Entregue ao Lumen.
- **15:40, caminho feliz no instalado (2ª tentativa, com o fake novo + `OAR_*_BIN`):** continua tudo "Não detectada" e "motor não disponível". Nem o PATH nem as `OAR_*` herdadas parecem chegar ao processo que detecta as ferramentas. **Correção (Probe, 15:50):** não há allowlist de env, porque no Windows o `hostEnvironment` é o `process.env`. A minha hipótese estava errada, e a causa real está sendo medida pelo Probe com o `FAKE_CLI_LOG`. Confirmado ao Probe e ao Rivet, com a proposta de o desktop repassar explicitamente o PATH extra e as `OAR_*` em modo de teste. Fica bloqueado nisso.
- **16:00, BR-P1 para o Brush:** `persona-spec/design/BR-P1-SPEC.md`.
  - **P1, piscar:** frames PNG de 1536 com o mesmo enquadramento da `disponivel` (é o que o `PersonaTeamFigure` já sobrepõe), com as 6 poses de vida nos 12 extras e a ordem por uso nos modelos (amostra: o tamanduá).
  - **P2:** 5 ilustrações de estado (`empty-sem-ia` primeiro, do P0) e os ícones de Ajuda e Novidades.
  - **P3:** 4 animais novos (mico-leão-dourado, preguiça, tatu-bola, arara-azul), com amostra.
  - Nenhum fundo novo, pelo teto de 10 MiB.
  - Anotado o D-065: a trava `check` com 2 vagas para check-pkg e vitest.

**16:25, amostra BR-P1 do tamanduá (revisão por pixel e no tamanho real):**
- **`blink`: aprovado.** Só os olhos mudam (0,25%), a caixa opaca é igual à da base e o arquivo tem 1,26 MB.
- **`tail` (orelha): ajustar a amplitude.** A 188 px ela anda ~1 px.
- **Conferido no código:** a troca de frame é por `steps(1)`, sem fantasma; a respiração fica no wrapper; o `build-assets` recorta a família com o mesmo box.
- **Nota para todo o lote:** traço solto ameaixado some no escuro.
- **Faltam para fechar a amostra:** `acenando` + `pensando-1/2/3`.
- Detalhes: BR-P1-SPEC §Revisões.
- **D-067 conferido:** o harness do instalado já sobe com porta livre e home por execução.

**16:40, amostra P3 do mico-leão-dourado:**
- **Cara e pose aprovadas.**
- **Antes do kit, ajustar:**
  - a saturação do pelo: mediana 0,72, quando a casa vai até 0,53;
  - o avatar, que deve ser 1024² (eu tinha especificado 256 por engano; corrigido na spec);
  - a pose, que veio em PNG de paleta (P) e precisa ser RGBA.
- **Prioridade lembrada ao Brush:** a `empty-sem-ia` (P0) vem antes do kit P3.

**17:20, rodada BR-P1, orçamento, paleta e SW-8:**
- **Arte aprovada e na árvore do app (`build-assets`):**
  - kit de vida do tamanduá (o tail v2 lê a 188 px);
  - `empty-sem-ia`, que o Prism já usou no passo 5;
  - `spot-sem-ia` (FR-3);
  - avatar do mico v2 (saturação 0,55);
  - tucano: blink, tail e acenando. Os `pensando` voltaram: o balão acima da cabeça encolhia o bicho ~25%. Criei a regra da mesma escala e chão para todos.
  - Script de revisão reutilizável: `.maestri/tmp/muse/review-life.py <animal>`.
- **Orçamento (Keel aprovou a opção b):**
  - poses de vida a 376 px e q76 (indistinguível a 3×);
  - os PNGs de marca saíram da árvore do app (−1,1 MiB; o site, o README e o desktop leem de `persona-assets`/`resources`);
  - a árvore foi de 9,05 para **7,64 MiB**. O P1 e o P2 inteiros cabem; o P3 entra sob demanda.
  - Registrado em PLAN-assets-brush §8.
- **Paleta:** `--persona-ink-muted` no escuro (#b9a8ca, ≥ 5,8:1), achado do Lumen. Guarda novo em `palette-dark-contrast.client.spec.ts` (5/5): todo `ink-*` precisa existir no escuro com 4,5:1.
- **`ChoiceCards`:** selo ✓ no cartão escolhido (capturas em `design/choicecards-check-*`).
- **Galeria SW-8 do Lumen:** aprovada no conjunto, com 6 ajustes (SIMPLE-WORKSPACE-SPEC §Aceite visual). O principal: uma captura em branco tinha passado no axe.
- **Testes:**
  - meu `ux-backlog-muse` atualizado para a cópia nova "Tokens por mês, por persona";
  - os testes de assets e figura estão verdes;
  - o check-pkg do client só falha em `teach-flow.client.spec` (7 TS, Quill avisado).

**17:45, tucano `pensando` v3:** a escala, o chão, a caixa e os olhos estão aprovados.
- **Decisão (revisa a minha spec):** no `pensando` dos extras, sem balão. A nuvem do estado é o `.overlay` da faixa.
- **Pedido ao Brush:** tirar o balão do tucano e do tamanduá; raposa e panda já vêm sem.
- **Registrado em:** BR-P1-SPEC e no post-it UX.

**18:10, revisão por captura do app real** (C5a, C5d, PRO-4; `design-shots.mjs`, claro e escuro, 0 erros de console): `design/CAPTURE-REVIEW-0411.md`.
- **À altura das ilustrações:** a faixa da equipe e a Visão geral.
- **10 ajustes:** 9 do Prism e 1 do Lumen. Os principais:
  - o passo 5 com `MOCK_INTRO_LINES` fixos;
  - o modal do passo 5 cortado em 1440×900;
  - "1 PENDENTES";
  - "Descansando · zzz" lido em voz alta;
  - o cartão da 1ª entrega creditando "Equipe" sem rosto;
  - o avatar com inicial em "Precisa de você".
- **Antes das capturas do Prism:** revisei o código do passo 5 (FIRST-DELIVERY-SPEC §Revisão do código). Faltam a pose `trabalhando`, os rótulos do `ActivityGroup` em locale e o live só na linha de estado.
- **PLAN:** SW-7, BR-P1 e W3-6 atualizados.
- **PRO-4:** os estados `stuck` e `waiting` esperam a captura com o host real.

**18:40, avisos nativos (UX-PHASE nº 9) e outros:**
- **`design/NOTIFICATIONS-SPEC.md`** (Rivet e Anvil):
  - 5 eventos que avisam, e só esses;
  - silêncio com a janela em foco;
  - "{persona} terminou / precisa de você / perguntou / não conseguiu terminar", com o rosto;
  - o orçamento só para `done`/`review`;
  - o agrupado "Enquanto você estava fora";
  - o clique leva ao lugar exato;
  - Configurações › Avisos;
  - referências do refcat: Slack, Teams e GitHub.
- **Gerei os rostos do aviso:** `apps/desktop/resources/notify-avatars/*.png` (128², 18 bichos, 412 KB, no `build-assets`, fora da árvore do client). Falta o Rivet incluir a pasta no pacote.
- **DECISIONS-SPEC Regra 4 corrigida** (achado do Lumen): uma decisão pendente nunca some por falta de dado; sem o porquê, o cartão aparece sem a linha.
- **BR-P1:** pensando sem balão do tucano e do tamanduá aprovado e regenerado. A árvore está em 7,63 MiB.

**19:20, varredura de aceite (pedido do Atlas, `.maestri/tmp/muse-next.txt`):**
- **ACEITOS:** GOV-6 e GOV-7.
- **Voltam ao Lumen:** PB-5 (mini-resumo), SB-5 (id cru na tela) e BYC-4 (falta a captura dos estados).
- **Achado P0:** o boot às vezes sobe vazio (`SlotAssemblyError`). O Keel deu ao Prism, e o Gauge faz o teste de 20 recargas.
- **Primitivos:**
  - `Modal` com cabeçalho e rodapé fixos e só o corpo rolando (Quill, zoom 200%);
  - o `Notice` info com o glifo novo `info` no lugar da interrogação.
- **Quill:**
  - aprovei tirar o microfone;
  - "skill" fica, e entrou no glossário;
  - troquei "Habilidade" → "Skill" em `decision.kind.skill`.
- **Raposa aprovada.**
- **Minhas capturas** (GES-4, GOV-8, W2-3, S6 e as telas do Quill, 1440 e 960 com axe) estão na fila da `build`. O script ganhou `MUSE_VIEWPORT`, `MUSE_OUT` e a tela `gestor`.
- Doc: `design/ACCEPTANCE-SWEEP-0411.md`.

**19:35, telas do Quill contra a SCREEN-SPECS** (item 2 do Atlas):
- **Conexões e Ensinar** já tinham spec (WAVE2 b/c, TEACH).
- **Escrevi `design/QUILL-SCREENS-SPEC.md`** para E13 e G2:
  - E13: estados com ícone e ação, a dica sem IP, Membro/Convidado com o que pode e não pode, e o termo único "Encerrar acesso";
  - G2: Lista como tabela com relações em palavras, Lista como padrão abaixo de 720 px, e o vazio com a Luna.
- **Pedido ao Quill:** o detalhe do axe=1 das capturas de Conexões.

**19:50, axe do rail:** o `color-contrast` presente em todas as capturas vinha do campo de busca do rail. O contraste real é de 8,9 e 11,6:1, mas o fundo `color-mix(… transparent)` engana o axe.
- **Tokens sólidos no tema** (claro e escuro): `--persona-rail-field`, `-field-hover` e `-kbd`, todos ≥ 8,7:1.
- **Pedido ao Lumen:** as 3 linhas no `PersonaSidebar.module.css`.
- **Respondi as 3 dúvidas do Quill:**
  - "Última troca às {hora}" com a sessão;
  - o convite degradando honesto;
  - a coluna "Quem" some se vier toda vazia.
- **A varredura** segue na fila da `build`, agora atrás do gate do Keel.

**20:00, rodada real do V1-P0-5 (D-069):** o Keel e o Atlas definiram que eu meço na rodada única do Probe, sem chamada real minha.
- **Marcos combinados** (FIRST-DELIVERY-SPEC §Medição): t0 = "Pedir agora", working, slow, failed, t1 = "Aceitar e entrar" ou a 1ª mensagem de persona no #geral, t2 = o aceite.
- **Número principal:** t1 − t0.
- **Pedido ao Prism:** `data-first-delivery-phase`.
- **Dependências:**
  - o Probe roda no NSIS do candidato, depois do fake verde;
  - o Prism coloca o atributo de fase.

**20:40, varredura com uma galeria sem host** (a trava `build` estava presa no gate do Keel):
- **`scripts/persona/muse-accept-gallery.mjs`** (cópia do método do Lumen): 66 capturas com texto real, claro/escuro × 1280, 960 e zoom 200%, com axe 0 e sem overflow.
- **GES-4:** o interruptor e os limites estão **aceitos**. O cartão do plano no chat volta ao Prism: um passo só repetindo o resumo, e sem o `reason` que o host manda.
- **GOV-8 volta ao Prism:**
  - falta "um a um";
  - o h1 está pequeno;
  - texto autorreferente;
  - a seleção só pela borda;
  - rótulos repetidos.
- **O axe da galeria achou 3 bugs meus, já corrigidos:**
  - `--persona-surface` e `-surface-alt` não existiam no escuro;
  - o plano recusado usava `opacity`;
  - o `.modelButton` estava sem `color`.
  - Um teste novo de cobertura impede token semântico sem valor no escuro (6/6).
- **`GestorPlanCard`:** não desenha lista vazia nem `reason`/`cost` vazios.
- **BR-P1:** panda aprovado. O 1º lote fechou (tamanduá, tucano, raposa, panda); a árvore está em 7,94 MiB.
- **Regra nova do Keel aplicada:** espera do shell + captura < 10 KB = falha no `design-shots.mjs`.
- **Medição da rodada real:** o Probe implementou os meus marcos em `runRealFirstDelivery`; falta o NSIS.

**21:10, varredura no app real** (`sweep-1440`, console 0; a de 960 está rodando):
- **GES-4:** interruptor, limites e selo confirmados no app. Falta o cartão do plano no chat.
- **S6 não ainda:**
  - o preview do editor mostra o Atlas como gato;
  - jargão "Router" e "Propor (padrão)";
  - o cartão da persona passa da tela e não fechou no Esc;
  - o selo Gestor diferente no cartão e no perfil.
- **W2-3** confirmado também na DM.
- **G2:** notas de texto e forma ao Quill.
- **SB-5:** `target-size` ao Lumen.
- **O rail está axe 0 em todas as telas:** o Lumen aplicou os tokens sólidos.

**21:40, UX-BEYOND ("Acima do T3", prioridade máxima do Miguel e do Atlas):**
- **`design/UX-BEYOND-T3.md`** com **26 P0**, cada um com dono e aceite, em 4 grupos:
  - A. o 1º contato;
  - B. quebrado/mente;
  - C. pior que o T3;
  - D. acabamento.
- **No mesmo doc:** a régua 2 (Claude, Cursor, Linear, Slack, Raycast, Notion, Arc, Duolingo), a proatividade e os detalhes mínimos (16 P1).
- **"UX-BEYOND P0 pronto"** mandado ao Atlas às 21:12, com 24 itens; depois subiu para 26 (boot instalado e Conexões).
- **P0 distribuídos por `tell.mjs`** ao Prism, Lumen, Quill e Rivet.
- **`design/BR-P3-SPEC.md` ao Brush:**
  - P0: limite, equipe remota, acesso encerrado e aplicado, mais o P2 do BR-P1 que subiu;
  - P1: as poses comemorando/digitando/lendo/confuso, os sucessos, os spots de Ajuda e os ícones.
- **A paridade T3 item a item** está em verificação no código, com prova; entra no doc em seguida.
- **Varredura 960:** só o `scrollable-region-focusable` do `Modal` (corrigido no primitivo).
- **Também:**
  - o `Modal` com corpo focável quando rola, o esmaecido "tem mais" e o respiro de 6 px para o halo;
  - guaxinim aprovado (7,98 MiB);
  - o `Avatar` mínimo segue em 24.

**22:10, UX-BEYOND, continuação:**
- **A paridade T3 item a item** está no doc: MELHOR 4, IGUAL 3, PIOR 9, todos com item. Conferi 3 à mão. Viraram P0 os **controles mortos** (`/` comandos, o chip de autonomia), os **números inventados** (`/limites`) e o envio que falha calado.
- **Decidi a passada do Atlas:**
  - A-1 é a navegação em 6 lugares, em `design/NAV-SPEC.md` (fase 1 P0, sem mudar as rotas);
  - A-2 a A-6 e A-10 são P0;
  - P1-1 e P1-3 sobem para P0.
- **Atribuições D-072** no doc (Flint sob o Prism, Ember sob o Lumen) + a seção de propostas.
- **Sistema:**
  - **18 tokens CSS inventados** que falhavam em silêncio, corrigidos em 7 arquivos, com `--persona-accent-tint` novo;
  - teste novo `css-tokens-defined`;
  - o `Tooltip` com `shortcut` (chips de tecla) e Esc fecha, com teste.
- **Respostas:** Prism (o P0-13 dele; avisei o Flint), Quill (P0-26/15/24), Ember (A-4: a descrição não é "por que") e Keel (as minhas capturas escuras eram escuro real).
- **BR-P1:** coruja aprovada; `ajuda.svg` e `novidades.svg` aprovados e no app (8,11 MiB).

**22:30:**
- **Junção da paridade com o Atlas:** o IV-1..10 dele vira o id único. Decidi a forma das UIs do IV-3 (markdown seguro), do IV-5 (streaming + Parar), do IV-8 (vazio honesto sem mock), do IV-9 (Nova rotina sem cron) e do Ctrl K como sobreposição (P1).
- **O Probe tirou a dependência de rótulo dos gates** (`data-nav-panel`/`data-tab-panel`). O meu `design-shots` também clica por id agora.
- **Brush:** a arte P2 do SW-7 (conflito, histórico, rascunho) aprovada e no app (8,22 MiB); o Lumen foi avisado.

**22:50:**
- **Amostra BR-P3 `empty-limite` aprovada**, com o pedido da sombra de chão no lote todo; o lote P0 liberado ao Brush.
- **A-5 decidido com o Flint:** o popover mantém o "Estou fora", e a pílula segue uma ordem de prioridade.
- **A-1 fase 1:** aceitei a ponte do Prism (Projetos com 5 abas, "Canvas" até a fase 2).
- **Specs novas:** `design/NEXT-STEP-SHORTCUTS-SPEC.md`:
  - "Próximo passo", para o Ember;
  - a dica de atalho na hora certa e a tela Atalhos, para o Flint.
- **Primitivo `formatWhen`/`formatUntil`** (P1-13), testado; os builders adotam ao tocar nas telas.
- **Andamento dos P0** marcado no UX-BEYOND §Andamento.

**22:55, BYC-4d (decisão de consentimento):** as regras importadas chegam **não aceitas**, com "Aceitar todas as regras (n)" no grupo; as que ficarem sem escolha não entram como obrigatórias. Decisões e fatos continuam pré-aceitos.

**23:55:**
- **ACEITE PB-5.**
- **BYC-4 e SB-5**, com 3 ajustes pequenos ao Lumen:
  - "vault:" → "do Cofre";
  - o rosto da Nina nas permissões;
  - "Revogar" → "Tirar permissão";
  - o bibliotecário sem iniciais.
- **Pendências minhas para quando o Keel abrir a janela:**
  - o `Avatar` com a prop `icon`;
  - o `Chip` com fundo sólido em todos os tons (o danger empilhado no escuro dava 4,25:1).
- **HINT-clamp:** devolvi o `pointer-events:none`. Um balão visível não pode deixar o clique passar para um controle escondido.
- **Assets do H:** os 66 SVG eram só CRLF; todos os novos revisados.

**00:10, P0 direto do Miguel (Atlas):** o redesenho em `design/REVIEW-APPROVALS-REDESIGN.md`.
- **Revisar mudanças** (Lumen): 2 painéis, a prévia grande por tipo, o conflito focado e a celebração com Desfazer.
- **Aprovações** (Ember): caixa de entrada lista + detalhe, o teclado J/K/A/D, o lote só de risco baixo e o vazio que celebra.
- **D-074:** prova só dentro do shell real (avisei todos os builders).
- **BR-P3:** + `empty-aprovacoes`.
- **SB-4:** exportar/importar a pasta passa pela revisão do BYC.
- **BYC-4 e SB-5:** os ajustes feitos pelo Lumen; o aceite na captura real. O bibliotecário eu ligo na janela.

**00:25:**
- **BR-P3 P0:**
  - `spot-limite`, `empty-equipe-remota` e `acesso-encerrado` aprovados;
  - a variante da `empty-limite` com sombra aceita;
  - a `sucesso-aplicado` volta para refazer (igual à `empty-historico`).
- **A minha fila para quando o Keel abrir a janela** (o pacote fica parado até lá):
  1. o `Avatar` com `icon` (o bibliotecário);
  2. o `Chip` com fundo sólido em todos os tons;
  3. o `Modal` com o fundo `inert` + a altura sem sobra a 200%;
  4. o `build-assets` com as ilustrações novas do BR-P3.

**00:40:**
- **BR-P3 P0 fechado:** `sucesso-aplicado` v2 e `empty-aprovacoes` aprovados. Entram no app no próximo `build-assets`, na janela do Keel.
- **Cervo:** aprovado, menos a orelha (volta para mais amplitude).
- **D-076 aplicado:**
  - aceite só com a prova completa;
  - PLAN com ACEITE Muse em GOV-6, GOV-7, W2-3 e PB-5;
  - os meus abertos são 2: a revisão das capturas e o pacote de primitivos bloqueado pela janela.

**01:05, D-077:** o meu aceite trava a entrega, e a varredura é no instalado do H2.
- **Preparei `.maestri/tmp/muse/accept-installed.mts`:** 19 painéis por `data-nav-panel`; claro/escuro × 1440, 960 e 200% via CDP; axe, sobra lateral, tela vazia e console. Passou no tsc, fora do pacote.
- **Dos 13 retidos, nenhum tem prova completa** (sem ACEITE nem RECUSADO neste corte).
- **Lobo-guará:** aprovado, menos um resto de contorno junto da orelha.
- **Memória salva:** o PLAN é só do Keel.

**01:20:**
- **Lobo-guará completo** (tail v3).
- **Revisar em 2 painéis:** a amostra com flag do Lumen (só com `persona.devSeed.review`, o chip "Exemplo" e um teste sem a flag) para julgar o desenho no shell real.
- **O fake do Probe** agora escreve arquivo/conflito real (`writeFile`/`conflictDir`), ligado no `accept-installed.mts` como modo opcional para o H2, depois do SW-4.
- **Bolt:** as regras do A-4 no host (nome/bicho livres, `reason`/`monthlyTasks` só reais).

**01:45, a janela do client (H2):**
- **Avatar** com `icon`; o bibliotecário ligado (`brain-ui-adapters`, `Brain.tsx`).
- **Chip** com fundo sólido: os tokens `--persona-*-chip`. O danger empilhado no escuro ia a 3,41:1 e agora fica ≥ 5,4.
- **Modal:** o fundo `inert`, menos os live regions; a altura a partir de uma variável de gutter, mais 4 px.
- **`build-assets`:** o BR-P3 P0 (6 ilustrações) + cervo, coelho, lobo-guará e lontra. A árvore foi a **9,00 MiB**; pedi ao Keel o teto de 12 antes das poses P1 do BR-P3.
- **Testes:** `primitives-window-0411` (3) + 393/394 nos arquivos tocados. A falha é do Lumen, no Revisar em 2 painéis dele. check-pkg OK.
- **Ember:** a caixa de entrada de Aprovações atrás de flag; as 4 escolhas confirmadas.

**02:05:**
- **O teto de assets agora é 12 MiB** (Keel): `MAX_GIT_BYTES`, mais o registro em PLAN-assets-brush. `client.js` tem 0 data-URI e a arte vai por URL; o Keel confere o bundle no H2.
- **BR-P1 P1 fechado:** o ouriço aprovado e os 12 extras com o kit de vida completo no app (9,11 MiB).
- **IV-9 (Ember):** o layout da lista "Suas rotinas" decidido, com um primário só (cabeçalho ou vazio); a semana real no lugar da data fixa; o `Input` primitivo.

**02:40:**
- **BR-P3 P1:** o kit do Atlas completo (comemorando; digitando v2; lendo v2; confuso), que vira a referência para os 4.
- **D-078:** a forma na ACCOUNT-SWAP-SPEC; o texto do Quill em Conexões reescrito.
- **P0-19 (Flint):** 3 textos aprovados; a espera depois de recarregar passa a seguir o estado real da cota, e o anexo não some calado.
- **IV-9 (Ember):** 4 decisões confirmadas; a rotina da equipe sem o Apagar.

**03:00:**
- **Aceites no shell real:** A-2, IV-3 e P0-13 (provas do Flint).
- **Voltam ao Flint:** P0-22, A-5 e o rodapé "Conectado". O composer a 200% vai pela opção A.
- **Caixa de entrada de Aprovações (Ember):** a forma aprovada; o aceite espera 4 casos no shell real.
- **Ember IV-9:** ajustes conferidos.

**03:30:**
- **BR-P3 P1 dos 5 principais fechado:** 20 poses no app (9,78 MiB de 12).
- **Código:** `PersonaPoseState` com os 4 estados + `hasPose`, para o "está escrevendo…" não mostrar uma pose errada.
- **Aceites:** A-2, IV-3 e P0-13 no shell real.
- **P0-31 aberto** (o slug na ficha da tarefa) com o Prism.
- **Specs:**
  - TASK-PROPOSAL-SPEC (P1-9: cartão, resumo até 3, o tom das perguntas);
  - ACCOUNT-SWAP-SPEC (D-078);
  - o texto da política de conta do Quill.
- **O Tooltip com clamp e `disabled`** do Flint aceito no primitivo.
- **O check-pkg** só cai no teste novo do Prism (`task-card-title`).

**04:00, Conversas** (pedido do Miguel, via Atlas):
- **O protótipo** (o componente de galeria com primitivos, tokens e retratos reais), em 3 estados × claro/escuro, com axe 0.
- **`design/CONVERSAS-SPEC.md`**, com 4 decisões minhas:
  - nada de "Quem responde" na DM;
  - a escolha vale só para a próxima mensagem;
  - um canal automático nunca é apagado sozinho;
  - o rosto abre a DM.
- **Também:** os sucessos do BR-P3 P1 e o 1º spot da Ajuda aprovados; IV-10 (responder no composer) decidido; o fade do rail com o Flint.

**04:20:**
- **Conversas v2 com UMA barra lilás** (o retorno do Miguel): as 3 telas em `conversas-prototipo/v2-barra-unica/`; CONVERSAS-SPEC §0.
- **ISO-3 (D-081):** `design/CONNECTOR-GRANT-SPEC.md` (dar e tirar o acesso de uma persona a um conector seu) ao Keel/Quill.
- **BR-P3 P1:** os 6 spots da Ajuda e os ícones desfazer/fila aprovados.
- **Congelamento D-082:** paro de salvar em `packages/`, `apps/` e `scripts/`. O que eu tinha nessas pastas foi salvo antes do aviso, e está consistente:
  - o registro no `build-assets` dos 3 sucessos + os 6 spots, sem regenerar;
  - o protótipo na galeria.
- **Pendente para depois do H2 #3:** o `build-assets` (os sucessos e os spots da Ajuda) e a varredura de aceite no instalado.

**20:05:**
- **Balões (CV-9):** o protótipo da DM e do #marketing, claro e escuro, está em `baloes-prototipo/` (axe 0). O canal manteve o chip "Quem responde", e só a DM fica sem ele. O Atlas leva ao Miguel.
- **Poderes (D-084):** `design/PERSONA-POWERS-SPEC.md` alinhada com o Keel:
  - o pedido explícito não pede prévia em "Age dentro de limites"; pagar e apagar pedem sempre;
  - o Desfazer só aparece quando o host marca `undoable`; email, post e pagamento saem só com "Ver";
  - Codex: nada irreversível por iniciativa própria.
- **Colheita Lodi e Folhagem:** registradas na UX-BEYOND e na CONVERSAS-SPEC §0. Todo protótipo que vai ao Miguel leva a folhagem e os enfeites da casa.
- **Varredura do instalado (H2 #3, `4b2c752b47`):** o roteiro está pronto em `.maestri/tmp/muse/accept-installed.mts`:
  - são 19 painéis, claro/escuro × 1440/960/200 %, com axe, overflow e tela em branco;
  - há uma 2ª passada nova com `MUSE_NAV_PLACES=1` (a flag dos 6 lugares, mais a aba Sobre).
  - Ela só roda quando o Rivet publicar o Setup com o sha256. O pedido do Keel e do Atlas é manter a CPU baixa.
- **20:13 · A luz da luminária no chat (ideia do Miguel, só no escuro):** protótipo em `baloes-luz/`.
  - A luz cai só no fundo, e os balões continuam sólidos (axe 0; texto solto no pior ponto 6,2:1).
  - Regras na NIGHT-THEME-SPEC §5. Foi ao Atlas.
- **`build-assets`:** registrados os 3 vazios noturnos, os 6 ícones-cena dos canais e o vaga-lume (webp). Ainda não regenerei, por causa da CPU baixa até o Setup.
- **Flint:** pedi o CV-9 (balões) atrás de `persona.flag.bubbles` (D-077) até o meu aceite.
- **20:30 · Corte D-086 (Keel):** o `assets/` do client voltou a ser IGUAL ao H2 #3 (`4b2c752b47`).
  - Toda a arte nova saiu do tree: BR-P4 (vazios noturnos, ícones-cena, vaga-lume, folhagem v2 com luminária), BR-P3 P1 (sucessos, spots da Ajuda, 7 ícones ui) e o divider-leaves.
  - Está guardada em `persona-spec/design/v11-assets/`, para reaplicar na v1.1 com o build-assets.
  - Ninguém roda o build-assets antes do hash do H3.
- **Luz da luminária (v1.1):** o Flint está implementando atrás de `lampLight` + `bubbles`. A origem da luz vem do retângulo real da folhagem; o centro da luminária fica em 66,5 % × 75,1 % da arte v2.
- **20:55 · Varredura do H2 #3 fechada:** 114 capturas (`accept-installed/4b2c752b47-{light,dark}/`), axe 0.
  - Bloqueadores: DM a 200% (Prism, corrigido) e LEAK-1, o prompt interno da 1ª entrega como "Você" (Forge+Anvil).
  - Não bloqueadores com os donos: Equipe→Membros, Saúde no 1º dia, título de Aprovações, engrenagem a 200%.
  - O congelamento foi cancelado (D-087): tudo vai para a v1.1.
- **EFFORT-SPEC:** modelo + capricho por persona, para Flint, Anvil e Tally (hoje o modelo vai fixo em `sonnet`).
- **Rodapé do trilho de 64 px:** CONVERSAS §0.1 (Flint).
- **Aceites:** A-5 e o composer a 200%.

**00:25 · D-069, a 1ª entrega REAL: o que a pessoa vê (H2 #4 `bc28dac5c2`; a linha do tempo oficial do Probe)**
- **O tempo:** 28,1 s de "Equipe trabalhando" (28.687 ms) à 1ª entrega na tela (56.740 ms); 29,1 s do pedido ao "Aceitar e entrar". Cabe folgado nos 2 min prometidos ("leva menos de dois minutos").
- **A experiência está boa:**
  - o Guia avisa antes;
  - "Equipe trabalhando" tem a pose do bicho e o "Isso usa o motor de IA que você conectou. Pode levar um minuto.";
  - a celebração "Sua equipe entregou o primeiro trabalho!" usa a arte da equipe;
  - na Visão geral, o cartão fica em cima e o "Precisa de você" vazio é honesto;
  - em Quadros, "1 de 1 pronta".
- **Achados (v1.1):**
  1. **Sem a aparência da persona:** a persona "Probe Real" aparece com o avatar de LETRAS "PR" na barra e sem bicho escolhido. É do roteiro (o nome do teste), mas mostra que uma persona sem aparência cai nas iniciais. Uma persona sempre tem um bicho padrão (Quill/Prism, a verificar).
  2. **O subtítulo do "Equipe trabalhando"** troca de "Sua equipe está no pedido" para "Probe Real está no pedido" no meio da espera, o que faz o texto pular. Fique num só, com o nome quando ele já se sabe.
  3. **O LEAK-1** (o prompt interno como "Você" no #geral) ainda está neste build; já está corrigido no tree da v1.1.

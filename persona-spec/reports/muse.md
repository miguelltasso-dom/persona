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

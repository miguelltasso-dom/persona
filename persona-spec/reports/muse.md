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

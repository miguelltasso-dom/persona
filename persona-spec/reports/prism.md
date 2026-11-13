# Prism — relatos (mais recente no topo)



## 2026-11-12 22:45 - D-122 componentes em preparacao

- `responsible/WhereWorksField.tsx`: seletor opcional do computador independente do publico da persona; `locale-sources/hire.{pt,en}.json` e `src/client/locale/hire/locales.ts`: textos provisorios. `responsible/MoveTeam.tsx`: lote sequencial por callback, parada apos chamada corrente, recusas e resultado incerto, confirmacao de casa antes de mostrar estado ativo; ainda sem montagem, sem chamadas reais e sem selecao de equipe/destino no app.
- `where-works.client.spec.tsx`: 13/13 passou. `move-team.client.spec.tsx`: 2/2 passou (a primeira execucao falhou por erro no adaptador de locale do teste; corrigido). `check-pkg client-ui-persona`: OK in 79.5s. Bundle client exit 0. Boot anterior ao lote: bootstrap gate OK, console errors (0); boot apos lote em curso.
- Nao ha importadores de WhereWorksField, MovePersonaDialog, WhereRunsCard e ComputersPanel. Meu espaco aguarda desenho Muse; canal pessoal deve nascer no projeto pessoal, nao em projeto compartilhado (Keel 22:42). A montagem, acesso aos Remotes e prova no fluxo real permanecem pendentes. Build:check agregado nao executado.

## 2026-11-12 22:14 - W4 casa: bundle e boot final

- Sincronizei `src/client/locale/onboarding/locales.ts` com `locale-sources/onboarding.pt.json`. O relato abaixo lista os arquivos da escolha e instrucao. Copy final pt/en da Muse pendente.
- `node scripts/persona/with-lock.mjs "Prism W4 locale e bundle" --exclusive -- ...`: exit 0, bundle concluido em 23,755 s. `node scripts/persona/with-lock.mjs "Prism W4 ui boot" --lock build -- node scripts/persona/ui-boot-check.mjs`: exit 0, bootstrap gate OK (visible: Atlas), console errors (0). Capturas: `.maestri/tmp/shots/persona-light.png` e `persona-dark.png`. Teste 1/1 e check-pkg OK registrados abaixo, sem repeticao.
- Pendente: copy e aceite da Muse; o gate capturou a pergunta inicial, nao os dois caminhos. `build:artifacts` e `build:check` agregado nao executados nesta retomada.

## 2026-11-12 22:04 — W4 casa da equipe (em validação)

- Primeiro uso: `OnboardingWizard.tsx` e `OnboardingShellOverlay.tsx` perguntam se este computador será a casa; Sim segue o onboarding com sugestão de computador 24 h, Não mostra instrução e permite voltar. Textos provisórios em `locale-sources/onboarding.{pt,en}.json`; cartão da Estação com texto de casa/clientes em `locale-sources/station.{pt,en}.json`, dicionários gerados. Sem mudanças no host ou Remote. Princípio RCD: caminho curto até o primeiro valor.
- `computer-home-onboarding.client.spec.tsx`: vitest **1 arquivo, 1 teste passou**. `check-pkg client-ui-persona`: **OK in 62.3s**. Bundle passou e `ui-boot-check` abriu o app claro/escuro, **bootstrap gate OK; console errors (0)**. A captura revelou caracteres corrompidos na copy provisória; fontes e dicionários corrigidos depois do teste. Bundle e captura finais em andamento. Textos finais da Muse pendentes.

## 2026-11-07 17:15 — LIB 6c (`1688d21b`): cena "Aguardando você" no escuro DISPENSADA (ordem do Keel, opção C); STANDBY
- Não capturei a cena no shell real. O host roteirizado só devolve "Descansando" e o stub de CLI não consegue perguntar (D-079 (b) segue `it.todo`), então nenhuma persona entra em "aguardando" ali. Nada rodou no lib 6c.
- A prova da tinta do âmbar no escuro é a galeria `prism-strip-waiting-ink` (6 capturas, 0 com estouro/axe/erro; log `.maestri/tmp/prism/gallery-ink.log`) + `team-strip-waiting-ink.client.spec.tsx` + `find-bad-css` limpo. Se o estado aparecer de verdade na tentativa 4 do TEAM-10 ou na varredura do instalado, a Muse vê lá.
- Pendências só se o Keel chamar: olhos de UI no transcrito da tentativa 3, modo estreito da faixa com o rosto dentro da etiqueta (v1.2), aplicar os pacotes em staging após o corte.

## 2026-11-07 15:55 — LIB 6b e 6c: faixa (Atlas) e tinta do âmbar no escuro; STANDBY (ordem do Keel, cota)

- **Estado exato (nada pela metade, nenhum job meu rodando):** tudo o que o Keel aprovou por escrito está no tree e provado; o resto está em STAGING fora de `src`. Parado em STANDBY desde 15:50 (Keel 15:40, cota do Claude): só tarefa fechada que o Keel chamar.
- **6b (lib `2f57e66c`, Quill 15:32):** já leva o meu 2º degrau da faixa (aplicado 15:09, "ok Prism 6b faixa"): a ≤ 100 px por membro o bastão do Gestor cede o lugar ao nome e o ⋯ encosta. Recapturei só a cena `faixa-equipe` no shell real (`--lock build --priority`, sem rebuild, `.maestri/tmp/shots/prism-shell-b6b/`, manifesto `.maestri/tmp/prism/manifests/prism-bundle6b-faixa.json`): **pré-aceite 6/6**, console 0, nenhum cartão aberto; a 200% (caixa de 94 px) o Atlas aparece inteiro (etiqueta 75 px), os 5 só com nome + ponto, 0 sobreposição, 0 fora da caixa. Enviado à Muse (15:51) para ela fechar o "Atl…".
- **Achado de contraste no ESCURO, já no lib 6** (só o staging do modo estreito o mostrou, porque nele a sombra do chão não impede o cálculo do axe): quem está "Aguardando você" leva o NOME e o ⋯ em creme (`#f6eee0`) sobre o âmbar (`#e8af54`): 1,7:1 (mínimo 4,5:1; axe `color-contrast`, serious). As cenas aceitas tinham todos "Descansando". Conserto = 1 bloco de CSS (`.member[data-state='waiting'] .tagName, .tagMore { color: var(--persona-accent-ink) }` + hover do ⋯), a MESMA tinta que o estado em texto já usava (≥ 7:1). **OK do Keel 15:41 ("ok Prism 6c tinta") e da Muse (15:45): NO TREE 15:50 para o lib 6c** (o 6b já estava montado): `apply.mjs` OK, `find-bad-css` `[]`, 5 specs da faixa 22/22 (novo `team-strip-waiting-ink` 3, com a CONTA dos contrastes da paleta de verdade), `check-pkg client-ui-persona` OK (81 s). Prova em Chrome real: no modo estreito a violação `color-contrast` x4 some (0) e a imagem mostra o "Sol ⋯" escuro sobre o âmbar (`.maestri/tmp/shots/prism-strip-narrow-gallery/faixa-estreita-escuro-960x640.png`; a galeria `.maestri/tmp/shots/prism-gallery/faixa-equipe-estreita-dark-*.png` já sai com a tinta nova, porque lê o `src`). Falta (quando o Keel chamar): a cena "Aguardando você" no escuro NO SHELL REAL no lib 6c, que a Muse quer ver; precisa de uma persona em "aguardando" no host do roteiro.
- **MODO ESTREITO da faixa (v1.2) em STAGING** (`.maestri/staging/prism-strip-narrow/`: `lib.mjs`, `prepare.mjs`, `apply.mjs --check` OK, `check.mjs` tsc OK, teste `team-strip-narrow` 10/10, galeria em Chrome real `.maestri/tmp/shots/prism-strip-narrow-gallery/`): abaixo de 500 px (medida da PRÓPRIA faixa por `ResizeObserver` → `data-narrow`, não da janela: uma regra `@container` não estiliza o próprio container) a cena some, a faixa vira um cartão liso e ficam rostos de 32 px em fila, cada um com a etiqueta, em caixas de 96 px que QUEBRAM em linhas: 0 sobreposição e nenhum nome cortado de 460 a 360 px com 4 e 5 pessoas. **Feedback da Muse (15:45):** bom no princípio, mas ela prefere o rosto DENTRO da etiqueta (28 px à esquerda do nome, como no chip "Quem responde": um objeto por pessoa, sem o quadrado solto em cima). Refaço assim na v1.2, "sem pressa".
- **Notas da versão** (`persona-spec/RELEASE-NOTES-v1.1.md`): a linha "Nomes na faixa da equipe em janela estreita" já está sem a frase do Gestor (pedido da Muse 15:14). Se a tinta do âmbar não entrar no 6c, nenhuma linha minha precisa mudar (era um defeito, não um recurso).
- **Pendências para quando o Keel me chamar:** (1) cena "Aguardando você" no escuro no shell real do lib 6c + recaptura da faixa se o 6c mudar algo nela; (2) olhos de UI no transcrito da tentativa 3 do TEAM-10 (Keel 15:08); (3) refazer o modo estreito com o rosto dentro da etiqueta (v1.2); (4) aplicar os 3 pacotes de staging da v1.2 (Ctrl K, P1-22, C5b) depois do corte e com o OK do Keel; todos com `apply --check` OK no tree de 15:55 (Ctrl K, P1-22, C5b e modo estreito conferidos agora).

## 2026-11-07 15:05 — LIB 6 (candidato `7bd08b15`): captura no shell real, notas da versão, C5b e o 2º degrau da faixa em staging

- **Captura do lib 6 no shell real** (sem rebuild, trava `build` em FIFO como o Keel pediu, `.maestri/tmp/shots/prism-shell-b6/`, régua `.maestri/tmp/prism/shell-shots.mjs`): só o que a Muse pediu às 14:15. Cenas: `geral`, `cartao-persona-hover`, `cartao-persona-menu`, `cartao-persona-rolado` (nova: o meio rolado até o fim, com Modelo e "Este motor não informa a cota.", topo e campo fixos), `limites-canal` (nova: o texto no /limites do canal), `faixa-equipe` (nova). **Pré-aceite do Ember: 36/36 PASSOU, 6/6 cenas prontas** (axe 0, console 0, a checagem `dialogo` mede o cartão e passou nos 3 tamanhos). Medido no shell real: cartão = janela − 16 px (884/624/344), "Enviar" dentro da janela, meio rola, topo no lugar; o /limites diz a frase nova. Manifesto fora de `scripts/**` (congelamento 14:35): `.maestri/tmp/prism/manifests/prism-bundle6b.json`.
- **Faixa da equipe no shell real** (medida pela própria régua, `faixa-equipe`): a 1440 e a 960 as etiquetas ficam inteiras (caixa do membro 152–158 px) e a 200% só nome + ponto (caixa de 94 px); 0 sobreposição e 0 etiqueta fora da caixa nos 3 tamanhos. **Achado honesto:** a 200% com 5 pessoas o nome do **Atlas** (o Gestor, que leva o ícone do bastão) fica com reticências; Bento, Nina, Sol e Luna inteiros. Duas falhas MINHAS de roteiro na 1ª recaptura da cena (a 200% a faixa rolada para o topo mostrava só o cabeçalho; o mouse parado em cima de um rosto abriu o cartão no 960): roteiro corrigido (rola até a fileira das etiquetas, afasta o mouse, fecha o cartão) e a cena está recapturando na fila da trava.
- **2º degrau da faixa em STAGING** (`.maestri/staging/prism-strip-tier2/`: `lib.mjs`, `prepare.mjs`, `apply.mjs --check` OK, teste `team-strip-tier2` 3/3, galeria em Chrome real): a ≤ 100 px por membro o ícone do Gestor cede o lugar ao nome, o ⋯ encosta mais (segue com 24 px) e a etiqueta perde 2 px de cada lado. Medido: o Atlas deixa de ficar cortado em 460 px com 4 e 5 pessoas (e no caso real de 94 px); só nomes em larguras absurdas (≤ 77 px) seguem com reticências. **Só entra com o OK ESCRITO do Keel** (congelamento 14:52) e se a Muse reprovar o "Atl…" a 200%.
- **C5b em STAGING** (`.maestri/staging/prism-c5b/`, v1.2, Keel 12:45): a ficha da tarefa que expande no lugar (flag `taskCardInline`, DESLIGADA; sem ela ou sem o cartão no quadro a ficha é a de hoje, byte a byte). Modelo puro `task-card-model` (estado único por cartão: parou > pronto > precisa de você > revisando > esperando > fazendo > na fila, com o vocabulário e as cores do cartão do plano), provedor + hook, `TaskCardInline` (o título é o botão que expande, grid 0fr→1fr, `prefers-reduced-motion` sem animação, rosto, "com {colegas}", quem revisa, assunto, prazo, pergunta aberta), fiação no `MessageRow` (canal e DM) e nos conectados (invólucro `…Body`), 9 chaves `taskCard.*`. Prova: 30 testes isolados (modelo 10, ficha 13, fiação 7 com o canal conectado de verdade), tsc do staging OK, `apply --check` OK, galeria em Chrome real 24/24 sem estouro nem axe (`.maestri/tmp/shots/prism-c5b-gallery/`). Os 3 pacotes de staging (Ctrl K, P1-22, C5b) seguem aplicáveis no tree de hoje.
- **Notas da versão** (Keel 14:47, `persona-spec/RELEASE-NOTES-v1.1.md`): só as linhas da minha área, em português para a pessoa. Novidades: Cartão da persona e faixa da equipe (reescrita), Equipe › Personas, o pedido vira um plano vivo na conversa, Resumir o dia, Pergunta à parte e resumo da conversa, Permissões e ações na conversa, Conversas diretas em janela estreita, Aparência (reescrita). Limites conhecidos: cartão em janela baixa, nomes na faixa em janela estreita, pergunta à parte/resumo só 10 min depois de recarregar, resumo do dia pausado. Conferi no código antes de escrever (janela de 10 min do `/lado`, o "Retomar" do resumo pausado só existe se o host o aceita).
- **Congelamento 14:52:** nenhum save em client `src` meu sem o OK escrito do Keel. Nada pendente nem pela metade.

## 2026-11-07 13:45 — BUNDLE 6 (devolvido pela Muse e pelo Keel): cartão da persona, faixa da equipe e texto da cota, NO TREE

**Contexto.** Retomada (Atlas, 12:05). Bundle 5 = lib `d8109efa…` (Quill, 12:30). Minha captura final no bundle 5 (sem rebuild, `--lock build --priority`, `.maestri/tmp/shots/prism-shell-b5/`, manifesto `scripts/persona/preaccept-manifests/prism-bundle5.json`): axe 0 nas 126 execuções, console limpo, pré-aceite 17/19. A Muse ACEITOU as 17 (Aparência, Equipe › Personas, Resumir o dia, /resumo e /lado, #geral, DM, Conexões). O cartão da persona (hover e menu) reprovou com razão na checagem nova `dialogo` (o campo de mensagem e o Enviar ficavam abaixo da dobra) e volta no bundle 6. Nota: na recarga da cena escura a linha do tempo do tema veio lenta uma vez (`source=system` por 1,3 s antes de `dark`, máquina carregada pelas capturas dos outros; no escuro o "sistema" já é escuro, sem piscar); o claro, que é o caso visível, saiu limpo (100 ms / 423 ms), como no bundle 4.

**(a) Cartão da persona** (`primitives/PersonaCard.tsx` + `.module.css`; forma da Muse 13:04): topo FIXO (pose, nome, papéis, "agora"), MEIO que ROLA (Quem pode falar … Modelo e cota), campo de mensagem + Enviar FIXOS embaixo, altura máxima = janela − 16 px. `NowLine` e `FactsDetails` saíram de `PersonaCardFacts` (que segue desenhando tudo junto no perfil, `layout="wide"`, mesma árvore); o cartão virou `article > [.scroll > (.head: banner + ⋯ + identidade + "agora") + (.body: o resto dos fatos)] + .dock`. CSS: `.popover` é flex coluna com `max-height: calc(100dvh - 16px)` e sem rolagem própria; só `.scroll` rola; `.head` é `position: sticky` com fundo opaco e linha fina; `.dock` é `flex: none`; em janela ≤ 600 px (o zoom 200% é 360 px) o topo fica estático e rola junto, o banner encolhe a 72 px e o rodapé fica mais justo (com o topo fixo não sobraria meio para rolar). Posição (`PersonaCardPopover`): folga vertical 8 px; abre para baixo (começa 24 px acima do rosto) e, sem espaço abaixo do rosto, abre PARA CIMA (termina 24 px abaixo dele); nunca sai da janela. Testes: `persona-card-dock` (novo, 7), `persona-card-keyboard-fit` (+4 de posição; a folga de 12 passou a 8 px).

**(b) Faixa da equipe** (`team/TeamChannelStrip.tsx` + `.module.css`; achado 1 da Muse 12:39). Causa: a `.tag` tinha `max-width: 100%` mas content-box (27 px a mais de padding e borda) e o estado `nowrap` ficava maior que a caixa do membro, que encolhe com a faixa; as etiquetas se invadiam e o texto sumia debaixo da vizinha. Correção: o membro é um container (`container: persona-member / inline-size`), a etiqueta é border-box e fica DENTRO da caixa, nome e estado terminam em reticências (o ⋯ e o ícone do Gestor são `flex: none`: o corte é no texto, nunca no controle); `@container persona-member (max-width: 144px)`: só o nome e o ponto de estado, o texto do estado sai da vista mas continua para o leitor de tela (técnica sr-only, nunca `display: none`) e o `title` da etiqueta diz "nome · estado". O limiar vem da etiqueta mais larga medida (Aguardando você ≈ 137 px). `team-strip-labels` (novo, 7).

**(c) Texto da cota** (achado 2): `composer.limitsUnavailable` (chat) e `card.quotaUnavailable` (profile) → "Este motor não informa a cota." / "This engine doesn't report its quota." (4 JSON de `locale-sources` + `gen-client-ui-persona-locales`). Grep ANTES: `packages/persona` (inclui `persona-e2e`), `scripts`, `apps`, `packages` (fora do cliente), `.maestri` (scripts e json) e `docs`: só 2 specs do cliente usavam o texto (`persona-card.client.spec` 1 seletor, `engine-limits.client.spec` 3; atualizados) e 4 comentários. Ficam com o texto antigo só as specs de design da Muse (`design/PERSONA-CARD-SPEC.md:37`, `design/UX-BEYOND-T3.md:61,342`), que são dela.

**Prova.**
- Galeria em Chrome real (`scripts/persona/prism-accept-gallery.mjs`, estados novos `faixa-equipe-estreita`, `cartao-persona-rodape`, `-baixo`, `-rolado`; claro/escuro × 1440/960/200% = 24 capturas, axe 0, 0 erro de console; a própria página MEDE):
  - faixa: 0 sobreposições e 0 etiquetas fora da caixa do membro em caixas de 1100/900/592/460/360 px com 4 e 5 membros (inclui Precisa de ajuda, Num rascunho, Aguardando você); o texto do estado nunca cortou no meio (`statusTruncated` vazio em todas as medidas); com ≥ 145 px por membro a etiqueta inteira; a 99 px por membro (460 px, 4 membros, o caso da Muse) nome + ponto; nome com reticências só com 5 membros em ≤ 460 px (77 px por membro).
  - cartão: altura = janela − 16 px (884 / 624 / 344), o Enviar dentro da janela (837–869 / 577–609 / 301–333), o meio rola e o topo fica no lugar nas janelas > 600 px; pré-aceite do Ember com `scripts/persona/preaccept-manifests/prism-gallery-b6.json`: 24/24, a checagem `dialogo` mede o cartão (`cut: []`). Pasta `.maestri/tmp/shots/prism-gallery/` (`faixa-equipe-estreita-*`, `cartao-persona-rodape*-*`).
- Specs: 9 arquivos / 76 testes verdes; `check-pkg client-ui-persona` OK (99 s); `find-bad-css` `[]`.
- Suíte inteira do pacote (13:20): 359/367 arquivos, 2676/2692 testes; os 8 vermelhos eram edições em andamento de outros donos (`review/KanbanReviewSheet.tsx` com uma chave sobrando às 13:26; `hostSubjectId` do `working-control` enquanto `use-connected-*` mudavam às 13:30); reexecutados às 13:37: 8 arquivos / 116 verdes.

**Limitações honestas.** (1) São os BICHOS, não as etiquetas: abaixo de ~500 px as figuras se sobrepõem entre si e a primeira/última é cortada pela borda da cena (já era assim); o selo de estado da última figura encosta na borda direita com 5 membros em ~900 px. Não mexi (a regra da Muse é das etiquetas). (2) O banner do cartão encolhe a 72 px em janela ≤ 600 px: decisão minha para o zoom 200%, a Muse confirma. (3) As capturas do shell real com o cartão novo só valem no lib do bundle 6 (hoje o lib é o do bundle 5). (4) A recarga escura lenta do Contexto foi uma só (a seguinte, na mesma rodada e sem o espelho, saiu em 59 ms / 337 ms com `source=dark` desde o 1º quadro); não a repeti isolada.

**Arquivos tocados:** `primitives/PersonaCard.tsx`, `primitives/PersonaCard.module.css`, `team/TeamChannelStrip.tsx`, `team/TeamChannelStrip.module.css`, `locale-sources/{chat,profile}.{pt,en}.json` + os `locale/*/locales.ts` gerados, comentários em `chat/{ChannelComposer,ComposerLimitsPanel,TurnContextDrawer}.tsx` e `remote/engine-limits.ts`, testes `team-strip-labels`, `persona-card-dock` (novos), `persona-card`, `persona-card-keyboard-fit`, `engine-limits`; `scripts/persona/prism-accept-gallery.mjs`, `scripts/persona/prism-accept-gallery/entry.tsx`, `scripts/persona/preaccept-manifests/{prism-bundle5,prism-gallery-b6}.json`.

**Próximo:** C5b em staging (Keel 12:45: só a expansão inline da ficha do cartão de tarefa, com apply `--check`, vai à v1.2); prioridade máxima segue sendo o que a Muse devolver.

## 2026-11-05 06:35 — PAUSA TOTAL (ordem do Miguel via Atlas; cota semanal em 85%). Estado exato

- **Feito e aceito:** tudo o que me foi atribuído para o v1.1 (bundle 4 aceito pela Muse, pré-aceite 108/108). Nenhum item meu pendente no bundle 5.
- **Pela metade:** nada. Não parei no meio de nenhuma edição. Não deixei processo em segundo plano nem job de IA real.
- **Em `packages/persona/*/src`:** nenhuma mudança minha desde o fim do bundle 4. Tudo da v1.2 está em STAGING, fora de `src`.
- **Staging pronto, esperando a v1.2 abrir:**
  - `.maestri/tmp/prism/staging-cmdk/` — Ctrl K sobreposto (flag `cmdKOverlay`, padrão desligado), revisado e APROVADO pelo Lumen (4 ajustes feitos). 63 testes + tsc + `apply.mjs --check` OK. README com decisões e perguntas para a Muse.
  - `.maestri/tmp/prism/staging-p1-22/` — Atalhos no Ctrl K e no rodapé (flag `shortcutsScreen`). `apply.mjs --check` OK.
- **Próximos passos (só quando o Atlas chamar):** (1) aplicar `staging-p1-22/apply.mjs` e `staging-cmdk/apply.mjs` depois do corte do v1.1, rodar gen-locales, vitest dos specs cmdk/search-goto/nav-places/flags-defaults, check-pkg e find-bad-css; (2) linha `cmdKOverlay` (OFF, v1.2) em `persona-spec/contracts/flags-defaults.md` (doc do Flint); (3) cena de captura da janela com o pré-aceite (checagem `dialogo`); (4) perguntas do README para a Muse.
- **Arquivos tocados nesta sessão (todos fora de `src`):** `.maestri/tmp/prism/staging-cmdk/**`, `persona-spec/reports/prism.md`.

## 2026-11-05 06:30 — v1.2 em STAGING (fora de src): Ctrl K sobreposto e P1-22; Prism em ESPERA (Atlas)

- Nada novo em `packages/persona/*/src` (regra do bundle 5: só correções da Muse/Keel). Nenhum item meu pendente no bundle 5.
- **Ctrl K sobreposto** (CMDK-OVERLAY-SPEC + IV-10, com recentes e números 1–9), flag `persona.flag.cmdKOverlay` (padrão desligado; desligada = `selectPanel('search')` como hoje): `.maestri/tmp/prism/staging-cmdk/` (README com decisões e perguntas para a Muse). Prova sem tocar em src: 61 testes em 4 arquivos (runner isolado), tsc com as opções do check-pkg do cliente OK, `apply.mjs --check` OK. Desvios para o Lumen revisar: registro em `register-prism-screens.tsx` (não em `mount.ts`); largura 640; dígito puro só com o campo vazio (Alt/Ctrl/Cmd+dígito sempre); "Ver todos os resultados" não leva o texto para a tela Buscar.
- **Revisão do Lumen (06:23): aprovado com 4 ajustes, feitos no staging:** (1) o item agora diz "Ver todos os resultados" sem o texto (a tela Buscar abre vazia); (2) o botão de fechar tem nome acessível "Fechar (Esc)" / "Close (Esc)"; (3) com outro diálogo aberto o atalho engole a tecla (o atalho antigo não roda por trás do modal); (4) com texto no campo a linha de teclas e a tecla de cada item passam a "Alt+1–9" / "Alt+N". Prova: 63 testes (4 arquivos), tsc OK, `apply.mjs --check` OK.
- **P1-22** (Atalhos no Ctrl K e no rodapé, flag `shortcutsScreen`): `.maestri/tmp/prism/staging-p1-22/` (`apply.mjs --check` OK).
- **Aplicar quando a v1.2 abrir:** `node .maestri/tmp/prism/staging-p1-22/apply.mjs` e `node .maestri/tmp/prism/staging-cmdk/apply.mjs`, depois os comandos que eles imprimem (gen-locales, vitest, check-pkg, find-bad-css); depois, a linha `cmdKOverlay` (OFF, v1.2) em `persona-spec/contracts/flags-defaults.md` (doc do Flint) e a captura da janela (cena nova do pré-aceite, com a checagem `dialogo`).

## 2026-11-05 05:50 — ACEITES da Muse no bundle 4 (shell real, pré-aceite 108/108, hash 9f9964b1)

- ACEITE Muse: TH-1 Configurações › Aparência (as 3 miniaturas, a troca ao vivo, "Sistema" segue o Windows, os 3 cartões empilhados a 960/200 %, claro/escuro × 1440/960/200 %, axe 0; a escolha fica no Config do usuário e sobrevive a recarregar, com e sem o espelho local)
- ACEITE Muse: Equipe › Personas (a grade com a pose do estado, "Quem cuida", "Contratar persona"; "Membros e convites" só em Configurações › Membros)
- ACEITE Muse: Resumir o dia (o botão ao lado de "Nova tarefa" e o aviso "Ainda não há o que resumir hoje."; o caminho `posted` e o "Resumo do dia · {hora}" sem o spot aceitos pela galeria + teste, porque o host de teste não tem o que resumir)
- ACEITE Muse: IV-6 `/resumo` e `/lado` (o vazio honesto da DM, "Ainda não há conversa para resumir.", sem "Tentar de novo")
- Lote: `.maestri/tmp/shots/prism-shell-b4/` (manifesto `scripts/persona/preaccept-manifests/prism-bundle4.json`) e galeria `.maestri/tmp/shots/prism-gallery/` (`prism-gallery.json`, 36/36). Lições da rodada: (1) a sonda antiga do pré-aceite deixava anel de foco falso nas capturas seguintes da mesma página (o Ember corrigiu; recapturei tudo); (2) leitura OPCIONAL no Playwright sem `timeout` espera 30 s (o aviso de 8 s sumia antes da foto: era o meu script, não o produto); (3) cena que força o tema leva o tema efetivo no nome do arquivo; (4) o `build-assets` limpava `client/assets` (a Muse corrigiu; o `personaFaceSrc` mora em `hire/`).

## 2026-11-05 03:55 — Equipe › Personas (a lista de cartões; decisão do Keel 03:33 + forma da Muse 03:34), no tree para o bundle 4

**O achado 3 da captura virou tela:** com a navegação por lugares (padrão), Equipe › Personas (`panel 'team'`) agora abre a LISTA de personas e não "Membros e convites" (que fica só em Configurações › Membros, a chave `members`); com a navegação antiga (flag desligada) o item "Equipe" segue abrindo Membros (`register-prism-screens.tsx` escolhe pelo `isPlacesNavEnabled()`). `team/personas-roster.ts` (`buildRoster`: junta o time do host com o estado vivo, a tarefa atual e a fila do "Agora", e "Quem cuida" do organograma por pessoa; `rosterPriority`/`orderRosterIds`), `team/PersonasTeamPanel.tsx/.module.css` (grade `auto-fill` com `minmax(min(100%, 280px), 1fr)`: 3 colunas a 1440, 2 a 960 com o rail, 1 a 200 %; cartão = rosto 96 com a POSE do estado, nome, função, o chip do estado em palavras, "Fila: n"/"Fila vazia", a tarefa ou "Sem tarefa agora" e "Quem cuida: {nome}"; o clique abre o perfil; primário "Contratar persona" no topo; vazio "Sua equipe ainda está vazia" com "Contratar persona" e a arte `empty-equipe-remota`; carregando = esqueleto `aria-busy`, nunca o vazio), `remote/ConnectedPersonasTeamPanel.tsx` (dados vivos + `getOrgChart` por pessoa; qualquer falha do organograma só tira a linha "Quem cuida"). ORDEM (Muse 03:51, ajustada): Coordenação → Precisa de ajuda → Aguardando você → Trabalhando → o resto por nome (pt-BR), cada grupo por nome, calculada ao ABRIR a aba e SEM reordenar ao vivo (quem precisa de ajuda não fica atrás de quem só descansa) (o estado muda no lugar; persona nova entra no fim; a que saiu some). Chaves `team.personas.*` em `shell` pt/en. `personas-team-panel.client.spec` 22 testes (ordem, prioridade, buildRoster, painel, ordem congelada, vazio, esqueleto, en, conectado com organograma ok e falhando, aba e CSS); vizinhos (nav-places, house-decor, daily-now, aside-asks) 120 verdes; `check-pkg` OK; 0 CSS inválido; galeria `equipe-personas` e `equipe-personas-vazio` × claro/escuro × 1440/960/200 % = 12 capturas, axe 0, sem overflow. Falta: o shell real no bundle 4 (cena `personas-lista` do `shell-shots`).

**Título do cartão pelo TIPO do motor (Tally 03:21, lido às 04:13; `contracts/morning-brief.md` "Dois cartões"), no tree 04:17:** `DailyBriefWire`/`DailyBriefUi` ganham `variant?: 'morning' | 'on-demand'` (`mapDailyBrief` o lê, valor desconhecido é ignorado); o `DailyBriefCard` decide por `dailyBriefShowsLate`: o TIPO manda nos dois sentidos ("Resumo do dia · {hora}" sem o spot para `on-demand`; "Bom dia · {dia}" com o spot para `morning`, mesmo postado às 16:40); a hora do cartão só dá o "{hora}" e, SEM o tipo (o host ainda não emite o campo: só o motor tem `briefVariant`), a RESERVA é a hora em que foi postado (≥ 12:00 = on-demand, a mesma regra do motor; a rotina da manhã nunca posta depois do meio-dia); `on-demand` sem a hora do cartão = só "Resumo do dia" (`daily.eyebrowNoTime`). `daily-now` 37 testes. Pedido ao Anvil/Bolt para ligarem `variant` em `MessageView.dailyBrief`. Não importei `briefTitle` do motor (o cliente não depende do pacote; as frases moram nas chaves).

**Respostas da Muse (03:51) aplicadas às 03:55:** sem "Em pausa" (sem dado do host não se mostra); `empty-equipe-remota` no vazio: ok; a falha técnica do "Resumir o dia" ("Não consegui pedir o resumo agora. Tente de novo.") está boa para erro de rede e ganhou a ação "Tentar de novo" no Toast (`daily.retry`; só a falha a oferece; `DAILY_NOW_FAILED`); a ordem passou a Coordenação → Precisa de ajuda → Aguardando você → Trabalhando → o resto (`rosterPriority` 0..4). `daily-now` 34 e `personas-team-panel` 22 testes verdes (56 nos dois).

**Também no 03:40:** o `OverviewView` só embrulha os botões do cabeçalho quando há "Resumir o dia" (sem o handler o "Nova tarefa" segue filho direto do `<header>`: o teste de ordem da `house-decor` pegou a regressão que o meu invólucro causou); suíte inteira do pacote 357 arquivos / 2608 testes depois disso (o único vermelho era esse).

## 2026-11-05 03:35 — Captura do bundle 3 (hash 08ed3711): achados, TH-1 corrigido, "Resumir o dia" no tree

**Captura (`.maestri/tmp/shots/prism-shell/`; 1ª rodada em `report-run1-bundle3.txt`, 2ª, só os passos refeitos, em `report.txt`):** Conexões axe 0 em claro e escuro × 1440/960/200 % (`progressbar=1`, `meter=0`: a troca do Quill vale); /lado e /resumo no canal OK (o cartão "Resumo da conversa" sem o prompt interno, axe 0); cartão da persona por hover de 700 ms e Esc, rosto abre a DM, rail com espera do carregamento (o #geral já sai carregado); a aba Aparência abre com Sistema marcado e `data-theme-persistence=config`. A 1ª rodada falhou em vários passos por culpa do MEU script (com as flags ligadas por padrão o rail é o novo: "Canais" é um grupo recolhido, o composer da DM diz "Mensagem em Geral para {nome}…"); corrigido (`openChannel`/`openDm`, `PRISM_SKIP` para refazer só o que mudou).

**Achado 1, BUG REAL do TH-1 (só o shell real mostrou):** neste perfil o `ThemePresenter` do host não escreve no DOM; escolher "Escuro" gravava a preferência no Config e o `html[data-ds-theme-source]` seguia `system` (só parecia certo com o Windows no escuro). O teste de unidade imitava o presenter e escondia o bug. CORRIGIDO (`theme/theme-preference.ts`): a ponte aplica a escolha no DOM por conta própria (`write`) e `installThemeSync` (ex-`installThemeMirrorSync`, ligado no `mount.ts`) aplica toda troca do host, inclusive a que chega do Config depois da abertura; 4 testes SEM presenter que falham sem a correção (conferido); `appearance-settings` 43. Precisa do bundle 4 para a Muse ver a troca ao vivo.

**Achado 2, /resumo numa conversa vazia (DM nova):** o host recusa com a falha TIPADA `invalid-payload` ("Ainda não há conversa para resumir.") e o cartão mostrava "Não consegui responder agora. Tente de novo. [Tentar de novo]", o que mente (tentar de novo não resolve). CORRIGIDO: `isNothingToSummarize` lê o CÓDIGO (nunca o texto), o item vira `error: 'empty'` e o cartão diz "Ainda não há conversa para resumir." sem o botão (chave `aside.error.empty` pt/en); só o `/resumo` (a pergunta à parte nunca vira `empty`); `aside-asks` 31.

**Achado 3, PARA DECIDIR (Keel/Muse):** com as flags ligadas, Equipe › **Personas** (`panel: 'team'`) abre "Membros e convites" (`RemoteMembersPanel`, EMPRESA), o mesmo conteúdo de Configurações › Membros, e não a lista de personas. Foto: `light-1440-lugar-equipe-abas.png`. A NAV-SPEC manda "Personas · Quem cuida de quem · Saúde" com as telas atuais, mas a atual do `team` é Membros. Opções: (a) a aba Personas mostrar a lista de personas (cartões, com "Contratar persona"); (b) renomear/mover Membros. Eu faço o que decidirem.

**"Resumir o dia" (Keel 03:11 + Muse 03:12/03:15, `EQUIPE-REAL-SPEC §(b) O resumo a pedido`; Remote `postDailyBriefNow` do Bolt), no tree, vai no bundle 4:** `overview/daily-now.ts` (`planDailyNow`, função pura: `posted` → ir ao #geral e o cartão pisca 1×, SEM Toast; `already` → "O resumo de hoje já está no #geral · Ver"; `nothing-to-say` → "Ainda não há o que resumir hoje."; `off` → "O resumo do dia está pausado." (+ Retomar SÓ se o host aceitar; hoje sem ação); `no-coordination` → "Para resumir o dia, a equipe precisa de uma Coordenação. · Ver a equipe"; `no-channel` → "O resumo aparece no #geral, que não está disponível agora."; outcome desconhecido ou pedido que falha → "Não consegui pedir o resumo agora. Tente de novo." (frase minha, a Muse deve conferir)), botão "Resumir o dia" (`secondary s`, ícone `bom-dia`, "Resumindo…" desabilitado durante a chamada) ao lado de "Nova tarefa" em `OverviewView` (só com o handler: `ConnectedOverviewView` o passa com `teamwork` ligada e o host com o pedido), `liveStore.postDailyBriefNow(requestId?)` (SEM `requestId` no clique normal = o cartão do dia, idempotente), `chat/message-focus.ts` (`requestMessageFocus` + `useMessageFocus` no `MessageList`: o pedido espera o cartão chegar pelo fio, rola e marca `data-focus-pulse`; o pisco é 1× no CSS do cartão, só o anel parado em reduced-motion), `DailyBriefCard` com `messageId` e o título que segue o momento (`dailyBriefMoment`: depois das 12:00, hora local, "Resumo do dia · {hora}", com o ícone e SEM o spot; `DailyBriefUi.postedAt` vem do `occurredAt`). Chaves `daily.*` em `shell` (botão, avisos, Ver/Retomar/Ver a equipe) e `daily.eyebrowLater` em `chat`. `daily-now.client.spec` 31 testes (plano por outcome, botão e avisos, foco da mensagem, título da tarde, método do liveStore); `check-pkg` OK; 0 CSS inválido; galeria `bom-dia`/`bom-dia-tarde` × claro/escuro × 1440/960/200 % axe 0.

## 2026-11-05 02:25 — TH-1 Configurações › Aparência (tema manual), IV-6 lendo o `kind` do host, `personaFaceSrc` salvo do build-assets

**TH-1 (Keel 01:33 + Muse 01:32, `design/APARENCIA-SPEC.md`), no tree, vai no bundle 3:** aba "Aparência" em Configurações entre Importadores e Sobre (`MainPanelId 'appearance'`, `nav-places.ts`; com a navegação por lugares desligada, item no grupo "Mais" de `nav-groups.ts`). `shell/AppearanceSettingsPanel.tsx/.module.css`: Tema Sistema/Claro/Escuro em 3 `ChoiceCards` (variante nova `preview` em `primitives/ChoiceCards`: miniatura em cima, 3 em linha, empilham a ≤ 1024 px, ou seja 960 e 200 %), cada miniatura 120 × 72 desenhada SÓ com tokens (a paleta ganhou o escopo `[data-persona-scheme='light'|'dark']` ao lado de `body[...]`: a miniatura "Claro" é clara dentro de uma janela escura; "Sistema" parte as duas na diagonal; a noite tem a luminária e 3 vaga-lumes; sem animação) + o Switch "Dicas de atalho" (ligado; `shell/shortcut-tips-preference.ts`, chave `persona.shortcutTips` = "0" desliga; quem mostrar a dica (Flint, P1-11) pergunta `isShortcutTipsEnabled()`). **Como o tema é guardado e aplicado:** `theme/theme-preference.ts` liga o painel ao `ThemeRuntime` do ui-theme (`ctx.get('theme')`, opcional: sem ele a ponte é local): `setTheme` GRAVA NO CONFIG DO USUÁRIO (settings scope) e publica `theme/change`; o `ThemePresenter` escreve `html[data-ds-theme-source]` e o `install-color-scheme` do INST-3 normaliza `body[data-ds-dark-theme]` AO VIVO (escuro = "true", claro = atributo REMOVIDO; `applyPersonaColorScheme` agora é idempotente para não reentrar no observador). **Na abertura sem flash:** o host já embute a preferência SALVA NO CONFIG no HTML antes do 1º quadro (`ui-theme/src/boot-theme.ts`: cor do canvas no `<head>` + `html[data-ds-theme-source]` + `body`); o Persona só completa (`applyStoredThemeEarly()` no começo do `apply` do plugin: a PRESENÇA `""` do boot vira o valor "true" que a paleta casa). O espelho `persona.theme` (localStorage) só existe para a galeria/prévia web e fica em dia por `installThemeMirrorSync`. **`PERSONA_THEME` continua vencendo:** `resolvePersonaDark(root, systemDark, forced)` e o observador do body refazem o forçado; o valor vem de `window.personaDesktop.forcedTheme`, que o DESKTOP ainda NÃO publica (pedido ao Keel: `additionalArguments: ['--persona-theme=…']` na janela + `parseThemeOverride(process.argv)` no `preload-app`); até lá o forçado só vale com a preferência em "Sistema" (o padrão), que é o caso das capturas. **Prova:** `appearance-settings.client.spec` 38 testes (cartões e frases pt/en, padrão Sistema, miniaturas, a troca muda o body nos 3 estados com o serviço de tema de mentira que imita o presenter, claro → escuro → sistema, troca vinda de fora, ponte local, grava no serviço + espelho, reabrir pinta certo, boot do host vence espelho velho, forçado, switch, aba na ordem e no grupo "Mais", CSS só tokens/sem animação/empilha); vizinhos `install-color-scheme` 12, `palette-dark-contrast` 13 (o `block()` agora aceita o seletor com o escopo), `nav-places`, `persona-face` 3: 90 verdes; suíte inteira do pacote 02:00 = 2492/2500 (os 8 vermelhos são do Flint/Ember, já tratados por eles); `check-pkg client-ui-persona` OK; 0 CSS inválido. **Galeria** `aparencia-sistema/-claro/-escuro` × claro/escuro × 1440/960/200 % = 18 capturas, axe 0, sem overflow, 0 erros (achado e corrigido nelas: o `.icon` base centrava a miniatura com `place-items: center`). **Falta:** a cena `aparencia` do `shell-shots` no shell real (troca ao vivo, recarregar com e sem o espelho = Config de verdade, com a linha do tempo do tema para ver qualquer piscada) na rodada pós-bundle 3.

**BR-P6 (Muse 01:43, ícones da equipe real + 2 spots; no tree 02:30):** o que é meu: o ícone `bom-dia` (`BrandIcon`, 16 px, `ink-soft`) SEMPRE ao lado do texto do eyebrow "Bom dia · {dia}" do `DailyBriefCard`; o `spot-bom-dia` (webp 96, exibido a 48) à direita do título, no grupo de ações do cabeçalho, antes do ⋯ e do recolher; o `spot-pedido-pronto` no cabeçalho do `DeliveryCard` ao lado de "Pronto: {pedido}". Os dois spots são decorativos (`alt=""` + `aria-hidden`; o nome acessível do cartão continua só o texto) e SÓ a partir de 960 px (`display: none` por padrão e `@media (min-width: 960px)`; a 200 % de 1440 = 720 px não aparecem). Só desenham se o asset existe no mapa. `br-p6-icons.client.spec` 7 testes (os 3 assets no mapa, ícone ao lado do texto, spots decorativos e no lugar, regra dos 960 px no CSS, nome acessível); `daily-brief` 29 e `team-plan-cards` 34 seguem verdes; `check-pkg` OK; 0 CSS inválido; galeria `bom-dia`/`entrega`/`plano-vivo` × claro/escuro × 1440/960/200 % = 18 capturas, axe 0, sem overflow. Os outros 11 ícones do mapa (passar-adiante, pedir-ajuda, ajudou, entregou, revisao, pediu-ajustes, opiniao, gostei, sugestao, atencao, caminho) são das telas de outros donos (linhas de passagem, opinião, Caminho): não toquei.

**IV-6 (LEAK-1):** o host agora marca `AsideAskView.kind: 'aside'|'summary'` e a `question` é o que a pessoa vê (Anvil/Bolt 01:36-01:38); o cliente lê o campo (`isSummaryView`: `kind` manda; o prefixo do prompt só vale com `kind` ausente, rede para o que foi guardado antes); `aside-asks` 27 testes.

**Achado de infraestrutura:** `scripts/persona/build-assets.mjs` limpava o diretório `client/assets` inteiro e apagou meu arquivo NÃO versionado `assets/persona-face.ts` (`personaFaceSrc`, D-069): o `check-pkg` ficou com 4 erros. Recriado em `hire/persona-face.ts` (fora do alcance do gerador), importadores e teste acertados; a Muse corrigiu o gerador (preserva `.ts/.tsx` à mão sob `assets/`).

## 2026-11-04 20:30 — INST-3 (tema manual), F5 contraste de Configurações, CV-2/CV-4/seleção (atrás da flag), capturas na fila

**INST-3 (P0 do hash final):** `theme/install-color-scheme.ts` agora (1) resolve o tema pela preferência FIXA do host (`html[data-ds-theme-source]` = `dark`/`light`) e, em "Sistema", pelo `prefers-color-scheme`; (2) normaliza por `MutationObserver` o `data-ds-dark-theme=""` que o `ThemePresenter` do host e o script de boot escrevem (presença) para `"true"` na hora; (3) refaz a resolução quando o `data-ds-theme-source` ou o Windows mudam, ao vivo; claro = atributo REMOVIDO. Devolve um desinstalador (só testes). `install-color-scheme.client.spec` 12 casos (7 novos: preferência fixa vence o sistema, boot deixa `""`, troca manual Escuro com Windows claro, troca manual Claro com Windows escuro, Sistema voltando a seguir o Windows e trocando ao vivo, 20 reescritas do host sem laço, desinstalador). Falta (depois do Setup): captura da troca manual no exe instalado. Origem do achado do INST-1: o leitor do Playwright (`connectOverCDP`) força `prefers-color-scheme: light`; provado por CDP cru (`cdp-scheme-probe.mjs` no scratchpad da sessão: cru=true, Playwright=false, `emulateMedia({colorScheme:null})`=true); o Rivet corrigiu o verificador.

**F5 Configurações (Gauge 20:18, color-contrast serious em `._desc`/`.settingDescription`):** as descrições do host pintam com `--dsw-alias-label-tertiary` (cinza do DS, `#81858c` no claro, 12 px); o Persona só mapeava `--dsw-alias-text-*`. `persona-palette.css` (aliases): `label-primary`=ink, `label-secondary`=ink-soft, `label-tertiary`=ink-soft (>= 5,5:1 no claro, >= 4,5:1 no escuro). Guarda em `palette-dark-contrast.client.spec` (+5 casos, 23 no arquivo + install). Re-run do F5 pelo Gauge fecha. Nota para a Muse: `--persona-ink-faint` no claro dá 4,22/4,37/3,74:1 sobre paper-sunken/wash/wash-strong (token dela; não mexi).

**DMs a 200% (Muse, BLOQUEADOR da varredura do H2 #3, WCAG 1.4.10):** `chat/DirectMessagesView.module.css`, no fim do arquivo: `@media (max-width: 760px)` com o layout em uma coluna (`minmax(0,1fr)`), linhas `minmax(0,40%) minmax(0,1fr)` (lista em cima, rolando; vazio/conversa embaixo) e a divisória da lista passando de direita para inferior; só CSS, vale com a flag desligada (o que vai no H3); o bloco da luz da luminária da Flint ficou intacto. Medido em Chrome real com o CSS do arquivo: 640×360 -> lista 640×144 e painel 640×216 (largura cheia, sem overflow de página); 760 empilha; 761/960/1440 seguem em duas colunas (272/272/320 px). Guarda `dm-reflow.client.spec` 3 testes; check-pkg OK.

**v1.1 (achado NÃO bloqueador da Muse, 20:42):** no caminho antigo (flag `persona.flag.navPlaces` desligada) o item "Equipe" (ORGANIZAÇÃO) abre "Membros e convites" (sobretítulo EMPRESA), o mesmo conteúdo de "Membros" em MAIS; com a flag ligada o lugar Equipe = as personas e isso já se resolve. Ação quando a flag virar padrão: trocar destino ou rótulo do item antigo (não entra no H3). Captura da Muse: `accept-installed/4b2c752b47-light/team-light-1440x900.png`.

**CAPTURA FINAL no shell real, bundle 2 (05/11 01:25, sem rebuild, `--lock build --priority`):** `.maestri/tmp/shots/prism-shell/` (157 arquivos + `report.txt`), claro/escuro × 1440/960/200% (640×360), host real com motor roteirizado: 150 execuções do axe = 0 violações, 0 overflow horizontal, 0 erro de console. Cenas: passo 5 (campo editável + 3 chips), Visão geral, #geral e faixa da equipe, cartão da persona por hover 700 ms (não abre aos 400; Esc fecha) e pelo ⋯ (CV-4), clique no rosto abre a DM sem cartão (CV-4), DM vazia e com conversa a 200% (lista em cima, conversa embaixo: @media 760), `/lado` no canal e na DM (IV-6: pensando e resposta, nenhuma linha no fio), Assistente de estrutura, e com a flag do A-1: trilho (1 canal + 5 DMs), cabeçalho do canal \"Toda a equipe · 5 personas\" com os rostos, cabeçalho da DM sem \"Quem responde\", abas dos lugares, Configurações › Sobre. **Pendências honestas:** (1) cenas `/resumo` não saíram (locator `.or()` do meu roteiro; corrigido, entram na rodada do bundle 3); (2) a captura achou um VAZAMENTO do IV-6: o `/resumo` reencontrado ao recarregar aparecia com o PROMPT interno do host no lugar da pergunta; corrigido no tree (`isSummaryPrompt` em `use-aside-asks.ts`, `aside-asks` 25 testes; pedi ao Bolt um `kind` no `AsideAskView` ou um rótulo no host), vale no bundle 3, os quadros do bundle 2 com o prompt NÃO valem como aceite; (3) o Persona NÃO tem seletor manual de tema em Configurações (abas: Conexões, Uso e limites, Membros, Importadores, Sobre e atualizações): o tema segue o sistema; o endurecimento do INST-3 vale e está testado, mas nenhuma tela dispara a troca hoje. Avisados: Keel, Muse, Lumen (próximo da ordem), Bolt.

**EQUIPE-REAL §0 (Muse 05/11 00:01, decisões 00:03): cartão vivo do plano, cartão de entrega, "nenhum autor com :" (no tree 00:12, atrás de `persona.flag.teamwork`, bundle 3):** `chat/TeamPlanCard.tsx/.css` ("Dividi assim" + o pedido curto; cada parte com rosto 24, título curto e o chip de estado que muda NO LUGAR: na fila · fazendo · esperando/com {nome} (rosto 16) · revisando (info) · precisa de você (warning; clicável com `approvalId`, abre Aprovações com o item) · pronto (success) · parou (danger, "Ver motivo" só com o motivo); o estado muda por upsert da mesma mensagem e o cartão nunca ganha linha), `chat/DeliveryCard.tsx/.css` ("Pronto: {pedido}", partes com o rosto e a pessoa, selo "Revisado por {R}", "Revisar" → Aprovações com a entrega selecionada, só com `approvalId`; a linha "A revisão não rodou…" é do Quill, que a integrou no cartão), `shortPartTitle` (corta só no espaço com "…", tira o "@nome"), `chat/system-actor.ts` (autor `routine:*`/`team:*` nunca é desenhado; o host também não manda mais, Anvil). Forma de host aceita pelo Anvil 00:17 (`MessageView.teamPlan` com os 8 estados + `deliveryCard`; o emissor depende da divisão do Forge, ~2 h). `team-plan-cards` 29 testes; galeria `plano-vivo`/`plano-vivo-parou`/`entrega` (18 capturas, axe 0). **Achados da 1ª entrega real (D-069):** (1) subtítulo do passo 5 travado no 1º quadro (`OnboardingFirstDeliveryStep`, `working-subtitle` 3 testes; o teste antigo que esperava a troca foi atualizado); (2) a CAUSA do "PR" era meu: o onboarding dava como `avatarRef` o slug do nome; agora `rosterGalleryRefs` dá o 1º animal livre da galeria (onboarding e `rosterToHostTeam`; `seed-default-team` +4) e `personaFaceSrc` (`assets/persona-face.ts`, 3 testes) é a defesa de exibição (bicho estável no lugar das iniciais: plano do Gestor, requester das Aprovações, perfil); o host precisa do mesmo no `createPersona` (pedido ao Anvil). Passo 4 do onboarding: o destaque em \"Em branco\" da captura do run real é do roteiro (clica nele antes do shot); o padrão do produto é \"Equipe sugerida (animais)\".

**"Ver" da ação direta = Modal SÓ LEITURA com o que saiu (Muse 23:28/23:41, 23:55):** `chat/ActionContent.tsx` (um componente só para a prévia e para o "Ver": Para/Assunto/Mensagem · texto do post · Valor/Quem recebe/Referência · lista do que foi apagado) + `ActionEventLine` com o Modal (título "Email enviado por Nina" / "Publicação feita por Nina" / "Pagamento feito por Nina" / "Itens apagados por Nina", sem artigo, com o rosto 24; carimbo "Enviado às {hora}"/"Publicado às"/"Pago às"/"Apagado às"; Fechar/Esc). O evento ganha `actionEvent.content` (to/subject/body, amount/payee/reference, items/count; o Anvil aceitou 23:41: o host só devolve DEPOIS de executar e ausente quando não guardou). SEM o conteúdo completo (`mapActionContent`: email = para + mensagem; post = texto; pagamento = valor + quem recebe; apagar = lista/contagem) NÃO há "Ver" (nada sem destino); ação do harness não tem esse "Ver". Tirei o "Ver → Saúde". `action-event` 41 testes, `action-preview` 21; galeria `acao-direta`, `acao-direta-ver`, `acao-direta-ver-pagamento` recapturadas (axe 0). O desenho da galeria foi ACEITO pela Muse (o aceite final é no shell real, quando o host emitir). **NO TREE final para o bundle 2 confirmado ao Keel (23:56).**

**Volta da Muse na galeria (23:30) e o Desfazer da concessão:** (1) Desfazer com tempo legível (`formatUndoLeft`: < 60 s "{n} s", < 60 min "{n} min", >= 1 h "{n} h", para cima; o `formatUntil` escreve horário, não tempo restante); (2) linha de ação direta com o verbo do host (`ActionEventUi.harnessVerb` + `after`: "Nina moveu “Logo da padaria” para Fazendo"; verbos do HT-1 conhecidos em `HARNESS_VERBS`; desconhecido = "Nina mexeu em “…” · Quadros"; sem artigo antes da persona, regra de todo o app) e "Ver" também no email/post/pagamento/apagar (`onViewAction` → Equipe › Saúde por ora); (3) HT-3: barra neutra (outline-soft) também no "esperando" e o relógio pequeno ao lado do rosto nas 4 linhas. A forma do pedido de iniciativa foi CONFIRMADA pelo Anvil (23:21): `decideApproval({ kind: 'connector', id, choice })` devolve `connectorDecision.grant { personaId, cli, connectorId }` com `choice: 'always'`; o Desfazer do Toast chama `revokeConnector` com isso (`liveStore.undoInitiativeGrant`); sem o grant na resposta o Toast sai SEM Desfazer. `action-event` 38, `harness-event-line` 17, `initiative-ask` 17 testes. Regra nova da Muse: SEM artigo antes do nome da persona em todo o app ("Sempre permitir para Nina").

**Galeria de aceite do fio v1.1 (23:20, não espera a trava build nem o bundle):** `scripts/persona/prism-accept-gallery.mjs` + `prism-accept-gallery/{entry.tsx,index.html}` (mesmo molde da galeria da Muse): os componentes REAIS (CSS, locale pt, o instalador de tema do app) renderizados pelo `MessageList` com dados de exemplo e as 3 flags ligadas, porque o host real ainda não emite `dailyBrief`/`actionPreview`/`actionEvent`/`initiativeAsk`. 15 estados × claro/escuro × 1440/960/200% (640×360 css @2x) = 90 capturas, axe 0, sem overflow/corte, 0 erro de console, 0 falha: `bom-dia` (com a trilha de patinhas), `bom-dia-sem-hoje`, `bom-dia-ver-tudo`, `previa-email`, `previa-email-editar`, `previa-pagamento`, `previa-apagar`, `previa-parcial`, `previa-enviando`, `previa-enviado` (enviado + cancelado), `acao-direta` (email sem Desfazer; apagar e ação do harness com Desfazer), `iniciativa` (pendente + 2 decididos), `lado` (pensando + resumo respondido), `lado-falha` (sem IA + pausa com Retomar), `ht3` (começou + os 4 motivos). Saída: `.maestri/tmp/shots/prism-gallery/<estado>-<light|dark>-<1440x900|960x640|zoom200>.png` (log completo em `.maestri/tmp/prism/gallery1.log`). Nota: o artigo \"a {nome}\" da spec (\"Sempre permitir para a Nina\") segue o gênero da persona e o host não manda gênero: uso a forma neutra \"para {nome}\" que a própria spec dá como reserva.

**HT-9 básico, §1 da PERSONA-POWERS: o cartão de prévia de ação externa (22:45, atrás de `persona.flag.actionPreview`, forma que o Anvil confirmou 21:21):** `chat/ActionPreviewCard.tsx/.module.css` + `chat/action-preview-flag.ts` + `mapActionPreview`/`ActionPreviewUi` (map-host-ui) + `ActionPreviewWire` (persona-remote-types) + `liveStore.decideActionApproval` (`decideApproval({ kind: 'action', id, choice: 'send'|'edit'|'cancel', edited?, remember? })`) + `MessageList`/`GeneralChannelView.onDecideAction`/`ConnectedGeneralChannelView`. Email/post/pagamento/apagar com o eyebrow do verbo e do meio, a prévia real (para, valor e quem recebe em NEGRITO; assunto; corpo até 6 linhas + Ver tudo; lista até 6 + "e mais n"), `Enviar` (Publicar · Pagar · Apagar) · `Editar` (email/post, no próprio cartão, "Salvar e enviar") · `Cancelar`; a caixinha "Não perguntar de novo para {persona} no {conector}" NUNCA marcada e inexistente em pagar/apagar (e inexistente com a prévia parcial); aviso "Isso não dá para desfazer depois." em pagar/apagar; FALHA FECHADA no cliente também: prévia cortada, sem o que conferir ou classe que não combina com o verbo = `blind` (sem Enviar, frase "A prévia está parcial: não dá para enviar às cegas."); "Enviando…" (loading, 2º clique não decide de novo); depois: enviado · cancelado · ajustado · falha viram linhas, e NUNCA há Desfazer em email/post/pagamento. Cada botão só existe com `onDecide`. Sem a flag, a mensagem do host aparece como texto e nada executa. `action-preview.client.spec` 21 testes; vizinhos 72; check-pkg OK; CSS 131. §2 FEITO (22:52): `chat/ActionEventLine.tsx/.module.css` + `mapActionEvent`/`ActionEventUi` + `liveStore.undoPersonaAction` (`MessageView.actionEvent { verb, connectorName, target, subject?, undoable?, undoUntil?, activityId }`): "{persona} enviou um email para … · assunto" (e post/pagou/apagou/ação do harness), "Desfazer · 18 s" contando para trás, só com `undoable` + prazo válido + handler, e NUNCA em email/post/pagamento (o mapper recusa mesmo que o host marque por engano); `action-event.client.spec` 17 testes. §3 FEITO (22:58): `chat/InitiativeAskCard.tsx/.module.css` + `mapInitiativeAsk`/`InitiativeAskUi` + `liveStore.decideInitiativeApproval` (`decideApproval({ kind: 'connector', id, choice: 'once'|'always'|'not-now' })`; forma `MessageView.initiativeAsk { approvalId, personaId, personaName?, connectorName, purpose, status, choice? }` PROPOSTA ao Anvil, ele ainda não confirmou): "{persona} quer usar o {conector} para {motivo}." + Permitir desta vez · Sempre permitir para {persona} · Agora não; um clique decide uma vez só, o host recusar mostra a frase honesta e os botões voltam, decidido vira linha ("Permitido desta vez/sempre", "Agora não"), "Sempre permitir" mostra o Toast "Agora {persona} pode usar o {conector} sem perguntar" e o Desfazer SÓ existe com `onUndoGrant` (a concessão desfaz por `revokeConnector`: falta o Anvil dizer o que o `decideApproval` devolve para eu ligar); motivo é texto, nunca instrução; `initiative-ask.client.spec` 15 testes. Os três (§1 cartão, §2 linha, §3 pedido) ficam atrás de `persona.flag.actionPreview`. Falta: a captura (claro/escuro × 1440/960/200%, prévia de email e de pagamento sem a caixinha, a linha com o Desfazer contando, o pedido com as 3 opções) e a ligação do Desfazer da concessão.

**TEAM-7 "Bom dia" (D-090, EQUIPE-REAL-SPEC §(b); o cartão é MEU, Muse 22:11):** `MessageView.dailyBrief { day, coordinatorPersonaId, yesterday[]/today[] {taskId, personaId, title}, needsYou.count, paused, routineId }` (`contracts/team-real.md` §4, rascunho do Keel) -> `remote/map-host-ui.ts` `mapDailyBrief` (só linhas com título real de tarefa; sem nada a dizer, sem cartão; contagem estranha vira 0; rosto/nome da Coordenação do time). Cartão estruturado `chat/DailyBriefCard.tsx/.module.css` no #geral: eyebrow "Bom dia · {dia da semana}" com o rosto da Coordenação, "Ontem" (até 3 + "e mais n" → Quadros), "Hoje" (rosto + "{persona}: {título}"), "{n} coisas esperam você" + Ver → Aprovações, recolhível (aria-expanded), altura máxima 320 px com "Ver tudo"/"Ver menos" (mede o conteúdo real), ⋯ → "Pausar o resumo da manhã" → Rotinas; seção vazia não aparece; cada botão só existe com destino (`DailyBriefActions`). Plumbing: `MessageList` (`dailyBriefActions`), `GeneralChannelView`, `ConnectedGeneralChannelView` (+ `onOpenBoard`/`onOpenRoutines` no `channelInject` de `register-prism-screens.tsx`). ATRÁS DE `persona.flag.teamwork` (`chat/teamwork-flag.ts`; `localStorage['persona.flag.teamwork']='1'` ou `window.__PERSONA_FLAGS__.teamwork`): sem a flag a mensagem do host aparece como texto, como hoje (D-077). `daily-brief.client.spec` 18 testes; CSS 128 válidos; nenhum erro de tipo nos meus arquivos (o vermelho do check-pkg de 22:10 era só `ask/PersonaAskCard.tsx` do Ember, locales `ask.*` não gerados). Enfeite pedido pela Muse (22:12): a trilha de patinhas (ACCENTS `paw-trail`) como divisor entre \"Ontem\" e \"Hoje\", aria-hidden, 8 px, ink-soft a 40% por máscara, some em forced-colors e a ≤ 800 px, atrás de `persona.flag.houseDecor` além da `teamwork` (`daily-brief` 21 testes). Falta: captura do cartão completo e sem seção vazia, claro/escuro × 1440/960/200%, depois do bundle 2 (o host real ainda não emite `dailyBrief`: a captura sai de uma mensagem do host falso no shell/galeria; o "Um dia da equipe" é do Gauge).

**P0 duplicata de mensagem no #geral (Keel 21:56):** `postChannelMessage`/`postDmMessage` põem uma linha OTIMISTA (`local-…`/`local-dm-…`) e o eco do host chega pelo `followMessages` como upsert com id `msg-…`; `applyMessageStreamFrame` só casava por id, então as duas linhas (mesmo texto) ficavam no fio até o `refresh()` trocar a lista inteira (e ficam se ele demora, falha ou perde a corrida). Correção em `remote/apply-message-stream.ts`: o eco da PRÓPRIA pessoa (`authorId: 'user'`) substitui UMA otimista com o mesmo texto; mensagem de outra pessoa nunca apaga a otimista; upsert do mesmo id segue idempotente. `apply-message-stream.client.spec` +4 casos (vermelhos antes, 7 verdes), vizinhos 27 verdes, check-pkg OK. Nenhum caminho novo meu (HarnessEventLine, MessageList, balões) renderiza o corpo 2×.

**IV-6 UI (v1.1, `/lado` e `/resumo`; passou do Flint para mim em 21:14, D-089):** o host é o do Bolt (`contracts/aside.md`). Cartão "Pergunta à parte" / "Resumo da conversa" ACIMA do composer e FORA do fio (`chat/AsideCard.tsx/.module.css`): a persona "está pensando…" (status), a resposta ("Resposta de {nome}", até 3 frases) ou o porquê de não ter podido, escrito a partir do motivo tipado (pausa -> "Retomar {nome}"; sem IA; falha -> "Tentar de novo"; resposta demorando -> "Tentar de novo"), com "Fechar" e o aviso "Fica fora da conversa: não entra no fio nem na tarefa.". `chat/use-aside-asks.ts` guarda o estado de UMA conversa: sonda `getAsideAsk` a cada 1,2 s até sair de `asking` (timeout 120 s), `status` ausente conta como sem resposta, `answered` sem texto vira falha, refaz a MESMA chamada no mesmo cartão ("Tentar de novo"), troca de conversa limpa a tela e cala o acompanhamento, e recarregar reencontra o que o host guardou (o que ainda pensa e o respondido há < 10 min). `remote/use-connected-aside.tsx` liga o canal (responde a coordenação, `defaultChannelResponderId`) e a DM (responde o par); `liveStore.openAsideAsk/summarizeConversation/getAsideAsk/listAsideAsks`. O menu "/" da Flint já lista só o que tem handler: sem as chamadas do host o comando continua FORA do menu (P0-27). Não toquei em `composer-slash-commands.ts` nem em `ChannelComposer`: um slot `asideSlot` (1 linha em `GeneralChannelView` e `DirectMessagesView`, logo depois do `engineBanner`). Prova: `aside-asks.client.spec` 23 testes (hook, cartão, ligação ao menu) + vizinhos 68 verdes; check-pkg OK; CSS 120 válidos. Falta: bundle novo (o de 21:12 é anterior) e a captura no shell real (cenas `lado-canal`, `resumo-canal`, `lado-dm`, `resumo-dm`, pensando e resposta, no roteiro final).

**HT-3 (v1.1, linha do fio):** `MessageView.harness` (Bolt, contracts/harness-tools.md §8) vira a linha de evento "{persona} começou “{tarefa}” porque você moveu para Fazendo" e os motivos de não ter começado (pausa · silêncio com/sem hora · entrega pendente · sem responsável) com a ação que resolve: `Retomar {persona}` (`liveStore.resumePersona`, só chama o que o host expõe), `Revisar mudanças` e `Escolher responsável` (abrem a tarefa no quadro), `Ver tarefa`; cada botão só existe quando há destino. Arquivos: `chat/HarnessEventLine.tsx/.module.css`, `MessageList` (canal e DM) renderiza a mensagem com `harness` como a linha, `mapHarnessLine` em `remote/map-host-ui.ts` (título sempre o da tarefa; sem título cai no corpo legível do host), chaves `harness.*` em `chat.{pt,en}.json`. Dormente por natureza: o host só manda `harness` com `Config.startOnBoardMove` (desligada por padrão), então não há flag de UI e o fio de hoje não muda. `harness-event-line.client.spec` + vizinhos 41 verdes; check-pkg OK; CSS 119 válidos. Falta: a linha no quadro ("Nina começou agora", anel pulsando 1x) é do Lumen; captura e aceite da Muse com a flag do host ligada.

**CV-2/CV-4/seleção** seguem como no relato anterior (no tree, CV-2 atrás da flag `persona.flag.navPlaces`, CV-4 já vale). Script de captura corrigido (rosto do #geral = `button[aria-label^="Conversar com"]`, hover 700 ms, ⋯ por `data-persona-card-trigger`, 5 lugares, trilho/canal/DM da Flint com a flag) e ENFILEIRADO na trava build atrás do "Ember shell shots"; roda quando chegar a vez (não antes do snapshot do H3: o gate tem prioridade).

## 2026-11-04 19:10 — Escuro, WIRE-4, SW-7, A-6, S6, A-1 atrás de flag, P0-31 (tudo no tree; congelado D-082)

**Tema escuro (P0 do Gauge):** `theme/install-color-scheme.ts` grava `data-ds-dark-theme="true"` no escuro e REMOVE o atributo no claro (a paleta e os módulos casam o VALOR, os componentes do host casam a PRESENÇA: `setAttribute(…,'false')` os deixaria escuros no claro). `install-color-scheme.client.spec` 5 casos; o Gauge confirmou no working tree (13 telas com captura escura diferente da clara). Entra no H2; o aceite é a varredura escura da Muse no instalado.

**WIRE-4 (auditoria dos Remotes, subagente conferido por mim):** seed de dev `limit` 300→200; "Desfazer" de decisão só quando o host tem `undoApproval` (`decisions/undo-availability.ts`); `listTeam` só com `workspaceId`/`projectId`; `maxPersonas` inteiro 1..30 nos dois sentidos. `wire-4-client-fixes` 7. Reportado ao Keel e ao Gauge o que NÃO é meu: `reviewSummary`/`discardReview`/`acceptReview` (Lumen), `PersonaHistoryRemote` (já adaptado em `history-remote.ts`).

**SW-7 (draft):** o Bolt entregou `PersonaNowView.draftFiles?`; a faixa da equipe mostra "Num rascunho" (ponto brand + texto; leitor: "Trabalhando num rascunho") e o cartão da persona "{Persona} está mudando N arquivos num rascunho. Nada muda na sua pasta até você aplicar." (singular/plural); só com `state working` e ≥ 1 arquivo; a ponte do cartão acompanha o live. `draft-working-state` 10.

**A-6 (passo 5):** o Bolt entregou `firstRequest` e `suggestFirstRequests({ cofreSeed })`. "O pedido" é editável (≤ 500), a tela diz que a equipe recebe exatamente o texto, os chips vêm só do negócio do passo 2 (vazio/erro/sem negócio = sem chips), o texto da tela vai em `completeOnboarding.firstRequest`; vazio desabilita "Pedir agora" com a linha do porquê; sem estimativa de tempo (não há valor medido). `first-request` 15. Erro meu corrigido na hora: o `useCallback` do overlay ficou antes de `wire`.

**S6:** o Assistente aberto por "Contratar persona" tem o `ScreenHeader` (ícone, eyebrow "Equipe", título, subtítulo). `structure-assistant` +2.

**A-1 atrás de flag (D-077):** `nav-flag.ts` (`persona.flag.navPlaces`, desligada por padrão), `PlacesRailNav` (6 lugares com `data-nav-place/-panel/-contains`), `PlaceTabsBar` (`data-tab-panel`), aba "Sobre e atualizações" (`about`) + ponte `settings-launcher-bridge` (o Flint liga o `settings.launcher`). Flag desligada = o app de antes; ligada = rail novo + abas. `nav-places-flag` 8, `nav-places` 16, `about-settings` 6. O Flint (sob mim) fez o rodapé pela mesma flag e A-2/P0-17/P0-27/P0-30/IV-3/IV-4.

**P0-31 (ficha da tarefa com slug):** `remote/task-title.ts` — o título da ficha é SÓ o da tarefa (nunca id/assunto/slug; sem título, sem ficha); ficha única com 2 links ghost; também na DM; "Enquanto você estava fora" sem id no botão ("Ver tarefa"). `task-card-title` 10; 3 specs vizinhos atualizados.

**Outros:** HINT-clamp ajustado pela Muse (o balão recebe o toque; `suppressHint` com plano em `proposed`); `PersonaCard` com rolagem, remedição e o hover que não reabre depois do Esc; `workflow-editor` reencaminha o destino quando a coluna destino também é removida (PB-9.3); `subject-bar` arquivar/reabrir com teste; `HirePersonaCard` com o retrato do bicho e o motor em português.

**Erro meu a registrar:** disse ao Keel (D-076) que as capturas "dark" do passo 5 saíram claras; para as MINHAS estava errado (o script forçava o atributo). Corrigido às 17:54.

**Próximos, depois do congelamento e do ok do Miguel à v2 (CONVERSAS-SPEC §0, combinado com a Muse 19:10):** CV-2 (cabeçalhos do fio de canal/DM, DM sem "Quem responde", "Canal criado para…") e CV-4 (rosto: clique = abre a DM, Enter no rosto = DM; cartão pelo ⋯ "Sobre {nome}", hover longo ~700 ms (hoje 450) ou Shift+F10/tecla de menu; mantém Esc, remedição e o hover que não reabre; `data-persona-card-trigger`; aviso ao Probe antes do merge). As 2 abas de Conversas ficam como ponte descartável; o lugar `conversations` sai do `nav-places` junto com o CV-1 (Flint).

**Gate:** `check-pkg client-ui-persona` OK (72 s, 18:40); suíte do pacote 1274/1275 (o 1 do Lumen, corrigido). A rodada de capturas no shell real (claro/escuro, 1440/960/200%) ficou 50 min na fila da trava build atrás do empacotamento do H2 e expirou; reenfileiro depois do aviso do hash do H2 #3 (D-082).

## 2026-11-04 19:35 — PB-7 (sprints), GOV-8/GES-4, S6, tema escuro (preparado), A-1 fase 1 (início), skeleton do reload

**PB-7 (Sprints, `kanban/`, arquivos do Lumen: avisei por Status):** planejamento backlog ↔ sprint com linhas por checkbox nativo (antes eram Cards clicáveis sem foco), busca e chips por responsável, arrastar e soltar COM o equivalente por teclado/botão, medidor de capacidade por persona e frase de estado (`role=status`). Encerrar a sprint mostra "Quem fez o quê" (persona + contagem) e a lista recolhível do que ficou; "Atrasadas" só aparece quando o dado existe (nada de "0" inventado). Achei e corrigi "faltam 1 dias" (singular `sprint.daysLeft.one`) e o chip "faltam 0 dias" quando o host não manda prazo (agora some). Avatares 20→24 (mínimo do primitivo). Testes: `sprint-planning-pb7` 12, `close-sprint-pb7` 8 (+ vizinhos).

**GES-4 / GOV-8 / S6 (Muse):** cartão do plano do Gestor sem passo repetido, com o porquê do host; título concorda com o nome ("Plano da Coordenação"/"do Atlas"); texto de aprovado só diz que a pessoa aprovou (o host ainda não cria as personas: Anvil/Forge). Assistente de estrutura: h1 Fredoka 26 (os tokens `--persona-font-body/-caption/-title-m` NÃO existiam: o `font:` era inválido e o texto herdava o tamanho; troquei nos 3 CSS meus), modelos em `ChoiceCards` com ✓, "Contratar" em cada persona (um a um), dica nova, Teste dos 2 dias só "nome — função". Editor: o preview usava o rascunho de exemplo da Luna (`personaViewToDraft` espalhava `MOCK_PERSONA_DRAFT`: bicho, personalidade, instruções e skills vazavam para toda persona real); agora o bicho vem do host. Preview sem jargão ("Coordenação", "Sugere e espera", "Arquivos do projeto e internet · só leitura"). Selo Gestor igual no perfil (âmbar + bastão).

**P0-13 cartão da persona:** `max-height 100dvh-24px` + rolagem interna; remede com `ResizeObserver`; causa provável do "Esc não fecha": o cartão some debaixo do ponteiro parado e o navegador dispara `pointerenter` no avatar de baixo — o hover reabria. Agora o hover só volta quando o mouse se mexe. `persona-card-keyboard-fit` 6.

**Ao vivo (Gauge SB-7/GES-6):** o stream de mensagens agora dispara (debounce 700 ms) a releitura de planos e decisões: o cartão do plano e a proposta nova de aprovação aparecem sem F5. O balão "Quem responde" deixa de interceptar o clique (só o botão recebe) e some ao clicar fora. `live-stream-side-refresh` 4.

**Skeleton do reload (Gauge #4):** faixa da equipe, "Agora" e #geral mostram skeleton enquanto `live.ready` é falso (nunca "Monte sua equipe/Vaga aberta/canal quietinho" antes da hora). `reload-loading-skeleton` 7.

**Tema escuro (P0 do Gauge):** conserto + spec PRONTOS no scratchpad, NÃO aplicados (ordem do Keel: depois do H). Contrato: `'true'` no escuro e REMOVER o atributo no claro (o host casa a presença; `setAttribute(…,'false')` deixaria os componentes do host escuros no claro).

**A-1 fase 1 (NAV-SPEC):** `shell/nav-places.ts` (6 lugares + Configurações no rodapé; abas = os `MainPanelId` de hoje; apelidos do Ctrl K; última aba por lugar), `PlaceTabsBar.tsx` (abas com `data-tab-panel`), integração no `PersonaAppFrame`; `data-nav-panel` em cada item do rail (Probe). Falta: trocar o loop de NAV_GROUPS no corpo do rail pelos 6 lugares (espera o aviso do Flint: P0-22 estável), Conversas com as DMs da equipe inteira (A-2), A-3, A-6. `nav-places` 16.

**Auditoria dos Remotes (subagente, conferida por mim):** `postMessage` sem `occurredAt` (lib do Typert defasado: Anvil regenera), `reviewSummary`/`discardReview` sem `command`/`reason`, `acceptReview` `choices` descartado (Lumen), `undoApproval` não existe (esconder "Desfazer" — meu), seed `limit:300`. Meus, DEPOIS do H: `PersonaHistoryRemote` → `listRestorePoints`/`undoApply`, `PersonaCreatorRemote.listTeam` (campos que o schema recusa), `maxPersonas` sem sanear.

**Gate:** check-pkg client-ui-persona OK (46 s).

## 2026-11-04 18:30 — Gauge GOV-10, boot (SEGURADO), controles mortos, fase do passo 5 por atributo

**Gauge (F5/GOV-10) — meus 3 itens:**
- **"Estou fora" chega ao host** (era só estado do cliente): o rail manda `setAvailability` (janela do agora até o prazo real; `available` ao desligar/expirar), e reconcilia uma vez quando o tenant existe depois de reabrir o app. `shell/availability-sync.ts`; `onAwayChange` injetado em `mount.ts`. O selo "Fora" no organograma é do Lumen (lê a disponibilidade do host).
- **Popover "Estou fora"**: fecha com Esc (foco volta ao chip) e com clique fora; cabe nos 264 px do rail (antes alargava e deslocava a barra 34 px, o rail usa `overflow: clip`); as 3 opções de prazo empilham. `rail-away-host` 8/8.
- **`<main>` no shell** (axe landmark-one-main / region em toda tela): `PersonaAppFrame` agora tem um único `<main>` com o painel; rail (`nav`) e overlay ficam fora. `app-frame-main-landmark` 1/1.
(Itens 1 e 2 do Gauge — personas contratadas sem responsável/setor, rotina `initiative:*` sem dono e id interno na tela — são do Anvil/Lumen/Forge.)

**Boot vazio (`SlotAssemblyError renderSlot('root')`):** diagnóstico: o `root` da Persona só é registrado dentro de `registerUi`, depois de `await ctx.remote.$mount(...)` e dentro do escopo `inject(['remote.persona', ...])`. Conserto pronto e testado em unitário (registrar o `root` de forma síncrona antes de qualquer await e fora do escopo do remote; 3 testes de ordem), mas o Keel mandou **segurar** (hipótese: bundle em paralelo trocando chunks; o Gauge prova numa janela exclusiva). Retirei da árvore; o patch e o teste estão guardados fora do repo (`scratchpad/mount.ts.with-root-early`, `mount-root-order.client.spec.ts.held`) e reaplico em 1 comando se o Keel confirmar.

**Controles mortos (varredura do Quill):** `HirePersonaCard` é só prévia (não montado): botões só com handler. `ImportWizard` ESTÁ montado (Importar › avançado) e tinha 3 botões sem ação: agora a importação é real pelo host (`previewImport`/`confirmImport`/`rollbackImport`: arquivo → prévia com aceitos/recusados → confirmar → desfazer), e sem host o assistente só explica. `dead-controls-wizard` 6/6. Os "Nova tarefa" do Quadros (kanban) são do Lumen e estão montados: pendentes.
**Fase do passo 5 por atributo (Muse/Probe, D-069):** cada section leva `data-first-delivery-phase` (intro/needsEngine/working/slow/failed/celebrate). `first-delivery-phase-attr` 6/6.
**Gate:** check-pkg do pacote falha só em arquivos de outros (`second-brain/SecondBrainHome.tsx` do Lumen e `canvas-list-g2` do Quill, em edição); os meus passam.

## 2026-11-04 17:10 — Passo 3 "Verificando…", bug de movimento reduzido, revisão por captura da Muse

**Achados reais (o script de capturas em movimento reduzido os revelou):**
- **`usePersonaMotion` deixava conteúdo em `opacity 0` para sempre com `prefers-reduced-motion`** (e `fromOpacity: 0` é o padrão de toda entrada: passo do onboarding, StaggerEntrance…). A captura do passo 3 saiu em branco. Agora movimento reduzido entra com um fade curto de 120 ms, sem deslocamento; sem Web Animations o conteúdo aparece no estado final. `usePersonaMotion` 6/6 + `onboarding-step-motion-reduced` 2/2.
- **Passo 3 mentia durante a detecção** (Probe: "Não detectada" como resposta final por 10–27 s, e antes da 1ª leitura o mock marcava Claude e Codex como "Pronta"). Agora: sem resposta do host, os 4 cartões dizem **"Verificando…"** (aviso informativo, sem "Conecte pelo menos uma IA"); a lista é relida a cada 1,5 s até a sondagem acabar; falha de leitura não vira "sem IA". O host levou 5,6–26 s na medição, e o cartão mudou quando terminou. `onboarding-step3-checking` 7/7.

**Revisão por captura (Muse, `CAPTURE-REVIEW-0411.md`):** (1) plural "1 pendente" na Visão geral e no rail; (2) "Descansando" sem "zzz"; (4) o marco credita a persona que entregou (retrato + nome) via `first_delivery` do host, "Equipe" só sem ninguém; (5) passo 5 cabe em 1440×900: o painel usava grid+center (cortava a banda quando mais alto que a janela) → `margin:auto` + banda compacta no passo 5; (6) apresentação da equipe vem do roster contratado (nome + função), sem texto de exemplo; (7) a seta da dica "Quem responde" aponta o centro do seletor (medido); (8) gap no Configurações; (9) aviso "a caminho" com relógio (`Notice` ganhou `icon` opcional). **(10, P2) fica aberto:** a coluna vazia sob "Precisa de você" é layout do bloco de decisões do Lumen (OverviewView); proponho "Enquanto você estava fora" / "Últimas entregas" quando houver ≤ 2 pendências, junto com ele. (3) é do Lumen (`avatarSrc` do Decision).
**Passo 5 "trabalhando" (Muse):** pose "trabalhando" (160 px, à esquerda; empilha < 560 px; sem id, avatar da Coordenação), rótulos do ActivityGroup pelo dicionário (`activityGroupLabelsFromDict`), `aria-live` só na linha de estado e no aviso de demora (não mais na section). Contraste: o cartão do pedido no escuro usava `--persona-surface-alt` (sem valor no escuro) → `--persona-wash`; a busca do rail e a dica `kbd` ganharam fundo mais escuro (axe do Quill).
**Testes:** `capture-review-0411` 8/8, overlay 20/20 etc.; check-pkg client-ui-persona OK 52 s. **Capturas:** a tela "Falta uma IA" não dá para simular só com PATH (a detecção acha o Claude em locais conhecidos: `probe.ready()` = Claude logado); o cenário sem IA é o `engine: { kind: 'none' }` do Probe, com capturas em `persona-e2e/artifacts/first-delivery/no-engine/`; as minhas cobrem passo 3/5 e celebrate → Visão geral → #geral (claro/escuro, axe).

## 2026-11-04 16:00 — S7 teclado do onboarding (Probe) + arte "Falta uma IA" (Muse)

**S7 (Probe: foco caía no body e o Tab percorria ~130 paradas do app por trás do modal):**
- `onboarding/use-focus-trap.ts`: prende o Tab no painel do diálogo (última→primeira, Shift+Tab primeira→última; foco no body ou em título `tabindex=-1` sem parada depois volta para dentro) e devolve qualquer foco que caia fora do `role=dialog` (ex.: o composer do #geral por trás). Ao fechar, devolve o foco a quem o tinha.
- `OnboardingWizard`: a cada troca de passo, do assistente do passo 4 e de fase do passo 5 o foco vai para o título (`h1`, `tabindex=-1`; `failed`/`celebrate` usam `data-persona-step-focus`). Era o botão apertado sumir e o foco virar `<body>`.
- Bônus de a11y: o `aria-labelledby="persona-onboarding-title"` apontava para um id que não existia (o diálogo estava sem nome). Os `h1` agora têm esse id e o diálogo tem `aria-label`.
- Testes (`onboarding-overlay-first-delivery`, 22/22): título focado após Pedir agora e após celebrar, nunca o body; Tab/Shift+Tab dão a volta; body + Tab volta para dentro; foco externo é devolvido; diálogo nomeado. A prova no app é o `mandatory-onboarding-keyboard` do Probe depois do rebuild do client.

**Arte "Falta uma IA" (Muse, `ILLUSTRATIONS['empty-sem-ia']`):** fase `needsEngine` = `EmptyState` compacto com a arte a 240 px e o título como `h1` do diálogo; o cartão de falha sem IA (não logado, CLI ausente, motor indisponível) leva a mesma arte; cota não. `EmptyState` ganhou props opcionais `titleAs`, `titleId`, `artSize` (defaults inalterados). O spot de 96 px da faixa do composer (FR-3) espera o `spot-sem-ia`.

**Gate:** tsc do pacote OK (excluindo `tests/draft-review-panel.client.spec.tsx`, do Quill, com erro de sintaxe em andamento que faz o check-pkg parar em erros de sintaxe e esconder os de tipo para todos).

## 2026-11-04 14:30 — Fechamento: "Pedir agora" espera a IA, cabeçalho sem controle morto, trava `check`

- **"Pedir agora" só habilita depois da 1ª leitura da IA** (`useEngineStatus.settled`): antes havia uma janela de dezenas de ms em que o passo 5 mostrava o botão antes de saber se havia IA. Teste novo no `onboarding-overlay-first-delivery` (12/12).
- **#geral: cabeçalho sem controle morto** (UX-PHASE: "nenhum controle morto"). O sino e o menu da conta não tinham handler. Agora o sino abre **Aprovações** e o ponto só aparece com decisão esperando (mesmo número do rail e da Visão geral, `openBlockingCount`); o avatar vira só presença (não é botão, não reage ao mouse) até existir um menu de conta. Sem destino, o sino nem aparece. `channel-header-controls` 3/3.
- **Gate:** `check-pkg client-ui-persona` **OK em 45,3 s** na trava `check` (pacote inteiro, testes incluídos). Vitest dos arquivos que mexi: 18/18 (cabeçalho + vizinhos) e 12/12 (overlay).
- **Capturas claro/escuro com host real:** script `.maestri/tmp/prism/run-shots.mjs` (bundle fresco + `step5-shots.mjs`: sem IA → needsEngine + faixa no #geral; scripted → intro/working/celebrate; axe e console incl. `listGestorPlans`, porta livre + home por processo). Reenfileirado na trava `build` (FIFO); saída em `.maestri/tmp/shots/prism-step5/`.
- **UX-17 (onboarding passo 4):** o modelo sugerido (já marcado, equipe à vista) é o caminho principal; o Assistente de estrutura e "Prefere descrever com suas palavras?" viraram links secundários abaixo dos modelos (o construtor abre sob demanda, `aria-expanded`). O botão mantém "Assistente de estrutura" no nome (seletor de `persona-e2e/dogfood-padaria.ts` e das capturas, que casam por substring). `onboarding-step4-paths` 5/5 + `onboarding-builder` atualizado. UX-BACKLOG: UX-17/08/09 e DF-001/002/008/010 (lado Prism) marcados como feitos, aguardando aceite visual da Muse.
- **Pendências de outros donos:** Anvil: retry da 1ª entrega → `first_delivery` volta a `working`. Quill: "Revogar acesso" por membro (`MembersView.tsx:105` sem handler). Lumen: 2 testes fora do meu escopo (`ux-backlog-muse` UX-05, perfs de virtualização).

## 2026-11-04 13:40 — E13: UI Equipe remota (feita antes do repasse ao Quill)

Contrato `contracts/remote-team.md` (Anvil, E12 verde). Painel novo como seção da tela **Membros** (mesmo no estado "só você"):
- `remote-team/remote-team-model.ts` (puro): estado apresentado (sem conexão + Cofre indisponível = "Cofre indisponível", sem formulário e **sem gravação alternativa**), o que cada estado permite (revogado só reabre com novo convite; só o dono convida), validação do endereço (http/https), erro do Remote → motivo em português (o código nunca é a mensagem), convites do mais novo ao mais antigo (só "Aceito" revoga; o token do host nunca vira linha da tela).
- `RemoteTeamPanel.tsx` (+css): status honesto (Não conectada · Conectada · Sem conexão "o que você escrever fica guardado" · Acesso encerrado · Cofre indisponível), canais pelo **nome** (nunca o id interno), conectar (endereço + canais; **nada marcado por padrão**, compartilhar é decisão da pessoa), entrar com convite (código em campo de senha), gerar convite (Membro/Convidado), código mostrado **uma vez** com aviso + copiar endereço+código + "Já enviei", lista de convites com Revogar, Sincronizar agora.
- `ConnectedRemoteTeamPanel.tsx`: lê `getRemoteTeamAvailability/State`, `listChannels`, `listInvites`; `connectRemoteTeam/issueInvite(token vazio)/acceptInvite/revokeMember/syncRemoteTeam`; polling 5 s; o código do convite só vive em estado de tela (testado: nada em localStorage/sessionStorage); host sem os métodos (versão antiga) → painel não aparece. `settle` preserva o `code` tipado do host.
- Integração: prop opcional `extra` em `members/MembersView.tsx` e 1 bloco `extra=` em `RemoteMembersPanel` (`data/lumen-remote-panels.tsx`). Textos pt/en em `members.{pt,en}.json` (chaves `remote.*`), sem jargão (endereço da equipe, código do convite).

**Testes:** 34/34 em 4 arquivos (`remote-team-model` 7, `remote-team-panel` 15, `connected-remote-team` 11 [convidar → aceitar → ver o canal com host de mentira stateful, Cofre indisponível, revogação vista pelo polling, host antigo], `remote-members-panel` existente).

**Repassado ao Quill (Atlas):** captura do fluxo com dois perfis clicando na UI (o `remote-team-real.mjs` do Anvil usa RPC), polimento visual com a Muse, e "Revogar acesso" por membro na lista de Membros (o botão em `MembersView.tsx` não tem handler: controle morto do Lumen; a revogação real é por convite aceito no painel novo). **Passo W2-7, W2-10 (UI do Ensinar) e G2 (canvas) ao Quill.**

## 2026-11-04 12:50 — FR-2/FR-3/FR-5/FR-6 + UX-PHASE 5/6/8/10 (sessão nova, motor trocado)

**P0 do gate (Keel), 2 quebras minhas:** `GeneralChannelView` chamava `onSend` (não existe → `onSendMessage?.()`); `ChannelComposer.module.css` tinha 2 linhas soltas (duplicata de `.autonomyChip`, já na linha 321) que derrubavam o lightningcss. Corrigidas; os 95 `.css` do pacote passam no lightningcss; bundle passou sob a trava ("Build complete"). O check-pkg só pega TS, não CSS: lição para o gate (rodar o bundle).

**FR-2 — passo 5 no estado REAL do host.** Antes a fase era adivinhada (lista de IAs só carregada no passo 3, com *mock* "pronto" de fallback; nada atualizava o host enquanto "trabalhando"; o `failed` inventava "O Claude não está conectado"). Agora:
- `onboarding/first-delivery-phase.ts` (puro): fase = f(IA pronta?, marco `getFirstDelivery`, erro tipado NOVO no #geral, 45 s, janela de retry). `checking`/`unknown` nunca bloqueiam ("sem IA" só quando o host diz `unavailable`).
- `OnboardingShellOverlay.tsx` reescrito: polling de `getEngineStatus` (3 s; relê forçado ao voltar o foco da janela, que é quando a pessoa volta do login no terminal) e de `getFirstDelivery` (2 s) enquanto há pedido; `refreshLive` quando o marco vira ready/failed (injetado no `mount.ts`).
- **Bug real achado:** o `RunErrorCard` do passo 5 lia `runError.*` do dicionário do onboarding (chaves só existem no chat) → card sem texto no app. Agora `chatDict` é injetado.
- `failed` sem erro no fio descreve pelo motivo do host (login/cota/nenhuma IA/"motor de IA"), não por um Claude inventado; falha ao iniciar o pedido → `app_offline` com "Tentar reconectar" (nunca fica sem saída). A ação primária do card leva ao lugar certo (conectar IA → passo 3; tentar de novo → reconfere o motor + `runTicketCommand retry` na tarefa; esperar cota → entrar no app).
- Pedido retido sem IA (FR-3) mostra `needsEngine` em vez de "trabalhando" para sempre; IA volta → volta a trabalhando. Celebrate: "Pedir ajuste" agora existe (leva ao #geral). Retrato da persona no card de falha.

**FR-3 — faixa "Falta uma IA" (#geral e DM).** `remote/engine-status.ts` + `use-engine-status.ts` + `chat/EngineMissingBanner.tsx` + `remote/ConnectedEngineBanner.tsx`. Só aparece com `state: unavailable` (nunca em `checking`); motivo (nenhuma IA / falta login / cota), "Conectar uma IA" (abre Conexões), "Conferir de novo" (`retryEngine`), "Mensagens guardadas: n"; ao conectar vira "IA conectada. Retomando…" por 6 s. `engineRemote` injetado em `register-prism-screens.tsx` (2 linhas).

**FR-5** retrato no `ConversationRunErrorCard` (#geral). **FR-6** passo 3: aviso fora do `<ul>`; passo 5: `StaggerEntrance as="li"` + rótulo "Sua equipe se apresenta" (era só "Miguel").

**UX-PHASE (itens 5/6/8/10) — havia código sem teste e 3 pontas soltas:**
- 6 (fila/steer): o `GeneralChannelView` passava `editingQueuedText`/`onCancelEditQueued` que o composer não aceitava (erro de tipo que o gate ainda ia pegar) e a fila local nunca era alimentada. Completo: com a persona trabalhando "na fila" guarda como balão tracejado; sai sozinha quando ela termina o passo; Mandar agora / Editar (volta ao composer com chip + Cancelar) / Tirar (toast Desfazer 6 s); região live; nomes acessíveis localizados. Só no #geral (DM segue enviando direto).
- 5: o balão "Quem responde" **nunca era ligado** (estado existia, nada o ativava). Ligado: 1×/instalação, só com >1 persona, não rouba foco, Esc/Entendi/trocar o seletor fecham, storage bloqueado = nunca insiste. Seletor de DM ganhou `aria-activedescendant`.
- 8 ("Estou fora"): "Fora até {quando}" estava fixo em português → localizado; **prazo real** (`untilAt`: próximo 18h / 8h do dia seguinte / fim do dia escolhido) com retorno automático no rail (1 efeito em `PersonaSidebar.tsx`, fora dos trechos do Lumen).
- 10: a seção "O que {persona} pode fazer" nunca recebia dados (`personaCardFacts` nem repassava `capabilities`). Agora a linha **Autonomia** vem do `getAutonomy` do host, com "Ajustar" → editor. Ferramentas/alcance/permissões continuam dependendo de dado do Anvil (a seção só aparece quando há dado: nada de "Só conversa" inventado).

**Testes (vitest, timeout, sem watch):** 11 arquivos / **81/81**: `first-delivery-phase` (16), `onboarding-overlay-first-delivery` (11, host de mentira que muda de estado), `engine-missing-banner` (8), `onboarding-a11y-lists` (3), `queued-message-steer` (7), `who-responds-hint` (6), `composer-autonomy-chip` (2), `new-dm-persona-modal` (6), `user-away-control` (9), `persona-card-capabilities` (6) + `onboarding-first-delivery` atualizado (7). Suíte inteira do pacote: 202/205 arquivos; as **3 falhas não tocam o que editei** e são determinísticas: `message-list-scale` e `second-brain-permissions-scale` (contagem de linhas virtualizadas no jsdom) e `ux-backlog-muse` UX-05 (label "Tokens / mês por persona" não existe em `rules`; área do Lumen/Muse).

**Gate:** ver linha final (check-pkg + capturas). Erros de TS fora do meu escopo vistos no check-pkg das 12:15: `tests/decisions-cycle.client.spec.tsx` 270/329 `approvals` não lido (Lumen, edição em andamento).

**Limitações:** (1) Retry do primeiro pedido usa `runTicketCommand retry`; o host deixa `first_delivery=failed` até o novo selo, então a UI ignora o `failed` antigo por 8 s: peço ao Anvil que o retry vire `working` no host (não bloqueia). (2) Balão da fila só no #geral; "Mandar agora" = enviar até o steer real do Forge; sem fade de 220 ms na saída. (3) Estou fora: o substituto de aprovações ainda não vem do host (aviso honesto "Ninguém foi definido"). (4) axe sem `axe-core` no repo: medi com a cópia da Muse nas capturas (ver linha final).

## 2026-11-04 10:25 — GES-4 + W2-3 + GOV-8: Gestor de equipe, Assuntos na DM e Contratar tudo

**GES-4 (Gestor de equipe):**
- Suíte completa de testes de UI do Gestor (`tests/ges-4-ui.client.spec.tsx` 7/7):
  - Interruptor **Gestor de equipe** no editor (`GestorSettings`) revela limites em linguagem simples (aprovação, stepper máx personas, orçamento, escopo setores/projetos, conceder função).
  - **Selo Gestor**: badge `data-tone="gestor"` em `PersonaInfoCard`, ícone de bastão (`UiIcon name="baton"`) no avatar do rail (`RailTeam`), e tag na faixa da equipe (`TeamChannelStrip`).
  - **Cartão plano**: `GestorPlanCard` com passos de contratação/quadro, estados pendente com Aprovar/Ajustar/Agora não, e selo de Aprovado com status afirmativo.
  - **Animação de entrada**: `mergeArrivingFlags` com expiração de 4 s, e renderização de `data-arriving` + anúncio de status acessível ("chegou!") na `TeamChannelStrip` e `RailTeam`.

**W2-3 (Assuntos na DM):**
- Prova de funcionamento de 3 assuntos na mesma conversa de DM (`tests/dm-subjects.client.spec.tsx` 3/3):
  - `DirectMessagesView` com `SubjectBar` (bolinhas coloridas, contagem de não lidas e anel pulsante de "persona trabalhando").
  - Troca de assunto por clique e navegação de foco por teclado (ArrowRight, ArrowLeft).
  - Painel de mensagens associado ao tablist via `role="tabpanel"` e `id="persona-dm-subject-panel"`.
  - Controle flutuante `MoveMessageSubject` permitindo mover mensagem para outro assunto na DM.

**GOV-8 (Assistente de estrutura em "Contratar"):**
- Cobertura em `tests/connected-persona-editor-hire.client.spec.tsx` (3/3):
  - Fluxo de 4 passos com modelo SaaS levando ao botão "Contratar todos" (`action.hireAll`), criando todas as personas recomendadas via `persona.createPersona` e acionando `onHireComplete`.
  - Ação "Contratar uma persona" (`action.hireOne`) a partir do passo 4 preenchendo o rascunho no editor.

**Arquivos:** `tests/ges-4-ui.client.spec.tsx`, `tests/dm-subjects.client.spec.tsx`, `tests/connected-persona-editor-hire.client.spec.tsx`.

**Testes & Gate:**
- Vitest: 13/13 testes verdes (`ges-4-ui` 7/7, `dm-subjects` 3/3, `connected-persona-editor-hire` 3/3).
- `node scripts/persona/check-pkg.mjs client-ui-persona`: **OK in 28.6s** (sem erros de tipo nem lint).

---

## 2026-11-04 09:40 — V1-P0-4 / FIRST-DELIVERY-SPEC: Primeira entrega sem caminho no vazio

**FIRST-DELIVERY-SPEC:** UI completa do passo 5 do onboarding com os 6 estados (`intro` | `needsEngine` | `working` | `slow` | `failed` | `celebrate`):
- `needsEngine`: se nenhum harness estiver pronto, alerta honesto antes de pedir, botão "Conectar uma IA" (redireciona para passo 3) e "Entrar sem pedir agora".
- `slow`: transição aos 45 s de espera com aviso honesto, opção de entrar e continuar esperando em `#geral`.
- `failed`: `RunErrorCard` integrado com erro localizado, ação de tentar novamente e saída segura.
- `celebrate`: `MilestoneCard` de celebração discreta (Muse) com ações "Aceitar e entrar" e "Pedir ajuste".
- **Store & Overlay:** `setStep` exposto em `OnboardingActions` com persistência de rascunho; `OnboardingShellOverlay` gerencia timer de 45 s, checagem de harnesses prontos, detecção de falha ou celebração.
- **Visão Geral:** Banner peak-end "Primeira entrega a caminho" no topo da Visão Geral (`firstDeliveryPending`) enquanto a entrega estiver ativa antes do marco.
- **Locales:** gerados pt e en para chaves do step5 e overview.

**Arquivos:** `OnboardingFirstDeliveryStep.tsx`, `OnboardingWizard.tsx`, `OnboardingShellOverlay.tsx`, `create-onboarding-store.ts`, `OverviewView.tsx`, `ConnectedOverviewView.tsx`, `persona-live-store.ts`, `persona-remote-types.ts`, `OnboardingWizard.module.css`, locales onboarding/shell.

**Testes:**
- `onboarding-first-delivery.client.spec.tsx` (7/7 passados: intro, needsEngine, working, slow >45s, failed, celebrate, retry)
- `overview-first-delivery.client.spec.tsx` (4/4 passados)
- `first-delivery.host.spec.ts` (2/2 passados)
- `node scripts/persona/check-pkg.mjs client-ui-persona` OK (23.7s, sem erros de tipo nem lint).

---

## 2026-11-04 08:05 — G2 Canvas lista: foco roving + Home/End

**CanvasView:** `useLayoutEffect` sincroniza foco com `listFocusIndex`; `onFocus` na linha; teclas Home/End.

**Testes:** `canvas-list-keyboard.client.spec.tsx` 2/2; `check-pkg client-ui-persona` OK.

---

## 2026-11-04 08:00 — W2-10 Ensinar no cabeçalho da DM

**UI:** `MenuButton` ⋯ no `threadHeader` quando o peer é persona (`onTeach`); locales `dm.threadMenu` / `dm.threadMenuTeach`; `ConnectedDirectMessagesView` → `openTeachPersona(resolveHostPersonaId(...))`; inject em `register-prism-screens`.

**Testes:** `dm-view.client.spec.tsx` +1 (menu Ensinar); `check-pkg client-ui-persona` OK.

**W2-10 UI Prism:** perfil hero ✔ · DM ⋯ ✔ · cartão ⋯ já via `PersonaCardPopoverHost`.

---

## 2026-11-04 07:55 — AG-003 Ensinar no hero do perfil (Keel P1 dogfood)

**W2-10:** botão **Ensinar** (`action.teach`, ícone `BrandIcon ensinar`) no hero de `PersonaProfilePage` ao lado de Conversar/Editar; `RemoteProfilePanel` → `openTeachPersona` (overlay consentimento existente).

**Teste:** `dogfood-ag-003.client.spec.tsx` verde (`.fails` → `it`).

**Gate:** `check-pkg client-ui-persona` OK (+ fixture `channelSubjects`, exactOptional virtual scroller, about-settings test Muse).

---

## 2026-11-04 07:50 — PRO-4 + GOV-8 onboarding RPC + editor gov fields

**PRO-4 (v1):** `overview-now-strip.client.spec.tsx` — chips working/resting/stuck + fila vazia vs tarefa ativa (`OverviewNowStrip`).

**GOV-8:** onboarding passo 4 `StructureAssistant` recebe `structureRemote` (`ctx.remote.persona` + `tenant.workspaceId`) como Contratar; teste editor com setor/responsável/substituto.

**Arquivos:** `mount.ts`, `OnboardingShellOverlay.tsx`, `OnboardingWizard.tsx`, `overview-now-strip.client.spec.tsx`, `persona-editor-preview.client.spec.tsx`.

**Extra:** `seed-default-team` — `listBrainPermissions(tenant)` (PersonaTenantScope); mocks AG-004 alinhados.

**Testes:** overview-now-strip 1 · persona-editor-preview 2 · structure-assistant 4 · seed-default-team · check-pkg OK.

**Dep:** PRO-6/S5/C8 E2E (Probe); GOV-8 aceite app 3 modelos; Anvil dados `nowRows`/away live; Muse visual C5a–d.

---

## 2026-11-04 07:45 — Vigia: Ajuda locale + assuntos + C5b DM + GOV-8

**Ajuda:** `language: ctx.locale.getSnapshot().active` no inject → banner `lang.ptOnly` fora de pt.

**W2-3 / rate-limit:** erro de assuntos usa `subjects.loadError` + retry (não mensagem RPC crua) em #geral e DM.

**C5b:** pass-through followers na DM (`ConnectedDirectMessagesView` + estilos).

**GOV-8:** teste passo 4 inclui região **Teste dos 2 dias**; map-message wire > legacy.

**Testes:** map-message 11 · structure-assistant 4 · help-view +1 · direct-messages-turn-context +1 · locales regen.

**Fila Prism:** S5/S7/GOV-8 aceite app (Probe); C5b pass-through host real; Muse visual; Rivet runError wire.

---

## 2026-11-04 07:35 — Legacy run-error bridge no mapMessage (Muse)

**Pronto:** sem marker `[[run-error:]]` nem `event.runError`, mensagem de **persona** → `legacyRunErrorFromText(body, authorName)` → mesmo `runError` / `ConversationRunErrorCard`. Humano e chat casual não casam.

**Arquivos:** `map-host-ui.ts`, `map-message.client.spec.ts` (+2).

**Testes:** `map-message.client.spec.ts` + `run-errors.client.spec.tsx` → 16 passed.

**Até Rivet:** histórico e runner ainda em texto cru; quando mandarem `code`, wire/marker ganha e legacy não roda.

---

## 2026-11-04 07:25 — GOV-8 aceite 3 modelos + W2-3 undo mover + GES-4 entrada gestor

**GOV-8:** teste parametrizado `agency` / `saas` / `creator` (3–5 personas, Coordenação) + fluxo UI até passo 4 (`structure-assistant.client.spec.tsx` 4/4).

**W2-3:** **Desfazer** mover assunto no #geral e DM — toast guarda `revertSubjectId`; `Connected*` chama `moveMessageToSubject` de volta (host RPC).

**GES-4:** cartão gestor no fio com `usePersonaMotion` preset `character` (entrada).

**Extra:** ícone **busca** do header #geral → `selectPanel('search')` + `SEARCH_FOCUS_EVENT`.

**Testes:** `structure-assistant.client.spec.tsx` → 4 passed.

**Fila:** S5/S7 Probe E2E; GOV-8 aceite app 3 tipos (Probe); PRO-6; Rivet `runError` wire.

---

## 2026-11-04 07:15 — Run errors no fio (Muse RUN-ERRORS-SPEC)

**Pronto:** `mapMessage` lê `runError` no evento ou marker `[[run-error:{json}]]`; `ConversationRunErrorCard` + `run-error-handlers` ligam ações (Ajuda › Conexões, motor, Regras, Uso, Conexões/troca conta, `live.refresh` retry). Canal + DM via `runErrorHandlers` em `register-prism-screens`.

**Arquivos:** `run-error-message.ts`, `run-error-handlers.ts`, `ConversationRunErrorCard.tsx`, `map-host-ui.ts`, `persona-remote-types.ts`, `GeneralChannelView.tsx`, `DirectMessagesView.tsx`, `Connected*`, `register-prism-screens.tsx`, `map-message.client.spec.ts`, `run-error-handlers.client.spec.ts`.

**Testes:** map-message (+2) · run-errors (5) · run-error-handlers (1).

**Dependência Rivet/Anvil:** host ainda posta texto cru; wire `runError` no `MessageView` ou marker no body até migrarem.

**Ajuda (A):** já ligada no turno 07:05 (painel, Mais, Ctrl K, ? → `canais`). Capturas Muse: `.maestri/tmp/shots/design/help/` e `run-errors/`.

---

## 2026-11-04 07:05 — Ajuda shell (Muse): painel + nav + Ctrl K + ? #geral

**Pronto (4 toques Atlas/Muse):**

1. `MainPanelId` **`help`** + `openHelp({ docId?, tab? })` / `helpDocId`·`helpTab` no shell (`create-shell-store.ts`).
2. Rail **Mais → Ajuda** (`nav-groups.ts`, ícone `glossario`, locale `sidebar.help`).
3. `register-prism-screens`: slot `main/help` → `HelpPanel` + `registerHelpLocale`; Ctrl K **Abrir a ajuda** / **Ver novidades** (keywords ajuda, help, guia, novidades, versão).
4. `GeneralChannelView` **?** → `onOpenHelp` → `openHelp({ docId: 'canais', tab: 'guias' })`.

**Arquivos:** `create-shell-store.ts`, `nav-groups.ts`, `register-prism-screens.tsx`, `register-help.tsx`, `GeneralChannelView.tsx`, `ConnectedGeneralChannelView.tsx`, `register-lumen-ui.tsx` (stub shell), `locale-sources/shell.{pt,en}.json`, `tests/create-shell-store.client.spec.ts`.

**Testes:** `vitest run -t openHelp` → 1 passed.

**Dependência Muse:** tela `HelpView` + `generated-help.ts` já no repo; Prism só liga shell. `language` para banner pt-only: pendente wire `ctx.locale` quando expuser idioma ativo.

**Fila:** S5/S7 Probe E2E; GOV-8 aceite 3 modelos; GES-4; Forge marker.

---

## 2026-11-04 06:52 — W2-3 bolinha no cartão (host + live)

**Anvil (seam mínima):** `listTasks` expõe `conversationSubjectId` via screen `ticket_subject` (`screens.screens.get`); `wave2` assert no ticket aberto.

**Prism:** `enrichKanbanCardsFromHost` resolve nome/cor com assuntos do `#geral` no `refresh`; fallback `topicId`; vitest `enrich-kanban-subject`.

**Testes:** wave2 7/7 · enrich-kanban-subject 1/1 · check-pkg client-ui OK (~38s).

**Fila:** S5/S7 E2E Probe; GOV-8 aceite 3 modelos; GES-4 animação cartão gestor; Forge marker/atividade.

---

## 2026-11-04 06:48 — C5b/PRO-4 links + horários UI + GOV-8 smoke

**C5b/PRO-4:** cartão de tarefa no #geral/DM — **Ver contexto** + **Ver no quadro** (`openKanbanTicket`); Visão geral primeira tarefa sugerida → quadro quando wired.

**Horários #geral:** `mapSortedMessageStream` — relógio monotônico na ordem do seq (corrige label regressivo com seed antigo); seed `createDevHarnessMessageClock` (turno anterior).

**GOV-8:** vitest `structure-assistant` — 4 passos até hireAll.

**Testes:** map-message (+monotonic) · structure-assistant · apply-message-stream · general-channel · overview-suggested (turnos recentes).

**check-pkg:** client-ui-persona OK (~24s).

**Dep:** W2-3 bolinha no cartão (Anvil `topicId` em TaskView); PRO-6/S5 E2E Probe; GES-4 animação entrada; Forge gestor marker.

**Fila Prism:** S5 teclado/reduced-motion Probe; GOV-8 E2E 3 modelos; pass-through/cartões C5b restantes.

---

## 2026-11-04 06:42 — Muse recaptura #geral: horários seed + boas-vindas neutras

**(1) Horários** — `createDevHarnessMessageClock`: lote dev seed + gestor compartilham relógio (`next()`); `devHarnessMessageTimes` aceita `pendingOccurredAt` para retomadas idempotentes. Evita `occurredAt` fora de ordem vs seq quando gestor ancorava só no tail persistido.

**(2) Microcópia** — host `onboarding.ts`: `Boas-vindas! Estou aqui para coordenar a equipe.` (+ system welcome neutro). Dep Anvil: workspaces já onboarded mantêm texto antigo até re-seed.

**Testes:** `seed-default-team` (+clock batch) · `onboarding.spec` · turnos anteriores C5b/PRO-4.

---

## 2026-11-04 06:38 — PRO-4 primeira entrega live + foco no quadro

**PRO-4:** `deriveFirstDeliveryMilestone` a partir de `kanbanCards` em `ConnectedOverviewView`; botão **Ver no quadro** chama `openKanbanTicket(taskId)` (mesmo caminho do painel “Enquanto você estava fora”).

**Testes:** `derive-first-delivery` 2/2 · `overview-first-delivery` 3/3.

**check-pkg:** `client-ui-persona` OK (~33s).

**Dep:** Anvil/Lumen — `conversationSubject` no cartão (W2-3 host); Probe PRO-6 boot smoke pós-retry; Forge marker gestor.

**Fila Prism:** C5b cartões de tarefa no stream; GOV-8 E2E/polish Muse; GES-4 UI interruptor.

---

## 2026-11-04 06:32 — Boot gate: listConversationSubjects rate-limit retry

**Prism:** `fetchConversationSubjects` espera `retryAfterMs` (100–2000ms) e tenta **1×** de novo em `rate-limited` (`listConversationSubjects`) — tour/onboarding não estoura pageerror; dedupe inflight mantido.

**Testes:** `remote-unwrap` (+retry) · `conversation-subjects-storm` 2/2.

**Dep Anvil:** TTL/guard no host (já parcial); Probe revalidar boot smoke.

**Fila:** PRO-6 Probe; GOV-8; Forge marker/atividade; W2-3 Lumen cartão.

---

## 2026-11-04 06:17 — PRO-4 away links + GES-3 + Sobre + boot smoke

**PRO-4:** `AwayWhileOutPanel` → `openKanbanTicket` (shell) → `ConnectedGlobalKanban` scroll `[data-persona-kanban-card]`; `mapAwayEventLive.taskId`; locale `overview.awayOpenTask`.

**GES-3 / Gestor:** `resolveGestorPlanForMessage`; `feedbackGestorPlan` + `refresh`; `commentGestorPlanRemote` (wire pronto).

**Sobre:** `AboutPersona` em Configurações; IPC desktop `openExternal` / `openThirdPartyNotices`.

**Boot smoke:** `--host-timeout-ms` default 180s; exit 0 tour 9/9 nesta máquina.

**Testes:** `away-while-out-panel` 1/1 · `create-shell-store` (+openKanbanTicket) · `overview-preview` · `connected-kanban` · `about-*` / `gestor` / `resolve-gestor-plan-display` (turnos anteriores).

**Post-it:** linhas assinadas `[Prism]`; só `maestri note edit` (nunca `write`).

**Fila:** PRO-6 Probe; GOV-8 polish; Forge gestor marker/atividade; Anvil Typert RPC; W2-3 Lumen cartão.

---

## 2026-11-03 — Cartão no quadro (PERSONA-CARD §5.2) + assets

**(1) Quadro** — `PersonaCardShellBridge` propagado `mount` → `register-lumen-ui` (slot `kanban`) → `ConnectedGlobalKanban` → `ConnectedProjectFlowBoard` → `ProjectFlowBoard` → `FlowKanbanBoard` (`assigneeCardTrigger` + `PersonaCardPopoverHost`).

**(2) Assets** — `pnpm run build:assets` regenerou `generated-imports.ts` + derivados (check-pkg exigia o arquivo).

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` OK (~32s); vitest apply-structure + create-shell-store + map-persona-card-from-host + canvas-list-keyboard → 6 tests OK.

**Fila Prism** — Muse GOV-9 (visual); Probe GOV-10/PRO-6/PB-9 E2E; PB-5 abas/sidebar (co-Lumen); C5b DM/cartões tarefa no host real; passe visual Muse (C5a–d).

---

## 2026-11-03 — Motor `setPersonaEngine` + cartão no #geral (C5b/C5d)

**(1) Engine** — `PersonaEngineOverlay` (`listConnections` → `setPersonaEngine`); shell `enginePersonaId`; rail «Trocar motor» abre modal (não editor).

**(2) Cartão global** — `PersonaCardShellBridge` + `PersonaCardPopoverHost`; `#geral`: avatares das mensagens + figuras do banner «Sua equipe» abrem `getPersonaCard` (prefetch/hover); `mount`/`registerPrismScreens` injetam bridge.

**(3) Fixes** — OrgChart `chartUi` null TS; testes `MessageView` com `message-view-fixture.ts` (replyToId/reactions).

**Verificação** — vitest apply-structure + apply-message-stream + map-message + create-shell-store → 13 tests OK; gen-locales OK. **check-pkg:** 5 erros alheios (Lumen: approvals adapter, derive-two-day, ConnectedProjectFlowBoard).

**Fila** — cartão no quadro/Kanban (Lumen+Prism); Muse GOV-9; Probe GOV-10/PRO-6 E2E; PB-5 sidebar abas.

---

## 2026-11-03 — GOV-8 `applyStructure` + UI `setPersonaTalkAcl`

**(1) applyStructure** — `structure-rpc-ask.ts`, `fetch-apply-structure.ts`; `StructureAssistant` chama host ao «Aplicar roster» quando `structureRemote`; `hireAll` no Contratar chama `applyStructure` antes de `createPersona`.

**(2) Talk ACL** — `PersonaTalkAclOverlay` (modal workspace vs escolhidos); shell `talkAclPersonaId`; rail/perfil «Editar» → overlay; `cardBridge.invalidate` após save.

**(3) Contrato** — `governance-ui.md` atualizado. Pendente: picker dedicado `setPersonaEngine` (v1 abre editor); Muse GOV-9; Probe GOV-10/E2E.

**Verificação** — vitest `apply-structure` + `create-shell-store` + `map-talk-acl` → 9 tests OK; `gen-client-ui-persona-locales.mjs` OK. **check-pkg `client-ui-persona`:** 2 erros pré-existentes na árvore (`approvals-ui-helpers.ts` ícone `convidar`; `adapters/proactive.ts` exactOptional) — fora do diff Prism.

---

## 2026-11-03 — GOV-8: `recommendStructure` host + fallback local

**(1) Remote** — `resolveStructurePlan()` → Anvil `recommendStructure` quando RPC existe; `mapHostStructureRecommendation`, `sectorNamesForIds`; fallback `recommendStructure()` local.

**(2) UI** — `StructureAssistant` async plan + `explanation` do host no passo 3; `ConnectedPersonaEditor` passa `structureRemote` com tenant. Onboarding pré-tenant continua só local.

**(3) Contrato** — `persona-spec/contracts/governance-ui.md` atualizado. Pendente: `applyStructure` no “Aplicar roster”; preview org/2d do host (opcional).

**Verificação** — `check-pkg client-ui-persona` OK (~29s); vitest map-host-structure + recommend-structure OK.

---

## 2026-11-03 — Cartão: pause/resume + motor + talk edit (rail)

**(1) Runtime** — `persona-card-bridge.togglePause` → `pausePersona`/`resumePersona` + reload card + `live.refresh()`; `inferPersonaPaused` no mapper.

**(2) Rail** — menu Pausar/Retomar, Trocar motor e Editar talk (v1: abre editor); perfil: `onEditTalk` → editor.

**(3) Pendente** — UI dedicada `setPersonaTalkAcl` / picker de motor; host `recommendStructure` async no assistente GOV-8.

**Verificação** — `check-pkg client-ui-persona` OK (~22s); vitest infer-persona-paused + rail-team OK.

---

## 2026-11-03 — Talk ACL no cartão + check-pkg governance

**(1) Talk ACL** — `map-talk-acl.ts`; `persona-card-bridge` busca `getPersonaTalkAcl` junto com `getPersonaCard`; perfil (`lumen-remote-panels`) passa ACL para `personaCardViewToInfo` → linha «Quem pode falar» no popover rail e no herói do perfil.

**(2) [Muse→Prism] cartão** — `format-card-quota.ts` (ISO → hora local); `characterId` via `normalizeCharacterId` (handle/avatarRef, sem `-default`).

**(3) Fixes** — `governance-remote.ts`: `await unwrapRemote` em org/saúde/2 dias; teste `map-governance-ui` sem mutar readonly.

**(3) Fila** — GOV-8 assistente ainda usa `recommendStructure` local (host `recommendStructure` RPC disponível — integração async opcional); Muse GOV-9; Probe GOV-10/E2E/F5; `setPersonaTalkAcl` UI (editar ACL) pendente.

**Verificação** — `check-pkg client-ui-persona` OK (~32s); vitest map-talk-acl + map-governance-ui + map-persona-card + recommend-structure → 8 tests OK.

---

## 2026-11-03 — SNAPSHOT CORTADO: cartão da persona no rail (getPersonaCard)

**(1) Bridge** — `persona-card-bridge.ts`: prefetch lazy + cache + `revision` observable; `persona-card-host-dto.ts` + `map-persona-card-from-host.ts` (sem import de valor do host).

**(2) Shell** — `mount.ts` injeta `cardInfo`, `prefetchPersonaCard`, `cardDict` (profile locale); `PersonaSidebar` subscreve revisão; `RailTeam` chama prefetch no hover/⋯.

**(3) Keel fila** — GOV-8 UI/RPC cliente ✔; cartão rail ✔; pendente Muse GOV-9 polish, `getPersonaTalkAcl` no cartão (opcional), Probe GOV-10/E2E.

**Verificação** — `check-pkg client-ui-persona` OK (~26s); vitest `map-persona-card-from-host` + `rail-team` OK.

---

## 2026-11-03 — Vigia Atlas: governance RPC + C5b/G2 verdes + rail sendToPersona

**(1) GOV remote** — `governance-remote.ts`: detecção `'getOrgChart'|'getTeamHealth'|'runTwoDayTest'|'applyGovernanceFix' in client` + `unwrapRemote`; tipo `GovernanceFixKind` em `governance-contract.ts`; `ConnectedOrgChartPanel` sem cast `Record<string, unknown>`. `apply-persona-governance.ts`: `setPersonaGovernance` via `in` + `substituteMemberId` sempre string (contrato Anvil).

**(2) Rail Muse** — `mount.ts`: `sendToPersona(id,text)` → DM + `postDmMessage`; `editPersona` → `openPersonaEditor`.

**(3) Fila PLAN** — C5b DM turn-context ✔; GOV-8 UI ✔ (RPC live quando typert expõe); G2 lista/teclado ✔ (teste). Pendente: Muse GOV-9 polish, Probe GOV-10/E2E/S5/C8/PRO-6, Anvil dados PRO-4 live, Lumen WorkflowEditorModal se regressão.

**Verificação** — `check-pkg client-ui-persona` OK (~21s); vitest turn-context canal+DM (6) + `recommend-structure` + `canvas-list-keyboard` OK.

---

## 2026-11-03 — Snapshot Keel (aguardando SNAPSHOT CORTADO)

**check-pkg `client-ui-persona`:** **NÃO VERDE** (3 erros, ~38s) — `WorkflowEditorModal.tsx:318` (`exactOptionalPropertyTypes` em `options`); `workflow-editor-modal.client.spec.tsx` chaves `editor.dragColumn` / `editor.fields` ausentes no kanban locale. **Dono UI fluxo:** Lumen. **[Prism→Lumen]** corrigir antes do publish.

**Prism neste snapshot:** C5b DM (`loadTurnContext` + `turnContext` + `taskTitleById` em `selectDm`) e GOV-8 já na árvore; sem novos edits até post-it **SNAPSHOT CORTADO**.

---

## 2026-11-03 — GOV-8: assistente de estrutura + governança no editor

**(1) Assistente** — `StructureAssistant` (4 passos), `recommendStructure`, prévia `OrgChart` + `TwoDayTimeline`; onboarding passo 4 (`step4.structureOpen`); Contratar via `ConnectedPersonaEditor` (fase assistente → editor; contratar um/todos).

**(2) Editor** — campos `sectorId` / `responsibleMemberId` / `substituteMemberId` no draft; card “Quem cuida dela” com picklists; `applyPersonaGovernanceIfSupported` (stub até GOV-5).

**(3) Contrato** — `persona-spec/contracts/governance-ui.md`.

**Testes** — `recommend-structure.client.spec.ts`; hire/onboarding specs atualizados (`structureDict`, pular assistente).

**Verificação** — `gen-client-ui-persona-locales.mjs`; `check-pkg client-ui-persona` OK (~20s); vitest recommend-structure + hire + onboarding-builder OK.

**Dependências** — host `setPersonaGovernance` / `recommendStructure` (Anvil GOV-5); polish visual assistente (Muse GOV-9); aceite E2E (Probe GOV-10).

---

## 2026-11-03 — Keel P0: snapshot verde (composer anexos + check-pkg)

**(a)** `gen-client-ui-persona-locales.mjs` — chaves composer `attachFailed` / `attachmentsLabel` / `attachUploading` / `attachRemove` no `chat/locales.ts`.

**(b)** Live store: `uploadChannelAttachment` / `uploadDmAttachment` (API pública); DM + `#geral` wired (`ConnectedDirectMessagesView`, `DirectMessagesView`); doubles de teste atualizados; `onSend(body, attachmentIds)`.

**(c)** `WorkflowEditorModal`: limpar WIP sem `{ wip: undefined }` (exactOptionalPropertyTypes).

**Extra (bloqueava check-pkg):** `governance-remote` unwrap tipado; `map-governance-ui` groups array; registro GOV painéis + locale em `register-lumen-ui`.

**Verificação** — `check-pkg client-ui-persona` OK (~22s); vitest 5 specs (8 tests) OK; `with-lock` + `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK.

---

## 2026-11-03 — Muse P0: bundle purity + anexos prep

**(1) Bundle** — removido import `@deepseek-ai/dsh-persona-host/src/draft.ts`; fallback determinístico em `hire/fallback-persona-draft-wire.ts` (espelha Rivet `fallbackDraft`).

**(2) Anexos (fase 2 prep)** — `postChannelMessage(body, attachmentIds?)` → `postMessage.attachmentIds`; probe `resolve-composer-host-ready.ts` (flags UI ainda `false` até chips/upload UI).

**Testes** — `hire-wiring` (fallback wire); `resolve-composer-host-ready.client.spec.ts`.

**Verificação** — `check-pkg client-ui-persona` → OK (~21s).

**Dependências** — UI composer anexos/avatar (flip flags + chips); Typert `postMessage` regen se gate CI exigir.

---

## 2026-11-03 — Perfil: onMessage/onEdit + editor shell + createPersona runner

**(1) Profile (dados, sem JSX Muse)** — `RemoteProfilePanel`: `onMessage` → `openPersonaDm`; `onEdit` → `openPersonaEditor`; `resolveProfileProjectNames` (nomes, não ids); `showPersonaEditor` = hire ou `profileEditorOpen`.

**(2) Shell** — `profileEditorOpen`, `openPersonaEditor` / `closePersonaEditor`; `mount` fecha editor ao abrir perfil da rail; `onHireComplete` no editor.

**(3) Hire RPC** — `draftToCreatePersonaRequest` distingue `dsh` vs `cli` (`oar:*` harness).

**(4) Contrato** — `persona-spec/contracts/persona-editor-remote.md`.

**Testes** — `create-shell-store` (openPersonaEditor); `hire-wiring` (runner + project names).

**Verificação** — `check-pkg client-ui-persona` → OK (~31s).

**Dependências** — copy vazio “Atividade recente” (Muse JSX); laziness live por runner (Anvil/Rivet); E2E S5/C8/PRO-6 (Probe).

---

## 2026-11-03 — Keel/Muse: vitrine "monte sua equipe" (dados/RPC)

**(1) Hire (`ConnectedPersonaEditor`)** — `mode='new'` + rascunho vazio (`createEmptyHireDraft` + `pickUnusedGalleryAnimal` via `listPersonas`); sem `draftPersona` no load inicial.

**(2) Builder** — `onDraftFromDescription` → Remote `draftPersona` (+ `createdBy`); fallback determinístico `draftPersonaFromDescription` (host) se RPC falhar; `wirePersonaDraftToUi` (systemRoles → Coordenação/Vigia, sem nomes fixos D-043).

**(3) Runners** — `listConnections` → `connectionsToRunnerOptions` (hints estáticos Rivet até read-model; `phase: checking` ⇒ `connected` true, sem chip “desconectado”).

**Arquivos** — `hire/{gallery-animals,empty-hire-draft,wire-persona-draft-to-ui,connections-to-runner-options}.ts`, `ConnectedPersonaEditor.tsx`.

**Testes** — `hire-wiring.client.spec.ts`, `connected-persona-editor-hire.client.spec.tsx`; fix `attachmentIds` em stream specs; `live-tenant-bridge` + `useShell`.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~25s).

**Dependências** — JSX/CSS vitrine congelada (Muse); laziness live por runner quando Anvil expuser; composer anexos fase 2 (Anvil).

---

## 2026-11-03 — PB-5 (parte Prism): Projetos → quadro + abas shell

**(1) Shell** — `boardsFocusProjectId`, `openProjectBoard`, `clearBoardsFocusProject` em `create-shell-store.ts`; `ProjectsPanel` + `register-prism-screens` inject; `mount.ts` → `LumenShellBridge` para Lumen.

**(2) Quadros** — `ConnectedGlobalKanban` consome focus one-shot → modo projeto; `navigateProjectTab` no `register-lumen-ui.tsx` (Conversa/Arquivos/Rotinas/Sprints stub); `ProjectWorkspaceTabs` + locales `project.tabs.*`; `ProjectFlowBoard` repassa `onWorkspaceTabChange`.

**(3) Testes** — `create-shell-store.client.spec.ts` (openProjectBoard); `project-workspace-tabs.client.spec.tsx`; `live-tenant-bridge.client.spec.tsx` + `connected-kanban.client.spec.tsx` com `useShell`/`clearBoardsFocusProject`. Fixtures stream: `attachmentIds: []` em `apply-message-stream` / `map-message` (tipo host Anvil).

**(4) Contrato** — `persona-spec/contracts/ui-shell.md` § PB-5.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~20s).

**Dependências** — PB-5 restante (grade global, colunas por projeto, Sprints) → Lumen; E2E PB-9 → Probe; composer anexos fase 2 → Anvil.

---

## 2026-11-03 — Keel: botões mortos composer + upload avatar (fase 1)

**(1) #geral/DM composer** — `ComposerToolButton` + flags em `composer-host-capabilities.ts`: anexo/imagem/+ desligados até `PERSONA_MESSAGE_ATTACHMENTS_HOST_READY`; emoji/@ desligados até flags próprias. `aria-disabled`, `disabled`, rótulo `"{ação} — Em breve"`. Teste `channel-composer-dead-controls.client.spec.tsx`.

**(2) Editor persona** — chip “Enviar imagem” bloqueado até `PERSONA_AVATAR_UPLOAD_HOST_READY` (`field.avatarUploadSoon`). Teste `persona-editor-upload-gate.client.spec.tsx`.

**(3) Fase 2 (Anvil)** — quando Status avisar: flip flags + UI de anexos (progresso, chips, erros pt-BR) e upload real; testes com remote falso (sucesso/erro/cancelar).

**Verificação** — `gen-client-ui-persona-locales.mjs`; `check-pkg client-ui-persona`.

---

## 2026-11-03 — C5b stream/cartões + shell nav + contrato

**(1) C5b** — Testes: `map-message.client.spec.ts` (título via `taskTitleById`), `connected-general-channel.client.spec.tsx` (`loadTurnContext`), `create-shell-store.client.spec.ts` (painel não redireciona sozinho; só dismiss onboarding → `#geral`). Contrato `channel-stream-remote.md` atualizado (cartões + turn context live).

**(2) Typecheck compartilhado** — Ajustes mínimos em kanban/quadros (Lumen/Forge landing): `SprintBand` optional props, `NewProjectFlowModal` Card, `ConnectedGlobalKanban`/`ConnectedProjectFlowBoard`, `WorkflowEditorModal` `open={true}`.

**Verificação** — `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~25s).

**Dependências** — E2E C5b/C9/S5/PRO-6 (Probe); visual cartões/stream (Muse); `getProjectBoard`/PB-4 host (Anvil) para fluxo por projeto completo.

---

## 2026-11-03 — PRO-4/C8 visão geral + D-043 copy + G2/PB typecheck

**(1) C8 / PRO-4** — `OverviewView`: card “primeira tarefa” usa título live (`suggestedTask.title` do host) quando a equipe não tem tarefa ativa; `ConnectedOverviewView` já passava `live.suggestedTask`. Teste `overview-suggested-task.client.spec.tsx`.

**(2) D-043 neutro** — locale-sources: `overview.teamIntroLine`, kanban/files/routines empty hints; `overview.awayEvent3Body`, `composer.modelAtlas` → Coordenação; regen locales.

**(3) G2** — teste `canvas-list-keyboard.client.spec.tsx` (lista + ArrowDown roving focus).

**(4) PB hub (typecheck)** — `derive-board-summaries` contagens imutáveis; `BoardsHome` Tabs `label`/`idPrefix`; `flow-models` fallback ícone; `enrichKanbanCardsFromHost` `KanbanCardModel` + optional `assigneeState`. Teste `derive-board-summaries.client.spec.ts`.

**(5) C5b** — teste pass-through visível em `general-channel-turn-context.client.spec.tsx`.

**(6) DMs (Muse→Prism)** — `onNewConversation` ligado (`openFirstAvailableDm` + `resolveHostPersonaId` para `createDm`); teste `resolve-host-persona.client.spec.ts`.

**Verificação** — `node scripts/persona/build-assets.mjs`; `node scripts/persona/check-pkg.mjs client-ui-persona` → OK (~24–75s).

**Dependências** — PRO-6/S5/C8 E2E e gate completo Lumen → Probe; polish visual PRO-4/C5 → Muse; `usage` adapters vs host types (Lumen/Anvil) fora do check-pkg Prism.

---

## 2026-11-03 — Keel onboarding: overlay + guia neutro

**(1) Overlay** — `publishHostOnboardingState` no live store: re-lê `getOnboarding.firstUse` após cada `refresh` (incl. dev seed `completeOnboarding`); cache local só 1ª pintura. Teste `onboarding-overlay-sync.client.spec.ts`.

**(2) Copy D-043** — guia neutro (`guide.name` Guia/Guide; `stepN.guideSays` sem Atlas); arte dos cachorros acenando mantida. `[Prism→Muse]` alinhar vitrine se quiserem label "Persona" no balão.

**Contrato** — `onboarding-remote.md` atualizado.

**G2** — Canvas modo lista: roving `tabIndex` + setas ↑/↓ entre linhas.

---

## 2026-11-03 — Boot gate + roster hardening

**Bootstrap gate (Probe/ui-boot-check)** — `BOOT_GATE_PRISM_PANELS` (Visão geral + #geral só); `sanitizeBootstrapPageErrors` / `recordBootstrapPageError` (ignora `ERR_INSUFFICIENT_RESOURCES`, cap `gateway/internal`). Teste `persona-e2e/tests/boot-gate-sanitize.spec.ts`.

**Roster** — `personaRosterTier` tolera `systemRoles` ausente; teste `map-rail-team` ordem Atlas→Luna na saída do mapper (RailTeam ainda reordena por estado/atencão — Muse).

**Dependência** — painéis Lumen no gate completo (`BOOT_GATE_MAIN_PANELS`) ficam com Probe/mandatory-boot.

---

## 2026-11-03 — Keel P0: duplo unwrap bootstrap (repasse Muse)

**(a)** Bootstrap usa `rawRemote` + `unwrapRemote` só em `bootstrap-tenant.ts`; live store mantém proxy Muse para refresh/RPC (comentário em `createPersonaLiveStore` + `persona-remote-unwrap.ts`).

**(b)** `createWorkspace` trata `conflict` como workspace já existente.

**(c)** `bootstrap-tenant.client.spec.ts` — RemoteResult fake + 2ª bootstrap sem exceção; `remote-unwrap` seed 5 personas + mensagens intacto.

**ui-boot-check (21:16)** — light/dark + channel: **5 personas**, Atlas/Coordenação primeiro (dev seed). Bootstrap gate falhou neste host: `ERR_INSUFFICIENT_RESOURCES` (10364 console errors ao navegar painéis) — ambiente, não unwrap. Shots: `.maestri/tmp/shots/persona-light*.png`.

---

## 2026-11-03 — Keel channel-light: roster, stream order, dev seed

**(1) Responde / Sua equipe** — `sortPersonasForUi` (coordination → nome → watchdog via `systemRoles`); rail/strip/composer; `defaultChannelResponderId` (Atlas, não Luna).

**(2) Mensagens** — `sortMessageStreamEvents` (seq, depois `occurredAt`); baseline em `apply-message-stream` ignora `frame.order` errado; live store já ordena páginas.

**(3) Dev seed / scripted** — `seedDevHarnessScenario` + `runDevHarnessSeedIfEnabled` só com `persona.devSeed.v1`; posts com `devHarnessMessageTimes` após welcome (horas crescentes). Produção: host `allowsScriptedReplies()` = `VITEST` ou `PERSONA_SCRIPTED=1` (ack Anvil no runner real).

**Testes** — `sort-personas.client.spec.ts`, `apply-message-stream` baseline seq, `devHarnessMessageTimes`.

---

## 2026-11-03 — Unwrap (Muse) revisado + hire createPersona + boot

**Unwrap (Keel P0)** — Muse: `persona-remote-unwrap.ts` + proxy em `createPersonaLiveStore`. Prism revisou; `remote-unwrap.client.spec.ts` **4 passed** (bootstrap/refresh/seed + erro legível, sem `.find is not a function`).

**Hire (dados)** — `map-draft-to-create-persona.ts`; `ConnectedPersonaEditor` Salvar em hire → `createPersona` + `setPersonaAutonomyLevel` + `refresh`.

**ui-boot-check** — lock após Muse design-shots; light/dark/channel render OK; `exec-bootstrap-gate` falhou **playwright não instalado** neste host (Probe/CI). Dependência ambiente.

**Fixes colaterais** — `usage.ts` origin `estimate`→`estimated`; testes message `source`.

---

## 2026-11-03 — C5b #geral: cartão de tarefa + painel contexto (dados)

**UI mínima (Muse pode refazer drawer)** — mensagens com `ticketId`/`taskTitle` exibem botão que chama `onLoadTurnContext`; snapshot `turnContext` renderiza painel (`context.*` locales). Contrato `turn-context-remote.md` atualizado.

**Teste** — `general-channel-turn-context.client.spec.tsx` (click → RPC hook).

**check-pkg** — OK após `gen-client-ui-persona-locales`.

**Pendente** — unwrap Muse (`persona-live-store` moratória) → revisão + `ui-boot-check`; C8 1ª tarefa (Anvil); PRO-4 editor visual (Muse); `createPersona` no Salvar (hire).

---

## 2026-11-03 — Keel P0: unwrap RemoteResult (Muse dona)

**Causa painéis “Carregando…” / seed** — `ctx.remote.persona.*` → `RemoteResult`; live store usava retorno cru (`channels.find is not a function`). **Muse** autorizada: proxy único de unwrap em `createPersonaLiveStore` (+ teste). **Prism:** moratória em `bootstrap-tenant.ts`, `persona-live-store.ts`, `seed-default-team.ts` até `"unwrap done"` no Status; não comecei o mesmo conserto. Depois: revisar proxy + `ui-boot-check`.

**Paralelo (outros arquivos)** — `ConnectedPersonaEditor` (hire + `setPersonaAutonomyLevel` no Salvar), `autonomy-remote.md`, Members/Canvas `onRemoteRetry`, `KanbanReviewSheet` load `{state}`.

---

## 2026-11-03 — Keel: fronteira Muse + canal Status

**Fronteira (ok)** — Muse: JSX/CSS DMs, Projetos, Busca, Contratar. Prism: `ConnectedDirectMessagesView`, DMs live, dados `ProjectsPanel`, `setPersonaAutonomyLevel`, hire remote.

**Comunicação Prism↔Muse** — sem `maestri ask` direto; usar post-it **Persona · Status** com `[Prism→Muse] …` / `[Muse→Prism] …`; reler Status a cada relato; repasse via Keel se preciso.

**Host** — inject `personaRunners`: Anvil P0 (Prism segue mocks/contratos até voltar).

---

## 2026-11-03 — check-pkg verde + PRO-4 autonomy seam + fronteira Muse

**check-pkg** — `KnowledgeVault` Card `tone` spread; `live-tenant-bridge` test usa `snapStore.set` (sem cast); stubs `setPersonaAutonomyLevel`; `CanvasView` illustration `empty-vault`; `PersonaProfilePage` chip danger em `error` (não `blocked`). → **OK 39s**.

**PRO-4 (dados)** — `autonomy-map.ts` (tier ↔ host mode); `PersonaRemote` `setAutonomy`/`getAutonomy` full row; `PersonaLiveStore.setPersonaAutonomyLevel` (patch budgets). UI editor ainda mock; Muse SCREEN-SPECS depois.

**Observables** — `live-rail-bridge` (Muse) + `live-tenant-bridge` já cacheiam referência (React #185).

**Fronteira Muse (auditoria e)** — resposta acordada: **Muse** JSX/CSS de DMs, Projetos, Busca, Contratar; **Prism** `ConnectedDirectMessagesView`, live DMs, `ProjectsPanel` dados, `setPersonaAutonomyLevel`, hire remote. `maestri ask "Muse"` falhou (`No route for POST /ask`) — Keel/Miguel repassar se necessário.

**Testes** — `vitest` autonomy-map, live-tenant-bridge, observable-bridges → 7 passed.

**Dependências** — host `personaRunners` inject (seed/capturas); C8 1ª tarefa Anvil; Muse vitrines antigas (editor/hire).

---

## 2026-11-03 — Muse: seed realista (#geral / Visão geral)

**Template** — `SUGGESTED_TEAM_GALLERY` + `equipeAnimais` (via `GALLERY_SUGGESTED_DRAFTS`): Atlas/Bento/Nina/Sol/Luna com papéis Coordenação/Engenharia/Pesquisa/Relacionamento/Vigia + `avatarRef` + roles coordination/watchdog. `MOCK_INTRO_LINES` usa nomes dos bichos.

**Dev harness** — `seedDevHarnessScenario` (gated `persona.devSeed.v1`): `completeOnboarding` displayName Miguel, 4 `postMessage` idempotentes no #geral, `proposeHire` `dev-harness-v1-hire` → títulos em `attentionTitles` (live store). Tarefa `doing` via ingest da msg do Miguel. Reações: sem RPC no host. Muse: `localStorage persona.devSeed.v1=1` no initScript de `design-shots.mjs` (avisado via `maestri ask`).

**Arquivos** — `seed-default-team.ts`, `mock-data.ts`, `persona-live-store.ts` (refresh approvals + `runDevHarnessSeedIfEnabled`).

**Testes** — `vitest` seed-default-team (4 passed).

---

## 2026-11-03 — Keel P1: painéis em branco (slot inject) + C5b dados

**Causa kanban** — `InjectFace` expõe `useLive`/`useTenant`, não `hooks`; `ConnectedGlobalKanban` lia `hooks.live` → throw → main vazio. Corrigido: `refresh` no inject raiz; painel usa `useLive`/`useTenant`.

**Connections** — `ConnectionsView` sincroniza `initialState` quando o Remote load muda (loading→ready/empty).

**C5b (dados)** — `passThroughFollowers` + DMs (`selectDm`/`postDmMessage`/stream dm); `ChannelMessageUi.taskTitle` para cartões (Muse estiliza no #geral); contrato `channel-stream-remote.md`.

**PRO-4** — Visão geral: `nowRows`/`awayEvents`/`attentionTitles` já live; `userName` do member owner (não mensagem).

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → (ver abaixo)
```

**Pendente:** C8 1ª tarefa pós-onboarding (host); cartão de tarefa visual (Muse); `Contexto usado` Remote; Probe detector painel vazio.

---

## 2026-11-03 — check-pkg verde: kanban remoto, review wire, C5c roster sync

**Kanban** — `ConnectedGlobalKanban` usa `useSyncExternalStore` nos observables (sem `InjectFace` quebrado); cards do live store.

**Review (Lumen/Prism seam)** — `persona-review-remote.ts` tipa `reviewSummary`/`acceptReview`/… até Typert regen; `ReviewDeliveryPanel` empty illustration; locales `empty.illustration`.

**C5c** — `ChannelComposer` re-sincroniza persona “Responde” quando `members` muda pós-onboarding.

**Fixes** — `connectionsToEntries` omit `errorCode`; kanban `exactOptionalPropertyTypes` spreads.

**Verificação**

```
node scripts/persona/gen-client-ui-persona-locales.mjs → OK (review)
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 21.3s
pnpm exec vitest run …/apply-message-stream …/roster-from-draft → 3 passed
ui-boot-check → exit 1 (EADDRINUSE 127.0.0.1:3080; host já em execução — re-rodar sob with-lock quando Probe liberar)
```

**Pendente PLAN:** C5b cartões/pass-through/DM; PRO-4 dados Anvil; C8 1ª tarefa; F5 a11y; Typert regen review RPCs.

---

## 2026-11-03 — C5b stream + onboarding galeria + S5 roster host

**Onboarding (S5/C8)** — passo 4 usa `GALLERY_SUGGESTED_DRAFTS` ← `SUGGESTED_TEAM_GALLERY` (nomes genéricos; refs brush); `rosterFromDrafts` envia `galleryRef` + `systemRoles` em `completeOnboarding`.

**Canal (C5b)** — `followMessages` no `PersonaLiveStore` (pós-bootstrap, `AbortSignal`); merge `applyMessageStreamFrame`; contrato `persona-spec/contracts/channel-stream-remote.md`. `refresh`/`listMessages` mantidos; envio otimista local antes de `postMessage`.

**Gates / Probe** — `persona-e2e/README.md`: onboarding real vs `PERSONA_DEV_SEED=1`. `PersonaSidebar` TS (`className ?? ''`) → `check-pkg` verde.

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 17.9s
pnpm exec vitest run …/apply-message-stream.client.spec.ts …/roster-from-draft.client.spec.ts …/seed-default-team.client.spec.ts → 7 passed
ui-boot-check: bloqueado em with-lock aguardando "Probe real gallery" (não re-executado neste turno)
```

**Dependências:** C5c composer↔personas reais (Muse `ChannelComposer`); cartões de tarefa/pass-through; PRO-4 dados live (`PRO-2` Anvil).

---

## 2026-11-03 — Keel P1: seed fora do bootstrap (D-043 / D-045)

**Produção** — `PersonaLiveStore.bootstrap` só `getOnboarding` + `refresh`; zero personas até `completeOnboarding` / `commitOnboardingRoster`. Galeria `SUGGESTED_TEAM_GALLERY` (refs brush; nomes genéricos) não auto-cria.

**Dev** — `runDevHarnessSeedIfEnabled` só em `mount.ts` após bootstrap, gated por `persona.devSeed.v1` (`PERSONA_DEV_SEED=1` nos gates). `real-app-shots.mjs` e `ui-boot-check.mjs`: onboarding real ou dev seed (removido skip via `persona.onboarding.complete.v1`).

**Testes** — `persona-host/tests/onboarding.spec.ts` fresh home → `firstUse` + 0 personas; client gallery/dev-seed specs.

---

## 2026-11-03 — Brush banners + onboarding Remote + seed equipe

**Banners (Brush)** — `node scripts/persona/build-assets.mjs` → 125 files, 2.54 MiB; exports `teamBannerLight/Dark`, `railFoliage`, `railFoliageLight/Dark`. Faixa `#geral` usa WebP claro/escuro; rodapé do rail com arte Brush (fallback gradiente).

**Onboarding** — contrato `persona-spec/contracts/onboarding-remote.md`; `getOnboarding` autoritativo; `localStorage` só cache otimista; `PersonaLiveStore.completeOnboarding()` chama RPC quando Anvil expuser (senão `commitOnboardingRoster`).

**Remote** — `seedDefaultTeamIfEmpty` (Atlas/Bento/Nina/Sol/Luna); `markVisit`; mocks só enquanto `!live.ready`.

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona → OK
pnpm exec vitest run …/onboarding-remote.client.spec.ts …/seed-default-team.client.spec.ts → 5 passed
node scripts/persona/with-lock.mjs "Prism banner shots" -- node scripts/persona/real-app-shots.mjs → exit 0
Capturas: .maestri/tmp/shots/real/persona-{light,dark}-*.png
```

**Dependência:** Anvil `completeOnboarding` (wire já pronto). Muse: `DESIGN-SYSTEM.md` + dona theme/primitives — não editar até spec por tela.

---

## 2026-11-03 — PROACTIVITY.md (UI v1): Agora, while away, editor, estados honestos

**Escopo (Atlas / Miguel)**

- Visão geral: faixa **Agora** (estado + tarefa + fila por persona), painel **Enquanto você estava fora** (peak-end, `sessionStorage` por sessão, links secundários para tarefas).
- Editor de persona: **autonomia** (só quando pedido · propor · agir dentro de limites) + **orçamento de atenção** com hints (PROACTIVITY §4–§6).
- Faixa `#geral`: estados `working` · `resting` (zzz legítimo) · `stuck` · `waiting`; pose `descansando` quando em repouso.

**Arquivos:** `team/persona-work-state.ts`, `overview/{OverviewNowStrip,AwayWhileOutPanel,mock-overview-proactivity}.tsx`, `OverviewView.tsx`, `PersonaEditor.tsx`, `persona-draft.ts`, `locale-sources/shell.*`, `persona-editor.*`, `mount.ts`, testes preview.

**Verificação**

```
node scripts/persona/gen-client-ui-persona-locales.mjs
node scripts/persona/check-pkg.mjs client-ui-persona → OK in 16.2s
pnpm exec vitest run …/overview-preview …/team-strip-preview …/persona-editor-preview
→ Test Files  3 passed (3) | Tests  3 passed (3)
node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle → OK
```

**Fora:** dados ainda mock (`MOCK_OVERVIEW_NOW` / host stream); links do away summary sem navegação real; wire autonomia/orçamento → Forge/host.

---

## 2026-11-03 — Revisão Keel (dirD + UX-GUIDE): marca, rail, #geral, RCD chip, a11y

**Princípios RCD / lentes**

1. **Marca (lente acessibilidade AA):** símbolo âmbar 40 px + wordmark branco ~28 px (`--persona-active-rail-ink`), sem wordmark escuro sobre roxo.
2. **Rodapé (usabilidade):** sidebar coluna flex — marca fixa, `navScroll`, rodapé fixo + `padding-bottom`/`safe-area-inset-bottom` (Configurações visível em 1280×720 e 1920×1080).
3. **Toque (AA):** nav ~18 px, linhas `min-height: 3.5rem`, ícones 24 px, `:focus-visible` no rail.
4. **Neutrality is omission:** chip de atenção na Visão geral = `overview.attentionAction` (“Revisar”); ação primária âmbar só na tarefa sugerida; atenção em `secondary`.
5. **Never blank dashboard:** default `activePanel: channels` → `#geral` (faixa “Sua equipe neste canal”, mensagens, composer); Visão geral com intro da equipe + 1ª tarefa quando o usuário navega.
6. **Foco:** onboarding input + itens do rail com anel `focus-visible`; gate registra `Tab×2` → `BUTTON`.

**Arquivos (principal):** `PersonaSidebar.{tsx,module.css}`, `PersonaAppFrame.module.css`, `create-shell-store.ts`, `GeneralChannelView.tsx`, `TeamChannelStrip.tsx`, `OverviewView.tsx`, `OnboardingWizard.module.css`, `locale-sources/shell.{pt,en}.json`, `scripts/persona/{ui-boot-check,compare-shot-dirD}.mjs`

**Verificação**

```
node scripts/persona/check-pkg.mjs client-ui-persona
→ client-ui-persona: OK in 13.4s

pnpm exec vitest run …/overview-preview.client.spec.tsx …/team-strip-preview.client.spec.tsx
→ Test Files  2 passed (2) | Tests  2 passed (2)

node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
console errors (0):
(none)
[a11y] focus after Tab×2: BUTTON
{"actualPath":"…/persona-light-channel.png","referencePath":"…/dirD-tela.png","diffRatio":0.3485262345679012,"diffPixels":451690,"pass":true,"diffOverlay":"…/persona-light-channel.diff.png"}
shots: …/persona-light.png, persona-dark.png, persona-light-channel.png, persona-light-720.png, persona-light-1080.png
```

**Capturas:** `.maestri/tmp/shots/persona-light.png` (1ª visita + overlay onboarding), `persona-dark.png`, `persona-light-channel.png` (Probe vs dirD), `persona-light-channel.diff.png`, `persona-light-720.png`, `persona-light-1080.png`.

**Fora / próximo:** diff ~35% ainda esperado (viewport 1440×900 vs ref 1671×941, motion/tokens); Tab completo rail+composer no gate; Probe axe/motion-jank separado.

---

## 2026-11-03 — build-assets gerador + check-pkg + assets/shell/#geral (em curso)

**Correções**

- `build-assets.mjs`: imports antes dos `export const` (elimina TS1005 em `generated-imports.ts`).
- Recriado `assets/asset-url.ts`; `preview/shell-translate.ts` para testes (`TranslateNS<'persona.shell'>`).

**Verificação**

```
node scripts/persona/build-assets.mjs
node scripts/persona/check-pkg.mjs client-ui-persona
→ client-ui-persona: OK in 15.2s

node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
→ lib/client.js + lib/assets (~2.13 MiB bundle output)

node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
console errors (0): (none)
→ sidebar: Equipe/Busca/…/Conectado/Configurações; onboarding passo 1 overlay (home temp)
```

---

## 2026-11-03 — URGENTE boot branco (remote inject + sidebar.settings)

**Pronto**

- `mountPersonaUi`: removido `ctx.remote.persona.ping()` antes de `ctx.inject`; ping só dentro de `registerUi` (padrão Forge).
- `PersonaSidebar`: declara filho `sidebar.settings` + `renderSlot('sidebar.settings', { wide: true })` para `ui-settings-general` / `configForms`.
- Spike `ui-composition.md`: `ui-settings` + `ui-settings-general` ativos; `message-quotes`, `ui-secret-mask`, `directory-picker` desativados (Keel patch).

**Gate ui-boot-check (Chrome real)**

```
node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
[light] title="DSH Local Build" text: Persona | Visão geral | … | Persona host online · p1 | Configurações | Precisa de você | … | Passo 1 de 5 | …
[dark] (mesmo conteúdo)
--- all console (light) ---
console errors (0):
(none)
shots: C:/Users/migue/dev/persona/.maestri/tmp/shots/persona-light.png, persona-dark.png
```

Captura: shell Persona + overlay onboarding + “Precisa de você” + Configurações no rodapé (alinhado RCD / dirD: rail roxa, conteúdo claro).

**Arquivos:** `mount.ts`, `PersonaSidebar.{tsx,module.css}`, `persona-slots.ts`, `persona-spec/spikes/ui-composition.md`, `persona-spec/contracts/ui-shell.md`

**Rebuild:** `with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` (após fix mount).

---

## 2026-11-03 — A7p2 shell + overlay onboarding + C5d/C5b previews

**Pronto**

- SlotMap Persona (`persona-slots.ts`), `PersonaAppFrame`/`PersonaSidebar` com `PropsRuntime<'root'>` + `useShell` (InjectFace).
- `mountPersonaUi`: root/sidebar/main overview + `shell.overlay` id `persona.onboarding`; ping no store compartilhado; onboarding overlay com dismiss (RCD: valor antes de config).
- Visão geral “Precisa de você” primeiro; shell pt-BR; contrato `persona-spec/contracts/ui-shell.md` atualizado (Lumen paths, augmentation).
- Previews: faixa de equipe (`TeamChannelStrip`), stream mock (`ConversationStreamPreview`); teste `team-strip-preview.client.spec.tsx`.
- `tsconfig` exclude pastas Lumen; teste onboarding-builder usa chave de locale; motion delay fix oxlint.
- Bundle `lib/client.js` sob trava.

**Arquivos (principal)**

- `packages/persona/client-ui-persona/src/client/{shell,mount.ts,overview,onboarding,team,chat}/**`
- `locale-sources/shell.{pt,en}.json`, `tests/*.client.spec.*`, `persona-spec/contracts/ui-shell.md`

**Verificação**

```
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
→ exit 0

pnpm exec vitest run … (10 arquivos Prism, excl. kanban-preview Lumen)
 Test Files  10 passed (10)
      Tests  13 passed (13)

node scripts/persona/with-lock.mjs "Prism bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
→ lib/client.js ~94.73 kB

pnpm exec oxlint <pastas Prism> → exit 0
```

## 2026-11-03 — Revisão 2 #geral: assets Sol/Luna + ui-boot-check

**Pronto**

- `node scripts/persona/build-assets.mjs` → 112 arquivos, 2.47 MiB (poses/avatares Sol e Luna incluídos).
- Faixa/mensagens: `resolveCharacterId` + `mapTeamToStrip` lista **todos** os `team.personas`; silhueta só sem URL de pose; fallback `MOCK_CHANNEL_ROSTER` / `MOCK_GERAL_MESSAGES` quando host vazio.
- Tema escuro: `installPersonaColorScheme()` no `mount.ts`; init script do gate ajustado (sem `body` nulo).
- Logo rail: `symbol.svg` com `filter` invert no sidebar; pipeline reserva `banner-team-{light,dark}.webp` e `rail-foliage.webp` quando Brush entregar.
- `check-pkg client-ui-persona` OK.

**Arquivos:** `map-host-ui.ts`, `ConnectedGeneralChannelView.tsx`, `TeamChannelStrip.tsx`, `install-color-scheme.ts`, `mount.ts`, `PersonaSidebar.module.css`, `build-assets.mjs`, `ui-boot-check.mjs`, `lumen-remote-panels.tsx`.

**Gate (verbatim)**

```
node scripts/persona/with-lock.mjs "Prism ui boot" -- node scripts/persona/ui-boot-check.mjs
→ exit 0
dirD compare: diffRatio=0.34817978395061727 pass=true
shots: .maestri/tmp/shots/persona-light-channel.png, persona-light-channel.diff.png, persona-dark.png, …
[channel text inclui Sol/Luna “Descansando · zzz” com roster completo]
```

**Fora / próximo**

- (app) capturas claro/escuro vs `dirD-tela.png`, reduced-motion, teclado — Probe/aceite S5.
- Onboarding overlay ainda usa `dict: onboardingPt` no inject (trocar por locale ativo quando host i18n estiver no caminho).
- C5b/c: registrar conversa/composer no shell; Lumen main keys; `kanban-preview.client.spec.tsx` (Lumen) fora do typecheck Prism.
- Rodar `node --import tsx/esm apps/cli/src/bin.ts persona --no-open` quando Probe liberar host.

# Acima do T3 (UX-BEYOND): auditoria completa de UX

Muse + Atlas, 04/11. Pedido do Miguel: "melhor que o T3, mais intuitivo, mais proativo; nenhum detalhe poupado". **O instalador só vai ao Miguel depois desta análise.**

**Método:** só entra o que tem prova.
- **Capturas do app real:**
  - `shots/design/sweep-1440/` e `sweep-960/`;
  - `capture-review` (`CAPTURE-REVIEW-0411.md`);
  - `first-run/` (o 1º uso instalado).
- **Galerias com texto real:**
  - `shots/design/accept-gallery/` (66+18 capturas, claro/escuro × 1280, 960 e 200%, axe);
  - `lumen-review/`, `lumen-viewport/after2/` e `quill/`.
- **Revisões de código:** FIRST-DELIVERY-SPEC §Revisão, ACCEPTANCE-SWEEP-0411.
- **Régua 1:** o T3 Code (`_ext/t3code/docs/user/*.md` + `T3-UX-HARVEST.md`).
- **Régua 2:** o melhor de cada ferramenta (Claude, Cursor/Codex, Linear, Slack, Raycast, Notion, Arc, Duolingo).

**Legenda:**
- **P0** = antes do instalador ir ao Miguel: tudo que é PIOR que o T3, ou parece quebrado, mentiroso ou genérico;
- **P1** = logo depois;
- **Dono:** Prism, Lumen, Quill, os 2 builders novos (UI-4 e UI-5, pelo Atlas), Forge/Anvil (backend), Rivet (desktop), Brush (arte), Muse (tema e primitivos).

---

## P0: antes do instalador (30 itens + os do Atlas)

### A. O 1º contato (onboarding e 1ª entrega): decide a ativação

| # | O que a pessoa vive hoje | Régua | Correção | Dono | Aceite |
|---|---|---|---|---|---|
| P0-1 | O passo 5 apresenta "a equipe" com **linhas fixas de exemplo** (`MOCK_INTRO_LINES`: Atlas, Bento e Nina), mesmo se ela montou outra equipe no passo 4. | Honestidade (nunca inventar) | As linhas saem da equipe contratada no passo 4 (nome + função). | Prism | captura do passo 5 com o modelo "Agência" mostrando as personas certas |
| P0-2 | O modal do passo 5 **não cabe em 1440×900**: a banda e o balão "Guia" saem cortados no topo. | Arc (delicadeza) | Banda compacta (~96 px) no passo 5, ou cabeçalho fixo e só o conteúdo rolando. | Prism | 1440×900, 960×640 e 200% sem corte |
| P0-3 | "Equipe trabalhando" sem a persona: só um chip e o nome. A spec pede a pose `trabalhando`. É o momento que vende "equipe com rosto". | Duolingo (personagem vivo) | `poseUrl(id,'trabalhando')` a ~160 px ao lado do texto, mais a atividade viva. | Prism | captura do `working` com a pose, claro/escuro |
| P0-4 | No passo 5, a atividade aparece em português fixo com "comando(s)" e "contratação(ões)", e o `aria-live` cobre a seção inteira (o leitor reanuncia tudo a cada passo). | T3 (atividade agrupada honesta) | Usar `activityGroupLabelsFromDict` com o plural de verdade (Lumen já faz o `.one`); o live só numa linha de estado. | Prism + Lumen | teste: "1 comando" / "2 comandos" nas duas línguas; o leitor de tela lê 1 linha por mudança |
| P0-5 | **O caminho feliz nunca foi medido no instalado.** Sem IA o passo 5 é honesto (FR-2), mas o tempo até a 1ª entrega real não existe. | Claude/Linear (velocidade) | A rodada real única do V1-P0-5 (D-069), com os marcos da Muse (t0 "Pedir agora" → t1 a entrega). Alvo: o feliz em ≤ 10 s, o 1º uso em ≤ 2 min. | Probe (executa) + Muse (mede) | `proof.json` com a timeline + o veredito da Muse |
| P0-6 | Instalado: a splash velha do harness **continua no DOM** por baixo ("Loading plugins…", lido em inglês pelo leitor de tela), e a splash e o erro usam a fonte do sistema. | Marca | Não renderizar a splash do harness no perfil persona; carregar Fredoka e Nunito na splash. | Rivet | axe 0 no 1º quadro; captura com a fonte da casa |
| P0-7 | **O tema escuro do app instalado nunca foi testado:** o app segue o `nativeTheme`, e a emulação de CSS não pega. | — | Expor um parâmetro de tema (ou trocar o tema do Windows na rodada) e capturar o instalado no escuro. | Rivet + Probe | o 1º uso instalado no escuro com axe 0 |

### B. Coisas que parecem quebradas ou mentem

| # | O que a pessoa vê | Correção | Dono | Aceite |
|---|---|---|---|---|
| P0-8 | O editor de persona mostra, no preview "Como a equipe vai ver", **o Atlas como gato** (a arte da Luna). | Mapear o bicho pelo `avatarRef` da persona. | Prism | captura do editor de 3 personas com o bicho certo |
| P0-9 | Texto de sistema visível: "Coordenação (**Router**)", "**Propor (padrão)**", "Pode usar: … Leitura · Internet · Leitura". | "Coordenação", "Sugere e espera", "Arquivos do projeto e internet · só leitura". | Prism | varredura de jargão no editor (como a do SW-7) |
| P0-10 | Segundo cérebro mostra **id cru**: "person:owner atualizou reply-whatsapp · clientes-aprovados", "grant:owner". "Comece aqui" é só um link com o próprio nome. | Nome de gente + título legível; o cartão com 2 linhas da página + Abrir. | Lumen | sem `:` de id na tela (teste) + captura |
| P0-11 | O cartão do **plano do Gestor no chat** repete o resumo como "passo" e esconde o **porquê** que o host já manda. | `reason={plan.reason}`, `steps=[]` sem passos do host (o primitivo já não desenha vazio). | Prism (+ Forge/Anvil para os passos) | captura do plano no #geral com o porquê |
| P0-12 | "**1 PENDENTES**", "**Descansando · zzz**" (o leitor diz "zê zê zê") e plurais com "(s)" no app. | O plural `.one` em todos os contadores; tirar o "zzz" do texto. | Prism + Lumen | grep de `(s)`/`(ões)`/`(ns)` = 0 nos locales pt; teste dos contadores |
| P0-13 | O **cartão da persona** passa da tela a 1440×900 e a 960 (a "Presença" sai cortada) e **não fechou no Esc** em 6 tentativas do script. | `max-height` + rolagem interna; um teste de teclado do Esc com o foco voltando. | Prism | captura a 960 inteira; teste de Esc |
| P0-14 | O cartão "Primeira entrega" da Visão geral credita uma **"E Equipe"** genérica. | O retrato e o nome de quem entregou. | Prism | captura |
| P0-15 | **Becos sem saída:** um projeto vazio é uma barra vazia sem rótulo (PB-5); "Contratar persona" cai no Assistente sem cabeçalho nem "um a um" (GOV-8); no Ensinar, o botão desabilitado não diz o porquê (o consentimento está abaixo da dobra). | O vazio ensina + 1 clique ("Criar a primeira tarefa"); `ScreenHeader` + "Contratar" por linha; a linha "Marque que entendeu para continuar". | Lumen; Prism; Quill | as 3 capturas; nenhum botão desabilitado sem motivo visível |

### C. PIOR que o T3 (a régua 1); tabela completa na §Paridade

| # | O T3 faz | Nós hoje | Correção | Dono |
|---|---|---|---|---|
| P0-16 | O aviso nativo só quando importa, com o verbo ("Codex finished") | **Nenhum aviso sai**: o renderer nunca chama `personaAlwaysOn.attention`; o `needsYouCount` da bandeja não está no preload; a política é fixa | NOTIFICATIONS-SPEC + ligar o envio no renderer a partir do live store (os eventos do Anvil) + expor o `needsYouCount` | Prism (envio) + Rivet (preload, política) + Anvil (eventos) |
| P0-17 | Composer com memória (↑ traz o último; Ctrl+S guarda; colagem grande vira anexo) | Feito no #geral; **nas DMs, todas dividem a mesma memória** | Passar o `conversationKey` por DM (`DirectMessagesView.tsx:319`) + os testes dos handlers de tecla | Flint |
| P0-18 | Steer e fila (mensagem durante o turno) | A fila é só local, o "direcionar" é envio comum, a DM não tem fila | Ligar a API do host (`enqueue/edit/flush`, `working-send-host.ts`) + a fila na DM (UX-PHASE-PRISM-SPEC §4) | Flint + Anvil |
| P0-19 | "No limite" com Retomar e a fila preservada | Retomar só recarrega; o envio bloqueado perde o pedido | Com o limite, o envio entra na fila (o mesmo balão) e Retomar descarrega a fila; "No limite até {hora} · as tarefas esperam" | Flint + Anvil |
| P0-20 | Teclado inteiro: F6 entre áreas, Ctrl K que executa, atalhos ensinados | ver §Paridade | T3-HARVEST §1–2 | Prism + Muse |
| P0-27 | `/` comandos que funcionam | 5 de 6 comandos do menu `/` não fazem nada (controle morto) | Ligar o `onSlashCommand` no `ConnectedGeneralChannelView` (`/assunto`, `/ensinar`, `/contratar`, `/resumo`, `/lado`); o que não tiver ação ainda **sai do menu** | Flint |
| P0-28 | Números de limite reais | `/limites` e a gaveta com números fixos | Ler as cotas reais (as mesmas do `PooledQuotaBar` de Uso); sem dado, "—" e "Cota oficial indisponível", nunca um número inventado | Flint (+ Lumen) |
| P0-29 | O chip de autonomia | O clique não faz nada + o chip duplicado | Um chip só; o clique abre o cartão na seção "O que {persona} pode fazer" (UX-PHASE-PRISM-SPEC §3) | Flint |
| P0-30 | O envio que falha | A mensagem otimista não mostra falha | O balão "Não enviado · Tentar de novo" (texto e ação do `RunErrorCard`) | Flint |

### D. Acabamento que já mede mal

| # | Prova | Correção | Dono |
|---|---|---|---|
| P0-21 | axe `color-contrast` no **item ativo do rail** em todas as telas: o indicador creme é um span atrás do botão, e o axe calcula ameixa sobre lilás | O fundo no próprio botão ativo (ou `::before`) | Lumen |
| P0-22 | **Zoom 200%:** o rodapé fixo do rail (Conectado + Configurações + folhagem) ocupa ~45% da altura e apaga o menu | Abaixo de 600 px de altura: esconder a folhagem, juntar a pílula e as Configurações numa linha | Prism |
| P0-23 | O Assistente: título h1 a ~15 px, a seleção só pela borda, "usamos modelos testados, não jargão" | Fredoka 22–28, `ChoiceCards` com o selo ✓, a frase da tarefa | Prism |
| P0-26 | Conexões › Adicionar conta, passo 2: um **comando bruto de 10 linhas** com o caminho da pasta pessoal e hashes, depois de "Abra um terminal neste computador"; o cartão da conta com um **círculo genérico** no lugar do ícone do Claude e **dois botões âmbar** (Copiar comando + Já fiz login) | Os 3 passos em linguagem simples + **Copiar comando** como único primário, com o comando dobrado em "Ver o comando"; o ícone do motor (`icons/engines`); um primário por cartão. **P1 (Rivet):** um "Entrar agora" que abre o terminal com o comando já preenchido | Quill (+ Rivet P1) |
| P0-24 | Canvas: o subtítulo de dev ("Mesmos objetos do produto — relações, zoom e lista acessível"), os nós com texto de 26 px e sem tipo nem rosto | QUILL-SCREENS-SPEC G2 | Quill |

**Já resolvido hoje pela Muse (tema e primitivos), para não voltar:**
- `--persona-ink-muted`, `--persona-surface` e `-surface-alt` no escuro, com o teste de cobertura;
- o rail com fundos sólidos (axe);
- o `Modal` com cabeçalho e rodapé fixos, o corpo focável quando rola e o esmaecido "tem mais";
- o `Notice` info com o "i";
- o `ChoiceCards` com o selo ✓;
- o plano recusado sem `opacity`;
- o `GestorPlanCard` sem lista vazia.

---

## Paridade com o T3 (a régua 1)
**Verificação no código** (caminhos relativos a `client-ui-persona/src/client`), com 3 conferidas à mão pela Muse: o `onSlashCommand` nunca é passado; o renderer nunca chama `attention(`; o `/limites` tem números fixos.

| # | Padrão do T3 | Nós | Veredito | Prova | Item |
|---|---|---|---|---|---|
| 1 | F6 entre áreas, com memória de foco | rail, main e composer marcados; o painel lateral (TurnContextDrawer) **não** é parada | quase igual | `shell/area-navigation.ts:20`, `tests/area-navigation.client.spec.ts` | P1-17: marcar o drawer (Flint) |
| 2 | Ctrl K que executa | "Fazer" (Contratar, 2 dias, Ajuda, Novidades, Conversar com, Ensinar) + "Nas conversas" | **MELHOR** (as ações da equipe); falta o 1–9 | `shell/SearchPlaceholderView.tsx:95`, `tests/search-goto.client.spec.tsx` | P1-18: 1–9 (Flint) |
| 3 | Composer com memória | ↑, Ctrl+S com chip e a colagem ≥ 32 KiB | IGUAL no #geral; **bug nas DMs**: todas dividem a mesma memória (`conversationKey` ausente) | `chat/ChannelComposer.tsx:424`, `chat/DirectMessagesView.tsx:319` | **P0-17** (Flint) |
| 4 | Fila / direcionar | o balão tracejado com Mandar agora · Editar · Tirar, só no #geral | **PIOR**: a fila é só local (a API do host `enqueue/edit/flush` nunca é chamada), "direcionar" é envio comum, e a DM não tem fila | `chat/GeneralChannelView.tsx:199`, `persona-host/src/working-send-host.ts:48` | **P0-18** (Flint + Anvil) |
| 5 | Citar um trecho | "Citar" com chip | IGUAL no #geral; falta na DM | `chat/MessageQuoteToolbar.tsx` | P1-19 (Flint) |
| 6 | `/` comandos e `$` skills | o menu `/` aparece, mas **5 de 6 comandos não fazem nada** (o `onSlashCommand` não é ligado); `$` não existe | **PIOR**, e é controle morto | `chat/composer-slash-commands.ts:22` | **P0-27** (Flint) |
| 7 | Limites por provedor (barra por conta) | o `PooledQuotaBar` em Uso, com dados reais | **MELHOR** (a regra de troca de conta explicada) | `usage/UsageLimits.tsx:167`, `data/lumen-remote-panels.tsx:463` | — |
| 8 | `/limites` acima do composer + o contexto usado | o painel e a gaveta com **números fixos** (38%, 66%, "18:30", 42%) | **PIOR**: inventa número | `chat/ComposerLimitsPanel.tsx:32`, `chat/TurnContextDrawer.tsx:119` | **P0-28** (Flint, com os dados do Lumen) |
| 9 | Atividade agrupada e honesta | o `ActivityGroup` no #geral, na gaveta, na Saúde, no perfil e no passo 5 | **MELHOR** (rosto + linguagem de gente) | `primitives/Pooled.tsx:155` | P0-4 (plural) |
| 10 | Concluir / Lembrar depois | os itens existem no `SubjectBar`, mas **nenhuma tela passa os handlers** | PIOR | `chat/SubjectBar.tsx:151` | P1-20 (Flint + Anvil) |
| 11 | Pergunta à parte (`/lado`) | o host e o core têm `aside`; o client nunca chama | PIOR | `persona-host/src/working-send-host.ts:91` | P1-21 (Flint) |
| 12 | "No limite" + Retomar com a fila | a faixa e os botões existem; **Retomar só recarrega**; o envio fica bloqueado (a fila não é guardada) | **PIOR** | `chat/ChannelComposer.tsx:561` | **P0-19** (Flint + Anvil) |
| 13 | O modo de permissão visível | o chip de autonomia existe, mas **o clique não faz nada** e há **um 2º chip duplicado** | **PIOR**, e é controle morto | `chat/ChannelComposer.tsx:527` e `:585` | **P0-29** (Flint) |
| 14 | Avisos só quando importa | a lógica do desktop está pronta, mas **o renderer nunca envia evento**, então **nenhum aviso sai**; o `needsYouCount` da bandeja não está no preload | **PIOR** | `apps/desktop/src/notifications.ts`, `apps/desktop/src/preload-app.ts:143` | **P0-16** (Prism + Rivet + Anvil) |
| extra | Tela de atalhos | não existe (só uma linha na Ajuda) | PIOR | `help/generated-help.ts:7` | P1-22: "Atalhos" (? abre), com spec da Muse |
| extra | Envio otimista | a mensagem aparece antes do servidor | IGUAL, mas **sem o estado de falha**: se o envio falhar, nada avisa | `remote/persona-live-store.ts:842` | **P0-30** (Flint) |
| extra | Esqueletos | DMs, Quadros, Arquivos, Projetos, Equipe remota | falta no #geral, na Visão geral e em Uso | — | P1-23 (Ember em Uso; Flint no #geral; Prism na Visão geral) |

**Resultado:** **MELHOR** em 4 (Ctrl K da equipe, limites por conta, atividade com rosto, Revisar sem jargão); **IGUAL** em 3; **PIOR** em 9, todos agora P0 ou P1 com dono. Nenhum PIOR fica sem item.

## Régua 2: o melhor de cada ferramenta

| Ferramenta | O padrão | Nós | Veredito | Item |
|---|---|---|---|---|
| Claude desktop / Claude Code | Streaming do texto + "parar" + retomar depois de uma queda | A resposta chega inteira; o `RunErrorCard` tem ação; o retomar depende do host | verificar | P1-1: streaming visível + Parar (Prism + Forge) |
| Cursor / Codex | Revisar mudanças com antes/depois + desfazer | O Revisar do SW-7 (rascunho, antes/depois por tipo, Desfazer 30 dias) | **MELHOR** no papel; falta o app real | SW-7, os 5 cenários do Probe |
| Linear | UI otimista: a ação responde antes do servidor, < 100 ms | DECISIONS-SPEC com `deciding` otimista; o envio no composer | verificar | P1-2: otimismo no envio, no mover cartão e no aprovar (Lumen + Prism) |
| Linear / Raycast | Ctrl K que executa + atalho mostrado em cada ação | O Ctrl K com "Fazer"; os tooltips sem atalho | PIOR | P1-3: `Tooltip` com `kbd` do atalho em toda ação que tem atalho (Muse primitivo + todos) |
| Slack | Presença, "está escrevendo…", threads, não lidas | Presença ✓, não lidas nos assuntos ✓, sem "escrevendo" | quase igual | P1-4: "{persona} está escrevendo…" com a pose `digitando` (Brush P1 + Prism) |
| Notion | O vazio que ensina, com 1 clique | A maioria dos vazios tem arte + ação; o PB-5 e o Canvas não | quase igual | P0-15 |
| Arc | Delicadeza: transições, nada cortado, foco bonito | Os primitivos com movimento e reduced-motion; cortes a 1440 e 200% | PIOR em 3 telas | P0-2, P0-13, P0-22 |
| Duolingo | Personagens vivos + celebração | Faixa da equipe viva (piscar, rabo, poses por estado), carimbo e patinhas | **MELHOR** que o T3 (que não tem personagens) | P1-5: a pose `comemorando` + marcos (Brush BR-P3) |

## Proatividade visível (o nosso diferencial: o T3 é reativo)

| Regra | Onde já está | Onde falta | Item |
|---|---|---|---|
| Próximo passo sugerido em cada tela | Visão geral ("Precisa de você" primeiro), DM vazia com 3 sugestões, Saúde com correção de 1 clique | Quadros vazio, Canvas, Arquivos, Rotinas sem nenhuma | P1-6: uma linha "Próximo passo" (texto + 1 botão) no topo de cada tela, derivada do estado (Lumen + Prism) |
| "Enquanto você estava fora" | O cartão existe (PRO-4) | Não testado com dados reais | P1-7: a captura com o host real (Probe) |
| A equipe mostra o que faz, ao vivo | A faixa da equipe, a coluna "Agora" e a atividade viva | Ainda não aparece a tarefa e o tempo em "trabalhando" na faixa | P1-8: a pílula "Nina · Pesquisa de preços · 2 min" (Prism) |
| Personas propondo trabalho | O cartão do plano do Gestor, contratação | Proposta de tarefa ("Posso montar o relatório de sexta?") fora do Gestor | P1-9: o cartão "Proposta de {persona}" no #geral com Aceitar · Agora não (Forge `recommend` + Prism) |
| Nenhum beco sem saída | O `RunErrorCard` com ação, "Falta uma IA" com Conectar | 3 becos (P0-15) | P0-15 |
| Desfazer em tudo | Aplicar na pasta, decisões reversíveis | Mover cartão, arquivar assunto, apagar mensagem: verificar | P1-10: o Toast "Desfazer" (6 s) em toda ação destrutiva ou de movimento (todos) |
| Atalhos ensinados na hora certa | A dica "Quem responde" na 1ª vez | Nenhuma dica de atalho | P1-11: depois da 3ª navegação pelo mouse para o mesmo lugar, a dica "Ctrl K → {tela}" uma vez só (Muse + Prism) |
| A previsão de custo e tempo antes de pedir | O plano do Gestor mostra o custo | O composer não mostra | P1-12: abaixo do composer, "≈ 1 tarefa média · uns 2 min" quando o motor sabe (Forge + Prism) |

## Detalhes mínimos (a passada da Muse)

| Detalhe | Estado | Item |
|---|---|---|
| hover / foco / pressed / disabled | Os primitivos têm os 4; o disabled **sem motivo** acontece (Ensinar) | P0-15 + regra: botão desabilitado sempre com a linha do porquê |
| Esqueletos de carregamento | O primitivo `Skeleton` existe; o uso nas telas está em verificação | §Paridade |
| Tooltips com atalho | Não | P1-3 |
| Plurais e contadores | Quebrados em vários lugares | P0-12 |
| Datas relativas | "hoje 11:00", "ontem"; "há 3 min" no fio está em verificação | P1-13: um formatador único `formatWhen` (Muse primitivo) |
| Truncamento | Os nós do canvas e os nomes longos de assunto cortam com "…" e têm o nome inteiro no tooltip/aria; os chips da faixa precisam de conferência | P1-14 |
| Som opcional | Não existe | P1-15: o "pop" de entrega aceita, desligado por padrão, em Configurações › Avisos (Muse + Rivet) |
| Estados "trabalhando" dos bichos | As poses por estado + a vida | P1-4, P1-8 |
| Celebração | O carimbo + patinhas (cooldown) | P1-5 |
| Ícones consistentes | O selo Gestor muda de ícone e cor entre o cartão e o perfil; o "?" usado como info foi corrigido | P1-16: unificar o selo (Prism); varredura de ícones |
| 1ª pintura < 1 s, interação < 100 ms | Instalado: 14,3 s até o passo 1 (FR-4) | **P0-25: o tempo de boot instalado** (Rivet + Keel): a meta de 1ª pintura útil ≤ 3 s com a splash honesta; medir no NSIS novo |
| Zero jank | A suíte motion/jank do Probe existe | Rodar no instalado (Probe) |

## Arte
**BR-P3 entregue ao Brush:** `design/BR-P3-SPEC.md`.
- **P0:** limite, equipe remota, acesso encerrado e aplicado na pasta, mais os itens que subiram do BR-P1 (conflito, histórico vazio, rascunho, ícones ajuda e novidades).
- **P1:** as poses comemorando, digitando, lendo e confuso; os sucessos; os spots de Ajuda; os ícones.

## Atribuição aos builders (D-072: a Muse atribui; o Flint e o Ember implementam só o que está aqui)

**Regra:** cada item segue a spec citada, sem cor, texto, ícone ou componente fora dela. Na dúvida, pergunte à Muse antes. O dono do arquivo (Prism ou Lumen) decide a integração. A entrega é: testes + check-pkg + capturas (claro/escuro, 960/1440, teclado, 200%) + a linha "ACEITE Muse: <item>".

### Flint (sob o Prism: composer, teclado, shell)

| Ordem | Item | Spec | Aceite |
|---|---|---|---|
| 1 | **P0-13** O cartão da persona passa da tela + Esc | ACCEPTANCE-SWEEP-0411 (S6 nº 4 e 5): `max-height: calc(100dvh - top - 16px)`, rolagem interna; o Esc fecha e o foco volta ao gatilho | captura a 960 e 1440 inteira; teste de teclado do Esc e do foco |
| 2 | **P0-22** O rodapé do rail a 200% | UX-BEYOND P0-22: abaixo de 600 px de altura, esconder a folhagem e juntar a pílula Conectado e as Configurações numa linha, só com os primitivos existentes | captura a 640×360@2× e a 960×640 |
| 3 | **P0-17** Composer com memória | T3-UX-HARVEST §3: ↑ no vazio traz o último pedido desta conversa; Ctrl+S guarda o rascunho (o chip "Rascunho guardado · {hora}" com o `UiIcon` existente, sem emoji); colagem ≥ 32 KiB vira o cartão de anexo "Texto colado · {n} mil caracteres · Abrir" | testes de teclado + capturas do chip e do anexo |
| 4 | **P0-18** O balão da mensagem na fila (steer, lado da UI) | UX-PHASE-PRISM-SPEC §4 inteiro (borda tracejada de 1,5 px, a meta "Na fila…", Mandar agora · Editar · Tirar, o Toast Desfazer); sem o Forge e o Anvil, a fila é local e "Mandar agora" vira enviar | os testes do §Aceite da spec + captura claro/escuro |
| 5 | **P0-27, P0-29, P0-30** Os controles mortos e a falha no envio | as linhas P0-27, 29 e 30 (sem texto novo além do que está nelas) | testes: cada `/` comando faz algo ou não aparece; o chip abre o cartão; o envio com erro mostra "Não enviado · Tentar de novo" |
| 6 | **P0-28** Os números reais do `/limites` e da gaveta | a linha P0-28 | sem número inventado (teste com cota ausente → "—") |
| 7 | **P0-20** Teclado: F6 entre áreas e Ctrl K que executa | T3-UX-HARVEST §1 e §2 (`shell/area-navigation.ts` já existe; conferir e completar); a seção "Fazer" do Ctrl K, os números 1–9 | teste: F6 passa por todas as áreas e restaura o foco; "nina" + Enter abre a DM |

### Ember (sob o Lumen: telas de dados e proatividade)

| Ordem | Item | Spec | Aceite |
|---|---|---|---|
| 1 | **P0-15 (PB-5)** O projeto vazio no Quadros | ACCEPTANCE-SWEEP-0411 PB-5: "Nada no quadro ainda" + **Criar a primeira tarefa**; a barra só com dados, com texto visível ("3 de 8 prontas") e `aria-valuetext`; o mini-resumo (a contagem por categoria, a sprint, quem trabalha) | captura vazia e com os projetos "Contratação" e "Site" |
| 2 | **P0-12 (parte do Lumen)** Os plurais | o `.one` para todo `{count}` nos locales `*.pt.json` e `*.en.json` do Lumen; grep de `(s)`, `(ões)`, `(ns)` = 0 | o teste do grep + os testes dos contadores |
| 3 | **P0-21** O item ativo do rail (axe) | o fundo `--persona-paper` no próprio `.navItem[aria-current='page']` (o indicador pode continuar animando) | axe 0 no rail em 2 telas, claro/escuro |
| 4 | **P1-10** Desfazer em tudo (telas de dados) | o `Toast` existente "{ação} · Desfazer" por 6 s ao mover cartão, arquivar e apagar nas telas do Lumen, só quando a ação é reversível | teste por ação + captura de 1 toast |
| 5 | **P1-6** "Próximo passo" no topo das telas de dados | espera a spec curta da Muse (vou mandar); **não começar antes** | — |

**Ficam com os donos:**
- **Prism:** P0-1, 2, 3, 4 (com o Lumen), 8, 9, 11, 12 (shell), 14 e 23 (Assistente); P0-15 (Assistente).
- **Lumen:** P0-10 e P0-4 (plural `activity.*`).
- **Quill:** P0-15 (Ensinar), P0-24 e P0-26.
- **Rivet:** P0-6, 7, 16 e 25.

## Passada do Atlas (04/11 15:40, capturas sweep-1440/960, nível de produto)
Não repete os itens da Muse. A Muse decide a forma e os donos (D-072).

**Regra da casa aplicada:** tudo que for PIOR que o T3 é P0. Por isso subo **P1-1** (streaming + Parar), se a verificação confirmar que a resposta chega inteira, e **P1-3** (tooltip com atalho), que já está marcado como PIOR.

| # | Achado | Por que importa | Proposta | Prioridade |
|---|---|---|---|---|
| A-1 | **Navegação sobrecarregada.** São 17 itens no rail em 5 grupos, com sobreposições: Projetos × Quadros (as duas telas mostram o mesmo "Pessoal"); Conhecimento × Segundo cérebro × Arquivos × Regras; Equipe × Quem cuida de quem × Saúde. Os grupos ficam recolhidos, então a pessoa não descobre o que existe. | É o maior risco de intuição. O T3 tem 1 lista. A pessoa comum precisa de ≤ 7 lugares. | ~6 lugares: Visão geral · Conversas (canais + DMs) · Projetos (quadro, arquivos e rotinas como abas do projeto) · Equipe (perfis, quem cuida de quem, saúde) · Memória da empresa (conhecimento, segundo cérebro, regras) · Aprovações. Uso, Conexões e Configurações ficam no rodapé. Muse desenha; Prism + Lumen fazem. | P0 (estrutura; antes de polir as telas que vão mudar de lugar) |
| A-2 | **DMs só listam quem já conversou.** Com 5 personas, a lista mostra só a Nina. Para falar com o Bento é preciso descobrir o "+". | Beco sem saída escondido. | A lista mostra a equipe inteira, com estado e a última linha; quem nunca conversou aparece com "Começar conversa". | P0 |
| A-3 | **Terceiro sem explicação:** "Luna está acompanhando este assunto" na DM da Nina. Quem é a Luna? | Surpresa e desconfiança ("quem está lendo minha conversa?"). | O nome abre o mini-cartão (rosto, função, por que está ali: "a coordenadora acompanha todos os assuntos"), com "Parar de acompanhar". | P0 |
| A-4 | **Aprovações: "Contratar Cláusulas de rescisão?"** parece bug: contratar uma cláusula. O subtítulo "iniciativa agrupada, atenção imediata separada" é jargão. | É o cartão que mais pede confiança e é o que menos explica. | "Contratar uma persona para revisar cláusulas de rescisão?" com o rosto e o bicho propostos, a função, o porquê, o custo estimado por mês e "Ver perfil". Subtítulo: "O que a equipe precisa que você decida". | P0 |
| A-5 | **Rodapé "Conectado":** conectado a quê? | Estado ambíguo no lugar mais visível. | "Claude · 82% da cota livre" (ou "Sem IA conectada — Conectar"), com clique para Uso e limites; a cor segue o estado. | P0 |
| A-6 | **Passo 5:** o pedido é fixo e genérico, e as 4 personas dizem "Pode contar comigo" (P0-1 cobre as linhas). | A 1ª entrega decide se a pessoa fica. Um pedido do negócio dela ("padaria") vale 10× mais. | O pedido vira um campo editável com 3 chips do negócio informado no passo 2 (ex.: "Monte o cardápio da semana com preços"), mais "≈ 1 min · 1 chamada da sua IA". | P0 |
| A-7 | **Sugestões das conversas vazias são genéricas** ("Pesquise 3 concorrentes..."). | Proatividade que não conhece a empresa parece robô. | As sugestões usam o perfil da empresa, a função da persona e o que está aberto no quadro, mais a estimativa de tempo. | P1 |
| A-8 | **Cartões de Projeto e Quadro magros:** só o nome e "1 de 1 pronta" num canvas 80% vazio. | Não mostram vida nem próximo passo. | Rostos da equipe do projeto; "Bia atualizou há 2 h"; o que está em andamento; "precisa de você"; e a linha "Próximo passo" (P1-6). | P1 (vira P0 se o A-1 juntar as duas telas) |
| A-9 | **A faixa da equipe no rail tem rostos de 32 px com selos minúsculos.** Não dá para ler quem faz o quê. | O "equipe com rosto e viva" é o nosso diferencial e está ilegível. | Passar o mouse/foco no rosto mostra a pílula "Nina · Pesquisa de preços · 2 min" (P1-8); quem precisa de você ganha um anel âmbar pulsando 1×. | P1 → junto com P1-8 |
| A-10 | **Medir o boot e as interações no instalado.** Hoje são 14,3 s até o passo 1. O T3 abre em ~1 s. | "Mais rápido que o T3" precisa ser medido, não sentido. | Somar ao P0-25: orçamento por tela (1ª pintura ≤ 1 s após o boot, troca de tela ≤ 100 ms, envio otimista) medido pelo Gauge na suíte de jank. | P0 (medição); a otimização segue |

## Decisões da Muse sobre a passada do Atlas (04/11)

| Item | Decisão | Forma | Dono |
|---|---|---|---|
| A-1 Navegação | **ACEITO, P0** (fase 1) | `design/NAV-SPEC.md`: 6 lugares + rodapé, abas, apelidos no Ctrl K; a fase 2 (Projetos × Quadros) é P1 | Prism + Flint (rail, abas, Conversas); Lumen + Ember (abas das telas deles); Probe (gates com os rótulos novos) |
| A-2 DMs com a equipe inteira | **ACEITO, P0** | NAV-SPEC regra 4: quem nunca conversou aparece com "Começar conversa" | Flint (sob o Prism) |
| A-3 "Luna está acompanhando" | **ACEITO, P0** | O nome vira o botão do `PersonaCard` (o primitivo existente), com a linha "{nome} acompanha todos os assuntos como coordenação" + "Parar de acompanhar" (se o host permitir; senão, sem o botão) | Prism |
| A-4 "Contratar Cláusulas de rescisão?" | **ACEITO, P0** | O título "Contratar uma persona para {função}?" + o retrato e o bicho propostos + o porquê (Regra 4) + "≈ {n} tarefas médias por mês" + "Ver perfil"; o subtítulo da tela: "O que a equipe precisa que você decida" | Ember (sob o Lumen); o porquê e o custo vêm do host (Anvil: `ApprovalView.reason`) |
| A-5 Pílula "Conectado" | **ACEITO, P0** | NAV-SPEC regra 6 | Flint |
| A-6 O pedido do passo 5 genérico | **AJUSTAR, P0** | O campo editável sim. Os 3 chips **só se o host tiver o negócio do passo 2**; sem dado, as 3 sugestões fixas atuais (honesto, sem inventar a empresa). A estimativa "≈ 1 min · 1 chamada da sua IA" **só com número medido** (vem da rodada real do V1-P0-5) | Prism |
| A-7 Sugestões genéricas | P1, como o Atlas propôs | — | Ember |
| A-8 Cartões magros | P1 (vira P0 com a fase 2 do A-1) | PB-5 | Ember |
| A-9 Rostos de 32 px ilegíveis | P1, com o P1-8 | A pílula no hover/foco do rosto; o anel âmbar 1× para "precisa de você" (sem loop infinito) | Flint |
| A-10 Medir o boot e as interações | **ACEITO, P0 (medição)** | Junto do P0-25: 1ª pintura ≤ 1 s depois do boot e troca de tela ≤ 100 ms, na suíte do Gauge | Gauge + Rivet |
| P1-1 Streaming + Parar | **sobe para P0** (pior que o T3) | O texto aparece enquanto a persona escreve, com o botão **Parar** no lugar de Enviar, durante o turno | Flint + Forge (stream do runner) |
| P1-3 Tooltips com atalho | **sobe para P0** | O primitivo `Tooltip` ganha `shortcut` (renderiza `kbd`); todo botão com atalho passa a mostrá-lo | Muse (primitivo) + Flint (uso) |

## Propostas Flint/Ember
*(As linhas novas entram aqui; a Muse responde aceito / ajustar / não, com o motivo.)*

| # | De | Problema | Ideia | Referência | Prova | Muse |
|---|---|---|---|---|---|---|
| F-1 | Flint | **O divisor de dia do fio sempre diz "Hoje"** (`GeneralChannelView.tsx:608` usa `t('stream.today')` fixo): ontem, anteontem e a semana passada aparecem sob "Hoje". Mente sobre quando as coisas aconteceram. | Um divisor por dia de verdade, com o `formatWhen` da Muse: "Hoje", "Ontem", "segunda 3 nov", "4 nov 2025". O divisor gruda no topo ao rolar (sticky, 28 px), como o `DayDivider` existente; sem animação nova. Estados: fio vazio (sem divisor), mensagem no limite da meia-noite, fuso do aparelho. | Slack (divisor sticky por dia), Linear (datas relativas) | a construir sobre `DayDivider` + `formatWhen`; teste com mensagens de 3 dias; captura claro/escuro | |
| F-2 | Flint | **Não dá para copiar uma resposta inteira** (nenhum botão; só selecionar com o mouse e citar). Quem leva a resposta para um e-mail faz isso toda hora. | Ação "Copiar" nas ações de passar o mouse/foco da mensagem (ao lado do "+" de reação), com o `UiIcon copy`, o tooltip "Copiar" e o "Copiado" por 1,5 s (mesmo estado do bloco de código). Copia o **markdown original**, não o texto desenhado. Teclado: a ação aparece no foco da mensagem; sem depender de hover. | Claude desktop, ChatGPT, T3 (copiar mensagem) | a construir; mesma ação do `CodeBlock` do IV-3; teste de teclado + captura | |
| F-3 | Flint | **Rolou para cima e chegou resposta nova: nada avisa** (não existe "ir para o fim"). A pessoa só descobre ao rolar. É o oposto de uma equipe viva. | Quando há mensagens novas abaixo da dobra, uma pílula `Button size s` "↓ 2 novas" no canto inferior do fio (acima do composer); o clique rola até a última com `behavior: smooth` (instantâneo com reduced-motion) e some. Se a pessoa já está no fim, o fio acompanha sozinho. Leitor de tela: região live "2 novas mensagens". | Slack ("N novas mensagens"), Linear, WhatsApp | a construir no `MessageList`; teste com o scroll simulado; captura | |
| F-4 | Flint | **Soltar um arquivo na conversa não faz nada** (só há o clipe e a colagem). Quem arrasta uma planilha para o app recebe o comportamento do navegador (abre/baixa o arquivo). | Arrastar um arquivo sobre o fio ou o composer mostra um painel tracejado de 1,5 px sobre a área ("Solte para anexar a {persona/canal}"), com o `UiIcon attach`; soltar cria os mesmos cartões de anexo do clipe. Recusado (tipo/tamanho): o motivo no próprio painel, não um erro depois. Reduced-motion: sem fade. | Slack, Linear, Claude | a construir; reaproveita `composer-pending-attachment`; teste com `dataTransfer` simulado; captura do painel | |
| F-5 | Flint | **A pílula do rodapé não ensina de onde vem o número.** "Claude · 82% livre" é a janela mais apertada da conta, mas isso só aparece se a pessoa abrir Uso e limites. | O popover da pílula (já aceito no A-5) ganha, abaixo da linha, uma frase `ink-soft` com a janela e a recarga: "Janela de 5 horas · volta às 18:30" (do `getOfficialQuota`; some se o motor não publica a hora). Nada novo no visual: é o texto do `PooledQuotaBar`. | Cursor (uso no menu), Raycast | a construir sobre o A-5; teste de dado ausente | |
| F-6 | Flint | **Cada popover/menu trata o Esc do seu jeito** (o cartão da persona não fechava; o "Estou fora" fechava mas não devolvia o foco): a regra "Esc fecha o que abriu e devolve o foco" depende de cada autor lembrar. | Um teste de contrato de teclado (`overlay-escape.client.spec.tsx`) que abre cada popover/menu/modal conhecido (cartão da persona, "Estou fora", `MenuButton`, `Modal`, citação, paleta) e exige: Esc fecha, o foco volta ao gatilho, só o de cima fecha. Sem UI nova. | Linear, WAI-ARIA APG | a construir; roda no `check` | |

## Paridade T3 verificada no código (Atlas, 04/11 15:45)
Varredura completa: cada recurso das docs do T3 (`_ext/t3code/docs/user`) foi conferido no código montado de verdade (`mount.ts`, `register-prism-screens.tsx`, `register-lumen-ui.tsx`). Os 3 mais graves eu conferi à mão.
**IGUAL ou MELHOR:** F6 e foco que volta; teclas do rail; Ctrl K que executa; ↑/Ctrl+S/colagem grande; citar; anexos; uso com custo e tokens; limites agregados por provedor (na tela Uso); atividade agrupada; desfazer nas decisões; aprovações; revisar mudanças (simplificado); assistente de boas-vindas; trocar motor/contas; atualizações e 2º plano. **Só nós temos:** equipe de personas, Gestor, Kanban, "Precisa de você" com desfazer, segundo cérebro, Ensinar, assuntos coloridos, 1ª entrega no onboarding, "Enquanto você estava fora", importar contexto, regras e silêncio.

**PIOR que o T3, ou quebrado/mentindo = P0 "Integração viva".** São controles que existem na tela mas não fazem nada, ou mostram dado falso.

| # | Achado (prova) | Dono |
|---|---|---|
| IV-1 | **A equipe nunca age sozinha.** Fora dos testes, ninguém chama `tickProactivity`, `tickInitiativeBatch` nem `claimRoutines` (persona-host/src/index.ts:1765/1791/5002). A iniciativa diária e as Rotinas nunca rodam. Quebra a promessa nº 1 (PROACTIVITY.md, aceite da v1). | Bolt (novo, backend) + Anvil |
| IV-2 | **Aviso nativo e bandeja nunca disparam.** A UI não chama `personaAlwaysOn.attention`; o preload não expõe `needsYouCount`. | Rivet (desktop) + Lumen |
| IV-3 | **As respostas aparecem como texto cru.** Não há markdown: `GeneralChannelView.tsx:770` usa `<p>{message.body}</p>`, então listas e tabelas viram texto. | Flint (renderer de markdown seguro no nosso tema; a Muse aceita) |
| IV-4 | **`/limites` e o painel de detalhes mostram números INVENTADOS** (`ComposerLimitsPanel.tsx:32`, `TurnContextDrawer.tsx:132`: 38%, 66%, "18:30"). | Flint, ligando no adaptador real `usage-pooled` (`loadOfficialQuotasByAccount`) |
| IV-5 | **"Direcionar agora" é cosmético.** A fila vive só no estado do React e some ao recarregar; não há botão **Parar**. O host tem `enqueueWorkingMessage` e `deliverWorkingSend` sem nenhum chamador. | Flint (UI) + Bolt (host) |
| IV-6 | **Controles mortos:** `/lado /assunto /ensinar /contratar /resumo` não fazem nada (`onSlashCommand` nunca é passado); "Lembrar depois" nunca aparece. Regra: ligar ou esconder até ligar. | Flint + Bolt (`openAsideAsk` existe) |
| IV-7 | **"No limite → Retomar" só faz `refresh`.** Nada recomeça quando a cota volta. | Bolt + Flint |
| IV-8 | **Dados de exemplo no app real:** `SkillsPanel` cai em `MOCK_SKILLS`; Quem cuida de quem cai em `mockOrgChart`. Tem de ser um vazio honesto. | Ember |
| IV-9 | **Rotinas não podem ser criadas nem editadas** (só leitura). | Ember + Bolt |
| IV-10 (P1) | Pergunta de persona só tem aprovar/recusar: não dá para responder com texto ou arquivo, nem dentro do fio. O chip de autonomia não aparece nas DMs e não tem troca rápida. O Ctrl K é página inteira, sem recentes e sem escolha por 1–9. A aparência não tem claro/escuro manual. | Ember; Flint; Muse decide o Ctrl K |

## Junção Muse × Atlas da paridade, e a forma das UIs (Muse, 04/11)

**Itens iguais nas duas listas (um id só daqui em diante, o IV do Atlas; o P0 da Muse vira o apelido):**

| IV (Atlas) | = P0 (Muse) |
|---|---|
| IV-2 | P0-16 |
| IV-4 | P0-28 |
| IV-5 | P0-18 + P1-1→P0 (streaming + Parar) |
| IV-6 | P0-27 + P1-20 (Lembrar depois) + P1-21 (`/lado`) |
| IV-7 | P0-19 |

Os itens só da Muse que ficam: P0-17 (a memória das DMs), P0-29 (o chip de autonomia), P0-30 (o envio que falha), P0-1 a P0-15, P0-21 a P0-26, A-1 a A-6 e A-10.

**A forma das UIs (a decisão da Muse; os builders seguem isto, sem variação):**

### IV-3 · Markdown nas respostas (Flint)
- **Subconjunto seguro:**
  - parágrafos;
  - **negrito** e *itálico*;
  - listas com marcador e numeradas (2 níveis);
  - links (abrem fora, com o ícone ↗ e `rel="noopener"`);
  - `código` inline;
  - blocos de código;
  - citação;
  - tabelas;
  - títulos `#`, `##` e `###`, renderizados como **Nunito 800 16/15/14**. Nunca Fredoka dentro do balão, para não competir com o título da tela.
- **Nunca** HTML cru: nada de `<script>` nem de atributos de evento.
- **Bloco de código:**
  - `--persona-paper-sunken`, contorno `--persona-outline-soft`, raio m, mono 13/20;
  - um botão **Copiar** (ghost s) no canto, que vira "Copiado" por 1,5 s;
  - rolagem horizontal **dentro** do bloco (nunca na página).
- **Tabela:** dentro de um contêiner com rolagem horizontal própria; cabeçalho Nunito 800 12 em caixa alta `ink-soft`; linhas com a divisória `--persona-outline-soft`; números alinhados à direita com `tabular-nums`.
- **Citação:** a barra de 3 px `--persona-brand` + o texto `ink-soft`.
- **Durante o streaming,** o markdown incompleto não pisca: o bloco aberto renderiza como texto até fechar.
- **Aceite:** uma resposta com lista, tabela, código e link, claro/escuro, 960 e 200%, sem rolagem lateral da página, e axe 0.

### IV-5 / P1-1 · Streaming + Parar (Flint + Bolt/Forge)
- Enquanto a persona escreve, o balão dela cresce com o texto. No fim do texto, o cursor-bloco âmbar pisca (só sem reduced-motion).
- O botão de enviar vira **Parar** (`Button variant="secondary"`, o ícone `close`, o tooltip com `Esc`). Esc no composer vazio também para.
- **Ao parar**, o balão fica com o que já veio, mais a linha `ink-soft` "Você parou aqui · Continuar" (o link retoma).

### IV-8 · Sem dado de exemplo no app real (Ember)
- `MOCK_SKILLS` e `mockOrgChart` não podem aparecer fora da galeria e dos testes.
- **Skills sem dado:** o `EmptyState` com a pose `pensando` da persona, "{persona} ainda não tem skills" e **Ensinar a {persona}**.
- **Organograma sem dado:** o `EmptyState` "Ninguém foi organizado ainda" e **Montar a equipe** (abre o Assistente).

### IV-9 · Criar e editar rotina (Ember + Bolt)
- **O `Modal` m "Nova rotina":**
  - `Input` "O que fazer" (o pedido, como no composer);
  - `ChoiceCards` "Quando": **Todo dia · Dias úteis · Toda semana · Escolher…**. O último abre os dias como botões-adesivo `aria-pressed` + um `Input` de hora;
  - "Quem faz": uma grade de `Avatar portrait 40` com o nome (como o seletor da DM);
  - "Em que projeto";
  - o resumo em linguagem de gente antes de salvar: "Toda segunda às 9:00, a Nina vai: {pedido}.";
  - **Salvar rotina** (primário).
- **Editar** = o mesmo modal preenchido + "Pausar" e "Apagar" (com confirmação e Toast Desfazer).
- Nunca mostrar `rrule` nem cron.

### IV-10 (P1) · O Ctrl K como sobreposição
O Ctrl K deixa de ser página e vira um `Modal` de 640 px no topo da tela, com:
- o campo grande;
- os recentes em primeiro;
- as seções "Ir para · Equipe · Fazer · Nas conversas";
- os números 1–9 para escolher;
- Enter abre, e Esc fecha e devolve o foco.
A página atual continua como "Buscar em tudo" para os resultados longos. Isso é P1, depois da navegação de 6 lugares.

## Andamento (a Muse marca aqui; o ACEITE oficial vai na Status)
| Item | Estado | Por quem | Falta |
|---|---|---|---|
| P0-8, P0-9, P0-11, P0-23 | feito no código | Prism | o aceite por captura |
| P0-12 (shell), P0-14 | feito no código | Prism | o aceite por captura; o "(s)" de `rules.pt.json` (`preset.estimate`) com o Ember |
| P0-13, P0-22 | feito no código (26 testes) | Prism (P0-13), Flint (P0-22) | as capturas na fila da `build` |
| P0-15 (Ensinar), P0-24, P0-26 | feito no código | Quill | as capturas na fila da `build` |
| A-1 (fase 1) | `nav-places.ts`, `PlacesRailNav`, `PlaceTabsBar` prontos e **atrás de flag** (D-077, desligada) | Prism (+ Flint) | ligar só depois do aceite; capturas com a flag ligada |
| A-5 | **feito no código e testado** (`rail-ai-status` 25, `rail-ai-pill` 16): pílula com o estado real da IA, popover com a linha da IA, tooltip + frase quando a cota oficial não existe | Flint | a varredura no shell real (a captura parcial 200% já tem o seu "ok" da Muse) |
| P1-3→P0 | o primitivo `Tooltip shortcut` pronto, com teste | Muse | o uso nos controles (Flint): **feito** na Ajuda (`?`) e na pílula; falta composer (Enter/Ctrl Enter/Ctrl S) |
| **Flint — itens abertos (D-077)** | todos no código, com teste, `check-pkg client-ui-persona` OK; a rodada de captura (claro/escuro, 1440/960/200%, axe) está na fila da `build` | Flint | a varredura de aceite da Muse no app instalado do H2 |
| ↳ P0-22 + Configurações + Ajuda | uma linha a 200% (direto, sem flag). **Atrás da flag A-1 (`persona.flag.navPlaces`, D-077):** Configurações = `settings.launcher` próprio (uma engrenagem; indicadores do DSW mantidos) e Ajuda só ícone com `?`. **Flag desligada (padrão): rodapé de antes** (gatilho do DSW, Ajuda no rail antigo, sem `?`) | Flint | varredura nos dois estados da flag (capturas `proof` e `proof-on`) |
| ↳ A-2 | DMs com a equipe inteira ("Começar conversa"); rascunho/histórico por DM (**corrige vazamento de rascunho entre DMs**) | Flint | varredura |
| ↳ HINT-clamp | o balão "Quem responde" dentro da janela a 200%, seta no seletor | Flint | varredura (o clique atravessa o balão: Prism) |
| ↳ P0-17 | Ctrl+S guarda/esvazia/devolve, ↑ vai para trás, colagem grande vira o cartão "Texto colado · N mil caracteres · Abrir", `localStorage` | Flint | varredura |
| ↳ P0-27 | menu "/" só com o que tem ação; `/assunto nome`; `/lado` e `/resumo` saíram até terem ação | Flint | varredura |
| ↳ IV-4 = P0-28 | `/limites` e gaveta com as cotas reais (nunca 38/66/42); sem dado "—" + "Cota oficial indisponível" | Flint | varredura |
| ↳ IV-3 | markdown seguro nas respostas das personas | Flint | varredura (resposta com lista/tabela/código/link no shell real) |
| ↳ P0-30 | "Não enviado · Tentar de novo" (canal e DM) | Flint | varredura (host derrubado de verdade) |
| ↳ P0-18, P0-20, IV-5, P1 de atalhos | **não iniciados** (D-076); IV-5 depende do Bolt | Flint | — |
| BR-P1 P2 nº 3–6 | aprovados e no app | Brush | — |
| BR-P3 `empty-limite` | amostra aprovada; o lote P0 liberado | Brush | o lote |
| **A-4** | **ACEITO** (23:20) | Ember | a dependência do host: `roleTitle`/`monthlyTasks`/`reason` de verdade (Anvil) |
| Rodapé (A-5 + Configurações) | decidido: o nosso botão + o slot do DSW só com os indicadores + a aba "Sobre e atualizações" | Flint + Prism | ligar o launcher; capturas |
| **Lumen — itens abertos (D-076/D-077)** | tudo no código, com teste; `check-pkg client-ui-persona` OK nos meus arquivos; a rodada de captura no shell real (claro/escuro, 1440/960/200%, axe) está na fila do bundle exclusivo | Lumen | a varredura de aceite da Muse no app instalado |
| ↳ **Revisar em 2 painéis** (§1, P0 do Miguel) | cabeçalho com o retrato + "{persona} preparou mudanças em {tarefa}"; lista de arquivos (`listbox`, ↑↓/Home/End) + prévia grande; conflito como momento focado com a arte; barra fixa; depois de Aplicar o painel vira o momento (`sucesso-aplicado` quando a arte entrar; Desfazer só com `restorePointId`). `draft-review-panel` e `kanban-review-sheet` verdes (incl. o momento de sucesso, a lista por teclado e o conflito) | Lumen | captura no app real; o botão de saída diz "Voltar ao quadro" (não há como abrir a conversa daqui) |
| ↳ P0-10 (Segundo cérebro) + SB-7 | ids→nomes, sem slug (`brainPageTitle`), "Comece aqui" 2 linhas + Abrir, alvo 24 px, "Tirar permissão" com o retrato da persona, Citada em certo, Restaurar, Nova página; "Atualizado sozinho a partir das páginas." (linha do host) | Lumen | captura no app real; o bibliotecário sem persona (ícone) com a Muse |
| ↳ BYC-1/BYC-4 | laço do "Escolher pasta" corrigido; "N itens no Cofre ✓ · Ver no Cofre"; 8 estados da revisão; **regras chegam NÃO aceitas** + "Aceitar todas as regras (n)"; origem "de regras.md" | Lumen | captura no app real |
| ↳ P0-4, P0-12 (Lumen), P0-21 | plural de `activity.*` e `preset.estimate` (`locale-plural-guard`: nenhum "(s)/(ns)/(ões)" nos locales); rail ativo com o creme no próprio botão | Lumen | as capturas |
| ↳ PB-5 / PB-10 / WIRE-2 / WIRE-3 | **PB-5 ACEITO**; Novo projeto cria projeto de verdade; Revisar manda `command`+`reason` e o conflito volta como `conflicts[]` | Lumen | — |
| ↳ bug "contador volta a 4" (decisões, claro 960) | cenário instrumentado em `lumen-viewport-shots.mjs` (títulos antes/depois, releitura tardia) | Lumen | rodar com o bundle novo |
| ↳ SB-4 (exportar/importar a pasta) | a Muse disse SIM (no ⋯ do cabeçalho; só no app instalado; importar cai na revisão do BYC-4) | Lumen | **não iniciado** (D-076: depois do Revisar e das capturas) |
| **Prism — itens abertos (D-076/D-077)** | tudo no código, com teste; `check-pkg client-ui-persona` OK nos meus arquivos; a rodada de captura no shell real (claro/escuro, 1440/960/200%, axe) vem depois do conserto do escuro | Prism | a varredura de aceite |
| ↳ Tema escuro (P0 do Gauge) | conserto + spec PRONTOS e NÃO aplicados (esperam o aviso do H): `'true'` no escuro e REMOVE o atributo no claro (o host casa a presença); todas as capturas "escuras" até hoje eram claras | Prism | aplicar depois do H; capturas escuras de cada tela |
| ↳ A-1 navegação em 6 lugares | **ATRÁS DE FLAG, desligada** (`localStorage persona.flag.navPlaces = "1"` ou `window.__PERSONA_FLAGS__.navPlaces`): `nav-places.ts`, `PlacesRailNav`, `PlaceTabsBar` (`data-tab-panel`), aba "Sobre e atualizações" (`about`); `nav-places-flag` 8, `nav-places` 16, `about-settings` 6 | Prism (+ Flint no rodapé) | ligar só depois do aceite; capturas com a flag ligada |
| ↳ S6 / GOV-8 / P0-9 / P0-15 | editor: bicho certo (o mapper vazava o rascunho da Luna), preview sem jargão, selo Gestor igual; Assistente: h1 Fredoka, ChoiceCards com ✓, "Contratar" por persona, `ScreenHeader` ao abrir como tela | Prism | captura |
| ↳ GES-4 / P0-11 | cartão do plano: o porquê do host, sem passo repetido, "Plano da Coordenação", "aprovado" sem prometer o que o host não fez; aparece ao vivo (sem F5); a dica "Quem responde" cede ao plano | Prism | captura (e o host criar as personas ao aprovar: Anvil/Forge) |
| ↳ P0-13 | cartão da persona com rolagem interna e remedição; o hover não reabre depois do Esc | Prism | captura 960 + teste de Esc no app real |
| ↳ PB-7 (sprints) | faixa, planejar (arrastar + teclado), encerrar com resumo | Prism (pasta do Lumen) | captura |
| ↳ skeleton do reload, A-3, W2-3 (janela estreita) | sem "Monte sua equipe/canal quietinho" antes dos dados; "Luna está acompanhando" abre o cartão; campo de nome do assunto numa linha própria < 720 px | Prism | captura |
| ↳ WIRE-4 | seed `limit` ≤ 200, esconder o "Desfazer" (`undoApproval` não existe), `listTeam`, `maxPersonas` | Prism | depois do H |
| ↳ A-6, SW-7 | **parados por host**: `firstRequest` + `suggestFirstRequests` (Anvil/Forge); `draftFiles` em `PersonaNowView` (Anvil) | — | contrato do host |

## Varredura de aceite no instalado (D-077, antes de qualquer instalador ir ao Miguel)
- **Quando:** no NSIS do hash final **H2**. O H é só validação e não tem aceite de UI.
- **Como:**
  - `.maestri/tmp/muse/accept-installed.mts "<Persona.exe>" <hash>` (trava `build`): perfil limpo + o fake do Probe; onboarding; os 19 painéis por `data-nav-panel`; claro/escuro × 1440, 960 e 200%; axe, sobra lateral e tela vazia por captura; o relatório em `shots/design/accept-installed/<hash>/report.json`;
  - + `first-run.mts`, para a splash e o 1º uso;
  - + a medição do V1-P0-5 (rodada real do Probe).
- **O que eu julgo:**
  - os P0 deste doc;
  - a lista de itens abertos do Flint e do Ember em §Andamento;
  - a navegação de 6 lugares só se a flag estiver ligada para a varredura.
- **Resultado:** uma linha por item na Status, "ACEITE Muse: <item>" ou "RECUSADO: <item> · motivo". O recusado é corrigido ou revertido pelo dono antes de o instalador sair.

# COLHEITA · especificação de tela e movimento (Muse, 11/11 22:10)

Itens 5, 6, 11, 13, 14, 18, 19a e 20 do `PLANO-COLHEITA.md`.

**Sala limpa:** esta especificação saiu só das ideias (o `AGENTES-CHAT.md` do Carbon e as ADRs). Os nomes, os textos, as medidas e o movimento são nossos. Nenhum nome interno deles entra em código ou em chave de texto.

## Regras para todos os itens
1. **Tokens que já existem:** use os tokens de movimento do `persona-palette.css`. Os presets `press`, `panel`, `message`, `pose`, `carry`, `stamp` e `burst` estão em `theme/tokens.ts`. Nenhum ms ou curva solta.
2. **Estados da persona:** só o vocabulário de estado de `PERSONA_STATE_TOKENS`, com as mesmas cor e palavra.
3. **Controles:** só as alturas 32, 40 e 48 da régua do item 14. Texto de interface com 13 px de mínimo.
4. **Fundo:**
   - nada de fundo translúcido ou decoração atrás de texto;
   - nada de `backdrop-filter`;
   - nenhum `var(--persona-*)` sem definição.
5. **Animação contínua:** no máximo 2 na tela, e só em quem trabalha ou revisa (§2.7 do DESIGN-01-MUSE).
6. **Reduced motion:** toda transição vira um fade de `--motion-reduced-fade`. Barras de progresso e o enchimento do "segure" continuam, porque são informação, não enfeite.
7. **Gênero:** "a Persona" e "a Bia" / "o Téo", sempre com o gênero da persona. Nunca "Maestro". Nunca "workspace".
8. **Aceite:** cada item traz capturas em claro e escuro, a 100% e a 200%, mais 1 quadro do meio de cada movimento. Elas vão para `.maestri/tmp/shots/design/colheita-<item>/`. Depois passam pelo pré-aceite do Ember (com a sala limpa), pela leitura do Carbon e pelo meu ACEITE.

---

## 5 · Segure para confirmar, com prazo, executa 1 vez e Desfazer no que é interno (Prism)
**Onde:** em `chat/ActionPreviewCard.tsx` e no mesmo cartão dentro de Aprovações. Nenhuma tela nova.

**Quem usa o "segure":**
- **Pagar e Apagar:** sempre.
- **Enviar e Publicar para fora da empresa:** sim, exceto quando a caixinha "Não perguntar de novo" já está marcada para essa persona e esse conector.
- **Ações internas e reversíveis** (criar tarefa ou nota, mover cartão, renomear): **sem pergunta**. A persona faz e o fio mostra uma linha: `A Bia criou a tarefa "Post de sexta" · Desfazer`. O `Desfazer` vale por 5 min e depois a linha vira texto simples (`--persona-ink-muted`), sem link.

**O botão:**
- **Medida:** primário, 40 px, largura mínima 200 px.
- **Rótulo:** `Segure para enviar` (o verbo muda: `publicar` · `pagar` · `apagar`). Apagar usa a variante perigo.
- **Enchimento:** uma camada interna (`::before`, `transform: scaleX(0→1)`, `transform-origin: left`) em 1200 ms **linear**. É tempo real e não leva curva. A cor é a do botão, um tom mais escuro: `--persona-accent-ink` a 18%, opaco sobre o próprio botão.
- **Soltar antes:** volta em `--motion-panel` com `--ease-exit`, e nada acontece.
- **Ao completar:**
  - o check desenha o traço (`stroke-dashoffset`) em `--motion-message`, com `--ease-enter`;
  - o rótulo vira `Enviando…` e o botão trava (uma vez só, sem duplo clique);
  - o cartão fica com `✓ Enviado para Ana · 14:32`.
- **Clique curto:** abre a dica embaixo do botão, 13 px, em `--persona-ink-muted`: `Segure o botão até encher.`. Ela dura 4 s ou até o próximo gesto. O clique curto nunca envia.
- **Teclado:** segurar Espaço ou Enter faz o mesmo. `aria-describedby` aponta para `Segure por 1 segundo para confirmar.`, que fica sempre no DOM e visualmente oculto. Durante o enchimento, `aria-live` diz `Confirmando…`.

**O prazo:** um selo de leitura no topo do cartão, 24 px de altura (não é controle), com o ícone `clock` 14 px.
| Estado | Texto do selo | Visual e comportamento |
|---|---|---|
| Normal | `Vale até hoje, 18h` ou `Vale até amanhã, 9h` | `--persona-ink-muted` |
| Falta menos de 1 h | `Vence em 40 min` | `--persona-state-waiting` (âmbar), com tinta escura |
| Vencido | `Passou do prazo · a Bia não enviou` | o cartão fica só leitura (sem sombra, conteúdo a 60%) e ganha o botão fantasma 32 px `Pedir de novo` |

**Executa exatamente o que foi aprovado:**
- Se o conteúdo mudar depois da aprovação, segue o fluxo atual: chega um cartão novo com `A Bia ajustou a mensagem. Confira de novo.`.
- A interface nunca mostra o mesmo cartão como enviado duas vezes.

**Arte (Brush):** o glifo `hold`, um dedo pressionando, em 24 px, no padrão dos `ui-glyphs` (traço 1,75, `currentColor`). Ele vai na dica.

---

## 6 · Presença viva pelo trabalho, a linha do passo e o resumo recolhido (Quill)
**Fonte:** só eventos reais, nunca um timer. Um turno ativo com ferramenta rodando é `Trabalhando`. Revisar uma entrega é `Revisando`. Uma pergunta aberta ao dono é `Esperando você`.

Um estado novo de texto, sem token novo: **`Fora até 15h`**, para a pausa por limite da assinatura do item 10. Ele usa a cor de `paused` e o glifo `clock` 12 px no lugar da bolinha.

**1. A linha do passo** (o fio, a faixa e a dica do rail):
- **Quando aparece:** depois de **5 s** de trabalho, embaixo do balão "digitando".
- **Formato:** `Bia · Procurando fotos da padaria`, em 13 px, `--persona-ink-muted`, numa linha só, com reticências em 56 caracteres.
- **Quem escreve:** o texto é a frase simples que a própria persona escreve para o passo. Ela não tem caminho, comando nem nome de ferramenta. Sem frase, aparece `Bia · Trabalhando`.
- **Troca:** crossfade com 4 px de subida em `--motion-fast` e `--ease-standard`, **no máximo 1 troca a cada 2 s**.
- **Fim:** a linha some quando o turno termina.
- **Leitor de tela:** `aria-live="polite"` só na faixa, e não em cada fio.

**2. A pose:** o avatar da faixa e da DM troca para a pose do estado (trabalhar, pensar, aguardar), em crossfade com o preset `pose`.
- Se a pose não existe para aquele bicho, fica a pose base com a bolinha. A falta de pose nunca deixa o avatar vazio.
- Contínua só a bolinha de quem trabalha (a regra 5 do §2.7).

**3. O resumo recolhido:** quando o turno termina, uma linha de **32 px** aparece logo acima da mensagem final da persona:
- **O que mostra:** o ícone `check` 16 px, depois `6 passos · 2 min`, depois o chevron.
- **Ao clicar:** abre a lista dos passos, com uma linha cada (a frase do passo e a hora `14:31`), em altura `grid-template-rows 0fr→1fr` com o preset `panel`.
- **Detalhe técnico:** caminhos e comandos só dentro de `Detalhes técnicos` dobrado em cada passo (o item 4, do Anvil).
- **Sem passos:** sem ferramenta, não há linha de resumo.
- **Com erro:** se algum passo falhou, mostra o ícone `alert` âmbar e `6 passos · 1 não deu certo · 2 min`.

**Arte (Brush):** veja a seção da arte no fim.

---

## 11 · Cartão de escolha no fim do turno, com teto de 300 caracteres (Rivet)
**Base:** uma variante do `ask/PersonaAskCard.tsx` (IV-10), e não um componente novo. Nome da variante: `fimDoTurno`.

**Diferenças da pergunta atual:**
- A persona **termina o turno** ao postar o cartão. O estado volta a `Disponível`, e não a `Esperando você`. Ninguém espera por ele.
- **Opções:**
  - de 2 a 6, com as letras **A a F**;
  - cada opção é uma linha-botão de **40 px** de altura mínima;
  - a letra fica num círculo de 24 px (`--persona-lilac-200`, tinta `--persona-ink`) seguida do texto em 15 px;
  - até 2 linhas e 90 caracteres por opção.
- **Abaixo das opções:** a linha atual `ou escreva do seu jeito na caixa abaixo`.
- **Cabeçalho do cartão:** o rótulo pequeno `Escolha um caminho`, depois a pergunta. A pergunta tem até **300 caracteres** (o teto é do motor; a interface não corta).
- **Rodapé:** `Sem pressa: a Bia segue quando você escolher.`

**Depois do clique:**
- A opção escolhida fica âmbar com ✓ (o traço desenha em `--motion-message`), e as outras vão a 50% em `--motion-fast`.
- O rodapé vira `Você escolheu B · 14:32`. O cartão fica só leitura.
- O fio recebe a sua mensagem curta `✓ B · Post para o Instagram`, que abre o turno novo.

**Teclado:**
- as teclas A a F escolhem quando o cartão tem foco;
- as setas movem;
- Enter confirma;
- o cartão é um `radiogroup`.

**Arte:** nenhuma. O cartão é texto e escolha; uma ilustração aqui só atrasa a leitura.

---

## 13 · Ligar a IA para a equipe toda, estado "conferindo" honesto e importação com prévia (Flint)
**1. O banner:** fica em Visão geral quando 1 ou mais personas estão `Sem motor`:
- **Texto:** `3 pessoas da equipe estão sem IA.`
- **Botão:** primário 40 px, `Ligar para todas`.
- **Visual:** borda de cartão normal, sem cor de alerta.

**2. O modal** (520 px, scrim sólido do §2.7):
- **Topo:** a ilustração do Brush, 240 × 140 px, uma só para dia e noite.
- **Título:** `Ligar a IA para a equipe toda`.
- **Lista:** as personas sem IA, cada uma com o avatar 32 px, o nome e o anel tracejado `Sem motor`.
- **Escolha da conta:**
  - usa as contas que já existem, ordenadas pela folga de uso;
  - o texto é `Claude · sobra bastante` ou `Claude · quase no limite`;
  - **nenhum valor em dinheiro (D-092).** A primeira já vem marcada, sem selo "Recomendado" (a regra 1 do DESIGN-01-MUSE).
- **Botão:** primário 48 px, `Ligar para as 5`.

**3. O progresso:** é real, uma persona por vez, na ordem em que cada uma conecta (nada encenado):
- o anel tracejado vira o anel lavanda de `Disponível`, com o check, no preset `pose`;
- o fim é `Pronto: a equipe toda tem IA.` com o botão `Fechar`;
- falha de uma persona: a linha dela fica `Não conectou · Tentar de novo`, e as outras seguem.

**4. O estado honesto da conta:** um estado novo, **não conferido**, separado de **sem login**. Nome nosso no código: `naoConferido`.
| Situação | Pílula | Ação |
|---|---|---|
| Checando | `Claude · conferindo…` | — |
| A checagem passou do tempo 2 vezes | `Claude · não consegui conferir` | `Tentar de novo` |
| Saiu de verdade | `Claude · sem login` | `Entrar` |

- **Cor:** "não consegui conferir" fica em `--persona-ink-muted`. **Vermelho, só no logout confirmado.**

**5. Importar com prévia** (no "Traga o que suas IAs já sabem" que já existe):
- antes de gravar, uma lista do que foi achado, cada item com caixa marcada e 1 linha de resumo;
- o botão diz o número: `Importar 12`;
- desmarcar tira o item.

**Arte (Brush):** a ilustração "ligar a IA para a equipe" do modal.

---

## 14 · A régua de controles, figurinha como reação e testes de higiene (Quill na interface, Gauge nos testes)
**1. A régua:** o `Button` já tem 32/40/48. Agora a régua vale para **todo controle clicável** (botão, chip clicável, campo, menu, aba, botão só de ícone). Os tokens são novos, criados pelo Quill no `:root` do `persona-palette.css` e no espelho do `tokens.ts`:

| Token | Valor |
|---|---|
| `--control-h-s` | 32px |
| `--control-h-m` | 40px |
| `--control-h-l` | 48px |
| `--control-r-s` | var(--persona-radius-s), 10px |
| `--control-r-m` | 12px |
| `--control-r-l` | var(--persona-radius-m), 14px |

- **O raio** fica perto de 30% da altura.
- **O botão só de ícone** é quadrado, na mesma altura.
- **Selos só de leitura** (contagem, data, tag) podem ter de 22 a 24 px, porque **não são controles**.
- **A varredura** de controles de 20 a 22 px ainda clicáveis começa por estes: `Board.module.css:123`, `Chip.module.css:21` e `:83`, `ChoiceCards.module.css:86`, `Governance.module.css:156` e `:258`, e `OrgMap.module.css:224`. Confira se cada um é clicável: se for, vai a 32 px; se não for, fica.

**2. A figurinha como reação:**
- **Figurinha sozinha no composer, sem texto:** o botão de enviar diz `Reagir`. Ela vai ao fio em 96 px e **não abre turno**: a persona não responde.
- **Na mensagem de uma persona:** pelo `ReactionAdder`, a figurinha gruda no canto do balão em 40 px e também não abre turno.
- **Dica:** `Figurinha sozinha não pede resposta.`, uma vez, no primeiro uso.
- **A capivara vai de 8 para 12 figurinhas.** Hoje existem `ate-amanha`, `bom-dia`, `comemorando`, `coracao`, `feito`, `joinha`, `pensando` e `rindo`. As 4 novas, pedidas ao Brush, são `obrigada`, `uau`, `combinado` e `boa-ideia`.

**3. Os testes (Gauge):** regras de CSS que reprovam o pré-aceite:
- um controle clicável fora de 32, 40 ou 48 px;
- `backdrop-filter`;
- um `var(--persona-*)` ou `var(--control-*)` sem definição;
- `ms` ou `cubic-bezier` soltos nos módulos (só tokens);
- `@keyframes` com `infinite` fora da lista permitida: a bolinha de quem trabalha e o ponto de gravação do item 20;
- um texto de interface abaixo de 13 px.

---

## 18 · A conversa da tarefa como fio real dentro do Quadro (Prism)
**Abrir:**
- **Gatilho:** clicar no cartão do Quadro (o `KanbanCard`) abre um **painel à direita**, de 440 px.
- **Não é modal:** o Quadro continua visível e clicável, sem scrim.
- **Entrada:** preset `panel` (translateX 24 px mais a opacidade). **Saída:** `--motion-panel` com `--ease-exit`.
- **Fechar:** `Esc` ou o botão X 32 px.

**O painel:**
- **Cabeçalho:**
  - o título do cartão em 17 px Fredoka;
  - o selo da coluna;
  - os avatares de quem cuida, em 24 px;
  - as abas `Conversa · Detalhes`, a 40 px.
- **Conversa:** os mesmos componentes da DM: streaming, anexos, @menção, o cartão de escolha (item 11), o "segure" (item 5) e o resumo recolhido (item 6). Nenhum componente novo de mensagem.
- **Composer:** placeholder `Escreva para a Bia sobre esta tarefa`.
- **Vazio:**
  - a ilustração do Brush em 160 px;
  - `Ninguém falou desta tarefa ainda.`;
  - `Peça algo a quem cuida dela.`

**O cartão no Quadro:**
- **Mensagens:** o ícone de balão com o número de não lidas, num selo de 22 px, só leitura.
- **Trabalho:** quando a persona trabalha na tarefa, a linha do passo (item 6) aparece no pé do cartão, numa linha só.

**Ligação com o #geral:** a mensagem do #geral sobre a tarefa ganha o link `Abrir a conversa da tarefa`.

**Arte (Brush):** o vazio da "conversa da tarefa", nas versões dia e noite.

---

## 19a · Os números vivos na Visão geral (Rivet)
**Nome:**
- A tela continua sendo **Visão geral**.
- O painel é a seção do topo **`Seus números`**.
- Não criamos "Minha Casa" como um terceiro nome de lugar (a regra 3 do DESIGN-01-MUSE).

**A seção:**
- uma grade de cartões de 280 px de largura mínima e 148 px de altura, em 2 a 3 colunas, com 16 px de vão;
- **6 tipos**:
  - número com seta de tendência;
  - barra de meta;
  - barras;
  - linha;
  - lista com ✓ e ! (`ok` / `atenção`);
  - resumo de até 6 frases.
- **Seta de tendência:** sempre com texto (`+12% desde ontem`), nunca só a cor. Subir em verde (`--persona-success`); cair em `--persona-danger` só quando o indicador diz que cair é ruim.

**Fixar:**
- **Gatilho:** todo número ou gráfico numa conversa ganha o botão fantasma 32 px `Fixar na Visão geral`, com o ícone `pin`.
- **O modal (480 px):**
  - o nome do número;
  - quando atualizar: `A cada hora` ou `Todo dia às 8h`;
  - opcional: `Avisar quando cair mais de 20%`.
- **O teste:** `Testar agora` (40 px) é **obrigatório**. O resultado real aparece no próprio modal, e só então `Fixar` (primário 48 px) é liberado.
- **A dica:** `Teste antes de fixar: assim você vê o número de verdade.`

**Estados do cartão:**
| Estado | Texto no rodapé | Visual |
|---|---|---|
| Atualizado | `Atualizado às 8:00` | — |
| Atualizando | `Atualizando…` | spinner 16 px; o valor antigo continua |
| Falhou | `Não consegui atualizar · Ver por quê` | âmbar; o valor antigo continua, com `de ontem` |
| Alerta | `Caiu 24% desde ontem` | borda esquerda âmbar de 3 px; também vai a "Precisa de você" |

**As regras de silêncio:**
- A atualização é **muda**: nunca posta mensagem em canal ou DM.
- O alerta vai só para "Precisa de você".

**Movimento:**
- **Número que muda:** crossfade com 4 px em `--motion-message`.
- **Sem contador correndo** (é dado, não festa).
- **Gráficos:** sem animação de desenho.

**Vazio:**
- a ilustração do Brush em 160 px;
- `Peça um número a alguém da equipe, como "quanto vendemos ontem?", e toque em Fixar.`

**Arte (Brush):** o vazio de "Seus números" (dia e noite) e 6 ícones de indicador.

---

## 20 · A mensagem de voz e os sons discretos (Cobalt)
**1. Gravar:**
- **O botão:** com o composer vazio, ao lado de enviar aparece o botão de microfone, só ícone, 40 px. Com texto, só o enviar.
- **Gravação:**
  - um clique começa e outro envia; `Esc` descarta;
  - o composer vira a **barra de gravação**: o ponto `--persona-danger` de 8 px, que pisca 1 s (a contínua permitida), o tempo `0:07` e a onda ao vivo;
  - a onda tem 32 barras de 3 px com 2 px de vão e 4 a 24 px de altura, só com `transform: scaleY`;
  - os botões são `Descartar` (só ícone, 32 px, lixeira) e `Enviar áudio` (40 px).
- **Limite:** 2 min. A partir de 1:45 aparece `Máximo de 2 minutos`.

**2. O balão de áudio:**
- o botão tocar/pausar, um círculo de 32 px;
- a onda estática do áudio real, com 40 barras: a parte ouvida em `--persona-brand` e o resto em `--persona-ink-soft`;
- a duração `0:12`;
- a velocidade `1× · 1,5× · 2×` num controle de 32 px;
- **embaixo, 1 linha da transcrição**, em 13 px, `--persona-ink-muted`, com `ver tudo`.

**3. Estados da transcrição:**
| Estado | Texto |
|---|---|
| Transcrevendo | `Transcrevendo…` |
| Falhou | `Não deu para entender o áudio. Pode escrever?` |
| Sem o pacote de voz | no primeiro uso, o aviso `Para entender áudios, a Persona baixa o pacote de voz uma vez (tamanho: Cobalt confirma).` com o botão `Baixar agora`, e nunca no instalador (a dieta) |

**4. Os sons:**
- são 5, sintetizados no nosso código: entrega pronta, pedido de confirmação, mensagem nova em DM, enviado e algo deu errado;
- tocam só depois do primeiro gesto na janela, no máximo 1 a cada 2 s, e nunca dentro de uma Janela de silêncio;
- a mensagem nova não toca com a conversa aberta e focada.
- **A opção** fica em Configurações › Aparência:
  - o interruptor `Sons discretos`;
  - a descrição `Um toque curto quando algo fica pronto ou precisa de você.`;
  - o volume `Baixo · Médio`, ligado em `Baixo`.

**Arte (Brush):** os glifos `mic`, `stop`, `trash`, `play`, `pause` e `pin`, todos em 24 px no padrão `ui-glyphs`.

---

## Arte para o Brush (as medidas finais)

Os glifos vão em 24 × 24, em traço 1,75, `currentColor`, sem preenchimento, em `persona-assets/icons/ui-glyphs/`. São estes: `hold`, `mic`, `stop`, `trash`, `play`, `pause` e `pin`.

**1. As poses de presença** (trabalhar, pensar e aguardar):
- **Partida:** as da capivara existem. Use-as como molde para os outros bichos, na mesma escala e enquadramento das `poses/` atuais.
- **Uso:** no avatar de 32 a 96 px. Precisam ser lidas a 32 px.
- **Ordem:** os 4 bichos do modelo inicial primeiro.

**2. "Fora até X h"** (a assinatura pausada): uma pose nova, em pé, com um relógio ou uma xícara. Não pode ser dormindo, porque dormir é `Descansando`.

**3. As figurinhas da capivara** (4 novas, para chegar a 12):
- `obrigada`, `uau`, `combinado` e `boa-ideia`;
- `.png` mais `-96.png`, no mesmo padrão de `stickers/capivara/`.

**4. A ilustração "ligar a IA para a equipe toda":**
- 240 × 140 a @1x, entregue @2x, ou seja, 480 × 280;
- **tema:** a equipe em volta da luminária, com o fio sendo ligado;
- **uma só versão** para claro e escuro: o fundo transparente e o contorno nanquim fazem ela funcionar nos dois.

**5. Os vazios** (em 3:2, usados a 240 × 160 @1x; o master pode ser 1536 × 1024 com alfa, e o `build-assets` reduz), nas versões dia e noite:
- **conversa da tarefa:** um bicho com um cartão do quadro na mão;
- **Seus números:** um bicho com uma prancheta e um gráfico simples. O arquivo se chama `empty-seus-numeros` (e `-noite`).

Nos itens 18 e 19a, onde se lê "a ilustração do Brush em 160 px", vale 240 × 160.

**6. Os 6 ícones de indicador** (24 px no padrão `ui-glyphs`):
- vendas;
- boletos;
- clientes;
- estoque;
- agenda;
- contatos sem resposta.

**O que não pedir:** arte para o cartão de escolha nem para o "segure", além do glifo `hold`. Ali, a clareza vence o enfeite.

**Entrega:** registre tudo no `build-assets.mjs`. As poses e os glifos são automáticos; as ilustrações vão nas listas `ILLUSTRATION_SPECS`.

---

## 16b · Jeito de trabalhar e "Virar skill?" (Anvil; pedido do Keel, 12/11 00:07)
Versão final, que junta a proposta do Anvil (00:08) e a minha (00:08).

**Onde:**
- Uma **aba própria** no perfil da persona, com o nome **`Jeito de trabalhar`**: `Visão geral · Memória · Jeito de trabalhar · Skills`. A ordem conta a história (o que sabe → como faz → o que virou skill).
- O nome não tem gênero, e "Como ela trabalha" não serve para quem não tem gênero conhecido.
- Não vai na Memória da empresa: é o jeito *dessa* persona.
- **Sem artigo** (a regra do Keel): `Bia`, nunca `a Bia`.
- Abaixo do título da aba, em 13 px e `--persona-ink-muted`: `O que Bia aprendeu com as entregas que você usou. Fica aqui, sem aparecer na conversa.`

**Os cartões (um por jeito, no estilo dos cartões de Memória, sem caixa nova):**
- **Linha 1, o título:** o tipo de trabalho, em 15 px (ex.: `Cartaz da promoção de pão de queijo`).
- **Linha 2:**
  - em 13 px, peso 600, `--persona-ink-muted`: `Usado 3 vezes · o último ontem` (palavras, não `3×`);
  - o estágio num chip **neutro**: `Aprendendo · 1 de 3`, `Pronto para virar skill` ou `Já é skill`.
- **Os ajustes do dono, se houver:** o rótulo `O que você costuma pedir:` e cada ajuste numa linha curta, com o mesmo estilo da citação da Memória (14 px itálico, `--persona-ink`, fio de 3 px `--persona-lilac-300`, aspas curvas). Mostra até 3 e depois `ver tudo`.
- **Detalhe técnico:** caminhos e comandos só em `Detalhes técnicos` dobrado (o padrão do item 4).
- **A ação:** uma só, `Esquecer` (secundária, 32 px), que confirma no próprio cartão com `Sim, esquecer` e `Manter`.

**"Virar skill?": a decisão mora em Aprovações** (o lugar único das decisões do dono):
- quando o jeito chega a **3 usos em 2 conversas ou 2 dias**, a oferta vai para Aprovações;
- no cartão do jeito, o chip fica `Pronto para virar skill` e aparece o link `Decidir em Aprovações`;
- **o cartão em Aprovações:**
  - o avatar de 32 px;
  - o título `Bia aprendeu: cartaz da promoção de pão de queijo`;
  - o texto `Usado 3 vezes em 2 conversas. Virar skill deixa esse jeito pronto para usar sempre.`;
  - os botões `Virar skill` (primário, 40 px) e `Agora não` (secundário, 40 px);
  - **sem âmbar**: é uma sugestão, não "esperando você".
- **`Agora não`:** só oferece de novo depois de mais 3 usos. Sem insistir.
- **Depois de `Virar skill`:**
  - o chip vira `Já é skill`;
  - o cartão em Aprovações fica `✓ Virou skill · Ver em Skills`, com o check desenhando o traço em `--motion-message`.

**Silêncio:**
- nenhuma mensagem no chat, nenhum som e nenhum toast;
- o único sinal é a contagem normal de Aprovações.

**Os estados:**
| Estado | O que mostra |
|---|---|
| Vazio | **só texto** (sem ilustração; a fila do Brush fica para o que é novo): `Nada aprendido ainda.` mais `Quando você usar uma entrega de Bia, o jeito de fazer fica anotado aqui.` mais a ação `Conversar com Bia` (40 px, secundária, abre a DM) |
| Carregando | skeleton de 2 cartões, sem shimmer animado |
| Erro | `Não consegui carregar agora.` mais `Tentar de novo` (40 px) |

**Acessibilidade:** os botões dizem o resultado (nunca `OK` ou `Cancelar`), e a confirmação de `Esquecer` leva o foco para `Manter`.

**Aceite:** claro e escuro, a 100% e 200%, com 3 jeitos (um `Aprendendo`, um `Pronto`, um `Já é skill`, um deles com 3 ou mais ajustes), a confirmação de `Esquecer`, o cartão em Aprovações e os estados vazio e erro.

---

## 30 · "Acordando o time": a espera da abertura (alavanca 1, shell estático; Prism, com o transporte do Zinc)
**O problema que resolve:** hoje o renderer fica de 8 a 12 s parado esperando o host (perf/ABERTURA.md). Com o shell estático, a casa aparece em ~2 a 3 s, e esta é a tela até o host responder.

**As regras:**
- é **barata** (o renderer disputa CPU com o host: medido +1,5 s em 11/11);
- **nunca parece travada**;
- **nunca mente** sobre o progresso.

### O que aparece (no 1º quadro, sem tela branca)
1. **O fundo e o tema certos desde o 1º quadro:**
   - o tema salvo (o mesmo que o preload já lê) vira o `background` do `<html>` antes de qualquer script;
   - **nada de quadro branco** (o rig de abertura da Muse confere: `.maestri/tmp/muse/opening-frames.mts` mais `opening-analyse.py`).
2. **O rail de verdade, estático:**
   - a marca no topo e os 5 lugares com os rótulos (são fixos), na largura real;
   - **desabilitados** (`aria-disabled`, a 60 %), sem contagem nem canais (ainda não se sabe);
   - a folhagem embaixo.
3. **No centro, a cena:**
   - a luminária acesa (a arte `estacao-pareando` sem a coruja, ou a luz do rail) e, **embaixo, os rostos do time chegando**;
   - os rostos são **os da última sessão** (o shell guarda no `localStorage` até 5 ids de bicho, só os ids, sem nome nem dado);
   - na **1ª abertura** (nada salvo), o trio do onboarding: Atlas, Bento e Nina;
   - os rostos têm 64 px, o R2 enquadrado na cabeça, numa fileira centrada com 12 px de vão.
4. **A frase**, em Fredoka 20, com uma linha de 14 px muted embaixo, num `role="status"` `aria-live="polite"`:
   | Momento | Frase | Linha de baixo |
   |---|---|---|
   | 0 a 1,5 s | `Acordando o time…` | — |
   | o transporte conectou, carregando a casa | `Arrumando a casa…` | — |
   | mais de 6 s | `Ainda abrindo.` | `O computador está ocupado, já já termina.` |
   | mais de 25 s (o erro honesto) | `Não deu para abrir a casa agora.` | os botões `Tentar de novo` (primário, 40 px) e `Ver o que aconteceu` (abre o relatório de suporte que já existe) |
   - **A troca de frase segue os fatos** (o transporte conectou, o host respondeu), e o relógio só serve para os avisos de demora. **Nenhuma barra de progresso inventada.**

### Movimento (CSS puro, só `transform` e `opacity`)
- **A chegada:** cada rosto vai de `translateY(12px) scale(.96)` e opacidade 0 até o lugar, em `--motion-slow` (360 ms) com `--ease-enter`, com **120 ms de stagger**. 5 rostos terminam em 0,84 s.
- **Depois de chegar:** os 3 pontinhos de "digitando" ao lado da frase (opacidade em `steps`, 1,2 s por ciclo). É a **única** animação contínua. Ela para aos 25 s, no estado de erro.
- **Sem luminária piscando, sem shimmer, sem esqueleto animado e sem `filter`.**
- **A saída** (o host respondeu e a 1ª tela útil montou): crossfade de 220 ms, `--motion-base` com `--ease-standard`, com a tela real por baixo.
- **O tempo mínimo e o máximo:**
  - se o host responder em menos de **400 ms**, a cena **não aparece** (vai direto, sem piscar);
  - se a cena começou, ela fica pelo menos até o último rosto chegar (~0,9 s), para não cortar no meio.
- **Reduced motion:** os rostos aparecem juntos (fade de `--motion-reduced-fade`) e os pontinhos ficam parados (a frase basta).
- **Prioridade:** a cena não pede nada ao host e não faz polling. Ela só reage aos eventos do transporte.

### Acessibilidade e claro/escuro
- O `role="status"` diz a frase. Não há nada focável até o erro (aí o foco vai para `Tentar de novo`).
- Os rostos são `aria-hidden` (decoração). O nome dos bichos não é dito.
- No claro, o papel creme e o rail lavanda. No escuro, o ameixa e a luminária mais quente. Os mesmos tokens do app.

### O aceite
- O rig de abertura (os quadros a ~26 fps desde o clique no atalho) no instalador interno:
  - **zero quadros brancos**;
  - o 1º quadro com o rail em até ~1 s;
  - a cena com os rostos;
  - a troca para a 1ª tela útil;
  - claro e escuro, mais 1 rodada com reduced-motion.
- Mais as capturas de cada frase, incluindo o erro.

---

## 29 · A Casa da Equipe no formato de canais (pedido do Miguel, 12/11 09:20; a tela-mãe dos itens 22 e 23)
**A prancha:**
- **as telas:** `.maestri/tmp/shots/design/casa-equipe/prancha-casa.png` (claro e escuro a 1440) e `prancha-detalhes.png` (a mensagem, a aprovação e "Quem está aqui");
- **a fonte:** `.maestri/tmp/muse/casa-equipe/casa.html` (os tokens, as fontes e a arte reais; abra no navegador);
- **o modelo:** a referência foi o padrão de 3 colunas, e nada do visual nem do texto foi copiado.

### O que é nosso e melhor do que a referência
- **A barra é a casa:**
  - o rail lavanda com a folhagem do Brush embaixo, sempre atrás do cartão "você" opaco e nunca atrás de texto;
  - a empresa no topo ("Padaria Lua · 2 pessoas · 5 personas");
  - **5 lugares, não 7**: Início, Aprovações, Quadro, Arquivos e Equipe. Sem "Fios" e sem "Mais".
- **As seções de canal são as EQUIPES** (§22):
  - a bolinha no tom da equipe e os rostinhos de quem está nela;
  - não lido em negrito com a contagem;
  - a menção como `@1` em âmbar (ela espera você);
  - a seção fechada mostra o total.
- **As personas com o rosto vivo de 40 px (R2) e a frase do que estão fazendo AGORA** ("Criação · Escrevendo a legenda", do item 6), não só o cargo. Isso é o "parece gente".
- **A gramática de forma:** gente é círculo; persona é o quadrado com o bicho.
- **O fio é o da §23** (os balões v5, a Geist e o rosto R2), mais:
  - a rotina que gerou a mensagem num chip (`Resumo das 8h`);
  - o cartão de tarefa criada;
  - o trabalho recolhido **numa linha só** ("Fez em 2 min · 5 passos · usou 3 ferramentas"). A referência usa 2 linhas;
  - as reações com as figurinhas;
  - a aprovação do item 5 dentro do fio;
  - "Bento está escrevendo a legenda…" com o rosto pensando.
- **O compositor sem a barra de formatação** de programador: só `+`, imagem, figurinha, áudio e "Coordenação decide quem responde".
- **"Quem está aqui"** agrupado por Dono, Pessoas, cada equipe e "Fora agora", com o estado vivo em verde ("Preparando o envio"). No fim, "Pôr pessoa ou persona".

### A minha recomendação para a 1ª versão (o que entra já)
1. A barra com a empresa, a busca, os 5 lugares, as **seções por equipe** (o host do Flint já tem o `channelLayoutOf`), a seção Personas com o rosto R2 e a linha do que faz agora, e você no rodapé.
2. O cabeçalho do canal com o assunto e a pilha de rostos.
3. O fio da §23 (já aceito na galeria) com os cartões que **já existem**: a tarefa criada, o resumo recolhido (item 6), as reações por figurinha (item 14) e a aprovação (item 5).
4. O painel "Quem está aqui" (Dono, cada equipe e "Fora agora"), que **já pode** existir só com personas.
5. **Fica para a entrega do item 23 (pessoas reais):**
   - a seção "Pessoas" e as conversas diretas com gente;
   - o seletor de empresa clicável (com 1 empresa é só um título);
   - a presença online de gente.
   Até lá, a interface não mostra nada disso, para não prometer o que não funciona (HONEST-1).
6. **Não entra:** "Fios" como lugar (o assunto do canal já resolve), a barra de formatação e qualquer contagem de "membros" técnica.

**Os donos:** Prism (UI) e Flint (host). O aceite segue a regra de sempre (o pré-aceite do Ember mais a Muse), contra esta prancha.

### 29b · Os microdetalhes (o "capricho a mais" do Miguel, 12/11 09:45)
**As regras:**
- tudo nos tokens de movimento do DESIGN-01 e só `transform` e `opacity`;
- **reduced-motion = fade de `--motion-reduced-fade`, ou nada**;
- nenhuma animação contínua nova (o teto continua 2).

1. **A linha da barra (canal, lugar, persona):**
   | Estado | Como fica |
   |---|---|
   | Hover | o fundo `rail-raised` (`--rail-raised` no claro e no escuro), sem transição de cor (instantâneo, como lista de app nativo) |
   | Foco de teclado | o anel de 2 px `--persona-focus-ring` por dentro da linha (outline-offset −2 px), nunca cortado pela barra |
   | Ativo | a pílula creme com a sombra sticker de 3 px (já na prancha) |
   | Pressionar | `scale(.98)` em `--motion-instant` com `--ease-press` |
   - No hover de um canal aparecem, à direita, `⋯` (32 px) e o sininho de silenciar. Somem quando sai, e no foco ficam.
2. **Trocar de canal:**
   - a pílula ativa desliza da linha antiga para a nova: `transform: translateY`, `--motion-panel`, `--ease-enter` (um elemento só, o indicador);
   - o fio novo entra com opacidade 0 → 1 em `--motion-fast` e 6 px de subida;
   - **o cabeçalho troca na hora**, sem animação (é texto).
   - Reduced-motion: a pílula pula para o lugar, e o fio troca em fade.
3. **"Novas mensagens":**
   - ao abrir um canal com não lidos, uma linha fina em `--persona-accent` atravessa o fio acima da 1ª mensagem nova, com o rótulo `Novas` num chip âmbar à direita;
   - o fio **abre nela**, e não no fim;
   - a linha some quando você chega ao fim do fio e fica 2 s ali (fade de `--motion-base`).
   - Sem nada novo, o fio abre na posição salva (o item 12).
4. **"Digitando" com o rosto vivo:**
   - embaixo do fio: o rosto de 24 px no humor **pensando** (o `-blink` vale), mais `Bento está escrevendo a legenda` (a frase do item 6), mais os 3 pontinhos;
   - com 2 ao mesmo tempo, os 2 rostos sobrepostos e `Bento e Nina estão escrevendo…`;
   - com 3 ou mais, `3 personas estão trabalhando aqui`;
   - a linha **reserva a própria altura** (24 px), para o fio não pular quando aparece ou some.
5. **A mensagem que chega:**
   - se você está no fim do fio, ela entra com o preset `message` (opacidade e 6 px) e o fio rola junto, suave (`scroll-behavior` só se não houver reduced-motion);
   - **se você subiu para ler, o fio NÃO se mexe**: aparece a pílula flutuante `↓ 2 mensagens novas` (40 px, centrada embaixo, sólida), que ao clicar desce;
   - a âncora de rolagem é a mensagem que você está lendo (`overflow-anchor`), para nada pular quando um cartão cresce.
6. **A aprovação que vira "Enviado ✓":**
   - depois do "segure", o check desenha o traço (`--motion-message`) no botão;
   - **o cartão encolhe** até uma linha só, `✓ Enviado no WhatsApp para 12 clientes · 09:16` (altura com `grid-template-rows 1fr → 0fr` no corpo, `--motion-panel`), e a prévia vai para `Ver o que foi enviado`, dobrado;
   - a borda deixa de ser de destaque.
   - Reduced-motion: a troca é seca, para a linha.
7. **O canal novo, vazio, ilustrado:**
   - a arte `canal-pronto` (240 × 160) mais `#promoções está pronto.` mais `Aqui estão Nina e Atlas. Escreva um pedido e quem cuida disso responde.`;
   - **3 sugestões de 1 clique** feitas a partir da equipe do canal (`Pedir o resumo das vendas de hoje`), que **preenchem** o compositor e nunca enviam sozinhas.
8. **A reação com micro-pulo:**
   - ao reagir, a figurinha da pílula faz `scale(1 → 1,18 → 1)` no preset `stamp` (320 ms, mola) e o número troca em crossfade de 150 ms;
   - a sua reação fica com a borda `--persona-brand`;
   - tirar a reação: sem pulo, só o número.
   - Reduced-motion: sem pulo.
9. **O bicho trabalhando no rail:**
   - na linha da persona, o rosto troca para o humor **pensando** enquanto trabalha (item 21, crossfade por cima) e a bolinha verde respira;
   - **o rosto que respira é só UM na tela inteira**: o maior visível (a regra do §21);
   - no rail, só o rosto troca, sem respiração;
   - ao terminar uma entrega, o humor **feliz** por 4 s.
10. **Os atalhos:**
    - `Ctrl K` abre o `Ir para…` (canais, personas e lugares, com a busca por letras);
    - `Alt ↑` e `Alt ↓` vão para o canal anterior e o próximo;
    - `Alt Shift ↑` e `Alt Shift ↓` vão para o próximo **com não lido**;
    - `Esc` no compositor vazio tira o foco dele;
    - os atalhos aparecem no `?` de Ajuda e no `title` dos lugares (`Início · Ctrl 1`).
    - **Nada de atalho que o leigo dispare sem querer** (sem tecla solta).
11. **A rolagem que guarda a posição:**
    - cada canal lembra onde você estava (o id da mensagem âncora, por canal, na sessão e no `localStorage`) e volta exatamente ali, sem animação;
    - o fim do fio é o padrão só se você estava no fim.
12. **Mais 3 que fazem diferença:**
    - **(a)** a hora absoluta aparece no hover da hora relativa;
    - **(b)** o `@` no compositor abre o menu de chamar (as equipes, as personas do canal, a gente), com o rosto de 24 e `Enter` para escolher;
    - **(c)** ao enviar, o compositor **mantém o foco** e a sua mensagem entra com o preset `message`, sem o fio pular.

**O aceite dos microdetalhes:** os quadros do meio de cada movimento (o rig de capturas por quadro), mais um vídeo curto do fluxo (trocar de canal, chegar mensagem lendo no meio, reagir, aprovar), em claro e escuro, e 1 rodada com reduced-motion.

---

## 27 · O convite do 1º colega (item 23; arquitetura: carbon/COLABORACAO-PESSOAS.md)
**As regras:**
- **gente é círculo** (a foto, ou as iniciais num círculo);
- **sem jargão**: E2EE, chave, WebSocket e Worker não aparecem; aparece `cifrado: só quem está na equipe lê`;
- **sem emoji** na interface (os glifos do `ui-glyphs`).

**1. Convidar** (quem convida é o dono):
- **Onde:** Equipe › o botão primário `Convidar pessoa`, mais, no rail, `+ Convidar alguém` no fim de `Pessoas`.
- **O modal (560):**
  - a arte `convite-enviado` em 240 × 160;
  - o título `Convidar alguém para a Padaria Lua`;
  - o botão `Criar link de convite`;
  - depois, o cartão do link, com o link em fonte mono, `Copiar link` (primário) e `Mandar pelo WhatsApp` (secundário, abre a conversa com o texto pronto, **sem logotipo**);
  - a linha `Vale por 7 dias, para 1 pessoa.`;
  - o selo `As conversas são cifradas: só quem está na equipe lê.` com o glifo `lock`.

**2. Do lado de quem foi convidado (a Ana):** ao abrir o link no app, a tela tem:
- a arte `convite-aguardando`;
- `Pedido enviado. Esperando Miguel deixar você entrar.`;
- `Cancelar pedido` (secundário).
- **Link vencido:** `Este convite venceu. Peça um novo a Miguel.`

**3. Na caixa do dono** (Aprovações, no topo, com âmbar, porque espera você):
- o cartão `Ana quer entrar na Padaria Lua`, com o rosto **redondo** de 40 px e `Pelo link de 12/11`;
- **o que ela pode** (ChoiceCards):
  - `Conversar com a equipe` (marcado);
  - `Também aprovar decisões do negócio`.
- **os botões:** `Segure para deixar entrar` (o "segure" do item 5, porque é uma decisão de confiança) e `Recusar`.

**4. Depois de entrar:**
- **No app da Ana:** o trilho de empresas aparece (2ª empresa).
- **No `#geral`:** a linha de sistema `Ana entrou na equipe.`.
- **Os outros colegas veem `Aguardando Miguel aprovar`** nas aprovações que são só do dono (Carbon §4.5).
- **`Pessoas`** aparece no rail, com a presença:
  | Presença | Visual |
  |---|---|
  | online | a bolinha verde |
  | ausente | o anel lavanda |
  | fora | sem bolinha e o nome em `--persona-ink-soft` |

**5. Quem responde:**
- **Só gente:** `@Ana` sozinha não acorda nenhuma persona.
- **O composer** num canal com 2 pessoas ou mais mostra a pílula `Conversa entre pessoas` enquanto ninguém chama uma persona. Ao citar `@Bia`, a pílula vira `Bia responde`.
- **A pílula** é a "Quem responde" que já existe, e não um componente novo.

---

## 28 · A Estação de Agentes (item 24: o computador dedicado 24/7)
**O nome na tela:** `Estação`, com a explicação sempre ao lado na 1ª vez: `Um computador que fica ligado e trabalha pela equipe quando o seu está desligado, na sua assinatura.`
- **Sem RAM, GB, Tailscale nem IP.**

**1. Onde:** Configurações › a aba **`Estação`**.
- **O vazio:**
  - a arte `estacao-vazio`;
  - `Nenhum computador da equipe ainda.`;
  - `Use um computador que possa ficar ligado (um mini-PC ou um notebook antigo).`;
  - o botão `Ligar um computador` (primário).

**2. O pareamento**, no painel de 440:
- **Passo 1:** `No outro computador, instale a Persona e escolha "Este computador vai ser a Estação".`
- **Passo 2:** `Digite o código que aparece lá`:
  - 8 caixas de 48 px (`XXXX-XXXX`, com o traço fixo no meio), número tabular, colar preenche;
  - o selo `Vale por 10 minutos` (âmbar a menos de 1 min).
- **Enquanto liga:** a arte `estacao-pareando` e `Ligando…`.
- **Pronto:** o carimbo `Estação Escritório ligada`.
- **Erros:**
  - `Esse código não confere. Confira no outro computador.`;
  - `O código venceu. Peça um novo no outro computador.`

**3. O cartão da Estação:**
- o nome (editável) e o estado:
  | Estado | Visual |
  |---|---|
  | `Ligada` | bolinha verde |
  | `Desligada desde 14:30` | cinza |
  | `Cheia agora: 2 tarefas esperando` | âmbar |
- `Quem trabalha aqui`: os rostos de 24 px, mais o botão `Mudar quem trabalha aqui`;
- dentro de `Detalhes`: `Ligação direta com o computador de Ana: ativa` (a via expressa, sem o nome técnico);
- `Desligar a Estação` (perigo, confirma na linha).

**4. Os sinais no app:**
- **O rodapé do rail:**
  - a pílula `Rodando neste computador` ou `Estação Escritório · ligada`;
  - o glifo, e não emoji;
  - clicável, abre a aba.
- **Na linha da persona no rail:** um glifo de 12 px de "estação" quando ela mora lá, com a dica `Trabalha na Estação Escritório`. O Brush desenha o glifo `estacao`, de 24 px no padrão.

**5. A tela do computador-Estação:**
- uma tela só, calma:
  - a luminária acesa (arte `estacao-pareando` sem a coruja, ou a cena do escritório à noite);
  - `Esta é a Estação da Padaria Lua. Pode deixar ligada.`;
  - `✓ O computador não vai dormir`;
  - o link `Desligar a Estação`.
- **Sem conversa e sem quadro:** é uma tela de vigília.

---

## 26 · "Ferramentas do seu negócio": catálogo, conectar, saúde (Bloco B do PLUGINS-GAP: 26.4, 26.5, 26.6, 26.7, 26.8)
**As regras:**
- **nenhuma palavra técnica** na tela: MCP, servidor, OAuth, token e stdio estão fora (a POWERS-SPEC);
- **nenhum logotipo de terceiro**: o serviço é identificado pelo **nome** e pela **arte da categoria**, que o Brush desenha.

### Onde
- Configurações ganha a aba **`Ferramentas`**, logo depois de `Conexões`, que continua sendo a das contas de IA. Nada de aba dentro de aba.
- **Cabeçalho:**
  - o rótulo `CONFIGURAÇÕES`;
  - o título `Ferramentas do seu negócio`;
  - o subtítulo `Ligue as ferramentas que a sua empresa já usa. A equipe trabalha nelas por você e sempre pede antes de enviar, pagar ou apagar.`

### A tela, de cima para baixo
1. **A descoberta (26.7), uma faixa só, quando houver algo:**
   - o texto `Encontramos 6 ferramentas no seu Claude Code e no Cursor. Trazer para a Persona?`;
   - os botões `Trazer as 6` (primário, 40 px) e `Ver quais` (secundário).
   - Depois de trazer, a faixa some.
2. **`Ligadas · 3`:** a lista em cartões compactos, com 64 px de altura:
   - a arte da categoria em 40 px;
   - o nome em 15 px, peso 600;
   - o chip de saúde (26.8);
   - `⋯` com `Quem pode usar`, `Testar agora` e `Desligar`.
3. **Os filtros:** chips de 32 px (o `FilterChips`): `Tudo · Vendas e loja · Pagamentos · Atendimento · Agenda e email · Documentos · Redes sociais · Gestão`.
4. **A grade `Para ligar`:**
   - cartões de 260 px de largura mínima, com 16 px de vão;
   - **o cartão:**
     - a arte da categoria em 64 px, no canto;
     - o nome em Fredoka 17 px;
     - **uma frase do que a equipe faz com ele**, em 13 px `--persona-ink-muted` (`Ver vendas e responder clientes do Mercado Livre.`);
     - no rodapé, `Conectar` (secundário, 40 px), ou o chip `Já ligado ✓`, ou, para os que entram pela conta do Claude, `Ligar na sua conta do Claude`.
5. **`Em breve`:** uma seção recolhida no fim, com os serviços ainda não confirmados. Os cartões ficam a 70 %, sem botão, com o chip neutro `Em breve`. Eles nunca ficam misturados com os prontos.
6. **O rodapé:** o link de 32 px `Tenho um link ou comando` (26.6).

**O vazio do filtro:** `Nada nesta categoria ainda.` + `Tenho um link ou comando`.

### Conectar (26.5): no painel lateral de 440 px (o padrão do Cofre)
1. **`Continuar no Mercado Pago`** (primário, 40 px):
   - abre o navegador;
   - o painel mostra `Esperando você terminar no navegador…` com o spinner de 16 px, mais `Cancelar`.
2. **A volta:**
   - o carimbo curto (preset `stamp`, o check desenhando o traço) com `Mercado Pago ligado`;
   - com reduced-motion, só o fade.
3. **`Quem pode usar?`:**
   - **os rostos:** de 40 px (R2), marcáveis, **todos desmarcados** (o padrão é ninguém sem perguntar, D-084);
   - **o que ele permite:** a lista em PT, agrupada (`Ler · Mudar · Enviar · Pagar · Apagar`), com o cadeado de 16 px nas que **sempre pedem**;
   - o botão `Pronto` (primário).
- **Sem entrada por navegador:** o assistente `Onde acho o código?` em 3 passos (o texto mais uma imagem do Brush) e o campo de senha, com `Fica guardado no Cofre deste computador.` O valor nunca volta à tela.

### `Tenho um link ou comando` (26.6)
- **O campo:** um só, com o rótulo `Cole o link ou o comando que o site mandou`.
- **A resposta:**
  - `Abre direto` → segue para o `Quem pode usar?`;
  - `Pede para entrar` → segue para o passo 1;
  - `Pede um código` → segue para o assistente.
- **Programa local:** o aviso de **atenção** (o Notice do DS, com o ícone `alert`), opaco: `Isso roda um programa no seu computador. Só adicione se confiar em quem mandou.`, mais a caixinha **desmarcada** `Confio em quem mandou`. Só então `Adicionar` é liberado.

### Saúde (26.8): o chip no cartão ligado
| Estado | Chip | Ação | Tom |
|---|---|---|---|
| Funcionando | — (só a bolinha verde de 8 px) | — | — |
| Precisa entrar de novo | `Entrar de novo` | o botão abre o passo 1 | **âmbar** (espera você) |
| Falta permissão | `Falta permissão para criar cobrança` | `Entrar de novo` | âmbar |
| Fora do ar agora | `Fora do ar agora` | `Tentar de novo` (a persona tenta sozinha depois) | neutro |
| Não encontrado | `Não encontrado` | `Remover da lista` | neutro |

- **No fio:** uma linha de sistema: `Nina não conseguiu ler as vendas: o Mercado Pago pediu para você entrar de novo.` mais o botão de 32 px `Entrar de novo`. O erro do fornecedor fica em `Detalhes técnicos` dobrado, sempre embaixo da nossa frase.
- **As linhas honestas de motor**, em 13 px `--persona-ink-muted`, no topo da aba:
  - `No Cursor, as ferramentas ainda não funcionam.`;
  - `No Codex, todas as suas ferramentas já ficam carregadas.` (enquanto o 26.3 não fechar).

### O aceite
- Claro e escuro, a 1440, 960 e 200%;
- a grade com os 7 filtros;
- `Ligadas` com os 5 estados de saúde;
- o fluxo de conectar (esperando, ligado, quem pode usar);
- o assistente de código;
- `Tenho um link`, com o aviso de programa local;
- a faixa de descoberta;
- o vazio do filtro.
- **Sem nenhum logotipo** de terceiro.

---

## Arte da noite 2 (pedido do Keel, 12/11 02:57; a Muse especifica, o Brush propõe)
**Regras de sempre:**
- nanquim, a paleta da Direção D, alfa limpo (`alpha-clean.py`);
- **nenhum logotipo nem marca de terceiros**;
- rascunho com `_`, versões em `persona-assets/vivas-trabalho/`.

### 1. As figurinhas de reação do time inicial (PRIORIDADE)
- **Quem:** os bichos do modelo inicial: Atlas, Bento, Nina, Sol e Luna. A capivara já tem.
- **As 4 de cada:**
  | Figurinha | Gesto |
  |---|---|
  | `obrigada` | patas juntas + piscada |
  | `uau` | patas no rosto, boca em "o" e risquinhos de espanto |
  | `combinado` | o gesto de "ok" com a pata |
  | `boa-ideia` | SEM pata: olhando para uma lâmpada grande acesa acima da cabeça (a lição da capivara: o polegar se confunde com o `joinha`) |
- **O formato:** o mesmo do `stickers/capivara/`: busto, `.png` de 256 + `-96.png`, em `stickers/<bicho>/<reacao>.png`.
- **A prova:** a prancha a 40 px. As 4 de um bicho não se confundem entre si nem com o `joinha`.

### 2. Estação de Agentes (item 24: o computador dedicado 24/7) (PRIORIDADE)
- **A personagem:** a **coruja** (a vigília da noite: "fica acordada pela equipe").
- **O formato:** os vazios (3:2, 240 × 160 @1x, master 1536 × 1024 com alfa), numa versão só para claro e escuro.
- **`estacao-vazio`:**
  - uma mesinha com um mini-PC (uma caixinha simples, sem marca) desligado, o cabo solto e a luminária apagada;
  - a coruja ao lado, esperando.
  - O texto da tela será `Nenhum computador da equipe ainda.`.
- **`estacao-pareando`:**
  - o mini-PC ligado, com uma telinha que mostra um código abstrato (`••• •••`, **sem dígitos reais**);
  - a coruja ligando o cabo, a luminária acesa e um pontinho verde no mini-PC.

### 3. Equipes e canais (item 22)
- **O glifo `equipe-nova`:** 24 px, no padrão `ui-glyphs`: 3 cabecinhas e um `+` pequeno no canto. Tem de ser distinto de `clientes`.
- **`canal-pronto`:** 240 × 160, mostrado **só** no 1º vazio de um canal com membros, ao lado de `#marketing está pronto.`.
  - A cena: 2 ou 3 bichos sentados em volta de uma mesa, com uma plaquinha `#` em pé no meio.
  - Uma versão só.

### 4. As categorias do catálogo "Ferramentas do seu negócio" (item 26)
- **São 7:** Vendas e loja · Pagamentos · Atendimento · Agenda e email · Documentos · Redes sociais · Gestão (ERP).
- **O formato:** **cenas de OBJETO, sem bicho** (ficam leves no cartão pequeno), em quadrado de 96 × 96 @1x (master 512 com alfa). Precisam ser lidas a 64 px.
- **As cenas:**
  | Categoria | Objetos |
  |---|---|
  | Vendas e loja | um toldo listrado e uma sacola |
  | Pagamentos | uma maquininha de cartão e moedas |
  | Atendimento | um fone com um balão de fala |
  | Agenda e email | um calendário e um envelope |
  | Documentos | uma pasta com uma folha carimbada |
  | Redes sociais | um celular com um coração e uma câmera |
  | Gestão (ERP) | uma prancheta com um gráfico e caixas empilhadas |
- **A cor:** cada uma puxa um dos 7 tons `--persona-subject-0..6` como cor dominante, sem repetir.

### 5. O convite do 1º colega (item 23)
- **O formato:** 240 × 160, uma versão só.
- **`convite-enviado`:** a capivara entrega um envelope com um selo de chave a uma porta entreaberta.
- **`convite-aguardando`:** alguém (uma silhueta redonda, porque é gente: a gramática círculo = gente) espera do lado de fora da porta. Dentro, a luminária do dono acesa.

---

## 23 · Conversa: fonte C + balões v2 + rosto R2 (escolha do Miguel, 12/11 01:06; o Quill passa para CSS e tokens reais)
A referência visual é `.maestri/tmp/shots/design/fontes-baloes/v5/dm-C-*.png` mais `rosto/dm-R2-*.png`. O protótipo injetado é `.maestri/tmp/muse/chat-bubbles-v2.css` mais `chat-face-variants.css`: ele é a medida e **não se copia como está** (os seletores por sufixo de classe são só de captura).

### Fonte C
- **A Geist como fonte de texto:**
  - variável, OFL, com a licença junto;
  - auto-hospedada em `persona-assets/fonts/` e entrando no `persona-fonts.generated.css` como `'Persona Geist'`;
  - `--persona-font-text: 'Persona Geist', 'Geist', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;`.
- **A Fredoka** continua em `--persona-font-display` (títulos, nomes de tela e números grandes).
- **O peso** muda de régua com a Geist:
  - texto corrido 400 (era 500 com a Nunito);
  - rótulos e botões 500 a 600;
  - o que era 800 em texto vira 600 (a Geist a 800 pesa demais).
- Varra os `font-weight: 800` sobre `--persona-font-text` e os `500` de parágrafo.

### Os balões (os tokens no `persona-palette.css`, com o escuro redefinido nos dois escopos)
| Token | Claro | Escuro |
|---|---|---|
| `--persona-bubble-persona` | `var(--persona-card)` | `#2e2239` |
| `--persona-bubble-user` | `var(--persona-lilac-200)` | `var(--persona-lilac-800)` |
| `--persona-bubble-user-ink` | `var(--persona-ink)` | `var(--persona-ink)` (#f6eee0) |
| `--persona-bubble-edge` (valor de `filter`) | `drop-shadow(0 0 .7px rgb(52 36 63 / .48)) drop-shadow(0 2px 3px rgb(52 36 63 / .10))` | `drop-shadow(0 0 .6px rgb(200 184 232 / .55)) drop-shadow(0 1px 2px rgb(0 0 0 / .35))` |

**Contraste medido:**
| Par | Claro | Escuro |
|---|---|---|
| A tinta no balão da persona | 13,8:1 | 13,0:1 |
| A tinta no seu balão | 10,4:1 | 8,5:1 |

**As medidas:**
- **O ritmo:** 18 px entre grupos e **3 px** dentro do grupo.
- **A linha `Nome · hora`:** 13 px, peso 600, `margin-bottom: 5px`.
- **O balão:**
  - `max-width: min(100%, 640px)` (cerca de 68 caracteres), padding `11px 16px 12px`, **sem borda** (`border: 0`, `box-shadow: none`), `filter: var(--persona-bubble-edge)`;
  - a borda desenhada pelo `drop-shadow` faz a cauda ganhar o mesmo anel;
  - o texto em 16 px, entrelinha 1,55, peso 400.
- **Dentro do balão:**
  - `p` com `0 0 .55em` (o último sem margem);
  - `ul`/`ol` com `.35em 0 .55em` e `padding-left: 1.3em`;
  - `li` com `.2em 0`;
  - o `li::marker` em `--persona-ink-soft` peso 600;
  - `strong` em 700.
- **A persona:** `background: var(--persona-bubble-persona)`.
  | Posição | Raio |
  |---|---|
  | `single` | `0 20px 20px 20px` |
  | `first` | `0 20px 20px 6px` |
  | `middle` | `6px 20px 20px 6px` |
  | `last` | `6px 20px 20px 20px` |
  - **A cauda** (em `single` e `first`): `::after` com `top: 0; left: -11px; width: 13px; height: 17px; background: inherit; mask: radial-gradient(circle at 0 100%, transparent 12.5px, #000 13px)` (mais o `-webkit-mask`).
- **Você:** `max-width: min(78%, 560px)`, com `background: var(--persona-bubble-user)` e `color: var(--persona-bubble-user-ink)`.
  | Posição | Raio |
  |---|---|
  | `single` | `20px 20px 0 20px` |
  | `first` | `20px 20px 6px 20px` |
  | `middle` | `20px 6px 6px 20px` |
  | `last` | `20px 6px 0 20px` |
  - **A cauda** (em `single` e `last`): `bottom: 0; right: -11px`, mesmo tamanho, `mask: radial-gradient(circle at 100% 0, transparent 12.5px, #000 13px)`.
  - **`Você · hora`:** `margin: 4px 6px 0 0`, peso 500.
- **GPU:** o `filter` é estático, mas fica em cada balão. A prova vai no pré-aceite: um fio de 100 mensagens rolando sem queda de quadros (o gate `preaccept-gpu`). Se falhar, a troca é por `box-shadow`, e a cauda perde o anel.

### O rosto R2 (40 px, enquadrado na cabeça)
- **O Avatar** (primitivo meu, que o Quill pode editar com este aceite) ganha a prop `crop="head"`: `overflow: hidden` e `.img { transform: scale(1.42) translateY(9%); transform-origin: 50% 30%; }`. Vale para todos os bustos, que têm o mesmo enquadramento.
- **No fio:** `size={40}`, com `crop="head"`, `grid-template-columns: 40px minmax(0, 1fr)`, `column-gap: 12px` e a sarjeta com `padding-top: 0`.
- **No rail (item 22):** os mesmos `crop="head"` e 28 px.
- **O item 21** (vivo) usa este mesmo quadro.

### O aceite
- Claro e escuro, a 1440, 960 e 200%, com: resposta longa, curta, lista, grupo de 3 mensagens suas, cartão de entrega e um fio de 100 mensagens (GPU).
- Na prancha `v5/dm-C-*` mais `rosto/dm-R2-*`, a diferença visual tem de ser zero (as medidas acima).

---

## 22 · Equipes e canais, com o chão para pessoas reais (Muse; host do Flint em `contracts/equipes-e-canais.md`)
**A regra que manda em tudo:** um conceito por vez para o leigo.
- Na barra lateral, **cada equipe É uma seção recolhível**, com os seus canais dentro. As "categorias" do contrato são o mesmo objeto na tela.
- A app cria uma seção por equipe (Marketing, Atendimento…). A pessoa pode renomear, reordenar e criar uma seção a mais (`Projetos`, por exemplo).
- Ninguém vê "equipe" e "categoria" como duas coisas.

### A barra lateral (a largura de hoje)
1. **Topo (igual a hoje):** a marca, `Buscar em tudo… Ctrl K` e os lugares fixos.
2. **Canais sem seção** primeiro, sem cabeçalho (o `#geral`).
3. **As seções de equipe:**
   - **Cabeçalho de 32 px:**
     - o chevron de 16 px (gira −90° fechado, em `--motion-fast`);
     - o nome em 13 px, peso 800, `--persona-ink` sobre o rail, sem caixa-alta forçada: `Marketing`;
     - a bolinha de 8 px no tom da equipe;
     - à direita, até 3 rostos de 16 px de quem está nela;
     - o `+` de 32 px (`Novo canal em Marketing`) só no hover e no foco, e só para quem arruma.
   - **Fechada com algo não lido:** o cabeçalho ganha o selo de contagem, só leitura e neutro (âmbar só se houver algo esperando você).
   - **Canal (linha de 32 px):**
     - `#` de 16 px e o nome em 15 px;
     - não lido: o nome em 700 + o selo de contagem;
     - ativo: a pílula creme de hoje;
     - silenciado: `--persona-ink-soft`.
4. **`Personas`:** as conversas diretas com os bichos.
   - **Linha de 40 px:**
     - o rosto de **28 px enquadrado na cabeça** (nunca inicial, nunca o busto inteiro), com a bolinha do vocabulário de estado no canto;
     - o nome em 15 px e a função em 13 px, `--persona-ink-soft`.
   - **Hoje esta seção se chama `PESSOAS`:** renomear exige grep no repo (os E2E usam o texto).
5. **`Pessoas`** (só aparece quando entrar a 2ª pessoa real):
   - o rosto **redondo** de 28 px (foto; sem foto, as iniciais num círculo; em gente, a inicial é aceitável);
   - a presença: `online` bolinha verde cheia, `ausente` anel lavanda, `fora` sem bolinha e nome em `--persona-ink-soft`.
6. **A gramática de forma (o leigo distingue sem ler):**
   - **círculo = gente**;
   - **quadrado arredondado com bicho = persona**.
   - Vale no rail, no fio, no menu de @ e no cabeçalho do canal.
7. **O trilho de empresas (64 px, à esquerda):** **invisível com 1 empresa**. Aparece com a 2ª, com ícones de 44 px sticker; a troca leva `--motion-panel`.

### O canal
- **Cabeçalho:**
  - `#marketing` em Fredoka 20 px;
  - o chip neutro da equipe;
  - à direita, a pilha de até 5 rostos de 24 px (+N), com gente em círculo e personas em quadrado, que abre o painel de membros;
  - embaixo, em 13 px `--persona-ink-muted`: `Respondem aqui: Lia, Téo e Bia`.
- **O fio:** os balões novos (a prancha de fontes), sem diferença entre canal e DM.
- **Mensagens de gente:**
  - o rosto **redondo** e o balão creme, como o da persona;
  - o seu balão continua lilás à direita;
  - nome e hora iguais aos da persona.
- **As linhas de cerca** (as do Flint, 12/11 00:42):
  - `Lia não está em #marketing.` + `Pôr Lia no canal`;
  - `Ninguém de Marketing está em #atendimento.` + `Pôr Marketing no canal` / `Ir para #marketing`;
  - o vazio: `#marketing está pronto.` + `Aqui estão Lia, Téo e Bia…`.
- **O menu de @:** primeiro as equipes (`Marketing · 4 pessoas`, com 3 rostos de 16 px), depois as personas, depois a gente. `@equipe` aparece como `@equipe · a equipe deste canal`.
- **O painel de membros** (o painel de 440 px do item 18):
  - `Pessoas · 2 online` em cima e `Personas · 5` embaixo;
  - cada linha com a presença ou o estado;
  - `Pôr no canal` (40 px) no fim.

### Criar e arrumar (só quem arruma)
- `+ Novo canal` no fim das seções: um modal de 480 px com:
  - o nome (com o `#` fixo à esquerda);
  - a equipe (Select);
  - `Quem participa`: os rostos marcáveis de 40 px, já marcados com a equipe escolhida.
- Seção: no menu `⋯` do cabeçalho, `Renomear`, `Mover para cima/baixo`, `Nova seção` e `Apagar seção`. Apagar devolve os canais para "sem seção" e **nunca apaga canal nem histórico**.
- Arrastar para reordenar fica para depois. O menu basta para a 1ª fatia.

### Movimento
- **A seção abre e fecha** em altura (`grid-template-rows 0fr→1fr`, preset `panel`), com o chevron junto.
- **O canal novo** entra na lista com o preset `message`.
- **Sem contínuas.**

### Aceite
Claro e escuro, a 1440, 960 e 200%, com:
- 2 equipes (uma fechada com não lidos);
- o `#geral` sem seção;
- 5 personas com estados diferentes;
- o canal com cabeçalho e pilha de rostos;
- as 3 linhas de cerca;
- o menu de @ aberto;
- o modal de novo canal.

A variante com pessoas reais (2 pessoas mock) entra junto, só como prancha.

---

## 21 · Personas vivas: o movimento, só com a capivara (Muse define, Brush desenha, Quill implementa depois do 6)
**A ideia:** a referência é o comportamento do open-bot-avatar (MIT): olhar, humor e respirar. O visual dele não entra: o nosso bicho é a ilustração em busto, com o contorno nanquim.

**O busto não é desmontado:** sem camadas de cabeça e corpo. A vida vem de 4 coisas baratas, todas em `transform` e `opacity` sobre a mesma imagem.

### 1. Os humores (crossfade de rosto)
O mesmo enquadramento de `avatars/capivara.png` (1024 × 1024, o mesmo recorte redondo embaixo). **Só o rosto muda**: olhos, sobrancelhas e boca.

| Humor | Quando (presença do item 6) | Imagem |
|---|---|---|
| Disponível | acordada e sem tarefa | `capivara.png` mais o `-blink` (já existem) |
| Pensando | `Trabalhando` ou `Revisando` | `capivara-pensando.png` mais o `-blink` (NOVA): olhos para cima e para o lado, boca fechada |
| Feliz | por **4 s** quando o turno termina com entrega; depois volta ao humor do estado | `capivara-feliz.png` (NOVA): olhos fechados em arco, sorriso aberto (sem `-blink`) |
| Esperando você | `Esperando você` | `capivara.png`, inclinada para a caixa de escrever (veja o item 2) |

Os outros estados não ganham humor novo. `Descansando` e `Fora até` usam as poses paradas que já existem.

**A troca:**
- O rosto base fica **sempre opaco embaixo** (é a chapa).
- O humor que entra faz fade de `opacity` **por cima**, em `--motion-base` com `--ease-standard` (sem mola na opacidade). Se as duas imagens fizessem fade cruzado, o busto ficaria translúcido no meio (achado no protótipo).
- A piscada é uma troca seca, sem transição, por cima do rosto da vez.
- Na entrada do Feliz, o busto dá um "pulo" (`scale .96→1`) no preset `stamp`.

### 2. A inclinação (olhar)
- **O movimento:** `rotate` de no máximo **±5°** com `transform-origin: 50% 88%` (o pescoço), mais `translateX` de no máximo ±1,5 % do tamanho. Medido no protótipo: com ±4° a 360 px, a inclinação mal aparecia.
- **Para o mouse:**
  - o ponteiro a menos de 360 px do centro do avatar inclina na proporção `dx / 240`, travada em ±1;
  - fora disso, volta a 0;
  - a leitura do `pointermove` vai a no máximo **10 por segundo**, sem laço de `rAF`;
  - a transição é de `transform`, em `--motion-slow` com `--ease-standard`.
- **Para a mensagem nova:** quando chega uma mensagem no fio aberto, o avatar do cabeçalho inclina **3°** na direção do fio, segura 1,2 s e volta no preset `pose` (a mola).
- **Esperando você:** inclina 3° para a caixa de escrever e fica assim enquanto o estado durar. O mouse continua mandando enquanto se mexe.
- **Onde:** só nos avatares de **40 px ou mais** (o cabeçalho da DM, a faixa e o perfil). No rail e nos cartões, nada: lá é a bolinha.

### 3. A respiração e a piscada
- **A respiração:**
  - `scaleY 1 → 1,012` com `transform-origin: 50% 100%`, num ciclo de 4,2 s com `--ease-glow`, `alternate`;
  - **no máximo 1 avatar respirando na tela**: o maior visível (o cabeçalho da DM ou o perfil);
  - junto com a bolinha de quem trabalha, isso dá as **2 contínuas** do teto da regra 5 do §2.7;
  - **ajuste à regra 4:** a regra dizia "sem respiração em quem está parado". O Miguel pediu a respiração; ela fica, mas só nesse 1 avatar e com a pausa tripla.
- **A piscada:** troca para o `-blink` por 140 ms a cada 7 a 11 s (aleatório), só com a janela focada (já é a regra 4).

### 3b. O capricho (pedido do Miguel, 12/11 00:15: "caprichar ainda mais")
- **O olhar ocioso:**
  - **quando:** sem o mouse a menos de 360 px há **10 s**, o avatar que respira dá uma olhada de **2,5°** para um lado sorteado, segura **1,2 s** e volta no preset `pose`;
  - **com que frequência:** a cada **12 a 20 s**, sorteado;
  - **o custo:** é evento, não contínua (não conta no teto de 2);
  - **quando não roda:** com a pausa tripla, com reduced-motion e com a inclinação fixa do `Esperando você`.
- **O pulo do Feliz:** o `stamp` vira um salto curto: `translateY 0 → −4 % → 0` junto com `scale .96 → 1,01 → 1`, em `--motion-celebrate` com `--ease-spring`. Com reduced-motion, só o fade do rosto.

### 4. A pausa e o reduced-motion
- **Pausa tripla:** fora da tela (`IntersectionObserver`), janela oculta ou desfocada, e ociosa há 15 s. O atributo é `data-persona-ambient-paused`; tudo para.
- **Reduced motion:**
  - **sem** inclinação e **sem** respiração;
  - os humores trocam em fade de `--motion-reduced-fade`;
  - a piscada continua, porque é troca de desenho no lugar e não move nada.
- **GPU:** `will-change: transform` só no avatar que respira. A inclinação é transição curta e não é contínua.

### 5. A arte do Brush
- `avatars/capivara-pensando.png` e `capivara-pensando-blink.png`, mais `avatars/capivara-feliz.png`;
- **o registro tem de ser idêntico** ao de `capivara.png`: o mesmo contorno de cabeça, orelhas, busto e recorte. Quem comprova é a sobreposição a 50% sem "fantasma" fora do rosto.

### 6. O aceite
Antes do código do Quill, o protótipo da Muse (`.maestri/tmp/muse/capivara-viva.html`) mostra o movimento com a arte real. O vídeo vai ao Atlas, e o Atlas o leva ao Miguel. Só depois do OK dele o Brush faz o time todo.

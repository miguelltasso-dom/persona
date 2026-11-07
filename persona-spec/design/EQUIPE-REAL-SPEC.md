# Equipe real: as personas trabalham juntas (Muse + Forge, 04/11)

**Status:** D-090 (Miguel, 22:00): **a v1.1 só sai quando a equipe real passar.** A spec INTEIRA é da v1.1. Atrás de `persona.flag.teamwork` até o aceite.

**Pergunta do Miguel ("o mais importante"):** "estão trabalhando como uma equipe real de pessoas?"

**O que já é real:**
- a Coordenação roteia o pedido;
- o Gestor planeja e divide em Tarefas;
- cada persona tem fila;
- a equipe age sozinha (agendador, Vigia, rotinas, iniciativa);
- as personas propõem trabalho (P1-9);
- "Toda a equipe" responde em grupo.

**O que falta:** que as personas passem contexto e trabalho entre si, peçam ajuda e opinião (inclusive sobre imagens), revisem umas às outras e tenham um ritual visível.

**Os 6 comportamentos do D-090 (todos v1.1):**

| # | Comportamento | Seção |
|---|---|---|
| 1 | Passar contexto: toda passagem leva o bilhete, e quem recebe não pergunta de novo | (a) |
| 2 | Passar trabalho em cadeia ("Bia escreveu → Téo faz a arte → Atlas revisa"), com a dependência acordando a próxima | (a) |
| 3 | Pedir ajuda para terminar: o colega ajuda e devolve | (a) |
| 4 | Pedir opinião ao time todo, sobre o trabalho e sobre IMAGENS | (c) |
| 5 | Revisão entre colegas antes de entregar, com o selo "Revisado por {R}" | (d) |
| 6 | A reunião do dia ("Bom dia") | (b) |

**Conversa espontânea entre personas: FORA da v1.1** (Atlas, 22:12). Toda conversa entre personas tem um propósito visível (passar adiante, pedir ajuda, pedir opinião, revisar). Se o Miguel pedir depois, reabrimos.

**Princípio da tela:** a pessoa vê a equipe trabalhando junta, mas não vê o ruído.
- Cada passagem de trabalho vira **uma** linha no fio e um vínculo no quadro. O "bilhete" completo fica dentro da tarefa.
- A reunião é **um** cartão por dia, e só quando há o que dizer.

---

## §0 · O fio da equipe: o que entra e o que não entra (Muse, 05/11 00:15; resposta ao transcrito do "Um dia da equipe")

**O problema:** o transcrito tinha os 6 comportamentos, mas lia como um LOG:
- micro-estados narrados a cada tarefa;
- a revisão falhando 6 vezes, uma linha por tarefa;
- títulos com o pedido cru cortado no meio da palavra;
- autores `team:split`/`routine:manha`;
- a rotina falando com a Lia;
- "Concluído" repetido;
- a opinião pedida à empresa inteira.

**A regra:** o fio conta a história do pedido como uma pessoa contaria a um colega. O resto mora no quadro e na Tarefa.

### Entra no fio (e só isto)
1. **O pedido da pessoa.**
2. **O plano, UMA vez, como cartão vivo** (`GestorPlanCard`, Prism no #geral).
   - A Coordenação diz "Dividi assim:" e o cartão lista as partes, cada uma com o rosto 24, o título curto e o estado num chip que **muda no lugar** ("fazendo" → "com Teo" → "revisando" → "pronto").
   - Os estados NÃO viram linhas novas. É o cartão que mostra o andamento.
3. **As passagens entre personas** (passou adiante / pediu ajuda / entregou para): 1 linha cada; várias no mesmo minuto entram num `ActivityGroup`.
4. **As entregas para a pessoa:**
   - **um cartão de entrega por pedido**, quando todas as partes ficaram prontas: "Pronto: {pedido curto}", com as partes e os rostos, o selo "Revisado por {R}" quando houve revisão e "Revisar";
   - entregas parciais só se a pessoa pediu a parte sozinha (@Bia…).
5. **Os pedidos de opinião** (o cartão) e a consolidação (1 linha).
6. **O que precisa da pessoa:** perguntas, permissões, propostas (P1-9) e o plano para aprovar.
7. **O "Bom dia"**, 1 por dia.

### NÃO entra no fio (vai para o quadro, a Tarefa e o "Caminho do trabalho")
- **"Em andamento: X", "Esperando a revisão de Y" e "X pediu a revisão a Y":**
  - a revisão é **interna**;
  - o fio mostra só o resultado, o selo na entrega;
  - **o "pediu ajustes" fica SEMPRE visível** (Atlas, 01:00): é a revisão entre colegas que o Miguel quer ver, e sem ele o "ajustei…" fica órfão;
  - só a **aprovação simples** (aprovou de primeira) se recolhe no selo "Revisado por {R}" da entrega.
- **"Pronto: {parte}" de cada parte:** a parte pronta muda o chip no cartão do plano.
- **Falha técnica de revisão:**
  - nunca uma linha por tarefa;
  - a entrega sai sem o selo, e o detalhe da Tarefa diz o motivo;
  - se a revisão falhou em ≥ 1 tarefa do mesmo pedido, aparece **uma** linha agrupada no cartão de entrega: "A revisão não rodou em {n} parte(s); seguiram sem o selo · Ver".
- **Mensagens de rotina ou de sistema** (`routine:*`, `team:*` ou qualquer autor com `:`):
  - nunca no fio;
  - a rotina "Resumo da manhã" É o próprio "Bom dia" e não posta outro texto nem chama ninguém (o "@Lia Resumo curto…" e o "Olá, em que posso ajudar?" somem).
  - **Teste guarda:** nenhum autor visível contém `:`.
- **"Concluído:" repetido:** a Coordenação fecha o pedido UMA vez, com o cartão de entrega do item 4.
- **Propostas do Gestor** (contratar etc.) **durante um pedido em andamento:**
  - vão para Aprovações, e não ao fio;
  - no fio, só se a pessoa pediu ou quando o pedido acabou;
  - nunca uma contratação decidida sem a pessoa.

### Os estados do cartão do plano e o destino do "Revisar" (Muse, 00:25; resposta ao Prism)
- **O chip de cada parte**, que muda no lugar:

  | estado | tom |
  |---|---|
  | "na fila" | neutro |
  | "fazendo" | neutro |
  | "esperando {nome}" | neutro, rosto 16 |
  | "com {nome}" | neutro, rosto 16 |
  | "revisando" | `info` |
  | "precisa de você" | `warning`, clicável, leva ao cartão que pede a decisão |
  | "pronto" | `success` |
  | "parou" | `danger`, com "Ver motivo" |

  - O "parou" é só para falha que pede ação. O que espera a pessoa é "precisa de você", e não "parou".
- **O "Revisar" do cartão de entrega** abre **Aprovações com aquela entrega selecionada** (a caixa V2, no detalhe). Lá estão a decisão e o "Revisar mudanças" quando há arquivos. Não leva ao quadro.

### Ajustes depois do transcrito de leitura (Atlas, 01:00)
1. **UMA divisão só.** O texto "Dividi o pedido por função: …" (Bolt) e o cartão "Dividi assim: …" não podem aparecer os dois. Fica **só o cartão do plano**, com **todas** as partes (o transcrito mostrou o cartão sem o Caio).
   - Bolt: não posta a frase quando o `teamPlan` é emitido.
   - Anvil/Forge: o `teamPlan` lista todas as partes do pedido.
2. **O "pediu ajustes" fica visível** (acima, na revisão).
3. **Os nomes das partes dentro dos cartões:** só a parte ("Texto", "Arte", "Posts"), porque o cartão já diz o pedido no título ("Campanha de lançamento").
   - O título longo ("Texto da campanha de lançamento") fica só onde falta contexto: no quadro e na Tarefa.
   - O pedido resumido é curto e sem enchimento: "campanha de lançamento", e não "campanha de lançamento do nosso produto".
4. **"Concluído:" + o cartão de entrega = duplicado.** Com o cartão de entrega, a linha "Concluído: …" não sai (Bolt).
5. **O "Bom dia" agrupa por pedido** (a forma final, Prism 01:16 + Muse): "[rostos de quem fez] {Pedido}: tudo pronto · {partes}", neutro, sem adivinhar o gênero do substantivo. "Ontem: a campanha de lançamento ficou pronta (Texto, Arte e Posts)", e não 3 linhas repetindo o título longo (Forge/Anvil no `dailyBrief`).
6. **"Em andamento"/"Pronto" nas passagens e na ajuda** (seções 2 e 3 do transcrito) só somem com o campo de estado tipado do host (Bolt, combinado com o Anvil). Até lá ficam, e não se filtra texto.

### Os títulos das partes (Forge na divisão; Anvil)
- **Curtos e humanos:** "{Parte} da {pedido resumido}", ≤ 48 letras ("Texto da campanha de lançamento", "Arte da campanha de lançamento").
- **Nunca** o pedido cru, nunca começando com "@nome", nunca cortado no meio da palavra (se cortar, corta no espaço com "…").
- A UI também corta só no espaço.

### Quem opina (c)
- A audiência `team` é a **equipe do pedido**: quem tem parte nele + a Coordenação (ou a equipe do canal, quando o canal é de equipe).
- **Nunca a empresa inteira.**
- Personas recém-contratadas ou de outra função só entram se a pessoa as chamou (@) ou escolheu "Toda a equipe".

### "Precisa de você: {n}"
- Conta só o que espera uma decisão da pessoa AGORA, sem repetir a mesma Tarefa: entregas para revisar, perguntas, permissões, propostas e planos.
- Revisões que falharam, partes internas e itens já decididos não contam.

### Como o mesmo dia deve ler (o alvo do transcrito)
- 08:30 **Ana:** preciso de uma campanha de lançamento do nosso produto: texto, arte e posts
- 08:30 **Lia:** Dividi assim: [cartão do plano: Bia · Texto da campanha · fazendo / Teo · Arte da campanha · esperando o texto / Caio · Posts da campanha · fazendo]
- 09:35 *Bia passou para Teo: Arte dos 3 posts da campanha*
- 09:45 *Teo pediu ajuda a Caio: Paleta e formatos de cada rede* · *Caio entregou para Teo*
- 10:00 **Ana:** Pessoal, o que acham deste rascunho da arte? 📎 → [respostas de Bia, Teo, Caio e Lia, agrupadas, com Gostei/Sugestão] · *Teo juntou as opiniões: …*
- 10:45 **Lia:** [cartão: Pronto: Campanha de lançamento · Texto (Bia) · Arte (Teo) · Posts (Caio) · Revisado por Lia · Revisar]
- (dia seguinte) [Bom dia · Ontem: a campanha ficou pronta · Hoje: … · 1 coisa espera você]

### Donos
| Parte | Dono |
|---|---|
| Quais eventos postam no fio, o autor nunca técnico, a contagem do "Precisa de você", a audiência da opinião | Anvil |
| Os títulos das partes, a rotina da manhã que não fala, as propostas do Gestor fora do pedido em andamento | Forge (+ Bolt na rotina) |
| A revisão que falha 6× no roteirizado: é lacuna do roteiro ou defeito real? | Gauge + Forge |
| O cartão vivo do plano no #geral (o chip de estado que muda no lugar) e o cartão de entrega por pedido | Prism |
| A linha agrupada de falha de revisão (no cartão de entrega) | Quill (TEAM-8) |

**O aceite (a) do D-090** passa a exigir que o transcrito novo leia como o alvo acima: ≤ ~15 linhas para esse dia, sem nenhum autor com `:`, sem micro-estado e sem repetição.

## (a) Passar contexto, passar trabalho e pedir ajuda (v1.1; itens 1–3)

**Dois verbos, uma mesma porta** (`ask_colleague` com `mode`):
- **Passar adiante** (`mode: 'handoff'`): a parte de A termina e o trabalho segue com B ("Bia escreveu → passou ao Téo para a arte").
  - A Tarefa de A fecha e a de B nasce com o bilhete.
  - A cadeia pode continuar (B → C), sempre dentro dos limites.
- **Pedir ajuda** (`mode: 'help'`): A está travada ou não tem a habilidade. B ajuda e DEVOLVE; A retoma e termina.
  - A Tarefa de A fica `waiting` até B entregar.
- **O bilhete** ganha um 4º campo, **"Decisões tomadas"** (o que já foi combinado com a pessoa ou no fio). Quem recebe lê o bilhete + o fio de origem e não pergunta de novo o que já foi dito.
  - Isso é regra do motor (Forge: o bilhete e o fio entram no contexto de B).
  - E é teste: um roteiro em que B pergunta algo que está no bilhete reprova.
- **O caminho do trabalho** (Lumen, no detalhe da Tarefa): uma linha do tempo vertical curta com os rostos 24 ("Bia → Téo → Atlas"), cada passo com o seu bilhete recolhido.
  - O passo atual fica destacado (anel), e os anteriores ganham ✓.

### O motor (Forge; o host, Anvil)
- **A ferramenta do harness** (D-084/HT) é `ask_colleague`: `{ toPersonaId, title, handoff: { done, needed, files[] }, dependsOn?: ticketId }`.
  - Ela cria uma Tarefa atribuída ao colega, com `requestedBy = {personaId}` e o vínculo de dependência.
  - A Tarefa de quem pediu fica "esperando {colega}", e a `Subscription` do engine a acorda quando o colega entrega.
- **Limites** (falha fechada, com a frase honesta no evento):
  - não pode pedir a si mesma;
  - não pode haver ciclo (A→B→A);
  - no máximo 2 níveis a partir do pedido original da pessoa;
  - no máximo 3 pedidos a colegas por Tarefa;
  - o colega tem de estar no mesmo projeto e dentro do mandato/ACL de quem pede.
- **Os limites do Forge** (22:00), acrescentados:
  - **Idempotência:** uma chave por chamada; o modelo repetir a chamada não cria 2 Tarefas.
  - **Teto diário por persona:** 6 pedidos por dia, por padrão. Em Configurações › Personas, ao lado da chave, aparece "Até {n} pedidos a colegas por dia" (de 1 a 20). Quem decide é a pessoa (o princípio do Miguel).
    - Ao chegar ao teto, a persona segue sozinha ou pergunta à pessoa. Não aparece linha no fio, só no detalhe da Tarefa: "{A} não pediu ajuda: chegou ao limite de pedidos de hoje."
  - **O pedido nunca nasce de conteúdo ingerido** sem a autonomia da persona (o guardrail do D-084: `asked|propose|act`).
- **O motor (Forge), sem migração:** uma linha `handoff` no screen_doc (o id é o Ticket do colega: `{fromPersonaId, fromTicketId, toPersonaId, depth, bilhete, status}`) + um gancho "o Ticket do colega encerrou", que acorda a Tarefa de quem pediu pelo mesmo caminho do IV-10 e posta a linha "entregou". Enquanto isso, quem pediu fica `waiting`.
  - Hoje não existe vínculo Ticket→Ticket. Os textos "Depende de / Destrava" do quadro usam essa linha.
- **A ordem (Forge):** (b) a reunião (≈ 9 h, não depende do HT-0) → (a) a porta + o gancho (≈ 14 h) → a ferramenta `ask_colleague` numa CLI viva, quando o HT-0 (Rivet/Bolt) chegar. O cartão "Liberar para {B}" depende das concessões do Anvil (≈ 3 h).
- **Permissão:** o colega herda o escopo do pedido original, e não ganha poderes novos. Se ele precisar de um conector que não pode usar, o pedido vai para "Precisa de você" (abaixo).
- **Colega em pausa, em silêncio ou com entrega pendente:** valem os mesmos estados "esperando" do HT-3 (PERSONA-POWERS, chaves `harness.held.*`).
- **O evento para a UI** é `MessageView.handoff`: `{ fromPersonaId, toPersonaId, ticketId, title, status: 'asked'|'delivered'|'held'|'blocked', reason? }`. As palavras são da UI; o host manda os dados.

### A tela
- **No fio (Ember; a mesma família das linhas HT-3):** uma linha de evento com os dois rostos 24 e uma seta entre eles.
  - **Passou adiante:** "{A} passou para {B}: {próximo passo}" · "Ver tarefa".
  - **Pediu ajuda:** "{A} pediu ajuda a {B}: {título}" · "Ver tarefa".
  - **Ajudou:** "{B} ajudou {A}: {título}" (no modo ajuda; no modo adiante, vale a linha "entregou").
  - **Entregou:** "{B} entregou para {A}: {título}" · "Ver".
  - **Retomou:** "{A} retomou "{tarefa}" com a entrega de {B}". Esta linha aparece só se a retomada não for imediata (mais de 1 min).
  - **Sem artigo antes do nome** (Muse, 23:02): "pediu ajuda a Téo", "pediu ajuda a Bia". É neutro e correto, e é a mesma regra do Ensinar. O app não tem helper de gênero, e o host não manda gênero.
  - **Agrupamento:** várias passagens no mesmo minuto entram num `ActivityGroup` ("A Bia pediu ajuda a 2 colegas"), aberto por padrão só quando são ≤ 2.
- **No quadro (Lumen):**
  - o cartão do colega ganha o chip "Pedido por {A}", com o rosto 16;
  - o de quem pediu ganha "Esperando {B}", com o rosto 16 e o anel parado;
  - a dependência usa os textos que já existem ("Depende de: {título}" / "Destrava: {título}").
- **O bilhete (Lumen, no detalhe da Tarefa, dentro do "Caminho do trabalho"):** o cartão "Bilhete de {A}" com "O que já está pronto", "O que falta", "Decisões tomadas" e "Arquivos". É texto da persona, mostrado como texto, nunca como instrução. O bilhete não aparece no canal.
- **Quando precisa da pessoa:** um cartão em "Precisa de você" com "{A} pediu a {B} {título}, mas {B} não pode usar o {conector}." e as ações "Liberar para {B}" (vai para a permissão do D-084) / "Agora não" (a tarefa fica bloqueada, com o motivo).
- **Configurações › Personas (Quill, no HT-13):** a chave "Pode pedir ajuda a colegas" por persona, **ligada por padrão**. O padrão é o trabalho em equipe, e a pessoa decide (princípio do Miguel).
- **Custo honesto:** cada pedido é uma tarefa a mais. Ela conta em Uso e limites para a persona que a executa. A linha do fio não mostra custo (é ruído); o detalhe da Tarefa mostra "≈ 1 tarefa média" só quando o host mede.

## (b) A reunião do dia (v1.1)

- **Como funciona:** é uma rotina padrão da Coordenação, "Resumo da manhã", e entra pronta, ligada, em toda equipe nova. Em Rotinas ela aparece como rotina da própria equipe, que só pausa (IV-9).
- **Quando:** na primeira abertura do app no dia depois das 6:00. Se o app não abrir, às 9:00 (no horário da pessoa). No máximo 1 por dia.
- **Sem IA, custo zero:** o resumo é **determinístico**, montado pelo host a partir dos eventos das Tarefas (Forge/Anvil). Não gasta chamada. Na v1.2, uma frase de abertura escrita pela Coordenação poderá ser opcional e com custo à vista.
- **Só quando há o que dizer:** se nada mudou desde o último resumo e nada espera a pessoa, não sai nada. Não há o "dia calmo" postado (orçamento de atenção).
- **A forma (Prism, no #geral; um cartão estruturado, não prosa):**
  - eyebrow "Bom dia · {dia da semana}", com o rosto da Coordenação;
  - **"Ontem":** até 3 linhas, cada uma "{rosto} {persona} terminou {título}", e "e mais {n}" levando a Quadros;
  - **"Hoje":** quem está em quê, com os rostos em linha e "{persona}: {título}"; quem está sem tarefa não aparece;
  - **"Precisa de você":** "{n} coisas esperam você" + "Ver" (abre Aprovações). Sem nada, a seção não aparece;
  - o cartão é recolhível, com altura máxima de 320 px e o resto em "Ver tudo";
  - "⋯ → Pausar o resumo da manhã" leva à rotina.
- **Com o "Enquanto você estava fora" (P1-7, Quill):**
  - os dois não repetem o mesmo fato;
  - se o resumo da manhã saiu depois da última visita, o cartão da Visão geral mostra só o que veio DEPOIS dele, com o link "Ver o resumo da manhã".
- **O evento** é `MessageView.dailyBrief`: `{ date, yesterday[], today[], waitingCount }`, com os ids reais (taskId, personaId).

### O resumo a pedido (Muse 03:15; Keel/Prism: o botão na Visão geral, `postDailyBriefNow` do Bolt)
- **O botão:** "Resumir o dia" (`Button secondary s`, com o ícone `bom-dia`), na Visão geral, perto do "Nova tarefa". Não entra no menu "/", porque ali já existe o /resumo da conversa.

| outcome | o que acontece |
|---|---|
| `posted` | a tela vai ao #geral e o cartão novo pisca 1× (o mesmo destaque do "Ver"). Sem Toast. |
| `already` | Toast neutro "O resumo de hoje já está no #geral · Ver" (o Ver leva ao cartão) |
| `nothing-to-say` | Toast neutro "Ainda não há o que resumir hoje." |
| `off` | Toast "O resumo do dia está pausado. · Retomar" (o Retomar só se o host aceitar retomar a rotina; sem isso, sem ação) |
| `no-coordination` | Toast "Para resumir o dia, a equipe precisa de uma Coordenação. · Ver a equipe" |
| `no-channel` | Toast "O resumo aparece no #geral, que não está disponível agora." |

- **O título do cartão** segue o momento:
  - o automático da manhã continua **"Bom dia · {dia da semana}"**, com o `spot-bom-dia`;
  - o pedido à mão fora da manhã (depois das 12:00) diz **"Resumo do dia · {hora}"**, com o mesmo ícone e **sem o spot** (a janela com o sol nascendo não combina com a tarde/noite).
  - As seções Ontem / Hoje / Precisa de você não mudam; à tarde, "Ontem" continua sendo o dia anterior e "Hoje" o que está em andamento.

| chave | pt | en |
|---|---|---|
| daily.askNow | Resumir o dia | Sum up the day |
| daily.alreadyPosted | O resumo de hoje já está no #geral | Today's summary is already in #geral |
| daily.nothingYet | Ainda não há o que resumir hoje. | Nothing to sum up yet today. |
| daily.paused | O resumo do dia está pausado. | The daily summary is paused. |
| daily.noCoordination | Para resumir o dia, a equipe precisa de uma Coordenação. | To sum up the day, the team needs a Coordinator. |
| daily.noChannel | O resumo aparece no #geral, que não está disponível agora. | The summary shows up in #geral, which isn't available right now. |
| daily.eyebrowLater | Resumo do dia · {time} | Day summary · {time} |

## (c) Pedir opinião ao time, inclusive sobre imagens (v1.1; item 4)

**O motor:**
- **A ferramenta** é `ask_team_opinion { question, draft: { text? | attachmentIds[] }, audience: 'team' | personaIds[], round }` (Anvil). Ela usa o fan-out do CV-8, agora iniciado pela PERSONA (Bolt).
- **As personas veem a imagem:** o anexo vai até o runner (Bolt), e o Claude lê imagens.
- **Respostas curtas**, cada uma com uma marca: `like` | `suggestion` | `concern` | `nothing`.
- **A autonomia vale:**
  - em "Sugere e espera", a persona primeiro propõe à pessoa ("Posso pedir a opinião da equipe sobre {x}? ≈ {n} respostas"), no formato do P1-9;
  - em "Age dentro de limites", ela pede direto, dentro do teto.
- **Orçamento** (Tally, `estimateAsk`):
  - no máximo **2 rodadas por Tarefa** por padrão, que a pessoa ajusta de 1 a 3 em Configurações › Personas;
  - a opinião conta no teto diário de pedidos da persona;
  - o custo medido aparece no cartão (ver abaixo).

**A tela** (Flint, no canal da equipe; sem canal de equipe, no #geral):
- **O cartão "Pedido de opinião"** (um cartão estruturado, não um balão):
  - o eyebrow "{A} quer a opinião da equipe" + "Rodada {i} de {n}" quando há mais de uma;
  - a pergunta (Nunito 700 16);
  - o rascunho:
    - **imagem:** a miniatura até 480 px de largura, que o clique abre em tamanho real, com o `alt` escrito pela persona (sem ele, "Imagem enviada por {A}");
    - **texto:** até 6 linhas e "Ler tudo".
  - O rodapé discreto "≈ {n} respostas · {custo medido}" sai só quando o Tally mede.
- **As respostas** ficam agrupadas logo abaixo, no mesmo bloco do CV-8:
  - uma linha por persona (rosto 24 + nome + 1–3 linhas) e o chip da marca:
    - "Gostei" (`success`);
    - "Sugestão" (`info`);
    - "Ponto de atenção" (`warning`);
    - quem não tem nada a acrescentar recolhe em "e mais {n} sem nada a acrescentar".
- **A pessoa também opina:** "Dar minha opinião" no cartão leva ao composer com o chip "Opinando sobre: {pergunta} · ✕" (o mesmo padrão do IV-10). Na lista, a resposta da pessoa aparece primeiro, como "Você".
- **O teto de rodadas:** quando a persona chega ao teto, a última linha do bloco é `opinion.roundsCap`, em `ink-soft`, sem cor de alerta. Ela não pede outra rodada.
- **Imagem e motor sem visão** (Atlas, 04:05):
  - quem não vê imagens (ex.: Codex) **não entra por padrão** num pedido de opinião com imagem;
  - no fim do bloco, recolhido: "e mais {n} que não veem imagens neste motor". Ao expandir, uma linha por persona: "{nome} não consegue ver imagens neste motor." + a ação **"Incluir só pelo texto"** (a persona opina sobre a pergunta e o texto, nunca sobre a imagem) + "Trocar o motor";
  - **a resposta de quem foi incluído só pelo texto** leva sempre o rótulo visível "Opinou só pelo texto" (`Chip neutral`) ao lado do nome. Ninguém opina sobre uma imagem que não viu sem que isso fique claro;
  - a lógica (quem entra, o rótulo) é do Forge e do Bolt; a tela é do Flint.
- **A consolidação:**
  - A fecha o bloco com a linha "{A} juntou as opiniões: {1–2 linhas}";
  - **sem versão nova** (Muse 14:04), o bloco "Versão · Antes · Depois" não aparece: fica só a linha "{A} juntou as opiniões: …";
  - quando há versão nova, ela vem como "Versão {k}", com o alternador "Antes · Depois" (para imagem: as duas miniaturas lado a lado ≥ 960 px; empilhadas abaixo disso);
  - o bloco inteiro recolhe para uma linha depois de consolidado.

## (d) Revisão entre colegas antes de entregar (v1.1; item 5)

- **Onde se liga (Quill, 22:06):** um BLOCO em Configurações › Personas, "Revisão antes de entregar", que vale por projeto. O cliente não tem tela de configurações de projeto, e não criamos uma só para isto. O título do bloco diz o projeto ("Revisão antes de entregar · {projeto}"); com mais de um projeto, um `Select` "Projeto" no topo do bloco escolhe qual se ajusta. Os controles:
  - Desligada / Em todas as entregas / Só em {tipos de tarefa};
  - "Quem revisa": a Coordenação | um colega da mesma função | {persona}.
  - **Padrão de projeto novo: ligada em todas as entregas, revisada pela Coordenação.** O D-090 quer o time revisando, e a pessoa desliga se quiser.
  - A dica honesta: "Cada entrega revisada custa ≈ 1 tarefa curta a mais."
- **O fluxo (Forge: a revisão é uma etapa do engine):**
  - A termina → "Revisando: {R}" (chip no cartão do quadro, na mesma coluna) → R aprova, ou pede ajustes com as "Notas de {R}" (no formato do bilhete);
  - no máximo 2 voltas. Na 3ª, a entrega segue para a pessoa, honesta: "{R} deixou {n} ponto(s) em aberto", com os pontos à vista.
- **O contrato FINAL (Forge 22:57, que o Anvil alinha no §7):**
  - o pedido de revisão é uma linha `handoff` com `purpose: 'review'`;
  - `round` = quantas VOLTAS já houve (0, 1 ou 2; `maxRounds` = 2);
  - o veredito é `MessageView.review { kind: 'reviewed'|'returned', reviewerPersonaId, authorPersonaId, taskId, round, maxRounds, openPoints?, summary? }`.
  - **A UI mapeia:**
    - `handoff` com `purpose: review` → "{A} pediu revisão a {R}: {título}";
    - `reviewed` com `round = 0` (aprovou de primeira) → "{R} aprovou: {título}";
    - `reviewed` com `round ≥ 1` (houve volta) → "{A} ajustou e {R} aprovou";
    - `returned` sem `openPoints` → "{R} pediu ajustes: {summary}";
    - `returned` com `openPoints` → "{R} deixou {n} ponto(s) em aberto; o trabalho segue sem o selo".
  - As notas completas voltam à autora como bilhete, nunca ao fio.
- **O contrato anterior (Anvil, 22:45), substituído no fio pelo acima:**
  - `TaskView`/`BoardCardView.reviewing?: { personaId, round }` enquanto o colega revisa;
  - `reviewedBy?: { personaId, at, openPoints? }` quando termina (`openPoints` só na 3ª volta);
  - no fio, `MessageView.review = { kind: asked|approved|changes|adjusted, reviewerPersonaId, round, maxRounds, note?, openPoints? }`.
- **As linhas do fio (Ember):**
  - "{A} pediu revisão a {R}: {título}";
  - "{R} aprovou: {título}";
  - "{R} pediu ajustes: {1 linha}";
  - "{A} ajustou e {R} aprovou".
- **O selo "Revisado por {R}"** (Ember; o rosto 16 + ✓, `Chip success`) aparece:
  - no cartão de entrega do fio;
  - no cabeçalho do "Revisar mudanças";
  - no cartão de Aprovações.

  Sem revisão, não há selo (e não há "não revisado" acusatório).

## (e) Arquivos no rascunho: a arte vira arquivo, não texto (Muse 07/11 15:25; os 2 P0 da tentativa 3)
**Por quê:** na tentativa 3, as personas do onboarding nasceram sem ferramenta de arquivo, e a arte foi no texto da mensagem. Além disso, o bilhete perdeu a entrega. A pessoa precisa VER que existe um arquivo, quem o fez, que ele está no rascunho e onde abrir.

### O interruptor (Configurações › Personas)
- **Rótulo:** "Pode salvar arquivos no rascunho" (en "Can save files to the draft").
- **Dica, uma linha em `ink-soft` embaixo:** "Os arquivos ficam num rascunho. Sua pasta só muda quando você aplicar em Revisar mudanças." (en "Files stay in a draft. Your folder only changes when you apply them in Review changes.")
- **Posição:** no bloco de cada persona, no grupo do que ela pode fazer, como PRIMEIRO item, acima de "Pode pedir ajuda a colegas". Usa o mesmo `Switch` dos outros.
- **Padrão LIGADO** para as personas do onboarding e as contratadas. Sem ele, a equipe não entrega arte.
- **No cartão da persona:** a linha "Ferramentas" diz "Arquivos no rascunho" quando está ligado, e "Só conversa" (que já existe) quando está desligado.

### No fio: uma linha tipada por turno, nunca uma por gravação
- **Ao fim do turno que gravou arquivos,** uma linha tipada (ela quebra o grupo, §0):
  - **"{name} salvou {file} no rascunho"**, com uma miniatura de 40 px à direita;
  - com 2 ou mais arquivos, **"{name} salvou {count} arquivos no rascunho"**, com até 3 miniaturas e o "+{n}" no fim.
- **O clique** na linha ou numa miniatura abre o Revisar mudanças naquele arquivo.
- **A miniatura:**
  - imagens e SVG vão por `<img src>`: o SVG nunca é inline, não roda script e não carrega fonte externa;
  - outros tipos levam o ícone do tipo de arquivo, num quadrado de `paper-2` com borda de 1 px `line`.
- **Dentro de um plano** ("Dividi assim"), a parte mostra o nome do arquivo na meta: "Arte (Teo) · pronto · cartaz.svg". O cartão continua um só e vivo; a linha tipada também aparece, porque é o fato.

### No bilhete (a passagem)
- A linha "{from} passou para {to}: {next}" ganha o MESMO chip de arquivo embaixo: a miniatura de 24 px + o nome. Assim fica visível que a entrega foi junto.
- **O bilhete sem arquivo, quando a parte anterior gravou arquivo,** é um erro do host e não da tela: a tela não inventa o chip.

### No cartão "Pronto: …" (DeliveryCard)
- Embaixo das partes, o bloco **"Arquivos no rascunho"**: até 3 blocos de 72 px (miniatura + nome numa linha, cortado com reticências e com o nome inteiro no `title` e no `aria-label`) + o "+{n} arquivos".
- **A ação continua UMA:** o "Revisar" que já existe. O clique num bloco abre o Revisar naquele arquivo.
- Depois de aplicado, se o host disser, o bloco troca o título por "Aplicado na pasta". Se o host não disser, a tela não supõe nada.

### Acessibilidade
- Cada miniatura é um botão com `aria-label` "Abrir {file} em Revisar mudanças".
- A linha tipada é lida inteira: "{name} salvou {file} no rascunho".
- O foco aparece visível.
- O alvo tem 24 px ou mais. A miniatura de 24 px do bilhete fica DENTRO do chip, que é o alvo, e o chip tem 28 px de altura.

## Textos (pt / en)
| chave | pt | en |
|---|---|---|
| handoff.passed | {from} passou para {to}: {next} | {from} handed off to {to}: {next} |
| handoff.helped | {to} ajudou {from}: {title} | {to} helped {from}: {title} |
| handoff.noteDecisions | Decisões tomadas | Decisions made |
| handoff.path | Caminho do trabalho | Work path |
| opinion.eyebrow | {name} quer a opinião da equipe | {name} wants the team's opinion |
| opinion.round | Rodada {i} de {n} | Round {i} of {n} |
| opinion.like | Gostei | Like it |
| opinion.suggestion | Sugestão | Suggestion |
| opinion.concern | Ponto de atenção | Heads-up |
| opinion.mine | Dar minha opinião | Give my opinion |
| opinion.quoting | Opinando sobre: {question} | Commenting on: {question} |
| opinion.merged | {name} juntou as opiniões: {summary} | {name} combined the feedback: {summary} |
| opinion.version | Versão {k} | Version {k} |
| opinion.beforeAfter | Antes · Depois | Before · After |
| opinion.propose | Posso pedir a opinião da equipe sobre {topic}? ≈ {count} respostas | May I ask the team about {topic}? ≈ {count} replies |
| opinion.roundsCap | {name} já usou as {count} rodadas de opinião desta tarefa e segue com o que tem. | {name} has used all {count} feedback rounds for this task and is moving on with what it has. |
| opinion.noVision | {name} não consegue ver imagens neste motor. · ação "Trocar o motor" | {name} can't see images with this engine. · action "Change engine" |
| opinion.includeTextOnly | Incluir só pelo texto | Include by text only |
| opinion.textOnlyBadge | Opinou só pelo texto | Commented on the text only |
| opinion.noVisionMany | e mais {count} que não veem imagens neste motor | and {count} more who can't see images with this engine |
| opinion.roundsSetting | Até {count} rodadas de opinião por tarefa | Up to {count} feedback rounds per task |
| review.asked | {from} pediu revisão a {reviewer}: {title} | {from} asked {reviewer} to review: {title} |
| review.approved | {reviewer} aprovou: {title} | {reviewer} approved: {title} |
| review.changes | {reviewer} pediu ajustes: {note} | {reviewer} asked for changes: {note} |
| review.seal | Revisado por {name} | Reviewed by {name} |
| review.open | {name} deixou {count} ponto(s) em aberto; o trabalho segue sem o selo | {name} left {count} open point(s); the work goes on without the seal |
| review.setting | Revisão antes de entregar | Review before delivering |
| review.costHint | Cada entrega revisada custa ≈ 1 tarefa curta a mais. | Each reviewed delivery costs ≈ 1 extra short task. |
| handoff.asked | {from} pediu ajuda a {to}: {title} | {from} asked {to} for help: {title} |
| handoff.delivered | {to} entregou para {from}: {title} | {to} delivered to {from}: {title} |
| handoff.resumed | {from} retomou "{task}" com a entrega de {to} | {from} picked "{task}" back up with {to}'s delivery |
| handoff.groupMany | {from} pediu ajuda a {count} colegas | {from} asked {count} teammates for help |
| handoff.chipRequestedBy | Pedido por {name} | Asked by {name} |
| handoff.chipWaiting | Esperando {name} | Waiting on {name} |
| handoff.note | Bilhete de {name} | Note from {name} |
| handoff.noteDone | O que já está pronto | What's done |
| handoff.noteNeeded | O que falta | What's needed |
| handoff.blocked | {from} pediu a {to} {title}, mas {to} não pode usar o {connector}. | {from} asked {to} for {title}, but {to} can't use {connector}. |
| handoff.allow | Liberar para {name} | Allow for {name} |
| settings.canAskColleagues | Pode pedir ajuda a colegas | Can ask teammates for help |
| settings.askCap | Até {count} pedidos a colegas por dia | Up to {count} requests to teammates per day |
| handoff.capReached | {name} não pediu ajuda: chegou ao limite de pedidos de hoje. | {name} didn't ask for help: today's request limit was reached. |
| settings.canSaveFiles | Pode salvar arquivos no rascunho | Can save files to the draft |
| settings.canSaveFilesHint | Os arquivos ficam num rascunho. Sua pasta só muda quando você aplicar em Revisar mudanças. | Files stay in a draft. Your folder only changes when you apply them in Review changes. |
| settings.canSaveFilesNoFolder (no lugar da dica, interruptor desabilitado) | Este projeto ainda não tem pasta. Escolha uma pasta para o projeto e as personas poderão salvar arquivos. | This project doesn't have a folder yet. Choose a folder for the project so personas can save files. |
| card.toolsDraftFiles (1º chip de Ferramentas, sem tirar os outros) | Arquivos no rascunho | Files in the draft |
| team.fileSaved | {name} salvou {file} no rascunho | {name} saved {file} to the draft |
| team.filesSaved | {name} salvou {count} arquivos no rascunho | {name} saved {count} files to the draft |
| team.fileOpen | Abrir {file} em Revisar mudanças | Open {file} in Review changes |
| team.filesMore | +{n} arquivos | +{n} files |
| team.delivery.files | Arquivos no rascunho | Files in the draft |
| team.delivery.filesApplied | Aplicado na pasta | Applied to the folder |
| daily.eyebrow | Bom dia · {weekday} | Good morning · {weekday} |
| daily.yesterday | Ontem | Yesterday |
| daily.today | Hoje | Today |
| daily.waiting | {count} coisas esperam você | {count} things are waiting for you |
| daily.pause | Pausar o resumo da manhã | Pause the morning summary |
| daily.routineName | Resumo da manhã | Morning summary |

## Donos (D-090)
| Parte | Dono |
|---|---|
| O engine: handoff/ajuda com bilhete, dependência que acorda, revisão como etapa, pedido de opinião, resumo determinístico, limites | Forge |
| O host e as ferramentas do harness ("pedir a um colega", "passar adiante", "pedir opinião"), os eventos tipados, a permissão herdada | Anvil |
| O fan-out iniciado pela persona e o anexo de imagem até o runner; o HT-6 | Bolt |
| O orçamento e o custo das rodadas de opinião (`estimateAsk`), o teto | Tally |
| **Telas, Quill** (TEAM-8; antes Ember, Keel 22:57): as linhas do fio (passou/ajuda/entregou/retomou/revisão + agrupamento) e o selo "Revisado por" nos 3 lugares | Quill |
| **Telas, Flint:** o cartão "Pedido de opinião" (com a imagem) + as respostas agrupadas + a consolidação e o "Antes · Depois" | Flint |
| **Telas, Prism:** o cartão "Bom dia" no #geral | Prism |
| Os chips do quadro ("Pedido por", "Esperando", "Revisando"), o bilhete e o "Caminho do trabalho" no detalhe da Tarefa | Lumen |
| Configurações › Personas (pedir ajuda, teto, rodadas) + o bloco "Revisão antes de entregar · {projeto}" | Quill |
| A prova "Um dia da equipe" (os 6 comportamentos, texto + imagem) | Gauge |
| O replanejamento | Keel |

**A ordem (Atlas, 22:05):** (b) a reunião → (a) pedir a um colega (a porta + o gancho; a ferramenta viva quando chegar o HT-0) → (c) a opinião com imagem → (d) a revisão. Os limites do Forge foram aceitos; o teto de 6 por dia é só o padrão.

## Aceite (o gate da v1.1, D-090)
- **(a) "Um dia da equipe" do Gauge** no host real com runner roteirizado: os 6 comportamentos de ponta a ponta numa campanha (texto + imagem), num transcrito legível para o Miguel.
- **(b) Uma rodada REAL curta**, com o OK do Atlas e um teto de chamadas: 2–3 personas passando trabalho e opinando sobre uma imagem de verdade.
- **(c) O aceite visual da Muse** (abaixo).
- **Em nenhum lugar aparece prompt interno** (LEAK-1): o teste de contrato do Anvil/Forge vale para todos os eventos novos.

### Aceite visual (Muse)
- **Capturas no shell real**, claro/escuro, 1440/960/200 %, axe 0:
  - as linhas "passou / pediu ajuda / ajudou / entregou";
  - o "Caminho do trabalho" com 3 passos e os bilhetes (com "Decisões tomadas");
  - os chips do quadro;
  - o "Precisa de você" de permissão;
  - o pedido de opinião com IMAGEM (a miniatura, as respostas com as marcas, "Dar minha opinião", a consolidação com "Antes · Depois");
  - a revisão (o chip "Revisando", "pediu ajustes", o selo "Revisado por" nos 3 lugares);
  - o cartão "Bom dia" com as 3 seções e sem a seção vazia.
- **Testes:**
  - ciclo, profundidade, teto e idempotência falham fechados, com a frase honesta;
  - quem recebe não repergunta o que está no bilhete;
  - sem nada novo, não há resumo, e o resumo não gasta chamada;
  - o bilhete e as opiniões são renderizados como texto;
  - o `alt` da imagem existe;
  - no máximo N rodadas;
  - o selo só aparece com revisão real.

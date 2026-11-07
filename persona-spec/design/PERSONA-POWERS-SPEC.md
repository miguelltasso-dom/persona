# O poder das personas, visível e reversível (D-084, pedido do Miguel)

Muse, 04/11. **Substitui a CONNECTOR-GRANT-SPEC como regra de produto**; as formas de lá que continuam valendo estão marcadas abaixo.

**Os donos:**
- Anvil: a prévia e as concessões no host;
- Tally: carregar só o necessário;
- Forge e Bolt: as ferramentas do harness;
- Quill: Conexões;
- Flint e Prism: o fio;
- Ember: a atividade.

**O princípio da tela:** o poder é grande, então **tudo o que uma persona faz fora do app é visto antes ou mostrado depois, e o que puder ser desfeito tem Desfazer.** Não aparece nada técnico: nem MCP, nem servidor, nem allowlist.

## 1. O cartão de prévia de ação externa (a autonomia "Sugere e espera"; ações irreversíveis: enviar email, postar, pagar, apagar)
É uma mensagem da persona no fio, com o **cartão** dentro (`Card` `padding="s"`, a borda esquerda âmbar de 3 px, a sombra sticker):

```
[rosto] Nina · agora
┌─────────────────────────────────────────────────────────────┐
│ ✉  VAI ENVIAR UM EMAIL · pelo Gmail                          │  ← eyebrow Nunito 800 11, accent-ink
│ Para: ana@padarialua.com.br                                  │
│ Assunto: Encomenda de sexta                                  │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Oi, Ana! Confirmo os 3 bolos de cenoura para sexta…    │   │  ← a prévia real, paper-sunken,
│ └───────────────────────────────────────────────────────┘   │    max 6 linhas + "Ver tudo"
│ ☐ Não perguntar de novo para a Nina no Gmail                 │
│ [Enviar]  [Editar]  Cancelar                                 │
└─────────────────────────────────────────────────────────────┘
```

- **O eyebrow diz o verbo e o meio:** "Vai enviar um email · pelo Gmail" / "Vai publicar no Instagram" / "Vai pagar R$ 120 · pelo Mercado Pago" / "Vai apagar 3 arquivos · no Drive". O ícone vem do conector (se houver no set) ou é o `UiIcon` genérico da ação.
- **A prévia é a coisa real:** para, assunto e corpo (email); o texto e a imagem (post); o valor, quem recebe e a referência (pagamento); a lista (apagar).
  - **O que sai da empresa** (o destinatário, o valor) fica em **negrito**.
  - **Pagar e apagar** levam também o `Notice tone="warning"`: "Isso não dá para desfazer depois."
- **As ações:**
  - **Enviar** (primário; o verbo muda: Publicar, Pagar, Apagar);
  - **Editar** abre o conteúdo editável no próprio cartão, com Salvar e enviar;
  - **Cancelar** (ghost) manda à persona "não faça".
- **A caixinha** "Não perguntar de novo para a {persona} no {conector}" (a concessão permanente desta ação). **Nunca vem marcada.**
  - Para **pagar** e **apagar**, ela **não existe**: essas sempre pedem.
- **Depois:**
  - o cartão vira a linha "✓ Enviado para ana@… · {formatWhen} · Ver";
  - Cancelado: "Cancelado · a Nina não enviou";
  - a falha mostra o texto e a ação do `RunErrorCard`.
- **Também em "Precisa de você":** o cartão conta como decisão bloqueante (DECISIONS-SPEC), com o mesmo ciclo.

## 2. "Age dentro de limites": faz e mostra
- A persona age direto, e no fio entra a linha de evento: "✉ **A Nina enviou um email** para ana@… · Encomenda de sexta · **Ver**".
- **"Desfazer" aparece só quando o host diz que dá** (o campo `undoable` da ação), com o tempo que resta ("Desfazer · 18 s").
  - **Um email enviado, um post publicado e um pagamento não voltam:** essas linhas **não têm Desfazer**, nunca.
  - Ações no app (mover um cartão, pausar uma rotina) e as que o conector permite reverter (restaurar da lixeira, um rascunho, um agendamento) podem ter.
- **Nenhuma ação irreversível é feita sem um "sim" registrado** (alinhado à D-084 com o Keel). O "sim" é **um** destes:
  1. **o próprio pedido explícito da pessoa naquele fio** ("Envie um email para a Ana"), que autoriza aquele envio;
  2. a permissão permanente ("Sempre permitir" / "Não perguntar de novo") daquela persona e daquele conector;
  3. o clique em Enviar na prévia.
  - **Em "Age dentro de limites":** com 1 ou 2, ela envia direto e mostra a linha de evento. Sem nenhum dos três (iniciativa própria sem permanente), ela **não envia**: pede a permissão ou mostra a prévia.
  - **Em "Sugere e espera":** a prévia aparece sempre.
  - **Pagar e apagar** (fora do app) **sempre** pedem a prévia, mesmo em "Age dentro de limites" e com pedido explícito (Keel/Anvil, a falha fechada).
    - Eles só são dispensados por uma permissão permanente **explícita para essa classe**, que **não nasce da caixinha do cartão** (ela não existe em pagar e apagar).
    - Ela só se dá em Configurações › Personas, numa linha à parte ("Pode pagar sem perguntar pelo {conector}"), com o `Notice warning`.
- **Depois do clique em Enviar** (o host reexecuta com os argumentos aprovados), o cartão passa a **"Enviando…"** (o botão em `loading`), e só vira **"✓ Enviado"** quando a ferramenta de fato rodar.
  - Se o conteúdo mudou (o hash não bate), **volta um cartão novo**, com a linha "A {persona} ajustou a mensagem. Confira de novo.", até 2 vezes. Depois disso, a linha de falha.
- **Ver, e não Desfazer:** as linhas de email, post e pagamento saem só com **"Ver"**. O Desfazer fica para as ações do harness.
- **No Codex,** a prévia ainda espera a confirmação técnica (o runner). Até lá, as personas no Codex não fazem ações externas irreversíveis por iniciativa própria; só por pedido explícito, com a prévia.

## 3. "Sempre permitir para a {persona}" (a concessão permanente)
**Onde nasce:**
- a caixinha do cartão de prévia (§1);
- o pedido de uso por iniciativa própria no fio: "A Nina quer usar o Drive para buscar o contrato. · **Permitir desta vez** · **Sempre permitir para a Nina** · Agora não";
- Conexões › "Seus conectores" (as linhas da CONNECTOR-GRANT-SPEC §1, que seguem valendo).

**O que diz:**
- **Ao conceder:** o Toast "Agora Nina pode ler o Gmail sem perguntar · Desfazer" (o "sempre" do cartão é só leitura, Anvil §9; sem artigo antes do nome).
- **Na linha do conector** (Conexões): os rostos de quem tem a permanente, cada um com o ⋯ → "Tirar a permissão da Nina".
- **No cartão da persona**, em "O que {persona} pode fazer": a linha "Sem perguntar: Gmail (enviar), Drive (ler)". Cada chip tem ✕.

**O pedido explícito não pede permissão de novo.** "Envie um email para a Ana" já autoriza aquele pedido. A prévia (§1) aparece só pela **autonomia** ("Sugere e espera"), e não por falta de permissão. A frase do cartão deixa claro: "Você pediu · {persona} confirma antes de enviar".

## 4. A atividade das ações no harness (quadros, sprints, rotinas, canais, contratar)
Tudo o que uma persona faz no app aparece em **dois lugares**:
1. **No fio onde ela trabalha:** o `ActivityGroup` que já existe, agora com os verbos do harness: "Nina **criou 3 cartões** em Site · **moveu** "Logo" para Fazendo · **iniciou a sprint** 12". Cada item tem "Abrir" e, quando dá, **Desfazer** (mover de volta, apagar o cartão criado, pausar a rotina criada). Iniciar e encerrar sprint não têm Desfazer (contrato do Bolt, harness-tools §4): essa linha fica só com "Abrir".
2. **Em Equipe › Atividade** (a tela de auditoria do Gestor, que já existe): a mesma lista por persona e por dia, com o filtro "Só o que mudou o app".

**As regras visuais:**
- **O que é da persona** tem o rosto 24 dela; **o que é da pessoa** tem "Você".
- **Contratar** sempre passa pelo cartão de contratação em Aprovações. Se a pessoa permitiu "contratar direto", entra a linha "A Nina contratou a Bolota · Revisor de contratos · Ver · Desfazer" (o Desfazer pausa e arquiva a persona nova).
- **"Você moveu para Fazendo e a Nina começou"**: no cartão do quadro, o rosto da persona com o anel pulsando 1× e a linha "Nina começou agora". No fio, a linha de evento "Nina começou "{tarefa}" porque você moveu para Fazendo".

## 5. Configurações › "O que as personas podem usar" (o resumo, Quill)
- **"Seus conectores"** (os da conta e os locais, todos disponíveis por pedido): o nome, quem tem "sem perguntar" e o Tirar.
- **"Suas skills do Claude"** (`Switch` desligado por padrão): "Usar as minhas skills do Claude nas personas". Abaixo: "As personas passam a conhecer as skills que você instalou no Claude."
- **"Quem pode contratar"**: a lista de personas com o `Switch`. Abaixo, "Contratar direto, sem Aprovações" (`Switch`, desligado, com o `Notice warning` ao ligar).
- **No Codex** (que não isola), a linha honesta: "No Codex, todos os seus conectores já ficam carregados nas personas que usam o Codex."

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| action.email | Vai enviar um email · pelo {connector} | Will send an email · via {connector} |
| action.post | Vai publicar no {connector} | Will post on {connector} |
| action.pay | Vai pagar {amount} · pelo {connector} | Will pay {amount} · via {connector} |
| action.delete | Vai apagar {count} itens · no {connector} | Will delete {count} items · in {connector} |
| action.irreversible | Isso não dá para desfazer depois. | This can't be undone afterwards. |
| action.send | Enviar | Send |
| action.edit | Editar | Edit |
| action.cancel | Cancelar | Cancel |
| action.dontAsk | Não perguntar de novo para a {name} no {connector} | Don't ask {name} again for {connector} |
| action.youAsked | Você pediu · {name} confirma antes de enviar | You asked · {name} confirms before sending |
| action.sent | Enviado para {to} · {when} | Sent to {to} · {when} |
| action.cancelled | Cancelado · {name} não enviou | Cancelled · {name} didn't send |
| action.didSend | {name} enviou um email para {to} · {subject} | {name} sent an email to {to} · {subject} |
| action.undoLeft | Desfazer · {seconds} s (só quando o host marca `undoable`) | Undo · {seconds} s (only when the host marks `undoable`) |
| initiative.ask | {name} quer usar o {connector} para {purpose}. | {name} wants to use {connector} to {purpose}. |
| initiative.once | Permitir desta vez | Allow this time |
| initiative.always | Sempre permitir para a {name} | Always allow for {name} |
| initiative.notNow | Agora não | Not now |
| grant.toast | Agora a {name} pode usar o {connector} sem perguntar | {name} can now use {connector} without asking |
| harness.started | {name} começou "{task}" porque você moveu para Fazendo | {name} started "{task}" because you moved it to Doing |
| harness.held.paused | {name} está em pausa. "{task}" fica em Fazendo e começa quando {name} voltar. · ação "Retomar" | {name} is paused. "{task}" stays in Doing and starts when {name} is back. · action "Resume" |
| harness.held.silence | "{task}" fica em Fazendo e começa quando acabar o silêncio de {name} (às {time}, se o host souber). | "{task}" stays in Doing and starts when {name}'s quiet hours end (at {time}, if known). |
| harness.held.deliveryPending | {name} ainda espera você decidir a entrega anterior. "{task}" começa depois que você Aplicar ou Descartar. · ação "Revisar mudanças" | {name} is still waiting for you to decide on the previous delivery. "{task}" starts after you Apply or Discard. · action "Review changes" |
| harness.held.noOwner | "{task}" está em Fazendo, mas ainda não tem responsável. Escolha uma persona para começar. · ação "Escolher responsável" | "{task}" is in Doing but has no owner yet. Pick a persona to start. · action "Choose owner" |
| settings.skills | Usar as minhas skills do Claude nas personas | Use my Claude skills in personas |
| settings.whoHires | Quem pode contratar | Who can hire |
| settings.hireDirect | Contratar direto, sem Aprovações | Hire directly, without Approvals |
| settings.codexOwnAccount | Codex na sua conta própria: as personas não mexem no app (quadros, tarefas, pedir ajuda a colegas). Para isso, use o Claude ou adicione uma conta Codex em Conexões. · ação "Abrir Conexões" | Codex on your own account: personas can't act in the app (boards, tasks, asking teammates). For that, use Claude or add a Codex account in Connections. · action "Open Connections" |
| settings.codexNote | No Codex, todos os seus conectores já ficam carregados nas personas que usam o Codex. | In Codex, all your connectors are already loaded in personas that use Codex. |

O gênero ("a {name}") segue o da persona; sem ele, "para {name}".

## Aceite
- Captura no shell real (D-074), claro/escuro, 960 e 200%, de:
  - o cartão de prévia (email, e pagamento com o `warning`, sem a caixinha);
  - o "Age dentro de limites" com o Desfazer contando, numa ação que o host marca `undoable` (mover cartão, criar rascunho); nunca num email, post ou pagamento;
  - o pedido de iniciativa com as 3 opções;
  - o `ActivityGroup` com os verbos do harness e um Desfazer;
  - "Você moveu e a Nina começou" no quadro;
  - Configurações.
- **Teste:**
  - a caixinha nunca vem marcada, e não existe em pagar/apagar;
  - o Desfazer só aparece quando o host diz que é desfazível;
  - nenhuma palavra técnica (MCP, servidor, allowlist) aparece na tela.

## 6. HT-13 · Permissões por persona: onde mora (resposta ao Quill)
- **Uma aba nova, "Personas", em Configurações**, entre Conexões e Uso. Fica junto do resto do que "a casa permite", e não dentro do cartão de uma persona só.
- **De cima para baixo:**
  1. **"O que cada persona pode fazer"**: uma linha por persona com o rosto, o nome, o **nível de autonomia** (os `ChoiceCards` compactos do editor: Sempre pergunta · Sugere e espera · Decide o rotineiro), os chips "Sem perguntar" (os conectores com permanente) e o **Switch "Pode contratar"**;
  2. **"Seus conectores"** (a lista do §5);
  3. **"Suas skills do Claude"** (o Switch);
  4. **"Contratar direto, sem Aprovações"** (o Switch desligado, com o `Notice warning` ao ligar).
- **A 960 e a 200%:** a linha de cada persona empilha (o rosto e o nome; abaixo, a autonomia; abaixo, os chips e o switch).
- **Um item só** (ISO-3 reorientado = HT-13), depois que o contrato do host (Anvil/Forge) existir.

## 7. HT-6 · O cartão de contratação
É o cartão já aceito no A-4 (Aprovações) + a caixa de entrada do Ember. O D-084 só acrescenta:
- **"Quem propôs"** pode ser uma persona com "Pode contratar". O cartão diz "A Nina quer contratar…" e mostra o rosto dela.
- Com "Contratar direto" ligado, o cartão não aparece. Entra a linha de atividade do §4, "A Nina contratou a Bolota · Ver · Desfazer".

**§4, onde mora a atividade (combinado com o Ember):**
- A seção de hoje "Atividade do Gestor de equipe" (dentro da Saúde) vira **a aba "Atividade" do lugar Equipe**, com todas as personas.
- Na Saúde fica só o resumo, com "Ver toda a atividade".
- O Desfazer fica oculto por padrão e aparece só com o `undoable` do host. O inventário de verbos e o desfazível de cada um são o HT-1 (Forge/Bolt).

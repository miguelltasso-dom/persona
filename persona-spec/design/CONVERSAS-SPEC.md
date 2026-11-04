# Conversas: canais e pessoas num lugar só (pedido do Miguel, junto com o A-1)

Muse, 04/11. Recomendação do Atlas aceita, com 4 decisões minhas (marcadas com **Muse:**).

**Protótipo** (componentes, tokens e retratos reais; dados de exemplo): `.maestri/tmp/shots/design/conversas-prototipo/`, claro e escuro a 1440:
- `conversas-5-*` (5 personas, DM com a Nina);
- `conversas-30-*` (30 personas, #marketing);
- `conversas-30-picker-*` (o "Quem responde" aberto, buscando "mar").

Fonte: `scripts/persona/muse-accept-gallery/conversas.tsx`.

**Donos:**
- tela: Flint + Prism, atrás da flag do A-1;
- backend dos canais por equipe e do roteamento @: Bolt + Anvil.

## O que o Miguel pediu, e a resposta
- **"Menos cliques, como o Grok":** fala-se com qualquer persona **sem sair de onde está**.
  - Pelo "Quem responde" do composer, que agora tem a equipe inteira com busca;
  - e pelo `@Nina` no texto.
  - Abrir uma DM é **1 clique**: o rosto na lista, no rail ou na faixa da equipe.
  - Nunca mais "Mensagens diretas → escolher".
- **"Chats por equipe":** os canais nascem do organograma (#marketing, #atendimento…) e #diretoria reúne os gestores.
- **"Dezenas de agentes":** a lista escala sem virar paredão: Recentes no topo; "Todas as personas", agrupadas por equipe e recolhidas, com 4 rostos empilhados; e a busca.

## 0. Revisão v2 (o Miguel, 04/11: "por que 2 sidebars?"): UMA barra lilás
**Esta seção substitui o layout de 3 colunas do §1.** O protótipo novo está em `.maestri/tmp/shots/design/conversas-prototipo/v2-barra-unica/`.

A barra lilás (296 px) tem tudo, de cima para baixo:
1. **Fixos no topo:**
   - a marca;
   - a busca "Buscar ou ir para…" com o Ctrl K (conversa, persona, tela, ação);
   - **os lugares compactos** (linhas de 30 px, ícone 16): Visão geral · Projetos · Aprovações (com o contador) · Equipe · Memória da empresa.
   - **"Conversas" não é mais um lugar: as conversas são a própria barra.** Abrir um canal ou uma pessoa troca a área principal para o fio.
2. **A parte que rola** (separada por uma linha `rail-ink` a 16%):
   - **Canais:** `#` + o nome (Nunito 700 14), o não lido âmbar, a nota curta opcional ("· gestores"), e "+ Novo canal";
   - **Pessoas:**
     - até 8: todas;
     - mais de 8: "Recentes", com rosto 32, o ponto de estado, nome + função na mesma linha e a última linha `rail-ink-soft` 12; depois "Todas as personas · {n}" por equipe, recolhíveis (rostos 24 empilhados), com as linhas abertas compactas (rosto 24, sem a última linha).
   - **A faixa de rostos da equipe** (`RailTeam`, a de hoje) **se funde aqui** e deixa de existir como bloco separado.
3. **Fixo no rodapé:** a pílula de estado (A-5) + Configurações (só ícone, com tooltip).

**A linha ativa** é o creme (`cream-50`) com o texto `plum-900`, igual ao item ativo do rail hoje. O texto secundário dela é a mistura de 75% plum-900 com o creme (≥ 4,5:1 nos dois temas, axe 0).

**A densidade:** as linhas com a última mensagem têm 40 px; as compactas, 30 px; os lugares, 30 px.

**Os grupos recolhíveis** (Canais, Pessoas, cada equipe) ficam lembrados por pessoa (localStorage com try/catch).

**A 960 e a 200%:** a barra vira **trilho de 64 px**, com os ícones dos lugares, um `#` para os canais (abre a lista dos canais por cima) e os rostos das Recentes. O trilho abre a barra inteira por cima (Esc fecha). Ali a pílula vira só o ponto de estado, com tooltip.

**30+ personas:** só a parte do meio rola. A busca e os lugares ficam sempre à vista.

---

## 1. Layout (v1, substituído pelo §0)
Rail (o A-1) · **lista de conversas (340 px)** · **fio**.

**A lista**, de cima para baixo:
1. **"Conversas"** (Fredoka 22) + a busca "Buscar conversa ou persona" com o `kbd` Ctrl K. Ela filtra a lista na hora, em canais e pessoas.
2. **Fixadas** (só se a pessoa fixou algo, pelo ⋯ da linha).
3. **Canais:** #geral primeiro, depois os de equipe por ordem de atividade, e "+ Novo canal" no fim.
   - Cada linha: o `#` num quadrado `paper-sunken`, o nome (Nunito 700 14) e, abaixo, "{n} membros" ou a descrição curta (#diretoria: "Os gestores de cada equipe").
4. **Pessoas:**
   - **Até 8 personas:** todas, com rosto 32, o ponto de estado, o nome + a função, a última linha (`ink-soft` 12, com "…") e a hora (`formatWhen`) ou o selo âmbar de não lidas.
   - **Mais de 8:**
     - **"Recentes"**: as 4–6 últimas conversas, na mesma linha completa;
     - **"Todas as personas · {n}"**: os grupos por equipe (`chevron` + nome + contagem + 4 rostos de 24 empilhados quando recolhido). Aberto, linhas compactas (rosto 24, nome + função, sem a última linha).
     - **Muse:** o grupo da equipe do canal aberto vem aberto; os outros, recolhidos. O estado de cada grupo fica lembrado.

**A linha ativa:** o fundo `wash` e a borda esquerda âmbar de 3 px (o mesmo padrão da caixa de entrada de Aprovações). **Uma linha ativa por vez.**

## 2. O fio
- **Canal:**
  - o cabeçalho com `#` 40, o nome, "A equipe de {equipe} · {n} personas" e os 5 rostos empilhados;
  - a 1ª linha do canal novo: "Canal criado para a equipe de {equipe}".
- **DM:**
  - o cabeçalho com o retrato 40, o nome, "{função} · trabalhando em "{tarefa}"" (ao vivo) e o `Chip` de estado;
  - **Muse:** na DM, o composer **não mostra "Quem responde"**, porque quem responde é a própria persona. O placeholder é "Mensagem para {nome}…".

## 3. "O jeito Grok": o "Quem responde" com a equipe inteira (só em canais)
- O seletor abre um popover de 360 px **acima** do composer:
  - a busca com o foco nela;
  - **"Quem responde aqui"**: a Coordenação, que é o padrão do canal;
  - os resultados agrupados por equipe, com rosto 24, nome e função;
  - o rodapé: "**Enter** responde aqui · **Ctrl+Enter** abre a conversa com {nome}".
- **Teclado:** ↑↓ movem, Enter escolhe, Esc fecha e devolve o foco ao composer.
- **`@nome` no texto:**
  - o mesmo popover, filtrado pelo que vem depois do @;
  - a escolha vira um chip `@Nina` no texto;
  - a mensagem é roteada para ela (Bolt/Anvil), mas fica no canal.

**Muse:** o padrão **continua sendo a Coordenação** em canais. Escolher outra persona vale **só para a próxima mensagem**, e o chip volta a "Coordenação" depois de enviar. Assim ninguém manda a 2ª mensagem para a pessoa errada sem perceber.

## 4. Canais por equipe
- **Nascem sozinhos do organograma (Quem cuida de quem):**
  - cada equipe com 2 ou mais personas ganha **#{equipe}**;
  - os gestores ganham **#diretoria** (as personas Gestor + a pessoa dona);
  - os membros são a equipe.
- **A pessoa pode:** criar (Novo canal: nome + quem entra), renomear, arquivar (Arquivados no fim da lista, recolhido) e fixar.
- **Muse:** um canal automático **nunca é apagado sozinho**. Se a equipe sumir do organograma, ele vai para Arquivados com a linha "A equipe {x} não existe mais. O canal foi arquivado; nada foi apagado."
- **O vazio** de um canal novo: o `EmptyState` compacto com os rostos da equipe e "Este é o canal da equipe de {x}. Peça algo e a equipe divide entre si." A arte é a `empty-equipe` (já existe).

## 5. Um clique de qualquer lugar
- Clicar no rosto **no rail, na faixa da equipe ou no organograma** abre a DM. O cartão da persona, que hoje abre no clique, passa para o **hover longo, o ⋯ e o botão de contexto**, e o "Sobre {nome}" segue no menu.
  - **Muse:** isso é uma troca de comportamento; o Probe precisa atualizar os gates que clicam no rosto para abrir o cartão.
- **Ctrl K** + nome + Enter abre a DM (já existe).
- **Teclado:** Alt+↑/↓ percorre as conversas da lista; Ctrl+Shift+K volta à última DM.

## 6. Escala: 30, 100
- **Rostos repetidos:** com mais personas que bichos (hoje são 17), dois bichos iguais podem aparecer. **O nome está sempre ao lado do rosto** (nunca só o rosto) em toda lista, popover e menção. O tom do contorno do retrato não muda: cor não é identidade.
- **Mais de 100:** a lista virtualiza (o primitivo de lista virtual que o Lumen já usa nos Quadros), e a busca vira o caminho principal.

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| conversations.title | Conversas | Conversations |
| conversations.search | Buscar conversa ou persona | Search conversations or personas |
| conversations.pinned | Fixadas | Pinned |
| conversations.channels | Canais | Channels |
| conversations.people | Pessoas | People |
| conversations.recent | Recentes | Recent |
| conversations.allPersonas | Todas as personas · {count} | All personas · {count} |
| conversations.newChannel | Novo canal | New channel |
| conversations.members | {count} membros | {count} members |
| conversations.members.one | 1 membro | 1 member |
| channel.directors | Os gestores de cada equipe | The managers of each team |
| channel.created | Canal criado para a equipe de {team} | Channel created for the {team} team |
| channel.archivedTeamGone | A equipe {team} não existe mais. O canal foi arquivado; nada foi apagado. | The {team} team no longer exists. The channel was archived; nothing was deleted. |
| channel.empty | Este é o canal da equipe de {team}. Peça algo e a equipe divide entre si. | This is the {team} team channel. Ask for something and the team splits it. |
| responder.here | Quem responde aqui | Who answers here |
| responder.footer | Enter responde aqui · Ctrl+Enter abre a conversa com {name} | Enter answers here · Ctrl+Enter opens a chat with {name} |
| dm.placeholder | Mensagem para {name}… | Message {name}… |

## Aceite
- **Captura no shell real** (D-074), claro/escuro, 1440, 960 e 200%, com 5 e com 30 personas (o dev seed): a lista, um canal de equipe, a DM, o popover do "Quem responde" e o `@`.
- **Teclado:** Alt+↑/↓, a busca, o popover (↑↓, Enter, Ctrl+Enter, Esc).
- **Teste:**
  - o "Quem responde" volta ao padrão depois de enviar;
  - a DM não mostra o seletor;
  - nenhum canal automático é apagado.
- **A 960:** a lista vira um painel que abre sobre o fio (o botão "Conversas" no topo do fio), e o fio ocupa a largura.

## Itens prontos para distribuir (no minuto do ok do Miguel)
Tudo atrás da flag do A-1 (`persona.nav.places.v1`), ligada só depois do aceite (D-077). Cada builder com no máximo 2 itens abertos (D-076).

| Id | Item | Dono | Depende de | Aceite |
|---|---|---|---|---|
| CV-1 | **A barra lilás única** (§0): os lugares compactos + canais + pessoas, a busca, Recentes, as equipes recolhíveis, a faixa da equipe fundida, o trilho de 64 px a 960/200% | **Flint** (sob o Prism) | A-1 fase 1 (nav-places) | captura com 5 e 30 personas (dev seed), claro/escuro, 1440/960/200%; Alt+↑/↓ |
| CV-2 | O fio de canal e de DM: cabeçalhos, a DM sem "Quem responde", a linha "Canal criado para…" (§2) | **Prism** | CV-1 | captura de 1 canal de equipe + 1 DM; teste "a DM sem seletor" |
| CV-3 | O "Quem responde" com a equipe inteira e o `@nome` no texto; a escolha só para a próxima mensagem (§3) | **Flint** | CV-1, CV-5 | o teste "volta à Coordenação depois de enviar"; teclado no popover; captura do popover e do chip @ |
| CV-4 | 1 clique no rosto abre a DM (rail, faixa, organograma); o cartão da persona no hover longo / ⋯ (§5) | **Prism** | — | **antes do merge, o aviso ao Probe** (abaixo); a captura do cartão pelo ⋯ |
| CV-5 | Backend: o roteamento `@nome` (a mensagem fica no canal e vai para a persona) | **Bolt** | — | os testes do host |
| CV-6 | Backend: os canais por equipe do organograma, a #diretoria, criar/renomear/arquivar/fixar, nunca apagar sozinho (§4) | **Anvil** (+ Bolt) | — | os testes do host (o canal nasce, a equipe some → arquiva, nada apagado) |
| CV-7 | O vazio de canal novo + a lista a 960 como painel (§4, §Aceite) | **Ember** (sob o Lumen, combinando com o Prism) | CV-1, CV-2 | captura a 960 e do vazio |

**Aviso ao Probe (CV-4), para mandar junto:**
> "Com a CONVERSAS-SPEC (CV-4), clicar no rosto da persona (rail, faixa da equipe, organograma) passa a ABRIR A DM, e não o cartão. O cartão abre pelo ⋯ ('Mais ações para {nome}' → 'Sobre {nome}') ou pelo hover longo. Os gates e os scripts que clicam no rosto para abrir o cartão (design-shots.mjs openCard, navigateProfileViaRailCard no persona-e2e) precisam passar pelo ⋯. O Prism coloca `data-persona-card-trigger` no botão novo para vocês clicarem por atributo."

**A minha parte (Muse):** o aceite de CV-1 a CV-7 por captura no shell real, e a arte, se precisar (por ora a `empty-equipe` serve; se o Miguel quiser uma arte própria de #diretoria, entra no BR-P3).

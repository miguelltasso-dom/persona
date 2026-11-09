# Cobalt — relato (builder de backend novo; HT-5)

## 09/11 — Linha de base v1.1 no app INSTALADO (Setup 941fd2a5) — "sem janela" não reproduz

**Feito.** Instalei o Setup final (`C:\p8c\Persona-Setup.exe`, sha256 `941fd2a5…127d`, commit `3660c033a5`) em `C:\p8perf` (silencioso, 51,7 s, exit 0) e rodei o `perf-probe.mjs` (5 execuções: 1 fria + 4 quentes) sob `with-lock build`. Números completos em `persona-spec/research/perf/MEDICAO.md` §7.

**Números (janela visível, 2 execuções).** Instalado 1,18 GiB / 8.218 arquivos; asar 248.585.695 B / 20.944 arquivos; unpacked 254,1 MiB; runtime 266,8 MB; locales 50,6 MB; mingit 96,2 MB; instalador 329,6 MiB. Janela visível **6,9–8,5 s**; shell **9,2–11,7 s**; `readyState=complete`, `visibility=visible`. RAM parada **1.096–1.133 MB** (main 172–211, GPU 270–272, renderer 185–186, host 413–414, utility 53); CPU parado GPU **21–23%**, renderer 6–7%, host 1%. O host sobe o servidor Web em **7,5 s**. O probe antigo (945,5 MB / GPU 56%) media com a janela escondida; fica como referência do artefato, não da linha de base.

**Probe corrigido (para a v1.2).** `C:/p8w-cobalt/scripts/persona/perf-probe-visible.mjs`: spawna com `windowsHide: false`, mede a janela visível (`EnumWindows`/`IsWindowVisible`) em paralelo com CDP/shell (sem `execFileSync` bloqueando o event loop) e grava `readyState`/`visibilityState`; `node --check` OK. Rodou 2 execuções (1 fria + 1 quente) sob a trava build: janela visível 8.484/6.879 ms, shell 11.658/9.177 ms, RAM 1.096/1.133 MB; JSON em `.maestri/tmp/cobalt/perf-visible.json`.

**Veredito do "sem janela".** **NÃO reproduz fora do probe.** O `perf-probe` spawna com `windowsHide: true` (o SO esconde a janela) e o watcher bloqueia o event loop por 180 s. Pelo rig do Muse (`startInstalledDesktop`, CDP, home limpa, fake CLI): página **754 ms**, shell **10.073 ms**, `readyState=complete`, `visibilityState=visible`, `hasFocus=true`; screenshot CDP em `.maestri/tmp/cobalt/rig-check.png`. Por `Start-Process` normal (sem `windowsHide`): janela **VISÍVEL** em < 15 s (pid 31896, hwnd 3803202, título "Persona"); print real `.maestri/tmp/cobalt/start-process-screen.png` mostra o onboarding (passo 1 de 5). O `perf-p0.patch`/`perf-diet.patch` continuam para a v1.2 e aplicam limpo em `3660c033a5`. **Próximo:** o probe corrigido e a linha de base com janela visível estão prontos; medir o P0 no próximo artefato com esse probe.

## 07/11 — HT-5 ENTREGUE: canais e assuntos como ferramentas de produto (`contracts/harness-channels.md`)

**O que é.** As 5 ferramentas da persona para canais e assuntos, exatamente no contrato do Bolt: `channel_create`, `channel_archive`,
`subject_create`, `subject_rename`, `message_move_to_subject`. Todas delegam à MESMA regra que os Remotes da pessoa usam; a identidade vem
do RUN (nunca do argumento), o pedido da pessoa autoriza o verbo e a iniciativa própria segue a autonomia dela.

**Arquivos.**
- `packages/persona/persona-host/src/harness-channels.ts` (novo): `ChannelPorts` + `ChannelActivity`, espelhando `harness-hiring.ts`/`harness-boards.ts`.
- `packages/persona/persona-host/src/harness-ports.ts` + `index.ts`: `HarnessPorts.channels` e a fiação em `new HarnessPorts({...})`
  (`conversationOf` = `orchestration.conversationOfTicket`, `eventOf` = `events.get`, `activityOf` = docs `harness_activity`).
- `packages/persona/persona-host/src/harness-dispatch.ts`: grupo `CHANNEL_TOOLS`, os 5 casos e `ChannelActivity` em `AnyActivity`.
- `packages/persona/persona-host/src/harness-turn.ts`: oferta por palavra (`CHANNELS`) — sem as palavras, nenhuma das 5 entra no turno.
- `packages/persona/persona-runners/src/mcp/harness-tools.ts`: `HARNESS_TOOLS` + `DEFINITIONS` das 5 (descrição curta, um objeto de entrada por verbo).
  Nível: `write` pela regra padrão de `tool-level.ts` (não entram em `READ`; nada a mudar lá).
- Extrações (a "função comum" do §5.6): `wave2.ts` ganhou `createSubject(...)` (cor única por conversa + reaproveita assunto arquivado),
  chamado pelo Remote `createConversationSubject` E pela porta; `team-channels.ts` ganhou `checkChannelName(...)` (1–32, sem `#`/controle),
  chamado por `renameChannel` E por `channel_create`.
  Duas mudanças pequenas e deliberadas no Remote, ambas para melhor: (a) paleta cheia agora é `invalid-payload` com a frase "Esta conversa já
  tem os 7 assuntos…" (antes vazava `Error('subject-limit')`); (b) `colorIndex` fora de 0–6 agora é `invalid-payload` "A cor do assunto vai de
  0 a 6." (antes vazava `StoreError('invalid-input')`). Nenhum teste existente dependia dos erros crus.
- `packages/persona/persona-host/src/flags.ts`: só o comentário do `productTools` (agora cita canais/assuntos).

**ACL (contrato §2, implementado).**
- `person-request` vale para as 5. Iniciativa da persona: `channel_create`/`channel_archive` SEMPRE recusados ("Canais são decisão da pessoa");
  `subject_*`/`message_move_to_subject` só com autonomia `act`.
- Uma persona só age na conversa da PRÓPRIA Tarefa (`conversationOfTicket`): assunto/mensagem de outro canal, de DM de outra pessoa ou de
  outro projeto é recusado (`not-found`/`forbidden`).
- `#geral`, canais de equipe e `#diretoria` nunca são tocados por ferramenta (arquivar recusa; `channel_create` só cria `custom` e recusa o nome `geral`).
- Membros de `channel_create` têm de existir no projeto (personas) ou no workspace (pessoas).
- Teto: 3 canais ABERTOS criados por ferramenta por projeto, contados pelo id `chn-` (não pelo feed `harness_activity`, que o HT-7 pode podar);
  arquivar libera a vaga. O tópico segue a MESMA regra do Remote `createChannel` (uma linha, ≤ 200 caracteres — `checkChannelTopic`).

**Idempotência.** `callId` repetido = a mesma resposta, nunca a ação duas vezes (`once` em `harness_request`, igual ao quadro);
`channel_create` usa o id estável `chn-{callId}`; `subject_create` usa `{conversa}:t{cor}` (reaproveita o arquivado); rename/move são idempotentes.
Toda mudança devolve `ChannelActivity` (`verb`, `target {kind,id,title}`, `before/after`, `initiator`, `requestId?`, `undoable`, `undo {remote, request}`, `at`)
com o Desfazer que a UI rodaria (arquivar/desarquivar/arquivar assunto/renomear de volta/mover de volta).

**Ajustes da revisão do Bolt (07/11 15:02) — todos aplicados.**
- (a) Teto de 3: passou a contar os canais ABERTOS com id `chn-` (`channels.list`), sem depender do feed; o teste do teto foi reescrito sem o feed.
- (b) Tópico: `checkChannelTopic` em `team-channels.ts` (uma linha, ≤ 200, controles colapsam em espaço), usado pelo Remote `createChannel` E pela
  ferramenta — o Remote agora recusa tópico acima de 200 com `invalid-payload` (antes não limitava nada).
- (c) `setMembers` em try/catch: se falhar, o canal recém-criado é ARQUIVADO e a ferramenta devolve `invalid` ("…ele foi arquivado. Tente de novo.");
  teste com um `ChannelPorts` de `setMembers` que lança prova o rollback.
- Decisão (Atlas + Bolt): a oferta fica SÓ por palavra, `subject_*` inclusive. O ramo `act` do ACL continua correto e testado, mas fica
  inalcançável por iniciativa até a medição do custo das definições (contador da D-097). Comentário no código (`harness-turn.ts`) e uma linha
  no contrato (`persona-spec/contracts/harness-channels.md` §4) — o patch inclui essa linha.

**Provas.**
- `tests/harness-channels.spec.ts` (novo): **14/14 verdes**. Cobre: criar com nome/membros + o Desfazer real (`archiveChannel`) · iniciativa
  `asked`/`propose`/`act` recusada para canal · regra de nome (vazio, `#`, 33 letras, `geral`, duplicado = `conflict`) · membro inexistente ·
  teto de 3 pelo id + vaga liberada ao arquivar · tópico de uma linha/≤200 e rollback do `setMembers` · arquivar recusa `#geral`/equipe/diretoria/outro
  projeto e o Desfazer desarquiva · `subject_create` (id, cor em uso, slot arquivado volta) · iniciativa `act` só na conversa da própria Tarefa ·
  rename com `before/after` e Desfazer · mover mensagem (outra conversa recusada, Desfazer move de volta) · mesma chamada 2× = uma ação ·
  run forjado recusado · oferta por palavras e a lease do turno entregando exatamente as 5 (+ `persona_ask`) e a chamada real criando o canal.
- Rodada dos ajustes (15:01): `harness-channels` + `team-channels` + `wave2` = **35/35**.
- Regressão dirigida (9 specs, **79/79**): `wave2`, `team-channels`, `harness-turn`, `harness-gateway`, `harness-ports`, `harness-boards`,
  `harness-hiring`, `harness-routines`, `persona-runners/tests/harness-tools`.
- `harness-team` + `remote-acl` + `harness-channels`: **30/30**.
- Rodada final depois do ajuste do `colorIndex` (14:20): `harness-channels` + `wave2` = **25/25**.
- Suíte inteira do `persona-host`: **1184 passaram, 2 falharam** — nenhuma das duas é do HT-5 (ver "Riscos/observações").
- `check-pkg persona-host persona-runners`: **OK** (typecheck src+tests dos dois pacotes).
- `oxlint` nos arquivos tocados: limpo.

**Como aplicar.** O patch está em `.maestri/tmp/cobalt/ht5.patch` (11 arquivos, 2 deles novos + a linha do contrato). Na árvore alvo:
`git apply --check .maestri/tmp/cobalt/ht5.patch && git apply .maestri/tmp/cobalt/ht5.patch`.
Conferido no repo principal (07/11 15:06, depois dos ajustes): `git apply --check` passou nos 11 arquivos (o tree principal tem os arquivos do harness
ainda não commitados; o patch é contra o conteúdo deles).
Não há mudança de schema, de Remote nem de Typert: nada a regenerar. As ferramentas só chegam ao turno com `Config.productTools`
(ligada em produção, desligada sob Vitest) e aparecem apenas quando o pedido pede canal/assunto.

**Comandos (verbatim, na cópia `C:/p8w-cobalt`).**
```
node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Cobalt HT-5 harness-channels" --lock check -- \
  pnpm --dir C:/p8w-cobalt exec vitest run --no-watch --testTimeout 30000 packages/persona/persona-host/tests/harness-channels.spec.ts
  → Test Files 1 passed (1) · Tests 13 passed (13)

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Cobalt HT-5 regressao" --lock check -- \
  pnpm --dir C:/p8w-cobalt exec vitest run --no-watch --testTimeout 30000 <wave2 team-channels harness-turn harness-gateway
  harness-ports harness-boards harness-hiring harness-routines persona-runners/tests/harness-tools>
  → Test Files 9 passed (9) · Tests 79 passed (79)

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Cobalt HT-5 check-pkg" --lock check -- \
  node scripts/persona/check-pkg.mjs persona-host persona-runners
  → persona-host: OK in 31.6s · persona-runners: OK in 23.3s  (rodada final, 14:24)

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Cobalt HT-5 lint" --lock check -- \
  pnpm --dir C:/p8w-cobalt exec oxlint <os 10 arquivos>
  → sem avisos (o único aviso de diretiva não usada foi removido)
```
Obs.: o `with-lock.mjs` roda o filho com `cwd` no repo principal; por isso o `pnpm --dir C:/p8w-cobalt` (sem ele, o vitest roda na árvore errada).

**Riscos / limites.**
1. **Custo das definições não medido** (o contrato §4 pede medir com o contador da D-097 antes de ligar). As descrições são curtas e a oferta é
   por palavra, mas a medição fica para quem tiver o contador (Tally).
2. **Teto pelo id `chn-`**: conta canais abertos cujo id começa com `chn-` — o id que `channel_create` sempre gera. Um canal criado à mão pela
   pessoa com esse prefixo entraria na conta (improvável: o cliente gera ids próprios). O feed `harness_activity` deixou de ser lido (o HT-7 pode podá-lo).
3. **`channel_archive` aceita qualquer canal `custom` do projeto** (não só os criados por personas): é o que a tabela do contrato manda ("recusa
   `#geral` e canal de outro projeto") + o teto do §2; a linha "nunca em outro canal" do §2 foi lida como escopo de CONVERSA (assuntos/mensagens),
   não de canal. Se o Bolt preferir restringir a canais `chn-*`, é uma linha.
4. **`subject_rename`/`subject_create` não mexem no assunto ATIVO** da pessoa (o Remote `createConversationSubject` ativa; a ferramenta não):
   mudar o que a pessoa está vendo não é trabalho da persona.
5. **`message_move_to_subject` só aceita evento `type: 'message'`** (hoje todo evento de stream é `message`); guarda para tipos futuros.
6. **Falhas pré-existentes na suíte inteira** (nenhuma toca os arquivos do HT-5):
   - `board-start.spec.ts` (1 de 15): "a result that WAITS for Aplicar/Descartar … dragged to Fazendo" falha com `moved.card.columnId`
     `undefined` (esperado `simples-fazendo`). **Reproduzido SEM as minhas mudanças**: restaurei os 8 arquivos rastreados ao conteúdo de
     `8fcb767034` (`git checkout --`), rodei o spec e a falha é idêntica; depois restaurei o trabalho (md5 conferido). O `boards.ts` do tree
     principal está modificado (trabalho do Bolt/HT-3): o spec novo é dele e a correção deve estar lá.
   - `scale.spec.ts` (p95 de `tasks`): na suíte inteira deu 153 ms (> 100 ms) porque a suíte rodava junto com outro vitest meu na mesma
     máquina; **isolado passa 1/1** (`Test Files 1 passed · Tests 1 passed`, 14:14). É gate de performance sensível a carga, não regressão do HT-5.

---

## 07/11 — HT-2b ENTREGUE: cartão "para depois" por ferramenta (`board_card_create` + `card_hold`)

**O que é.** A persona cria um cartão que nasce em **A fazer** e que **ninguém inicia** até a PESSOA mover o cartão para Fazendo. O desenho é o do
`harness-tools.md` §7: um Ticket cujo último Assignment está `pending` já é `working/queued` = categoria `todo`; o host segura o início pela marca
`card_hold:<ticketId>` no `screen_doc` e o HT-3 solta quando a pessoa move.

**Arquivos (patch `.maestri/tmp/cobalt/ht2b.patch`, por cima do HT-5).**
- `persona-host/src/orchestration.ts`: `createCard(...)` (Ticket + Trigger da conversa da Tarefa que pediu, mandato da PESSOA, Assignment `pending`,
  marca `card_hold`), `isCardHeld`, `releaseCardHold`; `driveTicket` não inicia cartão segurado.
- `persona-host/src/index.ts`: o Remote `moveTicket` solta a marca quando a coluna DESTINO é Fazendo — **independente da flag do HT-3** (com a flag
  desligada o agendador recolhe o cartão como antes); fiação de `cardContextOf`/`createCard` no `BoardPorts`.
- `persona-host/src/proactivity-scheduler.ts`: `strandedOf` pula cartão segurado (o agendador não o "recupera").
- `persona-host/src/harness-ports.ts`: `card:` entra em `DELEGATED_TRIGGER` — a Tarefa do cartão roda com o pedido da PESSOA (nunca iniciativa),
  como `split:`/`handoff:`.
- `persona-host/src/harness-boards.ts`: `BoardPorts.createCard` (ACL, título, dono, coluna "A fazer", idempotência, atividade com Desfazer).
- `persona-host/src/harness-dispatch.ts` + `harness-turn.ts`: `board_card_create` no grupo do quadro (oferta por palavra, junto de `board_*`).
- `persona-runners/src/mcp/harness-tools.ts`: `HARNESS_TOOLS` + `DEFINITIONS` (nível `write`, como os outros verEdit).
- `tests/harness-card-create.spec.ts` (novo): 10 testes.

**ACL.** Pedido da pessoa: qualquer persona, para qualquer dono do projeto. Iniciativa: `asked`/`propose` recusam; `act` só para ELA (a Coordenação
pode para qualquer um) e com **teto de 3 cartões por dia** (`CARDS_CREATED_PER_DAY`, contador `harness_card_counter` — Bolt, revisão 16:30;
o pedido da pessoa nunca é limitado). Título 1–120 (espaços colapsam); dono tem de ser do projeto; a coluna tem de existir e ser "A fazer"
(padrão: a primeira). O cartão herda o mandato da Tarefa que o pediu (`ticket.mandate.actor`), nunca mais.

**Idempotência.** `callId` repetido = a mesma resposta (`once`); o Ticket tem id estável `tk-card-{callId}` e o trigger `card:{callId}` — um retry
depois de reiniciar acha o Ticket existente e NÃO o recria nem o move de volta (o assento só é gravado na criação).

**Desfazer.** `undoable: true` com `runTicketCommand { command: 'stop', reason: 'card-cancelled' }` — o "Parar" da pessoa. **Desvio do contrato:**
o §2-A diz "arquivar o cartão"; não existe arquivamento de cartão no host (seria projeção nova no quadro, do Anvil). O cartão parado **continua
no quadro como encerrado**, então a UI e a atividade NÃO podem prometer que ele "some": o rótulo honesto é **"Cancelado"** (Bolt, revisão 16:30;
o `reason: 'card-cancelled'` vai no pedido do Desfazer para a UI escrever isso). O arquivamento de verdade fica para a v1.2 com o Anvil.

**Provas.**
- `tests/harness-card-create.spec.ts`: **10/10** — criar + Desfazer real (`runTicketCommand stop`) · mandato da pessoa (`initiator: person-request`,
  `requestId: card:…`) · ACL (asked/propose/act, dono de outro, Coordenação) · **teto de 3/dia por iniciativa** (o pedido da pessoa segue livre) ·
  título/dono/coluna inválidos · mesma callId 2× = um cartão ·
  `driveTicket` não inicia cartão segurado (Assignment continua `pending`, 0 launches) · **HT-3 ponta a ponta**: a pessoa move para Fazendo →
  a marca é solta, o worker RODA (1 launch), entrega (`coord-<ticket>-done`) e a linha `board_card_move/started` aparece · soltar não depende da flag
  do HT-3 · a ferramenta pelo gateway cria o cartão com a identidade do RUN.
- Regressão dirigida (10 specs, **108/108**): `harness-boards`, `harness-turn`, `harness-gateway`, `harness-channels`, `harness-ports`, `harness-team`,
  `proactivity-scheduler`, `proactivity-scheduler.host`, `boards`, `persona-runners/tests/harness-tools`.
- `check-pkg persona-host persona-runners`: **OK** (35,3 s / 23,2 s, rodada final).
- `oxlint` nos arquivos do HT-2b: **minhas linhas limpas**. Os erros que aparecem em `orchestration.ts` (linhas ~422/423, 2914, 3738) e
  `harness-boards.ts` (~112, 242) são **pré-existentes**: reverti os dois arquivos ao conteúdo de `8fcb767034` (`git checkout --`), rodei o oxlint
  e os MESMOS erros aparecem; restaurei o trabalho (md5 conferido). Nenhum erro cai em linha que eu adicionei.
- **Os dois patches reproduzem a árvore**: num worktree limpo em `8fcb767034` (`C:/p8w-verify`, já removido) apliquei `ht5.patch` e depois
  `ht2b.patch`; os 18 arquivos do conjunto ficaram **byte a byte iguais** (md5) aos da minha cópia.
- `board-start.spec.ts` continua com a falha PRÉ-EXISTENTE do §6 acima (não é do HT-2b; reproduzida sem as minhas mudanças).

**Como aplicar.** `git apply .maestri/tmp/cobalt/ht5.patch` e depois `git apply .maestri/tmp/cobalt/ht2b.patch` (o HT-5 está no index da minha
cópia; o ht2b é só o que veio depois). Regerar/checar de novo depois do corte da v1.1, como o Bolt pediu.

**Riscos / limites.**
1. **Criação direta no store**: o `Tickets.create` do engine é o outro criador; este escreve o mesmo store (Ticket + Trigger) sem passar pelo
   eval/ack — de propósito: criar um cartão não pode gastar modelo nem postar linha no fio. O `ticket.created` não é emitido (o quadro lê os Tickets).
2. **Desfazer = Parar** (acima), não arquivar.
3. **A marca é um `screen_doc`** (`card_hold`): sobrevive a reinício; some quando a pessoa move para Fazendo. Um cartão segurado não é "recuperado"
   pelo agendador nem pelo `driveTicket`.
4. **A Tarefa do cartão roda na conversa de quem pediu** (trigger próprio com o canal da Tarefa), com o mandato da pessoa.

---

## 07/11 — Suítes de volume (Keel) + FL-11 (spec do Probe)

**Suítes no tree atual (with-lock check).**
- Cliente (`client-ui-persona/tests`): **377 arquivos / 2863 testes, todos verdes** (1198 s, `--maxWorkers=3`).
- persona-e2e pura (`packages/persona/persona-e2e/tests`, sem IA): **121 arquivos / 929 testes** — 542 verdes, 357 skipped, 2 expected-fail,
  21 todo, **8 vermelhos em 7 arquivos**. Sozinhos: 2 transientes (`mandatory-first-delivery-contract` passa; os 2 wrappers de journeys falham só
  com o vitest aninhado — os journeys em si, `packages/persona/persona-host/tests/journeys`: **19/19 verdes**). Vermelhos reais:
  `mandatory-scope-host.spec.ts:53` (SCOPE-2: persona criada com `{"files":"write"}`), `mandatory-team-manager-host.spec.ts` (GES-1b:
  `DomainError: INVALID_GESTOR` em `persona-core/src/domain/gestor.ts:182` via `persona-host/src/gestor.ts:660`), `wire-contract.spec.ts:63`
  (WIRE-5: `setPersonaCanSaveFiles` no cliente, sem Remote no host), `mandatory-scope.spec.ts:29` (cascata do SCOPE-2).

**FL-11 (`mandatory-v11-working-control.spec.ts`) — 6/7 + 1 esperado-vermelho.** Tentei fazer a fila visível virar teste normal (Keel 16:24) e
**não fecha**: nesta build o balão da fila do host não aparece por nenhum caminho — (a) item semeado em `geral` (a chave que o stop usa): a tela lê
`channel:geral:t0` (`hostSubjectId`); (b) item semeado em `channel:geral:t0` + reload: o texto aparece só como mensagem ENVIADA, sem Editar/Tirar;
(c) pelo composer (fluxo real, persona trabalhando): idem, e o envio atrapalha o steer. O teste volta a `it.fails` com o dono **Flint/Probe** e o
diagnóstico no comentário. O resto do spec (fila do host, reload, steer, Parar, chip, "Você parou aqui") segue verde.

**Diagnóstico do badge de Aprovações (Keel 16:42).** Badge = `openBlockingCount` (`decision-selectors.ts:19-21`) sobre as DECISÕES
(`derive-decisions.ts`: aprovações `blocking ?? true`, `needsYou` `blocking: true`, propostas do dia `false`). Página = `group.rows.length`
(`InboxList.tsx:43`) sobre os ITENS de `ConnectedApprovalsPanel.tsx:140,168` agrupados por `inbox-model.ts:63-66` ('now' = tudo menos `vault`),
**incluindo as amostras `example: true`** (1 + 4 = 5; nunca chegam ao host, então nunca ao badge). Home limpo: batem quando toda aprovação aberta é
decisão bloqueante e não há Cofre nem Tarefa esperando. Conserto mínimo: um seletor só, contando as linhas abertas de 'now' **sem** `example`; dono
**Ember** (caixa V2); Prism/Flint só se o badge mudar.

---

## 07/11 — Desempenho (missão do Atlas): medição, plano e dieta

- **`persona-spec/research/perf/MEDICAO.md`** — o que foi medido: instalador NSIS **328 MiB**, app **1,2 GB** (asar 291 MB/27.472 arquivos,
  `app.asar.unpacked` 255 MB com LibreOffice 183 + sherpa 23 + sharp 19 + Cursor 11, `primary-runtime` 255 MB com Python 145 + Node 90 + pnpm 21,
  locales 49 MB); host pronto **~0,9 s / 93 MB** (Zinc). **Achado P0:** a janela só nasce **depois** de `backend.start` (`main.ts:825`/`:1915`) —
  ~0,9 s de tela inexistente. **Bloqueio:** o único artefato empacotado que restou (`.desktop-build` de 04/11) não abre (falta
  `dsh-desktop-host/config/electron.cordis.patch.yml` no asar; o `verify-persona-package.mjs:23` exige esse arquivo) — sem número de runtime do
  app até o Setup final.
- **`persona-spec/research/perf/PLANO.md`** — metas (janela < 1 s, tela útil < 2 s, RAM parada < 300 MB, instalador ≤ 250 MiB), ordem das
  mudanças (P0 janela-antes-do-host + compile cache; P1 gh lazy, warmups no 1º pedido, code splitting; P2 locales/asar/runtime sob demanda),
  Rust/Go **não** e Tauri **não agora** (com o número e o custo).
- **`persona-spec/research/perf/DIETA.md`** — auditoria de tamanho com os cortes e o ganho estimado: instalador 328 MiB → **~185 MiB** (LibreOffice
  183 MB e Python 145 MB sob demanda, locales pt/en, experimentais fora, pnpm sob demanda); < 150 MiB pede Cursor/sharp opcionais.
- **P0 em patch:** `C:/p8w-cobalt/.maestri/tmp/cobalt/perf-p0.patch` (3 hunks em `apps/desktop/src/main.ts`: janela+splash antes de
  `backend.start`; `module.enableCompileCache` no main + `NODE_COMPILE_CACHE` no host). Regerar sobre a base do corte; medir no Setup final.
- **Probe:** `C:/p8w-cobalt/scripts/persona/perf-probe.mjs` (5 execuções, 1 fria + 4 quentes; janela/CDP/primeira tela/host/RAM por processo/CPU
  parado; JSON por execução). Testes do desktop na cópia: 2383, 20 vermelhos, todos pré-existentes/ambiente (nenhum no caminho do patch).

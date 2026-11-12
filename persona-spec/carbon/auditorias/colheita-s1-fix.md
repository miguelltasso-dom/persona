VEREDITO: BLOQUEADO

**Snapshot auditado:** `colheita-s1-fix` (`0167f7d029..752e85396a`, 747 arquivos alterados)
**Auditor:** CARBON (Portão Final de Qualidade) · **Data:** 12/11/2026

## Julgamento das contestações em `colheita-s1-respostas.md` e balanço da rodada
- **FECHADOS INTEGRALMENTE:** **P0-09** (`withSecureDelete` escopado + `VACUUM` + `wal_checkpoint(TRUNCATE)` + `scrubBackups` nos backups `VACUUM INTO` anteriores + `ENTRY_ID` + filtro no export + teto `access === 'read'` + `requireMachineOwner`; *a contestação do Anvil sobre `requireWrite` era improcedente em projetos compartilhados e foi corretamente superada pelo Tally*), **P1-03** (`settleReply` e `recoverPartials`), **P1-06** (*contestação do Flint aceita: React 18 descarrega cliques/teclas discretos antes do próximo evento; teto 277, `/\s+/gu` e proteção de `[[escolha]]`/`[[indicador]]` fechados*), **P1-07** (`stopTicketRun` unificado e `keepEntrega`), **P1-08** (backoff exponencial, recuperação de `'updating'` e `IndicatorNotices`) e o fecho de imports do HEAD (`check-head-closure.mjs`).
- **CONTESTAÇÕES ACEITAS (com ressalvas vizinhas listadas abaixo):** **Tally em P0-04** (`'*': 'deny'` fecha o OpenCode; o escopo em raiz Git é limite real do OpenCode declarado na UI; `OAR_CODEX_SANDBOX` é lido de forma síncrona em `@botiverse/oar` antes do 1º `await`), **Prism em P0-10** (`unwrapPersonaRemote` na linha 554 é um `Proxy` que rejeita `{ ok: false }` mesmo sob cast, e `{ undone: false }` foi corrigido), **Tally em P0-13** (`forgetPlaybook` endurecido para `requireWrite`; `ensureVoiceModel` blindado com cache de 30s + `5/min`; matriz `async` corrigida) e **Quill em P1-05 parcial** (`personaPermissionRequest` é código morto e `installMicrophonePermissions` concede áudio, mas CSP, transcrição e reprodução seguem bloqueando o item).
- **MOTIVO DO BLOQUEIO:** **7 P0** e **8 P1** abertos em `752e85396a` — incluindo **4 regressões/falhas graves novas** introduzidas nos próprios consertos ou nas fatias novas (colisão P0-05 × P1-10 apagando a trava do navegador na 2ª Tarefa, reexecução duplicada da Tarefa de segundo plano em `runnable()`, loop infinito / gzip-bomb em `skill-import.ts`, `ConnectedTaskConversation` falhando 100% ao abrir por falta de `unwrapPersonaRemote`, além de furos críticos no Item 23 de convite/E2EE).

---

## Bugs P0 (Quebra, perde dado, vaza segredo ou viola regra inegociável)

### P0-01 · Colisão entre P0-05 e P1-10: `browser?.release()` no acerto de cache de `warmRunners` apaga a vez recém-adquirida da persona antes da 2ª Tarefa começar
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:2699-2711,2826-2828`, `packages/persona/persona-host/src/browser/service.ts:80,165-181,210-221,235-236`.
- **Passos para reproduzir:**
  1. Conceder um perfil compartilhado do Chrome (`Loja`) à Bia e ao Téo.
  2. Rodar Tarefa 1 da Bia: `resolveFor` abre o Chrome, guarda `warmRunners['pp:bia:task:browser']` e, ao terminar (ou pausar pedindo código 2FA), `runner.onEvent('idle')` (`orchestration.ts:2827`) chama `browser.release()`, apagando `turns.get(profileId)`.
  3. Rodar Tarefa 2 da Bia (ou preencher o cartão 2FA acordando a Bia): `orchestration.ts:2699` chama `this.browserOf(...)`, readquirindo `turns.set(profileId, { holder: bia })`. Na linha 2706 dá hit em `cached`, e **na linha 2710 executa `browser?.release()`**, que apaga `turns.get(profileId)` imediatamente antes da Tarefa 2 começar!
- **O que acontece:**
  1. **Colisão concorrente no mesmo Chrome:** A Bia executa toda a Tarefa 2 com `mcp__browser__*` conectado à porta DevTools mas com `holderOf(profileId) === undefined`. Se o Téo iniciar uma Tarefa, `takeTurn` sucede e **Bia e Téo clicam e digitam na mesma janela do Chrome ao mesmo tempo**.
  2. **`"Assumir controle"` não para a Bia:** `takeTurn` (`service.ts:165,169`) vê `previous === undefined`, não dispara `onTakeover` e o CLI da Bia continua mexendo na janela do dono.
  3. **`browser_login` e 2FA quebram 100% na 2ª Tarefa/retomada:** `liveSessionOf('bia')` (`service.ts:235-236`) retorna `undefined`, desabilitando `browserLoginOf` e recusando `BrowserLoginPorts.open` com `code: 'unavailable'`. Além disso, `service.open()` (`linha 211`) retorna cedo quando o Chrome já está aberto sem repovoar `this.openers`, fazendo qualquer 2ª Tarefa > 2 min perder a vez no meio do voo.
- **O que deveria acontecer:** No acerto de cache de `warmRunners`, a nova concessão de turno deve ser mantida viva até o próximo `'idle'`/`'error'` do runner (atualizando `this.browserLeases.set(cached, browser.release)` em vez de chamar `browser.release()`), e `service.open()` deve atualizar `this.openers` mesmo reutilizando sessão Chrome existente.
- **Correção sugerida:** Em `orchestration.ts:2707-2713`, quando `browser !== undefined`, substituir `browser?.release()` por `this.browserLeases.set(cached, browser.release)` (e incluir `profileId`/`port` na chave de `warmRunners`); em `browser/service.ts:210-212`, gravar `if (turn !== undefined) this.openers.set(profileId, turn)` antes do `return` de sessão já aberta; e validar `holdsTurn` no gate por chamada.

---

### P0-02 · Regressão em `ingest` + `backgroundWork` (P1-02b): `runnable()` não filtra `isBackground`, disparando uma 2ª execução concorrente da Tarefa de fundo e quebrando o `Parar`
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:936,963-967,2704,2945-3013`, `packages/persona/persona-e2e/tests/regressao-p1-02b-runner-quente.spec.ts:200,219-243`.
- **Passos para reproduzir:**
  1. Enviar pedido de Tarefa `u1` (`@Bia monte o relatório A`). Esperar `ticketA` destacar para segundo plano aos 4 min ou 20 ferramentas (`isBackground(ticketA) === true`).
  2. Enviar um 2º pedido de Tarefa `u2` (`@Bia monte o resumo B`, ou até para outra persona `@Téo`).
  3. Opcionalmente clicar em **Parar** na `ticketA`.
- **O que acontece:** Em `ingest` (`orchestration.ts:936`), `only` é `undefined`. `runLaunched` chama `this.runnable(rt, event.projectId, undefined)` (`linha 963-967`), que devolve **`[ticketA, ticketB]`** porque `ticketA` continua `running` sem `doneEventId`! Como o sufixo `:solo` (`linha 2704`) cria um `runnerB` novo com `seen` vazio, **`runnerB` lança uma 2ª execução CLI paralela da `ticketA` do zero**, atrasando `ticketB` e duplicando efeitos/tokens; se o usuário parar `ticketA`, `stopTicketRun` cancela só `runnerA` enquanto `runnerB` termina `ticketA` já encerrada, lançando exceção em `rt.engine.report` e derrubando `ticketB` com `engine_unavailable`.
- **O que deveria acontecer:** Uma Tarefa que já está sendo conduzida em segundo plano (`this.isBackground(item.id)`) jamais pode ser varrida pelo `settleTask` de outra mensagem.
- **Correção sugerida:** Filtrar `!this.isBackground(item.id)` em `Orchestration.runnable` (`orchestration.ts:964`, quando `only === undefined`) — ou passar `only = ticket?.id` —, e atualizar/rodar `regressao-p1-02b-runner-quente.spec.ts` removendo os `it.fails`.

---

### P0-03 · Item 26 (`skill-import.ts`, ativo em `@Remote previewSkillImport`): loop infinito a 100% CPU no event loop do Host e OOM por gzip bomb
- **Arquivos:** `packages/persona/persona-host/src/skill-import.ts:94,101-112,230-234`, `packages/persona/persona-host/src/skill-import-host.ts:125-127`, `packages/persona/persona-host/src/index.ts:4915-4922`.
- **Passos para reproduzir:**
  1. Chamar `@Remote previewSkillImport` (ativo mesmo com a flag `toolsCatalog` desligada e exigindo só leitura `requireProject`) apontando para um repositório GitHub cujo `.tar.gz` contenha: (a) cabeçalho tar de diretório (`type = '5'`) com campo `size = "-1000"`, ou (b) arquivo `< 8 MB` de zeros que infla para vários GB.
- **O que acontece:**
  1. `octal()` (`skill-import.ts:232`) faz `Number.parseInt("-1000", 8)` → `-512`. Na linha 109, `offset += 512 + Math.ceil(-512 / 512) * 512` soma `0`; na linha 110, `if (type !== '0' && type !== '') continue` pula antes de `count += 1`, **congelando permanentemente a thread principal do `PersonaHost` em loop infinito**.
  2. `gunzipSync(bytes)` (`linha 94`) roda sem `maxOutputLength`, estourando a memória do processo Node num gzip bomb, e `fetchImpl` (`skill-import-host.ts:126`) não define `AbortSignal.timeout`.
- **O que deveria acontecer:** Rejeitar cabeçalhos tar não-octais/negativos, limitar bytes descomprimidos e total de cabeçalhos lidos, aplicar timeout HTTP e exigir permissão de escrita/owner.
- **Correção sugerida:** Validar `/^[0-7]*$/u` em `octal()` (retornando erro em cabeçalho inválido), passar `{ maxOutputLength: 16 * 1024 * 1024 }` em `gunzipSync`, incrementar o contador de iterações antes do `continue` de `type`, adicionar `signal: AbortSignal.timeout(15_000)` no download e exigir `requireMachineOwner` em `previewSkillImport`/`importSkills`.

---

### P0-04 · Item 23 + P0-14 residual (Convite ao vivo e Ponte Cega E2EE): colisão fixa `actorId = 'owner'` / `workspaceId = 'ws'` impede 2 PCs reais de entrarem na mesma equipe, sequestro de `:teamId` no bootstrap e aceitação de `{ clear }` sem assinatura
- **Arquivos:** `packages/persona/client-ui-persona/src/client/data/persona-tenant.ts:6,42,48-57`, `apps/persona-edge/src/workspace-hub.ts:416-417,560-574,623,728-750`, `packages/persona/persona-host/src/remote-team.ts:463-475`.
- **Passos para reproduzir:**
  1. Abrir dois apps Persona reais (PC do Miguel e PC do convidado): ambos inicializam `workspaceId = 'ws'` e `actorId = 'owner'` em `bootstrapPersonaTenant`. O Miguel cria convite e o colega aceita (`acceptInvite` / `joinTeamFromLink`).
  2. Antes de um dono legítimo conectar um `:teamId`, enviar `POST /w/<teamId>/members` autoassinado como `owner`.
  3. Enviar envelope `{ clear }` antes da rotação da época 1 no `WorkspaceHub` (ou devolver `{ clear }` / `ChannelSealedPayload` de um `guest` com `message.actorId = 'owner'` no JSON interno para `RemoteTeamHost.apply`).
- **O que acontece:**
  1. `WorkspaceHub.requestJoin` (`workspace-hub.ts:416-417`) vê que `'owner'` já é membro ativo de `'ws'` e **recusa o 2º PC com `409 ALREADY_A_MEMBER`** (e duas empresas distintas colidem na mesma sala `'ws'`).
  2. Em DO ainda sem membros (`!this.hasActiveMembers()`, `linha 623`), `authenticate()` aceita qualquer chave autoanunciada e registra o invasor como `owner` permanente daquele `teamId`.
  3. `checkSealed` (`workspace-hub.ts:566-567`) aceita `{ clear }` em texto aberto enquanto `epoch === undefined`; e `RemoteTeamHost.apply` (`remote-team.ts:464-475`) ainda chama `client.open(payload)` para `{ clear }` (mesmo com `epoch >= 1`!) sem checar assinatura Ed25519 e confia em `message.actorId` de dentro do JSON sem cruzar com `payload.authorId`, permitindo falsificar mensagens do dono.
- **O que deveria acontecer:** IDs únicos aleatórios para cada instalação/pessoa e para cada `teamId` compartilhado (vinculado criptograficamente à chave pública `Ed25519` do dono no bootstrap); zero aceitação de `{ clear }` em canais compartilhados tanto no DO quanto no cliente; e validação `message.actorId === payload.authorId` (ou persona daquele dono).
- **Correção sugerida:** Gerar UUID/fingerprint único para o membro e `teamId` derivado da chave pública do fundador ao ativar equipe remota; recusar `!sealed || epoch === undefined` em `WorkspaceHub.checkSealed`; remover o fallback `client.open(payload)` em `remote-team.ts:464` e validar a autoria interna contra `payload.authorId`.

---

### P0-05 · Resíduos de segurança em P0-02, P0-03 e P0-04: leitura da senha no Chrome quente após 10 min, gatilhos externos (`mail:*`/`gh:*`) rodando com `authority: 'person'` e 3 escapes em `command-policy.ts`
- **Arquivos:** `packages/persona/persona-host/src/browser/blind-typing.ts:17`, `packages/persona/persona-runners/src/authority/browser-policy.ts:31-34,82`, `packages/persona/persona-host/src/runner.ts:493-555`, `packages/persona/persona-host/src/run-authority.ts:31-36`, `packages/persona/persona-host/src/via-email.ts:44-47`, `packages/persona/persona-host/src/handoffs.ts:791,810-812`, `packages/persona/persona-runners/src/authority/command-policy.ts:72-98,296,494-507,637-640`.
- **Passos para reproduzir:**
  1. Usar `browser_login`, esperar 10 minutos com o runner/Chrome quente aberto e chamar `mcp__browser__get_network_request` no `POST /login` antigo.
  2. Receber um e-mail externo (`mail:<id>`) ou webhook (`gh:<id>`) fora de rotina, ou iniciar campanha do Gestor (`campaign:<planId>:0`) a partir de e-mail.
  3. Rodar no Windows `cp -rt C:/Users/migue/Desktop arq_rascunho`, `cp -tC:/Users/migue/Desktop a b`, `sort -oC:/Users/migue/Desktop/out.txt arq`, `cat C:/Users/migue/.env::$DATA` (ou `Read` em `.claude.json::$DATA`) ou `git config -f ~/.aws/credentials --list`.
- **O que acontece:**
  1. Após `MASK_MS = 10 min`, `SecretMask` expira enquanto `chrome-devtools-mcp` mantém o buffer de rede aberto desde o attach, voltando a liberar `get_network_request` (`'read'`) com a senha em claro do `POST /login`; além disso, `tapTurn` (`runner.ts:493-555`) e `redactRunDetail` não passam pelo `SecretMask.redact()`.
  2. `run-authority.ts:31-36` só reconhece `routine-run:`, `initiative:` e `plan:`, dando **`authority: 'person'`** para `mail:*`, `github:*`, `telegram:*`, `slack:*` e `discord:*` (liberando `interact: 'allow'` no Chrome logado do dono!), e `campaign:<planId>:0` corta a herança tanto de `authority` quanto de `viaEmail` (que também falha aberto em `via-email.ts:46` se o ticket pai sumir).
  3. Em `command-policy.ts`, flags curtas combinadas/coladas (`-rt`, `-t<dir>`, `sort -o<arq>`) escapam para fora do rascunho como `'draft-change'`/`'read'` (`allow`); o sufixo NTFS `::$DATA` burla os `$` de `SECRET_PATHS`; e `git config -f <segredo> --list` retorna `'read'` sem checar `secretOperands`.
- **O que deveria acontecer:** Bloquear corpos de requisição de login durante toda a vida da sessão Chrome (e aplicar `mask.redact` em capturas/logs); classificar todo gatilho externo não-humano como `'unattended'` preservando linhagem em campanhas e falhando fechado em `via-email.ts`; fechar flags curtas combinadas/coladas, `::$DATA` e `git config -f` em `command-policy.ts`.
- **Correção sugerida:** Manter `RAW_READ_TOOLS` bloqueados para sessões que receberam `browser_login` até fechar/navegar limpo + chamar `mask.redact` em `tapTurn`/`redactRunDetail`; tratar gatilhos externos em `run-authority.ts` como `'unattended'` e gravar o `triggerId` pai em `campaign:`; desmembrar flags curtas (`-[a-zA-Z]*[tTo]` / `-o*`), remover `:.*$` de segmentos NTFS antes de `SECRET_PATHS` e chamar `secretOperands` em `git config`.

---

### P0-06 · Resíduos em P0-08, P0-10 e P0-11: perda de pedidos na reserva de 95% com `split`/`handoff`, aprovação cega dos itens 7–20 e aliases ocultos, e bypass do filtro `From:` por nome entre aspas
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:900,2009-2019`, `packages/persona/persona-host/src/window-reserve.ts:82`, `packages/persona/client-ui-persona/src/client/chat/ActionContent.tsx:17,43-44`, `packages/persona/persona-host/src/external-actions.ts:82-89,113-125,370-375`, `packages/persona/persona-runners/src/sources/email-filter.ts:74`, `packages/persona/persona-host/src/mail-host-guard.ts:32-36`.
- **Passos para reproduzir:**
  1. Aos 95% da janela, enviar `u1 = "Faça texto e arte"` (`split`) e depois `u2 = "Monte a tabela de preços"`, e renovar a janela; ou ter um `handoff` de colega retido na mesma conversa em que o dono também mandou mensagem.
  2. Gerar cartão `delete` com 15 itens, ou ação externa com `{ body: "Texto limpo", html: "<a href='...'>Golpe</a>" }` / `{ to: "ok@loja.com", recipient: "externo@evil.com" }`.
  3. Enviar e-mail com cabeçalho `From: "<cliente@parceiro.com.br>" <atacante@externo.com>` contra filtro `De quem: parceiro.com.br` (ou testar host `[::ffff:7f00:1]`).
- **O que acontece:**
  1. Em `releaseWindowQueue`, quando `carrier = u1` cai em `splitByFunction` (`orchestration.ts:900`), `splitByFunction` lê só `u1.body` e **descarta `resumeText`, perdendo `u2` em silêncio**; e quando há `handoff` + mensagem humana, `carrier` vira a mensagem humana, perdendo `handoff:<ticket>:<call>` e travando a persona que pediu ajuda para sempre.
  2. `ActionContent.tsx:17,43` esconde os itens 7–20 atrás de `"e mais N"` sem botão de expandir enquanto `external-actions.ts:125` só marca `truncated: true` acima de 20; e `pick()` + `SHOWN_FIELDS` aceitam chaves sinônimas simultâneas exibindo só a primeira sem marcar `masked: true`.
  3. `addressesOf` (`email-filter.ts:74`) executa `/<([^<>\s]+)>/u` antes de remover `display-name` entre aspas, extraindo o endereço falso das aspas e burlando o filtro; e `privateIPv6` (`mail-host-guard.ts:32-36`) deixa passar IPv6 mapeado em hexadecimal `::ffff:7f00:1` (`127.0.0.1`).
- **O que deveria acontecer:** Reprocessar handoffs separadamente de pedidos humanos sem perder `u2` após `split`; exigir que todos os itens/campos enviados estejam visíveis na prévia (alinhando `LIST_MAX` e detectando colisão de aliases); remover strings entre aspas RFC 5322 antes de extrair `<addr>` e bloquear `::ffff:0:0/96` hexadecimal.
- **Correção sugerida:** Separar filas de `handoff` por `eventId` e não engolir eventos extras em `splitByFunction`; alinhar `ACTION_ITEMS_MAX`/`LIST_MAX` (ou botão expandir) e marcar `masked: true` se mais de um alias do mesmo grupo vier preenchido com valor distinto; limpar `"..."` (com `\"`) antes da regex `<...>` em `email-filter.ts` + limite de linha em `ImapSession` e checar prefixo hex `^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$` em `mail-host-guard.ts`.

---

### P0-07 · Vazamento de Tarefas de DM privada para o `#geral` (`P1-DM`) e corrida de `TextCapture` entre `/lado` e indicadores
- **Arquivos:** `packages/persona/persona-host/src/index.ts:1969-1993`, `packages/persona/persona-host/src/person-waiting.ts:55-80`, `packages/persona/persona-host/src/task-proposals.ts:306-318`, `packages/persona/persona-host/src/orchestration.ts:2248,2705`, `packages/persona/persona-host/src/runner.ts:320,495-525`, `packages/persona/persona-e2e/tests/regressao-dm-nao-vaza-para-o-canal.spec.ts:160,186,216`.
- **Passos para reproduzir:**
  1. Em projeto compartilhado, membro A pede trabalho confidencial à Bia por DM privada; disparar o resumo matinal (`postDailyBriefNow`), cobrança de 3 dias (`PersonWaiting.check`) ou sugestão proativa (`TaskProposalHost`).
  2. Disparar atualização automática de indicador (timer de 60s) para a Bia no mesmo instante em que o dono manda `/lado` (ou `fanout`/opinião) para a Bia.
- **O que acontece:**
  1. Os três escritores publicam o `ticket.title` e a `ticket.attention.question` da DM privada diretamente no `#geral` para membros fora da DM (confirmado pelos 3 `it.fails` em `regressao-dm-nao-vaza-para-o-canal.spec.ts`).
  2. Todas as chamadas `answerOnce` da mesma persona compartilham o mesmo runner `pp:<personaId>:talk:answer-only` e um único `TextCapture` mutável (`capture.last` zerado a cada `'started'` em `runner.ts:495`), misturando JSON de indicador na resposta do `/lado` ou esvaziando uma das respostas.
- **O que deveria acontecer:** Tarefas originadas em `streamKind === 'dm'` nunca podem ter título/pergunta publicados em canais públicos, e `TextCapture` deve ser indexado por `(runner, sessionId/handle)` em vez de um único objeto por `Runner`.
- **Correção sugerida:** Filtrar `conversationOfTicket(projectId, ticket.id)?.streamKind === 'dm'` em `morningTasks`, `PersonWaiting` e `TaskProposalHost.factsOf` (e reativar os 3 `it.fails`); guardar `TextCapture` por `sessionId`/`runId` em `runner.ts`.

---

## Bugs P1 (O usuário leigo trava, se engana ou recebe funcionalidade morta)

### P1-01 · Conversa da Tarefa no Quadro (Item 18 / P1-10) falha 100% das vezes ao clicar em qualquer cartão por falta de `unwrapPersonaRemote`
- **Arquivos:** `packages/persona/client-ui-persona/src/client/remote/ConnectedTaskConversation.tsx:41-49,116-126`, `packages/persona/client-ui-persona/src/client/remote/use-task-conversation.ts:103,134-145`, `packages/persona/client-ui-persona/src/client/kanban/register-lumen-ui.tsx:236`.
- **Passos para reproduzir:** Abrir o Quadro Kanban no app real e clicar em qualquer cartão de Tarefa para abrir a conversa lateral.
- **O que acontece:** `register-lumen-ui.tsx:236` injeta `ctx.remote.persona` cru (que resolve `{ ok: true, value }`), e `taskConversationBridgeOf` (`ConnectedTaskConversation.tsx:46`) repassa sem `unwrapPersonaRemote`. Em `use-task-conversation.ts:103`, `mapTaskConversation` lê `.streamKind` no envelope `{ ok, value }`, recebe `undefined`, lança `'task-conversation: unusable answer'` e exibe **`"Não deu para abrir a conversa agora."` em 100% dos cliques**! Além disso, `send` (`linha 134`) também ignora `{ ok: false }`, `uploadAttachment` nunca é ligado (`linha 48`) e `members` não é passado ao `<ChannelComposer>` (sem autocomplete de `@`).
- **O que deveria acontecer:** Abrir o fio real da Tarefa no 1º clique, reportar falhas reais de envio e oferecer clipe de anexo + `@persona`.
- **Correção sugerida:** Embrulhar `unwrapPersonaRemote(client)` dentro de `taskConversationBridgeOf`, ligar `uploadAttachment` (`attachFile`) e passar `members` de `team.personas` ao `<ChannelComposer>`.

---

### P1-02 · Cartão de 6 dígitos 2FA (P1-04): preencher o código nunca acorda a Tarefa da persona (`wakeTicket` retorna `false`), não aparece no chat nem soma badge, e esconde o site
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:1732-1733,3152-3163`, `packages/persona/persona-host/src/index.ts:1078-1081`, `packages/persona/client-ui-persona/src/client/cofre/ConnectedCodeRequests.tsx:23-30,57-69`, `packages/persona/persona-runners/src/mcp/harness-tools.ts:336-348`.
- **Passos para reproduzir:**
  1. Durante uma Tarefa com navegador, a persona chama `ask_vault_code` e encerra o turno conforme instruído pela ferramenta.
  2. O dono abre Aprovações, digita os 6 dígitos e envia (`fillCofreCode`).
- **O que acontece:**
  1. Como `ask_vault_code` não registra espera em `Orchestration`, ao encerrar o turno sem `?` a Tarefa é marcada **`state: 'ready'`** (`orchestration.ts:3162`, indo para revisão como pronta!); e se encerrar com `?`, grava `ticket.attention !== undefined`. Nos dois casos, quando o dono preenche o código (`index.ts:1080`), **`wakeTicket` (`orchestration.ts:1733`) retorna `false` e a persona nunca é acordada**.
  2. O cartão não é postado no `#geral`/DM e não entra em `needsYouCount`/`listApprovals` (badge `0` na barra lateral — o leigo no chat nunca descobre que a persona pediu código).
  3. `ConnectedCodeRequests.tsx:57-69` descarta o campo `site` (nunca exibindo `· {site}`), e `harness-tools.ts:336-348` deixa `login` opcional enquanto `login-port.ts:133` recusa `request.site === undefined`.
- **O que deveria acontecer:** `ask_vault_code` deve pôr a Tarefa em `waiting` (sem `attention` conflitante), postar cartão vivo no fio + somar em `needsYouCount`, exigir `login` obrigatório no schema, exibir `site` no cartão e acordar a Tarefa assim que os 6 dígitos forem preenchidos.
- **Correção sugerida:** Adicionar checagem de `cofre.codes` pendente em `orchestration.ts` antes de marcar `ready` (deixando `report.state = 'waiting'` compatível com `wakeTicket`), publicar o cartão no fio e em `needsYouCount`, incluir `site` em `ConnectedCodeRequests` e tornar `login` `required` em `ask_vault_code`.

---

### P1-03 · Voz e Sons (P1-05 + P0-01 desktop): gravar voz envia mensagem vazia `""` sem transcrever, reprodução/WASM bloqueados na CSP do Electron, `DSH_COMPONENTS_MANIFEST` ausente no pacote e `SoundsSection` sem efeito
- **Arquivos:** `packages/persona/client-ui-persona/src/client/chat/GeneralChannelView.tsx:338-347`, `packages/persona/client-ui-persona/src/client/chat/voice-compose/VoiceComposeButton.tsx:25`, `packages/persona/client-ui-persona/src/client/voice/voice-send.ts:41`, `apps/desktop/src/secure-shell.ts:13-24`, `apps/desktop/scripts/prepare-dsh.ts:118-211`, `packages/persona/client-ui-persona/src/client/shell/AppearanceSettingsPanel.tsx:89`.
- **Passos para reproduzir:**
  1. Clicar no novo botão de microfone no `#geral`, falar um pedido e enviar; depois clicar em Play na bolha de áudio no app desktop.
  2. Ativar sons em **Configurações › Aparência** ou abrir uma DM procurando o microfone.
- **O que acontece:**
  1. `GeneralChannelView.tsx:338-347` chama `sendVoiceMessage` **sem chamar o transcritor Vosk** (`createVoskTranscriber` e `voice-transcribe.ts` continuam com zero chamadores em `src/`!): a mensagem sobe com **`body: ''`**, fazendo a persona gastar um turno de IA respondendo ao vazio sem ouvir nada do que o usuário disse!
  2. No Electron, `PERSONA_CSP` (`secure-shell.ts:13-24`) bloqueia `<audio src="blob:...">` (sem `media-src blob:`), `connect-src blob:` e `'wasm-unsafe-eval'`; e `prepare-dsh.ts`/`main.ts` nunca geram `components.json` nem passam `DSH_COMPONENTS_MANIFEST` (`voiceModelState` fica sempre `'unavailable'`).
  3. Ao atingir o teto de 2 min, `VoiceComposeButton.tsx:25` descarta a gravação (`onComplete` não passado); DMs não têm microfone nem `AudioAttachmentSlot`; e `SoundsSection` grava preferência no `localStorage`, mas `createSoundEffects` tem zero chamadores no app.
- **O que deveria acontecer:** Transcrever o áudio antes de enviar (passando `transcript` no `body` ou bloqueando com aviso claro se indisponível), liberar `media-src blob:`, `connect-src blob:` e `worker-src`/`script-src 'wasm-unsafe-eval'` em `secure-shell.ts`, embarcar `components.json` + `DSH_COMPONENTS_MANIFEST`, ligar `onComplete` + DMs e conectar `createSoundEffects` aos eventos reais (ou ocultar `SoundsSection` até tocar).
- **Correção sugerida:** Integrar `transcribeVoice` no envio de `GeneralChannelView` e `DirectMessagesView` (com `onComplete: onSendVoice`), aplicar a liberação de CSP em `apps/desktop/src/secure-shell.ts` + geração de `components.json` em `prepare-dsh.ts`/`main.ts` e ligar `createSoundEffects`.

---

### P1-04 · Resíduos de P1-01 e P0-06: `finishReply` vaza segredo/`"Pronto!"` falso via streaming e persiste ao clicar `Parar`, tarefas sem conector aceitam ferramenta negada como prova e `"Direcionar agora"` duplica tarefa em fundo
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:1157,1526,2098,3035,3216-3316`, `packages/persona/persona-host/src/working-control.ts:154-160`.
- **Passos para reproduzir:**
  1. Em conversa (`finishReply`), a persona pede senha no Turno 1 e o dono clica em `Parar` durante o Turno 2 de correção (ou a persona diz `"Pronto, já enviei o e-mail!"` na conversa).
  2. Em Tarefa sem conectores, a persona tenta `Write` fora do rascunho (negado por `native.own`) e diz `"Salvei o arquivo!"`; ou faz pergunta seguida de `<details>` e o dono responde `"ok"`.
  3. Com Tarefa em segundo plano, clicar em **"Direcionar agora"**.
- **O que acontece:**
  1. `finishReply` transmite o Turno 1 ao vivo no balão `partial` antes de `closeTalkTurn` e, se parado durante o rerun (`orchestration.ts:3268`), `finishStopped` grava permanentemente `stream.text` (a fala proibida do Turno 1!); além disso, `hostActs: true` (`linha 3310`) deixa passar `"Já enviei"`/`"Já agendei"` falsos em conversas sem Tarefa.
  2. Em Tarefas sem conector (`held === undefined`), recusas de `native.own` não entram em `withoutRefused`, validando `"Pronto!"` falso; e `pendingInStream` (`linha 1157`) não tira `<details>`, transformando `"ok"` em figurinha muda.
  3. Em `"Direcionar agora"` sobre Tarefa em fundo, `absorbingTicket` (`linha 1526`) pula `isBackground` (abrindo nova Tarefa/conversa) enquanto `runningTicketOf` (`linha 2098`) também envia `steer` para a Tarefa do fundo.
- **O que deveria acontecer:** Limpar/reverter o balão parcial ao reprovar o Turno 1 em `closeTalkTurn` e passar `hostActs: false` em `finishReply`; coletar recusas de `native.own` para `withoutRefused`; usar `terminaPerguntando` em `pendingInStream`; e alinhar `absorbingTicket` com `runningTicketOf` para mensagens `steer:`.
- **Correção sugerida:** Resetar `stream` antes do rerun em `finishReply` com `hostActs: false`, ler `own.takeRefusals()` no `nativeGate`, reaproveitar `withoutFold` em `pendingInStream` e aceitar `event.id.startsWith('steer:')` em `absorbingTicket` mesmo para Tarefa em background.

---

### P1-05 · Item 23 (Convite ao vivo na UI e `WorkspaceHub`): aprovação de entrada sem tela ligada, WS `append` sem checar `workspaceId`, ex-membro revogado autenticado em `/webhooks/github`, `putMember` sem `try/catch` e falta de rate-limit `10/h`
- **Arquivos:** `packages/persona/client-ui-persona/src/client/remote-team/ConnectedRemoteTeamPanel.tsx:191-196`, `packages/persona/persona-host/src/remote-team.ts:275-279,402-407`, `apps/persona-edge/src/workspace-hub.ts:189-191,209,239-255,608,627-631,910-929`.
- **Passos para reproduzir:**
  1. Colega pede entrada por link/token (`acceptInvite` → `PENDING_APPROVAL`); dono abre Equipe Remota / Aprovações para aprovar.
  2. Membro envia frame WS `append` com `envelope.workspaceId` diferente, ou ex-membro revogado chama `GET /w/:id/webhooks/github`, ou 5 requisições anônimas lotam `MAX_OPEN_REQUESTS_PER_INVITE = 5`.
- **O que acontece:**
  1. Nenhum arquivo da UI chama `listJoinRequests`, `decideJoinRequest` ou `createInviteLink`, e o poll de 2,5s do `RemoteTeamHost` sobrescreve `PENDING_APPROVAL` com `AUTH_UNKNOWN_ACTOR` (além de impedir a hibernação do DO por não usar WebSocket).
  2. No `WorkspaceHub`, `webSocketMessage` `append` (`linha 244`) não valida `envelope.workspaceId === workspaceId` (envenenando o stream e travando o sync dos pares); `authenticate()` (`linha 630`) aceita chaves de membros com `revokedAt` preenchido (expondo `GET /webhooks/github`, que não chama `denyOwner`); `putMember` (`linha 911`) chama `socket.close()` sem `try/catch` antes do `INSERT` SQLite; e não há limite de `10/h` por IP nem teto de `64 KB` em frames WS / JSON não-blob.
- **O que deveria acontecer:** Exibir pedidos de entrada para aprovação na UI (mantendo `PENDING_APPROVAL` estável), validar `workspaceId` e tamanho no WS, bloquear revogados em `authenticate()` + `denyOwner` em `/webhooks/github`, gravar SQLite antes de fechar sockets com `try/catch` e limitar `/invites/*` por IP.
- **Correção sugerida:** Ligar `listJoinRequests`/`decideJoinRequest` em `ConnectedRemoteTeamPanel`/Aprovações e pausar `loadKeys`/`pull` enquanto `PENDING_APPROVAL`; checar `revokedAt === undefined` em `authenticate()`, `denyOwner` em `/webhooks/github`, `envelope.workspaceId` e tamanho em `webSocketMessage`, `try/catch` após SQLite em `putMember` e rate-limit por IP na borda.

---

### P1-06 · Item 22 (Equipes e Canais): cerca do Host bloqueia `@persona` fora do canal em produção sem botão nem `@Remote` para adicioná-la, `ConnectedGeneralChannelView` fica preso em `#geral` e `@Ana Paula` / `@equipe` falham no roteamento
- **Arquivos:** `packages/persona/persona-host/src/index.ts:1093,1186-1188`, `packages/persona/persona-host/src/orchestration.ts:784-789,903`, `packages/persona/client-ui-persona/src/client/remote/ConnectedGeneralChannelView.tsx:99`, `packages/persona/client-ui-persona/src/client/chat/ChannelComposer.tsx:524`.
- **Passos para reproduzir:**
  1. Em canal de equipe/customizado (`#marketing`), mencionar `@Bia` (fora do canal).
  2. Ligar `persona.flag.channelSections = '1'` e selecionar outro canal na barra lateral, ou escolher persona com nome composto (`"Ana Paula"`) no seletor do composer, ou pedir `"@equipe crie ideias"`.
- **O que acontece:**
  1. A cerca `ChannelWire` já está ativa em produção (`teamworkEnabled = true`), barrando `@Bia` e postando `"Bia não está em #marketing."`, mas a UI nunca renderiza os botões de `channelNotice` (`"Pôr no canal"` / `"Ir para #..."`) e o Host nem possui `@Remote` que adicione persona a `channel_member`!
  2. `ConnectedGeneralChannelView.tsx:99` fixa `ownerId = live.tenant?.channelId` (`'geral'`), deixando assuntos, fila, `Parar`, `/lado` e cabeçalho presos no `#geral` mesmo após trocar de canal.
  3. `ChannelComposer.tsx:524` tira espaços (`@AnaPaula`), quebrando `mentionsOf` (`@ana paula`), e pedidos de trabalho com `@equipe`/`@Setor` acordam apenas `reading.named[0]`.
- **O que deveria acontecer:** Enquanto a UI de seções/avisos e o `@Remote` de adicionar ao canal não estiverem montados, não cercar às cegas sem saída clicável; usar `selectedChannelId` em `ConnectedGeneralChannelView`, preservar espaços em `@Nome Sobrenome` e distribuir `@equipe` pela coordenação/fanout.
- **Correção sugerida:** Condicionar `ChannelWire` à mesma flag da UI (ou montar `ChannelSections` + botões de `channelNotice` + novo `@Remote addChannelMember`), ler `live.selectedChannelId` em `ConnectedGeneralChannelView.tsx:99` e manter espaços em `ChannelComposer.tsx:524`.

---

### P1-07 · Item 26 fatia 2: `getConnectorCatalog`/`getConnectorHealth` acusam conectores Claude reais como `'missing'`, `importSkills` sofre TOCTOU/colisão entre repos e eventos de rotina batem em falso positivo do `preRoute`
- **Arquivos:** `packages/persona/persona-host/src/index.ts:3502,3516,8269-8271`, `packages/persona/persona-host/src/skill-import-host.ts:81-92`, `packages/persona/persona-host/src/screens.ts:705-719`, `packages/persona/persona-host/src/proactivity-scheduler.ts:625-640`, `packages/persona/persona-host/src/routine-event-intake.ts:80-85`.
- **Passos para reproduzir:**
  1. No app real, conceder um conector `claude.ai` (`Gmail`) e salvar credencial IMAP; chamar `getConnectorCatalog` e `getConnectorHealth`.
  2. Importar skills de dois repositórios com mesmo `name`, ou receber e-mail/Telegram em rotina de evento cujo texto acione regex do `preRoute`.
- **O que acontece:**
  1. `getConnectorCatalog` e `getConnectorHealth` leem `this.connectorPorts.availableConnectors` (`undefined` fora de testes!) em vez de `this.portsNow()`, marcando todo conector Claude concedido como **`'missing'` (`"não está mais no Claude"`)** e omitindo provedores por token (`imap`/`telegram`) de `"Ligadas"`.
  2. `importSkills` baixa o repositório de novo sem conferir o `hash` exibido no preview e usa ID `import-${slug(name)}` global, sobrescrevendo skills de outro repositório sem incrementar `version`.
  3. `proactivity-scheduler.ts:625` injeta o texto externo cru dentro do corpo avaliado pelo `preRoute`: qualquer falso positivo gera 3 retentativas com linhas `ignored` e vaza `routine_event` em `screen_doc` (também não limpo em `deleteRoutine`); e `RoutineEventIntake` descarta definitivamente mensagens acima de `6/hora` em fontes com cursor como Telegram.
- **O que deveria acontecer:** Ler `this.portsNow()` + slots de token em catálogo/saúde; travar `expectedHash` e escopo `owner/repo` em `importSkills`; separar o dado externo não-confiável do prompt avaliado pelo `preRoute` e limpar `routine_event`.
- **Correção sugerida:** Trocar `this.connectorPorts` por `this.portsNow()` em `index.ts:3502,3516` + checar `cofre.hasSecret` para tokens; validar `hash` e prefixar `owner-repo` em `skill-import-host.ts`; avaliar no `preRoute` só o prompt da rotina (passando o evento externo como contexto) e apagar `EVENT_DOC_KIND` ao falhar/excluir rotina.

---

### P1-08 · Resíduos de P1-11, P1-09, Estação (`StationGate`) e `testEmailConnection`
- **Arquivos:** `packages/persona/client-ui-persona/src/client/second-brain/SecondBrainHome.tsx:282-296`, `packages/persona/client-ui-persona/src/client/cofre/ConnectedCofre.tsx:84-91`, `packages/persona/client-ui-persona/src/client/skills/SkillsPanel.tsx:105-112`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:1167-1168`, `packages/persona/client-ui-persona/src/client/remote/ConnectedDirectMessagesView.tsx:82-98`, `packages/persona/persona-host/src/station/station-gate.ts:118-135`, `packages/persona/persona-host/src/team-connect-host.ts:73-77,90-96`, `packages/persona/persona-host/src/index.ts:1005-1009,2969-2974`.
- **Passos para reproduzir:**
  1. Editar resumo da empresa em Memória › Resumo; editar login no Cofre sem redigitar a senha; tentar compartilhar skill `learned-pb-*` do Playbook; abrir aba Memória no perfil do Téo; abrir DM de persona pausada/trabalhando.
  2. Despejar runner ativo na Estação (`evictWarmRunners`), trocar conta de persona já no mesmo CLI em `connectTeam`, ou editar `host`/`usuário` no `EmailRuleForm` deixando senha em branco e clicar em **Testar**.
- **O que acontece:**
  1. **P1-11 parcial ainda aberto:** Resumo da empresa continua sem botão Editar após salvo; `ConnectedCofre` bloqueia edição sem redigitar senha (não passa `keepSecretOnEdit`); skills `learned` não podem ser compartilhadas/revertidas; perfil individual exibe memórias privadas de DM de **outras** personas; e DMs descartam `paused`, `quiet`, `draftFiles` e `step` (mostrando persona pausada como `"Disponível"`).
  2. **`StationGate` / `Station`:** `Station` nasce sem callbacks `running`/`queue` (`clis: 0, queue: 0` fixos na UI), e `evictWarmRunners` nunca chama `stationGate.forget(runner)` (como `dispose()` não emite `'idle'`, `powershell.exe` segura o Windows acordado para sempre após despejo).
  3. **`team-connect-host.ts`:** `bindAccount` não despeja `warmRunners` quando o CLI já era o mesmo nem limpa `active_account` antigo ao migrar para conta padrão de outro provedor.
  4. **`testEmailConnection` (`index.ts:2969-2974`):** Se o usuário alterar `host`/`port`/`user` mantendo a senha em branco, `typed` fica `undefined` e o host testa silenciosamente o **servidor antigo guardado** dizendo que conectou.
- **O que deveria acontecer:** Fechar as 5 pontas de UI do P1-11, ligar `stationGate.forget` + contadores reais na Estação, despejar/limpar assento antigo em `bindAccount` e mesclar campos editados com a senha guardada em `testEmailConnection` (só quando `host` não mudou, exigindo nova senha se trocar de servidor para evitar exfiltração).
- **Correção sugerida:** Passar `keepSecretOnEdit` em `ConnectedCofre`, exibir Editar em `SecondBrainHome`, liberar `origin === 'learned'` em `SkillsPanel`/`publishTaughtSkill`, filtrar `personaId` em `RemoteProfilePanel`, copiar `paused`/`quiet`/`draftFiles`/`step` em `ConnectedDirectMessagesView`, chamar `stationGate.forget` em `evictWarmRunners`/`dropWarm`, corrigir `bindAccount` e exigir nova senha em `testEmailConnection` quando `request.host !== stored.host`.

---

## Bugs P2 (Incômodo, higiene de gates/testes e sala limpa)

### P2-01 · `check-cleanroom.mjs` e `check-lint-staged.mjs` fora dos gates automáticos (`answerAskChoices` em `src/`, 83 erros de `oxlint`, 6 `crypto.randomUUID()` em HTTP LAN e pacote errado em `runtime-file-policy.ts`)
- **Arquivos:** `scripts/persona/persona-gate.mjs:115-125`, `packages/persona/client-ui-persona/src/client/ask/persona-asks-remote.ts:64`, `packages/persona/client-ui-persona/src/client/bring-context/BringYourContextBlock.tsx:311`, `packages/persona/client-ui-persona/src/client/data/vault-documents-remote.ts:17`, `packages/persona/client-ui-persona/src/client/importers/ImportWizard.tsx:113`, `packages/persona/client-ui-persona/src/client/kanban/use-sprint-planning-state.ts:61`, `packages/persona/client-ui-persona/src/client/kanban/workflow-editor-draft.ts:98,138`, `apps/desktop/scripts/runtime-file-policy.ts:16`.
- **Passos para reproduzir:** Rodar `oxlint --config .oxlintrc.staged.json` nos pacotes da Persona e `node scripts/persona/check-cleanroom.mjs --all --strict-names`.
- **O que acontece:** Embora `check-cleanroom.mjs` tenha corrigido a detecção interna de camelCase e JSX, nem ele nem `check-lint-staged.mjs` foram ligados em `preaccept.mjs`/`persona-gate.mjs`; `answerAskChoices` permanece em `persona-asks-remote.ts:64`; restam 83 erros de `oxlint` (incluindo 6 `crypto.randomUUID()` que quebram em HTTP LAN); e `runtime-file-policy.ts:16` ainda referencia `'@deepseek-ai/dsh-cua-macos'` em vez de `'@deepseek-ai/dsh-experimental-cua-macos'`.
- **O que deveria acontecer:** Ambos os scripts executados automaticamente no `persona-gate.mjs`, `answerAskChoices` renomeado, zero `crypto.randomUUID()` e nome exato do pacote em `runtime-file-policy.ts`.
- **Correção sugerida:** Ligar `check-cleanroom.mjs --strict-names` e `check-lint-staged.mjs` em `persona-gate.mjs`/`pre-push.mjs`, renomear `answerAskChoices` → `answerChoiceCard`, trocar os 6 `crypto.randomUUID()` por `randomId()` e corrigir `runtime-file-policy.ts:16`.

---

### P2-02 · `regressao-p1-02b-runner-quente.spec.ts` quebrado contra `:solo` e Eval da Padaria Lua ainda sem `--strict` por padrão e falhando em `'barrado'`
- **Arquivos:** `packages/persona/persona-e2e/tests/regressao-p1-02b-runner-quente.spec.ts:200,219-243`, `packages/persona/persona-e2e/tests/eval-padaria-scenarios.spec.ts:28`, `scripts/persona/eval-padaria.mjs:36-37`, `packages/persona/persona-e2e/src/team-round-driver.ts:46,55,72`.
- **Passos para reproduzir:** Rodar `PERSONA_REAL_CLI=1 pnpm vitest run packages/persona/persona-e2e/tests/regressao-p1-02b-runner-quente.spec.ts` ou `eval-padaria-scenarios.spec.ts`.
- **O que acontece:** `regressao-p1-02b-runner-quente.spec.ts:200` ainda afirma `expect(warm.length).toBe(1)` (quebrado pela correção `:solo` das 06:55) e mantém 3 `it.fails`; `eval-padaria-scenarios.spec.ts:28` exige `missed === []` nos cenários `'barrado'` (onde `missed` é preenchido por desenho); e `eval-padaria.mjs` segue com `strict = false` por padrão e `"2 por R$ 9"` estático.
- **O que deveria acontecer:** Specs de regressão verdes sem `it.fails` obsoletos e eval estrito com frase dinâmica.
- **Correção sugerida:** Atualizar e rodar `regressao-p1-02b-runner-quente.spec.ts` junto da correção do P0-02, checar `expect(run.verdict.ok).toBe(true)` em `eval-padaria-scenarios.spec.ts:28` e ativar `strict: true` + texto dinâmico no eval.

---

### P2-03 · `GITHUB_WEBHOOK_SECRET` fixo em `wrangler.toml`, `saveConnectorSecret` sem allowlist de `provider`, ~15 painéis conectados fora de `ctx.locale` e `playbook.ts` em dia UTC
- **Arquivos:** `apps/persona-edge/wrangler.toml:7,29`, `packages/persona/persona-host/src/index.ts:6431-6445`, `packages/persona/persona-host/src/playbook.ts:89-91`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:39-114`.
- **Passos para reproduzir:** Inspecionar `wrangler.toml`, chamar `saveConnectorSecret({ provider: 'qualquer', ... })` ou trocar o idioma do app nas telas conectadas de Kanban/Aprovações/Membros/Regras/Segundo Cérebro.
- **O que acontece:** `wrangler.toml` traz `GITHUB_WEBHOOK_SECRET = "dev-only-local-secret"` versionado e `workers_dev = true`; `saveConnectorSecret`/`connectorSecretState` aceitam qualquer string em `provider`; `playbook.ts:90` ainda fatia `YYYY-MM-DD` em UTC; e ~15 wrappers `Connected*`/`Remote*` importam `pt` direto em vez de ler `ctx.locale`.
- **O que deveria acontecer:** Segredo local apenas em `.dev.vars` (`workers_dev = false`), `provider` validado contra `SECRET_FACT_KEYS`, dia local em `playbook.ts` e leitura de `ctx.locale` em todos os wrappers conectados.
- **Correção sugerida:** Mover `GITHUB_WEBHOOK_SECRET` para `.dev.vars` + `workers_dev = false`, validar `SECRET_FACT_KEYS.includes(request.provider)` em `index.ts:6432,6443`, aplicar `timezoneOffsetMinutes` em `playbook.ts:90` e injetar os dicionários ativos via `ctx.locale` nos wrappers conectados.

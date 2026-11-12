# Zinc — relato (builder de backend novo; catch-up `skip` + Aprovar e rodar)

Cópia de trabalho: `C:/p8w-zinc` (worktree em `8fcb767034`). Nada foi commitado; nada de IA real foi chamado.

## Tarefa 1 — `catchUp: 'skip'` nunca rodava (FECHADO)

**Causa.** `RoutineRepos.pickDue` devolvia `[]` para `skip` sem olhar a quantidade de ocorrências; o agendador materializava no máximo UMA ocorrência (`cap = 1`), então o store não tinha como distinguir “a ocorrência que acabou de vencer” de “uma pilha de execuções perdidas”.

**Conserto.**
- `persona-store/src/routines/repos.ts` (`pickDue`): `skip` roda quando há exatamente uma ocorrência vencida; com duas ou mais, todas são canceladas (execuções perdidas). `run_once` e `run_all` intactos.
- `persona-host/src/proactivity-scheduler.ts` (`materialize`): `skip` e `run_all` materializam até 20 ocorrências; `run_once` continua só a mais recente. Assim a pilha existe para ser descartada pelo `skip`.

**Provas.**
- `persona-store/tests/routines.spec.ts`: “skip catch-up leases the single due occurrence” e “skip catch-up cancels a pile of missed occurrences”.
- `persona-host/tests/proactivity-scheduler.spec.ts`: “skip catch-up runs the occurrence that just came due and skips a pile of missed ones” (rotina horária: 09:00 roda; 10:00–12:00 em pilha são canceladas; 13:00 roda).
- Rodada: `routines.spec` + `proactivity-scheduler.spec` = **42/42 verdes**; `check-pkg persona-store persona-host` OK.

**Patch:** `.maestri/tmp/zinc/catchup.patch` (4 arquivos, 34 inserções / 4 remoções), gerado com `git diff --cached`.

## Tarefa 2 — “Aprovar e rodar” de rotina que precisa de aprovação (FECHADO)

**Desenho.**
- Novo `persona-host/src/routine-approvals.ts` (`RoutineApprovals`): livro de aprovações em `screen_doc` (`kind: routine_approval`, id = id da execução). O cartão tem `kind: 'routine'`, título “Rodar “{nome}” agora?” e o texto “A rotina “{nome}” vai rodar uma vez para {persona}. Aprovar?”. Pedir é idempotente; a primeira decisão vence.
- Agendador (`proactivity-scheduler.ts`): quando a `routine_charge` pede aprovação e não há decisão, ele **devolve a `routine_run` para `pending` sem contar tentativa** (`RoutineRepos.release`), grava o cartão e audita “precisa da sua aprovação… Aprove em Aprovações; ela roda uma vez.”. `claimDue` recebe o conjunto de execuções com cartão pendente e não as reivindica nem as cancela por catch-up. Com decisão `approved`, a execução segue; com `rejected`, é cancelada e auditada (`sched:routine_rejected`).
- Host (`index.ts`): `decideApproval({kind:'routine', accept})` grava a decisão em transação, registra `approval_decision` (`routine:<id>`) e, na recusa, cancela a execução + grava a auditoria. No aceite, o host dispara um ciclo do agendador na hora quando ele está armado; senão o ciclo seguinte (≤ 30 s) executa.
- Store (`routines/repos.ts`): `release(id)` (leased → pending, sem `attempt++`), `cancel(id)` (pending/leased → cancelled) e `claimDue(projectId, leaseUntil, held)`.
- Cliente: novo `kind: 'routine'` em `ApprovalView`/`ApprovalItem`/`DecideApprovalRequest`, chip “Rotina”, botão “Aprovar e rodar” (pt/en; os demais locales espelham en). O cartão usa as palavras do host; não entra no resumo diário de propostas nem nos insights.
- Contrato: `persona-spec/contracts/routine-remotes.md` §“Aprovar e rodar” (e a semântica de `skip`).

**Provas (ponta a ponta no agendador).**
- `proactivity-scheduler.host.spec.ts` (host real + runner scriptado + pipeline real):
  1. rotina com `requiresApproval` → nenhum Ticket, cartão `routine` pendente, execução `pending`; aprovar → **1 Ticket** para a dona e execução `done`; aprovar de novo → continua **1 Ticket**;
  2. recusar → nenhum Ticket, execução `cancelled`, auditoria “você recusou esta execução”;
  3. reinício (novo `ProactivityScheduler` sobre o mesmo store) com aprovação pendente → não perde, não duplica; depois de aprovar, roda uma vez.
- `proactivity-scheduler.spec.ts` (+4): espera sem rodar, aprovar uma vez, recusar, reinício.
- `routine-approvals.spec.ts` (2): pedido idempotente, primeira decisão vence, cartão some quando a execução some/pausa.
- `routines.spec.ts` (+2): `release` sem tentativa; execução retida não é leaseada nem cancelada.
- ACL: `decideApproval` continua com `requireWrite` + dono/roteado pela governança; a persona não aprova a própria rotina. `remote-acl-matrix.spec.ts` verde.

**Rodadas finais.**
- 13 arquivos (store + host + cliente de aprovações): **143/143 testes verdes** (13/13 arquivos).
- `check-pkg persona-host persona-store`: **OK**.
- `oxlint` nos arquivos tocados do host/store/cliente de aprovações: sem erros novos (restam só achados pré-existentes: o aviso `index.ts:2537` e o erro `approvals-ui-helpers.ts:149`, ambos fora do que mudamos).
- `check-pkg client-ui-persona` isolado acusa **218 erros pré-existentes** de tipos remotos não gerados nesta cópia (`ClientRemote`, `unknown`); nenhum erro nos arquivos que tocamos (confirmado com `tsc` completo e grep nos nossos arquivos).

**Patch:** `.maestri/tmp/zinc/approve-run.patch` (22 arquivos, 540 inserções / 23 remoções), gerado com `git diff` (inclui os dois arquivos novos via `git add -N`), aplicável **por cima** do `catchup.patch`.

## Como aplicar

```sh
cd C:/Users/migue/dev/persona
git apply --check .maestri/tmp/zinc/catchup.patch && git apply .maestri/tmp/zinc/catchup.patch
git apply --check .maestri/tmp/zinc/approve-run.patch && git apply .maestri/tmp/zinc/approve-run.patch
```

Os patches são contra o conteúdo da árvore principal (o worktree base é `8fcb767034`; a árvore principal tem duas mudanças pequenas e não sobrepostas em `index.ts`/`types.ts` da EFF-1). Não há migração de schema: `routine_run` continua com os cinco estados; o cartão é `screen_doc`.

## Comandos (verbatim, na cópia `C:/p8w-zinc`)

```sh
node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc final tests" --lock check -- \
  pnpm --dir C:/p8w-zinc exec vitest run --no-watch --testTimeout 30000 \
  packages/persona/persona-store/tests/routines.spec.ts \
  packages/persona/persona-host/tests/proactivity-scheduler.spec.ts \
  packages/persona/persona-host/tests/proactivity-scheduler.host.spec.ts \
  packages/persona/persona-host/tests/routine-approvals.spec.ts \
  packages/persona/persona-host/tests/routine-remotes.spec.ts \
  packages/persona/persona-host/tests/harness-routines.spec.ts \
  packages/persona/persona-host/tests/remote-acl-matrix.spec.ts \
  packages/persona/persona-host/tests/governance.spec.ts \
  packages/persona/client-ui-persona/tests/approvals-inbox.client.spec.tsx \
  packages/persona/client-ui-persona/tests/approvals-ui-helpers.client.spec.ts \
  packages/persona/client-ui-persona/tests/remote-approvals-panel.client.spec.tsx \
  packages/persona/client-ui-persona/tests/approvals-attention-title.client.spec.tsx \
  packages/persona/client-ui-persona/tests/decisions-cycle.client.spec.tsx
  → Test Files 13 passed (13) · Tests 143 passed (143)

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc final check-pkg" --lock check -- \
  node C:/p8w-zinc/scripts/persona/check-pkg.mjs persona-host persona-store
  → persona-host: OK in 58.4s · persona-store: OK in 37.0s

node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc oxlint 3" --lock check -- \
  pnpm --dir C:/p8w-zinc exec oxlint <arquivos tocados>
  → só os achados pré-existentes citados acima

git apply --check .maestri/tmp/zinc/catchup.patch                      # na árvore principal: OK
git apply --check --cached .maestri/tmp/zinc/approve-run.patch         # na cópia, índice com a tarefa 1: OK
```

## Riscos / limites (ditos com franqueza)

1. **Cartões decididos ficam no `screen_doc`** (um por ocorrência que pediu aprovação). A listagem some depois de 24 h, mas as linhas ficam; uma rotina horária com aprovação gera ~24 linhas/dia. Retenção/limpeza fica para a v1.2.x.
2. **`skip` escolhido:** uma ocorrência vencida isolada roda (a “pontual”); uma pilha é descartada. Depois de o app ficar fechado por várias ocorrências, a rotina espera a próxima — é o significado de “skip”, agora documentado no contrato.
3. **Aprovação não é instantânea fora do agendador armado:** o aceite dispara um ciclo só quando `proactivityScheduler.status().running`; em teste/agendador desligado, o próximo ciclo executa. Nada é perdido.
4. **Cliente antigo:** `kind: 'routine'` é um valor novo no fio; o patch inclui o cliente. Um cliente sem esta versão veria o cartão como desconhecido (não há fallback silencioso no host).
5. **Sem IA real:** todas as provas usam runner scriptado/fake clock, como pedido.

## H15b — token de conector saiu do SQLite (FECHADO, 11/11 23:12)

**Achado.** `CofreSecretVault.get` lia o token do **corpo** de um registro do Cofre (`findActiveFact(projectId, provider).body`), e `createVaultRecord` grava o corpo como veio: token de Telegram/Slack/Discord/CalDAV/IMAP/SMTP ficava em texto puro em `vault_record` (e em `vault_version`, a cada edição).

**Conserto.**
- `persona-store/src/vault/repos.ts`: novo `purgeSecret(id)` — corpo vira o lápide `Conteúdo movido para o Cofre.`, `fact_key` vai a NULL, status `revoked`, e **todas** as versões daquele registro são apagadas (`vault_version`). Nada do texto antigo sobra nas duas tabelas.
- `persona-host/src/cofre-migrate.ts` (novo): varredura de boot por espaço de trabalho/projeto, para as seis chaves de conector. Sela em `connector:<provider>` (DPAPI, dono reservado `cofre`) e só então purga. Se o cofre recusa (`VaultUnavailableError`), a varredura falha e **não purga nada**.
- `persona-host/src/cofre-secrets.ts`: `get` lê o slot selado primeiro e mantém o corpo legado como fallback (registro criado por cliente antigo depois do boot). O slot é por projeto; o registro legado mantém a regra de visibilidade antiga.
- `persona-host/src/index.ts`: `readonly cofreMigration: Promise<CofreMigrationResult>` (boot não bloqueia; erro vai para `orchestration.lastErrors`) e o `CofreSecretVault` recebe os slots selados.

**Provas.**
- `persona-store/tests/vault.spec.ts`: “purges a secret record: tombstone body, no fact key, no versions”.
- `persona-host/tests/cofre-migrate.spec.ts` (3): migra e o dump de `vault_record ∪ vault_version` **não contém** o token; o leitor responde do slot selado; segunda execução move 0; cofre que recusa deixa o texto puro e não purga.
- Rodada: `vault.spec` + `cofre-migrate.spec` = **26/26**; `external-sources.spec` 7/7; `check-pkg persona-store` OK; `check-pkg persona-host` sem erro nos arquivos do Cofre (restam 7 de edições em curso de outros donos: `activity-undo.ts`, imports não usados em `index.ts`, `team-connect.spec.ts`).

**Limites.**
1. `github.webhook.secret` é a mesma classe de segredo, mas o port `secretOf` do `GithubSourceHost` é **síncrono**; migrar exige torná-lo assíncrono (fora desta fatia). Fica registrado.
2. A varredura roda no boot; um registro legado criado depois (cliente antigo) continua legível e é migrado no próximo boot.
3. O slot selado é por projeto e não carrega a visibilidade `persona:` do registro antigo; na prática todo token real foi gravado com visibilidade `workspace`.

## Item 15 — gancho da ferramenta `ask_vault_code` (FECHADO, 11/11 23:14)

- `R/mcp/harness-tools.ts`: `ask_vault_code` entra em `HARNESS_TOOLS` (última posição, prefixo quente intacto) e em `DEFINITIONS` (`reason` obrigatório, `login` opcional; o texto diz que o código vai para o Cofre e nunca para o modelo). Fica **inerte** até o host listá-la: `ports.tools` é o único portão de anúncio e nenhuma regra de palavras a oferece ainda.
- `R/resolve/tool-level.ts`: classificada como COORDENAÇÃO (`read`), junto de `ask_colleague`/`pass_forward`/`ask_team_opinion` — ela não toca arquivo nem o mundo, só abre um pedido para o dono.
- Prova: `harness-tools.spec` + `final-reply-only.spec` + `tool-level.spec` = **20/20**.
- Falta (outros donos): o dispatch em `H/harness-dispatch.ts` (Forge), a regra que oferece a ferramenta no turno (`H/harness-turn.ts`) e o cartão em Aprovações (tela).

## Item 15 — dispatch do `ask_vault_code` (FECHADO, 11/11 23:36)

- `H/harness-ports.ts`: `VaultCodePort` (abre o pedido; devolve `requestId`/`expiresAt` ou recusa tipada) e `HarnessPortsDeps.vaultCode`.
- `H/harness-vault.ts` (novo): `VaultCodePorts` — sem cofre selável recusa com frase PT e **não abre** pedido; com cofre, abre e devolve só id/prazo (nunca dígito).
- `H/harness-dispatch.ts`: `ask_vault_code` anunciado só quando o port existe + `case` que valida `reason` e responde `{ok, requestId, expiresAt, message}`.
- `H/index.ts`: `vaultCode: new VaultCodePorts({ codes: this.cofre.codes, sealable: canSealCofre })`.
- Provas: `harness-vault.spec` 2/2 (pedido pendente com login/tarefa; sem cofre não abre nada); `harness-gateway` + `harness-turn` + `harness-turn-stable` + `harness-hiring` = 32/32. `check-pkg persona-host` sem erro nos meus arquivos (10 restantes em `tests/activity-undo-thread.host.spec.ts` e `tests/team-connect.host.spec.ts`, de outros donos).
- Falta (tela): a regra que OFERECE a ferramenta no turno (`harness-turn.ts`) e o cartão em Aprovações.

## Item 12 — bug real: o relógio da rodada (FECHADO, 12/11 00:00)

**Sintoma.** conversation-d079 (4 testes) e conv1-routing (1): a resposta da pessoa acordava a Tarefa e o turno não rodava — `latestAssignment(...).report` ficava `undefined` e o `flush` não esperava.

**Causa (três partes).**
1. `driveTicket` media o relógio pelo `startedAt` da última Assignment; uma resposta horas depois (ou um restart) trazia um `startedAt` antigo e a Tarefa destacava na hora ("Sigo no fundo").
2. O livro do background era criado pela PRIMEIRA chamada a `backgroundWorkOf`: `absorbingTicket` lia o livro sem opções e o criava com `Date.now` real. O `driveTicket` passava o relógio do host, mas era ignorado — `remainingMs` comparava 12/11 com 03/11 e destacava tudo.
3. O livro sobrevive ao `resetHost` (é por host, não por runtime): um teste deixava o ticket em background e o seguinte, com o mesmo id depois do wipe, não rodava o turno.

**Conserto.**
- `driveTicket`: o relógio da rodada começa no ATO do driveTicket (relógio do host); só usa o `startedAt` antigo quando a Assignment já está RODANDO (retomada de run interrompido).
- `Orchestration.backgroundWork` (getter privado): TODO acesso ao livro passa por ele com o relógio do host — nenhuma leitura pode criá-lo com o relógio de parede.
- `BackgroundWork.reset()` e `resetHost` limpam o livro entre testes (criando-o com o relógio do host).

**Provas.** conversation-d079 + conv1-routing + persona-ask-tool + background-work = **47/47**. CRLF de `orchestration.ts` preservado (4299/4299). `check-pkg persona-host`: só 2 erros, do Rivet (`IndicatorOfferView`/`IndicatorSchedule` não usados).

## Item 15 — superfície Remote do Cofre v2 (FECHADO, 12/11 00:05)

O que faltava de dados para a tela consumir. Tudo aditivo.

- `H/types.ts`: tipos de fio — `CofreEntryView`/`CofreEntryKind` (re-export dos módulos), `CofreImportPreview`/`Result`/`Row`/`Duplicate`/`Ignored`/`Format`, `CofreCodeRequestView`/`State`, e os pedidos `SaveCofreLoginRequest`, `SaveCofreKeyRequest`, `SaveCofreCompanyRequest`, `RemoveCofreEntryRequest`, `CofreImportRequest`, `FillCofreCodeRequest`, `CancelCofreCodeRequest`.
- `H/index.ts` (@Remote): `listCofreEntries`, `saveCofreLogin`, `saveCofreKey`, `saveCofreCompany`, `removeCofreEntry`, `previewCofreImport`, `commitCofreImport`, `listCofreCodes`, `fillCofreCode`, `cancelCofreCode`. Leitura com `requireProject`; escrita com `requireWrite`; `authorId` vem do ator da sessão.
- **Não existe Remote de `take`**: os dígitos só saem para o host (digitação no navegador, #17 do Onyx), nunca para o cliente/modelo.
- Provas: `cofre-host.spec` 4/4 (Ficha via Remote + brief; prévia de CSV via Remote sem senha; remoção revoga o brief; Login sem cofre recusa com `vault_unavailable`; lista de códigos responde). Conjunto do Cofre: **27/27** (7 arquivos). `check-pkg persona-host`: OK.
- Falta (tela, Lumen/Muse): o adaptador do cliente, o cartão do 2FA em Aprovações e a regra que OFERECE `ask_vault_code` no turno (`harness-turn.ts`) — sem o cartão, oferecer a ferramenta só criaria pedidos que ninguém vê.
- Limite conhecido: pedidos de código ficam em `screen_doc` (como as aprovações de rotina); retenção/limpeza fica para a v1.2.x.

## H15c — github.webhook.secret saiu do SQLite (FECHADO, 12/11 00:28)

Mesma classe do H15b: o segredo do webhook do GitHub era lido do corpo de um registro do Cofre (`factKey` `github.webhook.secret`), em texto puro no SQLite.

**Conserto.**
- `H/webhook-http.ts`: o port `GithubWebhookSink.secretOf` virou assíncrono (`Promise<string>`) e o handler faz `await` antes do HMAC — o cofre é assíncrono e o segredo agora vem dele.
- `H/index.ts`: `githubWebhookSecret(projectId)` — env `PERSONA_GITHUB_WEBHOOK_SECRET` (testes) primeiro, depois o slot selado `connector:github.webhook.secret`, depois o corpo legado. O helper síncrono antigo foi removido.
- `H/cofre.ts`: `CofreHost.secretOf(projectId, slot)` — leitura host-only do slot selado (nunca caminho de modelo).
- `H/cofre-migrate.ts`: `SECRET_FACT_KEYS` agora inclui `GITHUB_WEBHOOK_FACT`; a varredura de boot sela e purga o registro (lápide, `fact_key` NULL, versões apagadas).

**Provas.** `cofre-migrate.spec` 3/3 (novo caso: o segredo do webhook vai para o slot, o dump de `vault_record ∪ vault_version` não contém o texto e a 2ª execução move 0), `webhook-http.spec` 2/2 com o port assíncrono. `check-pkg persona-host`: meus arquivos limpos (restam 2 erros de `firstRun` em `orchestration.ts`, de outro dono).

## #6 fatia 2 — resumo recolhido nos turnos de CONVERSA (FECHADO, 12/11 00:42)

**Ideia.** O "N passos · tempo" existia só para Tarefas (o host grava atividade a partir de `assignment.reported`). Turnos de conversa (#geral/DM) não têm assignment, então não deixavam resumo.

**Conserto (host).**
- `H/runner.ts` (captura do Bolt, aditivo): `TextCapture.toolTimes?: string[]` paralelo a `tools`; o tap e `emitRunnerStep` empilham o instante de cada chamada, e o início de turno limpa. Novo `lastRunnerToolSteps(runner)` devolve `{tool, at}[]`.
- `H/talk-activity.ts` (novo): `stepKindOf(tool)` (Read/Glob/Grep → `read`, Write/Edit/Patch → `file`, check/test → `check`, message/send → `message`, hire → `hire`, resto → `command`) e `talkActivityRows({eventId, personaId, steps})` — UMA linha por ferramenta, `id` `talk:<eventId>:<i>`, `threadId` = **id da mensagem da pessoa que o turno responde**, `title` = nome técnico da ferramenta, `status` `done`, `at` = instante da chamada.
- `H/orchestration.ts`: hook de 4 linhas na cauda de `finishReply` (depois de `noteUsage`) grava as linhas no livro existente (`recordActivity`); `liveToolSteps` é o gancho de teste, como `liveTools`.
- Leitura: **nenhum remote novo** — `listTurnActivity` já serve; a UI da Quill pede com `subjectId` = id da mensagem respondida (contrato enviado a ela).

**Provas.** `talk-activity.spec` 2/2: turno com 3 ferramentas (Read, Bash, Write) gera 1 grupo com 3 passos, kinds `command/file/read` (ordem do fold: kind e depois hora), instantes preservados e status `done`; turno sem ferramenta não gera nada. `check-pkg persona-host` OK. CRLF de `orchestration.ts` preservado.

## Parar — diagnóstico do bug (aberto, pós-congelamento)

**Sintoma (Gauge/Forge).** O dono aperta Parar numa persona trabalhando e o fio ganha "Não consegui responder." + cartão `engine_unavailable`: ele parou de propósito e lê que o motor caiu.

**Causa (fechada por leitura do fluxo).** Em `settleTask` o host lê `stoppedNow = this.stopped.delete(ticket.id)` ANTES do turno. O Parar chega em `takeLive(runner)` (depois dessa leitura) e `runTicketCommand('stop')` chamava `engine.stopTicket` direto — sem marcar `stopped` e sem cancelar o turno vivo. A Tarefa termina como `stopped` (humano), mas o laço segue: o report do runner é `failed` e a linha ~2911 posta `runErrorLine(engine_unavailable)`.

**Conserto (parcial já no tree).** `runTicketCommand('stop')` agora roteia por `orchestration.stopTicketRun` (cancela o turno vivo e marca o stop) — typecheck OK, `acceptance-item1-parada`/`conductor` 12/12.

**Falta (fila pós-congelamento).** (1) `stopTicketRun` marca `stopped` sempre que a Tarefa está aberta (hoje só com runner `running`); (2) `settleTask` consome o stop logo após `takeLive` e `continue`; (3) `reportRunFailure`/`reportResolveFailure` saem cedo, sem linha, quando a Tarefa está em `stopped`. Repro: `tests/acceptance-parar-sem-erro.red.ts` (Gauge), fora da suíte; verde → renomear para `.host.spec.ts`.

## Parar — FECHADO (12/11 02:20)

Conserto aplicado: `stopTicketRun` marca `stopped` sempre que a Tarefa está aberta (não só com runner `running`); `settleTask` consome o stop logo após `takeLive` e dá `continue` (nada do turno é postado); `reportRunFailure` sai cedo, sem linha, quando a Tarefa está em `stopped`. O repro do Gauge passou e virou `tests/acceptance-parar-sem-erro.host.spec.ts` (na suíte). Regressão: `acceptance-item1-parada` + `conductor` + as duas `-red` + `background-work` + `talk-activity` = 23/23.

## Cofre — remotes pedidos por Lumen/Flint (FECHADO, 12/11 02:20)

- `cofreStatus({workspaceId, projectId}) => { sealable }` (campo `cofreSealable`, do `canSealCofre`): a tela desabilita Logins/Chaves sem DPAPI antes de tentar salvar.
- `saveConnectorSecret({provider, secret})` sela em `connector:<provider>` — o slot que `CofreSecretVault.get` lê (19b: formulário IMAP) — e `connectorSecretState({provider}) => { hasSecret }`, sem nunca devolver o segredo. `CofreHost.putSecret`/`hasSecret` são a fachada.
- `CofreCodeRequestView.site?: string`: o login que a persona informou (truncado em 60, sem segredo); `VaultCodePorts` grava em `site` em vez de colar no `reason`.
- `saveCofreLogin`/`saveCofreKey` com `id` e `password`/`secret` ausente mantêm o selado e só atualizam metadados; sem `id` ou sem slot, recusam com frase clara.
- Hook do #6 endurecido: `recordActivity` em try/catch (bookkeeping nunca vira erro na cara da pessoa).
- Provas: `cofre-host` 7/7 (4 casos novos), `harness-vault` 2/2, `cofre-2fa` 2/2, `talk-activity` 2/2. Lint dos meus arquivos (src + tests) com `node node_modules/oxlint/bin/oxlint --config .oxlintrc.staged.json`: exit 0.

## Item 26.4 — catálogo "Ferramentas do seu negócio" (host, FECHADO 12/11 02:31)

Fatia 26.4 do PLUGINS-GAP, lado HOST (a tela fica com Lumen/Muse consumindo o remote).

- `H/connector-catalog.ts` (novo): catálogo curado com 35 ferramentas de pequeno negócio BR, 7 categorias (Vendas e loja · Pagamentos · Atendimento · Agenda e e-mail · Documentos · Redes sociais · Gestão), uma frase PT por cartão e o `via` do documento: `claude-account` (Gmail/Agenda/Drive/Planilhas, os da conta claude.ai), `official` (Stripe, Shopify, Notion — os únicos com servidor oficial listado SEM "(confirmar)"), `token` (Telegram/Slack/Discord/IMAP, que já existem como fontes) e `unconfirmed` para todo o resto.
- Regra de promessa: `promised = via !== 'unconfirmed'`; entrada não confirmada é "Em breve" e nunca oferece "Conectar". Só `official` carrega `url`, e só quando o documento a lista (nada inventado).
- `linked` é decidido no host: cruza os grants do time (`ConnectorGrantsHost.list`) e os conectores da conta (`ConnectorPorts.availableConnectors('claude')`), por nome normalizado.
- Remote aditivo `getConnectorCatalog(ProjectScopeRequest) => ConnectorCatalogView` (leitura, `requireProject`); tipos re-exportados em `H/types.ts`.
- Provas: `connector-catalog.spec` 3/3 (toda entrada tem categoria/frase/via; unconfirmed sem URL e sem promessa; grant e conta marcam `linked`; host novo responde com nada ligado). Lint exit 0; `check-pkg persona-host` só com o erro do `remote-team.ts` (Bolt).

## Item 26.8 — saúde dos conectores em PT (host, FECHADO 12/11 02:35)

- `H/connector-health.ts` (novo): `connectorHealth({ grants, available, connections, tokens, personaNameOf })` devolve uma linha por conector com `state` (`ok|reconnect|offline|permission|missing`), `action` (`none|reconnect|retry|remove`) e a frase em PT montada aqui — o texto cru do fornecedor nunca entra nela.
- Regras: conector sumiu da lista da CLI → `missing`/`remove`; CLI não instalada → `offline`/`retry`; CLI deslogada → `reconnect`/`reconnect`; sondagem ainda rodando (`phase: 'checking'`) → **nenhuma linha** (nunca "sem login"); provedor com token sem slot → `reconnect`, com slot → `ok`.
- `TOKEN_PROVIDERS` (IMAP, SMTP, Telegram, Slack, Discord, CalDAV) com os nomes da tela.
- Remote aditivo `getConnectorHealth(ProjectScopeRequest)` (leitura): cruza grants, `ConnectorPorts.availableConnectors` das 4 CLIs, `connections.list()` e `cofre.hasSecret(projectId, connector:<provider>)`.
- Fora desta fatia (dependem do proxy 26.1): "Testar agora" e a checagem leve de 15 min.
- Provas: `connector-health.spec` 4/4. Lint exit 0; `check-pkg persona-host` só com o erro do `remote-team.ts` (Bolt).

## Item 26.10/26.11 — importar skill por link do GitHub (host, FECHADO 12/11 02:50)

- `H/skill-import.ts` (novo, puro): `parseSkillLink` (github.com/o/r, /tree/ref/path, /blob/ref/.../SKILL.md; outra origem = undefined), `readArchive` (tar.gz em memória: ≤8 MB, ≤200 arquivos, ≤512 KB por arquivo, recusa caminho com `..`/absoluto/drive, ignora symlink e diretório, só texto), `frontmatter` (name/description obrigatórios), `skillCandidates` (marca `hasScripts`; script NUNCA roda), `skillHash`, `archiveUrl` (só codeload.github.com).
- `H/skill-import-host.ts` (novo): `preview` (baixa com `redirect: 'error'` — nenhum salto de host — e sem dado do usuário), `import` (grava via `ScreensHost.importSkill`), `refresh` (mesmo hash = nada muda; hash novo = `stageSkillUpdate`, espera aprovação) e `approve`.
- `H/screens.ts`: `StoredSkill` ganhou `source`/`untrusted`; `importSkill`, `stageSkillUpdate`, `pendingSkillUpdate`, `approveSkillUpdate` (histórico preservado, então o `rollbackSkill` existente desfaz). `SkillView` no fio ganhou `source?`/`untrusted?`.
- `H/index.ts`: remotes `previewSkillImport`, `importSkills`, `refreshSkill`, `approveSkillUpdate` (leitura com `requireProject`, escrita com `requireWrite`; `SkillImportError` vira `HostRemoteFault('invalid-payload', frase PT)`).
- Conteúdo importado é DADO: `untrusted: true` no doc e no fio; nenhuma ferramenta é pedida e nenhuma regra muda por causa dele.
- Provas: `skill-import.spec` 6/6 (parser; traversal/symlink/tamanho/contagem; frontmatter; scripts marcados; preview só em codeload com redirect recusado; import com source+untrusted; refresh igual = nada, novo = espera aprovação e aprova v2; link não-GitHub recusado sem download). Lint exit 0; `check-pkg persona-host` OK.

## Item 26 onda B — tokens OAuth de MCP no Cofre (host, FECHADO 12/11 02:55)

- `H/oauth-vault.ts` (novo): `OAuthVault` com duas metades — segredo em slot selado `oauth:<provider>:<account>` (DPAPI, via `CofreSecrets`) e metadado não-secreto em `screen_doc` (`oauth_credential`). `save`, `tokens` (host-only), `rotate`, `drop`, `list`.
- Rotação serializada por conexão: duas chamadas concorrentes fazem UMA chamada de rede (o provedor recusa a segunda tentativa de refresh); a segunda espera e recebe o mesmo resultado.
- `H/index.ts`: campo `oauthVault` + remote de leitura `listOAuthCredentials` (metadados, nunca token). Nenhum remote, evento ou prompt carrega token.
- Contrato para o Lumen (proxy MCP da onda B): `persona-spec/contracts/mcp-oauth-cofre.md`.
- Provas: `oauth-vault.spec` 4/4 (metadado visível e token selado; rotação concorrente = 1 chamada e metadado atualizado; drop limpa os dois; valor ilegível e conexão ausente recusam com `OAuthVaultError`). Lint exit 0; `check-pkg persona-host` OK.

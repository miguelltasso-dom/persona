VEREDITO: BLOQUEADO

**Snapshot auditado:** `colheita-s1` (`9f5fc1198e..d232da3e00`, 940 arquivos alterados)
**Auditor:** CARBON (Portão Final de Qualidade) · **Data:** 12/11/2026
**Resumo executivo:** 14 bloqueios **P0** (quebra de boot/empacotamento, vazamento da senha na digitação cega, colunas `routine`/`unattended` da tabela de autoridade mortas em produção, bypass de `viaEmail` por handoff, escapes do rascunho e leitura de segredos no Windows, reuso de `PermissionGate` fechado no pool, perda silenciosa de mensagens no `steer` e na reserva de 95%, vazamento de histórico entre DMs privadas via `--resume`, crash ao editar ação externa, injeção/OOM no IMAP, processos órfãos no Windows e teste de ACL cego para `async`), 12 bloqueios **P1** (usuário leigo trava, se engana ou encontra fachadas desligadas) e 3 itens **P2**.

---

## Bugs P0 (Quebra, perde dado, vaza segredo ou viola regra inegociável)

### P0-01 · `@deepseek-ai/dsh-persona-components` falha ao montar em todo boot do perfil `persona`, falta em `tsconfig.host.json` e aborta `prepare-dsh.ts`
- **Arquivos:** `packages/persona/persona-components/src/index.ts:7`, `packages/persona/persona-app/cordis.patch.yml:188-193`, `tsconfig.host.json:569-578`, `packages/persona/persona-components/package.json:32`, `apps/desktop/scripts/prepare-dsh.ts:140`.
- **Passos para reproduzir:**
  1. Subir o perfil `persona` pelo Cordis `Loader` (`cordis.patch.yml` carrega `@deepseek-ai/dsh-persona-components`).
  2. Rodar `pnpm run build` em árvore limpa ou empacotar o desktop com `prepare-dsh.ts`.
- **O que acontece:**
  1. `persona-components/src/index.ts:7` exporta apenas `export { default as PersonaComponents } from './plugin.ts'` (sem `export default` nem `apply`). `Loader.unwrapExports` entrega o objeto de namespace ao `Registry.plugin`, que lança `Error: invalid plugin, expect function or object with an "apply" method`, deixando `ctx.get('personaComponents') === undefined` em toda execução real (os testes passaram porque importaram `./plugin.ts` direto ou injetaram manualmente).
  2. `tsconfig.host.json` não referencia `./packages/persona/persona-components`, quebrando a compilação agregada em árvore limpa.
  3. `persona-components/package.json:32` declara `"extract-zip": "^2.0.1"` (`yauzl@^2.10.0`), divergindo do override `yauzl@3.4.0` do workspace e abortando `assertRuntimeLockfileWithinWorkspace` em `prepare-dsh.ts`.
- **O que deveria acontecer:** O plugin deve montar sem erro no `Loader`, compilar em `tsconfig.host.json` e passar no gate de lockfile do instalador.
- **Correção sugerida:** Exportar `export { default } from './plugin.ts'` em `packages/persona/persona-components/src/index.ts`, incluir `{ "path": "./packages/persona/persona-components" }` em `tsconfig.host.json` e substituir `extract-zip` por extração compatível com o lockfile do workspace (ex.: `fflate`) + gerar/embarcar `components.json` e `DSH_COMPONENTS_MANIFEST` no `apps/desktop`.

---

### P0-02 · Digitação cega (`browser_login`, Item 15b) vaza a senha do Cofre ao modelo: `SecretMask.redact()` nunca é chamado em produção, ferramentas `read` do navegador leem a senha em claro e o vigia de URL trava 2 min antes do envio
- **Arquivos:** `packages/persona/persona-host/src/browser/login-port.ts:51`, `packages/persona/persona-host/src/browser/blind-typing.ts:83-98,121-131`, `packages/persona/persona-runners/src/authority/browser-policy.ts:21-25`, `packages/persona/persona-host/src/browser/cdp.ts:39-80`.
- **Passos para reproduzir:**
  1. Cadastrar um login no Cofre, conceder perfil do Chrome a uma persona e pedir que ela entre no site usando `browser_login`.
  2. Após `browser_login` digitar a senha e clicar em Entrar, a persona chama `mcp__browser__get_network_request` (ou `list_network_requests`, `take_memory_snapshot`, `get_console_message`).
- **O que acontece:**
  1. `login-port.ts:51` chama `this.deps.mask.add(password, now())`, mas **`SecretMask.redact()` tem zero chamadores em todo o código de produção** (`src/`): qualquer saída de ferramenta, erro ou log carrega a senha sem máscara.
  2. `browser-policy.ts:21-25` classifica `list_network_requests`, `get_network_request`, `take_memory_snapshot` e `get_console_message` como `'read'` (`allow` irrestrito), entregando o corpo do POST de login ou heap com a senha em texto puro diretamente ao LLM e ao histórico.
  3. `typeLoginBlind` (`blind-typing.ts:85-94`) dorme em loop síncrono por `LEAK_WATCH_MS = 120_000` (2 minutos) **dentro** da chamada `browser_login` antes de devolver o turno ao modelo para clicar no botão de envio — logo um `<form method="get">` só vaza na URL *depois* que a vigilância já encerrou. Quando detecta vazamento (linha 90), não limpa a aba (`about:blank`), mentindo na mensagem `"fechei a digitação"` e deixando a senha em `location.href`. Além disso, `SecretMask` e o detector de URL ignoram `+` de `application/x-www-form-urlencoded` e Base64, e `CdpConnection` (`cdp.ts:39-80`) não registra listener de `close`/`error` nem timeout pós-abertura, pendurando o turno eternamente se a aba fechar.
- **O que deveria acontecer:** O modelo nunca pode ler a senha nem por rede/console/memória nem por vazamento em URL; `browser_login` deve retornar rápido, vigiar navegação em background por 2 minutos abortando/limpando a aba para `about:blank` se a senha aparecer na URL, e aplicar `mask.redact()` em todas as saídas de ferramentas/eventos/logs.
- **Correção sugerida:** Bloquear (`never` ou `ask` fora de sessão autenticada) `get_network_request` em corpos de request sensíveis e `take_memory_snapshot` em `browser-policy.ts` durante a janela de máscara; passar toda resposta de ferramenta MCP/runner e captura de texto por `this.browser.mask.redact(..., now)` (incluindo `urlencode` com `+`, escape JSON e Base64); mover o monitor de URL para listener CDP assíncrono pós-retorno que navega imediatamente para `about:blank` ao detectar vazamento; rejeitar promessas pendentes no `close`/`error` do WebSocket em `cdp.ts`.

---

### P0-03 · Tabela Única de Autoridade (Item 8) nunca recebe `'routine'` nem `'unattended'` em produção, e `viaEmail` (Item 19b) é burlado por repasse entre colegas
- **Arquivos:** `packages/persona/persona-runners/src/resolve/resolve-runner.ts:752`, `packages/persona/persona-runners/src/authority/native-gate.ts:76-81`, `packages/persona/persona-host/src/action-bridge.ts:152`, `packages/persona/persona-runners/src/resolve/permission-gate.ts:271`, `packages/persona/persona-host/src/orchestration.ts:2826-2827`, `packages/persona/persona-host/src/handoffs.ts:348-370`.
- **Passos para reproduzir:**
  1. Agendar uma rotina (`routine-run:...`) ou disparar iniciativa/webhook sem humano presente numa persona com navegador ou conectores/shell.
  2. Enviar um e-mail externo malicioso que cai em `pollEmail` (`viaEmail: true` no Trigger `mail:<id>`), fazendo a Persona A chamar `pass_forward` ou `ask_colleague` para a Persona B (que tem `autonomy: 'act'` ou `confirm.send: 'never'`).
- **O que acontece:**
  1. Nem `Orchestration.runLaunched`, nem `ActionBridge.arm` (`action-bridge.ts:152`), nem `resolveRunner` (`resolve-runner.ts:752`) passam `authority: 'routine' | 'unattended'`. Ambos `PermissionGate.arm` e `withNativeGate` caem sempre no default `'person'`, tornando 2/3 da tabela de autoridade código morto em produção (rotinas clicam/digitam no Chrome e abrem ações restritas a turnos humanos).
  2. No repasse de A para B, o Ticket T2 nasce com `origin.triggerId = 'handoff:<T1>:<callId>'`. `orchestration.ts:2826` checa apenas `rt.repo.triggers.get(ticket.origin.triggerId)?.viaEmail` (ignorando a árvore ancestral e `triggerIds` mesclados), perdendo `viaEmail: true` e permitindo envio externo automático sem aprovação humana.
- **O que deveria acontecer:** Turnos de rotina/iniciativa/webhook devem rodar estritamente sob `authority: 'routine'` ou `'unattended'`, e a marca `viaEmail` deve ser contagiosa para qualquer subtarefa, `split`, `handoff` ou turno que absorva insumo de e-mail recebido.
- **Correção sugerida:** Derivar `authority` da origem real do Ticket (`person` vs `routine` vs `unattended`) em `orchestration.ts` e propagá-la para `ActionBridge.arm` e `withNativeGate`; calcular `viaEmail` percorrendo `origin.triggerId`, `origin.triggerIds`, `inputs` e Tickets pais de `handoff:`/`split:`.

---

### P0-04 · Bypasses no porteiro de comandos (`command-policy.ts` + `permission-gate.ts`) e corrida de sandbox no Codex/OpenCode permitem escrita/exclusão fora do rascunho e leitura de segredos no Windows
- **Arquivos:** `packages/persona/persona-runners/src/authority/command-policy.ts:290-292,411-433,580-589`, `packages/persona/persona-runners/src/resolve/permission-gate.ts:418-419,450-461`, `packages/persona/persona-runners/src/oar/adapter.ts:128-139`, `packages/persona/persona-runners/src/authority/opencode-config.ts:35-43`.
- **Passos para reproduzir:**
  1. Em PowerShell/Bash no Windows, executar `Copy-Item rascunho.txt -Destination:C:\Users\migue\Desktop\fora.txt`, `Remove-Item -Path:C:\Users\migue\Documents\importante.docx build`, `cp --target-directory=C:/Users/migue/Desktop a b` ou `git worktree add "C:/Users/migue/Meus Documentos/escape"`.
  2. Executar `cat C:/Users/migue/.ss?/id_ed25519`, `type C:\Users\migue\.ssh.\id_rsa.` ou chamar a ferramenta nativa `Grep` do Claude com `{ path: "C:\\Users\\migue", pattern: ".*" }`.
  3. No rascunho Git, gravar `.git/hooks/pre-commit` e rodar `git commit --allow-empty -m x`.
  4. Abrir simultaneamente um turno `talk` (`read-only`) e um `task` (`workspace-write`) no Codex.
- **O que acontece:**
  1. `isFlag` (`command-policy.ts:290`) trata qualquer argumento iniciado por `-` como flag inofensiva, descartando `-Destination:C:\...` e `--target-directory=...` da checagem de escopo e aprovando (`allow`, `'draft-change'`) escrita/exclusão fora do rascunho; `command-policy.ts:581` ignora qualquer caminho com espaço (`!arg.text.includes(' ')`) em comandos `git` e aceita `within === undefined` quando não há rascunho (`noDraft: true`).
  2. Coringas `*`/`?`, ponto final de segmento Win32 (`.ssh.`) e `Grep` no diretório pai burlam `SECRET_PATHS` e leem chaves SSH, `.env` e `persona-vault.json` sem bloqueio.
  3. Escrever em `.git/hooks/*` + `git commit` é aprovado como `'draft-change'` e executa código arbitrário sem inspeção.
  4. `adapter.ts:131` muta `process.env.OAR_CODEX_SANDBOX` globalmente através de `await`, vazando `workspace-write` para sessões `read-only` concorrentes; e `opencode-config.ts:35-43` omite `"*": "deny"` e deixa `external_directory` no root do repositório Git pai em vez da subpasta de rascunho.
- **O que deveria acontecer:** Qualquer caminho em `-Param:Valor` / `--opt=valor` ou com espaços, qualquer escrita em `.git/` (ou ausência de `draftRoot`), e qualquer glob/diretório pai cobrindo segredos deve falhar fechado; o sandbox do Codex deve ir por opção por sessão (nunca `process.env` global).
- **Correção sugerida:** Extrair valores de `-Nome:Valor` e `--flag=valor` em `command-policy.ts`, remover `!arg.text.includes(' ')`, exigir `within === true` para `'draft-change'`, bloquear escrita dentro de `.git/` (`hooks`, `config`), marcar `*`/`?` como `expands = true`, normalizar pontos/espaços finais Win32 em `isSecretPath`, bloquear `Grep`/`Glob` acima de pastas com segredos, passar `env` isolado por spawn no Codex e incluir `"*": "deny"` no OpenCode.

---

### P0-05 · `defaultRunnerPool` reutiliza runner com `PermissionGate` HTTP fechado na 2ª Tarefa, e `warmRunners` mantém acesso vivo ao Chrome após revogação
- **Arquivos:** `packages/persona/persona-runners/src/resolve/resolve-runner.ts:584-599,664-670`, `packages/persona/persona-host/src/orchestration.ts:1100-1124,2555-2569,2665-2668`, `packages/persona/persona-host/src/index.ts:3721-3733`.
- **Passos para reproduzir:**
  1. Rodar Tarefa 1 de uma persona Claude com conector (ex.: Gmail). Quando a Tarefa 1 termina, `dropEndedTaskRunners` fecha o servidor HTTP `gate1` (`127.0.0.1:<porta1>`). Rodar Tarefa 2 da mesma persona com o mesmo conector.
  2. Conceder um perfil do navegador à Bia, rodar Tarefa 1, revogar o perfil em Configurações (`revokeBrowserProfile`) e rodar Tarefa 2.
- **O que acontece:**
  1. `poolKeyOf` (`resolve-runner.ts:584-599`) inclui `connectors`, mas **omite `permissionGate.url` e `carriesBrowser`**. Na Tarefa 2, `resolveRunner` devolve o runner em cache apontando para a `<porta1>` já fechada: o hook `PreToolUse` do Claude recebe `ECONNREFUSED` (tratado pelo Claude como erro não-bloqueante de hook), desligando na prática o porteiro de comandos/rascunho e quebrando o fluxo de cartões em `gate2`.
  2. `revokeBrowserProfile` e `closeBrowserProfile` não invalidam `orchestration.warmRunners`, e a chave de `warmRunners` (`orchestration.ts:2560`) não inclui o perfil de navegador — logo a Bia revogada reutiliza na Tarefa 2 o runner quente da Tarefa 1 com `mcp__browser__*` ainda conectado ao Chrome. No sentido inverso (concessão após Tarefa 1 sem navegador), `orchestration.ts:2555,2562` abre o Chrome e retorna `cached` sem chamar `browser.release()`, vazando a trava de vez.
- **O que deveria acontecer:** Runners com `permissionGate` efêmero por Tarefa nunca podem ser cacheados sob chave sem o gate/ticket, e qualquer mudança de concessão/fechamento de navegador deve despejar e encerrar o runner quente.
- **Correção sugerida:** Nunca pôr em `defaultRunnerPool` (ou incluir `permissionGate.url` e `carriesBrowser` em `poolKeyOf` + remover do pool ao fechar o gate); incluir o estado/perfil do browser na chave de `warmRunners`, mover `browserOf` para depois do hit de cache (ou liberar o lease no hit) e chamar `evictWarmRunners` em `revokeBrowserProfile`/`closeBrowserProfile`.

---

### P0-06 · `steer` e `whenIdle` quebrados em todos os runners reais: `"Direcionar agora"` perde a mensagem do usuário, e mensagem no meio do trabalho fecha as ferramentas MCP do turno ativo
- **Arquivos:** `packages/persona/persona-runners/src/resolve/resolve-runner.ts:309-390,399-424,746-767`, `packages/persona/persona-runners/src/oar/session.ts:129,149,178-199,218-229,242`, `packages/persona/persona-runners/src/oar/adapter.ts:727-732`, `packages/persona/persona-host/src/working-control.ts:154-160`, `packages/persona/persona-host/src/orchestration.ts:1465-1473`.
- **Passos para reproduzir:**
  1. Com uma Tarefa real rodando no Claude/Codex, clicar em **"Direcionar agora"** e enviar um ajuste.
  2. Ou digitar uma mensagem complementar diretamente no canal enquanto a Tarefa roda (`absorb`).
- **O que acontece:**
  1. `resolveRunner` envolve `createOarRunner` em mais de 10 wrappers (`withDefaultPermission`, `withPersonaEffort`, `withEngineConnectorPolicy`, `withToolLevel`, `withPermissionReport`, `withInfraRecovery`, `withAccountLimit`, `withUsageMeter`, `withQuotaRecheck`, `withChoiceReport`, `withNativeGate`) e **nenhum deles repassa o método `steer`**. Logo `options.turn.steer` em `createOarSessionRunner` é **sempre `undefined`** em produção.
  2. Em `"Direcionar agora"`, `absorb` (`orchestration.ts:1465`) ignora o evento `steer:...` assumindo que `workingControl.steer` cuidará dele; em seguida `runner.steer(...)` (`oar/session.ts:222`) vê `options.turn.steer === undefined` e retorna `false` — **a mensagem do usuário desaparece sem ir ao CLI nem entrar na fila**.
  3. Numa mensagem normal absorvida (`deliver(..., 'queue')` sem `await`), `oar/session.ts:178` pula o ramo `steer` e chama `runTurn` **concorrentemente sobre a sessão ocupada**: `adapter.ts:731` executa `closeToolSet(previous)` **fechando as ferramentas MCP da Tarefa 1 no meio do voo**, sobrescreve `live.handle` e, ao falhar por sessão ocupada, limpa `live.handle` e marca `live.status = 'idle'` enquanto a Tarefa 1 continua rodando sem poder ser cancelada. Além disso, `whenIdle: () => Promise.resolve()` (`oar/session.ts:242`) continua sendo um no-op.
- **O que deveria acontecer:** Todos os wrappers de `Runner` devem preservar `steer`; se o motor não aceitar `steer` ao vivo (ou se `live.handle` ainda estiver abrindo), `deliver` deve enfileirar para rodar após o turno atual jamais abrindo segundo `runTurn` concorrente, e `whenIdle` deve aguardar a promessa real do turno em voo.
- **Correção sugerida:** Encaminhar `...(inner.steer === undefined ? {} : { steer: (h, id, t) => inner.steer!(h, id, t) })` em todos os wrappers de `persona-runners`; em `oar/session.ts`, quando `live.status === 'running'` e `steer` não for aceito/disponível, empurrar para `live.dropped` (fila pós-turno) em vez de chamar `runTurn`, e rastrear a `Promise` ativa para `whenIdle`.

---

### P0-07 · `withThreadResume({ shared: true })` vaza histórico entre DMs privadas, canais, `/lado`, `fanout`, opiniões e indicadores
- **Arquivos:** `packages/persona/persona-host/src/runner.ts:288`, `packages/persona/persona-runners/src/oar/thread-resume.ts:28-42`, `packages/persona/persona-runners/src/oar/adapter.ts:684-693`, `packages/persona/persona-host/src/orchestration.ts:2560`.
- **Passos para reproduzir:**
  1. Conversar com uma persona numa DM privada (`dm:<membroA>`) passando informação confidencial.
  2. Em seguida, outro membro (ou o chat público `#geral`) conversa com a mesma persona no mesmo projeto.
- **O que acontece:**
  1. `orchestration.warmRunners` guarda um único runner `talk` por `(projectId, persona.id)` e `runner.ts:288` ativa `withThreadResume(turn, { shared: true })`, fixando `threadKey = ''` para **todas** as conversas. O processo CLI vivo / `--resume` compartilha o mesmo histórico nativo entre `#geral`, todas as DMs privadas, conversas de tarefa, `/lado`, `fanout` e indicadores (causando também colisão concorrente quando um indicador atualiza durante uma conversa).
  2. Em `adapter.ts:688`, se `--resume` falhar com qualquer erro cujo `error.name !== 'SessionNotFoundError'` (ex.: sessão corrompida, troca de `cwd` no OpenCode), `thread-resume.ts` nunca apaga o ID inválido de `native`, envenenando todos os turnos seguintes daquela persona até reiniciar o app.
- **O que deveria acontecer:** Cada `streamId` (`channel:<id>`, `dm:<id>`, `aside`, `fanout`, `indicator:<id>`) deve ter chave de sessão/resumo isolada, e falhas ao reabrir `--resume` devem descartar o `sessionId` guardado.
- **Correção sugerida:** Usar o `sessionId` da conversa (`talk:<streamId>`) como chave em `withThreadResume` (`shared: false`, passando o `streamId` real em vez de `talk-${event.id}` por mensagem) e limpar `native.delete(key)` quando `openSession` com `resume` falhar.

---

### P0-08 · Reserva aos 95% da janela (`holdForWindow`, Item 10) descarta silenciosamente todos os trabalhos enfileirados após qualquer resposta rápida ao dono
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:1850-1913`, `packages/persona/persona-host/src/window-reserve.ts:134-145`.
- **Passos para reproduzir:**
  1. Com a janela de 5h em 95% (`reserve.state === 'reserve'`), o dono pede um trabalho (`"Monte o balanço da semana"`, `seq = 10`). O host guarda na `WindowResumeQueue` (`sinceSeq = 10`).
  2. Minutos depois, aproveitando os 5% reservados para conversas curtas, o dono pergunta `"Qual o horário de amanhã?"` ou `"como tá indo?"` (`seq = 12`), recebendo `coord-<id>-reply` ou `coord-<id>-status`.
  3. A janela renova (ou o dono clica em `"Continuar agora"`).
- **O que acontece:** `releaseWindowQueue` chama `conversationResolved`, que retorna `true` porque existe uma mensagem humana com `seq > row.sinceSeq` que recebeu `hasFinalLine === true` (`reply`/`status`/`pause`). O host executa `queue.drop(projectId, row.conversationId)` **apagando permanentemente o pedido de trabalho enfileirado sem jamais rodá-lo**. Além disso, se handoffs de colegas (`[[handoff:...]]`) e pedidos humanos caírem juntos na fila, `releaseWindowQueue` (`linhas 1898-1908`) perde `firstDelivery` das subtarefas e cola marcadores crus no texto.
- **O que deveria acontecer:** Responder uma dúvida rápida nos 5% finais jamais pode apagar pedidos de trabalho retidos na fila daquela conversa.
- **Correção sugerida:** Verificar resolução individual por `eventId` retido (`row.eventIds.every(id => hasFinalLine(id))`) ou separar a fila de trabalhos retidos de respostas rápidas de conversa, reprocessando cada evento retido com sua rota original.

---

### P0-09 · Cofre v2 e H15b/H15c: colisão de `id` sobrescreve segredo de webhook/conector, migração mantém segredos em backups/revisões/exportação ZIP e `connector-policy` viola `acesso ⊆ dono`
- **Arquivos:** `packages/persona/persona-host/src/cofre-entries.ts:139-160,198-206`, `packages/persona/persona-host/src/cofre-migrate.ts:74-85`, `packages/persona/persona-store/src/store.ts:396-401`, `packages/persona/persona-host/src/export-md.ts:102-107,140-143`, `packages/persona/persona-host/src/cofre-secrets.ts:33-40`, `packages/persona/persona-host/src/connector-policy.ts:57-63`, `packages/persona/persona-host/src/index.ts:1568`.
- **Passos para reproduzir:**
  1. Chamar `saveCofreKey` passando `id: 'connector:github.webhook.secret'` (ou `id: 'connector:imap'`, `id: 'default'`).
  2. Atualizar um banco com tokens antigos (incluindo um token já rotacionado/revogado) e chamar `exportProject`.
  3. Conceder a uma persona um conector com `access: 'read'` ("só leitura") e mandar um pedido no chat (ou um membro convidado mandar mensagem no `#geral`).
- **O que acontece:**
  1. `saveCofreLogin`/`saveCofreKey` aceitam `request.id` arbitrário da rede no mesmo namespace `(COFRE_OWNER, projectId, id)` usado por `connector:*` e `code:*`, permitindo a qualquer escritor do projeto sobrescrever ou apagar o segredo HMAC do webhook GitHub (forjando entregas) ou credenciais de conector; `id: 'default'` perde o slot em `vault.ts:45`.
  2. No boot, `openPersonaStore` cria backup `VACUUM INTO` **antes** de `CofreMigration` rodar; a migração só limpa 1 linha `active` (`findActiveFact`), deixando linhas `revoked` e `vault_version` em texto claro no SQLite e vazando tokens Telegram/Discord/IMAP/webhook em claro no `.zip` de `exportProject`.
  3. `connector-policy.ts:58-62` só checa `grant?.access !== 'write'` quando `origin === 'initiative'`: num pedido de chat (`origin === 'request'`), uma persona restrita pelo dono a **só leitura** recebe pré-autorização para `'change'` (e `'send'` se `autonomy === 'act'`), e `isHuman` (`index.ts:1568`) aceita qualquer membro/convidado como autorizador dos conectores pessoais do dono.
- **O que deveria acontecer:** Segredos de entradas do Cofre devem usar prefixo reservado (`entry:<uuid>`) e exigir papel `owner`; a migração deve purgar todas as linhas/versões (`active` e `revoked`) de `SECRET_FACT_KEYS` e nunca exportar chaves de conector em Markdown; nenhuma persona pode ultrapassar `grant.access === 'read'` nem usar conector do dono por ordem de não-dono.
- **Correção sugerida:** Validar/prefixar IDs de `CofreEntries` bloqueando `connector:*`, `code:*` e `default`, exigir `requireGovOwner` nas mutações do Cofre, purgar todas as linhas/versões com `fact_key IN (...)` antes de backups/exports, filtrar `SECRET_FACT_KEYS` em `export-md.ts`, respeitar `grant.access === 'read'` em todos os `origin` em `connector-policy.ts` e restringir autorização implícita de conector pessoal ao `owner`.

---

### P0-10 · "Segure para aprovar", Editar e Desfazer (Item 5): crash `TypeError` ao salvar edição, falhas engolidas fingindo `"Desfeito"`, campos ocultos (`bcc`/anexos) aprovados às cegas e cartões mortos em DMs e Aprovações
- **Arquivos:** `packages/persona/client-ui-persona/src/client/remote/persona-live-store.ts:1271-1304`, `packages/persona/client-ui-persona/src/client/chat/ActionPreviewCard.tsx:213,270`, `packages/persona/persona-host/src/external-actions.ts:236-248,294-306`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:835-850`, `packages/persona/client-ui-persona/src/client/remote/ConnectedDirectMessagesView.tsx:194-267`, `packages/persona/persona-host/src/index.ts:3172-3182`.
- **Passos para reproduzir:**
  1. Num cartão de ação externa no `#geral`, clicar em **Editar**, ajustar o texto e clicar em **Salvar e enviar**.
  2. Clicar em **Desfazer** após 5 minutos (ou quando o alvo já mudou).
  3. Abrir a tela **Aprovações** ou pedir ação externa / ação interna reversível numa **DM**.
- **O que acontece:**
  1. `ActionPreviewCard.tsx:270` envia `edited: { subject, body }` (objeto) via `persona-live-store.ts:1293` (`as unknown as`), enquanto `external-actions.ts:237` executa `(request.edited ?? '').replace(...)` esperando `string` — lançando `TypeError` no host.
  2. `persona-live-store.ts:1276,1284,1294` não passa o retorno por `unwrapRemote`: como o protocolo Typert devolve `{ ok: false, error }` sem rejeitar a Promise, a UI marca `"Desfeito"` em `ActionEventLine` ou trava/fecha sem mostrar erro mesmo quando o host recusou!
  3. `RemoteApprovalsPanel` (`lumen-remote-panels.tsx:835-850`) e `ConnectedDirectMessagesView` (`linhas 194-267`) não passam `onDecideAction` nem `onUndoAction`: cartões de ação ficam sem botões em Aprovações e nas DMs, e ações feitas em DM não têm botão Desfazer em lugar nenhum.
  4. `cardOf` (`external-actions.ts:294-306`) omite `cc`, `bcc`, `attachments` e fatia `items.slice(0, 20)` / `clip(to, 300)` sem marcar `truncated: true`, aprovando `argsHash` com destinatários/anexos invisíveis; marcar `"Não perguntar de novo"` (`ActionPreviewCard.tsx:213`) desliga o segure de 1,2s já no 1º clique; e desfazer `board_card_move` chama `host.moveTicket` disparando execução de modelo indesejada (`startFromBoard`).
- **O que deveria acontecer:** Editar deve funcionar de ponta a ponta; falhas do host devem exibir erro real; Aprovações e DMs devem ter exatamente os mesmos controles do `#geral`; qualquer campo não exibido na prévia deve marcar `masked/truncated: true`; o 1º envio nunca pode pular o segure de 1,2s.
- **Correção sugerida:** Tipar `decideApproval` sem `as unknown as`, serializar/aceitar `{ subject, body }` no host, aplicar `unwrapRemote` + checar `undone === true` em `persona-live-store.ts`, ligar `onDecideAction`/`onUndoAction` em `RemoteApprovalsPanel` e `ConnectedDirectMessagesView`, manter `HoldToApproveButton` mesmo com `remember === true`, marcar `truncated: true` para chaves extras/cortes em `external-actions.ts` e mover o cartão direto no repositório em `ActivityUndo` sem acionar `startFromBoard`.

---

### P0-11 · Conector IMAP (Item 19b): injeção de comandos via `\r\n` em `quote()`, OOM em anexos grandes (`BODY.PEEK[]`), bypass do filtro `From:` e falta de leitura do greeting
- **Arquivos:** `packages/persona/persona-runners/src/sources/imap.ts:43-56,88-107,214-239`, `packages/persona/persona-runners/src/sources/email-filter.ts:47-54`.
- **Passos para reproduzir:**
  1. Configurar caixa IMAP com nome de pasta/usuário contendo `\r\n` (ex.: `INBOX"\r\na9 SELECT INBOX\r\na9 STORE 1:* +FLAGS (\\Deleted)\r\na9 EXPUNGE\r\nx "`).
  2. Receber um e-mail com anexo de 50–100 MB na caixa monitorada, ou um e-mail de `"cliente@parceiro.com.br" <atacante@externo.com>` com regra `De quem: parceiro.com.br`.
- **O que acontece:**
  1. `quote()` (`imap.ts:237-239`) escapa apenas `\` e `"`, aceitando `\r` e `\n` e permitindo injetar comandos destrutivos (`SELECT`/`STORE`/`EXPUNGE`) na sessão IMAP.
  2. `openReadOnly` (`imap.ts:95-96`) envia `a1 CAPABILITY` sem consumir a linha inicial `* OK` do servidor; `UID SEARCH ALL` baixa todos os UIDs da caixa a cada 5 min; e `UID FETCH ${uid} (BODY.PEEK[])` carrega o MIME inteiro com todos os anexos binários em RAM antes de cortar 4.000 chars, derrubando o host por OOM.
  3. `matchesAddress` (`email-filter.ts:47-54`) faz `.includes()` sobre o cabeçalho `From` bruto inteiro em vez do endereço extraído entre `<...>`, permitindo falsificar remetente pelo nome de exibição.
- **O que deveria acontecer:** Rejeitar `\r`/`\n`/caracteres de controle antes de enviar comandos IMAP, ler o greeting inicial, buscar apenas cabeçalhos + parte textual limitada (`BODY.PEEK[HEADER]` + `BODY.PEEK[TEXT]<0.32768>`), impor timeout total de sessão e validar apenas o endereço real do remetente/destinatário.
- **Correção sugerida:** Lançar erro em `quote()` se `[\r\n\u0000]` estiver presente, aguardar o greeting `* OK` em `openReadOnly`, limitar bytes em `UID FETCH` + `ImapSession`, restringir `UID SEARCH` aos últimos dias/sequência (`*` window) e extrair o addr-spec RFC 5322 antes de comparar em `matchesAddress`.

---

### P0-12 · Processos órfãos no Windows (`chrome.exe`, `claude`, `powershell.exe`) ao encerrar/evictar e em `"Assumir controle"`, mais crash `ENOENT`/`EPIPE` sem listener `'error'`
- **Arquivos:** `packages/persona/persona-runners/src/oar/session.ts:156-248`, `packages/persona/persona-host/src/index.ts:940-944,1676-1694`, `packages/persona/persona-host/src/browser/launch.ts:133`, `packages/persona/persona-runners/src/oar/claude-control.ts:45-95`, `packages/persona/persona-host/src/station/power.ts:47-61`.
- **Passos para reproduzir:**
  1. Enquanto uma persona opera um perfil Chrome, clicar em **"Assumir controle"** (`takeBrowserProfile`), ou fechar o app Persona no Windows com Chrome/Estação abertos.
  2. Iniciar o host num Windows onde o binário `claude` falha no spawn/fecha stdin rápido durante `connectorBridge.refresh()`.
- **O que acontece:**
  1. `createOarSessionRunner` não implementa `dispose()`. Em `"Assumir controle"` (`index.ts:942` → `evictWarmRunners`), `Reflect.get(runner, 'dispose')` é `undefined`: **o processo `claude` e o `chrome-devtools-mcp` da persona continuam vivos clicando e digitando na janela Chrome do usuário**.
  2. No encerramento do `PersonaHost` (`index.ts:1676-1694`), nunca são chamados `await this.browser.closeAll()`, `this.station.setRunning(false)` nem `backgroundWork.whenIdle()`, deixando árvores `chrome.exe` e `powershell.exe` (`Start-Sleep -Seconds 2147483` bloqueando suspensão do Windows) órfãs; e `browser/launch.ts:133` usa `child.kill()` simples em vez de `taskkill /T /F` no timeout de boot.
  3. `openClaudeControl` (`claude-control.ts:45-95`) e `PowerKeeper` (`station/power.ts:51`) não registram `child.on('error')` nem `child.stdin.on('error')`, derrubando o processo Host inteiro com exceção não tratada em `ENOENT`/`EPIPE`.
- **O que deveria acontecer:** `"Assumir controle"` deve cancelar imediatamente o turno ativo e matar o processo CLI/MCP da persona; o shutdown do host deve fechar todos os Chromes, liberar `SetThreadExecutionState` e aguardar trabalhos destacados; nenhum `spawn` pode ficar sem handler de `'error'`.
- **Correção sugerida:** Expor e encadear `dispose()` em `createOarSessionRunner` cancelando sessões ativas e fechando processos OAR; chamar `await this.browser.closeAll()`, `this.station.setRunning(false)` e `await this.orchestration.backgroundWork.whenIdle()` no disposer de `PersonaHost`; usar `killTree` (`taskkill /T /F`) em `browser/launch.ts`; adicionar listeners `'error'` em `claude-control.ts` e `station/power.ts`.

---

### P0-13 · Falta de ACL de escrita/owner em `@Remote`, bypass em workspace sem membros, `pairStation` aberto a força bruta (2.000 req/10s) e teste `remote-acl-matrix.spec.ts` falso para métodos `async`
- **Arquivos:** `packages/persona/persona-host/tests/remote-acl-matrix.spec.ts:68-75,122-127`, `packages/persona/persona-host/src/index.ts:3685-3710,4463-4466,5796-5904,8279-8313`, `packages/persona/persona-host/src/remote-guard.ts:25`, `packages/persona/persona-host/src/auth.ts:24-26`, `packages/persona/persona-host/src/voice-model-host.ts:29-43`.
- **Passos para reproduzir:**
  1. Rodar `remote-acl-matrix.spec.ts` removendo toda checagem de ACL de qualquer método `@Remote async` (ex.: `saveCofreKey`, `stationView`, `closeBrowserProfile`).
  2. Como convidado/leitor chamar `forgetPlaybook`; ou criar workspace vazio (`createWorkspace` em `ACL_EXCEPTIONS`) e chamar remotes globais da máquina (`setStationRunning`, `createBrowserProfile`); ou disparar 2.000 palpites em `pairStation` / chamadas concorrentes a `ensureVoiceModel`.
- **O que acontece:**
  1. Em `remote-acl-matrix.spec.ts:71-74`, `classifyResult` intercepta qualquer Promise (`'then' in result`), descarta o resultado sem `await` e retorna `'async'`, fazendo `expect('async').not.toBe('ok')` **passar 100% verde sem testar nenhum `@Remote async` do Host**.
  2. `forgetPlaybook` (`index.ts:4463`) apaga dados com `requireProject` (leitura); `station*` e `browser*` alteram singletons globais da máquina sem `requireGovOwner` e aceitam bypass completo quando `listMembers(workspaceId).length === 0` (`index.ts:8283-8313`).
  3. `RemoteGuard` (`remote-guard.ts:25`) não inclui prefixos `save|remove|fill|take|release|rename|pair|pin|unpin|refresh|forget|answer|continue|ensure|stop|steer`, aplicando limite de leitura (`2.000/10s`) a `pairStation` (viabilizando força bruta no código de pareamento) e a `ensureVoiceModel` (sem ACL, lendo 32,4 MB síncronos e alocando ~43 MB Base64 por chamada).
- **O que deveria acontecer:** `remote-acl-matrix.spec.ts` deve dar `await` em todos os `@Remote async`; mutações de Cofre/Browser/Estação devem exigir `owner`; workspace sem membros nunca pode liberar recursos globais da máquina; `pairStation` deve ter rate-limit estrito (ex.: 5 tentativas/10 min) e `ensureVoiceModel` deve cachear/servir stream autenticado.
- **Correção sugerida:** Tornar `callAs` `async` e dar `await` na Promise em `remote-acl-matrix.spec.ts`; trocar `requireProject` por `requireWrite` em `forgetPlaybook` e `requireGovOwner` em `cofre*`/`browser*`/`station*`; bloquear retorno antecipado de `listMembers === 0` em operações de máquina; atualizar a regex `WRITE` em `remote-guard.ts` + lockout em `PairingBook`; proteger `ensureVoiceModel` contra releitura síncrona em massa.

---

### P0-14 · Criptografia E2EE (`persona-sync`, H23/F1): colisão de cabeçalho AAD/assinatura, exceção crua em chave X25519 inválida e sync ainda enviando texto claro
- **Arquivos:** `packages/persona/persona-sync/src/signature-web.ts:22-24`, `packages/persona/persona-sync/src/channel-crypto.ts:135-187`, `packages/persona/persona-host/src/remote-team.ts:250-257`.
- **Passos para reproduzir:**
  1. Selar/assinar mensagens com IDs contendo `\n` (`workspaceId = "a\nb", streamId = "c"` vs `workspaceId = "a", streamId = "b\nc"`) ou chamar `wrapChannelKey` com chave pública X25519 de zeros (`'A'.repeat(43)`).
  2. Sincronizar eventos em `RemoteTeamHost.exchange()`.
- **O que acontece:** `sealHeader` e `wrapHeader` concatenam campos variáveis com `\n` sem prefixo de comprimento nem validação, e `wrapSigned` concatena `epk + ct` sem separador; pontos X25519 de ordem baixa lançam `ERR_CRYPTO_OPERATION_FAILED` cru do OpenSSL em vez de erro tipado; e `remote-team.ts:253` ainda transmite `{ clear: JSON.stringify(...) }` em texto aberto.
- **O que deveria acontecer:** Codificação canônica sem ambiguidade (prefixo de tamanho ou JSON canônico validando ausência de separadores), rejeição tipada de chaves públicas inválidas e bloqueio de envio `{ clear }` em canais E2EE.
- **Correção sugerida:** Usar framing com comprimento explícito por campo em `sealHeader`, `wrapHeader` e `wrapSigned`, capturar/rejeitar chaves de ordem baixa em `wrapChannelKey`/`openChannelKey` com `ChannelCryptoError` e impedir fallback `{ clear }` quando o canal exigir E2EE.

---

## Bugs P1 (O usuário leigo trava, se engana ou encontra fluxo quebrado/desligado)

### P1-01 · Controlador de fim de turno (`turn-close`, Item 3) falha em 4 cenários reais: `perguntou=espera` ignorado na orquestração, ferramenta negada aceita como prova de `"Pronto!"`, `<details>` esconde `?` e conversas não passam pelo controlador
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:1064,2944-3005,3015-3095`, `packages/persona/persona-host/src/runner.ts:476-488`, `packages/persona/persona-host/src/turn-close.ts:133-139,273-279,333-350,405-418`.
- **Passos para reproduzir:**
  1. Numa Tarefa, a persona termina o texto com `"Você prefere fundo azul ou verde?"` sem chamar `persona_ask` (`closeTurn` devolve `{ kind: 'esperar-dono', motivo: 'perguntou' }`).
  2. Uma persona tenta `Write` fora do rascunho ou conector negado pelo gate e escreve `"Pronto! Já enviei!"`.
  3. A persona faz uma pergunta seguida de `<details><summary>Detalhes</summary>...</details>` (formato exigido pelo próprio Item 4) ou pergunta `"O WhatsApp (11) 91234-5678 é o número real?"`.
  4. Na conversa normal (`finishReply`), a persona diz `"Pronto, já apaguei o arquivo!"` ou pede uma senha em texto aberto.
- **O que acontece:**
  1. `orchestration.ts:2944` só trata `closing.motivo === 'segredo'`, ignorando `motivo === 'perguntou'`: a Tarefa fecha como **`ready`** em vez de `waiting`, dispara revisão automática da Lia e libera etapas dependentes do `split-chain` em cima de uma pergunta sem resposta!
  2. `tapTurn` (`runner.ts:476-488`) grava ferramentas em `capture.tools` antes da negação do gate e trata qualquer `Bash` (até `ls`) como prova de trabalho, deixando o `"Pronto!"` falso passar.
  3. `withoutMarkers` (`turn-close.ts:274`) e `pendingInStream` (`orchestration.ts:1064`) não removem `<details>...</details>` nem emojis com tom de pele: o `?` antes do rodapé técnico fica invisível e a resposta `"ok"` do dono vira apenas figurinha sem rodar o modelo; e `WANTS_THE_THING` deixa passar perguntas bobas de confirmação de telefone já informado no chat.
  4. `finishReply` nunca chama `runTurnClose`, vazando `"Pronto!"` falso e pedido de senha no chat (e fazendo streaming de jargão técnico antes de dobrar `<details>` no fim). Na 4ª tentativa de `turn-close` (`linhas 413, 417`), esgotar `roomFor` em `gaveUpWithoutTrying` ou `knownAnswerFor` cai em `{ kind: 'feito' }` em vez de `cartao-continuar`.
- **O que deveria acontecer:** `motivo === 'perguntou'` deve deixar o Ticket em `waiting` aguardando o dono; apenas ferramentas efetivamente executadas com sucesso contam como prova; `<details>` deve ser ignorado ao checar `?` final; e `finishReply` deve bloquear pedidos de segredo e promessas sem ferramenta.
- **Correção sugerida:** Tratar `closing?.kind === 'esperar-dono'` (tanto `'segredo'` quanto `'perguntou'`) como `ask = true` em `orchestration.ts:2944`; registrar em `capture.tools` somente chamadas não recusadas pelo gate e distinguir `Bash` somente-leitura; remover blocos `<details>...</details>` e `\p{Emoji_Modifier}` em `withoutMarkers`/`pendingInStream`; retornar `cartao-continuar` quando `roomFor` esgotar nas linhas 413/417; aplicar guarda de segredo/promessa vazia em `finishReply`.

---

### P1-02 · Trabalho longo (Item 12) nunca vai para segundo plano aos 4 min nos pedidos normais do usuário, e quando destaca em `driveTicket` colide com `steer`, `noteBusy` e `warmRunners`
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:883-886,1172-1186,1432,1506-1513,1968,2560`, `packages/persona/persona-host/src/background-work.ts:117-120`.
- **Passos para reproduzir:**
  1. Enviar no `#geral` ou DM um pedido de Tarefa que dure mais de 4 minutos (ou faça > 20 chamadas de ferramenta).
  2. Em uma Tarefa retomada via `driveTicket` que passe de 4 minutos, enviar outra mensagem ou clicar em `"Direcionar agora"`.
- **O que acontece:**
  1. `ingest()` (`orchestration.ts:883`) encadeia `this.settleTask(...)` direto em `this.work` **sem passar por `this.backgroundWork.run(...)`** (usado apenas em `driveTicket`, linha 1185, que ainda passa `toolCalls = 0` fixo). Assim, **nenhum pedido direto do usuário vai para o fundo aos 4 min nem às 20 ferramentas**.
  2. Quando `driveTicket` destaca uma Tarefa, `absorbingTicket` ignora `isBackground` mas `runningTicketOf` não: `"Direcionar agora"` duplica a mensagem abrindo um turno novo de frente **e** tentando direcionar o fundo; `noteBusy` continua postando `"Estou terminando..."` a cada mensagem; e uma 2ª Tarefa da mesma persona compartilha o mesmo `warmRunners` `Runner` (`TextCapture`, `usageContext` e `ActionBridge` mutáveis), corrompendo os dois turnos.
- **O que deveria acontecer:** Todo turno de Tarefa em `ingest` e `driveTicket` deve usar `backgroundWork.run` alimentado pelo contador real de ferramentas; ao ir para o fundo, a persona deve ficar livre no canal sem `noteBusy`, sem duplicar `steer` e com runner/captura isolados por `ticketId`.
- **Correção sugerida:** Envolver `settleTask` com `backgroundWork.run` também em `ingest()`, notificar `backgroundWork` a cada ferramenta em `runner.ts`, filtrar `isBackground` em `noteBusy` e `runningTicketOf`, e isolar `TextCapture`/`ActionBridge`/`warmRunners` por `ticketId` enquanto houver turno em background.

---

### P1-03 · Erro, falta de login ou parada no início do streaming deixa balão `"digitando"` preso para sempre no chat
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:2026,2037-2041,3057-3073,3442,3631,3761`.
- **Passos para reproduzir:**
  1. Enviar mensagem de conversa (`finishReply`) onde a persona emite os primeiros deltas (abrindo `coord-<id>-reply` com `type: 'partial'`) e em seguida o CLI cai, devolve erro de login ou é parado com texto vazio.
  2. Recarregar ou reiniciar o aplicativo.
- **O que acontece:** `failReply` (`reportRunFailure`, linha 3442) e `finishStopped` (linha 2040) chamam `this.postAs(..., replyId, ...)` em vez de `settleReply`. Como `this.events.has(replyId)` já é `true`, `postAs` (`linha 3761`) aborta em silêncio: o erro some e o balão `partial` continua girando eternamente (inclusive após reiniciar, pois `recoverPartials` na linha 3631 só procura IDs terminados em `'-partial'`).
- **O que deveria acontecer:** O balão parcial deve ser liquidado (`events.settlePartial`) com a mensagem de erro ou cancelamento, e `recoverPartials` deve limpar qualquer evento com `type === 'partial'`.
- **Correção sugerida:** Usar `this.settleReply` em `finishStopped` e `reportRunFailure`, e buscar por `row.type === 'partial'` em `recoverPartials`.

---

### P1-04 · `ask_vault_code` (2FA, Item 15) e `browser_login` (Item 15b) são filtrados fora das personas padrão, e o cartão de 6 dígitos não existe na UI Conectada
- **Arquivos:** `packages/persona/persona-host/src/harness-turn.ts:15,71-76,85-88,103-116`, `packages/persona/persona-host/src/file-tools.ts:20,55-57`, `packages/persona/persona-host/src/cofre-2fa.ts:138-154`.
- **Passos para reproduzir:**
  1. Criar uma persona normalmente pelo app (`tools: { files: 'write' }`), dar a ela um perfil Chrome e um login no Cofre, e pedir que ela entre num portal com senha + código 2FA.
- **O que acontece:**
  1. `ask_vault_code` nunca é incluído em `harnessToolsNeeded` nem em `neededToolNames` (`harness-turn.ts:71-76`), logo nenhuma persona CLI jamais recebe a ferramenta.
  2. Para toda persona padrão (`tools: { files: 'write' }`), `gatewayLevelOf` retorna `'none'` (`grantless === true`), e `harness-turn.ts:111` filtra `COORDINATION.has(tool.name)` — **removendo `browser_login` (e ferramentas de quadro/rotinas) de 100% das personas padrão**.
  3. Mesmo se `ask_vault_code` fosse chamado, nenhum componente em `client-ui-persona` chama `listCofreCodes`/`fillCofreCode` e nada no host chama `cofre.codes.take(...)` (que também nunca apaga o segredo em `cancel()`).
- **O que deveria acontecer:** Personas com perfil de navegador ativo devem receber `browser_login` e `ask_vault_code`, o pedido de 6 dígitos deve aparecer como cartão vivo no chat/Aprovações e preencher o código deve injetá-lo cegamente no navegador e apagar o slot.
- **Correção sugerida:** Permitir `browser_login` e `ask_vault_code` em `neededToolNames`/`productToolsOpener` quando `browserLoginOf` (ou sessão de navegador ativa) for verdadeira, ligar o cartão de 6 dígitos no chat + `BrowserLoginPorts` consumindo `codes.take`, e chamar `secrets.drop` em `cancel()`/expiração.

---

### P1-05 · Mensagem de voz e sons (Item 20) estão desligados das telas do app, bloqueados por CSP/permissão no Electron e deixam o microfone do Windows preso ligado
- **Arquivos:** `packages/persona/client-ui-persona/src/client/voice/useVoiceCapture.ts:97-170`, `packages/persona/client-ui-persona/src/client/voice/voice-send.ts:31-32`, `packages/persona/client-ui-persona/src/client/voice/voice-transcriber.ts:64-78,145-196`, `apps/desktop/src/secure-shell.ts:13-24,78`, `packages/persona/client-ui-persona/package.json:29-34`.
- **Passos para reproduzir:**
  1. Abrir qualquer conversa ou **Configurações › Aparência** procurando o botão de microfone, bolha de áudio ou controle de sons.
  2. No componente `useVoiceCapture`, iniciar gravação e trocar de canal/desmontar (ou dar duplo clique rápido enquanto `getUserMedia` aguarda permissão); ou tentar gravar/transcrever dentro do Electron (`secure-shell.ts`).
- **O que acontece:**
  1. Nenhum arquivo fora de `client/voice/` e seus testes importa `VoiceRecorderBar`, `AudioBubble`, `useVoiceCapture` ou `SoundsSection` — a funcionalidade inteira está invisível no app; e `sendVoiceMessage` (`voice-send.ts:31`) envia `body: ''` sem transcrição, deixando os CLIs mudos sobre o conteúdo falado.
  2. No Electron, `personaPermissionRequest` (`secure-shell.ts:78`) nega `'media'` (`getUserMedia` falha sempre), `PERSONA_CSP` bloqueia `'wasm-unsafe-eval'`, `connect-src blob:` e `media-src blob:`, e `client-ui-persona/package.json:29-34` não empacota chunks dinâmicos de `import('./vosk-module.ts')`.
  3. `useVoiceCapture` não tem `useEffect` de desmontagem nem trava durante `await getUserMedia`, deixando `MediaStreamTrack` aberto (ícone de microfone do Windows aceso permanentemente) ao trocar de tela; e o timer `idle` em `voice-transcriber.ts:64-78` não é limpo ao iniciar nova transcrição, matando o worker Vosk no meio da fala.
- **O que deveria acontecer:** Integrar microfone/áudio/sons ao composer, lista de mensagens e Aparência, enviar a transcrição junto ao áudio para o host, liberar `'media'` + CSP estrita para `blob:`/`wasm-unsafe-eval` no desktop e encerrar sempre todas as tracks de áudio no unmount/erro.
- **Correção sugerida:** Ligar `client/voice/*` em `ChannelComposer`, `MessageList` e `AppearanceSettingsPanel`, incluir o texto transcrito em `sendVoiceMessage`, ajustar `secure-shell.ts` e `files` do `package.json`, limpar `idle` em `voice-transcriber.ts` e adicionar cleanup `useEffect` + guarda `inFlight` em `useVoiceCapture.ts`.

---

### P1-06 · Cartão `"Continuar"` (Item 7) some silenciosamente acima de 277 chars + erro `/s+/gu`, e `shapeSpeech` corrompe marcadores `[[escolha: ...]]` e `[[indicador: ...]]`
- **Arquivos:** `packages/persona/persona-host/src/continue-card.ts:55,82,98-114`, `packages/persona/persona-host/src/speech.ts:158,167-168,274,410-424`, `packages/persona/client-ui-persona/src/client/ask/PersonaChoiceCard.tsx:63,70-82`.
- **Passos para reproduzir:**
  1. Chamar `offerContinueCard` sem `sentenceShown` com uma frase honesta entre 278 e 470 caracteres, ou atualizar pergunta aberta com quebra de linha contendo a letra `'s'`.
  2. Persona emitir `[[indicador: {"nome": "Vendas", "valor": 120}]]`, ou emitir `[[escolha: ...]]` após ~95 palavras ou citando arquivo `.csv`/`.json`.
  3. Usuário dar duplo clique rápido numa opção de `PersonaChoiceCard`.
- **O que acontece:**
  1. `continue-card.ts:55` usa `SENTENCE_MAX = 470`, gerando até 493 chars; `normalizeAskQuestions` (`ASK_QUESTION_MAX = 300`) lança `question_too_long`, engolido no `catch` (`linha 112`), **suprimindo o cartão `"Continuar"`**. Na linha 82, `value.replace(/s+/gu, ' ')` (sem barra invertida!) apaga a letra `'s'` em vez de espaços.
  2. `shapeSpeech` trata o JSON de `[[indicador: ...]]` e nomes de arquivo em `[[escolha: ...]]` como jargão técnico (injetando crases e escondendo dentro de `<details>`), e `clipPlainWords` corta em 100 palavras no meio de `[[escolha: ...`, fazendo `readChoiceMarker` apagar o cartão inteiro achando que ainda está em streaming.
  3. `PersonaChoiceCard` sem `useRef` síncrono dispara 2 RPCs no duplo clique; o 2º recebe conflito e exibe `"Não enviado · Tentar de novo"` quando a escolha já abriu turno.
- **O que deveria acontecer:** O cartão `"Continuar"` deve respeitar o teto de 300 chars; marcadores estruturados `[[escolha:...]]` e `[[indicador:...]]` devem ser extraídos antes de `shapeSpeech`/`clipWords`; e cliques duplos devem ser ignorados.
- **Correção sugerida:** Reduzir `SENTENCE_MAX` para `277` e corrigir `/\s+/gu` em `continue-card.ts`; separar marcadores `[[...]]` antes de `shapeSpeech`/`clipPlainWords` e recolocá-los ao final; proteger `PersonaChoiceCard.send` e `PersonaAskCard.send` com `useRef(false)`.

---

### P1-07 · Cadeia dividida (`split-chain`) e `ask_colleague` (Item 1) ficam presos em `"Esperando..."` para sempre ao clicar `Parar` / `"Parar por aqui"` / `Descartar`, e `stopTicketRun` posta erro falso
- **Arquivos:** `packages/persona/persona-host/src/orchestration.ts:1516-1528,2003-2013,2840`, `packages/persona/persona-host/src/working-control.ts:235`, `packages/persona/persona-host/src/handoffs.ts:461-464,1092-1110`.
- **Passos para reproduzir:**
  1. Pedir `"texto e arte"` (abrindo cadeia Bia → Téo) e clicar em **Parar** no composer, **"Parar por aqui"** no cartão Continuar ou **Descartar** na revisão enquanto a Bia trabalha.
  2. Parar a subtarefa de um colega acionado via `ask_colleague`, ou pedir ajuste na revisão da Bia quando ela responde na volta apenas `"Ajustei o telefone"` sem repetir o texto inteiro.
- **O que acontece:**
  1. `splitProducerStopped` só é chamado em `runTicketCommand('stop')`, nunca em `workingControl.stop`, `stopByAnswer` ou `discardReview` — deixando o Téo eternamente preso em `"Esperando Bia: texto"`. Além disso, em `d232da3e00` (`orchestration.ts:2009`), `stopTicketRun` só marca `this.stopped` se `runner.status === 'running'`, postando erro `engine_unavailable` se a parada ocorrer entre o fim do stream e o relato.
  2. Parar a Tarefa de `ask_colleague` deixa `HandoffRecord.status === 'asked'` para sempre, travando quem pediu em `esperar-dono (colega-pendente)`.
  3. `keepEntrega` (`handoffs.ts:463`) sobrescreve `ENTREGA` com a frase curta de ajuste do Turno 2, apagando o texto completo do Turno 1 antes de entregá-lo ao Téo.
- **O que deveria acontecer:** Qualquer caminho de parada/descarte deve encerrar dependentes do `split-chain` e notificar handoffs `asked` pendentes sem postar erro falso; voltas curtas de revisão devem preservar a entrega anterior quando não trouxerem novo insumo completo.
- **Correção sugerida:** Centralizar a limpeza de `splitProducerStopped` e `handoffs.settled(..., 'failed')` dentro de `stopTicketRun`/`discardReview`, marcar `this.stopped.add(ticketId)` antes de `stopTicket` e preservar o texto anterior em `keepEntrega` em turnos de ajuste sem bloco substitutivo.

---

### P1-08 · Seus Números / Minha Casa (Item 19a): tempestade infinita de chamadas de IA a cada 60s quando falha, card preso em `"Atualizando…"` após reinício e alertas invisíveis
- **Arquivos:** `packages/persona/persona-host/src/indicators.ts:218,226-230,245-266`, `packages/persona/persona-host/src/index.ts:1195,8448-8451`.
- **Passos para reproduzir:**
  1. Fixar um indicador de 1h em Minha Casa; quando o horário chega, simular falha temporária ou resposta inválida do modelo.
  2. Fechar o app enquanto um indicador está com `status: 'updating'`, ou provocar queda > 20% para disparar alerta em `"Precisa de você"`.
- **O que acontece:**
  1. Ao falhar, `indicators.ts:227-228` grava `status: 'failed'` **sem atualizar `updatedAt` nem registrar backoff**. Como `indicatorTimer` roda `tick()` a cada 60s (`index.ts:1195`), `isDue` continua `true` e o host **chama o CLI da persona a cada 60 segundos indefinidamente**, queimando toda a assinatura do dono em silêncio!
  2. Se o app fechar durante `refresh()`, `status: 'updating'` fica gravado no SQLite e `tick()` (`linha 250`) pula o indicador para sempre.
  3. `indicators.alerts()` só é lido em `listAttention` (`index.ts:8449`), método que a UI nunca chama (`ConnectedOverviewView` usa `getOverview.needsYou` + `listApprovals`), logo nenhum alerta de queda jamais aparece para o dono.
- **O que deveria acontecer:** Falhas devem aplicar backoff (ou avançar `lastAttemptAt`), o boot deve recuperar `status === 'updating'` órfãos e alertas de queda devem aparecer em `getOverview.needsYou`.
- **Correção sugerida:** Gravar `lastAttemptAt` com backoff exponencial em `refresh()`, resetar `'updating'` sem `inflight` no boot/`tick()` e incluir `this.indicators.alerts(projectId)` no cálculo de `getOverview`.

---

### P1-09 · Ligar assinatura para o time inteiro (Item 13): contas nomeadas não são vinculadas às personas, modal abre travado sem contas e estado `'partial'` congela o diálogo
- **Arquivos:** `packages/persona/persona-host/src/team-connect-host.ts:49-85`, `packages/persona/persona-host/src/team-connect.ts:64-73,272-274`, `packages/persona/client-ui-persona/src/client/team-connect/TeamConnectDialog.tsx:50-70,97-109`, `packages/persona/client-ui-persona/src/client/team-connect/use-team-connect.ts:90,135-139`.
- **Passos para reproduzir:**
  1. Conectar uma conta nomeada (`AccountRepos` com `homeDir` próprio), abrir **"Ligar para todas"** e concluir.
  2. Clicar em **"Ligar para todas"** quando ainda não há nenhuma assinatura logada (`choices: []`), ou fechar o modal após uma execução `'partial'` e reabri-lo.
- **O que acontece:**
  1. `applyEngine` (`team-connect-host.ts:71-77`) muda o `cli` mas **nunca grava `active_account`** para as personas (e pula quem já tinha `cli === 'claude'`), mantendo as personas apontadas para o `home` padrão deslogado e o banner `"sem IA"` aceso; além disso, `accountsOf` esconde outros provedores logados (ex.: Codex) se houver 1 assento salvo no banco.
  2. Com `choices: []`, o modal abre em branco com botão primário desabilitado e nenhum atalho para **Configurações › Conexões**.
  3. `closeDialog` (`use-team-connect.ts:138`) não reseta `state === 'partial'`, escondendo a seleção de contas permanentemente após recarregar.
- **O que deveria acontecer:** Vincular `active_account` da conta escolhida a cada persona acordada, mesclar provedores detectados com assentos salvos, orientar/redirecionar para Conexões quando `choices` estiver vazio e permitir nova escolha após `'partial'`.
- **Correção sugerida:** Gravar `active_account` em `applyEngine` e ler o assento da persona em `peopleWithoutAi`; unir `stored` + `cards` em `accountsOf`; exibir estado guiado com botão para Conexões quando `choices.length === 0`; resetar visualização de escolha ao reabrir após `'partial'`.

---

### P1-10 · Fachadas incompletas na UI/Host: Estação Dedicada (Item 24) não controla turnos/RAM/sono, Conversa da Tarefa no Quadro (Item 18) inacessível, Perfis de Navegador (Item 17) travam vez/estado vazio e Regra de E-mail inverte `"Receber de"`
- **Arquivos:** `packages/persona/persona-host/src/index.ts:952,3748-3814`, `packages/persona/client-ui-persona/src/client/browser/ConnectedBrowserProfiles.tsx:24-30,45-68`, `packages/persona/persona-host/src/browser/service.ts:189-193`, `packages/persona/client-ui-persona/src/client/kanban/ProjectFlowBoard.tsx:187-210`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:951-1000`, `packages/persona/client-ui-persona/locale-sources/email-rule.pt.json:7`.
- **Passos para reproduzir:**
  1. Desligar a Estação (`setStationRunning({ running: false })`) e enviar tarefas, ou reiniciar após parear.
  2. Criar o 1º perfil de navegador em **Conexões › Navegador**, ou usar um perfil compartilhado na Persona A e depois tentar usar na Persona B.
  3. Clicar num cartão do Quadro Kanban para abrir a conversa da tarefa, abrir **Regras** para criar travas da casa, ou preencher o campo `"Receber de"` no formulário de e-mail (`EmailRuleForm`).
- **O que acontece:**
  1. `Station.admitTurn()` e `noteTurnEnded()` têm **zero chamadas em produção**, e `paired` fica só em RAM: desligar a estação não barra turnos nem libera suspensão do Windows, o piso de 1,5 GB de RAM nunca roda e não há componente de Estação montado nas Configurações.
  2. Em `ConnectedBrowserProfiles.tsx:29`, criar o 1º perfil mantém `state === 'empty'` (`"Nenhum perfil ainda"`) porque lê `state.data` antigo em vez de `view`; as 7 mutações de navegador no host (`index.ts:3762-3814`) esquecem `withoutBrowser`; e quando a Persona A termina Tarefa sem conectores, seu runner quente nunca chama `browser.release()`, prendendo `openers` (`service.ts:190-193`) e bloqueando a Persona B com `'busy'` para sempre.
  3. `TaskConversationPanel` não é importado em nenhum lugar do app (clicar no cartão Kanban não abre conversa); `RemoteRulesPanel` esconde as 5 travas `HouseRuleKind` e janelas de silêncio; `EmailRuleForm` não tem campos para salvar/testar senha IMAP, e `email-rule.pt.json:7` traduz `"to.label"` (destinatário `filter.to`) como **`"Receber de"`** (remetente!), fazendo o leigo cadastrar o e-mail do cliente no campo errado e a regra nunca disparar.
- **O que deveria acontecer:** Cada item entregue deve funcionar de ponta a ponta na tela real, liberar a vez do perfil compartilhado ao encerrar o turno e rotular `to.label` como `"Para (destinatário)"`.
- **Correção sugerida:** Ligar `station.admitTurn`/`noteTurnEnded` na execução de turnos e persistir pareamento; ler `view.profiles.length` em `ConnectedBrowserProfiles`, devolver `this.browserView(request)` nas 7 mutações e liberar o turno do browser ao fim de cada turno de Tarefa (não só no despejo do runner); montar `TaskConversationPanel` em `ConnectedProjectFlowBoard`, habilitar `obeyed` em `RemoteRulesPanel`, ligar credencial IMAP ao `EmailRuleForm` e corrigir `email-rule.pt.json:7` para `"Para"`.

---

### P1-11 · Cofre CSV, Ficha da Empresa e Memória/Playbook (Itens 15 e 16): CSV altera senhas com espaço, Ficha apaga resumo da empresa no Segundo Cérebro, skills aprendidas não compartilham e perfil vaza memórias de DM alheia
- **Arquivos:** `packages/persona/persona-host/src/cofre-import.ts:168,216-218`, `packages/persona/persona-host/src/cofre-entries.ts:236-253`, `packages/persona/client-ui-persona/src/client/data/company-profile.ts:10-13`, `packages/persona/persona-host/src/playbook.ts:89-91,223-236`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:1049-1051`, `packages/persona/client-ui-persona/src/client/remote/ConnectedDirectMessagesView.tsx:88-98`.
- **Passos para reproduzir:**
  1. Importar CSV do Chrome/Bitwarden contendo senha com espaço nas pontas ou aspas `"` no meio de campo não escapado.
  2. Preencher `"Descrever a empresa em 3 frases"` em Memória › Resumo e depois salvar a **Ficha da empresa** (CNPJ) no Cofre.
  3. Aceitar `"Virar skill?"` após 3 usos no Playbook e tentar compartilhar com o time; ou abrir a aba Memória/Skills no perfil do Téo; ou abrir DM de uma persona pausada/em passo de ferramenta.
- **O que acontece:**
  1. `cofre-import.ts:168` aplica `.trim()` na coluna de senha (corrompendo senhas com espaço) e `linha 216` entra em modo `quoted` no meio de campo sem aspas, desalinhando colunas e senhas entre linhas.
  2. `saveCompany` grava um `brief` mais novo, e `companyProfileText` (`company-profile.ts:11`) pega o 1º `brief` ativo sem distinguir `factKey === 'company.card'`, substituindo a descrição da empresa na tela Resumo (onde o botão de editar também some).
  3. Skills do Playbook nascem com `origin: 'learned'` (`learned-pb-*`), mas a UI/Host só permite compartilhar ou reverter `taught-*`; `MemoryPanel` não tem ação `"Tornar do time"` para memórias de DM; o perfil individual (`lumen-remote-panels.tsx:1049`) lista memórias privadas de DM de **outras** personas; e `ConnectedDirectMessagesView` descarta `paused`, `quiet`, `draftFiles` e `step` (mostrando persona pausada como `"Disponível"` e escondendo o passo atual na DM).
- **O que deveria acontecer:** Preservar senhas CSV byte a byte com parser RFC 4180, separar o `brief` narrativo da `company.card`, permitir compartilhar/desativar skills aprendidas e promover memórias ao time, filtrar memórias/skills por persona no perfil e exibir estado/passo real nas DMs.
- **Correção sugerida:** Não aplicar `.trim()` na senha em `cofre-import.ts` e só abrir `quoted` quando `field === ''`; ignorar `factKey === 'company.card'` ao ler o texto livre de `companyProfileText` (mantendo botão Editar); aceitar `origin: 'learned'` em `SkillsPanel`/`publishTaughtSkill`; filtrar `listMemory`/`listSkills` por `personaId` no perfil e copiar `paused`, `quiet`, `draftFiles` e `step` em `ConnectedDirectMessagesView`/`DirectMessagesView`.

---

### P1-12 · Janela de Silêncio deslocada em 3h no Brasil (UTC vs hora local) e `ProactivityScheduler` preso ao `Date.now()` real
- **Arquivos:** `packages/persona/persona-host/src/proactivity.ts:628-649`, `packages/persona/persona-host/src/index.ts:956,985,1042,1341,1433`, `packages/persona/persona-host/src/proactivity-scheduler.ts:298,324,372,428,528-532`.
- **Passos para reproduzir:**
  1. Configurar horário de silêncio das `22:00` às `08:00` num computador no fuso de Brasília (`UTC-3`) e enviar/rodar iniciativa às `19:30` locais (`22:30Z`).
  2. Avançar o relógio injetado do host (`orchestration.now`) ou ter uma rotina adiada na reserva de 95%.
- **O que acontece:**
  1. `inSilence` e `silenceUntilOf` (`proactivity.ts:628-649`) fatiavam `iso.slice(11, 16)` direto de `.toISOString()` (UTC!) sem aplicar `timezoneOffsetMinutes`, ativando o silêncio às 19h e desligando às 5h da manhã no Brasil (mesmo bug de dia UTC em `playbook.ts:90`).
  2. `createProactivityScheduler` (`index.ts:1341`) não recebe `nowMs: () => Date.parse(this.orchestration.now())` (assim como `ProactivityRepos`, `ScreensHost`, `HostScheduler` e `BrowserLoginPorts`), misturando `Date.now()` real com `orchestration.now()`; e `runRoutine` (`proactivity-scheduler.ts:528-532`) re-agenda a rotina a cada 30s quando retida pela janela de 95%, triplicando mensagens na fila.
- **O que deveria acontecer:** Horários humanos devem respeitar o fuso local da máquina, todo agendador/repositório deve usar o relógio único do host e rotinas retidas na fila de janela devem ser marcadas concluídas naquele ciclo sem triplicar.
- **Correção sugerida:** Aplicar `timezoneOffsetMinutes` em `inSilence`/`silenceUntilOf` e `playbook.ts:90`, injetar `() => Date.parse(this.orchestration.now())` em `createProactivityScheduler`/`HostScheduler`/`ProactivityRepos` e não chamar `defer` quando a mensagem da rotina já entrou em `WindowResumeQueue`.

---

## Bugs P2 (Incômodo, jargão residual, testes ocos/sujos e higiene de gates)

### P2-01 · Jargão técnico (`tokens`, `JSON`, `TLS`, `Brief`, `"a pessoa"`), colisão `"Cofre"` × `"Memória"` e textos fora de `ctx.locale`
- **Arquivos:** `packages/persona/client-ui-persona/locale-sources/importers.pt.json:26-27,39`, `packages/persona/client-ui-persona/locale-sources/shell.pt.json:111`, `packages/persona/client-ui-persona/locale-sources/approvals.pt.json:24`, `packages/persona/client-ui-persona/locale-sources/rules.pt.json:8-9`, `packages/persona/client-ui-persona/locale-sources/usage.pt.json:25,28,43`, `packages/persona/client-ui-persona/locale-sources/members.pt.json:40,57,62,92-93`, `packages/persona/client-ui-persona/locale-sources/knowledge.pt.json:10,15`, `packages/persona/persona-host/src/harness-vault.ts:38`, `packages/persona/client-ui-persona/src/client/indicators/indicators-text.ts:6-61`, `packages/persona/client-ui-persona/src/client/chat/ChannelComposer.tsx:1019-1021`.
- **Passos para reproduzir:** Abrir Importação de outras IAs, Busca global, Regras, Uso, Membros ou Seus Números.
- **O que acontece:** Importação e Busca ainda chamam a Memória da empresa de `"Cofre"` (colidindo com o novo Cofre de senhas); telas expõem `"tokens"`, `"JSON"`, `"TLS"`, `"Brief"` e `"a pessoa"` (inclusive `harness-vault.ts:38` instruindo o modelo a dizer `"Peça à pessoa"`); e `indicators-text.ts`, `ChannelComposer.tsx:1019` e `ConnectedCofre`/`ConnectedBrowserProfiles`/`ConnectedStation`/`EmailRuleForm` usam dicionários PT fixos sem passar por `ctx.locale`.
- **O que deveria acontecer:** Vocabulário 100% cotidiano e consistente (`"Memória da empresa"` para notas, `"Cofre"` só para senhas/ficha, `"você"` em vez de `"a pessoa"`) registrado em `ctx.locale`.
- **Correção sugerida:** Trocar `"Cofre"` por `"Memória da empresa"` em `importers.*` e `shell.*`, remover `"tokens"`/`"JSON"`/`"a pessoa"` dos textos voltados ao leigo e registrar `indicators`, `browser`, `email-rule`, `station` e `cofre` em `ctx.locale`.

---

### P2-02 · Arquivos `.red.ts` / `*-red*.spec.ts` na suíte, testes ocos, falha em clone limpo (`persona-assets` fora do git) e Eval da Padaria Lua passando sem `--strict`
- **Arquivos:** `packages/persona/persona-host/tests/acceptance-parar-sem-erro.red.ts:1-47`, `packages/persona/persona-host/tests/acceptance-item1-falhas.host.spec.ts:72-73`, `packages/persona/persona-host/tests/team-connect.host.spec.ts:87-94`, `packages/persona/client-ui-persona/tests/ui-glyphs-brush.client.spec.tsx:15-26`, `packages/persona/persona-e2e/tests/eval-padaria-fake.spec.ts:35-39`, `packages/persona/persona-e2e/tests/eval-padaria-scenarios.spec.ts:30`, `packages/persona/persona-e2e/src/team-round-driver.ts:52,67-71`.
- **Passos para reproduzir:**
  1. Rodar `vitest` num clone limpo de `d232da3e00`, ou rodar `eval-padaria-scenarios.spec.ts` e `node scripts/persona/eval-padaria.mjs` (sem `--strict`).
- **O que acontece:**
  1. `acceptance-parar-sem-erro.red.ts` nunca é coletado pelo Vitest; `team-connect.host.spec.ts:87-94` cria `'cris'` (`member`) mas chama `connectTeam` como `owner` sem testar a recusa; `acceptance-item1-falhas.host.spec.ts:72` faz `expect(['waiting', 'blocked']).toContain(...)` (sempre verde).
  2. `ui-glyphs-brush.client.spec.tsx:25` e `scripts/persona/build-assets.mjs:14` falham em qualquer clone limpo porque `persona-assets/` ficou fora do commit.
  3. No Eval da Padaria Lua, sem `--strict` o script sai com código `0` mesmo falhando 0/3 nas regras; `eval-padaria-scenarios.spec.ts:30` falha nos cenários `'barrado'` (`missed` não-vazio por desenho); e o fake driver escreve `"2 por R$ 9"` estático tanto no texto da Bia quanto no `ART_SVG` do Téo, aprovando `bia-text` mesmo sem passagem real do texto.
- **O que deveria acontecer:** Zero `.red.ts` esquecido, clone limpo 100% verde, asserções determinísticas e eval estrito por padrão validando insumo dinâmico real entre Bia e Téo.
- **Correção sugerida:** Converter `acceptance-parar-sem-erro.red.ts` em `.host.spec.ts` com `await`, testar `sessionMemberId = 'cris'` em `team-connect.host.spec.ts`, versionar `persona-assets/` (ou ajustar o teste aos SVGs embarcados em `client-ui-persona`), ligar `strict: true` e `--d100` por padrão no eval com frase dinâmica gerada por execução e corrigir a asserção de `'barrado'` em `eval-padaria-scenarios.spec.ts`.

---

### P2-03 · Pontos cegos em `check-cleanroom.mjs`, `crypto.randomUUID` quebrando LAN HTTP (dívida de `oxlint`) e pacote errado em `runtime-file-policy.ts`
- **Arquivos:** `scripts/persona/check-cleanroom.mjs:37-45,129-142,386,401-410`, `packages/persona/client-ui-persona/src/client/ask/persona-asks-remote.ts:64`, `packages/persona/client-ui-persona/src/client/data/lumen-remote-panels.tsx:480,537,1337,1338`, `packages/persona/client-ui-persona/src/client/remote/ConnectedGlobalKanban.tsx:205`, `packages/persona/client-ui-persona/src/client/remote-team/ConnectedRemoteTeamPanel.tsx:198`, `packages/persona/client-ui-persona/src/client/second-brain/SecondBrainShell.tsx:142`, `apps/desktop/scripts/runtime-file-policy.ts:16`.
- **Passos para reproduzir:**
  1. Rodar `scripts/persona/preaccept.mjs` (não chama `check-cleanroom.mjs`) ou testar nomes compostos como `answerAskChoices` (`persona-asks-remote.ts:64`), `useJev` ou texto solto em JSX `<p>...</p>` em `check-cleanroom.mjs`.
  2. Abrir o cliente web via IP da LAN/Tailscale em HTTP puro e acionar ações que chamam `crypto.randomUUID()`, ou empacotar no macOS com `runtime-file-policy.ts`.
- **O que acontece:**
  1. `check-cleanroom.mjs` não está integrado em `preaccept.mjs`/`package.json`, trata `NAME_RULES` apenas como aviso (`exit 0`) sem `/i` nem detecção de camelCase (deixando passar `answerAskChoices` em `persona-asks-remote.ts:64` e `use-connected-persona-asks.ts:12`), ignora texto JSX fora de aspas e falha aberto (`ok: true`) quando o clone não existe na máquina.
  2. Sete pontos novos em `client-ui-persona` usam `crypto.randomUUID()` (restrito pelo `oxlint` porque lança erro fora de Secure Context em HTTP LAN).
  3. `runtime-file-policy.ts:16` exclui `'@deepseek-ai/dsh-cua-macos'` em vez do nome real `'@deepseek-ai/dsh-experimental-cua-macos'`.
- **O que deveria acontecer:** `check-cleanroom.mjs` obrigatório no pré-aceite bloqueando camelCase/JSX/`AGPL`, zero erro de `oxlint` nos arquivos do commit e nome exato do pacote em `PERSONA_EXCLUDED_PACKAGES`.
- **Correção sugerida:** Integrar `check-cleanroom.mjs --strict-names` em `preaccept.mjs` detectando fronteiras camelCase (`answerAskChoices` → `answerChoiceCard`) e nós de texto JSX, substituir `crypto.randomUUID()` pelo gerador seguro de ID do cliente, zerar os 44 erros de `oxlint` e corrigir `'@deepseek-ai/dsh-experimental-cua-macos'` em `runtime-file-policy.ts:16`.

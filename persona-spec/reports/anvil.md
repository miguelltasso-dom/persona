# Relatos — Anvil (persona-store / persona-host)

Mais recente no topo. Dono: store, host, sync, `apps/persona-edge`.

---

## 03/11 17:20 — P0 inject + pasta/webhook/dead-letter/export + 1ª resposta real

### P0 — host volta a ativar (bloqueava Muse)

Causa: `runnersOf` / `webserverOf` liam `ctx.personaRunners` / `ctx.webserver` no construct. Cordis (`vendor/cordis/src/reflect.ts`) lança `cannot get property "…" without inject` se a chave não está no `inject` do fiber. Colocar as chaves no `static inject` as torna **obrigatórias** (fiber PENDING até existirem) — testes e perfis sem o plugin não ativam.

Correção (sintaxe confirmada no vendor): `static inject = ['typert']` só o obrigatório. Opcionais via `ctx.get('personaRunners')` e `ctx.get('webServer')` (`ReflectService.get` — sem a guarda de inject). `usedPersonaRunners` é getter ao vivo. `hostRunnerFromContext` relê o plugin a cada resolve. `cordis.patch.yml` **não mudou** (ordem já é persona-runners → persona-host).

Spec `host-inject.spec.ts`: `ctx.plugin(PersonaHost)` **com e sem** `PersonaRunners` — os dois ativam (`ping` ok).

Boot real (home limpo, sem `PERSONA_DEV_SEED`):

```
node scripts/persona/with-lock.mjs "Anvil host boot" --release-on "dsh web:" -- node scripts/persona/ui-boot-check.mjs
[channel] … #geral … O canal está quietinho …
console errors (0):
(none)
```

Muse: `maestri ask "Muse" "host ok"` falhou — Muse **não** está no canvas (`maestri list` só Atlas/Keel/Forge/Prism/Probe). Recado no Status.

### 1. Primeira resposta real (o que quebrou)

App-host inject: `usedPersonaRunners: true`. Native `claude auth status`: loggedIn max. `listConnections` com `timeoutMs: 400` dá **falso** `not_logged_in` (auth do Claude ~5 s). Probe 8 s: loggedIn true.

`PERSONA_REAL_CLI=1`, temp `PERSONA_HOME`, Coordenação `cli/claude/haiku`, 2 execs. SQLite:

- `coord-m-hi-reply` = `Not logged in · Please run /login` (texto **real** do OAR, `tapTurn` persistiu)
- tarefa `preciso de um README`: `doing` → `review` (ack + Em andamento + done)
- outbox ainda postou o scripted `Olá — em que posso ajudar?`

OAR com `home: <PERSONA_HOME>/runners/<projectId>` **não** herda o login nativo (`~/.claude`), apesar de `restoreNativeCliLogin`. Erro tipado chegou à UI como corpo da mensagem, não como `RunnerResolveError`. Probe: `maestri ask` E2E timeout (o pedido pode ter chegado).

### 2. Pasta do projeto

`setProjectRoot` / `getProjectRoot`: absoluto, existe, diretório; recusa UNC (`\\` / `//`), raiz (`C:\`, `/`), home inteira, overlap/aninhamento. Git: `isRepo`, `defaultBranch` (`origin/HEAD` ou `symbolic-ref HEAD`), `dirty`. pt-BR. `pickDirectory()` = `{ path: null }` (Rivet). Testes: pasta com espaço/acentos; UNC; home.

### 3. Webhook GitHub local

`POST /api/persona/webhooks/github?projectId=` — HMAC SHA-256, corpo ≤ 256 KiB, replay 5 min (`200 {kind:duplicate}`), `202` depois `ingest`. Segredo: `PERSONA_GITHUB_WEBHOOK_SECRET` ou Cofre `factKey=github.webhook.secret` (nunca em log). Relé Cloudflare = Atlas.

### 4. Dead-letter

Efeito/outbox falha 3× → `listDeadLetters` (`Tentar de novo` / `Descartar`) + `getOverview.needsYou`. `retryDeadLetter` reprocessa outbox; `discardDeadLetter` só some. Teste: falha → Precisa de você → retry recupera.

### 5. Exportar

`exportWorkspace` / `exportProject` → zip Markdown. DMs só com `includeDmIds`. `looksLikeCredential` redige. Cofre em `cofre/*.md`. Teste: DM ausente; `sk-ant-…` redigido.

### Arquivos

- `packages/persona/persona-host/src/{index,runner,orchestration,dead-letter,project-root,webhook-http,export-md,types,auth}.ts`
- `packages/persona/persona-host/tests/{host-inject,runner-plugin,gateway,project-root,webhook-http,dead-letter,export}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/host-inject.spec.ts …/gateway …/runner-plugin …/project-root
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  2 failed | 36 passed (38)
      Tests  2 failed | 344 passed (346)
```

Os 2 fails são resume (timeout 5 s só na suíte paralela; isolados: 3 passed).

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 16.6s
persona-store: OK in 7.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 39.3s
```

### Limitações

- `listConnections` 400 ms: falso `not_logged_in` no Claude.
- OAR + `runnerHomeOf` não vê `~/.claude`; 1ª resposta real = «Not logged in · Please run /login».
- Muse fora do canvas — «host ok» só no Status.
- `cordis.patch.yml` intocado (Keel).

---

## 03/11 16:55 — conversa + ACL + diagnostics + DB + ReviewDelivery + orçamento

### 1. Conversa no condutor
DM e `@menção` usam o mesmo laço do runner, sem Ticket quando não é trabalho. Seletor `responderId` (servidor, não o `actorId` do cliente). Resposta no fio; handoff (`Encaminhei para {nome}`; executor posta como ele). Streaming `partial` → final via `followMessages`. `cancelReply` não trava. Erro do runner: `não consegui responder: …` + ação. Relógio injetável; resume no meio do `partial`.

### 2. ACL no Remote
Todo método resolve o ator no servidor (`resolveSessionActor`: sessão local = owner, `sessionMemberId` só em teste/peer). `can()`. Exceções documentadas: `ping`, `getOnboarding`, `completeOnboarding`, `createWorkspace`, `exportDiagnostics`. Bootstrap: workspace/projeto sem membros ainda não exige ator. Guest sem projeto/DM recebe lista vazia, sem erro revelador. `actorId` do cliente não autoriza arquivos/busca/stream.

### 3. `exportDiagnostics()`
JSON: versões, schema, contagens, `lastErrors`, scheduler/Vigia, conexão `dsh` (sem spawn de CLI). Recusa se `looksLikeCredential`. Sem corpos de mensagem/DM. Probe live de CLIs fica em `listConnections`.

### 4. Versão do DB
Fixtures v1..v6 migram e preservam workspace. Banco mais novo que o app: `version-too-new` + `userMessage` pt-BR, sem down-migrate. `.db` corrompido: restaura o último `VACUUM INTO` (`recoveredFrom` + «O banco estava danificado. Restaurei o último backup.»). `migration-failed` **não** é recover (evita segundo backup e retry da migração quebrada).

### 5. ReviewDelivery (Forge) no host — Lumen **Revisar**
Remotes: `prepareReview`, `reviewSummary`, `acceptReview(mode)`, `requestChanges`, `discardReview`. Todas com `can()` + ator do servidor. Sem `rootPath` → Tarefa sem código (sem worktree). `prepare` no start da Assignment (`persona/<ticketId>`, `PERSONA_HOME/worktrees/<projectId>`). Conflito → `kind: 'blocked'` + `explanation` (engine) e kanban Bloqueado · Precisa de você; `merge --abort`. Aceite fecha a thread `review`. `sweepOrphans` no `runtime()`/resume. `GitReviewDelivery` não faz push. Contrato: `persona-spec/contracts/review-delivery.md` + `lumen-rpc.md`.

### 6. Multi-projeto
`ExecutionBudget` (global 4, por projeto 2). Projeto barulhento não esgota os outros. `runLaunched` sem vaga posta «Aguardando vaga neste projeto.» Teste: 8 projetos + cap.

### Arquivos
- `packages/persona/persona-host/src/{index,orchestration,auth,review,diagnostics,budget,types}.ts`
- `packages/persona/persona-host/tests/{conductor,remote-acl,diagnostics,review,multi-project,files,controller}.spec.ts`
- `packages/persona/persona-store/src/{store,errors,index}.ts`
- `packages/persona/persona-store/tests/migrate-fixtures.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  32 passed (32)
      Tests  338 passed (338)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 14.6s
persona-store: OK in 8.9s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.4s
```

### Limitações
- Diagnostics lista só `dsh` (CLI probe no PATH bloqueava o event loop; `listConnections` continua o probe live).
- `ctx.personaRunners.resolveRunner` ainda não injetado; `PERSONA_REAL_CLI=1` segue pelo import.
- B7 (um run mutante) já tem teste em `orchestration.spec` («keeps a single mutant run»); próximo Anvil no PLAN se o Keel não mandar outra fila.

---

## 03/11 16:10 — resolveRunner + S5 onboarding + atenção + retenção + ociosidade

### 1. `createHostRunner` → `resolveHostRunner`
Spec vem da Persona no store (`specOfPersona`). `permissionMode` explícito: `act` → `allow-once`, resto `prompt`. `autonomy` `asked` → `on_request`. Home isolado: `<PERSONA_HOME>/runners/<projectId>`. Fake/scripted salvo `PERSONA_REAL_CLI=1` — aí `resolveRunner` + `createOarSessionRunner` (TurnRunner → port de sessão). `RunnerResolveError` (`cli_not_found` / `not_logged_in` / `model_unavailable` / `quota_exhausted`) vira Report `blocked` com a mensagem pt-BR do resolvedor; login/cota postam “Precisa de você” com `loginHint` (sem stack, sem token). Testes: login e cota no conductor.

### 2. Onboarding no host (S5)
`completeOnboarding` idempotente em `store.tx`: workspace/Pessoal, owner, `#geral`, personas (`team[]` ou `createDraftDriver`+`fallbackDraft`), `cofreSeed` → `proposeMemory` (nunca Cofre direto), welcome da primeira Coordenação ou texto de sistema, `completed` no store. `getOnboarding` reflete. Contrato: `persona-spec/contracts/onboarding.md` (Prism). Teste: `PERSONA_HOME` temp → equipe Guia+Bento, kanban vazio, sem “Atlas”.

### 3. Atenção (Rivet desktop)
`getAttentionPolicy` / `putAttentionPolicy` (orçamento, silêncio, `summary`|`ping`). Stream `attentionEvents` (baseline+upsert, ≥1 s): `needs-you` (blocked) e `review`, cortados no budget; `ping` some na janela quieta. Contrato: `persona-spec/contracts/attention.md`.

### 4. Retenção no agendador
Tique diário no início da janela quieta (`02:00`–`06:00` default). Só arquiva (`archiveOnly: true`); apagar exige `archiveOnly: false` + tick. Log em `retention_log`. `get/putRetentionPolicy`, `tickRetention`, `listRetentionLog`.

### 5. Ociosidade
Sem `setInterval`. Timer único `setTimeout` ≥ 1 s alinhado ao próximo quiet start; `unref`. Sem projetos = sem timer. `attentionEvents` só dorme 1 s com cliente inscrito. Host ready (DB existente): **376 ms** (meta ≤ 1500 ms). Probe: `persona-spec/reports/bench-app.md`.

### Arquivos
- `packages/persona/persona-host/src/{runner,orchestration,onboarding,scheduler,index,types}.ts`
- `packages/persona/persona-host/tests/{conductor,onboarding,attention-retention,ready}.spec.ts`
- `persona-spec/contracts/{onboarding,attention}.md`
- `persona-spec/reports/bench-app.md` (números do host)

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  27 passed (27)
      Tests  324 passed (324)
```

```
ready.spec host-ready-ms=376
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-store: OK in 7.5s
persona-host: OK in 13.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

### Limitações
- `ctx.personaRunners` ainda não é injetado no host: resolve vai pelo import `resolveRunner`; DSH real ainda precisa de `agent` no resolvedor.
- `createDraftDriver` no onboarding e em `draftPersona`/`draftTeam` usa `createScriptedRunner` (cai em `fallbackDraft` se o turno for mudo).
- S4 host: remotes async ligadas ao driver do Rivet (`draft.ts`). 3 testes `routines-draft` verdes; typert 40 / 42.0s.
- Fila Keel 1–5 + S4 host fechadas. Próximo Anvil no PLAN: B7 (um run mutante por Tarefa).

---

## 03/11 15:54 — Fio condutor + gaps Lumen + retenção + sync local

### 1. Fio condutor real (prioridade 1)
`#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho (**sem Ticket**): resposta persistida. Pedido: Ticket `doing` → runner scriptado (`createHostRunner` = `createDefaultHostRunner`) → `review` (ou `blocked` + “Precisa de você”) → `runTicketCommand({ command: 'complete' })` → `done`. Resposta da Coordenação no SQLite; `followMessages` entrega o baseline. Reinício: Assignment interrompida retoma; id `coord-<ticket>-done` é idempotente (sem duplicar). Relógio do host é injetável (`orchestration.now`).

`resolveRunner` **não** trocado: Rivet ainda não avisou no Status. `listConnections` já chama `detectConnections()` (timeout 400 ms, cache 60 s).

### 2. Gaps Lumen
Contrato: `persona-spec/contracts/lumen-rpc.md`.
- `listCanvas` — personas + tickets
- `listDailySummaries` — propostas do dia por persona
- `listRoutineSchedule` — rotinas + runs do agendador
- `listTriageLog` — trilha por thread (gate, assessment, quem, por quê)
- Arquivos: `status: 'need-root'` + `message: "escolha a pasta do projeto"` (não lança); `setProjectRoot`

### 3. Retenção
Schema v6. `SqliteRetention` + `applySqliteRetention` (mesma `applyRetention` do Forge + VACUUM). Arquivar ≠ apagar; excluir recusado com derivados; índice/cache somem. Suíte `defineRetentionSuite(..., 'sqlite')`.

### 4. Sync local
`apps/persona-edge/tests/client-cycle.spec.ts`: 2 `SyncClient` + `HttpTransport` no `wrangler` local — convite, DM recusado no cliente, offline→flush, cifra. Sem conta/deploy.

### Arquivos
- `packages/persona/persona-host/src/{orchestration,index,types,screens,files}.ts`
- `packages/persona/persona-host/tests/{conductor,orchestration,files,screens}.spec.ts`
- `packages/persona/persona-store/src/{constants,migrations,index,events/repos,retention/store}.ts`
- `packages/persona/persona-store/tests/{open,retention.contract}.spec.ts`
- `apps/persona-edge/tests/client-cycle.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests packages/persona/persona-host/tests
 Test Files  24 passed (24)
      Tests  318 passed (318)
```

```
pnpm exec vitest run apps/persona-edge/tests/client-cycle.spec.ts apps/persona-edge/tests/edge.spec.ts packages/persona/persona-sync/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 11.8s
persona-store: OK in 6.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 33.2s
```

### Limitações
- `ctx.personaRunners.resolveRunner` ainda não está no plugin; laço continua no fake/scripted (opt-in `PERSONA_REAL_CLI=1`).
- Lumen precisa ligar os painéis aos RPCs novos (contrato publicado).
- Retenção não tem tique automático no host — chamar `applySqliteRetention`.
- Runner scriptado não gasta modelo.

---

## 03/11 15:29 — E-gh — GitHub Source IO via `gh` + webhook no engine

### O que ficou pronto
`GithubSourceHost` liga o Source puro do Forge ao host: webhook encaminhado → `githubWebhookToIntake` → `engine.receive` / `threadClosed` (reedelivery = `duplicate`). Scope do engine aceita `source: github`. Quando `gh` está no PATH, `fetchGithubIssue` (`gh api repos/…/issues/N`) e `postGithubComment` postam; sem `gh` o probe é `available: false` (não explode). Issue/PR opened também dispara iniciativa (`fireEvent`).

### Arquivos
- `packages/persona/persona-host/src/{github,orchestration,index,types}.ts`
- `packages/persona/persona-host/tests/github.spec.ts`

### Remotes
`githubAvailable`, `ingestGithubWebhook`, `fetchGithubIssue`, `postGithubComment`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/github.spec.ts packages/persona/persona-host/tests/orchestration.spec.ts
 Test Files  2 passed (2)
      Tests  9 passed (included in host 63)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 31.9s
```

```
node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 8.3s
```

### Limitações
- Sem polling. `gh` é opcional; webhook não depende dele.
- Payload do webhook chega como JSON text (Typert).
- Comentário usa `gh api … -f body=`; sem retry/backoff.

---

## 03/11 15:27 — E-rpc — remotes Lumen (convite, import, regras, aprovações, memória, skills)

### O que ficou pronto
Schema v5 `screen_doc`. Remotes para as telas da Lumen: convites (issue/list/redeem/revoke + member no redeem), import markdown (preview→confirm→progress→rollback; mesmo `externalId` é no-op), regras de triagem + janela de silêncio + limites do projeto, inbox de Aprovações (hire/vault/skill/attention) com `decideApproval` (hire aprovado cria a persona; vault aplica o body), memória por persona (propor/editar/aprovar/esquecer), skills com versão e rollback (número sobe; body anterior volta).

### Arquivos
- `packages/persona/persona-store/src/screens/repos.ts` + migrations v5
- `packages/persona/persona-store/src/invite/book.ts` (`listInvites`)
- `packages/persona/persona-host/src/{screens,index,types}.ts`
- `packages/persona/persona-host/tests/screens.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  21 passed (21)
      Tests  302 passed (302)
   Start at  15:24:56
   Duration  5.17s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 27.3s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 6.2s
persona-host: OK in 8.3s
```

### Limitações
- Hire usa spec mínimo (runner dsh, tools vazias); Lumen preenche o cartão.
- Memória pendente vive em `screen_doc` até aprovar (aí vira vault `kind=memory`).
- Attention na inbox lê tickets com `attention`; decide só anota no ticket.
- Fila do Atlas esvaziou.

---

## 03/11 15:21 — PROACTIVITY host — rotina, agora/away, autonomia, Vigia

### O que ficou pronto
Rotina diária de iniciativa por persona (`FREQ=DAILY;BYHOUR=` no fuso/horário dela; catch-up `run_once`) no agendador do host. Gatilho por evento (PR/erro/prazo) usa a mesma política. Autonomia `asked|propose|act` + orçamento de propostas/tokens/execuções + janela de silêncio. `pauseTeam` cancela as runs. Visão geral "agora": estado honesto (working/resting/stuck/waiting), fila, ociosidade, entregas do dia, propostas aceitas. "Enquanto você estava fora" desde a última visita, com `taskId` das tarefas reais; segunda leitura vem vazia. Vigia do Forge (`vigiaTick`/`watchdogWarnings`) no `tickProactivity` — só auditoria, sem ping no canal.

### Arquivos
- `packages/persona/persona-store/src/proactivity/repos.ts` + schema v4
- `packages/persona/persona-store/tests/proactivity.spec.ts`
- `packages/persona/persona-host/src/{proactivity,index,types}.ts`
- `packages/persona/persona-host/tests/proactivity.spec.ts`
- `packages/persona/persona-host/README.md`

### Remotes
`getOverviewNow`, `getWhileAway`, `markVisit`, `getAutonomy`, `setAutonomy`, `ensureInitiativeRoutines`, `fireProactiveEvent`, `tickProactivity`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests/proactivity.spec.ts packages/persona/persona-host/tests/proactivity.spec.ts
 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  15:20:28
   Duration  3.42s
```

```
pnpm exec vitest run packages/persona/persona-host/tests
 Test Files  7 passed (7)
      Tests  29 passed (29)
   Start at  15:20:40
   Duration  3.32s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.5s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 5.1s
persona-host: OK in 6.2s
```

### Limitações
- Iniciativa grava proposta no read-model; cartão estruturado de Aprovações entra no lote de remotes da UI.
- `proposalsAcceptedToday` conta fires com `ticketId` (aceitação posterior).
- Vigia não escreve Ticket aqui — só sinais/auditoria (contrato do Forge).
- Segue remotes invites/import/rules/approvals/memory/skills e GitHub Source.

---

## 03/11 15:14 — E6 — persona-sync: só streams compartilhados, cifra, offline

### O que ficou pronto
`SyncClient` recusa DM/privado (`PRIVATE_NOT_SHARED`, outbox vazio). Dois hosts no mesmo `MemoryTransport` convergem. Offline enfileira; `flush` + `restoreCursors` retomam. `WorkspaceCipher` AES-256-GCM (chave no host). `HttpTransport` para o Worker. Host: `openHostSync` / `openHostSyncFromEnv` no SQLite.

### Arquivos
- `packages/persona/persona-sync/src/{identity,client,cipher,transport,index}.ts`
- `packages/persona/persona-sync/tests/sync.spec.ts`
- `packages/persona/persona-host/src/sync.ts` + `tests/sync.spec.ts` + `index.ts` / `package.json` / `tsconfig.json`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-sync packages/persona/persona-host/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
   Start at  15:13:51
   Duration  4.19s
```

```
node scripts/persona/check-pkg.mjs persona-sync persona-host
persona-sync: OK in 7.8s
persona-host: OK in 10.7s
```

### Limitações
- Sem handshake WS no cliente (HTTP append/after). Cifra é AES-GCM Node (`node:crypto`).
- `pnpm exec` religou workspace após `persona-sync` no host (já estava no monorepo; sem pacote novo).
- Segue proatividade nativa no host (Atlas/Miguel).

---

## 03/11 15:09 — E5 — persona-edge Worker + DO + D1 + R2 + convites + HMAC

### O que ficou pronto
`WorkspaceHub` é o único ordenador (`commitEnvelope` / `SEQ_GAP`). Hibernação WS (`acceptWebSocket` + tags `stream:`/`device:` + `webSocketMessage`). Replay `GET /w/:id/sync/after`. D1 usa o mesmo SQL que a suíte `defineSyncLogContract('d1')`. R2 recusa anexo DM sem `shared`. Convites issue/redeem/revoke. Webhook GitHub: HMAC-SHA256 → `WebhookEnvelope` → DO (replay = `duplicate`) → sockets `device:`. Testes locais com `wrangler unstable_dev` (forceLocal; sem login/deploy). 2 clientes convergem; DM não sobe.

### Arquivos
- `apps/persona-edge/src/{index,env,workspace-hub,sql-log,do-sql,schema,hmac}.ts`
- `apps/persona-edge/tests/{d1-log.contract,hmac,edge}.spec.ts` + `tests/node-sql.ts`
- `apps/persona-edge/{wrangler.toml,README.md,migrations/0001_init.sql}`

### Comandos e saída verbatim

```
pnpm exec vitest run apps/persona-edge
 Test Files  3 passed (3)
      Tests  9 passed (9)
   Start at  15:08:59
   Duration  5.08s
```

```
pnpm exec tsc -p apps/persona-edge/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint apps/persona-edge/src apps/persona-edge/tests
(exit 0)
```

### Limitações
- Miniflare puro não transpila TS; a suíte HTTP usa `wrangler unstable_dev` (Miniflare por baixo). Sem handshake WS no spec HTTP (hibernação está no DO).
- D1 `exec` quebra DDL no newline — schema é statement-a-statement.
- Sem `wrangler login` / deploy (E11).
- Segue E6 `persona-sync`.

---

## 03/11 15:02 — E-persist — SyncLog / Invite / Import SQLite = suíte do Forge

### O que ficou pronto
Schema v3: `sync_envelope`, `invite`/`invite_actor`/`invite_vault`/`invite_memory`, `import_batch`. `SqliteSyncLog`, `SqliteImportStore`, `SqliteInviteBook` (+ `MemoryInviteBook`) implementam os ports do Forge. A mesma suíte de contrato (`tests/contract/{sync,import,invite}.contract.ts`) roda em memória e em SQLite; reopen em arquivo confirma persistência. Invite/Grant/purgeSource continuam funções do Forge — o book só grava o resultado.

### Arquivos
- `packages/persona/persona-store/src/{constants,migrations,index}.ts`
- `packages/persona/persona-store/src/sync/log.ts`
- `packages/persona/persona-store/src/import/store.ts`
- `packages/persona/persona-store/src/invite/{book,memory}.ts`
- `packages/persona/persona-store/tests/contract/{sync,import,invite}.contract.ts`
- `packages/persona/persona-store/tests/{sync,import,invite}.contract.spec.ts`
- `packages/persona/persona-store/tests/open.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  12 passed (12)
      Tests  263 passed (263)
   Start at  15:00:02
   Duration  4.31s
```

```
node scripts/persona/check-pkg.mjs persona-store
persona-store: OK in 6.1s
```

```
pnpm exec oxlint packages/persona/persona-store/src/invite/book.ts packages/persona/persona-store/tests/contract/sync.contract.ts
(exit 0)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-runners/src/plugin.ts:44:66: type symbol unknown has no declaration
(Rivet; nenhum artifact mudou; não editei persona-runners)
```

### Limitações
- Invite não tem port no core — `InviteBook` é do store. Suíte replica `invite.spec.ts` via persistência.
- Adaptadores de import (ChatGPT/Claude/md) ficam no core; a suíte compartilhada é preview construído + externalId + rollback.
- `generate-typert` vermelho em `persona-runners` (Rivet). Store não é a causa.
- Segue E5 `apps/persona-edge`.

---

## 03/11 15:17 — Typert C2 — anotação explícita em propriedades públicas

### O que ficou pronto
O gerador parava em `Orchestration.runtimes` ("public property is missing an explicit type annotation"). Anotados `runtimes: Map<…>`, `started: Set<string>`, e em `SqliteRepositories` os objetos `triggers`/`threads`/`tickets`/`decisions` como `Repositories['…']`.

### Arquivos
- `packages/persona/persona-host/src/orchestration.ts`
- `packages/persona/persona-store/src/engine/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.8s
```

### Limitações
- Nenhuma neste gate. C2/B7/REMOTE seguem.

---

## 03/11 14:27 — C3 + S4 — rotinas (lease/idempotência) e drafts

### O que ficou pronto
`RoutineRepos` no store: criar/listar, `schedule` com chave `routine_id:scheduled_for` (ON CONFLICT mantém a linha), `claimDue` com lease IMMEDIATE + catch-up `skip|run_once|run_all`, janela de silêncio, `pauseTeam` cancela pending/leased, `fail`+`retry`. Relógio injetável. Host: remotes `createRoutine`/`listRoutines`/`pauseRoutine`/`pauseTeam`/`scheduleRoutine`/`claimRoutines`/`retryRoutine`. S4: `draftPersona`/`draftTeam` determinísticos, válidos no schema Forge, tools vazias, sem função Coordenação.

### Arquivos
- `packages/persona/persona-store/src/routines/repos.ts`
- `packages/persona/persona-store/src/index.ts`
- `packages/persona/persona-store/tests/routines.spec.ts`
- `packages/persona/persona-store/README.md`
- `packages/persona/persona-host/src/{index,types,draft}.ts`
- `packages/persona/persona-host/tests/routines-draft.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  10 passed (10)
      Tests  115 passed (115)
   Start at  14:26:32
   Duration  4.64s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.5s
```

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/routines/repos.ts packages/persona/persona-store/tests/routines.spec.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/draft.ts packages/persona/persona-host/tests/routines-draft.spec.ts
(exit 0)
```

### Limitações
- Rotinas ainda não são Source do Intake (E-6, Forge); sem expansão Cron/RRule via `dsh-util-time` (sem `pnpm install` para nova dep) — o host agenda `scheduledFor` explícito.
- Drafts sem Runner/Rivet: template determinístico, não LLM.
- Sem remotes update/delete de persona/canal; sem tabela Subscription (v2).
- Fila imediata (B2, S2, B3, C1, C3, C4, S4) concluída. Próximos Anvil dependem de Forge/Rivet: B7 (R-1/E-3), engine SQLite (contrato), C8 host, marco E nuvem.

---

## 03/11 14:23 — C4 — arquivos por projectId (D-020)

### O que ficou pronto
`listFiles` / `statFile` / `readFile` no namespace `persona`: raiz vem de `project.rootPath` (`updateProject`), ACL = membro do workspace, caminho relativo resolvido com `realpath` — `../`, absoluto e symlink para fora recusam `path-outside-root`. Sem raiz → `project-root-missing`. Sem membro → `files-forbidden`. Typert continua verde.

### Arquivos
- `packages/persona/persona-host/src/files.ts`
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/files.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  14:22:24
   Duration  3.32s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/files.ts packages/persona/persona-host/tests/files.spec.ts
(exit 0)
```

### Limitações
- Métodos no namespace `persona` (não um serviço `personaFiles` separado); sem `readBytes`/`changes`.
- C3 (rotinas) e S4 (draft) ainda na fila; C3 espera E-6 para virar Source.

---

## 03/11 14:21 — C1a/C1b/C1c — CRUD + mensagens + busca ACL + Typert verde

### O que ficou pronto
Host Remote v1 agora cria workspace/projeto/membro/persona/participação/canal/DM e posta/lista/segue/busca mensagens. `followMessages` assina o log **antes** do baseline (sem perder o primeiro upsert). Busca aplica ACL do store: membro vê canal; DM só para participantes. `EventRepos.subscribe` notifica após o commit. `generate-typert` passou de novo com os novos `@Remote` (bloqueio do push continua verde).

### Arquivos
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/controller.spec.ts`
- `packages/persona/persona-host/tests/gateway.spec.ts`
- `packages/persona/persona-host/README.md`
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/tests/events.spec.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 35.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  98 passed (98)
   Start at  14:18:57
   Duration  5.37s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  14:20:39
   Duration  2.85s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/tests/controller.spec.ts packages/persona/persona-host/tests/gateway.spec.ts
(exit 0)
```

### Limitações
- Sem remotes de update/delete (o store já tem); sem tabela Subscription ("seguir assunto") — precisa v2.
- C1b Intake (E-6, Forge) ainda não existe: mensagens não viram Trigger.
- `listTasks` / `getOverview` vazios até os repos do engine.
- Seguindo para C4 (`persona-files`); C3 espera E-6; S4 espera S1/R-1.

---

## 03/11 14:15 — Typert gate — anotações explícitas nos parâmetros públicos

### O que ficou pronto
O gerador recusava `EventRepos.list(..., afterSeq = 0, limit = 50)` (e o mesmo padrão em `search` / `searchDocuments`). Padrão agora: parâmetro opcional **com tipo** (`afterSeq?: number`) e default **dentro** do método — evita `no-inferrable-types` e satisfaz o gate. Varredura em persona-store + persona-host: demais públicos já tinham anotação (`now: ProductClock = …`, `options: OpenTempStoreOptions = {}`, `config: Config = …`).

### Arquivos
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/src/vault/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  93 passed (93)
   Start at  14:15:18
   Duration  3.91s
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-store/src/vault/repos.ts
(exit 0)
```

### Limitações
- Nenhuma. Este era o bloqueio do typecheck/push.

---

## 03/11 14:10 — S2 store done — Cofre (registros, docs FTS5, versões)

### O que ficou pronto
`VaultRepos`: registros `brief|constraint|decision|memory` (schema Forge), `requiredRecords` = constraint/decision ativas, documentos FTS5, `vault_version` a cada escrita, revoke bloqueia update, tenant `project_id`.

### Arquivos
- `packages/persona/persona-store/src/vault/repos.ts`
- `packages/persona/persona-store/tests/vault.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  5 passed (5)
      Tests  88 passed (88)
   Start at  14:09:30
   Duration  2.73s
```

(`vault.spec.ts` 22 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint …/persona-store/src …/tests
(exit 0)
```

### Limitações
- compileContext (obrigatório > orçamento) continua no core; o store só expõe `requiredRecords`.
- Visibilidade de documento revalida pelo `parseVaultRecord` (schema de visibility do Forge).

---

## 03/11 14:08 — B2c done — log de eventos, FTS5, ACL, recall com fuso

### O que ficou pronto
`EventRepos`: stream por `(project, kind, owner)`, `seq` monotônica via `stream_cursor` em `BEGIN IMMEDIATE`, FTS5 (frase), cursor `afterSeq`, ACL na consulta (canal: membro ou participation; DM: só participantes — busca não vaza), recall por intervalo civil + IANA (`zonedUtcMs`), tombstone.

### Arquivos
- `packages/persona/persona-store/src/events/{repos,timezone}.ts`
- `packages/persona/persona-store/tests/events.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  4 passed (4)
      Tests  66 passed (66)
   Start at  14:07:50
   Duration  3.12s
```

(`events.spec.ts` 20/20 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- Concorrência de seq exercitada com duas conexões no mesmo thread (IMMEDIATE serializa).
- FTS5 usa frase entre aspas (consulta do usuário não é expressão FTS livre).

---

## 03/11 14:06 — B2b done — repositórios de produto

### O que ficou pronto
`ProductRepos`: workspace (+ projeto **Pessoal** automático), member, project, persona (schema Forge `parsePersona` + `projectId` tenant), participation, channel, dm. CRUD, unique constraints, coordenação única por projeto (não por workspace), upsert `ON CONFLICT` preserva `rowid`, listas newest-first. Dependência workspace `@deepseek-ai/dsh-persona-core` (sem `pnpm install` — resolve por paths).

### Arquivos
- `packages/persona/persona-store/src/product/{types,repos}.ts`
- `packages/persona/persona-store/src/sql.ts`
- `packages/persona/persona-store/tests/product.spec.ts`
- `packages/persona/persona-store/{package.json,tsconfig.json,src/index.ts}`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  3 passed (3)
      Tests  46 passed (46)
   Start at  14:05:58
   Duration  3.27s
```

(25 testes em `product.spec.ts` ≥ 25.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- `Persona` do Forge não tem `projectId`; o store persiste e devolve `StoredPersona`.
- `package.json` ganhou `dsh-persona-core` workspace:* — Keel precisa `pnpm install` se o lock reclamar.
- Sem commit.

---

## 03/11 14:00 — B2a done — abertura, identity, backup, migrações, tx()

### O que ficou pronto
`persona-store` abre `persona.db` com `node:sqlite`: `application_id` `PNSQ` (`0x504E5351`), `user_version` monotônico, WAL + `foreign_keys` + `busy_timeout`, arquivo `0o600` / dir `0o700`, `VACUUM INTO` **antes** de migrar (pulado em arquivo vazio v0→v1), migrações adjacentes imutáveis, falha de migração faz rollback e **preserva o backup**. `tx()` síncrono; aninhado via `SAVEPOINT`. Schema v1 já cria tabelas de produto / evento / cofre / rotina (com `project_id` e kind `personal` = Pessoal). Helpers `openTempStore` / `withTempStore`.

### Arquivos
- `packages/persona/persona-store/src/{identity,constants,errors,migrations,store,test-helpers,index}.ts`
- `packages/persona/persona-store/tests/{open,smoke}.spec.ts`
- `packages/persona/persona-store/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  13:58:37
   Duration  1.72s
```

(21 ≥ 15; inclui: reabrir preserva; versão maior recusada; falha de migração preserva backup; savepoint; WAL.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0, sem saída)
```

```
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0, sem saída — após corrigir arrow-parens e import não usado)
```

### Limitações
- Backup pulado em v0→v1 (arquivo novo vazio). Sem dados a preservar.
- Tabelas do engine (Ticket/Trigger/…) ainda não: esperam o contrato do Forge (`persona-spec/contracts/repositories.md`).
- Sem `pnpm install`. Sem commit.

### Decisões locais (não bloqueiam)
- `application_id = 0x504E5351` (`PNSQ`), distinto do session-query.
- `tx()` aninhado por savepoint (alinhamento Keel), não recusa nested.
- Tenant `project_id` nas tabelas de produto (D-038); kind `personal` + nome `Pessoal`.

---

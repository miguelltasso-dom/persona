# Arquitetura — Persona (estado real)

Para quem mantém. Nomes reais. Sem identidade de persona em código (D-043). Produto: **Persona** (D-017).

## Pacotes e fronteiras

```
packages/persona/
  persona-core      IDs, entidades, can()/ACL, compileContext/recall, vault-propose,
                    skills, handoff, aging, sync (envelope + SyncLog), import,
                    board (Workflow/Sprint, D-053)
  persona-engine    Super-agent: Trigger→Thread→pré-roteador→Eval→Tarefa→Runner→Revisar
                    + ports (SourceScope, Runner, RetentionPolicy, ReviewDelivery)
                    + projeção estágio↔coluna / sprint↔dsh-goal
  persona-store     SQLite (Anvil): Repositories, outbox/effects, SyncLog, UsageStore
  persona-host      Cordis + @Remote (Anvil): Intake, orquestração, Review, sync
  persona-runners   Runner dsh | CLI OAR (Rivet): resolveRunner, capabilities, usage
  persona-vault     CredentialProvider DPAPI (Rivet)
  persona-usage     livro de uso (Rivet); Anvil persiste UsageStore
  persona-sync      cliente de sync (Anvil; marco E)
  client-ui-persona plugin de cliente (Prism/Lumen)
  persona-app       perfil `persona` (Keel)
```

Fronteira: o **port** é do produtor (core/engine/runners/usage); a **implementação SQLite** é do Anvil, validada pela mesma suíte de contrato. Engine importa persona-core só para o quadro (D-053: tipos de fluxo/sprint). ACL de comando continua por `canCommand`.

```
Source ──Trigger──► Engine.receive
                      │
                      ▼
                 pré-roteador (código)
                      │ model?
                      ▼
                 Policy.gate + Assessor (Triagem)
                      │ accept
                      ▼
                 Ticket + Mandate ──Assignment──► Runner
                      │ ready
                      ▼
                 ReviewDelivery (worktree) ──► Outbox (só Coordenação fala)
```

```mermaid
flowchart LR
  SRC[Source] --> IN[Intake / Trigger]
  IN --> PRE[pré-roteador]
  PRE -->|silêncio / cortesia / duplicado / comando| TRAIL[trilha sem modelo]
  PRE -->|@menção| TKT[Tarefa]
  PRE -->|model| GATE[Policy.gate]
  GATE --> TRI[Triagem / Assessor]
  TRI -->|accept| TKT
  TKT --> RUN[Runner]
  RUN --> REV[ReviewDelivery]
  REV --> OUT[Outbox]
```

## Fluxo mensagem → pré-roteador → Triagem → Tarefa → Runner → Revisar

1. **Intake.** `Engine.receive(trigger)` — Trigger imutável; mesmo `id` = `duplicate`.
2. **Thread.** `threadKey({ source, id })`. No máximo uma `Evaluation` por Thread. Novos Triggers vão a `pending`.
3. **Pré-roteador.** `EngineOptions.preRoute` depois de `eval.started`, **antes** de `assessor.request`. Regras (desligáveis por projeto, cada uma com trilha):
   - silêncio / orçamento esgotado → `silent`
   - `/pausar` `/retomar` `/tarefa <texto>` + ACL (`canCommand`) → comando
   - `@menção` a uma persona viva → `assign` (sem Triagem)
   - cortesia/ack (`ok`, `valeu`, 👍) → `react`, sem Tarefa
   - duplicado exato/quase exato na janela (hash normalizado texto+remetente+thread) → `ignore`
4. **Triagem.** Só se o pré-roteador devolve `model`: `Policy.gate` + `Assessor.request`.
5. **Decisão.** `accept` cria Ticket + Mandate imutável. `ignore`/`stop`/`unavailable` só Disposition.
6. **Pass-through.** Follow-up de pessoa num Thread com Tarefa viva: Input, sem nova Eval.
7. **Runner.** `Executor.start` via `EffectQueue` **depois** de `Repositories.afterCommit`. 1 sessão + 1 cwd por Tarefa. Coordenação nunca recebe `bash` (`toolsForRole`).
8. **Revisar.** `ReviewDelivery.prepare` → worktree; Aceitar / Pedir ajustes / Descartar. Sem push.
9. **Reply.** `Outbox.send` só após commit. Quem responde no canal é a persona com função Coordenação.
10. **Contexto.** `compileContext` + skills. Corpo longo: spill + `personaRecall` / `recallChain`.

## Invariantes testados

| Invariante | Teste |
|---|---|
| Idempotência de Trigger | `persona-engine/tests/mandatory/idempotencia-de-trigger.spec.ts` |
| 1 Eval / Thread | `persona-engine/tests/mandatory/um-eval-por-thread.spec.ts` |
| Mandate imutável | `persona-engine/tests/mandatory/mandate-imutavel.spec.ts` |
| Pass-through sem Eval | `persona-engine/tests/mandatory/pass-through-sem-eval.spec.ts` |
| Outbox só após commit | `persona-engine/tests/mandatory/outbox-so-apos-commit.spec.ts` |
| Assignment interrompida retoma | `persona-engine/tests/mandatory/assignment-interrompida-retoma.spec.ts` |
| Saudável não ocupa espaço | `persona-engine/tests/mandatory/saudavel-nao-ocupa-espaco.spec.ts` |
| ACL `can()` | `persona-core/tests/acl.spec.ts` |
| Leitura entre projetos | `persona-core/tests/mandatory/leitura-entre-projetos.spec.ts` |
| Pré-roteador (5 regras + off + trilha) | `persona-engine/tests/preroute.spec.ts` |
| Confine (traversal) | `persona-engine/tests/confine.spec.ts`, `tests/security/attacks.spec.ts` |
| Retenção (arquivo ≠ apagar) | `persona-engine/tests/contract/retention.contract.ts` |
| Sync: DM sem share não sobe | `persona-core/tests/sync.spec.ts` |
| Queda+resume em qualquer N | `persona-engine/tests/crash.spec.ts` |

Boot: `node scripts/persona/check-pkg.mjs persona-core persona-engine` · `pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine` · `pnpm exec tsx scripts/generate-typert.ts`.

## Pontos de extensão

| Port | Onde | Quem implementa |
|---|---|---|
| `SourceScope` | `persona-engine/src/core/ports.ts` | host: `composeSourceScope(internal, github, allExternalSourceScope())` |
| `Runner` (sessão) | `persona-engine/src/ports/runner.ts` | Rivet: `persona-runners` (dsh / OAR) |
| `Runner` (turno) | `persona-runners/src/contract.ts` | Rivet: `resolveRunner` |
| `RetentionPolicy` + `RetentionStore` | `persona-engine/src/retention.ts` | Anvil SQLite; testes: `MemoryRetention` |
| `ReviewDelivery` | `persona-engine/src/review/types.ts` | `GitReviewDelivery`; host Remote |
| `UsageStore` | `persona-usage/src/store-types.ts` | Anvil `SqliteUsageStore`; Rivet mede |
| `SyncLog` | `persona-core/src/sync/types.ts` | Anvil SQLite/D1; testes: `MemorySyncLog` |
| `preRoute` | `EngineOptions` | host liga regras + ACL + janela |
| Governança | `persona-core/src/governance` + `persona-engine/src/governance.ts` | host: Anvil v9 (`contracts/governance.md`) |

## Governança da equipe (D-054)

`Sector` (nome editável), `PersonaCharge` (responsável + substituto), `AwayWindow`, `RoutineCharge`. Escalonamento persona → Coordenação → responsável → substituto (`resolveApproval` / `routeApproval`). Saúde + Teste dos 2 dias (`runTwoDayTest`, `applyGovernanceFix`). Assistente: `recommendStructure` (uma persona por função contínua). Contrato Remote: `persona-spec/contracts/governance.md`. UI: Lumen/Prism após GOV-5.

## Como adicionar uma CLI nova (≤10 linhas)

1. Acrescente o `CliKind` em `persona-runners/src/contract.ts`.
2. Crie `persona-runners/src/oar/<cli>.ts` no molde de `oar/claude.ts` (`createOarRunner` + `capabilities`).
3. `permission: 'explicit'`. MCP: `available` ou `unavailable` (Cursor = unavailable).
4. Registre em `resolve/resolve-runner.ts` (`loadRuntime` + factory).
5. Casa isolada via `prepareIsolatedHome`; env do vault nunca logado.
6. Uso só por `UsageStorePort` (tokens; sem segredo).
7. Teste com `scriptedRuntime` / fake — **sem CLI real** enquanto o CONGELAMENTO valer.
8. Exporte em `persona-runners/src/index.ts`.
9. Host: `resolveRunner({ kind: 'cli', cli, model })`.
10. Port de sessão do engine (`ensureSession`/`deliver`) continua o de `persona-engine/src/ports/runner.ts`.

## Quadros por projeto (D-053)

Cada projeto tem `Workflow` (colunas + categoria `todo|doing|review|needs_you|done`) e sprints opcionais. Tipos e invariantes em `persona-core/src/board`. Engine projeta estágio↔coluna (`projectBoardCard`, `moveToColumn`) e sprint↔`dsh-goal` (`sprintGoal` / `bindSprintGoal`). Host (Anvil) persiste v8 e expõe Remote; UI (Lumen/Prism) ainda troca o Kanban misturado por Quadros (PB-5..PB-7).

**PB-10 — coluna antiga → categoria:** `legacyKanbanToCategory` / `legacyColumnLabelToCategory` em `persona-engine/src/kanban.ts`. `todo|doing|review|done` permanecem; `blocked` vira categoria `needs_you` + marcador. Rótulos pt-BR: A fazer, Em andamento, Em revisão / Revisar, Bloqueado / Precisa de você, Concluído / Pronto. Cartões sem coluna caem na primeira coluna da categoria do estágio (`firstColumnOf`). Revisar continua no cartão (D-039 `reviewThread`). A UI (`GlobalKanban` → Quadros) é Lumen após PB-5.

## Onda 2 — assuntos, contas, ensinar (D-055)

Assuntos por conversa: 7 cores + nome; mensagem e resposta no assunto ativo; `compileActiveSubject` recorta o Cofre ao assunto + obrigatórios; Tarefa guarda origem (`ticket_subject`). Persistência v14 (`conversation_topic`, `topic_read`, `event.topic_id`). Remote: `listConversationSubjects` / `create` / `rename` / `archive` / `moveMessageToSubject` / `setActiveConversationSubject`; `search`/`listMessages` aceitam `topicId`.

Várias contas por provedor: `provider_account` + `account_policy` (v14). Remote: `listConnectionAccounts` / `add` / `remove` / `update` / `setRunnerSwapPolicy`. `pickAccount` + Rivet `pickProviderAccount` escolhem o assento em `resolveFor`; casa isolada `PERSONA_HOME/accounts/{personId}/{engine}/{accountId}`. Uso por conta (`usage_record.account_id`, `getUsage.accountId`, `getOfficialQuota.accountId`). Troca vira linha de atividade.

Ensinar: gravação privada (`teach_artifact`, retenção 30 dias) → `draftTaughtSkill` → skill candidata (`origin: taught`, `enabled: false`). Remote: `startTeachSession` / `pause` / `resume` / `stop` / `getTeachDraft` / `submitTeachDraft`. Captura de frames `{atMs, png}` é Rivet. Guia: `docs/persona/{assuntos,conexoes,ensinar}.md`.

Cofre documentos (v14 canônico, sem v15): Anvil `ingest/replace/delete/list/searchVaultDocuments`; hits com `title`+`locator`. Domínio `formatVaultCitation` / `toUsedDocumentCite` (Contexto usado: `Contrato.pdf · seção Contratos`). `compileContext` só serializa title/locator quando presentes.

## Segundo cérebro (BRIEFING 19 / D-057)

Páginas markdown tipadas em Empresa › Segundo cérebro (Forge: `persona-core/src/domain/brain*.ts`). Índice derivado; versões; visibilidade da audiência (DM → membros). Função **Bibliotecário** (`systemRoles: librarian`, atribuível; padrão = Coordenação). `curateBrain` cria/liga/sinaliza contradição; obrigatórios só com aceite. Higiene sem LLM (dedupe, 90 dias). Permissões lembradas: match exato persona+ação+alvo+limites; nunca amplia; revoga imediato; auditoria `não perguntei porque você permitiu em DD/MM`. Tools `brain_search` / `brain_read` / `brain_propose` com ACL; `compileBrainContext` mete regras obrigatórias no turno. Store/RPC = Anvil; MCP = Rivet. Contrato: `persona-spec/contracts/second-brain.md`.

## Onda 3 — computer use próprio

`runComputerUse` em `persona-engine/src/computer-use.ts`: plano com expectativa explícita por passo → `DesktopObservePort` (captura + árvore UIA) → `DesktopActPort` → verificar → retry com limite → relatório + `ReplayEntry`. Humano no mouse/teclado → `você assumiu` (pausa imediata; resume explícito). Passos `click`/`type`/`key`/`scroll` passam por `StepPermissionPort` (Rivet `McpGateway`, kind `computer_act`). Limites: passos, tentativas, tempo, orçamento. Contrato: `persona-spec/contracts/computer-use.md`. Overlay/cursor = Muse; UIA/Electron = Rivet.

## Como adicionar uma Source nova (≤10 linhas)

1. Escolha o `source` string (`channel` / `dm` / `github` / `telegram` / `email` / `slack` / `discord` / `calendar`).
2. Mapeie o evento inbound → `Trigger` com `key(...)` (id idempotente). Rivet: `telegramUpdateToTrigger` / `emailMessageToTrigger` / `slackEventToTrigger` / `discordMessageToTrigger` / `calendarEventToTrigger`.
3. Preencha `threads`, `actor`, `human`, `channel.address`, `meta` (sem segredo). Slack `address.ts`; Discord `address.message`; calendário `address.uid` + `dtstart`.
4. Implemente `SourceScope.scope()` → `{ listened, observed, row }` (`externalSourceScope` / `allExternalSourceScope` + `composeSourceScope`).
5. Intake no host chama `receiveExternal` → `Engine.receive` (`pollExternal`). Bot = `human: false`. Resposta no `channel` de origem (`originReply` → `replyExternal` → Rivet `replyTelegram` / `replyEmail` / `replySlack` / `replyDiscord`). Calendário não responde: `uid` + `dtstart` para rotinas. Token fica no Cofre (`SecretVault.get`); sem token a fonte é pulada.
6. O pré-roteador lê `trigger.text` **antes** do modelo.
7. Testes: id duplicado, fora de escopo (`filtered`), bot recusado pelo gate.
8. Molde: `persona-engine/src/sources/{internal,external}.ts` e `sources/github/`.
9. Webhook público só encaminha (`persona-core/src/sync/webhook.ts`); o desktop decide o Trigger.
10. Exporte o mapper em `persona-engine/src/index.ts` (ou `persona-runners` se o mapper for de CLI/API).

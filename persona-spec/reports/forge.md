# Relatos — Forge (persona-core / persona-engine)

Mais recente no topo.

---

## 03/11 19:15 — C2 + PB-1/PB-2 + proposta PB-3 (BRIEFING 15)

### C2
`Engine.answerAttention` persiste a resposta e limpa `attention`. Host `answerAttention` chama o engine (não só `note`). `completeReview` posta `milestoneSummary` em `#geral` (`coord-<ticket>-milestone`) mesmo se a Tarefa ainda não tiver `ended`. Jornada `j11-c2-attention.spec.ts`.

### PB-1 (domínio, persona-core)
`persona-core/src/board`: Workflow (colunas + categoria `todo|doing|review|needs_you|done`, WIP aviso, campos tipados), 7 templates pt-BR, Sprint `planejado|ativo|encerrado`, invariantes (≥1 todo/done, `needs_you` única, destino ao remover coluna). `Ticket.columnId/sprintId/campos` no engine Ticket. WIP **não** trava a máquina.

### PB-2 (engine)
Projeção estágio↔coluna: coluna explícita vence se a categoria bate; senão 1ª coluna da categoria. Move manual ajusta o estágio. Attention → `needs_you`; ended → 1ª `done`. Sprint ↔ `dsh-goal` (`sprintGoal`); encerrar com confirmação + rolagem + resumo de marco. Puxada/Attention classificam por categoria em Contratação/Site/Software.

### PB-3 (parser Forge; Remote = Anvil PB-4)
`proposeWorkflow` + `parseWorkflowProposal` (JSON sujo) devolvem cartão «Usar este fluxo?» — **nunca aplicam**. Degrade honesto sem JSON/template.

### Dependências
- **Anvil PB-4**: persistir workflow/seats/sprints (v8), Remote, aplicar proposta só após aprovação.
- **Keel**: `persona-engine` agora declara `@deepseek-ai/dsh-persona-core` (`workspace:*`) — precisa `pnpm install` no próximo commit.
- **F1**: ainda aguarda amostras reais do Miguel; sintético extra (ChatGPT sem id).
- **F4**: depois do F3.

### Arquivos
- `persona-core/src/board/{workflow,sprint,index}.ts`, `domain/schemas.ts` (`INVALID_WORKFLOW`), `tests/workflow.spec.ts`, `tests/import.spec.ts`
- `persona-engine/src/{workflow,workflow-error,sprint}.ts`, `core/{engine,model}.ts`, `index.ts`, `package.json`
- `persona-engine/tests/{attention,workflow,sprint}.spec.ts`
- `persona-host/src/{index,orchestration}.ts`, `tests/journeys/j11-c2-attention.spec.ts`
- `persona-spec/{PLAN.md,reports/forge.md,reports/journeys.md}`

### Comandos

```
pnpm exec vitest run …/persona-core/tests/workflow.spec.ts …/import.spec.ts …/persona-engine/tests/{workflow,sprint,attention}.spec.ts …/j11-c2-attention.spec.ts
 Test Files  6 passed (quando o import extra entrou: 4+attention+j11)
```

Verbatim desta rodada (core+engine board):

```
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

```
node scripts/persona/check-pkg.mjs persona-core
persona-core: OK in 6.9s
```

```
node scripts/persona/check-pkg.mjs persona-engine
persona-engine: OK in 16.8s
```

### Limitações
- Proposta da Coordenação ainda não tem prompt de modelo no host (Anvil Remote).
- Assentos em memória; SQLite = Anvil.
- `coordinationHandoff` foi içado no topo de `orchestration.ts` (ReferenceError por import circular / `export function` no fim do módulo).
- Sem commit. CLI real continua congelada.

---


## 03/11 18:55 — Jornadas J1–J10 (host)

### O que ficou pronto
Dez jornadas em `persona-host/tests/journeys/*.spec.ts` (arquivos novos; Anvil intocado). PersonaHost real, SQLite temporário, runner scriptado, relógio injetável. 10/10. Lista em `reports/journeys.md`. S7 do PLAN atualizado com honestidade (host verde; UI Probe ainda todo).

### Arquivos
- `packages/persona/persona-host/tests/journeys/{journey-host,j01–j10}.ts`
- `persona-host/src/orchestration.ts` (`requestChanges` sem pasta: anota + blocked antes de retry)
- `persona-spec/reports/journeys.md`, `PLAN.md` S7

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/journeys
 Test Files  10 passed (10)
      Tests  10 passed (10)
   Duration  14.36s
```

### Limitações
- J2 Aceitar sem `setProjectRoot` devolve bloqueado «Projeto sem pasta» (merge real continua no teste git do Anvil).
- Reduced-motion / dirD = Probe, não estas jornadas.

---

## 03/11 18:45 — purpose:talk (PRIORIDADE 1)

### Antes
Anvil mediu a 1ª resposta real: «Estou pronta como onb-1, Executora… Tarefa autorizada». Talk usava o wrap de Executora (`prefixOwnerNorms` / título default `Executora`) e o id interno no lugar do nome.

### O que ficou pronto
- Template `talk` + `composeTalkPrompt`: voz (nome de exibição, personalidade, instruções, função), colegas, Cofre/memória com teto 4000, pt-BR, 1–3 frases, sem mandato de Tarefa, sem «Executora», user/anexos em `<dado>`.
- `purpose: talk` no session runner **não** aplica owner-norms; `personaName`/`personaTitle` saem do `resolveFor` e entram em `createOarSessionRunner`.
- `finishReply` entrega `talkPrompt(...)` (nunca o body cru).

### Arquivos
- `persona-engine/src/prompts/{talk,templates}.ts`, `src/index.ts`, `tests/prompts.spec.ts`
- `persona-host/src/{orchestration,runner}.ts`, `tests/talk-voice.spec.ts`
- `persona-runners/src/oar/session.ts`, `tests/talk-session.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-engine/tests/prompts.spec.ts packages/persona/persona-runners/tests/talk-session.spec.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

```
node scripts/persona/check-pkg.mjs persona-engine
persona-engine: OK in 17.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.6s
```

```
pnpm exec vitest run …/prompts.spec.ts …/talk-session.spec.ts …/talk-voice.spec.ts
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
reply: "BANANA"  source: runner  actor: onb-1  sqlite type: runner
broke: []  execs: 1  first-token 13644 ms  reply 13698 ms  total 18336 ms
```

Depois: o modelo obedeceu «Responda só BANANA». Sem «Executora», sem mandato de Tarefa no corpo. 1/3 execs da exceção.

### Limitações
- `actorId` do evento continua `onb-1` (id da linha); o prompt e o texto da resposta não vazam o id.
- 1º token ainda ~13,6 s (pool/modelo rápido = Rivet).
- `check-pkg persona-host` / `persona-runners`: falhas em testes do Anvil/Rivet (unused import, `warmTtlMs`, `nowMs`); nenhum erro nos arquivos desta onda.

---

## 03/11 17:50 — Queda+resume, importadores F1, guia

### O que ficou pronto
- **Consistência sob queda:** `FaultyRepositories` / `CrashError` em cada passo (receive → archive). Varre N escritas. Nenhum N falhou. Resume sem Tarefa perdida/duplicada nem reply duplicado. `defineCrashSuite` para o Anvil (SQLite aborta o tx). Relato em `bench-crash.md`.
- **Importadores F1:** Markdown/Obsidian (wikilink, frontmatter, anexo com aviso), Notion (.md/.csv), ChatGPT, Claude.ai, Gemini Takeout. Prévia com contagem, duplicados e motivo. Credencial recusada. DM sem compartilhar não sobe. Reimportar não duplica. Rollback. Fixtures sintéticas. Cada formato marcado **esquema presumido — validar com amostra real**. Arquivo irreconhecível: pt-BR claro. Campos extras ignorados.
- **Guia:** `docs/persona/*` + `README.persona.md` — onboarding, Revisar (Aceitar / Pedir ajustes / Descartar), conexões e Não conectado, login CLI, bandeja, Precisa de você, backup/DPAPI mesma conta, exportar, privacidade, problemas (CLI, host reconectando, cota). Uma ideia por frase.

### Arquivos
- `persona-engine/src/crash/*`, `tests/contract/crash.contract.ts`, `tests/crash.spec.ts`
- `persona-core/src/import/{types,apply,markdown,notion,gemini,chatgpt,claude,index}.ts` + `tests/import.spec.ts`
- `docs/persona/*`, `README.persona.md`, `persona-spec/contracts/crash.md`, `reports/bench-crash.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 10.0s
persona-engine: OK in 17.1s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  74 passed (74)   # review-delivery 5s flake 1×, retry 6/6
      Tests  453 passed (453)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 51.8s
```

### Limitações
- Sem CLI real (Keel: orçamento da rodada já usado).
- Esquemas de importação são presumidos até amostra real do Miguel.
- Runner/archive: 0 escritas no repo em memória (entrega já no start; retenção é outro store).
- Fila Keel (queda / F1 / guia) vazia no território Forge.

---

## 03/11 17:25 — F3 modelo real + parser sujo + soak 7 dias

### O que ficou pronto
- **F3 com modelo real:** `resolveRunner({ cli: claude, model: haiku, permissionMode: prompt })`, 10 cenários discriminantes (não o prefixo do corpus). Rodada 1 (prompts velhos) **5/10**; ajustes em `prompts/templates` (injeção → ignore, escopo maior → Tarefa nova, ambíguo → uma pergunta); rodada 2 **8/10**. Restam d1/h1 (silent). Sem tokens/segredos. O 41/41 do CI continua fake.
- **Parser sujo:** reparo determinístico → 1 pedido de reparo → degrade "não entendi a resposta da persona" + Precisa de você. Sem Tarefa criada por saída duvidosa. Corpus: JSON truncado, cerca ```json, prosa, chaves duplicadas, enum errado, extras, unicode/CRLF, saída enorme, JSON de outro esquema + fuzz `0xD1B7`.
- **Soak 7 dias** (semente `0x50A7`): 3 projetos × 5 personas; iniciativa, Vigia, puxada, orçamento, retenção, silêncio, runner falha/volta, host 10×, sono +8 h, DST Lisbon, fuso São Paulo→Lisboa. Invariantes verdes. Números em `bench-soak.md`. Memória + `defineSoakSuite` para o Anvil (SQLite).

### Arquivos
- `packages/persona/persona-engine/src/parse/model-output.ts`, `src/router/handlers.ts` (`personaRouteFromModel` / report / propose)
- `src/bench/coord-eval.ts`, `src/prompts/templates.ts`, `src/soak/sim.ts`, `src/initiative.ts`, `scripts/coord-real-cli.ts`
- testes `parse-model-output`, `soak`, `initiative-zone`, `contract/soak.contract.ts`
- `persona-spec/reports/bench-router-eval.md`, `bench-soak.md`, `contracts/soak.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.2s
persona-engine: OK in 14.2s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  73 passed (73)
      Tests  447 passed (447)
   Start at  17:22:29
   Duration  17.36s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 47.7s
```

```
PERSONA_REAL_CLI=1 pnpm exec tsx packages/persona/persona-engine/scripts/coord-real-cli.ts
r1 … 5/10   r2 … 8/10
```

### Limitações
- Rodada 2: `d1` duplicate e `h1` handoff saíram `silent` (sem 3ª rodada; teto 2×10). Linha extra no despacho depois da 2ª, não remedida.
- Soak cria 1 Tarefa/projeto (thread único; follow-ups não abrem outra).
- F1 do PLAN ainda espera amostras reais do Miguel.
- Fila Keel (real CLI / parser / soak) vazia no território Forge.

---

## 03/11 16:10 — ReviewDelivery + eval F3 + equipes-modelo

### O que ficou pronto
- **ReviewDelivery** (git no PATH, argv, sem shell): `prepare` worktree/branch `persona/<id>` (`confinePath`, longpaths); `summary` arquivos +/− + patch teto + testes citados + segredos redigidos; `accept` ff/squash, conflito aborta e bloqueia (nunca meio-merge); `requestChanges` nota + reassignment, Mandate imutável; `discard`; `sweepOrphans` na retomada. Sem push. Contrato `persona-spec/contracts/review-delivery.md` (Anvil Remote / Lumen painel Revisar).
- **F3 eval da Coordenação:** 41 cenários pt-BR; fake determinístico no CI (41/41); CLI real só com `PERSONA_REAL_CLI=1` (≤10). Ablação batch/pass-through no mesmo relatório. `persona-spec/reports/bench-router-eval.md`. Sem otimizar. CLI real: não rodou.
- **Biblioteca de equipes** (8 modelos de onboarding): software-dev, conteúdo, pesquisa, suporte, estudos, pessoal, agência, escritório. Funções, não nomes Atlas/Router. Autonomia padrão = propor. Snapshot das instruções. Muse mapeia avatares; Prism usa no passo da equipe.

### Arquivos
- `packages/persona/persona-engine/src/review/*`, `src/bench/coord-eval.ts` + testes
- `packages/persona/persona-core/src/domain/{onboarding-teams,templates,schemas}.ts` + `tests/team-library.spec.ts`
- `persona-spec/contracts/review-delivery.md`, `persona-spec/reports/bench-router-eval.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.3s
persona-engine: OK in 7.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  70 passed (70)
      Tests  432 passed (432)
   Start at  16:08:21
   Duration  18.19s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.2s
```

### Limitações
- `GitReviewDelivery` não faz push; o host chama `sweepOrphans` no resume.
- 100% do corpus é o fake do CI, não um modelo. CLI real não rodou (`PERSONA_REAL_CLI` ausente).
- `suggested-animals` continua com nomes Atlas/Bento (template inicial já existente; onboarding novo não usa).
- Fila vazia no território Forge.

---

## 03/11 16:00 — Endurecimento (security / properties / retention / bench / guia)

### O que ficou pronto
- **Segurança adversarial** (`tests/security/*.spec.ts`, título = ataque): injeção no Trigger não passa o gate nem muta Mandate (escopo maior = Tarefa nova); `bindRunIdentity` / `persona*FromRun` — identidade vem da sessão; `persona_propose` em cadeia de 3 (ferramentas/CLI/orçamento); `confinePath` + worktree (`..`, absoluto, junction); DM não vaza em compile/recall/chain/export/search; `looksLikeCredential` recusa chave em proposta, vault e prompt; revogação corta `can()` e `report` (`mandateRevoked`); replay de Trigger/outbox/webhook.
- **Propriedades** (mulberry32, semente `0xC0FFEE` / `0xA11CE`, N=32–64): idempotência de Trigger, 1 Eval/Thread, Mandate imutável, SyncLog sem lacuna, DM sem `shared`, `can()` monotônico, outbox só após commit, resume reentrante.
- **Retenção:** porto `RetentionPolicy` + `MemoryRetention` + suíte de contrato. Doc `persona-spec/contracts/retention.md`. Anvil: SQLite VACUUM/FTS na mesma suíte.
- **Bench engine:** `persona-spec/reports/bench-engine.md` (10k tickets / 100k triggers; pipeline 200). Sem otimizar.
- **Guia pt-BR** `docs/persona/*.md` + `README.persona.md` (créditos; produto = Persona, D-017).

### Arquivos
- `packages/persona/persona-core/src/{domain/secrets,import/privacy,domain/rules,domain/vault-propose,domain/schemas}.ts` + `tests/security` + `tests/properties`
- `packages/persona/persona-engine/src/{retention,executor/confine,executor/worktree,router/handlers,core/assignments,prompts/templates,bench/engine}.ts` + testes
- `persona-spec/contracts/retention.md`, `persona-spec/reports/bench-engine.md`, `docs/persona/*`, `README.persona.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 5.5s
persona-engine: OK in 5.0s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  67 passed (67)
      Tests  422 passed (422)
   Start at  15:55:54
   Duration  9.24s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 34.5s
```

### Limitações
- Pipeline do bench é 200 ciclos (não 100k receives); estoque 10k/100k mede store/views/`get`.
- Exclusão de retenção em memória; VACUUM/FTS = Anvil.
- Sem defeito em pacote alheio nesta onda (Anvil já tem retenção SQLite v6 no Status).
- Fila de endurecimento vazia no território Forge.

---

## 03/11 15:38 — PROACTIVITY nativa (BRIEFING 14 / PROACTIVITY.md) ✔ engine

### O que ficou pronto
- **Puxada:** `afterAssignmentSettled` / `nextEligible` — prioridade, deps prontas, `canAssign`, concorrência, tokens/runs. Dependente acorda por evento (`wakeDependents`).
- **Objetivos:** `GoalBoard` + `MemoryGoalBoard` (host liga `dsh-goal` / `goal-round-driver` / `tool-goal`). `emptyQueueDecision`: fila+objetivo=`work`; vazia+objetivo aberto=`plan` (turno da Coordenação); vazia sem objetivo=`rest` (`spendsModel` false — sem IA). Tarefa grande → `ticketGoal` (1 goal/sessão, 256 rounds).
- **Continuação:** `verifyReady` + `continuationAfterReady` — dentro do mandato faz (`act`) ou propõe; especulativo só registra.
- **Vigia:** `vigiaTick` (relógio falso): ociosa+fila+objetivo ⇒ `assign` no mesmo ciclo; sem progresso N min; loop; espera colega (`nudge`/`escalate`); falha de runner (`retry_backoff`+`recover`). Tudo vira `VigiaAudit`.
- **Orçamento:** propostas/dia, janela de silêncio, tokens/runs, taxa de aceitação alonga o intervalo; `proposalDigest` em vez de ping.
- **Autonomia:** `on_request` | `propose` | `act`; especulativo começa em `observe`.

### Arquivos
- `packages/persona/persona-engine/src/{pull,goals,continue,budget,proactivity,watchdog}.ts`
- `packages/persona/persona-engine/tests/proactivity-v1.spec.ts`
- `persona-spec/ARCHITECTURE.md` (invariantes)

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 6.0s
persona-engine: OK in 8.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  61 passed (61)
      Tests  398 passed (398)
   Start at  15:15:44
   Duration  7.73s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 32.3s
```

### Limitações
- `GoalBoard` é port: Rivet/Anvil ligam `ctx.goals` + round-driver (engine não importa Cordis).
- `vigiaTick` não escreve Ticket — host aplica `assign`/`recover`.
- Rotina diária de iniciativa (horário da persona) e cartão de Aprovações = UI (Lumen/Prism).
- Fila vazia no território Forge.

---

## 03/11 15:17 — views/cards/13 cenários/skills/ARCHITECTURE/bench-context ✔

### O que ficou pronto
- **Read-models:** `persona-engine/src/views` sobre `Repositories` + `canRead*` (Anvil liga `can()`). `overview` (problems, Precisa de você, executor, flow 24h), `ticketList/Row/Detail`, `threadList/Detail` (cursor `<at>|<id>` via Triggers), `decisionList`, `search`. Chip "Aguardando evento". Saudável = listas vazias.
- **Cartões/recursos:** `triggerCard`/`ticketCard` com `capped()` + `read`. `personaRead` / `personaRecall` (`persona-spill:` = B4); `readable()` = fronteira do Ticket do worker. Sem GitHub/Feishu.
- **13 obrigatórios** em `persona-core/tests/mandatory/` + Super-agent em `persona-engine/tests/mandatory/`.
- **`materializeSkills`:** dsh → seção; CLI → prefixo + MCP; candidata/DM não vazam; manifesto com versão.
- **`persona-spec/ARCHITECTURE.md`** e contrato `persona-spec/contracts/views.md`.
- **Microbench:** `persona-spec/reports/bench-context.md` (1k/10k/100k, 1 round).

### Arquivos
- `packages/persona/persona-engine/src/{views/*,cards,resources}.ts` + testes
- `packages/persona/persona-core/src/domain/{skills,reply}.ts`, `src/context/bench.ts`, `tests/mandatory/*`
- `persona-spec/{ARCHITECTURE.md,contracts/views.md,reports/bench-context.md}`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 4.2s
persona-engine: OK in 4.5s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  60 passed (60)
      Tests  391 passed (391)
```

```
pnpm exec tsx packages/persona/persona-core/scripts/bench-context.ts
# 1k compile 257ms / 10k 10.3s / 100k 98.8s; recall 3.3 / 26.6 / 212 ms
```

### Limitações
- Timeline de Thread vem de Triggers alcançáveis (port sem `turns`/`triggers.list`).
- `persona-read` de `triggers` só enxerga pending/eval/origem/inputs.
- compileContext 100k ~99s: `tokens()` em todo candidato após o orçamento encher.
- Super-agent obrigatórios no engine (precisam de `Engine`); domínio no core.

---

## 03/11 15:02 — sync/E7/E8/D6/F1/F3/G1/S2-cofre ✔ fila pura do marco E/F

### O que ficou pronto
- **SYNC (D-034):** envelope `workspaceId/streamId/seq/idempotencyKey/classification/payload` + cifra opcional; DO é o único ordenador (`SEQ_GAP`); DM/privado sem `shared: true` não sobe; replay idempotente; retomada por cursor; `WebhookEnvelope` para o Worker. Port `SyncLog` (`MemorySyncLog` = suíte). Contrato `persona-spec/contracts/sync.md` — Anvil persiste.
- **E7:** Invite (TTL, uso único), Grant, revogação, `purgeSource` (revoga vault + arquiva memórias). Amigo sem grant não lê DM/cofre.
- **E8:** Source GitHub pura (`persona-engine/src/sources/github`) — evento→Trigger, humano×bot, comentário editado = novo id, PR closed/merged → `threadClosed`, reentrega = `duplicate`. Sem polling.
- **D6:** `chooseConnection` sem fallback silencioso; Cursor descrito sem MCP.
- **F1:** framework de importação (preview, privacidade, externalId, rollback); adaptadores ChatGPT / Claude.ai / Markdown; Grok registrado mas não fareja (amostra pendente). Candidatas sempre `proposed`. Cookies/tokens recusados.
- **F3:** experimento sintético do Router — batching −87.5% inferências; pass-through −92.3% decisões/tokens nesta carga. Relatório em `persona-spec/reports/bench-router.md` (metodologia do paper, número dele não prometido).
- **G1:** relação não concede acesso nem inicia trabalho; posição não entra em `can()`.
- **S2:** `proposeVaultUpdate` (approval|auto; nunca mais visibilidade que o criador).

### Arquivos
- `packages/persona/persona-core/src/{sync,import,domain/invite,connection,relations,vault-propose}.*` + testes + fixtures
- `packages/persona/persona-engine/src/{sources/github,bench/router}.ts` + testes
- `persona-spec/contracts/sync.md`, `persona-spec/reports/bench-router.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 68.0s
persona-engine: OK in 6.8s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  36 passed (36)
      Tests  357 passed (357)
   Start at  14:49:54
   Duration  5.46s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-host/src/orchestration.ts:89:3
  public property is missing an explicit type annotation
(nenhum artifact mudou; o arquivo é do Anvil — não editei)
```

### Limitações
- Persistência sync/import/convites é port; Anvil implementa D1/SQLite com a mesma suíte.
- GitHub: sem `send`/`read` via `gh` (IO do Rivet/Anvil). Webhook assinado fica no Worker.
- Export Grok-bot: ponto de extensão pronto; sniff = false até o Miguel mandar amostra.
- F3 é carga sintética; percentuais ≠ paper.
- `router.spec.ts` Thread usa `ref: { source, id }` (check-pkg engine OK).
- Fila vazia.

---

## 03/11 14:51 — typecheck + fila P7→P8→P9→P6→Vigia→E1→E2→memória→E4 ✔

### O que ficou pronto
- Gate `check-pkg` (src+tests): (1) `resume.ts` — removido `liveTicket` não lido (TS6133); (2) `aging.ts` `restoreMemory` — omite `restoredFrom` quando `supersededBy` é `undefined` (TS2375 / `exactOptionalPropertyTypes`).
- **P7** Runner port em `persona-engine` (D-040/D-041): `ensureSession/deliver/cancel/status/whenIdle/onEvent/capabilities/background`, `toolsForRole` sem `bash` no coordinator, `WorkerSlots` (+1 person), launch/delivery via `EffectQueue`, transient 3× 15/30/60s, `PrepareFailed` sem retry + `ticket.delivery` mesmo com assignment ainda pending. `FakeRunner`/`FakeClock`. Contrato `persona-spec/contracts/runner.md` — Rivet importa o tipo daqui.
- **P8** `resumeExecutor` + `RECOVERY_NOTE` + `idleOutcome` + `addWorktree` por argv (`shell: false`). Resume não relança pending com `ticket.delivery`.
- **P9** `personaRoute` (≤20, recusa item a item) / `personaReport` / `personaAck` (`engine.reply`) / `personaHandback` / `personaThreadFollow` + `MasterAssessor` + `NoticeLog`.
- **P6** prompts pt-BR com `{{persona_name}}` — nenhum Atlas/Bento/Nina no template (D-043). `MemoryPromptStore` versionado.
- **Vigia** sinais puros (`ticket_stalled` / `effect_failing` / `eval_unavailable`) + dedupe.
- **E1** handoff claim-once, ciclo/profundidade/orçamento.
- **E2** skill DM não publica para project/team; versão + rollback.
- **Memória** aging nativo (decay/reinforce/near-dup/contradiction/supersede/restore) + markdown vault/memory.
- **E4** `applyProactivity`: `off`/`observe` (só registra) / `auto`.

### Arquivos
- `packages/persona/persona-engine/src/{ports/runner,executor/*,router/*,prompts/*,watchdog,proactivity}.ts`
- `packages/persona/persona-engine/src/index.ts` + `tests/{runner,executor,resume,worktree,router,prompts,watchdog,proactivity}.spec.ts`
- `packages/persona/persona-core/src/domain/{handoff,skills,aging,markdown}.ts` + testes
- `persona-spec/contracts/runner.md`

### Comandos e saída verbatim

```
node scripts/persona/check-pkg.mjs persona-core persona-engine
persona-core: OK in 4.9s
persona-engine: OK in 4.3s
```

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  28 passed (28)
      Tests  332 passed (332)
   Start at  14:34:44
   Duration  3.46s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.4s
```

### Limitações
- `Engine.deliveryFailed` só grava se a assignment já está `running`; falha de launch persiste `ticket.delivery` direto no repo.
- Backoff 15/30/60s é classificado no handler; o `EffectQueue` remarca `due` com +50 ms (o relógio de teste avança). Anvil pode persistir o due real no SQLite.
- Adaptadores dsh/OAR continuam com o Rivet — só o port e o Fake de engine estão aqui.
- Fila Forge (Keel 14:45/14:51) concluída. Sem `maestri ask Keel`.

---

## 03/11 14:15 — P3a–P5, S3, P11, P12, B4 ✔ fila do engine/domínio fechada

### O que ficou pronto
- **P3a** `EffectQueue` + `EffectPersistence` (memória). Enfileira no `afterCommit`; rollback não dispara; `Later` não incrementa attempts.
- **P4a** `MemoryOutbox` + passes (`sent`/`dropped`) idempotentes.
- **P5** projeção estágio→coluna (`todo|doing|review|blocked|done`) + chip `waiting`; `reviewThread` = `{ source: 'review', id }` só em `person/review` (D-039).
- **S3** `personaPropose`: sem Recrutar → `ACL_DENIED`; escalada → `ACCESS_ESCALATION`; `auto` só aprova dentro do acesso do criador.
- **P11** `admitTrigger` (Policy ACL): `decide` no canal do projeto; explicit/inferred/notHuman.
- **P12** `internalSourceScope` channel/dm/persona/routine.
- **B4** `inlineRef` / `spillPointer` / `recallChain` com authorize por salto; revogação no meio corta a cadeia.

### Arquivos
- `packages/persona/persona-engine/src/{effects,outbox,kanban,sources}.ts` + testes
- `packages/persona/persona-core/src/domain/{rules,admission}.ts`
- `packages/persona/persona-core/src/context/{chain,error}.ts` + testes

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  16 passed (16)
      Tests  281 passed (281)
   Start at  14:15:12
   Duration  2.43s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
```

Oxlint nos arquivos novos: 1 arrow-parens em `effects.ts` (corrigido em seguida). `src/core` verbatim do protótipo continua fora do rewrite stylistic.

### Limitações
- Persistência de effects/outbox em SQLite é do Anvil (mesma interface `EffectPersistence` + contrato `Repositories`).
- `EffectQueue.enqueue` grava a row só no `afterCommit` (memória-seguro). No SQLite o Anvil pode upsert na mesma tx e só usar o hook para `kick`.
- D-039 não estava em DECISIONS.md; review-thread = `source: 'review'`.
- Fila Forge (Keel 14:22) concluída. Sem `maestri ask Keel`.

---

## 03/11 14:09 — P2a ✔ port Repositories + suíte de contrato (memória)

### O que ficou pronto
Port `Repositories` com `projectId` (D-038: tenant = projeto) e `afterCommit` (corre após o commit mais externo; rollback descarta hooks). `MemoryRepositories` implementa. Suíte `tests/contract` parametrizada por fábrica; memória passa a suíte (≥20) e os 113 do `core-engine.spec`. Contrato em `persona-spec/contracts/repositories.md`. Anvil pluga SQLite na mesma fábrica.

### Arquivos
- `packages/persona/persona-engine/src/core/ports.ts`
- `packages/persona/persona-engine/src/core/memory.ts`
- `packages/persona/persona-engine/tests/contract/repositories.contract.ts`
- `packages/persona/persona-engine/tests/contract/memory.contract.spec.ts`
- `persona-spec/contracts/repositories.md`

---

## 03/11 14:08 — B1 ✔ ACL + S2-domínio Cofre

### O que ficou pronto
`can(actor, action, resource)` + `assertCan` + adaptadores `authorizeContext` / `authorizeRecall` (≥60 casos). Cofre: kinds obrigatórios `constraint`/`decision` alimentam `compileContext` via `vaultSnapshot` / `compileVaultContext` (sem persistência). Revisão monotônica. Visibilidade workspace/project/persona/members. Obrigatório inacessível falha closed (`REQUIRED_CONTEXT_UNAVAILABLE`).

### Arquivos
- `packages/persona/persona-core/src/domain/acl.ts`
- `packages/persona/persona-core/src/domain/vault.ts`
- `packages/persona/persona-core/src/domain/schemas.ts` (`ACL_DENIED`)
- `packages/persona/persona-core/tests/acl.spec.ts`
- `packages/persona/persona-core/tests/vault.spec.ts`

---

## 03/11 14:04 — P1 ✔ persona_ + S1-complemento templates

### O que ficou pronto
Constante única `PERSONA_TOOL = 'persona_'`. Mensagens de `USER_ERRORS` e `STATUS_REQUEST` usam `persona_*`. `RECOVERY_NOTE` exportado. `REASONS.hostRestarted` = `host restarted`. Teste varre `src/core` e prova que não há `orchestrator_`. Templates Agência (`agency`) e Escritório (`office`) com 1 coordenação + 1 vigia cada.

### Arquivos
- `packages/persona/persona-engine/src/core/{ids,errors,tickets,assignments,reasons,index}.ts`
- `packages/persona/persona-engine/tests/persona-tool.spec.ts`
- `packages/persona/persona-core/src/domain/{templates,schemas}.ts`
- `packages/persona/persona-core/tests/domain.spec.ts`

---

## 03/11 14:00 — P0 ✔ src/core verbatim + NOTICE

### O que ficou pronto
15 arquivos do protótipo em `persona-engine/src/core` (commit 8c32a9d) + `core-engine.spec` (113 `it`) + `stage.spec` + `NOTICE` (MIT) em `package.json` `files`. Modelo removido de `persona-core/src/engine/*` (core = domínio puro). Sem import `@deepseek-ai` em `persona-engine/src`. Dois imports mortos do protótipo removidos para `noUnusedLocals`.

### Arquivos
- `packages/persona/persona-engine/src/core/*` (15)
- `packages/persona/persona-engine/src/index.ts`
- `packages/persona/persona-engine/NOTICE`
- `packages/persona/persona-engine/tests/{core-engine,stage}.spec.ts`
- `packages/persona/persona-core/src/index.ts` (parou de reexportar engine)

### Comandos e saída verbatim (onda P0–P2a)

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
 Test Files  10 passed (10)
      Tests  265 passed (265)
   Start at  14:08:39
   Duration  2.01s
```

```
pnpm exec tsc -p packages/persona/persona-core/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-engine/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-core/src packages/persona/persona-engine/src/core/{ids,memory}.ts
(exit 0)
```

Oxlint em `src/core` verbatim do protótipo: stylistic/non-null do upstream (não reescrito). Sem `pnpm install`. Sem commit.

### Limitações / dúvidas
- `src/core` permanece idiomático do protótipo (non-null, linhas longas).
- D-038/D-039 não estavam em `DECISIONS.md`; P2a seguiu o brief (tenant = `projectId`). D-039 (review-thread) entra em P5.
- Próximo: P3a Effects → P4a Outbox/Passes → P5 kanban+review-thread → S3 → P11 → P12 → B4.

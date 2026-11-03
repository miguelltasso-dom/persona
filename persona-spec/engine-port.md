# Porte do Engine Super-agent → Persona

Dono: Forge (rascunho). Keel aprova e registra decisão se divergir de D-026. Fonte: `dsh-superagent-prototype` (MIT) em `C:/Users/migue/dev/_ext/dsh-superagent-prototype`, docs/001, 003, 007 e `src/core/*`. Persona: BRIEFING item 13, SCOPE.md, SUPERAGENT-ADOPTION.md.

Crédito: manter NOTICE/MIT do protótipo. Código usa os termos do protótipo (Trigger, Thread, Eval, Mandate, Ticket, Assignment, Subscription). UI em pt-BR (Assunto, Triagem, Tarefa, Autorização, Relato, Precisa de você).

## 1. Onde mora cada parte

| Peça do protótipo | Destino Persona | Estado (03/11) |
|---|---|---|
| `src/core` (15 arquivos: model, stage, reasons, ids, errors, ports, part, engine, intake, evals, tickets, assignments, replies, memory, index) | `packages/persona/persona-engine/src/core/` | P0: import verbatim do commit 8c32a9d + NOTICE |
| `tests/core-engine.spec.ts` (113) + `tests/stage.spec.ts` (1) | `packages/persona/persona-engine/tests/` | P0: 114 verdes |
| Store SQLite + afterCommit | `persona-store` (Anvil) contra a suíte de contrato do engine | P2a: port + memória; SQLite é do Anvil |
| Store SQLite + outbox + effects | `persona-store` + `persona-host` | Depois do Engine; uma transação por comando, efeitos após commit |
| Executor DSH | `persona-runners` via contrato `Runner` | Rivet; DSH **ou** CLI (OAR) |
| Sources Feishu/GitHub, panel, HTTP | Fora do v1 interno | GitHub no marco E; Feishu não |

D-026 deixa o Engine em `persona-engine`. O modelo (Trigger/Thread/Eval/Mandate/Ticket/Assignment) mora só em `persona-engine/src/core`. `persona-core` é domínio puro (persona, templates, Cofre, `compileContext`/`recall`). `persona-engine` não importa `@deepseek-ai/*` no `src`.

## 2. Mapa de conceitos → produto

| Protótipo | Persona | Notas |
|---|---|---|
| Source | Canal, DM, Rotina (depois GitHub) | `source: "channel" \| "dm" \| "routine"`. Meta do source não é interpretada pelo core |
| Trigger | Evento imutável (mensagem, rotina, webhook) | Idempotente; `human` + `addressed: mention \| direct` |
| Thread | Assunto | No máximo uma Eval por vez; Subscriptions no Thread |
| Channel (write) | Destino de resposta do assunto | Só quem tem **coordination** escreve no canal; executora reporta ao coordenador |
| Eval (gate + assessment) | Triagem | Gate determinístico (quem pode pedir, force) + modelo com regras editáveis |
| Mandate | Autorização da tarefa | Imutável; escopo maior = Ticket novo. Casa com ACL/proveniência do Cofre |
| Ticket | Tarefa / cartão do kanban | Só a Eval cria. Estado próprio, não segue a sessão |
| Assignment | Execução | Ticket ↔ persona executora; várias ao longo do tempo (handoff, retry) |
| Subscription | Persona segue o assunto | Pass-through: mensagem humana no assunto seguido vai à executora sem nova Eval |
| Report | Relato | progress / waiting / ready / blocked / failed / dropped |
| Attention | Precisa de você | Uma pergunta por vez |
| Main Session / Router | Função **coordination** (atribuída) | Não é mais “Atlas fixo” |
| Executor Session / Worker | Persona executora | Runner DSH ou CLI; um diretório/worktree por Ticket |
| Watchdog | Função **watchdog** (atribuída) | Sessão barata, independente; padrão no template: Luna |

Kanban = `ticketStage` (em `persona-engine/src/core/stage.ts`):

| Coluna UI | Estágio |
|---|---|
| A fazer | `working/queued` |
| Em andamento | `working` |
| Em revisão | `person/review` (`ready`) |
| Bloqueado / Precisa de você | `person/answer`, `person/blocked`, `person/failed`, `person/delivery` |
| Aguardando evento | `idle` (`waiting`) — chip, não coluna |
| Concluído | `ended` |

`agentTeams` nativo fica só para equipe interna de uma executora (SUPERAGENT-ADOPTION §2). Overlay (próxima ação, evidência) mora no Ticket.

## 3. O que muda porque a coordenação é atribuível

No protótipo o Router é **uma** Main Session fixa (`orchestrator`). No Persona:

1. **Resolve, não hardcode.** Cada comando que no protótipo fala com “a main Session” resolve `coordinationHolders(personas, workspaceId)` (já no core). Zero ou um. Se zero: sem Eval automática; o canal só anda por @menção direta (SCOPE §1). Sem Session de router ociosa.
2. **Troca a quente.** `assignSystemRole(..., 'coordination')` move a função e tira do anterior. Efeitos: encerrar a Session de router da persona antiga (ou deixá-la fria); criar/retomar a da nova; Evals em curso vão `policyChanged` / requeue (não cancelar Tickets). Mandates já emitidos continuam válidos.
3. **Identidade no Source.** Trigger `addressed` usa o nome/id da persona que **hoje** coordena, mais @menções a qualquer executora. Uma @menção a executora pode virar Assignment direta (sem Eval) ou pass-through se ela segue o assunto — política a fechar no porte de Evals.
4. **Quem responde no canal.** `Replies` / Outbox: só coordination envia `acknowledgement` / `answer` / `result` no canal. Relatos da executora viram Input/relay para o coordenador, nunca mensagem crua no canal (SUPERAGENT-ADOPTION §3.7).
5. **Watchdog** não é Source nem Executor de Ticket. É uma Session agendada da persona com a função; lê estágios/relatos e pode propor mudança de prompt/regra. Trocar o vigia não move Tickets.
6. **Agente cria agente.** Fora do Engine. `PersonaProposal` + `assertProposalWithinCreatorAccess` (core). Aprovação vira Attention no assunto / “Precisa de você”. Auto-approve só quando a spec ≤ acesso do criador.
7. **Cofre.** `brief`/`constraint`/`decision` obrigatórios entram no `compileContext` de **toda** Eval e de todo turno de executora. Proveniência e visibilidade já no core. O Engine não autoriza: chama `authorize` do host.
8. **Pass-through.** Subscription continua no Thread. “Executor segue o assunto” = a **persona** inscrita, não a Session DSH. Se a persona troca de runner (DSH↔CLI) entre turnos, a Subscription permanece; a Assignment seguinte usa o runner novo.

Papéis do Engine (`EngineForMainSession`, etc.) passam a ser papéis de **função**, não de animal:

- `EngineForCoordinator` — o que era Main Session (candidate, decide, attach, reply, note)
- `EngineForExecutor` — inalterado (report, handback, follow)
- `EngineForPeople` — usuário (stop, retry, unsubscribe)
- `EngineForSources` — canais/DMs/rotinas
- Sem coordenador, `decide`/`candidate` recusam com código próprio (`coordinationUnassigned`); Sources ainda gravam Trigger.

## 4. Contrato do Engine (o que copiar à risca)

De 007: um escritor (Engine); métodos síncronos; uma transação por comando; portas enfileiram efeito **dentro** da transação; adapters executam **depois** do commit; `UserError` em pedido inválido; nomes imperativos vs passado (`stopTicket` vs `assignmentStarted`).

Partes e dependências (mesma ordem):

```
Intake → Tickets
Evals  → Tickets
Tickets → Replies
Assignments → Tickets, Replies
Replies → (nada)
```

Comandos que atravessam partes (`attach`, `evaluateDue`, `policyChanged`) continuam no `Engine` que dona a transação.

Outbox: um recibo por mensagem; `reply` effect; ordem por (Ticket, conversa); retry 5s…300s; drop só quando o Source diz que o destino morreu.

Effects: `assessment`, `launch`, `delivery`, `relay`, `notice`, `reply` — mesmos limites de concorrência e backoff. `launch`/`delivery` passam pelo `Runner` (não só DSH).

`ticketStage` / `canRetry` / `waitsForPerson` / `followupOwners` / `settled` já no core: o Engine **não** reimplementa.

## 5. Adaptar, não copiar

- **Sources internos primeiro:** canal e DM (ator = memberId; `addressed` por menção/DM); rotina (`human: false`). GitHub no marco E. Sem Feishu.
- **Executor:** `prepareTicket` cria worktree; Assignment nomeia `personaId` + `runner`. Slot e limite 30 min / shell 5s valem para DSH e CLI. Cursor sem MCP: ferramentas Persona `unavailable`.
- **Policy:** versão hasheia regras + modo accept + partes de Source **+ revision do Cofre** (decisões/restrições obrigatórias). Troca no Cofre = `policyChanged` nos Tickets que usam esses factKeys.
- **IDs:** `key(...)` do protótipo (sha256 32 hex). Não escrever no formato de sessão DSH (D-021): `session_binding` / `run` no store.
- **UserError:** portar códigos de Ticket/Eval/Assignment/reply; omitir `panelOnly*`, setup GitHub/Feishu, prompts do painel até existirem equivalentes.
- **Prompts:** `orchestrator.md` → persona com coordination; `worker.md` → executora. pt-BR, identidade da persona, sem assumir “Atlas”.
- **Texto do canal:** ≤ 100 palavras, só decisão/resultado/bloqueio.

## 6. Ordem do porte (próximo briefing do Keel)

1. `ids.ts` + `errors.ts` (núcleo) e `ports.ts` (interfaces) em `persona-engine`.
2. `part.ts` + Engine vazio com `Pick` por função (Coordinator, não MainSession).
3. Intake (Trigger de canal/DM) + testes em memória (`memory.ts`).
4. Evals + gate: sem coordenador → sem assessment; @menção direta → force explicit.
5. Tickets + Assignments + `ticketStage` (já testado no core).
6. Replies + porta Outbox (host implementa).
7. `evaluateDue`, pause, `policyChanged`, resume após restart.
8. Ligar `Runner` (Rivet) em `launch`/`delivery`.

Aceite de cada passo: specs do protótipo equivalentes (`tests/core-engine.spec.ts`, `stage.spec.ts` já verde no core) + os casos Persona: zero coordenadores, troca de coordenador no meio de Eval, proposta sem escalar acesso, Cofre obrigatório no manifesto.

## 7. Fora deste porte

UI, Electron, Cloudflare, importadores, canvas. `kanban-bridge` nativo não é o quadro da v1. Não rodar CLIs reais sem liberação do Atlas.

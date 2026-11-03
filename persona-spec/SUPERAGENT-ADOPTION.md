# Persona × Super-agent — decisão de adoção (Atlas, 03/11/2026)

Pedido do Miguel: ler "Exploring Super-agent Design: Towards a More Autonomous Agent System" (@DeepSeekHarness, 01/11/2026, https://x.com/DeepSeekHarness/status/2116857257245987236) e trazer o que vale **de forma nativa** ao nosso fork, mantendo o app desktop. Protótipo oficial: `github.com/deepseek-ai/dsh-superagent-prototype` (MIT, bundle DSH, TypeScript, `node:sqlite`, cópia de leitura em `C:\Users\migue\dev\_ext\dsh-superagent-prototype`). Leia `docs/000`–`007` dele antes de implementar.

**Esta decisão é de alta demanda e já está tomada.** Ela atualiza o PLAN.md: o Keel incorpora e reordena tarefas.

## 1. Mapa de conceitos (código usa os termos do protótipo; UI usa PT-BR)

| Super-agent | Persona (UI) | Observação |
|---|---|---|
| Router / Main Session | **Função "Coordenação"** — atribuída pelo usuário a qualquer persona (no template inicial, Atlas). Ver SCOPE.md §1 | Sessão longa, sem Bash, faz triagem, despacha e é o único que responde nos canais. Lote de eventos durante uma inferência entra na próxima chamada. |
| Worker / Executor Session | **Persona executora** (Bento, Nina, Sol…) | Uma sessão + um diretório (worktree) por Tarefa. Nunca fala direto com o canal: reporta ao Atlas. Pode usar subagentes ou Agent Team por dentro. |
| Source | Origem | Canais e DMs internos, Rotinas (fonte temporal), GitHub; depois e-mail, Telegram/WhatsApp, calendário. |
| Trigger | Evento | Imutável, idempotente, com ator. |
| Thread | **Assunto** | Mensagens/eventos em ordem; no máximo uma triagem por vez. |
| Eval (gate + assessment) | **Triagem** | Gate determinístico (quem pode pedir, força explicit/inferred) + avaliação do modelo com regras em linguagem natural editáveis. |
| Mandate | **Autorização da tarefa** | Escopo, força, versão da política, quem pediu. Imutável; escopo maior = tarefa nova. Casa com a nossa ACL/proveniência. |
| Ticket | **Tarefa** (cartão do kanban) | Só a triagem cria. Estado próprio, não segue a sessão. |
| Assignment | Execução | Vínculo tarefa ↔ persona executora; várias ao longo do tempo (handoff, retry). |
| Subscription | Persona **segue** o assunto | Muitos-para-muitos; mensagem de pessoa num assunto seguido vai direto à executora sem nova triagem (pass-through: −30% decisões do router, −37% tokens no estudo). |
| Report | Relato | progress · waiting · ready · blocked · failed · dropped. |
| Attention | **"Precisa de você"** | Pergunta estruturada, uma de cada vez. |
| Watchdog | **Vigia** (sugestão: Luna, a gata observadora) | Sessão independente agendada, modelo barato; detecta falha de infra, loop improdutivo e desvio do objetivo; pode ajustar prompts/regras. |

## 2. Kanban = estágios do Ticket (substitui a dependência do board nativo)

O board nativo `agentTeams` não tem revisão/bloqueio e exige Lead residente (achados F4/F14). O modelo de Ticket do protótipo já tem os estágios certos. **Decisão: o kanban da Persona é a projeção dos estágios de Ticket do nosso engine (SQLite próprio)**; `agentTeams` fica só para equipes internas de uma executora.

| Coluna | Estágio do protótipo (`src/core/stage.ts`) |
|---|---|
| A fazer | working/queued |
| Em andamento | working |
| Em revisão | person/review (Report `ready`) |
| Bloqueado / Precisa de você | person/answer, person/blocked, person/failed, person/delivery |
| Aguardando evento | idle (Report `waiting`) — chip no cartão, não coluna |
| Concluído | ended |

`kanban-bridge` vira opcional/legado; o overlay de metadados (próxima ação, evidência) mora no Ticket.

## 3. O que portar e como

1. **Engine** (`src/core/*`: engine, model, stage, reasons, parts Intake/Evals/Tickets/Assignments/Replies, ports) → `persona/engine` (`@persona/engine`). Portar com crédito (MIT) em NOTICE. Comandos síncronos, uma transação por comando, efeitos após commit (outbox). Adaptar `Repositories` ao `@persona/store`.
2. **Executor** (`src/executor/dsh.ts`) → generalizar para o contrato `Runner` do Rivet: executora pode ser DSH direto **ou** CLI delegada (Claude Code/Codex/Cursor/OpenCode via OAR). Regras do protótipo valem: shell em foreground vira job em background após 5 s; 30 min de limite pós-turno; slot extra reservado para mensagem de pessoa; concorrência configurável; retomada após reinício com nota de recuperação.
3. **Prompts** (`prompts/orchestrator.md`, `worker.md`, `dispatch.md`, `replies.md`, `subscriptions.md`, `handoff*.md`, `team/*`) → base dos prompts do Atlas e das executoras, traduzidos/adaptados à identidade das personas.
4. **Sources**: implementar `Source` interno (canais/DMs/rotinas) primeiro; portar `src/sources/github*` como origem externa no marco E. Feishu não.
5. **Full-duplex assíncrono**: ligar o modo async `start()/stop()` do DSH para o Atlas (já existe no Harness, desligado por padrão) — conversa nunca trava esperando ferramenta.
6. **Inline & Spill + Chain of Recall** em `@persona/context`: todo objeto (mensagem, assunto, tarefa, decisão, sessão executora) tem ID; ao injetar, inline de ID + resumo + IDs dos vizinhos; conteúdo longo vira ponteiro; ferramenta `persona_recall(id)` percorre a cadeia. Somar ao `compileContext` (obrigatórios + orçamento) que já temos — autorização continua valendo em cada salto.
7. **Saída multicanal**: só o Atlas responde nos canais; raciocínio/ferramentas das executoras nunca vazam. Chat: ≤ 100 palavras, sem ruído, avisa só decisão/resultado/bloqueio. GitHub/e-mail: estruturado e denso.
8. **Proatividade**: regras escritas pela equipe; trabalho não pedido começa em modo **"só registrar o que faria"**; execução especulativa ("agir antes") é opt-in por regra e entrega só o que for útil.
9. **Filosofia de atenção** ("mínima atenção humana, máximo valor") vira princípio de UX junto com RCD: Visão geral mostra primeiro o que precisa de pessoa; estado saudável não ocupa espaço.
10. **Benchmark** do marco F reproduz o experimento de batching do router e a ablação pass-through com cargas sintéticas.

## 4. Compute / estado / ambiente e equipes à distância (marco E)

- **Desktop = compute + ambiente (BYOM nativo).** Cada membro roda suas personas na própria máquina, com as próprias CLIs/assinaturas. Credenciais e logins nunca saem do dispositivo ("compartilhar a persona não compartilha a assinatura").
- **Estado compartilhado na nuvem mais barata: Cloudflare** (Supabase descartado pelo Miguel):
  - **Durable Object por workspace**: ponto único de ordenação/sequência e WebSocket em tempo real (hibernation API — não cobra conexão ociosa).
  - **D1** (SQLite) para o log de eventos e projeções compartilhadas; **R2** para arquivos/artefatos (sem egress).
  - **Worker** como API de convites/autenticação e receptor público de **webhooks** (GitHub etc.), repassando ao desktop dono via DO — resolve "Source externa precisa de endpoint público" sem servidor próprio.
  - Custo: free tier cobre equipes pequenas; Workers Paid US$ 5/mês quando passar. fly.io fica como plano B (exige operar máquina/volume).
- **Local-first**: SQLite local continua fonte da verdade do dispositivo; sincroniza o log de eventos com sequência por stream (já previsto no recall). DMs e conteúdo privado não sobem sem compartilhamento explícito; payload pode ir cifrado com chave do workspace (DO vê só metadados de roteamento).
- **Roteamento entre máquinas**: tarefa atribuída a uma persona é executada na máquina que hospeda aquela persona/conexão; dispositivo offline retoma ao reconectar (o protótipo já trata Assignment interrompida).

## 5. Impacto no plano (Keel ajusta PLAN.md)

- B: portar engine + store + prompts; Atlas como Router sobre DSH async.
- C: kanban/Visão geral/"Precisa de você" sobre estágios de Ticket; assuntos e pass-through na conversa.
- D: executoras via Runner (DSH e CLIs); slots, jobs em background, retomada; Vigia.
- E: Cloudflare sync (DO + D1 + R2), convites, webhooks, origem GitHub, proatividade com modo registro.
- F: benchmarks de batching/pass-through. G: canvas sobre os mesmos objetos.

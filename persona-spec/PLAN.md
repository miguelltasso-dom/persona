# Persona — plano de execução (PLAN.md)

Dono: Keel (Tech Lead). Versão 1.1 — 03/11/2026 (Fase 0 + adoção Super-agent).
Fontes: `BRIEFING.md` (M1–M12), `SUPERAGENT-ADOPTION.md`, `UX-GUIDE.md`, `Persona-Arquitetura.md`, `Referencias-e-Integracao.md`, `AGENTS.md`, `docs/architecture.md`, protótipo MIT `dsh-superagent-prototype` (cópia em `C:/Users/migue/dev/_ext/dsh-superagent-prototype`) e as explorações do monorepo (`RECON.md`). Decisões técnicas: `DECISIONS.md`. Assets: `PLAN-assets-brush.md`. Regras dos builders: `BUILDER-RULES.md`.
Status: `todo` · `doing` · `blocked` · `done`. Só o Keel edita este arquivo; o status vivo também está no post-it `Persona · Status`.

> **Builders:** leiam `BUILDER-RULES.md`, `AGENTS.md` (não `CLAUDE.md`: neste Windows os symlinks viraram arquivos de texto) e os post-its antes de cada tarefa.

---

## 1. O que estamos construindo

Persona é um app desktop (Windows primeiro) em que uma **equipe persistente de agentes-animais** trabalha em **projetos**, conversa em **canais** e **DMs**, mantém um **quadro kanban**, **arquivos** e **rotinas**, com **contexto explícito e recuperável**, **skills próprias** e **uso e limites** honestos — sobre uma arquitetura **Super-agent** nativa:

- **A persona com a função Coordenação (no template inicial, Atlas) é o Router**: sessão DSH longa, sem Bash: recebe Triggers dos assuntos, faz a **Triagem** (Eval), cria **Tarefas** (Tickets com Mandate), despacha e é o **único que responde** nos canais (≤100 palavras, só decisão/resultado/bloqueio).
- **Todas as demais personas são executoras (Workers) quando recebem uma Tarefa**: uma sessão + um diretório (worktree) por Tarefa, executadas por um **Runner**: DSH direto **ou** CLI delegada (Claude Code, Codex, Cursor agent, OpenCode, via OAR). Reportam ao Atlas (progress · waiting · ready · blocked · failed · dropped); nunca falam direto com o canal.
- **Vigia (watchdog)** = função atribuível a qualquer persona, agendada (sessão independente, modelo barato; no template, Luna) detecta falha de infra, loop improdutivo e desvio de objetivo.
- **Filosofia de atenção** ("mínima atenção humana, máximo valor"): a Visão geral mostra primeiro o que **precisa de você**; estado saudável não ocupa espaço; proatividade nasce em modo "só registrar o que faria".

Tudo roda localmente (host Node derivado do host do Harness, SQLite próprio). Em equipes à distância (marco E) cada membro roda suas personas na própria máquina e o estado compartilhado vive na Cloudflare, local-first, sem credenciais saindo do desktop.

---

## 2. Achados da exploração que moldam o plano

| # | Achado | Consequência |
|---|---|---|
| F1 | O Harness já embute o **OAR** (`@botiverse/oar` 0.67.0, Apache-2.0, patch local): runtimes Claude/Codex/OpenCode/Cursor(`@cursor/sdk`), login/`authStatus`, `listModels`, sessões com eventos, `steer`, **retomada**, `usage()`, **`accountUsage()`**, `serveMcpTools`, `scriptedRuntime` de teste. Só Claude e Codex têm e2e upstream. | Runners de CLI = camada fina sobre OAR (D-009); spike A4. Cursor sem MCP. |
| F2 | `subagent-*` do Harness: one-shot, só resposta final. | Não servem de runner. |
| F3 | `ctx.agents.create/resume` + `followup/steer/inject/cancel/whenIdle`, `session/event`, `agent/assistant-stream`; o protótipo Super-agent usa exatamente isso e o modo async start/stop. | Router e Runner `dsh`. |
| F4 | ~~Ponte do board nativo~~ **Superado:** o kanban é a projeção dos estágios de Ticket do engine (SUPERAGENT-ADOPTION §2). `agentTeams` só dentro de uma executora. O bug do `kanban-bridge.mjs` (todo `in_progress`→bloqueado) fica documentado (D-024) caso o bridge seja retomado. | A2 opcional/legado; D-011/D-012 superadas (D-029). |
| F5 | `node:sqlite` (FTS5 ok) é o único driver; `storage` é KV; `session-query-sqlite` mostra o padrão mas reseta schema (proibido). Protótipo também usa `node:sqlite`. | Banco próprio (D-007), spike A5. |
| F6 | Cliente = plugins Cordis/slots; o Electron encaminha `/api` ao host; RPC de domínio sem IPC. | Um plugin de cliente `client-ui-persona` com Remote próprio (D-004/D-027). |
| F7–F8 | Credenciais em texto puro; `safeStorage` só no main; `llm-pi-ai` OAuth de assinatura = risco de política. | Cofre DPAPI (D-015). |
| F9 | Telemetria (3 canais), Welcome, updater, política mandatória, publicação: tudo DeepSeek. | Desacoplar (D-016, A3b). |
| F10 | Enumeradores do build são fixos em `packages/*/*`. | Grupo `packages/persona/*` (D-002). |
| F11 | CLIs locais: Claude 2.1.317, Codex 0.166.0, `cursor-agent` 2026.10.22, OpenCode 1.19.3; `agent` = Grok. | Detecção explícita. |
| F12–F13 | Marca/licença; OAR não responde aprovações. | D-017, D-013. |
| F14 | Esta máquina: sem VS Build Tools/SDK, sem `pwsh`, long paths off, symlinks off, Electron não instalado, Playwright/Chromium divergentes. | §5; riscos R17–R19. |
| F15 | **Super-agent:** modelo de domínio, gate/assessment, Mandate imutável, Subscription/pass-through (−30% decisões do router, −37% tokens no estudo), Assignment por Executor, outbox, retomada de Assignment interrompida, regras do Executor (shell>5 s vira job em background, limite de 30 min pós-turno, slot reservado para mensagem de pessoa), prompts de orquestrador/worker. MIT. | Engine próprio `persona-engine` (porte, D-030); `Runner` generaliza o executor (D-031). |
| F16 | O protótipo **não** tem (a confirmar no digest): Vigia, Inline & Spill/Chain of Recall, full-duplex do Router, nuvem/sync. | Implementação nossa (D-032, D-033). |
| F17 | Cloudflare (DO + D1 + R2 + Worker) cobre sync, convites e webhook público com free tier; deploy exige conta/credenciais do Miguel. | Marco E com testes locais (Miniflare); **deploy só com liberação do Atlas** (D-034). |

---

## 3. Arquitetura-alvo no monorepo

### 3.1 Pacotes

```
packages/persona/                        (grupo dentro de packages/, D-002; nomes @deepseek-ai/dsh-persona-*)
  persona-core/      puro: IDs ramificados, entidades, ACL, compileContext+recall (porte), Inline&Spill, Chain of Recall
  persona-engine/    Super-agent: Trigger/Thread/Eval/Mandate/Ticket/Assignment/Subscription/Report/Attention, stages, outbox, ports
  persona-store/     SQLite (node:sqlite): migrations, repositórios do engine e do produto, event log, FTS5, backup
  persona-host/      plugin Cordis + controlador Typert (@Remote): Intake, Router (Atlas), Vigia, rotinas, arquivos, import
  persona-runners/   contrato Runner (executoras) + `dsh` + OAR (claude/codex/opencode/cursor) + ferramentas MCP
  persona-vault/     CredentialProvider DPAPI
  persona-usage/     livro de uso medido, cota oficial, estimativas rotuladas
  client-ui-persona/ plugin de cliente (theme, shell, chat, team, board, files, routines, usage, connections, onboarding, import, canvas)
  persona-app/       bundle/perfil `persona`
  persona-e2e/       harness de teste de ponta a ponta
  persona-sync/      (marco E) cliente de sincronização com a Cloudflare
apps/persona-edge/   (marco E) Worker + Durable Object + D1 + R2 (Cloudflare), com testes locais
persona-assets/      masters e referências do Brush
```

### 3.2 Fluxo (Super-agent sobre a Persona)

```
Source (canal/DM/rotina; depois GitHub, e-mail, mensageiros) ──Trigger (imutável, idempotente, com ator)──▶ Thread (= Assunto)
  Thread ──lote──▶ Eval = Gate determinístico (quem pode pedir, força explicit/inferred) + Assessment (modelo; regras em PT-BR editáveis)
       ├─ accept → Ticket (Tarefa) com Mandate imutável (escopo, força, versão da política, quem pediu)
       ├─ stop / ignore / unavailable → registrado (Disposition)
  Ticket ──Assignment──▶ Runner (executora: DSH direto | CLI via OAR), 1 sessão + 1 diretório por Tarefa
  Subscription: persona segue o Assunto → mensagem de pessoa vai direto à executora (pass-through, sem nova Eval)
  Report (progress|waiting|ready|blocked|failed|dropped) ──▶ Atlas ──▶ Reply (só o Atlas fala; multicanal)
  Attention ("Precisa de você"): pergunta estruturada, uma por vez
  Vigia: sessão independente agendada ──▶ ajusta prompts/regras, alerta
```

Fixos herdados da spec: um run mutante por tarefa; cancelar é comando do host; troca de modelo entre turnos preserva assunto/tarefas/decisões; toda resposta pertence ao assunto/run capturados; Recall exato por ID/data; autorização vale em cada salto.

### 3.3 Persistência (D-007, D-008, D-021)

`<PERSONA_HOME>\db\persona.db` (WAL; `PERSONA_HOME` passado como `DSH_HOME`, padrão `%USERPROFILE%\.persona`); `node:sqlite` com `foreign_keys`, `busy_timeout`, `STRICT`, `application_id` próprio, `user_version` monotônico, **backup (`VACUUM INTO`) antes de migrar**, migrações imutáveis; escrita síncrona curta em `BEGIN IMMEDIATE`; nunca `await` em transação. Esquema v1 = tabelas do engine (trigger, thread, eval/decision, mandate, ticket, assignment, subscription, report, attention, input, disposition, outbox, source cursor, policy) **+** produto (workspace, member, project, persona, participation, channel, dm, event/mensagem por stream com `seq`, decision, memory, artifact, session_binding, run, usage_record). Marcos seguintes: routine/routine_run, skill*, handoff, invite/grant, import_job, relation/position. `persona-store` implementa os `Repositories` do engine. Segredos nunca no banco.

### 3.4 Execução (D-009, D-013, D-018, D-031)

**Router (Atlas):** sessão DSH longa criada por `ctx.agents`, modo async `start()/stop()` (conversa nunca trava esperando ferramenta); lote de eventos recebidos durante uma inferência entra na próxima chamada; sem Bash; ferramentas de domínio (decidir, despachar, responder, perguntar, recall) registradas no escopo do agent.

**Contrato `Runner`** (`persona-runners`; executoras): `capabilities()`, `health()`, `authenticate()`, `startTurn(input)→RunHandle`, `events()`, `cancel()`, `usage()`. Executor "padrão do protótipo" (`src/executor/dsh.ts`) generalizado: shell em foreground vira job em background após 5 s; limite de 30 min pós-turno; slot extra reservado para mensagem de pessoa; concorrência configurável; retomada após reinício com nota de recuperação.

| Runner | Como executa | Streaming/resume/cancel | Auth | Ferramentas Persona |
|---|---|---|---|---|
| `dsh` | `ctx.agents` por Tarefa (sessão+worktree) | sim/sim/`agent.cancel` | API key no vault ou DeepSeek | nativas no escopo do agent |
| `oar:claude` / `oar:codex` | OAR, sessão por Tarefa; **modo de permissão sempre explícito** | sim/id nativo+`cwd`/`abort` | login nativo | `serveMcpTools` |
| `oar:opencode` | OAR/ACP | sim/**só no mesmo `cwd`**/sim | `opencode auth` | `serveMcpTools` |
| `oar:cursor` | OAR + `@cursor/sdk@1.0.37` | sim/sim/sim | `Cursor.auth` | **indisponível** |

Aprovação interativa de ferramenta só no DSH direto; em CLI o modo de permissão é fixado na abertura (D-013). Uso: `usage_record` por run + cota oficial (OAR `accountUsage`, rollouts Codex) com origens `measured|estimate|official|unavailable`; ausente nunca é 0%. Proatividade e execução especulativa só por regra escrita, começando em "só registrar o que faria".

### 3.5 UI (um plugin de cliente; `UX-GUIDE.md` é lei)

Reaproveita shell, conexão/RPC, Markdown/diff, `ui-primitives`, árvore de arquivos; substitui na composição Persona: `ui-layout`, `ui-sidebar`, `ui-workspace`, `ui-brand-official`, Welcome DeepSeek (A7 verifica quais rows toleram).

| Superfície | Conteúdo (fonte de dados) |
|---|---|
| **Visão geral** | primeiro **"Precisa de você"** (Attention + Reports blocked/failed + revisões); depois andamento; saudável não ocupa espaço (Tickets) |
| Sidebar escura lilás | equipe, busca, Visão geral, Projetos, Kanban, Rotinas, Canais, Mensagens diretas, Uso e limites |
| Conversa (canal/DM) | mensagens por Assunto, resposta só do Atlas, cartões de tarefa citados, composer com seletor de modelo (identifica a persona), "Contexto usado", pass-through visível ("Bento está acompanhando") |
| Equipe | avatares, faixa "Sua equipe neste canal", poses por estado (Brush), perfil |
| Kanban | projeção dos estágios do Ticket: A fazer · Em andamento · Em revisão · Bloqueado/Precisa de você · Concluído; chip "Aguardando evento" |
| Arquivos, Rotinas, Uso e limites, Conexões, Onboarding, Import, Canvas | conforme marcos |

Movimento, RCD, qualidade: `UX-GUIDE.md` (tokens `--motion-*`, `usePersonaMotion`, FLIP, reduced-motion, pausa fora de tela, estado = ícone+texto, `zzz` só ocioso). Barra de "done" de UI: tokens/paleta D + assets do Brush; checklist das lentes (craft, AA, usabilidade, microcópia); screenshots claro/escuro vs `dirD-tela.png` (Probe); teclado; reduced-motion; sem jank; estados vazio/carregando/erro/cheio.

### 3.6 Desktop e empacotamento (D-016, D-028)

`apps/desktop*` transformados no lugar: fumaça sem renomear → desacoplar DeepSeek (telemetria, Welcome, updater, política) + marca → template `persona` + `PERSONA_HOME` → neutralizar publicação e renomear produto/appId/protocolo/exe nos scripts → ativos/strings. Pacote Windows sem assinatura; CLIs de terceiros não vão no pacote.

### 3.7 Equipes à distância (marco E; D-034)

Desktop = compute + ambiente (BYOM): cada membro roda suas personas, com as próprias CLIs/assinaturas; credenciais nunca saem. Estado compartilhado na **Cloudflare**: **Worker** (convites/auth, receptor público de webhooks → DO), **Durable Object por workspace** (ordenação/sequência por stream, WebSocket com hibernation), **D1** (log de eventos e projeções compartilhadas), **R2** (arquivos/artefatos). SQLite local segue sendo a fonte da verdade do dispositivo; sincroniza o log por stream; DM/privado não sobe sem compartilhamento explícito; payload pode ir cifrado com chave do workspace. Tarefa atribuída a uma persona roda na máquina que a hospeda; offline retoma ao reconectar. Construção e testes locais (Miniflare/`wrangler dev`); **deploy/conta exigem liberação do Atlas**. Plano B: fly.io.

---

## 4. Equipe, donos e diretórios (disjuntos) — atualizado em 03/11 (Atlas: Anvil, Lumen e Muse recrutados)

| Agente | Papel | Dono | Não toca |
|---|---|---|---|
| **Keel** | Plano, decisões, integração, **B9** (bundle/perfil), commits/push, fiação raiz, placar no post-it Status, leitura periódica de `persona-spec/reports/*.md` | `persona-spec/`, `packages/persona/persona-app/`, `packages/util/official-bundles/`, `scripts/persona/`, raiz (`pnpm-workspace.yaml`, `package.json`, `tsconfig*.json`, `vitest*.ts`, `.gitignore`, `lefthook.yml`) | funcionalidade (exceto colas) |
| **Forge** (Cursor Grok 4.6 fast) | Domínio puro e **engine Super-agent** | `persona-core`, `persona-engine` (P0, P1, P2a, P3a, P4a, P5, P11, P12, B1, S1, S2-domínio, S3, B4, P13-sinais, ideias do ai-memory) | `persona-store`, `persona-host`, `persona-runners`, `apps/desktop*`, `packages/client` |
| **Anvil** (Cursor Grok 4.6 fast) | **Persistência e host** | `persona-store`, `persona-host`, `persona-sync`, `apps/persona-edge` (B2a/B2b/B2c, S2-store, P2b/P3b/P4b SQLite, B3, B7, C1a–c, C3, C4, S4-host, marco E de nuvem) | `persona-core`, `persona-engine`, `persona-runners`, `packages/client` |
| **Rivet** (Cursor Grok 4.6 fast) | Execução, credenciais, uso, desktop/empacotamento | `persona-runners`, `persona-vault`, `persona-usage`, `apps/desktop/`, `apps/desktop-host/`, `apps/cli/` (exceto a linha de dependência do bundle, do Keel), `packages/{boot,credentials,llm,telemetry}`, `packages/session/session-telemetry-*`, `packages/host/product-telemetry-otel`, `packages/util/home-paths` (A3b, R-1, P6–P9, R-2, D1a/b, D2, D3, D4a, D5a, D7, D8, spike ai-memory) | `persona-store`, `packages/client`, `apps/web` |
| **Prism** (Cursor Composer 2.5 fast) | UI: fundação e fluxo principal | `client-ui-persona/src/client/{theme,motion,primitives,shell,overview,chat,team,onboarding,persona-editor,hire,locale}`, `packages/client/**` (mínimo), `apps/web/**` (A7, S5, S6-editor, C5a–d, C8) | `persona-host`, `apps/desktop*`, subpastas do Lumen |
| **Lumen** (Cursor Composer 2.5 fast) | UI: superfícies de dados | `client-ui-persona/src/client/{kanban,files,routines,usage,connections,knowledge}` (C6a/b, S6-Conhecimento/Cofre, C7a/b, D5b, D4b) | `persona-host`, `apps/desktop*`, subpastas do Prism |
| **Probe** (Cursor Composer 2.5 fast) | Testes e E2E, verificação contínua | `persona-e2e`; único (com o Keel) que roda builds/empacotamento/E2E de ponta a ponta | produção |
| **Muse** (Opus, Diretora de Design — recrutada pelo Atlas em 03/11) | Identidade visual e design system: `persona-spec/DESIGN-SYSTEM.md`, tokens/tema/primitivos e specs de passes visuais que Prism e Lumen aplicam (D-050) | `persona-spec/DESIGN-SYSTEM.md`, `client-ui-persona/src/client/{theme,primitives}` | `persona-host`, `persona-engine`, telas dos outros (só especifica; quem implementa a tela é o dono dela) |
| **Brush** (GPT Terra 6.1) | Imagens | `persona-assets/` | tudo o mais |

Regras (resumo; completas em `BUILDER-RULES.md`): **relato em `persona-spec/reports/<nome>.md` + uma linha no post-it `Persona · Status`, e seguir direto para a próxima tarefa** (`maestri ask "Keel"` só para dúvida bloqueante: ele bloqueia o builder até a resposta); testes ao lado do código; contratos entre donos (`persona-engine` ports, `persona-host` `@Remote`/`types.ts`, `Runner`, ports de repositório) mudam via Keel — **o port é do produtor (Forge/Rivet) e a implementação SQLite é do Anvil, validada pela mesma suíte de contrato**; builds/launch só sob `scripts/persona/with-lock.mjs`; só o Keel comita; `pnpm install` só o Keel; relato com saída verbatim; testes de cliente em pacotes fora de `packages/client/` usam o sufixo `*.client.spec.ts(x)` (senão entram no typecheck do host).

---

## 5. Ambiente e pré-requisitos (Windows 11, esta máquina)

| # | Pré-requisito | Quem | Aprovação | Para |
|---|---|---|---|---|
| E1 | Build base do Atlas | Atlas | feito (03/11) | — |
| E2 | `pnpm --filter @deepseek-ai/dsh-desktop exec install-electron` | Rivet | não | `dev:desktop`, A5 |
| E3 | Playwright por `channel: 'chrome'` (Chrome 156 instalado) | Probe | não | E2E |
| E4 | VS C++ Build Tools + Windows SDK (`winget …VCTools`); `pwsh` 7 recomendado | Miguel/Atlas | **sim** (admin) | D8 |
| E5 | `LongPathsEnabled=1`, Developer Mode, exclusão do Defender p/ `.desktop-build` | Miguel/Atlas | **sim** | D8 |
| E6 | `core.symlinks=true` + re-checkout | — | não fazer agora | — |
| E7 | Conta Cloudflare / `wrangler login` | Atlas/Miguel | **sim** (credenciais/gasto) | deploy do marco E |

---

## 6. Qualidade e aceite

- Aceite = **teste automatizado passando + comportamento verificado no app rodando** (M6), sem revisão de código; "(app)" = Tier 1/2 de E2E com captura anexada. Contagens de teste fazem parte do aceite.
- Por tarefa: `pnpm exec vitest run packages/persona/<pkg>`, `pnpm exec tsc -p packages/persona/<pkg>/tsconfig.json --noEmit` (testado: funciona por pacote), `pnpm exec oxlint <arquivos>`. Fim de marco (Keel/Probe, sob a trava): `pnpm run typecheck` e `build:check`.
- TS estrito; código/comentários em inglês; UI/docs do produto em pt-BR; sem texto fixo em JSX.
- **Barra de UI** (UX-GUIDE §4) em toda tela; Atlas guarda o guia.
- Testes obrigatórios de integração (spec §11, 13 cenários) + cenários do Super-agent: idempotência de Trigger, uma Eval por Thread, Mandate imutável (escopo maior = Ticket novo), pass-through sem Eval, Assignment interrompida retoma, outbox só após commit, "estado saudável não ocupa espaço" na Visão geral. Cada um tem tarefa dona.
- CLIs reais só opt-in (`PERSONA_REAL_CLI=1`) e liberadas pelo Atlas (D-022); rotina usa `scriptedRuntime` e executáveis falsos.

---

## 7. Marcos e tarefas

### Fechamento v1 — tarefas do SCOPE (BRIEFING item 13; D-043..D-046) — entram na fila na ordem de SCOPE §4

Prevalece sobre trechos que sugerem equipe fixa: **o usuário monta a equipe**; "Coordenação" (Router) e "Vigia" são **funções** atribuíveis a qualquer persona; Atlas/Bento/Nina/Sol/Luna são só o template inicial. Onde o plano abaixo diz "Atlas", leia "a persona com função Coordenação".

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| S1 | **Persona personalizável** em `persona-core/domain`: entidade (nome, avatar {gallery|upload|silhouette}, cargo, descrição, personalidade, instruções, runner/modelo, ferramentas por nível, skills, memória, limites, horário, `reportsTo`, projetos/canais), **templates** (Equipe inicial Atlas/Bento/Nina/Sol/Luna, Startup de software, Agência, Escritório, Em branco), funções de sistema (`coordination`, `watchdog`) com `assertUniqueCoordination`/`assignSystemRole` | Forge | A1 | testes verdes: validações de campos, templates instanciam, função Coordenação única e trocável sem perder histórico, "sem coordenador" ⇒ só @menção | **done** 03/11 (forge) |
| S2 | **Cofre da empresa** (domínio + store): registros `brief| Forge (domínio) + Anvil (store) |decision|memory` com proveniência/versão/visibilidade, documentos indexados (FTS5), obrigatórios (constraint/decision fixadas) alimentam `compileContext`; propostas de atualização com aprovação conforme política | Forge | S1, B2a | obrigatórios entram em todo turno; "obrigatório > orçamento" bloqueia com explicação; revogar fonte limpa derivados; ≥20 testes | **done** 03/11 (forge+anvil+lumen) — domínio, store, UI Conhecimento/Cofre |
| S3 | **`persona_propose`**: entidade Proposta, política `approval|auto`, invariante "nunca mais acesso que o criador" (ferramentas ≤, sem credenciais novas, orçamento ≤ X), cartão "Contratar <nome>?" como read-model e item de Attention | Forge | S1, P5 | testes: escalonamento de acesso recusado; auto só dentro dos limites; aprovar cria persona; recusar não; permissão "Recrutar" exigida | **done** 03/11 (forge) |
| S4 | **Construtor conversacional** de persona/equipe (host `draftPersona`/`draftTeam`: descrição em linguagem natural → rascunho completo editável; usa a persona com função Coordenação ou, no onboarding, um modelo disponível) | Anvil (host) + Rivet (prompt/Runner) | S1, R-1 | com Runner fake: descrição → rascunho válido contra o schema; ferramentas do rascunho ≤ nível permitido; sem coordenador no onboarding ainda funciona | **done** 03/11 (rivet+anvil) — draft driver + fallback determinístico; teste com modelo real pendente |
| S5 | UI: **onboarding em 5 passos** ligado ao host (nome → Sobre a empresa/Cofre → conectar harnesses detectados → montar equipe → `#geral` com apresentação e 1ª tarefa sugerida); critério RCD: valor antes de esforço, <60 s até a 1ª resposta útil | Prism | A7, S1, S2 | (app) pasta limpa → onboarding completo; capturas claro/escuro vs `dirD-tela.png`; reduced-motion; teclado | review — onboarding/overlay: `onboarding-overlay-first-delivery` 21, `first-delivery-phase` 16, S7 de teclado passou (probe); aguarda o E2E real do onboarding no instalado (probe) |
| S6 | UI: **editor de persona** (todos os campos do SCOPE §1), galeria de avatares (Brush)/upload/silhueta, "Nova persona" com construtor, cartão "Contratar <nome>?", tela **Conhecimento** (Cofre) | Prism (editor, galeria, contratar) + Lumen (Conhecimento/Cofre) | S1–S4, BR-personagens | (app) criar/editar/apagar persona; trocar Coordenação; aprovar contratação | doing — Conhecimento/Cofre real ✔ (lumen: RemoteKnowledgePanel, botões só com handler, upload/substituir/apagar; testes + check-pkg OK); editor + Contratar ✔ no código (prism); falta o ScreenHeader do Assistente em Contratar persona e a captura no shell real (prism) |
| S7 | Testes dos cenários obrigatórios novos (hoje `it.todo`): onboarding do zero; `persona_propose` sem escalar acesso; troca de Coordenação sem perder histórico; Cofre em "Contexto usado"; reduced-motion; diff visual vs `dirD-tela.png` | Probe | S1–S6, A6 | 6/6 verdes | todo — 4/6 FECHADO (probe): onboarding do zero na UI web com fake 9/9 (`mandatory-first-delivery-fake.spec.ts`, feliz + sem IA), só com teclado 1/1 (`mandatory-onboarding-keyboard.spec.ts`), reduced-motion e diff dirD (B9 6/6 + `mandatory-scope`); restam 2 (UI de `persona_propose`/troca de Coordenação e Cofre em "Contexto usado": 3 `it.todo`; host J3/J4/J5 verdes) |

### V1-P0 — Primeira entrega real ponta a ponta (BRIEFING item 21; D-061) — **critério de aceite nº 1 da v1, junto com o instalador**

Fluxo que o app precisa provar com o motor conectado, em **< 2 min**: home limpo → onboarding → pedido no #geral → Tarefa → **execução real** (CLI/DSH conectado) → entrega no #geral e no quadro → marco **"Primeira entrega"**. Achado da Muse: os dogfoods fecharam com 0 execuções reais.

| # | Tarefa | Dono | Depende | Critério de aceite (testável) | Status |
|---|---|---|---|---|---|
| V1-P0-1 | **Causa das 0 execuções reais** nos dogfoods: diagnosticar por que a Tarefa não vira execução real (Coordenação/pré-roteador/Assignment/runner/ACL/cota) e corrigir no engine; relatório com a cadeia causal | Forge | — | `reports/forge.md` com a causa raiz + teste de regressão que falha antes e passa depois; a Tarefa do pedido chega a `Executing` com runner real | **done** 04/11 (forge) — causa: o desktop nunca ligava `PERSONA_REAL_CLI=1` (runner fake) + `wantsWork` não reconhecia pedidos como "Monte a equipe…" (ingest virava conversa, 0 Tarefa). Conserto: `wants-work.ts` + `first-delivery.ts` (Ticket barato pós-onboarding) + testes; `reports/forge.md` 04/11 08:55 |
| V1-P0-2 | **Host ponta a ponta**: pedido → Ticket → execução → entrega publicada no #geral e no quadro; marco `first_delivery` persistido e exposto no Remote; sem ficar preso em "Carregando…" | Anvil | V1-P0-1 | contrato do host: do `postMessage` ao `first_delivery` com runner real (opt-in) e com runner fake (sempre); evento do marco no feed | doing — `completeOnboarding` persiste `first_delivery`, `getFirstDelivery`/`getOverview.firstDelivery`, marco no #geral, `measureFirstDeliveryAcceptance` 4/4 ✔ (anvil); falta prova com runner real (opt-in) |
| V1-P0-3 | **Runner real**: `resolveRunner` escolhe o motor conectado sem login wall, sessão quente, 1º token < 5 s, erro tipado e visível se faltar CLI/cota; modelo mais barato para o smoke | Rivet | V1-P0-1 | execução real de um pedido trivial concluída com o motor conectado; latência registrada em `reports/rivet.md` | review — `resolveRunner`/`pickConnectedCli`/`PERSONA_REAL_CLI` no desktop (`persona-decouple.spec` + `resolve-runner.spec` verdes) + limitador de turnos reais (`contracts/real-turn-cap.md`); o aceite é a rodada real D-069 do Probe no NSIS do H |
| V1-P0-4 | **Onboarding + marco "Primeira entrega"** na UI: fim do onboarding leva ao pedido guiado; cartão/celebração discreta (Muse) quando a entrega chega; estados de espera honestos (persona trabalhando) | Prism (+ Muse no visual) | V1-P0-2 | jsdom + captura do fluxo; o marco aparece uma vez e some do "Precisa de você" | review — passo 5 "Primeira entrega" publicado e testado (prism); capturas do passo 5 em `.maestri/tmp/shots/prism-step5/` (claro, axe 0; as "dark" saíram claras pelo bug do atributo: refeitas pós-H); aguarda Muse + Probe |
| V1-P0-5 | **Aceite E2E real, opt-in** (Probe): home limpo no app/exe instalado → onboarding → pedido → execução real → entrega no #geral e no quadro → marco, medindo o tempo (< 2 min); roda só com `PERSONA_REAL_E2E=1`, modelo mais barato, no máximo as execuções que o Atlas liberou | Probe | V1-P0-1..4, D8 | 1 execução verde com tempo e custo registrados em `reports/probe.md`; falha dá o passo exato e a captura | doing — harness da execução real pronto e ensaiado (probe; D-069): soma de turnos pagos, falha fechado, vigia do ledger, Quadros, timeline da Muse, limitador exigido no exe, veredito `verifyRealFirstDeliveryRun`; fake web 9/9, NADA real gasto; bloqueado só no NSIS com o limitador + fake instalado verde + OK do Keel |
| V1-P0-6 | **Instalador (D8) com o mesmo fluxo**: o exe instalado do hash publicado passa o V1-P0-5 (CSP ok, `#root` montado) | Rivet + Probe | V1-P0-5, D8 | exe instalado + V1-P0-5 verde dentro dele | doing — specs do instalado prontos (feliz com chat + `CAP=1` + sem IA, sha256 do exe); o NSIS `b3a4e5b933` instala/desinstala limpo (303 s / 56 s) mas o fluxo falhou 2/2 por ser anterior às correções; aguarda o NSIS novo do Rivet (mesma trilha do D8) |

Regra de acompanhamento (Keel): a cada ciclo de 25 min conferir `reports/{forge,anvil,rivet,prism,probe}.md`, atualizar a coluna Status e cobrar dono parado. Execuções reais continuam congeladas fora deste fluxo; aqui o Atlas liberou o opt-in.

### Rascunho da tarefa — SW-1..SW-10 (`SIMPLE-WORKSPACE.md`; D-064) — **P1 da v1: entra na fila de cada dono DEPOIS dos seus itens P0 (V1-P0 / instalador)**

O usuário comum nunca vê git: cada Tarefa que mexe em arquivos trabalha num **rascunho**; pasta sem git usa histórico privado e oculto em `<PERSONA_HOME>/history/<projectId>` (`--git-dir` separado; **nunca** `.git` na pasta do usuário); sem git no PATH usa o **MinGit embutido**; Aplicar/Pedir ajustes/Descartar + **Desfazer por 30 dias**; conflito em português (3 escolhas, sem marcadores). Pasta com git continua como hoje. Tarefa sem arquivos não cria rascunho.

| # | Tarefa | Dono | Depende | Critério de aceite (testável) | Status |
|---|---|---|---|---|---|
| SW-1 | **`HistoryReviewDelivery`** (porto `ReviewDelivery`, ao lado da `GitReviewDelivery`, escolhida automaticamente): rascunho = cópia isolada; histórico oculto `--git-dir`/`--work-tree`; cria o histórico sozinho no 1º uso; Tarefa sem arquivos não cria rascunho; `sweepOrphans` apaga rascunhos de tarefas fechadas | Forge | V1-P0 | teste em pasta SEM `.git`: prepare → diff (antes/depois) → apply; a pasta do usuário continua sem `.git`; pasta COM git usa a implementação atual | doing — engine ✔ (forge): `HistoryReviewDelivery` + `createReviewDelivery` (histórico oculto, pasta sem .git), history-review + review-delivery 40/40, check-pkg engine OK; falta ligar no host (Anvil, factory em src/review.ts) e o MinGit (Rivet SW-4) |
| SW-2 | **Ponto de restauração + Desfazer 30 dias**: ponto automático antes de "Aplicar"; "Aplicar" atômico (nunca merge pela metade); expiração em 30 dias | Forge | SW-1 | Aplicar → Desfazer restaura byte a byte; falha no meio do Aplicar deixa a pasta como estava; ponto expira em 30 dias (relógio falso) | doing — engine ✔ (forge): ponto de restauração + Desfazer + Aplicar com recuperação, 18/18 (texto, binário, removido/novo, desfazer repetido, falha injetada); falta host (Anvil SW-6) e UI (Lumen SW-8) |
| SW-3 | **Conflito por arquivo** (usuário mexeu no mesmo arquivo durante a Tarefa): *Ficar com o meu* / *Ficar com o da persona* / *Manter os dois* (cópia com sufixo); nenhum marcador `<<<<` no arquivo do usuário | Forge | SW-1 | 3 escolhas testadas; arquivo sem marcadores; Desfazer depois do conflito | doing — engine ✔ (forge): conflito por arquivo com 3 escolhas tipadas (inclui "Manter os dois" sem colidir com nomes/diretórios), parte do 40/40; falta host/UI e o E2E de conflito + Desfazer (Probe SW-9) |
| SW-4 | **Git resolvido e embutido**: resolução PATH → MinGit embutido; MinGit dentro do instalador (afterPack + inventário `persona-package-inventory`); cwd do runner no rascunho | Rivet | D8 | com PATH sem git o rascunho funciona usando o embutido; o inventário acusa MinGit ausente no pack; a runner roda no rascunho (não na pasta real) | review — prova local ✔ (rivet): `resolveRunner` + MinGit real; falta validar no INSTALADO (inventário com MinGit no exe; parte da trilha do instalador) |
| SW-5 | **Travas do Windows**: OneDrive (arquivo só online → hidratar antes de copiar), arquivo aberto no Excel/Word (aviso "feche a planilha X" + tentar de novo, nunca falha calada), caminho longo; binários/arquivos grandes sob demanda (hardlink/sparse) | Rivet | SW-1 | simulações testadas (placeholder online, lock exclusivo, caminho > 260); mensagem acionável em pt-BR | review — prova local ✔ (rivet): `windows-files.spec` 7 testes (OneDrive, arquivo aberto, caminho longo); falta validar no instalado (trilha do instalador) |
| SW-6 | **Host**: Remotes `undoApply` / `listRestorePoints`; migração dos projetos existentes; espaço ocupado em Uso e limites; contrato em `contracts/` | Anvil | SW-1, SW-2 | contrato do host: aplicar → listar pontos → desfazer; projeto antigo abre sem perda; Uso mostra o espaço | **doing** 04/11 (anvil) — factory ligada, aplicar/listar/desfazer binário + reabertura SQLite verdes; bytes reais em Uso; UUID/ACL/expired/capacidade explícitos; contrato simple-workspace.md e Typert gerado; falta aceite integrado SW-9/SW-10 e MinGit instalado (Rivet/Probe) |
| SW-7 | **Microcopy + visual do rascunho** (sem jargão): estado "trabalhando num rascunho" na faixa da equipe, Revisar, conflito, Desfazer → `design/SIMPLE-WORKSPACE-SPEC.md` | Muse | — | spec + protótipo; zero palavra técnica (branch, merge, worktree, commit) nos textos | **doing**: spec ✔ 04/11 (muse, `design/SIMPLE-WORKSPACE-SPEC.md`) + primitivo `FileChangeRow` ✔; galeria SW-8 do Lumen aceita no conjunto com 6 ajustes (§Aceite visual); o selo ✓ do `ChoiceCards` ✔; falta o aceite no app real (5 cenários do Probe) |
| SW-8 | **UI Revisar em linguagem simples**: lista de arquivos novos/alterados, antes/depois de texto e imagem lado a lado, 3 ações (Aplicar na pasta / Pedir ajustes / Descartar), Desfazer, escolha de conflito; Projeto › Histórico; nomes técnicos só em Configurações avançadas | Lumen | SW-6, SW-7 | jsdom + galeria; nenhum termo técnico fora de Configurações avançadas (teste de texto) | **todo** |
| SW-9 | **E2E (Probe), 5 cenários**: pasta sem git com git no PATH; pasta sem git e sem git no PATH (embutido); pasta no OneDrive; planilha aberta durante o Aplicar; conflito seguido de Desfazer | Probe | SW-1..SW-8 | 5/5 verdes com capturas | todo — camada do engine FECHADA (probe): S1 + S4 + S5×3 PASS em .docx/.xlsx reais (`mandatory-simple-workspace.spec.ts`); S2 (SW-4) e S3 (SW-5) aguardam o instalado; camada host/UI e SW-10 no instalado dependem de SW-6/SW-8 |
| SW-10 | **Aceite final**: perfil limpo, usuário sem git, pasta de documentos: pedido "atualize o cardápio.docx com os preços novos" → rascunho → Revisar (antes/depois) → Aplicar → arquivo atualizado → Desfazer restaura; nenhuma palavra técnica na tela; a pasta continua sem `.git` | Probe + Keel | SW-9 | roteiro executado no app (e no instalado) com captura | **todo** |

Ordem sugerida: Muse SW-7 e Forge SW-1..3 em paralelo; Rivet SW-4/5 em paralelo; Anvil SW-6 depois do porto estável; Lumen SW-8 por último; Probe SW-9/10. A primeira entrega (V1-P0) é só resposta e **não** depende disto.

### Contrato cliente↔host — WIRE-1..WIRE-5 (auditoria do Prism, 04/11: ~230 chamadas / ~140 Remotes; fonte de verdade = schemas zod de `persona-host/lib/typert.host.js`)

| # | Tarefa | Dono | Depende | Critério de aceite (testável) | Status |
|---|---|---|---|---|---|
| WIRE-1 | **postMessage** canal+DM sem `occurredAt` (live-store :856/:1053): host aceita sem o campo (relógio do host) e o **lib do Typert é REGENERADO** (o lib de 14:49 ainda exige o campo) | Anvil | — | enviar pela caixa de mensagem persiste e aparece após recarregar; teste de fronteira do gateway com o payload do cliente | doing — `occurredAt` opcional no host (types.ts:241); falta regenerar o lib do Typert (anvil); o comparador do Gauge não vê mais o desvio |
| WIRE-2 | **Revisar**: `reviewSummary` e `discardReview` (`review/KanbanReviewSheet.tsx`) mandam só `ticketId`; o host exige `TicketCommandRequest` com `command` e `reason` | Lumen | — | Revisar abre o resumo e Descartar funciona no app real; tipo do cliente derivado de `TicketCommandRequest` | **done** 04/11 (lumen) — `KanbanReviewSheet` manda `command` + `reason` em `reviewSummary`/`discardReview`; `tests/kanban-review-sheet` asserta os campos; wire-contract do Gauge: 0 desvios |
| WIRE-3 | **acceptReview**: o cliente manda `choices` (mine/theirs/both) mas o host espera `conflicts[]` (keep_mine/keep_persona/keep_both + path/user/persona): a escolha de conflito NUNCA chega ao host (silencioso; bloqueia o SW-3/SW-8) | Lumen + Anvil | SW-3 | escolher "Ficar com o meu/da persona/Manter os dois" no app resolve o conflito no host (teste de contrato ponta a ponta) | **done** 04/11 (lumen) — o conflito volta como `conflicts[{path,user,persona,choice keep_*}]` com as versões mostradas, sem `choices`; `tests/kanban-review-sheet` + `resolveReviewConflicts` (3 respostas); wire-contract: 0 desvios |
| WIRE-4 | **Seed de dev** `listMessages limit:300` (faixa 1–200) e **`undoApproval`** que não existe no host (a UI esconde o Desfazer até existir; o Remote entra se o produto o exigir) | Prism + Anvil | — | seed sem `invalid-input`; "Desfazer decisão" some ou funciona (nunca no-op) | doing — pendentes: seed `limit:300` (prism), `undoApproval` inexistente (esconder o botão), `PersonaHistoryRemote.list/undo` sem Remote no host (anvil expõe `listRestorePoints`/`undoApply` ou prism adapta), `PersonaCreatorRemote.listTeam` com chaves recusadas e `gestorLimitsToSetRequest` sem sanear números (prism) |
| WIRE-5 | **Teste de contrato cliente↔host**: compara os tipos manuscritos do cliente (`PersonaRemote`, `PersonaReviewRemote`, `DevHarnessSeedRemote`, `*Wire`) e os payloads reais com os schemas do Typert; entra no gate (rápido) | Gauge | WIRE-1..4 | falha quando um payload do cliente viola o schema do host; cobre os 5 achados + payloads aninhados (submitTeachDraft, previewImport/confirmImport, updateWorkflow, limites com números não finitos) | doing — comparador estático pronto (gauge): `wire-contract.spec.ts` ~6 s, 287 métodos / 49 tipos manuscritos / 111 chamadas, falha em desvio NOVO; ligado ao gate como informativo (`WIRE_CONTRACT_WARN`; `PERSONA_WIRE_CONTRACT=block` bloqueia); falta o teste dinâmico com gateway gravador depois dos consertos |

### Proatividade nativa — PRO-1..PRO-6 (BRIEFING item 14; `PROACTIVITY.md`; D-048) — **requisito de aceite da v1**

Personas nunca preguiçosas nem dependentes de alguém cobrando. Lições do próprio projeto viram regra: relatar não bloqueia; responder não é despachar; fila vazia é evento; ociosidade/travamento detectados por máquina; contexto cheio/erro de conexão/prompt de confiança = falha de infraestrutura que o Vigia recupera.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| PRO-1 | **Engine**: laço de puxada (fila por persona filtrada por permissões; ao terminar/bloquear a Assignment o engine atribui a próxima elegível por prioridade, dependências prontas, ferramentas compatíveis, concorrência e orçamento; dependência concluída acorda a dependente por evento/Subscription), **objetivos** (Goal com critério de pronto, orçamento de rodadas), continuação/definição de pronto (propor tarefas de seguimento; proibido "posso fazer X se quiser" dentro do mandato), regras do Vigia (ociosa com fila/objetivo → atribui/replaneja; sem progresso N min → pede status e reinicia com RECOVERY_NOTE; bloqueada por colega → cutuca/escala; erro de runner/contexto cheio → nova sessão com handoff + backoff), **orçamentos** (propostas/dia por persona, tokens/execuções por persona e projeto, janelas de silêncio) e **níveis de autonomia** (só quando pedido · propor [padrão] · agir dentro de limites; especulativo começa em "só registrar") | Forge | P7–P9, E4, D7 | relógio falso: com backlog+objetivo nenhuma persona fica ociosa >1 ciclo do Vigia; concluir puxa a próxima; dependência acorda a dependente; fila vazia + objetivo ⇒ planejamento pela Coordenação; sem objetivo ⇒ descansa sem chamadas de IA | **done** 03/11 (forge) — puxada, objetivos, Vigia, continuação, orçamento |
| PRO-2 | **Host**: rotina de iniciativa por persona (diária no horário de trabalho + gatilhos por evento: PR aberto, erro recorrente, prazo), read-model **"Visão geral agora"** (o que cada persona faz, fila, tempo ocioso, entregas do dia, propostas aceitas), resumo **"Enquanto você estava fora"** ao abrir o app, configs de autonomia/orçamento/silêncio no Remote | Anvil | PRO-1, C3, B3 | rotina dispara no horário e respeita janelas; propostas agrupadas em resumo (não pings); "Enquanto você estava fora" lista eventos com links às tarefas reais | **done** 03/11 (anvil) — rotina de iniciativa, "agora/enquanto estava fora", autonomia, retenção |
| PRO-3 | **Execução**: recuperação de runner (contexto cheio/erro de conexão/prompt de confiança ⇒ nova sessão com handoff via Chain of Recall + retry com backoff), integração `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` no runner DSH, **normas de dono** no prompt base das executoras (terminar, verificar, reportar com evidência, propor próximo passo), **suíte de avaliação "preguiça"** por runner/modelo (tarefa multi-etapa, erro intermediário, ambiguidade pequena) cujo resultado vira dica ao escolher o modelo | Rivet | PRO-1, R-1 | Runner que cai/contexto cheio ⇒ recuperação automática com handoff; suíte roda com runner fake e relatório por modelo | **done** 03/11 (rivet) — recuperação/handoff/backoff, laziness suite |
| PRO-4 | **UI**: Visão geral "agora", controles de autonomia por persona/projeto, estados honestos (ocioso sem trabalho ≠ travado ≠ esperando você), "Enquanto você estava fora" (peak-end) | Prism | PRO-2 | (app) boot gate verde; estados com texto+ícone; reduced-motion | review — faixa Agora/"enquanto fora": `overview-now-strip`, `derive-pass-through`, `reload-loading-skeleton` 7, `rail-away-host` 9 (prism); resta a captura no shell real e o aceite da Muse |
| PRO-5 | **UI de dados**: resumo agrupado de propostas (Aprovações: uma pergunta, ação primária, prévia de impacto/custo), regras de atenção, métricas (taxa de aceitação por persona realimenta a frequência, entregas) | Lumen | PRO-2 | (app) cartões estruturados; métricas legíveis | **done** 03/11 (lumen) — Aprovações (resumo diário)/Regras/Perfil via Remote |
| PRO-6 | **Aceite** dos 6 critérios do PROACTIVITY.md em E2E (relógio falso) + capturas | Probe | PRO-1..PRO-5 | 6/6 verdes | todo — camada 1 (engine/runner com relógio falso) FECHADA 4/4 + `measureProactivityV1` 6/6 (probe); a camada 2 (8 `it.todo` no app) precisa de relógio injetável no app: ninguém ativo |

### Quadros por projeto com fluxo e sprints próprios — PB-1..PB-10 (BRIEFING item 15; `PROJECT-BOARDS.md`; D-053)

Pedido do Miguel: um kanban único mistura trabalhos de natureza diferente (contratar pessoas ≠ fazer um site). Cada projeto tem **o próprio quadro, com as próprias colunas e sprints**; o item "Kanban" vira "Quadros" (lista de projetos), e a visão global é por raias recolhíveis, nunca um quadro misturado. A **categoria de estágio** de cada coluna (`todo | doing | review | needs_you | done`, + marcador `blocked`) liga o fluxo personalizado aos estágios do engine — puxada, Vigia, proatividade, "Precisa de você" e métricas seguem funcionando em qualquer fluxo (D-029 permanece: o quadro é projeção dos estágios do Ticket).

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| PB-1 | **Domínio** (persona-core): `Workflow` por projeto (colunas ordenadas: nome, cor/ícone, WIP opcional, categoria de estágio), `WorkflowTemplate` pt-BR (Contratação, Site/produto digital, Software com sprints, Marketing/conteúdo, Atendimento/operações, Simples, Em branco), `Sprint` (nome, objetivo, datas, estado planejado/ativo/encerrado), campos extras tipados por fluxo (texto, link, número, data, seleção), `Ticket.columnId/sprintId/campos`; invariantes (≥1 `todo` e ≥1 `done`; `needs_you` única; remover coluna exige destino; WIP é aviso, não trava a máquina) | Forge | S1, B1 | testes de invariantes; Tarefas antigas sem coluna caem na primeira coluna da categoria do estágio; nenhum nome de persona/fluxo fixo no código | **done** 03/11 (forge) — `persona-core/src/board` |
| PB-2 | **Engine**: projeção estágio↔coluna por projeto (coluna explícita vence se compatível; concluir → 1ª coluna `done`; Attention → `needs_you`), puxada/Vigia/proatividade por CATEGORIA, mover Tarefa entre colunas com ACL e trilha, Sprint ↔ `dsh-goal` (objetivo do sprint = goal da Coordenação), encerrar sprint rola o não concluído (com confirmação) e gera o resumo (entregue/atrasado/quem fez o quê) como mensagem de marco | Forge | PB-1, PRO-1 | Vigia e puxada passam em 3 fluxos customizados; editar fluxo sem perder Tarefas; resumo do sprint no canal do projeto | **done** 03/11 (forge) — `persona-engine/src/{workflow,sprint}.ts` |
| PB-3 | **Coordenação propõe fluxo** a partir da descrição do projeto (prompt de proposta + parser sujo + cartão "Usar este fluxo?" com aprovação do usuário, nunca aplica sozinho) | Forge (prompt) + Anvil (Remote) | PB-1 | proposta válida (invariantes) ou degrade honesto; usuário aceita/edita | **done** 03/11 (forge+anvil) — J16: cartão/aprovar/recusar/JSON sujo; nunca aplica sozinho |
| PB-4 | **Store/host**: migração v8 (workflow, coluna, sprint, ticket coluna/sprint/campos), repositórios, Remote (`getProjectBoard`, `listBoards` com mini-resumo por projeto, `createWorkflowFromTemplate`, `updateWorkflow` com mapa de destino, `moveTicket`, `listSprints/createSprint/planSprint/startSprint/closeSprint/sprintSummary`, `proposeWorkflow`), ACL no servidor, retenção/export/import/sync (fluxo e sprint são compartilháveis; DM não), suíte de queda sobre SQLite | Anvil | PB-1 | migração v7→v8 preserva Tarefas; editar fluxo e mover Tarefas sem perda; crash suite verde | **done** 03/11 (anvil; J12–J18) — v8+Remote. Caveats: export canal vazio=`forbidden`; Remote remove-coluna → `INVALID_WORKFLOW` (pt-BR só no core); `startSprint` grava `goalId` sem GoalBoard |
| PB-5 | **UI Quadros**: sidebar Projetos abre o quadro do projeto (abas Quadro · Conversa · Arquivos · Rotinas · Sprints); "Kanban" → "Quadros" (grade/lista de projetos com mini-resumo: contagem por categoria, sprint atual, quem trabalha agora); visão global por raias de projeto recolhíveis; fim do quadro misturado | Lumen (+ Prism: sidebar/abas do shell) | PB-4, PB-8 | (app) projeto "Contratação" e "Site" têm colunas diferentes e Tarefas isoladas | **done** 04/11 (lumen) — **ACEITE Muse** (Status: "ACEITE Muse: PB-5", Quadros com mini-resumo, claro/escuro) + `boards-project-card` (6) + `boards-home`; galeria axe 0 claro/escuro |
| PB-6 | **UI editor de fluxo** + escolha do modelo ao criar o projeto + cartão de proposta da Coordenação: renomear/reordenar (arrastar com teclado equivalente)/adicionar/remover coluna com destino, categoria com explicação curta, WIP, campos extras, prévia ao vivo | Lumen | PB-4, PB-8 | (app) editar sem perder Tarefas; a11y teclado | todo — Prism auditando a UI (Gauge PB-9: criar projeto pela UI hoje troca o fluxo do Pessoal em vez de criar: PB-9.1/PB-9.2); entra depois do H e do A-1 |
| PB-7 | **UI sprints**: faixa no topo do quadro (sprint atual, objetivo, dias restantes, progresso), planejamento backlog ↔ sprint, encerrar com resumo e rolagem do não concluído | Lumen | PB-4, PB-8 | (app) criar, planejar, encerrar; mensagem de marco no canal | doing — UI entregue pelo Prism (04/11 15:50, na pasta do Lumen): faixa da sprint (prazo com singular e sem "0 dias" inventado), planejamento com checkbox nativo + arrastar/soltar com equivalente por teclado + capacidade por persona, encerrar com "Quem fez o quê" e lista do que ficou; testes sprint-planning-pb7 12 + close-sprint-pb7 8; falta: capturas claro/escuro/960/movimento reduzido para a Muse (o escuro depende do conserto do atributo), mensagem de marco (Lumen: toast), PB-9.3 |
| PB-8 | **Design + arte**: specs Muse para quadro por projeto (coluna com ícone/cor, estado vazio ilustrado POR COLUNA, FLIP do mini-avatar entre colunas, editor de fluxo, faixa de sprint, grade "Quadros"); pedido ao Brush de ícones de coluna/estados vazios por modelo | Muse + Brush | — | specs publicadas em `persona-spec/design/`; assets em `persona-assets/` | **done** 04/11 (muse) — `design/BOARDS-SPEC.md`; ícones de coluna/fluxo do Brush em `persona-assets/icons/{columns,flows}`; carregar do mini-avatar ligado no código (`use-kanban-carry`) |
| PB-9 | **Aceite E2E** (Probe): os 5 cenários de PROJECT-BOARDS §3 (projetos isolados; concluir → coluna `done` do projeto; Attention → `needs_you`; editar fluxo sem perder Tarefas e com Vigia/puxada ativos; sprint criar/planejar/encerrar com mensagem de marco; Coordenação propõe fluxo) + galeria/axe/loading preso das telas novas | Gauge (era Probe) | PB-5..PB-7 | 5/5 verdes + capturas claro/escuro | doing — galerias GOV/PB contratos 7/7 ✔ (probe); E2E dos cenários PB em curso |
| PB-10 | **Migração do que existe**: `GlobalKanban`/`ConnectedGlobalKanban` → "Quadros" sem regressão (Revisar continua no cartão); atualizar guia do usuário (`docs/persona`) e `ARCHITECTURE.md` | Lumen + Forge (docs) | PB-5 | testes existentes verdes; guia atualizado | **done** 04/11 (lumen) — `projectBoardToFlow` + hub (`deriveBoardSummaries`, modelo real por projeto) + "Novo projeto" cria de verdade (`createProject`); `connected-project-flow-board`, `derive-board-summaries`, `connected-global-kanban-boards` |

### Extensões pedidas pelo Atlas durante a v1 (X-1..X-4) — registradas por honestidade do plano

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| X-1 | **Gateway MCP endurecido** para ferramentas da persona (URL/token secretos por turno, só o mandato `none|read|write`, recusa de token de outro turno/ferramenta fora do grant/injeção, ações sensíveis → aprovação "Precisa de você" que executa exatamente os mesmos argumentos) | Rivet | D3, D-052 | testes adversariais verdes | **done** 03/11 (rivet) |
| X-2 | **Browser/computer como ferramentas de persona** (`persona_browser_*`, `persona_computer_*`; portas injetadas; ação externa passa pelo gate) | Rivet | X-1 | testes com portas falsas; nenhuma ação externa sem aprovação | **done** 03/11 (rivet) — sem uso real ainda |
| X-3 | **Fontes Telegram e e-mail** (Trigger → `engine.receive`; resposta no canal de origem; credenciais seladas no Cofre: telegram/imap/smtp) | Rivet (fonte) + Forge (receive) + Anvil (host: `vault.get`, `replyTelegram/replyEmail`, polling sem estourar energia/orçamento) | X-1 | testes com servidor falso; nenhum token real; Anvil liga ao host | **done** 03/11 — fonte ✔ (rivet, +slack/discord/ics); receive ✔ (forge `receiveExternal` 5 fontes); host ✔ (forge `pollExternal`/`replyExternal` + `startSprint`→`bindSprintGoal`) |
| X-4 | **Orçamento/ERR_INSUFFICIENT_RESOURCES** nas fontes/ferramentas (limites de concorrência e de requisições) | Rivet | X-3 | teste de tempestade verde | **done** 03/11 (rivet) — `SOURCE_REQUEST_CAP` + tempestade 20→4 |

### Governança da equipe — GOV-1..GOV-10 (BRIEFING item 16; `GOVERNANCE.md`; D-054)

Pedido do Miguel: quem roda "bots" sem estrutura não tem uma empresa, tem um trabalho (se some 2 dias, tudo para). A Persona torna a governança simples para quem nunca geriu equipe e mostra, em linguagem clara, se a equipe se sustenta sozinha. Conceitos: **Setor**; **Responsável humano** (+ **Substituto**) por persona; **Braço direito** = função Coordenação (atribuível, D-043 — não é nome fixo); **Disponibilidade humana** ("fora"); **Dono** de cada rotina recorrente. Telas: organograma "Quem cuida de quem" (por pessoa | por setor), **Saúde da equipe** com o **Teste dos 2 dias**, **Assistente de estrutura** ("uma persona por função contínua, não por tarefa"; começar com 3–5). Regras: toda persona nasce com responsável (padrão = criador; persona proposta por agente herda o do criador até o humano confirmar); escalonamento persona → Coordenação → responsável → substituto, ausência ⇒ substituto ou espera com aviso (nunca silêncio); política por setor (autonomia/orçamento/aprovações exigidas); auditoria de quem aprovou o quê, em nome de quem.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| GOV-1 | **Domínio** (persona-core): `Sector`, responsabilidade persona→(responsável, substituto), disponibilidade humana (janelas "fora"), dono de rotina, política por setor (autonomia padrão, orçamento, aprovações exigidas), cadeia de escalonamento, trilha de auditoria; invariantes (toda persona tem responsável; herança do criador até confirmar; rotina sem dono ⇒ alerta, não erro fatal; substituto ≠ responsável) | Forge | S1, B1 | testes de invariantes; nenhum nome fixo de persona/setor no código (setores são dados editáveis) | **done** 03/11 (forge) — `persona-core/src/governance` |
| GOV-2 | **Engine**: roteamento de aprovações/Attention pela cadeia de escalonamento respeitando disponibilidade e política por setor (ex.: Financeiro sempre aprova pagamentos), espera com aviso, auditoria "quem aprovou o quê em nome de quem"; integra com orçamento de atenção (PRO) | Forge | GOV-1, PRO-1 | pessoa "fora" ⇒ aprovação vai ao substituto; sem substituto ⇒ espera com aviso explícito | **done** 03/11 (forge) — `routeApproval` |
| GOV-3 | **Simulador "Teste dos 2 dias"** (relógio falso sobre a configuração real): linha do tempo do que continua andando / espera aprovação / para, com correções de 1 clique (definir substituto, subir autonomia DENTRO de limites para tal rotina, delegar aprovação à Coordenação dentro do orçamento) | Forge | GOV-2 | com substituto/autonomia configurados as rotinas seguem; sem, o resultado lista exatamente o que para | **done** 03/11 (forge) — `runTwoDayTest` / `applyGovernanceFix` |
| GOV-4 | **Recomendador / Assistente de estrutura**: entrada (tipo de empresa — agência, loja online, SaaS, consultoria, criador de conteúdo, escritório…, setores, trabalhos recorrentes) → recomendação explicada (uma persona por FUNÇÃO contínua; tarefa pontual vira Tarefa; rotina recorrente ganha dono; 3–5 no início), prévia do organograma + Teste dos 2 dias aplicado; base determinística (modelos) com refinamento opcional por modelo e parser sujo | Forge (+ Rivet: prompt/draft driver) | GOV-1, GOV-3, S4 | snapshot coerente para 3 tipos de empresa; nunca "uma persona por tarefa" | **done** 03/11 (forge + rivet) — `recommendStructure` + `createDraftDriver.recommendStructure` |
| GOV-5 | **Store/host**: migração v9 (setor, responsabilidade, disponibilidade, dono de rotina, política por setor, auditoria), Remote (`getOrgChart(porPessoa ou porSetor)`, `setResponsible/Substitute/Sector`, `setAvailability`, `getTeamHealth`, `runTwoDayTest`, `applyFix`, `recommendStructure/applyStructure`, `listAudit`), ACL (só dono/admin muda responsabilidades), retenção/export/import/sync (nível de workspace; DM não), migração das personas existentes (responsável = dono do workspace), suíte de queda | Anvil | GOV-1 | migração preserva dados; mudar responsável/setor atualiza o organograma ao vivo | **done** 04/11 (anvil) — v11 remotes + export `governanca.md` + sync workspace (J19); DM não sobe |
| GOV-6 | **UI Organograma "Quem cuida de quem"**: braço direito no topo; humanos responsáveis (iniciais/foto, setor); personas penduradas (avatar do bicho, cargo, selo de estado ao vivo); alternância "Por pessoa" / "Por setor"; clique abre persona/pessoa; modo lista por teclado; claro/escuro | Lumen | GOV-5, GOV-9 | (app) reflete o banco; a11y teclado | **done** 04/11 (lumen) — **ACEITE Muse: GOV-6** (Quem cuida de quem; claro/escuro/960/200%; `design/ACCEPTANCE-SWEEP-0411.md`) + org-chart 9/9 E2E (probe) |
| GOV-7 | **UI Saúde da equipe**: nota geral + itens acionáveis em linguagem simples (persona sem responsável, setor sem cobertura, rotina sem dono, ponto único de falha, pessoa sobrecarregada, fila sempre cheia, persona ociosa há dias), **Teste dos 2 dias** com linha do tempo e correção de 1 clique | Lumen | GOV-5, GOV-9 | (app) aponta os 4 problemas-chave; correção aplica e a nota sobe | **done** 04/11 (lumen) — **ACEITE Muse: GOV-7** (Saúde da equipe; correção em 1 clique; ids `initiative:` → "Iniciativa de {persona}") |
| GOV-8 | **UI Assistente de estrutura** ("Monte uma equipe que faça sentido") nos 4 passos, no onboarding e no botão "Contratar"; prévia do organograma + Teste dos 2 dias; contratar tudo ou um a um; campos responsável/substituto/setor no editor de persona; dicas contextuais curtas (RCD) | Prism | GOV-5, GOV-9 | (app) fluxo completo para 3 tipos de empresa | review — Assistente de estrutura corrigido (h1 Fredoka, ChoiceCards com ✓, Contratar um a um, Teste dos 2 dias): `structure-assistant` 9 + `connected-persona-editor-hire` (prism); falta o ScreenHeader e a captura; aguarda a Muse e a suíte GOV-10 do Gauge |
| GOV-9 | **Design + arte**: specs Muse (organograma, saúde, assistente, selos de estado, estados vazios; referência `persona-spec/design/ref-quem-cuida-de-quem.jpg`) e pedido ao Brush (ícones de setor, ilustrações de saúde/ausência) | Muse + Brush | — | specs em `persona-spec/design/`; assets em `persona-assets/` | **done** 04/11 (muse) — `design/GOVERNANCE-SPEC.md` (+ escala 60/150, OrgMap); ícones de setor em `persona-assets/icons/sectors` |
| GOV-10 | **Aceite E2E** (Probe): os 5 cenários de GOVERNANCE §4 (organograma reflete o banco; Saúde aponta os problemas; Teste dos 2 dias com relógio falso; pessoa "fora" ⇒ substituto/espera com aviso; assistente coerente em 3 tipos de empresa) + galeria/axe/loading preso | Gauge (era Probe) | GOV-6..GOV-8 | 5/5 verdes + capturas claro/escuro | doing — galerias GOV/PB + org-chart 9/9 ✔ (probe); cenários restantes em curso |

### Onda 2 — W2-1..W2-12 (BRIEFING item 17; `WAVE2.md`; D-055)

Ideias do Miguel, com a qualidade da v1 (DESIGN-SYSTEM.md, Muse) como régua. Três frentes: **(A) assuntos coloridos por conversa**; **(B) "Ensinar a persona" gravando a tela**; **(C) várias contas por provedor** com política explícita de rotação/divisão. Prioridade: A e C entram agora (base já existe: Thread/Assunto do engine, `detectConnections`/`resolveRunner`/UsageStore); B começa com spike técnico (captura + pipeline num exemplo) e vira entrega completa na sequência.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| W2-1 | **Assuntos — domínio/engine**: cada DM e canal tem assuntos (7 cores fixas + nome opcional; cor + nome sempre); mensagem nova vai ao assunto ativo e a persona responde nele; `compileContext` monta só o assunto ativo + obrigatórios (Cofre/decisões) + Chain of Recall para outros assuntos quando citados; Tarefa guarda o assunto de origem; renomear/arquivar/mover mensagem; busca e recall filtráveis por assunto e data | Forge | B1, B4 | 3 assuntos na mesma DM com históricos separados; contexto do A não aparece no B salvo citação | **done** 03/11 (forge) — `subjects` + `compileActiveSubject` |
| W2-2 | **Assuntos — store/host**: persistência (migração), Remote (`listSubjects/createSubject/renameSubject/archiveSubject/moveMessage/setActiveSubject`, não lidas e "persona trabalhando" por assunto, busca com filtro), ACL no servidor, retenção/export/import/sync (assunto de DM não sobe), resposta da persona no assunto certo no conductor | Anvil (store v14) + Forge (RPC; Atlas rebalanceou) | W2-1 | migração preserva mensagens (assunto padrão "Geral"); resposta no assunto capturado; reinício retoma | **done** 03/11 — v14 Anvil; RPC Forge |
| W2-3 | **Assuntos — UI**: bolinhas coloridas (cor + nome) no topo de DM/canal, troca por clique/teclado, indicador de não lidas e "persona trabalhando", renomear/arquivar/mover, bolinha do assunto no cartão do quadro | Prism (conversa) + Lumen (cartão no quadro) | W2-2, W2-8 | (app) 3 assuntos na mesma DM, teclado, a11y | todo — o que sobra: DM, mover e arquivar assunto (sem dono ativo; voltou a todo). Já FECHADO no #geral: barra de assuntos com **ACEITE Muse: W2-3** (bolinha+nome, não lidas, "trabalhando"; claro/escuro/1280/960/200%, axe 0) + ajuste de janela estreita e botão + com nome padrão (prism) + bolinha no cartão do quadro (lumen) |
| W2-4 | **Contas — domínio/runners**: várias contas por provedor (rótulo "Pessoal"/"Trabalho"; login nativo ISOLADO por conta via diretório de configuração próprio: CLAUDE_CONFIG_DIR / CODEX_HOME / CURSOR_CONFIG_DIR / equivalente; status; cota oficial), registro de contas sem segredos em claro, `resolveRunner` escolhe a conta pela política | Rivet (runners/vault) + Forge (domínio da política) | D-015, D-052, D5a | 2 contas falsas do mesmo provedor com credenciais isoladas por conta | **done** 04/11 (rivet) — domínio: `accounts.spec` + `wave2-accounts.spec` verdes (isolamento de 2 contas, política sem fallback silencioso, vault `setAccount`; 53 testes em 8 arquivos); o login nativo de cada CLI é ação do usuário |
| W2-5 | **Contas — política de uso**: por persona ou workspace, escolha EXPLÍCITA (nunca silenciosa): *Uma conta fixa* · *Próxima ao chegar no limite* · *Dividir o uso* (alternar/equilibrar pela cota restante) · *Perguntar antes de trocar*; troca só entre contas do mesmo motor ou da lista de preferência da persona; mudar de motor reinicia a sessão com handoff (Chain of Recall); toda troca vira linha de atividade ("Nina passou para Claude · Trabalho até 18:30") | Forge (engine) + Rivet (execução) | W2-4 | limite na conta 1 → "próxima" troca e registra; "perguntar" vira Precisa de você; "fixa" para com aviso | **done** 03/11 (forge) — `pickAccount` + host `resolveAccountSeat` |
| W2-6 | **Contas — store/host + Uso**: persistência de contas/política, Remote (`listAccounts/addAccount/removeAccount/setAccountPolicy/accountUsage`), Uso e limites POR CONTA, cartão da persona mostra a conta em uso, auditoria de trocas | Anvil (store v14) + Forge (RPC; Atlas rebalanceou) | W2-4, W2-5 | uso por conta; auditoria de troca | **done** 03/11 — v14 Anvil; RPC Forge (`listConnectionAccounts`, `inUseCount`, `getUsage.accountId`) |
| W2-7 | **Contas — UI em Conexões**: várias contas por provedor (adicionar com passo a passo de login nativo, rótulo, status, cota), escolha da política por persona/workspace com explicação curta, aviso honesto de termos de uso por provedor (a Persona só usa contas que a própria pessoa conectou e não compartilha credenciais) | Quill (era Prism/Lumen) | W2-6, W2-8 | (app) fluxo de adicionar/escolher política; a11y | **doing** 04/11 (quill) — UI pronta: adicionar conta em 3 passos (login nativo), renomear/remover, rodízio por persona, aviso de termos; vitest + check-pkg OK. Falta: captura no shell real (cadeia final na fila `build`) + aceite Muse |
| W2-8 | **Design + arte**: specs Muse para assuntos (bolinhas com cor+nome, estados, não lidas), contas (cartões por provedor/conta, política) e "Ensinar" (consentimento, moldura de gravação, revisão do passo a passo com miniaturas); pedido ao Brush (ícones de provedor, ilustração de gravação) | Muse + Brush | — | specs em `persona-spec/design/`; assets em `persona-assets/` | **done** 04/11 (muse) — `design/{WAVE2,SUBJECTS,TEACH-PERSONA}-SPEC.md`; primitivos Accounts/Teach/ChoiceCards; arte do Brush |
| W2-9 | **Ensinar — spike técnico**: captura (Electron `desktopCapturer` + `MediaRecorder`, tela/janela escolhida, microfone opcional) → quadros-chave por mudança de tela → transcrição da narração (local, ex.: whisper.cpp, ou texto digitado) → motor com visão gera RASCUNHO de skill (passos numerados, onde clicar, o que verificar, critérios de pronto, ferramentas necessárias, miniaturas); medir custo/tempo em um exemplo; documentar em `persona-spec/spikes/teach-persona.md` | Rivet (captura/IPC/transcrição) + Forge (rascunho de skill) | S3, D-052 | exemplo sintético → quadros + transcrição → rascunho de skill com passos; nada sai do computador | todo — captura desktop existe e passa (`teach-ipc.spec` + `teach-sources.spec`), mas as 4 lacunas do Quill (miniatura por fonte, minimizar+pílula, protocolo `persona-teach://frame`, blur no stop) NÃO foram iniciadas; só depois do instalador (rivet) |
| W2-10 | **Ensinar — entrega**: consentimento claro (o que grava, onde fica, quem vê), gravação local como artefato privado da persona/projeto com política de retenção, moldura discreta/cronômetro/pausar/parar, aviso para evitar senhas e opção de borrar regiões, revisão/edição do passo a passo, skill entra como CANDIDATA no fluxo existente (avaliação → ativação conforme política → rollback), nunca amplia ferramentas por conta própria; DM/projeto privado não vira skill pública sem promoção explícita; botão "Ensinar" no perfil, na DM e no cartão | Rivet + Forge + Anvil (artefato/retenção) + Prism/Lumen (UI) | W2-9, W2-8 | gravação curta sintética → rascunho candidato; nada ativa sozinho; arquivo local | doing — Lumen ✔ ação Ensinar no menu do cartão; desktop (rivet) volta a todo: as mesmas 4 lacunas, só depois do instalador; UI do Ensinar/consentimento: Quill |
| W2-11 | **Aceite E2E** (Probe): os cenários de WAVE2 §Aceite (assuntos, contas, ensinar) + galeria/axe/loading preso das telas novas | Gauge (era Probe) | W2-3, W2-7, W2-10 | 3/3 grupos verdes + capturas claro/escuro | doing — smoke SubjectBar PASS (probe); contas/Ensinar pendentes das UIs |
| W2-12 | **Documentação e guia**: `docs/persona` (assuntos, várias contas e termos, Ensinar e privacidade) + ARCHITECTURE | Forge | W2-3, W2-7 | guia atualizado | **done** 03/11 (forge) — `assuntos.md` / `conexoes.md` / `ensinar.md` + ARCHITECTURE |

### "Traga o que suas IAs já sabem" — BYC-1..BYC-6 (BRIEFING item 18; `BRING-YOUR-CONTEXT.md`)

Prompt pronto + colar resposta + pasta vault (Obsidian/.md), revisão antes do Cofre; onboarding passo 2 + Importar/Importadores. Export oficial permanece avançado (Forge importadores).

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| BYC-1 | **UI**: bloco BYC (Copiar prompt, colar, Organizar, abas de dica) no onboarding passo 2 e em Conhecimento › Importar / Importadores | Prism + Lumen | S6 | (app) bloco visível e locale pt/en | review — passo 2 (`BringYourContextBlock`) e página "Trazer contexto" ligados (prism); Importar: laço do "Escolher pasta" corrigido + "N itens no Cofre ✓" (lumen, `bring-context-import-page` 3 testes); aguarda a suíte BYC app do Gauge e a captura no app real (depende do bundle exclusivo) |
| BYC-2 | **Parser colagem**: seções ## → propostas `brief`/`constraint`/`decision`/`memory` + proveniência; `(incerto)`; bloqueio sensível | Forge | Cofre tipos | testes unitários verdes | **done** 04/11 (forge) — `bring-context.ts` |
| BYC-3 | **Vault pasta**: .md recursivo, frontmatter/links, ignora `.obsidian`/`.trash`/binários, limite tamanho, reimport path+hash | Forge (+ importador Markdown existente) | BYC-2 | fixture vault §Aceite 2 | **done** 04/11 (forge, parser) — `previewBringVault` |
| BYC-4 | **UI revisão**: aceitar/editar/descartar/privado; dedup e conflito com decisão fixada | Lumen | BYC-2, BYC-3 | §Aceite 3 | review — 7 estados + regras que chegam NÃO aceitas ("Aceitar todas as regras (n)") por decisão da Muse; galeria axe 0 (lumen); aguarda o aceite visual da Muse (falta a captura no app real) |
| BYC-5 | **Desktop**: seletor nativo "Escolher pasta" (Electron) | Rivet | D8 | escolher pasta no app empacotado | review — `pickDirectory`/`pickVaultFolder`/`pickExportFolder` com `preload-app.spec` verde (rivet); falta provar o seletor nativo no app EMPACOTADO (Probe, no NSIS do H) |
| BYC-6 | **Aceite E2E** (Probe): 3 cenários de `BRING-YOUR-CONTEXT.md` §Aceite + galeria Importadores | Gauge (era Probe) | BYC-1..BYC-4 | 3/3 grupos verdes | **doing** — `mandatory-bring-your-context*.spec.ts` (`it.todo`) |

### Função Gestor de equipe — GES-1..GES-6 (BRIEFING item 20; `MAESTRO.md`; UI **Gestor**, nunca "Maestro")

Gestor atribuível (N personas): contratar, alocar, reorganizar, montar equipe; limites/aprovação/auditoria; vários Gestores com escopo.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| GES-1 | **Domínio + store**: função Gestor em systemRoles; limites (aprovação, máx. personas, orçamento, setores, canGrantGestor) | Forge + Anvil | GOV, S3 | Coordenação template default também Gestor | **done** 04/11 (forge+anvil) — `withDefaultGestor` no core/onboarding/createPersona/setPersonaSystemRoles |
| GES-2 | **Ferramentas**: contratar/alocar/reorganizar/montar-equipe (plan → approve → apply); acesso ≤ Gestor | Forge | GES-1 | unit tests | **done** 04/11 (forge) — contratar/alocar/reorganizar/montar-equipe plan→approve→apply; `measureV1Close` GES-2 4/4 (reports/forge.md 04/11 08:00) |
| GES-3 | **Multi-gestor**: escopo setor/projeto; conflito propose/comment/empate | Forge | GES-2, GOV | § Vários Gestores | **done** 04/11 (forge+anvil+prism) — multi-gestor/conflito: domínio 3/3 no v1-close; contrato host (anvil); cartão `commentOnId` na UI (prism) |
| GES-4 | **UI**: interruptor **Gestor de equipe** + selo **Gestor**; cartão plano; animação entrada | Prism + Lumen | GES-2 | § UI | review — interruptor/limites/selo aceitos pela Muse; cartão do plano corrigido (`gestor-plan-message-card` 5, `live-stream-side-refresh` 4); depende da captura no shell real e do host criar as personas ao aprovar "assemble" (GES-1b); suíte GES-6 do Gauge |
| GES-5 | **Auditoria**: motivo no perfil + Saúde | Anvil + Lumen | GES-2 | § Aceite 3 | **done** 04/11 (anvil) — `gestorAuditReason` no cartão + `getTeamHealth.gestorAudit` |
| GES-6 | **Aceite E2E** (Probe): `MAESTRO.md` § Aceite + adversariais | Gauge (era Probe) | GES-2..GES-5 | 3 bullets + GES-2b..f | **doing** — `mandatory-team-manager*.spec.ts` |

### Segundo cérebro — SB-1..SB-7 (BRIEFING item 19; `SECOND-BRAIN.md`; fila após BYC + Gestor)

Vault interno mantido pelos agentes (Empresa › Segundo cérebro): páginas markdown tipadas, curadoria Bibliotecário, `brain_search`/`brain_read` com ACL, permissões lembradas com gate adversarial.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| SB-1 | **Store**: páginas tipadas, markdown fonte, índice derivado, versões (nada apaga), links/backlinks, ACL por página | Anvil | Cofre/memória | migração + CRUD | **done** 04/11 (anvil) — schema v15 `BrainRepos` + remotes |
| SB-2 | **Curadoria + higiene**: pós-tarefa/conversa/aprovação; contradição sinalizada; dedup/envelhecimento sem LLM; DM → privado | Forge | SB-1, PRO | §6.1 | **done** 04/11 (forge, domínio) — `curateBrain` / `hygieneBrain` |
| SB-3 | **Permissão lembrada**: página *Permissão concedida* + gate (match exato escopo/limites/persona/validade); revogar imediato; auditoria de dispensa | Forge + Anvil | GOV, aprovações | §6.3 + matriz adversarial verde | **done** 04/11 (forge, gate) — store Anvil |
| SB-4 | **Tools agente**: `brain_search`, `brain_read`, `brain_propose`; compileContext regras obrigatórias | Forge | SB-1 | ACL + citações | **done** 04/11 (forge, domínio) — MCP Rivet |
| SB-5 | **UI** Empresa › Segundo cérebro (início, tipos, página, permissões, grafo opcional) | Lumen + Prism | SB-1, SB-3 | §5 | review — ids→nomes, "Comece aqui" em 2 linhas + Abrir, sem slug, "Tirar permissão", retrato na permissão; galeria axe 0 (lumen); aguarda o aceite visual da Muse (falta a captura no app real) |
| SB-6 | **Export/sync** vault Obsidian (mão única default) | Forge + Rivet | BYC-3 | §6.4 | doing — lado desktop ✔ (rivet: `vault-export.spec`, `applyVaultExport` + leftover); falta a persistência (forge/anvil) |
| SB-7 | **Aceite E2E** (Probe): `SECOND-BRAIN.md` §6 + ênfase adversarial permissão | Gauge (era Probe) | SB-2..SB-5 | 4 bullets + SB-3b..f verdes | **doing** — `mandatory-second-brain*.spec.ts` (`it.todo`) |

### Onda 3 — computer use próprio (IDEAS.md; fila Atlas 03/11)

Laço confiável no engine; desktop/UIA/MCP = Rivet; overlay/cursor/replay visual = Muse (`COMPUTER-USE-SPEC.md` quando sair).

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| W3-1 | **Engine**: laço planejar → agir → verificar (captura + árvore UIA via port; fake em teste) → corrigir/tentar de novo com limite → reportar; cada passo com expectativa explícita | Forge | W2-9 | 2 passos sintéticos: toast ausente → retry → toast ok; sem expectativa recusa; UIA fake | **done** 03/11 (forge) — `runComputerUse` |
| W3-2 | **Controle compartilhado**: humano mexeu no mouse/teclado → pausa imediata, estado `você assumiu`, retomada só explícita | Forge (estado) + Rivet (hook) + Muse (overlay) | W3-1 | takeover no meio do plano não clica o próximo passo; resume sem auto | **done** 03/11 (forge, estado) — `createMemorySharedControl` |
| W3-3 | **Replay**: log por ação (o que viu, o que fez, resultado) para a UI reproduzir | Forge (log) + Muse (player) | W3-1 | `projectReplayForUi` devolve saw/did/result estáveis | **done** 03/11 (forge, log) |
| W3-4 | **Gate + limites**: permissão por passo em ações externas/sensíveis (reusa `McpGateway` do Rivet) + teto de tempo/passos/orçamento | Forge (port) + Rivet (MCP) | W3-1 | deny/ask não age; tempo/passos/tokens param o laço | **done** 03/11 (forge, port) |
| W3-5 | **Desktop**: UIA real + hook de input + overlay Electron (click-through) + bind MCP | Rivet | W3-1..W3-4, Muse spec | clique real + árvore UIA; humano assume | todo — COM + hook + MCP + overlay com specs verdes (`computer-use-hook/bind/overlay`); falta a prova viva do uiohook global no Windows; fora de foco até o instalador fechar (rivet) |
| W3-6 | **Visual**: cursor da persona (nome/avatar, Bézier), moldura, replay | Muse | W3-1, W3-3 | spec + primitivos; protótipo já em `design/computer-use-prototype/` | **done (parte da Muse)**: spec + protótipo + primitivos `PersonaCursor`/`ActionReplay`/`cursor-motion` ✔ (muse); renderizador no overlay do Rivet (`personaCursorOverlayHtml` no boot) ✔. Falta só o aceite por captura no desktop real, que depende do W3-5 (Rivet: uiohook global) |

### Otimização de tokens — OPT-1..OPT-8 (`TOKEN-OPTIMIZATION.md`; D-059) — medição começa JÁ (Forge); otimizações pesadas só DEPOIS da integração

> Nota de reconciliação (Keel, 04/11): os blocos BYC-1..6, GES-1..6, SB-1..7 e W3 acima são os que o Atlas distribuiu e carregam o status vivo dos builders; minhas decomposições paralelas (BYC-1..7, GES-1..8, SB-1..12) foram removidas para não duplicar. As decisões D-056, D-057 e D-058 (projeto de cada frente) permanecem.

Pedido do Miguel: a Persona não pode ser um harness gastão — gasto normal, sem desperdício. Primeiro MEDIR (barato, agora, com o Forge); as alavancas pesadas entram quando tudo estiver amarrado. Alavancas: não chamar modelo quando não precisa (pré-roteador, pass-through, gate determinístico, Vigia por regras, descanso sem IA — já existem; medir e ampliar), prefixo estável + cache do provedor (ordem fixa sistema → persona → ferramentas → obrigatórios → contexto variável; nada volátil no prefixo), contexto mínimo suficiente (só o assunto ativo, Inline & Spill com orçamento por camada, resumos incrementais, Chain of Recall sob demanda), ferramentas mínimas por turno, modelo certo por trabalho (triagem/Bibliotecário/Vigia/iniciativa no motor barato; sessões aquecidas), saídas enxutas, proatividade com orçamento, batching do Router, memória que encolhe sem LLM.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| OPT-1 | **Medir (começa agora)**: ledger por turno (persona, motor/conta, tipo — triagem, resposta, execução, iniciativa, Bibliotecário, Vigia, avaliação —, tokens de entrada/saída, cache read/write, tamanho do contexto por camada, chamadas por tarefa concluída); cenários de referência reprodutíveis (runner scriptado com contagem fiel + 1 rodada real mínima, dentro do limite de execuções reais): pedido simples no #geral; tarefa multi-etapa com revisão; dia ocioso com rotinas; 30 personas com iniciativa; dogfooding "Padaria Lua"; relatório "tokens por cenário" | Forge (+ Rivet: contagem/cache por motor) | D5a (UsageStore), bench-context | relatório `persona-spec/reports/bench-tokens.md` com a LINHA DE BASE de hoje | **done** 04/11 (forge+rivet) — ledger canônico + baseline `bench-tokens.md` / `tokens-baseline.md` |
| OPT-2 | **Gate de regressão** local: cenários scriptados falham se os tokens por cenário piorarem > 10% | Tally (era Forge) | OPT-1 | gate roda no CI local | **done** 04/11 (tally) — gate de regressão: `persona-engine/scripts/assert-opt2.ts` + `gate-tokens.ts` (runner scriptado fiel, 9 cenários, qualidade 1,00), passo informativo no `persona-gate` (`token-gate-step.mjs`, 5/5 node:test), baseline `persona-spec/baselines/token-faithful.json`; check-pkg engine OK |
| OPT-3 | **Prefixo estável e cache**: ordem fixa do prompt, nada volátil no prefixo, medir hit rate por motor | Tally (era Forge; + Rivet no runner) | OPT-1 + integração | ≥ 60% de cache read no prefixo nos motores que suportam | **done** 04/11 (tally) — prefixo estável provado (`tests/stable-prefix.spec.ts`, `token-faithful.spec.ts`; bug P1 do `UNSTABLE_PREFIX` corrigido); hit rate por motor: claude/codex 1,00, opencode/cursor n/d (não reportam cache) |
| OPT-4 | **Contexto mínimo**: orçamento por camada, resumos incrementais por assunto, dedupe do que já está no prefixo, ferramentas mínimas por turno com descrições curtas | Tally (era Forge) | OPT-1, W2-1 (assuntos) | contexto por camada dentro do orçamento; menos tokens por tarefa | **done** 04/11 (tally) — recall por relevância ligado no host (W4, `orchestration.ts` talkLayers) com `persona-host/tests/token-wiring.spec.ts` + `context-budget.spec.ts`; 1ª entrega intocada |
| OPT-5 | **Modelo certo por trabalho + sessões aquecidas**: triagem/Bibliotecário/Vigia/iniciativa no motor rápido e barato; execução pesada só no motor da persona; reutilizar sessão sem reenviar contexto | Tally (era Forge; + Rivet na política de runner) | OPT-1, pool de sessões | zero chamadas de IA com equipe ociosa sem objetivo; triagem ≤ 1 chamada barata por mensagem que exige decisão | doing — política ✔ (tally): triagem no runner barato (W1) e depois sem chamada (`skipTriage`, D-073, ligada; roteamento igual com/sem em `token-wiring.spec` SK a–d); medida REAL pendente: o TTL real de cache/sessão só sai da rodada pareada (OPT-8/B, trava `real` depois do V1-P0-5) |
| OPT-6 | **Saídas enxutas, proatividade com orçamento e batching**: limite por canal (chat ≤ 100 palavras), sem eco nem narração de passos, relatórios estruturados curtos; iniciativa em lote diário, cadência pela taxa de aceitação; batching de eventos do Router sob rajada | Tally (era Forge) | OPT-1 | menos tokens por resposta; rajada processada em lote | **done** 04/11 (tally) — saídas enxutas (`lean-output`, `talk-output`) e medida de tokens por resposta no bench; a W3 (relato curto do executor) está encanada e DESLIGADA por decisão do Atlas até a rodada real pareada |
| OPT-7 | **Painel em Uso e limites**: tokens por tarefa concluída, por persona, por tipo, cache hit e tendência, com rótulo medido/estimado | Lumen (+ Anvil: RPC) | OPT-1, D5b | (app) painel com dados reais | **done** 04/11 (anvil RPC) — `recordTurnLedger` / `getUsagePanel`; UI Lumen |
| OPT-8 | **Metas e aceite**: −40% de tokens por tarefa concluída vs. a linha de base; ≥ 60% de cache read; zero chamadas de IA com equipe ociosa sem objetivo; metas ajustadas após a 1ª medição; relatório final antes/depois | Tally + Forge (dividido) | OPT-2..OPT-7 | metas atingidas ou renegociadas com números | doing — placar D-068 (pipeline fiel): custo −34% / −40% (pior dia −34%), tokens −17% / −29%; com W3 −52% / −51%; `cut-40` segue **blocked** (W3 desligada; falta a rodada pareada D-070 B); `skipTriage` (D-073) ligado e cortesia sem modelo (D-075) em fechamento (tally) |

### Dogfood Agência — AG-001..AG-004 (achados do Atlas em `reports/dogfood-agencia.md`; 04/11)

| # | Tarefa | Dono | Depende | Critério de aceite (testável) | Status |
|---|---|---|---|---|---|
| AG-001 | **Sprint ausente nos Quadros**: `sprintsEnabled` também para site/simples/marketing e dogfood clica `Abrir quadro` | Lumen (feito por Probe com OK do Keel) | PB-5 | `dogfood-ag-001.client.spec.tsx` (site + Pessoal/simples) | **done** 04/11 (probe) |
| AG-002 | **Navegação do perfil**: `navigateProfileViaRailCard` cai no primeiro "Conversar com"; rail sem nome fixo | Forge + Probe | — | `rail-persona-name.spec.ts` + E2E do rail | **done** 04/11 (forge+probe) |
| AG-003 | **Ensinar no perfil**: hero do `PersonaProfilePage` com botão **Ensinar** (Conversar · Editar · Ensinar) | Prism | W2-10 | trocar o `it.fails` por `it` em `dogfood-ag-003.client.spec.tsx` e passar; captura do hero | **done** 04/11 (prism) — botão **Ensinar** no hero do perfil + ⋯ da DM; `dogfood-ag-003` passa como `it`; falta só a captura do hero (Muse) |
| AG-004 | **Permissão lembrada para revogar**: first-run vazio → grant → lista → revogar; grant só no harness de dev | Anvil + Probe | SB-5 | `onboarding.spec.ts` (host) + `seedDevHarnessBrainGrant` atrás de `readClientDevSeedEnabled` | **done** 04/11 (anvil+probe) |

### Marco A — Fundação (esqueleto, esteira, desacoplar DeepSeek, spikes)

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| A0 | Esqueletos `packages/persona/*`, aliases/tsconfig, Typert, trava de build, regras dos builders, `pnpm install` | Keel | — | 9 testes fumaça verdes; Typert gera `persona-host`; `with-lock.mjs` | **done** — commit `7caef40` (push aguardando typecheck do pre-push) |
| A1 | Porte `context.mjs` → `persona-core/src/context` + 14 testes | Forge | A0 | ≥14 verdes; tsc/oxlint limpos | **done** 03/11 (forge) |
| A2 | *(legado/opcional)* Porte do `kanban-bridge` com as correções da D-024 | Forge | — | só se o Keel reativar | adiada |
| A3a | Fumaça de base (`install-electron`, `start:web`, `dev:desktop` por CDP) → `spikes/baseline.md` | Rivet | A0 | 3 passos ou falha exata | **done** |
| A3b | Desacoplar DeepSeek (telemetria, Welcome, updater, política), nome/appId/protocolo/home, ocupante de marca, template `persona` | Rivet | A3a, B9 | (app) janela "Persona" sem Welcome DeepSeek; zero requisições a `deepseek*`; specs de desktop verdes | **done** 03/11 (rivet) |
| A4 | Sonda OAR/CLIs (somente leitura) → `spikes/oar-windows.md` | Rivet | A0 | script roda; matriz e go/no-go | **done** (relatado) |
| A5 | Spike `node:sqlite` no Electron RunAsNode | Rivet | A3a | saída `fts5:1` | **done** (relatado) |
| A6 | Esteira Tier 1/Tier 2, CLI falsa, README | Probe | A0 | `PERSONA_E2E=1 vitest run …smoke-web` verde + capturas | **done** (smoke-web verde ~41 s; Tier 2 skip sem Electron — reexecutar) |
| A7 | UI p1: spike de composição, tema/movimento, locales; p2: protótipo do shell com dados falsos rodando | Prism | A0, A6, BR1 | p1: spike + vitest/tsc verdes; p2: (app) shell renderiza | **done** 03/11 (prism) — shell no Chrome real; refinamento visual com a Muse (D-050) |
| BR1 | Folha de estilo D + marca (B1–B5) | Brush | — | Atlas aprova | feita (direção D aprovada); lote P0 em andamento |

### Marco B — Engine, store e Router (integrar a base)

Aceite do marco: um pedido no canal vira Tarefa por Triagem, a executora (runner `dsh` com LLM de mock) conclui, o Atlas responde; reinício e troca de modelo preservam o assunto; acesso revogado deixa de funcionar.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| B1 | `persona-core/domain`: IDs ramificados, entidades, ACL `can(actor, action, resource)` (+ adaptadores `authorize`) | Forge | A1 | ≥40 casos de acesso verdes | **done** 03/11 (forge) |
| B2a | `persona-store`: abertura, `application_id`/`user_version`, backup, migrações, `tx()`, helpers de teste | Anvil | A5 | reabrir preserva; versão maior recusada; falha de migração preserva backup; ≥15 testes | **done** 03/11 (anvil) |
| E-1 | `persona-engine`: tipos, IDs, erros, reasons, **stages**, máquina de estados e ports (`Repositories`, `Executor`, `Channel`, `Clock`, `Ids`) — porte de `src/core/{model,stage,reasons,errors,ids,ports,part}.ts` + testes ported | Forge | A1 | testes do protótipo portados verdes; crédito MIT no NOTICE | **done** 03/11 (forge) |
| E-2 | Engine: comandos Intake/Evals/Tickets/Assignments/Replies sobre repositórios em memória; outbox | Forge | E-1 | suíte do protótipo portada ≥ (n do digest) verde; idempotência de Trigger; 1 Eval por Thread; Mandate imutável | **done** 03/11 (forge) |
| E-3 | `persona-store`: esquema v1 do engine + repositórios SQLite; testes de contrato rodando contra memória **e** SQLite | Forge | E-2, B2a | mesma suíte verde nos 2 backends; reinício preserva | **done** 03/11 (anvil; SQLite do engine) |
| E-4 | Despachante de efeitos (outbox após commit) + retomada de Assignment interrompida | Forge | E-3 | efeito só após commit; crash simulado reexecuta sem duplicar | **done** 03/11 (forge) |
| E-5 | Projeção **estágio→coluna do kanban** e read-models ("Precisa de você", Visão geral, Tarefas por projeto) | Forge | E-3 | tabela estágio→coluna testada; "saudável não ocupa espaço" (lista vazia) | **done** 03/11 (forge) |
| B2b | Repositórios de produto: workspace, member, project, persona, participation, channel, dm | Anvil | B1, B2a | CRUD+restrições; ≥25 testes | **done** 03/11 (anvil) |
| B2c | Log de mensagens/eventos por stream (`seq`), FTS5, cursor, ACL na consulta, recall por intervalo com fuso | Anvil | B2b | seq monotônica sob concorrência; recall exato; busca não vaza DM; ≥20 testes | **done** 03/11 (anvil) |
| B3 | `persona-host` controlador `@Remote` v1 (leitura: equipe, projetos, canais, DMs, tarefas, Visão geral) + montagem do Remote no cliente + papéis de peer | Anvil | B2b, E-5 | cliente de teste pelo gateway real; peer sem papel recebe `no-allow`; `generate-typert` limpo | **done** 03/11 (anvil) — Remote v1 + telas (aprovações, regras, convites, import, atenção, canvas, rotinas, triage, revisar) |
| E-6 | **Intake** de Persona: canais/DMs/rotinas como `Source` interno → Triggers (ator, idempotência) | Forge | E-3, B2c | mensagem de pessoa num canal gera Trigger único; bot/atores fora da lista caem no Gate | **done** 03/11 (forge) |
| R-1 | Contrato `Runner` + runner `dsh` (executor do protótipo generalizado): sessão+diretório por Tarefa, eventos→`RunEvent`, cancel, usage, jobs em background (>5 s), limite pós-turno, slot reservado, concorrência, retomada com nota de recuperação | Rivet | A1, E-1 | com `llm-mock-server`: ordem de eventos, cancel, retomada após "reinício", troca de modelo preserva histórico | **done** 03/11 (rivet) |
| R-2 | **Router (Atlas)**: sessão DSH longa em modo async `start/stop`, lote entre inferências, prompts portados/traduzidos (orchestrator/dispatch/replies/subscriptions) com identidade Atlas, ferramentas de domínio no escopo do agent | Rivet | R-1, E-2, B3 | com LLM de mock: Trigger → decisão `accept` → Ticket → Assignment; resposta ≤100 palavras só pelo Atlas; conversa não trava durante ferramenta lenta | **done** 03/11 (rivet) |
| B4 | Contexto no host: `compileContext` + **Inline & Spill + Chain of Recall** (`persona_recall(id)` pela cadeia, autorização por salto), manifesto no `run`, revalidação antes do despacho | Forge | A1, B2c, E-3 | ID+resumo+vizinhos inline; spill em ponteiro; recall percorre a cadeia; revogação no meio cancela | **done** 03/11 (forge) |
| B7 | Um run mutante por Tarefa; resposta pertence ao assunto/run capturados | Anvil | R-1, E-3 | 2º run recusado/enfileirado; resposta ao assunto original | **done** 04/11 (anvil) — `MutantRunBook` claim queued/refused + subject capturado |
| B8 | Suíte dos testes obrigatórios (parte B) + cenários Super-agent | Gauge (era Probe) | B-todos | 9 cenários da spec + 7 do Super-agent nomeados e verdes | doing — mandatory-b9 6 verdes/4 todo; scope 2/6; proactivity 8 todo (probe) |
| B9 | `persona-app` monta host + UI + desabilita rows (lista do spike A7) e telemetria; template `persona` | Keel | B3, A7p1, A3b | `dsh --profile persona --dump-config` lista as linhas Persona; boot real mostra `client-ui-persona` e nenhum shell Harness | **done** (03/11: 29 entradas de boot; `dev:desktop` com perfil persona depende do A3b do Rivet) |

### Marco C — Experiência principal (conversa, canais, DMs, Visão geral, kanban, arquivos, rotinas)

Aceite: uma tarefa atualiza conversa e quadro; canais e DMs mantêm continuidade (reiniciar o app); "Precisa de você" responde-se no app.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| C1a | Host: equipes/projetos/personas (CRUD, participação, Subscription = "seguir assunto") | Anvil | B3, E-3 | RPC real; ACL por método | **done** 03/11 (anvil) |
| C1b | Host: canais, DMs, assuntos, mensagens (CRUD + stream baseline+incrementos) amarradas ao Intake | Anvil | C1a, E-6 | reconecta com baseline; continuidade após reiniciar o host | **done** 03/11 (anvil) |
| C1c | Host: busca global respeitando acesso | Anvil | C1b | não vaza DM/projeto | **done** 03/11 (anvil) |
| C2 | Host: resposta multicanal (só Atlas), resumos de marco, cartão citado abre a Tarefa real, **Attention** (pergunta estruturada, resposta da pessoa volta ao Ticket) | Forge | R-2, E-5 | pedido→Tarefa→executora→resposta; Attention respondida retoma a Tarefa | **done** 03/11 (forge) — `Engine.answerAttention` + marco no #geral; j11 |
| C3 | Host: **Rotinas v1** como `Source` temporal (D-014): `dsh-util-time`, idempotência `routine_id:scheduled_for`, lease, backoff, janelas de silêncio, catch-up por rotina, "Pausar equipe" | Anvil | E-6 | relógio falso, sem duplicar; pausar cancela ativos; "retry de rotina" | **done** 03/11 (anvil (store)) |
| C4 | Host: `persona-files` por `projectId` (D-020) | Anvil | B3 | sem acesso → erro; fora da raiz recusado | **done** 03/11 (anvil) |
| C5a | UI: shell/sidebar escura + **Visão geral** ("Precisa de você" primeiro) + navegação + estados vazios (RCD) | Prism | A7, B3, BR-ícones | (app) todas as seções com dados reais; teclado/foco; barra de UI | review — fidelidade visual do #geral; aguarda o aceite da Muse na rodada de captura (prism) |
| C5b | UI: conversa canal/DM com stream, cartões de tarefa, "Contexto usado", pass-through visível | Prism | C1b, C2 | (app) stream; trocar de aba não redireciona | todo — o que sobra: cartões de tarefa e DM (voltaram a todo). FECHADOS por teste: pass-through ("Luna está acompanhando" abre o cartão da persona, `pass-through-card` 3) e plano ao vivo; captura na rodada pós-H (prism) |
| C5c | UI: composer com seletor de modelo (identifica a persona) | Prism | C5b | (app) | review — composer (memória, fila, atalhos, limites) com o Flint sob o Prism; itens HINT-clamp e P0-17/18/27/29 retidos em `persona-spec/ui-hold.json` até o aceite da Muse |
| C5d | UI: faixa "Sua equipe neste canal", avatares, poses por estado, perfil; **coreografia do UX-GUIDE §3** | Prism | C5b, BR-personagens | (app) estado vem de eventos reais; reduced-motion; ícone+texto | review — faixa da equipe (skeleton no reload, estado por pose); captura na rodada pós-H e aceite da Muse (prism) |
| C6a | UI: Kanban por projeto (projeção dos estágios; FLIP quando a persona move o cartão) | Lumen | E-5, C1a | (app) ação do cartão reflete na conversa | **done** 03/11 (lumen) — ConnectedGlobalKanban real + Revisar |
| C6b | UI: Kanban global com filtros | Lumen | C6a | (app) só projetos autorizados | **done** 03/11 (lumen) — Remote real |
| C7a | UI: Arquivos | Lumen | C4 | (app) | **done** 03/11 (lumen) — Remote real (need-root) |
| C7b | UI: Rotinas | Lumen | C3 | (app) | **done** 03/11 (lumen) — rotinas do agendador |
| C8 | Onboarding (projeto + Atlas em <60 s, conectar CLI no ponto de uso, checklist de ativação RCD) | Prism (UI) + Anvil (host) | C1b, A3b, BR-vazios | (app) pasta limpa → 1ª resposta útil | review — 1ª tarefa/overlay pelo Remote: `onboarding-overlay-sync` + `overlay-first-delivery` (prism, anvil); aguarda o E2E real (probe) |
| C9 | E2E do marco C + capturas claro/escuro vs `dirD-tela.png` | Gauge (era Probe) | C1–C8 | verde em home limpo | doing — galeria real de todas as telas (probe); diff vs dirD em refinamento |

#### UI-3 — Flint (composer, teclado, conversa; sob o Prism). Atribuição da Muse (UX-BEYOND-T3) · D-076/D-077: tudo abaixo está em **review** (código + testes + `check-pkg client-ui-persona` OK); falta UMA rodada de capturas no shell real (claro/escuro, 1440/960/200%, axe); a publicação segue o gate (sem hold por arquivo) e o ACEITE da Muse trava a ENTREGA (varredura no app instalado do H2); a lista dos itens abertos está em UX-BEYOND-T3 §Andamento; nenhum item novo é aberto até isto fechar

| ID | Item (id da Muse) | Dono | Status |
|---|---|---|---|
| FL-1 | P0-13 cartão da persona dentro da tela + Esc (código do Prism; validação no app real) | Flint | review — `persona-card-keyboard-fit` |
| FL-2 | P0-22 rodapé do rail a 200% (uma linha, sem folhagem) + **Configurações** como `settings.launcher` próprio (uma engrenagem; indicadores de conexão/atualização do DSW mantidos) + **Ajuda e atalhos** (`?`) | Flint | review — `rail-short-viewport`, `settings-launcher` |
| FL-3 | A-5 pílula do rodapé com o estado REAL da IA (`{motor} · {n}% livre`, `—` sem cota, sem IA, conferindo) + popover com a linha da IA | Flint | review — `rail-ai-status`, `rail-ai-pill` |
| FL-4 | A-2 DMs listam a equipe inteira ("Começar conversa"); rascunho/histórico por DM (corrigiu vazamento entre DMs) | Flint | review — `dm-team-list`, `composer-slash-actions` |
| FL-5 | HINT-clamp: o balão "Quem responde" nunca passa da janela | Flint | review — `who-responds-hint-fit` |
| FL-6 | P0-17 composer com memória: Ctrl+S guarda/esvazia/devolve, ↑ vai para trás, colagem grande vira cartão "Texto colado · N mil caracteres · Abrir", localStorage | Flint | review — `composer-memory-keyboard` (20) |
| FL-7 | P0-27 menu "/" só com o que tem ação; `/assunto nome` | Flint | review — `composer-slash-actions`, `subject-open-by-name` |
| FL-8 | IV-4 = P0-28 limites reais no `/limites` e na gaveta (sem 38/66/42) | Flint | review — `engine-limits` (14+3) |
| FL-9 | IV-3 markdown seguro nas respostas (lista, tabela, código com Copiar, link, citação, títulos Nunito 800) | Flint | review — `markdown-parse`, `markdown-body`, `channel-markdown` |
| FL-10 | P0-30 envio que falha: "Não enviado · Tentar de novo" | Flint | review — `send-failed` |
| FL-11 | P0-18 balão da fila/steer · P0-20 F6 + Ctrl K que executa · IV-5 streaming + Parar | Flint | **todo** (não iniciados por D-076; P0-18 já tem a UI do Prism com 7 testes; IV-5 depende do Bolt) |

#### IV — Integração viva (Bolt, host novo) · D-076: no máximo 2 itens abertos; relato em `reports/bolt.md`

| ID | Item | Dono | Status |
|---|---|---|---|
| IV-1 | A equipe age sozinha: agendador do host (Vigia §5), rotinas vencidas executadas, iniciativa diária no horário de trabalho, “sem objetivo = descansa sem IA”, Pausar equipe persistente | Bolt | **done** 04/11 16:55 — vitest 58 (relógio falso + host real scriptado + contrato dos 5 Remotes), `check-pkg` host/store OK, **processo real** `scripts/proactivity-live.ts` PASS; limitações no relato (retry/answerAttention não retomam o worker) |
| IV-X | Pedidos pequenos de host delegados pelo Atlas (ACL `measureProactivityV1`/`measureFirstDeliveryAcceptance`, `hireCard` + nome/bicho únicos, `PersonaNowView.draftFiles`, `firstRequest` + `suggestFirstRequests`, pré-roteador que silencia) | Bolt | **doing** |
| IV-5 | steer, fila persistida entregue ao runner e **Parar** | Bolt | todo (depende de IV-X) |
| IV-6 | `/lado` e comandos que o Flint precisar | Bolt | todo |
| IV-7 | “No limite → Retomar” real | Bolt | todo |
| IV-9 | Remotes para criar/editar Rotinas (store `update/delete` e `describeRrule/buildRrule` já prontos) | Bolt | todo |

### Marco D — Execução real (CLIs, cofre, uso, Vigia, jobs)

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| D1a | Runner OAR `claude` (sessão por Tarefa, eventos, resume, cancel, usage, permissão explícita, `CLAUDE_CONFIG_DIR` isolado opcional) | Rivet | A4, R-1 | `scriptedRuntime` + CLI falsa; nenhuma sessão abre sem modo explícito | **done** 03/11 (rivet) |
| D1b | Runner OAR `codex` | Rivet | D1a | idem | **done** 03/11 (rivet) |
| D2 | Runners `opencode` (resume só no mesmo `cwd`) e `cursor` (sem MCP) | Rivet | D1a | idem; `unavailable` visível | **done** 03/11 (rivet) |
| D3 | Ferramentas Persona nas CLIs por `serveMcpTools` (`persona_recall`, `persona_report`, `persona_ask`…) com identidade do run, não do argumento | Rivet+Forge | D1a, B4 | CLI falsa chama a ferramenta; ator forjado recusado; Report atualiza o Ticket | **done** 03/11 (rivet) |
| D4a | Cofre DPAPI (IPC main↔host) + conexões por pessoa; desligar OAuth de assinatura do `llm-pi-ai` | Rivet | A3b | varredura sem segredos em YAML/DB/logs/prompt | **done** 03/11 (rivet) |
| D4b | UI Conexões | Lumen | D4a, D1a | (app) | **done** 03/11 (lumen) — Conexões reais com loginHint/erros tipados |
| D5a/b | Uso e limites: livro, cota oficial, estimativas rotuladas / UI | Rivet (D5a) / Lumen (D5b) | D1a | ausência ≠ 0%; origem sempre; (app) | **done** 03/11 (rivet D5a livro+officialQuota+quotaCardMeters); Lumen D5b UI |
| D6 | Política de conexão sem fallback silencioso | Forge | D1a | falha de A não dispara B | **done** 03/11 (rivet) — erros tipados cli_not_found/not_logged_in/model_unavailable/quota_exhausted, sem fallback silencioso |
| D7 | **Vigia (watchdog)**: sessão independente agendada (modelo barato), detecta falha de infra, loop improdutivo, desvio de objetivo; ajusta prompts/regras com trilha de auditoria; sugestão: Luna | Rivet + Forge | R-2, C3 | cenários sintéticos: Assignment travada → alerta; loop → pausa; mudança de regra versionada | **done** 03/11 (forge+anvil) — vigiaTick + agendador; Vigia é função atribuível |
| D8 | Empacotamento Windows sem assinatura | Rivet (Probe executa) | A3b, E4, E5, BR-marca | `--check` → `:dir` → completo; instala/onboarding/desinstala | doing — mesma trilha do V1-P0-6 (rivet, ativo 1): pack desacoplado do hash H; depois win-unpacked + proof, NSIS, sha256 e o teste do instalado (Probe) |
| D9 | E2E + smokes reais opt-in por CLI | Probe | D1–D8 + Atlas | relatório por CLI | todo |
| D10 | Benchmark inicial (processo novo × reutilizado) | Probe | D1a | p50/p95 | todo |

### Marco E — Colaboração e equipes à distância

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| E1 | Handoffs entre executoras (Assignments sucessivas; orçamento, profundidade, dedupe, ciclo) | Forge | C2, D3 | "ciclo de handoffs", retry idempotente | **done** 03/11 (forge) — handoffs |
| E2 | Skills próprias (catálogo, versões, avaliação, política, rollback, proposta) | Forge | B2c | skill de DM não vira pública; reverter | **done** 03/11 (forge) — skills |
| E3 | Memória (FTS5 + interface AI-memory do Akita) | Forge | B4 | herança de permissões; revogação limpa derivados | **done** 03/11 (forge+anvil) — FTS5; ai-memory opcional atrás de flag (off) |
| E4 | Proatividade por regra (modo "só registrar", depois execução especulativa opt-in) | Forge + Rivet | C3, R-2 | registro sem efeitos colaterais; opt-in por regra | **done** 03/11 (forge+rivet) — autonomia + observe gate |
| E5 | `apps/persona-edge`: Worker + **Durable Object por workspace** (sequência por stream, WS hibernation) + D1 + R2; testes locais (Miniflare) | Anvil | B2c | ordenação e replay por cursor; teste de 2 clientes | **done** 03/11 (anvil) — local (miniflare) |
| E6 | `persona-sync`: sincroniza só streams compartilhados (DM não sobe), payload cifrado opcional, retomada offline | Anvil | E5 | 2 hosts convergem; DM não vaza; offline retoma | **done** 03/11 (anvil) — local; DM não sobe, cifra, offline |
| E7 | Convites e membros (Worker) + papéis (`remote-access`); tarefa roda na máquina da persona | Anvil + Rivet | E5, E6 | "amigo sem acesso"; convite expira/revoga | **done** 03/11 (anvil) — local (convites/papéis) |
| E8 | **Source GitHub** (webhook via Worker → DO → desktop dono; ou polling): porte de `src/sources/github*` | Forge (Source) + Anvil (relay) | E5, E-6 | webhook assinado vira Trigger; replay idempotente | **done** 03/11 (forge+anvil) — webhook→engine local; relay Worker público pendente (E11) |
| E9 | UI: perfil da persona, membros/convites, handoffs, aprovações, regras de triagem editáveis | Prism | E1–E7 | (app) | **done** 03/11 (lumen+prism) — telas via Remote |
| E10 | Testes restantes (13/13 + Super-agent) + E2E | Gauge (era Probe) | E1–E9 | verde | doing — it.todo em B8/S7/PRO-6 (probe) |
| E11 | **Deploy Cloudflare** (conta, segredos) | Keel/Atlas | E5–E8 | **só com liberação do Atlas** | blocked (aprovação) |
| E12 | **Equipe remota montada no app** (achado do Anvil 04/11: E5–E7 existem como biblioteca/local, mas a sync REAL não está ligada ao host): módulo `persona-host/src/remote-team.ts` — conecta ao edge com `actorId`, replica SÓ canais explicitamente autorizados (DM nunca), aplica o pull via `EventRepos` sem re-ingest (idempotente por id de evento, sem disparar engine), persiste cursor e estado revogado; Remotes `connectRemoteTeam`/`issueInvite`/`acceptInvite`/`revokeMember`/`syncRemoteTeam` (+ estado); segredos do edge no Cofre | Anvil | E5–E7, V1-P0-2 | prova com DOIS perfis (temp homes) sob a trava `build` + edge local (miniflare): canal autorizado converge, DM não vaza, revogado para de receber, offline retoma por cursor; contrato em `persona-spec/contracts/remote-team.md` para a UI | **done** 04/11 (anvil, escopo local) — dois perfis reais sem seed + RPC autenticado, mensagem nova/DM/revogação/cursor, proof passed:true e 12 capturas em sync-real; bridge/remote-teams 2/2 (58,83s), typecheck edge OK; Web sem cofre recusa antes de rede; membros/syncedAt/behindBy para E13 (Quill); deploy externo continua E11 |
| E13 | **UI Equipe remota**: conectar/entrar por convite, escolher canais compartilhados, membros e revogação, estado de sincronização honesto (online/offline/revogado) — consome o contrato do E12; sem texto técnico | Quill (era Prism + Lumen) | E12 | jsdom + galeria; fluxo "convidar → aceitar → ver o canal" no app | **doing** 04/11 (quill) — UI pronta com os campos do Anvil (pessoas da equipe, Última troca por `syncedAt`, `behindBy`); vitest + check-pkg OK. Falta: prova com 2 perfis no app real (script `quill-remote-team-ui.mjs`, cadeia final na fila `build`) + aceite Muse |

### Marco F — Migração e desempenho

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| F1 | Importadores (formatos reais fornecidos pelo Miguel) com preview/rollback/dedupe | Forge | B2c, E2 + amostras | reimportar não duplica | **done** 04/11 (forge) — importadores com preview/rollback/dedupe: fixtures oficiais sintéticas ✔ (ChatGPT, Claude.ai, Obsidian, Gemini, Grok); amostra real dispensada pelo Atlas |
| F2 | UI de importação | Prism | F1 | (app) | **done** 03/11 (lumen/prism) — ImportWizard via Remote |
| F3 | Benchmarks repetíveis (abertura, clique, 1º evento, 1º token, bytes de contexto, chamadas/tarefa, cache, RAM; 1/4/8 projetos) **+ experimento de batching do Router e ablação de pass-through** com cargas sintéticas | Probe | D10, R-2 | `pnpm run persona:bench` → JSON p50/p95 + comparação com/sem pass-through | todo — bench do engine/router FECHADO (`bench-*.md`); bench do app depende de D10 e de execuções reais (rodada pareada): ninguém ativo |
| F4 | Otimizações guiadas | todos | F3 | antes/depois | doing — engine pré-roteador 41→26 chamadas ✔ (forge); bench do app (probe) |
| F5 | Acessibilidade (teclado, foco, reduced-motion, contraste) | Gauge (era Probe) | C5–C8 | suíte axe/teclado | doing — axe/teclado em todas as telas (probe) |
| F6 | Fechamento | Probe+Keel | F1–F5 | relatório final | todo |

### Marco G — Canvas (opcional)

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| G1 | Relações/posições sobre os mesmos IDs; relação não concede acesso nem inicia trabalho | Forge | B2c | relação sem delegação não dispara run | **done** 03/11 (forge) — relações |
| G2 | Canvas (só visíveis, modo lista por teclado) | Quill (se o Prism passar) | G1 | (app) mesma tarefa em quadro/canvas/conversa | **doing** 04/11 (quill) — mapa 15/12 px + modo lista por teclado, seleção única, relações em palavras ✔ (testes + check-pkg). Falta: captura no shell real + aceite Muse |
| G3 | Benchmark do canvas | Probe | G2 | relatório | todo |

### Arte (Brush) — dependências das tarefas de UI

| ID | Entrega | Dep. | Aceite | Status |
|---|---|---|---|---|
| BR-personagens | Referência+avatar+8 poses × 5 personagens a partir de `dirD-model-sheet.png` (um personagem aprovado antes do próximo) | BR1 | Atlas aprova; Prism carrega sem 404 | done (Brush: 5 personagens × poses; banner/folhagem em entrega) |
| BR-ícones | Navegação, estados do agente, colunas/estágios, privacidade, selos de runtime (SVG) | BR1 | contraste ≥3:1; ícone+rótulo | todo |
| BR-vazios | Vazios/onboarding P0 | BR-personagens | idem | todo |
| BR-marca | Ícone do app/`.ico`, tray, faixa NSIS, favicon | BR1 | Rivet usa sem retrabalho | done (Brush; ícones aplicados pelo Rivet) |
| BR-P1 | Extras (animais, piscar, fundos) — **Brush, com a direção da Muse** | BR-personagens | idem | doing: spec `design/BR-P1-SPEC.md` ✔ (muse). Aprovados e no app: kit de vida do tamanduá, tucano, `empty-sem-ia`, `spot-sem-ia` e o avatar do mico v2. Pensando sem balão (decisão 04/11). Orçamento 7,64/10 MiB (PLAN-assets-brush §8). Faltam raposa, panda e os outros 8 extras, o P2 nº 3–6 e o P3 (sob demanda) |

---

## 8. Assets do Brush (resumo; detalhe em `PLAN-assets-brush.md`)

Direção **D** aprovada (traço da B + paleta da C; contorno ameixa `#34243F`; tokens em `persona-assets/references/README.md`; folha canônica `dirD-model-sheet.png`).

| Grupo | Itens | Formato/tamanho | Prioridade |
|---|---|---|---|
| Marca | símbolo, logotipo horizontal/empilhado, monocromático, ícone do app (1024² + `.ico`), tray, faixa NSIS 164×314, imagem de compartilhamento, favicon | SVG+PNG | P0 |
| Personagens (5) | referência (2048²), avatar (1024²→256/96/48), **8 poses** (1536², alfa): disponível, trabalhando, revisando, aguardando resposta, aguardando aprovação, descansando, offline, erro | PNG alfa | P0 = 50 imagens |
| Estados do Super-agent | ícones/selos para **Precisa de você**, Aguardando evento, Em revisão, Bloqueado, Concluído; pass-through ("acompanhando") | SVG | P0 |
| Ícones (~75) | navegação, ações, estados do agente, colunas/estágios, privacidade, selos de runtime | SVG 24 px | P0 sidebar+estados |
| Vazios/onboarding (19) | primeiro uso, equipe, conectar CLI, primeiro projeto, vazios, uso indisponível, CLI não encontrada, sem conexão, equipe descansando, sucesso, erro, canvas vazio, carregando | SVG/PNG 960×720 | P0 principais |
| Extras | piscar ×5; 8 animais; fundos/texturas; banners de projeto | PNG | P1 |

Regras: fundo transparente; pés a 92% da altura; sem marcas de terceiros; derivados por script do Prism em `client-ui-persona/src/client/assets/`; **masters grandes fora do git** (D-010).

---

## 9. Riscos principais

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | OAR falha no Windows (opencode/cursor) | média | alto | A4 cedo; go/no-go; DSH direto sempre; plano B (D-009) |
| R2 | Cursor sem MCP | certo | médio | capability explícita |
| R3 | Troca de shell quebra rows do cliente | alta | médio | spike A7p1; critério de revisitar D-004 |
| R4 | Portar o engine é maior que o previsto (≈12 mil linhas no protótipo; acoplamentos a DSH/Feishu/deployment) | média | alto | porte em passos pequenos com testes portados (E-1…E-6); digest do protótipo; Forge não porta Feishu |
| R5 | Consistência de ~100 imagens | alta | médio | referência aprovada por personagem |
| R6 | Builds simultâneos | média | alto | trava; D-023 |
| R7 | Build/typecheck lento | alta | médio | plano-fonte; global só no fim de marco |
| R8 | Cota das assinaturas | média | médio | opt-in; Atlas libera |
| R9 | `safeStorage` só no main | certo | médio | IPC (D4a) |
| R10 | Pre-commit do upstream | média | baixo | só o Keel comita |
| R11 | Divergência do upstream | baixa | baixo | mudanças cirúrgicas |
| R12 | AI-memory do Akita sem contrato | alta | baixo | base local + interface |
| R13 | OAR sem aprovações | certo | médio | D-013 |
| R14 | Termos dos provedores (apps de terceiros × assinaturas) | baixa (uso pessoal) | alto se distribuído | rever antes de distribuir |
| R15 | `node:sqlite` no Electron RunAsNode não exercitado | média | alto | spike A5; plano B |
| R17–R19 | Sem VS Build Tools/long paths; 1ª fumaça baixa runtimes; renomear `productName` quebra scripts | certo/alta/alta | alto/baixo/médio | pedir aprovação com antecedência; A3a antes de renomear; lista no RECON §6 |
| R20 | Goldens do desktop/web (86 specs) quebram | certo | baixo | refrescar pelo dono |
| R21 | Router async (start/stop) é recurso desligado por padrão no Harness: pode ter arestas | média | alto | spike no R-2 com mock; plano B: modo síncrono com lote |
| R22 | Cloudflare: custo/credenciais/limites do DO e D1; deploy fora do nosso controle | média | médio | tudo testado local; deploy só com Atlas (E11); plano B fly.io |
| R23 | Escopo UX/animação alto (UX-GUIDE) pode atrasar telas | alta | médio | `usePersonaMotion` central; Atlas guarda; aceite por captura e perf trace curto |

---

## 10. Itens para o Atlas (alta demanda)

(1) Aprovar o lote P0 de personagens do Brush por personagem; (2) liberar smokes reais com CLIs/contas do Miguel no marco D; (3) aprovar ações de administrador (E4/E5) antes do D8; (4) amostras reais de exportação (marco F); (5) AI-memory do Akita: onde está/contrato; (6) **Cloudflare:** conta/credenciais e deploy (E7/E11) — construir e testar local primeiro; (7) trailer de commit: BRIEFING pede "Claude Opus 5.5", o Keel roda como Sonnet 5.5 — usarei o do BRIEFING salvo objeção; (8) conformidade com termos dos provedores antes de qualquer distribuição.

---

## 11. Onda 1 (disparada em 03/11) e próximas

| Agente | Em andamento | Próximo |
|---|---|---|
| Keel | A0 ✔ · build de verificação · digest do protótipo → briefing do engine | E-1 briefing; B9 |
| Forge | F3 10/10 via pré-roteador + F4 41→26 | F1 amostra real · PB-10 UI (Lumen) |
| Rivet | A3a → A5 → A4 | A3b (após relato de A3a); R-1 |
| Prism | A7 p1 (spike de composição, tema/movimento, locales) | A7 p2 (protótipo do shell) quando A6 pronto |
| Probe | A6 (harness Tier 1/2, CLI falsa) | B8 |
| Brush | lote P0 de personagens (Atlas) | ícones, vazios, marca |

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
| S5 | UI: **onboarding em 5 passos** ligado ao host (nome → Sobre a empresa/Cofre → conectar harnesses detectados → montar equipe → `#geral` com apresentação e 1ª tarefa sugerida); critério RCD: valor antes de esforço, <60 s até a 1ª resposta útil | Prism | A7, S1, S2 | (app) pasta limpa → onboarding completo; capturas claro/escuro vs `dirD-tela.png`; reduced-motion; teclado | doing — completeOnboarding no host ✔; overlay via Remote ✔; E2E real pendente (probe) |
| S6 | UI: **editor de persona** (todos os campos do SCOPE §1), galeria de avatares (Brush)/upload/silhueta, "Nova persona" com construtor, cartão "Contratar <nome>?", tela **Conhecimento** (Cofre) | Prism (editor, galeria, contratar) + Lumen (Conhecimento/Cofre) | S1–S4, BR-personagens | (app) criar/editar/apagar persona; trocar Coordenação; aprovar contratação | doing — editor + contratar (prism) + Conhecimento/Cofre (lumen) |
| S7 | Testes dos cenários obrigatórios novos (hoje `it.todo`): onboarding do zero; `persona_propose` sem escalar acesso; troca de Coordenação sem perder histórico; Cofre em "Contexto usado"; reduced-motion; diff visual vs `dirD-tela.png` | Probe | S1–S6, A6 | 6/6 verdes | doing — host J1–J10 verdes (`reports/journeys.md`, Forge); UI Probe 2/6 (reduced-motion + dirD ainda todo) |

### Proatividade nativa — PRO-1..PRO-6 (BRIEFING item 14; `PROACTIVITY.md`; D-048) — **requisito de aceite da v1**

Personas nunca preguiçosas nem dependentes de alguém cobrando. Lições do próprio projeto viram regra: relatar não bloqueia; responder não é despachar; fila vazia é evento; ociosidade/travamento detectados por máquina; contexto cheio/erro de conexão/prompt de confiança = falha de infraestrutura que o Vigia recupera.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| PRO-1 | **Engine**: laço de puxada (fila por persona filtrada por permissões; ao terminar/bloquear a Assignment o engine atribui a próxima elegível por prioridade, dependências prontas, ferramentas compatíveis, concorrência e orçamento; dependência concluída acorda a dependente por evento/Subscription), **objetivos** (Goal com critério de pronto, orçamento de rodadas), continuação/definição de pronto (propor tarefas de seguimento; proibido "posso fazer X se quiser" dentro do mandato), regras do Vigia (ociosa com fila/objetivo → atribui/replaneja; sem progresso N min → pede status e reinicia com RECOVERY_NOTE; bloqueada por colega → cutuca/escala; erro de runner/contexto cheio → nova sessão com handoff + backoff), **orçamentos** (propostas/dia por persona, tokens/execuções por persona e projeto, janelas de silêncio) e **níveis de autonomia** (só quando pedido · propor [padrão] · agir dentro de limites; especulativo começa em "só registrar") | Forge | P7–P9, E4, D7 | relógio falso: com backlog+objetivo nenhuma persona fica ociosa >1 ciclo do Vigia; concluir puxa a próxima; dependência acorda a dependente; fila vazia + objetivo ⇒ planejamento pela Coordenação; sem objetivo ⇒ descansa sem chamadas de IA | **done** 03/11 (forge) — puxada, objetivos, Vigia, continuação, orçamento |
| PRO-2 | **Host**: rotina de iniciativa por persona (diária no horário de trabalho + gatilhos por evento: PR aberto, erro recorrente, prazo), read-model **"Visão geral agora"** (o que cada persona faz, fila, tempo ocioso, entregas do dia, propostas aceitas), resumo **"Enquanto você estava fora"** ao abrir o app, configs de autonomia/orçamento/silêncio no Remote | Anvil | PRO-1, C3, B3 | rotina dispara no horário e respeita janelas; propostas agrupadas em resumo (não pings); "Enquanto você estava fora" lista eventos com links às tarefas reais | **done** 03/11 (anvil) — rotina de iniciativa, "agora/enquanto estava fora", autonomia, retenção |
| PRO-3 | **Execução**: recuperação de runner (contexto cheio/erro de conexão/prompt de confiança ⇒ nova sessão com handoff via Chain of Recall + retry com backoff), integração `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` no runner DSH, **normas de dono** no prompt base das executoras (terminar, verificar, reportar com evidência, propor próximo passo), **suíte de avaliação "preguiça"** por runner/modelo (tarefa multi-etapa, erro intermediário, ambiguidade pequena) cujo resultado vira dica ao escolher o modelo | Rivet | PRO-1, R-1 | Runner que cai/contexto cheio ⇒ recuperação automática com handoff; suíte roda com runner fake e relatório por modelo | **done** 03/11 (rivet) — recuperação/handoff/backoff, laziness suite |
| PRO-4 | **UI**: Visão geral "agora", controles de autonomia por persona/projeto, estados honestos (ocioso sem trabalho ≠ travado ≠ esperando você), "Enquanto você estava fora" (peak-end) | Prism | PRO-2 | (app) boot gate verde; estados com texto+ícone; reduced-motion | doing — faixa Agora/"enquanto estava fora"/editor ✔ (prism); dados live em ligação |
| PRO-5 | **UI de dados**: resumo agrupado de propostas (Aprovações: uma pergunta, ação primária, prévia de impacto/custo), regras de atenção, métricas (taxa de aceitação por persona realimenta a frequência, entregas) | Lumen | PRO-2 | (app) cartões estruturados; métricas legíveis | **done** 03/11 (lumen) — Aprovações (resumo diário)/Regras/Perfil via Remote |
| PRO-6 | **Aceite** dos 6 critérios do PROACTIVITY.md em E2E (relógio falso) + capturas | Probe | PRO-1..PRO-5 | 6/6 verdes | todo |

### Quadros por projeto com fluxo e sprints próprios — PB-1..PB-10 (BRIEFING item 15; `PROJECT-BOARDS.md`; D-053)

Pedido do Miguel: um kanban único mistura trabalhos de natureza diferente (contratar pessoas ≠ fazer um site). Cada projeto tem **o próprio quadro, com as próprias colunas e sprints**; o item "Kanban" vira "Quadros" (lista de projetos), e a visão global é por raias recolhíveis, nunca um quadro misturado. A **categoria de estágio** de cada coluna (`todo | doing | review | needs_you | done`, + marcador `blocked`) liga o fluxo personalizado aos estágios do engine — puxada, Vigia, proatividade, "Precisa de você" e métricas seguem funcionando em qualquer fluxo (D-029 permanece: o quadro é projeção dos estágios do Ticket).

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| PB-1 | **Domínio** (persona-core): `Workflow` por projeto (colunas ordenadas: nome, cor/ícone, WIP opcional, categoria de estágio), `WorkflowTemplate` pt-BR (Contratação, Site/produto digital, Software com sprints, Marketing/conteúdo, Atendimento/operações, Simples, Em branco), `Sprint` (nome, objetivo, datas, estado planejado/ativo/encerrado), campos extras tipados por fluxo (texto, link, número, data, seleção), `Ticket.columnId/sprintId/campos`; invariantes (≥1 `todo` e ≥1 `done`; `needs_you` única; remover coluna exige destino; WIP é aviso, não trava a máquina) | Forge | S1, B1 | testes de invariantes; Tarefas antigas sem coluna caem na primeira coluna da categoria do estágio; nenhum nome de persona/fluxo fixo no código | todo |
| PB-2 | **Engine**: projeção estágio↔coluna por projeto (coluna explícita vence se compatível; concluir → 1ª coluna `done`; Attention → `needs_you`), puxada/Vigia/proatividade por CATEGORIA, mover Tarefa entre colunas com ACL e trilha, Sprint ↔ `dsh-goal` (objetivo do sprint = goal da Coordenação), encerrar sprint rola o não concluído (com confirmação) e gera o resumo (entregue/atrasado/quem fez o quê) como mensagem de marco | Forge | PB-1, PRO-1 | Vigia e puxada passam em 3 fluxos customizados; editar fluxo sem perder Tarefas; resumo do sprint no canal do projeto | todo |
| PB-3 | **Coordenação propõe fluxo** a partir da descrição do projeto (prompt de proposta + parser sujo + cartão "Usar este fluxo?" com aprovação do usuário, nunca aplica sozinho) | Forge (prompt) + Anvil (Remote) | PB-1 | proposta válida (invariantes) ou degrade honesto; usuário aceita/edita | todo |
| PB-4 | **Store/host**: migração v8 (workflow, coluna, sprint, ticket coluna/sprint/campos), repositórios, Remote (`getProjectBoard`, `listBoards` com mini-resumo por projeto, `createWorkflowFromTemplate`, `updateWorkflow` com mapa de destino, `moveTicket`, `listSprints/createSprint/planSprint/startSprint/closeSprint/sprintSummary`, `proposeWorkflow`), ACL no servidor, retenção/export/import/sync (fluxo e sprint são compartilháveis; DM não), suíte de queda sobre SQLite | Anvil | PB-1 | migração v7→v8 preserva Tarefas; editar fluxo e mover Tarefas sem perda; crash suite verde | todo |
| PB-5 | **UI Quadros**: sidebar Projetos abre o quadro do projeto (abas Quadro · Conversa · Arquivos · Rotinas · Sprints); "Kanban" → "Quadros" (grade/lista de projetos com mini-resumo: contagem por categoria, sprint atual, quem trabalha agora); visão global por raias de projeto recolhíveis; fim do quadro misturado | Lumen (+ Prism: sidebar/abas do shell) | PB-4, PB-8 | (app) projeto "Contratação" e "Site" têm colunas diferentes e Tarefas isoladas | todo |
| PB-6 | **UI editor de fluxo** + escolha do modelo ao criar o projeto + cartão de proposta da Coordenação: renomear/reordenar (arrastar com teclado equivalente)/adicionar/remover coluna com destino, categoria com explicação curta, WIP, campos extras, prévia ao vivo | Lumen | PB-4, PB-8 | (app) editar sem perder Tarefas; a11y teclado | todo |
| PB-7 | **UI sprints**: faixa no topo do quadro (sprint atual, objetivo, dias restantes, progresso), planejamento backlog ↔ sprint, encerrar com resumo e rolagem do não concluído | Lumen | PB-4, PB-8 | (app) criar, planejar, encerrar; mensagem de marco no canal | todo |
| PB-8 | **Design + arte**: specs Muse para quadro por projeto (coluna com ícone/cor, estado vazio ilustrado POR COLUNA, FLIP do mini-avatar entre colunas, editor de fluxo, faixa de sprint, grade "Quadros"); pedido ao Brush de ícones de coluna/estados vazios por modelo | Muse + Brush | — | specs publicadas em `persona-spec/design/`; assets em `persona-assets/` | todo |
| PB-9 | **Aceite E2E** (Probe): os 5 cenários de PROJECT-BOARDS §3 (projetos isolados; concluir → coluna `done` do projeto; Attention → `needs_you`; editar fluxo sem perder Tarefas e com Vigia/puxada ativos; sprint criar/planejar/encerrar com mensagem de marco; Coordenação propõe fluxo) + galeria/axe/loading preso das telas novas | Probe | PB-5..PB-7 | 5/5 verdes + capturas claro/escuro | todo |
| PB-10 | **Migração do que existe**: `GlobalKanban`/`ConnectedGlobalKanban` → "Quadros" sem regressão (Revisar continua no cartão); atualizar guia do usuário (`docs/persona`) e `ARCHITECTURE.md` | Lumen + Forge (docs) | PB-5 | testes existentes verdes; guia atualizado | todo |

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
| B7 | Um run mutante por Tarefa; resposta pertence ao assunto/run capturados | Anvil | R-1, E-3 | 2º run recusado/enfileirado; resposta ao assunto original | todo |
| B8 | Suíte dos testes obrigatórios (parte B) + cenários Super-agent | Probe | B-todos | 9 cenários da spec + 7 do Super-agent nomeados e verdes | doing — mandatory-b9 6 verdes/4 todo; scope 2/6; proactivity 8 todo (probe) |
| B9 | `persona-app` monta host + UI + desabilita rows (lista do spike A7) e telemetria; template `persona` | Keel | B3, A7p1, A3b | `dsh --profile persona --dump-config` lista as linhas Persona; boot real mostra `client-ui-persona` e nenhum shell Harness | **done** (03/11: 29 entradas de boot; `dev:desktop` com perfil persona depende do A3b do Rivet) |

### Marco C — Experiência principal (conversa, canais, DMs, Visão geral, kanban, arquivos, rotinas)

Aceite: uma tarefa atualiza conversa e quadro; canais e DMs mantêm continuidade (reiniciar o app); "Precisa de você" responde-se no app.

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| C1a | Host: equipes/projetos/personas (CRUD, participação, Subscription = "seguir assunto") | Anvil | B3, E-3 | RPC real; ACL por método | **done** 03/11 (anvil) |
| C1b | Host: canais, DMs, assuntos, mensagens (CRUD + stream baseline+incrementos) amarradas ao Intake | Anvil | C1a, E-6 | reconecta com baseline; continuidade após reiniciar o host | **done** 03/11 (anvil) |
| C1c | Host: busca global respeitando acesso | Anvil | C1b | não vaza DM/projeto | **done** 03/11 (anvil) |
| C2 | Host: resposta multicanal (só Atlas), resumos de marco, cartão citado abre a Tarefa real, **Attention** (pergunta estruturada, resposta da pessoa volta ao Ticket) | Forge | R-2, E-5 | pedido→Tarefa→executora→resposta; Attention respondida retoma a Tarefa | doing — conductor ✔ (resposta sem Tarefa, Tarefa→revisão→concluída, bloqueio "Precisa de você", resume idempotente; anvil); DM/@menção/streaming em curso |
| C3 | Host: **Rotinas v1** como `Source` temporal (D-014): `dsh-util-time`, idempotência `routine_id:scheduled_for`, lease, backoff, janelas de silêncio, catch-up por rotina, "Pausar equipe" | Anvil | E-6 | relógio falso, sem duplicar; pausar cancela ativos; "retry de rotina" | **done** 03/11 (anvil (store)) |
| C4 | Host: `persona-files` por `projectId` (D-020) | Anvil | B3 | sem acesso → erro; fora da raiz recusado | **done** 03/11 (anvil) |
| C5a | UI: shell/sidebar escura + **Visão geral** ("Precisa de você" primeiro) + navegação + estados vazios (RCD) | Prism | A7, B3, BR-ícones | (app) todas as seções com dados reais; teclado/foco; barra de UI | doing — dados reais ✔ (Remote); fidelidade visual em passe com a Muse |
| C5b | UI: conversa canal/DM com stream, cartões de tarefa, "Contexto usado", pass-through visível | Prism | C1b, C2 | (app) stream; trocar de aba não redireciona | doing — stream do canal ✔ (followMessages); cartões de tarefa/pass-through/DM pendentes |
| C5c | UI: composer com seletor de modelo (identifica a persona) | Prism | C5b | (app) | doing — "Persona que responde" ✔; composer redesenhado pela Muse |
| C5d | UI: faixa "Sua equipe neste canal", avatares, poses por estado, perfil; **coreografia do UX-GUIDE §3** | Prism | C5b, BR-personagens | (app) estado vem de eventos reais; reduced-motion; ícone+texto | doing — faixa com Brush ✔; banner/Sol/Luna ligados; refinamento Muse |
| C6a | UI: Kanban por projeto (projeção dos estágios; FLIP quando a persona move o cartão) | Lumen | E-5, C1a | (app) ação do cartão reflete na conversa | **done** 03/11 (lumen) — ConnectedGlobalKanban real + Revisar |
| C6b | UI: Kanban global com filtros | Lumen | C6a | (app) só projetos autorizados | **done** 03/11 (lumen) — Remote real |
| C7a | UI: Arquivos | Lumen | C4 | (app) | **done** 03/11 (lumen) — Remote real (need-root) |
| C7b | UI: Rotinas | Lumen | C3 | (app) | **done** 03/11 (lumen) — rotinas do agendador |
| C8 | Onboarding (projeto + Atlas em <60 s, conectar CLI no ponto de uso, checklist de ativação RCD) | Prism (UI) + Anvil (host) | C1b, A3b, BR-vazios | (app) pasta limpa → 1ª resposta útil | doing — completeOnboarding no host ✔ (anvil) + overlay via Remote (prism); E2E real pendente (probe) |
| C9 | E2E do marco C + capturas claro/escuro vs `dirD-tela.png` | Probe | C1–C8 | verde em home limpo | doing — galeria real de todas as telas (probe); diff vs dirD em refinamento |

### Marco D — Execução real (CLIs, cofre, uso, Vigia, jobs)

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| D1a | Runner OAR `claude` (sessão por Tarefa, eventos, resume, cancel, usage, permissão explícita, `CLAUDE_CONFIG_DIR` isolado opcional) | Rivet | A4, R-1 | `scriptedRuntime` + CLI falsa; nenhuma sessão abre sem modo explícito | **done** 03/11 (rivet) |
| D1b | Runner OAR `codex` | Rivet | D1a | idem | **done** 03/11 (rivet) |
| D2 | Runners `opencode` (resume só no mesmo `cwd`) e `cursor` (sem MCP) | Rivet | D1a | idem; `unavailable` visível | **done** 03/11 (rivet) |
| D3 | Ferramentas Persona nas CLIs por `serveMcpTools` (`persona_recall`, `persona_report`, `persona_ask`…) com identidade do run, não do argumento | Rivet+Forge | D1a, B4 | CLI falsa chama a ferramenta; ator forjado recusado; Report atualiza o Ticket | **done** 03/11 (rivet) |
| D4a | Cofre DPAPI (IPC main↔host) + conexões por pessoa; desligar OAuth de assinatura do `llm-pi-ai` | Rivet | A3b | varredura sem segredos em YAML/DB/logs/prompt | **done** 03/11 (rivet) |
| D4b | UI Conexões | Lumen | D4a, D1a | (app) | **done** 03/11 (lumen) — Conexões reais com loginHint/erros tipados |
| D5a/b | Uso e limites: livro, cota oficial, estimativas rotuladas / UI | Rivet (D5a) / Lumen (D5b) | D1a | ausência ≠ 0%; origem sempre; (app) | todo |
| D6 | Política de conexão sem fallback silencioso | Forge | D1a | falha de A não dispara B | **done** 03/11 (rivet) — erros tipados cli_not_found/not_logged_in/model_unavailable/quota_exhausted, sem fallback silencioso |
| D7 | **Vigia (watchdog)**: sessão independente agendada (modelo barato), detecta falha de infra, loop improdutivo, desvio de objetivo; ajusta prompts/regras com trilha de auditoria; sugestão: Luna | Rivet + Forge | R-2, C3 | cenários sintéticos: Assignment travada → alerta; loop → pausa; mudança de regra versionada | **done** 03/11 (forge+anvil) — vigiaTick + agendador; Vigia é função atribuível |
| D8 | Empacotamento Windows sem assinatura | Rivet (Probe executa) | A3b, E4, E5, BR-marca | `--check` → `:dir` → completo; instala/onboarding/desinstala | blocked — admin do Miguel (E4 VS Build Tools/SDK, E5 LongPaths/Developer Mode); `package-win --check` pronto; build `--dir` em preparação (rivet) |
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
| E10 | Testes restantes (13/13 + Super-agent) + E2E | Probe | E1–E9 | verde | doing — it.todo em B8/S7/PRO-6 (probe) |
| E11 | **Deploy Cloudflare** (conta, segredos) | Keel/Atlas | E5–E8 | **só com liberação do Atlas** | blocked (aprovação) |

### Marco F — Migração e desempenho

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| F1 | Importadores (formatos reais fornecidos pelo Miguel) com preview/rollback/dedupe | Forge | B2c, E2 + amostras | reimportar não duplica | doing — framework + importadores ✔; aguarda amostras reais do Miguel |
| F2 | UI de importação | Prism | F1 | (app) | **done** 03/11 (lumen/prism) — ImportWizard via Remote |
| F3 | Benchmarks repetíveis (abertura, clique, 1º evento, 1º token, bytes de contexto, chamadas/tarefa, cache, RAM; 1/4/8 projetos) **+ experimento de batching do Router e ablação de pass-through** com cargas sintéticas | Probe | D10, R-2 | `pnpm run persona:bench` → JSON p50/p95 + comparação com/sem pass-through | doing — engine/router bench ✔; bench do app (probe) |
| F4 | Otimizações guiadas | todos | F3 | antes/depois | todo |
| F5 | Acessibilidade (teclado, foco, reduced-motion, contraste) | Prism+Probe | C5–C8 | suíte axe/teclado | doing — axe/teclado em todas as telas (probe) |
| F6 | Fechamento | Probe+Keel | F1–F5 | relatório final | todo |

### Marco G — Canvas (opcional)

| ID | Tarefa | Dono | Dep. | Aceite | Status |
|---|---|---|---|---|---|
| G1 | Relações/posições sobre os mesmos IDs; relação não concede acesso nem inicia trabalho | Forge | B2c | relação sem delegação não dispara run | **done** 03/11 (forge) — relações |
| G2 | Canvas (só visíveis, modo lista por teclado) | Prism | G1 | (app) mesma tarefa em quadro/canvas/conversa | doing — CanvasView + listCanvas ✔; modo lista por teclado pendente |
| G3 | Benchmark do canvas | Probe | G2 | relatório | todo |

### Arte (Brush) — dependências das tarefas de UI

| ID | Entrega | Dep. | Aceite | Status |
|---|---|---|---|---|
| BR-personagens | Referência+avatar+8 poses × 5 personagens a partir de `dirD-model-sheet.png` (um personagem aprovado antes do próximo) | BR1 | Atlas aprova; Prism carrega sem 404 | done (Brush: 5 personagens × poses; banner/folhagem em entrega) |
| BR-ícones | Navegação, estados do agente, colunas/estágios, privacidade, selos de runtime (SVG) | BR1 | contraste ≥3:1; ícone+rótulo | todo |
| BR-vazios | Vazios/onboarding P0 | BR-personagens | idem | todo |
| BR-marca | Ícone do app/`.ico`, tray, faixa NSIS, favicon | BR1 | Rivet usa sem retrabalho | done (Brush; ícones aplicados pelo Rivet) |
| BR-P1 | Extras (animais, piscar, fundos) | BR-personagens | idem | todo |

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
| Forge | A1 (contexto → persona-core) | E-1 → E-2 → B1/B2a |
| Rivet | A3a → A5 → A4 | A3b (após relato de A3a); R-1 |
| Prism | A7 p1 (spike de composição, tema/movimento, locales) | A7 p2 (protótipo do shell) quando A6 pronto |
| Probe | A6 (harness Tier 1/2, CLI falsa) | B8 |
| Brush | lote P0 de personagens (Atlas) | ícones, vazios, marca |

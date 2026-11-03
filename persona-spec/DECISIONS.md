# Persona — registro de decisões (DECISIONS.md)

Dono: Keel (Tech Lead). Formato: ID · data · decisão · motivo · consequência. Decisões do Miguel estão em `BRIEFING.md` e **não são reabertas aqui** (referenciadas como `M1…M7`, na ordem da seção "Decisões do Miguel"). Mudança em qualquer `M*` vai para Atlas.

Status: `vigente` · `substituída por D-xxx` · `proposta` (aguardando Atlas ou validação por spike).

## Decisões do Miguel (resumo, só referência)

| Ref | Resumo |
|---|---|
| M1 | Produto = app desktop (Windows primeiro), base `apps/desktop` + `apps/desktop-host`; agentes rodam no processo Node local e executam CLIs nativas e o loop DSH direto |
| M2 | Fork total do DeepSeek Harness; marca Persona; MIT e créditos ao upstream |
| M3 | Escopo: etapas A–G completas |
| M4 | Direção visual: animais ilustrados expressivos, lilás; rostos em DMs, corpo inteiro na faixa da equipe |
| M5 | Imagens: todas geradas pelo agente de arte (Brush); Atlas aprova referências de estilo |
| M6 | Sem revisão de código; testes obrigatórios (automatizados + app rodando) |
| M7 | UI em português do Brasil |

---

## Registro (Fase 0 — 03/11/2026)

### D-001 · Papéis e escalonamento · vigente
Keel decide o dia a dia e registra aqui; só vai ao Atlas o que o BRIEFING lista (mudar `M*`, cortar/adiar etapa, trocar a base, gastar dinheiro/publicar/credenciais reais, bloqueio). **Motivo:** BRIEFING. **Consequência:** itens "Proposta ao Atlas" (§11) são informativos, salvo os marcados *precisa de decisão*.

### D-002 · Pacotes novos formam o grupo `packages/persona/*` (dentro da árvore do upstream) · vigente
Escopo interno `@deepseek-ai/dsh-persona-*`, diretório = sufixo do nome (`packages/persona/persona-core` ↔ `@deepseek-ai/dsh-persona-core`). **Motivo (reconhecimento do RPC):** quase todo enumerador é fixo em `packages/*/*` e falha em silêncio fora dele: o gerador Typert ignora o pacote (sem `lib/typert.*` → sem `/remote`), o tsdown raiz não gera `lib/index.js|client.js`, vitest não acha `tests/`, `release:pack`/empacotamento do desktop o omitem (`prepare-package-set` lança "requires unpacked package"), `dev:web` não observa o plugin de cliente, `verify-product-use` quebra; a regex de pureza do bundle de cliente só aceita `/remote` de `@deepseek-ai/dsh-*`. Tentei `persona/*`+`@persona/*` primeiro; remendar 6 scripts de infraestrutura do upstream custa mais do que ignorar gates de CI que não rodamos. **Consequência:** não executamos os gates `verify-*`/`constraints`/cobertura 100%/README bilíngue do upstream (D-006); mas **respeitamos o que faz o build funcionar**: pares `exports`/`files` do Typert, `tsconfig.host/client.json` referenciados, aliases `/types` e `/client` em `tsconfig.base.json`, `dsh.client` nos plugins de cliente, pacote listado no bundle. `pnpm install` é obrigatório após criar pacote: **todos os esqueletos são criados de uma vez na A0**.

### D-003 · Mudanças no código do upstream são cirúrgicas e do dono do diretório · vigente
Novo comportamento vai em `packages/persona/*` e é composto por bundle/patch (`persona-app`). Edição direta em `apps/desktop*`, `packages/boot|credentials|llm|telemetry` (Rivet) e `packages/client/**`, `apps/web` (Prism) é permitida só para rebrand, desacoplamento da DeepSeek, re-skin e pontos de extensão ausentes. **Motivo:** manter o fork mesclável com o upstream e o diff legível. **Consequência:** cada edição upstream aparece no relatório do builder com justificativa de uma linha.

### D-004 · UI = plugin de cliente do Harness `client-ui-persona` (slots) · vigente
Reaproveitar shell (`client/web`), conexão/RPC, auth, ponte IPC do Electron, renderização de Markdown/código/diff e primitivos; substituir sidebar/workspace/chat por plugins Persona. **Motivo:** o Electron carrega o `dist` por `file://` e leva o fetch por IPC; uma SPA paralela perderia conexão, auth e integração desktop. **Consequência:** Prism segue `packages/client/AGENTS.md` (slots, props derivadas, sem ctx em componentes, CSS Modules); o Keel entrega o esqueleto do plugin (copiado de `client-ui-voice-input`) na A0 para reduzir a curva; locales: `pt` e `en` completos e os outros 6 idiomas do upstream gerados por script a partir do `en` (a paridade de chaves é verificada por spec do upstream). **Revisitar** se a A7 mostrar que a disciplina de slots custa mais que ganha (gatilho: >2 dias para a primeira tela estática).

### D-005 · Tema e idioma da UI · vigente
Tokens lilás por camada de tema sobre `--dsw-*` (`ui-theme`), claro e escuro; paleta final vem da folha de estilo aprovada (Brush/Atlas). Todo texto de UI passa por dicionários tipados (pt-BR é o idioma-fonte; `en` como fallback para chaves faltantes). **Motivo:** M7 e a regra `verify-client-ui-i18n` do cliente. Ícones de identidade (sidebar, estados, colunas) vêm do Brush; micro-glifos (fechar, chevron) reaproveitam `ui-primitives` — sem biblioteca de ícones nova.

### D-006 · Gates e verificação do fork · vigente
Obrigatório por tarefa: `vitest run <caminho>` (plano-fonte, sem build), `tsc -p packages/persona/<pkg>/tsconfig.json --noEmit` (ou `tsconfig.host.json`/`tsconfig.client.json` nos pacotes com duas faces), `oxlint` nos arquivos tocados. Fim de marco (Keel/Probe): `pnpm run typecheck` e `pnpm run build:check` do que existe. Gates `verify-*`/`constraints`/cobertura 100%/README bilíngue do upstream **não** se aplicam a `packages/persona/*` (ver D-002). Pre-commit do upstream (oxlint `--fix`, tradução, whitespace) continua ativo; só o Keel comita. **Motivo:** velocidade com rigor onde importa (M6). Testes aceitos só se afirmam comportamento observável.

### D-007 · Banco: SQLite embutido (`node:sqlite`) com migrações próprias · vigente (spike A5 confirma Electron)
`DatabaseSync` do Node ≥24.9 (o upstream já escolheu e registrou rejeição de `better-sqlite3`); FTS5 disponível (verificado local: SQLite 3.53.3). Pragmas: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout`, tabelas `STRICT`; `application_id` próprio e `user_version` monotônico; abrir recusa `application_id` alheio e `user_version` maior que o conhecido (nunca "resetar no lugar" — o banco é autoritativo); **backup antes de migrar** (`VACUUM INTO`); migrações adjacentes `vN→vN+1` imutáveis. Escritas curtas e síncronas, nunca `await` dentro de transação, nunca por token (por mensagem/checkpoint). **Não usar** `ctx.storage`/`storage-domain` (KV documento-por-linha, sem índices, sem transações entre tabelas, sem sequências). **Plano B** se a A5 falhar no Electron RunAsNode: `better-sqlite3` com `asarUnpack` (custo de empacotamento assumido pelo Rivet).

### D-008 · Onde ficam os dados · vigente
Pasta de dados do produto `PERSONA_HOME`, passada ao host como `DSH_HOME` (mecanismo existente): padrão `%USERPROFILE%\.persona`, sobrescrevível por env para teste/dev. Banco em `<PERSONA_HOME>\db\persona.db` (+WAL), backups em `<PERSONA_HOME>\db\backups\`, arquivos internos por projeto em `<PERSONA_HOME>\projects\<projectId>\`, sessões DSH em `<PERSONA_HOME>\sessions` (inalterado). **Não** em `%APPDATA%`/`userData` (o desinstalador apaga), **não** sob `sessions/` nem `storages/`, **não** em Documents sincronizado (WAL). Arquivos do usuário do projeto ficam na pasta que ele escolher (`project.root_path`, opcional). **Motivo:** relatório de dados (SQLite/sessões). **Consequência:** testes sempre apontam `PERSONA_HOME` para pasta temporária.

### D-009 · Execução: duas rotas e contrato próprio · vigente
Contrato `Runner` próprio (capabilities, health, authenticate, startTurn, events, cancel, usage). Rota **DSH direto** = `ctx.agents` (um Agent por persona+projeto, contexto por `agent.inject()`, eventos de `session/event`). Rota **CLI delegada** = OAR (`@botiverse/oar` 0.67.0 já no repo, Apache-2.0) para Claude Code, Codex, OpenCode e Cursor, com `serveMcpTools` para as ferramentas Persona. **Não** usar `ctx.subagents`/providers `subagent-*` para turnos de persona (one-shot, só resposta final, sem streaming/resume/usage, exigem Agent pai vivo). Reaproveitar só utilitários (`ctx.subprocess`, `scrubbedParentEnv`). **Plano B** para Claude/Codex se o OAR falhar no Windows ou limitar demais: adaptadores próprios sobre o Agent SDK do Claude (`pathToClaudeCodeExecutable` apontando para o `claude` instalado) e o app-server do Codex (`JsonRpcLineTransport`); a interface `Runner` isola a troca.

### D-010 · Arte e git · vigente
Masters grandes (≥1 MB) de `persona-assets/masters/` **não** vão ao git (ignorados); vão ao git: referências aprovadas, SVGs, e derivados otimizados (WebP/PNG ≤300 KB) gerados por script do Prism em `packages/persona/client-ui-persona/src/client/assets/`. Orçamento do repositório para arte: ≤60 MB. **Motivo:** ~100 imagens em 2K entupiriam o repo. **Consequência:** backup dos masters é do Atlas/Miguel (zip em release interno); `MANIFEST.json` por lote versionado.

### D-011 · Kanban sobre o board nativo (`agentTeams`) · **superada por D-029** (03/11)
O quadro nativo (`ctx.agentTeams`) vive no log da sessão-raiz e continua autoritativo para status/dono/dependências. Um **board root por projeto** (sessão Lead leve, Team mode ligado, residente enquanto o projeto está aberto; retomado sob demanda) é o `caller` das operações do host. `task_meta` (revisão, bloqueio manual, próxima ação, evidência, atividade) fica no SQLite como overlay chaveado por `(project, root_session, task-N)`; **nunca** se grava `completed` só para mover coluna. Coluna "Bloqueado" = `pending && !ready` **ou** bloqueio manual; `in_progress` nunca é "bloqueado" por `ready` (bug do bridge da spec: ver A2). Reatribuir é só Lead: o host executa como **operador em nome da persona**, gravando solicitante e executor em `task_actor`; nunca troca silenciosamente o agente. Conflitos relêem e decidem sobre o estado atual; sem retry automático; `TEAM_TASK_PERSISTENCE_UNCONFIRMED` reconcilia listando o quadro e comparando (o erro não traz id).

### D-012 · Persona de CLI no quadro: "assento" continuável com LLM nulo · **superada por D-029** (03/11)
Dono de tarefa precisa ser a raiz ou um filho **continuável**; criar filho executa um turno de modelo. Para personas em CLI delegada (sem modelo DSH), registrar um adaptador `ctx.llm` "persona-seat" que responde vazio e gratuito e criar um assento por persona+projeto. Limites do upstream: ≤8 filhos residentes, `maxDepth` 1 → assentos ficam frios fora de uso. **Se o spike falhar:** o Lead opera todas as mutações por delegação com atribuição só no `task_actor` (sem `owner` nativo para essas personas).

### D-013 · Aprovações em CLI: permissão pré-definida por persona/projeto · vigente
O OAR não expõe resposta a pedidos de aprovação; modos não-interativos (`dontAsk`, `acceptEdits`, sandbox do Codex com política `never`) são escolhidos antes da sessão. A UI mostra o modo ativo; "aguardando aprovação" existe para DSH direto e para decisões da própria Persona (handoff, publicação). Aprovação interativa por ferramenta em CLI fica como melhoria futura via plano B da D-009. O OAR do Claude por padrão **pula permissões** quando nenhum `--permission-mode` é passado → Persona sempre passa um modo explícito (padrão conservador).

### D-014 · Rotinas: agendador próprio · vigente
Tick próprio com `@deepseek-ai/dsh-util-time` (Cron/RRule/zona) e tabelas `routine`/`routine_run` (chave de idempotência `routine_id:scheduled_for`, lease por `UPDATE…RETURNING` em `BEGIN IMMEDIATE`, backoff, janelas de silêncio, política de catch-up por rotina). **Não** usar `ctx.schedule` (visível a todos os agentes via `schedule_list`, sem idempotência/retry/lease/escopo; duas fontes de verdade). O host registra rotinas armadas na inspeção de saída (`quit-inspection`) e a bandeja mantém o processo vivo.

### D-015 · Cofre de credenciais · vigente
`CredentialProvider` próprio (mesma chave `credentials`, então `llm-pi-ai` e a página de Models seguem funcionando) com criptografia DPAPI: segredos cifrados via `safeStorage` no processo principal do Electron por IPC (o host é processo-filho RunAsNode). Só guarda API keys de DSH direto. **CLIs mantêm login nativo**; Persona não guarda token delas. Não expor os fluxos OAuth de assinatura do `llm-pi-ai` (Anthropic/Codex): imitam o Claude Code e há risco de política. Nada de segredo no banco, em memória/export/prompt/canvas; teste de varredura exige isso. Referências por pessoa/conexão codificadas na chave (`persona-vault/<id>`).

### D-016 · Telemetria, updater e login DeepSeek desligados · vigente
Por padrão e sem opção na UI do usuário final: `session-telemetry-otel` (coletor deepseeksvc.com), `product-analytics`, `desktop-product-telemetry`, `plugin-package-inventory-deepseek`, updater e publicação (COS/EdgeOne), Welcome com gate de conta DeepSeek. Teste (A3) prova zero requisições a hosts `deepseek*`. O provedor DeepSeek continua disponível como um modelo entre outros (API key), sem prioridade na UI.

### D-017 · Marca, licença e créditos · vigente
Produto "Persona". Não usar "DeepSeek Harness" no nome nem arte/marca oficial do upstream; "baseado no DeepSeek Harness" só em Sobre/README/NOTICE. Manter `LICENSE` (MIT, © DeepSeek) e `THIRD_PARTY_NOTICES.md`; acrescentar OAR (Apache-2.0) e a nossa linha de copyright. Pastas/ids internos `dsh-*` do upstream permanecem (rename em massa é risco sem valor).

### D-018 · Cursor e OpenCode como rotas de segunda classe até provar · vigente
Cursor via OAR + `@cursor/sdk` exato `1.0.37` (peer opcional); **sem MCP** → ferramentas Persona indisponíveis (capability visível). OpenCode via ACP (`opencode acp`): retomada só no mesmo diretório. Chamar `cursor-agent` explicitamente (`agent` no PATH é o Grok); não executar `cursor-agent.cmd` em sondagem sem necessidade (faz `promote-staged`). Go/no-go de cada rota no spike A4.

### D-019 · Convites = acesso remoto opt-in ao host local · **superada por D-034** (Cloudflare, 03/11)
Sem servidor de sincronização/nuvem: o dono expõe seu host (desligado por padrão, opt-in explícito) e convidados entram como *peers não-donos* do gateway (`remote-access`: papéis por método e recurso) com token de convite de validade curta. ACL da Persona decide o que cada peer lê. Sincronização entre instâncias e Liveshare (servidor externo) ficam fora de escopo e documentados como limitação. **Motivo:** spec lista "compartilhamento remoto" como pendente e M1 diz app local. **Risco:** abre rede → só com ação explícita e aviso.

### D-020 · Arquivos do projeto: remote próprio por `projectId` · vigente
`persona-files` (host) resolve a raiz pelo banco, aplica a ACL da Persona e espelha a forma/erros do `workspace-files`; a UI reaproveita a fábrica `sidebar.files.tree`. Evita `workspace-files` (autoriza por sessão e não aceita raiz). Previews de arquivo usam uma sessão leve de arquivos por projeto enquanto o endereço de recurso exigir sessão.

### D-021 · Vínculo Persona ↔ sessão DSH é unidirecional · vigente
Persona nunca escreve no formato de sessão do Harness (formato publicado, sagrado) nem lê o JSONL direto. Tabelas `session_binding` (reservar → criar sessão → ativar; reconciliar `reserved` no boot com `persistence.stat`) e `run` (intervalo de `seq` 0-based da sessão; `UNIQUE(session_id, session_seq)` no espelho para não duplicar). Uma sessão DSH por (persona × projeto × audiência × conversa), nunca compartilhada entre DM e canal. Log legível da Persona é o espelho em `event`; evidência de ferramenta fica na sessão DSH, referenciada.

### D-022 · Testes com CLIs reais são opt-in e liberados pelo Atlas · vigente
Rotina de CI/dev usa runtime scriptado do OAR (`@botiverse/oar/testing`) e executáveis falsos no PATH. Smoke real (`PERSONA_REAL_CLI=1`) consome cota das assinaturas do Miguel → só após liberação do Atlas, com prompts triviais e uso de cota registrado no relatório. Conformidade: Persona dirige o binário nativo do próprio usuário, já autenticado por ele, sem tocar em tokens; os termos dos provedores quanto a uso automatizado por apps de terceiros devem ser revistos antes de qualquer distribuição pública (fora do escopo desta fase).

### D-023 · Concorrência no checkout único · vigente
Só Probe/Keel rodam `build*`, `tsc -b` do repo, `dev:desktop`, empacotamento e E2E, em série, com trava `.maestri/locks/build.lock`. Builders trabalham em plano-fonte. Commits só pelo Keel; sem `git reset --hard/clean/stash`.

### D-024 · Porte do contexto e do kanban: correções obrigatórias · vigente
Antes de usar o porte contra o serviço real: (a) blocked = `status==='pending' && !ready` (a spec marcava todo `in_progress` como bloqueado); (b) descrição vazia é inválida no nativo → usar título como padrão e impor limites 200/16 384; (c) códigos de erro reais (`TEAM_DISABLED`, `TEAM_LEAD_REQUIRED`, `TEAM_TASK_UNAUTHORIZED`, `TEAM_TASK_STALE_REVISION`…; `TEAM_MODE_DISABLED`/`TEAM_TASK_FORBIDDEN` da spec eram fictícios); (d) expor `writeScopes` na projeção; (e) permitir "sem dono" em reassign; (f) conferir `ctx.subagents.rootOf(caller).id === scope.rootSessionId`; (g) tratar `SubagentError UNAUTHORIZED` de `isEnabled`; (h) ids ramificados (`TeamTaskId`, `SessionId`).

### D-025 · Nomes e colisões · vigente
Pacotes `@deepseek-ai/dsh-persona-<x>` em `packages/persona/persona-<x>`; chaves de `ctx` e nomes de plugin Cordis **sem** o prefixo/chave `persona` puro (colide com o preset upstream `@deepseek-ai/dsh-persona`, plugin `persona`, config `personaPrefix`): usar `personaHost`, `personaStore`, `personaRunners`, `personaVault`, `personaUsage`. Personagens do BRIEFING: Atlas, Bento, Nina, Sol, Luna.

### D-026 · Pacotes do grupo `packages/persona/*` · vigente
`persona-core` (puro: domínio, ACL, contexto/recall, ponte kanban, matemática de rotinas/handoff; sem I/O) · `persona-store` (SQLite) · `persona-host` (serviço Cordis + controlador Typert `@Remote`; orquestração, tabuleiro, rotinas, skills, import, arquivos) · `persona-runners` (contrato Runner, `dsh`, OAR, assento) · `persona-vault` · `persona-usage` · `client-ui-persona` (**um** plugin de cliente com domínios internos: theme, shell, chat, team, board, files, routines, usage, connections, onboarding, import, canvas) · `persona-app` (bundle/perfil) · `persona-e2e` (privado, só testes e harness). **Motivo:** cada pacote custa esqueleto (exports/files/tsconfig/tsdown) e um `pnpm install`; plugins de cliente não podem importar uns dos outros, então uma UI coesa precisa de um pacote só. Divisão futura permitida se houver segundo consumidor.

### D-027 · Remote da Persona: tipos do controlador são o contrato · vigente
Não há pacote `protocol` separado: o contrato host↔UI é o conjunto de métodos `@Remote` de `persona-host` + `persona-host/src/types.ts` (só tipos), gerados pelo Typert em `lib/typert.*` (artefatos de build, não versionados). Regras do gerador: método de instância público; parâmetros obrigatórios, nomeados, simples (sem desestruturar/default/opcional/rest/genérico); `signal: AbortSignal` por último; tipos JSON-representáveis e alcançáveis pelos exports. Preferir `@Remote({mode:'stream'})` com **baseline completo + incrementos** (`upsert/remove/order`) a eventos encaminhados; **não** editar `packages/api/remotes`: o plugin de cliente faz `ctx.remote.$mount(remote)` (modelo: `client-ui-voice-input`/`client-ui-forge`). Mudou assinatura → rodar `pnpm exec tsx scripts/generate-typert.ts`.

### D-028 · Composição, perfil e desktop · vigente
`persona-app` é um bundle (`dsh.bundle.patch`) que empilha `persona-host`, `client-ui-persona` e desabilita/substitui os rows de UI do `web-app` (a verificar na A7 quais rows toleram a troca; `ui-layout` registra o slot `root`). O desktop usa um template `persona` em `PROFILE_TEMPLATES` (`packages/util/official-bundles`) e `WEB_PROFILE` de `project-manager.ts` aponta para ele; `HIDDEN_BUNDLES` esconde o bundle da página de Plugins. `initProfile` nunca reescreve perfil existente → todo dev/teste usa `DSH_HOME`/`PERSONA_HOME` novo e a pasta de dados real do Miguel nasce limpa (`%USERPROFILE%\.persona`).

### D-029 · Kanban = projeção dos estágios de Ticket do engine · vigente (BRIEFING item 12)
O kanban da Persona projeta os estágios do Ticket (SQLite próprio): A fazer (queued/working) · Em andamento (working) · Em revisão (Report `ready`) · Bloqueado/Precisa de você (person/answer, blocked, failed, delivery) · Concluído (ended); "Aguardando evento" (idle/`waiting`) é chip, não coluna. `agentTeams` fica só para equipes internas de uma executora. O porte da ponte do board nativo (A2) fica opcional/legado; as correções da D-024 permanecem documentadas caso seja retomada. **Consequência:** sem board root, sem assentos, sem Lead residente; o gargalo F14 desaparece.

### D-030 · Engine Super-agent portado como `persona-engine` · vigente
Porte do protótipo MIT `deepseek-ai/dsh-superagent-prototype` (`src/core/*`: engine, model, stage, reasons, intake, evals, tickets, assignments, replies, ports): código usa os termos do protótipo (Trigger, Thread, Eval, Mandate, Ticket, Assignment, Subscription, Report, Attention); a UI usa PT-BR (Assunto, Triagem, Autorização da tarefa, Tarefa, Execução, "Precisa de você"). Comandos síncronos, uma transação por comando, efeitos após commit (outbox). `persona-store` implementa os `Repositories`; os testes do protótipo são portados e rodam contra memória **e** SQLite. Crédito MIT no `THIRD_PARTY_NOTICES.md` e cabeçalhos preservados. Não portar Feishu.

### D-031 · A persona com função Coordenação é o Router; executoras rodam por Runner · vigente (emendada por D-043: "Atlas" é só o nome no template)
Atlas = sessão DSH longa em modo async `start()/stop()` (recurso existente e desligado por padrão no Harness), sem Bash, único a responder nos canais (≤100 palavras no chat; denso no GitHub/e-mail), lote de eventos durante uma inferência entra na próxima chamada. Executoras (Workers) = uma sessão + um diretório por Tarefa, via contrato `Runner` (DSH direto ou CLI/OAR; D-009), com as regras do executor do protótipo (shell >5 s vira job em background, 30 min de limite pós-turno, slot reservado para mensagem de pessoa, concorrência configurável, retomada com nota de recuperação). Prompts do protótipo (orchestrator/worker/dispatch/replies/subscriptions) são a base, traduzidos e com a identidade das personas. Plano B se o async do Router falhar: modo síncrono com lote.

### D-032 · Vigia (watchdog) = função atribuível · vigente (emendada por D-043)
Sessão independente agendada (modelo barato; sugestão Luna) que detecta falha de infra, loop improdutivo e desvio do objetivo e pode ajustar prompts/regras com trilha de auditoria e versão. Roda como rotina do sistema, nunca acorda IA só para animar a UI.

### D-033 · Inline & Spill + Chain of Recall em `persona-core/context` · vigente
Todo objeto (mensagem, assunto, tarefa, decisão, sessão executora) tem ID; ao injetar: ID + resumo + IDs dos vizinhos inline; conteúdo longo vira ponteiro (spill); `persona_recall(id)` percorre a cadeia. Soma-se ao `compileContext` (obrigatórios + orçamento + manifesto); a autorização continua valendo **em cada salto**. Recall exato por ID/data continua sendo o contrato (não resposta inventada).

### D-034 · Equipes à distância na Cloudflare, local-first · vigente (substitui D-019)
Worker (convites/auth, receptor público de webhooks) + Durable Object por workspace (ordenação/sequência por stream, WebSocket com hibernation) + D1 (log/projeções compartilhadas) + R2 (arquivos). Desktop = compute + ambiente (BYOM); credenciais/logins nunca saem do dispositivo; SQLite local segue a fonte da verdade; DM/privado não sobe sem compartilhamento explícito; payload pode ir cifrado com chave do workspace. Sem Supabase. Construção em `apps/persona-edge` e `persona-sync` com testes locais (Miniflare/`wrangler dev`); **conta, segredos e deploy dependem de liberação do Atlas** (gasto/credenciais). Plano B: fly.io.

### D-035 · UX é requisito de primeira classe · vigente (BRIEFING itens 8–10)
`UX-GUIDE.md` + skill Revenue-Centric Design + direção visual D aprovada; Atlas é o guardião. Movimento por tokens (`--motion-*`) e um único `usePersonaMotion`; animação só reflete eventos reais; reduced-motion; pausa fora de tela/aba; estado = ícone+texto. Barra de "done" de UI (UX-GUIDE §4) é parte do aceite de toda tarefa de tela; Probe gera capturas claro/escuro comparadas a `dirD-tela.png`. Post-its do canvas são memória compartilhada; o Keel mantém `Persona · Status`.

### D-036 · Trailer de commit · vigente (a confirmar com Atlas)
O BRIEFING manda terminar as mensagens com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; o Keel roda como Sonnet 5.5. Seguir o BRIEFING (instrução do projeto) até o Atlas dizer o contrário; registrado como pergunta no item 10 do PLAN.

### D-037 · Trava de build compartilhada · vigente
`scripts/persona/with-lock.mjs` (lock por diretório em `.maestri/locks/build.lock`, roubo de lock órfão por pid, espera até 45 min) serializa build, launch de app e empacotamento no checkout único. Implementa a D-023.

### D-043 · A equipe é montada pelo usuário; Coordenação e Vigia são funções · vigente (BRIEFING item 13; prevalece sobre D-031/D-032 e sobre qualquer "Atlas = Router")
Persona é totalmente personalizável (nome, avatar da galeria/upload/silhueta, cargo livre, personalidade, instruções, runner/modelo, ferramentas por nível none|read|read+write, skills, memória, limites, horário, `reportsTo`, projetos/canais). **Atlas, Bento, Nina, Sol e Luna são só um template inicial**, ao lado de "Startup de software", "Agência", "Escritório" e "Em branco". **"Coordenação" (o Router do Super-agent) e "Vigia" são funções do sistema atribuídas a uma persona escolhida**, trocáveis a qualquer momento sem perder histórico; no template a primeira persona criada coordena; sem coordenador o canal funciona só por @menção. Código e prompts do Router/Vigia **não** conhecem o nome Atlas: usam a identidade da persona com a função. Qualquer persona executa Tarefas dentro do que suas ferramentas permitem. Invariante: nunca existe mais de uma persona com a função Coordenação por projeto (`COORDINATION_NOT_UNIQUE`).

### D-044 · Agente cria agente: `persona_propose` · vigente
Persona com a permissão "Recrutar" cria uma **proposta** (nome, cargo, instruções, modelo sugerido, ferramentas) que aparece como cartão "Contratar <nome>?" no canal e em "Precisa de você", com prévia editável. Política por workspace: *sempre pedir aprovação* (padrão) ou *aprovar automaticamente dentro de limites* (ferramentas ≤ as do criador, **sem credenciais novas**, orçamento ≤ X). **Invariante:** nunca se cria persona com mais acesso do que o criador. Construtor conversacional (onboarding e "Nova persona", como o Tuca do Tucano): o usuário descreve em linguagem natural e a Coordenação monta o rascunho completo para revisar.

### D-045 · Cofre da empresa e onboarding em 5 passos · vigente
Onboarding (RCD, valor antes de esforço): (1) nome e tratamento; (2) **Sobre a empresa** (conversa guiada ou colar/importar texto, links, arquivos) → **Cofre da empresa**; (3) conectar harnesses detectados (CLIs já logadas aparecem prontas; nunca pedir senha); (4) montar a equipe (template ou construtor); (5) cai em `#geral` com a equipe se apresentando e uma primeira tarefa sugerida. O Cofre é conhecimento do workspace com proveniência: registros `brief`/`constraint`/`decision`/`memory` (modelo do `compileContext`), documentos anexados indexados (FTS), versões, "quem pode ver"; restrições e decisões fixadas entram como **contexto obrigatório em todo turno**, o resto por relevância e Chain of Recall; editável em "Conhecimento"; personas podem **propor** atualizações (aprovação conforme política).

### D-046 · Ordem de fechamento da v1 (SCOPE §4) · vigente
1) App abre como Persona (marco A) → 2) onboarding + Cofre + construtor + templates → 3) canais, DMs, @menções, Coordenação com resposta em stream e "Contexto usado" → 4) tarefas/kanban (estágios de Ticket), "Precisa de você", Visão geral por atenção → 5) execução real (DSH + CLIs via OAR, sessão+worktree por tarefa, jobs, retomada) → 6) agente cria agente, skills propostas, memória por persona (aprovar/editar/esquecer) → 7) rotinas, Vigia, Uso e limites → 8) equipes à distância (Cloudflare), convites, webhooks GitHub → 9) importadores, benchmarks, canvas. Animação e acabamento fazem parte do aceite de cada item. O plano mantém as letras A–G para relato ao Atlas, mas **as tarefas dentro dos marcos seguem esta ordem**.

### D-047 · Gate de boot real da UI · vigente
Toda tarefa de UI só é "done" depois de passar `scripts/persona/ui-boot-check.mjs` (host `--profile persona` + Chrome, claro/escuro, console limpo, sem "entries did not activate", captura visível) — vitest/jsdom não basta. O primeiro boot real (03/11) mostrou: `ui-settings` provê `configForms` e **não pode** ser desativado (locale/ui-theme/shortcuts dependem dele); `message-quotes`, `ui-secret-mask` e `directory-picker` ficam órfãos sem `ui-conversation`/`ui-workspace` e foram desativados; o namespace `remote.persona` só pode ser lido dentro do `ctx.inject([...'remote.persona'...])`.

### D-048 · Proatividade nativa é requisito de aceite da v1 · vigente (BRIEFING item 14)
Puxada (pull) em vez de espera por cobrança; objetivos com orçamento de rodadas (`dsh-goal` + `goal-round-driver` + `dsh-tool-goal`); definição de pronto e continuação; rotina de iniciativa por persona; **Vigia** determinístico primeiro (modelo barato depois) com auditoria em atividade, nunca spam no canal; orçamentos de atenção/tokens/execuções; níveis de autonomia **só quando pedido · propor (padrão) · agir dentro de limites**, com trabalho especulativo começando em "só registrar o que faria". Proatividade sem valor perde prioridade (taxa de aceitação realimenta a frequência). Sem objetivo aberto a equipe descansa sem gastar IA. Aceite do Probe: ver PRO-6.

### D-049 · Verificação e push por worktree limpo · vigente
O pre-push roda o typecheck COMPLETO; numa árvore compartilhada com 8 agentes ele nunca fica verde ao mesmo tempo. Procedimento: commits locais por entrega na árvore principal; para publicar, `git worktree add --detach C:/Users/migue/dev/persona-push HEAD` → `pnpm install --frozen-lockfile` → `pnpm run typecheck` → corrigir só o necessário no worktree → commit → `git push origin HEAD:refs/heads/persona-dev` (o hook roda de novo no worktree) → no checkout principal `git update-ref refs/heads/persona-dev <sha>` + `git reset -q` (não toca a árvore de trabalho). `tsc -b` que falha por rootDir deixa `.js/.d.ts` ao lado das fontes: apagar (e ignorar em `.gitignore`).

---

## 11. Proposta ao Atlas (alta demanda / informativo)

| # | Item | Tipo |
|---|---|---|
| 1 | **Liberar smokes reais** com CLIs e contas já logadas do Miguel (Claude Code, Codex, Cursor agent, OpenCode): consome cota; prompts triviais; relatório de cota usada | *precisa de decisão* (credenciais/gasto) — só a partir do marco D |
| 2 | **Aprovar a folha de estilo** do Brush (direção A/B/C já geradas em `persona-assets/references`) antes dos lotes | *precisa de decisão* — bloqueia marcos A7/C5 |
| 3 | **Cloudflare** (D-034): construir e testar localmente; conta, segredos e deploy só com liberação do Atlas | *precisa de decisão* — marco E (E7/E11) |
| 4 | **Amostras reais** de exportação (Grok-bot etc.) para o marco F; sem elas só entregamos o framework de importação + formatos que o Miguel indicar | *precisa de insumo* — marco F |
| 5 | **AI-memory do Akita**: onde está (URL/repo/instância), contrato e credenciais; sem isso fica a base local + interface | *precisa de insumo* — marco E |
| 6 | Conformidade com termos dos provedores ao dirigir CLIs/assinaturas por um app de terceiros: ok para uso pessoal local; rever antes de distribuir | informativo |

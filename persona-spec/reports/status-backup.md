PERSONA · STATUS — placar (restaurado pelo Keel em 04/11, depois de nova sobrescrita por 'note write')
REGRA PARA TODOS (repetida, é a 3ª sobrescrita): neste post-it SÓ se usa `maestri note edit "Persona · Status" "<ÚLTIMA LINHA ATUAL>" "<ÚLTIMA LINHA ATUAL>
- HH:MM [SeuNome] resumo"` ou acrescentar logo depois da linha "== LINHAS". NUNCA `maestri note write` (apaga o placar de todos). Assine com o SEU nome (não use [Atlas] se você não é o Atlas). Detalhes vão em persona-spec/reports/<nome>.md.

== PUBLICAÇÃO (origin/persona-dev, gate PERSONA em worktree limpo, D-060) ==
- Último commit com código publicado: dfe13272c6 (gate PERSONA verde; typecheck completo verde). Instalador D8 do Rivet é empacotado dele (build.lock preso pelo Rivet até soltar).
- Ciclos meus a cada 40 min, só com o build.lock livre. Últimas tentativas caíram em: boot smoke (listConversationSubjects rate-limited → Prism/Anvil) e check-pkg de client-ui-persona/core/engine/host (edição em andamento). Cada dono mantém `check-pkg` do seu pacote verde ANTES de relatar.
- Aprendizado: erros que só o worktree limpo vê (TS6059/6307 fora de rootDir, helper de teste sem *.client.ts, project reference faltando, locale gerado não commitado, anotação Typert).

== ENTREGAS (resumo por dono; detalhe nos reports) ==
- FORGE: engine Super-agent completo (puxada, Vigia, autonomia, orçamento, ReviewDelivery), pré-roteador, parser de saída suja, soak/queda, importadores, ledger canônico (OPT-1), GES-1 withDefaultGestor, OPT-8 measureV1Close (PRO 6/6, GES 3/3, OPT 3/4).
- ANVIL: store SQLite v1→v16, host Remote (conversa/DM, ACL no servidor, Revisar, webhook, dead-letter, export, diagnóstico), apps/persona-edge local, PB/GOV/SB no host.
- RIVET: runners fake/dsh/claude/codex/opencode/cursor, resolveRunner, D-051/D-052, Cofre DPAPI, UsageStore, desktop (bandeja, instância única, backup), W3-5 overlay, D8 empacotamento (store C:\p8c\pnpm-store; causa do #root vazio no instalador = CSP unsafe-eval, corrigindo).
- PRISM: shell, onboarding (hang corrigido), live store, #geral/assuntos, Visão geral, editor/contratar, Sobre, Ensinar, Gestor (modal + Ajustar), GES-3.
- LUMEN: Quadros (PB-5 visão global), Conhecimento/Second Brain (SB-5), BYC-4 revisão, GOV-7 saúde da equipe, Conexões/Uso (OPT-7 getUsagePanel), a11y Quadros.
- MUSE: DESIGN-SYSTEM.md, tokens, vitrines, a11y (axe 0), Ensinar, movimento FLIP, W3-6 renderizador do overlay.
- PROBE: harness Tier 1/2, boot smoke 9 painéis, galerias GOV/PB, contratos J1-10, B9 6/6, padaria dogfood PASS, D8 harness (3/3), reap-orphans.
- BRUSH: personagens × poses, banner/folhagem/estados vazios, ícones.

== EM CURSO / BLOQUEIOS (ordem de prioridade) ==
1. Publicação verde: smoke `listConversationSubjects` rate-limited (Prism: chamar uma vez/cache + ErrorState; Anvil: erro tipado com retryAfterMs) e check-pkg limpo em client/core/engine/host.
2. D8: instalador de dfe13272c6 (Rivet) + Probe testa o exe instalado; CSP unsafe-eval no instalador anterior (#root vazio).
3. Gestor de equipe (GES-*), BYC, Second Brain (SB-*), Wave 2 (assuntos/contas/Ensinar), PB/GOV UI, OPT-1..8 (medir agora, otimizar depois).
4. Cloudflare só local (conta/deploy só com o Atlas, E11). Execuções de CLI real congeladas (exceções pontuais ≤3 execs). Amostras reais de exportação (F1) pendentes do Miguel.

== DECISÕES RECENTES (persona-spec/DECISIONS.md) ==
D-043 funções, não personas fixas · D-045 Cofre + onboarding 5 passos · D-048 proatividade · D-050 Muse dona do design system · D-051 contornos OAR/Codex · D-052 CLIs nunca em prompt · D-060 gate PERSONA em vez do typecheck completo (typecheck completo = noturno/informativo).

== PROTOCOLO ==
Relato em persona-spec/reports/<nome>.md + 1 linha aqui; seguir direto para a próxima tarefa; só o Keel comita/publica e roda pnpm install; Muse e Prism falam por linhas "[Muse→Prism]" aqui. Nada de segredo em log/relato. Backup do placar: o Keel guarda cópia em persona-spec/reports/status-backup.md a cada ciclo.

== LINHAS (acrescentar abaixo, uma por relato) ==
- 06:21 [Probe] PERSONA_GATE ok 9/9 smoke; bootstrap 10/10; contracts GES/GOV/PB 19 pass; D8 exe FALHOU CSP (Rivet). Fila PRO-6 layer-2/PB-9/GOV-10.
- 06:22 [Forge] T3 assignment.reported + activityFromDomainEvent (Engine.report → fold). check-pkg engine OK. Anvil: emit→recordTurnActivity.
- 06:17 [Prism] PRO-4 Enquanto fora→Quadros (openKanbanTicket+scroll); GES-3 commentOnId; Sobre+IPC desktop; Ajustar refresh; boot-smoke 180s OK. vitest shell/overview/kanban+away 5/5. Fila: PRO-6 Probe, GOV-8, Forge marker, Anvil RPC.
- 06:10 [Forge] measureV1Close (PRO 6/6 + GES 3/3 + OPT 3/4 cut-40 blocked); ticketIdsFromLedger; opt8-acceptance.md + v1-close.md. check-pkg core+engine OK.
- 05:43 [Lumen] hostBoardSummaries + Conexões terms + global view btn tests; check-pkg OK.
- 06:01 [Probe] contracts 20/20 + B9 6/6 + D8 harness contract 3/3; gate FAIL persona-store repos.ts — Anvil; D8 exe ainda Rivet CSP.
- 06:05 [Prism] Sobre (AboutPersona+IPC); GES-3 commentOnId cartao; Ajustar+refresh; boot-smoke 180s timeout. Fila: PRO-6, GOV-8, Forge marker, Anvil RPC. Fila: PRO-6, GOV-8, Forge marker, Anvil RPC.
- 05:32 [Lumen] PB-5 visão global (previews+column icons); OPT-7 getUsagePanel wire; check-pkg OK. Fila: Probe PB-9/BYC-6/GOV.
- 06:02 [Rivet] W3-5 overlay Muse no boot (vitest 13/13). D8 dfe13272c6 streaming: prepare-dsh pnpm store C:\p8c\pnpm-store — NAO travado. Sem .exe novo ainda.
- 05:50 [Forge] GES-1 withDefaultGestor no core (assign+onboarding+propose); OPT-8 live cut-40; measureGestorV1/measureProactivityV1. check-pkg core+engine OK.
- [Prism] 05:26 — onboarding hang fix (BYC effect); #geral topic filter; T3 inline ActivityGroup; Switch Ensinar; vitest onboarding 11/11 ~8s. Fila: PRO-6, GOV-8, Anvil/Forge, boot smoke.
- 05:48 [Probe] D8 Setup 1d4e5e95b8 FALHOU (#root vazio, CSP unsafe-eval); reap-orphans; RAM ~29GB — Rivet pack fix.
- 06:21 [Lumen] PB-10 projectBoardToFlow + fix hooks visão global ConnectedGlobalKanban; BYC discard/Cofre empty tests; vitest 16/16; check-pkg OK.
- 06:00 [Muse] Rodada: microcópia pt/en 22 dicionários + glossário design/MICROCOPY.md; design system vivo design/system/index.html (axe 0); kit de lançamento (hero README, capa, LAUNCH-KIT, AboutPersona c/ créditos); Switch único; carry do quadro; renderizador do cursor (W3-6, p/ Rivet); landing apps/persona-site (pt/en, claro/escuro, axe 0, ~860 KB, 'a confirmar' em preço/download). Fila: recapturar #geral+Ensinar (Prism aplicou), 1º uso instalado quando o pacote D8 novo passar.
- 06:28 [Forge] withTurnActivityEmit (Engine.emit → recordTurnActivity). check-pkg engine OK.
- 06:22 [Prism] Regra Status: só note edit + [Prism]; fui eu no note write (avisei Keel); check-pkg client-ui-persona OK.


# T3 Code — tickets de backend para a v1.2

Zinc, 07/11/2026. Deriva do `INVENTARIO-BACKEND.md`: só itens **PEGAR/ADAPTAR de tamanho P/M**, ordenados por valor para a pessoa ÷ custo. Cada ticket é executável por um builder DeepSeek depois do corte da v1.1. Itens **G** ficam no fim, um parágrafo cada, com fatiamento proposto.

Convenções: **RED primeiro** = escrever o teste que falha no tree atual; **ACL** = `remote-acl-matrix.spec.ts` + `persona-host/src/auth.ts`/`remote-guard.ts`; **D-0xx** = decisão vigente em `persona-spec/DECISIONS.md` (não inventar contra ela). Tamanho: **P** < 1 dia, **M** 1–3 dias, **S/M** meio dia a 1 dia.

## Ordem (valor ÷ custo)

1. Parar de verdade; 2. recibo idempotente; 3. retomada após reinício; 4. orçamento de stream; 5. fechamento automático; 6. retomada no limite; 7. catálogo de modelos/auth; 8. MCP HTTP; 9. anexos; 10. limpeza de storage; 11. diagnóstico/telemetria; 12. auth/pairing/instância; 13. guest share; 14. HTTP/assets; 15. git; 16. diff/restore; 17. busca; 18. delegação/handoff; 19. PR watch; 20. processo/nativo; 21. compile cache; 22. update/packaging; 23. runtime policy; 24. goals/workflow; 25. CLI doctor; 26. MCP Apps; 27. command output; 28. worktree sync; 29. setup de projeto; 30. clone/publish.

---

## T3B-1 — Parar de verdade (cancelamento duro de turno) · M

**Ganho:** “Parar” encerra o turno na hora, sem CLI órfã nem resposta fantasma depois.
**Arquivos (Persona):** `packages/persona/persona-host/src/working-control.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/reply-stream.ts`, `packages/persona/persona-runners/src/oar/adapter.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** `persona-spec/contracts/working-control.md`; `stopTurn`/`steerWorkingTurn` já são Remotes de escrita; manter `requireWrite` e o ator local. Não conflita com D-079; reforça (“nunca silêncio”).
**Testes (RED primeiro):** turno com stream aberto + `stopTurn` → runner cancelado, `coord-<id>-reply` mantém o texto, `stopped:true`, nenhum report novo; matar o processo do CLI não deixa `Assignment` `running`; reinício não reexecuta o turno parado. Arquivo novo `tests/stop-hard.spec.ts` ou caso em `working-control.spec.ts`.
**Riscos/dependências:** o adaptador OAR precisa expor `cancel` real (hoje o Parar cancela o turno no host, mas o processo pode continuar); testar com runner scriptado e com processo real. Depende de nenhum ticket.
**Tamanho:** M.

## T3B-2 — Recibo idempotente de comando · M

**Ganho:** tentar de novo ou reconectar nunca duplica uma Tarefa, um turno ou uma entrega.
**Arquivos (Persona):** `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-store/src/events/repos.ts`, `packages/persona/persona-engine/src/core/assignments.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** `persona-spec/contracts/conversation.md` e `persona-spec/contracts/working-control.md`; Remote de escrita existente; nenhum novo acesso. D-079 (uma resposta por mensagem) e D-014 (idempotência `routine_id:scheduled_for`) são o precedente.
**Testes (RED primeiro):** mesmo `commandId`/`requestId` duas vezes → um Ticket/uma Assignment/uma linha; retry após falha → uma execução; reinício entre o commit e o efeito → sem duplicata. Usar `tests/orchestration.spec.ts`/`conversation-d079.spec.ts` como base.
**Riscos/dependências:** escolher a chave (event id atual vs command id) sem quebrar `SessionEventMap`; receipts antigos precisam de migração/limpeza (ver T3B-10). Depende de T3B-10 para retenção.
**Tamanho:** M.

## T3B-3 — Retomada após reinício do host · M

**Ganho:** fechar e abrir o app não perde a Tarefa que estava rodando; ela continua uma vez, sem duplicar.
**Arquivos (Persona):** `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/proactivity-scheduler.ts`, `packages/persona/persona-engine/src/core/assignments.ts`, `packages/persona/persona-engine/src/executor/resume.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** `persona-spec/contracts/conversation.md`; D-079; D-014 (lease/backoff). O agendador já retoma Assignment sem linha `done`; o ticket fecha os buracos (turno em voo, lease vencido, efeito perdido).
**Testes (RED primeiro):** host com Assignment `running` e sem report → reinício → uma retomada, um Ticket; lease vencido → libera e retoma uma vez; efeito de turno perdido é aposentado antes de novo trabalho. `proactivity-scheduler.host.spec.ts` + `tests/restart.spec.ts`.
**Riscos/dependências:** não retomar Tarefa parada pela pessoa (`stopped`) nem pergunta aberta; D-076 (não abrir trabalho demais). Depende de T3B-2 para idempotência.
**Tamanho:** M.

## T3B-4 — Orçamento de stream (payload grande não trava a UI) · M

**Ganho:** resposta longa chega em pedaços limitados; a conversa não congela nem perde o texto final.
**Arquivos (Persona):** `packages/persona/persona-host/src/reply-stream.ts`, `packages/persona/persona-host/src/index.ts` (`followMessages`), `packages/persona/persona-host/src/types.ts`, `packages/persona/persona-store/src/events/repos.ts`.
**Contrato/ACL:** `persona-spec/contracts/streaming.md`; D-079 (o texto final não pode sumir); Remote de leitura existente.
**Testes (RED primeiro):** parcial de 2 MB → frames ≤ limite, ordem preservada, texto final íntegro; cliente lento/reconectado recebe snapshot + delta; `stopped` mantém o texto. `tests/streaming.spec.ts`.
**Riscos/dependências:** limite escolhido por bytes (não por tokens); não cortar markdown no meio sem aviso; testar com o cliente real (Prism/Flint) para não regredir a bolha.
**Tamanho:** M.

## T3B-5 — Fechamento automático de Tarefa (settlement) · M

**Ganho:** a Tarefa se fecha sozinha quando o trabalho acabou, sem a pessoa arrastar cartão.
**Arquivos (Persona):** `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/ticket-done.ts`, `packages/persona/persona-host/src/boards.ts`, `packages/persona/persona-engine/src/workflow.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** `persona-spec/contracts/conversation.md` + `persona-spec/contracts/working-control.md`; D-029 (quadro é projeção do estágio) e D-090 (equipe real). Não fechar Tarefa que espera a pessoa.
**Testes (RED primeiro):** run concluído + sem pendência → `done` uma vez; atividade nova depois do settle → reabre/recusa com motivo; Tarefa em revisão/pergunta não fecha; PR merge/inatividade seguem a regra. `tests/settlement.spec.ts` + `board-start.spec.ts`.
**Riscos/dependências:** o “pronto” precisa de definição por projeto (D-090); não confundir com `delivery_pending` (FLOW-1). Depende de T3B-3.
**Tamanho:** M.

## T3B-6 — Retomada no limite de uso · M

**Ganho:** quando a janela de uso reabre, a Tarefa parada volta sozinha — uma vez.
**Arquivos (Persona):** `packages/persona/persona-host/src/quota-wait.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/account-swap.ts`, `packages/persona/persona-host/src/account-swap-host.ts`, `packages/persona/persona-usage/src`.
**Contrato/ACL:** D-078 (perguntar é o padrão; trocar só com escolha explícita), D-092 (sem dólar na assinatura), D-096 (fallback `needed`). Remote de leitura/escrita existente.
**Testes (RED primeiro):** Tarefa parada por cota → uma retomada quando o reset chega; sem reset, não roda; troca de conta só com escolha; nenhuma linha com “US$” na assinatura. `tests/quota-resume.spec.ts` + `account-swap.spec.ts`.
**Riscos/dependências:** o reset pode ser desconhecido; usar `quotaRecheckDelay` e não inventar hora; D-092.
**Tamanho:** M.

## T3B-7 — Catálogo de modelos/effort com fallback + auth/instalação · M

**Ganho:** o seletor de modelo/esforço funciona mesmo quando a CLI não responde, e “Tentar de novo” diz o que instalar/logar.
**Arquivos (Persona):** `packages/persona/persona-host/src/engine-menu.ts`, `packages/persona/persona-host/src/claude-menu.ts`, `packages/persona/persona-host/src/connection-probe.ts`, `packages/persona/persona-host/src/runner.ts`, `packages/persona/persona-host/src/types.ts`.
**Contrato/ACL:** D-088 (modelo+capricho por persona), D-085 (answer-only), D-015 (credenciais no Cofre). Remote de leitura; sem novo acesso.
**Testes (RED primeiro):** CLI silenciosa → lista estática com os mesmos nomes; CLI responde → lista do motor; modelo/effort inválido → erro humano; CLI ausente → dica de instalação/login. `tests/engine-menu.spec.ts`, `connection-probe.spec.ts`, `persona-editor` (cliente).
**Riscos/dependências:** não inventar modelo; a lista estática envelhece — marcar `source:'static'` e revisar por versão. Depende de T3B-12 para settings.
**Tamanho:** M.

## T3B-8 — Servidor MCP HTTP para as ferramentas de produto · M

**Ganho:** o worker da CLI chama as ferramentas da Persona (quadro, rotina, equipe) com o mesmo ACL e a mesma atividade.
**Arquivos (Persona):** `packages/persona/persona-host/src/harness-ports.ts`, `packages/persona/persona-host/src/harness-dispatch.ts`, `packages/persona/persona-runners/src/mcp/gateway.ts`, `packages/persona/persona-runners/src/mcp/harness-tools.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** `persona-spec/contracts/harness-tools.md`; D-081/083/084 (nunca mais acesso do que a pessoa; conector só quando o pedido precisa), D-097 (ferramentas de equipe em toda Tarefa). O gateway já existe; falta o servidor HTTP/sessão.
**Testes (RED primeiro):** chamada HTTP com run forjado → recusa; ferramenta permitida → mesma atividade/Desfazer; ferramenta de outro projeto → `not-found`; `callId` repetido → uma ação. `tests/harness-gateway.spec.ts` + novo `harness-http.spec.ts`.
**Riscos/dependências:** custo das definições por turno (D-097/Tally); não abrir porta fora de loopback; D-096.
**Tamanho:** M.

## T3B-9 — Anexos: limites, sweep e caminho seguro · M

**Ganho:** upload grande/antigo não enche o disco nem some sem aviso; nenhum caminho escapa da pasta.
**Arquivos (Persona):** `packages/persona/persona-host/src/media.ts`, `packages/persona/persona-store/src/media`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-store/src/retention`.
**Contrato/ACL:** D-081 (acesso só ao concedido), D-099 (arquivo no rascunho aparece); Remote `attachFile`/mídia existente; limite de payload do `remote-guard.ts`.
**Testes (RED primeiro):** arquivo > limite → erro humano; pendente antigo → sweep; `../` no nome → recusa; anexo de outra conversa → `forbidden`. `tests/media.spec.ts` + `remote-guard.spec.ts`.
**Riscos/dependências:** base64 no fio (12 MB) pode ser grande; medir com Tally. Depende de T3B-10 para retenção.
**Tamanho:** M.

## T3B-10 — Limpeza de storage e retenção · M

**Ganho:** banco e anexos não crescem para sempre; o que está ativo nunca é apagado.
**Arquivos (Persona):** `packages/persona/persona-store/src/retention`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-host/src/proactivity-scheduler.ts`, `packages/persona/persona-store/src/events/repos.ts`.
**Contrato/ACL:** D-014 (leases/rotinas), D-064 (histórico privado), D-079 (não apagar o que a conversa ainda mostra). Nenhum Remote novo; rodar no ciclo do agendador.
**Testes (RED primeiro):** Tarefa ociosa antiga → limpa; Tarefa ativa/recente → mantém; evento coberto pela projeção → poda; reconexão após poda → snapshot. `tests/retention.spec.ts` + `proactivity-scheduler.spec.ts`.
**Riscos/dependências:** nunca apagar mensagem que a pessoa ainda vê; medir tamanho antes/depois; D-062 (trava).
**Tamanho:** M.

## T3B-11 — Diagnóstico, resource telemetry e telemetria local-first · M

**Ganho:** o suporte vê o que está travado e quanto cada persona gasta, sem vazar conteúdo/segredo.
**Arquivos (Persona):** `packages/persona/persona-host/src/diagnostics.ts`, `packages/persona/persona-usage/src`, `packages/persona/persona-host/src/official-quota-persist.ts`, `apps/desktop/src` (processo), `packages/subprocess/subprocess/src`.
**Contrato/ACL:** D-092 (sem dólar na assinatura), D-015 (nunca segredo no dump), D-062 (não rodar pesado na trava). Remote `exportDiagnostics` já é exceção de ACL; manter.
**Testes (RED primeiro):** dump com token/segredo → redigido; amostra de CPU/RSS por persona; nenhuma linha de mensagem; opt-out de telemetria. `tests/diagnostics.spec.ts` + `usage` specs.
**Riscos/dependências:** privacidade (nada de corpo de mensagem); no Windows, medir processo por grupo; D-093 (boot).
**Tamanho:** M.

## T3B-12 — Auth/pairing, settings redaction e instância única · M

**Ganho:** acesso remoto seguro (quando existir), segredo nunca chega ao cliente e dois hosts não corrompem o banco.
**Arquivos (Persona):** `packages/persona/persona-host/src/auth.ts`, `packages/persona/persona-host/src/remote-guard.ts`, `packages/persona/persona-host/src/index.ts` (`getSettings`/`updateSettings`), `apps/desktop/src/host-process.ts`, `packages/persona/persona-store/src/store.ts`.
**Contrato/ACL:** D-015 (Cofre/DPAPI), D-081/084 (ACL), D-062 (trava). Remote de settings existente; pairing novo só se o acesso remoto entrar na v1.2.
**Testes (RED primeiro):** settings com segredo → redigido; token de pairing uma vez; DPoP/replay recusado; segundo host → erro claro; lock velho é roubado. `tests/auth.spec.ts`, `remote-acl-matrix.spec.ts`, `host-process.spec.ts`.
**Riscos/dependências:** não copiar credencial de assinatura (D-015/D-083); pairing remoto depende de decisão de produto (hoje local). Dividir em 12a (redaction/instância) e 12b (pairing) se o escopo apertar.
**Tamanho:** M.

## T3B-13 — Guest share somente leitura · M

**Ganho:** dá para mostrar uma conversa a alguém de fora sem dar acesso ao workspace.
**Arquivos (Persona):** `packages/persona/persona-host/src/share-remote.ts`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-host/src/auth.ts`, `packages/persona/persona-store/src/invite`.
**Contrato/ACL:** D-081/084 (nunca mais acesso), D-090 (equipe real). Novo Remote de leitura + token de convidado; revogar é obrigatório.
**Testes (RED primeiro):** convidado vê só a conversa compartilhada; não escreve; revogar corta na hora; link expirado → erro humano. `tests/guest-share.spec.ts`.
**Riscos/dependências:** anexos/mídia também precisam de ACL; depende de T3B-12 (auth) e T3B-14 (assets). Se o acesso remoto não entrar, este ticket fica bloqueado.
**Tamanho:** M.

## T3B-14 — HTTP API/assets com limites · M

**Ganho:** imagens/anexos são servidos com tipo certo, limite e sem path traversal.
**Arquivos (Persona):** `packages/persona/persona-host/src/media.ts`, `packages/persona/persona-host/src/index.ts`, `apps/desktop/src/ipc.ts`, `packages/persona/persona-host/src/remote-guard.ts`.
**Contrato/ACL:** D-081 (acesso), D-099 (arquivo no rascunho). Remote/IPC existente; sem novo acesso.
**Testes (RED primeiro):** content-type correto; `../`/symlink → recusa; tamanho > limite → 413/erro humano; cache/ETag. `tests/media-http.spec.ts`.
**Riscos/dependências:** o desktop serve via IPC; o T3 serve HTTP. Adaptar ao nosso caminho, não criar segundo servidor. Depende de T3B-9.
**Tamanho:** M.

## T3B-15 — Git manager/workflow · M

**Ganho:** a persona commita, faz branch e push no worktree da Tarefa sem shell e sem tocar no repo pessoal.
**Arquivos (Persona):** `packages/persona/persona-engine/src/review/git.ts`, `packages/persona/persona-engine/src/review/history-git.ts`, `packages/persona/persona-engine/src/executor/worktree.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** D-064 (histórico git oculto + Desfazer), D-099 (rascunho), D-081 (sem acesso além do projeto). Nenhum Remote novo além do já existente de revisão.
**Testes (RED primeiro):** commit no worktree sem tocar no repo principal; push recusado sem credencial; path fora da raiz → recusa; Desfazer restaura. `tests/git-workflow.spec.ts` + `worktree.spec.ts`.
**Riscos/dependências:** MinGit/Windows; não rodar hook/filtro; D-064. Depende de T3B-16 para diff.
**Tamanho:** M.

## T3B-16 — Diff/revisão e restore point · M

**Ganho:** a pessoa vê antes/depois e consegue desfazer uma entrega sem perder o trabalho.
**Arquivos (Persona):** `packages/persona/persona-engine/src/review/history.ts`, `packages/persona/persona-engine/src/review/history-git.ts`, `packages/persona/persona-engine/src/review/restore-point-id.ts`, `packages/persona/persona-host/src/review.ts`, `packages/persona/persona-host/src/draft-files.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** D-064 (Desfazer), D-099 (rascunho), FLOW-1 (`delivery_pending`). Remote de revisão existente.
**Testes (RED primeiro):** diff de texto/imagem; restore point restaura só o arquivo; conflito → erro honesto; Desfazer depois de Aplicar. `tests/review-delivery.spec.ts` + `history-review.spec.ts`.
**Riscos/dependências:** não reescrever o repo pessoal; D-064. Depende de T3B-15.
**Tamanho:** M.

## T3B-17 — Busca/histórico paginado + busca do workspace · M

**Ganho:** achar uma mensagem/arquivo antigo sem carregar tudo e sem esperar.
**Arquivos (Persona):** `packages/persona/persona-host/src/index.ts` (`search`/`listMessages`), `packages/persona/persona-store/src/events/repos.ts`, `packages/session-query/session-query/src`, `packages/persona/persona-host/src/files.ts`, `packages/fs/fs/src`, `packages/lsp/lsp/src`.
**Contrato/ACL:** D-079 (histórico não some), D-081 (busca só no projeto). Remote de leitura existente.
**Testes (RED primeiro):** consulta devolve página limitada + cursor; resultado de outra conversa/projeto → fora; path escape → recusa; índice FTS atualiza. `tests/search.spec.ts` + `list-messages-limit.spec.ts`.
**Riscos/dependências:** tamanho do índice; não indexar conteúdo de segredo; D-062. Pode dividir em 17a (mensagens) e 17b (arquivos).
**Tamanho:** M.

## T3B-18 — Tarefas delegadas + handoff/compactação · M

**Ganho:** uma persona passa trabalho a outra e quem pediu acorda com a entrega; contexto não é reenviado inteiro.
**Arquivos (Persona):** `packages/persona/persona-host/src/handoffs.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/persona-asks.ts`, `packages/persona/persona-host/src/index.ts`, `packages/compaction/compaction/src`.
**Contrato/ACL:** D-090 (equipe real), D-079 (nunca silêncio), D-097 (ferramentas de equipe). Remote de handoff existente.
**Testes (RED primeiro):** handoff → destinatária acorda uma vez; entrega → quem pediu acorda; loop A↔B não acontece; compactação antes do cache expirar. `tests/handoffs.spec.ts` + `conversation-d079.spec.ts`.
**Riscos/dependências:** D-076 (não abrir trabalho demais); contexto grande; D-090. Depende de T3B-3.
**Tamanho:** M.

## T3B-19 — PR sync/watch · M

**Ganho:** quando o PR é mergeado/fechado, o cartão da Tarefa reflete a verdade sem a pessoa atualizar.
**Arquivos (Persona):** `packages/persona/persona-host/src/github.ts`, `packages/persona/persona-host/src/webhook-http.ts`, `packages/persona/persona-host/src/boards.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** D-029 (quadro projeta estágio), D-090 (equipe real). Webhook já existe; assinatura/segredo no Cofre (D-015).
**Testes (RED primeiro):** merge via webhook → cartão muda uma vez; assinatura inválida → recusa; PR fechado sem merge → estado honesto; reentrega idempotente. `tests/github-webhook.spec.ts` + `board-start.spec.ts`.
**Riscos/dependências:** sem rede em teste (fixture); D-029; D-015.
**Tamanho:** M.

## T3B-20 — Process runner + OS jank + nativo sob demanda · M

**Ganho:** CLI roda com timeout/limite de saída, PATH/home corretos no Windows e nenhum módulo nativo no caminho da janela.
**Arquivos (Persona):** `packages/subprocess/subprocess/src`, `packages/persona/persona-runners/src/oar/adapter.ts`, `packages/persona/persona-host/src/runner.ts`, `apps/desktop/src/login-shell-environment.ts`, `apps/desktop/src/node-environment.ts`.
**Contrato/ACL:** D-013 (permissão pré-definida), D-093 (boot), D-096 (fallback). Nenhum Remote novo.
**Testes (RED primeiro):** timeout mata o processo; saída > limite é truncada; PATH com espaço/acento; nativo não é importado no main. `tests/process-runner.spec.ts` + `login-shell-environment.spec.ts`.
**Riscos/dependências:** Windows-first; não matar por padrão (regra do T3); D-093.
**Tamanho:** M.

## T3B-21 — Compile cache / launcher watch · S/M

**Ganho:** abrir o app/host fica mais rápido sem mudar arquitetura.
**Arquivos (Persona):** `apps/desktop/src/host-process.ts`, `packages/persona/persona-host/src/index.ts`, `scripts/persona`, `package.json`.
**Contrato/ACL:** D-093 (boot), D-062 (trava). Nenhum Remote.
**Testes (RED primeiro):** cache invalidado quando o fonte muda; launcher não observa pasta errada; boot não usa cache velho. `tests/cli-compile-cache.spec.ts` + `launcher-watch.spec.ts`.
**Riscos/dependências:** só vale se o build de produção usar; medir com `host-boot-probe` antes/depois. D-093.
**Tamanho:** S/M.

## T3B-22 — Update do desktop + packaging · M

**Ganho:** atualizar o app sem perder dados e com rollback se o pacote falhar.
**Arquivos (Persona):** `apps/desktop/src`, `apps/desktop/windows-signing`, `persona-ship` (worktree), `scripts/persona`.
**Contrato/ACL:** D-071 (instalador de commit publicado), D-077 (aceite Muse), D-062 (trava pack). Nenhum Remote novo.
**Testes (RED primeiro):** manifesto de update inválido → recusa; rollback restaura a versão anterior; assinatura ausente → aviso honesto; dados preservados. `tests/update.spec.ts` + `packaging` smoke.
**Riscos/dependências:** assinatura digital/certificado; D-071/D-077; não publicar sem OK.
**Tamanho:** M.

## T3B-23 — Runtime/dispatch policy por Tarefa · M

**Ganho:** cada Tarefa respeita o limite de autonomia/tempo definido, sem “rodar para sempre”.
**Arquivos (Persona):** `packages/persona/persona-host/src/flags.ts`, `packages/persona/persona-host/src/proactivity.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/index.ts`.
**Contrato/ACL:** D-076 (no máximo 2 itens abertos), D-090 (equipe real), D-081/084 (ACL). Remote de autonomia existente.
**Testes (RED primeiro):** limite de execução/tokens → recusa visível; limite por thread não afeta outra; pausa/silêncio vale. `tests/proactivity.spec.ts` + `budget.spec.ts`.
**Riscos/dependências:** não duplicar o orçamento do agendador; D-076.
**Tamanho:** M.

## T3B-24 — Goals/workflow artifacts · M

**Ganho:** o plano e o transcrito do workflow ficam visíveis e auditáveis, sem prompt interno vazando.
**Arquivos (Persona):** `packages/goal/goal/src`, `packages/goal/goal-round-driver/src`, `packages/workflow/workflow/src`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-host/src/types.ts`.
**Contrato/ACL:** D-090 (equipe real), D-079 (nada silencioso), LEAK-1 (não vazar prompt interno). Remote de leitura existente.
**Testes (RED primeiro):** goal aberto → artefato de plano; transcript sem prompt interno; workflow sem script fora da raiz. `tests/goal.spec.ts` + `workflow.spec.ts`.
**Riscos/dependências:** D-076; D-090; não expor caminho interno.
**Tamanho:** M.

## T3B-25 — CLI pair/doctor · M

**Ganho:** a pessoa (ou o suporte) descobre em uma linha o que instalar/logar/consertar.
**Arquivos (Persona):** `packages/persona/persona-host/src/diagnostics.ts`, `packages/persona/persona-host/src/connection-probe.ts`, `apps/desktop/src` (CLI), `scripts/persona`.
**Contrato/ACL:** D-015 (nunca segredo), D-093 (boot). Nenhum Remote novo; comando local.
**Testes (RED primeiro):** doctor sem CLI → dica; com CLI logada → OK; token no output → redigido; exit code correto. `tests/doctor.spec.ts`.
**Riscos/dependências:** não duplicar `exportDiagnostics`; D-015.
**Tamanho:** M.

## T3B-26 — MCP Apps (UI de ferramenta) · M

**Ganho:** uma ferramenta pode mostrar um cartão rico (snapshot, formulário) em vez de texto cru.
**Arquivos (Persona):** `packages/persona/persona-host/src/harness-*.ts`, `packages/persona/persona-host/src/types.ts`, `packages/persona/client-ui-persona/src/client` (cartão), `packages/persona/persona-runners/src/mcp`.
**Contrato/ACL:** `contracts/harness-tools.md`; D-081/084; D-097. Depende de T3B-8.
**Testes (RED primeiro):** snapshot MCP renderiza; model context não vaza; ferramenta de outro projeto recusada. `tests/mcp-apps.spec.ts` + cliente.
**Riscos/dependências:** UI (Onyx/Prism); custo de definição; T3B-8.
**Tamanho:** M.

## T3B-27 — Command output hub · M

**Ganho:** saída de comando/terminal chega com tail/resume, sem perder as últimas linhas.
**Arquivos (Persona):** `packages/persona/persona-host/src/working-control.ts`, `packages/persona/persona-host/src/index.ts`, `packages/terminal/terminal/src` (quando exposto), `packages/persona/persona-host/src/types.ts`.
**Contrato/ACL:** D-079; D-096. Depende do terminal G (T3B-G8).
**Testes (RED primeiro):** output > limite mantém tail; resume após reconexão; comando cancelado não perde o que já saiu. `tests/command-output.spec.ts`.
**Riscos/dependências:** terminal ainda não exposto; D-079. Bloqueado até T3B-G8.
**Tamanho:** M.

## T3B-28 — Worktree branch sync · M

**Ganho:** o worktree da Tarefa não fica em branch errada depois de um pull/merge.
**Arquivos (Persona):** `packages/persona/persona-engine/src/executor/worktree.ts`, `packages/persona/persona-engine/src/review/git.ts`, `packages/persona/persona-host/src/orchestration.ts`.
**Contrato/ACL:** D-064 (histórico), D-099 (rascunho). Depende do worktree G (T3B-G7).
**Testes (RED primeiro):** branch divergente → sync; conflito → erro honesto; repo principal intocado. `tests/worktree-branch.spec.ts`.
**Riscos/dependências:** D-064; G7.
**Tamanho:** M.

## T3B-29 — Setup de projeto/worktree · M

**Ganho:** projeto novo/worktree roda o setup uma vez e mostra progresso, sem travar a janela.
**Arquivos (Persona):** `packages/persona/persona-engine/src/executor/worktree.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-host/src/types.ts`.
**Contrato/ACL:** D-064, D-099, D-093. Depende do worktree G.
**Testes (RED primeiro):** setup roda uma vez; cancelar mata o processo; falha mostra motivo; segundo projeto não repete. `tests/worktree-setup.spec.ts`.
**Riscos/dependências:** G7; Windows; D-093.
**Tamanho:** M.

## T3B-30 — Clone/publish/sign-in de projeto · M

**Ganho:** dá para começar um projeto clonando um repo e publicar o resultado sem sair do app.
**Arquivos (Persona):** `packages/persona/persona-host/src/github.ts`, `packages/persona/persona-host/src/orchestration.ts`, `packages/persona/persona-host/src/index.ts`, `packages/persona/persona-vault/src`.
**Contrato/ACL:** D-015 (credencial no Cofre), D-081/084 (ACL), D-090. Depende do source control G (T3B-G7).
**Testes (RED primeiro):** clone sem credencial → dica; publish recusa repo sem permissão; token nunca no log. `tests/project-clone.spec.ts`.
**Riscos/dependências:** G7; D-015; sem rede em teste (fixture).
**Tamanho:** M.

---

## Itens G — um parágrafo cada, com fatiamento

**G1 — RPC tipado/streams e remote.** O T3 tem um contrato Effect/Schema único (`packages/contracts/src/rpc.ts:410`) com subscrições, replay e payload limitado; a Persona usa Remotes Cordis com Typert, mas sem contrato único nem streams tipados. Fatiar: (a) gerar um contrato único a partir dos Remotes/Typert e usá-lo no cliente; (b) subscrição com cursor/replay por conversa; (c) limites de payload por método; (d) só então o relay/remote (T3 `cloud/CloudLink.ts:126`, `relay/relayEnvironmentClient.ts:8`). Depende de T3B-2/4/12. Valor: alto, custo: alto.

**G2 — Event sourcing com recibo/outbox.** O T3 decide eventos sem I/O, commita eventos+projeções+recibo+outbox numa transação e executa efeitos depois (`Orchestrator.ts:553`, `EventSink.ts:227`, `EffectOutbox.ts:247`, `EffectWorker.ts:626`). A Persona tem event log e fila, mas mistura decisão/efeito. Fatiar: (a) recibo idempotente (T3B-2); (b) outbox transacional para efeitos de turno; (c) worker com retry/backoff e aposentadoria; (d) projeções reconstruíveis. Depende de T3B-2/3/10. Valor: alto, custo: alto.

**G3 — Ciclo de thread (fork/merge/adopt).** O T3 tem `thread.create/archive/delete/fork/merge_back` (`Orchestrator.ts:553`, `ThreadForkService.ts:69`). A Persona tem Ticket/Assignment, não thread fork. Fatiar: (a) fork de Tarefa com contexto; (b) merge de volta com conflito honesto; (c) arquivar/restaurar; (d) adotar pasta. Depende de G2. Valor: médio, custo: alto.

**G4 — Adaptadores de provedor (Codex/Claude/ACP).** O T3 tem driver abstrato, Codex app-server, Claude e ACP (`ProviderAdapterRegistry.ts:18`, `Drivers/CodexDriver.ts:118`, `Drivers/ClaudeDriver.ts:84`, `packages/provider-acp/src/server/adapter.ts:1`). A Persona tem OAR, mas cada CLI é um adaptador próprio. Fatiar: (a) contrato de driver + registry; (b) Codex app-server; (c) ACP para Cursor/Grok/OpenCode/Antigravity/Kiro; (d) Claude com catálogo/usage. Depende de T3B-7/20. Valor: alto, custo: alto.

**G5 — Checkpoints em refs escondidos.** O T3 captura o workspace em refs escondidos, faz diff e rollback com `CheckpointService/Capture/Rollback/RestoreSafety` (`CheckpointService.ts:146`, `CheckpointCaptureService.ts:43`, `CheckpointRollbackService.ts:102`, `CheckpointRestoreSafety.ts:13`). A Persona tem histórico privado (D-064) e rascunho, mas não o checkpoint por turno. Fatiar: (a) captura por turno no worktree; (b) diff por checkpoint; (c) rollback coordenado com a conversa; (d) recusa em workspace compartilhado. Depende de T3B-15/16. Valor: alto, custo: alto.

**G6 — Ferramentas do orquestrador e tarefas agendadas.** O T3 expõe um catálogo MCP amplo (`mcp/OrchestratorMcpService.ts:221`, `mcp/toolkits/orchestrator/tools.ts:1`) e tarefas agendadas com webhook/entrega (`ScheduledTaskService.ts:253`, `webhookRoute.ts:18`). A Persona tem harness e rotinas, mas não o catálogo nem o webhook. Fatiar: (a) MCP HTTP (T3B-8); (b) ferramentas de quadro/rotina já existentes no harness; (c) webhook de tarefa com assinatura; (d) entrega/dedupe. Depende de T3B-8/19. Valor: alto, custo: alto.

**G7 — Git/worktrees/source control/PR.** O T3 tem `GitManager`/`GitWorkflowService` (`git/GitManager.ts:120`, `GitWorkflowService.ts:37`), worktrees (`vcs/VcsDriver.ts:14`), source control multi-forge (`SourceControlProviderRegistry.ts:47`) e PR service (`PullRequestService.ts:177`). A Persona tem git/review e só GitHub. Fatiar: (a) git manager/workflow (T3B-15); (b) worktree sync/setup (T3B-28/29); (c) interface de source control + GitHub; (d) PR leitura/comentários; (e) clone/publish (T3B-30). Valor: alto, custo: alto.

**G8 — Terminal PTY e preview browser.** O T3 tem terminal PTY (`terminal/Manager.ts:168`) e preview browser com port scanner/PDF (`preview/Manager.ts:32`, `ServerBrowser.ts:1`). A Persona tem `packages/terminal` e computer-use, mas não expõe. Fatiar: (a) Remote de terminal (open/attach/write/resize/close); (b) output hub (T3B-27); (c) preview embutido para artefato local; (d) permissões/ACL por Tarefa. Depende de T3B-12. Valor: alto, custo: alto.

**G9 — Packaging/installer/updater.** O T3 empacota Electron + updater + assinatura (`apps/desktop/package.json:1`, `packaging/aur/README.md:1`, `DesktopAppUpdate.ts:39`). A Persona tem instalador sem assinatura. Fatiar: (a) update com manifesto/rollback (T3B-22); (b) assinatura Windows; (c) release de commit publicado (D-071); (d) auto-update opt-in. Depende de T3B-22. Valor: médio, custo: alto.

**G10 — Relay/T3 Connect e device/mobile.** O T3 tem relay/cloud (`cloud/CloudLink.ts:126`, `relay/relayEnvironmentClient.ts:8`) e device/mobile (`device/DeviceService.ts:83`). A Persona é desktop-first e planeja Cloudflare; device/mobile não é P0. Fatiar: (a) reachability/relay só se o acesso remoto entrar; (b) device/mobile fica fora da v1.2. Valor: baixo/médio, custo: alto.

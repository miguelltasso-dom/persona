# T3 Code — tickets de UI/cliente (DRAFT para o Keel)

Onyx, 09/11/2026. Deriva do `INVENTARIO.md` (842 itens em 26 áreas) e do `TOP30.md`, **re-verificados no tree de 09/11**. Formato copiado de `TICKETS-BACKEND.md` (Zinc).

**Status: DRAFT.** Ticket oficial, ID e dono são do Keel; este arquivo não cria ticket, não muda dono e não foi commitado. O que já existe no tree não virou ticket — está na tabela de re-verificação com a evidência.

## Correção de contagem (a mensagem de 07/11 estava imprecisa)

A tabela de integração do `TOP30.md` dá 30 itens. Recontando:

- **11 totalmente cobertos por ID existente:** 1, 2, 3, 4, 9, 10, 11, 16, 22, 25, 30.
- **2 incrementos sobre ID existente:** 15 (`P1-22` cobre o `?`, não o editor) e 23 (`P0-27` cobre o `/`, não `@`/`$`).
- **17 totalmente novos:** 5, 6, 7, 8, 12, 13, 14, 17, 18, 19, 20, 21, 24, 26, 27, 28, 29.

Total: 30. Os "19 novos" da mensagem anterior são 17 novos + 2 incrementos. Desses 19, **um já está feito** (17), **três são parciais** (5, 12, 21) e **dois são incrementos** (15, 23); os 13 restantes são novos de ponta a ponta. Além deles, o item 30 já tem ID (`P0-4`/`P1-17`), mas o que falta dele merece ticket próprio — por isso **19 tickets** no total, e os tickets abaixo cobrem só o que falta.

## Re-verificação no tree de 09/11

| # | Estado | Evidência no nosso código |
|---|---|---|
| 5 | parcial | `primitives/Pooled.tsx:155` (`ActivityGroup`) já dobra e resume; não há duração/cronômetro. |
| 6 | parcial | `apps/desktop/src/computer-use-uia.ts` já tem árvore UIA para computer-use; `client/teach/teach-recorder.ts:118` só captura quadros de tela/janela, sem árvore. |
| 7 | ausente | Nenhum `rewind`/`editFromHere`/`restoreTurn` no client ou no host. |
| 8 | ausente | `client/routines/routine-wire.ts:20` só tem create/pause/update/delete; nenhum campo de destino. |
| 12 | parcial | Host `search()` em `persona-host/src/index.ts:6677` + FTS5 em `persona-store/src/migrations.ts:138`; `client/remote/ConnectedSearchView.tsx:51` abre só `channels`, não a mensagem. O harness tem `sessionQuery.searchEvents` com snippet/cursor (`packages/session-query/session-query/src/index.ts:164`), mas o corpus da Persona é o event log próprio — verificar se o contrato serve. |
| 13 | ausente | Nenhum `findInThread`/`Ctrl+F` no fio. |
| 14 | parcial | O harness já tem registro, conflito, precedência e persistência (`packages/client/shortcuts/src/client/registry.ts`) e o desktop grava `keybindings.json` (`apps/desktop/src/keybindings.ts:17`); `client-ui-persona` não registra nenhum comando e usa handlers fixos (`aria-keyshortcuts`, `shell/area-navigation.ts`). |
| 15 | parcial | `help/HelpView.tsx:45` existe; o editor/referência do harness (`packages/client/ui-shortcuts/src/client/Reference.tsx`) existe e o `ui-settings-general` não está desligado — **confirmar no app real** se a seção geral já o mostra; se não, montar na aba. |
| 17 | **feito** | `approvals/InboxDetail.tsx:196` (`RememberPermission`) + host `remembered_approval` em `persona-host/src/index.ts:7394`, com `once`/`7d`/`until_revoked`. **Sem ticket.** |
| 18 | parcial | `onReply` leva ao fio (`approvals/ApprovalsInbox.tsx:74`); não envia o texto como recusa ao motor. |
| 19 | ausente | Nenhuma propagação de aprovação de subagente para a thread pai. |
| 20 | parcial | `ExecutionBudget` (`persona-host/src/orchestration.ts:379`) limita slots concorrentes; não há teto de uso/token no despacho. |
| 21 | parcial | O host já grava `approval_decision` com `actorId`/`at`/`accept` (`persona-host/src/index.ts:3852`); faltam o `feedback` (por quê) e a leitura no client (`decisions/decision-types.ts:38`). |
| 23 | parcial | `/` existe no composer da Persona (`P0-27`); o harness já tem `ui-input-trigger` com detecção de `/` e `@`, mas a Persona o desliga (`persona-app/cordis.patch.yml`) e implementa `/` por conta própria; `$` skill não existe. |
| 24 | parcial | O rascunho do composer da Persona é texto (`chat/ChannelComposer.tsx:193`); o harness tem o draft document (`packages/client/ui-conversation/src/client/contract/records.ts`), desligado na Persona. |
| 26 | parcial | `onPaste` só lê `text/plain` (`chat/ChannelComposer.tsx:775`); `ui-attachment` existe no harness, mas o composer da Persona não o usa para colar imagem. |
| 27 | parcial | `packages/terminal` e `packages/terminal-bash` existem; `ui-sidebar-terminal` existe, mas a Persona o desliga (`persona-app/cordis.patch.yml`) e não tem superfície própria. |
| 28 | ausente | `draft-turn-files.ts` tem `changedSince`; não há checkpoint/restore. |
| 29 | ausente | `share-remote.ts` é `.persona.json`/`.team.json`; o harness tem `experimental/liveshare` (share de Session com viewer, tiers, fork e audit), mas a thread da Persona não é uma Session DSH — decidir entre mapear ou portar o protocolo. |
| 30 | parcial | `aria-live` existe em várias telas; sem o truque do NBSP para repetição e sem F6 no `TurnContextDrawer`. |

**Achado que muda o custo:** o harness já tem o registro/editor de atalhos (`packages/client/shortcuts`, `packages/client/ui-shortcuts`), a detecção de `/` e `@` (`ui-input-trigger`), o draft document (`ui-conversation`), os anexos (`ui-attachment`), o terminal (`ui-sidebar-terminal`), a busca de sessão com snippet/cursor (`session-query`), o fork (`session/fork`) e o share de Session (`experimental/liveshare`). A Persona **desliga** vários desses plugins no `persona-app/cordis.patch.yml` e reimplementa parte no `client-ui-persona`. Por isso 14, 15, 23, 24, 26 e 27 foram reescritos como **adoção/ligação do que existe**, não construção do zero — e os tamanhos caíram (14 G→M, 15 M→P, 24 G→M). 12, 13, 7 e 29 agora citam os blocos de construção.

---

## Onda B — a equipe tem rosto e memória

### T3U-05 — Cronômetro honesto do turno · G

**Ganho:** "Trabalhou 22s" no lugar de 40 linhas de atividade; o tempo é o antídoto do spinner mentiroso.
**Estado atual:** a dobra e o resumo já existem; falta o tempo e o carregamento preguiçoso do histórico.
**Arquivos (Persona):** `client-ui-persona/src/client/primitives/Pooled.tsx`, `client/chat/GeneralChannelView.tsx`, `client/remote/persona-live-store.ts`, `persona-host/src/types.ts`; o formatador compacto já existe em `packages/client/ui-chat/src/client/chat/StatsPills.tsx:87` (reusar a regra, não o componente).
**Contrato/ACL:** nenhum Remote novo; a duração sai dos timestamps do turno que o session log já grava. Se o view não os expõe, acrescentar `startedAt`/`finishedAt` ao `TurnActivityView` (não é model-visible).
**Testes (RED primeiro):** `tests/activity-group-labels.client.spec.ts` + novo `activity-group-duration.client.spec.ts`: grupo com início/fim mostra "22s"; em andamento mostra o relógio; falha nunca conta como concluído; histórico só carrega ao expandir; 200 turnos não animam por segundo.
**Riscos/dependências:** usar o relógio do host, não `Date.now()` do renderer; respeitar `prefers-reduced-motion`; não fazer o cronômetro virar custo de render.
**Tamanho:** G.

### T3U-07 — Rewind "Editar daqui" + reverter arquivos · G

**Ganho:** corrigir o rumo sem recomeçar a conversa; um erro de 2 minutos não vira um de 2 horas.
**Estado atual:** ausente.
**Arquivos (Persona):** `client/chat/GeneralChannelView.tsx` (`MessageList`), `persona-host/src/orchestration.ts`, `persona-host/src/draft-turn-files.ts`, `persona-host/src/index.ts`; o harness já tem `session/fork` (`packages/session/session-format-catalog` / `buildForkSeed`) como bloco de construção — decidir entre ramificar e rewind no mesmo fio.
**Contrato/ACL:** `persona-spec/contracts/conversation.md`; D-079 (uma resposta por mensagem); rewind de texto não pode duplicar evento; restaurar arquivos só depois de confirmação explícita e só dentro do rascunho.
**Testes (RED primeiro):** novo `rewind.host.spec.ts` + `rewind.client.spec.tsx`: "Editar daqui" devolve o prompt ao composer e trunca o que veio depois; a mensagem original não é reescrita; reverter arquivos restaura o checkpoint do turno; aprovação pendente bloqueia; nada de narração no fio.
**Riscos/dependências:** depende do checkpoint (T3U-28) para a parte de arquivos; sem ele, entregar primeiro o rewind de texto. Não reescrever eventos já entregues a outro membro.
**Tamanho:** G.

### T3U-19 — Aprovação de subagente sobe para o pai · M

**Ganho:** a delegação (Gestor → personas) não trava em silêncio quando o filho pede permissão.
**Estado atual:** ausente. O harness resolve o caso oposto no subagente: o filho nasce com `approvalPolicy: 'never'` (`packages/subagent/subagent/src/child-agent.ts:254`) e não pede nada ao pai; a Persona delega pelo Gestor e precisa do contrário — o pedido do filho sobe.
**Arquivos (Persona):** `persona-host/src/attention.ts`, `persona-host/src/orchestration.ts`, `persona-host/src/fanout-host.ts`, `persona-host/src/index.ts`, `client-ui-persona/src/client/approvals/`.
**Contrato/ACL:** `persona-spec/contracts/attention.md`; o pedido sobe com o nome de quem pediu e o id da thread pai; aprovar resolve o filho; parar o pai cancela o filho.
**Testes (RED primeiro):** novo `attention-subagent.host.spec.ts`: pedido do filho aparece na thread pai com o nome do filho; aprovar resolve uma vez; pai parado cancela; pai inexistente cai na inbox; sem cartão duplicado.
**Riscos/dependências:** ciclos de delegação; ACL do pai; não vazar conteúdo de outra projeto.
**Tamanho:** M.

### T3U-21 — Registro da decisão (quem, quando, por quê) · M

**Ganho:** auditoria do MAESTRO: toda decisão tem autor, hora, escolha e feedback.
**Estado atual:** o host já grava `approval_decision` com `actorId`, `at` e `accept`; faltam o `feedback` (por quê) e a leitura no client.
**Arquivos (Persona):** `client/decisions/decision-types.ts`, `client/decisions/decisions-to-inbox.ts`, `persona-host/src/index.ts:3852` (`approval_decision`), `persona-store/src/events/repos.ts`.
**Contrato/ACL:** `persona-spec/contracts/governance.md`; o registro é evento de sessão (reconstruível); não gravar segredo nem texto de conector.
**Testes (RED primeiro):** novo `decision-record.host.spec.ts` + client: aprovar/recusar grava ator, hora, decisão e feedback; recarregar mostra o registro; desfazer mantém a trilha; decisão antiga sem feedback continua legível.
**Riscos/dependências:** migração de leitura; retenção (T3B-10); não confundir com `review_accepted`/`review_changes`.
**Tamanho:** M.

### T3U-30 — Acessibilidade: anúncio de segundo plano + F6 no drawer · M

**Ganho:** quem não vê a tela sabe que a Nina terminou, mesmo com a janela em segundo plano.
**Estado atual:** `aria-live` existe em várias telas; falta o NBSP para repetir a mesma frase e o F6 não inclui o `TurnContextDrawer`.
**Arquivos (Persona):** `client/primitives/` (novo `useLiveRegion`), `client/chat/TurnContextDrawer.tsx`, `client/shell/area-navigation.ts`, `client/chat/GeneralChannelView.tsx`.
**Contrato/ACL:** `persona-spec/contracts/ui-shell.md`; anúncio só para evento que a pessoa precisa saber; nada de anunciar cada token.
**Testes (RED primeiro):** novo `live-region.client.spec.tsx` + `area-navigation.client.spec.ts`: a mesma mensagem duas vezes anuncia duas vezes (NBSP); conclusão em segundo plano anuncia; F6 cicla incluindo o drawer; axe sem violação; reduced motion não muda o anúncio.
**Riscos/dependências:** excesso de anúncio; locale; foco preso no drawer.
**Tamanho:** M.

---

## Onda C — achar e agir rápido

### T3U-12 — Busca abre na mensagem exata · G

**Ganho:** o Ctrl K promete "Nas conversas" e passa a cumprir: abre o fio na mensagem, com o termo destacado.
**Estado atual:** host `search()` + FTS5 existem; o cliente abre só `channels`.
**Arquivos (Persona):** `client/remote/ConnectedSearchView.tsx`, `client/remote/persona-live-store.ts`, `client/chat/GeneralChannelView.tsx`, `persona-host/src/index.ts:6677`, `persona-store/src/events/repos.ts`; `packages/session-query/session-query/src/index.ts:164` (contrato de snippet/cursor, se o corpus permitir).
**Contrato/ACL:** `persona-spec/contracts/views.md`; o ACL já é aplicado em `events.search`; o resultado precisa de `streamId`/`topicId`/`messageId` para navegar.
**Testes (RED primeiro):** novo `search-open-message.client.spec.tsx` + host: resultado abre a thread e rola até a mensagem; termo destacado; ranking por thread; sem resultado quando o ACL nega; consulta com 1 caractere não dispara.
**Riscos/dependências:** tokenizer do FTS5 para pt-BR; escapar o destaque; virtualização de fios longos.
**Tamanho:** G.

### T3U-13 — Find dentro da conversa (`Ctrl+F`) · G

**Ganho:** reencontrar uma decisão num fio longo sem rolar.
**Estado atual:** ausente; o harness tem `sessionQuery.searchEvents` (snippet/cursor/filtros) como contrato de busca dentro da sessão, mas o corpus da Persona é o event log próprio.
**Arquivos (Persona):** `client/chat/GeneralChannelView.tsx` (`MessageList`), `persona-host/src/index.ts`, `packages/session-query/session-query/src/index.ts:164` (contrato).
**Contrato/ACL:** `persona-spec/contracts/conversation.md`; Remote de leitura; a barra não pode roubar o `Ctrl+F` do navegador fora do fio.
**Testes (RED primeiro):** novo `find-in-thread.client.spec.tsx` + host: barra com "n/m", próxima/anterior, Enter/Esc; estado sem resultado; debounce de 100 ms; mensagem virtualizada continua encontrável; só teclado.
**Riscos/dependências:** custo de varredura no servidor; cancelar busca em voo; não alterar o texto salvo.
**Tamanho:** G.

### T3U-14 — Atalhos da Persona no registro do harness · M

**Ganho:** acaba o atalho fixo no código; a pessoa remapeia, o conflito é detectado e o desktop já persiste.
**Estado atual:** o registro, a precedência, o conflito e a persistência já existem (`packages/client/shortcuts/src/client/registry.ts`; `apps/desktop/src/keybindings.ts:17`); a Persona não registra nenhum comando e usa handlers fixos.
**Arquivos (Persona):** `client/shell/area-navigation.ts`, `client/shell/create-shell-store.ts`, `client-ui-persona/package.json` (dependência `@deepseek-ai/dsh-client-shortcuts`), `packages/client/shortcuts/src/client/registry.ts` (referência), `apps/desktop/src/keybindings.ts` (referência).
**Abordagem:** registrar os comandos da Persona em `ctx.shortcuts` (`ShortcutRegistry.register`) com `defaults`, `regions` e `resolve`; trocar os handlers fixos por `resolve`; **não** criar um segundo registro nem um `keybindings.json` próprio. O `when` do T3 vira `regions`/`modals` do registro.
**Contrato/ACL:** `persona-spec/contracts/ui-shell.md`; IDs estáveis; o desktop já intercepta antes do renderer.
**Testes (RED primeiro):** novo `keybindings.client.spec.ts`: os comandos da Persona aparecem no catálogo; precedência; conflito; remapear persiste; F6/atalhos de acessibilidade continuam; nenhum handler duplicado.
**Riscos/dependências:** não duplicar o registro; comandos da Persona precisam de IDs estáveis; o desktop tem prioridade sobre o renderer.
**Tamanho:** M.

### T3U-15 — Referência de atalhos na Ajuda/Configurações · P

**Ganho:** a pessoa vê e edita os atalhos; o editor já existe.
**Estado atual:** `ShortcutReference`/`ShortcutEditor` existem em `packages/client/ui-shortcuts/src/client/Reference.tsx`; as abas próprias de Configurações da Persona não montam a referência, mas o `ui-settings-general` não está desligado — confirmar no app real antes de montar.
**Arquivos (Persona):** `client/help/HelpView.tsx`, `client/shell/nav-places.ts`, `client/shell/register-persona-about-settings.ts` (padrão de slot), `packages/client/ui-shortcuts/src/client/Reference.tsx` (referência).
**Abordagem:** montar `ShortcutReference` numa aba de Ajuda/Configurações da Persona e reusar o editor; **não** escrever um editor novo.
**Contrato/ACL:** `persona-spec/contracts/ui-shell.md`; copy via locale; depende de T3U-14.
**Testes (RED primeiro):** novo `help-shortcuts.client.spec.tsx`: a referência lista os comandos da Persona; busca; editar; reset; conflito; teclado; pt/en.
**Riscos/dependências:** depende de T3U-14; o slot `settings.general.item` do harness não é renderizado pela Persona, então montar direto na aba.
**Tamanho:** P.

### T3U-23 — `@` arquivos e `$` skills · M

**Ganho:** dar contexto e chamar habilidade sem decorar comando.
**Estado atual:** `/` existe no composer da Persona (`P0-27`); o harness tem `ui-input-trigger` com detecção de `/` e `@`, mas a Persona o desliga e implementa `/` por conta própria; `$` não existe.
**Arquivos (Persona):** `client/chat/ChannelComposer.tsx`, `persona-host/src/mentions.ts`, `persona-host/src/file-tools.ts`, `client/locale/chat/`, `persona-app/cordis.patch.yml` (se religar o trigger).
**Abordagem:** duas opções. (a) Religar `ui-input-trigger` e registrar as fontes de arquivo/skill — reusa a pipeline, mas exige o slot de overlay do `ui-conversation` (desligado) e mexe no composer. (b) Estender o menu do composer da Persona com `@`/`$` — menor risco no v1.2. Recomendo (b) e registrar a dívida de convergir com o trigger na v1.3.
**Contrato/ACL:** `persona-spec/contracts/composer-attachments-ui.md`; a lista de arquivos respeita o ACL do projeto; `$5` não dispara.
**Testes (RED primeiro):** novo `composer-at-dollar.client.spec.tsx`: `@` abre e filtra arquivos; `$` abre skills; `$5` não dispara; seleção insere o token; arquivo negado mostra erro humano; teclado.
**Riscos/dependências:** repositório grande (limitar/indeksar); path traversal; permissão de skill; não duplicar a pipeline do `ui-input-trigger`.
**Tamanho:** M.

---

## Onda D — confiança e controle

### T3U-18 — Recusar explicando · M

**Ganho:** o texto digitado na recusa vira mensagem ao motor que pediu; o mesmo erro não se repete três vezes.
**Estado atual:** `answerAttention` (`persona-host/src/index.ts:4961`) já posta texto + arquivos no fio e acorda o worker para **perguntas**; a recusa de **aprovação** (`onReply`) só leva ao fio, não envia o texto como recusa ao motor.
**Arquivos (Persona):** `client/approvals/InboxDetail.tsx`, `client/approvals/ApprovalsInbox.tsx`, `client/answer/reply-target.ts`, `persona-host/src/index.ts:4961` (`answerAttention`).
**Contrato/ACL:** `persona-spec/contracts/attention-answer.md`; Remote de escrita; D-079 (uma resposta por mensagem).
**Testes (RED primeiro):** novo `attention-refuse-text.host.spec.ts` + client: recusar com texto envia uma mensagem ao motor; recusar vazio é recusa simples; falha mantém o rascunho; nada de narração.
**Riscos/dependências:** não vazar detalhe interno da aprovação; rate limit; desfazer.
**Tamanho:** M.

### T3U-20 — Limite de uso no host · G

**Ganho:** a autonomia configurável vale no despacho; acima do teto, o host segura a fila em vez de rodar.
**Estado atual:** `ExecutionBudget` limita slots; `quota-wait.ts` existe; não há teto de uso no despacho.
**Arquivos (Persona):** `persona-host/src/orchestration.ts`, `persona-host/src/budget.ts`, `persona-host/src/quota-wait.ts`, `persona-host/src/account-swap.ts`.
**Contrato/ACL:** `persona-spec/contracts/usage.md`; D-078 (perguntar é o padrão), D-092 (sem dólar na assinatura), D-096 (fallback `needed`).
**Testes (RED primeiro):** novo `usage-limit-host.spec.ts`: despacho acima do teto devolve erro estruturado; a fila segura; retomada após o reset uma vez; assinatura sem "US$"; a UI mostra "Mudar para X".
**Riscos/dependências:** semântica do teto (tokens/dia × janela); não bloquear mensagem humana; relógio.
**Tamanho:** G.

---

## Onda E — alcance

### T3U-06 — SnapShot no Ensinar: qualquer janela + árvore UIA · G

**Ganho:** a persona aprende com o programa real do cliente, não só com o viewport do app.
**Estado atual:** `computer-use-uia.ts` já tem a árvore UIA para computer-use; o gravador do Ensinar só captura quadros.
**Arquivos (Persona):** `apps/desktop/src/teach-ipc.ts`, `apps/desktop/src/computer-use-uia.ts`, `apps/desktop/src/preload-app.ts`, `client/teach/teach-recorder.ts`, `persona-host/src/` (teach).
**Contrato/ACL:** `persona-spec/contracts/teach-capture.md`; `TEACH_CONSENT`; nada sai da máquina; UIA em processo filho, nunca no main.
**Testes (RED primeiro):** `apps/desktop/tests/teach-ipc.spec.ts` + client: captura janela + árvore; campo de senha nunca entra; UIA lenta não trava o gravador; falha do filho não mata a captura; e2e com fake.
**Riscos/dependências:** custo/latência do UIA; permissões; nunca capturar senha; Rivet é dono do desktop.
**Tamanho:** G.

### T3U-08 — Rotinas com destino por execução · M

**Ganho:** a rotina escolhe thread nova a cada rodada, a mesma conversa ou sessão nova — sem thread infinita nem bagunça.
**Estado atual:** `RoutineWire` não tem destino.
**Arquivos (Persona):** `client/routines/routine-wire.ts`, `client/routines/RoutineEditorModal.tsx`, `persona-host/src/harness-routines.ts`, `persona-host/src/routine-remotes.ts`, `persona-host/src/types.ts`.
**Contrato/ACL:** `persona-spec/contracts/routine-remotes.md`; D-014 (idempotência `routine_id:scheduled_for`).
**Testes (RED primeiro):** novo `routine-destination.host.spec.ts` + client: o editor mostra as três opções; o host cria a thread conforme o destino; mesma conversa anexa; sessão nova isola; reinício preserva o destino.
**Riscos/dependências:** rotinas existentes precisam de default explícito (decidir com o Keel; não mudar em silêncio); D-076.
**Tamanho:** M.

### T3U-24 — Rascunho com anexos e modelo · M

**Ganho:** trocar de assunto e voltar não perde o anexo.
**Estado atual:** o rascunho da Persona guarda só texto; o harness tem o draft document (`ui-conversation`), desligado na Persona.
**Arquivos (Persona):** `client/chat/ChannelComposer.tsx`, `persona-host/src/draft.ts`, `persona-host/src/draft-files.ts`, `packages/client/ui-conversation/src/client/contract/records.ts` (referência de formato).
**Abordagem:** estender o pocket da Persona para serializar texto + anexos + modelo por thread, reusando o formato do draft document se ele couber; **não** montar o `ui-conversation` inteiro (a Persona substitui a conversa).
**Contrato/ACL:** `persona-spec/contracts/composer-attachments-ui.md`; rascunho por thread; anexo só é enviado no envio.
**Testes (RED primeiro):** novo `composer-draft-attachments.client.spec.tsx`: salva texto + anexos + modelo; restaura; isola por thread; limpa no envio; sobrevive a reinício; órfão é limpo.
**Riscos/dependências:** tamanho em disco; limpeza; não subir antes do envio; se o formato do `ui-conversation` não servir, documentar o desvio.
**Tamanho:** M.

### T3U-26 — Colar imagem comprimida e HEIC · M

**Ganho:** no Windows, o print do iPhone colado abre em vez de não fazer nada.
**Estado atual:** `onPaste` só lê `text/plain`; `ui-attachment` existe, mas depende dos slots do `ui-chat`/`ui-conversation` desligados.
**Arquivos (Persona):** `client/chat/ChannelComposer.tsx`, `persona-host/src/media.ts`, `persona-host/src/media-detect.ts`.
**Abordagem:** normalizar no `onPaste` do composer da Persona (canvas/OffscreenCanvas) antes de criar o anexo; o host já tem `media.ts`/`media-detect.ts` para HEIC. **Não** montar o `ui-attachment` no v1.2.
**Contrato/ACL:** `persona-spec/contracts/composer-attachments-ui.md`; limites de dimensão/bytes; nada de upload antes do envio.
**Testes (RED primeiro):** novo `composer-paste-image.client.spec.tsx`: PNG/JPEG redimensiona; HEIC converte; falha mostra mensagem humana; transparência preservada; GIF animado mantém o primeiro quadro.
**Riscos/dependências:** codec disponível; CPU; permissão de clipboard.
**Tamanho:** M.

### T3U-27 — Terminal na tela · M

**Ganho:** ver o que as CLIs nativas fazem e mandar o trecho selecionado para a conversa.
**Estado atual:** backend e `ui-sidebar-terminal` existem; a Persona desliga `ui-sidebar-right` e `ui-sidebar-terminal` e tem rail próprio.
**Arquivos (Persona):** `packages/terminal/`, `packages/terminal-bash/`, `packages/client/ui-sidebar-terminal/src/client/LazyTerminalBody.tsx` (referência), `client/shell/`, `persona-host/src/`.
**Abordagem:** desenhar um drawer da Persona sobre `ctx.webTerminals`/`ctx.terminals`, reusando `LazyTerminalBody`/`TerminalBody` do pacote; **não** ressuscitar a sidebar do harness. Um terminal por projeto, sem split.
**Contrato/ACL:** contrato do terminal; persistência da sessão.
**Testes (RED primeiro):** novo `terminal-drawer.client.spec.tsx` + host: abre; roda comando; saída; seleção vira contexto; reinício persiste; sem split.
**Riscos/dependências:** acesso de shell é sensível (ACL); scrollback; PTY no Windows.
**Tamanho:** M.

### T3U-28 — Checkpoint por turno sem git · G

**Ganho:** "voltar o turno" e "reverter os arquivos" sem exigir git.
**Estado atual:** `changedSince` existe; não há checkpoint/restore.
**Arquivos (Persona):** `persona-host/src/draft-turn-files.ts`, `persona-host/src/draft.ts`, `persona-host/src/orchestration.ts`, `client/review/`.
**Contrato/ACL:** `persona-spec/contracts/review-step.md`; cópia por turno dentro do rascunho; nada vai ao projeto real antes do Aplicar.
**Testes (RED primeiro):** novo `checkpoint-turn.host.spec.ts`: grava antes de cada turno que escreve; restaura um turno; restaura todos; ignora `node_modules`; arquivo grande; limpeza por retenção.
**Riscos/dependências:** disco; symlink; turnos concorrentes; T3U-07 depende deste.
**Tamanho:** G.

### T3U-29 — Convidado: link de uso único · G

**Ganho:** "mostrar para o cliente" sem instalar nada.
**Estado atual:** `share-remote.ts` compartilha `.persona.json`/`.team.json`; o harness tem `experimental/liveshare` (share de Session com viewer, tiers, fork e audit), desligado em todos os perfis e sem relação com a thread da Persona.
**Arquivos (Persona):** `persona-sync/`, `persona-host/src/share-remote.ts`, `client/`; `packages/experimental/liveshare/src/` e `packages/experimental/liveshare-protocol/` (referência).
**Abordagem:** decidir entre (a) mapear a thread da Persona para uma Session compartilhável e reusar o liveshare, ou (b) portar o protocolo de share (TTL, viewer, mensagens pendentes) para a thread. (a) reusa servidor e viewer; (b) é mais trabalho.
**Contrato/ACL:** `persona-spec/contracts/share.md`; TTL de 24 h; mensagens do convidado ficam pendentes de aprovação; revogar é imediato.
**Testes (RED primeiro):** novo `guest-share.host.spec.ts` + e2e: cria link; abre somente leitura; mensagem pendente; aprovar; expirar; revogar.
**Riscos/dependências:** depende da Cloudflare (`persona-sync`); segurança/PII; offline.
**Tamanho:** G.

---

## O que eu preciso do Keel

1. **Aprovar/renomear os IDs.** São 19 tickets (16 novos restantes + 2 incrementos + 1 parcial já coberto, o 30). O ID oficial e o dono são seus; eu não abro ticket.
2. **Confirmar o default das rotinas existentes** em T3U-08 (mesma conversa × thread nova) — mudança de comportamento precisa ser explícita.
3. **Confirmar as dependências:** T3U-15 → T3U-14; T3U-07 → T3U-28; T3U-29 → Cloudflare; T3U-06 → Rivet/desktop.
4. **Remover o item 17 do backlog** (aprovação com escopo já está no tree) e tratar 5/12/21/30 como parciais, não como novos.
5. **Decidir a linha de arquitetura** dos itens 14/15/23/24/26/27: religar o plugin do harness (registro de atalhos, `ui-input-trigger`, draft document, `ui-attachment`, `ui-sidebar-terminal`) ou reimplementar no `client-ui-persona`. O draft recomenda adoção onde o plugin não arrasta a sidebar conversa do harness (atalhos e referência); reimplementação onde arrasta (trigger, draft, terminal). A mesma decisão vale para 12/13 (`session-query`), 7 (`session/fork`) e 29 (`experimental/liveshare`): reusar o contrato/servidor ou portar para a thread da Persona. Essa escolha muda o dono e o tamanho de metade da lista.

Nada commitado; nada escrito fora de `persona-spec/research/t3code/`.

# Marco Dogfood — host (M1 responsável · M2 laço da responsável · M6 "quem cuida de quê") — Flint, 12/11 (desenho)

Critérios 1, 2 e 6 de `PLANO-COLHEITA.md` ("MARCO DOGFOOD"); `PLAN.md` §13; D-115. Regra de terreno do Keel (14:13): tudo em **staging** (`.maestri/tmp/flint/marco/`) até o aviso "candidato validado" (~15:15); arquivo novo só em staging até lá. Este documento é o desenho; o vermelho vem em staging, o código só entra depois do aviso.

## 0. O que já existe (e o que o marco NÃO reinventa)
- **O quadro é derivado dos tickets.** `BoardsHost.getProjectBoard` monta os cartões a partir de `orchestration…tickets`; a coluna de um cartão vem da categoria do estágio do ticket (`todo/doing/review/done`, `syncPlacementFromStage`); `moveTicket`/`moveTicketWith` já respeitam WIP, "resultado esperando Aplicar/Descartar" (FLOW-1) e devolvem `wipWarning`.
- **O ciclo por projeto já existe:** `ProactivityScheduler.runProject` (Vigia): pausa da equipe → lançar atribuições na fila → rotinas → *pull* (persona ociosa com fila; ticket que ninguém executa é conduzido até o fim) → retentativa com backoff → fila vazia + meta aberta ⇒ Coordenação planeja; senão **descansa com ZERO chamada de modelo**. Honra orçamento por persona/dia, janela de silêncio (`houseRules.quietNow`/`hold`), personas pausadas, motor pronto. Toda decisão é linha de auditoria (`watchdog_audit`); estado repetido grava uma vez.
- **Autoridade:** pedidos escritos por `routine:…`/`team:…` NÃO são "pessoa" (`humanAuthoredRequests`): não pré-autorizam conector (send/pay/delete continuam `ask`). O laço novo usa o mesmo molde.
- **Estação (item 24):** `station/admission.ts` admite turno por RAM (`sem-vaga` = fila calma). O teto do projeto é complementar, não substitui.

## 1. M1 — Projeto com responsável

**Modelo.** Um doc por projeto na KV de telas (`screen_doc`, kind `project_responsible`, id `default`), **sem migração**:
```
{ personaId: string, humanId?: string, setBy: string, setAt: string }
```
Por quê KV e não coluna/V27: o campo é leve, por projeto, lido em 3 telas e já tem a cerca do projeto (`projectId` na chave); o resto da Casa (marca de leitura) usou o mesmo caminho. Se o Keel preferir integridade referencial, a alternativa é V27 `project.responsible_persona_id` + `responsible_human_id` (aditiva, mesma leitura); o contrato dos Remotes abaixo não muda.

**Resolução (nunca "sem responsável" na tela).** `responsibleOf(projectId)`:
1. doc salvo e a persona ainda existe no projeto (não aposentada) → `{ source: 'chosen', persona, human? }`;
2. senão a persona de **Coordenação** do projeto → `{ source: 'default' }` (honesto: a tela diz "padrão");
3. senão nenhuma persona → `undefined` (projeto sem time: a tela mostra o convite para montar o time).
Uma persona aposentada/removida deixa o doc "velho": a leitura cai no padrão e marca `stale: true` (a pessoa vê "escolha de novo"), nada quebra.

**Remotes (tipos planos no fio: nada de template literal — lição do Typert):**
| Remote | Quem | Regras |
|---|---|---|
| `setProjectResponsible({workspaceId, projectId, personaId, humanId?})` | **só o dono** (`requireProject` + `requireGovOwner`) | A persona tem de ser DO projeto (cerca: persona de outro projeto = `not-found`); `humanId` opcional, tem de ser membro do workspace; `humanId: ''` limpa só a pessoa. Escreve o doc, 1 linha de auditoria (`project.responsible`) e 1 linha de Atividade ("A Bia agora cuida deste projeto"). Idempotente (mesmo valor = nada novo). Resposta: `ProjectResponsibleView`. |
| `getProjectResponsible({workspaceId, projectId})` | quem lê o projeto | Leitura para o cabeçalho do projeto, o quadro e a Casa (3 lugares; "trocar = 1 clique" é UI do Prism sobre o `set…`). |
`ProjectResponsibleView = { projectId, persona?: { id, name, title }, human?: { id, name }, source: 'chosen' | 'default', stale: boolean }`.

**Prova (vermelho primeiro):** ACL (membro recusado, dono ok, convidado recusado), cerca (persona de outro projeto), resolução (salvo → padrão Coordenação → nenhum), persona aposentada = `stale` + padrão, idempotência, auditoria escrita 1 vez, `humanId` de fora do workspace recusado.

## 2. M2 — O laço da responsável (`project-lead.ts`, arquivo NOVO)

**Onde roda.** NÃO é um segundo agendador. É uma classe `ProjectLead` (módulo novo) chamada **uma vez por ciclo e por projeto** pelo `ProactivityScheduler.runProject`, logo depois do *pull*/retentativa, por **um** gancho pequeno (`deps.lead?.step(projectId, nowIso)`, ≤ 10 linhas, ausente = nada muda). Portas injetadas (como o resto do scheduler): quadro (cartões + colunas), personas, estado de trabalho, relógio, `driveTicket`, `postLine` (linha do canal), auditoria, teto/cota. Tudo testável com IA falsa e relógio acelerado (insumo do M7).

**Ligação.** Opt-in **por projeto** ("Deixar a responsável tocar o quadro"): doc `project_autopilot` `{ on: boolean }`, padrão **desligado** (segurança: o dono liga com 1 clique; `setProjectAutopilot({…, on})` só-dono). Mais uma flag central do host `projectLead` (padrão OFF no produto, ON na faixa de testes e na build do dogfood) — o mesmo molde das superfícies (D-113): flag off = o gancho nem cria o `ProjectLead`.

**O passo (determinístico primeiro; modelo só para conduzir um cartão).** Em ordem, parando no primeiro que "gasta a vez":
0. **Portões (zero modelo):** equipe pausada · projeto sem responsável resolvida · janela de silêncio (`quietNow`: o laço espera, fica devido) · motor não pronto · **teto do projeto** (abaixo) → o passo só audita UMA vez o motivo ("A Bia parou: teto de turnos de hoje") e sai.
1. **Cobrar quem parou** (barato, sem modelo): cartão em `doing` sem progresso há `stallAfterMs` (mesmo sinal `no_progress` da Vigia), dono não pausado e dentro do teto → **1 cobrança** (`maxChases`, padrão 1 — combina com o E3 do Gauge): 1 linha **determinística** no fio da Task, escrita como a responsável ("Téo, o cartão «X» está parado há 2 h. Precisa de algo?"). Se passar de novo `stallAfterMs` sem progresso, **escala para a pessoa**: levanta a atenção do ticket (o mesmo mecanismo da pergunta aberta, `Ticket.attention`, que o quadro já mostra na coluna `needs_you` e o "Enquanto você estava fora" já lista) e o laço PARA de cobrar aquele cartão (nunca fica em loop; só volta se o cartão andar de novo). O contador vive no **disco** (`screen_doc` kind `lead_chase`, id = ticket: `{ count, lastAt, escalated }`), não na memória.
2. **Puxar o próximo cartão** (se a responsável tem folga): o primeiro cartão `todo` na ordem da coluna que **ninguém executa**, não espera a pessoa (sem Aplicar/Descartar pendente, sem pergunta aberta) e cabe no **WIP** da coluna `doing` (`moveTicketWith` → `wipWarning` ⇒ não puxa). Um por ciclo.
3. **Distribuir:** o dono do ticket, se já tem; senão a persona do time com **menor carga** (menos tickets abertos / fila), não pausada, dentro do orçamento do dia dela, com o **cargo** mais próximo do título do cartão (mesma tabela de palavras da Casa, `channel-suggestions`), desempate = ordem do roster; na dúvida, a própria responsável. Grava a decisão (auditoria) e entrega via o caminho existente `driveTicket(projectId, ticketId, personaId)` — **o único passo que chama modelo** (1 por ciclo).
4. **Mover:** a coluna segue o estágio do ticket (fila→fazendo ao iniciar; fazendo→revisão quando a persona entrega e a política de revisão pede; **revisão→feito só depois do Aplicar da pessoa ou da revisão da colega**, nunca por atalho do laço). O laço NÃO força `done`: só chama `moveTicket` onde o fluxo normal já permite.
5. **Resumo do dia (C5):** o CONTEÚDO, o tom e a privacidade são do contrato do Anvil (`marco-dogfood-resumo.md`) e o compositor puro é dele (`day-summary.ts`, 9 testes): **uma** mensagem por projeto por dia local no `#geral` do projeto, autor = a persona RESPONSÁVEL, id estável **`day-summary-<projectId>-<AAAA-MM-DD local>`** (idempotente: relógio acelerado e reinício não duplicam), sem modelo, nunca vira memória. **Eu só ligo o gancho no laço:** (a) decido QUANDO (fim do dia local, `localOffsetMinutes`; espera o fim da janela de silêncio; não sai com equipe pausada ou a responsável pausada; a pausa de teto/cota NÃO impede, não gasta turno); (b) monto os FATOS de entrada pela visão do **leitor menos privilegiado** (`ticketSeenByActor`: cartão nascido de DM nunca entra, nem em contagem) e só deste projeto (cerca do M3); (c) chamo o compositor e posto; (d) dia sem nada = não posta, 1 linha `quiet-day` na atividade. O compositor aplica o filtro de segredo/`redactText` nos títulos; eu nunca passo relatório de turno cru, só campos estruturados. **Formato dos fatos (proposta, combinado com o Anvil):** `{ projectId, dayLocal: 'AAAA-MM-DD', responsible: { id, name }, done: [{ title, by }], doing: [{ title, by }], waiting: [{ question, kind: 'approval' | 'question' | 'review', sinceDay: 'AAAA-MM-DD' }], stuck: [{ title, reason, chasedBy? }], teamMemory: string[], ceiling?: 'quota' | 'turns', tomorrow: string[] }`.

**Idempotência e queda (costuras C2/C5/E10 do Gauge).** O laço NÃO tem timer próprio e NÃO lê `Date.now()`: roda dentro de `proactivityScheduler.cycle()`, com o relógio único `host.orchestration.now`. Repetir o mesmo instante não duplica nada porque **todo estado do laço está no disco**, nunca na memória: `lead_chase` (acima), `lead_pull:<ticket>` (o cartão já foi puxado/entregue a quem), `lead_summary:<AAAA-MM-DD>` (o resumo do dia já saiu; o id do evento também é determinístico: `day-summary-<projectId>-<AAAA-MM-DD>`) e o último motivo de espera (`lead_hold`, para gravar "pausei: …" uma vez). Fechar o host no meio do ciclo e reabrir o MESMO arquivo retoma do que está no disco: nenhum cartão perdido, nenhuma entrega/cobrança duplicada (E10).

**Rastro legível por ação (C3) e contadores (C7).** Cada ação do laço grava UMA linha de auditoria própria (`watchdog_audit`, tipos `lead:pull` (puxar E entregar a quem: uma linha só), `lead:chase`, `lead:escalate`, `lead:move`, `lead:summary`, `lead:hold`, `lead:refused`) com `projectId`, `ticketId?`, `personaId?`, `origin: 'quadro'` e o PORQUÊ em frase ("pausei: cota 95%", "puxei «X» e entreguei ao Téo: menor carga"). Leitura só-leitura para o e2e e para o relatório do soak, sem espiar interno:
- `getLeadTrail({workspaceId, projectId, limit?})` → `LeadTraceView[] = { at, kind, projectId, ticketId?, personaId?, origin: 'quadro', detail }` (mais recentes primeiro; só do projeto pedido — a cerca vale na leitura também).
- `getLeadStats({workspaceId, projectId})` → `{ cycles, actions: Record<kind, number>, refusals: number, lastHold?: string }` (derivado do rastro; sem dado novo guardado).

**Autoridade (Lumen) — o laço nunca autoriza nada.** Origem `quadro`: as linhas e os pedidos do laço saem com autor técnico (`team:lead`), que `humanAuthoredRequests` já exclui ⇒ **nenhum pré-autoriza** conector; send/pay/delete/publicar continuam parando no cartão de aprovação ("segure para aprovar", item 5). O laço também não concede conector, não muda política de revisão e não toca em outro projeto (a cerca: o passo só lê/escreve o `projectId` do ciclo; ação da responsável A no quadro B = recusada — critério do M3). Teste dedicado: "uma ação de risco iniciada pelo laço PARA no cartão".

**Teto e pausa (item 10).**
- **Pausa:** `Pausar equipe` (todo o ciclo já para), persona pausada (não recebe), janela de silêncio (espera), motor indisponível (espera). Nada disso é erro: é estado.
- **Teto por projeto, por dia:** `maxLeadStartsPerDay` (padrão 24 condução de cartão pelo laço) **e** o orçamento de execuções do projeto que a orquestração já tem (`budget.of/maxPerProject`): o que bater primeiro vale; ao bater, 1 linha de auditoria e o laço dorme até virar o dia.
- **Cota aos 95% (item 10):** porta `quotaUsed(projectId): number (0..1)`; ≥ 0,95 o laço **para de puxar/cobrar** (guarda os últimos 5% para a pessoa conversar) e posta UMA vez "Segurando os últimos 5% da janela para você"; quando a janela renova, volta sozinho. Vem da mesma fonte da pausa preventiva do item 10 (Forge dono; eu só consumo a porta — ver §6).
- **Estação:** a admissão por RAM continua valendo por baixo (`sem-vaga` = a condução espera na fila calma).

## 3. M6 — "Quem está cuidando de quê" (view de host; Prism desenha a tela)
`getProjectCare({workspaceId, projectId})` → um retrato por projeto, **só leitura**, só o que o chamador pode ler:
```
ProjectCareView = {
  projectId, projectName,
  responsible: ProjectResponsibleView,
  autopilot: boolean,                 // o laço está ligado neste projeto?
  lead: { state: 'working' | 'resting' | 'paused' | 'holding' | 'capped', note?: string },   // o que a responsável está fazendo agora, em palavras
  personas: [{ id, name, title, state, sentence?, currentTask?, queueCount, paused? }],        // o que cada persona faz agora (item 6): reaproveita overviewNow
  waitingForYou: { approvals: n, reviews: n, questions: n, items: [{ kind, taskId?, title }] }, // ≤ 5 itens: o que espera o Miguel
  counts: { done: n, doing: n, queued: n, cap: n, pulled: n },     // done = cartões feitos HOJE; cap = teto de cartões puxados por dia; pulled = quantos o laço já puxou hoje (o "ritmo" do quadro)
  companyName: string                                              // o nome do workspace (para o topo da tela "quem cuida de quê")
}
```
+ `pauseBoard`/`resumeBoard` do Prism = `setProjectAutopilot({workspaceId, projectId, on})` (só dono; desligar = o laço para, nada mais muda). + `getCareOverview({workspaceId})` → `ProjectCareView[]` de **todos os projetos que a sessão lê** (para "por projeto, em 1 olhar"). Reaproveita `overviewNow`, `listApprovals`/"Enquanto você estava fora" e o estado do laço; nada de dado novo guardado.

## 4. Testes (vermelho primeiro, em staging; "IA falsa", relógio acelerado)
- **Puros (`project-lead.spec.ts`, portas falsas):** puxa o próximo respeitando WIP e ordem; não puxa com equipe pausada / janela de silêncio / sem motor / teto / cota ≥ 95%; distribui para a menor carga não pausada (e cai na responsável quando ninguém serve); cobra com backoff e na 4ª escala para a pessoa (e para); resumo 1 vez por dia, idempotente, "dia vazio" não posta; autor técnico (não pré-autoriza); 2 projetos não se tocam.
- **Host real (`project-lead.host.spec.ts`):** 2 projetos com cartões e respostas falsas andam até `done` sem humano; a ação de risco PARA no cartão de aprovação; teto respeitado; resumo postado no `#geral` certo; ACL/cerca de `setProjectResponsible` e `setProjectAutopilot`.
- **M7 (Probe/Gauge)** reaproveita as portas com relógio acelerado (o `ProjectLead` não lê `Date.now()`, só o relógio injetado).

## 5. Ordem de entrega (cada passo com vermelho→verde, depois do aviso "candidato validado")
1. M1 doc + `setProjectResponsible`/`getProjectResponsible` + specs (arquivos novos: `project-responsible.ts`, spec) — **o módulo puro e o spec já estão prontos em staging** (`.maestri/tmp/flint/marco/stage/`: `project-responsible.ts` 6 testes, `lead-trail.ts` + `project-lead.ts` 12 testes; 18/18 verdes, mutações de `waitsForPerson` e de escalada sem janela ficam vermelhas). 2. M6 `getProjectCare`/`getCareOverview` (só leitura; destrava o desenho do Prism cedo). 3. `ProjectLead` puro (puxar → distribuir → cobrar → resumo) + rastro (`getLeadTrail`/`getLeadStats`), cada um com seu teste. 4. Gancho no scheduler + flag + opt-in por projeto + host spec com 2 projetos. 5. Regerar o Typert (pela trava, ≥ 8 GB, ANTES de declarar pronto) e provar no app (Remotes novos, tipos planos).
Nomes finais para o e2e do Gauge (marco-dogfood-e2e.md §3): C1 `setProjectResponsible`/`getProjectResponsible`; C2 `ProjectLead.step` chamado por `ProactivityScheduler.runProject`; C3 `getLeadTrail`; C5 id `day-summary-<projectId>-<AAAA-MM-DD local>` (contrato do Anvil); C7 `getLeadStats`. C4 (Forge: teto/cota) e C6 (Tally/Lumen: cerca e origem `quadro`) entram pelas portas descritas em §2.

## 6. Perguntas ao Keel / dependências
1. **KV ou V27** para o responsável? (recomendo KV; muda só 1 função).
2. **Padrão desligado por projeto** (opt-in com 1 clique) está de acordo? Para o aceite do Miguel ele liga nos 2 projetos reais.
3. **Cota aos 95%:** o Forge entrega `quotaUsed(projectId)` (ou o nome que ele preferir); eu só consumo.
4. **Revisão→feito:** confirmo que o laço NUNCA conclui um cartão com revisão/Aplicar pendente (só o fluxo normal conclui).
5. Hora do resumo: padrão 18:00 local do projeto; a Muse confirma a frase.

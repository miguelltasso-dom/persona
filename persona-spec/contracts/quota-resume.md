# Contrato — "No limite → Retomar" de verdade (IV-7 / P0-19)

Tally, 04/11 (D-076; passou do Bolt para mim). Backend pronto no host; falta o botão do Flint e a releitura da cota do Rivet (abaixo).

## O que já funcionava (não é novo)

Uma **mensagem enviada com o motor fora** (cota esgotada, sem login, sem IA) é retida pelo engine, **por fio, em ordem**, e rodada quando o motor volta: `engineReadinessOf` → `engineUnavailable` → `pendingEngineTriggers`; `armEngineRetry` faz o poll; `handleReadyEngines` → `resumeEngineTriggers`. Remote `getEngineStatus` mostra `pending`; Remote `retryEngine` é o "Retomar" (força uma checagem e solta as retidas). A fila de mensagens **já** é preservada (teste novo `quota-resume.spec.ts` prova: 2 mensagens retidas, 0 chamadas, `pending: 2`; ao voltar, as 2 viram Ticket e rodam).

## O que faltava e agora existe

Uma **Tarefa que estava RODANDO** quando a janela acabou terminava bloqueada ("A conta do Claude chegou ao limite") e **nada a trazia de volta**; e `Tentar de novo` criava um Assignment novo que todo laço pulava porque a linha `coord-<ticket>-done` já existia (o achado nº 2 do Bolt).

1. **A linha "done" segue o Assignment** (`persona-host/src/ticket-done.ts`): o 1º Assignment mantém `coord-<ticket>-done` (nada gravado se move); os seguintes ganham `coord-<ticket>-<assignment>-done`. Usado por `orchestration.ts`, `attention.ts` e `proactivity-scheduler.ts`. Isto também destrava o retry e o `answerAttention` quando alguém roda o Ticket.
2. **Registro persistido dos Tickets parados por quota** (`persona-host/src/quota-wait.ts`, `screen_doc quota_wait`): gravado em `reportResolveFailure` quando o erro é `quota_exhausted` (com o `resetAt` do erro, **opcional**).
3. **`orchestration.resumeQuotaWaiting(projectId)`**: com o motor `ready`, para cada Ticket parado (do mais antigo): `engine.retryTicket` (Assignment novo) e `driveTicket` (o executor do Bolt); roda **uma vez**; Ticket que já seguiu em frente (retry, parada, entrega) sai da lista sem rodar.
4. **Quando roda:** (a) o ConnectionProbe diz que há motor pronto (`handleReadyEngines`); (b) no **relógio de reset** (`armQuotaRecheck`, timer `unref`: relê o motor em `resetAt + 1 s`; sem relógio, recheca a cada 5 min); (c) a pessoa clica **Retomar** (`retryEngine` já chama `handleReadyEngines`).
5. **Para a faixa "No limite até {hora} · as tarefas esperam":** `EngineStatusView` ganhou `quotaWaiting?: number` (quantas Tarefas esperam) e `quotaResetsAt?: string` (o relógio mais cedo; ausente = o vendor não deu). Os dois só aparecem quando há Tarefa esperando.

## Provas

`persona-host/tests/quota-resume.spec.ts` (6): Task parada espera, **não** roda com o motor fora, roda de novo uma vez quando volta e é entregue (no mesmo Ticket); Ticket que seguiu em frente é descartado; retry roda o worker de novo e as linhas "done" ficam separadas por Assignment; mensagens retidas não se perdem e rodam quando o motor volta; relógio de recheca (reset, 5 min sem relógio, relógio já passado = 1 s); **o host olha de novo sozinho no relógio de reset** (timer simulado: antes do relógio nada acontece; no relógio relê o motor e roda a Tarefa). Host (29 arquivos de orquestração, incluindo os do Bolt) 213 verdes; `check-pkg persona-host` OK.

## O que NÃO está fechado (e de quem é)

- **Limite no MEIO de um turno** não vira `quota_exhausted` hoje: `resolveCaughtError` só reconhece rede → o turno falha como `engine_unavailable`, sem relógio, e só a próxima resolução fresca levantaria `quota_exhausted`; a sessão quente do pool nem roda o pré-voo. **Rivet** propôs (e eu pedi) reler `accountUsage` quando um turno termina com erro de motor e, se alguma janela ≥ 100%, tipar como `quota_exhausted` com o `resetAt` da janela (e checar a sessão quente). Enquanto isso, só o limite detectado **antes do voo** (política de contas e `assertReady`) é retomado sozinho; o do meio do turno fica bloqueado para o Retomar/Tentar de novo manual. Sem isso o IV-7 não fecha de ponta a ponta.
- **"Na hora, com outra conta":** o resolvedor já troca de conta sozinho quando a política é automática (`pickProviderAccount` → `switch`) e a Tarefa nem para; quando a política é "perguntar" (`ask`) o erro `quota_exhausted` sobe e a pessoa precisa **confirmar a troca**: falta o Remote/UI de "usar a outra conta e retomar" (2ª fatia; precisa do Flint no botão e da regra de troca do Usage).
- **Flint (UI):** o botão **Retomar** da faixa só chama `refresh`; deve chamar `retryEngine` (já existe) e a faixa deve ler `getEngineStatus` (`quotaWaiting`, `quotaResetsAt`) para o texto "No limite até {hora} · as tarefas esperam" (P0-19). A forma é da Muse.

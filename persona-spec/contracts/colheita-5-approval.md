# COLHEITA 5 — "Segure para enviar", prazo e Desfazer de 5 minutos (Prism, 11/11)

Spec de tela: `persona-spec/design/COLHEITA-MUSE.md` §5. Este contrato só **acrescenta** campos; nada que existia mudou de significado.

## 1. Cartão de ação externa (`external-actions.ts`, `ActionPreviewView`/`ActionPreviewWire`)

| Campo novo | Tipo | Sentido |
|---|---|---|
| `expiresAt` | ISO, opcional | Até quando o cartão vale (24 h depois de criado). O cliente escreve "Vale até hoje, 18h" · "Vence em 40 min". Sem ele, não há selo. |
| `expired` | `true`, opcional | O cartão fechou sem resposta (`status: 'cancelled'`, `failureReason: 'expirou'`). O cliente mostra o cartão só de leitura com "Pedir de novo", não a linha "Cancelado". |
| `retried` | `true`, opcional | A pessoa já pediu de novo; a persona vai mandar outro cartão. |

`ActionChoice` ganha `retry` (`decideApproval({ kind: 'action', choice: 'retry' })`):

- só vale para um cartão vencido e só uma vez; em qualquer outro estado devolve o cartão como está e não avisa ninguém;
- avisa a persona (dado, não instrução) para fazer um **novo** pedido; **nada é aprovado** aqui;
- o mesmo pedido (mesmos argumentos) abre um cartão novo, com novo prazo; o cartão pedido de novo não conta como tentativa (o limite de 2 por Tarefa e ferramenta continua valendo para quem muda o pedido).

"Executa exatamente o que foi aprovado, uma vez" (já era do HT-9, agora com teste): a aprovação é pelo hash dos argumentos; um 2º `send` no mesmo cartão devolve o cartão sem aprovar de novo (`onActionApproved` dispara uma vez); depois de `markSent`, `approvedFor` volta vazio.

O "segure" (1,2 s) é do cliente (`chat/hold-approve.ts`, `HoldToApproveButton`); o host continua falhando fechado para prévia cortada/escondida.

## 2. Desfazer de 5 minutos no que é interno (`activity-undo.ts`)

- `onActivity` do harness agora chama `ActivityUndo.record`: grava o mesmo documento `harness_activity` (mesma chave `at:callId`), acrescenta `undoUntil` (= `at` + 5 min, só quando a atividade tem inverso) e põe **uma linha no fio**: mensagem da persona `activity-line:<activityId>` na conversa do pedido da pessoa (`requestId`) ou em `#geral`.
- `MessageView.actionEvent` (`ActionEventView`): `{ verb, connectorName: 'Persona', target, after?, activityId, undoable?, undoUntil?, undone? }`. O verbo de edição de rotina sai como `routine_edit` (o que o cliente escreve). Nunca leva o inverso, ids de ferramenta ou caminhos.
- `undoPersonaAction({ workspaceId, projectId, activityId })` → `{ undone: true, alreadyUndone? }`:
  - dentro dos 5 min, uma vez; depois, `RemoteFault('invalid-payload', 'O prazo para desfazer passou (5 minutos).')`;
  - o inverso é o método do próprio host (`moveTicket`, `deleteSprint`, `planSprint`, `deleteRoutine`, `pauseRoutine`, `updateRoutine`, `retirePersona`, `decideApproval` só com `accept: false`), reconstruído e validado a partir do documento, **no escopo do registro** (nunca o que o texto gravado diz);
  - se o inverso falhar, a atividade continua como estava (ainda desfazível até o fim da janela) e a pessoa recebe a frase segura;
  - só o dono do espaço (`actorOf(...).kind === 'user'`, como `undoAccountSwap`).
- Nunca aqui: e-mail, post, pagamento e apagar fora do produto (esses passam pelo cartão de prévia).

## 3. Cliente

- `ActionEventLine`: dentro da janela "Desfazer · 4 min"; depois (ou desfeito) a linha vira texto simples em `--persona-ink-muted`, sem link; "Desfeito" só quando o host aceitou; se recusou, "Não deu para desfazer.".
- Textos novos (pt/en) em `locale-sources/chat.*.json`: `action.hold.*`, `action.deadline.*`, `action.retry`, `action.undone`, `action.undoFailed`, `action.did.sprint_plan`; `action.did.board_card_create/delete` dizem "tarefa" (Muse).

# Contrato — “Proposta de {persona}” no #geral (P1-9, UX-BEYOND §Proatividade)

Dono do contrato e do engine: **Forge** (`persona-engine/src/task-proposal.ts`) · host: Forge + Bolt (`persona-host/src/task-proposals.ts`; o gancho do agendador é do Bolt) · forma: **Muse** · tela: **Prism** ou **Ember**.

A iniciativa diária de cada persona (agendador do Bolt, `runInitiative`) deixa de ser só uma linha de auditoria e vira, quando há motivo REAL, um cartão no #geral: *“Posso retomar “Relatório de sexta”?”* com **Aceitar** · **Agora não**. Aceitar cria um Ticket de verdade; as respostas realimentam a frequência. Regra de ouro (PROACTIVITY §6): resumo, nunca spam; nada de proposta vazia ou inventada.

## O que vira proposta (só fato observado, sem IA, custo zero)

Palavras finais da Muse (`design/TASK-PROPOSAL-SPEC.md` §1), em pt e en, no engine (`proposalQuestion`/`proposalReason`/`proposalRequest`). Aspas tipográficas “…”, título cortado em 60 caracteres com “…”.

| Fato (quando existe) | Pergunta | Motivo (uma linha) |
| --- | --- | --- |
| Ticket com pergunta aberta há ≥ 1 dia | Posso destravar “{título}”? | a pergunta que está travando (até 90 caracteres) |
| Ticket aberto sem progresso há ≥ 2 dias (não está rodando, não tem resultado esperando revisão) | Posso retomar “{título}”? | “Está parado há N dias.” |
| Prazo/evento do projeto *(o engine já fala; ainda não há fonte no host)* | Posso adiantar “{título}”? Vence {quando}. | o fato |
| Erro recorrente *(idem)* | Posso resolver o erro que se repete em “{título}”? | o fato |
| Objetivo ativo e nada rodando | Posso dar o próximo passo em “{objetivo}”? | “O objetivo está aberto e nada está andando.” |

- **Quem propõe:** a persona dona do Ticket (`execution.name`) fala do trabalho dela; a **Coordenação** fala do que ninguém é dono (Ticket sem dono, objetivo) e assina o resumo.
- Sem fato real não há cartão: a frase genérica “Revisar o projeto e propor o próximo passo” NUNCA vira cartão. Proposta aberta, “Agora não” de até 7 dias, aceita há menos de 7 dias, ou outro Ticket aberto quase igual (≥ 85% de semelhança; o próprio Ticket do fato não conta) não repete.
- Cada `request` (o que vira Ticket ao Aceitar) começa com um verbo de trabalho e passa em `wantsWork`, pt e en (teste).

## Como o agendador chama (`TaskProposalPort`, `persona-host/src/task-proposals.ts`)

1. `expire(projectId, now)` no começo do ciclo do projeto.
2. `offer({workspaceId, projectId, personaId, nowIso, goalObjective?})` na iniciativa diária da persona **em modo “Propor”** (já passou por pausa, horário de trabalho e silêncio); só **registra** (`queued`), não posta, e **não depende** do `fire` legado (aquele pontuador descarta como “duplicado” qualquer fato sobre um Ticket que já existe).
3. `flush(projectId, now)` depois das rotinas do ciclo: **um** cartão para tudo que foi registrado (1 = único, 2–3 = resumo da Coordenação; acima de 3, o excedente é esquecido), no #geral do projeto, com o marcador `[[task-proposal:{json}]]` e a frase simples da Muse.

## Fio (wire)

`MessageView.taskProposal?: TaskProposalCardView`, lida do corpo da mensagem (`[[task-proposal:{json}]]` depois da frase simples, como `accountAsk`/`runError`), então sobrevive a recarregar e sincroniza:

```ts
interface TaskProposalCardView {
  readonly kind: 'single' | 'digest'          // 1 item = “Proposta de {persona}”; 2–3 = “Propostas da equipe”
  readonly items: readonly TaskProposalItemView[]
}
interface TaskProposalItemView {
  readonly id: string                          // vai em decideTaskProposal
  readonly personaId: string
  readonly personaName: string
  readonly question: string                    // “Posso retomar “Relatório de sexta”?”
  readonly reason: string                      // uma linha, só fato
}
```

O ESTADO vivo não vai no corpo (ele muda): vem de `listTaskProposals`.

| Remote | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| `listTaskProposals` | `{workspaceId, projectId}` | `TaskProposalView[]` (recentes primeiro) | `TaskProposalItemView` + `status: 'open'\|'accepted'\|'declined'\|'expired'`, `decidedAt?`, `ticketId?` |
| `decideTaskProposal` | `{workspaceId, projectId, id, accept: boolean}` | `TaskProposalView` | escrita no projeto; **idempotente** (decidir de novo devolve o estado, nunca cria 2º Ticket); `accept` posta `@{persona} {pedido}` no #geral como a pessoa, que vira Ticket pelo caminho normal; `accept:false` = “Agora não” |
| `reopenTaskProposal` | `{workspaceId, projectId, id}` | `TaskProposalView` | o **Desfazer** de “Agora não”: só uma proposta recusada reabre (e a taxa volta ao que era); aceita não reabre (já virou Ticket); idempotente |
| `getProposalStats` (Visão geral) | `{workspaceId, projectId}` | `ProposalStatsView[]` `{personaId, personaName, accepted, declined, rate}` | “propostas aceitas” do PROACTIVITY §7 |

`TaskProposalView` = item + `status`, `cardId`, `createdAt`, `decidedAt?`, `ticketId?`, `ticketTitle?` (para “Aceita · virou a tarefa {título}”; o Ticket pode aparecer um instante depois, se o pedido esperou vaga). Aceitar dá `conflict` (“Não consegui criar a tarefa agora. Tente de novo.”) se o pedido não pôde nem ser registrado; a proposta continua aberta.

Erros: `not-found` (proposta de outro projeto/inexistente); `forbidden` (guest/persona).

## Orçamento de atenção (nunca spam)

- Por persona: no máximo `proposalBudget`/dia (já existe em `AutonomyRow`), reduzido pela taxa de aceite (abaixo).
- Por projeto: no máximo **1 cartão novo por ciclo do agendador** e **3 propostas em aberto** sem resposta; com 3 abertas, nada novo é postado.
- 2+ propostas no mesmo ciclo viram **um** cartão `digest` (resumo), não vários.
- Nada durante: janela de silêncio, Pausar equipe, persona pausada, fora do horário de trabalho, modo “Só quando pedido” (todos já são portões da `runInitiative`).
- Sem resposta em **3 dias** a proposta vira `expired` (some do aberto; neutra para a taxa); “Agora não” silencia a mesma proposta por **7 dias**.

## Taxa de aceite → frequência

Por persona: taxa móvel (4 amostras, começa em 0,5). `Aceitar` empurra para 1, `Agora não` para 0; expirar não conta. Permitido por dia = `proposalBudget` se taxa ≥ 0,5; metade (mín. 1) se 0,25–0,5; abaixo de 0,25 só 1 cartão a cada `24h × (2 − taxa)`. Nunca zera: proatividade que não gera valor perde prioridade, não some.

## Para a Muse (forma) — o que o cartão precisa mostrar

Autora (rosto + nome da persona; no `digest` a Coordenação), a pergunta em palavras da pessoa, o motivo numa linha, **Aceitar** (primário) e **Agora não** (secundário) por item; depois da decisão o cartão vira uma linha (“Aceita · virou a tarefa {título}” / “Deixei para depois”). Sem número inventado de custo ou tempo: só `estimateAsk` quando houver medida.

## Prova (quando pronto)

Engine: `persona-engine/tests/task-proposal.spec.ts`. Host: `persona-host/tests/task-proposals.spec.ts` (cartão único vs resumo, tetos, aceitar cria 1 Ticket e é idempotente, “Agora não” silencia, expira, taxa muda a frequência, ACL).

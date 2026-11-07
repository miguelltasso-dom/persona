# TEAM-6 — a revisão entre colegas como ETAPA do fluxo (engine)

Tally, 04/11 22:35. Para o Anvil (host: guardar o estado, abrir a Tarefa do revisor, config por projeto/tipo), o Forge (bilhete e handoff são a base; `HandoffKind` já tem `review`) e o Lumen/Ember (selo e linhas). Código: `persona-engine/src/review-step.ts` (puro: sem relógio, sem store, sem modelo), exportado do `persona-engine`. Prova: `review-step.spec` (26). Nomes do fio: `team-real.md` §3/§7 (`MessageView.review`, `BoardCardView.reviewedBy`, `PathStep`).

## O fluxo (EQUIPE-REAL-SPEC (d))

```
A termina → [reviewDue? chooseReviewer] → "Revisando: R" → R aprova            → entrega com o selo "Revisado por R"
                                                       → R devolve (≤ 2 vezes) → A ajusta → R revê de novo …
                                                       → 3ª vez com pontos      → entrega SEM selo, com "R deixou {n} ponto(s) em aberto"
```

## O que o host faz (3 chamadas)

```ts
const pick = chooseReviewer(policy, author, team, { type })          // { personaId } | { skip: 'off'|'not-due'|'no-reviewer' }
let step = reviewStep(state, { type: 'author-done', pick }, { authorId })   // 1ª chamada; depois as outras, sempre com o estado devolvido
// guarde step.state na Tarefa (JSON puro) e faça o que step.action manda
```

| `action` | O host faz |
|---|---|
| `ask-review { reviewerId, pass }` | abre a Tarefa do revisor (HandoffKind `review`); o pedido sai de `reviewRequestFor` (bilhete como DADO entre `<bilhete>`, pede o veredito pela ferramenta de revisão) |
| `return-to-author { authorNeeded, round }` | a Tarefa volta à autora com `returnNoteFor` (as "Notas de {R}" no formato do bilhete, `Falta:`); quando ela terminar, o host manda `author-adjusted` |
| `deliver { sealedBy?, openPoints?, skipped? }` | entrega à pessoa. **O selo só existe com `sealedBy`** (aprovado). `openPoints` = pontos que o revisor deixou em aberto (3ª vez) e vão à vista. `skipped` = por que não houve revisão (`off`, `not-due`, `no-reviewer`, `reviewer-failed`), só para o **detalhe da Tarefa**; nunca uma linha acusando "não revisado" |
| `none` | evento duplicado ou fora de ordem: nada muda, nada a fazer (idempotente) |

`step.line` (dados, as palavras são do Ember): `asked` ("{A} pediu revisão a {R}"), `approved` ("{R} aprovou"), `returned` ("{R} pediu ajustes: {1 linha}", ≤ 140 caracteres), `adjusted-approved` ("{A} ajustou e {R} aprovou"). Reenviar ao revisor depois de um ajuste **não escreve linha nova**. `step.view` é o `MessageView.review` (`kind: 'reviewed'|'returned'`, `round`, `maxRounds: 2`, `openPoints?` na 3ª vez). `step.path` é o passo `reviewed` do "caminho do trabalho" (o host carimba `at`).

## Eventos

`author-done { pick }` · `verdict { verdict }` (do `readVerdict` do que o revisor escreveu) · `author-adjusted` · `reviewer-failed` (a Tarefa do revisor falhou, bloqueou ou venceu o prazo: **a entrega segue**, sem selo; uma revisão que não responde nunca segura a entrega).

## Quem revisa (`chooseReviewer`)

Política por projeto: `{ mode: 'off' | 'all' | 'types', types?, reviewer: coordination | same-role | persona }`. **Projeto novo = ligada em todas as entregas, pela Coordenação** (`NEW_PROJECT_REVIEW`; quem nunca configurou usa isso). Regras: quem escreveu **nunca** revisa o próprio trabalho (nem a Coordenação, se foi ela quem escreveu: outro colega elegível assume, ou fica sem revisão); revisor pausado, no limite da cota ou com motor desconectado é trocado pela Coordenação, depois por um colega da mesma função; mesma função escolhe o menos ocupado e depois o id; ninguém elegível ⇒ `skip: 'no-reviewer'` e a entrega segue.

## O veredito (`readVerdict`)

Entrada não confiável do modelo do revisor: `{ verdict: 'approve' }` ou `{ verdict: 'changes', points: [...] }` (aceita aprovar/aprovado/ajustes/devolver). Os pontos passam pela mesma limpeza do bilhete (segredo removido, tamanho limitado, no máximo 6 por volta). `changes` sem ponto, ponto demais ou palavra desconhecida recusam com uma frase em português que diz o caminho. As notas voltam à autora como **dado**, nunca como instrução.

## Custo visível (`reviewCost`)

"Cada entrega revisada custa ≈ 1 tarefa curta a mais" é o melhor caso (aprovou de primeira). O pior caso são 3 passagens do revisor + 2 ajustes da autora = 5 chamadas. `reviewCost` devolve a faixa (chamadas 1–5, tokens, micro-USD), `estimate` até o histórico medido da pessoa sustentar (`calibrated`), e o `rotulo` pronto para a dica do bloco "Revisão antes de entregar" (Quill). Os números não incluem a base do vendor (~31–38 mil tokens por chamada da CLI) até haver calibração (`baseDoVendorIncluida: false`).

## Quando a revisão não rodou: UMA linha na entrega (`groupReviewFailures`)

Pedido do Forge/Muse (05/11): uma revisão que falha **não escreve linha por Tarefa**; o motivo fica no registro de cada Tarefa (`TaskView.reviewFailed`: `unreadable` = o revisor não deu veredito, `engine` = o motor dele falhou) e a **entrega do pedido inteiro** diz uma vez: **"A revisão não rodou em {n} parte(s); seguiram sem o selo"** (com 1 parte, "em 1 parte; seguiu sem o selo", o verbo concorda). `groupReviewFailures(failures)` é puro: recebe só as falhas das partes de UM pedido (`{ taskId, reviewerId, at, reason }`), devolve `{ count, reviewerIds, line? }`. Agrupa o pedido, **não uma janela de tempo**; uma Tarefa cuja revisão falhou duas vezes conta uma; `reviewerIds` na ordem em que falharam; `line` ausente com `count = 0`; só ids e contagem, **nenhum texto do revisor** (LEAK-1).

## O que garanto com teste

Aprovar de primeira, 1 volta, 2 voltas (cada uma com o selo ao aprovar), a 3ª vez entrega com pontos à vista e SEM selo, sem revisor/desligada/fora do tipo entrega direto, revisor que falha não segura, eventos duplicados ou fora de ordem não mudam nada, e **nenhuma sequência de eventos (varredura exaustiva até 7 passos) passa de 2 voltas nem de 3 passagens**. O estado é JSON puro (sobrevive a reinício).

## Fora desta peça

O host (Anvil): guardar `ReviewState` na Tarefa, abrir a Tarefa do revisor, a ferramenta/porta do veredito, ler `Config.teamwork`, `TaskView.path`/`BoardCardView.reviewedBy`/`MessageView.review`, e as configs por projeto e tipo. As telas: Lumen/Ember (selo, linhas), Quill (bloco "Revisão antes de entregar"). Eu não toquei em arquivo de ninguém: `review-step.ts` é novo e só importa `handoff.ts` (`readNote`, `HandoffError`, `PathStep`).

## D-092 / USD-1: o custo da revisão (05/11)
`reviewCost` aceita `conta` e devolve `billing`, `quota`, `impacto`; `microUsd` só com API (senão `null`); `referenciaMicroUsd` é interno. O `rotulo` ("Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota (até 5 se houver ajustes)") não muda.

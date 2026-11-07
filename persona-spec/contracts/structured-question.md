# Pergunta estruturada da persona (colheita Lodi, item A) — contrato

Dono do contrato, engine e host: **Forge** · forma: **Muse** · tela: **Ember** (IV-10 UI) · runners (`persona_ask`): Forge, em `persona-runners/src/mcp` com o Rivet avisado.
Origem: `.maestri/tmp/muse-lodi-harvest.txt` item A. Estado (04/11 20:50): **fases 1 (engine) e 2 (host + cartão) FEITAS e testadas**; a fase 3 (a persona fazer a pergunta) falta — ver “Como a pergunta chega do worker”. Decisões da Muse (19:40) já incorporadas.

A persona pergunta e oferece **respostas rápidas** (chips); a pessoa escolhe uma ou várias, e **sempre** pode escrever e anexar arquivo (o `answerAttention` do IV-10). Várias perguntas viram uma **sequência** mostrada uma por vez (“Pergunta 2 de 3”); depois de respondida, o cartão fica **somente leitura**, marcado “respondida”, com as escolhas (check).

## Modelo (engine, `persona-engine`)

```ts
interface AskOption { id: string; label: string }      // id: [a-z0-9_-]{1,40}, único na pergunta; label ≤ 60 caracteres
interface AskQuestion {
  question: string            // ≤ 500 caracteres
  options?: AskOption[]       // 2..8; ausente = só texto livre (o comportamento de hoje)
  multiple?: boolean          // false (padrão) = escolha única; true = múltipla (“Enviar 3”)
}
```

`Attention` (a pergunta aberta do Ticket) continua com `{id, question, triggerId?}` (quem só lê `question` não quebra) e ganha `ask?`:

```ts
interface AskState {
  options?: AskOption[]; multiple: boolean
  step?: { index: number; total: number }              // 1-based; só em sequência (total ≥ 2)
  later?: AskQuestion[]                                 // as próximas da sequência
  collected?: { question: string; options?: AskOption[]; optionIds: string[]; text: string }[]   // já respondidas
}
```

Regras do engine (puras, testadas):
- Uma pergunta aberta por Ticket (como hoje). Uma **sequência** de até **5** perguntas entra de uma vez; só a 1ª fica aberta, a 2ª abre quando a 1ª é respondida, etc. O worker **não acorda** até a última: um único acordar, com todas as respostas.
- Resposta `{text?, optionIds?}`: com opções, precisa de ≥ 1 opção **ou** texto (texto livre sempre vale); escolha única aceita no máximo 1 opção, múltipla aceita 1..N; id que não é da pergunta aberta é recusado (`UserError`). Sem opções, vale como hoje.
- Ao fechar a última, o Ticket recebe UM input de texto: pergunta única → `Escolhi: A, B. {texto}`; sequência → `Respostas:\n1. {pergunta}: {rótulos/texto}\n2. …` (rótulos, não ids).

## Fio (wire, host)

| O quê | Forma |
| --- | --- |
| Cartão no fio | mensagem da persona com a frase simples + `[[persona-ask:{json}]]` → `MessageView.personaAsk?: PersonaAskCardView` = `{askId, ticketId, personaId, personaName, question, options?, multiple, step?}`. `askId` = id da Attention. Uma mensagem por pergunta aberta (na sequência, a próxima aparece quando a anterior é respondida). Frase simples (Muse): “{persona} pergunta: {pergunta}” e, numa linha nova, “Opções: A · B · C”, sem parênteses. `cancelled` aparece como a linha “Esta pergunta não precisa mais de resposta.”. |
| Estado vivo | `listPersonaAsks({workspaceId, projectId, ticketId?})` → `PersonaAskView[]` = cartão + `status: 'open' \| 'answered' \| 'cancelled'`, `answer?: {optionIds, text, attachmentIds, answeredAt}`. `cancelled` = o Ticket terminou (parado, descartado, concluído) sem resposta. |
| Fila “Precisa de você” | `AttentionEventView` (kind `question`) ganha `ask?: {options?, multiple, step?}` além de `question`. |
| Responder | `answerAttention({workspaceId, projectId, ticketId, text?, optionIds?, attachmentIds?})` (o do IV-10, ver `attention-answer.md`). Retorno `true` = o Ticket não espera mais a pessoa (o worker acorda); `false` = a sequência avançou e **a próxima pergunta já está aberta**. Mensagem na conversa: o texto, ou os rótulos escolhidos separados por vírgula se não houver texto. Uma resposta por pergunta (`conflict` na repetição). |

Erros (pt-BR, antes de gravar): `invalid-payload` “Essa opção não existe nesta pergunta.” · “Escolha só uma opção.” · “Escreva a resposta, escolha uma opção ou anexe um arquivo.”; `conflict` “Essa pergunta já foi respondida.”.

## A ferramenta da persona (`persona_ask`, já existe; ganha campos)

`persona_ask({ question, options?: [{id?, label}], multiple?, questions?: [{question, options?, multiple?}] })`
- `question` sozinho = como hoje. `questions` (1..5) = uma **sequência** (a Muse pede PREFERIR até 3; 4–5 só quando necessário, porque “n de m” fica longo); passar `question` e `questions` juntos é recusado.
- `assumption` (sozinho, sem perguntas): “sigo sem perguntar e suponho isto” — o fio mostra a linha honesta **“{persona} seguiu sem a sua resposta: {suposição em 1 linha}”** para a pessoa corrigir; nunca conta no orçamento. É o caminho quando o orçamento recusa a pergunta.
- `id` ausente: o host gera a partir do rótulo (`sim`, `nao`, `opcao-1`…). Rótulos repetidos, menos de 2 ou mais de 8 opções, pergunta vazia ou > 500: a ferramenta devolve ao modelo uma frase de erro e **nada é aberto**.
- Depois de aberta, o worker para (`waiting`) e **volta com a resposta**; a ferramenta não bloqueia o turno.

### Orçamento de atenção (resumo, nunca rajada)
- 1 pergunta aberta por Ticket; sequência de até 5; a descrição da ferramenta manda **agrupar** dúvidas relacionadas numa sequência em vez de perguntar uma a uma.
- Teto por persona por dia de **interrupções** (uma sequência = 1): padrão **4**. Acima disso a ferramenta devolve ao modelo: “Você já fez as perguntas de hoje. Siga com a melhor suposição e registre no relatório.” e nada é aberto (ela **não fica presa**).
- Pergunta igual (mesmo texto normalizado) à já feita no Ticket nas últimas 24 h é recusada (“Você já perguntou isso.”).
- Uma pergunta sai de um trabalho que a pessoa pediu (ou de uma iniciativa já permitida), então ela **não** espera a janela de silêncio nem a pausa da equipe: nesses casos a persona nem está trabalhando.

## Como a pergunta chega do worker (fase 3) — âncoras no código (conferidas 04/11 20:55)
O que o host faz HOJE com uma pergunta de worker: `orchestration.ts` (~l. 2067) lê `takeQuestion(runner)` = a pergunta em TEXTO que o runner guardou (`lastRunnerQuestion`, de `persona-runners`) e chama `engine.report(ticket.id, { ...report, state: 'waiting', summary, question })` — o spread de `report` (o último relato do runner, `lastRunnerReport`) já passaria um campo `ask` ao engine. (`parseReportPayload`/`personaReportFromModel` do protocolo de texto NÃO são chamados pelo host em produção: só testes.) Então a fase 3 é:
1. **Runners** (`persona-runners`, avisar o Rivet): `NormalizedReport.ask?: AskQuestionInput[]`; a ferramenta `persona_ask` (`mcp/persona-tools.ts`) aceita `questions`/`options`/`multiple`/`assumption`, valida com `normalizeAskQuestions` (frase de erro de volta ao modelo) e o runner guarda o `ask` (`lastRunnerAsk`). O hook `hooks.ask` deixa de ser `void`: devolve a frase para o modelo (aceita, ou o motivo da recusa).
2. **Host** (`orchestration.ts`, ~l. 2067): `const structured = this.takeAsk(runner)`; passa `ask` ao `engine.report`; antes disso o orçamento (`PersonaAsks`) decide: acima do teto ou repetida, o `ask` é descartado e a pergunta segue como simples (o turno já terminou, então aqui o orçamento só impede o CARTÃO); depois do relato, `personaAsks.openCard` posta o cartão. Com a ferramenta MCP viva (GAP-0) a recusa acontece NA chamada.
3. **Prova:** worker de teste que pergunta com opções → cartão no fio → responder com chips → o worker acorda com o texto das escolhas (o `structured-ask.spec` do host já cobre o meio; falta a ponta do runner).

## Fora deste contrato
- Onboarding conversacional (A2, P1 depois do instalador) e a rota de escape “Ver modelos de time…”: UI/Muse.
- Figurinhas (D), mandato no cabeçalho (B), placeholder do composer (C), vazio da barra (E): outros itens da colheita.

## Prova (quando pronto)
Engine: `persona-engine/tests/structured-ask.spec.ts`. Host: `persona-host/tests/structured-ask.spec.ts` (cartão, escolha única e múltipla, sequência 1→2→3 com um único acordar, texto livre e arquivo junto, somente leitura depois, cancelado, orçamento, ACL). Runners: `persona-runners/tests/persona-mcp.spec.ts` (+ validação da ferramenta).

# W3 só para resposta curta (OPT-11, Tally, 05/11): o portão está pronto e DESLIGADO; falta a prova real

**Pedido do Atlas (05/11, via Keel):** reavaliar a W3 (o relato curto do worker, `WORKER_LEAN_REPORT_RULE`: "Resultado:" e "Bloqueio:", no máximo 100 palavras) **apenas para tarefa simples de resposta curta**; handoff e revisão mantêm o relato/bilhete inteiro. A W3 inteira fica adiada desde o D-080 (inconclusiva, n = 1, ~0,3 ponto de impacto sobre a base de 41 mil tokens). Hoje a base é 3 mil (answer-only) e a saída pesa: na rodada real de 01:40 a saída da Persona foi 828–908 tokens contra 3.340 de entrada, e a saída custa vários múltiplos da entrada. Por isso vale reavaliar, mas só onde cortar não estraga a entrega.

## O portão (feito, a seco)
`persona-engine/src/short-answer.ts`: `classifyShortAnswer(text, { images })` → `{ short, why }`. **Conservador de propósito:** na dúvida o relato fica inteiro (uma tarefa curta mantida cheia custa algumas centenas de tokens; um entregável cortado em 100 palavras é uma entrega falha). Só é curta a tarefa que:
- é pergunta (termina em "?") ou começa por verbo de consulta/conferência/cálculo (qual, quanto, quando, onde, quem, calcule, some, converta, confira, verifique, diga, informe, indique, responda, existe, há);
- tem no máximo **240 caracteres**, **uma linha** e **duas frases**;
- **não pede um entregável**: relatório, documento, plano, texto, post, tabela, lista, código, resumo, pesquisa, comparação, revisão, explicação, receita, sugestão, "o melhor", tradução… (por radical: "relatórios", "escrever", "montar" também);
- não tem imagem.
**Nunca é curta:** a primeira entrega, qualquer prompt que já é prompt de worker, pedido de revisão e bilhete de passagem (blocos `<bilhete>`/`<entrega>`), nem nada longo ou de várias linhas.

## A chave (desligada)
`prefixOwnerNorms(text, persona, { leanShortAnswers: true })` (`persona-runners/src/proactivity/owner-prompt.ts`): a regra do relato curto entra **uma vez** só quando a tarefa passa no portão. `leanReport: true` (todas as tarefas) continua como era. **Padrão: nenhuma das duas.** Falta ligar a opção de sessão `OarSessionOptions.leanShortAnswers` (`oar/session.ts`, Rivet; 2 linhas: passar a opção ao `prefixOwnerNorms`) e uma chave do host; nada disso liga sozinho.

## Provas a seco
`persona-engine/tests/short-answer.spec.ts` (12 curtas, 20 que mantêm o relato cheio por motivo, limite exato em 240, imagem, primeira entrega/revisão/bilhete, as linhas de trabalho dos testes do host) e `persona-runners/tests/owner-prompt-wrap.spec.ts` (+3: só a curta recebe a regra, uma vez; desligado por padrão; `leanReport` antigo intacto).

## O que NÃO está provado (e por isso a chave fica desligada)
Que o modelo, com a regra, responda certo e mais curto numa tarefa curta. O que existe é o portão, não o efeito. Os números de saída que temos são de uma tarefa LONGA (a do pareado), não de resposta curta; **uma resposta curta pode já sair curta sem a regra**, e então a W3 não economiza nada.

## Rodada real proposta (OPT-11) — só com OK do Atlas; NÃO rodada
- **O quê:** 6 tarefas curtas autocontidas (conta, conferência, consulta no texto da própria tarefa), cada uma com 1–2 "agulhas" (o valor certo) × {sem a regra, com a regra} × n = 2 → **24 chamadas haiku**, teto **30**, `answer-only` provado antes, trava `real`, `PERSONA_REAL_TURN_CAP=30`, ledger absoluto fresco, env limpo, cota oficial antes/depois. O prompt do worker é o atual (A+B); a única diferença entre os braços é a regra.
- **Regra a registrar ANTES do dado:** GO se, ao mesmo tempo, (a) a mediana de saída com a regra ≤ **0,65×** a sem a regra; (b) **todas** as agulhas presentes nos dois braços (qualidade 100% igual); (c) o braço com a regra tem "Resultado:" em todas. **NÃO-GO** se (b) falhar em qualquer chamada. **Nada a ganhar** (sem decisão de ligar) se a mediana de saída SEM a regra for < 300 tokens: já é curta.
- **Custo:** ≈ 24 × (3,4 mil de entrada + ≈ 0,5 mil de saída) ≈ 94 mil tokens; menos de 1 ponto da semana (invisível a 1%); referência de lista (só relatório técnico) ≈ US$ 0,15. Uma única rodada, sem repetição.

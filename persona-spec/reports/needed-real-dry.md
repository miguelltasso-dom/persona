# OPT-10b — ensaio SECO do modo `needed` com o conector de TESTE (sem CLI, sem login, sem modelo)

Tarefa única, só leitura, num conector de teste local de 30 ferramentas e respostas sintéticas (nada da conta de ninguém); teto 3 chamadas; piso 31414 tokens; tolerância 1.15× (piso + o que o conector acrescenta, MEDIDO pelo pré-voo).
Guardas do modo real: `PERSONA_NEEDED_REAL=1`, `PERSONA_REAL_E2E=1`, trava `real`, `PERSONA_CLI_ENV=needed`, `PERSONA_REAL_TURN_CAP` ≤ 3, `PERSONA_REAL_TURN_LEDGER` absoluto e FRESCO.

| caso sintético | veredito | motivo |
|---|---|---|
| tudo certo (sintético) | pass | os sete itens do critério passaram |
| o modelo tentou enviar e o portão recusou (sintético) | pass | os sete itens do critério passaram |
| a requisição trouxe a conta toda (sintético, 308.902) | fail | não passou: input-bounded |
| o resultado da ferramenta não foi observável (sintético) | not-measurable | sem evidência para decidir: answer-uses-result |

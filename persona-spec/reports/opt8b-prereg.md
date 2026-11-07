# OPT-8b — pré-registro da 2ª rodada pareada (escrito ANTES de qualquer chamada)

Registrado por Tally em 04/11 (relógio real), por autorização do Atlas: "uma 2ª rodada pareada (OPT-8b), só DEPOIS do V1-P0-5 real do Probe e do D-079 do Tally. n = 3 por célula, haiku, teto 40 chamadas no total, mesmo limitador e trava `real`. Regra pré-registrada ANTES de rodar: mediana de 3, paridade se dentro de ±10%. Se a variância ainda impedir uma conclusão, registrar 'não mensurável com a CLI exploratória' e propor a medição pelo histórico real em vez de A/B."

Este arquivo não pode ser editado depois da primeira chamada da rodada; qualquer mudança vira uma seção nova com data e motivo, e a regra original continua valendo para o veredito.

## O que está sendo decidido

Só o `pair-parity` do gate D-068: a execução de uma tarefa pelo caminho da Persona gasta o mesmo que a chamada direta à CLI do mesmo texto? (A rodada 1 foi inconclusiva: n = 1 por célula, e o agente variou de ≈ 90 mil a ≈ 306 mil tokens de entrada entre chamadas parecidas.)

## Desenho (fixo)

- Claude **haiku** nos dois braços, o mesmo texto de pedido da rodada 1 ("texto de sempre"), diretório vazio, `personaId` único por chamada, `dispose` garantido.
- Células, **n = 3 cada**: `direta` (fria, quente) e `execução da Persona` (fria, quente) = 4 células × 3 = **12 chamadas**; mais a `triagem` quente × 3 = **3** (para o valor de chamada que o `skipTriage` economiza). **Total planejado 15; teto duro 40** (nunca acima, contando as de requisição única que eu precisar repetir para a base). O braço `persona_lean` (W3) **não entra**: a W3 está adiada por decisão (D-080 b).
- Mesmo limitador do Rivet ligado (`PERSONA_REAL_TURN_CAP=40`, ledger absoluto fora do home do app), mesma trava `real` (1 vaga, FIFO). O guarda `assertRealRunGuards` hoje recusa teto > 20: eu o subo para 40 **só nesta rodada**, por esta autorização, com teste.
- Só roda depois do V1-P0-5 real do Probe e do meu D-079 fechado.

## Métrica e regra (fixas)

- **Métrica primária:** `inputTokens` TOTAL da sessão da CLI, como o adaptador reporta (já inclui cache lido e gravado), mediana das 3 chamadas de cada célula. Secundária: custo equivalente a preço de lista (cache lido ×0,1, gravado ×1,25) e `outputTokens`.
- **Razão de paridade** = mediana(execução da Persona) ÷ mediana(direta), calculada **separadamente no frio e no quente**.
- **Há paridade** se as DUAS razões (fria e quente) estão em **[0,90; 1,10]** na métrica primária **e** a dispersão de cada célula envolvida, (máx − mín) ÷ mediana, é **≤ 0,50**, **e** o critério de pronto (qualidade) passa nas 3 de cada célula.
- **Não há paridade** se as duas razões estão fora de [0,90; 1,10] no mesmo sentido, com a mesma condição de dispersão ≤ 0,50.
- **Não mensurável com a CLI exploratória** se qualquer célula primária tem dispersão **> 0,50**, ou se as razões ficam em lados diferentes de [0,90; 1,10] (uma dentro, outra fora). Nesse caso **não declaro paridade nem diferença** e proponho medir pelo histórico real de turnos da própria pessoa (ledger `foldUsagePanel` por turno, mesma tarefa em dias diferentes) em vez de A/B.
- Nada é descartado depois de ver o resultado: se uma chamada falhar por motivo da CLI (limite, rede), ela consome uma das 40 e é substituída uma única vez; as duas ficam no cru.
- Qualquer coisa fora da regra acima (outra métrica, outra janela, remover uma chamada "estranha") **não** muda o veredito; vai como observação.

## Saída

`reports/pair-real-b.md` e `.json` com os contadores BRUTOS do vendor de cada chamada, a tabela célula × (mediana, mín, máx, dispersão), as duas razões e o veredito segundo esta regra, mais o placar D-068 atualizado (`pair-parity` só deixa de ser `blocked` se houver paridade pela regra).

---

## Adendo 1 — registrado em 04/11 20:20 (relógio real), ANTES de qualquer chamada da OPT-8b. Origem: D-085 do Atlas

A regra original acima **não muda** (mediana de 3, ±10%, dispersão ≤ 0,5, "não mensurável" quando a dispersão impede). O adendo fixa **em que ambiente** a rodada acontece, porque a medição seca de 04/11 mostrou que o ambiente pessoal da pessoa domina o tamanho de uma chamada sem ferramentas (377 321 tokens de definições MCP contra 1 608 com nada carregado, `reports/iso-dry-product.json`) e uma razão entre braços com ambientes diferentes mediria o isolamento, não o desenho da Persona.

1. **Os dois braços rodam com o MESMO isolamento:** modo `answer-only` (Claude, chamadas sem ferramentas: o mesmo `--strict-mcp-config --setting-sources project --disable-slash-commands` e as mesmas três chaves de ambiente) nos braços `direta` e `execução da Persona`. Ambos passam pelo mesmo `resolveRunner`, então o plano vale igual; o harness define `PERSONA_CLI_ENV=answer-only` para a rodada inteira.
2. **O modo é anotado no cru** de cada chamada (`envMode` do `RunnerUsage`), junto do modo pedido e do modo efetivo (o efetivo pode cair para `native` se a regressão do `iso-dry` da versão da CLI falhar); o veredito só vale se as 15 chamadas tiverem o mesmo modo efetivo `answer-only`. Se alguma cair para `native`, a rodada é marcada **inválida para o veredito** e relatada como observação (mesmo critério para todas).
3. **O ganho do isolamento contra a CLI nativa NÃO entra nesta razão.** Já está medido a seco (−99,6% de contexto de abertura nas chamadas sem ferramentas) e vai a um relatório separado; a pareada real do isolamento nativo contra isolado é o experimento OPT-10b, com o OK do Atlas.
4. **Teto inalterado:** 40 chamadas no total, mesmo limitador do Rivet (`PERSONA_REAL_TURN_CAP=40`, livro absoluto), mesma trava `real`, depois da rodada única do Probe. Plano de 15 chamadas. O braço `persona_lean` segue fora (W3 adiada).
5. **Contadores:** `inputTokens` total (métrica primária, como na regra), e **também** o laço principal (`mainLoopInputTokens`) e o resumo do ambiente (`environment`, só contagens) por chamada, do ISO-4, sem custo extra de chamada.

---

## Adendo 2 — registrado em 04/11 23:55 (relógio real), ANTES de qualquer chamada da OPT-8b. Origem: transformar a regra em código com teste

Nenhuma chamada da OPT-8b foi feita. A regra original e o Adendo 1 **não mudam**. Este adendo só fixa, antes dos dados, como ler os casos que o texto original deixava em aberto, para o veredito sair de uma função e não de uma decisão depois de ver o resultado. A regra está em `persona-engine/src/bench/pair-real-b.ts` (`evaluatePairRealB`) e trancada em `tests/pair-real-b.spec.ts` (21 testes, escritos antes de existir qualquer dado).

1. **Razões fora da faixa em sentidos opostos** (uma acima de 1,10 e a outra abaixo de 0,90): **não mensurável**. "Não há paridade" exige o mesmo sentido.
2. **Razões dentro da faixa e dispersão ≤ 0,50, mas o critério de pronto (qualidade) falhou em alguma chamada** das quatro células primárias: **não mensurável**, e não "paridade". A comparação deixa de ser entre trabalhos equivalentes.
3. **Célula primária com menos de 3 chamadas válidas** (a falha da CLI foi substituída uma vez e a substituta também falhou, ou faltou chamada): **não mensurável**. Nada é preenchido por estimativa.
4. **A célula `triagem quente`** não entra na razão nem no veredito: é só o valor de chamada que o `skipTriage` economiza, relatado como número.
5. **Teto:** mais de 40 chamadas feitas, contando toda tentativa (a que falhou e a substituta), torna a rodada **inválida**. O guarda (`assertPairRealBGuards`) recusa `PERSONA_REAL_TURN_CAP` acima de 40 e exige `PERSONA_CLI_ENV=answer-only`, a trava `real`, o limitador e o ledger absoluto.
6. **Mediana, não média:** a mediana das 3 chamadas de cada célula (uma chamada fora da curva não a move, mas aumenta a dispersão e pode tornar a célula não mensurável).
7. **Validade (Adendo 1, item 2):** só vale com TODAS as chamadas com modo efetivo `answer-only`; qualquer outro valor, ou modo não reportado, torna a rodada inválida para o veredito (fica como observação).
8. O plano de 15 chamadas (`buildPairRealBPlan`): por repetição (3 vezes) o par frio (direta, execução da Persona) e o trio quente (direta, execução da Persona, triagem); sem o braço `persona_lean`.

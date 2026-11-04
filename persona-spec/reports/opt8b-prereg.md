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

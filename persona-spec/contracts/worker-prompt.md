# Prompt do worker: o texto redundante saiu (OPT-10, Tally, 05/11)

Medido a seco, zero modelo. Calibragem: no pareado real do OPT-8b a Persona custou **+464 tokens** de entrada sobre o texto direto, por **+1.152 caracteres** = **2,483 caracteres por token do fornecedor**. O estimador do ledger (4 caracteres por token) é a segunda leitura.

## O que mudou
| | Antes | Depois | Corte |
|---|---|---|---|
| **A** texto repetido (Nina, com as instruções) | 1.210 caracteres | 987 | −223 car. = **−89 tokens** do fornecedor (−56 pelo estimador) |
| **B** chamada SEM ferramentas (`tools:'none'`) | 987 | 838 | −149 car. = **−60 tokens** (total A+B **−149**) |
| **Primeira entrega real** (o que o runner envia na rota answer-only) | 3.299 car. | 2.240 | −1.059 car. = **−427 tokens** (−32%): o prompt do worker ia **duas vezes** |
| Pareado D-068 (entrada, braço Persona) | 3.487 (razão 1,154) | ≈ 3.338 (razão **1,104**) | banda pede ≤ 3.325 (1,10): fora por 13 tokens; C (cortar os exemplos de evidência) **NÃO** foi feito, decisão do Keel |

## As três coisas
1. **Uma redação só das Normas de dono.** Existiam 3 cópias (template, `runners/owner-prompt`, bench) e a mesma regra ("não devolva", "posso fazer X se você quiser") dita 3 vezes em 5 marcadores. Agora `OWNER_NORMS` (`persona-engine/src/prompts/templates.ts`, exportada) é a fonte; runners e bench a reusam. O dedupe do OPT-4 continua: o host põe as normas na política e o template não repete.
2. **Variante sem ferramentas** (`composePrompt({ part: 'worker', tools: 'none' })`): tira "com as ferramentas da Persona quando disponíveis" e a frase "Antes de repetir uma operação externa, confira…", inertes quando o turno não oferece ferramenta. A regra "só texto" e as cinco normas ficam. `composeTurnPrompt` passa `'none'` quando `tools` é vazio (a rota answer-only/primeira entrega); `executorPrompt` e `prefixOwnerNorms` aceitam `tools: 'none'`. **Na dúvida, texto completo**: só um `'none'` explícito remove. Chamadas COM ferramentas (HT-0, opinião, contratação) mantêm o texto inteiro.
3. **`prefixOwnerNorms` idempotente.** A rota answer-only já entrega um prompt de worker (`firstDeliveryExecutionPrompt` compõe o template) e a sessão do runner (`oar/session.ts`, papel worker) o embrulhava em OUTRO: template e normas duas vezes. Agora um texto que já contém `WORKER_PROMPT_MARK` ("Você executa a Tarefa autorizada.") não é embrulhado de novo; a regra do relato curto (W3), se pedida, ainda entra uma vez.

## Regras que continuam (inventário testado, 11)
Escopo da autorização · relatar progresso/bloqueio/resultado com as ferramentas da Persona quando houver · não falar no canal · só resposta em texto: sem ferramentas, arquivos, comandos, registros, diretório ou histórico, resultado e evidência no texto final (com o contexto fornecido) · antes de repetir operação externa, conferir diretório e histórico · terminar o que o mandato pede sem devolver · verificar o critério de aceite · reportar com evidência · próximo passo como proposta estruturada · nunca encerrar com "posso fazer X se você quiser" quando X está no mandato (checado também em tempo de execução por `laziness.ts`). O bilhete e a entrega chegam ao worker como DADO dentro da atribuição, não pelo template (Forge).

## Provas
`persona-engine/tests/worker-prompt-opt10.spec.ts` (texto de antes CONGELADO, corte medido, inventário das regras, variante sem ferramentas, bloco fixo para o cache) · `persona-runners/tests/owner-prompt-wrap.spec.ts` (a rota answer-only não leva o template duas vezes; o texto só-atribuição leva um). Scripts de leitura: `persona-engine/scripts/worker-prompt-dump.ts` e `first-delivery-prompt-dump.ts`.

## Medido na CLI real (01:40, a única rodada autorizada)
Pareado de 15 chamadas haiku, teto 40, regra pré-registrada: entrada da Persona **3.340** (previsto 3.338) contra 3.022 da direta, razão **1,105** (antes 1,153), banda ≤ 1,10: **sem paridade por 0,005**; critério de pronto 3/3 em todas as células; saída medida mas não atribuída ao corte (n = 3). Semana 70% → 70%. Ver `reports/tally.md` (01:40).

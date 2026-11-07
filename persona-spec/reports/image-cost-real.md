# Custo REAL de uma imagem — 2 chamadas reais no haiku (04/11 22:45, Tally)

Autorizado pelo Atlas (04/11 22:40) com teto de **2 chamadas** e nenhuma repetição sem novo OK. Brutos: `image-cost-real.json` (contadores do vendor por chamada, sem conteúdo além da resposta de uma frase). Harness: `persona-runners/scripts/image-cost-real.ts`, validado ANTES contra um endpoint falso (zero gasto) e com `--preflight` (guardas + prova do isolamento, sem chamada de modelo).

## Como foi feito

- Mesmo caminho do produto: `resolveRunner` (a sessão OAR do host), Claude **haiku** (`claude-haiku-5-5`), CLI 2.1.318, `purpose: talk`, `permissionMode: deny` (**sem ferramenta, sem conector**), modo `answer-only` PROVADO para a versão antes de qualquer chamada, diretório vazio, uma persona por chamada, `dispose` garantido.
- **Mesmo texto** nas duas ("Descreva em uma frase curta o que aparece na imagem anexa. Se não houver imagem, diga isso em uma frase."): a diferença entre as chamadas é a imagem e mais nada. Chamada 1 SEM imagem; chamada 2 COM um PNG **1500×1000** (6.725 bytes: faixa azul-clara em cima, verde embaixo).
- Guardas: trava `real`, limitador `PERSONA_REAL_TURN_CAP=2` com ledger absoluto e **fresco**, `PERSONA_REAL_E2E=1`, env limpo. O ledger fechou com exatamente **2** turnos iniciados.

## Números medidos (contadores do vendor, laço principal = total nas duas)

| | sem imagem | com imagem | diferença |
|---|---|---|---|
| **entrada total** | **3.031** | **5.049** | **+2.018** |
| cache lido | 2.319 | 2.319 | 0 |
| cache gravado | 710 | 2.728 | +2.018 |
| saída | 38 | 53 | +15 (a resposta que descreve a imagem) |
| tempo | 18,4 s (inclui subir a CLI) | 7,3 s | |
| modo do ambiente | `answer-only` | `answer-only` | mesmo modo efetivo |
| ambiente | 0 ferramentas, 0 MCP, 0 skills, 0 comandos, 4 plugins | idem | |

- **Uma imagem 1500×1000 = 2.018 tokens de entrada.** A regra pública (largura × altura ÷ 750 = 2.000) acerta com +0,9%. **A minha estimativa anterior estava ERRADA para esse tamanho:** eu aplicava também um corte de ~1,15 megapixel e um teto de ~1.600 tokens e previa 1.381–1.600. O corte NÃO acontece aos 1,5 MP (só vale o limite de 1568 px no lado maior). Corrigido no código (abaixo).
- **A imagem entrou como ESCRITA de cache** (o cache gravado subiu exatamente os mesmos 2.018): ela é cobrada a 1,25× o preço de entrada nessa chamada, não a 1×. Nas chamadas seguintes da MESMA sessão ela vem do cache (0,1×).
- **A base de uma chamada de conversa em `answer-only` é de ~3 mil tokens** (3.031 com o texto): contra os ~31 mil de uma tarefa com ferramentas e os ~377 mil da CLI nativa desta máquina (`reports/iso-dry-product.json`). A imagem sozinha mais que **dobra** essa chamada barata (3.031 → 5.049, +67%).
- **A persona viu a imagem:** "Uma faixa azul-clara ocupa a parte superior da imagem e uma faixa verde ocupa a parte inferior, sem outros elementos." (correto). Sem a imagem, a persona disse que não havia imagem (não inventou).

## O que muda no produto

- `image-tokens.ts`: a regra agora é a medida (só o limite de 1568 px; sem corte de megapixel nem teto de 1.600), calibrada pela medição real (fator 2.018/2.000), teto de uma imagem ≈ 3.300 tokens (1568×1568). Marcada `calibrated` com a ressalva "1 medição, haiku, CLI 2.1.318, PNG 1500×1000".
- `opinion-budget.ts`: a imagem é cobrada a 1,25× (escrita de cache) e a rodada diz `imagens.origin: 'calibrated'` e a base; o resto continua `estimate`.
- `estimateAsk`: aceita `imagens` (opcional) e inclui as imagens no pedido, com a mesma base medida.
- Custo equivalente a preço de lista (haiku, entrada US$ 1/Mtok): +2.018 tokens × 1,25 = **≈ US$ 0,0025 por imagem na primeira chamada** (≈ US$ 0,0002 nas seguintes, do cache).

## Limites (honestidade)

Uma única medição, um tamanho, um modelo (haiku), uma versão da CLI e um PNG de cor lisa em faixas: o número vale como referência calibrada, não como lei. Outras proporções seguem a regra do vendor (w×h÷750, com o limite do lado maior) escalada pelo fator medido; JPEG, imagens grandes demais (reduzidas pela CLI) e outros modelos (sonnet/opus) não foram medidos. Nenhuma repetição foi feita (teto 2).

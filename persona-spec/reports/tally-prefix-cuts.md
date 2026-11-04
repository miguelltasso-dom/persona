# Lista pronta: cortes do prefixo do `system` (Tally, 04/11) — NÃO aplicados

Pedido do Atlas (13:32): "deixe a lista pronta e decida com os números da rodada real: só corta o que não derrubar a nota de qualidade." No dia espalhado (host de agora, 9 chamadas, 6281 tokens) a camada `system` é ≈ 51% da entrada. Tamanhos medidos com `estimateTokens` (4 caracteres ≈ 1 token); "vezes" = quantas chamadas do dia carregam o trecho.

| # | corte | onde | tokens cada | vezes no dia | economia | % do dia | risco |
|---|---|---|---:|---:|---:|---:|---|
| C1 | `capabilities` do talk repete regras que o template `talk` já diz ("não mencione ferramentas, shell…", "nunca ecoe…", "pedido simples responde direto") | `persona-host/src/orchestration.ts` `talkLayers` (string `capabilities`) | 59 | 4 | 236 | 3,8% | médio: é o texto que impede eco/placeholder; o `leanChannelReply` e o `refuseHesitantOffer` pegam eco depois, mas não o "sem placeholders" |
| C2 | linha "Normas de dono" da política de voz no **chat** (não vale para worker) | `persona-engine/src/prompts/voice.ts` `composeVoicePolicy` (`ownerNorms`) | 33 | 4 | 132 | 2,1% | médio: reduz o "posso fazer se quiser"; `refuseHesitantOffer` cobre o efeito visível |
| C3 | 4 linhas repetidas entre `coordinator`, `dispatch` e `subscriptions` (injeção, escopo maior que o mandato, ambiguidade, mensagem em assunto seguido) | `persona-engine/src/prompts/templates.ts` (`dispatch`, `subscriptions`) | 53 | 2 (triagens) | 106 | 1,7% | alto: texto afinado do protótipo Super-agent; só sai se a triagem não mudar de decisão na rodada real |
| | **total** | | | | **474** | **7,5%** | |

Leitura: somados, ≈ 7,5% dos tokens do dia espalhado e menos de 5% do custo (são tokens de entrada em cache write). Nenhum chega perto de mover a meta de −40%.

## Como decidir (sem inventar)

1. Só depois da rodada pareada real (`scripts/pair-real.ts`, trava `real`) e da execução real do Probe (V1-P0-5), que dão a razão tokenizador e a base do vendor.
2. Para cada corte, uma variante do prompt em `src/bench/token-faithful.ts` e a mesma sequência de chamadas reais (haiku) com e sem o trecho; compara-se a **nota de pronto** (agulhas na resposta) e o eco/placeholder do chat com `scoreTalkReply` (`bench/talk-eval.ts`).
3. Corta o que a nota não derrubar em nenhuma tarefa da amostra; o gate `gate-tokens.ts` já protege o resultado contra regressão e contra queda de qualidade.
4. Mudança em texto de prompt do Forge (`voice.ts`, `templates.ts`) só com o OK dele; em `orchestration.ts` só com o Anvil livre.

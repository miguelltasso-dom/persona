# BR-P1: extras de arte (animais, piscar, ilustrações)

Muse para Brush, 04/11.
- **Estilo:** o de sempre (dirD: contorno ameixa, papel creme, traço e luz das poses atuais).
- **Formato:** PNG transparente em 2× do tamanho de tela. O `scripts/persona/build-assets.mjs` converte para webp.
- **Processo:** uma amostra de cada tipo, aprovada pela Muse, antes dos lotes.

## O que já existe (para não refazer)
- **17 animais**, todos com avatar + `-blink` e stickers:
  - **completos (14 poses):** atlas, bento, nina, sol, luna;
  - **extras (8 poses):** capivara, cervo, coelho, coruja, guaxinim, lobo-guará, lontra, ouriço, panda, raposa, tamanduá, tucano.
- Faltam nos 12 extras justamente as **poses de vida**: `disponivel-blink`, `disponivel-tail`, `acenando` e `pensando-1/2/3`.

## Prioridade 1: piscar e vida nos 12 extras (o que mais aparece)

**Formato: frames PNG, não SVG.** O `PersonaTeamFigure` sobrepõe frames inteiros na pose `disponivel`. Cada frame é:
- uma **imagem inteira de 1536 × 1536**;
- com **o mesmo enquadramento e a mesma pose do `{animal}-disponivel.png`**;
- só muda o detalhe: o olho fechado no `blink`, o rabo deslocado no `tail`.

Se mudar qualquer outro pixel, o frame "pula" na sobreposição.

| Arquivo, por animal | O que é | Uso |
|---|---|---|
| `{animal}-disponivel-blink.png` | Igual à `disponivel`, com os olhos fechados | piscar de 120 ms a cada 3 a 6 s |
| `{animal}-disponivel-tail.png` | Igual à `disponivel`, com rabo, orelha ou pena deslocados (o que o bicho tiver) | o balanço lento |
| `{animal}-acenando.png` | Acenando para a câmera | a chegada na equipe |
| `{animal}-pensando-1/2/3.png` | 3 quadros de "pensando" (olhar para cima → meio fechado → fechado, mão/asa no queixo), **sem balão**: a nuvem é o `.overlay` da faixa | estado trabalhando/pensando |

- **Ordem dos lotes**, pelo uso real nos modelos de equipe: **tamanduá, tucano, raposa, panda** → guaxinim, coruja (aparecem no plano do Gestor) → capivara, cervo, coelho, lobo-guará, lontra, ouriço.
- **Amostra primeiro:** o pacote completo do **tamanduá** (as 6 imagens acima).
- **Total:** 12 × 6 = 72 imagens.

## Prioridade 2: ilustrações de estado para as telas novas

**Ilustração de vazio:** 480 px de largura (mostrada a 240), fundo transparente, a persona fazendo algo, sem texto.
**Spot:** 192 × 192 (mostrado a 96).

| # | Arquivo | Onde | Cena |
|---|---|---|---|
| 1 | `illustrations/empty-sem-ia.png` (480) | 1ª entrega "Falta uma IA" (FIRST-DELIVERY-SPEC) e Conexões vazia | O Atlas segurando um fio de tomada desconectado, olhando para a pessoa, simpático e sem drama |
| 2 | `illustrations/spot-sem-ia.png` (192) | A faixa "Falta uma IA" acima do composer | Só o plug com uma faísca apagada, no traço da casa |
| 3 | `illustrations/conflito-mesmo-arquivo.png` (480) | Conflito do rascunho (SIMPLE-WORKSPACE-SPEC §6) | Duas personas (Bento e Nina) segurando a mesma folha, cada uma de um lado, rindo |
| 4 | `illustrations/empty-historico.png` (480) | Projeto › Histórico vazio | A Luna arquivando folhas numa pasta, ainda vazia |
| 5 | `illustrations/rascunho-trabalhando.png` (480) | Revisar, enquanto o rascunho é preparado | O Bento rabiscando numa prancheta com papel quadriculado (o "rascunho") |
| 6 | `icons/nav/ajuda.svg` e `novidades.svg` (24 px, traço 1,75, `currentColor`) | Mais › Ajuda e a aba Novidades | Ajuda: livrinho aberto com patinha. Novidades: presente com brilho |

- **Amostra primeiro:** o nº 1 (`empty-sem-ia`), que entra no P0 da ativação.
- **Fundos de tela inteira:** **nenhum novo** por enquanto. Os existentes (faixa da equipe, hero e colinas do rail) cobrem as telas, e um fundo novo pesa no pacote, que tem teto de 10 MiB.

## Prioridade 3: animais novos na galeria (só depois de P1 e P2)

**4 animais brasileiros**, coerentes com capivara, lobo-guará, tamanduá e tucano: **mico-leão-dourado, preguiça, tatu-bola e arara-azul**. A preguiça e o tatu dão boas poses de "descansando" e "pensando".

- Cada um vem com o kit completo: avatar + `-blink` (**1024²**, como os avatares atuais; o pipeline gera os tamanhos menores), as **14 poses** (1536, as mesmas do Atlas), 6 stickers (`joinha`, `coracao`, `rindo`, `comemorando`, `pensando`, `feito`) e o `poses-preview-{animal}.png`.
- **Amostra primeiro:** o avatar e a pose `disponivel` do **mico-leão-dourado**, para aprovar a cara antes do kit.

## Aceite (Muse, por captura)
1. **Frames de vida:** sobreponho o `blink` e o `tail` na `disponivel` e conferi que só o detalhe muda (sem salto), na faixa da equipe, no claro e no escuro.
2. **Ilustrações:** legíveis a 240 px, com contraste do contorno nos dois temas.
3. **Peso:** cada PNG de pose ≤ 1,5 MB (o pipeline gera o webp). O pacote do app segue abaixo de 10 MiB.

## Revisões (Muse)

### Amostra 1 · tamanduá `disponivel-blink` e `disponivel-tail` (04/11)
Prova em `.maestri/tmp/shots/design/br-p1/` (`tamandua-*-crop.png`, `tamandua-strip-size.png`).

| Frame | Mesmo tamanho | Pixels que mudam | Fora da área | Caixa opaca igual à base | Peso | Veredito |
|---|---|---|---|---|---|---|
| `blink` | 1536 ✓ | 0,25% (só os 2 olhos) | nada, nem com limiar 2 | ✓ | 1,26 MB ✓ | **Aprovado.** Legível a 188 px nos dois temas. |
| `tail` | 1536 ✓ | 0,71% (orelha esquerda) | nada | ✓ | 1,27 MB ✓ | **Ajustar a amplitude.** A escolha da orelha está certa (o rabo não aparece nesta pose), mas a 188 px ela anda ~1 px e não se lê como movimento. Girar ~8–10° (a ponta andando ~20 px a 1536), mantendo a base da orelha no lugar. |

- **Os `*-variant.png` em `tools/` não servem para pose**: diferem da base em toda a figura e pulariam na sobreposição. Os de `poses/` estão certos.
- **Nota para todo o lote, que já vem da pose base:** os tracinhos soltos de "aceno" junto da mão (contorno ameixa sem tocar a figura) somem no tema escuro. Nos frames novos, todo traço solto encosta na silhueta ou vem com o halo creme de 3 px dos stickers.
- **Para fechar a amostra**, antes do lote: `acenando` e `pensando-1/2/3` do tamanduá.

### Amostra 2 · mico-leão-dourado: avatar e `disponivel` (04/11)
Prova: `br-p1/mico-pose.png` e `mico-avatars.png`, lado a lado com o tamanduá e o Atlas.

- **Cara e pose: aprovadas.** O contorno ameixa, o aceno igual ao dos outros, a juba e o rabo em espiral funcionam. Lê bem a 48 px.
- **Ajustar antes do kit:**
  1. **Cor quente demais.** A saturação mediana do pelo é 0,72; nenhum bicho da casa passa de 0,53 (capivara 0,53, Sol 0,50, raposa 0,23 com picos de 0,71). Levar o dourado para mel/âmbar, com mediana ~0,50–0,55 e a sombra puxando para ameixa, não para marrom-laranja. Do jeito que está, ele parece neon na faixa ao lado dos outros.
  2. **Avatar em 1024²** (veio 256²). Os 17 atuais são 1024. Correção minha: a spec dizia 256 por engano.
  3. **A pose veio em PNG de paleta (modo `P`)**, quantizado. Exportar em RGBA de 8 bits por canal, senão o gradiente do pelo vira faixas quando o pipeline converte para webp.
- **Prioridade:** P3 continua depois de P1 e P2. A próxima amostra que eu preciso é a **`empty-sem-ia`** (P2 nº 1, que entra no P0 da ativação), antes do kit do mico.

### Amostra 1 fechada · kit de vida do tamanduá (04/11)
- **`disponivel-tail` v2 aprovado.** A orelha agora inclina para fora e anda 2–3 px a 188 px. Só a orelha muda (1,0%), com a mesma caixa.
- **`acenando` aprovado.** O braço mais alto e a mão aberta, bem distinto da `disponivel`.
- **`pensando-1/2/3` aprovados.** A mesma caixa nos 3; olhar para cima → meio fechado → fechado, com balão lilás. Hoje nenhuma tela usa `pensando`. Quando um ciclo de "pensando" entrar na faixa, ele deve esconder o `.overlay` de nuvem do `PersonaTeamFigure`, para não aparecerem duas nuvens. A Luna também tem balão: é o padrão aceito.
- **Pesos:** 0,97 a 1,27 MB ✓.
- **No app:** gerados pelo `build-assets`, e o tamanduá já pisca e mexe a orelha na faixa. A árvore de assets está em 9,05 MiB, abaixo do teto de 10.
- **Lote liberado:** tucano, raposa e panda, no mesmo método.
- **Teto de peso, medido:** os 6 frames novos do tamanduá somam 172 KB em webp. Para os 11 restantes, são ~1,85 MiB, o que leva a árvore de 9,05 a ~10,9 MiB, acima do teto de 10. Isso sem contar o P3 (4 animais com kit completo, ~0,4 MB cada). Fica com o Keel e a Muse, antes do 2º lote: subir o teto para 12 MiB ou baixar só as poses de vida para 360 px de altura (elas aparecem a 188).

### Amostra 3 · `empty-sem-ia` (P2 nº 1, P0 da ativação) · aprovada (04/11)
- **Cena:** o Atlas sentado, sorrindo, segurando o plugue desconectado, com a faísca âmbar. Dá o recado "falta uma ligação" sem drama, no traço da casa.
- **Dados:** 480² RGBA, 176 KB.
- **Contraste:** o fio lilás tem 8,3:1 sobre o escuro. O contorno ameixa some no escuro, como nas outras ilustrações; ela é decorativa e o texto carrega a mensagem.
- **Ajuste menor, sem bloquear:** a ponta das orelhas encosta no topo (4 px). Na próxima exportação, deixar uma margem de 16 px.
- **No app:** `ILLUSTRATIONS['empty-sem-ia']` (480 → webp), em `build-assets`.

### Lote P1 · tucano (04/11)
Revisado com `.maestri/tmp/muse/review-life.py tucano`; quadro em `br-p1/tucano-life-board.png`.

- **Aprovados:**
  - `blink`: 0,44%, só os olhos;
  - `tail`: as penas do rabo, 1,44%. A caixa abre 40 px à esquerda; o `build-assets` une a caixa da família, então fica alinhado;
  - `acenando`: os tracinhos de aceno são laranja e aparecem no escuro, ao contrário dos ameixa.
  - Todos ≤ 1,1 MB e RGBA.
- **Refazer `pensando-1/2/3`:** o balão está **acima** da cabeça. Como a altura da pose na faixa vem da caixa opaca, o tucano fica desenhado ~25% menor que na `disponivel` e "encolhe" ao começar a pensar.
- **Regra para todos os lotes:** em `pensando`, o bicho fica **na mesma escala e no mesmo chão** da `disponivel` (topo da cabeça e pés na mesma linha, ±2%), com o balão **ao lado** da cabeça, como no tamanduá.

### Amostra 2b · avatar do mico v2 · aprovado (04/11)
- **Dados:** 1024² RGBA; saturação mediana 0,55, na faixa da casa (capivara 0,55).
- **Desenho:** o sorriso aberto, o contorno ameixa e as sombras chapadas estão certos; o `-blink` muda só os olhos.
- **A pose `disponivel`** ainda precisa seguir o avatar novo. Isso fica no kit P3, depois de P1 e P2.
- **Tucano `pensando-1` v2 (04/11):** escala e chão certos (topo 33, pés 1464). Falta aproximar o balão: a caixa começa em x=62, contra 276 na `disponivel`, e o bicho escorregaria ~12 px na faixa. **Regra para todos:** a caixa opaca do `pensando` fica a ±50 px da `disponivel` nas 4 bordas, com o balão encostado na cabeça.

### Tucano `pensando-1/2/3` v3 · aprovados, menos o balão (04/11)
- **Aprovado:**
  - escala e chão iguais à `disponivel` (topo 33/34, pés 1462/1465);
  - a mesma caixa nos 3 quadros;
  - o 2 e o 3 mudam só os olhos;
  - a borda direita mais estreita vem da asa no queixo (pose diferente), não do balão. Aceito.
- **Decisão da Muse, que revisa a minha própria spec:** no `pensando` dos extras, **não vai balão**.
  - Compacto, ele vira uma mancha de ~12 px a 188 px. Grande, encolhe o bicho ou desloca a caixa.
  - A faixa já mostra a nuvem do estado pelo `.overlay` (30 px, igual para os 17), e 4 dos 5 principais não têm balão.
  - O pensar fica na pose: o olhar subindo e a mão ou asa no queixo.
  - Quando o ciclo de `pensando` entrar, o `.overlay` **fica**. Retiro a nota anterior de escondê-lo.
- **Pedido ao Brush:**
  - tirar o balão (recomposição só na área do balão) do tucano `pensando-1/2/3` e do tamanduá `pensando-1/2/3`;
  - de raposa em diante, já sem balão.
  - **Exceção conhecida:** a Luna, principal, tem balão; fica para a revisão do conjunto principal.
- **Pensando sem balão, tucano e tamanduá (04/11): aprovado.**
  - 0 pixels de balão;
  - a crista e as orelhas intactas, sem resto de halo (`br-p1/pensando-sem-balao.png`);
  - a mesma caixa nos 3 quadros, com escala e chão iguais à `disponivel`.
  - Regenerado no app.

### Lote P1 · raposa · aprovada (04/11)
- **Conferido** (`review-life.py raposa`, `br-p1/raposa-life-board.png`, `raposa-tail-check.png`):
  - **`blink`:** 0,59%, só os olhos.
  - **`tail`:** 3,9%, só o rabo, que sobe e curva; lê bem a 188 px. O limiar de alerta do script passou de 3% para 6%, porque rabo grande é legítimo.
  - **`acenando`:** a pata mais alta.
  - **`pensando-1/2/3`:** sem balão, com a mesma caixa, o topo e os pés iguais à `disponivel` e só os olhos mudando.
  - Todos ≤ 1,3 MB e RGBA. Regenerado no app.

### Lote P1 · panda · aprovado (04/11)
- **Os 6 frames:**
  - `blink`: 0,53%, só os olhos;
  - `tail`: a orelha, 0,93%;
  - `acenando`;
  - `pensando-1/2/3`: sem balão, com a mesma caixa (topo 23, contra 29 na `disponivel`, dentro de ±50).
- Os tracinhos do aceno são lilás e aparecem no escuro.
- Regenerado no app.
- **1º lote (tamanduá, tucano, raposa, panda) fechado.**

### Lote P1 · guaxinim · aprovado (04/11)
- `blink`: 1,14%, os dois olhos.
- `tail`: a orelha, 1,54%.
- `acenando`.
- `pensando-1/2/3`: sem balão, mesma caixa e chão (topo 31 e pés 1502, contra 33 e 1500 na `disponivel`).
- Regenerado no app.

### Lote P1 · coruja · aprovada (04/11)
- **`blink`:** 1,85%.
- **`tail`:** o penacho baixa, 1,59%; a caixa unida da família evita o pulo.
- **`acenando`.**
- **`pensando`:** sem balão, mesma escala.
- Regenerado no app.

### Lote P1 · capivara · aprovada (04/11)
- **`blink`:** 0,56%.
- **`tail`:** a orelha, 1,09%.
- **`acenando`:** de frente, combina com o gesto.
- **`pensando-1/2/3`:** sem balão, mesma escala (topo 39 e pés 1492, contra 43 e 1488).
- Regenerado no app.

### Lote P1 · cervo (04/11)
- **Aprovados:**
  - `blink`: 0,42%;
  - `acenando`;
  - `pensando-1/2/3`: sem balão, mesma caixa.
- **`tail` (a orelha) volta:** a 188 px quase não se mexe e a galhada rouba o olhar. Girar ~10° para fora, como no tamanduá v2.
- **Cervo `tail` v2: aprovado.** A orelha inclina bem para fora e muda de ângulo a 188 px; 2,11%, só a orelha, mesma caixa. **O cervo está completo.** Entra no app no próximo `build-assets`, na janela do Keel.

### Lote P1 · coelho · aprovado (04/11)
- **`blink`:** 0,51%.
- **`tail`:** a orelha, 2,79%; lê bem a 188 px.
- **`acenando`.**
- **`pensando-1/2/3`:** sem balão, mesma escala. A caixa mais estreita vem da pata no queixo: é pose diferente, não salto.
- Entra no app no próximo `build-assets`, na janela do Keel.

### Lote P1 · lobo-guará (04/11)
- **Aprovados:**
  - `blink`: 0,37%;
  - `acenando`;
  - `pensando-1/2/3`: sem balão; a caixa mais estreita vem da pata.
- **`tail` (a orelha):** o movimento lê bem (2,97%), mas sobrou um fragmento escuro do contorno antigo junto da base da orelha (`br-p1/lobo-ear-seam.png`). Volta só para limpar esse resto.
- **Lobo-guará `tail` v3: aprovado.** O fragmento entre as orelhas saiu, a orelha inclinada segue lendo (3,01%, mesma caixa). **O lobo-guará está completo**; entra no próximo `build-assets`, na janela do Keel.

### Lote P1 · lontra · aprovada (04/11)
- **`blink`:** 0,61%.
- **`tail`:** a orelha pequena desloca 37 px a 1536 (~4,5 px na faixa de 188), o que lê; 1,07%. A caixa unida da família evita o pulo.
- **`acenando`.**
- **`pensando-1/2/3`:** sem balão, mesma escala.
- Entra no próximo `build-assets`.

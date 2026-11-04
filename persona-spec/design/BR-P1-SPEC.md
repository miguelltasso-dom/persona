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
| `{animal}-pensando-1/2/3.png` | 3 quadros de "pensando" (olhar para cima, mão no queixo, balão) | estado trabalhando/pensando |

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

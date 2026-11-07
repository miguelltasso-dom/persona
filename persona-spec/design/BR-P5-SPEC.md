# BR-P5 · Figurinhas das personas (Colheita Lodi D, v1.1)

**Para que servem:** a persona manda uma figurinha em 3 momentos, no máximo 1 por persona por dia (UX-BEYOND §Colheita Lodi D):
- comemorar uma entrega;
- bom dia;
- fim de expediente.

A legenda é **texto vivo** num chip abaixo da figurinha. **Nunca há texto na arte.** A tela é do Quill, atrás de flag.

## O que já existe (não refazer)
- 17 bichos × 6 reações (`joinha`, `coracao`, `rindo`, `comemorando`, `pensando`, `feito`), em busto, com fundo transparente, 256² de fonte e 96 de prévia.
- **"Comemorar uma entrega"** usa o `comemorando` ou o `feito`, que já existem.

## O que falta: 2 reações novas por bicho
| reação | cena | adereço |
|---|---|---|
| `bom-dia` | o busto acenando, com olhos bem abertos e o sorriso calmo | uma xícara fumegando na outra mão, ou um solzinho pequeno atrás do ombro |
| `ate-amanha` | o busto bocejando de leve ou acenando de despedida, com olhos meio fechados | uma lua pequena ou a luminária da casa atrás do ombro |

**Cada uma em 18 bichos** (as 18 pastas, com o mico): atlas, bento, nina, sol, luna, capivara, cervo, coelho, coruja, guaxinim, lobo-guara, lontra, mico-leao-dourado, ourico, panda, raposa, tamandua, tucano. Use a lista exata de pastas em `persona-assets/stickers/`.

- **Formato:** o mesmo das 6 atuais.
  - Fonte: `stickers/<bicho>/<reação>.png` 256² RGBA + `-96.png`.
  - O pipeline gera `stickers/<bicho>-<reação>.webp` a 128.
  - Mesmo traço, mesmo enquadramento de busto e mesmo contorno da família.
- **Regras:**
  - sem texto na arte;
  - os adereços (xícara, sol, lua) pequenos, dentro do quadro e sem cobrir o rosto;
  - leitura a 64 px (o tamanho do seletor).

## Orçamento
- **O medido:** as figurinhas atuais têm média de ~6,3 KB por webp de 128.
- **O previsto:** 18 × 2 = **36 webp ≈ 231 KB**. Com a reserva, o total da v1.1 fica em ≈ 10,49 MB (10,00 MiB) de 12.
- **Enfeites e vazios além do BR-P4: nenhum planejado.** A EQUIPE-REAL usa rostos e ícones que já existem.
- **A reserva** para algo que apareça é de 0,25 MiB, e qualquer arte nova passa pela Muse com o peso medido.

## Ordem e aprovação
1. **Amostra primeiro:** `bom-dia` e `ate-amanha` de 2 bichos (o Atlas e a capivara).
2. **A Muse aprova** a cena e os adereços.
3. **Depois os 18,** em lote, com uma prancha por reação.

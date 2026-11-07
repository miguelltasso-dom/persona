# BR-P3: arte da missão "Acima do T3"

Muse para Brush, 04/11.
- **Estilo:** o de sempre (dirD: contorno ameixa, papel creme, luz das poses atuais, sem texto na arte).
- **Formato:** PNG RGBA 8 bits, nunca paleta.
- **Fluxo:** uma amostra de cada tipo, aprovada pela Muse, antes do lote. Os pesos e o pipeline seguem `PLAN-assets-brush.md §8`.

**Tamanhos:**
| Tipo | Mestre | Na tela |
|---|---|---|
| Ilustração | 480² | 240 |
| Spot | 192² | 96 |
| Pose | 1536², mesmo enquadramento e chão da `disponivel` do bicho | — |
| Ícone | SVG 24, traço 1,75, `currentColor` | — |

Este pacote vem **depois** do que já está em curso no BR-P1, que é o lote de vida e o P2 nº 3 a 6. **Sobe de prioridade, porque entra no P0 do UX-BEYOND:** o P2 nº 3 a 6 do BR-P1 (conflito, histórico vazio, rascunho trabalhando, ícones ajuda e novidades).

## P0 (antes do instalador)

| # | Arquivo | Onde | Cena |
|---|---|---|---|
| 1 | `illustrations/empty-limite.png` (480) + `spot-limite.png` (192) | "No limite até 18:30 · as tarefas esperam" (faixa do composer e Uso) | O Atlas sentado ao lado de uma ampulheta que está quase no fim, tranquilo, tomando um chá; nada de alarme |
| 2 | `illustrations/empty-equipe-remota.png` (480) | Equipe remota sem conexão (E13) | Dois bichos em mesas separadas, ligados por um fio de lã que vai de uma à outra |
| 3 | `illustrations/acesso-encerrado.png` (480) | E13 "Acesso encerrado" | O Bento guardando a chave numa caixinha, gentil |
| 4 | `illustrations/sucesso-aplicado.png` (480) | "Aplicado na pasta" (SW-7) | A Luna colocando uma folha numa pasta, com um brilho âmbar |
| 5 | `illustrations/empty-aprovacoes.png` (480) | Aprovações vazio, "Nada esperando você" (REVIEW-APPROVALS-REDESIGN §2, pedido do Miguel) | A equipe toda (Atlas, Bento, Nina, Sol e Luna) descansando feliz num tapete, o Atlas com um carimbo "feito" ao lado; acolhedor, nada de troféu |

## P1 (logo depois)

**Poses novas nos 5 principais** (atlas, bento, nina, sol, luna), 1536², mesmo enquadramento:

| Pose | Uso |
|---|---|
| `comemorando` | O marco "Primeira entrega" e as entregas aceitas (hoje só existe como sticker) |
| `digitando` | O indicador "{persona} está escrevendo…" no fio (estilo Slack, com rosto) |
| `lendo` | "Leu o Cofre…" na atividade viva |
| `confuso` | "Não entendi o pedido; pode explicar?" (a persona pede esclarecimento) |

- **Amostra primeiro:** `atlas-digitando` e `atlas-comemorando`.
- **Ilustrações de sucesso** (480):
  - `sucesso-skill-aprendida` (Ensinar: a persona com um diploma);
  - `sucesso-convite-aceito` (E13: um aperto de pata);
  - `sucesso-equipe-chegou` (a contratação aprovada: os bichos novos acenando na porta).
- **Ajuda** (spots de 192, um por tema da tela Ajuda): conectar uma IA (plugue), contratar (crachá), ensinar (tela com cursor), quadros (post-its), avisos (sininho), privacidade (cadeado com patinha).
- **Ícones** (SVG 24):
  - `avisos` (sino);
  - `desfazer` (seta curva para trás);
  - `fila` (relógio com fila);
  - `direcionar` (seta que curva);
  - `citar` (aspas);
  - `lado` (balão lateral);
  - `atalho` (tecla).

## P2
- Os 4 animais novos da galeria (BR-P1 P3: mico, preguiça, tatu e arara), sob demanda.
- Celebrações de marco tipo Duolingo: "1ª semana", "10 entregas", "equipe completa" (480).

## Aceite (Muse, por captura)
Legível a 240 e a 96, com o contorno visível nos dois temas. As poses passam pelo `review-life.py` (mesma caixa e chão, só o detalhe muda).

## Revisões

### Amostra · `empty-limite` · aprovada (04/11)
- **A cena:** o Atlas tranquilo com o chá e a ampulheta quase no fim. Diz "pausa, já volta", sem alarme, no traço da casa.
- **Legibilidade:** lê a 240 e a 96 nos dois temas; 147 KB.
- **Ajuste (no lote, sem bloquear):** a mesma sombra de chão lilás suave da `empty-sem-ia`, para as ilustrações de estado ficarem da mesma família. Vale para todo o lote P0.
- **Lote P0 liberado:**
  - `spot-limite` (192: só a ampulheta, no traço da casa);
  - `empty-equipe-remota`;
  - `acesso-encerrado`;
  - `sucesso-aplicado`.

### Lote P0 · 04/11
- **`spot-limite` (192):** aprovado.
- **`empty-equipe-remota`:** aprovado (o Atlas e a Luna em mesas separadas, ligados pelo fio de lã).
- **`acesso-encerrado`:** aprovado (o Bento guardando a chave).
- **`sucesso-aplicado`:** **refazer**. Ficou quase igual à `empty-historico` (a Luna pondo a folha na pasta), e as duas telas mostrariam a mesma imagem. O sucesso precisa ler como **comemoração**: a pasta fechada com o carimbo ✓ âmbar, a Luna orgulhosa, 2 ou 3 patinhas de brilho.
- **A variante `empty-limite` com sombra** (`tools/brp3-empty-limite-sombra.png`): **aceita** no lugar da amostra. As mudanças de detalhe (a xícara, a ampulheta) são pequenas e não mexem no personagem.
- **Pendência da Muse** (quando o Keel abrir a janela): registrar no `build-assets` a `empty-limite` (a variante), a `spot-limite`, a `empty-equipe-remota`, o `acesso-encerrado` e, depois, a `sucesso-aplicado` e a `empty-aprovacoes`.
- **`sucesso-aplicado` v2: aprovado.** A Luna comemorando, a pasta fechada com o selo ✓ âmbar e os brilhos; agora é bem diferente da `empty-historico`.
- **`empty-aprovacoes`: aprovado.** Os cinco no tapete e o carimbo ✓ junto do Atlas; acolhedor, sem troféu.
- **A `empty-limite` final** está com a sombra.
- **O lote P0 do BR-P3 está fechado.** Falta só o registro no `build-assets` (Muse, na janela do Keel).

## Revisões P1

### Amostra · `atlas-comemorando` e `atlas-digitando` (04/11)
- **O chão:** os pés 25 px acima da base não importam. O `build-assets` recorta cada pose pela caixa opaca e alinha os pés na linha do chão, e a escala bate com a `disponivel` (topo 51 contra 52).
- **`comemorando`: aprovado.** As duas patas para cima e o sorriso grande leem a 188 px e a 96 nos dois temas.
- **`digitando`: ajustar.** A 188 px ele lê como "segurando um teclado", não "escrevendo". O uso principal é o indicador "{persona} está escrevendo…" no fio, a 40–48 px.
  - Ajuste: o olhar **para baixo**, nas teclas; a cabeça levemente inclinada; 2 ou 3 traços curtos de "toque" nas pontas das patas, como os tracinhos do aceno: encostados na silhueta, com o halo creme.
  - Mantém o teclado, o enquadramento e o chão.
- **Depois do `digitando` v2:** o lote dos 5 principais × comemorando / digitando / lendo / confuso, no mesmo método.
- **`atlas-digitando` v2: aprovado.**
  - **A 188 px:** o olhar nas teclas, a cabeça inclinada e os toques com halo leem "escrevendo".
  - **A 40–48 px:** o detalhe do olhar some, mas o teclado lilás segue legível, e é ele que diz "digitando". Por isso, **regra de uso:** o indicador "{persona} está escrevendo…" usa a pose inteira a **≥ 48 px de altura**, nunca recortada no rosto, ao lado do texto com as reticências animadas (só sem reduced-motion).
  - **O topo +22 px** (a cabeça inclinada) muda ~1,5% da escala na faixa, o que é imperceptível; o chão é igual.
- **O lote P1 liberado:** os 5 principais (atlas, bento, nina, sol, luna) × comemorando, digitando, lendo e confuso. São 18 imagens, porque o atlas já tem 2.
- **`atlas-confuso`: aprovado.** A cabeça inclinada, a pata na cabeça e o "?" com halo leem a 188 px; é simpático, sem drama.
- **`atlas-lendo`: ajustar.** O livro está certo, mas o olhar vai para o lado e a língua de fora diz "feliz", não "lendo". Olhar **para baixo, na página**; a boca fechada, com um sorriso leve; o resto igual. Vale como regra do `lendo` para os 5: concentrado e calmo.
- **`atlas-lendo` v2: aprovado.** O olhar desce para a página, a boca está fechada com sorriso leve, e lê "concentrado" a 188 px nos dois temas. **O kit P1 do Atlas está completo** (comemorando, digitando, lendo e confuso). Vira a referência para os outros 4.
- **Bento P1: aprovado inteiro.**
  - `comemorando`: as patas para cima;
  - `digitando`: o teclado lilás e os toques; lê a 48 px;
  - `lendo`: os olhos na página, a boca fechada;
  - `confuso`: a pata na cabeça e o "?".
  - Topo e chão dentro de ±1% da `disponivel`; o pelo preto mantém o contorno no escuro.
  - Entra no `build-assets` junto com o lote dos 5, para uma regeneração só.
- **Nina P1: aprovada inteira.** No canvas comum (sem recorte), a cabeça e o corpo ficam na mesma escala da `disponivel` depois do ajuste (topo 170–174 e chão 1365–1366, contra 174 e 1365). `digitando` com teclado e toques; `lendo` concentrado; `confuso` com o "?". Lê nos dois temas.
- **Sol P1: aprovado inteiro.** A escala e o chão batem com a `disponivel` (topo 193–204 e chão 1337–1340, contra 202 e 1338); os 4 leem nos dois temas.
- **Luna P1: aprovada inteira.** A escala e o chão batem com a `disponivel` (topo 170–176 e chão 1367–1370, contra 177 e 1365).
- **O P1 dos 5 principais está FECHADO.** As 20 poses (comemorando, digitando, lendo, confuso) estão no app; a árvore em 9,78 MiB de 12.
- **Código:** `PersonaPoseState` ganhou os 4 estados, e há o `hasPose(id, state)` novo, porque o `poseUrl` cai na `disponivel` sozinho. Os 12 extras ainda não têm essas poses: use o avatar + o texto.

### Amostra P1 · `sucesso-skill-aprendida` (04/11)
- **A ideia e o traço:** aprovados (o Atlas feliz, os brilhos, a sombra de chão).
- **Ajustar:** o diploma está pequeno e, enrolado, lê como um **laço**, sobretudo a 96 px. Precisa ficar **maior** (~1/3 da largura do corpo), **meio aberto**, com um selo âmbar ✓ visível (o mesmo selo da `sucesso-aplicado`, que vira a marca de "deu certo" da casa).
- **Depois:** `sucesso-convite-aceito` e `sucesso-equipe-chegou`, com o mesmo selo e a mesma sombra.
- **`sucesso-skill-aprendida` v2: aprovado.** O diploma meio aberto, com o selo ✓ âmbar, lê como "aprendeu, deu certo" a 240 e a 96 nos dois temas. O selo vira a marca de sucesso da casa. Siga com `sucesso-convite-aceito` e `sucesso-equipe-chegou`.
- **`sucesso-convite-aceito` e `sucesso-equipe-chegou`: aprovados.** O aperto de pata com o selo ✓ e os 3 bichos novos acenando na porta com o selo; leem a 240 e a 96 nos dois temas, com a mesma família visual dos outros sucessos. **Os 3 sucessos do P1 estão fechados.** Entram no `build-assets` na próxima janela do Keel (o H2 está sendo empacotado agora; não regenero no meio).
- **`spot-ajuda-conectar-ia`: aprovado.** Lê a 96 e a 48 nos dois temas. A faísca âmbar acesa o distingue do `spot-sem-ia` (a faísca apagada), o par certo para "conectar" × "falta". Siga com os outros 5 spots da Ajuda.
- **Os 6 spots da Ajuda: aprovados.** O plugue, o crachá com patinha, a tela com cursor, os post-its, o sininho e o cadeado com patinha leem a 96 e a 48 nos dois temas, no mesmo traço e com o brilho âmbar como assinatura. Estão registrados no `build-assets` e entram na próxima janela.
- **Ícones `desfazer` e `fila`: aprovados.** Mesmo traço, peso e grade dos ícones de navegação e de UI; leem a 24 e a 18 nos 3 fundos. "Desfazer" é a seta curva de volta, sem ambiguidade com "voltar"; "fila" são as linhas com o relógio. Siga com avisos, direcionar, citar, lado e atalho.
- **Ícones `avisos`, `direcionar`, `lado` e `atalho`: aprovados.** Mesmo traço e mesma grade. `direcionar` é o espelho do `desfazer`, o par certo.
- **`citar`: ajustar.** As aspas de traço reto leem como o número "55", em todos os tamanhos. Use aspas **curvas** (duas vírgulas grandes de topo arredondado, como "“"), com o topo cheio ou um círculo pequeno no alto de cada uma. Mesmo traço.
- **`citar` v2: a forma aprovada** (aspas curvas com ponto cheio; lê como aspas, não "55"). **Um ajuste de escala:** ela ocupa ~50% da grade e fica menor e mais leve que os vizinhos a 18 px. Aumente até ~16 × 14 dentro dos 24 (o mesmo peso visual de `lado`/`atalho`), com o mesmo traço. Com isso, o BR-P3 P1 fecha.
- **`citar` v3: aprovado.** Com a escala maior, o peso fica equilibrado com os vizinhos a 18 e a 24. **O BR-P3 P1 está FECHADO:** 20 poses, 3 sucessos, 6 spots da Ajuda e 7 ícones. Entram no app no `build-assets` depois do H2 #3.

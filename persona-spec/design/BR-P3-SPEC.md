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

# Computer use próprio: especificação de design (Onda 3, Muse)

Fonte: `persona-spec/IDEAS.md` (03/11, "computer use próprio, fluido como o do Maestri"). Régua: `DESIGN-SYSTEM.md`.

Dono do spike: **Rivet** (overlay no Electron, entrada, UIA). A Muse entrega a spec, o protótipo e a revisão por captura.

**Protótipo funcional:** `persona-spec/design/computer-use-prototype/index.html`. Abre direto no navegador e não tem dependências. Testado no Chrome headless, claro, escuro e com reduced-motion; capturas em `.maestri/tmp/shots/design/computer-use/`. A API está em `window.PersonaOverlay`: `PersonaCursor`, `ControlFrame`, `bezier`, `arcPath`, `minJerk`, `moveDuration`. Os resultados:
- a pausa congela o cursor e a digitação;
- a retomada termina o roteiro, com duas personas em paralelo;
- 0 erros no console;
- com reduced-motion, nenhum rastro e nenhuma animação.

## 1. Princípios

1. **Sempre se sabe quem está mexendo.** Cada persona tem cursor próprio, com o rosto do bicho e o nome embaixo da seta, mais uma moldura na janela que está usando.
2. **A pessoa manda.** Qualquer movimento real do mouse ou tecla pausa **todas** as personas no mesmo quadro. Nada volta sozinho: só com "Devolver".
3. **O movimento é humano, não teatral.** Arcos suaves, aceleração de alcance humano, nada de teleporte nem de linha reta robótica. Rápido o bastante para não irritar.
4. **Cada ação se prova.** Toda ação é conferida (UIA e captura) e entra no registro, que pode ser revisto como replay.
5. **É discreto.** O overlay não rouba clique, não cobre conteúdo importante e some quando a persona termina.

## 2. Anatomia

| Peça | Especificação |
|---|---|
| **Seta** | 22 × 26 px, preenchimento branco, contorno ameixa de 1,6 px (o nosso traço) e sombra sólida de 2 px. A ponta fica no ponto de ação (offset 3, 3). |
| **Etiqueta** | Pílula colada embaixo e à direita da ponta (+16, +22): rosto do bicho de 22 px em círculo com contorno ameixa, **nome** em Nunito 800 12 px e, depois de "·", o que está fazendo. Fundo na cor da persona, contorno ameixa de 1,5 px, `shadow-press`. Máximo de 280 px, com reticências. |
| **Cor da persona** | O tom do bicho (Nina âmbar `#f0be6a`, Bento lilás `#b39ddf`…), salvo no perfil. O texto da etiqueta é sempre ameixa `#34243f` (AA sobre qualquer tom claro). |
| **Rastro** | O caminho recém-percorrido em SVG, 3 px, cor da persona a 55%. Desenha-se junto com o movimento e some em 700 ms, 250 ms depois de chegar. |
| **Moldura da área controlada** | Contorno de 1,5 px na cor da persona a 55%, raio de 12, cantos em colchete de 4 px × 18 px. Segue a janela controlada com transição de 350 ms. Etiqueta no topo: rosto, "Nina está usando esta janela" e `Esc`. |
| **Clique** | A seta encolhe para 0,82 com mola, e um anel na cor da persona cresce 3,2× e some em 500 ms. |

## 3. Estados

| Estado | Seta | Etiqueta |
|---|---|---|
| `idle` | parada | só o nome |
| `moving` | segue o arco | nome · intenção curta ("abrindo o cadastro") |
| `clicking` | encolhe com mola + anel | nome · "clicando" ou o alvo ("salvar pedido") |
| `typing` | parada | nome · os últimos 22 caracteres digitados, em mono, com cursor piscando |
| `waiting` | sobe e desce 3 px a cada 1,6 s | nome · três pontinhos respirando (`aria-label` "Nina está esperando") |
| `human` (você assumiu) | esmaecida a 45%, cinza | fundo `card`, contorno tracejado, nome · "você assumiu". A moldura fica tracejada e neutra, com o texto "Você está no controle · Nina pausou" |

## 4. Movimento (matemática; portar como está)

- **Arco:** Bézier cúbica de P0 a P3. Os pontos de controle saem para um lado da reta: P1 = P0 + 0,28·d + n·k e P2 = P0 + 0,78·d + n·0,55k. A curvatura é k = clamp(0,18·dist, 10, 120), e o lado alterna a cada movimento.
- **Easing:** *minimum jerk*, s(t) = 10t³ − 15t⁴ + 6t⁵ (o perfil de alcance da mão humana).
- **Duração (tipo Fitts):** 220 + 160·log₂(1 + dist/32) ms, com teto de 900 ms.
- **Ultrapassagem:** em distâncias acima de 360 px, mira 8 px além do alvo e assenta em 110 ms (ease-out).
- **Pausa no meio do arco:** o relógio conta só o tempo ativo; ao devolver, o cursor continua de onde parou, sem salto.
- **Digitação:** 40–85 ms por caractere, com variação.
- **reduced-motion:** sem rastro, sem anel e sem balanço. O deslocamento vira um fade de 90 ms direto no alvo.

## 5. Quem controla (regras duras)

- **Detecção:** o hook global de entrada (Rivet: `uiohook` ou equivalente) sinaliza movimento físico do mouse, clique ou tecla da pessoa. Os eventos sintéticos da própria persona são ignorados pelo identificador de origem.
- **Pausa imediata:** todas as personas param no mesmo quadro (16 ms). A tarefa no motor fica "esperando você".
- **Devolver:** botão "Devolver para a Nina" na etiqueta da moldura, na bandeja e no app, mais o atalho `Ctrl+Shift+Espaço`. Nunca volta por tempo.
- **Esc** é sempre "assumir", nunca "cancelar a tarefa". Cancelar é outra ação, com confirmação.
- **Ações que precisam do mouse real** (fallback por SendInput, quando o UIA não dá conta): antes, a etiqueta avisa "Nina precisa do mouse por ~3 s" com contagem de 2 s, e mover o mouse cancela. O preferido é UIA (`InvokePattern`, `ValuePattern`, `SelectionItemPattern`), que **não** rouba o cursor da pessoa.

## 6. Confiabilidade e prova

- **Antes de agir:** o alvo é resolvido pela árvore UIA (nome, papel e retângulo), e a captura serve de confirmação visual.
- **Depois de agir:** confere o efeito (valor do campo, janela nova, linha selecionada). Se falhar, refaz uma vez; se falhar de novo, o estado vira `waiting` com "Não consegui clicar em *Salvar*" e o pedido vai para Precisa de você.
- **Registro:** cada passo vira uma linha na atividade da tarefa, com miniatura (o mesmo `TeachStepCard` em modo leitura). O **replay** reproduz o arco e os cliques sobre as capturas.
- **Privacidade:** campo de senha (UIA `IsPassword`) nunca aparece na etiqueta (fica "digitando ••••") e vem borrado na captura.

## 7. Implementação (notas para o Rivet)

- **Janela overlay:** uma por monitor, transparente, sem moldura, com `alwaysOnTop` no nível `screen-saver`, `setIgnoreMouseEvents(true, { forward: true })`, `focusable: false` e fora da barra de tarefas. Única exceção: a etiqueta da moldura ganha `pointer-events` para o botão Devolver, que alterna `setIgnoreMouseEvents(false)` só sob o hover dela.
- **Coordenadas:** o retângulo UIA vem em pixels físicos. Divida pelo `scaleFactor` do `screen.getDisplayMatching`, para que cada monitor com DPI próprio converta para DIP antes de desenhar.
- **Laço de animação:** `requestAnimationFrame` no overlay, porque a matemática vive no renderer. O processo principal só manda alvos e estados por IPC (`cu:move`, `cu:click`, `cu:type`, `cu:state`, `cu:frame`).
- **Desempenho:** 60 fps com 2 cursores, `transform` só em `translate`, nada de layout por quadro.
- **No máximo 2 personas visíveis ao mesmo tempo** por monitor. A terceira entra na fila, com o aviso "Bento espera a tela".

## 8. Aceite (Probe + Muse, por captura e vídeo)

1. Roteiro sintético de 6 passos completa com 0 erros, a 60 fps, com 2 cursores.
2. Mover o mouse físico pausa as 2 personas em ≤ 1 quadro, nada é digitado enquanto a pessoa segura o controle, e "Devolver" retoma do ponto exato.
3. Os arcos ficam no envelope k ≤ 120 px, sem linha reta em movimentos acima de 80 px.
4. Com reduced-motion: 0 animações infinitas e 0 rastros.
5. Senha nunca aparece na etiqueta nem na captura.
6. Capturas claro e escuro de: `moving`, `typing`, `human` e `done` (como as do protótipo).

## 9. Arte

- Os rostos já existem (`avatars/<animal>.png`).
- Falta pedir ao Brush o ícone `assumir-controle` (mão segurando a seta) para a bandeja e o botão "Devolver".

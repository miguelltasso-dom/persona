# Orçamento de GPU e animação — insumo do DESIGN-01 (Cobalt, 11/11/2026)

Pedido do Keel (D-105): o orçamento de GPU/animação para o DESIGN-01 do Carbon. Base: a varredura do cliente (17 animações infinitas + custos
permanentes) e as medições do `perf-probe-visible.mjs` (visível, sem foco, minimizada).

## 1. O que foi medido (instalado v1.1 e win-unpacked)

| estado | GPU (processo) | observação |
| --- | ---: | --- |
| visível + foco, onboarding aberto | **26–61%** | scrim do onboarding com `backdrop-filter: blur(4px)` em tela cheia + animações ambientes (26,4% na rodada limpa; 49–61% sob carga) |
| visível + foco, shell parado | 2–6% | sem onboarding; lamp/rail/typing só quando há atividade |
| minimizada / na bandeja | **1–2%** | `document.hidden` já pausa tudo (regra existente) |
| visível sem foco (atributo `data-persona-unfocused`) | **0%** com o corte CSS (26,4% sem ele) | o corte pausa as animações e tira o blur do scrim; sem o corte, o foco perdido não pausa nada |

Meta do Atlas: **≤2% com a janela sem foco/minimizada/na bandeja**. O onboarding visível e focado é um estado transitório (primeira vez); o
orçamento para ele pode ser maior, mas o scrim de blur em tela cheia é o item mais caro e não precisa ser contínuo.

## 2. Custos que o DESIGN-01 deve orçar

**Animações infinitas (17 no cliente).** A maioria é composta (`opacity`/`transform`), mas três são repaint-bound:
`persona-shimmer` (anima `background-position`), `persona-rail-pulse` (`box-shadow`) e `lampBreathe` (`opacity` em um layer de tela cheia com
dois gradientes radiais). Regra: animação nova só com `opacity`/`transform`; nada de `background-position`, `box-shadow` animado ou blur
animado.

**Custos permanentes (não animados):**
- `will-change: transform, opacity` em cada cartão do Kanban (um layer de composição por cartão; foi trocado por `isolation: isolate` no
  corte D-101b).
- Grain com `mix-blend-mode` sobre `.center` e a sidebar: o blend força releitura do backdrop a cada composição do subtree; com animações
  dentro, o custo multiplica.
- `backdrop-filter: blur(4px)` no scrim do onboarding e `blur(3px)` nos modais: blur de tela cheia a cada frame enquanto visível.

**Regras de pausa (já implementadas / a manter):** `body[data-persona-hidden]` (minimizada) e `body[data-persona-unfocused]` (sem foco)
pausam `animation-play-state` de todo o shell; `prefers-reduced-motion` zera as animações; o IntersectionObserver pausa o que está fora da
tela. O DESIGN-01 deve tratar essas três condições como parte do desenho, não como exceção.

## 3. Orçamento proposto para o DESIGN-01

| condição | orçamento de GPU | regra |
| --- | ---: | --- |
| sem foco / minimizada / bandeja | **≤2%** | nenhuma animação, nenhum blur contínuo; gradiente estático |
| visível + foco, shell parado | **≤6%** | só animações de presença (respiração/blink) e nunca blur de tela cheia |
| visível + foco, onboarding | **≤15%** | o scrim vira gradiente estático; as animações do onboarding pausam fora de foco |
| transição/entrada | pico permitido | animações de entrada (WAAPI) só uma vez, pausadas fora de foco |

**Cortes simples, medidos no artefato (experimento de CSS via CDP, onboarding aberto):** visível/focado **26,4%**; só tirar o
`backdrop-filter` do scrim → **16,2%**; pausar as animações (atributo `data-persona-unfocused`) → **0%**. Ou seja: o blur do scrim custa
~10 pontos percentuais e as animações o resto. Regra para o DESIGN-01: scrim estático (sem blur) e pausa total fora de foco.

## 4. Protocolo de medição (para o DESIGN-01 e para cada mudança visual)

`perf-probe-visible.mjs` no win-unpacked, 3 execuções, home descartável: amostra a CPU do processo GPU em três estados — visível (10 s),
visível sem foco (Notepad na frente, 10 s) e minimizada (10 s) — além de janela/shell/RAM. O número que vale é a **mediana** do estado sem
foco; o visível com onboarding é diagnóstico, não gate.

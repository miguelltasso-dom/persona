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

## 5. Orçamento por tela (DESIGN-01)

Cada tela declara o que anima em repouso e o teto. "Repouso" = visível e focada, sem streaming/geração; "fora de foco" = a regra global
(`data-persona-unfocused`/`data-persona-hidden`) pausa tudo e o teto é **≤2%** em todas.

| tela | o que anima em repouso | custo medido/estimado | teto em repouso | regra |
| --- | --- | --- | ---: | --- |
| onboarding (1ª janela) | scrim `blur(4px)` + fade/pop de entrada | 26,4% visível; 16,2% só sem o blur; 0% pausado | **≤15%** | scrim vira gradiente estático; entrada uma vez; pausa fora de foco |
| canal #geral (escuro, lamp) | `lampBreathe` (opacity em layer de tela cheia), cursor de stream, typing dots, subject breathe | 2–6% parado; picos com streaming | **≤6%** | lamp só com a janela focada; opacidade/transform; sem blur |
| DM | `lampBreathe`, subject breathe | idem | **≤6%** | idem |
| faixa de equipe | seat bob, figure breathe/blink/tail (por figura) | composited; 1 layer por figura | **≤6%** | pausa por IntersectionObserver + fora de foco; sem `box-shadow` animado |
| rail (sidebar) | rail blink (steps), rail pulse (`box-shadow` no selo "waiting") | pulse é repaint-bound | **≤4%** | trocar `box-shadow` por opacidade de um pseudo-elemento |
| Kanban | nenhuma animação infinita; transições de hover/drag | `will-change` permanente removido (isolation) | **≤4%** | `will-change` só no cartão arrastado |
| Aprovações/Inbox | badge estático | — | **≤2%** | sem animação contínua |
| Configurações | nenhuma | — | **≤2%** | — |
| modais/overlays | scrim `blur(3px)` + fade | blur de tela cheia enquanto aberto | **≤8%** | scrim estático (sem blur) ou blur só com foco |
| skeletons/carregando | `persona-shimmer` (background-position) | repaint-bound | **≤8%** | shimmer por opacidade de um gradiente estático, não `background-position` |
| botões em loading | 3 dots (transform/opacity) | composited | **≤4%** | ok |
| gravação (Ensinar) | rec pulse (opacity) | composited | **≤4%** | ok |
| replay de cursor | blink/breathe (opacity) | só na reprodução | **≤8%** | pausa fora de foco |

**Regras transversais para o DESIGN-01:** (1) nenhuma animação infinita em `background-position`, `box-shadow` ou `filter`; (2) nenhum
`backdrop-filter` de tela cheia em repouso — scrim estático; (3) `will-change` só durante a interação; (4) toda animação nova nasce com
`prefers-reduced-motion` e com a pausa global (hidden/unfocused); (5) o grain com `mix-blend-mode` fica em superfícies estáticas, nunca
dentro de um subtree que anima. O gate mede a **mediana** de 3 execuções no win-unpacked, com a janela visível sem foco (atributo
`data-persona-unfocused` ou Notepad na frente) e minimizada.

## 5. Orçamento por tela (para o DESIGN-01)

Contagem do cliente (`client-ui-persona`, `animation: … infinite` por arquivo) e o teto de cada tela. O número que vale é a mediana do
`gpu-unfocused-probe.mjs`/`perf-probe-visible.mjs` no win-unpacked, com a janela visível e focada; sem foco/minimizada o teto é sempre ≤ 2%.

| tela / área | loops infinitos | o que anima | teto visível+focado | nota |
| --- | ---: | --- | ---: | --- |
| shell parado (rail + sidebar) | 2 | `RailTeam` blink 6,5 s + pulse 2,4 s | ≤ 6% | presença; pausa sem foco |
| conversa (chat) | 4 | cursor de stream 1,1 s, typing dots, `lampBreathe` 14 s, `SubjectBar` | ≤ 10% | `lampBreathe` é o mais caro (opacity em layer com 2 gradientes) |
| equipe (figura + strip) | 4 | `PersonaTeamFigure` (3) + `TeamChannelStrip` (1) | ≤ 8% | só com a tela da equipe aberta |
| onboarding (primeira vez) | 2 + blur 4 px em tela cheia | scrim + entrada | ≤ 15% | o blur é o item caro; virar gradiente estático |
| modais/overlays | blur 3 px | scrim | ≤ 6% | blur só enquanto aberto |
| kanban | 0 | — | ≤ 2% | `will-change` permanente removido (D-101b) |
| primitivas (Button shimmer, Feedback, Teach, BringContext, PersonaCursor) | 5 | shimmer/entrada | ≤ 6% | shimmer anima `background-position` (repaint-bound): trocar por `opacity` |

**Regra de ouro do DESIGN-01:** nenhuma tela soma mais de **2 loops simultâneos**; tudo o que é decorativo (breathe/shimmer/halo) só roda com
a janela focada; `background-position`, `box-shadow` animado e blur animado estão fora do orçamento. Toda animação nova entra com a linha da
tabela e o número medido.

## 8. O onboarding por baixo do scrim (11/11, Cobalt)

O onboarding mede **4,5%** com foco e zero animações "do gate" rodando: ele é um slot `shell.overlay` **dentro** do shell, e os loops
ambientes do shell continuavam animando sob o scrim; o blend do grain através do scrim repintava o compositor a cada frame. Fix
(`c171dfc322`): os scrims de tela cheia (onboarding e modais) carregam `data-persona-cover`; o `installAmbientPause` liga
`data-persona-covered` e pausa **só a subárvore do shell** — a regra CSS exclui o próprio cover (`:not([data-persona-cover],
[data-persona-cover] *)`) e a pausa WAAPI filtra ao shell e pula a entrada do scrim, então o fade/pop do onboarding continua. A pausa
ficou idempotente (uma animação já pausada não é pausada de novo). Spec: 16/16 (o caso do cover incluído). Medição do ganho: o próximo
pack com o commit.

# Persona — guia de UI/UX e animação (Atlas)

Obrigatório para Prism (UI), Brush (arte), Probe (testes) e Keel (aceite). Diretriz do Miguel: **a melhor UI/UX possível, com animações caprichadas**. Este guia vence gosto pessoal; a spec (`Persona-Arquitetura.md` §3) vence este guia.

## 0. Fontes obrigatórias

- **Revenue-Centric Design** — `.agents/skills/revenue-centric-design/SKILL.md` (+ `references/`). Ler o SKILL e, antes de cada tela, a referência do tema: onboarding → `onboarding-and-activation.md`; Uso e limites/planos → `pricing-and-monetization.md` e `dashboards-and-data-viz.md`; retenção/rotinas → `churn-and-retention.md`; escopo de feature → `product-strategy-and-features.md`; vieses → `behavioral-science-toolkit.md`. Citar o princípio usado no PR/relato da tarefa.
- Lentes de UI/UX do Miguel (ler, não copiar para o repo — o fork é público): `C:\Users\migue\.claude\skills\lente-craft-visual\SKILL.md`, `lente-acessibilidade`, `lente-usabilidade-cognitiva`, `lente-microcopia`, `lente-design-system`. Use-as como checklist antes de declarar uma tela pronta.
- Visual canônico: `persona-assets/references/dirD-model-sheet.png`, `dirD-tela.png`, `dirD-rostos.png` e os tokens em `persona-assets/references/README.md`.

## 1. RCD aplicado ao Persona

| Princípio RCD | No Persona |
|---|---|
| Value first, ask later / TTV | Primeiro uso: projeto + Atlas criados e uma conversa aberta em < 60 s, sem formulário longo. Pedir login de CLI só quando a primeira execução precisar, no ponto de uso. Medir *tempo até a primeira resposta útil de uma persona*. |
| Never ship a blank dashboard | Toda tela vazia tem ilustração do Brush + **uma** ação primária ("Peça algo ao Atlas", "Crie a primeira tarefa"). Visão geral e Kanban com projeto-exemplo opcional. Progresso de onboarding começa > 0%. |
| Neutrality is omission | Cada tela tem uma ação primária óbvia (botão âmbar). Nada de 5 botões de mesmo peso. |
| Default is the decision | Padrões bons: Atlas como coordenador, projeto atual pré-selecionado, modelo recomendado já marcado com motivo. |
| Zeigarnik / loops abertos | Checklist curto de ativação (criar projeto → primeira tarefa concluída por uma persona → convidar 2ª persona → criar rotina). Visível, dispensável. |
| Expansion is born of usage | Uso e limites: aviso contextual perto do campo de mensagem quando a conexão se aproxima do limite, com alternativa (trocar modelo/persona). Nunca modal interruptivo. |
| Retention is built | Continuidade visível: "Contexto usado", decisões fixadas, histórico pesquisável, resumo de rotinas. Perda percebida (o time lembra de você) > benefício prometido. |
| Peak-end rule | Celebrar marcos reais (tarefa concluída e revisada, rotina com resultado) com micro-celebração da persona — no fim de um fluxo, não no meio. |

## 2. Sistema de movimento (tokens)

Definir em `ui-theme` como variáveis CSS e espelhar em TS:

- Durações: `--motion-instant 80ms`, `--motion-fast 140ms`, `--motion-base 220ms`, `--motion-slow 360ms`, `--motion-character 700ms`.
- Easings: `--ease-standard cubic-bezier(.2,0,0,1)`, `--ease-enter cubic-bezier(0,0,.2,1)`, `--ease-exit cubic-bezier(.4,0,1,1)`, `--ease-spring` (spring física suave, sem overshoot > 6%).
- Só animar `transform` e `opacity` (e `filter` pontual). Nada de animar layout/altura em listas grandes; use FLIP.
- Biblioteca: decisão do Keel (CSS + WAAPI ou `motion` para springs/layout). Seja qual for, um único hook/utilitário central `usePersonaMotion` que respeita as regras abaixo.

### Regras inegociáveis (spec §3)

1. Animações refletem **eventos reais** do host (estado da persona, mensagem, tarefa). Nunca acordar processo de IA para animar.
2. `prefers-reduced-motion: reduce` → trocar movimento por fade ≤ 120 ms ou estado estático; nada pisca.
3. Pausar loops quando `document.hidden` ou quando o elemento sai da tela (IntersectionObserver).
4. Estado nunca só por cor/animação: sempre texto + ícone (disponível, trabalhando, revisando, aguardando resposta, aguardando aprovação, descansando, offline, erro).
5. "zzz"/descanso **só** quando a persona não tem execução nem bloqueio pendente. Bloqueado ≠ dormindo.
6. 60 fps em máquina comum; nenhuma long task > 50 ms causada por animação.

## 3. Coreografia por superfície

**Personagens (faixa "Sua equipe neste canal" e avatares)**
- Ocioso visível: respiração 1.0→1.012 de escala em 4–5 s, defasada por persona (nunca sincronizada).
- Trabalhando: pose "trabalhando" do Brush + leve balanço + indicador de digitação nas patas/teclado (overlay SVG).
- Revisando: pose com lupa/óculos; overlay de olhar alternando.
- Aguardando resposta: orelhas em pé + balão "…" pulsando lento.
- Aguardando aprovação: pata levantada + selo âmbar com texto "Precisa de você".
- Erro: orelhas baixas + selo vermelho com texto; sem tremer infinito (uma vez, depois estático).
- Descansando: pose deitada + "zzz" SVG subindo devagar.
- Troca de estado: crossfade de pose 220 ms + pequeno "pulo" 6 px na entrada.
- Hover no personagem: inclina 2–3° e mostra cartão com papel, projeto atual e estado.

**Conversa**
- Mensagem enviada sobe do campo para a lista (translateY 8 px + fade, 220 ms).
- Streaming: texto aparece por blocos, cursor suave; avatar da persona fica em "trabalhando" durante o run.
- Cartão de tarefa citado no chat expande inline (FLIP) e abre o item real.
- "Contexto usado" abre como gaveta lateral com stagger de 30 ms por item.

**Kanban**
- Arrastar: cartão levanta (sombra + scale 1.02 + rotação 1°), colunas destacam alvo, solta com spring.
- Quando uma persona move um cartão (evento real), o mini-avatar dela "carrega" o cartão até a coluna nova (FLIP 360 ms).
- Concluir com revisão aprovada: micro-celebração de patinhas (peak-end), no máximo 1 a cada poucos segundos.

**Navegação e shell**
- Troca de canal/aba: crossfade 140 ms + deslocamento 4 px; sidebar com indicador de item ativo deslizando (layout animation).
- Toasts entram de baixo com spring; somem com fade.
- Modais: scale 0.98→1 + fade, fundo com blur leve.
- Skeletons com shimmer lilás discreto, nunca spinner genérico em tela cheia.

**Onboarding**
- Boas-vindas com a equipe de corpo inteiro entrando em fila (stagger 80 ms), Atlas acenando; uma ação primária.

## 4. Barra de qualidade (aceite de UI)

Uma tela só é "done" quando: (1) segue tokens/paleta D e usa assets do Brush; (2) passou no checklist das lentes (craft, acessibilidade AA, usabilidade, microcópia PT-BR); (3) Probe gerou screenshots claro/escuro e comparou com `dirD-tela.png`; (4) teclado completo + foco visível; (5) reduced-motion verificado; (6) sem jank (perf trace curto); (7) estado vazio, carregando, erro e cheio implementados.

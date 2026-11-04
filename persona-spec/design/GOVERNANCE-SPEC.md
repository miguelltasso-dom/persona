# Governança — especificação visual (Muse → Prism/Lumen, 03/11/2026)

Base: `persona-spec/GOVERNANCE.md` (BRIEFING 16) + `DESIGN-SYSTEM.md`. A referência `ref-quem-cuida-de-quem.jpg` é **só de estrutura**; o visual é o nosso (papel, contorno ameixa, adesivos, bichos com pose/estado, humanos com iniciais).

## Primitivos prontos (importe de `../primitives/index.ts`, não de arquivos internos)

- `OrgChart mode="chart"|"list" root groups label onSelectPersona onSelectGroup` — organograma em árvore com conectores lilás (braço direito no topo → barra → cartões de pessoa/setor → personas penduradas em cotovelo) e **modo lista** acessível (títulos por grupo + grade de cartões). Cada persona = cartão-adesivo com retrato, selo de estado ao vivo (ícones do Brush) e cargo; `aria-label` inclui o estado.
- `HealthScore level="good|attention|risk" title body illustration` — veredito geral em uma frase grande.
- `HealthItem level title detail actionLabel onAction` (dentro de `<ul>`) — achado acionável com conserto em 1 clique (primário só quando `risk`).
- `SectorIcon sector="vendas|suporte|produto|engenharia|marketing|financeiro|operacoes|pessoas|admin|conteudo|dados|juridico" size` — ícones de setor do Brush (currentColor); use no `icon` do `OrgGroup` (kind=sector), nos chips do assistente e no cartão da persona.
- `TwoDayTimeline rows slotLabels legend label` — "Teste dos 2 dias" em 4 meias-diárias por linha (continua ✓ verde · espera você ⏱ âmbar tracejado · para ✕ vermelho), motivo em linguagem simples e botão de conserto por linha.

## 1. Quem cuida de quem (tela, item do rail "Equipe")

- `Screen width="full"` + `ScreenHeader icon="equipe" eyebrow="Equipe" title="Quem cuida de quem" subtitle="5 personas e as 2 pessoas responsáveis por elas"`; ações: `Tabs` **Por pessoa | Por setor** + `IconButton` alternando **Organograma | Lista** (padrão: organograma ≥1180 px; lista abaixo disso e sempre disponível) + secondary "Teste dos 2 dias".
- Por pessoa: grupos `kind="person"` (iniciais, setor como subtítulo, selo "Fora" com `Chip warning` quando ausente, "Sem substituto" `Chip danger`). Por setor: `kind="sector"` com o ícone de setor do Brush (`icons/sectors/*`) e "3 personas · responsável: Ana".
- Persona sem responsável: grupo especial "Sem responsável" com `Chip danger` e cartão tracejado.
- Clique na persona → Perfil; no grupo → filtro/pessoa. Teclado: Tab percorre cartões na ordem visual; o modo lista é a alternativa completa para leitor de tela.

## 2. Saúde da equipe (tela ou aba de "Equipe")

1. `HealthScore` no topo, com ilustração do Brush: `equipe-saudavel` (good), `ponto-unico-falha` (risk), `voce-de-ferias` no Teste dos 2 dias. Frases curtas e humanas: "Sua equipe aguenta 2 dias sem você" / "Se você sumir amanhã, 3 coisas param".
2. `Card` "O que ajustar" com `HealthItem`s na ordem de risco: ponto único de falha · persona sem responsável · setor sem cobertura · rotina sem dono · pessoa sobrecarregada · fila sempre cheia · persona ociosa há dias. Cada um com **uma** ação ("Definir substituto", "Escolher responsável", "Dar um dono", "Subir autonomia dentro de limites").
3. `Card` "Teste dos 2 dias" com `TwoDayTimeline`; botão primário "Simular de novo" e, quando houver vermelho, o conserto em 1 clique por linha. Nunca jargão (sem "SPOF", "SLA", "escalonamento").
4. Vazio: `EmptyState` com `equipe-saudavel` e "Monte sua equipe para ver a saúde dela".

## 3. Assistente "Monte uma equipe que faça sentido" (onboarding passo 4, "Contratar persona", Equipe)

Wizard em `Modal size="l"` (ou passo do onboarding) com o mesmo stepper do onboarding:
1. **Tipo de empresa** — grade de cartões-adesivo `aria-pressed` (Agência · Loja online · SaaS · Consultoria · Criador de conteúdo · Escritório), ícone de setor + 1 linha.
2. **Setores e trabalhos que se repetem** — chips selecionáveis de setores (ícones do Brush) + lista de "toda semana eu…" com sugestões clicáveis e campo livre.
3. **Recomendação explicada** — cartões por persona sugerida (pose do bicho, cargo, setor, "cuida de: …", responsável sugerido); faixa `Card tone="brand"` com a regra em linguagem simples: "Uma persona por função que nunca acaba, não uma por tarefa. Comece com 3–5." Tarefas pontuais aparecem como chips "vira tarefa no quadro".
4. **Prévia** — `OrgChart mode="chart"` com a estrutura + `HealthScore` já com o Teste dos 2 dias aplicado; ações: primário "Contratar todas" · secondary "Contratar uma de cada vez".

## 4. Microcópia (pt-BR, sem jargão)
"braço direito", "quem responde por ela", "substituto", "está fora", "continua sozinho", "espera sua aprovação", "para". Nada de "governança", "SPOF", "SLA" na UI.

## 5. Aceite visual (Muse)
Capturas claro/escuro do organograma (pessoa e setor), modo lista, saúde com risco e com tudo bem, Teste dos 2 dias e os 4 passos do assistente; axe 0; teclado completo.

## Quem cuida de quem com muitas personas (pedido do Miguel, 04/11, Muse)

Acima de **24 personas**, o `OrgChart` vira automaticamente o `OrgMap` (`primitives/OrgMap.tsx`, teste `org-map.client.spec`). A API não muda; o Lumen só passa `scaleLabels` do locale (há padrão em pt-BR em `ORG_MAP_LABELS_PT`).

- **Árvore sem sobreposição:** a Coordenação (braço direito) fica no topo, e um tronco desce até uma bandeja tracejada com os grupos em fileiras (colunas ≈ √(grupos·1,6), de 2 a 6). Nunca uma linha infinita. É uma grade de CSS, então não há sobreposição por construção (medido: 0 sobreposições em 60 e 150).
- **Grupos recolhíveis** (por pessoa ou por setor): com mais de 40 personas, começam recolhidos, **exceto os que pedem atenção** (aguardando ou travadas), que abrem com borda âmbar e "N pedem atenção".
  - Recolhido: pilha de 6 rostos + "+N".
  - Aberto: até 8 linhas densas (rosto de 32, nome, cargo; o cargo não se repete quando é igual ao setor), depois "Mostrar mais N".
  - "Abrir todos" e "Recolher todos" ficam na barra.
- **Zoom e pan suaves:**
  - a roda move; Ctrl/⌘ + roda aproxima no ponteiro;
  - arrastar o fundo também move;
  - teclado (viewport focada): setas movem, + e − aproximam, 0 faz caber na tela;
  - controle "− 100% + · Caber na tela" no canto;
  - transições de 420 ms só em movimentos programáticos (nenhuma com reduced-motion).
- **Busca com foco:** "Encontrar persona…" é um combobox (setas e Enter) que busca por nome ou cargo, sem acento. Ao escolher, abre o grupo (mesmo além das 8 primeiras), desliza a vista até a persona centralizada, pulsa o anel âmbar duas vezes e põe o foco nela. Medido: centralização exata, Δ 0 px.
- **Minimapa** (aparece quando o conteúdo passa da vista): os grupos em blocos (âmbar = pede atenção) e a área visível em moldura. Clicar ou arrastar leva até lá.
- **Lista virtualizada:** linhas de 52 px, só as visíveis mais uma folga de 8 (medido: 20 linhas no DOM para 158), grupos recolhíveis, `aria-rowcount` e `aria-rowindex`. A busca rola até a persona e a foca.

**Capturas antes e depois** (preview isolado com 60 e 150 personas, claro e escuro): `.maestri/tmp/shots/design/orgchart-scale/`. Antes: 2 636 px de largura e 2 500 px de altura, sem busca. Depois: tudo cabe numa tela de 1 440 × 900.

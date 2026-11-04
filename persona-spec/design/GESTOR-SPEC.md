# Gestor de equipe: especificação de design (Muse)

Fonte: `persona-spec/MAESTRO.md` (BRIEFING 20; função renomeada em 04/11 para **"Gestor de equipe"**, selo curto **"Gestor"**). Dono das telas: **Prism** (editor, chat e faixa da equipe).

**Pronto para uso:**
- primitivos em `primitives/Gestor.tsx`: `GestorSettings` e `GestorPlanCard`;
- selo no cartão (`tone: 'gestor'`), marca no rail (`RailPersona.gestor`) e no organograma (`OrgPersona.gestor`);
- chegada animada (`ChannelPersonaMember.arriving`, `RailPersona.arriving`);
- glifo `UiIcon name="baton"`;
- teste `gestor.client.spec`.

**Nunca escrever "Maestro"** na UI, no código, em ids novos ou em texto.

## Princípios

1. **É uma função de confiança.** Por isso o selo é âmbar com a batuta, o único selo âmbar do cartão: a pessoa sempre vê quem pode contratar.
2. **Limites em linguagem de gente**, não números soltos.
3. **Plano antes de ação.** O padrão é "Sempre me perguntar".
4. **Chegada é um momento.** Persona nova entra andando, uma vez.

## 1. Selo "Gestor"

- **Cartão da persona:** pílula âmbar com a batuta e "Gestor", contorno ameixa, ao lado de "Coordena o time"/"Vigia".
- **Rail ("Sua equipe"):** marca redonda de 18 px com a batuta no canto **superior esquerdo** do avatar (o selo de estado fica no inferior direito). Não aparece no rail recolhido abaixo de 32 px.
- **Organograma:** a mesma marca no avatar, com "(Gestor)" no nome acessível.
- **Faixa da equipe no #geral:** batuta de 13 px antes do nome na etiqueta.

## 2. Editor de persona: interruptor e limites (`GestorSettings`)

Seção própria abaixo de "Funções", nesta ordem:

1. **Interruptor** (`role=switch`): ícone da batuta, título "Gestor de equipe" e uma frase: "{Nome} pode contratar personas, dar nome a elas e organizar onde cada uma trabalha."
2. Ligado, aparecem os limites:
   - **Quando contratar ou mudar alguém** (`ChoiceCards`):
     - Sempre me perguntar (Recomendado): "Mostra o plano no chat e espera seu ok";
     - Fazer sozinho dentro dos limites: "Contrata e organiza sem perguntar, desde que caiba nos limites abaixo";
     - Fazer e me avisar: "Faz e conta o que fez na Visão geral".
   - **Tamanho máximo da equipe:** stepper − "Até 8 personas" +.
   - **Gasto das novas personas:** segmentado Pouco · Normal · Bastante, cada um com a estimativa ("≈ 20 tarefas médias por mês").
   - **Onde pode agir:** chips "Em toda a empresa" + setores e projetos (marcar um desmarca "toda a empresa").
   - **Pode tornar outra persona Gestor de equipe:** desligado por padrão, com a dica "Desligado: só você dá essa função."
   - **Teto (sempre visível):** "{Nome} nunca cria persona com mais acesso que ele mesmo."

## 3. Chat: cartão de plano (`GestorPlanCard`)

- Postado pela Gestora como mensagem normal, com o cartão anexo (largura máxima de 560 px, `shadow-sticker`).
- **Conteúdo, de cima para baixo:**
  - olho âmbar "PLANO DO ATLAS" com a batuta;
  - o resumo em Fredoka 18 ("Vou contratar 3 personas e criar o quadro Site.");
  - o motivo em `ink-soft` ("Porque você pediu um time para o Site, e hoje ninguém cobre design.");
  - os **passos**: cada um com visual de 40 px (o retrato da persona nova, o `FlowIcon` do modelo ou um ícone), o tipo (CONTRATAR · CRIAR QUADRO · ALOCAR · SPRINT 1), o título ("Pipoca · Designer") e o detalhe ("gato · Claude · Sonnet · Figma, arquivos");
  - o custo estimado ("≈ 40 tarefas médias por mês a mais").
- **Ações:**
  - **Aprovar** (primário);
  - **Ajustar** (secundário, abre o editor do plano ou devolve a conversa);
  - **Agora não** (ghost).
- **Depois:**
  - aprovado → `ApprovedStamp` e "3 personas chegaram ao Site";
  - recusado → o cartão esmaece com "Plano recusado";
  - ajustando → "Ajustando…".
- **Auditoria:** cada ação vira uma linha na atividade, com o motivo ("Atlas contratou Pipoca (Designer) para o projeto Site, porque a fila de design estava com 6 tarefas").

## 4. Chegada das personas novas

- **Faixa da equipe (#geral):** a persona nova entra andando pela direita (760 ms, mola, um pulinho), com 180 ms entre uma e outra. Depois aparece o balão âmbar "**Pipoca chegou!**" por 3 s, e há uma rajada de patinhas (`usePawCelebration`) **uma vez** para o grupo.
- **Rail:** o avatar entra com um "pop" (0,4 → 1,12 → 1, 620 ms).
- O Prism marca `arriving: true` por 4 s depois de o host confirmar a criação. Com reduced-motion, sem deslocamento: o balão só aparece e some.

## Aceite visual (Muse, por captura, claro e escuro)

- O cartão com o selo; o rail e o organograma com a marca.
- O editor com o interruptor desligado e ligado.
- O cartão de plano pendente e aprovado.
- Um quadro da chegada (balão visível).
- axe 0, e o interruptor responde a Espaço e Enter.

# UX-PHASE nas telas do Prism: falar com quem quiser, Estou fora, autonomia visível, steer

Muse, 04/11. Itens 5, 8, 10 e 6 do `design/UX-PHASE.md`. Tudo usa os primitivos e tokens que já existem (`primitives/index.ts`, DESIGN-SYSTEM §5); o texto segue `design/MICROCOPY.md`. Regras comuns:
- axe 0 nos dois temas;
- teclado completo;
- reduced-motion com fade de 120 ms;
- nenhum controle morto.

---

## 1. Falar com quem você quer (UX-08, UX-09)

### Seletor de persona ao abrir uma DM
- **Gatilho:** "Nova conversa" (DM) e Ctrl K › "Conversar com…" abrem o seletor. **Nunca** cair direto na primeira persona.
- **Forma:** `Modal` com o título "Com quem você quer conversar?".
  - No topo, um `Input` de busca com `hideLabel`, rótulo "Buscar persona" e placeholder "Nome ou função…".
  - Embaixo, uma grade de **opções** (`role="listbox"`, uma `role="option"` por persona), em 2 colunas a partir de 560 px.
- **Cada opção** é um cartão do tamanho do `Card` `padding="s"`, com `interactive`:
  - `Avatar size={48} shape="portrait"` com `presence`;
  - nome em Fredoka 17/24 e a função em Nunito 700 13/18 `ink-soft`;
  - à direita, o `Chip size="s"` do estado da persona (Trabalhando, Descansando…).
  - Se já existe uma DM, a frase "Continuar conversa" troca a função de lugar e vai para o fim da linha.
- **Ordem:** quem você falou por último, depois a Coordenação, depois a ordem do rail.
- **Teclado:** as setas movem dentro da grade, Enter abre a DM e Esc fecha devolvendo o foco a "Nova conversa".
- **Vazio** (só a Coordenação existe): a opção da Coordenação e, abaixo, `Button variant="ghost"` "Contratar persona".

### "Quem responde" no composer
- **Rótulo:** `composer.respondsLabel` passa de "Responde" para **"Quem responde"**.
- **Dica de 1ª vez:** aparece uma vez por instalação (localStorage `persona.hint.whoResponds`, protegido por try/catch), ancorada no seletor como um balão card com contorno ameixa e `shadow-press`, raio m, seta de 8 px:
  - título Nunito 800 14: "A Coordenação distribui o pedido";
  - corpo 14 `ink-soft`: "Escolha uma persona aqui para falar direto com ela.";
  - ação `Button size="s" variant="secondary"` "Entendi".
  - **Não** rouba o foco do composer. Sai com Esc, com "Entendi" ou ao trocar o seletor, e não volta.

## 2. "Estou fora" (DF-008, DF-009, DF-010)

### No perfil da pessoa e na pílula de presença do rail
- **Controle:** o primitivo **`Switch`** (nunca um switch próprio), com o rótulo visível "Estou fora".
- **Ao ligar**, abre logo abaixo, sem modal:
  - `ChoiceCards` com a legenda "Até quando?" e as opções **Hoje às 18h**, **Amanhã de manhã** e **Escolher dia…** (que abre um seletor de data). A 1ª já vem marcada;
  - a linha de consequência, sempre visível:
    - com substituto definido: "As aprovações vão para **{substituto}** enquanto você estiver fora.", com o `Avatar size={24}`;
    - sem substituto: `Notice tone="warning"` "Ninguém foi definido para aprovar por você. As decisões vão esperar." + `Button size="s" variant="ghost"` "Definir substituto" (abre Quem cuida de quem).
- **A pílula do rail** (hoje "Conectado"):
  - fora, vira **"Fora até amanhã"**, com um ponto `accent` e contorno ameixa no lugar do verde;
  - o clique abre um popover com o mesmo Switch e a mesma consequência.
- **A volta:** ao desligar ou ao passar o prazo, a Visão geral mostra o cartão **"Enquanto você estava fora"** (já existe) no topo, uma vez. A pílula volta a "Conectado".
- **Texto:** "Estou fora" · "Até quando?" · "Hoje às 18h" · "Amanhã de manhã" · "Escolher dia…" · "Fora até {quando}" · "Voltei".

## 3. Autonomia visível (t3code §13)

### Chip junto de "Quem responde"
- **Só aparece quando foge do padrão.** O padrão é "Sugere e espera" (`propose`).
- O chip é `Chip size="s"`, com o texto de `composer.autonomy.*` (que já existe):

| Autonomia | Tom | Ícone (`UiIcon`) |
|---|---|---|
| `on-request` "Sempre pergunta" | `info` | `lock` |
| `act-within-limits` "Decide o rotineiro" | `accent` | `sparkle` |

- **Tooltip** (`Tooltip`, 400 ms): "{persona} {descrição}". Ex.: "Nina decide sozinha o que é rotina, dentro dos limites."
- **O chip é um botão:** abre a seção "O que {persona} pode fazer" do cartão da persona.

### No `PersonaInfoCard`: a seção "O que {persona} pode fazer"
- **Forma:** um bloco novo com o título Nunito 800 13 em caixa alta `ink-soft`, igual aos rótulos das outras seções, **depois** de "Quem pode falar". Usa `PersonaCardFacts` (rótulo à esquerda e valor à direita, `tone: 'danger'` para lacunas).
- **Linhas:**
  - **Autonomia:** o texto do nível + o link "Ajustar" (abre o editor no campo).
  - **Ferramentas:** até 4 `Chip size="s" tone="neutral"` + "+{n}". Sem ferramentas: "Só conversa".
  - **Alcance:** os projetos e áreas, ou "Toda a equipe".
  - **Permissões lembradas:** "{n} ativas", com o link para Segundo cérebro › Permissões. Com 0, a linha some.
- **Regra:** nada aqui é editável inline. Cada linha leva ao lugar certo, sem duplicar formulário.

## 4. Steer: falar com a persona enquanto ela trabalha (t3code §4)

O composer já fala de fila e direcionamento (`composer.modeQueue`, `modeSteer`, `hintQueue`). Falta o **balão da mensagem na fila**:
- **Forma:** o mesmo balão das mensagens da pessoa, com a borda trocada por **1,5 px tracejada**: `--persona-outline-soft` no claro e `--persona-outline-control` no escuro, para ficar ≥ 3:1. Fundo `card`, **sem** `shadow-press`, para não parecer enviado.
- **Linha de meta** (Nunito 700 12 `ink-soft`, `UiIcon` `clock` 14): **"Na fila · sai quando {persona} terminar o passo atual"**.
- **Ações** sempre visíveis, sem depender de hover: `Button size="s" variant="ghost"` **Mandar agora** (direciona) · **Editar** · **Tirar**. Com um item só na fila, os 3 ficam inline; com mais, "Mandar agora" fica inline e Editar/Tirar vão para o `MenuButton` ⋯.
- **Editar:** o texto volta para o composer, com o chip "Editando mensagem na fila · Cancelar".
- **Tirar:** sai com fade de 220 ms e Toast "Mensagem tirada da fila · Desfazer" por 6 s.
- **Ao virar enviada:** a borda tracejada vira sólida com transição de 220 ms, e a meta some.
- **Mensagem direcionada** ("Direcionar agora"): o balão enviado ganha um chip `size="s" tone="brand"` com o ícone de seta curva: **"Direcionou {persona}"**.
- **A11y:** o balão na fila tem `aria-label` "Na fila: {texto}". As ações têm nome próprio ("Mandar agora a mensagem na fila"). A região live anuncia "Mensagem na fila" e "Mensagem enviada".
- **Dependência:** o steer de verdade é do Forge (engine) e a fila salva é do Anvil. Sem eles, o balão funciona como fila local, e "Mandar agora" vira enviar.

---

## Aceite (para os 4)

1. As capturas antes e depois, claro e escuro, de cada ponto, com axe 0.
2. Os testes de teclado:
   - seletor: setas, Enter, Esc;
   - dica: não rouba o foco;
   - "Estou fora": operável só pelo Tab;
   - balão da fila: as 3 ações pelo teclado.
3. Nenhum texto novo fora do glossário. Gênero neutro.
4. O que depende de outro dono funciona de forma honesta enquanto isso: com fila local, "Mandar agora" vira enviar; sem substituto, o aviso aparece em vez da promessa.

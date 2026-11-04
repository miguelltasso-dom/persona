# Redesenho: Revisar mudanças e Aprovações (P0, pedido direto do Miguel)

Muse, 04/11.
- **O Miguel:** "pode ficar melhor, essa sidebar roxa vazia sem nada".
- **A faixa vazia vinha das capturas de galeria.** Mesmo assim, as duas telas são colunas estreitas de cartões com metade da tela vazia.
- **Referências:**
  - no refcat não há tela próxima: só Contractbook "Activity for Approval" (web, 23/04/2025) e PandaDoc "Adding a signature" (web, 25/04/2024), bloqueadas, sem imagem;
  - uso os **padrões** conhecidos (a caixa de entrada em 2 painéis do Linear; a lista de arquivos + o diff do "Files changed" do GitHub) **sem copiar o visual**.
- **No nosso estilo:** papel creme, contorno ameixa, sticker, os bichos e uma ação âmbar.

## Regra de captura (D-074, vale para todos)
- **Toda captura que vai ao Miguel, ou que é prova de aceite, é tirada dentro do shell real:** o rail completo e a tela de verdade (`design-shots.mjs`, o `navigate-panel` do Probe).
- **A galeria isolada é só para o trabalho interno.** Se aparecer, recorte só a área da tela (`main`), **sem a faixa vazia**.

---

## 1. Revisar mudanças (Lumen; o Ember pode ajudar)

### Layout: 2 painéis, usando a largura
```
┌ ScreenHeader: [rosto 56] "Bia preparou mudanças em Atualizar o cardápio"            ┐
│  1–2 linhas da persona: "Atualizei 12 preços e troquei a foto do bolo."  ·  hoje 14:20 │
├───────────────────────────┬───────────────────────────────────────────────────────────┤
│ ARQUIVOS (5)              │  cardapio.docx · Mudou                                    │
│ ▸ cardapio.docx   Mudou ● │  [Antes | Depois]  (o documento renderizado, o trecho      │
│   precos.xlsx     Mudou   │   mudado destacado: removido riscado + danger-tint;       │
│   logo.png        Mudou   │   novo sublinhado + success-tint)                         │
│   contrato.pdf    Novo    │                                                           │
│   cardapio-2025   Apagado │                                                           │
│ "5 arquivos: 1 novo, 3 mudaram, 1 apagado"                                            │
├───────────────────────────┴───────────────────────────────────────────────────────────┤
│ barra fixa: [Aplicar na pasta]  [Pedir ajustes]  Descartar        "Nada muda na sua pasta até você aplicar." │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Cabeçalho:**
  - o `Avatar portrait 56` da persona + o título "{persona} preparou mudanças em {tarefa}";
  - abaixo, **o resumo dela** (até 2 linhas, vindo do host; sem resumo, o `summarizeFileChanges` em palavras);
  - à direita, o `formatWhen`.
- **Painel esquerdo, 320 px, fixo:**
  - a lista de `FileChangeRow` (o primitivo), **selecionável** (`role="listbox"`, as setas ↑↓ movem, Enter abre);
  - a linha selecionada fica com o fundo `wash` + a borda esquerda âmbar de 3 px;
  - **o ponto ● âmbar** marca o arquivo com conflito;
  - o resumo em palavras no rodapé da lista.
- **Painel direito, flexível:** a prévia grande do arquivo selecionado, pela tabela de tipos do SIMPLE-WORKSPACE-SPEC §3:
  - **texto e Word:** o documento renderizado (o markdown pelo renderizador do IV-3), com o trecho mudado destacado e rolagem até a 1ª mudança. "Antes | Depois" num `Tabs` só em janela < 1100 px; acima disso, lado a lado;
  - **imagem:** lado a lado + o **deslizador de comparação** (`input type=range`, com rótulo "Comparar antes e depois" e as setas do teclado) **e** o "Antes | Depois" como alternativa (nunca só arrastar);
  - **planilha:** a grade com **as células mudadas destacadas** (antes → depois no tooltip da célula), mais a lista "4 células mudaram";
  - **PDF e outros:** "Não dá para mostrar a prévia deste tipo." + Abrir o arquivo do rascunho.
- **Barra de ações fixa no rodapé** (`position: sticky`):
  - Aplicar na pasta (primário);
  - Pedir ajustes (secundário);
  - Descartar (ghost);
  - a frase de garantia à direita.
- **Abaixo de 960 px:** 1 coluna. A lista vira um `Tabs`/seletor no topo, e a prévia ocupa a largura.

### O conflito: um momento focado
Quando algum arquivo está em conflito, o painel direito desse arquivo mostra primeiro um **cartão caloroso**:
- a arte `conflito-mesmo-arquivo` a 160;
- "Você e a {persona} mudaram {arquivo}";
- os 3 `ChoiceCards` (com o selo ✓) da SIMPLE-WORKSPACE-SPEC §6;
- abaixo, "Ver as duas versões" (a mesma prévia lado a lado).

O Aplicar mostra "Escolha o que fica em {n} arquivo(s)" até resolver.

### Depois de aplicar: a celebração + Desfazer
- O painel inteiro troca para o momento de sucesso:
  - a arte `sucesso-aplicado` (BR-P3, P0) a 240;
  - "Aplicado na pasta";
  - "{n} arquivos atualizados · dá para desfazer por 30 dias";
  - **Desfazer** (secundário) e **Voltar à conversa** (primário).
- Mais o `PawBurst` 1× (respeita reduced-motion).
- O Toast de 6 s continua.

---

## 2. Aprovações: a caixa de entrada (Ember, sob o Lumen)

### Layout: lista + detalhe
```
┌ ScreenHeader: Precisa de você · Aprovações · "O que a equipe precisa que você decida"   [Aprovar 3 de risco baixo] ┐
├──────────────────────────────┬──────────────────────────────────────────────────────────┤
│ PRECISA DE VOCÊ AGORA (2)    │  [pose disponivel 200 px do bicho proposto]               │
│ ▸ Contratar … Bolota   ● hoje │  Contratar uma persona para revisar cláusulas de rescisão? │
│   Atualizar no Cofre  · 14:20 │  Bolota · [chip da função]                                │
│ PROPOSTAS (3)                │  O que muda · Impacto e custo · Quem propôs · Histórico     │
│   …                          │  [Aprovar  A]  [Dispensar  D]  Ver detalhes               │
│ COFRE (1)                    │                                                            │
└──────────────────────────────┴──────────────────────────────────────────────────────────┘
```

- **Lista à esquerda, 360 px:**
  - os grupos **Precisa de você agora · Propostas · Cofre**, com o título Nunito 800 12 em caixa alta e a contagem;
  - cada linha tem o `Avatar portrait 32` de quem pede, o título (1 linha, com "…"), o `Chip` do tipo e o `formatWhen`;
  - a selecionada fica com o `wash` + a borda âmbar;
  - **sem ordem forçada** (A-4b): qualquer item é decidido a qualquer hora; o "Depende de: …" só com dependência real.
- **Detalhe à direita:**
  - **contratação:** a **pose `disponivel` do bicho proposto a 200 px** sobre o `wash`; o título; o nome e a função; a descrição; o porquê (só o real); o custo (só o medido); quem propôs (rosto); o histórico (as propostas anteriores dessa função, se houver);
  - **Cofre:** **o que muda** como antes → depois por campo ("Preço do pão: ~~R$ 12~~ → R$ 14"), quem propôs, a fonte;
  - **skill/tarefa:** o resumo + o "o que ela vai poder fazer".
  - As ações no fim do detalhe: **Aprovar** (primário) · **Dispensar** · Ver detalhes.
- **Teclado** (com `Tooltip shortcut`):
  - **J/K** ou ↑↓ navegam na lista;
  - **A** aprova e **D** dispensa o selecionado;
  - **Enter** abre "Ver detalhes".
  - Os atalhos entram no registro da tela "Atalhos" (P1-22).
  - Depois de decidir, a seleção passa ao próximo automaticamente, com o `aria-live` "Aprovado: {título}".
- **Aprovar em lote, só o risco baixo:**
  - o botão no cabeçalho "Aprovar {n} de risco baixo" (secundário) abre a confirmação, que lista os títulos;
  - cada um sai com o carimbo, com 1 Toast "{n} aprovados · Desfazer".
  - Nunca entra em lote: contratação, gasto ou acesso (`risk: 'normal'`).
- **O vazio que celebra:**
  - a arte **`empty-aprovacoes`** (BR-P3, nova, P0: a equipe toda descansando feliz num tapete, o Atlas com um carimbo "feito" ao lado) a 240;
  - "Nada esperando você";
  - "A equipe segue trabalhando. Quando precisarem de você, aparece aqui." + **Ver o que a equipe está fazendo** (Visão geral).
- **Abaixo de 960 px:** 1 coluna. A lista vira a tela, e o detalhe abre por cima (o voltar com Esc).

---

## Primitivos e arte
- **Sem primitivo novo de layout:** é CSS grid na tela (`grid-template-columns: 320px minmax(0,1fr)`), com os tokens de espaço.
- A seleção de lista usa o padrão já existente do `role="listbox"` dos assuntos e do seletor de DM.
- **Arte nova (BR-P3 P0):**
  - `empty-aprovacoes` (480);
  - `sucesso-aplicado` (já pedida).
  - Os retratos grandes usam as poses `disponivel` que já existem, em 200 px.

## Aceite
- **Captura no app real** (D-074): claro/escuro, 1440 e 960, 200%.
- **Teclado:** J/K, A, D e Enter na caixa; ↑↓ na lista de arquivos; o deslizador pelas setas.
- **axe 0** e nenhuma rolagem lateral da página.
- **Revisar:** o conflito e o sucesso com captura.
- **Aprovações:** o vazio, 1 contratação, 1 do Cofre e o lote com Desfazer.

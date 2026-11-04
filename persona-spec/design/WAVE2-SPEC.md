# Onda 2: especificação de design (Muse)

Fonte: `persona-spec/WAVE2.md` (BRIEFING 17). Régua: `DESIGN-SYSTEM.md`. Donos: Prism (a, b) e Lumen (c). A Muse entrega os primitivos e revisa por captura.

**Referências (refcat, só metadados: as telas estão bloqueadas no plano, e não invento o visual):**
- Loom, "Starting a recording" (Android e iOS, 26/07/2022): permissão, depois explicação do recurso, depois gravação;
- Beside, "Turning on recording consent" (iOS, 23/03/2026): consentimento como passo próprio, antes de gravar;
- Amie, "Adding an account" (web, 21/05/2025): "You can add more later", a segunda conta como ação secundária;
- incident.io, "Preferences · Connected accounts" (web, 25/12/2024): contas conectadas em lista, uma linha por conta.

A referência de produto dos assuntos é o Maestri Chat (7 bolinhas), que o Miguel usa e aprova.

---

## (a) Assuntos na conversa (Prism)

### Princípios

- **Cor e nome sempre.** Nunca só a cor. Sem nome dado, o rótulo é o nome da cor ("Lilás", "Âmbar"…: `SUBJECT_COLOR_NAMES` do core).
- **Não poluir.** Mostrar só os assuntos em uso: o "Geral" e os que têm mensagem ou nome. Os outros nascem pelo **+** (no máximo 7).
- Cada assunto tem o próprio fio. O composer diz para onde vai a mensagem.

### Tokens (feitos, `persona-palette.css`)

`--persona-subject-0..6` são o preenchimento da bolinha e `--persona-subject-0..6-tint` o fundo do assunto ativo. Os tokens seguem a ordem do core: lilás, âmbar, menta, rosa, céu, pêssego, tinta. Há versão para claro e para escuro.

A bolinha tem **contorno ameixa de 1,5 px** (a nossa assinatura). É o contorno que garante o contraste não textual de 3:1 contra o papel, qualquer que seja a cor.

### Barra de assuntos (`chat/SubjectBar.tsx`: apresentação Muse, dados Prism)

- Fica logo abaixo do cabeçalho da conversa e acima do fluxo, alinhada à coluna das mensagens. Altura 44 px, numa linha só. Quando não cabe, rola na horizontal com degradê nas bordas. Nunca quebra em duas linhas.
- **Pílula de assunto:** bolinha de 12 px, nome em Nunito 700 13 px, altura 32 px e padding 6/12.
  - Inativa: fundo transparente e texto `ink-soft`; no hover, `wash`.
  - **Ativa:** fundo `subject-N-tint`, contorno ameixa de 1,5 px, `shadow-press` e texto `ink`.
- **Não lidas** (só nas inativas): bolha âmbar com o número (no máximo "9+"). A pílula inativa com não lidas usa texto `ink`.
- **Persona trabalhando:** a bolinha ganha um anel na cor do assunto que pulsa a cada 1,6 s (sem pulso com reduced-motion). O texto oculto e o `title` dizem "Nina está trabalhando aqui".
- **⋯ do assunto ativo** (fora do `role=tab`, logo depois da pílula), com Shift+F10 na aba como atalho. Itens:
  - **Renomear**: edição no lugar, Enter salva e Esc cancela; até 24 caracteres;
  - **Arquivar assunto**: confirmação inline "As mensagens continuam na busca";
  - **Arquivados (N)**: lista para reabrir.
- **+ Novo assunto** (IconButton s) no fim: cria com a próxima cor livre e já abre o campo de nome. Com 7 ativos, o botão fica desabilitado, com a dica "Até 7 assuntos. Arquive um para abrir outro".
- Teclado: `role=tablist`, setas, Home e End. O foco na aba ativa é o padrão de tabs que já existe.

### Mensagem e composer

- **Mover mensagem:** ação flutuante ao lado do "+" das figurinhas, ícone de seta curva, rótulo "Mover para outro assunto". Abre uma lista das pílulas (bolinha e nome); ao escolher, a mensagem sai com fade e aparece o toast "Movida para UI · Desfazer".
- **Composer:** antes do campo vai uma bolinha do assunto ativo. O placeholder fica "Mensagem em **UI** para Nina…" ou, no #geral, "Mensagem em UI…". Assim o destino nunca é ambíguo.
- **Resposta da persona:** cai no mesmo assunto. Se chega mensagem em outro assunto, só a bolha de não lidas sobe; a tela não muda sozinha.
- **Cartão no quadro:** chip pequeno com a bolinha e o nome do assunto de origem (`ticketSubjectChip`), ao lado do responsável. Clicar no chip abre a conversa naquele assunto.
- **Busca e recall:** filtro "Assunto" com as mesmas pílulas, mais o intervalo de datas.

### Estados

- Assunto novo vazio: `EmptyState` compacto com a arte `empty-dm` e o texto "Comece o assunto **UI**: tudo o que for dito aqui fica neste fio."
- Carregando: 3 pílulas em skeleton.

---

## (b) Ensinar a persona (Prism; captura no desktop com Rivet)

A gravação **não** acontece dentro de um modal, porque o modal cobriria a própria tela gravada. O fluxo tem 5 momentos.

### 1. Entrada

- Botão **Ensinar** (ícone `ensinar`, pedido ao Brush) no cabeçalho do perfil, no ⋯ da DM e no menu ⋯ do cartão da persona.
- Rótulo completo: "Ensinar a Nina mostrando na tela".

### 2. Consentimento (`Modal` m: um passo próprio, como no Beside)

- Arte no topo, 160 px: o bicho da persona anotando (`ensinar-<animal>`, pedido ao Brush; até a arte chegar, usar a pose `pensando`).
- Título: "Mostre uma vez, e a Nina aprende o passo a passo".
- Três linhas com ícone, em linguagem simples:
  - **O que é gravado:** só a tela ou a janela que você escolher, e a sua voz se você ligar o microfone.
  - **Onde fica:** neste computador, na pasta privada da Nina. Nada sobe para a nuvem.
  - **Quem vê:** só você. Só vira skill depois que você revisar e aprovar.
- Caixa de aviso em `warning-tint`: "Feche senhas e dados de clientes antes de começar. Dá para borrar partes depois."
- Interruptor "Narrar com o microfone (opcional)", desligado por padrão.
- Retenção, em `ink-soft` 13 px: "A gravação é apagada em 30 dias. Você muda isso em Regras."
- Ações:
  - primário **"Escolher o que gravar"** (o próprio botão é o consentimento, sem caixa de seleção a mais);
  - secundário "Agora não".

### 3. Escolher a fonte (mesmo modal, passo 2)

- `Tabs`: "Tela inteira · Uma janela", com uma grade de miniaturas do `desktopCapturer` (16:10, contorno de 1,5 px; a selecionada recebe o anel âmbar).
- Primário **"Começar a gravar"**. Depois do clique, a janela da Persona se minimiza e há uma contagem de 3 s dentro da pílula.

### 4. Gravando: pílula flutuante e moldura (janela overlay always-on-top; primitivo `RecordingPill`)

- **Pílula** de 300 × 48 px, centralizada embaixo e arrastável: rosto da persona (24 px), "Nina está olhando" e um ponto vermelho (`danger`) que pulsa. Depois, o cronômetro em números tabulares, **Pausar**, **Parar** (âmbar, primário) e o microfone.
  - Fundo `card`, contorno ameixa e `shadow-sticker`.
  - Pausado: o ponto fica âmbar fixo e aparece o texto "Pausado".
- **Moldura** na área gravada: 2 px `danger` a 60% com cantos em colchete de 16 px. É discreta, mas não dá para não ver.
- Atalhos globais (só durante a gravação): Ctrl+Shift+P pausa e Ctrl+Shift+S para.
- Limite de 10 min. Aos 9 min, aviso na pílula: "Falta 1 minuto".

### 5. Estudando e revisão (tela cheia em `Screen`, não modal)

**Estudando**
- Pose `pensando` grande e a linha do tempo em 3 etapas: "Separando os momentos-chave → Transcrevendo sua narração → Escrevendo o passo a passo".
- "Pode sair, eu aviso quando terminar" vira toast e item em Visão geral.

**Revisão:** "Revise o que a Nina aprendeu", em duas colunas.
- **Esquerda, passos (primitivo `TeachStepCard`):**
  - número em selo, miniatura de 176 × 110 (clicar amplia);
  - instrução editável (Textarea de 2 linhas), mais a linha "O que conferir";
  - ações: ↑ ↓, remover e **Borrar parte** na miniatura (arrastar um retângulo);
  - no fim, "+ Adicionar passo".
- **Direita, fixa ao rolar:**
  - nome da skill (preenchido), "Quando usar", "Pronto quando…";
  - **ferramentas necessárias** em chips; uma ferramenta que a persona ainda não tem aparece como "precisa da sua aprovação" (nada é ampliado sozinho);
  - primário **"Salvar como skill candidata"**, com a explicação logo abaixo: "Candidata = a Nina testa antes de usar de verdade. Você ativa quando quiser.";
  - secundário "Descartar gravação".

**Feito**
- `MilestoneCard` com "A Nina aprendeu *Aprovar entregas*" e "Ver em Skills". Uma rajada só.

**Sem passos detectados**
- Estado vazio (arte `empty-search`): "Não consegui separar passos dessa gravação". Botões "Escrever os passos" e "Gravar de novo".

---

## (c) Várias contas por provedor (Lumen)

### Conexões

- **Cartão por provedor** (Claude, Codex, Cursor, OpenCode, Gemini, Grok, DeepSeek/OpenRouter por chave). No topo, o ícone do motor, o nome e a frase do que a pessoa ganha.
- **Uma linha por conta (primitivo `AccountRow`):**
  - rótulo editável ("Pessoal", "Trabalho");
  - chip de estado com **uma** ação: "Pronta ✓", "Entrar" ou "No limite até 18:30";
  - medidores de 5 h e semana, ou "Sem estimativa ainda" (nunca 0% inventado);
  - "Em uso por" com até 3 rostos;
  - ⋯ com Renomear, Sair desta conta e Remover.
- **Rodapé do cartão:** "+ Adicionar outra conta Claude" (secundário, como no Amie), com a explicação "Abre o login do Claude numa janela separada. Esta conta fica isolada das outras."

### Política de troca (`AccountPolicyPicker`)

- Seção "Quando uma conta chega ao limite", com 4 cartões-rádio (ícone, título e uma frase):
  - **Ficar na mesma conta:** a persona espera a cota voltar e você recebe um aviso;
  - **Passar para a próxima** (selo "Recomendado"): quando *Pessoal* chegar ao limite, usa *Trabalho* e volta quando a cota renovar;
  - **Dividir o uso:** alterna entre as contas para nenhuma chegar ao limite;
  - **Perguntar antes de trocar:** aparece em Precisa de você, e nada troca sem o seu ok.
- Escopo em `Tabs`: "Toda a equipe · Uma persona" (com seletor de retratos). A escolha da persona prevalece sobre a da equipe e aparece no editor dela.
- **Nota honesta** (`info-tint`, sempre visível): "Cada provedor tem termos de uso próprios. A Persona só usa contas que você mesmo conectou, e as senhas ficam neste computador."

### Uso e limites

- Agrupar por provedor, com uma linha por conta (o mesmo `AccountRow` em modo leitura).
- Para a conta no limite: "Volta às 18:30 · Nina passou para *Trabalho*".

### Cartão da persona e atividade

- No fato **Motor** do cartão: "Claude · Sonnet · conta Trabalho". Embaixo, em `ink-soft`, a política em uma linha ("Troca para Pessoal no limite").
- Atividade: linha com o ícone `trocar-conta`, "Nina passou para Claude · Trabalho até 18:30".

---

## Arte pedida ao Brush

- `ensinar-<animal>`: o bicho de óculos e caderninho, olhando uma tela (5 do modelo, 512 px, fundo transparente).
- Ícones no traço da marca (SVG mono, 24 px): `ensinar`, `trocar-conta`, `mover-assunto`.

## Aceite visual (Muse, por captura, claro e escuro)

- Barra com 3 assuntos (um trabalhando, um com não lidas); menu ⋯ aberto; composer com a bolinha.
- Consentimento, pílula gravando e pausada, revisão com 4 passos.
- Conexões com 2 contas Claude (uma no limite), política e nota.
- axe 0 em todas.

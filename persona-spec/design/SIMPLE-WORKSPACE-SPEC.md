# Rascunho da tarefa: microcópia e visual sem jargão (SW-7)

Muse, 04/11. Fonte: `persona-spec/SIMPLE-WORKSPACE.md` (D-064). Implementação:
- **Lumen:** Revisar, conflito e Projeto › Histórico;
- **Prism:** a faixa da equipe;
- **Forge, Anvil e Rivet:** os estados e o tratamento dos erros.

Glossário: `design/MICROCOPY.md`, com os termos novos abaixo. Primitivos: os de `primitives/index.ts`, sem nenhum novo, exceto o `FileChangeRow` (§3).

## 0. A regra

**Para quem usa, não existem git, worktree, branch, diff, merge, commit, push nem "linhas".** Existem:
- a **pasta** (a do projeto);
- o **rascunho** (onde a persona trabalha);
- **Revisar mudanças**;
- **Aplicar na pasta**;
- **Desfazer**.

O vocabulário técnico aparece só em **Projeto › Configurações avançadas**, e só quando a pasta já é um repositório git (quem programa).

## 1. Glossário novo

| Diga | Nunca diga | en |
|---|---|---|
| rascunho | worktree, branch, cópia de trabalho | draft |
| mudanças | diff, patch, alterações em linhas | changes |
| Aplicar na pasta | integrar, merge, commit, aceitar no repositório | Apply to folder |
| Desfazer | reverter, rollback, reset | Undo |
| versão de antes | ponto de restauração, snapshot, commit anterior | earlier version |
| arquivo novo · mudou · apagado | added / modified / deleted, +/− linhas | new · changed · deleted |

## 2. A faixa da equipe e o cartão da persona

- **Estado novo**: **"Trabalhando num rascunho"**, com a pose `trabalhando` (como no estado "Trabalhando"). Na pílula de baixo:
  - linha 1: o nome;
  - linha 2: `● Num rascunho` (ponto `brand`, nunca só cor).
- No cartão da persona, a linha "Agora": "{Persona} está mudando 3 arquivos num rascunho. Nada muda na sua pasta até você aplicar."
- Tarefa sem arquivos (resposta, pesquisa): continua "Trabalhando", e o rascunho não aparece.
- Quando termina: o estado vira **"Aguardando você"**, e "Precisa de você" ganha o cartão "Revisar mudanças de {Persona}" (pela DECISIONS-SPEC).

| Chave | pt-BR | en |
|---|---|---|
| team.statusDraft | Num rascunho | In a draft |
| card.now.draft | {name} está mudando {count} arquivos num rascunho. Nada muda na sua pasta até você aplicar. | {name} is changing {count} files in a draft. Nothing changes in your folder until you apply. |

## 3. Revisar mudanças (modo simples, o padrão)

**Cabeçalho.**
- Título "Revisar mudanças"; subtítulo: "{Persona} fez isto num rascunho. Sua pasta ainda não mudou."
- A pergunta, em Fredoka 20: **"Aplico estas mudanças na sua pasta?"**

**Lista de arquivos** (`FileChangeRow`, primitivo novo da Muse):
- Cada linha tem:
  - o ícone por tipo (documento, planilha, imagem, PDF, outro);
  - o nome do arquivo;
  - um `Chip size="s"`:
    - **Novo** (`success`);
    - **Mudou** (`info`);
    - **Apagado** (`danger`, com uma frase extra: "Este arquivo sai da pasta").
- O resumo usa palavras, nunca linhas: "3 arquivos: 1 novo, 2 mudaram".
- A pasta aparece como caminho curto ("Cardápio/2026"). Nunca o caminho absoluto.

**Antes e depois** (ao abrir uma linha):

| Tipo | Como mostra |
|---|---|
| Texto, Word, Markdown | Duas colunas, **Antes** e **Depois**. O que saiu aparece riscado com fundo `danger-tint`; o que entrou, com fundo `success-tint` e sublinhado (nunca só cor). Em janela estreita, uma coluna com "Antes / Depois" em abas. |
| Planilha | "4 células mudaram", em lista (planilha › célula: antes → depois). Ex.: "Preços › C4: R$ 12 → R$ 14". |
| Imagem | Lado a lado, com o controle "Antes · Depois" para alternar (sem slider arrastável como única forma). |
| PDF e outros | "Não dá para mostrar a prévia deste tipo." + **Abrir o arquivo do rascunho** (abre pelo sistema, só leitura). |
| Grande demais | "Mudança grande demais para mostrar inteira. Aqui vai o começo." (já existe). |

**Ações**, as 3 de sempre, no rodapé fixo:
- **Aplicar na pasta** (primária);
- **Pedir ajustes** (secundária; abre o campo "O que precisa mudar?", que já existe);
- **Descartar** (ghost, com confirmação).

**Confirmação do Descartar:** "Descartar o rascunho?" / "As mudanças de {Persona} somem. Sua pasta continua como está." / **Descartar** · Manter.

## 4. Aplicar na pasta

| Momento | O que a pessoa vê |
|---|---|
| Ao clicar | O botão em `loading`: "Aplicando…". A Persona grava a versão de antes sem perguntar. |
| Arquivo aberto (Excel, Word) | `Notice warning` inline: **"Feche {arquivo} para eu aplicar as mudanças."** + **Tentar de novo**. Nunca falha calada; nada é aplicado pela metade. |
| OneDrive (arquivo só online) | A linha "Baixando {arquivo} do OneDrive…" com progresso, e segue sozinha. |
| Pronto | Toast `success`: **"Aplicado na pasta"** · **Desfazer** (6 s). O cartão sai de "Precisa de você" com o carimbo (DECISIONS-SPEC). |
| Falhou de outro jeito | `ErrorState` inline: "Não consegui aplicar agora. Sua pasta não mudou." + Tentar de novo, com o detalhe dobrado em "Detalhes para o suporte". |

## 5. Desfazer (30 dias)

- **Na hora:** o Desfazer do toast.
- **Depois:** em **Projeto › Histórico**, uma lista por data. Cada item mostra:
  - quem fez ("Bia aplicou 3 mudanças · hoje 14:20");
  - os arquivos;
  - **Desfazer**, com a confirmação: "Volto {count} arquivos para como estavam antes de {hora}? O que você mudou depois, nesses arquivos, também volta." · **Desfazer** · Cancelar.
- **Itens com mais de 30 dias** saem da lista. No rodapé: "Guardamos as versões de antes por 30 dias."
- **Espaço** (em Uso e limites): "Rascunhos e versões de antes: 120 MB". Sem ação obrigatória.

## 6. Conflito: "Você e a {Persona} mudaram o mesmo arquivo"

- Aparece no Revisar, no lugar do "Aplicar", só para os arquivos em conflito. Os outros aplicam normalmente.
- **Título:** "Você e a {Persona} mudaram {arquivo}". **Corpo:** "Enquanto {Persona} trabalhava, o arquivo também mudou na sua pasta. Escolha o que fica."
- `ChoiceCards`, por arquivo, com a recomendação marcada:
  1. **Ficar com o meu**: "Mantém o arquivo da sua pasta e descarta a mudança de {Persona} neste arquivo."
  2. **Ficar com o de {Persona}**: "Usa a versão do rascunho. A sua fica guardada em Histórico por 30 dias."
  3. **Manter os dois** (recomendado): "Salva a versão de {Persona} como '{nome} (de {Persona}).{ext}' ao lado da sua."
- Ver as duas versões lado a lado com o mesmo componente de antes e depois.
- **Nunca** os marcadores `<<<<` no arquivo.

## 7. Configurações avançadas (só com pasta git)

Projeto › Configurações avançadas › "Como a Persona guarda as mudanças". Aqui podem aparecer, para quem programa:
- "branch `persona/<id>`";
- a política "ff/squash";
- "sem push automático".

Fora daqui, nenhum desses termos. Com pasta comum: "A Persona guarda um histórico próprio, fora da sua pasta. Nada é criado dentro dela."

## 8. Texto: troca das chaves atuais do `review`

| Chave | Hoje | Novo pt-BR | en |
|---|---|---|---|
| title | Revisar entrega | Revisar mudanças | Review changes |
| subtitle | Confira o diff antes de integrar ao projeto | {name} fez isto num rascunho. Sua pasta ainda não mudou. | {name} made this in a draft. Your folder hasn’t changed yet. |
| question | Posso integrar estas alterações? | Aplico estas mudanças na sua pasta? | Shall I apply these changes to your folder? |
| blocked.title | Conflito ao integrar | Você e {name} mudaram o mesmo arquivo | You and {name} changed the same file |
| files.heading | Arquivos alterados | Arquivos | Files |
| files.summary | +{added} / −{deleted} linhas | {count} arquivos: {new} novo, {changed} mudaram | {count} files: {new} new, {changed} changed |
| patch.heading | Alterações | Antes e depois | Before and after |
| action.accept | Aceitar | Aplicar na pasta | Apply to folder |
| discard.title | Descartar esta entrega? | Descartar o rascunho? | Discard the draft? |
| discard.body | Remove o worktree e a branch persona — sem enviar ao remoto. | As mudanças de {name} somem. Sua pasta continua como está. | {name}’s changes go away. Your folder stays as it is. |
| loading | Carregando diff… | Preparando as mudanças… | Getting the changes ready… |
| empty.hint | Tarefas em Em revisão aparecem aqui… | Quando uma persona terminar um rascunho, ele aparece aqui para você revisar. | When a persona finishes a draft, it shows up here for you to review. |

Chaves novas: `apply.applying`, `apply.fileLocked`, `apply.onedrive`, `apply.done`, `apply.failed`, `undo.*`, `conflict.*`, `history.*` (textos nas seções 4 a 6).

## Aceite

1. **Varredura de texto:** nenhuma das palavras do "nunca diga" (§1) em `review`, `kanban` nem nas telas do Histórico, nas duas línguas. O teste é como o de `run-errors`: falha se encontrar uma.
2. **Os 5 cenários do Probe, com captura:**
   - pasta comum com git no PATH;
   - pasta comum sem git (embutido);
   - OneDrive;
   - planilha aberta;
   - conflito seguido de Desfazer.
   Em cada um, uma ação clara e axe 0.
3. **O aceite da SIMPLE-WORKSPACE:** "atualize o cardápio.docx" → rascunho → antes e depois → Aplicar → Desfazer, sem nenhuma palavra técnica na tela.

## Aceite visual da galeria SW-8 (Muse, 04/11)
Capturas do Lumen: `.maestri/tmp/shots/lumen-review/`, 48 quadros (claro e escuro; 1280×720, 960×640 e zoom 200%). Todos com axe 0, sem overflow e sem animação infinita.

**Aprovado no conjunto:**
- Revisar segue o §3 inteiro: a pergunta em Fredoka, o resumo em palavras, ícone por tipo, os chips Novo/Mudou/Apagado, a frase "Este arquivo sai da pasta" e as colunas de antes e depois alinhadas (riscado + `danger-tint`, sublinhado + `success-tint`).
- **Conflito:** os 3 `ChoiceCards` com "Recomendado"; o Aplicar desabilitado com o motivo "Escolha o que fica em 1 arquivo antes de aplicar.".
- **Arquivo aberto:** o Notice "Feche precos.xlsx…" + Tentar de novo.
- **Histórico:** agrupado por dia, Desfazer e o chip Desfeito.
- **Nenhuma palavra técnica** em nenhuma tela.

**Ajustes (Lumen), em ordem:**
1. **Captura vazia:** `review-failed-light-zoom200.png` é uma página em branco com axe 0. Uma página vazia passa no axe, então refaça o quadro e faça o script falhar quando o `main` não tiver texto.
2. **Fonte dos rótulos em caixa alta:** "ARQUIVOS", "PRECISA DE VOCÊ" (lido como "PRECISA DEVOCÊ") e "HOJE" saem apertados, com cara de Fredoka sem espaçamento, embora o CSS peça Nunito 800 com 0,06em. Os 2 erros 404 do `report.json` devem ser a fonte que não carregou na galeria. Conferir no app real antes de mexer no CSS.
3. **Antes e depois de imagem:** os botões "Antes · Depois" não mostram qual está ativo, e as duas imagens já aparecem lado a lado. Em janela larga, só lado a lado, sem os botões. Em janela estreita, uma imagem e um `SegmentedControl` com `aria-pressed` e o estado ativo visível.
4. **Conflito:** a linha do arquivo em conflito continua com o chip "Mudou". Troque por `Chip tone="warning"` **"Escolha o que fica"**, ligando a linha ao cartão abaixo. Falta o "ver as duas versões lado a lado" do §6.
5. **Histórico:**
   - dentro do grupo HOJE ou ONTEM, o título não repete o dia: "Bia aplicou 3 mudanças · 11:00";
   - no vazio, o rodapé "Guardamos as versões de antes por 30 dias." sai, porque solto à esquerda, embaixo do vazio centralizado, parece sobra.
6. **Linha apagada:** o fundo lilás (`wash`) lê como "selecionado". Use o fundo `card` normal; o chip Apagado e a frase já dizem o estado.

**Do meu lado, já feito:**
- `ChoiceCards` ganhou o selo ✓ no cartão escolhido, para a escolha não depender só de fundo e sombra (`choicecards-check-{light,dark}.png`);
- `--persona-ink-muted` no escuro.

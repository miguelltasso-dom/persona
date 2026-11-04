# "Traga o que suas IAs já sabem": especificação de design (Muse)

Fonte: `persona-spec/BRING-YOUR-CONTEXT.md` (BRIEFING 18). Donos:
- **Prism**: onboarding, passo 2;
- **Lumen**: Conhecimento › Importar e Importadores.

Os primitivos estão prontos em `primitives/BringContext.tsx` (teste `bring-context.client.spec`): `CopyPrompt`, `PasteBox`, `FolderDrop`, `ProposalReview` e `defaultChoice`.

## Princípios

1. **Dois caminhos curtos, nenhum obrigatório**: copiar e colar, ou arrastar uma pasta. A exportação oficial (zip) fica como "Opção avançada" em Importadores.
2. **Nada é gravado sem revisão.** Tudo passa pela revisão e fica local.
3. **Linguagem de gente:**
   - "pedido", não "prompt" no título (o texto do pedido continua igual ao da spec);
   - "Cofre", não "vault" (exceto em "pasta do vault do Obsidian").
4. **Uma ação primária por vez:**
   - "Copiar pedido" no bloco 1;
   - "Organizar" depois de colar;
   - "Gravar N no Cofre" na revisão.

## Onde e como

### Onboarding, passo 2 (Sobre a empresa), Prism

- Logo abaixo do campo de descrição, um bloco recolhível **fechado por padrão**: "Já usa ChatGPT, Claude ou Gemini? Traga o que eles sabem sobre você", com o chevron e o selo "2 min".
- Aberto, os blocos ficam em coluna:
  1. `CopyPrompt`;
  2. `PasteBox`;
  3. `FolderDrop`, com o rótulo "Ou arraste a pasta do seu Obsidian".
- **Organizar** (primário, aparece quando há ao menos uma colagem ou uma pasta pronta) abre a revisão no lugar do bloco, dentro do mesmo passo, com "Voltar" para os blocos. Depois de gravar, o bloco fecha com o resumo "12 itens no Cofre ✓ · ver".
- O rodapé do onboarding (Continuar) fica igual. Pular é sempre possível, e nada se perde: as colagens ficam em rascunho local.

### Conhecimento › Importar, Lumen

- No Cofre, a aba ou o botão **Importar** abre uma tela própria (`Screen`) com duas colunas acima de 1100 px:
  - à esquerda, `CopyPrompt` e `PasteBox`;
  - à direita, `FolderDrop` e o cartão "Exportação oficial (avançado)", que leva aos Importadores.
- Abaixo de 1100 px, tudo em coluna.
- A revisão (`ProposalReview`) ocupa a tela inteira, com a barra "Gravar N no Cofre" fixa embaixo.
- Em **Importadores**, este bloco vem primeiro, e o fluxo de zip vira "Opção avançada".

## Componentes

| Primitivo | O que mostra | Regras |
|---|---|---|
| `CopyPrompt` | Passo "1"; título "Copie este pedido e mande para a IA que você já usa"; abas ChatGPT · Claude · Gemini · Outra, que **só mudam a dica** de onde colar; prévia do pedido em 4 linhas, com "Ver tudo"; **Copiar pedido** (primário) | Copiar troca o botão por "Copiado ✓" por 2,4 s e anuncia em `role=status`. Se a área de transferência falhar, abre o texto inteiro para copiar à mão. O texto vem do locale (pt e en). |
| `PasteBox` | Passo "2"; "Cole aqui a resposta"; textarea de 6 linhas; **Adicionar resposta** (secundário) | Cada colagem vira um chip verde "ChatGPT · 3.420 caracteres ✕", com a origem na aba ativa. Aceita várias, uma por IA. |
| `FolderDrop` | Área tracejada "Arraste a pasta do seu vault (Obsidian ou .md)" + **Escolher pasta** (seletor nativo) | Estados: arrastando (âmbar), "Lendo 132 notas…", pronto (verde: "128 notas de *Vault*", "4 ignorados" abre a lista) e erro (texto em `danger`). Sem `onChoose`, não há botão. |
| `ProposalReview` | Itens agrupados: Sobre você e a empresa · Regras · Decisões · Memória, com contadores | Veja abaixo. |

### Revisão (`ProposalReview`)

- **Cada item:**
  - chip do tipo;
  - os avisos;
  - o texto;
  - a proveniência ("colado do ChatGPT em 03/11", "vault: notas/clientes.md");
  - à direita, Aceitar | Descartar (segmentado), Editar (texto no lugar) e ☐ "Só para mim".
- **Padrões:**
  - item limpo → aceito;
  - **(incerto)** → aceito, mas com borda e chip âmbar "incerto", para a pessoa olhar;
  - **dado sensível** (CPF, cartão, token) → **bloqueado**: texto borrado, borda e chip `danger` com "Bloqueado: parece um CPF", e só "Mostrar e aceitar mesmo assim";
  - **conflito** com o Cofre → chip informativo "Já existe: *decisão de 02/11*". Se houver conflito com uma decisão fixada, o motor vira pergunta e não sobrescreve.
- **Barra superior:** resumo vivo ("9 aceitos · 3 pedem atenção · 2 descartados") e "Aceitar o que não tem aviso".
- **Barra inferior fixa:** **Gravar N no Cofre** (primário; desabilitado com N = 0).
- **Depois de gravar:** toast "12 itens no Cofre" e a rajada de patinhas (1×, `usePawCelebration`). Os itens privados aparecem com cadeado no Cofre.

## Cópia (pt-BR; chaves no locale do dono)

- Bloco: "Traga o que suas IAs já sabem".
- Dica pela aba:
  - **ChatGPT:** "Abra uma conversa nova no ChatGPT, cole o pedido e envie. Depois copie a resposta inteira."
  - **Claude:** "No Claude, abra uma conversa nova (de preferência num Projeto que você já usa), cole e envie."
  - **Gemini:** "No Gemini, cole o pedido numa conversa nova e copie a resposta."
  - **Outra:** "Funciona com qualquer IA que lembre de você: cole, envie e copie a resposta."
- Pasta: "Lemos só arquivos .md. Ignoramos a pasta .obsidian, a lixeira e anexos, e mostramos o que ficou de fora."
- Privacidade (linha `ink-soft` sob os blocos): "Tudo fica neste computador. Senhas, documentos e dados bancários são bloqueados antes de entrar no Cofre."

## Aceite visual (Muse, por captura, claro e escuro)

1. Onboarding, passo 2: bloco fechado; bloco aberto com 2 colagens; pasta pronta com ignorados; revisão com 1 item incerto, 1 sensível bloqueado e 1 conflito.
2. Importar: as duas colunas e a revisão com a barra fixa.
3. axe 0. Teclado: abas por setas, segmentado e "Só para mim" com Tab e Espaço.

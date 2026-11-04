# Segundo cérebro: especificação de design (Muse)

Fonte: `persona-spec/SECOND-BRAIN.md` (BRIEFING 19). Dono das telas: **Lumen**.

Pronto para uso:
- primitivos em `primitives/Brain.tsx` (teste `brain-primitives.client.spec`): `RememberPermission`, `PermissionRow`, `ChangeFeed`, `ContradictionCard`, `PageMeta`;
- ícones de tipo em `BrandIcon` (`empresa`, `pessoa`, `cliente`, `projeto`, `processo`, `regra`, `decisao`, `permissao`, `ferramenta`, `glossario`, `aprendizado`);
- a arte `ILLUSTRATIONS['bibliotecario']`.

## Princípios

1. **Quem mantém são as personas.** A tela mostra o trabalho delas ("Atlas atualizou…") e pede à pessoa só decisões: contradições, permissões e confirmação de página velha.
2. **É legível como um caderno**, não como um banco de dados. Páginas em markdown, propriedades curtas, links clicáveis.
3. **Nada some.** Revogar, descartar e substituir viram histórico.
4. **O grafo é opcional.** A lista é sempre o padrão acessível.

## Onde fica

Empresa › **Segundo cérebro** (item do rail no grupo Empresa, ícone `conhecimento-memoria`). O Cofre continua como a vista de registros do mesmo acervo.

## Telas

### 1. Início (`Screen` larga, 2 colunas acima de 1100 px)

- Cabeçalho: "Segundo cérebro", com o subtítulo "O que a equipe sabe, mantido pela equipe" e a busca (o mesmo campo grande da Busca, filtrado por tipo).
- **Coluna principal:**
  1. **O que mudou hoje**, com o `ChangeFeed`: quem (rosto do bicho ou da pessoa), verbo, página com link, chip do tipo, origem ("a partir da tarefa *Proposta Padaria Lua*") e hora. Limite de 8 itens, com "Ver tudo".
  2. **Precisa de você**: os `ContradictionCard` primeiro, depois as páginas "não confirmadas há 90 dias", cada uma com "Confirmar". Se não houver nada: "Nada para decidir agora ✓".
- **Coluna lateral:**
  - **Permissões ativas**: as 3 mais recentes em `PermissionRow` compacto, com "Ver todas (N)";
  - **Mais usadas**: 5 páginas;
  - **Por tipo**: 11 linhas, cada uma com ícone, nome e contagem. É a navegação por tipo.
- **Vazio (primeiro dia):** a arte `bibliotecario` (240 px), "O Atlas começa a organizar assim que a equipe trabalhar", e duas ações: "Trazer o que suas IAs já sabem" (o fluxo BYC) e "Escrever uma página".

### 2. Lista por tipo

- Cabeçalho com o ícone do tipo e a contagem.
- Lista de linhas: título, primeira frase, propriedades-chave em chips (ex.: Cliente → status · responsável) e "atualizada há 2 dias por Sol".
- Filtros em `Tabs`: Tudo · Minhas privadas · Com contradição.
- Alternância **Lista | Grafo** no cabeçalho (a lista é o padrão, e a escolha fica salva).

### 3. Página

- **Duas colunas.** À esquerda, o título (Fredoka 32) com o ícone do tipo, a faixa de visibilidade ("Visível para a equipe" ou "Privada: só você e Nina", com cadeado) e o corpo em markdown renderizado, com links `[[...]]` como links do app. O botão **Editar** (secundário) troca o corpo por editor de markdown com prévia.
- À direita, o `PageMeta`: a confirmação, as propriedades tipadas, "Citada em" (backlinks) e o histórico (quem editou, se pessoa ou persona, o quê e quando, com "Ver" para abrir a versão).
- **Fontes:** abaixo do corpo vai a lista de proveniência ("conversa #geral 03/11", "tarefa X", "colado do ChatGPT").

### 4. Grafo (opcional)

- Reusa o canvas. Os nós são círculos de 28 px com o ícone do tipo e o contorno ameixa; a cor do tipo vem de `--persona-cat-*`, e o rótulo fica sempre visível.
- Clicar num nó abre a página na lateral.
- Com `prefers-reduced-motion`, o layout é estático (sem física).
- O grafo nunca é a única forma de chegar a uma página: "Ver como lista" fica sempre visível.

### 5. Permissões (Empresa › Segundo cérebro › Permissões)

- Lista de `PermissionRow`: rosto, "**Sol** · responder clientes no WhatsApp", escopo e limites em uma linha, chip de validade ("Até você revogar", "Vence em 5 dias", "Venceu"), "Concedida por você em 03/11", uso ("Usada 4 vezes · última hoje 14:20") e **Revogar**.
- Revogar pede confirmação inline ("Revogar agora" em `danger` / "Cancelar") e tem efeito imediato. O toast diz "Sol vai perguntar de novo da próxima vez". A linha fica riscada, como "Revogada", e vai para o histórico.
- Filtros: Ativas · Vencidas · Revogadas.

## "Lembrar esta permissão" (no cartão de aprovação, Lumen/Aprovações)

- Abaixo dos botões Aprovar/Recusar fica o `RememberPermission`, **desmarcado por padrão** (opt-in).
- Marcado, ele mostra:
  - a frase "Da próxima vez, **Sol** não pergunta para:" e a lista: a ação em negrito, o alvo e os limites (tudo vindo do pedido, nunca ampliado);
  - **Por quanto tempo:** Só desta vez · 7 dias · Até eu revogar (padrão: Só desta vez);
  - a guarda em `ink-soft`: "Vale só para isto. Qualquer coisa maior, outro alvo ou outra persona: ela pergunta de novo."
- Ao aprovar com a opção marcada, o carimbo "Aprovado" ganha a linha "Lembrado por 7 dias · Ver em Permissões".
- Quando o gate dispensa uma pergunta, a atividade mostra "Não perguntei porque você permitiu em 03/11", com link para a permissão.

## Aceite visual (Muse, por captura, claro e escuro)

- Início com mudanças, uma contradição e permissões.
- Página com propriedades, backlinks e histórico.
- Lista por tipo.
- Grafo com a alternância para lista.
- Permissões, com a confirmação de revogar aberta.
- O cartão de aprovação com "Lembrar" aberto.
- axe 0. Teclado: o segmentado de validade por setas, Revogar e confirmar com Tab e Enter.

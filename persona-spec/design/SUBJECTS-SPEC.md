# Assuntos coloridos (WAVE2 §1) — Muse → Prism

Referência: Maestri Chat (7 assuntos). Tokens: bolinha 12px + nome 13px Nunito 600; contorno ameixa no ativo; badge âmbar para não lidas.

## Barra (`SubjectBar`)

- Acima do stream, abaixo do cabeçalho da conversa (#geral e DM).
- `role="tablist"`; cada assunto `role="tab"`, `aria-selected`, foco com setas ←→.
- Sempre **cor + nome**; tooltip repete o nome.
- Paleta fixa (índices 0–6): lilás, azul, verde, âmbar, coral, ciano, grafite (CSS `--persona-subject-0` … `--persona-subject-6`).
- Indicador de trabalho: anel pulsante discreto no tab (persona trabalhando naquele assunto).

## Vazio

Quando não há mensagens no assunto: `EmptyState` compacto "Nenhuma mensagem neste assunto ainda".

## Kanban (depois)

Cartão de tarefa mostra bolinha + nome do assunto de origem quando `ticket.conversationSubjectId` existir.

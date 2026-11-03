# Persona — quadros por projeto com fluxo e sprints próprios (Atlas/CTO, 03/11/2026)

Pedido do Miguel: um kanban único mistura trabalhos de natureza diferente (contratar pessoas ≠ fazer um site) e fica bagunçado. Cada projeto deve ter **o próprio quadro, com as próprias etapas e sprints**, e a visão global deixa de ser um quadro misturado.

## 1. Modelo

- **Fluxo (workflow) por projeto:** lista ordenada de colunas com nome, cor/ícone, limite WIP opcional e **categoria de estágio** obrigatória: `todo | doing | review | needs_you | done` (+ `blocked` como marcador). A categoria liga a coluna personalizada aos estágios do Ticket do engine — assim a puxada, o Vigia, a proatividade, "Precisa de você" e as métricas continuam funcionando em qualquer fluxo. Uma Tarefa fica numa coluna; o estágio do engine deriva da categoria (e o engine move a Tarefa para a primeira coluna da categoria correspondente quando o estágio muda sozinho).
- **Modelos de fluxo** (o usuário escolhe ao criar o projeto, edita depois; a Coordenação pode **propor** um fluxo a partir da descrição do projeto):
  - **Contratação:** Vaga definida → Busca de candidatos → Triagem → Entrevistas → Proposta → Contratado (+ Descartados).
  - **Site / produto digital:** Descoberta → Conteúdo → Design → Desenvolvimento → Revisão → Publicado.
  - **Software (sprints):** Backlog → Sprint atual → Em andamento → Em revisão → Pronto.
  - **Marketing / conteúdo:** Ideias → Roteiro → Produção → Aprovação → Publicado.
  - **Atendimento / operações:** Entrada → Em atendimento → Aguardando cliente → Resolvido.
  - **Simples:** A fazer → Fazendo → Feito. **Em branco.**
- **Sprints / fases (opcional por projeto):** iteração com nome, objetivo, datas e Tarefas; integra com `dsh-goal` (objetivo do sprint = goal da Coordenação para o planejamento automático). Backlog fora do sprint; encerrar sprint move o não concluído para o próximo ou backlog com confirmação; resumo do sprint (entregue, atrasado, quem fez o quê) vira mensagem de marco no canal do projeto (peak-end).
- **Campos por fluxo (leve):** cada modelo pode sugerir campos extras na Tarefa (ex.: Contratação → candidato, cargo, link do currículo, nota; Site → página, URL). Campos são opcionais e tipados simples (texto, link, número, data, seleção).
- **Personas por projeto:** a participação já existe; o quadro filtra e sugere responsáveis pelos cargos (ex.: "Recrutador" para Triagem).

## 2. Navegação e telas

- Sidebar **Projetos**: cada projeto abre no **seu quadro** (abas do projeto: Quadro · Conversa · Arquivos · Rotinas · Sprints). O item "Kanban" da sidebar vira **"Quadros"**: uma lista/grade de projetos com mini-resumo (contagem por categoria, sprint atual, quem trabalha agora) — nunca um quadro misturado.
- **Visão global** opcional por categoria (o que precisa de você / em andamento em todos os projetos), em **raias por projeto** recolhíveis, para quem quiser o panorama.
- **Editor de fluxo:** renomear/reordenar/adicionar colunas (arrastar), definir categoria de cada coluna com explicação curta, WIP, campos extras; prévia ao vivo; mudanças que removem coluna pedem destino para as Tarefas.
- **Sprints:** faixa no topo do quadro com sprint atual, objetivo, dias restantes e progresso; tela de planejamento (backlog ↔ sprint por arrastar); encerrar sprint com resumo.
- Visual: padrão Muse (DESIGN-SYSTEM.md); coluna com ícone/cor do fluxo; estado vazio ilustrado por coluna; FLIP do mini-avatar carregando o cartão entre colunas personalizadas.

## 3. Aceite (Probe)
- Criar projeto "Contratação" e projeto "Site": cada um com suas colunas; Tarefas de um não aparecem no quadro do outro.
- Persona conclui revisão → cartão vai para a primeira coluna `done` do fluxo daquele projeto; Attention → coluna `needs_you`.
- Editar fluxo (adicionar/renomear/reordenar/remover com destino) sem perder Tarefas; Vigia e puxada seguem funcionando.
- Sprint: criar, planejar, encerrar com rolagem do não concluído e mensagem de marco no canal.
- Coordenação propõe fluxo a partir da descrição; usuário aceita/edita.

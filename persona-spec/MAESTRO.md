# Persona — função "Gestor de equipe" (antes chamada Gestor) (Atlas/CTO, 03/11/2026; renomeada em 04/11 a pedido do Miguel — "Maestro" lembrava demais o Maestri. Nome na UI: "Gestor de equipe"; selo curto "Gestor". Não confundir com "Coordenação", que é quem responde e distribui pedidos nos canais.)

Pedido do Miguel: um agente principal, como o Atlas no Maestri, com permissão de **Gestor de equipe**: criar outros agentes (dando nomes), alocá-los onde achar necessário ou a pedido do usuário — e o usuário escolhe **quais** personas têm essa responsabilidade (uma ou várias).

## O que já existe (base)
- Função "Coordenação" (Router) atribuível; `persona_propose` (agente propõe agente) com política approval|auto e invariante "nunca mais acesso que o criador"; permissão "Recrutar"; construtor conversacional e assistente de estrutura; governança (responsável humano, setores, Saúde).

## O que a função Gestor acrescenta (first-class)
- **Gestor de equipe** é uma **função atribuível** (como Coordenação e Vigia), a quantas personas o usuário quiser; badge "Gestor" no cartão/rail/organograma. Padrão no template: a persona de Coordenação também é Gestor.
- **Ações do Gestor** (ferramentas com identidade da execução):
  1. **Contratar**: criar persona (nome, animal, cargo, setor, instruções, motor, ferramentas ≤ as dele, orçamento) — por pedido do usuário ("@Atlas monte um time para o projeto Site") ou por iniciativa (fila cheia, setor sem cobertura, Saúde da equipe);
  2. **Alocar**: colocar persona em projetos, canais, quadros e setores; definir responsável/`reportsTo`; atribuir funções (exceto dar Gestor, salvo se o usuário permitir);
  3. **Reorganizar**: mover trabalho entre personas, pausar/arquivar persona ociosa (com aviso), ajustar autonomia dentro do teto;
  4. **Montar equipe para um objetivo**: a partir de uma frase, propor equipe + projeto + fluxo + sprint 1 de uma vez (reusa recommendStructure/assistente).
- **Limites e segurança** (definidos pelo usuário por Gestor): aprovação (sempre perguntar | auto dentro de limites | auto e avisar); máximo de personas, orçamento total, teto de ferramentas/motores, setores em que pode atuar; nunca cria persona com mais acesso que ele mesmo; nunca concede Gestor sem permissão explícita; tudo auditado ("Atlas contratou Pipoca (Designer) para o projeto Site — porque a fila de design estava com 6 tarefas").
- **Vários Gestores**: escopo por setor/projeto para não brigarem; conflito (dois querendo contratar para o mesmo papel) → o primeiro propõe, o outro comenta; humano decide em empate.

## UI
- Editor de persona: interruptor **Gestor de equipe** com explicação em uma frase + limites (aprovação, máx. personas, orçamento, setores/projetos, pode conceder Gestor?).
- Chat: pedido em linguagem natural ao Gestor gera **cartão de plano** ("Vou contratar 3 personas e criar o quadro Site — Aprovar / Ajustar"); após aprovar, as personas aparecem animadas entrando na faixa da equipe e no rail.
- Atividade/auditoria do Gestor no perfil dele e na Saúde da equipe.

## Aceite (Probe)
- Usuário pede "monte um time para o Site" → plano → aprovar → personas criadas com acesso ≤ Gestor, alocadas no projeto, quadro com fluxo Site e sprint 1.
- Gestor sem permissão de conceder Gestor não consegue; limite de personas/orçamento respeitado; modo "sempre perguntar" nunca cria sem aprovação.
- Dois Gestores com escopos diferentes não interferem; auditoria registra cada ação com motivo.

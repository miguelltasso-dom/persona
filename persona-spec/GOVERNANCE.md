# Persona — governança da equipe ("Quem cuida de quem") — Atlas/CTO, 03/11/2026

Pedido do Miguel (com referência visual de um organograma "Quem cuida de quem", por pessoa/por grupo): muita gente roda "bots" sem entender a estrutura da equipe. Sem estrutura, a pessoa não tem uma empresa, tem um trabalho — se ela some 2 dias, tudo para. A Persona precisa tornar a governança **simples para quem nunca geriu equipe** e mostrar, em linguagem clara, se a equipe se sustenta sozinha.

## 1. Conceitos (poucos e claros)

- **Setor** (grupo): Vendas, Suporte, Produto, Engenharia, Marketing, Financeiro, Operações, Pessoas… (editável). Cada persona pertence a um setor.
- **Responsável humano** de cada persona: a pessoa do workspace que responde por ela (aprova, ajusta, recebe escalonamentos). **Substituto** opcional (backup) quando o responsável está fora.
- **Braço direito**: a persona com a função Coordenação, no topo do organograma.
- **Disponibilidade humana**: cada pessoa marca "fora" (férias, folga, 2 dias offline) — o sistema redireciona aprovações ao substituto, ajusta autonomia conforme a política e avisa o que vai esperar.
- **Dono de cada rotina/processo recorrente**: uma persona executa, um humano responde (sem dono = alerta).

## 2. Telas

- **Quem cuida de quem** (organograma): braço direito no topo; abaixo, os humanos responsáveis (iniciais/foto, setor) e, pendurados em cada um, as personas que eles cuidam (avatar do bicho, cargo, selo de estado ao vivo). Alternância **Por pessoa | Por setor**. Clique abre a persona/pessoa. Visual no padrão Muse (cartões com contorno ameixa, sticker, bichos), claro/escuro, acessível por teclado (modo lista).
- **Saúde da equipe** (painel em linguagem simples, nunca jargão): nota geral + itens acionáveis:
  - persona sem responsável; setor sem cobertura; rotina sem dono;
  - **ponto único de falha**: tudo depende de uma só pessoa para aprovar;
  - pessoa sobrecarregada (muitas personas/aprovações); persona com fila sempre cheia; persona ociosa há dias (talvez sobre);
  - **Teste dos 2 dias**: simula "você fica 2 dias offline" e mostra, numa linha do tempo, o que continua andando, o que espera aprovação e o que para — com 1 clique para corrigir (definir substituto, subir autonomia dentro de limites para tal rotina, delegar aprovação à Coordenação dentro do orçamento).
- **Assistente de estrutura** ("Monte uma equipe que faça sentido"), para iniciantes, também no onboarding e no botão "Contratar":
  1. Que tipo de empresa/projeto? (modelos: agência, loja online, SaaS, consultoria, criador de conteúdo, escritório…)
  2. Quais setores existem hoje e quais trabalhos se repetem toda semana?
  3. Recomendação explicada: **uma persona por função contínua** (com responsabilidades claras), **não uma por tarefa**; tarefas pontuais viram Tarefas no quadro; rotinas recorrentes ganham um dono; começar pequeno (3–5 personas) e crescer quando a fila mostrar necessidade.
  4. Prévia do organograma resultante + Teste dos 2 dias já aplicado; contratar tudo de uma vez ou um a um.
- Dicas contextuais curtas (RCD: "neutralidade é omissão", padrões bons pré-selecionados).

## 3. Regras de produto

- Toda persona nasce com responsável (padrão: quem a criou). Persona proposta por outro agente herda o responsável do criador até o humano confirmar.
- Escalonamento: persona → Coordenação → responsável humano → substituto. Fora do horário/ausência → substituto ou espera com aviso claro, nunca silêncio.
- Política por setor: autonomia padrão, orçamento, aprovações exigidas (ex.: Financeiro sempre aprova pagamentos; Suporte pode responder clientes dentro de modelos).
- Auditoria: quem aprovou o quê, em nome de quem, quando.

## 4. Aceite (Probe)
- Organograma por pessoa e por setor reflete o banco; mudar responsável/setor atualiza ao vivo.
- Saúde aponta: persona sem responsável, setor sem cobertura, rotina sem dono, ponto único de falha.
- Teste dos 2 dias com relógio falso: com substituto/autonomia configurados as rotinas seguem; sem, o painel lista exatamente o que para.
- Pessoa marcada "fora" → aprovações vão ao substituto; sem substituto → item espera com aviso.
- Assistente gera estrutura coerente para 3 tipos de empresa (snapshot) e respeita "uma persona por função contínua".

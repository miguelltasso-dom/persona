# Persona — proatividade nativa ("ninguém precisa empurrar a equipe") — Atlas/CTO, 03/11/2026

Pedido do Miguel: a principal queixa a prever é agente preguiçoso. As personas precisam trabalhar, propor e seguir sozinhas, **sem a pessoa ter que ficar cobrando** — o oposto do que vivemos montando esta própria equipe (o Atlas precisou de um heartbeat para achar agentes parados após relatar, esperando resposta). Este documento transforma esse heartbeat e as lições dele em funcionalidade do produto. Requisito de aceite da v1, não opcional.

## Lições que viraram regra (vividas neste projeto)

1. **Relatar não pode bloquear.** Quem terminou publica o Report (evento assíncrono) e puxa a próxima tarefa na hora. Esperar resposta só quando há Attention real.
2. **Responder não é despachar.** Coordenação que "responde em texto" não gera trabalho. Toda decisão de coordenação vira Ticket/Assignment ou proposta estruturada.
3. **Fila vazia é um evento**, não silêncio: dispara planejamento.
4. **Ociosidade e travamento são detectados por máquina** (Vigia), não por um humano olhando terminais.
5. **Contexto cheio, erro de conexão e prompts de confiança** derrubam agentes em silêncio — o Vigia trata como falha de infraestrutura e recupera (nova sessão com resumo/handoff, retry com backoff).

## Mecanismos

### 1. Laço de trabalho por puxada (pull)
Cada persona tem uma fila (backlog do projeto filtrado pelo que ela pode fazer). Ao terminar ou bloquear uma Assignment, o engine **imediatamente** atribui a próxima Tarefa elegível (prioridade, dependências prontas, ferramentas/permissões compatíveis, limites de concorrência e orçamento). Dependência concluída acorda as dependentes por evento (Subscription), nunca por polling caro.

### 2. Objetivos que mantêm a equipe andando
Usar nativamente `@deepseek-ai/dsh-goal` + `dsh-goal-round-driver` (continuação automática enquanto ociosa, com orçamento de rodadas) + `dsh-tool-goal`. Projeto tem objetivos; cada Tarefa grande vira um goal da executora com critério de pronto. Quando a fila do projeto esvazia e há objetivo aberto, a função **Coordenação** roda um turno de planejamento: decompõe o próximo passo em Tarefas e distribui. Sem objetivo aberto, a equipe **descansa** de verdade (zzz legítimo, sem gastar IA).

### 3. Continuação e "definição de pronto"
Ao concluir, a executora verifica o critério de aceite (testes/evidência), registra o que ficou de fora e **propõe as tarefas de seguimento** que descobriu (viram propostas ou entram direto, conforme a política). Proibido terminar em "posso fazer X se você quiser" quando X está dentro do mandato: faz e reporta.

### 4. Iniciativa (propor coisas)
- **Rotina de iniciativa** por persona (padrão diário, no horário de trabalho dela): revisa o estado do projeto e do Cofre, e propõe melhorias, riscos ou oportunidades dentro do cargo dela. Também gatilhos por evento (ex.: PR aberto, erro recorrente, prazo chegando).
- Níveis de autonomia por persona/projeto: **Só quando pedido** · **Propor** (padrão) · **Agir dentro de limites** (executa sem pedir dentro de escopo, orçamento e ferramentas; trabalho especulativo começa em "só registrar o que faria").
- Proposta = cartão estruturado em Aprovações (uma pergunta, ação primária clara, prévia do impacto e custo estimado).

### 5. Vigia (watchdog) do produto
Função atribuível (SCOPE §1). Roda agendado com modelo barato e regras determinísticas primeiro:
- persona ociosa com fila/objetivo aberto → atribui/replaneja;
- Assignment sem progresso por N minutos ou em loop improdutivo → pede status, depois reinicia com nota de recuperação;
- bloqueada esperando colega → cutuca o colega ou escala à Coordenação;
- erro de runner/conexão/contexto cheio → nova sessão com handoff (Chain of Recall) e retry com backoff;
- tudo vira linha auditável na atividade, nunca spam no canal.

### 6. Proativo sem ser barulhento nem caro
Filosofia de atenção do Super-agent + RCD: orçamento de atenção (máx. de propostas/dia por persona, agrupadas num **resumo** em vez de pings), janelas de silêncio, orçamento de tokens/execuções por persona e por projeto, "Pausar equipe". Proatividade que não gera valor perde prioridade (taxa de aceitação de propostas por persona realimenta a frequência).

### 7. Mostrar que a equipe trabalha (retenção)
Visão geral com: o que cada persona está fazendo agora, fila, tempo ocioso, entregas do dia, propostas aceitas; e o resumo **"Enquanto você estava fora"** ao abrir o app (peak-end). Estados honestos: ocioso sem trabalho ≠ travado ≠ esperando você.

### 8. Prompt e avaliação anti-preguiça
Normas de dono no prompt base das executoras (terminar, verificar, reportar com evidência, propor próximo passo, não devolver trabalho que está no mandato). Suíte de avaliação "preguiça": cenários em que modelos tendem a parar cedo (tarefa multi-etapa, erro intermediário, ambiguidade pequena) medindo conclusão e iniciativa por runner/modelo — resultado aparece como dica ao escolher modelo da persona.

## Aceite (Probe)
Gate de domínio: `measureProactivityAcceptance` (Forge, relógio falso) — corre os 6 bullets e devolve `scoreProactivityAcceptance` (6/6 ou `failed[]`). Alias `measureProactivityV1` = a mesma função (`@Remote measureProactivityV1`). Fechamento v1: `measureV1Close` junta PRO-6 + GES-6 + OPT-8. E2E + capturas = Probe.
- Com backlog e objetivo abertos, nenhuma persona fica ociosa > 1 ciclo do Vigia (relógio falso).
- Concluir uma tarefa puxa a próxima sem intervenção humana; dependência concluída acorda a dependente.
- Fila vazia + objetivo aberto ⇒ Coordenação planeja e distribui; sem objetivo ⇒ equipe descansa sem chamadas de IA.
- Runner que cai / contexto cheio ⇒ recuperação automática com handoff.
- Limites de proposta/orçamento/janela de silêncio respeitados; resumo em vez de pings.
- "Enquanto você estava fora" lista o que aconteceu, com links para as tarefas reais.

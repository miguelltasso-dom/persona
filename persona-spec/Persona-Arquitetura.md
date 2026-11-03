# Persona — equipe persistente, projetos e contexto explícito

Decisão de produto: 3 de novembro de 2026, revisão 2. Referência visual vigente: a imagem lilás enviada pelo Miguel, com animais ilustrados expressivos, rostos nas DMs e a equipe de corpo inteiro acima da conversa. Atlas é um pastor suíço branco; Bento, border collie; Nina, onça; Sol, golden retriever; Luna, gato. O mockup posterior em creme/oliva com animais mais realistas não é a direção escolhida.

## Situação real desta entrega

O diretório disponível continha apenas o núcleo independente da entrega anterior; não continha o clone nem a API original. Esta revisão preserva o núcleo de contexto e acrescenta um adaptador de kanban à API pública documentada do DeepSeek Harness, com testes usando um serviço simulado. Não é um servidor nem uma aplicação de chat pronta. O número e o resultado dos testes desta revisão estão no README do pacote.

Continuam pendentes: integração com a base anterior, banco persistente, autorização real, adaptadores do DeepSeek Harness e do AI-memory, execução de CLIs, login, UI interativa, sincronização e compartilhamento remoto. Nenhum teste desta entrega executou um provedor ou mediu sua assinatura.

## 1. Decisão central

A experiência principal é trabalhar com uma equipe de personas em canais e DMs, com kanban operacional por projeto/equipe. Agentes são entidades persistentes que participam de vários projetos. Conversa, quadro, arquivos e rotinas permanecem no centro do produto. Canvas é uma vista complementar opcional, posterior à entrega desses fluxos.

Do estudo sobre threads adotamos continuidade, recuperação de contexto e conhecimento durável. Não há uma decisão de remover conversas ou impor um modelo espacial. A discussão do Maestri é uma referência para melhorar o funcionamento, preservando o produto descrito pelo Miguel.

Não exigir que alguém desenhe um grafo para fazer uma pergunta. A entrada simples continua sendo falar com a equipe ou abrir uma DM. O sistema pode sugerir vincular o assunto a um projeto ou tarefa.

## 2. Objetos e responsabilidades

| Objeto | Conteúdo | Regra |
|---|---|---|
| Workspace | Equipe, membros, políticas e projetos | Fronteira administrativa; não equivale a acesso irrestrito |
| Projeto | Objetivo, brief, restrições, decisões e membros | Fonte do contexto obrigatório do trabalho |
| Agente | ID estável, personalidade, papel, animal, skills e aprendizados | Identidade independente do processo e do modelo |
| Participação | Agente + projeto + ferramentas + responsabilidades | Um agente pode atuar em projetos diferentes sem misturá-los |
| Canal | Participantes e assuntos coletivos | Visibilidade explícita para cada mensagem e objeto |
| DM | Pessoas e agente participantes | Conteúdo privado não passa automaticamente para canais |
| Assunto | Título, projeto, participantes, estado e eventos | Conversa delimitada e arquivável, sem ser uma nova persona |
| Tarefa | Responsável, estado, dependências e evidência | Uma só tarefa aparece no quadro, canvas e conversa |
| Decisão | Questão, valor, origem, autor, versão e vigência | Substituição explícita; conflitos relevantes bloqueiam o turno |
| Artefato | Arquivo ou referência, versão e origem | A conversa aponta para a entrega durável |
| Memória | Fato ou aprendizado com origem e escopo | Não é um comando privilegiado nem uma permissão |
| Skill | Receita versionada, ferramentas necessárias, avaliação e estado | Proposta automática; ativação segundo política e reversão |
| Rotina | Gatilho, agenda, contexto-alvo, orçamento e última execução | Cria execuções rastreáveis; não depende de uma thread aberta |
| Execução | Snapshot, pessoa solicitante, agente, modelo, ferramentas e resultado | Unidade para cancelamento, custos e auditoria |
| Relação | Origem, destino e tipo semântico | Conectar objetos não concede acesso nem inicia trabalho |
| Posição | Objeto + vista + coordenadas | Layout não determina política, memória ou ordem de execução |

## 3. Navegação e direção visual

Sidebar conforme a referência: equipe selecionada, busca, Visão geral, Projetos, Kanban, Rotinas, Canais, Mensagens diretas e Uso e limites. Canais e DMs são navegação principal. Busca global respeita o acesso de quem pesquisa.

Dentro do canal/projeto: Conversa, Quadro, Arquivos e Rotinas. Conhecimento e skills são acessíveis no projeto e no perfil da persona, sem deslocar essas abas. O Kanban global agrega somente projetos autorizados e oferece filtros por equipe, projeto, persona e estado. O Quadro local já abre filtrado no projeto atual.

Conversa e quadro representam as mesmas tarefas e revisões. Um cartão citado no chat abre o item real. Atualizações operacionais aparecem na atividade da tarefa; o canal recebe resumos de marcos úteis, sem uma mensagem por percentual. Canvas futuro reutiliza esses IDs e dados.

Manter paleta lilás, fundos claros, trilho lateral escuro e o estilo dos animais da imagem escolhida: ilustração suave, expressões amigáveis e poses de trabalho/descanso. Os rostos são avatares compactos nas DMs. Corpo inteiro fica na faixa “Sua equipe neste canal”, com os mesmos personagens. Não substituir por fotografia ou novo estilo de pelagem. Estados usam texto e ícone além da cor: disponível, trabalhando, revisando, aguardando resposta, aguardando aprovação, descansando, offline e erro. Um agente bloqueado não deve parecer dormindo; “zzz” só aparece quando não há trabalho em execução ou bloqueado que exija atenção.

Animações refletem eventos reais. Respiração e pequenos movimentos apenas nos itens visíveis; suspender na aba em segundo plano e respeitar redução de movimento. Nunca manter processos de IA acordados para animar o personagem.

O seletor de modelo permanece junto do campo de mensagem; em canal identifica explicitamente a persona cuja configuração será alterada. Uso e limites fica em tela própria. A referência enviada é um mockup estático; esta revisão não inclui nova UI executável nem nova geração de imagem. Ícones de atalho devem respeitar Windows, macOS e Linux.

## 4. Assuntos e continuidade

Usar títulos legíveis e cor como reforço, nunca como única identidade. Assuntos pertencem ao contexto de acesso e podem se vincular a tarefas. DMs privadas e canais coletivos não são abas intercambiáveis de uma mesma sessão de provedor.

Conversas contínuas por canal e DM. Tópicos secundários podem se vincular a tarefa, decisão ou entrega quando isso ajudar. Não impor sete threads nem exigir que o usuário escolha uma taxonomia antes de falar. O histórico segue pesquisável e o contexto é montado conforme projeto, tarefa e audiência.

Trocar modelo preserva agente, assunto, tarefas, histórico autorizado e decisões. A sessão de execução pode ser reiniciada e ferramentas podem mudar conforme as capacidades do modelo. Não prometer continuidade de estados internos, caches ou raciocínio oculto do provedor.

Toda resposta pertence ao run e ao assunto capturados no envio. Navegar para outra aba enquanto uma execução ocorre não redireciona a resposta. Impedir duas execuções mutantes concorrentes no mesmo assunto; permitir leitura e navegação.

## 5. Memória e montagem de contexto

Separar quatro camadas: identidade da persona; conhecimento vigente do projeto; experiência autorizada do agente naquele escopo; histórico exato do assunto. A experiência pessoal do agente também tem fronteiras de acesso: ter lembrado algo não significa poder contá-lo a outra pessoa.

Pipeline proposto:

1. Autenticar solicitante e resolver audiência, projeto e agente pelo servidor.
2. Carregar em uma transação as restrições e decisões obrigatórias vigentes, a tarefa atual e versões de política. Esse conjunto não vem de busca semântica.
3. Consultar memórias candidatas dentro das fronteiras autorizadas. O banco ou gateway filtra antes de retornar conteúdo.
4. Verificar autorização de leitura e de divulgação no destino; verificar também as fontes de resumos e aprendizados derivados.
5. Detectar decisões obrigatórias contraditórias e falta de contexto necessário. Pedir resolução ou informar bloqueio.
6. Reservar orçamento para instruções do sistema, ferramentas, mensagem atual e resposta; entregar o saldo ao compilador.
7. Incluir contexto obrigatório completo; preencher o restante com material relevante. Se o obrigatório não couber, interromper e apresentar a limitação, sem removê-lo silenciosamente.
8. Registrar manifesto de IDs, versões, política, audiência e orçamento. Revalidar políticas e versões imediatamente antes do despacho; invalidar ou cancelar quando houver revogação.
9. Executar no adaptador escolhido e registrar resultado, entregas e medições disponíveis.

Restrições de acesso e ferramentas são aplicadas no servidor/gateway. O texto do prompt não substitui autorização. Uma decisão do projeto só prevalece dentro da hierarquia de instruções e políticas; uma memória importada não recebe autoridade de sistema.

Busca semântica continua útil para descoberta. Ela complementa recuperação determinística por ID, projeto, tarefa, assunto e data. Não é condição necessária para recuperar uma decisão fixada.

A seleção explícita torna o contexto inspecionável; não garante que um modelo obedecerá ou interpretará corretamente. Exibir “Contexto usado” e links para as fontes permite corrigir a seleção. Medir recuperação e resultados em cenários reais.

### AI-memory do Akita

Usar como adaptador de memória, não como árbitro de permissões. A configuração real e o contrato da instalação precisam ser confirmados na integração. Se o backend só isola por projeto, provisionar namespaces separados para workspace/projeto/agente e fronteiras privadas, com IDs resolvidos pelo gateway.

Os agentes não recebem uma chave ampla nem escolhem livremente nomes de projetos do serviço. Se a API não permitir uma busca com isolamento suficiente, consultar apenas namespaces autorizados; não pesquisar tudo para depois remover resultados na UI.

Guardar na base da aplicação a origem, vigência e classificação. Resumos herdam a interseção das permissões de suas fontes, inclusive após revogação. Publicar uma síntese de DM para o time exige uma ação de compartilhamento explícita ou uma política previamente configurada para aquele conteúdo e destino.

## 6. Recall

Contrato de aplicação: consultar assunto, intervalo de datas com fuso explícito, tipos de eventos e cursor estável. Retornar texto original, ID da mensagem, timestamp e referências, com paginação. Não substituir a consulta exata por uma resposta inventada de um modelo.

Uma futura ferramenta `persona_recall` recebe assunto e filtros, mas agente, workspace, usuário e fronteiras de acesso vêm da execução autenticada. Respostas citam as fontes recuperadas. Busca por tema pode sugerir eventos; datas e IDs selecionam os registros exatos.

Separar mensagens legíveis, evidências de ferramentas, logs operacionais e artefatos. Recall de conversa não injeta o terminal inteiro; evidência técnica é solicitada quando necessária. Não armazenar nem prometer acesso a raciocínio privado dos modelos.

O arquivo é durável, com política de retenção e exclusão documentada. Arquivar não apaga; excluir não deixa o conteúdo acessível por resumo, índice ou cache. Agentes também precisam perder acesso às derivações quando suas fontes são revogadas.

## 7. Execução e preservação do Harness

Base confirmada: https://github.com/deepseek-ai/deepseek-harness. A arquitetura pública foi inspecionada nesta revisão: Cordis compõe plugins para modelos, ferramentas, log, loop, streaming e políticas. Preservar esse runtime e estender pelos pontos documentados. Ainda é necessário recuperar o checkout/commit exato da base usada anteriormente; ler o upstream não equivale a executar nem integrar o projeto local.

O Harness já fornece `ctx.agentTeams`, tarefas duráveis, dependências acíclicas, revisões compare-and-set e ferramentas para membros do mesmo runtime. Reutilizar esses mecanismos. A camada Persona dá identidade persistente, vínculo por projeto/equipe, apresentação e extensões que faltam; não substitui o loop por uma implementação paralela.

Adicionar uma camada de domínio em volta dos adaptadores, em vez de espalhar identidade, memória e permissões pelo processo do provedor. Contrato sugerido: capabilities, authenticate, startTurn, streamEvents, cancel, usage e health. Recursos não suportados aparecem como indisponíveis.

O login pertence à pessoa; o agente tem uma política de seleção de harness/modelo, e a execução resolve uma conexão autorizada. Compartilhar a persona não compartilha a assinatura. Credenciais ficam no cofre do sistema, não nas memórias, arquivos exportados, prompts ou canvas.

Claude Code, Codex e OpenCode devem ser integrados pelos caminhos concretos suportados por suas ferramentas, após validação da versão instalada. Preservar login nativo onde aplicável. Não reimplementar login capturando senha nem assumir que toda assinatura é uma API genérica.

Construir o contexto com prefixo estável e ferramentas mínimas por turno. Benchmarkar processo novo versus processo reutilizado sob lease restrito a agente + projeto + audiência + conexão. Reutilizar processo só se houver isolamento, invalidação e cancelamento corretos; não reaproveitar sessões privadas em canais. O módulo atual não executa nenhum desses processos.

Troca de modelo acontece entre turnos; cancelar e reiniciar explicitamente se solicitada durante uma execução. Impedir fallback silencioso para outra conexão paga. Informar as diferenças de capacidade que afetam a tarefa.

## 8. Colaboração, kanban e rotinas

Handoffs estruturados levam tarefa, objetivo, IDs de decisões, evidência e próxima ação. Referências só são resolvidas após autorização do receptor. Um agente que não pode ler um artefato não ganha acesso por recebê-lo numa mensagem.

Usar limites por job: orçamento, tempo, profundidade e número de handoffs. Idempotência, deduplicação, lease de tarefa e detecção de ciclo evitam loops e execução duplicada após reconexão. Uma relação no canvas exige uma ação explícita de delegação para iniciar trabalho.

Kanban é requisito central, com operações rotineiras autônomas: criar, detalhar, dividir, assumir, iniciar, atualizar, registrar bloqueio, solicitar revisão, concluir e reabrir. Essas operações dentro do projeto autorizado não pedem aprovação humana a cada movimento. O coordenador distribui trabalho; os donos atualizam sua execução. Ações externas continuam sob a política de ferramentas configurada.

Colunas do produto: a fazer, em andamento, em revisão, bloqueado e concluído. Cada cartão traz responsável, revisão, próxima ação, dependências, evidência e atividade. Critério de conclusão e revisão são específicos da tarefa; não impor aprovação humana universal.

Compatibilidade real: o board nativo tem `pending`, `in_progress`, `completed` e `deleted`. O adaptador entregue projeta esses estados, bloqueio por dependência e rótulos de persona. “Em revisão”, bloqueio manual, checklist e progresso estruturado exigem eventos/extensões próprias; não fingir que existem no enum nativo nem marcar `completed` apenas para mover uma coluna. A atividade de revisão pode começar como tarefa explícita vinculada, até a extensão estar pronta.

Cada board nativo pertence a uma root Session. A aplicação mantém um vínculo persistente entre equipe/projeto e root; as sessões executoras são vinculadas às personas. Um quadro global agrega referências completas `(equipe, projeto, root, task-id)`, pois `task-1` pode existir em vários quadros. Não usar a root como identidade da persona.

O Harness permite que membros criem e assumam tarefas; o proprietário ou Lead faz mutações autorizadas, e somente o Lead reatribui. A camada Persona deve respeitar isso e encaminhar delegação ao coordenador explicitamente, registrando solicitante e executor. Não trocar silenciosamente um agente pelo Lead para contornar a regra.

Atualizações usam a revisão esperada. Em conflito, reler a tarefa e decidir sobre o estado atual; não sobrescrever o trabalho do colega. O adaptador não faz retries automáticos. `TEAM_TASK_PERSISTENCE_UNCONFIRMED` exige reconciliação: a tarefa pode já estar visível, e repetir uma criação pode duplicá-la. Se a mutação confirmou mas a resposta ficou indisponível, o adaptador sinaliza `TASK_COMMITTED_RESULT_UNAVAILABLE`.

Atualizar o quadro nativo não acorda agentes ociosos. Handoff é um job/mensagem explícita com deduplicação e orçamento. Pausa, cancelamento e saída de processo não liberam automaticamente o dono nativo; a aplicação precisa de reconciliação visível, sem abandonar cartões silenciosamente.

### Skills próprias e evolução

Cada persona possui catálogo próprio com ID estável, receitas, versões, fontes, resultados de avaliação e versão ativa. Trocar modelo não troca o catálogo. Separar skill da persona, skill do projeto e skill compartilhada da equipe, com origem e permissões preservadas.

O agente pode criar e revisar receitas da própria atuação, testar uma candidata e ativá-la conforme a política escolhida pelo usuário. Uma política de autoevolução pode liberar melhorias próprias verificadas sem confirmação a cada edição. Alterar ferramentas, credenciais ou limites não é efeito de editar uma skill. Skills propostas ou importadas nunca ampliam acesso por conta própria.

Fluxo: identificar aprendizado → criar versão candidata → avaliar em exemplos/tarefas pertinentes → ativar conforme política → observar resultado → reverter se piorar. Evitar avaliação que apenas repete o texto da receita. Não afirmar que a autoevolução está implementada: nesta revisão há especificação, sem executor nem catálogo persistente de skills.

Compartilhar uma skill com outra persona/equipe é uma promoção explícita de escopo. Skill derivada de DM não vira receita pública automaticamente; suas fontes continuam sujeitas à política de proveniência.

Rotinas usam o mesmo pipeline de contexto, autorização e orçamento. Guardar fuso, próxima execução, chave de idempotência, retry com backoff, janelas de silêncio e lease. Triggers não precisam de um modelo caro só para verificar se há trabalho. “Pausar equipe” impede novos runs e cancela os ativos conforme capacidade, mostrando cancelamento pendente quando necessário.

## 9. Desempenho e observabilidade

Preferir processo de domínio fora da UI, armazenamento local transacional, índices por workspace/projeto/assunto/data e streaming incremental. Canvas renderiza objetos visíveis, conexões sob demanda e níveis de detalhe; o modo lista continua disponível no celular e por teclado.

Cache exige namespace por pessoa, audiência, agente, projeto, versão de política e snapshot. Na integração, acrescentar modelo, tokenizer, instruções e ferramentas ao fingerprint do prompt. Não reutilizar um cache de contexto depois de revogar a permissão. Ordenação estável pode ajudar o cache do provedor, mas não garante economia.

Não manter todos os agentes em loops contínuos. Agendar por eventos, limitar concorrência global e por projeto e respeitar os limites das conexões. Interface pode mostrar “descansando” sem consumir chamadas de IA.

Uso e limites fica em página própria: pessoa/conexão, provedor, janela, origem da medição, atualização e horário de reset. Mostrar separadamente consumo medido, estimativa e quota oficial disponível. Ausência de dado não vira 0%. Não inferir limite de assinatura a partir de tokens de uma resposta.

Medir p50/p95 de abertura local, resposta visual ao clique, primeiro evento do runner, primeiro token, bytes de contexto, chamadas por tarefa concluída, cache e RAM. Comparar com a base em hardware identificado antes de prometer velocidade superior. Um roteiro de benchmark deve incluir 1, 4 e 8 projetos e diferentes tamanhos de canvas.

## 10. Migração e onboarding

Fluxo: importar exportação → escolher equipe/projeto/agente → ver prévia → classificar privacidade → confirmar → processar em segundo plano. Conservar a origem e IDs externos para deduplicação. Permitir rollback da importação e reprocessamento sem duplicar dados.

Importar conversas como arquivo pesquisável. Extrair candidatas a preferências, decisões e skills; marcar como propostas até revisão ou política específica. Não colocar toda a conversa na janela do modelo nem converter todo texto em memória ativa.

Imports de Grok-bot ou outros agentes precisam de adaptadores para formatos reais disponibilizados pelo usuário. Não afirmar compatibilidade universal. Preservar anexos e links quando a exportação trouxer esses dados; indicar perdas. Nunca importar cookies, tokens ou senhas junto da persona.

No primeiro uso, criar projeto + Atlas e abrir uma conversa. Apresentar canvas quando houver relações úteis, sem uma aula obrigatória de organização espacial.

## 11. Entrega incremental e critérios de aceite

| Etapa | Resultado | Aceite |
|---|---|---|
| A — esta revisão | Direção lilás preservada, arquitetura, contexto/recall e ponte para board nativo | 29 testes locais; runtime nativo simulado, integração não alegada |
| B — integrar a base | IDs estáveis, repositórios, autorização e manifesto por turno | Reinício e troca de modelo preservam assunto; acesso revogado deixa de funcionar |
| C — experiência principal | Conversa, DMs, quadro por projeto/equipe, arquivos e rotinas | Uma tarefa atualiza conversa e quadro; canais e DMs mantêm continuidade |
| D — execução real | Harnesses, credenciais locais, cancelamento e uso | Smoke tests por CLI e conexão reais; dado ausente aparece como indisponível |
| E — colaboração | Convites, rotinas, handoffs e skills | Nenhuma DM ou derivação chega ao amigo; jobs são limitados e idempotentes |
| F — migração e desempenho | Importadores e otimização medida | Preview/rollback; benchmarks repetíveis; revisão por teclado e redução de movimento |
| G — vista complementar | Canvas opcional sobre os mesmos objetos | Acrescenta relações úteis sem substituir navegação ou kanban |

Testes de integração obrigatórios: tentativa de leitura entre projetos; agente diferente; amigo sem acesso; DM derivada em resumo; revogação durante run; obrigatório maior que o orçamento; decisões contraditórias; mudança de modelo; resposta com aba trocada; retry de rotina; ciclo de handoffs; alteração simultânea de tarefa; exclusão de fonte e caches.

## 12. Referências verificadas

- Maestri, documentação “Maestri Chat”: https://www.themaestri.app/en/docs/chat — consultada em 03/11/2026. Confirma sete assuntos de cores fixas por terminal, registro independente do processo, recuperação por datas e alternância entre chat e terminal. Essa documentação não demonstra, sozinha, superioridade universal do canvas nem fundamenta todas as frases atribuídas ao criador no texto recebido.
- Tucano, repositório e README: https://github.com/eduwxyz/tucano — consultados em 03/11/2026. Referência para canais, ferramentas MCP, rotinas, memória e execução por CLIs. Não houve cópia de código nesta entrega. Reuso futuro exige confirmar licença, versão e atribuição aplicável.
- T3 Code, README e arquitetura: https://github.com/pingdotgg/t3code e https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md — consultados em 03/11/2026. Referências para fronteira entre cliente/servidor, adaptadores de provedores, comandos, eventos, recibos e efeitos após commit. Não substitui a base DeepSeek.
- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md e https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md — arquitetura, board e tipos públicos inspecionados em 03/11/2026. `kanban-bridge.mjs` usa esse contrato por injeção; não foi montado num runtime DSH real.

O documento `Referencias-e-Integracao.md` separa o mecanismo observado em cada projeto da adaptação proposta para Persona e registra os limites conhecidos.

As decisões específicas do Persona neste documento são propostas de produto e engenharia, não funcionalidades atribuídas aos projetos citados.

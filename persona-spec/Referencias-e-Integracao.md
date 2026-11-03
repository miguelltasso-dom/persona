# Persona — referências, decisões e integração

Revisão 2, 03/11/2026. Orientação confirmada pelo Miguel: conservar os animais ilustrados da imagem lilás; conversa, canais, DMs e quadro operacional por projeto/equipe; memória e skills próprias por persona. O estudo sobre threads orienta continuidade, não uma troca obrigatória de interface.

## O que aproveitar de cada referência

| Referência | Observado na fonte primária | Adaptação para Persona |
|---|---|---|
| DeepSeek Harness | Plugins Cordis, ferramentas, loop, eventos e board durável por root Session | Base de execução preservada; plugins de identidade, contexto, kanban, skills e UI |
| Tucano | Equipe em canais, menções, memória, skills propostas, rotinas e CLIs locais | Fluxo principal de equipe com DMs, atribuições, rotinas e conexões escolhidas por agente |
| Maestri | Chat sobre terminal, registro independente do processo e recall por intervalo | Continuidade mesmo após troca de modelo/processo; terminal acessível e contexto recuperável |
| T3 Code | Servidor dono da execução, clientes RPC, adaptadores e estado durável por comandos/eventos | Uma execução observável em todas as vistas; clientes leves, reconexão e controle remoto consistente |

Essas são adaptações propostas. Não foram copiados os projetos inteiros nem integradas suas aplicações nesta revisão. Não atribuir a eles os animais, a identidade persistente do Persona ou a UI final.

## Separação para evitar execução duplicada

Persona controla entidades, projetos, canais, tarefas e permissões. DeepSeek permanece a base extensível. Porém uma CLI de assinatura já traz seu próprio loop de agente; não tratá-la automaticamente como endpoint de modelo bruto.

Prever dois modos explícitos por executor:

1. **DSH direto:** o loop DSH controla inferência e ferramentas, usando um adaptador de modelo compatível e sua conexão.
2. **CLI delegada:** um adaptador controla a CLI nativa autenticada, que executa o turno. Persona/DSH coordenam a delegação e traduzem eventos/ferramentas pelas interfaces suportadas, sem um segundo modelo narrando cada passo da CLI.

Não montar um loop que chama um modelo para pedir a outra CLI que chame outro modelo em cada ação. Isso pode aumentar custo, latência e contexto. A escolha de runtime e conexão precisa ser visível; suportar uma CLI não implica suportar integralmente todas as capacidades internas do DSH naquela rota.

Agentes externos precisam de uma integração legítima com a árvore e o serviço de ferramentas DSH. O bridge exige um `Agent` real fornecido pelo host, nunca um objeto de identidade forjada. A interface não recebe tokens, caminhos livres de credenciais ou a autoridade do coordenador.

## Kanban com autonomia operacional

Fluxo do produto: pedido no canal → decomposição em tarefas → cada persona assume e atualiza o trabalho → revisão por outra persona quando pertinente → evidência e conclusão. Reabrir quando a revisão falhar. O humano intervém onde a tarefa ou política exigir, sem autorizar cada mudança de coluna.

Usar comandos estruturados. A frase “estou fazendo” pode acompanhar o cartão, mas não substitui uma mudança registrada. Registrar atualizações de etapa, bloqueio, próxima ação e entrega; juntar atualizações muito frequentes de progresso para não poluir o canal nem gastar chamadas só para narrar o quadro.

O board do Harness é uma boa base, com limites reais:

- Root Session define o board; o produto precisa mapear roots para equipes/projetos persistentes.
- O runtime nativo só compartilha trabalho dentro da mesma árvore/processo. Colaboração entre instâncias e acesso de amigos exigem a camada autenticada da aplicação.
- Estados nativos não incluem revisão nem bloqueio manual. Extensões precisam de eventos, versão, replay e critérios claros de conclusão.
- Só o Lead reatribui tarefas no contrato atual. Um agente pode solicitar o handoff; o coordenador aplica e registra a solicitação.
- Mudanças de tarefa não acordam agentes; mensagem/job de handoff é explícito e deduplicado.
- A projeção nativa publica o quadro inteiro em mudanças. Para escala, acrescentar paginação/projeções e medir custo; não afirmar que já existe sincronização por delta.
- Interromper ou encerrar um agente não libera seu dono automaticamente. Recuperação e reatribuição precisam ser visíveis.

O adaptador desta revisão reaproveita o contrato existente e não introduz outra base autoritativa de tarefas. Para recibos duráveis de comandos e novas colunas, definir a fronteira transacional antes de introduzir uma segunda gravação. Evitar dual-write ingênuo entre banco da aplicação e log DSH.

## Skills próprias

Cada persona conserva seu catálogo ao trocar modelo ou encerrar processos. Receitas são versionadas, têm origem, escopo, versão ativa e avaliações. Acesso a uma skill compartilhada é diferente de ser seu dono.

A autoevolução atua dentro de uma política configurada: a persona propõe, testa, ativa melhorias próprias permitidas e pode reverter. Publicação para equipe, promoção de escopo ou ampliação de ferramentas são operações distintas. Aprendizados de DMs mantêm suas fronteiras de divulgação. Migração importa receitas como candidatas, com prévia e deduplicação.

## Ordem de implementação

1. Recuperar checkout original, fixar versões e montar os plugins nativos.
2. Persistir identidades e vínculos projeto/root/session; validar autorização por operação.
3. Integrar `kanban-bridge.mjs` ao serviço real e registrar ferramentas com identidade da execução.
4. Entregar conversa, DMs e quadro lilás com eventos do mesmo estado persistente.
5. Adicionar metadados de revisão/bloqueio, recibos, handoffs e recuperação após falhas.
6. Ligar catálogo de skills, memória individual e AI-memory; avaliar autoevolução.
7. Integrar CLIs, login nativo, uso e limites reais; medir latência e overhead por rota.
8. Rotinas, importadores e colaboração remota; canvas opcional depois dos fluxos principais.

## Fontes inspecionadas

- DeepSeek: [arquitetura](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), [Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md), [contrato de tipos](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/team/agent-team/src/types.ts), [referência do pacote](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/team/agent-team/README.md).
- Tucano: [README](https://github.com/eduwxyz/tucano/blob/main/README.md).
- Maestri: [chat e recall](https://www.themaestri.app/en/docs/chat).
- T3 Code: [README](https://github.com/pingdotgg/t3code/blob/main/README.md), [arquitetura](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md), [providers](https://github.com/pingdotgg/t3code/blob/main/docs/internals/providers.md).

Fontes lidas em 03/11/2026; referências móveis, sem clone local. `Upstream-References.json` registra SHAs de blobs lidos para reprodução da análise. Um SHA de blob identifica o arquivo, não um commit integral nem um teste de compatibilidade.

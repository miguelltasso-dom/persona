# Atenção para o desktop

`persona.attentionEvents({workspaceId,projectId},signal)` envia `baseline` inicial, `upsert` com novos eventos e `resolved` com `eventIds` removidos da fila atual; o último tem `events:[]`. O desktop cancela avisos ainda pendentes desses IDs. `ackAttention` também remove o ID e produz `resolved` no próximo ciclo, inclusive quando a confirmação veio de outro cliente.

Os eventos de Tarefa incluem `id`, `kind`, `title` (título da Tarefa), `ticketId`, `threadId` (assunto/fio original), `streamId`, `personaId`, `personaName` (nome dado à persona) e `at` persistido. `question` inclui `question`; `failed` inclui `code` de RUN-ERRORS-SPEC. Esses campos são opcionais no DTO para compatibilidade com avisos de dead-letter antigos; as novas emissões por Tarefa os preenchem.

`avatarId?` identifica o recurso da galeria quando a persona usa um ID simples (letras minúsculas, números e hífen). Uploads, caminhos locais e referências externas não entram no evento. O desktop procura o recurso empacotado e usa o ícone padrão quando não existir; o nome continua sendo personaName, independente do animal escolhido.

`question` representa a pergunta direta ainda pendente. `needs-you` representa bloqueio/decisão. `failed` representa falha, preservando o código estruturado do aviso do runner. `review` representa revisão pendente. `done` só aparece para a pessoa que originou a Tarefa, depois de concluída ou integrada; rotina ou pedido de outra pessoa não gera esse evento. O acesso à DM continua restrito aos participantes originais.

IDs de pergunta, falha e revisão incluem o episódio de atenção/Assignment; conclusão usa o ID da Tarefa. Assim, um novo bloqueio depois de retry pode avisar novamente, enquanto releitura/reconexão mantém o mesmo ID. O stream não corta itens por orçamento ou silêncio: foco, janela de silêncio, resumo e orçamento de done/review pertencem ao desktop, que mantém os pendentes. As políticas continuam disponíveis em getAttentionPolicy.

`ApprovalView.reason` expõe `proposal.spec.description` nas contratações. Aprovações pendentes incluem `routedToId`, `onBehalfOfId` (também `onBehalfOf` para os consumidores existentes) ou `waitNotice`; decideApproval revalida a disponibilidade e registra ator, delegação e decisão. Sem substituto disponível, a decisão retorna `approval-waiting` e mantém a proposta pendente.

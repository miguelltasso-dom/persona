# Persona — contexto e ponte de kanban para integração

Entrega independente da base anterior, ausente no diretório desta sessão.

- `Persona-Arquitetura.md`: decisões de produto, UX, isolamento, execução e plano de integração.
- `context.mjs`: compilação de contexto e filtragem de recall sobre snapshots fornecidos pela aplicação.
- `context.test.mjs`: 14 testes locais sem dependências externas.
- `kanban-bridge.mjs`: adaptador para o contrato documentado de `ctx.agentTeams` do DeepSeek Harness.
- `kanban-bridge.test.mjs`: 15 testes do adaptador com serviço nativo simulado.
- `Referencias-e-Integracao.md`: mecanismos aproveitáveis de DeepSeek, Tucano, Maestri e T3 Code.

## Executar os testes

Requer Node.js com `node:test`, `structuredClone` e ES modules (Node 22+ recomendado para este pacote).

```sh
node --test context.test.mjs kanban-bridge.test.mjs
```

## Contrato de integração

`compileContext({scope, snapshot, budgetTokens, countTokens, authorize})` retorna texto de dados serializado, manifesto e chave de cache. Não envia instruções ao modelo. O integrador fornece o tokenizer correto e envolve o conteúdo na hierarquia de instruções apropriada. O orçamento já deve descontar sistema, ferramentas, mensagem e saída reservada.

`scope` exige `workspaceId`, `projectId`, `agentId`, `actorId`, `audienceId` e `policyRevision`, todos strings não vazias. Eles vêm de autenticação, ACLs e do run do servidor; não usar IDs ou permissões vindos livremente de prompts ou do navegador.

`snapshot` exige `revision`, `requiredIds` e `records`. O repositório deve fornecer o conjunto completo de decisões/restrições obrigatórias vigentes em um snapshot transacional; este módulo não consegue detectar um registro que o repositório omitiu de `requiredIds`.

Cada record possui `id`, `workspaceId`, `projectId`, `revision` inteira positiva, `kind`, `status`, `body` string e `sourceIds` array. `agentId` é opcional: sem ele, o registro pode ser do projeto, ainda sujeito à ACL. Kinds: `constraint`, `decision`, `brief`, `task`, `skill`, `memory`. Somente status `active` participa.

Campos opcionais: `pinned` boolean, `relevance` numérica e `factKey` string. O repositório atribui chaves canônicas a decisões mutuamente exclusivas; não confiar num modelo para inventar chaves de modo consistente. Fatos obrigatórios de mesma chave e textos diferentes bloqueiam a compilação. Uma memória opcional contraditória não os substitui. Isso não detecta contradições semânticas arbitrárias no texto.

`authorize(record, scope)` é uma função assíncrona confiável que deve retornar exatamente `true` para permitir o registro. Ela verifica leitura pelo solicitante, uso pelo agente e divulgação para a audiência atual, incluindo visibilidade de DM/canal. Sua lógica não está implementada neste pacote. Conteúdo derivado só participa se todas as fontes transitivas também forem legíveis e ativas. Fontes ausentes ou cíclicas fecham o acesso. A aplicação deve materializar a closure de proveniência para o snapshot.

O compilador duplica o snapshot antes do primeiro await. Não impede que permissões reais mudem durante o run: o dispatcher deve revalidar a revisão de política e snapshot antes de chamar o provedor, e invalidar trabalho/cache quando necessário. Falha de autorização não deve ser apresentada ao usuário com conteúdo privado ou IDs que ele não pode conhecer.

A chave de cache inclui escopo, política, snapshot, registros e conteúdo. O adapter deve acrescentar sua identidade de modelo/tokenizer, sistema e ferramentas. Não reutilizar contextos autorizados entre pessoas ou audiências.

`recall({scope, events, subjectId, since, until, afterSequence, limit, authorize})` é um filtro de referência sobre um lote limitado já consultado em armazenamento autorizado. Retorna eventos exatos e cursor numérico. Tipos visíveis: `message`, `decision`, `artifact`, `handoff`. O timestamp exige `Z` ou offset explícito; o intervalo inclui as duas extremidades. Eventos exigem os campos de escopo, `id`, `sequence` inteira positiva e única dentro do stream, `subjectId`, `occurredAt`, `type` e `body`. Eventos excluídos não são retornados.

O banco deve emitir sequências monotônicas por stream, permitir consulta indexada por assunto/data/cursor e continuar a paginação do armazenamento se um lote inteiro for filtrado por ACL. O `nextSequence` deste filtro só avança até o último evento retornado; ele não substitui um cursor do banco nem indica se existem mais páginas. `limit` vai de 1 a 200. Não carregar todo o acervo na memória para chamar esse filtro em produção.

## Erros esperados

| Código | Tratamento |
|---|---|
| `REQUIRED_CONTEXT_UNAVAILABLE` | Recarregar snapshot e política; se persistir, bloquear o turno com explicação permitida |
| `REQUIRED_CONTEXT_OVERFLOW` | Rever orçamento/modelo ou escopo com o usuário; não cortar obrigatórios silenciosamente |
| `CONTEXT_CONFLICT` | Resolver decisões incompatíveis antes da execução |
| `INVALID_SCOPE`, `INVALID_SNAPSHOT`, `INVALID_OPTIONS` | Erro de integração; não despachar o run |
| `INVALID_TOKEN_COUNT` | Corrigir tokenizer/contador; não estimar como se fosse exato |
| `INVALID_RECALL`, `INVALID_TIMESTAMP`, `INVALID_TIME_RANGE`, `INVALID_EVENTS` | Corrigir consulta/armazenamento; não inventar histórico |

## Alcance da validação

Os testes usam um contador sintético baseado no comprimento do texto para provar regras de orçamento; não medem tokens reais. A autorização é simulada para testar exclusão e propagação de permissões, não para provar um serviço de autenticação completo.

Não há servidor, CLI, login, motor de busca, AI-memory, assinatura conectada, streaming nem interface interativa neste pacote. A persistência de tarefas pertence ao serviço DSH injetado, não é reimplementada aqui. Os testes do bridge usam um serviço simulado; não são testes de integração com o Harness. Resultado local desta revisão: 29 testes aprovados, 14 do contexto e 15 do kanban.

## Ponte de kanban

`new KanbanBridge({teams, authorize, resolveCaller, resolvePersona, resolveTarget})` recebe o serviço DSH real `ctx.agentTeams` e funções confiáveis do host. A API pública é `list(scope)`, `get(scope, taskRef)`, `create(scope, command)` e `update(scope, command)`; todas aceitam `{signal}` como último argumento opcional.

`scope` contém `teamId`, `projectId`, `rootSessionId`, `personaId`, `actorId`, derivados da sessão autenticada/run. A resolução precisa conferir o vínculo canônico projeto/root e retornar o Agent vivo real; o bridge não autentica pessoas nem comprova sozinho a árvore de subagentes. Não registrar essas funções como ferramentas com IDs de identidade livremente escolhidos pelo modelo.

`authorize(scope, operation)` deve verificar os direitos atuais de leitura/escrita no projeto, a audiência do resultado e a validade do run. `resolveCaller(scope)` retorna `{caller, rootSessionId, sessionId, personaId}`. `resolvePersona(sessionId, scope)` retorna o ID persistente ou `null`. `resolveTarget(personaId, scope)` retorna `{rootSessionId, sessionId, personaId}`; o próprio DSH também precisa aceitar esse alvo como membro da árvore.

`taskRef` sempre contém equipe/projeto/root e `nativeTaskId`. `create` recebe `{title, description, blockedBy?: taskRef[], writeScopes?: string[]}`. `update` recebe `{task: taskRef, expectedRevision, action, fields?}`. Ações seguem os tipos DSH consultados: claim, release, edit, set_dependencies, complete, reopen, reassign e delete. Não há retry automático nem chamada oculta como Lead. O serviço real continua responsável por revisão, DAG, propriedade e persistência.

Estados projetados: pending → todo; in_progress → doing; completed → done; deleted → archived, omitido na listagem ativa. Tarefa não concluída com `ready === false` aparece como bloqueada por dependência. Revisão e bloqueio manual precisam de uma extensão futura; o bridge recusa ações nativas inventadas.

Uma mutação nativa confirmada cuja resposta não puder ser exposta retorna o erro `TASK_COMMITTED_RESULT_UNAVAILABLE`; não repetir a criação. Erros de persistência incerta vindos do DSH são propagados sem retry. O host deverá acrescentar recibos duráveis por comando e reconciliação na integração. A autorização é reavaliada antes do acesso, antes da mutação e após a projeção do resultado; o host continua responsável por revogação durante streams e futuras ações.

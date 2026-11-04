# Fatos explícitos do Report — SB

O engine exporta o helper puro `extractFactsFromReport(report, ticket)` e `mapReportFactForCuration(fact)`. Não há chamada de IA, inferência a partir de prosa ou pedido de reparo ao modelo. O host fornece `report = {at, summary, facts?}` e `ticket = {id, audience, firstDelivery?}` depois de confirmar a conclusão. A audiência vem da origem persistida da Tarefa/conversa, nunca do payload da persona. `firstDelivery:true` devolve listas vazias: a primeira entrega não cria páginas nem turnos adicionais.

`facts` é o campo opcional estruturado do `persona_report`. Quando ausente, o texto final pode trazer um bloco cercado por três crases, com linguagem `json` ou sem linguagem, contendo `{ "facts": [...] }`. O helper usa o extrator de JSON de saída suja existente; nunca considera JSON sem cerca, texto comum ou campos encontrados por inferência. Um campo `facts` explícito tem precedência, inclusive quando vazio ou inválido. A inclusão do campo no schema da ferramenta e sua persistência são dos produtores runner/host; este incremento não altera esses módulos nem o formato do Report persistido.

Cada candidato exige `kind`, `title`, `body` e `evidence`. A evidência é um trecho literal do summary registrado, normalizado para NFC/quebras de linha. `sourceTicketId` e `recordedAt` são derivados exclusivamente de `ticket.id` e `report.at`; um ID de outra Tarefa informado no candidato é rejeitado. Audiência/data fornecidas pelo candidato não substituem os valores autoritativos. Timestamp inválido ou audiência sem participantes identificados impede extração, com motivo explícito.

| Kind de ExtractedReportFact | BrainPageKind existente |
| --- | --- |
| `decision` | `decision` |
| `preference` | `learning` |
| `rule` | `rule` |
| `person` | `person` |
| `process` | `process` |
| `reference` | `learning` |

`mapReportFactForCuration` devolve `{fact,visibility}`: `fact` usa o `LibrarianFact` existente, com `required:false` e `linkTo:[]`. Regras/decisões ainda passam pela política de proposta/aceite humano do curador. O host preserva também o `ExtractedReportFact` original para auditar evidência, Tarefa e data; esses dados não devem ser descartados na adaptação.

| Audiência original | BrainVisibility |
| --- | --- |
| `{kind:'members',memberIds}` | `members`, exatamente os mesmos participantes |
| `{kind:'channel',channelId,memberIds}` | `members`, somente participantes daquele canal |
| `{kind:'thread',threadId,memberIds}` | `members`, somente participantes daquele assunto/DM |
| `{kind:'project',projectId}` | `project`, mesmo projeto |

Não existe opção workspace no extrator. Promoção para audiência maior exige proposta aprovada fora deste helper. O host agrupa ações por visibilidade antes de chamar `curateAfterWork`, persiste a fonte e respeita a audiência na leitura, índice, busca e exportação.

Limites por Report: primeiros cinco candidatos, título 80 caracteres Unicode, corpo 500, evidência 160. Truncamento gera warning por campo; excedentes geram rejeição com contagem. O redator de segredos existente é consultado antes do corte; candidato com credencial no título/corpo/evidência é rejeitado integralmente. Deduplicação por kind, título NFC sem espaços nas extremidades/sem diferença de caixa e audiência normalizada; o primeiro candidato prevalece. Rejeições contêm só índice/motivo/contagem, nunca texto bruto ou segredo. `json_repaired` registra o reparo determinístico do extrator.

O host aplica os fatos pelo ID da fonte, com idempotência no replay da conclusão e sem ampliar grants. Sem fato explícito, não há página genérica. O Bibliotecário por modelo separado permanece opt-in futuro, medido e fora da primeira entrega. Aceite de integração requer a suíte SB do Gauge; os testes puros do extrator não declaram o consumidor host pronto.

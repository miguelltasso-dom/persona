# TEAM-13 — roteamento por FUNÇÃO sem @menção (D-090 #1)

Bolt, 04/11 22:58. Código: `persona-host/src/function-route.ts` (função pura) + `orchestration.ts` (`functionRouteOf`, `splitByFunction`, `ingest`). Atrás de `Config.teamwork` (`orchestration.functionRouting`); desligada, nada muda.

## Regra

Pedido de TRABALHO, no canal, sem @menção, sem DM e sem rota de primeira entrega:

| O pedido cita… | Resultado |
|---|---|
| uma função da equipe ("preciso da arte do cartaz") | UMA Tarefa, na persona dessa função (não mais "a primeira que não é Coordenação") |
| uma LISTA de funções ("texto, arte e posts") | uma Tarefa POR persona, cada uma com a sua parte |
| nenhuma função que a equipe tenha | o padrão antigo (`executorOf`) |
| @menção | a @menção vence (CV-5, inalterado) |

`routeByFunction(personas, body)` é determinística e sem IA: lê o título e a descrição da persona por um vocabulário pt-BR de áreas (texto/redação, arte/design, mídia/posts, atendimento, financeiro, pessoas, engenharia, dados, vendas) e, sem palavra de área, pelas palavras que a própria persona usa (≥ 6 letras, mesmos 5 primeiros). Lista = acertos separados só por vírgula/"e"/artigos/"para" (até 3 palavras de enchimento); "revise o texto e depois publique nas redes" NÃO é lista (uma dona). Coordenação nunca recebe parte. Menos de 2 personas além da Coordenação = sem roteamento.

## O que a pessoa vê (nunca silêncio)

- Uma linha da Coordenação, id `coord-<msg>-split`, resposta final da mensagem original: "Dividi o pedido por função: Bia fica com texto, Teo com arte e Caio com posts."
- Uma linha curta por parte, autor `team:split` (linha da equipe; nunca vale como resposta da pessoa — BUG-RT-1): "Parte de Bia: texto". Id `split:<msg>:<persona>`.
- Cada parte é uma Tarefa própria pela rota de primeira entrega (`mode: 'task'`, a mesma do TEAM-3), com `mandateActorId` = a PESSOA: a Tarefa tem os direitos dela, nunca mais. O pedido completo e "o resto foi para X: não faça a parte deles" ficam só na atribuição (invisível).
- Persona da função PAUSADA: pedido único espera por ela ("Teo está pausada. Use /retomar para voltar.", guardado e retomado); numa lista, as outras seguem e a linha diz "Teo está pausada, então arte espera: use /retomar e peça de novo."
- Reenvio do mesmo pedido não abre as partes de novo (ids determinísticos).

## Limites ditos com franqueza

1. O vocabulário é uma heurística, não entende o pedido: pedido ambíguo ou fora do vocabulário cai no padrão antigo (a IA da Coordenação decompondo é o passo seguinte, TEAM-12).
2. Uma persona com duas funções recebe as duas como UMA parte.
3. No máximo 5 partes por pedido.
4. As partes não têm dependência entre si (encadear "texto → arte" é TEAM-2/TEAM-12).
5. O passo de revisão do TEAM-6 acrescenta a Tarefa "Revisar: …" da Coordenação depois de cada entrega; os testes contam só as Tarefas de trabalho.

## Provas

`function-route.spec` (10, puro) · `team-function-routing.spec` (8, host: chave desligada = uma Tarefa no padrão antigo; lista = 3 Tarefas com mandato da pessoa; uma função; sem função; @menção vence; pausa única e em lista; reenvio) · vizinhos conversation-d079/mentions-routing/never-silent/handoffs/turn-images · `check-pkg persona-host` OK · suíte do host 149 arquivos / 803 verdes.

## 05/11 — a revisão do transcrito ("lê como um LOG"): o que o host da divisão passou a fazer

- **Título curto e humano (R3):** a Tarefa de cada parte usa `humanTaskTitle(função, pedido)` do engine (Forge): "Texto da campanha de lançamento…", nunca a frase inteira nem cortada no meio da palavra (teto 48 letras, corte em espaço com "…").
- **"Concluído" UMA vez (R6):** `completeReview` deixou de listar "este ticket + todos os já encerrados" (repetia cada título a cada fechamento). Um ticket avulso fecha com o próprio título; as partes de uma divisão esperam as irmãs (`split_closed`, lembrado por `completeReview` ou `ended`) e fecham o pedido com UMA linha (`coord-split-<msg>-milestone`) que nomeia cada parte uma vez.
- **Rotina/equipe é pedido, não conversa (R5):** mensagem que a EQUIPE escreve para uma persona (`routine:*`/`team:*` com `responderId`) é sempre trabalho dela, mesmo sem verbo de trabalho: vira a Tarefa da persona e nunca "Olá — em que posso ajudar?". A fala da pessoa continua lida pelo que diz ("obrigado" segue sendo agradecimento). O "Resumo da manhã" do produto (`morning-brief:`) já é determinístico e não posta (Anvil).
- **A plateia da opinião (R8):** `orchestration.involvedPersonaIds(projeto, tarefa)` = quem executa as partes irmãs, os colaboradores, a cadeia de passagens (`handoff:`) e a Coordenação — nunca a empresa toda. O `opinion-host` do Tally tem o seu `involvedIn` (sem a cadeia de passagens); este é o mais completo, para ele delegar.
- **Autoridade da pessoa nas partes (HT-6 × TEAM-13):** a Tarefa de uma parte (`split:`) e a de um colega (`handoff:`) têm o gatilho escrito pela EQUIPE, mas o mandato é o da PESSOA; `HarnessPorts.identityOf` lê o mandato nesses dois casos, então o pedido dela é o que autoriza o verbo (nunca mais que o dela). Iniciativa da equipe (`initiative:`, `routine-run:`, `plan:`) segue sendo iniciativa da persona.
- **Linhas da própria divisão (para o Anvil/Muse):** as 3 linhas "Parte de Bia: texto" têm autor `team:split` e id `split:<msg>:<persona>`; são só o gatilho de cada Tarefa (o engine aceita um ticket por gatilho) e **não dizem nada que a linha da Coordenação e o cartão do plano não digam**. Podem sair do fio por uma regra geral "autor com `:` não aparece" sem perda.

## 05/11 02:30 — campanha SEM funções listadas (TEAM-12 parte B · EQ-8/EQ-9)

`campaign-team.ts` (`campaignTeamOf`), usado pelo `proposeAssemble` do Gestor. Objetivo que é uma CAMPANHA (campanha, lançamento, divulgação, marketing, anúncio, promoção) e não lista as funções, sem setores nomeados ("Setores: …"):
- **Reaproveita** quem já faz cada função (Redação ← texto, Design ← arte, Mídia ← posts), pela mesma leitura do roteamento por função (`functionOwner`: uma equipe de UMA pessoa também vale; persona pausada não é reaproveitada). `reuse[].function` é o título REAL da persona (o `applyAssembly` confere).
- **Contrata só o que falta** (nunca a estrutura genérica Atendimento/Financeiro/Pessoas). O resumo diz: "Vou aproveitar Bia, Teo, Caio e montar o fluxo marketing." / "Vou aproveitar Bia, Teo e contratar 1 (Mídia) …".
- **Abre as Tarefas** ao aprovar: o `campaignStepsOf` da Forge recebe o pedido sintético "texto, arte, posts" e a cadeia começa pela Bia (texto), com o mandato da pessoa que aprovou.
- Objetivo que lista as funções, que nomeia setores ou que não é campanha: **nada muda** (undefined).
Provas: `campaign-team.spec` 6 · `gestor-campaign-team.host.spec` 4 · vizinhos (`gestor.spec`, `campaign-chain.host.spec`).

**Limite:** o vocabulário de campanha e as 3 funções são fixos (texto, arte, posts); outro tipo de objetivo sem funções listadas ainda cai na estrutura genérica.

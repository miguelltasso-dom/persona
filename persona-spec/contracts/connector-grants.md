# Contrato — o que uma persona pode fazer com os conectores da pessoa (D-084; antes ISO-2)

Anvil (host) + Tally (runner, HT-10) + Muse (forma, `design/PERSONA-POWERS-SPEC.md`). Revisado em 04/11 após o **D-084** (decisão do Miguel), que
**substitui o "isolar por padrão" do D-081/D-083 como regra de produto**; o mecanismo técnico (carregar só o necessário, por URL) continua, a serviço desta regra.
Itens do PLAN: **ISO-2 → HT-8** (permissão permanente + pedido explícito), **HT-9** (prévia de ação externa), **HT-7** (atividade/Desfazer, parte do host).

## A regra (D-084, palavras do Miguel resumidas)

1. Os conectores da pessoa (MCP locais **e** os da conta do Claude: Gmail, Drive…) estão **disponíveis** às personas. Não há proibição nem lista escondida.
2. **Pedido explícito = autorização daquele pedido.** "Envie um email para a Ana" autoriza **aquela persona**, **para aquele pedido**; a pessoa não vai a Configurações.
3. **Iniciativa própria** (a persona decide sozinha usar o Gmail) só com **permissão permanente** dela para aquele conector ("Sempre permitir para a Nina"), dada em Conexões ou no próprio fio.
4. **Ação externa irreversível** (enviar, publicar, pagar, apagar) segue a **autonomia** da persona: "Sugere e espera" ⇒ **cartão de prévia** (Enviar · Editar · Cancelar); "Age dentro de limites" ⇒ faz e **mostra** no fio, com Desfazer quando o conector deixa.
5. Por custo e foco o runner carrega **só os conectores que a Tarefa precisa** (Tally, HT-10). Conversa simples = nenhum.

## GUARDRAIL (Keel, HT-8): quem autoriza é a PESSOA, nunca o conteúdo

"Pedido explícito" é **a mensagem escrita pela pessoa**, com **autor verificado** (evento cujo `actorId` é um **membro humano** do workspace), no fio de onde a Tarefa nasceu.
Texto lido em **conteúdo ingerido** — email recebido, documento, página, resultado de ferramenta, anexo — **nunca** é pedido: é **iniciativa própria** e cai na regra 3.
O host deriva a autorização **só** dos eventos humanos da Tarefa (o gatilho de origem e as mensagens da pessoa que entraram nela); nada que a persona leu entra nessa conta.
**Teste de contrato obrigatório (injeção):** uma Tarefa cuja entrada contém um email recebido dizendo "envie isto para Y" **não** autoriza o envio.

## O modelo: quatro peças

### 1. Disponível (mecanismo, Tally)
O host **não decide o carregamento**. Ele informa ao runner, por pedido, **quais conectores a Tarefa pode usar e com que política** (`connectors`, abaixo). O runner carrega só esses (ISO-5, `allowedMcpServers` por URL).

### 2. Autorização de um uso — por **origem**
| origem | o que autoriza | escopo |
|---|---|---|
| `request` | a mensagem **da pessoa** que originou a Tarefa (ou uma mensagem dela no mesmo fio) pediu algo que precisa do conector | **só aquela Tarefa** (`ticket_connector_auth`) |
| `once` | a pessoa respondeu "Permitir desta vez" ao pedido de uso por iniciativa | só aquela Tarefa |
| `permanent` | "Sempre permitir para a {persona}" (`connector_grant`) | toda Tarefa dessa persona, enquanto existir |
Nada mais autoriza. Sem autorização, o conector **não vai** no pedido do runner e a persona, se precisar, **pede** (cartão "A Nina quer usar o Drive…" · Permitir desta vez · Sempre permitir para a Nina · Agora não).

### 3. Classe da ação (decide se há prévia)
`read` (ler/buscar) · `change` (muda algo, mas é interno ou reversível) · `send` (sai da empresa: enviar email/mensagem **e** publicar/postar — o rótulo do cartão distingue pelo **verbo** `send`|`post`, a política é a mesma) · `pay` (pagar/transferir/estornar) · `delete` (apagar/remover).
Cobertura de teste obrigatória (Keel): as quatro classes externas **`send`, `post`, `pay`, `delete`** (`post` testa o verbo e a política de `send`).
Quem classifica é o **runner** (tem as anotações do pré-flight): `classifyTool(toolName, annotations?)`, **uma função pura**, em `persona-runners` (Tally); o host **a importa** (mesma regra nos testes) e **reconfere com falha fechada** o que vem no `blocked` (`tool`, `actionClass`, `requestedInput`).
**Vence a classe MAIS ESTRITA** entre a da anotação e a do **nome** (um servidor que mente `readOnlyHint=true` numa ferramenta `delete_x` continua `delete`). Ordem: `delete` > `pay` > `send` > `change` > `read`. O nome casa por **tokens** (separa `_`, `-` e camelCase) **da ferramenta, não do servidor**: `delete|remove|trash|destroy|drop` ⇒ `delete`; `pay|charge|transfer|refund` ⇒ `pay`; `send|post|publish|tweet|reply|forward|share|invite` ⇒ `send` (verbo `post` para os de publicar); `readOnlyHint` sem padrão mais estrito ⇒ `read`. **Sem anotação e sem padrão conhecido ⇒ `send`** (a prévia aparece; nunca o contrário).

### 4. Decisão de uma chamada (função **pura**, a parte mais testada)
`decideConnectorUse({ origin, autonomy, grant?, actionClass }) → 'run' | 'run-and-report' | 'preview' | 'ask-permission' | 'refuse'`

| origem | autonomia | classe | resultado |
|---|---|---|---|
| iniciativa **sem** permissão permanente | qualquer | qualquer | `ask-permission` (o conector nem vai carregado) |
| iniciativa | `asked` ("Só quando pedido") | qualquer | `refuse` (ela só age quando pedida, mesmo com permissão) |
| `request`/`once`/`permanent` | qualquer | `read` | `run` |
| idem | qualquer | `change` | `run-and-report` (linha no fio, Desfazer se houver) |
| idem | `act` | `send` | `run-and-report` |
| idem | `propose` ou `asked` | `send` | `preview`, **salvo** `grant.confirmSend === 'never'` ⇒ `run-and-report` |
| idem | qualquer | `pay` ou `delete` | `preview` **sempre**, **mesmo em `act` e mesmo com pedido explícito** (decisão do Keel, confirmada pela Muse). **Nenhuma** permissão dispensa a prévia (HT-9, Keel 05/11 02:22): `confirm.pay`/`confirm.delete = 'never'` ainda podem estar gravados (instalação antiga) mas a política os ignora — uma verdade só, igual à do gate, que nunca pré-libera `pay`/`delete` |
Uma permissão permanente `read` **não** cobre `change`/`send`/`pay`/`delete` por iniciativa (precisa de `write`); a `write` também **não** dispensa a prévia de `pay`/`delete`. Cada dispensa é **por classe**: `send` não dispensa `pay`, e omitir uma classe numa chamada de `grantConnector` a devolve a `ask` (uma dispensa não "gruda" por omissão).

## Armazenamento (store **v22**, ainda não publicado: altero a migração no lugar)

```sql
connector_grant (                      -- a permissão permanente (o ISO-2 de ontem), presa à persona
  workspace_id, persona_id, cli, connector_id, name, access TEXT CHECK (access IN ('read','write')),
  confirm_send TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_send IN ('ask','never')),   -- a caixinha "Não perguntar de novo" do cartão (só `send`)
  confirm_pay TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_pay IN ('ask','never')),     -- dispensa EXPLÍCITA de pagar (Configurações › Personas, com aviso)
  confirm_delete TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_delete IN ('ask','never')),
  granted_by, granted_at, PRIMARY KEY (workspace_id, persona_id, cli, connector_id) )
connector_grant_log (...)              -- só acrescenta; sobrevive à persona (como antes; agora também grava confirm_send)
ticket_connector_auth (                -- a autorização por PEDIDO
  ticket_id, cli, connector_id, source TEXT CHECK (source IN ('request','once')), message_id TEXT NOT NULL, at,
  PRIMARY KEY (ticket_id, cli, connector_id) )
external_action (                      -- a prévia de ação externa (HT-9) e o que aconteceu
  id TEXT PRIMARY KEY, workspace_id, project_id, ticket_id, persona_id, cli, connector_id, connector_name,
  tool TEXT, action_class TEXT CHECK (action_class IN ('send','pay','delete','change')),
  preview_json TEXT,                   -- o `requestedInput` limitado e já mascarado (≤ 16 KiB): só aqui e no cartão; nunca no log
  args_hash TEXT, attempts INTEGER NOT NULL DEFAULT 0,   -- o hash dos argumentos APROVADOS e quantas reexecuções
  status TEXT CHECK (status IN ('pending','allowed','edited','denied','expired','failed')),
  decided_by, decided_at, created_at, undo_until TEXT, undo_json TEXT )
```
Limites herdados: ≤ 64 permissões por persona; `connector_id` ≤ 256 (conector da **conta** = a URL de proxy, um identificador, não um segredo); `name` ≤ 80 sem caracteres de controle (texto **não confiável**).
Mantido: tabela **própria**, **não** `persona.tools` (o `effectiveToolLevel` toma o máximo de todas as entradas; uma permissão `write` ali subiria o nível de arquivos/shell). A permissão **não** alimenta `permissionFor`/`cliPermissionOf`.
A exportação e o sync de persona **nunca** levam permissões nem autorizações.

## O que o host entrega ao runner (por pedido, nunca em cache)

```ts
interface HostConnectorGrant {
  cli: string; id: string
  access: 'read' | 'write'                 // até onde ESTA Tarefa pode ir
  basis: 'request' | 'once' | 'permanent'  // por que está autorizado
  preAllow: readonly ActionClass[]         // classes que o runner LIBERA NA ABERTURA (nada pergunta): sempre ⊇ read; + change; + send só se a decisão é 'run-and-report'. NUNCA pay nem delete.
  approved?: readonly { tool: string; argsHash: string }[]   // reexecução após APROVAR: aquela ferramenta, UMA vez, só com estes argumentos (ver o portão)
}
HostRunnerRequest.connectors?: readonly HostConnectorGrant[]   // ordenado por (cli, id): o fingerprint da sessão quente do Tally depende disso
```
Quem **classifica** a ferramenta é o **runner** (ele tem as anotações do pré-flight): a classe vai no relatório `blocked` (`permissionRequest.actionClass`). O host **não confia**: se a classe vem ausente ou desconhecida, trata como `send` (falha fechada). A função de classificação é **uma só**, pura, em `persona-runners` (Tally), e o host a importa para os testes de contrato.
- **Quais conectores** a Tarefa precisa = porta do Tally `connectorsNeededBy(texto, persona) → ConnectorRef[]` (HT-10), chamada **só com texto de autoria humana**. O host os marca `request` e grava `ticket_connector_auth` com o `message_id` do pedido. Um conector que o roteamento quer mas o pedido não implica **não** é autorizado.
- Persona sem nenhuma autorização para a Tarefa ⇒ `connectors` ausente ⇒ nenhum conector no pedido.
- Só a **execução de Tarefa** na CLI carrega; conversa e chamadas só-resposta nunca (custo: "conversa simples = nenhum conector").
- Mudar/revogar permissão **evicta** os runners quentes da persona (grant, change e revoke; o Tally soma o fingerprint à chave da sessão como defesa em profundidade). Um turno já aberto termina com o que tinha.

## O portão de ação externa (HT-9): a CLI pede, o turno **termina `blocked`**, a pessoa decide, a Tarefa **reexecuta**

**Restrições reais do runner (Rivet, 19:54; Keel):** (1) o pedido de permissão da CLI chega como `app_request` com o **nome da ferramenta** e o turno termina `blocked` — o runner **nunca responde "sim" ao vivo**; (2) hoje o adapter **descarta os argumentos**; (3) **aprovar = reexecutar** com aquela ferramenta liberada **uma vez**; o `allow-once` de hoje libera **por modo**, não por ferramenta; (4) **Desfazer só onde o conector oferece**; (5) os conectores da **conta** (ISO-5) **não passam pelo nosso gateway MCP**, então a ACL X-1 não os cobre: a trava é a **permissão da CLI**. Não existe, portanto, "promessa que espera a pessoa": o desenho é bloquear, mostrar, reexecutar.

**O fluxo:**
1. **Abertura.** O host entrega `connectors[]` com `preAllow` = as classes que a decisão manda **fazer sem perguntar** (`read`; `change`; `send` só se `run-and-report`). Tudo fora disso a CLI **pede**.
2. **O pedido chega.** O runner encerra o turno `blocked` com `permissionRequest: { tool, actionClass, requestedInput? }`. `requestedInput` é **limitado e sem segredo** (abaixo). O host classifica de novo (falha fechada ⇒ `send`) e decide:
   - `refuse` ⇒ a Tarefa continua com a nota "a persona não pode fazer isso por conta própria" (mesmo caminho do `answerAttention`);
   - `preview` ⇒ grava `external_action{status:'pending'}`, cria o **cartão** (`ApprovalView.kind='action'`, também "Precisa de você"), a Tarefa fica **esperando a pessoa**;
   - `run-and-report` num pedido **bloqueado** (ex.: a classe não estava em `preAllow`) ⇒ reexecuta direto (passo 4) e registra.
3. **A pessoa decide** (forma da Muse, §1): **Enviar** ⇒ aprova os argumentos **mostrados** · **Editar** ⇒ aprova os argumentos **editados** · **Cancelar** ⇒ a Tarefa continua com "a pessoa pediu para não fazer". A caixinha "Não perguntar de novo para a {persona} no {conector}" (`remember`) grava `confirm.send='never'` **só se a classe é `send`**; para `pay`/`delete` o host **ignora** `remember` (a caixinha nem existe): a dispensa deles só nasce em Configurações › Personas, com aviso, por `grantConnector({ confirm: { pay: 'never' } })`.
4. **Reexecução.** O host grava `argsHash = argsHash(argumentos finais)` (a **mesma** função exportada pelo Tally: **SHA-256 hex minúsculo** do UTF-8 do **JSON canônico** do input **real e completo**, não do truncado — objetos com chaves ordenadas recursivamente por code unit, sem espaços, arrays na ordem, `undefined` removido, números como `JSON.stringify` com `-0` ⇒ `0`, strings sem normalização) e reabre a Tarefa (o caminho do `answerAttention`/`wakeAfterAnswer`, Bolt) com **`approved: [{ tool, argsHash }]`** e o texto "a pessoa aprovou **este** envio, execute exatamente isto: …". **A camada de permissão do runner confere o hash dos argumentos reais da chamada**: igual ⇒ libera **uma vez**; diferente ⇒ **nega** e volta `blocked` com o pedido novo (novo cartão). **"Aprovei A, enviou B" não acontece.** Até **2 tentativas** por ação (o modelo pode reescrever o texto); depois a Tarefa para com a explicação.
5. **Reinício no meio:** o cartão fica (`external_action` persistido); decidir depois reabre a Tarefa do mesmo jeito. Decidir duas vezes **não** executa duas (`status` só sai de `pending` uma vez); **24 h ⇒ `expired`** ⇒ trata como Cancelar.
6. **Depois:** executou ⇒ a linha "✓ Enviado para ana@… · Ver"; cancelado ⇒ "Cancelado · a Nina não enviou"; falha ⇒ `RunErrorCard`. **Sem Desfazer** para email, postagem ou pagamento (não se promete o que o conector não garante); só aparece quando o conector **de fato** oferece e o runner informa (`undo` ausente por padrão).

**`requestedInput` (a prévia), ACEITO pelo Tally:** objeto JSON **achatado**, ≤ **20 campos**, cada string ≤ **4 KiB**, total ≤ **16 KiB**, cortes marcados com "…", mais **dois campos do Tally**: `truncated: boolean` (algo foi cortado ou omitido) e `argsHash` do input **inteiro**. **Se `truncated`, a tela diz que a prévia é parcial e o host NÃO aprova `send`/`pay`/`delete` às cegas** (nega e a Tarefa explica); segredos reconhecidos (`containsSecretValue` do core) **mascarados** antes de sair do runner **e** de novo no host; nunca em log, nunca na auditoria (só verbo, meio, destinatário, tamanho). O corpo de email é sensível: fica **só** no cartão e em `external_action.preview_json`.
**Sem prévia, sem aprovação para o que sai da empresa:** se `requestedInput` não veio (adapter antigo) e a classe é `send`/`pay`/`delete`, o host **não pede "Permitir"** às cegas: nega e a Tarefa explica "não consegui mostrar o que ia enviar". Só `change` interno admite o cartão genérico "A Nina quer usar {ferramenta}".
**Portão indisponível (falha fechada):** se a CLI **não** consegue bloquear e devolver o pedido (porta `permissionRequests(cli) → 'blocked-report' | 'none'`, do Tally), o host **não promete a prévia**: o conector vai **somente leitura** (`preAllow = [read]` e nada mais carrega) e a tela diz isso (Codex: "todos os seus conectores já ficam carregados"; Muse §5). Nunca um "Sugere e espera" que não segura.
**Contas (ISO-5):** valem as mesmas regras; como o nosso gateway não as cobre, a **única trava é a permissão da CLI** (este fluxo). Um teste seco confirma que uma ferramenta da conta fora de `preAllow` **bloqueia**.

## Remotes (host)

```ts
listConnectorGrants({ workspaceId, projectId, personaId? }): ConnectorGrantView[]                 // leitura: quem lê o projeto; nomes e níveis
grantConnector({ …, personaId, connector: ConnectorRef, access: 'read'|'write', confirm?: { send?, pay?, delete?: 'ask'|'never' } }): ConnectorGrantView   // "Sempre permitir"; dono do workspace; a visão devolve `confirm` e `loadedAlways`
revokeConnector({ …, personaId, cli, connectorId }): boolean                                      // idempotente; dono
estimateConnectorGrantCost({ …, personaId, connector }): ConnectorGrantCostView                   // custo antes de confirmar (porta do Tally); dono
listApprovals(...)                      // ganha kind 'action' (prévia) e 'connector' ("A Nina quer usar o Drive…")
decideApproval({ kind: 'action', id, choice: 'send'|'edit'|'cancel', edited?, remember? })        // o ciclo de decisão que já existe, estendido
decideApproval({ kind: 'connector', id, choice: 'once'|'always'|'not-now' })                      // once ⇒ ticket_connector_auth; always ⇒ grant `read`
listPersonaActivity({ workspaceId, projectId, personaId?, from?, onlyChanges? }): PersonaActivityView[]   // HT-7
undoPersonaAction({ workspaceId, projectId, activityId }): boolean                                // HT-7
```
- **ACL:** conceder/revogar/custo = **dono do workspace** (o conector é da CLI **desta** pessoa neste computador); persona e membro comum `forbidden`. **Decidir uma prévia:** o dono, ou quem pediu a Tarefa (a mesma regra do `answerAttention`).
- **Recusas de `grantConnector`** (nunca gravar o que não vira nada): `not-grantable` só quando o conector **nunca poderia carregar** (`remote`/`missing`); `limit-reached` (64); `invalid-payload`; `not-found`; `forbidden`. **`isolation-partial` deixa de ser recusa**: no Codex a permissão vale como **política do host** (o portão), e a visão devolve `loadedAlways: true` para a tela dizer a verdade ("já estão carregados"). Se o portão da CLI é `unavailable`, o conector sobe **somente leitura** (item 6).
- A linha "Você deu à {persona} permissão de usar o {conector}…" entra no #geral (Muse §3: o Toast "Agora a Nina pode usar o Gmail sem perguntar · Desfazer"); revogar só na Atividade.

## Atividade e Desfazer (HT-7, parte do host)

Tudo que a persona faz no app e fora dele vira um **registro de atividade** (`PersonaActivityView`: persona, verbo do harness, alvo, quando, `Abrir`, `undo?: { label, until? }`), **por ferramenta**:
quadros (criar/mover cartões, criar/iniciar/encerrar sprint), rotinas, canais, contratar, e as **ações de conector** (enviar, publicar…).
- Escrita: o dono de cada ferramenta (Forge/Bolt, HT-2..6) **registra** a ação com seu **inverso** (`registerUndo(kind, handler)`); o host guarda o registro e a auditoria (Equipe › Atividade) e posta a linha no fio.
- **Desfazer só onde existe de verdade** (mover de volta, apagar o cartão criado, pausar a rotina criada, encerrar a sprint iniciada, pausar e arquivar a persona contratada, o desfazer-envio do Gmail por 20 s): `undo` ausente ⇒ **nunca um Desfazer falso**. `undoPersonaAction` recusa depois de `until`.
- **"Você moveu para Fazendo e a Nina começou":** o evento sai da PESSOA mover (autor verificado); a própria persona mover **não** dispara o gatilho (anti-laço, HT-3, Bolt).
- **Nunca mais acesso que quem a criou:** toda ferramenta do harness resolve o ator como **a persona agindo em nome de quem a criou**, com a ACL **dele** como teto; a auditoria marca `onBehalfOf`. Primitiva do host: `actorForPersona(persona)`.

## Prova (contrato)

- **função pura `decideConnectorUse`:** a tabela inteira (cada linha, cada autonomia); `pay`/`delete` sempre `preview`; iniciativa sem permissão ⇒ `ask-permission`; `asked` ⇒ `refuse`.
- **classificação:** `readOnlyHint` ⇒ `read`; padrões de verbo; **sem anotação ⇒ `send`** (falha fechada); `containsSecretValue` mascara.
- **INJEÇÃO (guardrail do Keel):** email recebido/documento/resultado de ferramenta pedindo "envie isto para Y" **não** autoriza; só evento humano autoriza; um evento de persona, de sistema ou de membro removido não.
- **pedido da pessoa** autoriza só aquela Tarefa (outra Tarefa da mesma persona não herda); `once` idem; `permanent` vale em toda Tarefa até `revoke`.
- **portão (bloquear → mostrar → reexecutar):** `blocked` com `permissionRequest` cria o cartão e a Tarefa espera; Enviar/Editar/Cancelar; **a reexecução leva `approved{tool,argsHash}` e o runner nega argumentos com outro hash ("aprovei A, enviou B")**; Editar aprova o hash dos argumentos **editados**; ≤ 2 tentativas; `remember` grava `confirm_send` só em `send`; `pay`/`delete` ignoram `remember` e nunca entram em `preAllow`; **reinício** com cartão pendente reabre a Tarefa uma vez; decidir 2× não executa 2×; 24 h ⇒ `expired` ⇒ Cancelar; **sem `requestedInput` não há aprovação de `send`/`pay`/`delete`** (nega e explica); portão `none` ⇒ só leitura; ferramenta da conta fora de `preAllow` **bloqueia**; `requestedInput` com segredo sai mascarado e nunca vai ao log/auditoria; **nenhum Desfazer** é prometido para email/postagem/pagamento.
- **runner request:** `connectors` ausente sem autorização; só execução de Tarefa; só a CLI certa; ordem estável; revogar evicta; o resto da equipe intacto.
- **ACL** (dono × membro × persona × outro workspace) e `remote-acl.spec` para os Remotes novos; auditoria sem o conteúdo da prévia; exportação sem permissões.
- **store:** v22 (as três tabelas novas), limites, cascata, migração aditiva.
- **Atividade:** cada ferramenta registra; `undo` existe só onde há inverso; recusa após `until`; `actorForPersona` nunca excede a ACL de quem criou.

## Perguntas abertas

1. **(Tally/Rivet) — aberta, aguarda o experimento seco do Tally (endpoint falso + MCP local, zero modelo).** Ainda não se sabe o que o Claude entrega no pedido de permissão nem se o adapter libera **por ferramenta + hash** (o `allow-once` de hoje é por modo, e `dontAsk` **nega em silêncio** em vez de perguntar). Até lá `permissionRequests(cli) = 'none'` para **todas** as CLIs ⇒ **o host entrega os conectores SOMENTE LEITURA** (falha fechada) e a tela diz isso. Vira `'blocked-report'` para o Claude só depois do experimento; Codex/OpenCode/Cursor ficam `'none'` até teste.
2. ~~pay/delete em `act`~~ **RESOLVIDA (Keel + Muse, 19:57/19:59):** `pay`/`delete` **sempre** pedem prévia, mesmo em "Age dentro de limites" e com pedido explícito; só a dispensa explícita por classe (acima).
3. ~~`connectorsNeededBy`~~ **RESOLVIDA (Tally):** função **pura e determinística, sem modelo** (roteamento seco, como o `wantsWork`), só recebe texto de autoria humana e devolve só conectores da lista disponível. O Tally escreve (HT-10).
4. ~~D-076~~ **RESOLVIDA (Keel, 19:57):** ativos = **HT-8 (com o ISO-2) + HT-9**; HT-7 espera HT-2..6; CV-6 só contrato. **HT-0** (transporte das ferramentas de produto até a CLI viva: Rivet no runner, eu/Bolt nos `HarnessPorts` do host; `contracts/harness-tools.md`) é pré-requisito do HT-9: a prévia depende de a CLI chamar as ferramentas.
5. **(Tally/Forge, D-085)** Registrar no livro o **modo de cada chamada** (`native` | `answer-only` | `needed`): o Tally expõe `RunnerUsage.envMode` (aditivo); no host entra a coluna `turn_ledger.env_mode` (mesma migração v22, opcional como `duration_ms`) e o Forge acrescenta `TurnLedgerEntry.envMode?` no core.

## Ordem de entrega

1. **Feito (código, testado):** store v22 `connector_grant`/`connector_grant_log`, `ConnectorGrantsHost` (ACL de dono, auditoria, linha no #geral, evicção, ordem estável), `HostRunnerRequest.connectors`, Remotes `list/grant/revoke/estimateConnectorGrantCost`.
2. **Depois da confirmação do Tally (pergunta 1 e 3):** `confirm_send`, `ticket_connector_auth`, `decideConnectorUse` + classificação (puros, testáveis já), `external_action` + o portão + os cartões `action`/`connector`, o ajuste de `isolation-partial`.
3. **HT-7** quando Forge/Bolt entregarem as ferramentas (registro de atividade + `registerUndo` + `actorForPersona`).
4. **Zero IA real** em tudo isto (portas falsas); efeito em login real só no experimento do Tally.

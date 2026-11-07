# Contrato — o gate de permissão das ferramentas MCP (HT-8/HT-9, D-084)

Tally (gate e ligação no runner, já em código) · Anvil (usa no host: classes pré-liberadas, aprovação, cartão) · Muse/Quill (cartão). v1.1. Provas: `persona-runners/tests/permission-gate.spec.ts` (19), `permission-gate-wire.spec.ts` (5), `tool-gate.spec.ts` (19); **contra a CLI real:** `scripts/ht89-dry.ts` (7 cenários, endpoint Anthropic falso, zero modelo) e `reports/ht89-permission-dry.md`.

## O que é

Antes de cada chamada de ferramenta MCP, a CLI (Claude) faz um `POST` ao gancho `PreToolUse` HTTP com a ferramenta e os **argumentos completos**; o gate responde `allow` ou `deny`. É **o próprio host** que serve esse endpoint (um servidor em `127.0.0.1`, no processo do app): sem `node` no PATH da pessoa, sem arquivo de troca, sem patch no OAR. A CLI nunca pergunta ao host por conta própria e o OAR não tem como responder; este gancho é o único lugar onde ferramenta + argumentos podem ser julgados.

## Como o host usa (Anvil)

```ts
import { PermissionGate, annotationTable } from '@deepseek-ai/dsh-persona-runners'

const gate = await PermissionGate.start({
  annotations: annotationTable(servers),         // do pré-voo (mcp_status); sem isso toda ferramenta sem verbo conhecido é `send`
  isSecret: containsSecretValue,                 // o detector do core; o runner já mascara por nome de campo e por forma
})
const runner = await resolveRunner({ ..., permissionGate: gate })   // Claude; as outras CLIs ignoram (sem gancho)

// a cada turno:
gate.arm({ preAllow: ['read'], approved: [{ tool, argsHash }] })    // pay e delete NUNCA entram, mesmo se listados
const handle = await runner.start(input)
// ... stream ... o `ended` vem como `blocked` (texto de reserva NEEDS_APPROVAL_TEXT) se algo ficou esperando
const requests = gate.takeRequests()                               // → PermissionRequest[]: vira o cartão de prévia
// ao encerrar a persona/projeto: await gate.close()
```

`PermissionRequest = { tool, toolUseId?, server?, actionClass, verb, requestedInput, truncated, masked, argsHash }`. O `verb` é a palavra que decidiu a classe (`send`, `post`, `pay`, `delete`…) para o rótulo da Muse. `requestedInput` é o preview (≤ 20 campos, 4 KiB por texto, 16 KiB no total, segredo mascarado); **`truncated` ou `masked` verdadeiros ⇒ o host não aprova `send`/`pay`/`delete` às cegas** (a prévia não é o que seria enviado).

## Aprovar = reexecutar

O host reabre a Tarefa com `approved: [{ tool, argsHash }]`. O gate libera **uma** chamada, **uma vez**, só se o hash dos argumentos **reais** dessa vez bater (`argsHash`: SHA-256 do JSON canônico do input completo). Outros argumentos na mesma ferramenta são negados e voltam como pedido novo (até 2 tentativas é política do host). Provado na CLI real: "aprovei A, enviou B" não acontece.

## Regras de segurança (medidas, não supostas)

1. **O gate tem de ser a ÚNICA coisa que libera uma ferramenta controlada.** Falha do gancho (servidor fora do ar, 403) é **não bloqueante** na CLI: com a ferramenta em regra `allow`, ela **executaria**. Por isso o runner **nunca** coloca ferramenta controlada em `--allowedTools`/`permissions.allow`, e a base é `dontAsk` (nega quando o gate não diz `allow`). Cenário provado: gate fora do ar ⇒ negado.
2. **Autenticação por execução e por turno.** Escuta só em `127.0.0.1`, porta efêmera; cada pedido precisa do token da execução no cabeçalho `X-Persona-Run` (comparação em tempo constante), senão `403`. Além disso o gate só decide **armado** (`arm` … `disarm`): antes do primeiro turno, entre turnos e depois de fechado, toda chamada MCP é negada e nada é registrado. O `ended` do turno **desarma** sozinho (a janela fecha mesmo que o host esqueça).
3. **Tempo de resposta.** A decisão é síncrona e local (microssegundos): não consulta modelo, banco nem rede. O host **não pode** pôr trabalho assíncrono dentro de `arm()`/da decisão; se o laço de eventos do app travar, a CLI espera até o limite do gancho e então cai no `dontAsk` (nega).
4. **Nada vaza.** Os argumentos completos nunca são registrados, guardados nem devolvidos: só o hash e o preview limitado saem do gate. O motivo que volta ao modelo é um texto fixo ("precisa da aprovação da pessoa; pare e avise").
5. **Só MCP.** Ferramentas embutidas (Bash/Write…) seguem a política de ferramentas da persona; o gate responde "sem opinião" a elas.
6. **Tem de ser combinado com um modo que não carregue regras `allow` da pessoa.** `answer-only`/`needed` (`--setting-sources project`) tiram as do usuário; com `native` as regras `allow` pessoais continuam valendo e só a negação do gancho as supera enquanto o gate responde.

## O que cada CLI tem

`permissionRequests(cli)`: **Claude = `blocked-report`** (gancho). Codex, OpenCode, Cursor = `none`: o host entrega só leitura e a tela diz (sem prova equivalente).

## Regressão por versão da CLI

`scripts/ht89-dry.ts` (trava `check`) roda os 7 cenários contra a CLI instalada. Se algum falhar, o runner **não libera escrita** daquela versão (só leitura) e a tela diz. Resultado guardado por versão, como o do isolamento.

## Pendências (outros donos)

Anvil: classes pré-liberadas por decisão (`confirm.pay`/`confirm.delete` permanentes), a lista `approved`, o cartão e o ciclo de vida do gate (um por persona×projeto×finalidade, fechar ao encerrar), a coluna do livro. Muse: a forma do cartão. Pré-voo: `annotationTable` precisa do `mcp_status` do conector (o `connectorCostOf` do ISO-5 abre essa mesma sessão).

## Contrato ponta a ponta do HT-9, sem modelo (Tally, 05/11 02:35)

`persona-host/tests/ht9-gate-contract.spec.ts` (19) compõe o gate REAL (o gancho HTTP que a CLI chama), o cartão do host (`ExternalActions`) e a política (`preAllowFor`) contra um conector FALSO que só "executa" a ferramenta quando o gancho diz `allow` — exatamente o que a CLI faz. Fixa as quatro propriedades da divisão do Keel:
1. **Enviar sem aprovação → nada sai e aparece o cartão.** "Sugere e espera": o `send` é recusado, o conector nunca é chamado, UM cartão guarda o conteúdo real; fora de um turno armado toda chamada é recusada e nenhum cartão nasce; sem token = 403; ferramenta embutida = sem opinião.
2. **Aprovar → sai EXATAMENTE aquela ação, uma vez.** `decide(send)` → `approvedFor` → o turno reaberto libera UMA chamada com o mesmo hash; o conector recebe exatamente os argumentos que a pessoa viu; a ordem das chaves não importa (JSON canônico); a segunda igual é negada; Cancelar/Editar não aprovam nada; uma aprovação não sobrevive ao turno.
3. **Argumentos reescritos depois da aprovação → negado.** "Aprovei A, enviou B" não acontece: B é recusado, vira outro cartão e A segue como a única coisa aprovada; aprovação de uma ferramenta não vale para outra; quem insiste em propor outra coisa é parado na segunda tentativa; prévia cortada (`truncated`) ou com parte escondida (`masked`) não se aprova às cegas.
4. **Pagar/apagar SEMPRE com prévia, mesmo com "Sempre permitir".** Com a permissão mais larga possível (`write`, send/pay/delete = `never`) o `send` passa e o `pay`/`delete` NÃO: o gate recusa e o cartão aparece (`canRemember: false`); "Não perguntar de novo" num cartão de pagar/apagar é ignorado (nenhuma permissão gravada); cada pagamento/apagamento é aprovado pelo hash exato e uma vez (outro valor, um arquivo a mais = outro pedido).

**Uma verdade só (feito, Anvil 05/11):** `decideConnectorUse` devolve `preview` para pay/delete com QUALQUER permissão e `preAllowFor` nunca as lista; o gate as ignora (`NEVER_PRE_ALLOWED`) e o cartão nunca as dispensa. As colunas `confirm_pay`/`confirm_delete` seguem no banco só por compatibilidade.

**Costura gate → cartão (achado do teste):** a prévia do gate é PLANA (`to[0]`, `to[1]`, `message.body`) e o cartão lê campos de topo e listas como listas; sem remontar, um apagar não lista os arquivos e um envio não mostra o segundo destinatário. `persona-host/src/action-input.ts` (`unflattenPreview`, 5 testes) remonta; **a cola do host tem de chamá-la** ao transformar `gate.takeRequests()` em `ExternalActions.record` (só muda a PRÉVIA; a aprovação continua sendo do hash dos argumentos reais).

**Ferramenta de aparência inofensiva não é leitura:** sem o `readOnly` do próprio servidor (pré-voo `mcp_status`) até `list_emails` é tratada como `send` (testado). A ordem de segurança continua: o pré-voo prova a leitura, o resto pede.

## A cola do host, pronta e provada ponta a ponta (Anvil, 05/11 03:15)

`persona-host/src/action-bridge.ts` (`ActionBridge`) compõe tudo acima dentro do host; `persona-host/tests/ht9-host-bridge.spec.ts` (6) roda o orquestrador REAL + o gate REAL + o cartão + as permissões contra um "Claude" falso (pede o gancho antes de cada chamada e só "executa" no conector falso quando o gancho diz `allow`), sem modelo:
1. **Gate por runner.** Uma Tarefa de Claude que leva conectores abre o runner com `permissionGate` (`HostRunnerRequest.permissionGate` → `resolveRunner`) e `accountConnectors` (os ids dos conectores da Tarefa). Um gate por runner, e a Tarefa que leva conectores já tem runner próprio (`warmKeySuffix`): duas Tarefas nunca dividem gate nem armação. CLI que não pára chamada (`permissionRequests = none`): sem gate, o conector carrega só para leitura. O gate sai com o runner (`dropWarm`, `evictWarmRunners`, `disposeRunners`) e todos fecham ao encerrar o host. `ownServers: [DEFAULT_TOOL_SERVER]`: as ferramentas do produto não passam pelo gate.
2. **Armar a cada turno** (`arm`): `preAllow` = interseção das classes dos conectores da Tarefa (o gate só tem classes globais: vale a menor permissão comum) + `approved` = `approvedFor(Tarefa)` (cartões aprovados e ainda não enviados); os cartões aprovados viram `sending`.
3. **Fechar o turno** (`settle`): `takeRequests()` → `unflattenPreview` → `record` (UM cartão por chamada, `requestedByPerson` pela base da autorização); `takeReleased()` decide `sent` (só o que o gate REALMENTE liberou, tool+hash) ou `failed` ("o pedido mudou antes de enviar; veja o novo cartão" / "a persona não chegou a enviar" / "o motor falhou antes de enviar"). Com cartão aberto a Tarefa fica `waiting` (sem pergunta, sem "pronto": o cartão está em Aprovações); uma Tarefa que a pessoa mandou Parar descarta o que o gate recusou.
4. **Aprovar** (`decideApproval` kind `action`) → `onActionApproved` acorda a Tarefa (`wakeTicket`); `forRunner` leva `approved` por conector (entra na impressão digital da chave quente: o runner depois da aprovação não é o de antes), o turno é armado com aquele hash e a chamada passa UMA vez.
5. **Uma verdade só para pay/delete:** `decideConnectorUse` devolve `preview` com QUALQUER permissão e `preAllowFor` nunca as lista.
6. **Qual conector é o da chamada:** o gate informa o NOME do servidor no CLI; o host casa com o nome do conector da Tarefa; sem casar e com mais de um conector, o id fica vazio e a chamada **nunca** vira permissão permanente ("Não perguntar de novo" é ignorado).
7. **O mandato por servidor (host; bloqueador de release do Keel, 05/11 03:55):** "a persona nunca tem mais acesso do que a pessoa concedeu". Uma Tarefa nativa carrega TODOS os conectores da conta, e o gate por classe sozinho não sabe quais a persona pode tocar. `ActionBridge.arm` passa `allowedServers` = os servidores (nome cru do CLI sanitizado, via o port `mcpServerNameOf`) dos conectores que ESTA Tarefa recebeu (pedido da pessoa, "desta vez" ou permissão permanente). Qualquer ferramenta `mcp__` de outro servidor — leitura provada inclusive, e mesmo com `approved[]` — é NEGADA sem pedido e sem cartão (não é para a pessoa aprovar: está fora do mandato; o texto que volta ao modelo diz que a ferramenta não está disponível). Conector cujo nome de servidor o host não sabe dizer não entra no mandato (fail closed). Provas: `ht9-host-bridge.spec` ("a persona NEVER has more access…": Gmail dela, Drive carregado na conta e não concedido → ler e compartilhar pelo Drive negado, nenhum cartão, a Tarefa não fica `blocked`; **sem o `allowedServers` o teste falha** — a leitura do Drive passava) e `permission-gate.spec` (Tally, +7).

## A ponte dos ports reais, pronta e provada na CLI real sem modelo (Anvil, 05/11 03:50)

`persona-host/src/connector-bridge.ts` (`ConnectorBridge`) é só o ADAPTADOR dos `ConnectorPorts` sobre o pré-voo único do Tally (`McpStatusCache`: `initialize` + `mcp_status`, zero modelo, uma sessão de ~5–12 s). O host a cria no boot (nunca sob Vitest) e a atualiza em segundo plano quando velha (15 min; depois de falha espera 2 min). `PersonaHost.connectorBridge`; o que `connectorPorts` nomear vence a ponte (o shell ou um teste podem instalar o seu).
- `availableConnectors('claude')` ← `accountsOf`: os conectores CONECTADOS da conta (escopo `claudeai`), nome sem o prefixo "claude.ai " e a URL do proxy como id (nunca mostrada, nunca logada, só em memória);
- `connectorDefinitionOf` ← `account` se a URL está na lista, senão `missing`;
- `mcpStatusOf` ← a tabela enxuta do cache (sem URL): o gate só chama de leitura o que o PRÓPRIO servidor provou `readOnly`; o resto pergunta;
- `cliIsolation` ← `cliIsolationProven` com a versão do probe de conexões (sem versão ou sem veredito = `none`: o cartão avisa que o conector fica sempre carregado);
- `connectorsNeededBy` ← o roteamento puro do engine, só alimentado com o texto da PESSOA.
**Prova:** `tests/connector-bridge.spec.ts` (7), `tests/ht9-host-bridge.spec.ts` (7, incluindo a cadeia inteira da frase da pessoa → ponte → conector → leitura sem cartão → envio com cartão) e, na CLI real, `persona-host/scripts/connector-bridge-dry.ts` (só requisições de controle e só contagens): 21 servidores, 412 ferramentas, 5 conectores da conta, todos `account`; por conector, a leitura provada pelo servidor passa, envia/apaga/paga perguntam, e **nenhuma** ferramenta sem prova de leitura é tratada como leitura.
**Limites:** só conector DA CONTA (escopo `claudeai`); servidor do próprio usuário (`user`/`project`) ainda não é concedível (`missing`). Com o modo padrão `answer-only` uma Tarefa com ferramentas roda NATIVA: o CLI carrega todos os conectores da pessoa e o isolamento por persona não vale (por isso `cliIsolation = none` e o cartão avisa); o gate (gancho PreToolUse) continua valendo e é ele que pergunta antes de enviar. O custo por chamada (`connectorCostOf`) não está ligado.

## O mandato por servidor: `allowedServers` (Keel/Anvil, D-081/D-083, 05/11 04:00)
**O furo que fechou:** o gate decidia por CLASSE global e não sabia QUAIS conectores a persona recebeu. Na Tarefa nativa (todos os conectores da conta carregados), um grant só do Gmail deixava `mcp__claude_ai_Drive__search` (leitura provada) passar, e um envio pelo Drive virava cartão em vez de ser NEGADO. "Uma persona nunca tem mais acesso do que a pessoa concedeu."
- `gate.arm({ preAllow, approved, allowedServers })`: nomes de servidor como a CLI os usa em `mcp__<servidor>__<ferramenta>`, JÁ sanitizados pelo host. **Presente (mesmo vazio) ⇒** toda ferramenta `mcp__` de servidor que NÃO está em `allowedServers` ∪ `ownServers` é **NEGADA**, com texto fixo ("fora do que esta persona recebeu… não está disponível"), **sem PermissionRequest**: nem leitura, nem cartão, valha a classe que valer, com `preAllow: ['read']` ou sem, e **mesmo se a chamada estiver em `approved[]`** (aprovação de algo fora do mandato não vale; nada é liberado, `takeReleased()` vem vazio). **Ausente ⇒** o comportamento de antes (compatível).
- **Comparação por prefixo exato** `'mcp__' + servidor + '__'`, maiúsculas incluídas: `gmail` não libera `gmail_extra` nem `gmailx` nem `Gmail` (o host sanitiza; o gate não adivinha).
- **Texto que volta ao modelo:** NÃO manda esperar uma aprovação (não há ninguém a quem pedir): diz que a ferramenta não está disponível. Como não gera pedido, o turno NÃO termina `blocked` por causa dela.
- `gate.takeOutOfMandate(): { tool }[]`: só os NOMES das ferramentas que o modelo tentou fora do mandato neste turno (sem argumento, sem resultado), para diagnóstico; drena; o `arm` seguinte zera. O mandato vale POR TURNO: `disarm` o levanta e um `arm` sem a lista volta ao comportamento antigo (não herda a anterior).
- **Quem calcula a lista:** o host (ponte do Anvil), dos conectores concedidos/autorizados da Tarefa, pelo nome cru do servidor na CLI. **Testes:** `permission-gate.spec` (+7: grant só do A, leitura provada de B negada sem pedido, envio de B negado sem cartão, `approved[]` não salva servidor fora do mandato, lista vazia nega todo conector e `ownServers` segue "sem opinião", ausente = compat, prefixo exato, `takeOutOfMandate` só nomes).

# Contrato — a tabela única de autoridade e o porteiro determinístico (COLHEITA item 8, Lumen, 11/11/2026)

Uma tabela só diz **quem** a execução serve × **o que** a ação é = `allow`, `ask` ou `deny`. Todo porteiro do produto lê essa tabela; nenhum guarda veredito próprio. Código: `persona-runners/src/authority/*` (arquivos novos) + ganchos pequenos em `resolve/permission-gate.ts` e `resolve/resolve-runner.ts`. Provas: `tests/authority-table.spec.ts`, `tests/command-policy.spec.ts` (138), `tests/permission-gate-commands.spec.ts` (19), `tests/native-gate.spec.ts` (8) e, **contra o `claude` real sem modelo**, `scripts/authority-dry.ts`.

## 1. Quem (autoridade)

| Autoridade | Quando | Pode ser perguntada? |
|---|---|---|
| `person` | a pessoa pediu, direto ou por um colega | sim: o que espera vira cartão (`ask`) |
| `routine` | execução de rotina | não: o que seria cartão é **recusado** |
| `unattended` | ninguém por trás (acordada por relato, nota ou evento) | não: idem |

Regra de origem (Keel, 11/11): uma execução **iniciada por e-mail recebido NUNCA aprova envio sozinha** (`viaEmail`). `preAllowAfterOrigin` tira `send` do que a persona pode fazer sem perguntar, qualquer que seja a permissão permanente dela; só a decisão da pessoa no cartão (a chamada exata, uma vez) libera. `pay` e `delete` nunca são pré-liberados em lugar nenhum.

## 2. O quê (tipo de ação) × quem

| Ação | person | routine | unattended |
|---|---|---|---|
| `read` (só olha) | allow | allow | allow |
| `draft-change` (muda arquivo DENTRO do rascunho) | allow | allow | allow |
| `interact` (age numa página do navegador emprestado: clicar, digitar) | allow | deny | deny |
| `unknown` (não dá para ler com certeza) | **ask** | deny | deny |
| `delete` (apaga fora do rascunho) | **ask** | deny | deny |
| `send` (sai da máquina: rede, push, publicar, deploy) | **ask** | deny | deny |
| `outside-change` (muda algo FORA do rascunho) | deny | deny | deny |
| `secret` (credenciais, chaves, cofre do produto) | deny | deny | deny |
| `never` (privilégio, código codificado, registro, matar processo, código remoto) | deny | deny | deny |

A concessão de shell da persona estreita a tabela, nunca a alarga: `shell: none` não roda nada; `shell: read` roda só `read`; `shell: write` segue a tabela. `ask` só existe na coluna `person`.

## 3. O juiz de comandos (`judgeCommand`)

Texto de UMA chamada de shell (bash ou PowerShell) → tipo de ação, a palavra que decidiu (`git push`, `curl`) e um código. Puro: sem modelo, rede ou relógio.

- **Lista de permissão, falha fechada.** Só uma tabela pode PROVAR um comando inofensivo (`read`) ou confinado ao rascunho (`draft-change`: todo operando de caminho dentro do rascunho, `..`, outro disco e atalho que sai contam como fora). Tudo o que o juiz não lê com certeza é `unknown`: substituição (`$(...)`, crase), agrupamento, here-document, variável dentro de caminho, programa com caminho (`./git`), interpretador (`node x.js`), `cmd /c`, nome fora das tabelas.
- Segue `bash -c` / `powershell -Command` até 3 níveis; `-EncodedCommand`, `| sh`, `iex`, `sudo`, `reg`, `taskkill`, `PATH=` antes do comando = `never`. Linha de comando vale o pior comando.
- **Não é fronteira de segurança.** Ler linha de comando filtra o caminho honesto; depois do comando que a linha nomeia nada é seguido (script, `npm run`, programa que roda outro). Por isso o `unknown`.
- Segredo: `isSecretPath` (`.ssh`, `.aws`, `.env`, `id_rsa`, `*.pem`, `auth.json`, perfis de navegador, cofre do produto…), variável com nome de segredo (`$ANTHROPIC_API_KEY`), `printenv`/`env` sem argumento. Heurística sobre o caminho ESCRITO (nenhum atalho é seguido).

## 3b. O navegador das personas (item 17, `browser-policy.ts`)

O servidor `browser` (Chrome DevTools MCP anexado ao Chrome do perfil emprestado; `mcp__browser__*`) NÃO é conector da pessoa: o hook o julga pela linha do navegador da mesma tabela, nunca pela classe do nome.

| Ferramenta | Tipo | Resultado |
|---|---|---|
| navegar, ler, capturar (`navigate_page`, `new_page`, `list_pages`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `wait_for`…) | `read` | allow para todos |
| `click`, `hover`, `drag`, `press_key`, `handle_dialog`, `fill`, `fill_form`, `type_text` | `interact` | allow com pessoa por trás; deny em rotina/desacompanhada |
| `fill`/`type_text` com valor em forma de credencial (chave de API, token, chave privada) | `secret` | deny |
| `evaluate_script`, `upload_file` | `never` | deny por padrão (o servidor também sobe com `--no-javascriptEvaluation`) |
| qualquer ferramenta fora da lista (versão nova do servidor) | `never` | deny até alguém classificar |

A presença do servidor é o mandato dele (só é anexado com o grant do perfil e a vez do turno), por isso a recusa de "fora do mandato" dos conectores não vale para `mcp__browser__*`; um runner que NÃO leva o navegador (`configure({ browser: false })`) continua tratando esse nome como conector. Senha nunca por aqui: o Cofre v2 digita às cegas (#15); a forma-de-credencial só pega a que chegou até a persona.

**Decisão do Keel (12/11 00:20):** `interact` (clicar/preencher) liberado SEM cartão por clique, só com pessoa por trás e perfil com grant explícito do dono (o grant é o consentimento); sem pessoa por trás = deny. Condições: (1) cada interação permitida entra no livro de atividade, sem valores digitados: o gate guarda por turno `takeInteractions()` = `{ tool, verb, site? }` (o `site` é o nome de host da última página que a persona abriu por `navigate_page`/`new_page`, mantido entre turnos; ausente se o gate não viu; o host, que conhece a página, pode completar) e quem monta a linha "Bia clicou em <site>" é o host (Onyx, via `settle`); (2) senha nunca por `fill`: só a digitação cega do #15b; o gate recusa valor com forma de credencial, mas NÃO sabe se o campo é de senha (o hook não vê o snapshot da página), então a garantia real é a persona nunca ter a senha; (3) a restrição futura pelo dono é UMA célula: `authorityCell('person', 'interact')` em `authority-table.ts`.

## 4. Porteiro por CLI (`CLI_GATES`) — o que o produto garante HOJE

| CLI | comandos | escrita só no rascunho | leitura de segredo | navegador | como |
|---|---|---|---|---|---|
| Claude | `hook` | `hook` | `hook` | `hook` | `PreToolUse` HTTP (provado no binário real: `authority-dry.ts`) |
| Codex | `sandbox` | `sandbox` | nenhum | nenhum | sandbox do sistema (`workspace-write`/`read-only`, sem rede). O Codex 0.167.1 confia hooks mas NÃO despacha `PreToolUse` (Onyx): **não fingimos gate** |
| OpenCode | `static` | `static` | nenhum | nenhum | bloco `permission` em `OPENCODE_CONFIG_CONTENT` (`bash` sempre `deny`, `edit` só com concessão, `external_directory` `deny`); provado seco com `opencode debug agent build` |
| Cursor | nenhum | nenhum | nenhum | nenhum | **falha fechada**: ferramentas nativas de escrita e shell recusadas; só lê |

`cliAuthorityReport(cli).line` é a frase honesta para a tela (`undefined` no Claude). `hasBrowserGate(cli)`: **só o Claude tem o hook do navegador**; nas outras o navegador das personas não deve ser oferecido ("sem navegador", capacidade explícita, nunca falha silenciosa). Se o Keel quiser o navegador no Codex/OpenCode mesmo sem hook, é decisão dele: ali nada barra clique/digitação por chamada (só `evaluate_script` cai na origem).

## 5. O hook do Claude (permission-gate.ts)

- Matcher: `mcp__.*|Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell|Read|Grep|Glob`.
- **Só ESTREITA.** Chamada que a tabela permite = "sem opinião" (a política de ferramentas da persona decide se o `Bash` existe); o gate nunca habilita uma ferramenta que a persona não recebeu.
- `ask` (pessoa, com cartão) = recusa + `PermissionRequest` (`tool: 'Bash'`, classe `send`/`delete`/`change`, `verb`, prévia limitada, `argsHash` do **texto do comando**); aprovar = reexecutar com `approved: [{ tool: 'Bash', argsHash }]` (uma vez, exatamente aquele comando). Sem cartão (`askable: false`) ou em rotina/desacompanhada: recusa com texto fixo, sem registrar pedido.
- `arm({ authority, viaEmail, noDraft, draftRoot, … })`: tudo por turno, nada herdado. `configure({ shell })`: concessão de shell da persona, vale a vida do gate.
- `takeRefusals()`: classe e palavra do que foi recusado (nunca o comando), só diagnóstico.

## 6. O gate nativo dentro do runner (`native-gate.ts`)

Até aqui o host só abria gate para Tarefa Claude **com conectores**; uma Tarefa que só salva um cartaz rodava no `acceptEdits` sozinho. Agora `resolveRunner` abre um gate próprio para **toda** Tarefa Claude quando o host não trouxe nenhum (o navegador do item 17 é anexado por turno, depois de a sessão abrir, e sob `dontAsk` só o `allow` explícito do gate roda as ferramentas dele): armado a cada turno com o diretório do turno como rascunho (`.`/vazio = sem rascunho: `noDraft`, nada muda), mandato vazio de conectores, sem cartão, fecha com `dispose`. Gate do host (Tarefa com conectores) só recebe a concessão de shell; o host continua armando.

## 7. O que falta (outros donos / depois)

- **Host → `authority`/`viaEmail` (FEITO, Carbon P0-03a, 12/11):** `persona-host/src/run-authority.ts` (`authorityOfRun`) deriva quem o turno atende da origem REAL do Ticket: `person` (mensagem de pessoa, `proposal-accept:`, `steer:`), `routine` (`routine-run:<run>:<n>`), `unattended` (rotina disparada por evento `@event:`, `initiative:`, `plan:`). Contagioso como o `viaEmail`: `handoff:<Task>`, `split:<mensagem>`, `inputs` e `origin.triggerIds` carregam o mais restrito; histórico ilegível (corrente longa, ciclo, Task de origem sumida) nunca é `person`. Chega ao gate por dois caminhos: `ActionBridge.arm(runner, ticket, draft, { authority, viaEmail })` (gate do host) e, por turno, `HostRunnerRequest.authorityOf` → `createOarSessionRunner({ authorityFor })` → `StartTurnInput.authority` → `withNativeGate` (gate do próprio runner; o runner é quente entre Tasks, então nunca fica fixo na criação). Sem nada dito o padrão continua `person`. CONECTORES (decisão do Keel, 12/11): o cartão de aprovação segue aparecendo para a pessoa em qualquer autoridade. O que o `authority` muda no caminho de conector é o PRÉ-PERMITIDO (`preAllowAfterOrigin`): uma rotina AGENDADA pelo dono (`routine`) MANTÉM a renúncia "não perguntar de novo" (é consentimento explícito dele: "mande o resumo toda segunda por e-mail" envia); um run `unattended` (iniciativa da persona, `plan:`, evento externo) NUNCA tem `send`/`pay`/`delete` pré-permitidos, com ou sem renúncia: precisa do cartão da pessoa; `viaEmail` continua tirando `send` de qualquer autoridade. Para navegador (`interact` negado), shell (`ask` negado) e `secret`/`never` valem as linhas da tabela. Testes: `authority-table.spec.ts`, `permission-gate-commands.spec.ts`, `ht9-host-bridge.spec.ts` (iniciativa com renúncia gera cartão; rotina agendada com a mesma renúncia envia).
- **Cartão de pedido de shell**: o `PermissionRequest` do `Bash` entra em `ActionBridge.settle` como as ferramentas de conector (conector vazio); Prism/Muse definem como o cartão mostra "rodar comando".
- Tela: a frase de `cliAuthorityReport` em Conexões (Quill/Muse).
- Codex: reavaliar quando uma versão despachar `PreToolUse` (hoje: sandbox + sem rede, leitura de arquivos não é barrada).

## Segredo digitado (Carbon P0-02, 12/11)

O host digita senha do Cofre e os 6 dígitos do dono sem que o modelo os veja. Regras (código em `persona-host/src/browser/` e `persona-runners/src/authority/secret-window.ts`):

- **Resposta ao modelo = frases nossas.** `browser_login` responde com a frase montada pela porta (`loginTypedLine(título)`), uma das frases fixas de `BLIND_LOGIN_LINES`/`LOGIN_NO_SITE` ou `LOGIN_FAILED`. O texto da digitação e a mensagem de um erro dela nunca chegam ao modelo.
- **Fonte única de máscara.** O host registra `SecretMask` uma vez: `createMcpGateway({ redact })` mascara TODA resposta do gateway; `registerSecretWindow(open, redact)` entrega ao gate de runners a janela (10 min) e o redator. `SecretMask` cobre `%XX` (maiúsculo/minúsculo), `+` de form, escape JSON e base64/base64url nos 3 alinhamentos. `fillCofreCode` arma a máscara com os 6 dígitos.
- **Janela aberta** (qualquer segredo vivo no host, não por persona): `list/get_network_request(s)`, `list/get_console_message(s)`, traces e lighthouse viram `secret` (recusados para todos); `take_memory_snapshot` é `never` sempre. O hook `PostToolUse` (só `mcp__browser__*`) devolve `updatedToolOutput` mascarado em qualquer forma da resposta.
- **Vigia da barra de endereço** roda DEPOIS do retorno da chamada (2 min, 1 s): senha na URL → aba para `about:blank` + `Page.resetNavigationHistory`, e o host grava no livro de atividade `browser_leak` ("a senha apareceu no endereço da página; fechei a aba"): login, nunca o endereço nem o valor.
- **LIMITE conhecido: `take_screenshot`.** É imagem e não se mascara. O campo de senha já vem em bolinhas, então a captura não entrega o valor; só um "mostrar senha" feito pelo próprio site do login (clique + captura) o revelaria a um modelo com visão. O `take_snapshot` (texto) é mascarado pelo `PostToolUse`.
- Prova no CLI real, sem modelo (US$ 0): `node --import tsx/esm packages/persona/persona-runners/scripts/secret-mask-dry.ts` → `persona-spec/reports/secret-mask-dry.json`.

## Código 2FA do Cofre (Carbon P1-04, 12/11)

Fluxo completo, com os 6 dígitos nunca passando pelo modelo:

1. **Oferta das ferramentas.** `ask_vault_code` e `browser_login` são ferramentas de COORDENAÇÃO (`harness-turn.ts`): a persona comum não tem concessão de arquivo/shell (uma Task sem rascunho é `grantless`) e antes só recebia as de coordenação, então nunca as via. Agora, com o turno no navegador de um perfil emprestado e um login no Cofre (`browserLoginOf`), ela recebe as duas, qualquer que seja o texto do pedido (a página de login pode pedir um código que ninguém citou); sem navegador, `ask_vault_code` só sai pelas palavras do pedido.
2. **Cartão.** `ask_vault_code({ reason, login })` abre o pedido (o `login` é obrigatório na prática: o código só é digitado na página desse login). O cartão vive em Aprovações (`ConnectedCodeRequests`). O dono preenche; `fillCofreCode` sela os dígitos, arma a máscara e ACORDA a Task da persona (`CofreCodes.onFilled` → `wakeTicket`).
3. **Digitação cega.** No turno seguinte a persona clica no campo do código e chama `browser_login({ login, code: true })`. A porta (`BrowserLoginPorts.openCode`): acha o pedido PREENCHIDO desta persona e desta Task (`filledFor`), exige que ele seja para ESTE login (o dono viu o site no cartão; código do banco nunca vai para a loja), lê os dígitos sem gastá-los (`peek`), digita no campo focado (ou no primeiro campo que diz aceitar código, nunca no de senha) só na origem do login (`typeLoginBlind({ field: 'code' })`) e só depois gasta (`take` + `secrets.drop`). Página sem campo = nenhuma digitação e o código fica para outra tentativa. Resposta ao modelo: só frases nossas (`codeTypedLine`, `BLIND_CODE_NO_FIELD`, `CODE_NOT_FILLED`, `CODE_OTHER_LOGIN`, `LOGIN_FAILED`).
4. **Ciclo de vida.** Cancelar um pedido já preenchido apaga os dígitos selados; um código preenchido e não usado expira 10 min DEPOIS do preenchimento (não do pedido) e nunca é entregue; `CofreCodes.sweep` apaga os selados vencidos/cancelados (rodado em `listCofreCodes`).
- LIMITE: campo de código em várias caixinhas de 1 dígito (OTP segmentado) não é coberto: `Input.insertText` digita no elemento focado.
- Testes: `cofre-2fa.spec.ts`, `browser-login-code.host.spec.ts`, `browser-blind-typing.host.spec.ts` (Chrome real), `harness-turn-browser-tools.spec.ts`.

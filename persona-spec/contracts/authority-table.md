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

- **Host → `authority`/`viaEmail`**: `ActionBridge.arm` (Prism) passa `authority: 'routine' | 'unattended'` quando a execução vier de rotina/evento e `viaEmail: true` quando o Trigger trouxer o campo da Jade (19b). Sem isso o padrão é `person`.
- **Cartão de pedido de shell**: o `PermissionRequest` do `Bash` entra em `ActionBridge.settle` como as ferramentas de conector (conector vazio); Prism/Muse definem como o cartão mostra "rodar comando".
- Tela: a frase de `cliAuthorityReport` em Conexões (Quill/Muse).
- Codex: reavaliar quando uma versão despachar `PreToolUse` (hoje: sandbox + sem rede, leitura de arquivos não é barrada).

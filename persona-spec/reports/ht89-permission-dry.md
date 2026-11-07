# HT-8 / HT-9 — o gate de permissão por ferramenta + argumentos: experimento seco

Tally, 04/11 (relógio real). Pergunta (Rivet, Keel, Anvil): o runner de hoje descarta os argumentos de um pedido de permissão e não consegue liberar **uma** ferramenta com **estes** argumentos. Dá para fazer a prévia ("A Nina vai enviar este email para fulano · [prévia] · Enviar"), o "aprovar = reexecutar" e o "Desfazer só onde o conector oferece", e checar que o que foi aprovado é o que roda, **sem remendar o OAR**?

**Veredito: SIM, com o gancho `PreToolUse` HTTP da própria CLI.** Não precisa de patch no OAR, de `node` no PATH da pessoa, nem de arquivos de troca. Brutos: `ht89-permission-dry.json`.

## Método (zero modelo real, zero gasto, nenhum login usado)

`claude` 2.1.318 real contra um endpoint Anthropic **falso** em `127.0.0.1` (o "modelo" manda chamar `mcp__fake__send_message` com `{to, body}`) e um servidor MCP local falso que **registra quando uma ferramenta de fato roda**. Modo chave de API fictícia, HOME vazio, argumentos de teste inventados. Cada cenário é a CLI no modo do produto (`-p` stream-json, `--setting-sources project`, `--strict-mcp-config`, `--tools ''`).

## O que a CLI faz hoje (sem gancho)

| cenário | executou? | o que o "modelo" recebeu |
|---|---|---|
| `--permission-mode dontAsk`, nada liberado | **não** | erro: "Permission … denied because Claude Code is running in don't ask mode" |
| `dontAsk` + `--allowedTools mcp__fake__send_message` | **sim** | resultado da ferramenta |
| modo padrão (sem `--permission-mode`), nada liberado | **não** | erro: "Claude requested permissions … but you haven't granted it yet" |

**A CLI nunca pergunta ao host** neste modo (nenhum `control_request` `can_use_tool` chegou): ela nega em silêncio. O OAR roda a CLI em modo YOLO e **não tem API para o host responder** a um pedido de permissão (só registra o pedido). Logo, o caminho "o adapter vê o `app_request` e responde" não existe como está, e os argumentos nunca chegam ao host.

## O que o gancho faz

O gancho `PreToolUse` é chamado pela CLI **antes de cada chamada de ferramenta** e recebe `tool_name`, `tool_input` (os argumentos **completos**), `tool_use_id`, `mcp_server`, `permission_mode`, `cwd`, `session_id`, `prompt_id`, `effort`. Responde `permissionDecision: allow | deny` com uma razão que o modelo lê.

| cenário (gancho de comando e HTTP deram o mesmo) | executou? |
|---|---|
| nada aprovado (`dontAsk`) | **não**; razão "precisa da aprovação da pessoa" |
| aprovado **este** hash dos argumentos | **sim** (o `allow` do gancho libera mesmo em `dontAsk`) |
| aprovado **outro** hash (argumentos trocados) | **não** — "aprovei A, enviou B" não acontece |
| gancho + modo padrão, aprovado este hash | **sim** |

**Gancho HTTP:** `{"type":"http","url":"http://127.0.0.1:<porta>/hook","headers":{"X-Persona-Run":"…"}}` mais `allowedHttpHookUrls: ["http://127.0.0.1:*"]`, tudo em `--settings` (fonte de argumento, vale sob `--setting-sources project`). O servidor é **o próprio host**: recebe o POST com ferramenta e argumentos, calcula o `argsHash`, confere a lista aprovada e responde; o cabeçalho com o token da execução chega. Sem `node` no PATH, sem arquivo.

## Duas regras de segurança que o experimento impôs

1. **O gancho tem de ser a ÚNICA coisa que libera uma ferramenta controlada.** Com o servidor do gancho **fora do ar** e `dontAsk` sem regra `allow`: a ferramenta fica **negada** (fail-closed, bom). Mas com a ferramenta também numa regra `allow` (`--allowedTools` / `permissions.allow`), a falha do gancho é **não bloqueante** e a ferramenta **executa**. Portanto: **nunca** pôr uma ferramenta controlada em `--allowedTools`; a base é `dontAsk` sem `allow`; a liberação de leitura (`preAllow`) também é decisão do gancho, não regra estática.
2. **O token da execução** (cabeçalho) e a porta de `127.0.0.1` valem só para aquela sessão; o servidor recusa o que não traz o token. A lista `approved` mora na memória do host, nunca na linha de comando da CLI.

## Como isso cobre cada pedido

- **Prévia ("A Nina vai enviar…"):** o gancho recebe os argumentos reais → `boundedInput` (≤ 20 campos, 4 KiB, 16 KiB, segredo mascarado, `truncated`/`masked`) vira o `requestedInput` do cartão; a razão devolvida ao modelo diz para **parar e avisar** que precisa de aprovação. O turno termina normalmente e o host abre o cartão com `PermissionRequest { tool, actionClass, verb, requestedInput, truncated, masked, argsHash }`. Resolve o gap (2) do Rivet.
- **Aprovar = reexecutar:** o host reabre a Tarefa com `approved: [{ tool, argsHash }]`; o gancho libera **uma vez** (consome) só se o hash dos argumentos **reais** dessa vez bater; senão nega e volta `blocked` com cartão novo (até 2 tentativas). Resolve o gap (3).
- **Classe da ação:** o gancho não recebe as anotações, mas o `mcp_status` as traz (`tools[].annotations`, normalizadas: `readOnly: true`; vazio `{}` quando o servidor não diz nada). O pré-voo guarda a tabela `ferramenta → anotação` por sessão, e `classifyTool(tool, annotations)` decide a classe (sem anotação ⇒ `send`, falha fechada). `pay` e `delete` **nunca** ficam em `preAllow`.
- **Conectores da conta (ISO-5):** passam pelo mesmo gancho (é por ferramenta, de qualquer servidor), então a trava que o Rivet notou faltar no gateway X-1 existe: allowlist por URL + gancho. Resolve o gap (6).
- **Desfazer:** só onde o conector oferece (rascunho/agendar); o gancho não promete nada que o conector não tenha (gap 4).
- **Codex / OpenCode / Cursor:** sem prova equivalente; `permissionRequests` ficam `none` (o host entrega só leitura e a tela diz) — gap (5).

## Plano de código (v1.1, `persona-runners`)

Arquivos novos: `resolve/permission-gate.ts` (servidor HTTP local + decisão pura: classe, `approved`, consumo único, token; sem dependências além de `node:http`), `resolve/permission-gate-settings.ts` (monta o `--settings` com o gancho e `allowedHttpHookUrls`), testes secos com um cliente HTTP simulando a CLI; **e** um teste de contrato com a CLI real contra o endpoint falso (`scripts/ht89-dry.ts`, trava `check`, zero modelo) como regressão por versão, no molde do `iso-dry`. Aditivo em `adapter.ts` (ler o relatório de bloqueio ao fim do turno e emitir `blocked` com `permissionRequest`). Ordem: gate puro + testes → ligação opt-in por `HostRunnerRequest.connectors`/`preAllow` (Anvil) → regressão.

## Limites declarados

O gancho é comportamento observado da 2.1.318 (como o ISO-5): a regressão por versão cai para **só leitura** (nenhuma escrita liberada) se mudar. Um modelo que **não** chame a ferramenta por MCP (ex.: pede ao usuário) não passa pelo gancho, e isso é correto. O gancho só vê ferramentas que a CLI chama; uma ação feita por uma ferramenta embutida (Bash/Write) segue a política de ferramentas da persona, não esta.

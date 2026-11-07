# HT-0 — transporte das ferramentas de produto até a CLI viva

Rivet, 04/11 21:30. Pedido do Keel (gargalo da v1.1). Contrato do transporte; o desenho das ferramentas (catálogo, ACL, atividade) é `harness-tools.md` (Bolt/Forge). Código: `persona-runners/src/{contract,mcp/gateway,mcp/turn-tools,oar/tool-binding,oar/adapter,oar/session,resolve/tool-level}.ts`.

## O que o host faz (3 linhas)

```ts
const gateway = createMcpGateway({ hooks, brain, gestor, harness, outbound, onlyWired: true, onApproval })   // 1x por processo
const session = createOarSessionRunner({
  turn, personaId, model, permissionMode,
  toolsFor: ctx => openTurnTools(gateway, { run: { personaId, ticketId: ctx.ticketId, assignmentId: ctx.assignmentId }, toolLevel, worktree: ctx.cwd }),
})
```

- `openTurnTools` abre a **concessão do gateway daquele turno** (identidade = a Assignment; nível = a concessão da persona) e devolve `TurnToolSet` com **só o que o gateway anuncia** para esse nível e **só portas ligadas** (`onlyWired`). Sem ferramenta a oferecer devolve `undefined` e não deixa concessão aberta.
- Cada chamada da CLI passa por `gateway.call(token, …)`: ACL, `personaId/ticketId` forjado recusado, ação sensível vira **aprovação** (`onApproval(PendingApproval)` avisa o host → cartão "Precisa de você"; o modelo recebe "A ação espera a decisão da pessoa; não tente de novo nem contorne").
- A concessão fecha sozinha ao fim do turno (terminou, falhou, cancelou) ou se o turno nem começa (`toolsFor` é fechado se `start` rejeita).

## O que o runner faz

- `StartTurnInput.mcpTools?: TurnToolSet` (aditivo). Só CLIs com `capabilities.mcpTools === 'available'` (Claude, Codex, OpenCode); Cursor ignora.
- O adaptador OAR serve as ferramentas com `serveMcpTools` (http em 127.0.0.1 + bearer, token do OAR) e anexa em `SessionOptions.mcpServers` na abertura da sessão. Servidor `persona` ⇒ no Claude as ferramentas se chamam **`mcp__persona__<ferramenta>`**.
- **Claude**: acrescenta `--allowedTools=mcp__persona` (só o servidor servido) aos `launchArgs`, porque em `dontAsk` o que nenhuma regra permite é negado em silêncio. As ferramentas nativas continuam como a política manda.
- **Sessão quente**: a chave da sessão inclui a **assinatura da lista** de ferramentas (nomes + schemas + servidor). Lista diferente (concessão mudou) ⇒ sessão nova. Quem **chama** é o turno: os handlers servidos delegam a `binding.current` (o conjunto do turno em andamento); entre turnos está vazio e qualquer chamada é recusada. Nunca fica a identidade do turno anterior.
- `resume` leva `mcpTools` e `effort` (antes o `effort` se perdia no resume e a sessão não achava o próprio slot quente).
- Falha ao servir ⇒ `ToolsUnavailableError` (`code: 'tools_unavailable'`), o turno falha alto em vez de rodar sem as ferramentas que o pedido presume.
- A conversa em modo `deny` com ferramentas oferecidas recebe "use as ferramentas da Persona oferecidas neste turno" em vez de "não use ferramentas"; sem ferramentas o texto é o de sempre.
- `withToolLevel` isenta **exatamente** os nomes servidos àquele turno (a concessão do gateway decide), nunca as nativas.
- Correção junto: os quadros `tool_call_input/_ended/_progress` do OAR só trazem `callId`; viravam `tool:tool` e o guarda de nível recusava "tool" como escrita desconhecida. Agora uma chamada = uma linha `tool:<nome>`.

## Prova

| Prova | Como | Resultado |
|---|---|---|
| Unidade (sem CLI) | `vitest packages/persona/persona-runners/tests` (`tool-binding`, `turn-tools`, `tool-level`) | 58 arquivos, 396 testes verdes; `check-pkg persona-runners` OK |
| **CLI Claude de verdade, endpoint falso (custo zero)** | `node --import tsx/esm packages/persona/persona-runners/scripts/ht0-claude-spike.ts` (saída em `.maestri/tmp/ht0-claude-spike.json`) | 5/5 cenários |

Cenários do spike (o `claude` instalado, aberto pelo `resolveRunner` do produto, apontado para um Anthropic falso que registra o que a CLI oferece ao modelo e faz o `tool_use`):
1. **read-ok**: concessão `read` ⇒ a CLI oferece ao modelo `mcp__persona__persona_recall` e só ela; o hook roda como `nina/ht0-t/<assignment>`; o resultado volta como `tool_result`.
2. **forged**: `ticketId` forjado nos argumentos ⇒ `forged actor refused`, hook nunca chamado.
3. **no-grant**: nível `none` ⇒ `openTurnTools` devolve `undefined`; a CLI não recebe nenhuma ferramenta da Persona.
4. **approval**: concessão `write`, o modelo chama `persona_email_send` ⇒ pausa para a pessoa (`onApproval` 1×), **nada enviado**, o modelo recebe a frase de espera.
5. **warm**: dois turnos na **mesma** sessão da CLI ⇒ a 2ª chamada roda como a Assignment 2 (nunca a 1).

## Codex (provado com a CLI REAL, 04/11 23:10)

`node --import tsx/esm packages/persona/persona-runners/scripts/ht0-codex-spike.ts` (endpoint `responses` falso, CODEX_HOME descartável apontando para ele, zero modelo): **4/4** — read-ok (o Codex lista o servidor `persona` e só `persona_recall`; o hook roda como `nina/ht0-t/<assignment>`; o resultado volta como `function_call_output`), forged (`forged actor refused`), no-grant (nenhuma ferramenta), approval (`persona_email_send` pausa para a pessoa, `onApproval` 1×, nada enviado).

O que o Codex exigiu (achados):
1. **Aprovação do servidor.** O Codex pede aprovação para toda ferramenta MCP que não é `readOnlyHint`, e o OAR abre a thread com `approvalPolicy: "never"`; o pedido é RECUSADO (`MCP tool call requires approval, but approval policy is never`). A ACL é do gateway, então o servidor `persona` (só ele) é pré-aprovado com `default_tools_approval_mode = "approve"`. Medido: um `-c` na linha de comando é substituído pelo override `mcp_servers` do OAR no thread/start (e uma entrada parcial dá `invalid transport` e o app-server sai); uma entrada no **`config.toml` do CODEX_HOME** é mesclada campo a campo. Por isso o runner escreve um bloco gerenciado (`oar/codex-tools-config.ts`: `enabled = false`, url de marcação, `default_tools_approval_mode = "approve"`; o OAR liga `enabled`, põe a url e o bearer reais) **só na home ISOLADA do produto**. Na home NATIVA da pessoa o produto não escreve: lá o Codex **não recebe ferramentas de produto** (limitação honesta; `OarRunnerOptions.codexHome` ausente).
2. **Nome da ferramenta.** O OAR reporta a chamada MCP do Codex como o TIPO do item (`mcpToolCall`), sem o nome; o adaptador lê `server` + `tool` do quadro nativo `item/started` e reporta `mcp__<servidor>__<ferramenta>`, igual ao Claude, para o guarda de nível e a isenção valerem nos dois.
3. O Codex lista as ferramentas MCP num namespace (`mcp__persona` → `persona_recall`).

## Limites (o que esta prova não cobre)

- Modelo scriptado: prova o **transporte e a ACL**, não que um modelo real escolha a ferramenta certa (isso é prompt/HT-2+).
- **Codex nativo** (home da pessoa, sem isolamento): sem ferramentas de produto (o produto não escreve no `config.toml` dela).
- OpenCode (ACP) aceita http só se o agente declara `mcpCapabilities.http`; sem prova.
- O ponto de interceptação PreToolUse para HT-8/9 (Tally) é outro mecanismo (`--settings`); os nomes a casar são `mcp__persona__*`.
- Ligar `toolsFor` em `persona-host/src/runner.ts` é do Bolt; este contrato é a API estável.

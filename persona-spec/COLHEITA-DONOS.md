# COLHEITA: quem toca qual arquivo (Keel, 11/11 22:00)

Regra-mãe: **lógica nova vai em arquivo novo do dono; os arquivos quentes só recebem GANCHOS pequenos (≤ 30 linhas) dentro do trecho do dono.** Fora do seu trecho, peça ao Keel em 1 linha.
Caminhos abaixo: `H` = `packages/persona/persona-host/src`, `R` = `packages/persona/persona-runners/src`, `E` = `packages/persona/persona-engine/src`, `C` = `packages/persona/client-ui-persona/src/client`.

## Protocolo de edição nos arquivos quentes (orchestration.ts, runner.ts, oar/session.ts, handoffs.ts)
1. Esses arquivos são **CRLF**. Edição só com método que preserve CRLF e falhe fechado (âncora única); nunca reescrever o arquivo inteiro nem rodar formatador nele. Depois confira: nº de linhas com `\r` = nº total de linhas.
2. Releia o arquivo **imediatamente antes** de editar. "Modified since read" = outro dono acabou de mexer: releia e refaça a âncora, não force.
3. Um gancho por vez, no seu trecho. Se precisar de uma função nova num arquivo quente, ponha-a em arquivo novo e importe.
4. Contrato entre frentes (tipos/ports em `contract.ts`/`port.ts`): só **adição**, e avise o Keel na hora.

## `H/orchestration.ts` (4065 linhas): trechos por dono (nomes de método, não de linha)
| Dono | Item | Trecho que pode editar |
|---|---|---|
| **Forge** | 1 | `ingest` (ramo de divisão), `pendingFromPersona*`, `involvedPersonaIds`, `releaseReady`, `releaseSplitNext`, `holdSplitPart`, `settleCandidates`, `forgetRouted`, `functionRouteOf`, `splitByFunction`, `plannedPartsOf`, `settleTask` |
| **Bolt** | 3 | cauda de `runLaunched` (depois do `whenIdle`/`noteUsage` do laço de Tarefa) e `finishReply` (gancho para `turn-close.ts`) |
| **Cobalt** | 2a | `prewarmProject`, `prewarmAll`, `disposeRunners`, `runtime`, `evictWarmRunners`, `dropWarm`, `dropEndedTaskRunners`, `taskRunnerOf` |
| **Zinc** | 2b, depois 12 | 2b: `steerTicket`, `stopTicketRun`, `replyStream`, `settleReply`, `finishStopped`, `stopReply`, `cancelReply`. 12 (só depois do 2b integrado): `driveTicket`, `queueWork`, `startFromBoard` |
| **Flint** | 7, depois 13 | `absorb`, `absorbingTicket`, `noteBusy` (resposta de status e cartão "Continuar") |
| **Anvil** | 4 | 1 linha em `talkLayers` chamando a camada de fala (resto em `H/speech.ts` novo) |
| **Tally** | 9 | `talkLayers` (resto), `compileUsed*` (estabilidade do prefixo). Anvil entra com a 1 linha dele primeiro |
| **Jade** | 10 | `holdForWindow`, `releaseWindowQueue`, `quotaBook`, `waitForQuota`, `quotaRows`, `quotaWaiting`, `resumeQuotaWaiting`, `releaseHeld` |
| **Lumen/Onyx** | 8 | nenhum trecho aqui: gate vai em `R/mcp/*` e `R/oar/*` (Onyx: codex/cursor/opencode) |
| **Prism** | 5 | nenhum trecho aqui: aprovação em `H/action-bridge.ts`, `H/external-actions.ts` + `C/` |
| **Keel** | — | o resto (`recover`, `kanban`, review, pausa) e qualquer gancho fora de trecho |

## Outros arquivos compartilhados
| Arquivo | Regra |
|---|---|
| `H/runner.ts` | Bolt: só o campo `TextCapture.tools`. Cobalt: pool/ciclo de vida. Zinc: nada (deltas vão em `H/reply-stream.ts` e `R/oar/session.ts`). Mudanças aditivas |
| `R/oar/session.ts` | **Zinc** (deltas, steer, `inputRead`/`inputDropped`). Cobalt não edita este arquivo |
| `R/oar/adapter.ts`, `claude.ts`, `codex.ts`, `cursor.ts`, `opencode.ts`, `isolation*.ts` | **Cobalt** (spawn, `--resume`, stdin EOF, `taskkill /T`). Lumen/Onyx pedem ao Cobalt qualquer mudança de spawn para o gate do item 8 |
| `R/contract.ts`, `R/port.ts` | só adição; quem adiciona avisa o Keel |
| `H/handoffs.ts`, `H/handoff-wire.ts`, `H/split-chain.ts`, `H/function-route.ts`, `H/harness-team.ts`, `H/harness-dispatch.ts`, `R/mcp/harness-tools.ts`, `E/handoff.ts` | **Forge** |
| `H/harness-turn.ts` | Bolt (fim de turno) e Forge (pass_forward) em funções diferentes: cada um só na sua |
| `E/continue.ts`, `E/watchdog.ts` | Bolt (continuações/`endsAsking`); Flint só consome o veredito |
| `C/chat/markdown/{parse-markdown.ts,MarkdownBody.tsx,MarkdownBody.module.css}` | **Anvil** até o item 4 integrar (aditivo: `<details>`); Quill/Prism não editam |
| `C/` chat e presença (resto) | Quill (6, 14), Prism (5, 18), Rivet (11, 19a): cada um no seu componente novo |
| `scripts/persona/check-cleanroom.mjs` | Gauge |

## Interfaces entre frentes (quem publica primeiro)
- **Bolt → Flint:** `H/turn-close.ts` exporta o tipo do veredito (`feito` / `continuar(motivo)` / `esperar-dono` / `cartao-continuar`). Bolt publica o **tipo** em 1 h; o orçamento de 3 continuações termina em `cartao-continuar`, que o Flint transforma no cartão.
- **Forge → Bolt/Flint:** quando um repasse está rastreado e pendente, o fim de turno do pedinte é `esperar-dono`-like ("esperando colega"), nunca "Pronto". Forge expõe `pendingFromPersonaIn` (já existe) como a fonte.
- **Cobalt ↔ Zinc:** Cobalt mantém o processo vivo e entrega o fluxo de eventos; Zinc traduz eventos em deltas. O ponto de contato é `Runner.deliver` (`R/port.ts`): ninguém muda a assinatura sem avisar.
- **Anvil → Tally:** a camada de fala entra no **prefixo fixo** (conteúdo estável, sem timestamp nem id por turno), para não quebrar o `warmKey`.

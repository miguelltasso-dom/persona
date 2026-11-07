/**
 * HT-8/HT-9 dry proof of the HOST's connector bridge on the REAL `claude` of this computer: control requests only (`initialize` + `mcp_status`), NO
 * user message, so no model and no spend. It runs the product's own code path — `ConnectorBridge` over the runners' pre-flight cache — and prints
 * COUNTS only: no connector name, no URL, no tool name, no account.
 *
 *   node --import tsx/esm packages/persona/persona-host/scripts/connector-bridge-dry.ts
 *
 * What it proves, in order:
 *   1. the pre-flight answered (otherwise the persona has no connector: fail closed, exit 1);
 *   2. `availableConnectors('claude')` lists the connected connectors of the ACCOUNT, and each one is `account` for `connectorDefinitionOf`;
 *   3. for the tools of those connectors, the gate's classification (`annotationTable` + `classifyTool`, the same as the permission gate) gives some
 *      READ (the server proved it) and every send/post/pay/delete as something that asks: nothing is a read without the server's own proof;
 *   4. the URL of a connector is nowhere in what the gate reads (`mcpStatusOf`).
 * Serialise it with the `check` lock like any other job that opens the CLI.
 */

import { annotationTable, classifyTool, type SlimMcpServer } from '@deepseek-ai/dsh-persona-runners'
import { ConnectorBridge } from '../src/connector-bridge.ts'

function say(line: string): void {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<boolean> {
  const bridge = new ConnectorBridge()
  const started = Date.now()
  await bridge.refresh()
  if (!bridge.ready) {
    say('FAIL a CLI nao respondeu ao pre-voo (sem login ou sem executavel): a persona ficaria sem conector')
    return false
  }
  const ports = bridge.ports()
  const available = ports.availableConnectors?.('claude') ?? []
  const servers = (ports.mcpStatusOf?.('claude') ?? []) as readonly SlimMcpServer[]
  say(`OK   pre-voo em ${String(Date.now() - started)} ms: ${String(servers.length)} servidores, ${String(servers.reduce((sum, row) => sum + row.tools.length, 0))} ferramentas, ${String(available.length)} conectores da conta conectados`)
  let ok = true
  if (/https?:[/][/]/u.test(JSON.stringify(servers))) {
    say('FAIL a tabela que o gate le carrega uma URL')
    ok = false
  }
  const lookup = annotationTable(servers)
  for (const [index, connector] of available.entries()) {
    const definition = ports.connectorDefinitionOf?.(connector.cli, connector.id, connector.source)
    // The CLI names the server `claude.ai <Name>`; its tools are `mcp__claude_ai_<Name>__<tool>`.
    const server = servers.find(row => row.name.replace(/^claude\.ai\s+/iu, '').trim() === connector.name)
    const prefix = `mcp__${(server?.name ?? connector.name).replace(/[^a-zA-Z0-9_-]/gu, '_')}__`
    const counts = { read: 0, change: 0, send: 0, pay: 0, delete: 0 }
    for (const tool of server?.tools ?? []) counts[classifyTool(`${prefix}${tool.name}`, lookup(`${prefix}${tool.name}`)).actionClass] += 1
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    // A tool is a read ONLY when the server proved it: nothing that is not proven read-only may be counted as one.
    const unproven = (server?.tools ?? []).filter(tool => tool.annotations?.readOnly !== true && classifyTool(`${prefix}${tool.name}`, lookup(`${prefix}${tool.name}`)).actionClass === 'read').length
    const good = definition === 'account' && total > 0 && unproven === 0
    ok = ok && good
    say(`${good ? 'OK  ' : 'FAIL'} conector #${String(index + 1)}: ${definition ?? 'sem definicao'}; ${String(total)} ferramentas: ${String(counts.read)} leitura provada, ${String(counts.change)} muda, ${String(counts.send)} envia, ${String(counts.pay)} paga, ${String(counts.delete)} apaga; leitura sem prova: ${String(unproven)}`)
  }
  if (available.length === 0) say('AVISO nenhum conector da conta conectado: nada a classificar (o pre-voo em si respondeu)')
  say(`isolamento entregue para o Claude (sem versao informada): ${ports.cliIsolation?.('claude') ?? 'n/d'}`)
  say(ok ? 'BRIDGE OK — a persona veria os conectores da conta, ler passa e o resto pergunta' : 'BRIDGE FAIL')
  return ok
}

main().then((ok) => { process.exit(ok ? 0 : 1) }).catch((error: unknown) => {
  process.stdout.write(`FAIL ${error instanceof Error ? error.name : 'Error'}\n`)
  process.exit(1)
})

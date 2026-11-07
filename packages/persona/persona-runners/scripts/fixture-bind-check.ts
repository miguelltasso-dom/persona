/** Zero model, no CLI: can OAR serve the fixture's tools? Prints the error message, if any (no personal data in it). */
import { bindTools } from '../src/oar/tool-binding.ts'
import { connectorFixtureToolSet } from '../src/mcp/connector-fixture.ts'

const oar = await import('@botiverse/oar')
const set = connectorFixtureToolSet({ count: Number(process.argv[2] ?? 30) })
try {
  const binding = await bindTools(set, oar.serveMcpTools as never)
  process.stdout.write(`served ok: ${String(set.tools.length)} tools\n`)
  await (binding as unknown as { close?: () => Promise<void> }).close?.()
} catch (error) {
  process.stdout.write(`FAILED: ${error instanceof Error ? error.message.slice(0, 600) : String(error)}\n`)
  process.exitCode = 1
}

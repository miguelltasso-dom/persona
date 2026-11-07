/**
 * Codex: pre-approve the product-tools MCP server in the (isolated) Codex home. HT-0.
 *
 * Codex asks to approve every MCP tool that is not marked read-only, and OAR opens its threads with `approvalPolicy: "never"`, so the
 * ask is DECLINED ("MCP tool call requires approval, but approval policy is never") and no product tool would ever run. The served tools
 * are behind the gateway (grant, ACL, per-call approval for the sensitive ones), so THIS server, and only this one, is pre-approved.
 *
 * It has to live in the `config.toml` of the Codex home. Measured with the real Codex 0.166: a `-c` launch override is replaced by OAR's
 * whole-table `mcp_servers` override at thread/start, while a `config.toml` entry is merged into field by field (OAR sets `url`, the
 * bearer and `enabled = true`; `default_tools_approval_mode` stays). `enabled = false` keeps turns WITHOUT product tools from ever trying
 * to start this server; OAR switches it on for the session that serves tools. The url is a placeholder, never a secret.
 *
 * Only an ISOLATED home the product owns is ever written. The person's native `~/.codex` is not touched: there, Codex has no product tools.
 */

import { ToolsUnavailableError } from './tool-binding.ts'

export const CODEX_BLOCK_BEGIN = '# >>> persona-managed: product tools (do not edit) >>>'
export const CODEX_BLOCK_END = '# <<< persona-managed <<<'

/** Filesystem seam so the writer is testable. */
export interface CodexConfigIo {
  read(path: string): string | undefined
  write(path: string, text: string): void
}

/**
 * The managed block for one server name.
 * @param name - MCP server name (`persona`).
 */
export function codexToolsConfigBlock(name: string): string {
  return [
    CODEX_BLOCK_BEGIN,
    `[mcp_servers.${name}]`,
    'url = "http://127.0.0.1:1/placeholder"',
    'enabled = false',
    'default_tools_approval_mode = "approve"',
    CODEX_BLOCK_END,
    '',
  ].join('\n')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Put the managed block into `<codexHome>/config.toml`: replace ours, or append when absent; everything else stays byte for byte.
 * @param codexHome - Isolated `CODEX_HOME`.
 * @param name - Server name.
 * @param io - Filesystem seam.
 * @throws ToolsUnavailableError when the file already defines that server outside our block (a TOML table cannot be defined twice).
 */
export function ensureCodexToolsConfig(codexHome: string, name: string, io: CodexConfigIo): void {
  const path = `${codexHome.replace(/[\\/]+$/u, '')}/config.toml`
  const current = io.read(path) ?? ''
  const begin = current.indexOf(CODEX_BLOCK_BEGIN)
  const end = begin < 0 ? -1 : current.indexOf(CODEX_BLOCK_END, begin)
  const ours = begin >= 0 && end > begin
  const outside = ours ? current.slice(0, begin) + current.slice(end + CODEX_BLOCK_END.length) : current
  if (new RegExp(`^\\s*\\[mcp_servers\\.${escapeRegExp(name)}\\]`, 'mu').test(outside)) {
    throw new ToolsUnavailableError(`o config.toml do Codex já define o servidor "${name}"`)
  }
  const block = codexToolsConfigBlock(name)
  let next: string
  if (ours) {
    next = `${current.slice(0, begin)}${block}${current.slice(end + CODEX_BLOCK_END.length).replace(/^\r?\n/u, '')}`
  } else {
    const separator = current === '' ? '' : current.endsWith('\n') ? '\n' : '\n\n'
    next = `${current}${separator}${block}`
  }
  if (next !== current) io.write(path, next)
}

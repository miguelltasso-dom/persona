/**
 * P0-B resíduo (S4, Mend): um conector MCP da pessoa que ESCREVE arquivos (um servidor de sistema de arquivos, qualquer ferramenta que não seja de leitura) passava pelo portão só pela
 * CLASSE (`change` pré-permitida = passa) e podia criar `sub/.git` (`gitdir: evil`) ou mexer em `.git/config`: a mesma classe do P0-B, fora do julgamento de shell e do decideWrite.
 * Esperado: input de ferramenta MCP (não-leitura) com um campo de caminho que alcança um `.git` (pasta ou arquivo, qualquer caixa, 8.3) é NEGADO mesmo com a classe pré-permitida;
 * ler `.git/config` e escrever arquivos comuns seguem como eram.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

const gates: PermissionGate[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(gates.splice(0).map(async gate => gate.close()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function armed(): Promise<{ gate: PermissionGate; root: string }> {
  const base = mkdtempSync(join(tmpdir(), 'gate-mcp-git-'))
  dirs.push(base)
  const root = join(base, 'rascunho')
  mkdirSync(join(root, 'sub'), { recursive: true })
  // A filesystem server reports its reads as read-only in the pre-flight (`mcp_status`); an unannotated tool is never a read (it fails closed as a `send`).
  const gate = await PermissionGate.start({ token: 'tok-1', annotations: tool => (tool.endsWith('__read_file') ? { readOnlyHint: true } : undefined) })
  gates.push(gate)
  gate.arm({ draftRoot: root, preAllow: ['read', 'change', 'send'] })
  return { gate, root }
}

async function permission(gate: PermissionGate, tool: string, input: unknown, cwd: string): Promise<string | undefined> {
  const response = await fetch(gate.url, {
    method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string } }
  return body.hookSpecificOutput?.permissionDecision
}

describe('P0-B (S4): conector MCP que escreve não alcança o `.git`', () => {
  it.each([
    ['write_file .git/config (absoluto)', 'mcp__fs__write_file', (root: string) => ({ path: join(root, '.git', 'config'), content: '[filter "x"]\n\tclean = calc\n' })],
    ['write_file sub/.git (o `.git` ARQUIVO)', 'mcp__fs__write_file', () => ({ path: 'sub/.git', content: 'gitdir: ../evil\n' })],
    ['edit_file .GIT/hooks/pre-commit', 'mcp__fs__edit_file', () => ({ path: '.GIT/hooks/pre-commit', edits: [] })],
    ['move_file para sub/.git', 'mcp__fs__move_file', () => ({ source: 'tpl', destination: 'sub/.git' })],
    ['create_directory GIT~1/hooks (8.3)', 'mcp__fs__create_directory', () => ({ path: 'GIT~1/hooks' })],
    ['file_path aninhado', 'mcp__files__save_document', () => ({ document: { file_path: 'sub\\.git\\config', text: 'x' } })],
    ['lista de caminhos', 'mcp__files__write_many', () => ({ paths: ['a.txt', 'sub/.git'], content: 'x' })],
  ])('%s é negado', async (_name, tool, input) => {
    const { gate, root } = await armed()
    expect(await permission(gate, tool, input(root), root)).toBe('deny')
  })

  it('controles: escrever arquivo comum e LER o `.git` seguem pela classe', async () => {
    const { gate, root } = await armed()
    expect(await permission(gate, 'mcp__fs__write_file', { path: 'cartaz.svg', content: '<svg/>' }, root)).toBe('allow')
    expect(await permission(gate, 'mcp__fs__write_file', { path: '.gitignore', content: 'node_modules\n' }, root)).toBe('allow')
    expect(await permission(gate, 'mcp__fs__write_file', { path: '.github/workflows/ci.yml', content: 'x' }, root)).toBe('allow')
    expect(await permission(gate, 'mcp__fs__read_file', { path: '.git/config' }, root)).toBe('allow')
    expect(await permission(gate, 'mcp__drive__upload_file', { name: 'relatorio.pdf', folder: 'Projetos' }, root)).toBe('allow')
  })
})

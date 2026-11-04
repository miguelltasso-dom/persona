/**
 * BYC (BRING-YOUR-CONTEXT.md) test fixtures: paste answers on disk + a disposable Obsidian-style vault.
 * The vault is created at test time so no binary blobs or `.obsidian/` trees live in git.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PACKAGE_ROOT } from './paths.ts'

const FIXTURE_DIR = join(PACKAGE_ROOT, 'fixtures', 'bring-your-context')

/**
 * @param name - File under `fixtures/bring-your-context/`.
 * @returns UTF-8 text.
 */
export function readBringFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}

/** Relative path → file body for the sample vault (`Buffer` for binaries). */
export const SAMPLE_VAULT_FILES: Readonly<Record<string, string | Buffer>> = {
  'notas/clientes.md': '---\ntitle: Clientes\ntags: [clientes, vendas]\n---\n# Clientes\nA Padaria Lua atende cafés do bairro. Ver [[Fornecedores]] e [[notas/regras]].\n',
  'notas/regras.md': '---\ntags: [regras]\n---\n# Regras da casa\nNunca vender fiado. Fechar o caixa às 19h.\n',
  'fornecedores.md': '# Fornecedores\nFarinha Moinho Azul entrega às terças.\n',
  '.obsidian/app.json': '{"theme":"obsidian"}',
  '.obsidian/workspace.json': '{}',
  '.trash/rascunho-velho.md': '# Rascunho velho\nIsto foi para a lixeira.\n',
  'anexos/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
  'anexos/contrato.pdf': Buffer.from('%PDF-1.4 fake'),
}

/**
 * Write a vault tree into a fresh temp dir.
 * @param files - Relative path → body (defaults to {@link SAMPLE_VAULT_FILES}).
 * @returns Absolute root and a cleanup function.
 */
export function createVaultFixture(
  files: Readonly<Record<string, string | Buffer>> = SAMPLE_VAULT_FILES,
): { readonly root: string; write(rel: string, body: string | Buffer): void; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), 'persona-byc-vault-'))
  const write = (rel: string, body: string | Buffer): void => {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  for (const [rel, body] of Object.entries(files)) write(rel, body)
  return {
    root,
    write,
    cleanup: () => { rmSync(root, { recursive: true, force: true }) },
  }
}

/** A token-shaped string assembled at runtime (never a literal in the repo). */
export function syntheticSecretLine(): string {
  return `Chave da API: ${['sk', 'live', 'AbCdEf0123456789AbCdEf0123456789'].join('-')}`
}

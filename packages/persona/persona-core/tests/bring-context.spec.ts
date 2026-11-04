import { expect, it } from 'vitest'
import {
  BRING_CONTEXT_PROMPT_EN,
  BRING_CONTEXT_PROMPT_PT,
  bringContextPrompt,
  classifyVaultPath,
  contentHash,
  decideBringApply,
  applyContextProposals,
  vaultToBringExisting,
  listVaultFolderFiles,
  parseBringPaste,
  previewBringVault,
} from '../src/index.ts'

const PASTE = `
## Sobre mim
- Miguel, dono do produto. Prefere ser tratado pelo nome.

## Empresa e projetos
- Padaria Lua, pão e café em São Paulo.

## Regras e restrições
- Nunca inventar preços.

## Decisões já tomadas
- O site usa lilás. (incerto)

## Ferramentas e processos
- Codex no dia a dia.

## Pessoas e contatos de trabalho
- CPF 123.456.789-00 da contadora.

## O que ainda está em aberto
- não sei
`

it('exposes the ready prompt in pt and en with the required headings', () => {
  expect(bringContextPrompt('pt')).toBe(BRING_CONTEXT_PROMPT_PT)
  expect(bringContextPrompt('en')).toBe(BRING_CONTEXT_PROMPT_EN)
  expect(BRING_CONTEXT_PROMPT_PT).toContain('## Sobre mim')
  expect(BRING_CONTEXT_PROMPT_PT).toContain('## Decisões já tomadas')
  expect(BRING_CONTEXT_PROMPT_EN).toContain('## About me')
  expect(BRING_CONTEXT_PROMPT_EN).toContain('(uncertain)')
})

it('parses a pasted answer into typed proposals with provenance and (incerto)', () => {
  const preview = parseBringPaste({
    text: PASTE,
    provider: 'chatgpt',
    at: '2026-11-03T15:00:00.000Z',
  })
  expect(preview.source).toBe('paste')
  const byKind = Object.fromEntries(preview.proposals.map(row => [row.section, row]))
  expect(byKind['Sobre mim']?.kind).toBe('brief')
  expect(byKind['Empresa e projetos']?.kind).toBe('brief')
  expect(byKind['Regras e restrições']?.kind).toBe('constraint')
  expect(byKind['Decisões já tomadas']?.kind).toBe('decision')
  expect(byKind['Ferramentas e processos']?.kind).toBe('memory')
  expect(byKind['Decisões já tomadas']?.uncertain).toBe(true)
  expect(byKind['Decisões já tomadas']?.status).toBe('uncertain')
  expect(preview.proposals.every(row => row.provenance === 'colado do ChatGPT em 03/11')).toBe(true)
  expect(preview.proposals.some(row => /não sei/i.test(row.body))).toBe(false)
})

it('blocks sensitive data by default and keeps the row for review', () => {
  const preview = parseBringPaste({
    text: PASTE,
    provider: 'claude',
    at: '2026-11-03T15:00:00.000Z',
  })
  const cpf = preview.proposals.find(row => row.section === 'Pessoas e contatos de trabalho')
  expect(cpf?.status).toBe('blocked')
  expect(cpf?.blocked).toBe(true)
  expect(cpf?.sensitiveWhy).toMatch(/CPF/)
  expect(decideBringApply(preview, [{ id: cpf!.id, action: 'accept' }])).toEqual([])
})

it('dedupes against the Cofre and turns a clash with a fixed decision into a question', () => {
  const preview = parseBringPaste({
    text: `
## Empresa e projetos
- Padaria Lua, pão e café em São Paulo.

## Decisões já tomadas
- O site não usa lilás.
`,
    provider: 'gemini',
    at: '2026-11-03T12:00:00.000Z',
    existing: [
      { id: 'v-brief', kind: 'brief', body: 'Padaria Lua, pão e café em São Paulo.' },
      { id: 'v-dec', kind: 'decision', body: 'O site usa lilás.' },
    ],
  })
  const dup = preview.proposals.find(row => row.kind === 'brief')
  const clash = preview.proposals.find(row => row.kind === 'decision')
  expect(dup?.status).toBe('duplicate')
  expect(dup?.duplicateOf).toBe('v-brief')
  expect(clash?.status).toBe('conflict')
  expect(clash?.conflictQuestion).toMatch(/Qual vale/)
  expect(decideBringApply(preview, [
    { id: dup!.id, action: 'accept' },
    { id: clash!.id, action: 'accept' },
  ])).toEqual([])
  const existing = vaultToBringExisting([
    { id: 'v-brief', kind: 'brief', body: 'Padaria Lua, pão e café em São Paulo.' },
    { id: '', kind: 'decision', body: 'x' },
  ])
  expect(existing).toEqual([{ id: 'v-brief', kind: 'brief', body: 'Padaria Lua, pão e café em São Paulo.' }])
  expect(applyContextProposals(preview, [{ id: clash!.id, action: 'accept' }])).toEqual([])
})

it('walks an Obsidian vault: ignores .obsidian/.trash/binaries and reimports by path+hash', () => {
  const files = [
    { path: 'notas/clientes.md', text: '---\ntitle: Clientes\n---\nVer [[Padaria]].\n' },
    { path: '.obsidian/workspace.json', text: '{}' },
    { path: '.trash/old.md', text: 'lixo' },
    { path: 'anexos/foto.png', text: 'binary' },
  ]
  const listed = listVaultFolderFiles(files.map(file => file.path))
  expect(listed.keep).toEqual(['notas/clientes.md'])
  expect(listed.ignored.map(row => row.why).join(' ')).toMatch(/obsidian|trash|Anexo/i)
  expect(classifyVaultPath('.obsidian/app.json')).toBe('obsidian')
  expect(classifyVaultPath('logo.png')).toBe('binary')
  expect(listVaultFolderFiles(['logo.png']).ignored[0]?.why).toMatch(/Anexo/)

  const first = previewBringVault({ files })
  expect(first.source).toBe('vault')
  expect(first.proposals).toHaveLength(1)
  expect(first.proposals[0]?.provenance).toBe('vault: notas/clientes.md')
  expect(first.proposals[0]?.body).toContain('Clientes')
  expect(first.proposals[0]?.body).toContain('Padaria')
  expect(first.ignored.length).toBeGreaterThanOrEqual(3)

  const again = previewBringVault({
    files,
    prior: [{ path: 'notas/clientes.md', hash: contentHash(files[0]!.text) }],
  })
  expect(again.proposals).toEqual([])
  expect(again.ignored.some(row => /mesmo caminho e hash/.test(row.why))).toBe(true)
})

it('apply accepts ready/uncertain edits and never writes blocked or discarded rows', () => {
  const preview = parseBringPaste({
    text: `
## Sobre mim
- Miguel.

## Regras e restrições
- Nunca inventar preços.
`,
    provider: 'other',
    at: '2026-11-04T00:00:00.000Z',
  })
  const me = preview.proposals.find(row => row.kind === 'brief')!
  const rule = preview.proposals.find(row => row.kind === 'constraint')!
  const applied = decideBringApply(preview, [
    { id: me.id, action: 'edit', body: 'Miguel, dono.' },
    { id: rule.id, action: 'private' },
  ])
  expect(applied).toHaveLength(2)
  expect(applied[0]?.body).toBe('Miguel, dono.')
  expect(applied[1]?.id).toBe(rule.id)
})

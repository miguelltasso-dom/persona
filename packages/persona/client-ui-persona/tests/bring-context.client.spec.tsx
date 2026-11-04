// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyPrompt, FolderDrop, ProposalReview, type ContextProposal, type ProposalChoice } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const SOURCES = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', other: 'Outra' }
const HINTS = { chatgpt: 'No ChatGPT: abra uma conversa nova', claude: 'No Claude: …', gemini: 'No Gemini: …', other: 'Em qualquer IA: …' }

describe('CopyPrompt', () => {
  it('copies the exact prompt, announces it, and the tabs only change the hint', async () => {
    const write = vi.fn(async () => undefined)
    const Wrapper = () => {
      const [source, setSource] = useState<'chatgpt' | 'claude' | 'gemini' | 'other'>('chatgpt')
      return <CopyPrompt prompt={'## Sobre mim\n…'} source={source} onSourceChange={setSource} writeClipboard={write} labels={{ title: 'Copie o pedido', lead: 'x', sources: SOURCES, hints: HINTS, copy: 'Copiar pedido', copied: 'Copiado', showAll: 'Ver tudo', showLess: 'Ver menos', tabsLabel: 'Onde colar' }} />
    }
    render(<Wrapper />)
    expect(screen.getByText(/No ChatGPT/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Claude' }))
    expect(screen.getByText('No Claude: …')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar pedido' })) })
    expect(write).toHaveBeenCalledWith('## Sobre mim\n…')
    expect(screen.getByRole('status').textContent).toBe('Copiado')
  })
})

describe('FolderDrop', () => {
  const labels = { title: 'Pasta do vault', drop: 'Arraste a pasta', dropHint: 'Obsidian ou .md', choose: 'Escolher pasta', reading: (d: number) => `Lendo ${d} notas…`, ready: (f: string, n: number) => `${n} notas de ${f}`, ignored: (n: number) => `${n} ignorados`, clear: 'Trocar pasta' }
  it('no choose button without a picker (no dead control); ready lists what was ignored', () => {
    const { rerender } = render(<FolderDrop state={{ kind: 'idle' }} labels={labels} />)
    expect(screen.queryByRole('button', { name: 'Escolher pasta' })).toBeNull()
    rerender(<FolderDrop state={{ kind: 'ready', folderName: 'Vault', notes: 128, ignored: ['.obsidian/app.json', 'img.png'] }} labels={labels} onClear={() => undefined} />)
    expect(screen.getByRole('status').textContent).toBe('128 notas de Vault')
    expect(screen.getByText('2 ignorados')).toBeTruthy()
  })
})

describe('ProposalReview', () => {
  const proposals: readonly ContextProposal[] = [
    { id: 'p1', kind: 'brief', text: 'Padaria Lua faz pães de fermentação natural.', provenance: 'colado do ChatGPT em 03/11' },
    { id: 'p2', kind: 'decision', text: 'Entrega só até 20 km.', provenance: 'colado do Claude', uncertain: true },
    { id: 'p3', kind: 'memory', text: 'CPF 123.456.789-00', provenance: 'vault: notas/contatos.md', sensitive: 'parece um CPF' },
  ]
  const labels = {
    kinds: { brief: 'Sobre você e a empresa', constraint: 'Regras', decision: 'Decisões', memory: 'Memória' },
    accept: 'Aceitar', discard: 'Descartar', edit: 'Editar', done: 'Pronto', private: 'Só para mim', uncertain: 'incerto',
    sensitiveBlocked: (why: string) => `Bloqueado: ${why}`, unblock: 'Mostrar e aceitar mesmo assim', conflict: (w: string) => `Já existe: ${w}`,
    acceptClean: 'Aceitar o que não tem aviso', save: (n: number) => `Gravar ${n} no Cofre`,
    summary: (a: number, f: number, d: number) => `${a} aceitos · ${f} pedem atenção · ${d} descartados`,
  }
  it('defaults: clean accepted, sensitive blocked; save count follows the choices', () => {
    const Wrapper = () => {
      const [choices, setChoices] = useState<Record<string, ProposalChoice>>({})
      return <ProposalReview proposals={proposals} choices={choices} onChoice={(id, c) => { setChoices(prev => ({ ...prev, [id]: c })) }} onSave={() => undefined} labels={labels} />
    }
    render(<Wrapper />)
    expect(screen.getByText('Bloqueado: parece um CPF')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gravar 2 no Cofre' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Descartar' })[1]!)
    expect(screen.getByRole('button', { name: 'Gravar 1 no Cofre' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar e aceitar mesmo assim' }))
    expect(screen.getByRole('button', { name: 'Gravar 2 no Cofre' })).toBeTruthy()
    expect(screen.getAllByText('incerto').length).toBe(1)
  })
})

// @vitest-environment jsdom
// DESIGN-SYSTEM §9: botão sem ação não aparece. ImportWizard (montado em Importar › avançado) e HirePersonaCard (prévia).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportWizard, type ImportWizardImporter } from '../src/client/importers/ImportWizard.tsx'
import { HirePersonaCard } from '../src/client/hire/HirePersonaCard.tsx'
import { pt as importersPt } from '../src/client/locale/importers/locales.ts'
import { pt as hirePt } from '../src/client/locale/hire/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('HirePersonaCard', () => {
  it('sem handlers não há botões mortos', () => {
    render(<HirePersonaCard dict={hirePt} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('cada botão existe só quando tem ação, e a chama', () => {
    const onApprove = vi.fn()
    const onDismiss = vi.fn()
    render(<HirePersonaCard dict={hirePt} onApprove={onApprove} onDismiss={onDismiss} />)
    expect(screen.queryByRole('button', { name: hirePt['action.edit'] })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: hirePt['action.approve'] }))
    fireEvent.click(screen.getByRole('button', { name: hirePt['action.dismiss'] }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('ImportWizard', () => {
  it('sem host: explica e não oferece "Escolher exportação", "Iniciar importação" nem "Desfazer"', () => {
    render(<ImportWizard dict={importersPt} />)
    expect(screen.getByText(importersPt['importer.unavailable'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: importersPt['action.chooseFile'] })).toBeNull()
    expect(screen.queryByRole('button', { name: importersPt['action.confirmImport'] })).toBeNull()
    expect(screen.queryByRole('button', { name: importersPt['action.rollback'] })).toBeNull()
    // sem arquivo não dá para continuar
    expect((screen.getByRole('button', { name: importersPt['action.next'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  function importer(): ImportWizardImporter & { calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      preview: vi.fn(async (files: readonly { name: string }[]) => { calls.push(`preview:${files.map(f => f.name).join(',')}`); return { adapterId: 'chatgpt', accepted: 3, rejected: 1, bodies: [] } }),
      confirm: vi.fn(async (batchId, files) => { calls.push(`confirm:${files.length}`); return { id: batchId, adapterId: 'chatgpt', applied: 3, rolledBack: false } }),
      rollback: vi.fn(async (batchId) => { calls.push(`rollback:${batchId.length > 0 ? 'ok' : 'x'}`); return { id: batchId, adapterId: 'chatgpt', applied: 3, rolledBack: true } }),
    }
  }

  async function pick(container: HTMLElement, name: string, text: string): Promise<void> {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([text], name, { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('com host: arquivo → prévia (aceitos/recusados) → confirmar → concluído → desfazer', async () => {
    const imp = importer()
    const { container } = render(<ImportWizard dict={importersPt} importer={imp} />)
    await pick(container, 'conversas.json', '[{"x":1}]')
    await screen.findByText('Para importar: 3 · Recusados: 1')
    expect(imp.calls).toEqual(['preview:conversas.json'])

    fireEvent.click(screen.getByRole('button', { name: importersPt['action.next'] })) // → privacidade
    fireEvent.click(screen.getByRole('button', { name: importersPt['action.next'] })) // → confirmar
    fireEvent.click(screen.getByRole('button', { name: importersPt['action.confirmImport'] }))
    await screen.findByText('Importação concluída: 3 itens')
    expect(imp.calls).toContain('confirm:1')

    fireEvent.click(screen.getByRole('button', { name: importersPt['action.rollback'] }))
    await screen.findByText(importersPt['progress.rolledBack'])
    expect(imp.calls.at(-1)).toBe('rollback:ok')
    expect(screen.queryByRole('button', { name: importersPt['action.rollback'] })).toBeNull()
  })

  it('arquivo sem nada para importar: avisa e não deixa continuar', async () => {
    const imp = importer()
    ;(imp.preview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ adapterId: 'x', accepted: 0, rejected: 2, bodies: [] })
    const { container } = render(<ImportWizard dict={importersPt} importer={imp} />)
    await pick(container, 'vazio.json', '[]')
    await screen.findByText(importersPt['preview.empty'])
    expect((screen.getByRole('button', { name: importersPt['action.next'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('falha ao ler: mensagem em português e volta a poder escolher outro arquivo', async () => {
    const imp = importer()
    ;(imp.preview as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('unsupported'))
    const { container } = render(<ImportWizard dict={importersPt} importer={imp} />)
    await pick(container, 'ruim.bin', 'xx')
    await screen.findByText(importersPt['error.preview'])
    await waitFor(() => { expect((screen.getByRole('button', { name: importersPt['action.chooseFile'] }) as HTMLButtonElement).disabled).toBe(false) })
  })
})

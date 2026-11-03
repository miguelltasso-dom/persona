export interface FileEntry {
  readonly id: string
  readonly name: string
  readonly projectName: string
  readonly updatedAt: string
  readonly sizeLabel: string
  readonly kind: 'pdf' | 'image' | 'code' | 'other'
}

export const MOCK_FILES: readonly FileEntry[] = [
  { id: 'f1', name: 'hero-v3.png', projectName: 'Site da agência', updatedAt: '03/11/2026 14:10', sizeLabel: '420 KB', kind: 'image' },
  { id: 'f2', name: 'copy-precos.md', projectName: 'Site da agência', updatedAt: '02/11/2026 11:02', sizeLabel: '8 KB', kind: 'code' },
  { id: 'f3', name: 'relatorio-semanal.pdf', projectName: 'Dendrix CRM', updatedAt: '01/11/2026 17:45', sizeLabel: '1,2 MB', kind: 'pdf' },
]

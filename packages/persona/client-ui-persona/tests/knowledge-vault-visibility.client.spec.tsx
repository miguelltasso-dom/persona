// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { MOCK_KNOWLEDGE_DOCUMENTS, MOCK_KNOWLEDGE_RECORDS } from '../src/client/knowledge/mock-data.ts'
import { pt } from '../src/client/locale/knowledge/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('Cofre visibility (BYC-4)', () => {
  it('marks private records with dashed visibility chip', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <KnowledgeVault dict={pt} records={MOCK_KNOWLEDGE_RECORDS} documents={MOCK_KNOWLEDGE_DOCUMENTS} />
      </PreviewFrame>,
    )
    const privateRecord = MOCK_KNOWLEDGE_RECORDS.find(r => r.visibility === 'private')
    expect(privateRecord).toBeDefined()
    expect(screen.getByLabelText(pt['visibility.privateAria'].replace('{label}', pt['visibility.private']))).toBeTruthy()
  })
})

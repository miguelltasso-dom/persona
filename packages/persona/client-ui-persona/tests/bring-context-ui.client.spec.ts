import { describe, expect, it } from 'vitest'
import {
  buildBringReviewPreview,
  choicesToApplyItems,
  contextProposalsFromPreview,
  organizeBringPaste,
  bringPreviewToVaultSeed,
  summarizeBringPreview,
  vaultMarkdownFromReview,
} from '../src/client/bring-context/bring-context-ui.ts'
import type { BringContextPreview } from '../src/client/bring-context/bring-context-paste-local.ts'
import { decideBringApply } from '../src/client/bring-context/bring-context-paste-local.ts'
import { defaultChoice } from '../src/client/primitives/BringContext.tsx'
import { pt as onboardingDict } from '../src/client/locale/onboarding/locales.ts'

const SAMPLE = `## Sobre mim
Miguel — fundador.

## Regras e restrições
Nunca publicar sem revisão (incerto).`

describe('bring-context UI helpers', () => {
  it('organize paste yields proposals and vault seed', () => {
    const preview = organizeBringPaste(SAMPLE, 'claude')
    expect(preview.proposals.length).toBeGreaterThan(0)
    const seed = bringPreviewToVaultSeed(preview)
    expect(seed).toContain('Miguel')
    const summary = summarizeBringPreview(onboardingDict, preview)
    expect(summary).toMatch(/propostas|proposals/u)
  })

  it('choicesToApplyItems feeds decideBringApply', () => {
    const preview = organizeBringPaste(SAMPLE, 'claude')
    const choices: Record<string, ReturnType<typeof defaultChoice>> = {}
    for (const row of preview.proposals) {
      choices[row.id] = defaultChoice({
        id: row.id,
        kind: row.kind,
        text: row.body,
        provenance: row.provenance,
      })
    }
    const items = choicesToApplyItems(preview, choices)
    const applied = decideBringApply(preview, items)
    expect(applied.length).toBeGreaterThan(0)
  })

  it('BYC-4 maps duplicateOf to ProposalReview conflict hint', () => {
    const preview: BringContextPreview = {
      source: 'paste',
      ignored: [],
      proposals: [{
        id: 'mem-dup',
        kind: 'memory',
        section: 'Notas',
        body: 'Mesma frase',
        provenance: 'vault: notas.md',
        uncertain: false,
        sensitive: false,
        blocked: false,
        sensitiveWhy: '',
        duplicateOf: 'brief-empresa',
        conflictQuestion: '',
        status: 'duplicate',
        path: '',
        hash: 'h2',
      }],
    }
    const rows = contextProposalsFromPreview(preview)
    expect(rows[0]?.conflict).toBe('brief-empresa')
  })

  it('BYC-4 maps fixed-decision conflict to ProposalReview conflict field', () => {
    const preview: BringContextPreview = {
      source: 'paste',
      ignored: [],
      proposals: [{
        id: 'dec-1',
        kind: 'decision',
        section: 'Decisões',
        body: 'Usar SQLite',
        provenance: 'claude',
        uncertain: false,
        sensitive: false,
        blocked: false,
        sensitiveWhy: '',
        duplicateOf: '',
        conflictQuestion: 'O Cofre já tem: “Postgres”. A colagem diz: “SQLite”. Qual vale?',
        status: 'conflict',
        path: '',
        hash: 'h1',
      }],
    }
    const rows = contextProposalsFromPreview(preview)
    expect(rows[0]?.conflict).toContain('Postgres')
  })

  it('choicesToApplyItems maps private and discard (BYC-4)', () => {
    const preview: BringContextPreview = {
      source: 'paste',
      ignored: [],
      proposals: [{
        id: 'p1',
        kind: 'memory',
        section: 'Sobre',
        body: 'Segredo',
        provenance: 'claude',
        uncertain: false,
        sensitive: false,
        blocked: false,
        sensitiveWhy: '',
        duplicateOf: '',
        conflictQuestion: '',
        status: 'ready',
        path: '',
        hash: 'h',
      }],
    }
    const ui = contextProposalsFromPreview(preview)[0]!
    const privateItems = choicesToApplyItems(preview, {
      p1: { ...defaultChoice(ui), decision: 'accept', private: true },
    })
    expect(privateItems[0]?.action).toBe('private')
    const discardItems = choicesToApplyItems(preview, {
      p1: { ...defaultChoice(ui), decision: 'discard' },
    })
    expect(discardItems[0]?.action).toBe('discard')
  })

  it('review save builds vault markdown from accepted choices', () => {
    const preview = buildBringReviewPreview([{ source: 'claude', text: SAMPLE }], null)
    const choices: Record<string, ReturnType<typeof defaultChoice>> = {}
    for (const row of preview.proposals) {
      choices[row.id] = defaultChoice({
        id: row.id,
        kind: row.kind,
        text: row.body,
        provenance: row.provenance,
      })
    }
    const md = vaultMarkdownFromReview(preview, choices)
    expect(md).toContain('Miguel')
  })
})

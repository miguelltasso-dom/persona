import { expect, it } from 'vitest'
import {
  gluedSiblingTextContent,
  isGluedCopyFalsePositive,
  visibleSiblingText,
} from '../src/visible-copy.ts'

const WELCOME = ['Bem-vindo', 'ao', '#geral'] as const
const BOARDS = ['Cada', 'projeto', 'com', 'o', 'seu', 'fluxo'] as const

it('documents the DF-003 glue: sibling textContent has no spaces', () => {
  expect(gluedSiblingTextContent(WELCOME)).toBe('Bem-vindoao#geral')
  expect(gluedSiblingTextContent(BOARDS)).toBe('Cadaprojetocomoseufluxo')
  expect(visibleSiblingText(WELCOME)).toBe('Bem-vindo ao #geral')
  expect(visibleSiblingText(BOARDS)).toBe('Cada projeto com o seu fluxo')
})

it('flags a glued dump as a harness false positive, not a missing-space font', () => {
  expect(isGluedCopyFalsePositive('Bem-vindoao#geral', 'Bem-vindo ao #geral')).toBe(true)
  expect(isGluedCopyFalsePositive('Bem-vindo ao #geral', 'Bem-vindo ao #geral')).toBe(false)
  expect(isGluedCopyFalsePositive('Outro texto', 'Bem-vindo ao #geral')).toBe(false)
})

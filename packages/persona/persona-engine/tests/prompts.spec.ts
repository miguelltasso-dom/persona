import { expect, it } from 'vitest'
import {
  MemoryPromptStore,
  PROMPT_TEMPLATES,
  composePrompt,
  missingPlaceholders,
  publishPrompt,
} from '../src/index.ts'

const identity = { name: 'Luna', title: 'Coordenação' }

it('fills identity placeholders and leaves none behind', () => {
  const text = composePrompt({ part: 'coordinator', identity, policy: 'Regra A.' })
  expect(text).toContain('Luna')
  expect(text).toContain('Coordenação')
  expect(text).toContain('Regra A.')
  expect(missingPlaceholders(text)).toEqual([])
})

it('never cites Atlas or any fixed persona name in the templates', () => {
  const joined = Object.values(PROMPT_TEMPLATES).join('\n')
  expect(joined).not.toMatch(/\bAtlas\b/)
  expect(joined).not.toMatch(/\bBento\b/)
  expect(joined).not.toMatch(/\bNina\b/)
  expect(joined).toContain('{{persona_name}}')
})

it('versions a published prompt and keeps earlier revisions', () => {
  const store = new MemoryPromptStore()
  const first = publishPrompt(store, { part: 'worker', identity, policy: 'v1' })
  const second = publishPrompt(store, { part: 'worker', identity: { name: 'Sol', title: 'Execução' }, policy: 'v2' })
  expect(first.revision).toBe(1)
  expect(second.revision).toBe(2)
  expect(store.get('worker', 1)?.identityName).toBe('Luna')
  expect(store.latest('worker')?.identityName).toBe('Sol')
  expect(second.text).toContain('Sol')
  expect(second.text).not.toContain('{{persona_name}}')
})

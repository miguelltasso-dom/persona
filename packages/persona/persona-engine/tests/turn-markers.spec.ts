import { describe, expect, it } from 'vitest'
import { CHOICE_PROMPT_LINE } from '../src/core/choices.ts'
import { INDICATOR_PROMPT_LINE } from '../src/core/indicators.ts'
import { PROMPT_TEMPLATES } from '../src/prompts/templates.ts'
import { markerLinesFor } from '../src/prompts/turn-markers.ts'

/** Item 11/19a (Tally, 12/11): the two marker lines belong to a conversation the PERSON started, as constants, and to nothing else. */
describe('markerLinesFor', () => {
  it('a conversation the person started teaches BOTH markers, once each, with a leading space (it is appended to `capabilities`)', () => {
    const text = markerLinesFor(true)
    expect(text.startsWith(' ')).toBe(true)
    expect(text.split(CHOICE_PROMPT_LINE)).toHaveLength(2)
    expect(text.split(INDICATOR_PROMPT_LINE)).toHaveLength(2)
  })

  it('an initiative, a routine or a team note teaches nothing: not one token is added', () => {
    expect(markerLinesFor(false)).toBe('')
  })

  it('it is a CONSTANT: the same text every call, so the prefix (and the warm session\'s cache) never changes with the message', () => {
    expect(markerLinesFor(true)).toBe(markerLinesFor(true))
    expect(markerLinesFor(true)).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{12}/u)
  })

  it('the templates do NOT carry the lines (that cost +18.6% on initiative-30-busy): the host adds them for a person-started turn only', () => {
    for (const part of Object.keys(PROMPT_TEMPLATES) as (keyof typeof PROMPT_TEMPLATES)[]) {
      expect(PROMPT_TEMPLATES[part], part).not.toContain(CHOICE_PROMPT_LINE)
      expect(PROMPT_TEMPLATES[part], part).not.toContain(INDICATOR_PROMPT_LINE)
    }
  })
})

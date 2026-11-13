import { describe, expect, it } from 'vitest'
import { COMPUTER_MCP_TOOL_NAMES, originForComputerRun, selectTurnTools } from '../src/computer-run-origin.ts'

describe('M9 L3 originForComputerRun (person vs quadro/routine/initiative/handoff)', () => {
  it('classifies human triggers as person and blocks quadro/routine/initiative/handoff', () => {
    expect(originForComputerRun({ id: 't1', origin: { triggerId: 'msg-1', triggerIds: ['msg-1'] }, inputs: [] }, {})).toBe('person')
    expect(originForComputerRun({ id: 't2', origin: { triggerId: 'board:p1:c1', triggerIds: ['board:p1:c1'] }, inputs: [] }, {})).toBe('quadro')
    expect(originForComputerRun({ id: 't3', origin: { triggerId: 'msg-1', triggerIds: ['msg-1'] }, inputs: [] }, { boardDriven: id => id === 't3' })).toBe('quadro')
    expect(originForComputerRun({ id: 't4', origin: { triggerId: 'routine-run:r1:1', triggerIds: ['routine-run:r1:1'] }, inputs: [] }, {})).toBe('routine')
    expect(originForComputerRun({ id: 't5', origin: { triggerId: 'routine-run:r1@event:e1:1', triggerIds: ['routine-run:r1@event:e1:1'] }, inputs: [] }, {})).toBe('initiative')
    expect(originForComputerRun({ id: 't6', origin: { triggerId: 'initiative:i1', triggerIds: ['initiative:i1'] }, inputs: [] }, {})).toBe('initiative')
    expect(originForComputerRun({ id: 't7', origin: { triggerId: 'handoff:t1:c1', triggerIds: ['handoff:t1:c1'] }, inputs: [] }, {})).toBe('handoff')
    expect(originForComputerRun({ id: 't8', origin: { triggerId: 'split:msg-1:bia', triggerIds: ['split:msg-1:bia'] }, inputs: [] }, {})).toBe('person')
    expect(originForComputerRun({ id: 't9', origin: { triggerId: 'split:initiative:i1:bia', triggerIds: ['split:initiative:i1:bia'] }, inputs: [] }, {})).toBe('initiative')
    expect(originForComputerRun({ id: 't10', origin: { triggerId: 'msg-1', triggerIds: ['msg-1'] }, inputs: [{ kind: 'trigger', triggerId: 'handoff:t1:c2' }] }, {})).toBe('handoff')
    expect(originForComputerRun({ id: 't11', origin: { triggerId: 'mail:123', triggerIds: ['mail:123'] }, inputs: [] }, {})).toBe('initiative')
  })

  it('offers computer tools only when authorized without escalating non-computer tools for grantless personas', () => {
    const tools = [
      { name: 'persona_ask' },
      { name: 'board_card_move' },
      { name: 'persona_computer_screenshot' },
      { name: 'persona_computer_click' },
      { name: 'persona_computer_type' },
    ]
    const coordination = new Set(['persona_ask'])
    const needed = ['persona_ask', 'board_card_move']

    expect(selectTurnTools(tools, needed, true, coordination, false).map(t => t.name)).toEqual(['persona_ask'])
    expect(selectTurnTools(tools, needed, true, coordination, true).map(t => t.name)).toEqual([
      'persona_ask',
      ...COMPUTER_MCP_TOOL_NAMES,
    ])
    expect(selectTurnTools(tools, needed, false, coordination, false).map(t => t.name)).toEqual([
      'persona_ask',
      'board_card_move',
    ])
  })
})

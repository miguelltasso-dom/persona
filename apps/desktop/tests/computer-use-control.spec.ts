import { describe, expect, it } from 'vitest'
import {
  COMPUTER_USE_IPC,
  COMPUTER_USE_RESUME_ACCELERATOR,
  applyPhysicalInput,
  createComputerUseController,
  isComputerUseResumeAccelerator,
} from '../src/computer-use-control.ts'

describe('computer-use shared control', () => {
  it('pauses every persona on human input and resumes only explicitly', () => {
    const control = createComputerUseController()
    control.begin('nina')
    control.begin('bento')
    control.setState('nina', 'moving', 0.4)
    control.setState('bento', 'typing', 0.2)
    expect(control.onInput('synthetic')).toEqual([])
    expect(control.personas().map(row => row.state)).toEqual(['moving', 'typing'])
    expect(control.onInput('human')).toEqual(['nina', 'bento'])
    expect(control.personas().every(row => row.state === 'human')).toBe(true)
    expect(control.personas()[0]?.progress).toBe(0.4)
    expect(control.resume('nina')).toBe(true)
    expect(control.personas().find(row => row.personaId === 'nina')?.state).toBe('idle')
    expect(control.personas().find(row => row.personaId === 'bento')?.state).toBe('human')
    expect(control.resume('bento')).toBe(true)
    expect(COMPUTER_USE_IPC.move).toBe('dsh-desktop:cu-move')
    const again = createComputerUseController()
    again.begin('nina')
    expect(applyPhysicalInput(again, { synthesized: true })).toEqual([])
    expect(applyPhysicalInput(again, {})).toEqual(['nina'])
    expect(COMPUTER_USE_RESUME_ACCELERATOR).toBe('CommandOrControl+Shift+Space')
    expect(isComputerUseResumeAccelerator({ control: true, shift: true, key: ' ' })).toBe(true)
    expect(isComputerUseResumeAccelerator({ control: true, shift: false, key: ' ' })).toBe(false)
  })
})

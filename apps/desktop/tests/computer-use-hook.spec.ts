import { describe, expect, it } from 'vitest'
import { attachComputerUseHook, interpretHookEvent } from '../src/computer-use-hook.ts'
import { resumeHeldPersonas, createComputerUseController } from '../src/computer-use-control.ts'

describe('W3-5 physical hook', () => {
  it('pauses on mouse/key and resumes only on Devolver', () => {
    expect(interpretHookEvent({ kind: 'mouse' })).toBe('pause')
    expect(interpretHookEvent({ kind: 'key', key: 'a' })).toBe('pause')
    expect(interpretHookEvent({ kind: 'key', synthesized: true, key: 'a' })).toBe('ignore')
    expect(interpretHookEvent({ kind: 'key', control: true, shift: true, key: ' ' })).toBe('resume')
    const seen: string[] = []
    const stop = attachComputerUseHook((action) => { seen.push(action) }, (listener) => {
      listener({ kind: 'mouse' })
      listener({ kind: 'key', control: true, shift: true, key: 'Space' })
      listener({ kind: 'key', synthesized: true, key: 'x' })
      return () => undefined
    })
    stop()
    expect(seen).toEqual(['pause', 'resume'])
    const control = createComputerUseController()
    control.begin('nina')
    control.onInput('human')
    expect(resumeHeldPersonas(control)).toEqual(['nina'])
    expect(control.personas()[0]?.state).toBe('idle')
  })
})

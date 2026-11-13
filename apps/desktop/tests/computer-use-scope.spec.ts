import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PROCESSES, isForbiddenProcess, judgeChord, judgeElement, judgeTargetWindow, normalizeChord, processKey, type ComputerUseScope,
} from '../src/computer-use-scope.ts'

const PERSONA = [4100, 4101, 4102]
const scope: ComputerUseScope = { windowHandle: '197382', processId: 9000, personaPids: PERSONA }
const notepad = { processId: 9000, processName: 'notepad.exe' }

describe('the zone the executor never enters (Lumen D4)', () => {
  it('a session without a chosen target is refused: the executor never falls back to the whole desktop', () => {
    expect(judgeElement(notepad, undefined)).toEqual({ ok: false, why: 'no-target' })
    expect(judgeTargetWindow(undefined, notepad)).toEqual({ ok: false, why: 'no-target' })
    expect(judgeChord('ctrl+s', notepad, undefined)).toEqual({ ok: false, why: 'no-target' })
  })

  it('an element of the chosen window is allowed', () => {
    expect(judgeElement(notepad, scope)).toEqual({ ok: true })
    expect(judgeTargetWindow(scope, notepad)).toEqual({ ok: true })
  })

  it('PERSONA ITSELF is refused whatever its name: its approval card, pairing and Stop are in these processes', () => {
    for (const processId of PERSONA) expect(judgeElement({ processId, processName: 'Persona.exe' }, scope)).toEqual({ ok: false, why: 'persona-app' })
    // even a window that shares the target's name
    expect(judgeElement({ processId: 4101, processName: 'notepad.exe' }, scope)).toEqual({ ok: false, why: 'persona-app' })
    // and a session cannot be started on Persona's own window
    expect(judgeTargetWindow({ ...scope, processId: 4100 }, { processId: 4100, processName: 'Persona.exe' })).toEqual({ ok: false, why: 'persona-app' })
  })

  it('an element of ANOTHER process is outside the window, even an innocent one (a "Salvar" of some other app)', () => {
    expect(judgeElement({ processId: 7777, processName: 'excel.exe' }, scope)).toEqual({ ok: false, why: 'outside-window' })
  })

  it('the forbidden list is checked on the element\'s OWN process: UAC over an allowed window is still refused', () => {
    expect(judgeElement({ processId: 5555, processName: 'consent.exe' }, scope)).toEqual({ ok: false, why: 'forbidden-target' })
  })

  it.each(FORBIDDEN_PROCESSES)('%s is forbidden, with or without .exe and in any case', (name) => {
    expect(isForbiddenProcess(name)).toBe(true)
    expect(isForbiddenProcess(`${name.toUpperCase()}.EXE`)).toBe(true)
    expect(judgeTargetWindow({ ...scope, processId: 1 }, { processId: 1, processName: `${name}.exe` })).toEqual({ ok: false, why: 'forbidden-target' })
  })

  it('the usual apps are not on the list', () => {
    for (const name of ['notepad.exe', 'excel.exe', 'chrome.exe', 'msedge.exe', 'explorer.exe', 'winword.exe', 'calc.exe']) expect(isForbiddenProcess(name)).toBe(false)
  })

  it('the lookup key is lower case without the suffix', () => {
    expect(processKey('  Consent.EXE ')).toBe('consent')
    expect(processKey('1Password')).toBe('1password')
  })
})

describe('key chords', () => {
  it('a plain shortcut in the target window passes', () => {
    expect(judgeChord('Ctrl+S', notepad, scope)).toEqual({ ok: true })
    expect(judgeChord('ctrl + shift + p', notepad, scope)).toEqual({ ok: true })
  })

  it.each(['Ctrl+Alt+Delete', 'ctrl+alt+del', 'Win+R', 'windows+r', 'Win+L', 'Meta+D', 'Win', 'Ctrl+Esc', 'Ctrl+Shift+Esc', 'Alt+F4'])('%s is never pressed', (chord) => {
    expect(judgeChord(chord, notepad, scope)).toEqual({ ok: false, why: 'forbidden-chord' })
  })

  it('a chord is judged on the window that would RECEIVE it: Persona in front refuses even Ctrl+S', () => {
    expect(judgeChord('Ctrl+S', { processId: 4100, processName: 'Persona.exe' }, scope)).toEqual({ ok: false, why: 'persona-app' })
    expect(judgeChord('Ctrl+S', { processId: 5555, processName: 'taskmgr.exe' }, scope)).toEqual({ ok: false, why: 'forbidden-target' })
  })

  it('the aliases fold and the order does not matter', () => {
    expect(normalizeChord('Control + Alt + Delete')).toBe('alt+ctrl+del')
    expect(normalizeChord('DEL+alt+CTRL')).toBe('alt+ctrl+del')
    expect(normalizeChord('Windows+R')).toBe('r+win')
  })
})

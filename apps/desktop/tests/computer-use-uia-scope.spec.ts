import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { FORBIDDEN_PROCESSES, type ComputerUseScope } from '../src/computer-use-scope.ts'
import {
  WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT, WINDOWS_UIA_SNAPSHOT_SCRIPT,
  createWindowsUiaPort, invokeWindowsUiaNamed, parseUiaSnapshot, parseWindowsUiaCom, runWindowsUiaScript, setWindowsUiaValue, uiaScopeEnv,
} from '../src/computer-use-uia.ts'

const scope: ComputerUseScope = { windowHandle: '197382', processId: 9000, personaPids: [4100, 4101] }

describe('every UIA script starts at the chosen window, never at the desktop', () => {
  it.each([
    ['snapshot', WINDOWS_UIA_SNAPSHOT_SCRIPT],
    ['invoke', WINDOWS_UIA_INVOKE_SCRIPT],
    ['setvalue', WINDOWS_UIA_SETVALUE_SCRIPT],
  ])('%s: FromHandle of the session window, no RootElement', (_name, script) => {
    expect(script).toContain('AutomationElement]::FromHandle(')
    expect(script).not.toContain('::RootElement')
    expect(script).toContain('PERSONA_UIA_HWND')
  })

  it('without a window the scripts answer no-target / empty, never search the desktop', () => {
    expect(WINDOWS_UIA_INVOKE_SCRIPT).toContain('"no-target"; exit 0')
    expect(WINDOWS_UIA_SETVALUE_SCRIPT).toContain('"no-target"; exit 0')
    expect(WINDOWS_UIA_SNAPSHOT_SCRIPT).toContain('"[]"; exit 0')
  })

  it('invoke and set-value match Name AND ControlType when a role is given (the label "Texto" comes before the field "Texto")', () => {
    for (const script of [WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT]) {
      expect(script).toContain('PERSONA_UIA_ROLE')
      expect(script).toContain('AndCondition')
      expect(script).toContain('ControlTypeProperty')
    }
  })

  it('they refuse an element of Persona, of a forbidden process or of another process BEFORE any pattern is called', () => {
    for (const script of [WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT]) {
      for (const answer of ['persona-app', 'forbidden', 'outside-window']) expect(script).toContain(`"${answer}"`)
      const verdictAt = script.indexOf('Verdict $el')
      expect(verdictAt).toBeGreaterThan(0)
      expect(script.indexOf('GetCurrentPattern')).toBeGreaterThan(verdictAt)
      expect(script.indexOf('IsPasswordProperty')).toBeGreaterThan(verdictAt)
    }
  })

  it('never assigns PowerShell\'s read-only $pid (it would abort the script)', () => {
    for (const script of [WINDOWS_UIA_SNAPSHOT_SCRIPT, WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT]) {
      expect(script).not.toMatch(/\$pid\s*=/iu)
      expect(script).toContain('$elPid')
    }
  })

  it('the snapshot never reads the subtree of Persona or a forbidden process', () => {
    expect(WINDOWS_UIA_SNAPSHOT_SCRIPT).toContain('if ((Verdict $el) -ne "ok") { return }')
  })

  it('the password rule survives: password fields refuse after the scope check and before the pattern', () => {
    for (const script of [WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT]) {
      expect(script.indexOf('if ($pwd) { "password"; exit 0 }')).toBeLessThan(script.indexOf('GetCurrentPattern'))
    }
  })
})

describe.skipIf(process.platform !== 'win32')('the scripts are valid PowerShell (parsed by the real parser, never run)', () => {
  it.each([
    ['snapshot', WINDOWS_UIA_SNAPSHOT_SCRIPT],
    ['invoke', WINDOWS_UIA_INVOKE_SCRIPT],
    ['setvalue', WINDOWS_UIA_SETVALUE_SCRIPT],
  ])('%s has no syntax error', (_name, script) => {
    const parse = '$e = $null; $t = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT_TEXT, [ref]$t, [ref]$e); if ($e.Count -gt 0) { $e | ForEach-Object { $_.Message }; exit 1 }'
    const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', parse], { encoding: 'utf8', env: { ...process.env, SCRIPT_TEXT: script }, windowsHide: true, timeout: 60_000 })
    expect(result.stdout.trim()).toBe('')
    expect(result.status).toBe(0)
  }, 70_000)
})

describe('the scope reaches the script by environment', () => {
  it('carries the window, the process, the Persona pids and the SAME forbidden list the TypeScript rules use', () => {
    const env = uiaScopeEnv(scope, 'Button')
    expect(env).toEqual({
      PERSONA_UIA_HWND: '197382', PERSONA_UIA_PID: '9000', PERSONA_UIA_DENY_PIDS: '4100,4101',
      PERSONA_UIA_DENY_NAMES: FORBIDDEN_PROCESSES.join(','), PERSONA_UIA_ROLE: 'Button',
    })
  })

  it('no scope means no environment: the script then answers no-target', () => {
    expect(uiaScopeEnv(undefined)).toEqual({})
    expect(uiaScopeEnv(scope).PERSONA_UIA_ROLE).toBeUndefined()
  })

  it('runWindowsUiaScript passes it to the spawn next to the name', () => {
    const spawn = vi.fn(() => ({ stdout: 'ok\n', status: 0 }))
    runWindowsUiaScript(WINDOWS_UIA_INVOKE_SCRIPT, { PERSONA_UIA_NAME: 'Salvar', ...uiaScopeEnv(scope, 'Button') }, spawn)
    const env = (spawn.mock.calls[0] as unknown as [string, string[], NodeJS.ProcessEnv])[2]
    expect(env.PERSONA_UIA_NAME).toBe('Salvar')
    expect(env.PERSONA_UIA_HWND).toBe('197382')
  })
})

describe('the answers of the scripts', () => {
  it.each(['ok', 'missing', 'password', 'no-target', 'persona-app', 'forbidden', 'outside-window'])('%s is read as itself', (answer) => {
    expect(parseWindowsUiaCom(`noise\n${answer}\n`)).toBe(answer)
  })

  it('anything else is "missing" (fail closed)', () => {
    expect(parseWindowsUiaCom('')).toBe('missing')
    expect(parseWindowsUiaCom('Aprovado!')).toBe('missing')
  })

  it('a human holding the controls never launches the script, and the new answers pass through invoke and set-value', () => {
    const run = vi.fn(() => 'persona-app')
    expect(invokeWindowsUiaNamed(run, 'Aprovar', true)).toBe('human')
    expect(run).not.toHaveBeenCalled()
    expect(invokeWindowsUiaNamed(run, 'Aprovar')).toBe('persona-app')
    expect(setWindowsUiaValue(() => 'forbidden', 'Texto', 'x')).toBe('forbidden')
    expect(setWindowsUiaValue(() => 'outside-window', 'Texto', 'x')).toBe('outside-window')
  })
})

describe('the snapshot carries the owner process', () => {
  it('keeps processId when it is a number and drops rows that are not the shape', () => {
    const nodes = parseUiaSnapshot([
      { id: 'a', name: 'Salvar', role: 'Button', rect: { x: 1, y: 2, width: 3, height: 4 }, processId: 9000 },
      { id: 'b', name: 'Senha', role: 'Edit', rect: { x: 1, y: 2, width: 3, height: 4 }, isPassword: true, processId: 'x' },
      { id: 'c', name: 'sem rect', role: 'Button' },
    ])
    expect(nodes).toEqual([
      { id: 'a', name: 'Salvar', role: 'Button', rect: { x: 1, y: 2, width: 3, height: 4 }, processId: 9000 },
      { id: 'b', name: 'Senha', role: 'Edit', rect: { x: 1, y: 2, width: 3, height: 4 }, isPassword: true },
    ])
  })

  it('the Windows port reads that JSON and treats a bad answer as an empty tree', () => {
    const port = createWindowsUiaPort(() => JSON.stringify([{ id: 'a', name: 'Salvar', role: 'Button', rect: { x: 0, y: 0, width: 10, height: 10 }, processId: 9000 }]))
    expect(port.find('Salvar')?.processId).toBe(9000)
    expect(createWindowsUiaPort(() => 'not json').snapshot()).toEqual([])
  })
})

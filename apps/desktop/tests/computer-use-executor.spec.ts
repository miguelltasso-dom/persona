import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_WAIT_MS, STOPPED_DETAIL, YOU_TOOK_OVER_DETAIL,
  createExecutorActPort, createExecutorActions, createExecutorObservePort, createPowerShellRunner,
  type ExecutorDeps, type ExecutorTarget,
} from '../src/computer-use-executor.ts'
import {
  WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT, WINDOWS_UIA_INVOKE_SCRIPT, WINDOWS_UIA_POINT_INVOKE_SCRIPT, WINDOWS_UIA_SETVALUE_SCRIPT,
  WINDOWS_UIA_SNAPSHOT_SCRIPT, WINDOWS_UIA_WINDOW_SCRIPT,
} from '../src/computer-use-uia.ts'

const target: ExecutorTarget = { windowHandle: '197382', processId: 9000, title: 'Fixture' }
const WINDOW_OK = JSON.stringify({ processId: 9000, processName: 'pfhost', title: 'Fixture' })
const NODES = JSON.stringify([
  { id: 'l', name: 'Texto', role: 'Text', rect: { x: 0, y: 0, width: 5, height: 5 }, processId: 9000 },
  { id: 'e', name: 'Texto', role: 'Edit', rect: { x: 0, y: 6, width: 50, height: 5 }, processId: 9000, value: 'abc' },
  { id: 'b', name: 'Salvar', role: 'Button', rect: { x: 0, y: 12, width: 20, height: 5 }, processId: 9000 },
])

/** A machine: answers each script by its text; records every call. */
function rig(answers: Partial<Record<string, string | (() => string)>> = {}, overrides: Partial<ExecutorDeps> = {}) {
  const calls: Array<{ script: string; env: Record<string, string> }> = []
  let held = false
  const scripts = new Map<string, string>([
    [WINDOWS_UIA_WINDOW_SCRIPT, 'window'], [WINDOWS_UIA_SNAPSHOT_SCRIPT, 'snapshot'], [WINDOWS_UIA_INVOKE_SCRIPT, 'invoke'],
    [WINDOWS_UIA_SETVALUE_SCRIPT, 'setvalue'], [WINDOWS_UIA_POINT_INVOKE_SCRIPT, 'point'], [WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT, 'focus'],
  ])
  const defaults: Record<string, string> = { window: WINDOW_OK, snapshot: NODES, invoke: 'ok', setvalue: 'ok', point: 'ok', focus: 'ok' }
  const deps: ExecutorDeps = {
    runScript: async (script, env) => {
      calls.push({ script, env })
      const name = scripts.get(script) ?? 'unknown'
      const answer = answers[name]
      return typeof answer === 'function' ? answer() : (answer ?? defaults[name] ?? '')
    },
    personaPids: () => [4100, 4101],
    held: () => held,
    now: () => 1_000,
    ...overrides,
  }
  const observer = createExecutorObservePort(deps)
  return {
    deps, calls, observer, act: createExecutorActPort(deps, observer), mcp: createExecutorActions(deps),
    hold: (value: boolean) => { held = value },
  }
}

describe('observe: the target is reported only when the OS confirmed the window', () => {
  it('a confirmed window: tree from the SCOPED snapshot (with values), the target with the OS process id', async () => {
    const f = rig()
    const observation = await f.observer.observe({ target })
    expect(observation.target).toEqual({ windowHandle: '197382', processId: 9000, title: 'Fixture' })
    expect(observation.tree.name).toBe('Fixture')
    expect(observation.tree.children?.map(node => node.name)).toEqual(['Texto', 'Texto', 'Salvar'])
    expect(observation.tree.children?.find(node => node.role === 'Edit')?.value).toBe('abc')
    const snapshot = f.calls.find(call => call.script === WINDOWS_UIA_SNAPSHOT_SCRIPT)
    expect(snapshot?.env).toMatchObject({ PERSONA_UIA_HWND: '197382', PERSONA_UIA_PID: '9000', PERSONA_UIA_DENY_PIDS: '4100,4101' })
  })

  it('no target, an unreadable window, or a window of another process: no `target` in the observation (the loop denies target:unverified)', async () => {
    expect((await rig().observer.observe()).target).toBeUndefined()
    expect((await rig({ window: 'no-target' }).observer.observe({ target })).target).toBeUndefined()
    expect((await rig({ window: JSON.stringify({ processId: 1234, processName: 'notepad', title: 'x' }) }).observer.observe({ target })).target).toBeUndefined()
  })

  it('a window of Persona or of a forbidden process is never observed: no tree, no snapshot script even launched', async () => {
    for (const info of [{ processId: 9000, processName: 'cmd' }, { processId: 4100, processName: 'Persona' }]) {
      const f = rig({ window: JSON.stringify({ ...info, title: 't' }) })
      const observation = await f.observer.observe({ target: { ...target, processId: info.processId } })
      expect(observation.target).toBeUndefined()
      expect(observation.tree.children).toEqual([])
      expect(f.calls.some(call => call.script === WINDOWS_UIA_SNAPSHOT_SCRIPT)).toBe(false)
    }
  })

  it('the capture is the TARGET WINDOW only, by reference; without a capturer it is `none`', async () => {
    const screenshotWindow = vi.fn(async () => 'shot-1')
    expect((await rig({}, { screenshotWindow }).observer.observe({ target })).captureRef).toBe('shot-1')
    expect(screenshotWindow).toHaveBeenCalledWith(target, undefined)
    expect((await rig().observer.observe({ target })).captureRef).toBe('none')
  })

  it('an aborted signal or a runner that throws never throws into the loop', async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await rig().observer.observe({ target, signal: controller.signal })).target).toBeUndefined()
    const broken = rig({}, { runScript: async () => { throw new Error('powershell gone') } })
    expect((await broken.observer.observe({ target })).target).toBeUndefined()
  })
})

describe('act (the loop, by name): scope, role, refusals, stop', () => {
  it('a click matches Name AND the ControlType seen in the last observation (the label "Texto" is not the field)', async () => {
    const f = rig()
    await f.observer.observe({ target })
    await expect(f.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target })).resolves.toEqual({ ok: true, detail: 'ok' })
    const call = f.calls.at(-1)
    expect(call?.script).toBe(WINDOWS_UIA_INVOKE_SCRIPT)
    expect(call?.env).toMatchObject({ PERSONA_UIA_NAME: 'Salvar', PERSONA_UIA_ROLE: 'Button', PERSONA_UIA_HWND: '197382' })
    await f.act.act({ kind: 'type', target: 'Texto', text: 'olá mundo' }, { target })
    expect(f.calls.at(-1)?.script).toBe(WINDOWS_UIA_SETVALUE_SCRIPT)
    expect(f.calls.at(-1)?.env).toMatchObject({ PERSONA_UIA_NAME: 'Texto', PERSONA_UIA_ROLE: 'Edit', PERSONA_UIA_VALUE: 'olá mundo' })
  })

  it('the refusals of the scripts come back as their CODE, which the loop turns into scope:<code>', async () => {
    for (const code of ['persona-app', 'forbidden', 'outside-window', 'no-target']) {
      const f = rig({ invoke: code })
      await expect(f.act.act({ kind: 'click', target: 'Aprovar', x: 0, y: 0 }, { target })).resolves.toEqual({ ok: false, detail: code })
    }
    await expect(rig({ setvalue: 'password' }).act.act({ kind: 'type', target: 'Senha', text: 'x' }, { target })).resolves.toEqual({ ok: false, detail: 'campo de senha' })
    await expect(rig({ invoke: 'missing' }).act.act({ kind: 'click', target: 'Nada', x: 0, y: 0 }, { target })).resolves.toEqual({ ok: false, detail: 'alvo ausente' })
  })

  it('without a target the step is refused before any script runs', async () => {
    const f = rig()
    await expect(f.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 })).resolves.toEqual({ ok: false, detail: 'no-target' })
    expect(f.calls).toEqual([])
  })

  it('the person holding the controls refuses before the script and also discards an answer that arrives after they grabbed it', async () => {
    const f = rig()
    f.hold(true)
    await expect(f.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target })).resolves.toEqual({ ok: false, detail: YOU_TOOK_OVER_DETAIL })
    expect(f.calls).toEqual([])
    const late = rig({ invoke: () => 'ok' })
    const act = late.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target })
    late.hold(true) // grabbed while the script ran
    await expect(act).resolves.toEqual({ ok: false, detail: YOU_TOOK_OVER_DETAIL })
  })

  it('a Stop (the signal) wins: before the step, during it, and during a wait', async () => {
    const stopped = new AbortController()
    stopped.abort()
    await expect(rig().act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target, signal: stopped.signal })).resolves.toEqual({ ok: false, detail: STOPPED_DETAIL })
    const during = new AbortController()
    const slow = rig({}, { runScript: (_script, _env, signal) => new Promise((_resolve, reject) => { signal?.addEventListener('abort', () => { reject(new Error('aborted')) }) }) })
    const pending = slow.act.act({ kind: 'click', target: 'Salvar', x: 0, y: 0 }, { target, signal: during.signal })
    during.abort()
    await expect(pending).resolves.toEqual({ ok: false, detail: STOPPED_DETAIL })
    const waiting = new AbortController()
    const wait = rig().act.act({ kind: 'wait', ms: MAX_WAIT_MS }, { signal: waiting.signal })
    waiting.abort()
    await expect(wait).resolves.toEqual({ ok: false, detail: STOPPED_DETAIL })
  })

  it('keys and scroll are not made (no synthetic input); a short wait passes', async () => {
    const f = rig()
    await expect(f.act.act({ kind: 'key', key: 'Win+R' }, { target })).resolves.toEqual({ ok: false, detail: 'não suportado' })
    await expect(f.act.act({ kind: 'scroll', dx: 0, dy: 5 }, { target })).resolves.toEqual({ ok: false, detail: 'não suportado' })
    await expect(f.act.act({ kind: 'wait', ms: 1 })).resolves.toEqual({ ok: true, detail: 'ok' })
    expect(f.calls).toEqual([])
  })
})

describe('the MCP adapters (persona_computer_*): by coordinates and by focus', () => {
  it('a click goes to the window of the host-forwarded target with the coordinates; a type goes to the focused element', async () => {
    const f = rig()
    await expect(f.mcp.click(120, 45, { target, runId: 'r1' })).resolves.toBe('ok')
    expect(f.calls.at(-1)?.script).toBe(WINDOWS_UIA_POINT_INVOKE_SCRIPT)
    expect(f.calls.at(-1)?.env).toMatchObject({ PERSONA_UIA_X: '120', PERSONA_UIA_Y: '45', PERSONA_UIA_HWND: '197382' })
    await expect(f.mcp.type('olá', { target })).resolves.toBe('ok')
    expect(f.calls.at(-1)?.script).toBe(WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT)
    expect(f.calls.at(-1)?.env.PERSONA_UIA_VALUE).toBe('olá')
  })

  it('refuses without a target, on a stop, with the person holding, and for a coordinate that is not a number', async () => {
    const f = rig()
    await expect(f.mcp.click(1, 1)).resolves.toBe('no-target')
    await expect(f.mcp.type('x')).resolves.toBe('no-target')
    await expect(f.mcp.click(Number.NaN, 1, { target })).resolves.toBe('alvo ausente')
    const stopped = new AbortController()
    stopped.abort()
    await expect(f.mcp.click(1, 1, { target, signal: stopped.signal })).resolves.toBe('parado a pedido.')
    f.hold(true)
    await expect(f.mcp.click(1, 1, { target })).resolves.toBe('humano no controle')
    expect(f.calls).toEqual([])
  })

  it('the script refusals pass through as their code', async () => {
    for (const code of ['persona-app', 'forbidden', 'outside-window', 'password']) {
      await expect(rig({ point: code }).mcp.click(1, 1, { target })).resolves.toBe(code === 'password' ? 'campo de senha' : code)
      await expect(rig({ focus: code }).mcp.type('x', { target })).resolves.toBe(code === 'password' ? 'campo de senha' : code)
    }
  })

  it('the model\'s arguments never choose the window: only the context does', async () => {
    const f = rig()
    await f.mcp.click(1, 1, { target })
    expect(f.calls.at(-1)?.env.PERSONA_UIA_HWND).toBe(target.windowHandle)
    expect(f.calls.at(-1)?.env.PERSONA_UIA_PID).toBe(String(target.processId))
  })
})

describe('the PowerShell runner is async and cancellable', () => {
  it('passes the script as an array argument with the values in the environment (no shell)', async () => {
    const seen: Array<{ command: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined; shell: unknown }> = []
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
    const run = createPowerShellRunner({
      spawn: ((command: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv; shell?: unknown }) => {
        seen.push({ command, args, env: options.env, shell: options.shell })
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: vi.fn() })
        setTimeout(() => { child.stdout.write('ok\n'); child.emit('close', 0) }, 5)
        return child
      }) as never,
    })
    await expect(run('Write-Output ok', { PERSONA_UIA_NAME: 'Nome com espaço' })).resolves.toBe('ok\n')
    expect(seen[0]?.command).toBe('powershell')
    expect(seen[0]?.args.at(-1)).toBe('Write-Output ok')
    expect(seen[0]?.env?.PERSONA_UIA_NAME).toBe('Nome com espaço')
    expect(seen[0]?.shell).toBeUndefined()
  })

  it('an abort kills the child at once and rejects; an already-aborted signal never spawns', async () => {
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
    const kill = vi.fn()
    const spawnFake = vi.fn(() => Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill }))
    const run = createPowerShellRunner({ spawn: spawnFake as never })
    const controller = new AbortController()
    const pending = run('Start-Sleep 30', {}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
    expect(kill).toHaveBeenCalledOnce()
    await expect(run('x', {}, controller.signal)).rejects.toThrow('aborted')
    expect(spawnFake).toHaveBeenCalledOnce()
  })

  it('a hung child is killed at the ceiling', async () => {
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
    const kill = vi.fn()
    const spawnHung = (() => Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill })) as never
    const run = createPowerShellRunner({ timeoutMs: 20, spawn: spawnHung })
    await expect(run('hang', {})).rejects.toThrow('timeout')
    expect(kill).toHaveBeenCalledOnce()
  })

  it.skipIf(process.platform !== 'win32')('REAL PowerShell: a 30 s sleep is cancelled in well under 3 s and no process is left', async () => {
    const marker = `persona-abort-${String(process.pid)}-${String(Date.now())}`
    const run = createPowerShellRunner()
    const controller = new AbortController()
    const started = Date.now()
    const pending = run(`# ${marker}\nStart-Sleep -Seconds 30`, {}, controller.signal)
    await new Promise(resolve => setTimeout(resolve, 1500))
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
    expect(Date.now() - started).toBeLessThan(3000)
    await new Promise(resolve => setTimeout(resolve, 1500))
    const left = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.ProcessId -ne $PID } | Measure-Object).Count`], { encoding: 'utf8', windowsHide: true })
    expect(left.stdout.trim()).toBe('0')
  }, 30_000)
})

describe.skipIf(process.platform !== 'win32')('the new scripts are valid PowerShell (real parser, never run)', () => {
  it.each([
    ['window', WINDOWS_UIA_WINDOW_SCRIPT],
    ['point invoke', WINDOWS_UIA_POINT_INVOKE_SCRIPT],
    ['focus setvalue', WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT],
    ['snapshot (with values)', WINDOWS_UIA_SNAPSHOT_SCRIPT],
  ])('%s has no syntax error', (_name, script) => {
    const parse = '$e = $null; $t = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT_TEXT, [ref]$t, [ref]$e); if ($e.Count -gt 0) { $e | ForEach-Object { $_.Message }; exit 1 }'
    const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', parse], { encoding: 'utf8', env: { ...process.env, SCRIPT_TEXT: script }, windowsHide: true, timeout: 60_000 })
    expect(result.stdout.trim()).toBe('')
    expect(result.status).toBe(0)
  }, 70_000)

  it('the point and focus scripts check the scope BEFORE any pattern, and refuse a password field', () => {
    for (const script of [WINDOWS_UIA_POINT_INVOKE_SCRIPT, WINDOWS_UIA_FOCUS_SETVALUE_SCRIPT]) {
      expect(script).not.toContain('::RootElement')
      expect(script).toContain('FromHandle(')
      expect(script.indexOf('Verdict')).toBeGreaterThan(0)
      expect(script).toContain('"password"')
    }
    expect(WINDOWS_UIA_POINT_INVOKE_SCRIPT.indexOf('"outside-window"')).toBeLessThan(WINDOWS_UIA_POINT_INVOKE_SCRIPT.indexOf('FromPoint'))
  })
})

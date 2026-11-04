/**
 * Shared OAR / binary probes for resolveRunner and detectConnections.
 */

import { execFile } from 'node:child_process'
import type { AvailableInstallation, Runtime } from '@botiverse/oar'

export const PROBE_TIMEOUT_MS = 8_000

export interface ProbeRuntime {
  installation?: () => Promise<{ kind: string; version?: string }>
  authStatus?: (installation: AvailableInstallation, options?: { timeoutMs?: number }) => Promise<{ kind: string }>
  listModels?: (
    installation: AvailableInstallation,
    options?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ kind?: string; models?: readonly { id?: string }[] }>
  accountUsage?: (installation: AvailableInstallation) => Promise<unknown>
}

/**
 * @param ms - Deadline.
 * @param work - Promise to bound.
 */
export async function withTimeout<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => { reject(new Error('probe timeout')) }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Exec `{bin} --version` (Probe fake-cli fixtures speak this).
 * @param bin - `claude` / `codex` / `opencode` / `cursor-agent`.
 * @param env - Process env (tests prepend the fake-cli dir to PATH).
 */
export function probeCliBinary(bin: string, env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean; version?: string }> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], {
      encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, env,
      windowsHide: true, shell: process.platform === 'win32',
    }, (error, stdout, stderr) => {
      if (error !== null) { resolve({ ok: false }); return }
      const line = `${stdout}\n${stderr}`.trim().split(/\r?\n/u, 1)[0] ?? ''
      resolve(line === '' ? { ok: false } : { ok: true, version: line })
    })
  })
}

/**
 * @param raw - OAR accountUsage payload.
 * @returns true when a published window is at or over 100%.
 */
export function quotaExhausted(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false
  const record = raw as Record<string, unknown>
  const windows = Array.isArray(record.windows) ? record.windows : []
  for (const item of windows) {
    if (item !== null && typeof item === 'object') {
      const percent = (item as { usedPercent?: unknown }).usedPercent
      if (typeof percent === 'number' && percent >= 100) return true
    }
  }
  const nested = [record['5h'], record.weekly, record.fiveHour]
  for (const item of nested) {
    if (item !== null && typeof item === 'object') {
      const percent = (item as { usedPercent?: unknown }).usedPercent
        ?? (item as { used_percent?: unknown }).used_percent
      if (typeof percent === 'number' && percent >= 100) return true
    }
  }
  return false
}

/**
 * @param runtime - OAR runtime or test double.
 */
export function asProbe(runtime: Runtime | ProbeRuntime): ProbeRuntime {
  return runtime
}

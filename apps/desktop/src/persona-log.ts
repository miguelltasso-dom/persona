/** Local-only rotating logs under PERSONA_HOME/logs. Nothing is sent anywhere (D-016). */

import { existsSync } from 'node:fs'
import { appendFile, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { clipboard } from 'electron'

const CREDENTIAL_SOURCES = [
  String.raw`sk-[A-Za-z0-9_-]{16,}`, String.raw`ghp_[A-Za-z0-9]{20,}`, String.raw`github_pat_[A-Za-z0-9_]{20,}`,
  String.raw`Bearer\s+[A-Za-z0-9._-]{20,}`, String.raw`AKIA[0-9A-Z]{16}`, String.raw`xox[baprs]-[A-Za-z0-9-]{10,}`,
  String.raw`xai-[A-Za-z0-9]{20,}`,
]
const CREDENTIAL = new RegExp(CREDENTIAL_SOURCES.map(part => `(?:${part})`).join('|'), 'u')
const MESSAGE_BODY = /(?:"(?:body|text|content|prompt|message)"\s*:\s*")(?:\\.|[^"\\]){24,}"/gu

export const LOG_MAX_BYTES = 1_048_576
export const LOG_RETAIN_DAYS = 7

/**
 * Whether the text contains a value that looks like a live key or token.
 * @param body - Candidate text.
 */
export function looksLikeCredential(body: string): boolean {
  return CREDENTIAL.test(body)
}

/**
 * Redact credentials and message/DM bodies. Only metadata remains.
 * @param line - Raw log line.
 */
export function redactLogLine(line: string): string {
  let next = line.replace(CREDENTIAL, '[redacted-secret]')
  next = next.replace(MESSAGE_BODY, '"body":"[redacted-message]"')
  return next
}

/**
 * Logs directory under PERSONA_HOME.
 * @param home - PERSONA_HOME.
 */
export function personaLogsDir(home: string): string {
  return join(home, 'logs')
}

export interface PersonaLogger {
  write(scope: 'main' | 'host' | 'runners', line: string): Promise<void>
  rotate(): Promise<void>
}

/**
 * Append-only logger with size and day rotation.
 * @param home - PERSONA_HOME.
 * @param now - Clock (tests).
 */
export function createPersonaLogger(home: string, now: () => Date = () => new Date()): PersonaLogger {
  const dir = personaLogsDir(home)
  const dayFile = (scope: string, at: Date): string => {
    const day = at.toISOString().slice(0, 10)
    return join(dir, `${scope}-${day}.log`)
  }
  return {
    async write(scope, line) {
      await mkdir(dir, { recursive: true })
      const path = dayFile(scope, now())
      await appendFile(path, `${redactLogLine(line.replaceAll('\n', ' '))}\n`, 'utf8')
      try {
        if ((await stat(path)).size > LOG_MAX_BYTES) {
          await writeFile(`${path}.${String(now().getTime())}.old`, await readFile(path), 'utf8')
          await writeFile(path, '', 'utf8')
        }
      } catch (error) {
        void error
      }
    },
    async rotate() {
      if (!existsSync(dir)) return
      const cutoff = now().getTime() - LOG_RETAIN_DAYS * 86_400_000
      for (const name of await readdir(dir)) {
        const path = join(dir, name)
        try {
          if ((await stat(path)).mtimeMs < cutoff) await unlink(path)
        } catch (error) {
          void error
        }
      }
    },
  }
}

/**
 * Copy a redacted local diagnostic. Never includes vault plaintext.
 * @param home - PERSONA_HOME.
 * @param extra - Optional Anvil `exportDiagnostics` JSON (already secret-free).
 */
export async function copyPersonaDiagnostic(
  home: string,
  extra?: string,
  writeText: (text: string) => void = (text) => { clipboard.writeText(text) },
): Promise<string> {
  const dir = personaLogsDir(home)
  const parts: string[] = ['# Persona diagnostic (local only; not sent)\n']
  if (extra !== undefined && extra.length > 0) {
    if (looksLikeCredential(extra)) throw new Error('diagnostics-secret')
    parts.push(extra, '\n')
  }
  if (existsSync(dir)) {
    const names = (await readdir(dir)).filter(name => name.endsWith('.log')).slice(-6)
    for (const name of names) {
      const body = await readFile(join(dir, name), 'utf8')
      parts.push(`## ${name}\n`, redactLogLine(body.slice(-8_000)), '\n')
    }
  }
  const text = parts.join('')
  writeText(text)
  return text
}

/**
 * A CLI stub with a process TREE: it starts a long-lived child of its own and deliberately ignores stdin close, so only the
 * runner's kill can end it (stdin EOF is the backstop; `taskkill /T /F` — or the POSIX process group — is the guarantee).
 * It speaks just enough Claude stream-json for one turn.
 */

import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import readline from 'node:readline'

const log = process.env.TREE_CLI_LOG
const record = (event, extra = {}) => {
  if (log === undefined || log === '') return
  try {
    appendFileSync(log, `${JSON.stringify({ event, pid: process.pid, ...extra })}\n`)
  } catch {
    // Logging must never change the stub's behavior.
  }
}

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
record('start', { child: child.pid })

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.type === 'control_request') {
    console.log(JSON.stringify({ type: 'control_response', response: { request_id: message.request_id, subtype: 'success', response: {} } }))
    return
  }
  if (message.type !== 'user') return
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }))
  console.log(JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'ok',
    session_id: 'tree-cli-session',
    usage: { input_tokens: 1, output_tokens: 1 },
  }))
})

// The point of this stub: closing stdin must NOT be enough to end it.
rl.on('close', () => { record('stdin-end') })
process.on('exit', (code) => { record('exit', { code }) })

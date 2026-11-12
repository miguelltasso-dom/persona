import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Keel 10:19, "leitura = escrita em requireProject"): a Remote whose NAME is a write (create, put, set, propose, import, rollback, revise...) must ask for WRITE (or the owner, or a rule of its
 * own), never only to READ the project. Today a project reader is also a writer for every role, so the difference is not observable by a call: this reads the source of each Remote, so the day a role can
 * read and not write, no write is left open by a read-level guard. Methods that ask for something else in the same body (an owner, a card editor, the stream rule) are fine.
 */
const { host } = bindHostFile()

const WRITE = /^(create|update|put|delete|post|move|accept|reject|enqueue|drop|flush|edit|propose|resolve|comment|record|set|claim|fire|confirm|issue|redeem|schedule|pause|complete|apply|import|wipe|open|plan|start|close|approve|revoke|cancel|ack|tick|backup|restore|checkpoint|draft|invite|save|remove|fill|take|release|rename|pair|pin|unpin|refresh|forget|answer|continue|ensure|stop|steer|rollback|revise|activate|publish|grant|decide|reopen|dismiss|undo|retry|connect|sync)/u
const STRONGER = ['requireWrite', 'requireGovOwner', 'requireOwnerOrEmpty', 'requireMachineOwner', 'requireStreamWriter', 'assertCardEditor', 'requireEngineTriggerActor', 'requireGovAvailability', 'requireOwnableMessage', 'requireAliveMessage', 'sessionCan(', 'assertOwnMessage', 'requireActor', 'requireFileRoot']

/** Writes whose OWN rule is read-level by design, each with its reason (nothing else may be added without one). */
const READ_LEVEL_ON_PURPOSE: Readonly<Record<string, string>> = {
  openTaskConversation: 'it only says where the conversation of a Task lives (nothing is written until somebody writes in it)',
  connectorSecretState: 'it only says whether a slot holds a secret (a state read, the secret never leaves)',
  dismissWhileAway: 'the reader own window of Enquanto voce estava fora (a view state of the reader, not project data)',
  syncRemoteTeam: 'a read of the remote state of the team (the surface is OFF in the product; the owner connects it)',
}

it('every write-named Remote asks for more than reading the project', () => {
  const h = host()
  const offenders: string[] = []
  for (const { method } of remoteMethods(h)) {
    if (!WRITE.test(method) || READ_LEVEL_ON_PURPOSE[method] !== undefined) continue
    const value: unknown = Object.getOwnPropertyDescriptor(PersonaHost.prototype, method)?.value
    const src = typeof value === 'function' ? Function.prototype.toString.call(value) : ''
    if (src.includes('requireProject') && !STRONGER.some(guard => src.includes(guard))) offenders.push(method)
  }
  expect(offenders, 'write-named Remotes guarded only by requireProject (a read)').toEqual([])
})

/**
 * HONEST-1 (Atlas 11/11): a house rule "nunca publicar sem mim" must hold ONE verb of the `send` class, not all of it. The host arms the gate with
 * `askVerbs`: a call whose tool name carries one of those words is never let through by a pre-allowed class — only by an approval of the person
 * (exact arguments, once). Every word of the tool name counts (`send_tweet` is a tweet), not only the word that decided the class.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'
import { argsHash } from '../src/resolve/tool-input.ts'

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

async function start(): Promise<PermissionGate> {
  const gate = await PermissionGate.start({ token: 'tok-1' })
  gates.push(gate)
  return gate
}

async function decide(gate: PermissionGate, tool: string, input: Record<string, unknown> = { text: 'oi' }): Promise<string | undefined> {
  const response = await fetch(gate.url, {
    method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu', mcp_server: tool.split('__')[1] }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string } }
  return body.hookSpecificOutput?.permissionDecision
}

describe('askVerbs: one verb of a pre-allowed class still asks the person', () => {
  it('with `send` pre-allowed, a plain send goes through but a publish / post / tweet is DENIED and recorded for the card', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['send'], askVerbs: ['publish', 'post', 'tweet'] })
    expect(await decide(gate, 'mcp__gmail__send_email')).toBe('allow')
    expect(await decide(gate, 'mcp__site__publish_page')).toBe('deny')
    expect(await decide(gate, 'mcp__social__create_post')).toBe('deny')
    expect(await decide(gate, 'mcp__social__send_tweet')).toBe('deny') // `tweet` is in the name even though `send` decided the class
    expect(gate.takeRequests().map(item => item.tool)).toEqual(['mcp__site__publish_page', 'mcp__social__create_post', 'mcp__social__send_tweet'])
  })

  it('an approval of the person still lets EXACTLY that call through, once: the lock stops the persona, never the person', async () => {
    const gate = await start()
    const input = { title: 'Promoção', body: 'Pão de queijo 2 por R$ 9' }
    gate.arm({ preAllow: ['send'], askVerbs: ['publish'], approved: [{ tool: 'mcp__site__publish_page', argsHash: argsHash(input) }] })
    expect(await decide(gate, 'mcp__site__publish_page', { ...input, body: 'outro texto' })).toBe('deny') // other arguments: not what was approved
    expect(await decide(gate, 'mcp__site__publish_page', input)).toBe('allow')
    expect(await decide(gate, 'mcp__site__publish_page', input)).toBe('deny') // spent
    expect(gate.takeReleased()).toEqual([{ tool: 'mcp__site__publish_page', argsHash: argsHash(input) }])
  })

  it('without askVerbs nothing changes, and the next arming forgets them', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['send'] })
    expect(await decide(gate, 'mcp__site__publish_page')).toBe('allow')
    gate.arm({ preAllow: ['send'], askVerbs: ['publish'] })
    expect(await decide(gate, 'mcp__site__publish_page')).toBe('deny')
    gate.arm({ preAllow: ['send'] })
    expect(await decide(gate, 'mcp__site__publish_page')).toBe('allow')
  })

  it('a verb that is only part of another word does not match (`republish_notes` is not `publish`, `postgres_query` is not `post`)', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['read', 'send'], askVerbs: ['publish', 'post'] })
    // No known verb and no read proof = an unproven `send` (the old fail-closed rule), which is pre-allowed here: `allow` proves the lock did not match by substring.
    expect(await decide(gate, 'mcp__db__postgres_query')).toBe('allow')
    expect(await decide(gate, 'mcp__notes__republish_notes')).toBe('allow')
    expect(gate.takeRequests()).toEqual([])
  })
})

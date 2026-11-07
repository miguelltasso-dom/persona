/**
 * TEAM-10 gate (D-090 b): the real team round refuses unless Atlas's OK (with the ceiling), the exe, the fake-green proof and answer-only are all in place.
 */
import { describe, expect, it } from 'vitest'
import { TEAM_ROUND_APP_ENV, ceilingFromAuthorization, evaluateTeamRoundGate, type TeamRoundGateInput } from '../src/team-round-gate.ts'

const OK_TEXT = 'ATLAS, 05/11: AUTORIZAÇÃO para TEAM-10 (rodada real da equipe).\nTeto de turnos: 14\nHash: bc28dac5c2'

function input(overrides: Partial<TeamRoundGateInput> = {}): TeamRoundGateInput {
  return {
    env: { PERSONA_REAL_E2E: '1', PERSONA_REAL_E2E_OK: 'TEAM-10', PERSONA_INSTALLED_EXE: 'C:\\p8i\\Persona.exe', PERSONA_NSIS_COMMIT: 'abc1234567', PATH: 'C:\\Windows' },
    authorization: OK_TEXT,
    exeExists: true,
    fakeGreenProblem: undefined,
    answerOnlyDefault: true,
    ...overrides,
  }
}

describe('evaluateTeamRoundGate', () => {
  it('allows the round only when everything holds, and returns the ceiling Atlas wrote', () => {
    const gate = evaluateTeamRoundGate(input())
    expect(gate.problems).toEqual([])
    expect(gate).toMatchObject({ allowed: true, ceilingTurns: 14 })
  })

  it('refuses without the opt-in variables, without the authorization file, or when it names another item or has no ceiling', () => {
    expect(evaluateTeamRoundGate(input({ env: { PERSONA_INSTALLED_EXE: 'x', PERSONA_NSIS_COMMIT: 'y' } })).problems.join('\n')).toMatch(/PERSONA_REAL_E2E=1[\s\S]*PERSONA_REAL_E2E_OK=TEAM-10/u)
    expect(evaluateTeamRoundGate(input({ authorization: undefined })).problems.join('\n')).toMatch(/no Atlas authorization file/u)
    expect(evaluateTeamRoundGate(input({ authorization: 'Teto de turnos: 14' })).problems.join('\n')).toMatch(/does not name TEAM-10/u)
    expect(evaluateTeamRoundGate(input({ authorization: 'TEAM-10 ok, sem teto' })).problems.join('\n')).toMatch(/no valid "Teto de turnos/u)
    expect(evaluateTeamRoundGate(input({ authorization: 'TEAM-10\nTeto de turnos: 400' })).allowed).toBe(false)
    expect(evaluateTeamRoundGate(input({ authorization: 'TEAM-10\nTeto de turnos: 0' })).allowed).toBe(false)
  })

  it('the harness sets the cap itself: a different PERSONA_REAL_TURN_CAP is refused, the same one is fine', () => {
    const base = input().env
    expect(evaluateTeamRoundGate(input({ env: { ...base, PERSONA_REAL_TURN_CAP: '30' } })).problems.join('\n')).toMatch(/disagrees with the authorized ceiling \(14\)/u)
    expect(evaluateTeamRoundGate(input({ env: { ...base, PERSONA_REAL_TURN_CAP: '14' } })).allowed).toBe(true)
  })

  it('needs the exe, the commit, the fake-green proof on the same exe, and answer-only as the default', () => {
    expect(evaluateTeamRoundGate(input({ exeExists: false })).problems.join('\n')).toMatch(/PERSONA_INSTALLED_EXE/u)
    expect(evaluateTeamRoundGate(input({ env: { ...input().env, PERSONA_NSIS_COMMIT: '' } })).problems.join('\n')).toMatch(/PERSONA_NSIS_COMMIT/u)
    expect(evaluateTeamRoundGate(input({ fakeGreenProblem: 'the fake-CLI proof is from a different exe build' })).problems.join('\n')).toMatch(/fake round is not green on this exe/u)
    expect(evaluateTeamRoundGate(input({ answerOnlyDefault: false })).problems.join('\n')).toMatch(/does NOT isolate by default[\s\S]*millions/u)
    expect(evaluateTeamRoundGate(input({ answerOnlyDefault: undefined })).problems.join('\n')).toMatch(/was not established/u)
  })

  it('refuses a test-mode or fake-CLI environment', () => {
    const polluted = evaluateTeamRoundGate(input({ env: { ...input().env, VITEST: 'true', NODE_ENV: 'test', PERSONA_SCRIPTED: '1', OAR_CLAUDE_BIN: 'C:\\stub\\claude.cmd', PERSONA_E2E_EXTRA_PATH: 'C:\\stub' } }))
    expect(polluted.allowed).toBe(false)
    expect(polluted.problems.join('\n')).toMatch(/VITEST[\s\S]*PERSONA_SCRIPTED[\s\S]*OAR_CLAUDE_BIN[\s\S]*PERSONA_E2E_EXTRA_PATH[\s\S]*NODE_ENV=test/u)
  })

  it('reads the ceiling from the usual phrasings', () => {
    expect(ceilingFromAuthorization('Teto de turnos: 14')).toBe(14)
    expect(ceilingFromAuthorization('teto = 12')).toBe(12)
    expect(ceilingFromAuthorization('Teto de chamadas: 9')).toBe(9)
    expect(ceilingFromAuthorization('sem número')).toBeUndefined()
    expect(TEAM_ROUND_APP_ENV).toEqual({ PERSONA_TEAMWORK: '1', PERSONA_FANOUT: '1', PERSONA_PRODUCT_TOOLS: '1' })
  })
})

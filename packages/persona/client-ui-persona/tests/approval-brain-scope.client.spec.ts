import { describe, expect, it } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { approvalBrainFieldsFromView } from '../src/client/approvals/approval-brain-scope.ts'

const base: ApprovalView = { id: 'p1', kind: 'vault', title: 'Atualizar o tom de voz', question: 'Aplicar?', status: 'pending', personaId: 'nina', personaName: 'Nina' }

describe('approvalBrainFieldsFromView (Anvil: the host names the permission resource)', () => {
  it('uses the host action/target (a stable resource), never one built from the proposal id', () => {
    const fields = approvalBrainFieldsFromView({ ...base, permissionAction: 'vault.update', permissionTarget: 'vault:rec-7' })
    expect(fields).toEqual({ grantId: 'grant-p1', personaId: 'nina', action: 'vault.update', target: 'vault:rec-7', personaName: 'Nina' })
  })

  it('offers nothing to remember when the host did not name the resource, or for a hire', () => {
    expect(approvalBrainFieldsFromView(base)).toBeUndefined()
    expect(approvalBrainFieldsFromView({ ...base, permissionAction: 'vault.update', permissionTarget: '  ' })).toBeUndefined()
    expect(approvalBrainFieldsFromView({ ...base, kind: 'hire', permissionAction: 'x', permissionTarget: 'y' })).toBeUndefined()
    expect(approvalBrainFieldsFromView({ ...base, personaId: ' ', permissionAction: 'x', permissionTarget: 'y' })).toBeUndefined()
  })
})

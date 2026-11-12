/**
 * Gauge 15:54 (M5, revisão do PHONE_ALLOW): `getOfficialQuota` devolve `accountId`, `accountLabel` (o RÓTULO é a parte local do e-mail da conta: `readableAccountLabel`) e `detail` a QUALQUER membro com
 * leitura do projeto, e o celular de um membro vai chamá-lo. Quem paga é a conta do dono: um membro não precisa saber qual. Meu "sem identidade de conta" anterior era FALSO: o rig da vetoria não tinha cota
 * semeada (a resposta era só `unavailable`), e eu só procurava um padrão de e-mail (o rótulo não tem '@').
 * Regra: o dono (e o PC sem membros) vê a identidade da conta; um membro vê a cota (janelas, uso, próxima renovação) SEM `accountId`, `accountLabel` nem `detail`.
 * Vale também no desktop de um membro (equipe pelo hub), não só no celular.
 */
import { describe, expect } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const SH = { workspaceId: 'ws', projectId: 'sh' } as const
const LABEL = 'miguelltasso04' // o rótulo legível = a parte local do e-mail da conta do dono
const ACCOUNT_ID = 'claude:miguelltasso04@gmail.com'
const DETAIL = `lido da conta ${LABEL}`

function rig() {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...SH, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.usage.putQuota('sh', {
    provider: 'claude', origin: 'official', windows: [{ id: 'five_hour', origin: 'official', usedPercent: 40, windowMinutes: 300 }],
    accountId: ACCOUNT_ID, accountLabel: LABEL, detail: DETAIL,
  })
  return h
}

describe('getEngineStatus (a outra leitura de conta da lista v0) com a cota SEMEADA não carrega identidade nenhuma', () => {
  it('o membro e o dono recebem estado, motivo e contagens: nunca accountId, accountLabel, e-mail nem o rótulo legível', () => {
    const h = rig()
    for (const member of ['gus', 'ana']) {
      h.sessionMemberId = member
      const text = JSON.stringify(h.getEngineStatus({ ...SH }))
      expect(text, member).not.toContain(LABEL)
      expect(text, member).not.toContain(ACCOUNT_ID)
      expect(text, member).not.toMatch(/accountId|accountLabel|@/u)
    }
  })
})

describe('getOfficialQuota não entrega a identidade da conta do dono a um membro', () => {
  it('controle: o dono segue vendo a conta (a tela dele de Uso e limites precisa dela) e a cota tem janelas', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    const owner = JSON.stringify(h.getOfficialQuota({ ...SH }))
    expect(owner).toContain(LABEL)
    expect(owner).toContain('five_hour')
  })

  it('um MEMBRO recebe as janelas e o uso, e NENHUM de accountId, accountLabel ou detail', () => {
    const h = rig()
    h.sessionMemberId = 'gus'
    const rows = h.getOfficialQuota({ ...SH })
    const text = JSON.stringify(rows)
    expect(text, 'a cota em si continua: o compositor e o teto do celular dependem dela').toContain('"usedPercent":40')
    expect(text).not.toContain(LABEL)
    expect(text).not.toContain('miguelltasso04')
    expect(text).not.toContain(ACCOUNT_ID)
    for (const row of rows) {
      expect(row, 'accountId').not.toHaveProperty('accountId')
      expect(row, 'accountLabel').not.toHaveProperty('accountLabel')
      expect(row, 'detail').not.toHaveProperty('detail')
    }
  })
})

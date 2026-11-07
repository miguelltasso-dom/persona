// @vitest-environment jsdom
// FLAGS-ON-1 (Keel 01:40): no app do Miguel TODAS as flags do escopo da v1.1 vêm LIGADAS por padrão; '0' desliga; storage bloqueado = LIGADO. O leitor é um só
// (src/client/flags.ts) e cada `*-flag.ts` é um invólucro fino dele (mesma chave, mesma função). A faixa de testes começa cada arquivo com os padrões DESLIGADOS
// (scripts/test-dom-environment.ts chama setFlagDefaults(false)); aqui os padrões de PRODUÇÃO são provados com setFlagDefaults(undefined).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPersonaAskEnabled, PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import { isActionPreviewEnabled, ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import { isBubblesEnabled, BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { isLampLightEnabled, isLampLightFlagOn, LAMP_LIGHT_FLAG_KEY } from '../src/client/chat/lamp-light.ts'
import { isTeamworkEnabled as isTeamworkChat, TEAMWORK_FLAG_KEY } from '../src/client/chat/teamwork-flag.ts'
import { isWorkingControlEnabled, WORKING_CONTROL_FLAG_KEY } from '../src/client/chat/working-control-flag.ts'
import { houseEmptyArt, channelScene } from '../src/client/decor/HouseDecor.tsx'
import { isHouseDecorEnabled, HOUSE_DECOR_FLAG_KEY } from '../src/client/decor/house-decor-flag.ts'
import { isStickersEnabled, STICKERS_FLAG_KEY } from '../src/client/figurinhas/figurinhas-flag.ts'
import { FLAG_NAMES, FLAGS, readFlag, setFlagDefaults, type FlagName } from '../src/client/flags.ts'
import { isNextStepEnabled, NEXT_STEP_FLAG_KEY } from '../src/client/next-step/next-step-flag.ts'
import { isEngineEffortEnabled, ENGINE_EFFORT_FLAG_KEY } from '../src/client/profile/engine-effort-flag.ts'
import { isTaskProposalEnabled, TASK_PROPOSAL_FLAG_KEY } from '../src/client/proposal/proposal-flag.ts'
import { isSettingsPersonasEnabled, SETTINGS_PERSONAS_FLAG_KEY } from '../src/client/settings-personas/personas-flag.ts'
import { isPlacesNavEnabled, NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { isTeamworkEnabled as isTeamworkTeam } from '../src/client/teamwork/teamwork-flag.ts'

type Win = { __PERSONA_FLAGS__?: Record<string, unknown> }
const win = (): Win => window as unknown as Win

beforeEach(() => { localStorage.clear(); delete win().__PERSONA_FLAGS__ })
afterEach(() => {
  setFlagDefaults(false) // a faixa de testes: padrão desligado (como o setup global deixa)
  vi.restoreAllMocks()
  localStorage.clear()
  delete win().__PERSONA_FLAGS__
})

/** O que cada invólucro exporta: a função, a chave e o nome central. */
const WRAPPERS: readonly (readonly [FlagName, () => boolean, string])[] = [
  ['personaAsk', isPersonaAskEnabled, PERSONA_ASK_FLAG_KEY],
  ['actionPreview', isActionPreviewEnabled, ACTION_PREVIEW_FLAG_KEY],
  ['bubbles', isBubblesEnabled, BUBBLES_FLAG_KEY],
  ['houseDecor', isHouseDecorEnabled, HOUSE_DECOR_FLAG_KEY],
  ['figurinhas', isStickersEnabled, STICKERS_FLAG_KEY],
  ['workingControl', isWorkingControlEnabled, WORKING_CONTROL_FLAG_KEY],
  ['teamwork', isTeamworkChat, TEAMWORK_FLAG_KEY],
  ['teamwork', isTeamworkTeam, TEAMWORK_FLAG_KEY],
  ['lampLight', isLampLightFlagOn, LAMP_LIGHT_FLAG_KEY],
  ['nextStep', isNextStepEnabled, NEXT_STEP_FLAG_KEY],
  ['navPlaces', isPlacesNavEnabled, NAV_PLACES_FLAG_KEY],
  ['taskProposal', isTaskProposalEnabled, TASK_PROPOSAL_FLAG_KEY],
  ['settingsPersonas', isSettingsPersonasEnabled, SETTINGS_PERSONAS_FLAG_KEY],
  ['engineEffort', isEngineEffortEnabled, ENGINE_EFFORT_FLAG_KEY],
]

describe('a tabela de padrões da v1.1', () => {
  it('são as 13 flags persona.flag.* mais o V2 de Aprovações (a chave dele nasceu fora do prefixo)', () => {
    expect([...FLAG_NAMES].sort()).toEqual([
      'actionPreview', 'approvalsInboxV2', 'bubbles', 'engineEffort', 'figurinhas', 'houseDecor', 'lampLight', 'navPlaces', 'nextStep',
      'personaAsk', 'settingsPersonas', 'taskProposal', 'teamwork', 'workingControl',
    ])
  })

  it('as flags da v1.1 entram LIGADAS, salvo nextStep, que fica DESLIGADA no corte (Muse 06:15; EFF-1 volta ON, Atlas/Keel 06:21)', () => {
    expect(FLAG_NAMES.filter(name => !FLAGS[name].defaultOn)).toEqual(['nextStep'])
  })

  it('toda chave é "persona.flag.<nome>", salvo o V2 de Aprovações (persona.approvalsInbox.v2)', () => {
    for (const name of FLAG_NAMES.filter(flag => flag !== 'approvalsInboxV2')) expect(FLAGS[name].key).toBe(`persona.flag.${name}`)
    expect(FLAGS.approvalsInboxV2.key).toBe('persona.approvalsInbox.v2')
  })
})

describe('o padrão de PRODUÇÃO (sem nenhuma escolha explícita)', () => {
  beforeEach(() => { setFlagDefaults(undefined) })

  it.each(FLAG_NAMES.filter(name => name !== 'nextStep'))('%s vem LIGADA', (name) => {
    expect(readFlag(name)).toBe(true)
  })

  it('nextStep vem DESLIGADA no corte (Muse 06:15: sem prova visual da regra certa; v1.2)', () => {
    expect(readFlag('nextStep')).toBe(false)
  })

  it('a luz da luminária continua precisando dos balões (os dois ligados = a luz)', () => {
    expect(isLampLightEnabled()).toBe(true)
    localStorage.setItem(BUBBLES_FLAG_KEY, '0')
    expect(isLampLightFlagOn()).toBe(true)
    expect(isLampLightEnabled()).toBe(false)
  })
})

describe('a escolha explícita vence o padrão', () => {
  beforeEach(() => { setFlagDefaults(undefined) })

  it.each(FLAG_NAMES)("%s: '0' ou 'false' no localStorage DESLIGA", (name) => {
    localStorage.setItem(FLAGS[name].key, '0')
    expect(readFlag(name)).toBe(false)
    localStorage.setItem(FLAGS[name].key, 'false')
    expect(readFlag(name)).toBe(false)
  })

  it.each(FLAG_NAMES)("%s: '1' ou 'true' no localStorage LIGA", (name) => {
    localStorage.setItem(FLAGS[name].key, '1')
    expect(readFlag(name)).toBe(true)
    localStorage.setItem(FLAGS[name].key, 'true')
    expect(readFlag(name)).toBe(true)
  })

  it('valor estranho no localStorage não é escolha: vale o padrão', () => {
    localStorage.setItem(FLAGS.bubbles.key, 'talvez')
    localStorage.setItem(FLAGS.actionPreview.key, 'talvez')
    expect(readFlag('bubbles')).toBe(true)
    expect(readFlag('actionPreview')).toBe(true)
  })

  it('window.__PERSONA_FLAGS__: false desliga, true liga, pelo nome curto ou pela chave inteira', () => {
    win().__PERSONA_FLAGS__ = { teamwork: false, actionPreview: false, [FLAGS.nextStep.key]: false }
    expect(readFlag('teamwork')).toBe(false)
    expect(readFlag('actionPreview')).toBe(false)
    expect(readFlag('nextStep')).toBe(false)
    expect(readFlag('bubbles')).toBe(true) // o que o objeto não cita segue o padrão
  })

  it('o localStorage vence o window (a escolha explícita da pessoa)', () => {
    win().__PERSONA_FLAGS__ = { teamwork: true }
    localStorage.setItem(FLAGS.teamwork.key, '0')
    expect(readFlag('teamwork')).toBe(false)
  })
})

describe('storage bloqueado ou sem window = não há escolha: vale o padrão (LIGADO)', () => {
  beforeEach(() => { setFlagDefaults(undefined) })

  it('o getItem do localStorage lança: todas seguem LIGADAS', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    for (const name of FLAG_NAMES) expect(readFlag(name)).toBe(FLAGS[name].defaultOn)
  })

  it('sem localStorage (a global some): padrão', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readFlag('navPlaces')).toBe(true)
    expect(readFlag('actionPreview')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('window.__PERSONA_FLAGS__ que lança ao ler: padrão', () => {
    Object.defineProperty(window, '__PERSONA_FLAGS__', { configurable: true, get() { throw new Error('sem acesso') } })
    expect(readFlag('bubbles')).toBe(true)
    delete win().__PERSONA_FLAGS__
  })
})

describe('o padrão escolhido sobrevive ao vi.resetModules() (specs que recarregam os módulos)', () => {
  it('um flags.ts recarregado ainda enxerga setFlagDefaults(false); e setFlagDefaults(undefined) vale para a cópia nova', async () => {
    setFlagDefaults(false)
    vi.resetModules()
    const fresh = await import('../src/client/flags.ts')
    expect(fresh.readFlag('navPlaces')).toBe(false)
    expect(fresh.readFlag('approvalsInboxV2')).toBe(false)
    setFlagDefaults(undefined)
    expect(fresh.readFlag('navPlaces')).toBe(true)
  })
})

describe('a faixa de testes (setFlagDefaults(false))', () => {
  it('desliga todos os padrões, mas a escolha explícita continua valendo', () => {
    setFlagDefaults(false)
    for (const name of FLAG_NAMES) expect(readFlag(name)).toBe(false)
    localStorage.setItem(FLAGS.teamwork.key, '1')
    expect(readFlag('teamwork')).toBe(true)
  })

  it('setFlagDefaults(true) liga tudo (cenários de prova), false desliga tudo e undefined volta à tabela (tudo LIGADO)', () => {
    setFlagDefaults(true)
    expect(readFlag('actionPreview')).toBe(true)
    setFlagDefaults(false)
    expect(readFlag('actionPreview')).toBe(false)
    setFlagDefaults(undefined)
    expect(readFlag('actionPreview')).toBe(true)
  })
})

describe('os invólucros: a mesma chave e a mesma resposta que o leitor central', () => {
  it.each(WRAPPERS)('%s', (name, wrapper, key) => {
    expect(key).toBe(FLAGS[name].key)
    for (const defaults of [false, undefined] as const) {
      setFlagDefaults(defaults)
      localStorage.clear()
      expect(wrapper()).toBe(readFlag(name))
      localStorage.setItem(key, '1')
      expect(wrapper()).toBe(true)
      localStorage.setItem(key, '0')
      expect(wrapper()).toBe(false)
    }
  })

  it('os dois leitores de teamwork (chat/ e teamwork/) concordam sempre', () => {
    setFlagDefaults(undefined)
    expect(isTeamworkChat()).toBe(isTeamworkTeam())
    localStorage.setItem(TEAMWORK_FLAG_KEY, '0')
    expect(isTeamworkChat()).toBe(false)
    expect(isTeamworkTeam()).toBe(false)
  })
})

describe('enfeites da casa LIGADOS por padrão sem a arte: a UI cai sozinha para o antigo', () => {
  it('a arte noturna/diurna que não existe devolve undefined (quem chama usa a ilustração de sempre)', () => {
    setFlagDefaults(undefined)
    expect(isHouseDecorEnabled()).toBe(true)
    expect(houseEmptyArt('arte-que-nao-existe', 'arte-que-nao-existe-noite')).toBeUndefined()
  })

  it('desligados por escolha explícita nada é desenhado', () => {
    setFlagDefaults(undefined)
    localStorage.setItem(HOUSE_DECOR_FLAG_KEY, '0')
    expect(houseEmptyArt('empty-dm', 'empty-geral-noite')).toBeUndefined()
    expect(channelScene('Marketing')).toBeNull()
  })
})

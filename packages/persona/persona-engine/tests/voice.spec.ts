import { expect, it } from 'vitest'
import {
  ENGINE_COPY,
  composePersonaPrompt,
  composeTalkPrompt,
  composeVoicePolicy,
  resolveEngineLocale,
  voiceFingerprint,
  type PersonaVoiceFields,
} from '../src/index.ts'

const luna: PersonaVoiceFields = {
  identity: { name: 'Luna', title: 'Coordenação' },
  personality: 'Discreta e atenta.',
  instructions: 'Uma pergunta por vez.',
  functionLabel: 'coordenação',
  vault: 'Lilás é a cor oficial.',
  sector: 'Operações',
  capabilities: 'resposta de conversa',
}

const nina: PersonaVoiceFields = {
  identity: { name: 'Guia', title: 'Pesquisa' },
  personality: 'Curiosa e cética.',
  instructions: 'Peça evidência.',
  functionLabel: 'pesquisa',
  vault: 'Lilás é a cor oficial.',
  sector: 'Produto',
  capabilities: 'resposta de conversa',
}

it('mesma persona tem o mesmo tom em canal, DM e handoff', () => {
  const channel = composePersonaPrompt({ fields: luna, surface: 'channel', userText: 'oi' })
  const dm = composePersonaPrompt({ fields: luna, surface: 'dm', userText: 'oi' })
  const handoff = composePersonaPrompt({ fields: luna, surface: 'handoff' })
  expect(voiceFingerprint(luna)).toBe(voiceFingerprint({ ...luna }))
  for (const text of [channel, dm, handoff]) {
    expect(text).toContain('Luna')
    expect(text).toContain('Discreta e atenta.')
    expect(text).toContain('Uma pergunta por vez.')
    expect(text).toContain('Operações')
    expect(text).toContain('Lilás é a cor oficial.')
    expect(text).toContain(ENGINE_COPY.pt.ownerNormsBody)
  }
  expect(channel).toContain(ENGINE_COPY.pt.channelHint)
  expect(dm).toContain(ENGINE_COPY.pt.dmHint)
  expect(handoff).toContain(ENGINE_COPY.pt.handoffHint)
})

it('personas diferentes têm vozes distintas', () => {
  expect(voiceFingerprint(luna)).not.toBe(voiceFingerprint(nina))
  const a = composePersonaPrompt({ fields: luna, surface: 'talk', userText: 'status?' })
  const b = composePersonaPrompt({ fields: nina, surface: 'talk', userText: 'status?' })
  expect(a).toContain('Discreta e atenta.')
  expect(a).not.toContain('Curiosa e cética.')
  expect(b).toContain('Curiosa e cética.')
  expect(b).not.toContain('Discreta e atenta.')
})

it('chrome do engine é pt ou en', () => {
  expect(resolveEngineLocale(undefined)).toBe('pt')
  expect(resolveEngineLocale('en-US')).toBe('en')
  const pt = composeVoicePolicy(luna)
  const en = composeVoicePolicy({ ...luna, locale: 'en' })
  expect(pt).toContain('Personalidade:')
  expect(pt).toContain('Instruções da persona:')
  expect(en).toContain('Personality:')
  expect(en).toContain('Persona instructions:')
  expect(en).toContain(ENGINE_COPY.en.ownerNormsBody)
  expect(en).not.toContain('Personalidade:')
})

it('composeTalkPrompt existente não quebra o snapshot de labels pt', () => {
  const talk = composeTalkPrompt({
    identity: { name: 'Guia', title: 'Coordenação' },
    personality: 'Calma.',
    instructions: 'Receba o time.',
    functionLabel: 'coordenação',
    colleagues: [{ name: 'Bento', title: 'Engenharia' }],
    context: 'Tom de voz calmo.',
    userText: 'oi',
    capabilities: 'resposta de conversa; sem ferramentas',
  })
  expect(talk).toContain('Personalidade: Calma.')
  expect(talk).toContain('Idioma: pt-BR')
})

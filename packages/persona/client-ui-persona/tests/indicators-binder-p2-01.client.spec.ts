// COLHEITA-S1 · P2-01 parte B (Keel 05:53): os textos de "Seus números" vêm do namespace 'indicators' do ctx.locale, não de um
// dicionário fixo em PT. Vermelho primeiro: sem o binder, o módulo não tem como trocar de idioma.
import { afterEach, describe, expect, it } from 'vitest'
import { bindIndicatorsText, itext } from '../src/client/indicators/indicators-text.ts'
import { en as indicatorsEn } from '../src/client/locale/indicators/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => { bindIndicatorsText(undefined) })

describe('P2-01 · "Seus números" lê o ctx.locale', () => {
  it('com o binder do ctx.locale ligado, o texto segue o idioma dele', () => {
    bindIndicatorsText((key, params) => bindLocale(indicatorsEn, key, params))
    expect(itext('pin.button')).toBe('Pin to Overview')
    expect(itext('goal.of', { value: '3', goal: '5' })).toBe('3 of 5')
  })

  it('sem binder (preview, teste), o texto é o pt do namespace', () => {
    expect(itext('pin.button')).toBe('Fixar na Visão geral')
  })
})

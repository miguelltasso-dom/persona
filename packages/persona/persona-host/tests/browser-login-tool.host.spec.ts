import { describe, expect, it } from 'vitest'
import { loginOrigin, resolveLoginEntry, type CofreLoginEntry } from '../src/browser/login-tool.ts'

const ENTRIES: readonly CofreLoginEntry[] = [
  { id: 'l1', title: 'Loja', site: 'https://loja.exemplo.com.br', username: 'ana@loja.com.br' },
  { id: 'l2', title: 'Banco', site: 'https://banco.exemplo.com.br/entrar', username: 'ana' },
  { id: 'l3', title: 'Loja antiga', site: 'https://velha.exemplo.com.br', username: 'ana@velha.com.br' },
]

describe('COLHEITA 15b: the login the model asked for', () => {
  it('finds the one entry by title, user or site, ignoring case and accents', () => {
    expect(resolveLoginEntry(ENTRIES, 'banco')?.id).toBe('l2')
    expect(resolveLoginEntry(ENTRIES, 'ANA@VELHA')?.id).toBe('l3')
    expect(resolveLoginEntry(ENTRIES, 'banco.exemplo')?.id).toBe('l2')
  })

  it('refuses an unknown name and an ambiguous one instead of guessing', () => {
    expect(resolveLoginEntry(ENTRIES, 'mercado')).toBeUndefined()
    // "Loja" matches both "Loja" and "Loja antiga": the person must say which one.
    expect(resolveLoginEntry(ENTRIES, 'loja')).toBeUndefined()
    expect(resolveLoginEntry(ENTRIES, '   ')).toBeUndefined()
  })

  it('takes the EXACT origin of the entry site, and refuses something that is not a site', () => {
    expect(loginOrigin('https://loja.exemplo.com.br')).toBe('https://loja.exemplo.com.br')
    expect(loginOrigin('https://banco.exemplo.com.br/entrar?x=1')).toBe('https://banco.exemplo.com.br')
    expect(loginOrigin('loja.exemplo.com.br')).toBe('https://loja.exemplo.com.br')
    expect(loginOrigin('http://127.0.0.1:43123/login')).toBe('http://127.0.0.1:43123')
    expect(loginOrigin('nada aqui')).toBeUndefined()
  })
})

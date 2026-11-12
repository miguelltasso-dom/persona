// @vitest-environment jsdom
// Harvest 19b (Muse, 12/11 01:44): the company inbox form in TWO blocks. "Conta" (Provedor, E-mail, Senha, detalhes do servidor, Testar
// conexão, Salvar, one state line) and "O que a equipe lê". The password is write-only; "Salvar" tests first and saves only when it connects.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailRuleForm } from '../src/client/email-rule/EmailRuleForm.tsx'
import { pt } from '../src/client/locale/email-rule/locales.ts'

afterEach(() => { cleanup() })

const presets = [
  { id: 'locaweb', label: 'Locaweb', host: 'email-ssl.com.br', port: 993, secure: true },
  { id: 'zoho', label: 'Zoho', host: 'imap.zoho.com', port: 993, secure: true },
]
const filter = { to: ['vendas@loja.com.br'], from: [], subject: ['pedido'], skipBulk: true, preset: 'locaweb' }
const offline = { connected: false }
const online = { connected: true, host: 'email-ssl.com.br', port: 993, secure: true, user: 'vendas@loja.com.br' }

const ok = (messages: number) => vi.fn(() => Promise.resolve({ ok: true as const, messages }))
const fail = (error: 'login' | 'network' | 'tls' | 'no-credential' | 'unknown') => vi.fn(() => Promise.resolve({ ok: false as const, error }))
const save = () => vi.fn(() => Promise.resolve())

describe('the two blocks', () => {
  it('without a credential it says so and asks for the account; the rule block is below its own divider', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} />)
    expect(screen.getByText(pt['cred.legend'])).toBeTruthy()
    expect(screen.getByText(pt['cred.notConnected'])).toBeTruthy()
    expect(screen.getByLabelText(pt['cred.email'])).toBeTruthy()
    expect(screen.getByLabelText(pt['cred.password'])).toBeTruthy()
    expect(screen.getByText(pt['read.legend'])).toBeTruthy()
    expect(document.querySelector('hr')).not.toBeNull()
  })

  it('without the account ports the form is the rule alone, as before (no "Conta", no divider)', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} onSave={save()} />)
    expect(screen.queryByText(pt['cred.legend'])).toBeNull()
    expect(screen.queryByText(pt['read.legend'])).toBeNull()
    expect(document.querySelector('hr')).toBeNull()
    expect(screen.getByRole('button', { name: pt.save })).toBeTruthy()
  })

  it('the routine editor keeps the phrase: no account block even when the ports are given', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} variant="phrase" />)
    expect(screen.queryByText(pt['cred.legend'])).toBeNull()
    expect(screen.getByRole('button', { name: pt.edit })).toBeTruthy()
  })

  it('the server details are folded away and picking a provider fills them in', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} />)
    const details = document.querySelector('details')!
    expect(details.open).toBe(false)
    fireEvent.change(screen.getByLabelText(pt['preset.label']), { target: { value: 'zoho' } })
    expect((screen.getByLabelText(pt['cred.server']) as HTMLInputElement).value).toBe('imap.zoho.com')
    expect((screen.getByLabelText(pt['cred.port']) as HTMLInputElement).value).toBe('993')
  })
})

describe('“Testar conexão”', () => {
  it('says how many messages the folder holds (and the singular for one)', async () => {
    const onTest = ok(128)
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={onTest} />)
    fireEvent.change(screen.getByLabelText(pt['cred.email']), { target: { value: 'vendas@loja.com.br' } })
    fireEvent.change(screen.getByLabelText(pt['cred.password']), { target: { value: 'segredo' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    expect(await screen.findByText(/128 mensagens/u)).toBeTruthy()
    expect(onTest).toHaveBeenCalledWith({ host: 'email-ssl.com.br', port: 993, secure: true, user: 'vendas@loja.com.br', password: 'segredo' })
  })

  it('one message reads in the singular', async () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(1)} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    expect(await screen.findByText(pt['cred.testOk.one'])).toBeTruthy()
  })

  it.each([
    ['login', pt['cred.error.login']],
    ['tls', pt['cred.error.tls']],
    ['no-credential', pt['cred.error.no-credential']],
    ['unknown', pt['cred.error.unknown']],
  ] as const)('a %s failure becomes one honest sentence', async (code, sentence) => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={fail(code)} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    expect(await screen.findByText(sentence)).toBeTruthy()
  })

  it('a network failure names the provider the person picked; a rejected call says the same', async () => {
    const rejected = vi.fn(() => Promise.reject(new Error('socket')))
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={rejected} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    expect(await screen.findByText('Não deu para falar com o servidor da Locaweb. Confira a internet e teste de novo.')).toBeTruthy()
  })

  it('a saved password is tested with an empty password (the host uses the stored one)', async () => {
    const onTest = ok(5)
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={online} onSave={save()} onTest={onTest} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    await waitFor(() => { expect(onTest).toHaveBeenCalledWith(expect.objectContaining({ user: 'vendas@loja.com.br', password: '' })) })
  })
})

describe('the password is write-only', () => {
  it('a saved one shows as dots with “Trocar”, never the secret', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={online} onSave={save()} onTest={ok(0)} />)
    expect(screen.getByText('••••••')).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['cred.change'] })).toBeTruthy()
    expect(screen.queryByLabelText(pt['cred.password'], { selector: 'input' })).toBeNull()
  })

  it('“Trocar” opens the field, with the hint that blank keeps the saved one', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={online} onSave={save()} onTest={ok(0)} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.change'] }))
    expect((screen.getByLabelText(pt['cred.password']) as HTMLInputElement).type).toBe('password')
    expect(screen.getByText(pt['cred.keep'])).toBeTruthy()
  })
})

describe('ONE “Salvar” at the end of the card (Muse, 12/11)', () => {
  it('is always there: with no account ports it saves only the rule, never claims the account', async () => {
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={onSave} onTest={ok(0)} />)
    const button = screen.getByRole('button', { name: pt['cred.save'] }) as HTMLButtonElement
    expect(button.disabled).toBe(false) // never switched off in silence
    fireEvent.click(button)
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(1) })
    expect(screen.queryByText(pt['cred.error.noEmail'])).toBeNull()
  })

  it('there is no second save button: no “Salvar regra” next to the account', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} onSaveCredential={save()} />)
    expect(screen.getAllByRole('button').filter(item => /^Salvar/u.test(item.textContent ?? ''))).toHaveLength(1)
    expect(screen.queryByRole('button', { name: pt.save })).toBeNull()
  })

  it('without an e-mail the click puts the error on the field, with the focus; nothing is tested or saved', () => {
    const onTest = ok(1)
    const onSaveCredential = save()
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={onSave} onTest={onTest} onSaveCredential={onSaveCredential} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    expect(screen.getByText(pt['cred.error.noEmail'])).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(pt['cred.email']))
    expect(screen.getByLabelText(pt['cred.email']).getAttribute('aria-invalid')).toBe('true')
    expect(onTest).not.toHaveBeenCalled()
    expect(onSaveCredential).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('with the e-mail but no password the error is on the password, with the focus; typing clears it', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(1)} onSaveCredential={save()} />)
    fireEvent.change(screen.getByLabelText(pt['cred.email']), { target: { value: 'vendas@loja.com.br' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    expect(screen.getByText(pt['cred.error.noPassword'])).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(pt['cred.password']))
    fireEvent.change(screen.getByLabelText(pt['cred.password']), { target: { value: 'x' } })
    expect(screen.queryByText(pt['cred.error.noPassword'])).toBeNull()
  })

  it('tests before saving and saves NOTHING (neither the account nor the rule) when it does not connect', async () => {
    const onTest = fail('network')
    const onSaveCredential = save()
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={onSave} onTest={onTest} onSaveCredential={onSaveCredential} />)
    fireEvent.change(screen.getByLabelText(pt['cred.email']), { target: { value: 'vendas@loja.com.br' } })
    fireEvent.change(screen.getByLabelText(pt['cred.password']), { target: { value: 'segredo' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    await waitFor(() => { expect(onTest).toHaveBeenCalled() })
    expect(await screen.findByText(/Não deu para falar com o servidor/u)).toBeTruthy()
    expect(onSaveCredential).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a successful save hands over the account once AND the rule, says so, and the secret leaves the screen', async () => {
    const onSaveCredential = save()
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={onSave} onTest={ok(3)} onSaveCredential={onSaveCredential} />)
    fireEvent.change(screen.getByLabelText(pt['cred.email']), { target: { value: 'vendas@loja.com.br' } })
    fireEvent.change(screen.getByLabelText(pt['cred.password']), { target: { value: 'segredo' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    expect(await screen.findByText(pt['saved.all'])).toBeTruthy()
    expect(onSaveCredential).toHaveBeenCalledTimes(1)
    expect(onSaveCredential).toHaveBeenCalledWith({ host: 'email-ssl.com.br', port: 993, secure: true, user: 'vendas@loja.com.br', password: 'segredo' })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.getByText('••••••')).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('segredo')
  })

  it('a save the host refuses says so on the account line and keeps the form', async () => {
    const onSaveCredential = vi.fn(() => Promise.reject(new Error('cofre')))
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={onSave} onTest={ok(3)} onSaveCredential={onSaveCredential} />)
    fireEvent.change(screen.getByLabelText(pt['cred.email']), { target: { value: 'vendas@loja.com.br' } })
    fireEvent.change(screen.getByLabelText(pt['cred.password']), { target: { value: 'segredo' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    expect(await screen.findByText(pt['cred.failed'])).toBeTruthy()
    expect(screen.getByLabelText(pt['cred.password'])).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a saved account that did not change saves only the rule: no test, no password asked', async () => {
    const onTest = ok(9)
    const onSaveCredential = save()
    const onSave = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={online} onSave={onSave} onTest={onTest} onSaveCredential={onSaveCredential} />)
    fireEvent.change(screen.getByLabelText(pt['from.label']), { target: { value: 'ana@loja.com.br, bia@loja.com.br' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    await waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ from: ['ana@loja.com.br', 'bia@loja.com.br'], preset: 'locaweb' }))
    expect(onTest).not.toHaveBeenCalled()
    expect(onSaveCredential).not.toHaveBeenCalled()
    expect(screen.queryByText(pt['cred.error.noPassword'])).toBeNull()
  })

  it('a saved account whose SERVER changed asks for the password again (the screen never has it)', () => {
    const onSaveCredential = save()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={online} onSave={save()} onTest={ok(9)} onSaveCredential={onSaveCredential} />)
    fireEvent.change(screen.getByLabelText(pt['preset.label']), { target: { value: 'zoho' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cred.save'] }))
    expect(screen.getByText(pt['cred.error.noPassword'])).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(pt['cred.password']))
    expect(onSaveCredential).not.toHaveBeenCalled()
  })
})

describe('the words and the controls Muse asked for', () => {
  it('the first rule field is “Para o endereço”, with its own example, and the other helps say “Deixe vazio”', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} />)
    expect(screen.getByLabelText('Para o endereço')).toBeTruthy()
    expect(screen.getByText('Ex.: vendas@padarialua.com.br. Deixe vazio para todos.')).toBeTruthy()
    expect(screen.getByText('Separe com vírgula. Deixe vazio para qualquer remetente.')).toBeTruthy()
    expect(screen.getByText('Separe com vírgula. Deixe vazio para qualquer assunto.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Vazio =')
    expect(document.body.textContent).not.toContain('Receber de')
  })

  it('the server details use the chevron that turns, not the native triangle', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} />)
    const summary = document.querySelector('details > summary')!
    expect(summary.querySelector('svg')).not.toBeNull()
  })

  it('the provider is the DS select on its own class (40 px, the arrow drawn apart) and the boxes follow the DS', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(0)} />)
    expect(screen.getByLabelText(pt['preset.label']).className).toMatch(/providerSelect/u)
    // Keel 04:32 (css-hygiene): no native checkbox at all — "Usar conexão segura" and "Ignorar newsletters" are the DS Switch (role=switch, named by their sentence).
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
    expect(switches.every(item => (item.getAttribute('aria-labelledby') ?? '') !== '')).toBe(true)
  })

  it('a failed test carries the alert icon before the sentence; a connected one the check', async () => {
    const { unmount } = render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={fail('login')} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    const line = (await screen.findByText(pt['cred.error.login'])).closest('p')!
    expect(line.querySelector('svg')).not.toBeNull()
    unmount()
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} connection={offline} onSave={save()} onTest={ok(4)} />)
    fireEvent.click(screen.getByRole('button', { name: pt['cred.test'] }))
    const ok4 = (await screen.findByText(/4 mensagens/u)).closest('p')!
    expect(ok4.querySelector('svg')).not.toBeNull()
  })
})

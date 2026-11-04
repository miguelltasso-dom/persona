// @vitest-environment jsdom
// W2-7: várias contas por provedor — adicionar com passo a passo, renomear, remover e regra por persona.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsView, type PolicyPersona } from '../src/client/connections/ConnectionsView.tsx'
import { checkAccountLabel, suggestAccountLabels } from '../src/client/connections/account-labels.ts'
import { connectionAccountsBundleToUi, type ConnectionAccountUiRow, type ConnectionsAccountsUi } from '../src/client/data/adapters/connection-accounts.ts'
import { pt } from '../src/client/locale/connections/locales.ts'

afterEach(() => { cleanup() })

const t = (key: keyof typeof pt, params: Readonly<Record<string, string | number>> = {}): string =>
  pt[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))

function seat(partial: Partial<ConnectionAccountUiRow> & Pick<ConnectionAccountUiRow, 'id' | 'accountLabel' | 'status'>): ConnectionAccountUiRow {
  return { name: 'Claude', kind: 'claude', detail: '', ...partial }
}

function ui(accounts: ConnectionAccountUiRow[], extra: Partial<ConnectionsAccountsUi> = {}): ConnectionsAccountsUi {
  return {
    groups: [{ provider: 'claude', providerName: 'Claude', accounts }],
    swapPolicy: 'next_on_limit',
    swapPolicyScope: 'workspace',
    legacySingleSeat: false,
    ...extra,
  }
}

const personal = seat({ id: 'claude:pessoal', accountLabel: 'Pessoal', status: 'ready' })
const work = seat({ id: 'claude:trabalho', accountLabel: 'Trabalho', status: 'ready', inUseCount: 3 })

describe('account labels (pure)', () => {
  it('rejects empty, too long and duplicate (host id = lower case, spaces to dashes)', () => {
    expect(checkAccountLabel('   ', [])).toEqual({ ok: false, reason: 'empty' })
    expect(checkAccountLabel('x'.repeat(25), [])).toEqual({ ok: false, reason: 'tooLong' })
    expect(checkAccountLabel('Meu  Trabalho', ['meu trabalho'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(checkAccountLabel('  Reserva  ', ['Pessoal'])).toEqual({ ok: true, label: 'Reserva' })
  })

  it('renaming keeps the same name valid but not another seat\'s name', () => {
    expect(checkAccountLabel('Pessoal', ['Pessoal', 'Trabalho'], 'Pessoal')).toEqual({ ok: true, label: 'Pessoal' })
    expect(checkAccountLabel('Trabalho', ['Pessoal', 'Trabalho'], 'Pessoal')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('suggests names that are still free', () => {
    expect(suggestAccountLabels(['Pessoal', 'Trabalho'])).toEqual(['Equipe', 'Reserva'])
  })
})

describe('host bundle → seats', () => {
  it('reads the optional loginCommand and personaPolicies a newer host sends', () => {
    const view = connectionAccountsBundleToUi({
      swapPolicy: 'next_on_limit',
      swapPolicyScope: 'workspace',
      accounts: [{
        id: 'claude:trabalho',
        provider: 'claude',
        label: 'Trabalho',
        available: true,
        loggedIn: false,
        loginHint: '',
        phase: 'ready',
        ...{ loginCommand: '$env:CLAUDE_CONFIG_DIR=\'C:\\acc\\trabalho\'; claude login' },
      }],
      ...{ personaPolicies: [{ personaId: 'p1', policy: 'ask_before_swap' as const }] },
    })
    expect(view.groups[0]?.accounts[0]?.loginCommand).toContain('CLAUDE_CONFIG_DIR')
    expect(view.personaPolicies).toEqual([{ personaId: 'p1', policy: 'ask_before_swap' }])
  })

  it('an older host (no extras) still maps, with no command and no persona rules', () => {
    const view = connectionAccountsBundleToUi({
      swapPolicy: 'fixed',
      swapPolicyScope: 'workspace',
      accounts: [{ id: 'a', provider: 'claude', label: 'Pessoal', available: true, loggedIn: true, loginHint: '', phase: 'ready' }],
    })
    expect(view.groups[0]?.accounts[0]?.loginCommand).toBeUndefined()
    expect(view.personaPolicies).toBeUndefined()
  })
})

describe('add account: step by step', () => {
  const addLabel = t('account.addButton', { provider: 'Claude' })

  it('opens a dialog (no native prompt), validates the name and saves it only on Continuar', async () => {
    const onAdd = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} onAddAccount={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(t('account.add.eyebrow', { step: 1, total: 3 }))).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()

    // empty → honest error, nothing saved
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.add.continue') }))
    expect(within(dialog).getByText(t('account.label.empty'))).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()

    // duplicate of an existing seat
    const input = within(dialog).getByLabelText(t('account.add.nameLabel'))
    fireEvent.change(input, { target: { value: 'trabalho' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.add.continue') }))
    expect(within(dialog).getByText(t('account.label.duplicate', { provider: 'Claude' }))).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()

    // a free suggestion fills the field and saves
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equipe' }))
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.add.continue') }))
    await waitFor(() => { expect(onAdd).toHaveBeenCalledWith('claude', 'Equipe') })
  })

  it('shows the seat\'s own login command, copies it, and finishes when the check says ready', async () => {
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { copied.push(text) } }, configurable: true })
    const onAdd = vi.fn(async () => {})
    const onRecheck = vi.fn()
    const command = '$env:CLAUDE_CONFIG_DIR=\'C:\\acc\\equipe\'; claude login'
    const added = seat({ id: 'claude:equipe', accountLabel: 'Equipe', status: 'expired', errorCode: 'not_logged_in', loginCommand: command })
    const { rerender } = render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={onAdd} onRecheck={onRecheck} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.change(screen.getByLabelText(t('account.add.nameLabel')), { target: { value: 'Equipe' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.add.continue') }))
    // the host answers with the new seat (signed out, with its own command)
    await waitFor(() => { expect(onAdd).toHaveBeenCalled() })
    rerender(<ConnectionsView accountsUi={ui([personal, added])} onAddAccount={onAdd} onRecheck={onRecheck} />)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(t('account.add.eyebrow', { step: 2, total: 3 }))).toBeTruthy()
    expect(within(dialog).getByText(command)).toBeTruthy()
    expect(within(dialog).getByText(t('account.add.isolatedNote'))).toBeTruthy()
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: t('account.add.copy') })) })
    expect(copied).toEqual([command])

    fireEvent.click(within(dialog).getByRole('button', { name: t('action.alreadyLoggedIn') }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
    const ready = seat({ ...added, status: 'ready' })
    delete (ready as { errorCode?: string }).errorCode
    rerender(<ConnectionsView accountsUi={ui([personal, ready])} onAddAccount={onAdd} onRecheck={onRecheck} />)
    expect(await screen.findByText(t('account.add.doneTitle', { provider: 'Claude', label: 'Equipe' }))).toBeTruthy()
    expect(screen.getByText(t('account.add.eyebrow', { step: 3, total: 3 }))).toBeTruthy()
  })

  it('without a host command it refuses to show the default login (it would clobber the main account)', async () => {
    const onAdd = vi.fn(async () => {})
    const added = seat({ id: 'claude:equipe', accountLabel: 'Equipe', status: 'expired', errorCode: 'not_logged_in', copyCommand: 'claude login' })
    const { rerender } = render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={onAdd} onRecheck={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.change(screen.getByLabelText(t('account.add.nameLabel')), { target: { value: 'Equipe' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.add.continue') }))
    await waitFor(() => { expect(onAdd).toHaveBeenCalled() })
    rerender(<ConnectionsView accountsUi={ui([personal, added])} onAddAccount={onAdd} onRecheck={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(t('account.add.noCommand', { label: 'Equipe' }))).toBeTruthy()
    expect(within(dialog).queryByText('claude login')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: t('action.alreadyLoggedIn') })).toBeNull()
    expect(within(dialog).getByRole('button', { name: t('account.add.later') })).toBeTruthy()
  })

  it('a seat the host already calls ready is NOT "pronta" until the person confirms it and it has its own command', async () => {
    const onAdd = vi.fn(async () => {})
    const command = String.raw`$env:CLAUDE_CONFIG_DIR='C:\acc\equipe'; claude login`
    const lookReady = seat({ id: 'claude:equipe', accountLabel: 'Equipe', status: 'ready', loginCommand: command })
    const { rerender } = render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={onAdd} onRecheck={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.change(screen.getByLabelText(t('account.add.nameLabel')), { target: { value: 'Equipe' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.add.continue') }))
    await waitFor(() => { expect(onAdd).toHaveBeenCalled() })
    rerender(<ConnectionsView accountsUi={ui([personal, lookReady])} onAddAccount={onAdd} onRecheck={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(t('account.add.eyebrow', { step: 2, total: 3 }))).toBeTruthy()
    expect(within(dialog).queryByText(t('account.add.doneTitle', { provider: 'Claude', label: 'Equipe' }))).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: t('action.alreadyLoggedIn') }))
    expect(within(dialog).getByText(t('account.add.eyebrow', { step: 3, total: 3 }))).toBeTruthy()
  })

  it('without its own command a ready-looking seat still ends on the "not available yet" step', async () => {
    const onAdd = vi.fn(async () => {})
    const lookReady = seat({ id: 'claude:equipe', accountLabel: 'Equipe', status: 'ready' })
    const { rerender } = render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={onAdd} onRecheck={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.change(screen.getByLabelText(t('account.add.nameLabel')), { target: { value: 'Equipe' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.add.continue') }))
    await waitFor(() => { expect(onAdd).toHaveBeenCalled() })
    rerender(<ConnectionsView accountsUi={ui([personal, lookReady])} onAddAccount={onAdd} onRecheck={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(t('account.add.noCommand', { label: 'Equipe' }))).toBeTruthy()
  })

  it('a refused name puts the cursor back in the field where the message is', () => {
    render(<ConnectionsView accountsUi={ui([personal, work])} onAddAccount={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(t('account.add.nameLabel'))
    within(dialog).getByRole('button', { name: t('account.add.continue') }).focus()
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.add.continue') }))
    expect(document.activeElement).toBe(input)
  })

  it('a refused save stays on step 1 with a human message', async () => {
    const onAdd = vi.fn(async () => { throw new Error('forbidden') })
    render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.change(screen.getByLabelText(t('account.add.nameLabel')), { target: { value: 'Equipe' } })
    fireEvent.click(screen.getByRole('button', { name: t('account.add.continue') }))
    expect(await screen.findByText(t('account.add.error'))).toBeTruthy()
    expect(screen.getByText(t('account.add.eyebrow', { step: 1, total: 3 }))).toBeTruthy()
  })

  it('Esc closes the dialog and the account stays in the list', () => {
    render(<ConnectionsView accountsUi={ui([personal])} onAddAccount={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: addLabel }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Pessoal')).toBeTruthy()
  })
})

describe('rename and remove', () => {
  function openMenu(label: string): void {
    fireEvent.click(screen.getByRole('button', { name: t('account.menu', { provider: 'Claude', label }) }))
  }

  it('rename: prefilled, blocks another seat\'s name, saves the new one', async () => {
    const onRename = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} onRenameAccount={onRename} />)
    openMenu('Pessoal')
    fireEvent.click(screen.getByRole('menuitem', { name: t('account.menuRename') }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(t('account.add.nameLabel')) as HTMLInputElement
    expect(input.value).toBe('Pessoal')
    fireEvent.change(input, { target: { value: 'Trabalho' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.rename.save') }))
    expect(within(dialog).getByText(t('account.label.duplicate', { provider: 'Claude' }))).toBeTruthy()
    expect(onRename).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'Casa' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.rename.save') }))
    await waitFor(() => { expect(onRename).toHaveBeenCalledWith('claude:pessoal', 'Casa') })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('remove: says what happens, warns when it is the last seat, confirms explicitly', async () => {
    const onRemove = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([work])} onRemoveAccount={onRemove} />)
    openMenu('Trabalho')
    fireEvent.click(screen.getByRole('menuitem', { name: t('account.menuRemove') }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(t('account.remove.title', { provider: 'Claude', label: 'Trabalho' }))).toBeTruthy()
    expect(within(dialog).getByText(t('account.remove.inUse'))).toBeTruthy()
    expect(within(dialog).getByText(t('account.remove.last', { provider: 'Claude' }))).toBeTruthy()
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.remove.confirm') }))
    await waitFor(() => { expect(onRemove).toHaveBeenCalledWith('claude:trabalho') })
  })

  it('remove: with other seats there is no "last seat" warning; "Agora não" removes nothing', () => {
    const onRemove = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} onRemoveAccount={onRemove} />)
    openMenu('Pessoal')
    fireEvent.click(screen.getByRole('menuitem', { name: t('account.menuRemove') }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(t('account.remove.last', { provider: 'Claude' }))).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: t('account.cancel') }))
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('a failed removal keeps the dialog open with a human message', async () => {
    const onRemove = vi.fn(async () => { throw new Error('boom') })
    render(<ConnectionsView accountsUi={ui([personal, work])} onRemoveAccount={onRemove} />)
    openMenu('Pessoal')
    fireEvent.click(screen.getByRole('menuitem', { name: t('account.menuRemove') }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t('account.remove.confirm') }))
    expect(await screen.findByText(t('account.remove.error'))).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('swap rule: team and one persona', () => {
  const personas: PolicyPersona[] = [
    { id: 'p-nina', name: 'Nina', characterId: 'nina' },
    { id: 'p-sol', name: 'Sol', characterId: 'sol' },
  ]
  const policyCard = (title: string): HTMLElement => screen.getByRole('radio', { name: new RegExp(title, 'u') })

  it('team rule: choosing a card saves it for the team and says so', async () => {
    const onPolicy = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} personas={personas} onSwapPolicyChange={onPolicy} />)
    fireEvent.click(policyCard(t('accountPolicy.ask.title')))
    await waitFor(() => { expect(onPolicy).toHaveBeenCalledWith('ask_before_swap', 'workspace') })
    expect(await screen.findByText(t('swapPolicy.saved'))).toBeTruthy()
  })

  it('opening "Uma persona" saves NOTHING by itself', () => {
    const onPolicy = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} personas={personas} onSwapPolicyChange={onPolicy} />)
    fireEvent.click(screen.getByRole('tab', { name: t('swapPolicy.scope.persona') }))
    expect(onPolicy).not.toHaveBeenCalled()
    expect(screen.getByText(t('swapPolicy.personaFollowsTeam', { name: 'Nina' }))).toBeTruthy()
  })

  it('one persona: pick her, choose a card → saved with her id; her rule is then marked as hers', async () => {
    const onPolicy = vi.fn(async () => {})
    render(<ConnectionsView accountsUi={ui([personal, work])} personas={personas} onSwapPolicyChange={onPolicy} />)
    fireEvent.click(screen.getByRole('tab', { name: t('swapPolicy.scope.persona') }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sol' }))
    fireEvent.click(policyCard(t('accountPolicy.fixed.title')))
    await waitFor(() => { expect(onPolicy).toHaveBeenCalledWith('fixed', 'persona', 'p-sol') })
    expect(await screen.findByText(t('swapPolicy.personaOwn', { name: 'Sol' }))).toBeTruthy()
    // Nina still follows the team
    fireEvent.click(screen.getByRole('radio', { name: 'Nina' }))
    expect(screen.getByText(t('swapPolicy.personaFollowsTeam', { name: 'Nina' }))).toBeTruthy()
  })

  it('shows the rule the host already reports for a persona', () => {
    render(
      <ConnectionsView
        accountsUi={ui([personal, work], { personaPolicies: [{ personaId: 'p-nina', policy: 'ask_before_swap' }] })}
        personas={personas}
        onSwapPolicyChange={async () => {}}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: t('swapPolicy.scope.persona') }))
    expect(screen.getByText(t('swapPolicy.personaOwn', { name: 'Nina' }))).toBeTruthy()
    expect((policyCard(t('accountPolicy.ask.title')) as HTMLInputElement).checked).toBe(true)
  })

  it('a failed save puts the card back and says it did not save', async () => {
    const onPolicy = vi.fn(async () => { throw new Error('forbidden') })
    render(<ConnectionsView accountsUi={ui([personal, work])} personas={personas} onSwapPolicyChange={onPolicy} />)
    fireEvent.click(policyCard(t('accountPolicy.fixed.title')))
    expect(await screen.findByText(t('swapPolicy.saveError'))).toBeTruthy()
    expect((policyCard(t('accountPolicy.next_on_limit.title')) as HTMLInputElement).checked).toBe(true)
  })

  it('no personas yet: says why, offers no empty picker', () => {
    render(<ConnectionsView accountsUi={ui([personal, work])} personas={[]} onSwapPolicyChange={async () => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: t('swapPolicy.scope.persona') }))
    expect(screen.getByText(t('swapPolicy.noPersonas'))).toBeTruthy()
  })
})

describe('no dead controls', () => {
  it('"Como funciona" exists only when it opens the guide', () => {
    const { rerender } = render(<ConnectionsView accountsUi={ui([personal])} />)
    expect(screen.queryByRole('button', { name: t('action.learn') })).toBeNull()
    const onGuide = vi.fn()
    rerender(<ConnectionsView accountsUi={ui([personal])} onOpenGuide={onGuide} />)
    fireEvent.click(screen.getByRole('button', { name: t('action.learn') }))
    expect(onGuide).toHaveBeenCalledTimes(1)
  })
})
